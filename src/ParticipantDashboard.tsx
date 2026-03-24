import React from 'react';
import {
  Home,
  CalendarDays,
  Store,
  BookOpen,
  User,
  Bell,
  QrCode,
  Award,
  FileText,
  MessageSquare,
  MessageCircle,
  Zap,
  Bookmark,
  Users,
  Clock,
  Star,
  X,
  Download,
  Edit2,
  ChevronRight,
  Loader2,
  CheckCircle2,
  Mail,
  Utensils,
  CreditCard,
  ExternalLink,
  Rocket,
  Menu,
  ChevronDown,
  ArrowLeft,
  ImageUp,
  Camera,
  RefreshCw,
  Trophy,
  Cpu,
  MapPin,
} from 'lucide-react';
import { User as FirebaseUser, sendPasswordResetEmail } from 'firebase/auth';
import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  setDoc,
  doc,
  deleteDoc,
  query,
  where,
  Timestamp,
  updateDoc,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { QrScanModal } from './QrScanModal';
import { jsPDF } from 'jspdf';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type Tab = 'home' | 'schedule' | 'exhibitors' | 'materials' | 'profile' | 'meals';

type Room = {
  id: string;
  name: string;
  capacity: number;
  description: string;
  timeline: string;
  sessionDate: string;
  materials: string;
  venue?: string;
  presenterNames: string[];
  presenterTitles?: string[];
  backgroundImage?: string;
  projectDetail?: string;
  certificateProcessSteps?: string;
};

type MealWindow = {
  id: string;
  type: string;
  itemType?: 'food' | 'kit' | 'both';
  name?: string;
  location?: string;
  assignedBoothUid?: string;
  eligibleSectors?: string[];
  eligibleParticipantIds?: string[];
  sessionDate: string;
  startTime: string;
  endTime: string;
};

type FoodClaim = {
  id: string;
  mealId: string;
  claimedAt: any;
};

type Reservation = {
  id: string;
  roomId: string;
  roomName: string;
  attended: boolean;
  reviewSubmitted: boolean;
  reservedAt: any;
};

type DOSTSpeakerRatings = {
  achievementOfObjectives: number;
  mastery: { exhibitKnowledge: number; answerQuestions: number; currentDevelopments: number; balanceTheoryPractice: number };
  presentation: { preparedness: number; organizeMaterials: number; arouseInterest: number; instructionalMaterials: number };
  personality: { rapport: number; considerateness: number };
  acceptability: number;
};

type Review = {
  id: string;
  roomId: string;
  rating?: number;
  comment?: string;
  part1?: { levelOfContent: string; appropriateness: string; applicability: string };
  part2?: Array<{ speakerName: string; ratings: DOSTSpeakerRatings }>;
  part3?: { venue: number; food: number; organizerResponse: number; description?: string };
  part4?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const MEAL_LABELS: Record<string, string> = {
  breakfast: '🌅 Breakfast',
  snacks: '🍪 Snacks (AM)',
  lunch: '🍱 Lunch',
  snacks_pm: '🥤 Snacks (PM)',
  dinner: '🍽️ Dinner',
  kit: 'Kit',
};

const SECTOR_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-purple-100 text-purple-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
];

const CARD_GRADIENTS = [
  'from-blue-700 via-blue-800 to-cyan-900',
  'from-emerald-600 via-teal-700 to-slate-900',
  'from-orange-500 via-red-600 to-rose-900',
  'from-purple-600 via-violet-700 to-indigo-900',
  'from-cyan-600 via-blue-700 to-slate-900',
  'from-amber-500 via-orange-600 to-red-800',
];

const TRACK_BADGES = [
  { label: 'AI Track', cls: 'text-blue-600 bg-blue-100' },
  { label: 'Smart Cities', cls: 'text-purple-600 bg-purple-100' },
  { label: 'Green Tech', cls: 'text-emerald-600 bg-emerald-100' },
  { label: 'BioTech', cls: 'text-orange-500 bg-orange-100' },
  { label: 'Innovation', cls: 'text-rose-600 bg-rose-100' },
  { label: 'Research', cls: 'text-cyan-600 bg-cyan-100' },
];

/** Format room date + timeline as "March 23 7-8 am" */
function formatSessionDateTime(room: { sessionDate?: string; timeline?: string }): string {
  const parts: string[] = [];
  if (room.sessionDate) {
    const d = new Date(room.sessionDate);
    parts.push(d.toLocaleDateString('en-PH', { month: 'long', day: 'numeric' }));
  }
  if (room.timeline) {
    const short = room.timeline
      .replace(/0?(\d{1,2}):00\s*(AM|PM)/gi, '$1 $2')
      .replace(/\s*[–-]\s*/g, ' - ')
      .trim();
    parts.push(short.toLowerCase());
  }
  return parts.join(' ') || '—';
}

function getDefaultDOSTSpeakerRatings(): DOSTSpeakerRatings {
  return {
    achievementOfObjectives: 5,
    mastery: { exhibitKnowledge: 5, answerQuestions: 5, currentDevelopments: 5, balanceTheoryPractice: 5 },
    presentation: { preparedness: 5, organizeMaterials: 5, arouseInterest: 5, instructionalMaterials: 5 },
    personality: { rapport: 5, considerateness: 5 },
    acceptability: 5,
  };
}

function DOSTScale15({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const labels = ['1', '2', '3', '4', '5'];
  return (
    <div className="flex gap-1 flex-wrap">
      {[5, 4, 3, 2, 1].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} className={`w-8 h-8 rounded-lg text-sm font-bold transition-colors ${value === n ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{n}</button>
      ))}
    </div>
  );
}

function DOSTPart1Scale({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const opts = [{ v: 'low', l: 'Low' }, { v: 'satisfactory', l: 'Satisfactory' }, { v: 'very_good', l: 'Very Good' }];
  return (
    <div className="flex gap-2 flex-wrap">
      {opts.map((o) => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${value === o.v ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{o.l}</button>
      ))}
    </div>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} className={`text-2xl transition-colors ${n <= value ? 'text-amber-400' : 'text-gray-200'}`}>★</button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Desktop sidebar nav item
// ─────────────────────────────────────────────────────────────────────────────
function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${active ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'}`}>
      {icon}<span>{label}</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
type ParticipantDashboardProps = {
  user: FirebaseUser;
  registration: any;
  onSignOut: () => Promise<void>;
};

export function ParticipantDashboard({ user, registration, onSignOut }: ParticipantDashboardProps) {
  // ── Navigation ─────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = React.useState<Tab>('home');

  // ── Data ───────────────────────────────────────────────────────────────────
  const [rooms, setRooms] = React.useState<Room[]>([]);
  const [meals, setMeals] = React.useState<MealWindow[]>([]);
  const [foodClaims, setFoodClaims] = React.useState<FoodClaim[]>([]);
  const [reservations, setReservations] = React.useState<Record<string, Reservation>>({});
  const [reviews, setReviews] = React.useState<Record<string, Review>>({});
  const [boothRegs, setBoothRegs] = React.useState<any[]>([]);
  const [presenterMaterials, setPresenterMaterials] = React.useState<{ id: string; roomId?: string; roomName?: string; fileName: string; downloadUrl: string; fileType: string; fileSizeBytes: number }[]>([]);
  const [hasEntryAttendance, setHasEntryAttendance] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  // ── Modals ─────────────────────────────────────────────────────────────────
  const [scanModal, setScanModal] = React.useState(false);
  const [scanModalRoom, setScanModalRoom] = React.useState<Room | null>(null);
  const [idModal, setIdModal] = React.useState(false);
  const [reviewModal, setReviewModal] = React.useState<{ roomId: string; roomName: string; presenterNames: string[]; fromRoom?: Room } | null>(null);
  const [certModal, setCertModal] = React.useState(false);
  const [detailRoom, setDetailRoom] = React.useState<Room | null>(null);
  const [exhibitorDetailBooth, setExhibitorDetailBooth] = React.useState<any | null>(null);
  const [exhibitorMaterials, setExhibitorMaterials] = React.useState<{ id: string; fileName: string; materialName?: string; downloadUrl: string; fileType: string; fileSizeBytes: number }[]>([]);
  const [roomChatMessages, setRoomChatMessages] = React.useState<{ id: string; roomId: string; uid: string; participantName: string; text: string; createdAt: any }[]>([]);
  const [roomChatInput, setRoomChatInput] = React.useState('');
  const [roomChatSending, setRoomChatSending] = React.useState(false);

  // ── Mobile filter ──────────────────────────────────────────────────────────
  const [mobileFilter, setMobileFilter] = React.useState<string>('all');

  // ── Mobile sidebar drawer ──────────────────────────────────────────────────
  const [mobileDrawerOpen, setMobileDrawerOpen] = React.useState(false);

  // ── Review form (DOST) ─────────────────────────────────────────────────────
  const [reviewSaving, setReviewSaving] = React.useState(false);
  const [dostPart1, setDostPart1] = React.useState({ levelOfContent: 'satisfactory', appropriateness: 'satisfactory', applicability: 'satisfactory' });
  const [dostPart2, setDostPart2] = React.useState<Record<string, DOSTSpeakerRatings>>({});
  const [dostPart3, setDostPart3] = React.useState({ venue: 5, food: 5, organizerResponse: 5, description: '' });
  const [dostPart4, setDostPart4] = React.useState('');


  // ── Profile edit ───────────────────────────────────────────────────────────
  const [editingTravel, setEditingTravel] = React.useState(false);
  const [travelDetails, setTravelDetails] = React.useState((registration?.travelDetails as string) || '');
  const [accommodationDetails, setAccommodationDetails] = React.useState((registration?.accommodationDetails as string) || '');
  const [travelSaving, setTravelSaving] = React.useState(false);
  const [pwResetSent, setPwResetSent] = React.useState(false);

  // ── Scan toast ─────────────────────────────────────────────────────────────
  const [scanToast, setScanToast] = React.useState<string | null>(null);

  // ── Derived ────────────────────────────────────────────────────────────────
  const firstName = (registration?.fullName as string | undefined)?.split(' ')[0] || 'Attendee';
  const fullName = (registration?.fullName as string) || user.email || 'Attendee';
  const initials = fullName.split(' ').map((p: string) => p[0]).join('').toUpperCase().slice(0, 2);
  const profilePicUrl = (registration?.profilePictureUrl as string | undefined) || null;

  const attendedRoomIds = (Object.values(reservations) as Reservation[]).filter((r) => r.attended).map((r) => r.roomId);
  const reviewedRoomIds = Object.keys(reviews);
  const certReady = attendedRoomIds.length > 0 && attendedRoomIds.some((rid) => reviewedRoomIds.includes(rid));

  const getReviewDisplayRating = (rev: Review | undefined): number => {
    if (!rev) return 0;
    if (typeof rev.rating === 'number') return rev.rating;
    if (rev.part2?.length) {
      const avg = rev.part2.reduce((s, sp) => s + sp.ratings.acceptability, 0) / rev.part2.length;
      return Math.round(avg);
    }
    return 5;
  };

  const participantSector = (registration?.sector as string) || '';
  const registrationId = registration?.id as string | undefined;
  const eligibleMeals = React.useMemo(
    () => meals.filter((m) => {
      const byPerson = m.eligibleParticipantIds && m.eligibleParticipantIds.length > 0 && registrationId && m.eligibleParticipantIds.includes(registrationId);
      const bySector = !m.eligibleSectors || m.eligibleSectors.length === 0 || m.eligibleSectors.includes(participantSector);
      return byPerson || bySector;
    }),
    [meals, participantSector, registrationId],
  );
  const hasClaimedMeal = (mealId: string) => foodClaims.some((c) => c.mealId === mealId);
  const unclaimedMealsCount = eligibleMeals.filter((m) => !hasClaimedMeal(m.id)).length;

  const digitalIdQrData = `https://www.iscene.app/verify?uid=${user.uid}&name=${encodeURIComponent(fullName)}`;
  const digitalIdQrImg = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(digitalIdQrData)}`;
  const idNumber = user.uid.slice(0, 8).toUpperCase();

  // Filter chips derived from rooms dates
  const mobileFilterOptions = React.useMemo(() => {
    const dates = [...new Set(rooms.map((r) => r.sessionDate).filter(Boolean))];
    return ['all', ...dates];
  }, [rooms]);

  const filteredRooms = React.useMemo(() =>
    mobileFilter === 'all' ? rooms : rooms.filter((r) => r.sessionDate === mobileFilter),
    [rooms, mobileFilter]);

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadAll = React.useCallback(async () => {
    setLoading(true);
    try {
      const load = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => {
        try { return await fn(); } catch (e) { console.error('loadAll query failed', e); return fallback; }
      };

      const [roomsSnap, mealsSnap, resSnap, revSnap, entryDoc, boothSnap, claimsSnap] = await Promise.all([
        load(() => getDocs(query(collection(db, 'rooms'), orderBy('createdAt', 'desc'))), { docs: [] } as { docs: any[] }),
        load(() => getDocs(query(collection(db, 'meals'), orderBy('createdAt', 'desc'))), { docs: [] } as { docs: any[] }),
        load(() => getDocs(query(collection(db, 'reservations'), where('uid', '==', user.uid))), { docs: [] } as { docs: any[] }),
        load(() => getDocs(query(collection(db, 'reviews'), where('uid', '==', user.uid))), { docs: [] } as { docs: any[] }),
        load(() => getDoc(doc(db, 'attendance', `${user.uid}_entrance`)), { exists: () => false } as any),
        load(() => getDocs(query(collection(db, 'registrations'), where('sector', 'in', ['Exhibitor (Booth)', 'Exhibitor']))), { docs: [] } as { docs: any[] }),
        load(() => getDocs(query(collection(db, 'foodClaims'), where('participantUid', '==', user.uid))), { docs: [] } as { docs: any[] }),
      ]);

      setRooms(roomsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Room, 'id'>) })));
      setMeals(mealsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MealWindow, 'id'>) })));
      setFoodClaims(claimsSnap.docs.map((d) => ({ id: d.id, mealId: (d.data() as any).mealId, claimedAt: (d.data() as any).claimedAt })));

      const resMap: Record<string, Reservation> = {};
      resSnap.docs.forEach((d) => { const data = d.data() as Omit<Reservation, 'id'>; resMap[data.roomId] = { id: d.id, ...data }; });
      setReservations(resMap);

      const revMap: Record<string, Review> = {};
      revSnap.docs.forEach((d) => { const data = d.data() as Omit<Review, 'id'>; revMap[data.roomId] = { id: d.id, ...data }; });
      setReviews(revMap);

      setHasEntryAttendance(entryDoc.exists?.() ? entryDoc.exists() : false);
      setBoothRegs(boothSnap.docs.filter((d) => d.data().status === 'approved').map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error('loadAll', err); }
    finally { setLoading(false); }
  }, [user.uid]);

  React.useEffect(() => { loadAll(); }, [loadAll]);

  React.useEffect(() => {
    const ids = Object.keys(reservations).slice(0, 30);
    if (ids.length === 0) {
      setPresenterMaterials([]);
      return;
    }
    getDocs(query(collection(db, 'presenterMaterials'), where('roomId', 'in', ids)))
      .then((snap) => setPresenterMaterials(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))))
      .catch(() => setPresenterMaterials([]));
  }, [reservations]);

  // Real-time updates for meals and food claims (notification when new data arrives)
  React.useEffect(() => {
    const unsubMeals = onSnapshot(query(collection(db, 'meals'), orderBy('createdAt', 'desc')), (snap) => {
      setMeals(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MealWindow, 'id'>) })));
    });
    const unsubClaims = onSnapshot(query(collection(db, 'foodClaims'), where('participantUid', '==', user.uid)), (snap) => {
      setFoodClaims(snap.docs.map((d) => ({ id: d.id, mealId: (d.data() as any).mealId, claimedAt: (d.data() as any).claimedAt })));
    });
    const unsubBooths = onSnapshot(query(collection(db, 'registrations'), where('sector', 'in', ['Exhibitor (Booth)', 'Exhibitor'])), (snap) => {
      setBoothRegs(snap.docs.filter((d) => d.data().status === 'approved').map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubMeals(); unsubClaims(); unsubBooths(); };
  }, [user.uid]);

  React.useEffect(() => {
    if (reviewModal) {
      const names = reviewModal.presenterNames?.length ? reviewModal.presenterNames : ['Speaker'];
      const init: Record<string, DOSTSpeakerRatings> = {};
      names.forEach((n) => { init[n] = getDefaultDOSTSpeakerRatings(); });
      setDostPart2(init);
      setDostPart1({ levelOfContent: 'satisfactory', appropriateness: 'satisfactory', applicability: 'satisfactory' });
      setDostPart3({ venue: 5, food: 5, organizerResponse: 5, description: '' });
      setDostPart4('');
    }
  }, [reviewModal?.roomId]);

  React.useEffect(() => {
    if (!detailRoom?.id) {
      setRoomChatMessages([]);
      return;
    }
    const q = query(collection(db, 'roomChat'), where('roomId', '==', detailRoom.id), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setRoomChatMessages(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    });
    return () => unsub();
  }, [detailRoom?.id]);

  React.useEffect(() => {
    if (!exhibitorDetailBooth?.uid) {
      setExhibitorMaterials([]);
      return;
    }
    getDocs(query(collection(db, 'presenterMaterials'), where('uid', '==', exhibitorDetailBooth.uid), orderBy('createdAt', 'desc')))
      .then((snap) => setExhibitorMaterials(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))))
      .catch(() => setExhibitorMaterials([]));
  }, [exhibitorDetailBooth?.uid]);

  // ── Parse QR content (robust: handles URL, query string, or plain text) ───
  const parseQrContent = (raw: string): { type: string | null; id: string | null } => {
    const trimmed = (raw || '').trim();
    if (!trimmed) return { type: null, id: null };

    // Plain text: "entrance" or "main entrance" = entrance
    const lower = trimmed.toLowerCase();
    if (lower === 'entrance' || lower === 'main' || lower === 'mainentrance' || lower.includes('main entrance')) {
      return { type: 'entrance', id: null };
    }

    // Try full URL or URL-like string
    try {
      let urlStr = trimmed;
      if (!trimmed.startsWith('http')) {
        urlStr = trimmed.startsWith('?') ? `https://iscene.app/scan${trimmed}` : `https://iscene.app/scan?${trimmed}`;
      }
      const url = new URL(urlStr);
      const type = url.searchParams.get('type') || url.searchParams.get('Type');
      const id = url.searchParams.get('id') || url.searchParams.get('roomId');
      return { type: type || null, id: id || null };
    } catch {}

    // Fallback: regex for type=X&id=Y or type=X
    const typeMatch = trimmed.match(/[?&]type=([^&\s#]+)/i) || trimmed.match(/\btype[=:]\s*([^\s&,#]+)/i);
    const idMatch = trimmed.match(/[?&]id=([^&\s#]+)/i) || trimmed.match(/[?&]roomId=([^&\s#]+)/i);
    return {
      type: typeMatch ? typeMatch[1].trim() : null,
      id: idMatch ? idMatch[1].trim() : null,
    };
  };

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleScanResult = async (text: string) => {
    try {
      const { type, id } = parseQrContent(text);

      if (type === 'entrance') {
        const docRef = doc(db, 'attendance', `${user.uid}_entrance`);
        await setDoc(docRef, {
          uid: user.uid,
          name: fullName,
          type: 'entrance',
          scannedAt: Timestamp.now(),
        }, { merge: true });
        setHasEntryAttendance(true);
        setScanToast('✅ Entrance check-in successful!');
        setScanModal(false);
      } else if (type === 'room' && id) {
        const resId = `${user.uid}_${id}`;
        const resDocRef = doc(db, 'reservations', resId);
        const existing = await getDoc(resDocRef);
        const room = rooms.find((r) => r.id === id);
        const alreadyAttended = existing.exists() && (existing.data() as { attended?: boolean })?.attended;
        if (alreadyAttended) {
          setScanToast('✅ Already timed in.');
          setScanModal(false);
        } else if (existing.exists()) {
          await updateDoc(resDocRef, { attended: true, attendedAt: Timestamp.now() });
          setReservations((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), attended: true } }));
          setScanToast('✅ Time in recorded!');
          setScanModal(false);
        } else {
          await setDoc(resDocRef, { uid: user.uid, roomId: id, roomName: room?.name || id, attended: true, reviewSubmitted: false, reservedAt: Timestamp.now(), attendedAt: Timestamp.now() }, { merge: true });
          setReservations((prev) => ({ ...prev, [id]: { id: resId, roomId: id, roomName: room?.name || id, attended: true, reviewSubmitted: false, reservedAt: Timestamp.now() } }));
          setScanToast('✅ Time in recorded!');
          setScanModal(false);
        }
      } else {
        setScanToast('❌ Unrecognized QR code. Use main entrance or room QR.');
      }
    } catch (err) {
      console.error('Scan error:', err);
      setScanToast('❌ Could not process scan. Try again.');
    }
    setTimeout(() => setScanToast(null), 4000);
  };

  const handleReserve = async (room: Room) => {
    const resId = `${user.uid}_${room.id}`;
    await setDoc(doc(db, 'reservations', resId), { uid: user.uid, roomId: room.id, roomName: room.name, attended: false, reviewSubmitted: false, reservedAt: Timestamp.now() });
    setReservations((prev) => ({ ...prev, [room.id]: { id: resId, roomId: room.id, roomName: room.name, attended: false, reviewSubmitted: false, reservedAt: Timestamp.now() } }));
  };

  const handleCancelReservation = async (room: Room) => {
    const resId = `${user.uid}_${room.id}`;
    await deleteDoc(doc(db, 'reservations', resId));
    setReservations((prev) => {
      const next = { ...prev };
      delete next[room.id];
      return next;
    });
  };

  const handleDownloadCertificate = async () => {
    try {
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const w = pdf.internal.pageSize.getWidth();
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = '/iscene.png';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load logo'));
        if (img.complete) resolve();
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const dataUrl = canvas.toDataURL('image/png');
      pdf.addImage(dataUrl, 'PNG', (w - 40) / 2, 18, 40, 40);
      pdf.setFontSize(24);
      pdf.setFont('helvetica', 'bold');
      pdf.text('iSCENE 2026', w / 2, 72, { align: 'center' });
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'normal');
      pdf.text('International Smart & Sustainable Cities Expo', w / 2, 80, { align: 'center' });
      pdf.setFontSize(18);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Certificate of Participation', w / 2, 100, { align: 'center' });
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'normal');
      pdf.text('This certifies that', w / 2, 120, { align: 'center' });
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.text(fullName, w / 2, 132, { align: 'center' });
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'normal');
      pdf.text('has participated in the iSCENE 2026 Global Summit.', w / 2, 142, { align: 'center' });
      pdf.setFontSize(10);
      pdf.text(new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }), w / 2, 155, { align: 'center' });
      pdf.save(`iSCENE2026_Certificate_${fullName.replace(/\s+/g, '_')}.pdf`);
    } catch (err) {
      console.error('Certificate generation failed:', err);
    }
  };

  const handleSubmitReview = async () => {
    if (!reviewModal) return;
    setReviewSaving(true);
    try {
      const part2Arr = Object.entries(dostPart2).map(([speakerName, ratings]) => ({ speakerName, ratings }));
      const payload = {
        uid: user.uid,
        participantName: fullName,
        roomId: reviewModal.roomId,
        roomName: reviewModal.roomName,
        part1: dostPart1,
        part2: part2Arr,
        part3: dostPart3,
        part4: dostPart4.trim() || undefined,
        submittedAt: Timestamp.now(),
      };
      const docRef = await addDoc(collection(db, 'reviews'), payload);
      setReviews((prev) => ({ ...prev, [reviewModal.roomId]: { id: docRef.id, roomId: reviewModal.roomId, part1: dostPart1, part2: part2Arr, part3: dostPart3, part4: dostPart4 } }));
      await updateDoc(doc(db, 'reservations', `${user.uid}_${reviewModal.roomId}`), { reviewSubmitted: true }).catch(() => {});
      setReservations((prev) => ({ ...prev, [reviewModal.roomId]: { ...prev[reviewModal.roomId], reviewSubmitted: true } }));
      setReviewModal(null);
    } finally { setReviewSaving(false); }
  };

  const handleSendRoomChat = async () => {
    if (!detailRoom || !roomChatInput.trim()) return;
    setRoomChatSending(true);
    try {
      await addDoc(collection(db, 'roomChat'), {
        roomId: detailRoom.id,
        uid: user.uid,
        participantName: fullName,
        text: roomChatInput.trim(),
        createdAt: Timestamp.now(),
      });
      setRoomChatInput('');
    } finally { setRoomChatSending(false); }
  };

  const handleSaveTravel = async () => {
    if (!registration?.id) return;
    setTravelSaving(true);
    try {
      await updateDoc(doc(db, 'registrations', registration.id), { travelDetails, accommodationDetails });
      setEditingTravel(false);
    } finally { setTravelSaving(false); }
  };

  const handlePasswordReset = async () => {
    if (!user.email) return;
    await sendPasswordResetEmail(auth, user.email);
    setPwResetSent(true);
    setTimeout(() => setPwResetSent(false), 5000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-600" size={36} />
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SHARED: Profile content (used by both layouts)
  // ──────────────────────────────────────────────────────────────────────────
  const ProfileContent = () => (
    <div className="space-y-4">
      {/* Avatar card */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
        {profilePicUrl
          ? <img src={profilePicUrl} alt={fullName} className="w-14 h-14 rounded-full object-cover shrink-0 ring-2 ring-blue-100" />
          : <div className="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center text-white text-xl font-black shrink-0">{initials}</div>}
        <div className="flex-1 min-w-0">
          <p className="font-black text-base truncate">{fullName}</p>
          <p className="text-sm text-slate-500 truncate">{user.email}</p>
          <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full mt-1 inline-block">✓ Approved</span>
        </div>
        <button type="button" onClick={() => setIdModal(true)} className="shrink-0 flex flex-col items-center gap-1 text-blue-600 hover:text-blue-700">
          <CreditCard size={20} /><span className="text-[10px] font-bold">My ID</span>
        </button>
      </div>

      {/* Registration details */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-3">Registration Info</p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {[
            { label: 'Sector', value: registration?.sector },
            { label: 'Organization', value: registration?.sectorOffice },
            { label: 'Position', value: registration?.positionTitle },
            { label: 'Contact', value: registration?.contactNumber },
            { label: 'Payment', value: registration?.paymentStatus || 'N/A' },
            { label: 'Status', value: registration?.status || 'pending' },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-[11px] text-slate-400 mb-0.5">{label}</p>
              <p className="font-semibold text-slate-800 text-xs truncate">{value || '—'}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Travel */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Travel &amp; Accommodation</p>
          <button type="button" onClick={() => setEditingTravel(!editingTravel)} className="text-blue-600 text-xs font-bold flex items-center gap-1">
            <Edit2 size={11} /> {editingTravel ? 'Cancel' : 'Edit'}
          </button>
        </div>
        {editingTravel ? (
          <div className="space-y-3">
            <textarea value={travelDetails} onChange={(e) => setTravelDetails(e.target.value)} rows={2} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm resize-none outline-none focus:ring-2 focus:ring-blue-500" placeholder="Travel details…" />
            <textarea value={accommodationDetails} onChange={(e) => setAccommodationDetails(e.target.value)} rows={2} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm resize-none outline-none focus:ring-2 focus:ring-blue-500" placeholder="Accommodation details…" />
            <button type="button" onClick={handleSaveTravel} disabled={travelSaving} className="px-5 py-2 bg-blue-600 text-white font-bold rounded-xl text-sm hover:bg-blue-700 disabled:opacity-50">
              {travelSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <div><p className="text-[11px] text-slate-400">Travel</p><p className="text-slate-700">{travelDetails || 'Not provided'}</p></div>
            <div><p className="text-[11px] text-slate-400">Accommodation</p><p className="text-slate-700">{accommodationDetails || 'Not provided'}</p></div>
          </div>
        )}
      </div>

      {/* Account */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2">Account</p>
        <button type="button" onClick={handlePasswordReset} disabled={pwResetSent} className="w-full flex items-center justify-between py-2.5 text-sm text-slate-600 hover:text-slate-900 disabled:text-emerald-600">
          <span className="flex items-center gap-2"><Mail size={15} />{pwResetSent ? 'Reset email sent!' : 'Change Password'}</span>
          {!pwResetSent && <ChevronRight size={15} className="text-slate-300" />}
        </button>
        <div className="border-t border-slate-100" />
        <button type="button" onClick={onSignOut} className="w-full py-2.5 text-sm font-semibold text-red-500 hover:text-red-600 text-left">Sign out</button>
      </div>
    </div>
  );

  // ──────────────────────────────────────────────────────────────────────────
  // SHARED: Session card component
  // ──────────────────────────────────────────────────────────────────────────
  const DesktopSessionCard = ({ room, idx }: { room: Room; idx: number }) => {
    const res = reservations[room.id];
    const rev = reviews[room.id];
    const grad = CARD_GRADIENTS[idx % CARD_GRADIENTS.length];
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => setDetailRoom(room)}
        onKeyDown={(e) => e.key === 'Enter' && setDetailRoom(room)}
        className="bg-white rounded-2xl border border-slate-100 shadow-sm flex overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
      >
        <div
          className={`w-24 min-h-[100px] shrink-0 ${!room.backgroundImage ? `bg-gradient-to-br ${grad}` : ''}`}
          style={room.backgroundImage ? { backgroundImage: `url(${room.backgroundImage})`, backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', backgroundColor: '#f1f5f9' } : undefined}
        />
        <div className="flex-1 min-w-0 flex items-start justify-between gap-4 p-4">
          <div className="min-w-0">
            <p className="text-[11px] text-slate-500 mb-0.5">{formatSessionDateTime(room)}</p>
            <p className="text-sm font-bold leading-snug text-slate-800">{room.name}</p>
            {room.description && <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{room.description}</p>}
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button type="button" className={`transition-colors ${res ? 'text-blue-500' : 'text-slate-300 hover:text-blue-500'}`} onClick={() => !res && handleReserve(room)} title={res ? 'Reserved' : 'Reserve slot'}>
            <Bookmark size={16} fill={res ? 'currentColor' : 'none'} />
          </button>
          {res?.attended && !rev && (
            <button type="button" onClick={() => setReviewModal({ roomId: room.id, roomName: room.name, presenterNames: room.presenterNames || [] })} className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full hover:bg-amber-100">Review</button>
          )}
          {rev && <span className="text-amber-400 text-xs">{'★'.repeat(getReviewDisplayRating(rev))}</span>}
          <ChevronRight size={18} className="text-slate-300 mt-1" />
          </div>
        </div>
      </div>
    );
  };

  // ══════════════════════════════════════════════════════════════════════════
  //  MOBILE LAYOUT  (shown on < md)
  // ══════════════════════════════════════════════════════════════════════════
  const MobileLayout = (
    <div className="md:hidden flex flex-col min-h-screen max-w-md mx-auto border-x border-slate-200 shadow-xl bg-slate-50 relative">
      {/* Mobile header */}
      <header className="sticky top-0 z-20 flex items-center justify-between bg-white/90 backdrop-blur-md p-4 border-b border-slate-200">
        <button type="button" onClick={() => setMobileDrawerOpen(true)} className="w-10 h-10 flex items-center justify-center rounded-full bg-blue-50 text-blue-600">
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-2">
          <img src="/iscene.png" alt="iSCENE" className="w-8 h-8 rounded-full object-contain bg-white p-0.5 shadow-sm" />
          <div className="flex flex-col">
            <h1 className="text-base font-black leading-tight tracking-tight text-blue-600">iSCENE 2026</h1>
            <p className="text-[9px] uppercase tracking-widest font-bold opacity-60">Global Summit</p>
          </div>
        </div>
        <button type="button" className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 text-slate-700">
          <Bell size={18} />
        </button>
      </header>

      {/* Scan toast */}
      {scanToast && (
        <div className={`mx-4 mt-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-center ${scanToast.startsWith('✅') ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
          {scanToast}
        </div>
      )}

      {/* Mobile main content */}
      <main className="flex-1 pb-28 overflow-y-auto">

        {/* ── HOME tab ─────────────────────────────────────── */}
        {activeTab === 'home' && (
          <>
            <div className="px-4 pt-5 pb-2">
              <h2 className="text-xl font-black tracking-tight">Welcome, {firstName}!</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {hasEntryAttendance ? "You're checked in · Enjoy the event!" : "Scan the entrance QR when you arrive."}
              </p>
            </div>

            {/* Status row */}
            <div className="flex gap-2 px-4 py-3 overflow-x-auto no-scrollbar">
              {[
                { label: 'Registered', done: true },
                { label: 'Approved', done: true },
                { label: 'Checked In', done: hasEntryAttendance },
                { label: 'Certificate', done: certReady },
              ].map(({ label, done }) => (
                <div key={label} className={`shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                  {done ? <CheckCircle2 size={12} /> : <Clock size={12} />}{label}
                </div>
              ))}
            </div>

            {/* Quick actions */}
            <div className="px-4 pb-4">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1"><Zap size={12} /> Quick Actions</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { icon: <QrCode size={20} className="text-blue-600" />, label: 'Scan QR', bg: 'bg-blue-50', action: () => setScanModal(true) },
                  { icon: <Award size={20} className={certReady ? 'text-amber-500' : 'text-purple-600'} />, label: 'Certificate', bg: certReady ? 'bg-amber-50' : 'bg-purple-50', action: () => setCertModal(true) },
                  { icon: <CreditCard size={20} className="text-indigo-600" />, label: 'My ID', bg: 'bg-indigo-50', action: () => setIdModal(true) },
                  { icon: <CalendarDays size={20} className="text-emerald-600" />, label: 'Schedule', bg: 'bg-emerald-50', action: () => setActiveTab('schedule') },
                  { icon: <Utensils size={20} className="text-orange-500" />, label: 'Meals', bg: 'bg-orange-50', action: () => setActiveTab('meals') },
                  { icon: <MessageSquare size={20} className="text-rose-500" />, label: 'Reviews', bg: 'bg-rose-50', action: () => setActiveTab('schedule') },
                ].map(({ icon, label, bg, action }) => (
                  <button key={label} type="button" onClick={action} className="bg-white rounded-2xl p-3 flex flex-col items-center gap-2 shadow-sm border border-slate-100 hover:shadow-md active:scale-95 transition-all">
                    <div className={`w-10 h-10 ${bg} rounded-full flex items-center justify-center`}>{icon}</div>
                    <span className="text-[11px] font-medium text-slate-600">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Upcoming sessions preview - capped height, scrollable */}
            {rooms.length > 0 && (
              <div className="px-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold text-slate-800">Upcoming Sessions</p>
                  <button type="button" onClick={() => setActiveTab('schedule')} className="text-xs font-semibold text-blue-600">View all →</button>
                </div>
                <div className="max-h-[280px] overflow-y-auto">
                {rooms.map((room, i) => (
                  <div
                    key={room.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setDetailRoom(room)}
                    onKeyDown={(e) => e.key === 'Enter' && setDetailRoom(room)}
                    className="mb-3 rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:shadow-md active:scale-[0.99] transition-all cursor-pointer flex"
                  >
                    <div
                      className={`w-20 min-h-[80px] shrink-0 ${!room.backgroundImage ? `bg-gradient-to-br ${CARD_GRADIENTS[i % CARD_GRADIENTS.length]}` : ''}`}
                      style={room.backgroundImage ? { backgroundImage: `url(${room.backgroundImage})`, backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', backgroundColor: '#f1f5f9' } : undefined}
                    />
                    <div className="flex-1 min-w-0 flex items-start justify-between gap-2 p-4">
                      <div className="min-w-0">
                        <p className="text-[11px] text-slate-500 mb-0.5">{formatSessionDateTime(room)}</p>
                        <p className="text-sm font-bold text-slate-800 truncate">{room.name}</p>
                        {room.description && <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{room.description}</p>}
                      </div>
                      <ChevronRight size={16} className="text-slate-300 shrink-0 mt-1" />
                    </div>
                  </div>
                ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── SCHEDULE / SHOWCASE tab ───────────────────────── */}
        {activeTab === 'schedule' && (
          <>
            <div className="px-4 pt-5 pb-2">
              <h2 className="text-2xl font-black tracking-tight">Break out room</h2>
              <p className="text-sm text-slate-500 mt-1">Discover breakout sessions and reserve your slot.</p>
            </div>

            {/* Filter chips */}
            <div className="flex gap-2 overflow-x-auto px-4 py-3 no-scrollbar">
              {mobileFilterOptions.map((f) => (
                <button key={f} type="button" onClick={() => setMobileFilter(f)}
                  className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${mobileFilter === f ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'bg-blue-100/70 text-blue-700 hover:bg-blue-100'}`}>
                  {f === 'all' ? 'All Tracks' : new Date(f).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                </button>
              ))}
            </div>

            {/* Session cards */}
            <div className="flex flex-col gap-5 px-4 pb-4">
              {filteredRooms.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400 text-sm shadow-sm">No sessions yet.</div>
              ) : (
                filteredRooms.map((room, i) => {
                  const res = reservations[room.id];
                  const rev = reviews[room.id];
                  const grad = CARD_GRADIENTS[i % CARD_GRADIENTS.length];
                  return (
                    <div
                      key={room.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setDetailRoom(room)}
                      onKeyDown={(e) => e.key === 'Enter' && setDetailRoom(room)}
                      className="flex overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md active:scale-[0.99] transition-all cursor-pointer"
                    >
                      <div
                        className={`w-20 min-h-[100px] shrink-0 ${!room.backgroundImage ? `bg-gradient-to-br ${grad}` : ''}`}
                        style={room.backgroundImage ? { backgroundImage: `url(${room.backgroundImage})`, backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', backgroundColor: '#f1f5f9' } : undefined}
                      />
                      <div className="flex-1 min-w-0 flex items-start justify-between gap-4 p-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] text-slate-500 mb-0.5">{formatSessionDateTime(room)}</p>
                        <p className="text-sm font-bold text-slate-800 leading-snug">{room.name}</p>
                        {room.description && <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{room.description}</p>}
                        <div className="flex items-center gap-2 mt-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                          {res?.attended && !rev && (
                            <button type="button" onClick={() => setReviewModal({ roomId: room.id, roomName: room.name, presenterNames: room.presenterNames || [] })} className="px-3 py-1.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
                              Review
                            </button>
                          )}
                          {rev && <span className="text-amber-400 text-xs font-bold">{'★'.repeat(getReviewDisplayRating(rev))}</span>}
                        </div>
                      </div>
                      <ChevronRight size={20} className="text-slate-300 shrink-0" />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}

        {/* ── MATERIALS tab ───────────────────────────────────── */}
        {activeTab === 'materials' && (
          <>
            <div className="px-4 pt-5 pb-2">
              <h2 className="text-2xl font-black tracking-tight">Session Materials</h2>
              <p className="text-sm text-slate-500 mt-1">Access materials from your reserved sessions.</p>
            </div>
            {presenterMaterials.length === 0 ? (
              <div className="mx-4 bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400 text-sm shadow-sm">
                <BookOpen size={40} className="text-slate-200 mx-auto mb-3" />
                <p>Reserve a session to access materials.</p>
                <button type="button" onClick={() => setActiveTab('schedule')} className="mt-4 px-5 py-2 bg-blue-600 text-white rounded-full text-sm font-bold">Browse Sessions</button>
              </div>
            ) : (
              <div className="px-4 flex flex-col gap-3 pb-4">
                {presenterMaterials.map((mat) => {
                  const room = mat.roomId ? rooms.find((r) => r.id === mat.roomId) : null;
                  const size = mat.fileSizeBytes ? (mat.fileSizeBytes < 1024 ? `${mat.fileSizeBytes} B` : mat.fileSizeBytes < 1024 * 1024 ? `${(mat.fileSizeBytes / 1024).toFixed(1)} KB` : `${(mat.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`) : '';
                  return (
                    <div key={mat.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0"><FileText size={20} className="text-blue-600" /></div>
                      <div className="flex-1 min-w-0"><p className="font-bold text-sm truncate">{mat.fileName}</p><p className="text-xs text-slate-400">{mat.roomName || room?.name || 'Session'} · {size}</p></div>
                      <a href={mat.downloadUrl} target="_blank" rel="noopener noreferrer" className="px-3 py-2 text-blue-600 border border-blue-200 rounded-full text-xs font-bold shrink-0"><Download size={12} /></a>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── EXHIBITORS / SPEAKERS tab ────────────────────── */}
        {activeTab === 'exhibitors' && (
          <>
            <div className="px-4 pt-5 pb-2">
              <h2 className="text-2xl font-black tracking-tight">Exhibitors</h2>
              <p className="text-sm text-slate-500 mt-1">Approved booth participants at iSCENE 2026.</p>
            </div>
            {boothRegs.length === 0 ? (
              <div className="mx-4 bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400 text-sm shadow-sm">No exhibitors yet.</div>
            ) : (
              <div className="px-4 flex flex-col gap-4 pb-4">
                {boothRegs.map((booth, i) => (
                  <button key={booth.id} type="button" onClick={() => setExhibitorDetailBooth(booth)} className="w-full text-left flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow">
                    <div className={`h-32 w-full flex items-center justify-center overflow-hidden ${booth.boothImageUrl ? '' : `bg-gradient-to-br ${CARD_GRADIENTS[i % CARD_GRADIENTS.length]}`}`}>
                      {booth.boothImageUrl ? (
                        <img src={booth.boothImageUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Store size={40} className="text-white/40" />
                      )}
                    </div>
                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-8 h-8 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-xs font-black ${!(booth.profilePictureUrl || booth.boothImageUrl) ? SECTOR_COLORS[i % SECTOR_COLORS.length] : 'bg-slate-100'}`}>
                          {(booth.profilePictureUrl || booth.boothImageUrl) ? (
                            <img src={booth.profilePictureUrl || booth.boothImageUrl} alt="" className="w-full h-full object-cover block" />
                          ) : (
                            (booth.fullName as string)?.[0] || 'B'
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-sm">{booth.fullName || '—'}</p>
                          <p className="text-[10px] text-slate-400">{booth.sector}</p>
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 line-clamp-2 mb-2">{booth.sectorOffice || 'Event booth participant'}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-400">Booth #{booth.id.slice(0, 4).toUpperCase()}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── MEALS tab ─────────────────────────────────────── */}
        {activeTab === 'meals' && (
          <>
            <div className="px-4 pt-5 pb-2">
              <h2 className="text-2xl font-black tracking-tight">My Entitlements</h2>
              <p className="text-sm text-slate-500 mt-1">Food, kits, and giveaways — claim at the assigned stall.</p>
            </div>
            <div className="px-4 flex flex-col gap-3 pb-4">
              {eligibleMeals.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400 text-sm shadow-sm">No entitlements available for you.</div>
              ) : eligibleMeals.map((meal) => {
                const isToday = meal.sessionDate ? new Date(meal.sessionDate).toDateString() === new Date().toDateString() : false;
                const claimed = hasClaimedMeal(meal.id);
                return (
                  <div key={meal.id} className={`rounded-2xl border shadow-sm p-4 ${claimed ? 'bg-emerald-50 border-emerald-200' : isToday ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-100'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <p className="font-bold">{meal.name || MEAL_LABELS[meal.type] || meal.type}</p>
                        {meal.itemType && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${meal.itemType === 'kit' ? 'bg-violet-100 text-violet-700' : meal.itemType === 'both' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>{meal.itemType === 'kit' ? 'Kit' : meal.itemType === 'both' ? 'Food & Kit' : 'Food'}</span>}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {isToday && !claimed && <span className="text-[10px] font-black bg-amber-500 text-white px-2 py-0.5 rounded-full">TODAY</span>}
                        {claimed && <span className="text-[10px] font-black bg-emerald-500 text-white px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle2 size={10} /> Claimed</span>}
                      </div>
                    </div>
                    <p className="text-xs text-slate-500">{meal.sessionDate ? new Date(meal.sessionDate).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' }) : '—'}</p>
                    {meal.startTime && meal.endTime && <p className="text-xs font-semibold text-blue-600 mt-0.5 flex items-center gap-1"><Clock size={11} /> {meal.startTime} – {meal.endTime}</p>}
                    {meal.location && <p className="text-xs text-slate-500 mt-0.5">📍 {meal.location}</p>}
                  </div>
                );
              })}

              {/* Certificate card */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mt-2">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${certReady ? 'bg-amber-100' : 'bg-slate-100'}`}>
                    <Award size={20} className={certReady ? 'text-amber-500' : 'text-slate-400'} />
                  </div>
                  <div>
                    <p className="font-bold text-sm">Certificate</p>
                    <p className="text-xs text-slate-500">{certReady ? 'Ready to download!' : 'Complete requirements'}</p>
                  </div>
                </div>
                {certReady
                  ? <button type="button" onClick={handleDownloadCertificate} className="w-full py-2.5 bg-amber-500 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2"><Download size={14} /> Download Certificate</button>
                  : <div className="space-y-1.5 text-xs text-slate-400">
                      {[{ l: 'Attend a session', d: attendedRoomIds.length > 0 }, { l: 'Submit a review', d: reviewedRoomIds.length > 0 }].map(({ l, d }) => (
                        <div key={l} className="flex items-center gap-2">{d ? <CheckCircle2 size={12} className="text-emerald-500" /> : <Clock size={12} />}<span className={d ? 'text-slate-600' : ''}>{l}</span></div>
                      ))}
                    </div>}
              </div>
            </div>
          </>
        )}

        {/* ── PROFILE tab ───────────────────────────────────── */}
        {activeTab === 'profile' && (
          <div className="px-4 pt-5 pb-4">
            <h2 className="text-2xl font-black tracking-tight mb-4">My Profile</h2>
            <ProfileContent />
          </div>
        )}
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 z-30 flex w-full max-w-md items-center justify-between border-t border-slate-200 bg-white/95 backdrop-blur-md px-5 pb-5 pt-3">
        {([
          { id: 'home', label: 'HOME', icon: <Home size={22} /> },
          { id: 'schedule', label: 'BREAK OUT', icon: <Rocket size={22} /> },
        ] as { id: Tab; label: string; icon: React.ReactNode }[]).map((item) => (
          <button key={item.id} type="button" onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center gap-0.5 ${activeTab === item.id ? 'text-blue-600' : 'text-slate-400'}`}>
            {item.icon}
            <span className="text-[9px] font-black uppercase">{item.label}</span>
          </button>
        ))}

        {/* Center QR button */}
        <div className="relative -top-6">
          <button type="button" onClick={() => setScanModal(true)}
            className="w-14 h-14 flex items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-400/50 active:scale-90 transition-transform hover:bg-blue-700">
            <QrCode size={26} />
          </button>
        </div>

        {([
          { id: 'exhibitors', label: 'EXHIBITORS', icon: <Users size={22} /> },
          { id: 'profile', label: 'PROFILE', icon: <User size={22} /> },
        ] as { id: Tab; label: string; icon: React.ReactNode }[]).map((item) => (
          <button key={item.id} type="button" onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center gap-0.5 ${activeTab === item.id ? 'text-blue-600' : 'text-slate-400'}`}>
            {item.icon}
            <span className="text-[9px] font-black uppercase">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* ── Mobile sidebar drawer ─────────────────────────── */}
      {mobileDrawerOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => setMobileDrawerOpen(false)}
          />

          {/* Drawer panel */}
          <div className="fixed top-0 left-0 z-50 h-full w-72 max-w-[85vw] bg-white shadow-2xl flex flex-col animate-[slideInLeft_0.22s_ease-out]">
            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <img src="/iscene.png" alt="iSCENE" className="w-9 h-9 rounded-full object-contain bg-white p-0.5 shadow-sm" />
                <div>
                  <p className="text-sm font-black leading-tight text-blue-600">iSCENE 2026</p>
                  <p className="text-[10px] text-slate-400">Global Summit</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500"
              >
                <X size={16} />
              </button>
            </div>



            {/* Nav links */}
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {([
                { id: 'home' as Tab, label: 'Home', icon: <Home size={18} /> },
                { id: 'schedule' as Tab, label: 'Break out room', icon: <Rocket size={18} /> },
                { id: 'exhibitors' as Tab, label: 'Exhibitors', icon: <Store size={18} /> },
                { id: 'materials' as Tab, label: 'Materials', icon: <BookOpen size={18} /> },
                { id: 'meals' as Tab, label: 'My Meals', icon: <Utensils size={18} />, badge: unclaimedMealsCount },
                { id: 'profile' as Tab, label: 'Profile', icon: <User size={18} /> },
              ]).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => { setActiveTab(item.id); setMobileDrawerOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === item.id ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {'badge' in item && item.badge > 0 && (
                    <span className="ml-auto min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-black">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </button>
              ))}
            </nav>

            {/* Quick actions */}
            <div className="px-3 pb-3 space-y-1">
              <button
                type="button"
                onClick={() => { setScanModal(true); setMobileDrawerOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                <QrCode size={18} /><span>Scan QR Code</span>
              </button>
              <button
                type="button"
                onClick={() => { setIdModal(true); setMobileDrawerOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                <CreditCard size={18} /><span>My Digital ID</span>
              </button>
            </div>
            
            {/* Profile Info & Sign Out Footer */}
            <div className="mt-auto border-t border-slate-100 p-4">
              <div className="mb-3 flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 overflow-hidden">
                  {profilePicUrl ? (
                    <img src={profilePicUrl} alt={fullName} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-sm font-black text-blue-600">{initials}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-800">{fullName}</p>
                  <p className="truncate text-[11px] text-slate-500">{registration?.sector || 'Participant'}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                className="w-full rounded-full border border-red-200 py-2 text-xs font-bold text-red-600 transition-colors hover:bg-red-50"
              >
                Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  //  DESKTOP LAYOUT  (shown on md+)
  // ══════════════════════════════════════════════════════════════════════════
  const DesktopLayout = (
    <div className="hidden md:flex min-h-screen bg-slate-50 text-slate-900">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-slate-100 flex flex-col fixed h-full z-30 shadow-sm">
        <div className="px-5 py-5 flex items-center gap-3 border-b border-slate-100">
          <img src="/iscene.png" alt="iSCENE" className="w-10 h-10 rounded-full object-contain bg-white p-0.5 shadow-sm shrink-0" />
          <div>
            <p className="text-sm font-black leading-tight">iSCENE 2026</p>
            <p className="text-[11px] text-slate-400">Science Conference</p>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          <NavItem icon={<Home size={17} />} label="Home" active={activeTab === 'home'} onClick={() => setActiveTab('home')} />
          <NavItem icon={<CalendarDays size={17} />} label="Schedule" active={activeTab === 'schedule'} onClick={() => setActiveTab('schedule')} />
          <NavItem icon={<Store size={17} />} label="Exhibitors" active={activeTab === 'exhibitors'} onClick={() => setActiveTab('exhibitors')} />
          <NavItem icon={<BookOpen size={17} />} label="Materials" active={activeTab === 'materials'} onClick={() => setActiveTab('materials')} />
          <NavItem icon={<Utensils size={17} />} label="My Meals" active={activeTab === 'meals'} onClick={() => setActiveTab('meals')} />
          <NavItem icon={<User size={17} />} label="Profile" active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} />
        </nav>
        <div className="border-t border-slate-100 p-4">
          <div className="mb-3 flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 overflow-hidden">
              {profilePicUrl ? (
                <img src={profilePicUrl} alt={fullName} className="h-full w-full object-cover" />
              ) : (
                <span className="text-sm font-black text-blue-600">{initials}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-800">{fullName}</p>
              <p className="truncate text-[11px] text-slate-500">{registration?.sector || 'Participant'}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="w-full rounded-full border border-red-200 py-2 text-xs font-bold text-red-600 transition-colors hover:bg-red-50"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 ml-56 overflow-y-auto min-h-screen">
        {/* Top header */}
        <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-sm border-b border-slate-100 px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black">Welcome back, {firstName}!</h1>
            <p className="text-sm text-slate-500">{hasEntryAttendance ? "You're checked in · Enjoy the event!" : "Scan the entrance QR when you arrive."}</p>
          </div>
          <div className="flex items-center gap-3">
            {scanToast && <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${scanToast.startsWith('✅') ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>{scanToast}</span>}
            <button type="button" onClick={() => setScanModal(true)} className="w-9 h-9 rounded-full bg-slate-100 hover:bg-blue-100 flex items-center justify-center transition-colors"><QrCode size={17} className="text-slate-600" /></button>
            <button type="button" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center"><Bell size={17} className="text-slate-600" /></button>
            <button type="button" onClick={() => setActiveTab('profile')} className="w-9 h-9 rounded-full overflow-hidden bg-blue-600 flex items-center justify-center text-white text-xs font-black ring-2 ring-blue-200 hover:ring-blue-400 transition-all">
              {profilePicUrl
                ? <img src={profilePicUrl} alt={fullName} className="w-full h-full object-cover" />
                : <span>{initials}</span>}
            </button>
          </div>
        </header>

        {/* HOME */}
        {activeTab === 'home' && (
          <div className="p-4 sm:p-6 lg:p-8 space-y-7">
            {/* Hero */}
            <div className="relative rounded-2xl overflow-hidden h-52 shadow-lg" style={{ backgroundImage: 'url(/icon.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
              <div className="absolute bottom-0 left-0 p-6">
                <p className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-1">iSCENE 2026</p>
                <h2 className="text-white text-2xl font-black leading-tight">Innovating the Future<br />of Science</h2>
              </div>
              <button type="button" onClick={() => setIdModal(true)} className="absolute bottom-5 right-5 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-full shadow-lg transition-colors">View My ID</button>
            </div>

            {/* Quick actions */}
            <div>
              <div className="flex items-center gap-2 mb-3"><Zap size={16} className="text-blue-600" /><h2 className="text-sm font-bold text-slate-700">Quick Actions</h2></div>
              <div className="grid grid-cols-5 gap-3">
                {[
                  { icon: <QrCode size={20} className="text-blue-600" />, label: 'Attendance', bg: 'bg-blue-50', action: () => setScanModal(true) },
                  { icon: <Award size={20} className={certReady ? 'text-amber-500' : 'text-purple-600'} />, label: 'Certificate', bg: certReady ? 'bg-amber-50' : 'bg-purple-50', action: () => setCertModal(true) },
                  { icon: <CalendarDays size={20} className="text-emerald-600" />, label: 'Schedule', bg: 'bg-emerald-50', action: () => setActiveTab('schedule') },
                  { icon: <BookOpen size={20} className="text-orange-500" />, label: 'Materials', bg: 'bg-orange-50', action: () => setActiveTab('materials') },
                  { icon: <MessageSquare size={20} className="text-rose-500" />, label: 'Feedback', bg: 'bg-rose-50', action: () => setActiveTab('schedule') },
                ].map(({ icon, label, bg, action }) => (
                  <button key={label} type="button" onClick={action} className="bg-white rounded-2xl p-4 flex flex-col items-center gap-2.5 shadow-sm border border-slate-100 hover:shadow-md hover:-translate-y-0.5 transition-all">
                    <div className={`w-11 h-11 ${bg} rounded-full flex items-center justify-center`}>{icon}</div>
                    <span className="text-[12px] font-medium text-slate-600">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Two-column */}
            <div className="grid grid-cols-5 gap-6">
              {/* Sessions */}
              <div className="col-span-3 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-800">Upcoming Sessions</h2>
                  <button type="button" onClick={() => setActiveTab('schedule')} className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1">View Full Schedule <ChevronRight size={13} /></button>
                </div>
                {rooms.length === 0
                  ? <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center text-slate-400 text-sm shadow-sm">No sessions scheduled yet.</div>
                  : rooms.slice(0, 4).map((room, i) => (
                    <React.Fragment key={room.id}>{DesktopSessionCard({ room, idx: i })}</React.Fragment>
                  ))}
                <div className="rounded-2xl bg-gradient-to-r from-blue-600 to-blue-800 p-5 flex items-center justify-between gap-4 shadow-lg shadow-blue-200 relative overflow-hidden">
                  <div className="relative z-10 max-w-[60%]">
                    <h3 className="text-white font-black text-base mb-1">Join the Innovation Lab Workshop</h3>
                    <p className="text-blue-200 text-xs leading-relaxed">A hands-on session with industry leaders. Reserve your spot!</p>
                    <button type="button" onClick={() => setActiveTab('schedule')} className="mt-3 px-4 py-2 bg-white text-blue-700 font-bold text-xs rounded-full hover:bg-blue-50 transition-colors">Secure My Spot</button>
                  </div>
                  <div className="text-6xl opacity-20 absolute right-4 top-1/2 -translate-y-1/2">🔬</div>
                </div>
              </div>

              {/* Right panel */}
              <div className="col-span-2 space-y-4">
                <div>
                  <h2 className="text-sm font-bold text-slate-800 mb-3">Featured Exhibitors</h2>
                  {boothRegs.length === 0
                    ? <div className="bg-white rounded-2xl border border-slate-100 p-5 text-center text-slate-400 text-xs shadow-sm">No exhibitors yet.</div>
                    : <div className="space-y-3">
                        {boothRegs.slice(0, 3).map((booth, i) => (
                          <button key={booth.id} type="button" onClick={() => setExhibitorDetailBooth(booth)} className="w-full text-left bg-white rounded-2xl border border-slate-100 p-3 shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex items-center gap-2 mb-2">
                              <div className={`w-8 h-8 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-xs font-black ${!(booth.profilePictureUrl || booth.boothImageUrl) ? SECTOR_COLORS[i % SECTOR_COLORS.length] : 'bg-slate-100'}`}>
                                {(booth.profilePictureUrl || booth.boothImageUrl) ? (
                                  <img src={booth.profilePictureUrl || booth.boothImageUrl} alt="" className="w-full h-full object-cover block" />
                                ) : (
                                  (booth.fullName as string)?.[0] || 'B'
                                )}
                              </div>
                              <div className="min-w-0"><p className="text-xs font-bold truncate">{booth.fullName || '—'}</p><p className="text-[10px] text-slate-400 truncate">{booth.sector}</p></div>
                            </div>
                            <div className={`h-20 rounded-xl mb-2 flex items-center justify-center overflow-hidden ${booth.boothImageUrl ? '' : 'bg-gradient-to-br from-slate-100 to-slate-200'}`}>
                              {booth.boothImageUrl ? <img src={booth.boothImageUrl} alt="" className="w-full h-full object-cover" /> : <Store size={28} className="text-slate-300" />}
                            </div>
                            <p className="text-[10px] text-slate-500 line-clamp-2">{booth.sectorOffice || 'Event booth participant'}</p>
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-[10px] text-slate-400">Booth #{booth.id.slice(0, 4).toUpperCase()}</span>
                              <span className="text-[11px] font-bold text-blue-600 flex items-center gap-0.5">View <ExternalLink size={10} /></span>
                            </div>
                          </button>
                        ))}
                      </div>}
                </div>
                <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-800 mb-3">Attendee Networking</h3>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex -space-x-2">
                      {['bg-blue-400','bg-emerald-400','bg-purple-400'].map((c, i) => (
                        <div key={i} className={`w-7 h-7 rounded-full ${c} border-2 border-white flex items-center justify-center text-[9px] text-white font-bold`}>{['A','B','C'][i]}</div>
                      ))}
                    </div>
                    <span className="text-[11px] text-slate-500 font-semibold">+{Math.max(0, rooms.length * 10)} attendees</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mb-3">Connect with fellow participants and industry experts.</p>
                  <button type="button" className="w-full py-2 rounded-full border-2 border-blue-600 text-blue-600 text-xs font-bold hover:bg-blue-50 transition-colors">Enter Networking Lounge</button>
                </div>
                {meals.length > 0 && (
                  <div className="bg-amber-50 rounded-2xl border border-amber-100 p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-2"><Utensils size={16} className="text-amber-600" /><h3 className="text-sm font-bold text-amber-800">Meal Schedule</h3></div>
                    <p className="text-[11px] text-amber-700 mb-3">{meals.length} meal window{meals.length !== 1 ? 's' : ''} scheduled.</p>
                    <button type="button" onClick={() => setActiveTab('meals')} className="w-full py-2 rounded-full bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition-colors">View My Meals</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SCHEDULE */}
        {activeTab === 'schedule' && (
          <div className="p-4 sm:p-6 lg:p-8">
            <div className="flex items-end justify-between mb-6">
              <div><h2 className="text-2xl font-black">Breakout Sessions</h2><p className="text-slate-500 text-sm mt-1">Reserve · Check in · Review</p></div>
            </div>
            {rooms.length === 0
              ? <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center text-slate-400 shadow-sm">No sessions scheduled yet.</div>
              : <div className="space-y-3">{rooms.map((room, i) => {
                  const res = reservations[room.id]; const rev = reviews[room.id];
                  const grad = CARD_GRADIENTS[i % CARD_GRADIENTS.length];
                  return (
                    <div
                      key={room.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setDetailRoom(room)}
                      onKeyDown={(e) => e.key === 'Enter' && setDetailRoom(room)}
                      className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow cursor-pointer flex"
                    >
                      <div
                        className={`w-24 min-h-[100px] shrink-0 ${!room.backgroundImage ? `bg-gradient-to-br ${grad}` : ''}`}
                        style={room.backgroundImage ? { backgroundImage: `url(${room.backgroundImage})`, backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', backgroundColor: '#f1f5f9' } : undefined}
                      />
                      <div className="flex-1 min-w-0 flex items-start justify-between gap-4 p-5">
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-slate-500 mb-0.5">{formatSessionDateTime(room)}{room.venue && ` · ${room.venue}`}</p>
                          <h3 className="font-bold text-sm text-slate-800 leading-snug">{room.name}</h3>
                          {room.description && <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{room.description}</p>}
                          <div className="flex flex-wrap items-center gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                            {!res ? <button type="button" onClick={() => handleReserve(room)} className="px-3 py-1.5 bg-blue-600 text-white rounded-full text-xs font-bold hover:bg-blue-700">Reserve</button>
                              : <span className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold flex items-center gap-1"><CheckCircle2 size={12} /> Reserved</span>}
                            {res?.attended && !rev && (
                              <button type="button" onClick={() => setReviewModal({ roomId: room.id, roomName: room.name, presenterNames: room.presenterNames || [] })} className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-full text-xs font-bold hover:bg-amber-200"><Star size={11} /> Review</button>
                            )}
                            {rev && <span className="text-xs font-bold text-amber-500">{'★'.repeat(getReviewDisplayRating(rev))}</span>}
                          </div>
                        </div>
                        <ChevronRight size={20} className="text-slate-300 shrink-0" />
                      </div>
                    </div>
                  );
                })}</div>}
          </div>
        )}

        {/* EXHIBITORS */}
        {activeTab === 'exhibitors' && (
          <div className="p-4 sm:p-6 lg:p-8">
            <div className="mb-6"><h2 className="text-2xl font-black">Exhibitors</h2><p className="text-slate-500 text-sm mt-1">Approved booth participants at iSCENE 2026.</p></div>
            {boothRegs.length === 0
              ? <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center text-slate-400 shadow-sm">No exhibitors yet.</div>
              : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {boothRegs.map((booth, i) => (
                    <button key={booth.id} type="button" onClick={() => setExhibitorDetailBooth(booth)} className="text-left bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                      <div className={`h-28 flex items-center justify-center overflow-hidden ${booth.boothImageUrl ? '' : `bg-gradient-to-br ${CARD_GRADIENTS[i % CARD_GRADIENTS.length]}`}`}>
                        {booth.boothImageUrl ? (
                          <img src={booth.boothImageUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Store size={40} className="text-white/30" />
                        )}
                      </div>
                      <div className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`w-8 h-8 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-xs font-black ${!(booth.profilePictureUrl || booth.boothImageUrl) ? SECTOR_COLORS[i % SECTOR_COLORS.length] : 'bg-slate-100'}`}>
                            {(booth.profilePictureUrl || booth.boothImageUrl) ? (
                              <img src={booth.profilePictureUrl || booth.boothImageUrl} alt="" className="w-full h-full object-cover block" />
                            ) : (
                              (booth.fullName as string)?.[0] || 'B'
                            )}
                          </div>
                          <div><p className="text-sm font-bold">{booth.fullName || '—'}</p><p className="text-[10px] text-slate-400">{booth.sector}</p></div>
                        </div>
                        <p className="text-xs text-slate-500 line-clamp-2 mb-3">{booth.sectorOffice || 'Event booth participant'}</p>
                        <div className="flex items-center justify-between"><span className="text-[11px] text-slate-400">Booth #{booth.id.slice(0,4).toUpperCase()}</span></div>
                      </div>
                    </button>
                  ))}
                </div>}
          </div>
        )}

        {/* MATERIALS */}
        {activeTab === 'materials' && (
          <div className="p-4 sm:p-6 lg:p-8">
            <div className="mb-6"><h2 className="text-2xl font-black">Session Materials</h2><p className="text-slate-500 text-sm mt-1">Access materials from your reserved sessions.</p></div>
            {presenterMaterials.length === 0
              ? <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center shadow-sm"><BookOpen size={40} className="text-slate-200 mx-auto mb-3" /><p className="text-slate-400 text-sm">Reserve a breakout session first. Training materials appear here when presenters upload files and link them to their sessions.</p><button type="button" onClick={() => setActiveTab('schedule')} className="mt-4 px-5 py-2 bg-blue-600 text-white rounded-full text-sm font-bold hover:bg-blue-700">Browse Sessions</button></div>
              : <div className="space-y-3">
                  {presenterMaterials.map((mat) => {
                    const room = mat.roomId ? rooms.find((r) => r.id === mat.roomId) : null;
                    const size = mat.fileSizeBytes ? (mat.fileSizeBytes < 1024 ? `${mat.fileSizeBytes} B` : mat.fileSizeBytes < 1024 * 1024 ? `${(mat.fileSizeBytes / 1024).toFixed(1)} KB` : `${(mat.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`) : '';
                    return (
                      <div key={mat.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4 hover:shadow-md transition-shadow">
                        <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0"><FileText size={20} className="text-blue-600" /></div>
                        <div className="flex-1 min-w-0"><p className="font-bold text-sm">{mat.fileName}</p><p className="text-xs text-slate-400 mt-0.5">{mat.roomName || room?.name || 'Session'} · {size}</p></div>
                        <a href={mat.downloadUrl} target="_blank" rel="noopener noreferrer" className="px-4 py-2 text-blue-600 border border-blue-200 rounded-full text-xs font-bold hover:bg-blue-50 flex items-center gap-1 shrink-0"><Download size={12} /> Download</a>
                      </div>
                    );
                  })}
                </div>}
          </div>
        )}

        {/* MEALS */}
        {activeTab === 'meals' && (
          <div className="p-4 sm:p-6 lg:p-8">
            <div className="mb-6"><h2 className="text-2xl font-black">My Entitlements</h2><p className="text-slate-500 text-sm mt-1">Food, kits, and giveaways — claim at the assigned stall within the time window.</p></div>
            {eligibleMeals.length === 0
              ? <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center text-slate-400 shadow-sm">No entitlements available for you yet.</div>
              : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                  {eligibleMeals.map((meal) => {
                    const isToday = meal.sessionDate ? new Date(meal.sessionDate).toDateString() === new Date().toDateString() : false;
                    const claimed = hasClaimedMeal(meal.id);
                    return (
                      <div key={meal.id} className={`rounded-2xl border shadow-sm p-5 ${claimed ? 'bg-emerald-50 border-emerald-200' : isToday ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-100'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-base">{meal.name || MEAL_LABELS[meal.type] || meal.type}</p>
                            {meal.itemType && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${meal.itemType === 'kit' ? 'bg-violet-100 text-violet-700' : meal.itemType === 'both' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>{meal.itemType === 'kit' ? 'Kit' : meal.itemType === 'both' ? 'Food & Kit' : 'Food'}</span>}
                          </div>
                          <div className="flex items-center gap-1.5">
                            {isToday && !claimed && <span className="text-[10px] font-black bg-amber-500 text-white px-2 py-0.5 rounded-full uppercase">Today</span>}
                            {claimed && <span className="text-[10px] font-black bg-emerald-500 text-white px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle2 size={10} /> Claimed</span>}
                          </div>
                        </div>
                        <p className="text-xs text-slate-500 mb-1">{meal.sessionDate ? new Date(meal.sessionDate).toLocaleDateString('en-PH',{weekday:'long',month:'long',day:'numeric'}) : '—'}</p>
                        {meal.startTime && meal.endTime && <p className="text-xs font-semibold text-blue-600 flex items-center gap-1"><Clock size={12} /> {meal.startTime} – {meal.endTime}</p>}
                        {meal.location && <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">📍 {meal.location}</p>}
                      </div>
                    );
                  })}
                </div>}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${certReady ? 'bg-amber-100' : 'bg-slate-100'}`}><Award size={24} className={certReady ? 'text-amber-500' : 'text-slate-400'} /></div>
                <div><h3 className="font-bold">Certificate of Participation</h3><p className="text-xs text-slate-500">{certReady ? 'Ready to download!' : 'Complete the requirements below'}</p></div>
              </div>
              <div className="space-y-2 mb-4">
                {[{label:'Attend a breakout session',done:attendedRoomIds.length>0},{label:'Submit a session review',done:reviewedRoomIds.length>0}].map(({label,done})=>(
                  <div key={label} className="flex items-center gap-2 text-sm">{done?<CheckCircle2 size={16} className="text-emerald-500 shrink-0"/>:<Clock size={16} className="text-slate-300 shrink-0"/>}<span className={done?'text-slate-700':'text-slate-400'}>{label}</span></div>
                ))}
              </div>
              {certReady && <button type="button" onClick={handleDownloadCertificate} className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"><Download size={16} /> Download Certificate</button>}
            </div>
          </div>
        )}

        {/* PROFILE */}
        {activeTab === 'profile' && (
          <div className="p-4 sm:p-6 lg:p-8 max-w-2xl">
            <h2 className="text-2xl font-black mb-6">My Profile</h2>
            <ProfileContent />
          </div>
        )}
      </main>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  //  SHARED MODALS
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <>
      {MobileLayout}
      {DesktopLayout}

      {/* QR Scanner */}
      {scanModal && (
        <QrScanModal
          subtitle="Scanning will start automatically for session check-in"
          onClose={() => { setScanModal(false); setScanModalRoom(null); }}
          onResult={handleScanResult}
          footerActions={scanModalRoom ? (
            <>
              <button
                type="button"
                onClick={async () => {
                  const room = scanModalRoom;
                  setScanModal(false);
                  setScanModalRoom(null);
                  if (!reservations[room.id]) await handleReserve(room);
                  document.getElementById('detail-actions-bar')?.scrollIntoView?.({ behavior: 'smooth' });
                }}
                className="px-5 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 flex items-center gap-2"
              >
                Reserve
              </button>
              <button
                type="button"
                onClick={async () => {
                  const room = scanModalRoom;
                  setScanModal(false);
                  setScanModalRoom(null);
                  if (reservations[room.id]) await handleCancelReservation(room);
                }}
                className="px-5 py-2.5 bg-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-300 flex items-center gap-2"
              >
                Cancel
              </button>
            </>
          ) : undefined}
        />
      )}

      {/* Digital ID */}
      {idModal && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xs bg-white rounded-3xl overflow-hidden shadow-2xl">
            <div className="relative bg-blue-600 px-4 py-3">
              <div className="text-center">
                <p className="text-white text-sm font-black tracking-widest uppercase">iSCENE 2026</p>
                <p className="text-blue-200 text-[10px]">International Smart &amp; Sustainable Cities Expo</p>
              </div>
              <button
                type="button"
                onClick={() => setIdModal(false)}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white"
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </div>
            <div className="px-5 py-5 flex flex-col items-center bg-gradient-to-b from-white to-slate-50 relative overflow-hidden">
              {/* Hologram watermark behind profile/info */}
              <div className="absolute top-10 left-6 pointer-events-none">
                <div className="relative flex items-center justify-center">
                  <div
                    className="absolute h-44 w-44 rounded-full bg-white/20 blur-2xl animate-ping"
                    style={{ animationDuration: '2.8s' }}
                  />
                  <div
                    className="absolute h-32 w-32 rounded-full bg-white/15 blur-xl animate-ping"
                    style={{ animationDuration: '2.8s', animationDelay: '0.9s' }}
                  />
                  <img
                    src="/iscene.png"
                    alt=""
                    className="h-24 w-24 object-contain opacity-[0.16] mix-blend-multiply animate-[pulse_2.6s_ease-in-out_infinite]"
                  />
                </div>
              </div>
              {profilePicUrl
                ? <img src={profilePicUrl} alt={fullName} className="w-20 h-20 rounded-full object-cover mb-3 ring-4 ring-blue-100 shadow-md" />
                : <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-2xl font-black text-white mb-3 ring-4 ring-blue-100">{initials}</div>}
              <h3 className="text-base font-black text-slate-900 text-center">{fullName}</h3>
              <p className="text-xs text-slate-500 mt-0.5 text-center">{registration?.positionTitle}{registration?.sectorOffice ? ` · ${registration.sectorOffice}` : ''}</p>
              <span className="mt-2 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-[11px] font-bold">{registration?.sector || 'Participant'}</span>
              <div className="mt-4 p-3 bg-white rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
                <img
                  src={digitalIdQrImg}
                  alt="Digital ID QR"
                  className="w-44 h-44 relative z-10"
                />
              </div>
              <p className="mt-3 text-[11px] text-slate-500 font-mono tracking-widest text-center">
                ID <span className="text-slate-400">#</span>{idNumber}
              </p>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[10px] text-slate-400">April 9–11, 2026</span>
              <a href={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(digitalIdQrData)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline"><Download size={11} /> Download QR</a>
            </div>
          </div>
        </div>
      )}

      {/* Certificate */}
      {certModal && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4"><h3 className="font-black text-base">Certificate of Participation</h3><button type="button" onClick={() => setCertModal(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X size={15} /></button></div>
            <div className="space-y-2 mb-5">
              {[{label:'Attend a breakout session',done:attendedRoomIds.length>0},{label:'Submit a session review',done:reviewedRoomIds.length>0},{label:'All conditions met',done:certReady}].map(({label,done})=>(
                <div key={label} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50">
                  {done?<CheckCircle2 size={18} className="text-emerald-500 shrink-0"/>:<Clock size={18} className="text-slate-300 shrink-0"/>}
                  <span className={`text-sm ${done?'text-slate-800 font-medium':'text-slate-400'}`}>{label}</span>
                </div>
              ))}
            </div>
            {certReady?<button type="button" onClick={handleDownloadCertificate} className="w-full py-3 bg-amber-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-amber-600"><Download size={16}/> Download Certificate</button>:<p className="text-xs text-slate-400 text-center">Complete all requirements to unlock your certificate.</p>}
          </div>
        </div>
      )}

      {/* Exhibitor Booth Detail modal */}
      {exhibitorDetailBooth && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg max-h-[90vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="font-black text-lg">Booth Profile</h3>
              <button type="button" onClick={() => setExhibitorDetailBooth(null)} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {/* Background / header image */}
              <div className={`h-36 flex items-center justify-center overflow-hidden ${exhibitorDetailBooth.boothBackgroundUrl || exhibitorDetailBooth.boothImageUrl ? '' : 'bg-gradient-to-br from-blue-100 via-blue-50 to-slate-100'}`}>
                {exhibitorDetailBooth.boothBackgroundUrl ? (
                  <img src={exhibitorDetailBooth.boothBackgroundUrl} alt="" className="w-full h-full object-cover" />
                ) : exhibitorDetailBooth.boothImageUrl ? (
                  <img src={exhibitorDetailBooth.boothImageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Store size={48} className="text-blue-300" />
                )}
              </div>
              <div className="p-5 space-y-4">
                {/* Profile */}
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-base font-black text-blue-600 shrink-0 overflow-hidden">
                    {(exhibitorDetailBooth.boothImageUrl || exhibitorDetailBooth.profilePictureUrl) ? (
                      <img src={exhibitorDetailBooth.boothImageUrl || exhibitorDetailBooth.profilePictureUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      (exhibitorDetailBooth.fullName as string)?.[0] || 'B'
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-black text-lg">{exhibitorDetailBooth.fullName || '—'}</p>
                    <p className="text-sm text-slate-500">{exhibitorDetailBooth.sectorOffice || exhibitorDetailBooth.sector || 'Exhibitor'}</p>
                    <p className="text-[11px] text-slate-400">Booth #{exhibitorDetailBooth.id?.slice(0, 6).toUpperCase() || '—'}</p>
                  </div>
                </div>
                {/* Title & details */}
                {exhibitorDetailBooth.boothDescription && (
                  <div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Description</p>
                    <p className="text-sm text-slate-700">{exhibitorDetailBooth.boothDescription}</p>
                  </div>
                )}
                {exhibitorDetailBooth.boothProducts && (
                  <div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Products / Services</p>
                    <p className="text-sm text-slate-700">{exhibitorDetailBooth.boothProducts}</p>
                  </div>
                )}
                {exhibitorDetailBooth.boothWebsite && (
                  <div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Website</p>
                    <a href={exhibitorDetailBooth.boothWebsite} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 font-bold hover:underline flex items-center gap-1">{exhibitorDetailBooth.boothWebsite} <ExternalLink size={12} /></a>
                  </div>
                )}
                {/* Materials */}
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Materials</p>
                  {exhibitorMaterials.length === 0 ? (
                    <p className="text-sm text-slate-400">No materials uploaded yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {exhibitorMaterials.map((mat) => {
                        const name = mat.materialName ?? mat.fileName;
                        const size = mat.fileSizeBytes ? (mat.fileSizeBytes < 1024 ? `${mat.fileSizeBytes} B` : mat.fileSizeBytes < 1024 * 1024 ? `${(mat.fileSizeBytes / 1024).toFixed(1)} KB` : `${(mat.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`) : '';
                        return (
                          <a key={mat.id} href={mat.downloadUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-blue-50 hover:border-blue-200 transition-colors">
                            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center shrink-0"><FileText size={18} className="text-blue-600" /></div>
                            <div className="flex-1 min-w-0"><p className="font-bold text-sm truncate">{name}</p><p className="text-[11px] text-slate-400">{size}</p></div>
                            <Download size={16} className="text-blue-600 shrink-0" />
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Breakout Room Detail - Full view with Back */}
      {detailRoom && (() => {
        const res = reservations[detailRoom.id];
        const rev = reviews[detailRoom.id];
        const roomMats = presenterMaterials.filter((m) => m.roomId === detailRoom.id);
        const currentStep = !res ? 1 : !res.attended ? 2 : !rev ? 3 : 4;
        const steps = [
          { id: 'reserve', label: 'RESERVE', done: !!res, current: currentStep === 1 },
          { id: 'timein', label: 'TIME IN', done: res?.attended, current: currentStep === 2 },
          { id: 'review', label: 'REVIEW', done: !!rev, current: currentStep === 3 },
          { id: 'cert', label: 'CERTIFICATE', done: !!rev && !!res?.attended, current: currentStep === 4 },
        ];
        return (
        <div className="fixed inset-0 z-[70] bg-slate-100 overflow-y-auto">
          {/* Header with Back */}
          <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-slate-200 px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setDetailRoom(null)}
              className="flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-slate-700 bg-slate-100 hover:bg-slate-200 hover:text-slate-900 font-medium transition-colors active:scale-[0.98] min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0"
              aria-label="Back"
            >
              <ArrowLeft size={20} className="shrink-0" />
              <span className="hidden sm:inline">Back</span>
            </button>
            <div className="h-5 w-px bg-slate-200" aria-hidden="true" />
            <span className="text-sm font-semibold text-slate-800 truncate flex-1">{detailRoom.name}</span>
          </div>

          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-6">
            {/* Stepper card */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
              <div className="flex items-center justify-between gap-2 sm:gap-4">
                {steps.map((s, i) => {
                  const onClick = s.id === 'reserve'
                    ? () => document.getElementById('detail-actions-bar')?.scrollIntoView?.({ behavior: 'smooth' })
                    : s.id === 'timein'
                    ? undefined
                    : s.id === 'review' && res?.attended
                    ? () => { setReviewModal({ roomId: detailRoom.id, roomName: detailRoom.name, presenterNames: detailRoom.presenterNames || [], fromRoom: detailRoom }); setDetailRoom(null); }
                    : s.id === 'cert'
                    ? () => setCertModal(true)
                    : undefined;
                  return (
                  <React.Fragment key={s.id}>
                    <button
                      type="button"
                      onClick={onClick}
                      className={`flex flex-col items-center gap-1.5 transition-opacity focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 rounded-xl p-1 -m-1 ${onClick ? 'cursor-pointer hover:opacity-80' : 'cursor-default'} ${s.current ? 'text-blue-600' : s.done ? 'text-blue-600' : 'text-slate-300'}`}
                    >
                      {s.id === 'reserve' && (
                        <span className="text-[9px] sm:text-[10px] font-semibold text-slate-500 uppercase tracking-wider text-center leading-tight">
                          {res ? 'Reserved' : 'Reserve a slot'}
                        </span>
                      )}
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                        s.done ? 'bg-blue-600 text-white' : s.current ? 'border-2 border-blue-600 text-blue-600 bg-white' : 'bg-slate-100'
                      }`}>
                        {s.done ? (s.id === 'cert' ? <Trophy size={16} /> : <CheckCircle2 size={16} />) : s.current && s.id === 'cert' ? <Award size={16} /> : i + 1}
                      </div>
                      <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">{s.label}</span>
                      {s.id === 'reserve' && (
                        <QrCode size={14} className={`shrink-0 ${s.done || s.current ? 'text-blue-600' : 'text-slate-300'}`} />
                      )}
                    </button>
                    {i < steps.length - 1 && <div className={`flex-1 h-0.5 rounded min-w-[8px] ${s.done ? 'bg-blue-600' : 'bg-slate-200'}`} />}
                  </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* Hero */}
            <div className={`relative rounded-2xl sm:rounded-3xl overflow-hidden min-h-[200px] sm:min-h-[260px] flex flex-col justify-between p-6 sm:p-8 ${!detailRoom.backgroundImage ? `bg-gradient-to-br ${CARD_GRADIENTS[rooms.indexOf(detailRoom) % CARD_GRADIENTS.length]}` : ''}`} style={detailRoom.backgroundImage ? { backgroundImage: `url(${detailRoom.backgroundImage})`, backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', backgroundColor: '#1e293b' } : undefined}>
              {detailRoom.backgroundImage && <div className="absolute inset-0 bg-black/50" />}
              <div className="relative z-10 flex flex-col gap-4">
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white leading-tight drop-shadow-lg">{detailRoom.name}</h1>
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    const hostNames = (detailRoom.presenterNames || []).filter((n) => n && String(n).trim());
                    const hostName = hostNames[0]?.trim();
                    const presenterTitles = detailRoom.presenterTitles;
                    const hostPosition = presenterTitles?.[0]?.trim();
                    if (!hostName) return null;
                    return (
                      <>
                        <span className="text-xs font-bold px-3 py-1 rounded-full bg-blue-600/90 text-white">{hostName}</span>
                        <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-500/60 text-white">{hostPosition || 'Session Host'}</span>
                      </>
                    );
                  })()}
                </div>
              </div>
              <div className="relative z-10 flex flex-wrap items-center gap-3 text-white/95 text-sm">
                {detailRoom.venue && <span className="flex items-center gap-1.5"><MapPin size={16} className="shrink-0" />{detailRoom.venue}</span>}
                {detailRoom.sessionDate && <span className="flex items-center gap-1.5"><CalendarDays size={16} className="shrink-0" />{new Date(detailRoom.sessionDate).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}</span>}
                {detailRoom.timeline && <span className="flex items-center gap-1.5"><Clock size={16} className="shrink-0" />{detailRoom.timeline}</span>}
                {detailRoom.capacity > 0 && <span className="flex items-center gap-1.5"><Users size={16} className="shrink-0" />{detailRoom.capacity} seats max</span>}
              </div>
            </div>

            {/* Not reserved: brief prompt */}
            {!res && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
                <p className="text-slate-700 font-medium">Reserve a slot to get started. After reserving, scan the QR code at the breakout room entrance to check in and unlock full session details.</p>
              </div>
            )}

            {/* Reserved but NOT timed in: Show Scan QR prompt */}
            {res && !res.attended && (
              <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-6 sm:p-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center mx-auto mb-4">
                  <QrCode size={32} className="text-white" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">Scan QR at Breakout Room Entrance</h3>
                <p className="text-slate-600 text-sm mb-4 max-w-md mx-auto">Go to the entrance of this breakout room and scan the QR code to check in. Once you&apos;ve timed in, the full session details will appear here.</p>
                <button type="button" onClick={() => { setScanModalRoom(detailRoom); setScanModal(true); }} className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 flex items-center justify-center gap-2 mx-auto">
                  <QrCode size={20} /> Open QR Scanner
                </button>
              </div>
            )}

            {/* Full details: Only show AFTER timed in */}
            {res?.attended && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left: Technology Overview + Features */}
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center"><Cpu size={18} className="text-blue-600" /></div>
                    <div>
                      <h2 className="font-bold text-slate-800">Technology Overview</h2>
                      <p className="text-xs text-slate-500 uppercase tracking-wider">Core Framework</p>
                    </div>
                  </div>
                  <p className="text-slate-600 leading-relaxed mt-4">Description continues of {detailRoom.projectDetail || detailRoom.description || 'explore innovative frameworks and collaborative tools in this breakout session.'}</p>
                </div>
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                  <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2"><BookOpen size={18} className="text-blue-600" /> Training Materials</h3>
                  {roomMats.length > 0 ? (
                    <div className="space-y-2">
                      {roomMats.map((mat) => (
                        <a key={mat.id} href={mat.downloadUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors">
                          <FileText size={18} className="text-blue-600 shrink-0" />
                          <span className="flex-1 text-sm font-medium truncate">{mat.fileName}</span>
                          <Download size={14} className="text-slate-400 shrink-0" />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 py-4 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">No materials yet. Presenters will add session materials here. Check back later or visit the Materials tab.</p>
                  )}
                </div>
              </div>

              {/* Right: Session Host (when has host) + Live Q&A */}
              <div className="space-y-6">
                {(() => {
                  const names = (detailRoom.presenterNames || []).filter((n) => n && n.trim() && n.toLowerCase() !== 'presenter');
                  if (names.length > 0) {
                    return (
                      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Session Host</p>
                        <div className="flex items-center gap-4 mb-4">
                          <div className="relative">
                            <div className="w-14 h-14 rounded-xl bg-blue-500 text-white flex items-center justify-center text-lg font-bold">
                              {names[0][0].toUpperCase()}
                            </div>
                            <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" />
                          </div>
                          <div>
                            <p className="font-bold text-slate-800">{names[0]}</p>
                            <p className="text-xs text-slate-500">Session host @ iSCENE 2026</p>
                          </div>
                        </div>
                        <button type="button" className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center gap-2">
                          Join Session <ChevronRight size={18} />
                        </button>
                      </div>
                    );
                  }
                  return null;
                })()}

                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2"><MessageCircle size={18} className="text-blue-600" /> Live Q&A</h3>
                    <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> LIVE
                    </span>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 max-h-40 overflow-y-auto p-3 space-y-2 mb-3">
                    {roomChatMessages.length === 0 ? <p className="text-xs text-slate-400 text-center py-4">No questions yet. Ask something!</p> : roomChatMessages.map((msg) => (
                      <div key={msg.id} className="p-2 rounded-lg bg-white border border-slate-100">
                        <p className="text-[11px] font-semibold text-slate-600">{msg.participantName || 'Anonymous'}</p>
                        <p className="text-sm text-slate-700">{msg.text}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input value={roomChatInput} onChange={(e) => setRoomChatInput(e.target.value)} placeholder="Ask a question..." className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendRoomChat()} />
                    <button type="button" onClick={handleSendRoomChat} disabled={roomChatSending || !roomChatInput.trim()} className="rounded-xl bg-blue-600 px-4 py-2 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"><MessageCircle size={16} /> Send</button>
                  </div>
                </div>
              </div>
            </div>
            )}

            {/* Actions bar */}
            <div id="detail-actions-bar" className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-3">
                {!res
                  ? <button type="button" onClick={async () => { await handleReserve(detailRoom); }} className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700">Reserve Slot</button>
                  : !res.attended
                    ? <button type="button" onClick={() => { setScanModalRoom(detailRoom); setScanModal(true); }} className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 flex items-center gap-2"><QrCode size={18} /> Scan QR at Breakout Room Entrance</button>
                    : <span className="px-6 py-3 bg-emerald-100 text-emerald-700 font-bold rounded-xl flex items-center gap-2"><CheckCircle2 size={18} /> Timed In</span>}
                {res?.attended && !rev && (
                  <button type="button" onClick={() => { setReviewModal({ roomId: detailRoom.id, roomName: detailRoom.name, presenterNames: detailRoom.presenterNames || [], fromRoom: detailRoom }); setDetailRoom(null); }} className="px-6 py-3 bg-amber-100 text-amber-700 font-bold rounded-xl hover:bg-amber-200 flex items-center gap-2"><Star size={18} /> Submit Review</button>
                )}
              </div>
              <button type="button" onClick={() => setDetailRoom(null)} className="text-slate-500 hover:text-slate-700 font-medium text-sm">Close</button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* DOST Review modal */}
      {reviewModal && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-end justify-center md:items-center md:p-4">
          <div className="w-full max-w-2xl max-h-[90vh] bg-white rounded-t-3xl md:rounded-3xl shadow-2xl flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between p-4 border-b border-slate-200">
              <div><h3 className="font-black text-lg">Session Evaluation Form</h3><p className="text-sm text-slate-500 mt-0.5">{reviewModal.roomName}</p></div>
              <button type="button" onClick={() => { if (reviewModal?.fromRoom) setDetailRoom(reviewModal.fromRoom); setReviewModal(null); }} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Part I */}
              <section className="space-y-4">
                <h4 className="font-bold text-slate-800 border-b border-slate-200 pb-2">PART I. SUBJECT MATTER</h4>
                <p className="text-xs text-slate-500">Scale: Low / Satisfactory / Very Good</p>
                <div className="space-y-3">
                  <div><p className="text-sm font-medium text-slate-700 mb-1">Level of Content</p><DOSTPart1Scale value={dostPart1.levelOfContent} onChange={(v) => setDostPart1((p) => ({ ...p, levelOfContent: v }))} /></div>
                  <div><p className="text-sm font-medium text-slate-700 mb-1">Appropriateness</p><DOSTPart1Scale value={dostPart1.appropriateness} onChange={(v) => setDostPart1((p) => ({ ...p, appropriateness: v }))} /></div>
                  <div><p className="text-sm font-medium text-slate-700 mb-1">Applicability</p><DOSTPart1Scale value={dostPart1.applicability} onChange={(v) => setDostPart1((p) => ({ ...p, applicability: v }))} /></div>
                </div>
              </section>

              {/* Part II - Per speaker */}
              {(reviewModal.presenterNames?.length ? reviewModal.presenterNames : ['Speaker']).map((speakerName, idx) => {
                const r = dostPart2[speakerName] || getDefaultDOSTSpeakerRatings();
                const setR = (up: Partial<DOSTSpeakerRatings>) => setDostPart2((p) => ({ ...p, [speakerName]: { ...(p[speakerName] || getDefaultDOSTSpeakerRatings()), ...up } }));
                return (
                  <section key={speakerName} className="space-y-4 p-4 bg-slate-50 rounded-xl">
                    <h4 className="font-bold text-slate-800">PART II. SPEAKER ({speakerName})</h4>
                    <p className="text-xs text-slate-500">Scale: 1 Poor · 2 Average · 3 Good · 4 Very Good · 5 Excellent</p>
                    <div className="space-y-4">
                      <div><p className="text-sm font-medium mb-1">Achievement of Session Objectives</p><DOSTScale15 value={r.achievementOfObjectives} onChange={(v) => setR({ achievementOfObjectives: v })} /></div>
                      <div>
                        <p className="text-sm font-medium mb-2">Mastery of Subject Matter</p>
                        <div className="space-y-2 pl-2">
                          {[
                            { k: 'exhibitKnowledge', l: 'Ability to exhibit knowledge of subject matter' },
                            { k: 'answerQuestions', l: 'Ability to answer participant\'s questions' },
                            { k: 'currentDevelopments', l: 'Ability to inject current developments' },
                            { k: 'balanceTheoryPractice', l: 'Ability to balance principles/theories with practical applications' },
                          ].map(({ k, l }) => (
                            <div key={k} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3"><span className="text-xs text-slate-600 sm:w-48">{l}</span><DOSTScale15 value={(r.mastery as any)[k]} onChange={(v) => setR({ mastery: { ...r.mastery, [k]: v } })} /></div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-2">Presentation of Subject Matter</p>
                        <div className="space-y-2 pl-2">
                          {[
                            { k: 'preparedness', l: 'Preparedness of speaker' },
                            { k: 'organizeMaterials', l: 'Ability to organize materials for clarity and precision' },
                            { k: 'arouseInterest', l: 'Ability to arouse interest' },
                            { k: 'instructionalMaterials', l: 'Ability to use appropriate instructional materials' },
                          ].map(({ k, l }) => (
                            <div key={k} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3"><span className="text-xs text-slate-600 sm:w-48">{l}</span><DOSTScale15 value={(r.presentation as any)[k]} onChange={(v) => setR({ presentation: { ...r.presentation, [k]: v } })} /></div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-2">Teacher-Related Personality Traits</p>
                        <div className="space-y-2 pl-2">
                          {[
                            { k: 'rapport', l: 'Ability to establish rapport' },
                            { k: 'considerateness', l: 'Considerateness' },
                          ].map(({ k, l }) => (
                            <div key={k} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3"><span className="text-xs text-slate-600 sm:w-48">{l}</span><DOSTScale15 value={(r.personality as any)[k]} onChange={(v) => setR({ personality: { ...r.personality, [k]: v } })} /></div>
                          ))}
                        </div>
                      </div>
                      <div><p className="text-sm font-medium mb-1">Acceptability of Speaker as Resource Person</p><DOSTScale15 value={r.acceptability} onChange={(v) => setR({ acceptability: v })} /></div>
                    </div>
                  </section>
                );
              })}

              {/* Part III */}
              <section className="space-y-4 p-4 bg-slate-50 rounded-xl">
                <h4 className="font-bold text-slate-800">PART III. TRAINING ENVIRONMENT</h4>
                <p className="text-xs text-slate-500">Scale: 1 Poor · 2 Average · 3 Good · 4 Very Good · 5 Excellent</p>
                <div className="space-y-3">
                  <div><p className="text-sm font-medium mb-1">Venue (room size, lighting, etc.)</p><DOSTScale15 value={dostPart3.venue} onChange={(v) => setDostPart3((p) => ({ ...p, venue: v }))} /></div>
                  <div><p className="text-sm font-medium mb-1">Food</p><DOSTScale15 value={dostPart3.food} onChange={(v) => setDostPart3((p) => ({ ...p, food: v }))} /></div>
                  <div><p className="text-sm font-medium mb-1">Ability of organizer to respond to participant&apos;s needs</p><DOSTScale15 value={dostPart3.organizerResponse} onChange={(v) => setDostPart3((p) => ({ ...p, organizerResponse: v }))} /></div>
                  <div><p className="text-xs text-slate-500 mb-1">Description (optional)</p><textarea value={dostPart3.description} onChange={(e) => setDostPart3((p) => ({ ...p, description: e.target.value }))} rows={2} className="w-full bg-white border border-slate-200 rounded-xl p-2 text-sm" placeholder="Additional remarks..." /></div>
                </div>
              </section>

              {/* Part IV */}
              <section className="space-y-2">
                <h4 className="font-bold text-slate-800">PART IV. COMMENTS/SUGGESTIONS/RECOMMENDATIONS</h4>
                <p className="text-xs text-slate-500">To improve future provision of DOST training assistance.</p>
                <textarea value={dostPart4} onChange={(e) => setDostPart4(e.target.value)} rows={4} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Your comments, suggestions, and recommendations..." />
              </section>
            </div>
            <div className="shrink-0 p-4 border-t border-slate-200">
              <button type="button" onClick={handleSubmitReview} disabled={reviewSaving} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {reviewSaving ? <><Loader2 size={18} className="animate-spin" /> Submitting…</> : <><Star size={18} /> Submit Review</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
