import React from 'react';
import {
  UtensilsCrossed,
  Search,
  Clock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  X,
  QrCode,
  Ban,
  Circle,
  Loader2,
  CreditCard,
  Download,
  Mail,
  LogOut,
  BarChart3,
  CalendarDays,
  User,
  AlertCircle,
  ArrowLeft,
  ImageUp,
  RefreshCw,
} from 'lucide-react';
import { User as FirebaseUser, sendPasswordResetEmail } from 'firebase/auth';
import {
  collection,
  getDocs,
  addDoc,
  doc,
  query,
  where,
  orderBy,
  Timestamp,
  limit,
  getDoc,
} from 'firebase/firestore';
import { Html5Qrcode } from 'html5-qrcode';
import { db, auth } from './firebase';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type Tab = 'dashboard' | 'participants' | 'sessions' | 'reports' | 'profile';

type MealWindow = {
  id: string;
  type: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
};

type FoodClaim = {
  id: string;
  participantUid: string;
  participantName: string;
  participantRegId: string;
  sector: string;
  mealId: string;
  mealType: string;
  sessionDate: string;
  claimedAt: any;
  claimedBy: string;
};

type FoundParticipant = {
  id: string;
  uid: string;
  fullName: string;
  sector: string;
  status: string;
  profilePictureUrl?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const MEAL_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  snacks: 'AM Snacks',
  lunch: 'Lunch',
  snacks_pm: 'PM Snacks',
  dinner: 'Dinner',
};

function parseWindowTime(timeStr: string, dateStr: string): Date {
  const base = dateStr ? new Date(dateStr) : new Date();
  const [time, period] = (timeStr || '').toUpperCase().split(' ');
  const parts = (time || '').split(':').map(Number);
  let h = parts[0] || 0;
  const m = parts[1] || 0;
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}

function isWithinWindow(meal: MealWindow): boolean {
  if (!meal.startTime || !meal.endTime) return false;
  const now = new Date();
  const start = parseWindowTime(meal.startTime, meal.sessionDate);
  const end = parseWindowTime(meal.endTime, meal.sessionDate);
  return now >= start && now <= end;
}

function timeUntilEnd(meal: MealWindow): string {
  const end = parseWindowTime(meal.endTime, meal.sessionDate);
  const diff = end.getTime() - Date.now();
  if (diff <= 0) return 'Ended';
  const m = Math.floor(diff / 60000);
  if (m < 60) return `Ends in ${m} min`;
  return `Ends in ${Math.floor(m / 60)}h ${m % 60}m`;
}

function avatarColors(name: string) {
  const colors = [
    'bg-blue-100 text-blue-700',
    'bg-purple-100 text-purple-700',
    'bg-emerald-100 text-emerald-700',
    'bg-amber-100 text-amber-700',
    'bg-rose-100 text-rose-700',
    'bg-cyan-100 text-cyan-700',
  ];
  return colors[name.charCodeAt(0) % colors.length];
}

function initials(name: string) {
  return name.split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2);
}

function sectorTier(sector: string) {
  if (!sector) return { label: 'Standard', cls: 'bg-slate-100 text-slate-500' };
  if (sector === 'Speakers') return { label: 'Speaker', cls: 'bg-slate-100 text-slate-500' };
  if (sector.includes('Exhibitor')) return { label: 'Exhibitor', cls: 'bg-blue-100 text-blue-600' };
  if (sector.includes('Facilitator')) return { label: 'Facilitator', cls: 'bg-indigo-100 text-indigo-600' };
  return { label: 'Participant', cls: 'bg-blue-100 text-blue-600' };
}

// ─────────────────────────────────────────────────────────────────────────────
// QR Scanner
// ─────────────────────────────────────────────────────────────────────────────
function QrScanModal({ onClose, onResult }: { onClose: () => void; onResult: (text: string) => void }) {
  const [camError, setCamError] = React.useState<string | null>(null);
  const [cameraReady, setCameraReady] = React.useState(false);
  const [uploadingImage, setUploadingImage] = React.useState(false);
  const [scanSuccess, setScanSuccess] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const scannerRef = React.useRef<Html5Qrcode | null>(null);
  const restartCameraRef = React.useRef<() => Promise<void>>(async () => {});
  const closingRef = React.useRef(false);
  const historyTokenRef = React.useRef(`food-scan-${Math.random().toString(36).slice(2)}`);
  const historyPushedRef = React.useRef(false);
  const successTimerRef = React.useRef<number | null>(null);
  const regionId = 'food-qr-region';

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

  React.useEffect(() => {
    closingRef.current = false;
    const scanner = new Html5Qrcode(regionId);
    scannerRef.current = scanner;
    let cancelled = false;
    let handled = false;

    const stopScanner = async () => {
      try {
        await scanner.stop();
      } catch {}
      try {
        scanner.clear();
      } catch {}
    };

    const handleDecoded = (decoded: string) => {
      if (handled) return;
      handled = true;
      stopScanner().finally(() => {
        finishSuccessfulScan(decoded);
      });
    };

    const startScanner = async () => {
      setCamError(null);
      setCameraReady(false);
      const config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1 };
      try {
        await scanner.start({ facingMode: { exact: 'environment' } }, config, handleDecoded, () => {});
        if (!cancelled) setCameraReady(true);
        return;
      } catch {
        try {
          const cameras = await Html5Qrcode.getCameras();
          const preferredCamera =
            cameras.find((camera) => /back|rear|environment/i.test(camera.label))?.id ||
            cameras[0]?.id;
          if (!preferredCamera) {
            throw new Error('No camera found');
          }
          if (!cancelled) {
            await scanner.start(preferredCamera, config, handleDecoded, () => {});
            setCameraReady(true);
          }
        } catch {
          if (!cancelled) {
            setCamError('Unable to start the camera. Please allow permission or try another device/browser.');
            setCameraReady(false);
          }
        }
      }
    };

    restartCameraRef.current = startScanner;
    void startScanner();

    const historyTimer = window.setTimeout(() => {
      window.history.pushState({ scannerModal: historyTokenRef.current }, '', window.location.href);
      historyPushedRef.current = true;
    }, 0);
    const handlePopState = () => {
      historyPushedRef.current = false;
      closingRef.current = true;
      void stopActiveScanner().finally(() => onClose());
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      cancelled = true;
      window.clearTimeout(historyTimer);
      if (successTimerRef.current) {
        window.clearTimeout(successTimerRef.current);
      }
      window.removeEventListener('popstate', handlePopState);
      if (!closingRef.current) {
        void stopActiveScanner();
      }
    };
  }, [onClose, onResult, stopActiveScanner]);

  const closeScanner = React.useCallback(async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (successTimerRef.current) {
      window.clearTimeout(successTimerRef.current);
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

  const finishSuccessfulScan = React.useCallback((decoded: string) => {
    setScanSuccess(true);
    successTimerRef.current = window.setTimeout(() => {
      onResult(decoded);
      void closeScanner();
    }, 950);
  }, [closeScanner, onResult]);

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const scanner = scannerRef.current;
    if (!file || !scanner) return;

    setUploadingImage(true);
    setCamError(null);
    setCameraReady(false);

    try {
      try {
        await scanner.stop();
      } catch {}
      const decoded = await scanner.scanFile(file, true);
      try {
        scanner.clear();
      } catch {}
      finishSuccessfulScan(decoded);
    } catch {
      setCamError('No QR code was found in that image. Try another image or use the live camera.');
      await restartCameraRef.current();
    } finally {
      setUploadingImage(false);
      event.target.value = '';
    }
  };
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
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
      <div id={regionId} className="absolute inset-0 overflow-hidden bg-slate-900" />
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/75 to-transparent z-10" />
      <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/80 to-transparent z-10" />

      <header className="absolute top-0 inset-x-0 z-20 flex items-center p-4">
        <button type="button" onClick={() => { void closeScanner(); }} className="flex size-12 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur-md">
          <ArrowLeft size={20} />
        </button>
        <h2 className="flex-1 text-center text-lg font-bold text-white drop-shadow-md">iSCENE 2026 Scan</h2>
        <button type="button" onClick={() => fileInputRef.current?.click()} className="flex size-12 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur-md">
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
          <p className="mt-2 text-sm text-slate-300">Scanning will start automatically for meal validation</p>
          {uploadingImage && <p className="mt-3 text-sm font-semibold text-blue-300">Reading uploaded image…</p>}
          {!uploadingImage && !camError && !cameraReady && <p className="mt-3 text-sm font-semibold text-blue-300">Starting live camera…</p>}
          {camError && <p className="mt-3 text-sm font-semibold text-red-300">{camError}</p>}
        </div>
      </main>

      <div className="absolute inset-x-0 bottom-0 z-20 rounded-t-[28px] border-t border-white/10 bg-slate-50/95 px-6 py-5 backdrop-blur-xl">
        <div className="flex items-center justify-center gap-8">
          <button type="button" onClick={() => fileInputRef.current?.click()} className="flex size-12 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-blue-600">
            <ImageUp size={20} />
          </button>
          <div className="flex size-20 items-center justify-center rounded-full bg-blue-600 text-white shadow-xl shadow-blue-500/30 ring-4 ring-blue-200/60">
            <QrCode size={30} />
          </div>
          <button type="button" onClick={() => void restartCameraRef.current()} className="flex size-12 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-blue-600">
            <RefreshCw size={20} className={!cameraReady && !camError ? 'animate-spin' : ''} />
          </button>
        </div>
        <p className="mt-3 text-center text-xs font-medium text-slate-500">Live camera and image upload are both supported.</p>
      </div>

      {scanSuccess && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/70 backdrop-blur-md">
          <div className="mx-6 w-full max-w-xs rounded-3xl bg-white/95 p-6 text-center shadow-2xl">
            <img src="/iscene.png" alt="iSCENE" className="mx-auto mb-4 h-16 w-16 rounded-full object-contain bg-white p-1 shadow-md" />
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 size={30} />
            </div>
            <p className="text-lg font-black text-slate-900">Scan Successful</p>
            <p className="mt-1 text-sm text-slate-500">QR code verified by iSCENE 2026.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
type Props = { user: FirebaseUser; registration: any; onSignOut: () => Promise<void> };

export function FoodBoothDashboard({ user, registration, onSignOut }: Props) {
  const fullName = (registration?.fullName as string) || user.email || 'Food Booth';
  const profilePicUrl = (registration?.profilePictureUrl as string | undefined) || null;
  const myInitials = initials(fullName);

  // ── Nav ────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = React.useState<Tab>('dashboard');

  // ── Data ───────────────────────────────────────────────────────────────
  const [meals, setMeals] = React.useState<MealWindow[]>([]);
  const [todayClaims, setTodayClaims] = React.useState<FoodClaim[]>([]);
  const [allClaims, setAllClaims] = React.useState<FoodClaim[]>([]);
  const [loading, setLoading] = React.useState(true);

  // ── Search / Scan ──────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchResults, setSearchResults] = React.useState<FoundParticipant[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [claimingFor, setClaimingFor] = React.useState<string | null>(null);
  const [scanModal, setScanModal] = React.useState(false);

  // ── Modals ─────────────────────────────────────────────────────────────
  const [idModal, setIdModal] = React.useState(false);

  // ── Toast ──────────────────────────────────────────────────────────────
  const [toast, setToast] = React.useState<{ msg: string; ok: boolean } | null>(null);
  const showToast = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 4500); };

  // ── Profile ────────────────────────────────────────────────────────────
  const [pwResetSent, setPwResetSent] = React.useState(false);

  // ── Derived ────────────────────────────────────────────────────────────
  const now = new Date();
  const activeMeal = meals.find(isWithinWindow) || null;
  const upcomingMeals = meals.filter((m) => !isWithinWindow(m) && parseWindowTime(m.startTime, m.sessionDate) > now);
  const pastMeals = meals.filter((m) => !isWithinWindow(m) && parseWindowTime(m.endTime, m.sessionDate) <= now);

  const claimsForActiveMeal = activeMeal
    ? todayClaims.filter((c) => c.mealId === activeMeal.id)
    : [];

  const digitalIdQrData = `https://iscene.app/verify?uid=${user.uid}&name=${encodeURIComponent(fullName)}&role=food-booth`;
  const digitalIdQrImg = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(digitalIdQrData)}`;

  // ── Load ───────────────────────────────────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        // Meals
        const mealsSnap = await getDocs(query(collection(db, 'meals'), orderBy('createdAt', 'desc')));
        const mealList: MealWindow[] = mealsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MealWindow, 'id'>) }));
        if (!cancelled) setMeals(mealList);

        // Today's claims by this booth
        const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
        const claimsSnap = await getDocs(
          query(collection(db, 'foodClaims'), where('claimedBy', '==', user.uid), orderBy('claimedAt', 'desc'))
        );
        const claims: FoodClaim[] = claimsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FoodClaim, 'id'>) }));
        if (!cancelled) {
          setAllClaims(claims);
          setTodayClaims(claims.filter((c) => {
            const t = c.claimedAt?.toDate ? c.claimedAt.toDate() : new Date(c.claimedAt);
            return t >= startOfDay;
          }));
        }
      } catch (err) { console.error(err); }
      finally { if (!cancelled) setLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [user.uid]);

  // ── Helpers ────────────────────────────────────────────────────────────
  const hasClaimed = (participantUid: string, mealId: string) =>
    allClaims.some((c) => c.participantUid === participantUid && c.mealId === mealId);

  // ── Search participants ────────────────────────────────────────────────
  const handleSearch = async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'registrations'),
          where('fullName', '>=', q),
          where('fullName', '<=', q + '\uf8ff'),
          limit(8))
      );
      const results: FoundParticipant[] = snap.docs.map((d) => {
        const data = d.data() as any;
        return { id: d.id, uid: data.uid, fullName: data.fullName, sector: data.sector, status: data.status, profilePictureUrl: data.profilePictureUrl };
      });
      setSearchResults(results);
    } catch { showToast('Search failed. Check permissions.', false); }
    finally { setSearching(false); }
  };

  // Debounce search
  React.useEffect(() => {
    const timer = setTimeout(() => { if (searchQuery) handleSearch(searchQuery); else setSearchResults([]); }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ── QR scan result ─────────────────────────────────────────────────────
  const handleScanResult = async (text: string) => {
    setScanModal(false);
    try {
      const url = new URL(text);
      const uid = url.searchParams.get('uid');
      if (!uid) { showToast('❌ Invalid QR — no UID found.', false); return; }
      const snap = await getDocs(query(collection(db, 'registrations'), where('uid', '==', uid), limit(1)));
      if (snap.empty) { showToast('❌ No registration found for this QR.', false); return; }
      const d = snap.docs[0];
      const data = d.data() as any;
      const participant: FoundParticipant = { id: d.id, uid: data.uid, fullName: data.fullName, sector: data.sector, status: data.status, profilePictureUrl: data.profilePictureUrl };
      setSearchResults([participant]);
      setSearchQuery(data.fullName);
      setActiveTab('dashboard');
    } catch { showToast('❌ Invalid QR code.', false); }
  };

  // ── Claim meal ─────────────────────────────────────────────────────────
  const handleClaim = async (participant: FoundParticipant) => {
    if (!activeMeal) { showToast('❌ No active meal window right now.', false); return; }
    if (participant.status !== 'approved') { showToast('❌ Participant is not approved.', false); return; }
    if (hasClaimed(participant.uid, activeMeal.id)) { showToast('⚠️ Already claimed for this session.', false); return; }

    setClaimingFor(participant.uid);
    try {
      const newClaim: Omit<FoodClaim, 'id'> = {
        participantUid: participant.uid,
        participantName: participant.fullName,
        participantRegId: participant.id.slice(0, 8).toUpperCase(),
        sector: participant.sector,
        mealId: activeMeal.id,
        mealType: activeMeal.type,
        sessionDate: activeMeal.sessionDate,
        claimedAt: Timestamp.now(),
        claimedBy: user.uid,
      };
      const docRef = await addDoc(collection(db, 'foodClaims'), { ...newClaim, claimedByName: fullName });
      const claim: FoodClaim = { id: docRef.id, ...newClaim };
      setAllClaims((prev) => [claim, ...prev]);
      setTodayClaims((prev) => [claim, ...prev]);
      showToast(`✅ ${participant.fullName} — ${MEAL_LABELS[activeMeal.type] || activeMeal.type} claimed!`);
    } catch (err) { console.error(err); showToast('❌ Failed to record claim. Try again.', false); }
    finally { setClaimingFor(null); }
  };

  // ── Pagination ─────────────────────────────────────────────────────────
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 8;
  const paginatedClaims = allClaims.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(allClaims.length / PAGE_SIZE));

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-600" size={36} />
      </div>
    );
  }

  // ── Participant row for claim table ────────────────────────────────────
  const ParticipantRow = ({ p }: { p: FoundParticipant }) => {
    const claimed = activeMeal ? hasClaimed(p.uid, activeMeal.id) : false;
    const isApproved = p.status === 'approved';
    const active = !!activeMeal;
    const tier = sectorTier(p.sector);
    const claimRecord = activeMeal ? allClaims.find((c) => c.participantUid === p.uid && c.mealId === activeMeal.id) : null;
    const claimedTime = claimRecord?.claimedAt?.toDate
      ? claimRecord.claimedAt.toDate().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
      : null;

    return (
      <tr className="group hover:bg-slate-50 transition-colors">
        <td className="px-6 py-4">
          <div className="flex items-center gap-3">
            {p.profilePictureUrl
              ? <img src={p.profilePictureUrl} alt={p.fullName} className="w-10 h-10 rounded-full object-cover" />
              : <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-black ${avatarColors(p.fullName)}`}>{initials(p.fullName)}</div>}
            <div>
              <p className="font-bold text-sm">{p.fullName}</p>
              <p className="text-[11px] text-slate-400">ISC-26-{p.id.slice(0, 4).toUpperCase()}</p>
            </div>
          </div>
        </td>
        <td className="px-6 py-4">
          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${tier.cls}`}>{tier.label}</span>
        </td>
        <td className="px-6 py-4 text-center">
          {!isApproved
            ? <Ban size={18} className="text-slate-200 mx-auto" />
            : activeMeal?.type === 'breakfast' || activeMeal?.type === 'snacks'
              ? (claimed ? <CheckCircle2 size={18} className="text-emerald-500 mx-auto" /> : <div className="w-2.5 h-2.5 rounded-full bg-amber-400 ring-4 ring-amber-400/20 animate-pulse mx-auto" />)
              : <CheckCircle2 size={18} className="text-emerald-500 mx-auto" />}
        </td>
        <td className="px-6 py-4 text-center">
          {!isApproved
            ? <Ban size={18} className="text-slate-200 mx-auto" />
            : activeMeal?.type === 'lunch'
              ? claimed
                ? <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-slate-400"><CheckCircle2 size={13} />{claimedTime}</div>
                : <div className="w-2.5 h-2.5 rounded-full bg-amber-400 ring-4 ring-amber-400/20 animate-pulse mx-auto" />
              : <Circle size={18} className="text-slate-200 mx-auto" />}
        </td>
        <td className="px-6 py-4 text-center">
          {!isApproved
            ? <Ban size={18} className="text-slate-200 mx-auto" />
            : activeMeal?.type === 'dinner'
              ? claimed
                ? <CheckCircle2 size={18} className="text-emerald-500 mx-auto" />
                : <div className="w-2.5 h-2.5 rounded-full bg-amber-400 ring-4 ring-amber-400/20 animate-pulse mx-auto" />
              : <Circle size={18} className="text-slate-200 mx-auto" />}
        </td>
        <td className="px-6 py-4 text-right">
          {!isApproved ? (
            <span className="px-4 py-1.5 rounded-full text-xs font-bold bg-red-50 text-red-400">Not Approved</span>
          ) : claimed ? (
            <button disabled className="px-4 py-1.5 rounded-full text-xs font-bold bg-slate-100 text-slate-400 cursor-not-allowed">Claimed ✓</button>
          ) : !active ? (
            <span className="px-4 py-1.5 rounded-full text-xs font-bold bg-slate-100 text-slate-400">No Active Session</span>
          ) : (
            <button type="button"
              disabled={claimingFor === p.uid}
              onClick={() => handleClaim(p)}
              className="px-4 py-1.5 rounded-full text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-60 flex items-center gap-1 ml-auto">
              {claimingFor === p.uid ? <Loader2 size={12} className="animate-spin" /> : null}
              Claim {MEAL_LABELS[activeMeal!.type] || activeMeal!.type}
            </button>
          )}
        </td>
      </tr>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="relative flex min-h-screen w-full flex-col bg-slate-50 text-slate-900">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-2xl text-sm font-semibold shadow-lg ${toast.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* ── Top Navigation ─────────────────────────────────────────── */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white/90 backdrop-blur-md px-6 md:px-10 py-4 sticky top-0 z-40">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-xl text-white">
              <UtensilsCrossed size={18} />
            </div>
            <h1 className="text-lg font-black tracking-tight">
              iSCENE <span className="text-blue-600">2026</span>
            </h1>
          </div>
          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium">
            {([
              { id: 'dashboard' as Tab, label: 'Dashboard' },
              { id: 'participants' as Tab, label: 'Participants' },
              { id: 'sessions' as Tab, label: 'Meal Sessions' },
              { id: 'reports' as Tab, label: 'Reports' },
            ]).map(({ id, label }) => (
              <button key={id} type="button" onClick={() => setActiveTab(id)}
                className={`pb-1 transition-colors ${activeTab === id ? 'text-blue-600 font-semibold border-b-2 border-blue-600' : 'text-slate-500 hover:text-blue-600'}`}>
                {label}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          {/* Search */}
          <div className="relative hidden sm:block">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch(searchQuery)}
              className="bg-slate-100 rounded-full pl-9 pr-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none w-56"
              placeholder="Search attendee name…"
            />
            {searching && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />}
          </div>
          <button type="button" onClick={() => setScanModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-full text-sm font-bold shadow-md shadow-blue-200 hover:bg-blue-700 transition-colors">
            <QrCode size={16} /> Scan QR
          </button>
          <button type="button" onClick={() => setActiveTab('profile')}
            className="w-10 h-10 rounded-full overflow-hidden border-2 border-blue-500 ring-2 ring-blue-100 hover:ring-blue-300 transition-all">
            {profilePicUrl
              ? <img src={profilePicUrl} alt={fullName} className="w-full h-full object-cover" />
              : <div className="w-full h-full bg-blue-600 flex items-center justify-center text-white text-xs font-black">{myInitials}</div>}
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 md:px-10 py-8">

        {/* Search results dropdown */}
        {searchResults.length > 0 && (activeTab === 'dashboard' || activeTab === 'participants') && (
          <div className="mb-6 bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <p className="text-sm font-bold text-slate-700">
                Search Results — {activeMeal ? `Active: ${MEAL_LABELS[activeMeal.type] || activeMeal.type}` : 'No Active Meal Window'}
              </p>
              <button type="button" onClick={() => { setSearchResults([]); setSearchQuery(''); }} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>
            {!activeMeal && (
              <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-2 text-sm text-amber-700">
                <AlertCircle size={16} /> No active meal window. Claims can only be made during a live session.
              </div>
            )}
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wider font-bold">
                <tr>
                  <th className="px-6 py-3">Participant</th>
                  <th className="px-6 py-3">Sector</th>
                  <th className="px-6 py-3 text-center">Snacks</th>
                  <th className="px-6 py-3 text-center">Lunch</th>
                  <th className="px-6 py-3 text-center">Dinner</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {searchResults.map((p) => <React.Fragment key={p.uid}>{ParticipantRow({ p })}</React.Fragment>)}
              </tbody>
            </table>
          </div>
        )}

        {/* ══════════════ DASHBOARD ══════════════ */}
        {activeTab === 'dashboard' && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
              {/* Active Session */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-1">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-sm font-medium text-slate-500">Active Session</span>
                  <Clock size={20} className="text-blue-500" />
                </div>
                {activeMeal ? (
                  <>
                    <p className="text-2xl font-black">{MEAL_LABELS[activeMeal.type] || activeMeal.type}</p>
                    <p className="text-xs text-slate-400">{timeUntilEnd(activeMeal)} · {activeMeal.startTime} – {activeMeal.endTime}</p>
                  </>
                ) : (
                  <>
                    <p className="text-xl font-black text-slate-400">No Active Session</p>
                    <p className="text-xs text-slate-400">
                      {upcomingMeals[0] ? `Next: ${MEAL_LABELS[upcomingMeals[0].type] || upcomingMeals[0].type} at ${upcomingMeals[0].startTime}` : 'No upcoming sessions today'}
                    </p>
                  </>
                )}
              </div>
              {/* Claims Today */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-1">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-sm font-medium text-slate-500">Claims Today</span>
                  <CheckCircle2 size={20} className="text-emerald-500" />
                </div>
                <p className="text-2xl font-black">{todayClaims.length.toLocaleString()}</p>
                <div className="w-full bg-slate-100 h-2 rounded-full mt-1 overflow-hidden">
                  <div className="bg-blue-500 h-full rounded-full transition-all" style={{ width: `${Math.min(100, (todayClaims.length / Math.max(1, meals.length * 50)) * 100)}%` }} />
                </div>
              </div>
              {/* Last claim */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-1">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-sm font-medium text-slate-500">Last Claimed</span>
                  <BarChart3 size={20} className="text-orange-400" />
                </div>
                {todayClaims[0] ? (
                  <>
                    <p className="text-lg font-black truncate">{todayClaims[0].participantName}</p>
                    <p className="text-xs text-slate-400">
                      {MEAL_LABELS[todayClaims[0].mealType] || todayClaims[0].mealType} · {todayClaims[0].claimedAt?.toDate ? todayClaims[0].claimedAt.toDate().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-xl font-black text-slate-400">—</p>
                    <p className="text-xs text-slate-400">No claims yet today</p>
                  </>
                )}
              </div>
            </div>

            {/* Session Timeline */}
            {meals.length > 0 && (
              <div className="mb-8 overflow-x-auto pb-4">
                <div className="flex items-start gap-4 min-w-[600px]">
                  {[...pastMeals, ...(activeMeal ? [activeMeal] : []), ...upcomingMeals].map((meal) => {
                    const isActive = activeMeal?.id === meal.id;
                    const isPast = !isActive && parseWindowTime(meal.endTime, meal.sessionDate) <= now;
                    return (
                      <div key={meal.id} className={`flex-1 flex flex-col gap-2 ${isPast ? 'opacity-50' : ''}`}>
                        <div className={`h-1 rounded-full relative ${isActive ? 'bg-blue-500' : isPast ? 'bg-slate-300' : 'bg-slate-200'}`}>
                          {isActive && <div className="absolute -top-1.5 left-1/4 w-4 h-4 rounded-full bg-blue-500 ring-4 ring-blue-200" />}
                        </div>
                        <div className={`flex justify-between text-[11px] font-medium ${isActive ? 'text-blue-600 font-bold' : 'text-slate-500'}`}>
                          <span>{meal.startTime} – {meal.endTime}</span>
                          <span>{MEAL_LABELS[meal.type] || meal.type}{isActive ? ' (Live)' : ''}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Check-in section */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-md overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-black">Participant Check-in</h3>
                  <p className="text-sm text-slate-400 mt-0.5">Real-time meal eligibility — search or scan to validate</p>
                </div>
                <button type="button" onClick={() => setScanModal(true)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-full text-sm font-bold hover:bg-blue-700 transition-colors shadow-md shadow-blue-200">
                  <QrCode size={16} /> Scan QR
                </button>
              </div>

              {/* Today's recent claims */}
              {todayClaims.length === 0 && !activeMeal ? (
                <div className="py-14 text-center">
                  <UtensilsCrossed size={40} className="mx-auto mb-3 text-slate-200" />
                  <p className="font-bold text-slate-400">No claims yet</p>
                  <p className="text-sm text-slate-400 mt-1">Use the Scan QR button or search bar above to find a participant.</p>
                </div>
              ) : (
                <>
                  {todayClaims.length > 0 && (
                    <>
                      <div className="px-6 py-3 bg-slate-50 border-b border-slate-100">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Today's Claims</p>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase tracking-widest font-bold">
                            <tr>
                              <th className="px-6 py-3">Participant</th>
                              <th className="px-6 py-3">Sector</th>
                              <th className="px-6 py-3 text-center">Snacks</th>
                              <th className="px-6 py-3 text-center">Lunch</th>
                              <th className="px-6 py-3 text-center">Dinner</th>
                              <th className="px-6 py-3 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {todayClaims.slice(0, 6).map((c) => (
                              <React.Fragment key={c.participantUid + c.mealId}>
                                {ParticipantRow({ p: { id: c.participantRegId, uid: c.participantUid, fullName: c.participantName, sector: c.sector, status: 'approved' } })}
                              </React.Fragment>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </>
              )}

              <div className="p-5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                <p className="text-xs text-slate-400">Showing {Math.min(6, todayClaims.length)} of {todayClaims.length} claims today</p>
                <button type="button" onClick={() => setActiveTab('reports')} className="text-blue-600 text-xs font-bold hover:underline">View Full Report →</button>
              </div>
            </div>
          </>
        )}

        {/* ══════════════ PARTICIPANTS ══════════════ */}
        {activeTab === 'participants' && (
          <div>
            <div className="flex items-end justify-between mb-6">
              <div>
                <h2 className="text-2xl font-black">Participant Validation</h2>
                <p className="text-slate-500 text-sm mt-1">Search or scan a participant to validate meal eligibility</p>
              </div>
            </div>
            {/* Large search */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-full pl-11 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Type participant name…" />
                </div>
                <button type="button" onClick={() => setScanModal(true)}
                  className="flex items-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-full text-sm font-bold hover:bg-blue-700 transition-colors">
                  <QrCode size={16} /> Scan QR
                </button>
              </div>
              {activeMeal ? (
                <div className="mt-4 flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-xl px-4 py-2.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Active: <strong>{MEAL_LABELS[activeMeal.type] || activeMeal.type}</strong> · {activeMeal.startTime} – {activeMeal.endTime} · {timeUntilEnd(activeMeal)}
                </div>
              ) : (
                <div className="mt-4 flex items-center gap-2 text-sm text-amber-700 bg-amber-50 rounded-xl px-4 py-2.5">
                  <AlertCircle size={16} /> No active meal window. Claims can only be made during a live session.
                </div>
              )}
            </div>
            {searchResults.length > 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <p className="text-sm font-bold text-slate-600">{searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found</p>
                </div>
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase tracking-widest font-bold">
                    <tr>
                      <th className="px-6 py-3">Participant</th>
                      <th className="px-6 py-3">Sector</th>
                      <th className="px-6 py-3 text-center">Snacks</th>
                      <th className="px-6 py-3 text-center">Lunch</th>
                      <th className="px-6 py-3 text-center">Dinner</th>
                      <th className="px-6 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {searchResults.map((p) => <React.Fragment key={p.uid}>{ParticipantRow({ p })}</React.Fragment>)}
                  </tbody>
                </table>
              </div>
            ) : searchQuery && !searching ? (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm py-12 text-center text-slate-400">
                <Search size={36} className="mx-auto mb-3 text-slate-200" />
                <p className="font-medium">No results for "{searchQuery}"</p>
                <p className="text-sm mt-1">Try a different name or scan their QR code.</p>
              </div>
            ) : null}
          </div>
        )}

        {/* ══════════════ MEAL SESSIONS ══════════════ */}
        {activeTab === 'sessions' && (
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-black">Meal Sessions</h2>
              <p className="text-slate-500 text-sm mt-1">All scheduled meal windows for the event</p>
            </div>
            {meals.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm py-16 text-center text-slate-400">
                <CalendarDays size={40} className="mx-auto mb-3 text-slate-200" />
                <p className="font-medium">No meal sessions scheduled yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {[...pastMeals, ...(activeMeal ? [activeMeal] : []), ...upcomingMeals].map((meal) => {
                  const isActive = activeMeal?.id === meal.id;
                  const isPast = !isActive && parseWindowTime(meal.endTime, meal.sessionDate) <= now;
                  const claimCount = allClaims.filter((c) => c.mealId === meal.id).length;
                  return (
                    <div key={meal.id} className={`bg-white rounded-2xl border shadow-sm p-5 flex items-center gap-5 ${isActive ? 'border-blue-300 shadow-blue-100' : 'border-slate-200'} ${isPast ? 'opacity-60' : ''}`}>
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${isActive ? 'bg-blue-600' : 'bg-slate-100'}`}>
                        <UtensilsCrossed size={22} className={isActive ? 'text-white' : 'text-slate-400'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-black">{MEAL_LABELS[meal.type] || meal.type}</p>
                          {isActive && <span className="text-[10px] font-black bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full uppercase animate-pulse">LIVE</span>}
                          {isPast && <span className="text-[10px] font-bold bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full uppercase">Ended</span>}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {meal.sessionDate ? new Date(meal.sessionDate).toLocaleDateString('en-PH', { weekday: 'short', month: 'long', day: 'numeric' }) : '—'} · {meal.startTime} – {meal.endTime}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xl font-black text-blue-600">{claimCount}</p>
                        <p className="text-[11px] text-slate-400">claims</p>
                      </div>
                      {isActive && (
                        <button type="button" onClick={() => { setSearchQuery(''); setActiveTab('participants'); }}
                          className="shrink-0 px-4 py-2 bg-blue-600 text-white rounded-full text-xs font-bold hover:bg-blue-700">
                          Validate Now
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════════ REPORTS ══════════════ */}
        {activeTab === 'reports' && (
          <div>
            <div className="flex items-end justify-between mb-6">
              <div>
                <h2 className="text-2xl font-black">Claim Reports</h2>
                <p className="text-slate-500 text-sm mt-1">All meal claims processed by your stall</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-black text-blue-600">{allClaims.length}</p>
                <p className="text-xs text-slate-400">total claims</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-md overflow-hidden">
              {allClaims.length === 0 ? (
                <div className="py-14 text-center text-slate-400">
                  <BarChart3 size={40} className="mx-auto mb-3 text-slate-200" />
                  <p className="font-medium">No claims recorded yet</p>
                </div>
              ) : (
                <>
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase tracking-widest font-bold">
                      <tr>
                        <th className="px-6 py-4">Participant</th>
                        <th className="px-6 py-4">Sector</th>
                        <th className="px-6 py-4">Meal</th>
                        <th className="px-6 py-4">Date</th>
                        <th className="px-6 py-4">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedClaims.map((c) => {
                        const date = c.claimedAt?.toDate ? c.claimedAt.toDate() : new Date(c.claimedAt);
                        return (
                          <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-black ${avatarColors(c.participantName)}`}>{initials(c.participantName)}</div>
                                <div>
                                  <p className="font-bold text-sm">{c.participantName}</p>
                                  <p className="text-[10px] text-slate-400">ISC-26-{c.participantRegId?.slice(0, 4) || '—'}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${sectorTier(c.sector).cls}`}>{sectorTier(c.sector).label}</span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-sm font-semibold text-slate-700">{MEAL_LABELS[c.mealType] || c.mealType}</span>
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-500">{date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</td>
                            <td className="px-6 py-4 text-sm text-slate-500">{date.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="p-5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                    <p className="text-xs text-slate-400">Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, allClaims.length)} of {allClaims.length}</p>
                    <div className="flex items-center gap-2">
                      <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-blue-600 disabled:opacity-40"><ChevronLeft size={16} /></button>
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => i + 1).map((p) => (
                        <button key={p} onClick={() => setPage(p)} className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold transition-colors ${p === page ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}`}>{p}</button>
                      ))}
                      <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-blue-600 disabled:opacity-40"><ChevronRight size={16} /></button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ══════════════ PROFILE ══════════════ */}
        {activeTab === 'profile' && (
          <div className="max-w-2xl">
            <h2 className="text-2xl font-black mb-6">My Profile</h2>
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
                {profilePicUrl
                  ? <img src={profilePicUrl} alt={fullName} className="w-16 h-16 rounded-full object-cover ring-2 ring-blue-100" />
                  : <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-black">{myInitials}</div>}
                <div className="flex-1 min-w-0">
                  <p className="font-black text-lg">{fullName}</p>
                  <p className="text-sm text-slate-500">{user.email}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">Food Booth</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${registration?.status === 'approved' ? 'text-emerald-600 bg-emerald-50' : 'text-amber-600 bg-amber-50'}`}>
                      {registration?.status === 'approved' ? '✓ Approved' : '⏳ Pending'}
                    </span>
                  </div>
                </div>
                <button type="button" onClick={() => setIdModal(true)} className="flex flex-col items-center gap-1 text-blue-600 hover:text-blue-700">
                  <CreditCard size={20} /><span className="text-[10px] font-bold">My ID</span>
                </button>
              </div>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-3">Registration Info</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    { label: 'Sector', value: registration?.sector },
                    { label: 'Organization', value: registration?.sectorOffice },
                    { label: 'Position', value: registration?.positionTitle },
                    { label: 'Contact', value: registration?.contactNumber },
                  ].map(({ label, value }) => (
                    <div key={label}><p className="text-[11px] text-slate-400 mb-0.5">{label}</p><p className="font-semibold text-xs">{value || '—'}</p></div>
                  ))}
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2">Account</p>
                <button type="button" onClick={async () => { if (!user.email) return; await sendPasswordResetEmail(auth, user.email); setPwResetSent(true); setTimeout(() => setPwResetSent(false), 5000); }}
                  disabled={pwResetSent} className="w-full flex items-center justify-between py-2.5 text-sm text-slate-600 hover:text-slate-900 disabled:text-emerald-600">
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

      <footer className="border-t border-slate-200 px-10 py-5 text-center text-slate-400 text-xs">
        © 2026 iSCENE International Conference · Food Booth Management System
      </footer>

      {/* ── QR Scanner ───────────────────────────────────────────────── */}
      {scanModal && <QrScanModal onClose={() => setScanModal(false)} onResult={handleScanResult} />}

      {/* ── Digital ID ───────────────────────────────────────────────── */}
      {idModal && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xs bg-white rounded-3xl overflow-hidden shadow-2xl">
            <div className="bg-orange-500 px-4 py-3 flex items-center justify-between">
              <div><p className="text-white text-xs font-black tracking-widest uppercase">iSCENE 2026</p><p className="text-orange-100 text-[10px]">Food Booth Staff</p></div>
              <button type="button" onClick={() => setIdModal(false)} className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white"><X size={14} /></button>
            </div>
            <div className="px-5 py-5 flex flex-col items-center bg-gradient-to-b from-white to-slate-50">
              {profilePicUrl
                ? <img src={profilePicUrl} alt={fullName} className="w-20 h-20 rounded-full object-cover mb-3 ring-4 ring-orange-100 shadow-md" />
                : <div className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-2xl font-black text-white mb-3 ring-4 ring-orange-100">{myInitials}</div>}
              <h3 className="text-base font-black text-center">{fullName}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{registration?.sectorOffice || 'Food Booth Operator'}</p>
              <span className="mt-2 px-3 py-1 rounded-full bg-orange-100 text-orange-700 text-[11px] font-bold">Food (Booth)</span>
              <div className="mt-4 p-3 bg-white rounded-2xl shadow-sm border border-slate-100">
                <img src={digitalIdQrImg} alt="QR" className="w-44 h-44" />
              </div>
              <p className="mt-2 text-[11px] text-slate-400 font-mono tracking-widest">ID #{user.uid.slice(0, 8).toUpperCase()}</p>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[10px] text-slate-400">April 9–11, 2026</span>
              <a href={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(digitalIdQrData)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline">
                <Download size={11} /> Download
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
