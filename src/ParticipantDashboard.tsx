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
  RefreshCw,
} from 'lucide-react';
import { User as FirebaseUser, sendPasswordResetEmail } from 'firebase/auth';
import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  setDoc,
  doc,
  query,
  where,
  Timestamp,
  updateDoc,
  orderBy,
} from 'firebase/firestore';
import { Html5Qrcode } from 'html5-qrcode';
import { db, auth } from './firebase';

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
  presenterNames: string[];
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

type Review = {
  id: string;
  roomId: string;
  rating: number;
  comment: string;
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

// ─────────────────────────────────────────────────────────────────────────────
// QR Scanner modal (shared)
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
  const historyTokenRef = React.useRef(`participant-scan-${Math.random().toString(36).slice(2)}`);
  const historyPushedRef = React.useRef(false);
  const regionId = 'participant-qr-scan-region';

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

    // Ensure DOM element exists (handles close/reopen and React's async commit)
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    if (!document.getElementById(regionId)) {
      setCamError('Scanner failed to initialize. Please try again.');
      return;
    }

    const scanner = new Html5Qrcode(regionId);
    scannerRef.current = scanner;

    const config = {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      aspectRatio: 1,
    };

    const handleDecoded = (decoded: string) => {
      if (handledRef.current) return;
      void stopActiveScanner().finally(() => finishSuccessfulScan(decoded));
    };

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
        #${regionId} canvas {
          display: none !important;
        }
        #${regionId}__dashboard_section,
        #${regionId}__dashboard_section_csr,
        #${regionId}__dashboard_section_swaplink {
          display: none !important;
        }
      `}</style>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="hidden"
      />

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
        <button
          type="button"
          onClick={() => !controlsDisabled && fileInputRef.current?.click()}
          disabled={controlsDisabled}
          className="flex size-12 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur-md disabled:opacity-50 disabled:pointer-events-none"
          title="Upload QR image"
        >
          <ImageUp size={20} />
        </button>
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
          <p className="mt-2 text-sm text-slate-300">Scanning will start automatically for session check-in</p>
          {uploadingImage && <p className="mt-3 text-sm font-semibold text-blue-300">Reading uploaded image…</p>}
          {!uploadingImage && !camError && !cameraReady && <p className="mt-3 text-sm font-semibold text-blue-300">Starting live camera…</p>}
          {camError && <p className="mt-3 text-sm font-semibold text-red-300">{camError}</p>}
        </div>
      </main>

      <div className="absolute inset-x-0 bottom-0 z-20 rounded-t-[28px] border-t border-white/10 bg-slate-50/95 px-6 py-5 backdrop-blur-xl">
        <div className="flex items-center justify-center gap-8">
          <button
            type="button"
            onClick={() => !controlsDisabled && fileInputRef.current?.click()}
            disabled={controlsDisabled}
            className="flex size-12 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-blue-600 disabled:opacity-50 disabled:pointer-events-none"
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
            className="flex size-12 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-blue-600 disabled:opacity-50 disabled:pointer-events-none"
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
// Star picker (shared)
// ─────────────────────────────────────────────────────────────────────────────
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
  const [hasEntryAttendance, setHasEntryAttendance] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  // ── Modals ─────────────────────────────────────────────────────────────────
  const [scanModal, setScanModal] = React.useState(false);
  const [idModal, setIdModal] = React.useState(false);
  const [reviewModal, setReviewModal] = React.useState<{ roomId: string; roomName: string } | null>(null);
  const [certModal, setCertModal] = React.useState(false);
  const [detailRoom, setDetailRoom] = React.useState<Room | null>(null); // mobile detail sheet

  // ── Mobile filter ──────────────────────────────────────────────────────────
  const [mobileFilter, setMobileFilter] = React.useState<string>('all');

  // ── Mobile sidebar drawer ──────────────────────────────────────────────────
  const [mobileDrawerOpen, setMobileDrawerOpen] = React.useState(false);

  // ── Review form ────────────────────────────────────────────────────────────
  const [reviewRating, setReviewRating] = React.useState(5);
  const [reviewComment, setReviewComment] = React.useState('');
  const [reviewSaving, setReviewSaving] = React.useState(false);

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
        load(() => getDocs(query(collection(db, 'registrations'), where('sector', 'in', ['Exhibitor (Booth)', 'Exhibitor', 'Food (Booth)']))), { docs: [] } as { docs: any[] }),
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
      const urlStr = trimmed.startsWith('http') ? trimmed : `https://iscene.app/scan${trimmed.startsWith('?') ? trimmed : '?' + trimmed}`;
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
    setScanModal(false);
    try {
      const { type, id } = parseQrContent(text);

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
      } else if (type === 'room' && id) {
        const resId = `${user.uid}_${id}`;
        const resDocRef = doc(db, 'reservations', resId);
        const existing = await getDoc(resDocRef);
        const room = rooms.find((r) => r.id === id);
        if (existing.exists()) {
          await updateDoc(resDocRef, { attended: true, attendedAt: Timestamp.now() });
          setReservations((prev) => ({ ...prev, [id]: { ...prev[id], attended: true } }));
        } else {
          await setDoc(resDocRef, { uid: user.uid, roomId: id, roomName: room?.name || id, attended: true, reviewSubmitted: false, reservedAt: Timestamp.now(), attendedAt: Timestamp.now() });
          setReservations((prev) => ({ ...prev, [id]: { id: resId, roomId: id, roomName: room?.name || id, attended: true, reviewSubmitted: false, reservedAt: Timestamp.now() } }));
        }
        setScanToast('✅ Room check-in recorded!');
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

  const handleSubmitReview = async () => {
    if (!reviewModal) return;
    setReviewSaving(true);
    try {
      const docRef = await addDoc(collection(db, 'reviews'), { uid: user.uid, roomId: reviewModal.roomId, roomName: reviewModal.roomName, rating: reviewRating, comment: reviewComment, submittedAt: Timestamp.now() });
      setReviews((prev) => ({ ...prev, [reviewModal.roomId]: { id: docRef.id, roomId: reviewModal.roomId, rating: reviewRating, comment: reviewComment } }));
      await updateDoc(doc(db, 'reservations', `${user.uid}_${reviewModal.roomId}`), { reviewSubmitted: true }).catch(() => {});
      setReservations((prev) => ({ ...prev, [reviewModal.roomId]: { ...prev[reviewModal.roomId], reviewSubmitted: true } }));
      setReviewModal(null); setReviewRating(5); setReviewComment('');
    } finally { setReviewSaving(false); }
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
    const dateObj = room.sessionDate ? new Date(room.sessionDate) : null;
    const colorClass = SECTOR_COLORS[idx % SECTOR_COLORS.length];
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex items-start gap-4 p-4 hover:shadow-md transition-shadow">
        <div className="w-16 shrink-0 text-center bg-blue-50 rounded-xl p-2">
          {dateObj && <p className="text-[10px] text-slate-400 font-medium uppercase">{dateObj.toLocaleDateString('en-PH', { month: 'short' })}</p>}
          <p className="text-sm font-black text-blue-700">{dateObj ? dateObj.toLocaleDateString('en-PH', { day: 'numeric' }) : '—'}</p>
          {room.timeline && <p className="text-[10px] text-blue-500 font-medium mt-0.5">{room.timeline.split('–')[0]?.trim().replace(' AM','').replace(' PM','')}</p>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            {room.presenterNames?.length > 0 && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${colorClass}`}>{room.presenterNames[0].split(' ').slice(-1)[0].toUpperCase()}</span>
            )}
            {room.timeline && <span className="text-[10px] text-slate-400">· {room.timeline}</span>}
          </div>
          <p className="text-sm font-bold leading-snug text-slate-800">{room.name}</p>
          {room.description && <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{room.description}</p>}
          {room.presenterNames?.length > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <div className="w-5 h-5 rounded-full bg-blue-200 flex items-center justify-center text-[10px] font-bold text-blue-700">{room.presenterNames[0][0]}</div>
              <span className="text-[11px] text-slate-500">{room.presenterNames[0]}</span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <button type="button" className={`transition-colors ${res ? 'text-blue-500' : 'text-slate-300 hover:text-blue-500'}`} onClick={() => !res && handleReserve(room)} title={res ? 'Reserved' : 'Reserve slot'}>
            <Bookmark size={16} fill={res ? 'currentColor' : 'none'} />
          </button>
          {res?.attended && !rev && (
            <button type="button" onClick={() => setReviewModal({ roomId: room.id, roomName: room.name })} className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full hover:bg-amber-100">Review</button>
          )}
          {rev && <span className="text-amber-400 text-xs">{'★'.repeat(rev.rating)}</span>}
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

            {/* Upcoming sessions preview */}
            {rooms.length > 0 && (
              <div className="px-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold text-slate-800">Upcoming Sessions</p>
                  <button type="button" onClick={() => setActiveTab('schedule')} className="text-xs font-semibold text-blue-600">View all →</button>
                </div>
                {rooms.slice(0, 2).map((room, i) => (
                  <div key={room.id} className={`mb-3 rounded-2xl overflow-hidden bg-gradient-to-br ${CARD_GRADIENTS[i % CARD_GRADIENTS.length]} shadow-md`}>
                    <div className="h-20 flex items-end p-3 bg-black/20">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white`}>{TRACK_BADGES[i % TRACK_BADGES.length].label}</span>
                        {room.timeline && <span className="text-[10px] text-white/80">{room.timeline}</span>}
                      </div>
                    </div>
                    <div className="p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-white font-bold text-sm truncate">{room.name}</p>
                        {room.presenterNames?.[0] && <p className="text-white/70 text-[11px]">{room.presenterNames[0]}</p>}
                      </div>
                      <button type="button" onClick={() => setDetailRoom(room)} className="shrink-0 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-bold rounded-full">
                        Details
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── SCHEDULE / SHOWCASE tab ───────────────────────── */}
        {activeTab === 'schedule' && (
          <>
            <div className="px-4 pt-5 pb-2">
              <h2 className="text-2xl font-black tracking-tight">Pitch Showcase</h2>
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
                  const track = TRACK_BADGES[i % TRACK_BADGES.length];
                  const grad = CARD_GRADIENTS[i % CARD_GRADIENTS.length];
                  const dateObj = room.sessionDate ? new Date(room.sessionDate) : null;
                  return (
                    <div key={room.id} className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-all">
                      {/* Card image area */}
                      <div className={`h-48 w-full bg-gradient-to-br ${grad} flex items-end p-4`}>
                        <div className="flex flex-col gap-1 w-full">
                          <span className="text-[9px] font-black uppercase tracking-widest text-white/60">iSCENE 2026</span>
                          <p className="text-white font-black text-lg leading-tight line-clamp-2">{room.name}</p>
                        </div>
                      </div>
                      {/* Card content */}
                      <div className="p-4 flex flex-col gap-3">
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${track.cls}`}>{track.label}</span>
                            {room.timeline && (
                              <span className="text-xs text-slate-400 flex items-center gap-1"><Clock size={12} /> {room.timeline}</span>
                            )}
                          </div>
                          {dateObj && (
                            <p className="text-[11px] text-slate-400 mb-1">{dateObj.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                          )}
                        </div>
                        {room.description && <p className="text-sm leading-relaxed text-slate-600 line-clamp-2">{room.description}</p>}
                        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                          <div className="flex -space-x-2">
                            {(room.presenterNames || []).slice(0, 3).map((name, pi) => (
                              <div key={pi} className={`w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-black text-white ${['bg-blue-500','bg-emerald-500','bg-purple-500'][pi % 3]}`}>
                                {name[0]}
                              </div>
                            ))}
                            {(room.presenterNames || []).length === 0 && (
                              <div className="w-7 h-7 rounded-full border-2 border-white bg-slate-300 flex items-center justify-center text-[9px] font-bold text-slate-600">?</div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {res?.attended && !rev && (
                              <button type="button" onClick={() => setReviewModal({ roomId: room.id, roomName: room.name })} className="px-3 py-1.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
                                Review
                              </button>
                            )}
                            {rev && <span className="text-amber-400 text-xs font-bold">{'★'.repeat(rev.rating)}</span>}
                            <button type="button" onClick={() => setDetailRoom(room)}
                              className="flex items-center justify-center gap-2 rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 active:scale-95 transition-all">
                              View Details
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
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
                  <div key={booth.id} className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className={`h-32 w-full bg-gradient-to-br ${CARD_GRADIENTS[i % CARD_GRADIENTS.length]} flex items-center justify-center`}>
                      <Store size={40} className="text-white/40" />
                    </div>
                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${SECTOR_COLORS[i % SECTOR_COLORS.length]}`}>{(booth.fullName as string)?.[0] || 'B'}</div>
                        <div>
                          <p className="font-bold text-sm">{booth.fullName || '—'}</p>
                          <p className="text-[10px] text-slate-400">{booth.sector}</p>
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 line-clamp-2 mb-2">{booth.sectorOffice || 'Event booth participant'}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-400">Booth #{booth.id.slice(0, 4).toUpperCase()}</span>
                        <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Approved</span>
                      </div>
                    </div>
                  </div>
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
                  ? <button type="button" className="w-full py-2.5 bg-amber-500 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2"><Download size={14} /> Download Certificate</button>
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
          { id: 'schedule', label: 'SHOWCASE', icon: <Rocket size={22} /> },
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
          { id: 'exhibitors', label: 'SPEAKERS', icon: <Users size={22} /> },
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
                { id: 'schedule' as Tab, label: 'Showcase / Schedule', icon: <Rocket size={18} /> },
                { id: 'exhibitors' as Tab, label: 'Exhibitors', icon: <Store size={18} /> },
                { id: 'materials' as Tab, label: 'Materials', icon: <BookOpen size={18} /> },
                { id: 'meals' as Tab, label: 'My Meals', icon: <Utensils size={18} /> },
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
        <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-sm border-b border-slate-100 px-8 py-4 flex items-center justify-between">
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
          <div className="p-8 space-y-7">
            {/* Hero */}
            <div className="relative rounded-2xl overflow-hidden h-52 bg-gradient-to-br from-teal-700 via-cyan-800 to-slate-900 shadow-lg">
              <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 30px,rgba(255,255,255,.5) 30px,rgba(255,255,255,.5) 31px),repeating-linear-gradient(90deg,transparent,transparent 30px,rgba(255,255,255,.5) 30px,rgba(255,255,255,.5) 31px)' }} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
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
                          <div key={booth.id} className="bg-white rounded-2xl border border-slate-100 p-3 shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex items-center gap-2 mb-2">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${SECTOR_COLORS[i % SECTOR_COLORS.length]}`}>{(booth.fullName as string)?.[0] || 'B'}</div>
                              <div className="min-w-0"><p className="text-xs font-bold truncate">{booth.fullName || '—'}</p><p className="text-[10px] text-slate-400 truncate">{booth.sector}</p></div>
                            </div>
                            <div className="h-20 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 mb-2 flex items-center justify-center"><Store size={28} className="text-slate-300" /></div>
                            <p className="text-[10px] text-slate-500 line-clamp-2">{booth.sectorOffice || 'Event booth participant'}</p>
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-[10px] text-slate-400">Booth #{booth.id.slice(0, 4).toUpperCase()}</span>
                              <button type="button" onClick={() => setActiveTab('exhibitors')} className="text-[11px] font-bold text-blue-600 hover:underline flex items-center gap-0.5">Visit Booth <ExternalLink size={10} /></button>
                            </div>
                          </div>
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
          <div className="p-8">
            <div className="flex items-end justify-between mb-6">
              <div><h2 className="text-2xl font-black">Breakout Sessions</h2><p className="text-slate-500 text-sm mt-1">Reserve · Check in · Review</p></div>
            </div>
            {rooms.length === 0
              ? <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center text-slate-400 shadow-sm">No sessions scheduled yet.</div>
              : <div className="space-y-3">{rooms.map((room, i) => {
                  const res = reservations[room.id]; const rev = reviews[room.id];
                  const dateObj = room.sessionDate ? new Date(room.sessionDate) : null;
                  return (
                    <div key={room.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-shadow">
                      <div className="flex items-start gap-5">
                        <div className="w-16 shrink-0 text-center bg-blue-50 rounded-xl p-3">
                          {dateObj ? (<><p className="text-[10px] text-slate-400 uppercase font-medium">{dateObj.toLocaleDateString('en-PH',{month:'short'})}</p><p className="text-lg font-black text-blue-700">{dateObj.toLocaleDateString('en-PH',{day:'numeric'})}</p></>) : <p className="text-xs text-slate-400">TBD</p>}
                          {room.timeline && <p className="text-[10px] text-blue-500 font-medium mt-0.5 leading-tight">{room.timeline.split('–')[0]?.trim()}</p>}
                        </div>
                        <div className="flex-1 min-w-0">
                          {room.presenterNames?.length > 0 && <div className="flex items-center gap-2 flex-wrap mb-1.5"><span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${SECTOR_COLORS[i % SECTOR_COLORS.length]}`}>{room.presenterNames[0]}</span>{room.timeline && <span className="text-[11px] text-slate-400">· {room.timeline}</span>}</div>}
                          <h3 className="font-bold text-sm text-slate-800 leading-snug">{room.name}</h3>
                          {room.description && <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{room.description}</p>}
                          <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-slate-400">
                            {room.capacity > 0 && <span className="flex items-center gap-1"><Users size={11} /> {room.capacity} seats</span>}
                            {room.materials && <span className="flex items-center gap-1"><BookOpen size={11} /> {room.materials}</span>}
                          </div>
                        </div>
                        <div className="shrink-0 flex flex-col items-end gap-2">
                          {!res ? <button type="button" onClick={() => handleReserve(room)} className="px-4 py-2 bg-blue-600 text-white rounded-full text-xs font-bold hover:bg-blue-700 transition-colors">Reserve</button>
                            : <span className="px-4 py-2 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold flex items-center gap-1"><CheckCircle2 size={12} /> Reserved</span>}
                          {res?.attended && !rev && <button type="button" onClick={() => setReviewModal({ roomId: room.id, roomName: room.name })} className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-full text-xs font-bold hover:bg-amber-200 flex items-center gap-1"><Star size={11} /> Review</button>}
                          {rev && <span className="text-xs font-bold text-amber-500">{'★'.repeat(rev.rating)}{'☆'.repeat(5-rev.rating)}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}</div>}
          </div>
        )}

        {/* EXHIBITORS */}
        {activeTab === 'exhibitors' && (
          <div className="p-8">
            <div className="mb-6"><h2 className="text-2xl font-black">Exhibitors</h2><p className="text-slate-500 text-sm mt-1">Approved booth participants at iSCENE 2026.</p></div>
            {boothRegs.length === 0
              ? <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center text-slate-400 shadow-sm">No exhibitors yet.</div>
              : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {boothRegs.map((booth, i) => (
                    <div key={booth.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                      <div className={`h-28 bg-gradient-to-br ${CARD_GRADIENTS[i % CARD_GRADIENTS.length]} flex items-center justify-center`}><Store size={40} className="text-white/30" /></div>
                      <div className="p-4">
                        <div className="flex items-center gap-2 mb-2"><div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${SECTOR_COLORS[i % SECTOR_COLORS.length]}`}>{(booth.fullName as string)?.[0] || 'B'}</div><div><p className="text-sm font-bold">{booth.fullName || '—'}</p><p className="text-[10px] text-slate-400">{booth.sector}</p></div></div>
                        <p className="text-xs text-slate-500 line-clamp-2 mb-3">{booth.sectorOffice || 'Event booth participant'}</p>
                        <div className="flex items-center justify-between"><span className="text-[11px] text-slate-400">Booth #{booth.id.slice(0,4).toUpperCase()}</span><span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Approved</span></div>
                      </div>
                    </div>
                  ))}
                </div>}
          </div>
        )}

        {/* MATERIALS */}
        {activeTab === 'materials' && (
          <div className="p-8">
            <div className="mb-6"><h2 className="text-2xl font-black">Session Materials</h2><p className="text-slate-500 text-sm mt-1">Access materials from your reserved sessions.</p></div>
            {rooms.filter((r) => r.materials && reservations[r.id]).length === 0
              ? <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center shadow-sm"><BookOpen size={40} className="text-slate-200 mx-auto mb-3" /><p className="text-slate-400 text-sm">Reserve a session to access materials.</p><button type="button" onClick={() => setActiveTab('schedule')} className="mt-4 px-5 py-2 bg-blue-600 text-white rounded-full text-sm font-bold hover:bg-blue-700">Browse Sessions</button></div>
              : <div className="space-y-3">
                  {rooms.filter((r) => r.materials && reservations[r.id]).map((room) => (
                    <div key={room.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4 hover:shadow-md transition-shadow">
                      <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0"><FileText size={20} className="text-blue-600" /></div>
                      <div className="flex-1 min-w-0"><p className="font-bold text-sm">{room.name}</p><p className="text-xs text-slate-400 mt-0.5">{room.materials}</p></div>
                      <button type="button" className="px-4 py-2 text-blue-600 border border-blue-200 rounded-full text-xs font-bold hover:bg-blue-50 flex items-center gap-1"><Download size={12} /> Access</button>
                    </div>
                  ))}
                </div>}
          </div>
        )}

        {/* MEALS */}
        {activeTab === 'meals' && (
          <div className="p-8">
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
              {certReady && <button type="button" className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"><Download size={16} /> Download Certificate</button>}
            </div>
          </div>
        )}

        {/* PROFILE */}
        {activeTab === 'profile' && (
          <div className="p-8 max-w-2xl">
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
      {scanModal && <QrScanModal onClose={() => setScanModal(false)} onResult={handleScanResult} />}

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
            {certReady?<button type="button" className="w-full py-3 bg-amber-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-amber-600"><Download size={16}/> Download Certificate</button>:<p className="text-xs text-slate-400 text-center">Complete all requirements to unlock your certificate.</p>}
          </div>
        </div>
      )}

      {/* Mobile session detail bottom sheet */}
      {detailRoom && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-end justify-center md:items-center md:p-4">
          <div className="w-full max-w-md bg-white rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
            <div className={`h-32 bg-gradient-to-br ${CARD_GRADIENTS[rooms.indexOf(detailRoom) % CARD_GRADIENTS.length]} shrink-0 flex items-end p-4`}>
              <div className="flex items-center justify-between w-full">
                <p className="text-white font-black text-lg leading-tight">{detailRoom.name}</p>
                <button type="button" onClick={() => setDetailRoom(null)} className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white shrink-0"><X size={16} /></button>
              </div>
            </div>
            <div className="overflow-y-auto p-5 space-y-4 flex-1">
              {detailRoom.description && <p className="text-sm text-slate-600 leading-relaxed">{detailRoom.description}</p>}
              <div className="space-y-2 text-sm">
                {detailRoom.sessionDate && <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl"><CalendarDays size={16} className="text-blue-600 shrink-0" /><span>{new Date(detailRoom.sessionDate).toLocaleDateString('en-PH',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</span></div>}
                {detailRoom.timeline && <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl"><Clock size={16} className="text-blue-600 shrink-0" /><span>{detailRoom.timeline}</span></div>}
                {detailRoom.capacity > 0 && <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl"><Users size={16} className="text-blue-600 shrink-0" /><span>{detailRoom.capacity} seats max</span></div>}
                {detailRoom.presenterNames?.length > 0 && <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl"><Star size={16} className="text-blue-600 shrink-0 mt-0.5" /><span>{detailRoom.presenterNames.join(', ')}</span></div>}
                {detailRoom.materials && <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl"><BookOpen size={16} className="text-blue-600 shrink-0" /><span>{detailRoom.materials}</span></div>}
              </div>
            </div>
            <div className="p-5 border-t border-slate-100 space-y-2 shrink-0">
              {!reservations[detailRoom.id]
                ? <button type="button" onClick={async () => { await handleReserve(detailRoom); setDetailRoom(null); }} className="w-full py-3 bg-blue-600 text-white font-bold rounded-2xl text-sm hover:bg-blue-700 active:scale-95 transition-all">Reserve Slot</button>
                : <div className="w-full py-3 bg-emerald-100 text-emerald-700 font-bold rounded-2xl text-sm text-center flex items-center justify-center gap-2"><CheckCircle2 size={16} /> Reserved</div>}
              {reservations[detailRoom.id]?.attended && !reviews[detailRoom.id] && (
                <button type="button" onClick={() => { setReviewModal({ roomId: detailRoom.id, roomName: detailRoom.name }); setDetailRoom(null); }} className="w-full py-3 bg-amber-100 text-amber-700 font-bold rounded-2xl text-sm hover:bg-amber-200 flex items-center justify-center gap-2"><Star size={16} /> Submit Review</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Review modal */}
      {reviewModal && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-end justify-center md:items-center md:p-4">
          <div className="w-full max-w-sm bg-white rounded-t-3xl md:rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-1"><h3 className="font-black text-base">Submit Review</h3><button type="button" onClick={() => setReviewModal(null)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X size={15} /></button></div>
            <p className="text-sm text-slate-400 mb-4 line-clamp-1">{reviewModal.roomName}</p>
            <div className="mb-4"><p className="text-xs text-slate-500 font-medium mb-2">Your rating</p><StarPicker value={reviewRating} onChange={setReviewRating} /></div>
            <div className="mb-4"><p className="text-xs text-slate-500 font-medium mb-1">Comment (optional)</p><textarea value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} rows={3} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Share your experience…" /></div>
            <button type="button" onClick={handleSubmitReview} disabled={reviewSaving} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {reviewSaving ? <><Loader2 size={16} className="animate-spin" /> Submitting…</> : <><Star size={16} /> Submit Review</>}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
