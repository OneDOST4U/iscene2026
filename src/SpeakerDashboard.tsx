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
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { Html5Qrcode } from 'html5-qrcode';
import { db, auth, storage } from './firebase';

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
  location?: string;
  sessionType?: string;
};

type SessionReview = {
  id: string;
  roomId: string;
  roomName: string;
  rating: number;
  comment: string;
  uid: string;
  submittedAt: any;
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
// QR Scanner (shared)
// ─────────────────────────────────────────────────────────────────────────────
function QrScanModal({ onClose, onResult }: { onClose: () => void; onResult: (text: string) => void }) {
  const [camError, setCamError] = React.useState<string | null>(null);
  const [cameraReady, setCameraReady] = React.useState(false);
  const [uploadingImage, setUploadingImage] = React.useState(false);
  const [scanSuccess, setScanSuccess] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const scannerRef = React.useRef<Html5Qrcode | null>(null);
  const closingRef = React.useRef(false);
  const handledRef = React.useRef(false);
  const successTimerRef = React.useRef<number | null>(null);
  const historyTokenRef = React.useRef(`speaker-scan-${Math.random().toString(36).slice(2)}`);
  const historyPushedRef = React.useRef(false);
  const regionId = 'speaker-qr-region';

  const stopActiveScanner = React.useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      await scanner.stop();
    } catch {}
    try {
      scanner.clear();
    } catch {}
    scannerRef.current = null;
  }, []);

  const closeScanner = React.useCallback(async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (successTimerRef.current) {
      window.clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
    await stopActiveScanner();
    if (
      historyPushedRef.current &&
      window.history.state?.scannerModal === historyTokenRef.current
    ) {
      historyPushedRef.current = false;
      window.history.back();
      return;
    }
    onClose();
  }, [onClose, stopActiveScanner]);

  const finishSuccessfulScan = React.useCallback(
    (decoded: string) => {
      if (handledRef.current) return;
      handledRef.current = true;
      setScanSuccess(true);
      successTimerRef.current = window.setTimeout(() => {
        onResult(decoded);
        void closeScanner();
      }, 950);
    },
    [closeScanner, onResult],
  );

  const startScanner = React.useCallback(async () => {
    await stopActiveScanner();

    setCamError(null);
    setCameraReady(false);

    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    if (!document.getElementById(regionId)) {
      setCamError('Scanner failed to initialize. Please try again.');
      return;
    }

    const scanner = new Html5Qrcode(regionId);
    scannerRef.current = scanner;

    const config = {
      fps: 20,
      qrbox: (w: number, h: number) => {
        const side = Math.round(Math.min(w, h) * 0.85);
        return { width: side, height: side };
      },
      aspectRatio: 1,
      useBarCodeDetectorIfSupported: false,
    } as const;

    const handleDecoded = (decoded: string) => {
      if (handledRef.current) return;
      void stopActiveScanner().finally(() => finishSuccessfulScan(decoded));
    };

    // Try user (front) camera first - better for laptop webcam
    try {
      await scanner.start({ facingMode: 'user' }, config, handleDecoded, () => {});
      setCameraReady(true);
      return;
    } catch {}

    // Fallback: environment (back camera) for phones
    try {
      await scanner.start({ facingMode: { exact: 'environment' } }, config, handleDecoded, () => {});
      setCameraReady(true);
      return;
    } catch {}

    try {
      const cameras = await Html5Qrcode.getCameras();
      const preferredCamera =
        cameras.find((camera) => /back|rear|environment/i.test(camera.label))?.id ||
        cameras[0]?.id;
      if (!preferredCamera) {
        throw new Error('No camera found');
      }
      await scanner.start(preferredCamera, config, handleDecoded, () => {});
      setCameraReady(true);
    } catch {
      setCamError('Unable to start the camera. Please allow permission or try another device/browser.');
      setCameraReady(false);
    }
  }, [finishSuccessfulScan, regionId, stopActiveScanner]);

  React.useEffect(() => {
    closingRef.current = false;
    handledRef.current = false;

    void startScanner();

    const historyTimer = window.setTimeout(() => {
      window.history.pushState({ scannerModal: historyTokenRef.current }, '', window.location.href);
      historyPushedRef.current = true;
    }, 0);

    const handlePopState = () => {
      historyPushedRef.current = false;
      closingRef.current = true;
      void stopActiveScanner().catch(() => {}).finally(() => onClose());
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.clearTimeout(historyTimer);
      if (successTimerRef.current) {
        window.clearTimeout(successTimerRef.current);
      }
      window.removeEventListener('popstate', handlePopState);
      void stopActiveScanner().catch(() => {});
    };
  }, [onClose, startScanner, stopActiveScanner]);

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || handledRef.current) return;

    setUploadingImage(true);
    setCamError(null);
    setCameraReady(false);

    try {
      await stopActiveScanner();

      if (!document.getElementById(regionId)) {
        await startScanner();
        return;
      }

      const scanner = new Html5Qrcode(regionId);
      scannerRef.current = scanner;

      const decoded = await scanner.scanFile(file, true);

      try {
        scanner.clear();
      } catch {}
      scannerRef.current = null;

      finishSuccessfulScan(decoded);
    } catch {
      setCamError('No QR code was found in that image. Try another image or use the live camera.');
      await startScanner();
    } finally {
      setUploadingImage(false);
      event.target.value = '';
    }
  };

  const controlsDisabled = uploadingImage || scanSuccess;

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950">
      <style>{`
        #${regionId},
        #${regionId} > div,
        #${regionId}__scan_region,
        #${regionId}__dashboard {
          width: 100% !important;
          height: 100% !important;
          border: 0 !important;
          background: transparent !important;
        }
        #${regionId} video,
        #${regionId} canvas {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
        }
        #${regionId} video {
          filter: brightness(1.2) contrast(1.15) saturate(1.05);
        }
        #${regionId} canvas {
          display: none !important;
        }
        #${regionId}__dashboard_section,
        #${regionId}__dashboard_section_csr,
        #${regionId}__dashboard_section_swaplink {
          display: none !important;
        }
      `}</style>
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
      <div id={regionId} className="absolute inset-0 overflow-hidden bg-slate-900" />
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/75 to-transparent z-10" />
      <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/80 to-transparent z-10" />

      <header className="absolute top-0 inset-x-0 z-20 flex items-center p-4">
        <button
          type="button"
          onClick={() => void closeScanner()}
          disabled={controlsDisabled}
          className="flex size-12 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur-md disabled:opacity-50 disabled:pointer-events-none"
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="flex-1 text-center text-lg font-bold text-white drop-shadow-md">iSCENE 2026 Scan</h2>
      </header>

      <main className="relative z-20 flex h-full flex-col items-center justify-center px-6 pb-28 pt-24">
        <div className="relative h-64 w-64 max-w-[78vw] max-h-[46vh] sm:h-80 sm:w-80">
          <div className="absolute inset-0 rounded-[28px] border border-white/15 shadow-[0_0_0_9999px_rgba(2,6,23,0.52)]" />
          <div className="absolute left-0 top-0 h-7 w-7 rounded-tl-2xl border-l-4 border-t-4 border-blue-500" />
          <div className="absolute right-0 top-0 h-7 w-7 rounded-tr-2xl border-r-4 border-t-4 border-blue-500" />
          <div className="absolute bottom-0 left-0 h-7 w-7 rounded-bl-2xl border-b-4 border-l-4 border-blue-500" />
          <div className="absolute bottom-0 right-0 h-7 w-7 rounded-br-2xl border-b-4 border-r-4 border-blue-500" />
          <div className="absolute left-4 right-4 top-0 h-1 rounded-full bg-gradient-to-r from-transparent via-blue-500 to-transparent shadow-[0_0_18px_rgba(43,140,238,0.95)] animate-pulse" />
          <div className="absolute inset-[18%] rounded-[22px] border-2 border-dashed border-white/35 bg-black/10 backdrop-blur-[1px] flex flex-col items-center justify-center text-center px-5">
            <img src="/iscene.png" alt="iSCENE" className="w-10 h-10 rounded-full object-contain bg-white/90 p-1 shadow-md mb-3" />
            <QrCode size={42} className="text-white/90 mb-3" />
            <p className="text-white text-sm font-bold">Place QR code here</p>
            <p className="text-slate-200 text-[11px] mt-1">Keep the code centered and steady</p>
          </div>
        </div>

        <div className="mt-20 w-full max-w-md text-center">
          <h3 className="text-white text-2xl font-bold">Align QR Code within frame</h3>
          <p className="mt-2 text-sm text-slate-300">Scanning will start automatically for entrance check-in</p>
          {uploadingImage && <p className="mt-3 text-sm font-semibold text-blue-300">Reading uploaded image…</p>}
          {!uploadingImage && !camError && !cameraReady && <p className="mt-3 text-sm font-semibold text-blue-300">Starting live camera…</p>}
          {camError && <p className="mt-3 text-sm font-semibold text-red-300">{camError}</p>}
        </div>
      </main>

      <div className="absolute inset-x-0 bottom-0 z-20 rounded-t-[28px] border-t border-white/10 bg-slate-50/95 px-6 py-5 backdrop-blur-xl">
        <div className="grid grid-cols-3 items-center justify-items-center gap-4 max-w-sm mx-auto">
          <button
            type="button"
            onClick={() => !controlsDisabled && fileInputRef.current?.click()}
            disabled={controlsDisabled}
            className="flex size-12 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-blue-600 disabled:opacity-50 disabled:pointer-events-none justify-self-end"
          >
            <ImageUp size={20} />
          </button>
          <div className="flex size-20 items-center justify-center rounded-full bg-blue-600 text-white shadow-xl shadow-blue-500/30 ring-4 ring-blue-200/60">
            <QrCode size={30} />
          </div>
          <button
            type="button"
            onClick={() => void startScanner()}
            disabled={controlsDisabled}
            className="flex size-12 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-blue-600 disabled:opacity-50 disabled:pointer-events-none justify-self-start"
          >
            <RefreshCw size={20} className={!cameraReady && !camError ? 'animate-spin' : ''} />
          </button>
        </div>
        <p className="mt-3 text-center text-xs font-medium text-slate-500">Live camera and image upload are both supported.</p>
      </div>

      {scanSuccess && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/80 backdrop-blur-md">
          <div className="mx-6 w-full max-w-xs rounded-3xl bg-white p-6 text-center shadow-2xl border border-emerald-200">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 ring-4 ring-emerald-200/50">
              <CheckCircle2 size={36} strokeWidth={2.5} />
            </div>
            <p className="text-xl font-black text-slate-900">Scanned successfully</p>
            <p className="mt-2 text-sm text-slate-500">Closing camera…</p>
          </div>
        </div>
      )}
    </div>
  );
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
  const [sessionReviews, setSessionReviews] = React.useState<SessionReview[]>([]);
  const [materials, setMaterials] = React.useState<PresenterMaterial[]>([]);
  const [hasEntryAttendance, setHasEntryAttendance] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  // ── Modals / UI ────────────────────────────────────────────────────────
  const [scanModal, setScanModal] = React.useState(false);
  const [idModal, setIdModal] = React.useState(false);
  const [scanToast, setScanToast] = React.useState<string | null>(null);
  const [pwResetSent, setPwResetSent] = React.useState(false);

  // ── Upload ─────────────────────────────────────────────────────────────
  const [uploadingFile, setUploadingFile] = React.useState(false);
  const [uploadRoomId, setUploadRoomId] = React.useState<string>('');
  const uploadInputRef = React.useRef<HTMLInputElement>(null);

  // ── Stats ──────────────────────────────────────────────────────────────
  const avgRating = sessionReviews.length > 0
    ? (sessionReviews.reduce((s, r) => s + r.rating, 0) / sessionReviews.length).toFixed(1)
    : '—';
  const totalReach = assignedRooms.reduce((s, r) => s + (r.capacity || 0), 0);
  const materialStatus = materials.some((m) => m.status === 'approved') ? 'APPROVED'
    : materials.length > 0 ? 'PENDING' : 'NONE';

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

        // Reviews for assigned rooms
        let reviews: SessionReview[] = [];
        if (rooms.length > 0) {
          const roomIds = rooms.map((r) => r.id);
          // Firestore `in` query supports up to 30 items
          const chunks = [];
          for (let i = 0; i < roomIds.length; i += 30) chunks.push(roomIds.slice(i, i + 30));
          for (const chunk of chunks) {
            const revSnap = await getDocs(query(collection(db, 'reviews'), where('roomId', 'in', chunk)));
            revSnap.docs.forEach((d) => reviews.push({ id: d.id, ...(d.data() as Omit<SessionReview, 'id'>) }));
          }
        }
        if (!cancelled) setSessionReviews(reviews);

        // Own uploaded materials
        const matsSnap = await getDocs(
          query(collection(db, 'presenterMaterials'), where('uid', '==', user.uid), orderBy('createdAt', 'desc'))
        );
        if (!cancelled) setMaterials(matsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PresenterMaterial, 'id'>) })));

        // Entry attendance
        const entryDoc = await getDoc(doc(db, 'attendance', `${user.uid}_entrance`));
        if (!cancelled) setHasEntryAttendance(entryDoc.exists());
      } catch (err) { console.error('SpeakerDashboard load', err); }
      finally { if (!cancelled) setLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [fullName, user.uid]);

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
      const room = roomId ? assignedRooms.find((r) => r.id === roomId) : undefined;
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
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr><td colSpan={4} className="px-6 py-10 text-center text-slate-400 text-sm">No assigned sessions yet. The admin will assign you to a session.</td></tr>
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
          <div className="flex items-center gap-2 text-emerald-600 mb-1">
            <CheckCircle2 size={14} />
            <span className="text-xs font-bold uppercase tracking-wider">Admin Approved</span>
          </div>
          <h3 className="text-lg font-bold">Booth Content Upload</h3>
          <p className="text-sm text-slate-500 mt-0.5">Your booth design was approved. Upload final digital assets.</p>
        </div>

        {/* Drop zone */}
        <label className={`flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors group ${uploadingFile ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-blue-400 hover:bg-blue-50/50'}`}>
          <input
            ref={uploadInputRef}
            type="file"
            className="hidden"
            accept="image/*,video/*,.pdf"
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
        </label>

        {/* Link to room */}
        {assignedRooms.length > 0 && (
          <div className="mt-3">
            <label className="text-xs text-slate-500 font-medium mb-1 block">Link to session (optional)</label>
            <select value={uploadRoomId} onChange={(e) => setUploadRoomId(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">No specific session</option>
              {assignedRooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
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

      {/* Material Management */}
      <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h3 className="text-lg font-bold mb-4">Material Management</h3>
        {materials.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">No materials uploaded yet.</p>
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
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Staff Portal</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-5">
          <SideNavItem tab="dashboard" icon={<LayoutDashboard size={18} />} label="Dashboard" />
          <SideNavItem tab="sessions" icon={<CalendarDays size={18} />} label="Assigned Sessions" />
          <SideNavItem tab="materials" icon={<Package size={18} />} label="Materials Management" />
          <SideNavItem tab="reviews" icon={<Star size={18} />} label="Attendee Reviews" />
          <SideNavItem tab="uploads" icon={<Upload size={18} />} label="Booth Uploads" />
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
                <h2 className="text-2xl font-black tracking-tight sm:text-3xl mb-1">Presenter &amp; Tech Booth Hub</h2>
                <p className="text-sm text-slate-500 sm:text-base">Manage your event presence, upload technical specifications, and track session engagement.</p>
              </div>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <button type="button" className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors">
                  <HelpCircle size={16} /> Support
                </button>
                <button type="button" onClick={() => setActiveTab('uploads')}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium shadow-lg shadow-blue-200 hover:bg-blue-700 transition-colors">
                  <Plus size={16} /> New Upload
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
                              <Stars rating={rev.rating} />
                              <span className="text-xs text-slate-400 font-medium">{relativeTime(rev.submittedAt)}</span>
                            </div>
                            <span className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-bold uppercase">{rev.roomName?.slice(0, 16) || 'Session'}</span>
                          </div>
                          {rev.comment && <p className="text-sm italic text-slate-600 leading-relaxed">"{rev.comment}"</p>}
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
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-black">Materials Management</h2>
                <p className="text-slate-500 text-sm mt-1">All files you have uploaded for your sessions</p>
              </div>
              <label className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-200 transition-colors hover:bg-blue-700 sm:w-auto">
                <input type="file" className="hidden" accept="image/*,video/*,.pdf"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) { handleFileUpload(f); e.target.value = ''; } }} />
                <Upload size={16} /> Upload File
              </label>
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
                {sessionReviews.map((rev) => (
                  <div key={rev.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
                    <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-black">A</div>
                        <div>
                          <p className="text-sm font-bold text-slate-700">Attendee</p>
                          <p className="text-[11px] text-slate-400">{relativeTime(rev.submittedAt)}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Stars rating={rev.rating} />
                        <span className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-bold uppercase">{rev.roomName?.slice(0, 20) || 'Session'}</span>
                      </div>
                    </div>
                    {rev.comment && <p className="text-sm italic text-slate-600 bg-slate-50 rounded-xl p-3">"{rev.comment}"</p>}
                  </div>
                ))}
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
                  {assignedRooms.length > 0 && (
                    <div className="mt-4">
                      <label className="text-sm text-slate-500 font-medium mb-1 block">Link to session</label>
                      <select value={uploadRoomId} onChange={(e) => setUploadRoomId(e.target.value)}
                        className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                        <option value="">No specific session</option>
                        {assignedRooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
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
      {scanModal && <QrScanModal onClose={() => setScanModal(false)} onResult={handleScanResult} />}

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
    </div>
  );
}
