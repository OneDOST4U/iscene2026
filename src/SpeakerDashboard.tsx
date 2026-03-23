import React from 'react';
import {
  LayoutDashboard,
  CalendarDays,
  Package,
  Star,
  Upload,
  QrCode,
  CreditCard,
  Settings,
  Rocket,
  ChevronRight,
  X,
  Download,
  Loader2,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Film,
  Clock,
  Users,
  TrendingUp,
  HelpCircle,
  Plus,
  LogOut,
  Filter,
  Mail,
  Edit2,
  Trash2,
  Bell,
  ExternalLink,
  ArrowLeft,
  ImageUp,
  RefreshCw,
  Menu,
  MessageCircle,
} from 'lucide-react';
import { User as FirebaseUser, sendPasswordResetEmail } from 'firebase/auth';
import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  Timestamp,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  deleteField,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, auth, storage } from './firebase';
import { QrScanModal } from './QrScanModal';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type PresenterTab = 'dashboard' | 'sessions' | 'materials' | 'reviews' | 'uploads' | 'profile';

type Room = {
  id: string;
  name: string;
  capacity: number;
  description: string;
  timeline: string;
  sessionDate: string;
  materials: string;
  presenterNames: string[];
  presenterUids?: string[];
  backgroundImage?: string;
  projectDetail?: string;
  location?: string;
  sessionType?: string;
};

const SESSION_TIME_OPTIONS = Array.from({ length: 27 }, (_, i) => {
  const totalMinutes = 7 * 60 + i * 30;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
});

type DOSTSpeakerRatings = {
  achievementOfObjectives: number;
  mastery: { exhibitKnowledge: number; answerQuestions: number; currentDevelopments: number; balanceTheoryPractice: number };
  presentation: { preparedness: number; organizeMaterials: number; arouseInterest: number; instructionalMaterials: number };
  personality: { rapport: number; considerateness: number };
  acceptability: number;
};

type SessionReview = {
  id: string;
  roomId: string;
  roomName: string;
  rating?: number;
  comment?: string;
  participantName?: string;
  uid: string;
  submittedAt: any;
  part1?: { levelOfContent: string; appropriateness: string; applicability: string };
  part2?: Array<{ speakerName: string; ratings: DOSTSpeakerRatings }>;
  part3?: { venue: number; food: number; organizerResponse: number; description?: string };
  part4?: string;
};

type PresenterMaterial = {
  id: string;
  uid: string;
  roomId?: string;
  roomName?: string;
  fileName: string;
  storagePath: string;
  downloadUrl: string;
  fileType: string;
  fileSizeBytes: number;
  status: 'uploaded' | 'processing' | 'approved';
  createdAt: any;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(type: string) {
  if (type.startsWith('image/')) return <ImageIcon size={20} className="text-blue-600" />;
  if (type.startsWith('video/')) return <Film size={20} className="text-purple-600" />;
  if (type === 'application/pdf') return <FileText size={20} className="text-red-600" />;
  return <FileText size={20} className="text-slate-500" />;
}

function fileIconBg(type: string) {
  if (type.startsWith('image/')) return 'bg-blue-100';
  if (type.startsWith('video/')) return 'bg-purple-100';
  if (type === 'application/pdf') return 'bg-red-100';
  return 'bg-slate-100';
}

function relativeTime(ts: any): string {
  if (!ts) return '';
  const date: Date = ts?.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - date.getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'Just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Yesterday';
  return `${d} days ago`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
type SpeakerDashboardProps = { user: FirebaseUser; registration: any; onSignOut: () => Promise<void> };

export function SpeakerDashboard({ user, registration, onSignOut }: SpeakerDashboardProps) {
  const fullName = (registration?.fullName as string) || user.email || 'Presenter';
  const roleTitle = (registration?.positionTitle as string) || 'Presenter';
  const profilePicUrl = (registration?.profilePictureUrl as string | undefined) || null;
  const initials = fullName.split(' ').map((p: string) => p[0]).join('').toUpperCase().slice(0, 2);

  // ── Navigation ─────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = React.useState<PresenterTab>('dashboard');
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  // ── Data ───────────────────────────────────────────────────────────────
  const [assignedRooms, setAssignedRooms] = React.useState<Room[]>([]);
  const [allRooms, setAllRooms] = React.useState<Room[]>([]);
  const [sessionReviews, setSessionReviews] = React.useState<SessionReview[]>([]);
  const [materials, setMaterials] = React.useState<PresenterMaterial[]>([]);
  const [hasEntryAttendance, setHasEntryAttendance] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  const [selectedRoomForChat, setSelectedRoomForChat] = React.useState<Room | null>(null);
  const [roomChatMessages, setRoomChatMessages] = React.useState<{ id: string; roomId: string; participantName: string; text: string; createdAt: any }[]>([]);

  // ── Modals / UI ────────────────────────────────────────────────────────
  const [scanModal, setScanModal] = React.useState(false);
  const [idModal, setIdModal] = React.useState(false);
  const [scanToast, setScanToast] = React.useState<string | null>(null);
  const [pwResetSent, setPwResetSent] = React.useState(false);
  const [editingSessionRoom, setEditingSessionRoom] = React.useState<Room | null>(null);
  const [editSessionForm, setEditSessionForm] = React.useState({ name: '', description: '', sessionDate: '', startTime: '', endTime: '', projectDetail: '', backgroundImage: '' });
  const [editSessionBgFile, setEditSessionBgFile] = React.useState<File | null>(null);
  const [editSessionSaving, setEditSessionSaving] = React.useState(false);

  // ── Upload ───────────────────────────────────────────────────────────────
  const [uploadingFile, setUploadingFile] = React.useState(false);
  const [uploadRoomId, setUploadRoomId] = React.useState<string>('');
  const uploadInputRef = React.useRef<HTMLInputElement>(null);
  const materialsUploadInputRef = React.useRef<HTMLInputElement>(null);

  const getReviewRating = (r: SessionReview): number => {
    if (typeof r.rating === 'number') return r.rating;
    if (r.part2?.length) return Math.round(r.part2.reduce((s, sp) => s + sp.ratings.acceptability, 0) / r.part2.length);
    return 5;
  };
  const avgRating = sessionReviews.length > 0
    ? (sessionReviews.reduce((s, r) => s + getReviewRating(r), 0) / sessionReviews.length).toFixed(1)
    : '—';
  const totalReach = assignedRooms.reduce((s, r) => s + (r.capacity || 0), 0);
  const materialStatus = materials.some((m) => m.status === 'approved') ? 'APPROVED'
    : materials.length > 0 ? 'PENDING' : 'NONE';

  // Rooms for dropdown: assigned first, fallback to all rooms if none assigned
  const roomsForDropdown = assignedRooms.length > 0 ? assignedRooms : allRooms;

  // ── Load data ──────────────────────────────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        // Rooms where this presenter is listed
        const roomsSnap = await getDocs(
          query(collection(db, 'rooms'), where('presenterNames', 'array-contains', fullName))
        );
        const rooms: Room[] = roomsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Room, 'id'>) }));
        if (!cancelled) setAssignedRooms(rooms);

        // All rooms (fallback for dropdown when no assigned rooms match)
        const allSnap = await getDocs(collection(db, 'rooms'));
        if (!cancelled) setAllRooms(allSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Room, 'id'>) })));

        // Reviews for assigned rooms
        let reviews: SessionReview[] = [];
        if (rooms.length > 0) {
          const roomIds = rooms.map((r) => r.id);
          const chunks = [];
          for (let i = 0; i < roomIds.length; i += 30) chunks.push(roomIds.slice(i, i + 30));
          for (const chunk of chunks) {
            const revSnap = await getDocs(query(collection(db, 'reviews'), where('roomId', 'in', chunk)));
            revSnap.docs.forEach((d) => reviews.push({ id: d.id, ...(d.data() as Omit<SessionReview, 'id'>) }));
          }
        }
        if (!cancelled) setSessionReviews(reviews);

        // Entry attendance
        const entryDoc = await getDoc(doc(db, 'attendance', `${user.uid}_entrance`));
        if (!cancelled) setHasEntryAttendance(entryDoc.exists());
      } catch (err) { console.error('SpeakerDashboard load', err); }
      finally { if (!cancelled) setLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [fullName, user.uid]);

  // Real-time materials subscription (displays uploads immediately)
  React.useEffect(() => {
    const q = query(
      collection(db, 'presenterMaterials'),
      where('uid', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => setMaterials(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PresenterMaterial, 'id'>) }))),
      (err) => {
        console.error('presenterMaterials subscription', err);
        setMaterials([]);
      }
    );
    return () => unsub();
  }, [user.uid]);

  React.useEffect(() => {
    if (!selectedRoomForChat?.id) {
      setRoomChatMessages([]);
      return;
    }
    const q = query(collection(db, 'roomChat'), where('roomId', '==', selectedRoomForChat.id), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setRoomChatMessages(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    });
    return () => unsub();
  }, [selectedRoomForChat?.id]);

  // ── Parse QR content (robust: handles URL, query string, or plain text) ───
  const parseQrContent = (raw: string): string | null => {
    const trimmed = (raw || '').trim();
    if (!trimmed) return null;
    const lower = trimmed.toLowerCase();
    if (lower === 'entrance' || lower === 'main' || lower === 'mainentrance' || lower.includes('main entrance')) return 'entrance';
    try {
      const urlStr = trimmed.startsWith('http') ? trimmed : `https://iscene.app/scan${trimmed.startsWith('?') ? trimmed : '?' + trimmed}`;
      const url = new URL(urlStr);
      return url.searchParams.get('type') || url.searchParams.get('Type') || null;
    } catch {}
    const m = trimmed.match(/[?&]type=([^&\s#]+)/i);
    return m ? m[1].trim() : null;
  };

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleScanResult = async (text: string) => {
    setScanModal(false);
    try {
      const type = parseQrContent(text);
      if (type === 'entrance') {
        const docRef = doc(db, 'attendance', `${user.uid}_entrance`);
        await setDoc(docRef, {
          uid: user.uid,
          name: fullName,
          type: 'entrance',
          scannedAt: Timestamp.now(),
        });
        setHasEntryAttendance(true);
        setScanToast('✅ Entrance check-in successful!');
      } else {
        setScanToast('❌ Unrecognized QR. Use main entrance QR.');
      }
    } catch (err) {
      console.error('Scan error:', err);
      setScanToast('❌ Could not process scan. Try again.');
    }
    setTimeout(() => setScanToast(null), 4000);
  };

  const handleFileUpload = async (file: File, roomId?: string) => {
    if (!file || file.size > 200 * 1024 * 1024) {
      setScanToast('❌ File too large (max 200 MB).');
      setTimeout(() => setScanToast(null), 4000);
      return;
    }
    setUploadingFile(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const storagePath = `presenterMaterials/${user.uid}/${Date.now()}_${safeName}`;
      const storageRef = ref(storage, storagePath);
      const snap = await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(snap.ref);
      const room = roomId ? roomsForDropdown.find((r) => r.id === roomId) : undefined;
      const docRef = await addDoc(collection(db, 'presenterMaterials'), {
        uid: user.uid, presenterName: fullName,
        roomId: roomId || null, roomName: room?.name || null,
        fileName: file.name, storagePath, downloadUrl,
        fileType: file.type, fileSizeBytes: file.size,
        status: 'uploaded', createdAt: Timestamp.now(),
      });
      setMaterials((prev) => [{
        id: docRef.id, uid: user.uid, roomId, roomName: room?.name,
        fileName: file.name, storagePath, downloadUrl,
        fileType: file.type, fileSizeBytes: file.size,
        status: 'uploaded', createdAt: Timestamp.now(),
      }, ...prev]);
      setScanToast('✅ File uploaded successfully!');
    } catch (err) { console.error(err); setScanToast('❌ Upload failed. Try again.'); }
    finally { setUploadingFile(false); setTimeout(() => setScanToast(null), 4000); }
  };

  const openEditSession = (room: Room) => {
    const [start, end] = (room.timeline || '').split(/\s*-\s*/);
    setEditingSessionRoom(room);
    setEditSessionForm({
      name: room.name || '',
      description: room.description || '',
      sessionDate: room.sessionDate || '',
      startTime: start?.trim() || '',
      endTime: end?.trim() || '',
      projectDetail: room.projectDetail || '',
      backgroundImage: room.backgroundImage || '',
    });
    setEditSessionBgFile(null);
  };

  const closeEditSession = () => {
    setEditingSessionRoom(null);
    setEditSessionForm({ name: '', description: '', sessionDate: '', startTime: '', endTime: '', projectDetail: '', backgroundImage: '' });
    setEditSessionBgFile(null);
  };

  const handleUpdateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSessionRoom) return;
    if (!editSessionForm.name.trim()) return;
    if (!editSessionForm.startTime || !editSessionForm.endTime) {
      setScanToast('Please choose both start and end time.');
      setTimeout(() => setScanToast(null), 3000);
      return;
    }
    const startIdx = SESSION_TIME_OPTIONS.indexOf(editSessionForm.startTime);
    const endIdx = SESSION_TIME_OPTIONS.indexOf(editSessionForm.endTime);
    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
      setScanToast('End time must be later than start time.');
      setTimeout(() => setScanToast(null), 3000);
      return;
    }
    setEditSessionSaving(true);
    // #region agent log
    try { fetch('http://127.0.0.1:7397/ingest/56484124-7df3-4537-80fa-738427537570',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'78a594'},body:JSON.stringify({sessionId:'78a594',location:'SpeakerDashboard.tsx:handleUpdateSession:start',message:'Speaker update session start',data:{roomId:editingSessionRoom.id,hasPresenterUids:!!editingSessionRoom.presenterUids,userInPresenters:editingSessionRoom.presenterUids?.includes(auth.currentUser?.uid || '')},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{}); } catch(_) {}
    // #endregion
    try {
      let backgroundImageUrl: string | null = null;
      if (editSessionBgFile) {
        const path = `roomBackgrounds/${editingSessionRoom.id}/${Date.now()}_${editSessionBgFile.name}`;
        await uploadBytes(ref(storage, path), editSessionBgFile, { contentType: editSessionBgFile.type || 'image/jpeg' });
        backgroundImageUrl = await getDownloadURL(ref(storage, path));
      } else if (editSessionForm.backgroundImage && editSessionForm.backgroundImage.startsWith('http')) {
        backgroundImageUrl = editSessionForm.backgroundImage;
      }
      const timeline = `${editSessionForm.startTime} - ${editSessionForm.endTime}`;
      const payload: Record<string, any> = {
        name: editSessionForm.name.trim(),
        description: editSessionForm.description.trim(),
        sessionDate: editSessionForm.sessionDate || null,
        timeline,
        projectDetail: editSessionForm.projectDetail.trim() || null,
      };
      payload.backgroundImage = backgroundImageUrl ? backgroundImageUrl : deleteField();
      Object.keys(payload).forEach((k) => { if (payload[k] === undefined) delete payload[k]; });
      await updateDoc(doc(db, 'rooms', editingSessionRoom.id), payload);
      const payloadForState = { ...payload };
      if (payloadForState.backgroundImage && typeof payloadForState.backgroundImage !== 'string') payloadForState.backgroundImage = undefined;
      setAssignedRooms((prev) =>
        prev.map((r) =>
          r.id === editingSessionRoom.id ? { ...r, ...payloadForState } : r
        )
      );
      setAllRooms((prev) =>
        prev.map((r) =>
          r.id === editingSessionRoom.id ? { ...r, ...payloadForState } : r
        )
      );
      closeEditSession();
      setScanToast('✅ Session updated successfully.');
      setTimeout(() => setScanToast(null), 3000);
      // #region agent log
      try { fetch('http://127.0.0.1:7397/ingest/56484124-7df3-4537-80fa-738427537570',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'78a594'},body:JSON.stringify({sessionId:'78a594',location:'SpeakerDashboard.tsx:handleUpdateSession:success',message:'Speaker update success',data:{roomId:editingSessionRoom.id},timestamp:Date.now(),hypothesisId:'E'})}).catch(()=>{}); } catch(_) {}
      // #endregion
    } catch (err: any) {
      // #region agent log
      try { fetch('http://127.0.0.1:7397/ingest/56484124-7df3-4537-80fa-738427537570',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'78a594'},body:JSON.stringify({sessionId:'78a594',location:'SpeakerDashboard.tsx:handleUpdateSession:catch',message:'Speaker update error',data:{roomId:editingSessionRoom?.id,errCode:err?.code,errMessage:String(err?.message||err)},timestamp:Date.now(),hypothesisId:'A,B,C,D,E'})}).catch(()=>{}); } catch(_) {}
      // #endregion
      console.error('updateSession', err);
      setScanToast('❌ Failed to update session. You may not have permission.');
      setTimeout(() => setScanToast(null), 4000);
    } finally {
      setEditSessionSaving(false);
    }
  };

  const handleDeleteMaterial = async (mat: PresenterMaterial) => {
    try {
      await deleteDoc(doc(db, 'presenterMaterials', mat.id));
      try { await deleteObject(ref(storage, mat.storagePath)); } catch {}
      setMaterials((prev) => prev.filter((m) => m.id !== mat.id));
    } catch (err) { console.error(err); }
  };

  const digitalIdQrData = `https://iscene.app/verify?uid=${user.uid}&name=${encodeURIComponent(fullName)}&role=presenter`;
  const digitalIdQrImg = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(digitalIdQrData)}`;
  const idNumber = user.uid.slice(0, 8).toUpperCase();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-600" size={36} />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // Sidebar nav item
  // ─────────────────────────────────────────────────────────────────────
  const SideNavItem = ({ tab, icon, label }: { tab: PresenterTab; icon: React.ReactNode; label: string }) => (
    <button type="button" onClick={() => { setActiveTab(tab); setSidebarOpen(false); }}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
        activeTab === tab
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
          : 'text-slate-600 hover:bg-slate-100'}`}>
      {icon}<span>{label}</span>
    </button>
  );

  // ─────────────────────────────────────────────────────────────────────
  // Review stars
  // ─────────────────────────────────────────────────────────────────────
  const Stars = ({ rating }: { rating: number }) => (
    <div className="flex items-center gap-0.5">
      {[1,2,3,4,5].map((n) => (
        <Star key={n} size={13} className={n <= rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200 fill-slate-200'} />
      ))}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────
  // Sessions table (shared between dashboard and sessions tab)
  // ─────────────────────────────────────────────────────────────────────
  const SessionsTable = ({ limit }: { limit?: number }) => {
    const rows = limit ? assignedRooms.slice(0, limit) : assignedRooms;
    return (
      <>
        <div className="space-y-3 p-4 md:hidden">
          {rows.length === 0 ? (
            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
              No assigned sessions yet. The admin will assign you to a session.
            </div>
          ) : rows.map((room) => {
            const dateObj = room.sessionDate ? new Date(room.sessionDate) : null;
            const isConfirmed = !!dateObj;
            return (
              <div key={room.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800">{room.name}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{room.sessionType || room.description?.slice(0, 40) || 'Session'}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${isConfirmed ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                    {isConfirmed ? 'Confirmed' : 'Pending'}
                  </span>
                </div>
                <div className="space-y-2 text-sm text-slate-600">
                  <p>
                    <span className="font-semibold text-slate-700">Date:</span>{' '}
                    {dateObj ? dateObj.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '—'}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-700">Time:</span>{' '}
                    {room.timeline?.split('–')[0]?.trim() || '—'}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-700">Location:</span> {room.location || 'TBA'}
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => openEditSession(room)} className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-100">
                    <Edit2 size={14} /> Edit Session
                  </button>
                  <button type="button" onClick={() => setSelectedRoomForChat(room)} className="flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-600 hover:bg-blue-100">
                    <MessageCircle size={14} /> View Q&amp;A
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[640px] text-left">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
              <th className="px-6 py-4 font-bold">Session Title</th>
              <th className="px-6 py-4 font-bold">Time &amp; Date</th>
              <th className="px-6 py-4 font-bold">Location</th>
              <th className="px-6 py-4 font-bold">Status</th>
              <th className="px-6 py-4 font-bold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-400 text-sm">No assigned sessions yet. The admin will assign you to a session.</td></tr>
            ) : rows.map((room) => {
              const dateObj = room.sessionDate ? new Date(room.sessionDate) : null;
              const isConfirmed = !!dateObj;
              return (
                <tr key={room.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-5">
                    <p className="font-bold text-slate-800">{room.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{room.sessionType || room.description?.slice(0, 40) || 'Session'}</p>
                  </td>
                  <td className="px-6 py-5 text-sm text-slate-600">
                    {dateObj ? (
                      <>{dateObj.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}<br /><span className="text-slate-400">{room.timeline?.split('–')[0]?.trim() || '—'}</span></>
                    ) : '—'}
                  </td>
                  <td className="px-6 py-5 text-sm text-slate-600">{room.location || 'TBA'}</td>
                  <td className="px-6 py-5">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${isConfirmed ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                      {isConfirmed ? 'Confirmed' : 'Pending'}
                    </span>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => openEditSession(room)} className="flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-100">
                        <Edit2 size={14} /> Edit
                      </button>
                      <button type="button" onClick={() => setSelectedRoomForChat(room)} className="flex items-center gap-1.5 rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-100">
                        <MessageCircle size={14} /> Q&amp;A
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </>
    );
  };

  // ─────────────────────────────────────────────────────────────────────
  // Right panel: Upload + Materials
  // ─────────────────────────────────────────────────────────────────────
  const RightPanel = () => (
    <div className="space-y-6">
      {/* Booth Content Upload */}
      <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="mb-5">
          <h3 className="text-lg font-bold">Session Training Materials</h3>
          <p className="text-sm text-slate-500 mt-0.5">Upload files for your sessions. Select a session below so participants can find them.</p>
        </div>

        {/* Drop zone */}
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && !uploadingFile && uploadInputRef.current?.click()}
          onClick={() => !uploadingFile && uploadInputRef.current?.click()}
          className={`flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors group ${uploadingFile ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-blue-400 hover:bg-blue-50/50'}`}
        >
          <input
            ref={uploadInputRef}
            type="file"
            className="hidden"
            accept="image/*,video/*,.pdf,application/pdf"
            disabled={uploadingFile}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) { handleFileUpload(file, uploadRoomId || undefined); e.target.value = ''; }
            }}
          />
          <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-3 transition-colors ${uploadingFile ? 'bg-blue-100' : 'bg-slate-100 group-hover:bg-blue-100'}`}>
            {uploadingFile
              ? <Loader2 size={28} className="animate-spin text-blue-500" />
              : <Upload size={28} className="text-slate-400 group-hover:text-blue-500" />}
          </div>
          <p className="font-bold text-slate-700 group-hover:text-blue-600">{uploadingFile ? 'Uploading…' : 'Click to upload assets'}</p>
          <p className="text-xs text-slate-400 mt-0.5">JPG, PNG, MP4, PDF · Max 200 MB</p>
        </div>

        {/* Link to room - REQUIRED for participants to see materials */}
        {roomsForDropdown.length > 0 && (
          <div className="mt-3">
            <label className="text-xs font-bold text-slate-600 mb-1 block">Link to session <span className="text-amber-600">(required for participants)</span></label>
            <p className="text-[11px] text-slate-500 mb-1.5">Participants can only see materials linked to a session they reserved.</p>
            <select
              value={uploadRoomId}
              onChange={(e) => setUploadRoomId(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white cursor-pointer appearance-none pr-10"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2364758b' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
            >
              <option value="">— Select a session —</option>
              {roomsForDropdown.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        )}

        {/* Pending uploads list */}
        {materials.length > 0 && (
          <div className="mt-5 space-y-2">
            <p className="text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-2">Recent Uploads</p>
            {materials.slice(0, 3).map((mat) => (
              <div key={mat.id} className={`flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 ${mat.status === 'processing' ? 'opacity-60' : ''}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${fileIconBg(mat.fileType)}`}>{fileIcon(mat.fileType)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{mat.fileName}</p>
                  <p className="text-[10px] text-slate-400">{mat.status === 'processing' ? 'Awaiting processing…' : `${formatBytes(mat.fileSizeBytes)}`}</p>
                </div>
                {mat.status === 'processing'
                  ? <div className="w-12 h-1.5 bg-slate-200 rounded-full overflow-hidden"><div className="bg-blue-500 h-full w-2/3" /></div>
                  : <button type="button" onClick={() => handleDeleteMaterial(mat)} className="text-slate-300 hover:text-red-500 transition-colors"><X size={16} /></button>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent uploads */}
      <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h3 className="text-lg font-bold mb-4">Recent Uploads</h3>
        {materials.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">No materials yet. Upload above and link to a session.</p>
        ) : (
          <div className="space-y-1">
            {materials.slice(0, 4).map((mat) => (
              <div key={mat.id} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer group">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${fileIconBg(mat.fileType)}`}>{fileIcon(mat.fileType)}</div>
                  <div>
                    <p className="text-sm font-bold truncate max-w-[160px]">{mat.fileName}</p>
                    <p className="text-xs text-slate-400">{formatBytes(mat.fileSizeBytes)}</p>
                  </div>
                </div>
                <a href={mat.downloadUrl} target="_blank" rel="noopener noreferrer" className="text-slate-300 group-hover:text-blue-500 transition-colors"><ChevronRight size={18} /></a>
              </div>
            ))}
          </div>
        )}
        <button type="button" onClick={() => setActiveTab('materials')}
          className="w-full mt-4 py-3 border border-slate-200 rounded-xl text-sm font-bold hover:bg-slate-50 transition-colors">
          Manage All Materials
        </button>
      </section>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────
  // Main render
  // ─────────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen overflow-hidden bg-slate-50 text-slate-900">

      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden"
        />
      )}

      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200 bg-white shadow-sm transition-transform duration-200 lg:relative lg:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        {/* Logo */}
        <div className="p-6 flex items-center gap-3 border-b border-slate-100">
          <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center bg-white shadow-sm border border-slate-100">
            <img src="/iscene.png" alt="iSCENE" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-base font-black leading-tight">iSCENE 2026</h1>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Speaker Portal</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-5">
          <SideNavItem tab="dashboard" icon={<LayoutDashboard size={18} />} label="Dashboard" />
          <SideNavItem tab="sessions" icon={<CalendarDays size={18} />} label="My Sessions" />
          <SideNavItem tab="materials" icon={<Package size={18} />} label="Training Materials" />
          <SideNavItem tab="reviews" icon={<Star size={18} />} label="Session Reviews" />
          <SideNavItem tab="uploads" icon={<Upload size={18} />} label="Booth Assets" />
        </nav>

        {/* User profile */}
        <div className="p-4 border-t border-slate-100">
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl">
            {profilePicUrl
              ? <img src={profilePicUrl} alt={fullName} className="w-10 h-10 rounded-full object-cover shrink-0" />
              : <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-black shrink-0">{initials}</div>}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">{fullName}</p>
              <p className="text-[11px] text-slate-400 truncate">{roleTitle}</p>
            </div>
            <button type="button" onClick={() => setActiveTab('profile')} className="text-slate-400 hover:text-blue-600 transition-colors">
              <Settings size={16} />
            </button>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="mt-3 w-full rounded-full border border-red-200 py-2 text-xs font-bold text-red-600 transition-colors hover:bg-red-50"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 overflow-y-auto min-h-screen">
        {/* Toast */}
        {scanToast && (
          <div className={`fixed left-4 right-4 top-4 z-50 px-5 py-3 rounded-2xl text-sm font-semibold shadow-lg sm:left-auto sm:right-4 ${scanToast.startsWith('✅') ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
            {scanToast}
          </div>
        )}

        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur lg:hidden">
          <div className="flex items-center gap-3 px-4 py-4">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600"
            >
              <Menu size={18} />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-900">iSCENE 2026</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Speaker Portal</p>
            </div>
          </div>
        </header>

        {/* ══════════════════════ DASHBOARD ══════════════════════ */}
        {activeTab === 'dashboard' && (
          <div className="p-4 sm:p-6 lg:p-8">
            {/* Header */}
            <div className="flex flex-wrap items-end justify-between gap-6 mb-8">
              <div>
                <h2 className="text-2xl font-black tracking-tight sm:text-3xl mb-1">Speaker Dashboard</h2>
                <p className="text-sm text-slate-500 sm:text-base">Manage your sessions, upload training materials for participants, and view attendee reviews.</p>
              </div>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <button type="button" className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors">
                  <HelpCircle size={16} /> Support
                </button>
                <button type="button" onClick={() => { setActiveTab('materials'); setSidebarOpen(false); }}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium shadow-lg shadow-blue-200 hover:bg-blue-700 transition-colors">
                  <Upload size={16} /> Upload Materials
                </button>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
              {[
                {
                  icon: <CalendarDays size={20} className="text-blue-600" />,
                  iconBg: 'bg-blue-100',
                  badge: `+${assignedRooms.length} Session${assignedRooms.length !== 1 ? 's' : ''}`,
                  badgeColor: 'text-emerald-600',
                  label: 'Assigned Sessions',
                  value: String(assignedRooms.length),
                },
                {
                  icon: <Star size={20} className="text-purple-600" />,
                  iconBg: 'bg-purple-100',
                  badge: sessionReviews.length > 0 ? `${sessionReviews.length} reviews` : 'No reviews yet',
                  badgeColor: sessionReviews.length > 0 ? 'text-emerald-600' : 'text-slate-400',
                  label: 'Avg. Rating',
                  value: avgRating,
                },
                {
                  icon: <CheckCircle2 size={20} className="text-orange-500" />,
                  iconBg: 'bg-orange-100',
                  badge: 'Status',
                  badgeColor: 'text-slate-400',
                  label: 'Material Status',
                  value: materialStatus,
                  valueClass: materialStatus === 'APPROVED' ? 'text-emerald-500 text-lg' : 'text-slate-400 text-lg',
                },
                {
                  icon: <Users size={20} className="text-blue-600" />,
                  iconBg: 'bg-blue-50',
                  badge: totalReach > 0 ? `${(totalReach / 1000).toFixed(1)}k cap.` : 'TBD',
                  badgeColor: 'text-emerald-600',
                  label: 'Total Seat Capacity',
                  value: totalReach > 0 ? totalReach.toLocaleString() : '—',
                },
              ].map(({ icon, iconBg, badge, badgeColor, label, value, valueClass }) => (
                <div key={label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className={`p-2 rounded-xl ${iconBg}`}>{icon}</div>
                    <span className={`text-xs font-bold ${badgeColor}`}>{badge}</span>
                  </div>
                  <p className="text-sm text-slate-500 font-medium mb-1">{label}</p>
                  <p className={`text-3xl font-black ${valueClass || ''}`}>{value}</p>
                </div>
              ))}
            </div>

            {/* Quick actions */}
            <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button type="button" onClick={() => setScanModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium hover:shadow-md transition-all">
                <QrCode size={16} className="text-blue-600" /> Scan Entrance QR
              </button>
              <button type="button" onClick={() => setIdModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium hover:shadow-md transition-all">
                <CreditCard size={16} className="text-blue-600" /> My Digital ID
              </button>
              <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium ${hasEntryAttendance ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'}`}>
                <CheckCircle2 size={16} /> {hasEntryAttendance ? 'Checked In' : 'Not Checked In'}
              </div>
            </div>

            {/* Two-column grid */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3 xl:gap-8">
              {/* Left: sessions + reviews */}
              <div className="xl:col-span-2 space-y-8">
                {/* Sessions table */}
                <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <h3 className="text-lg font-bold">Assigned Sessions</h3>
                    <button type="button" onClick={() => setActiveTab('sessions')} className="text-blue-600 text-sm font-semibold hover:underline flex items-center gap-1">
                      View Schedule <ChevronRight size={14} />
                    </button>
                  </div>
                  <SessionsTable limit={3} />
                </section>

                {/* Reviews */}
                <section className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm sm:p-6">
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <h3 className="text-lg font-bold">Attendee Review Summaries</h3>
                    <button type="button" onClick={() => setActiveTab('reviews')} className="text-slate-400 hover:text-slate-600 transition-colors">
                      <Filter size={18} />
                    </button>
                  </div>
                  {sessionReviews.length === 0 ? (
                    <div className="py-10 text-center text-slate-400 text-sm">
                      <Star size={32} className="mx-auto mb-2 text-slate-200" />
                      No reviews yet. They'll appear here once attendees submit feedback for your sessions.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {sessionReviews.slice(0, 3).map((rev) => (
                        <div key={rev.id} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Stars rating={getReviewRating(rev)} />
                              <span className="text-xs text-slate-400 font-medium">{relativeTime(rev.submittedAt)}</span>
                            </div>
                            <span className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-bold uppercase">{rev.roomName?.slice(0, 16) || 'Session'}</span>
                          </div>
                          {(rev.part4 || rev.comment) && <p className="text-sm italic text-slate-600 leading-relaxed">&quot;{rev.part4 || rev.comment}&quot;</p>}
                        </div>
                      ))}
                      {sessionReviews.length > 3 && (
                        <button type="button" onClick={() => setActiveTab('reviews')} className="text-blue-600 text-sm font-semibold hover:underline">
                          View all {sessionReviews.length} reviews →
                        </button>
                      )}
                    </div>
                  )}
                </section>
              </div>

              {/* Right: upload + materials */}
              <div><RightPanel /></div>
            </div>
          </div>
        )}

        {/* ══════════════════════ SESSIONS TAB ══════════════════════ */}
        {activeTab === 'sessions' && (
          <div className="p-4 sm:p-6 lg:p-8">
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-black">Assigned Sessions</h2>
                <p className="text-slate-500 text-sm mt-1">All sessions where you are listed as a presenter</p>
              </div>
            </div>
            <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <SessionsTable />
            </section>
          </div>
        )}

        {/* ══════════════════════ MATERIALS TAB ══════════════════════ */}
        {activeTab === 'materials' && (
          <div className="p-4 sm:p-6 lg:p-8">
            <div className="mb-6 flex flex-col gap-4">
              <div>
                <h2 className="text-2xl font-black">Session Training Materials</h2>
                <p className="text-slate-500 text-sm mt-1">Upload files for your sessions. Participants see materials only when linked to a session.</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                {roomsForDropdown.length > 0 && (
                  <div className="flex-1 sm:max-w-xs">
                    <label className="text-xs font-bold text-slate-600 mb-1 block">Link new upload to session</label>
                    <select
                      value={uploadRoomId}
                      onChange={(e) => setUploadRoomId(e.target.value)}
                      className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white cursor-pointer"
                    >
                      <option value="">— Select session —</option>
                      {roomsForDropdown.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                )}
                <>
                  <input
                    ref={materialsUploadInputRef}
                    type="file"
                    className="hidden"
                    accept="image/*,video/*,.pdf,application/pdf"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) { handleFileUpload(f, uploadRoomId || undefined); e.target.value = ''; } }}
                  />
                  <button
                    type="button"
                    onClick={() => materialsUploadInputRef.current?.click()}
                    disabled={uploadingFile}
                    className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-200 transition-colors hover:bg-blue-700 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Upload size={16} /> Upload File
                  </button>
                </>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {materials.length === 0 ? (
                <div className="py-16 text-center text-slate-400">
                  <Package size={40} className="mx-auto mb-3 text-slate-200" />
                  <p className="font-medium mb-1">No materials uploaded</p>
                  <p className="text-sm">Upload your presentation files, images, or videos.</p>
                </div>
              ) : (
                <>
                  <div className="space-y-3 p-4 md:hidden">
                    {materials.map((mat) => (
                      <div key={mat.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex items-start gap-3">
                          <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${fileIconBg(mat.fileType)}`}>{fileIcon(mat.fileType)}</div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-slate-800">{mat.fileName}</p>
                            <p className="mt-0.5 text-[11px] text-slate-400">{relativeTime(mat.createdAt)}</p>
                            <div className="mt-3 space-y-2 text-sm text-slate-500">
                              <p><span className="font-semibold text-slate-700">Session:</span> {mat.roomName || '—'}</p>
                              <p><span className="font-semibold text-slate-700">Size:</span> {formatBytes(mat.fileSizeBytes)}</p>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-3">
                              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${mat.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : mat.status === 'processing' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-700'}`}>
                                {mat.status.charAt(0).toUpperCase() + mat.status.slice(1)}
                              </span>
                              <div className="flex items-center gap-3">
                                <a href={mat.downloadUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700" title="Download"><Download size={16} /></a>
                                <button type="button" onClick={() => handleDeleteMaterial(mat)} className="text-slate-300 hover:text-red-500 transition-colors" title="Delete"><Trash2 size={16} /></button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                <table className="hidden w-full min-w-[760px] text-left md:table">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                      <th className="px-6 py-4 font-bold">File</th>
                      <th className="px-6 py-4 font-bold">Session</th>
                      <th className="px-6 py-4 font-bold">Size</th>
                      <th className="px-6 py-4 font-bold">Status</th>
                      <th className="px-6 py-4 font-bold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {materials.map((mat) => (
                      <tr key={mat.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${fileIconBg(mat.fileType)}`}>{fileIcon(mat.fileType)}</div>
                            <div>
                              <p className="text-sm font-bold truncate max-w-[180px]">{mat.fileName}</p>
                              <p className="text-[11px] text-slate-400">{relativeTime(mat.createdAt)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-500">{mat.roomName || <span className="text-slate-300">—</span>}</td>
                        <td className="px-6 py-4 text-sm text-slate-500">{formatBytes(mat.fileSizeBytes)}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${mat.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : mat.status === 'processing' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-700'}`}>
                            {mat.status.charAt(0).toUpperCase() + mat.status.slice(1)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <a href={mat.downloadUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700" title="Download"><Download size={16} /></a>
                            <button type="button" onClick={() => handleDeleteMaterial(mat)} className="text-slate-300 hover:text-red-500 transition-colors" title="Delete"><Trash2 size={16} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════ REVIEWS TAB ══════════════════════ */}
        {activeTab === 'reviews' && (
          <div className="p-4 sm:p-6 lg:p-8">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-black">Attendee Reviews</h2>
                <p className="text-slate-500 text-sm mt-1">Feedback submitted by attendees for your sessions</p>
              </div>
              {sessionReviews.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
                  <Stars rating={Math.round(parseFloat(avgRating) || 0)} />
                  <span className="text-2xl font-black">{avgRating}</span>
                  <span className="text-slate-400 text-sm">/ {sessionReviews.length} review{sessionReviews.length !== 1 ? 's' : ''}</span>
                </div>
              )}
            </div>
            {sessionReviews.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-400 shadow-sm sm:p-16">
                <Star size={48} className="mx-auto mb-4 text-slate-200" />
                <p className="font-medium">No reviews yet</p>
                <p className="text-sm mt-1">Attendee feedback will appear here once they review your sessions.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {sessionReviews.map((rev) => {
                  const displayRating = typeof rev.rating === 'number' ? rev.rating : (rev.part2?.length ? Math.round(rev.part2.reduce((s, sp) => s + sp.ratings.acceptability, 0) / rev.part2.length) : 5);
                  const commentText = rev.part4 || rev.comment;
                  return (
                  <div key={rev.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
                    <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-black">A</div>
                        <div>
                          <p className="text-sm font-bold text-slate-700">{rev.participantName || 'Attendee'}</p>
                          <p className="text-[11px] text-slate-400">{relativeTime(rev.submittedAt)}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Stars rating={displayRating} />
                        <span className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-bold uppercase">{rev.roomName?.slice(0, 20) || 'Session'}</span>
                      </div>
                    </div>
                    {commentText && <p className="text-sm italic text-slate-600 bg-slate-50 rounded-xl p-3">&quot;{commentText}&quot;</p>}
                    {rev.part1 && (
                      <div className="mt-2 text-xs text-slate-500">
                        <p><strong>Part I:</strong> Content {rev.part1.levelOfContent} · Appropriateness {rev.part1.appropriateness} · Applicability {rev.part1.applicability}</p>
                      </div>
                    )}
                  </div>
                  );})}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════ UPLOADS TAB ══════════════════════ */}
        {activeTab === 'uploads' && (
          <div className="p-4 sm:p-6 lg:p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-black">Booth Uploads</h2>
              <p className="text-slate-500 text-sm mt-1">Upload and manage your booth digital assets</p>
            </div>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3 xl:gap-8">
              <div className="xl:col-span-2">
                {/* Large upload zone */}
                <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                  <div className="mb-4">
                    <div className="flex items-center gap-2 text-emerald-600 mb-1"><CheckCircle2 size={14} /><span className="text-xs font-bold uppercase tracking-wider">Admin Approved</span></div>
                    <h3 className="text-lg font-bold">Upload Digital Assets</h3>
                    <p className="text-sm text-slate-500">Supported: JPG, PNG, MP4, PDF · Max 200 MB per file</p>
                  </div>
                  <label className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-colors group sm:p-12 ${uploadingFile ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-blue-400 hover:bg-blue-50/30'}`}>
                    <input type="file" className="hidden" accept="image/*,video/*,.pdf" disabled={uploadingFile}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) { handleFileUpload(f, uploadRoomId || undefined); e.target.value = ''; } }} />
                    <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 transition-colors ${uploadingFile ? 'bg-blue-100' : 'bg-slate-100 group-hover:bg-blue-100'}`}>
                      {uploadingFile ? <Loader2 size={36} className="animate-spin text-blue-500" /> : <Upload size={36} className="text-slate-400 group-hover:text-blue-500" />}
                    </div>
                    <p className="text-lg font-bold text-slate-700 group-hover:text-blue-600 mb-1">{uploadingFile ? 'Uploading…' : 'Click to upload assets'}</p>
                    <p className="text-sm text-slate-400">Drag and drop or click to browse files</p>
                  </label>
                  {roomsForDropdown.length > 0 && (
                    <div className="mt-4">
                      <label className="text-sm text-slate-500 font-medium mb-1 block">Link to session</label>
                      <select
                        value={uploadRoomId}
                        onChange={(e) => setUploadRoomId(e.target.value)}
                        className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 bg-white cursor-pointer"
                      >
                        <option value="">No specific session</option>
                        {roomsForDropdown.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </div>
                  )}
                </section>

                {/* All uploads list */}
                {materials.length > 0 && (
                  <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                    <h3 className="text-base font-bold mb-4">All Uploaded Files</h3>
                    <div className="space-y-2">
                      {materials.map((mat) => (
                        <div key={mat.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${fileIconBg(mat.fileType)}`}>{fileIcon(mat.fileType)}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold truncate">{mat.fileName}</p>
                            <p className="text-[10px] text-slate-400">{formatBytes(mat.fileSizeBytes)} · {relativeTime(mat.createdAt)}</p>
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${mat.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{mat.status}</span>
                          <a href={mat.downloadUrl} target="_blank" rel="noopener noreferrer" className="text-slate-300 hover:text-blue-500"><Download size={16} /></a>
                          <button type="button" onClick={() => handleDeleteMaterial(mat)} className="text-slate-300 hover:text-red-500"><X size={16} /></button>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
              <div><RightPanel /></div>
            </div>
          </div>
        )}

        {/* ══════════════════════ PROFILE TAB ══════════════════════ */}
        {activeTab === 'profile' && (
          <div className="max-w-2xl p-4 sm:p-6 lg:p-8">
            <h2 className="text-2xl font-black mb-6">My Profile</h2>
            <div className="space-y-4">
              {/* Avatar */}
              <div className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
                {profilePicUrl
                  ? <img src={profilePicUrl} alt={fullName} className="w-16 h-16 rounded-full object-cover ring-2 ring-blue-100" />
                  : <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-black">{initials}</div>}
                <div className="flex-1 min-w-0">
                  <p className="font-black text-lg truncate">{fullName}</p>
                  <p className="text-sm text-slate-500 truncate">{user.email}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">Presenter</span>
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">✓ Approved</span>
                  </div>
                </div>
                <button type="button" onClick={() => setIdModal(true)} className="flex flex-col items-center gap-1 text-blue-600 hover:text-blue-700">
                  <CreditCard size={20} /><span className="text-[10px] font-bold">My ID</span>
                </button>
              </div>
              {/* Registration details */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-3">Registration Info</p>
                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  {[
                    { label: 'Sector', value: registration?.sector },
                    { label: 'Organization', value: registration?.sectorOffice },
                    { label: 'Position', value: registration?.positionTitle },
                    { label: 'Contact', value: registration?.contactNumber },
                  ].map(({ label, value }) => (
                    <div key={label}><p className="text-[11px] text-slate-400 mb-0.5">{label}</p><p className="font-semibold text-slate-800 text-xs">{value || '—'}</p></div>
                  ))}
                </div>
              </div>
              {/* Account */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2">Account</p>
                <button type="button" onClick={async () => {
                  if (!user.email) return;
                  await sendPasswordResetEmail(auth, user.email);
                  setPwResetSent(true); setTimeout(() => setPwResetSent(false), 5000);
                }} disabled={pwResetSent}
                  className="w-full flex items-center justify-between py-2.5 text-sm text-slate-600 hover:text-slate-900 disabled:text-emerald-600">
                  <span className="flex items-center gap-2"><Mail size={15} />{pwResetSent ? 'Reset email sent!' : 'Change Password'}</span>
                  {!pwResetSent && <ChevronRight size={15} className="text-slate-300" />}
                </button>
                <div className="border-t border-slate-100" />
                <button type="button" onClick={onSignOut} className="w-full flex items-center gap-2 py-2.5 text-sm font-semibold text-red-500 hover:text-red-600">
                  <LogOut size={15} /> Sign out
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── QR Scanner modal ─────────────────────────────────────────── */}
      {scanModal && (
        <QrScanModal
          showTakePhoto={false}
          subtitle="Scanning will start automatically for entrance check-in"
          onClose={() => setScanModal(false)}
          onResult={handleScanResult}
        />
      )}

      {/* ── Digital ID modal ─────────────────────────────────────────── */}
      {idModal && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xs bg-white rounded-3xl overflow-hidden shadow-2xl">
            <div className="bg-blue-600 px-4 py-3 flex items-center justify-between">
              <div><p className="text-white text-xs font-black tracking-widest uppercase">iSCENE 2026</p><p className="text-blue-200 text-[10px]">Staff Portal · Presenter</p></div>
              <button type="button" onClick={() => setIdModal(false)} className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white"><X size={14} /></button>
            </div>
            <div className="px-5 py-5 flex flex-col items-center bg-gradient-to-b from-white to-slate-50">
              {profilePicUrl
                ? <img src={profilePicUrl} alt={fullName} className="w-20 h-20 rounded-full object-cover mb-3 ring-4 ring-blue-100 shadow-md" />
                : <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-2xl font-black text-white mb-3 ring-4 ring-blue-100">{initials}</div>}
              <h3 className="text-base font-black text-center">{fullName}</h3>
              <p className="text-xs text-slate-500 mt-0.5 text-center">{roleTitle}{registration?.sectorOffice ? ` · ${registration.sectorOffice}` : ''}</p>
              <span className="mt-2 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-[11px] font-bold">Presenter</span>
              <div className="mt-4 p-3 bg-white rounded-2xl shadow-sm border border-slate-100">
                <img src={digitalIdQrImg} alt="Digital ID QR" className="w-44 h-44" />
              </div>
              <p className="mt-2 text-[11px] text-slate-400 font-mono tracking-widest">ID #{idNumber}</p>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[10px] text-slate-400">April 9–11, 2026</span>
              <a href={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(digitalIdQrData)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline">
                <Download size={11} /> Download QR
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Edit Session Modal */}
      {editingSessionRoom && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden my-8">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Edit2 size={20} className="text-amber-600" />
                Edit Session
              </h3>
              <button type="button" onClick={closeEditSession} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200"><X size={18} /></button>
            </div>
            <form onSubmit={handleUpdateSession} className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-600 mb-1 block">Session Name *</label>
                <input value={editSessionForm.name} onChange={(e) => setEditSessionForm((p) => ({ ...p, name: e.target.value }))} required className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="Session title" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 mb-1 block">Description</label>
                <textarea value={editSessionForm.description} onChange={(e) => setEditSessionForm((p) => ({ ...p, description: e.target.value }))} rows={2} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none" placeholder="Brief description" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 block">Date</label>
                  <input value={editSessionForm.sessionDate} onChange={(e) => setEditSessionForm((p) => ({ ...p, sessionDate: e.target.value }))} type="date" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 block">Start Time</label>
                  <select value={editSessionForm.startTime} onChange={(e) => setEditSessionForm((p) => ({ ...p, startTime: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Select start</option>
                    {SESSION_TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 mb-1 block">End Time</label>
                <select value={editSessionForm.endTime} onChange={(e) => setEditSessionForm((p) => ({ ...p, endTime: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Select end</option>
                  {SESSION_TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 mb-1 block">Background Image</label>
                {editSessionForm.backgroundImage && (
                  <div className="relative rounded-xl overflow-hidden border border-slate-200 h-24 mb-2">
                    <img src={editSessionForm.backgroundImage} alt="Session" className="w-full h-full object-contain bg-slate-100" />
                    <button type="button" onClick={() => { setEditSessionForm((p) => ({ ...p, backgroundImage: '' })); setEditSessionBgFile(null); }} className="absolute top-1 right-1 rounded-full bg-red-500 p-1 text-white hover:bg-red-600"><X size={12} /></button>
                  </div>
                )}
                <input type="file" accept="image/*" id="edit-session-bg" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setEditSessionBgFile(f); setEditSessionForm((p) => ({ ...p, backgroundImage: URL.createObjectURL(f) })); } }} />
                <label htmlFor="edit-session-bg" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 cursor-pointer">
                  <ImageIcon size={16} /> Upload Image
                </label>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 mb-1 block">Project Detail</label>
                <textarea value={editSessionForm.projectDetail} onChange={(e) => setEditSessionForm((p) => ({ ...p, projectDetail: e.target.value }))} rows={3} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none" placeholder="Detailed description, objectives..." />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" disabled={editSessionSaving} className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {editSessionSaving ? <><Loader2 size={16} className="animate-spin" /> Updating...</> : 'Save Changes'}
                </button>
                <button type="button" onClick={closeEditSession} disabled={editSessionSaving} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Room Q&A Modal (read-only for speakers) */}
      {selectedRoomForChat && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <MessageCircle size={20} className="text-blue-600" />
                {selectedRoomForChat.name} — Q&A
              </h3>
              <button type="button" onClick={() => setSelectedRoomForChat(null)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <p className="text-xs text-slate-500 mb-3">Read-only. Participant questions from the discussion.</p>
              {roomChatMessages.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No questions yet.</p>
              ) : (
                <div className="space-y-3">
                  {roomChatMessages.map((msg) => (
                    <div key={msg.id} className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                      <p className="text-xs font-semibold text-slate-600 mb-1">{msg.participantName || 'Anonymous'}</p>
                      <p className="text-sm text-slate-700">{msg.text}</p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        {msg.createdAt?.toDate ? msg.createdAt.toDate().toLocaleString() : '—'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
