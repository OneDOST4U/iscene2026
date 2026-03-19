import React from 'react';
import {
  LayoutDashboard,
  Users,
  BedDouble,
  Plane,
  CalendarDays,
  Settings,
  LogOut,
  Search,
  Bell,
  QrCode,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  X,
  CreditCard,
  Download,
  Mail,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Loader2,
  Building2,
  MapPin,
  User,
  Bus,
  ScanLine,
  BookOpen,
  Menu,
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
  setDoc,
  getDoc,
  query,
  where,
  orderBy,
  Timestamp,
  limit,
} from 'firebase/firestore';
import { Html5Qrcode } from 'html5-qrcode';
import { db, auth } from './firebase';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type Tab = 'overview' | 'participants' | 'accommodations' | 'travel' | 'calendar' | 'profile';

type ParticipantReg = {
  id: string;
  uid: string;
  fullName: string;
  sector: string;
  status: string;
  email?: string;
  profilePictureUrl?: string;
  sectorOffice?: string;
  positionTitle?: string;
  contactNumber?: string;
  // Optional travel & accommodation
  accommodationHotel?: string;
  accommodationRoom?: string;
  accommodationCheckIn?: string;
  flightNumber?: string;
  flightRoute?: string;
  arrivalTime?: string;
  transportMode?: string;
  travelDelay?: boolean;
};

type Room = {
  id: string;
  name: string;
  description?: string;
  capacity?: number;
  presenter?: string;
};

type Reservation = {
  id: string;
  uid: string;
  roomId: string;
  attended?: boolean;
};

type AttendanceRecord = {
  id: string;
  uid: string;
  type: string;
  roomId?: string;
  createdAt: any;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const SECTOR_BADGE: Record<string, string> = {
  Speakers:     'bg-purple-100 text-purple-600',
  Facilitators: 'bg-indigo-100 text-indigo-600',
  'Exhibitor (Booth)': 'bg-blue-100 text-blue-600',
  'Food (Booth)': 'bg-orange-100 text-orange-600',
};
function sectorBadge(sector: string) {
  return SECTOR_BADGE[sector] || 'bg-slate-100 text-slate-600';
}

function avatarColors(name: string) {
  const colors = ['bg-blue-100 text-blue-700','bg-purple-100 text-purple-700','bg-emerald-100 text-emerald-700','bg-amber-100 text-amber-700','bg-rose-100 text-rose-700'];
  return colors[(name?.charCodeAt(0) || 0) % colors.length];
}
function initials(name: string) {
  return (name || '').split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2) || '??';
}

function shortId(id: string) {
  return '#ISC26-' + id.slice(0, 4).toUpperCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// QR Scanner Modal
// ─────────────────────────────────────────────────────────────────────────────
function QrScanModal({ title, subtitle, onClose, onResult }: { title: string; subtitle: string; onClose: () => void; onResult: (text: string) => void }) {
  const [camError, setCamError] = React.useState<string | null>(null);
  const [cameraReady, setCameraReady] = React.useState(false);
  const [uploadingImage, setUploadingImage] = React.useState(false);
  const [scanSuccess, setScanSuccess] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const scannerRef = React.useRef<Html5Qrcode | null>(null);
  const closingRef = React.useRef(false);
  const handledRef = React.useRef(false);
  const successTimerRef = React.useRef<number | null>(null);
  const historyTokenRef = React.useRef(`facilitator-scan-${Math.random().toString(36).slice(2)}`);
  const historyPushedRef = React.useRef(false);
  const regionId = 'facilitator-qr-region';

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

    const config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1 };

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
        <h2 className="flex-1 text-center text-lg font-bold text-white drop-shadow-md">{title}</h2>
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
          <p className="mt-2 text-sm text-slate-300">{subtitle}</p>
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
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
type Props = { user: FirebaseUser; registration: any; onSignOut: () => Promise<void> };

export function FacilitatorDashboard({ user, registration, onSignOut }: Props) {
  const fullName   = (registration?.fullName as string) || user.email || 'Facilitator';
  const profilePicUrl = (registration?.profilePictureUrl as string | undefined) || null;
  const myInitials = initials(fullName);

  // ── Nav ────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = React.useState<Tab>('overview');
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  // ── Data ───────────────────────────────────────────────────────────────
  const [participants, setParticipants]   = React.useState<ParticipantReg[]>([]);
  const [rooms,        setRooms]          = React.useState<Room[]>([]);
  const [reservations, setReservations]   = React.useState<Reservation[]>([]);
  const [attendance,   setAttendance]     = React.useState<AttendanceRecord[]>([]);
  const [loading,      setLoading]        = React.useState(true);

  // ── Participant table ──────────────────────────────────────────────────
  const [searchQuery,   setSearchQuery]   = React.useState('');
  const [filterRole,    setFilterRole]    = React.useState('');
  const [filterStatus,  setFilterStatus]  = React.useState('');
  const [page,          setPage]          = React.useState(1);
  const PAGE_SIZE = 8;

  // ── Detail modal ───────────────────────────────────────────────────────
  const [selectedParticipant, setSelectedParticipant] = React.useState<ParticipantReg | null>(null);

  // ── QR Scan state ──────────────────────────────────────────────────────
  type ScanMode = { type: 'entrance' } | { type: 'room'; room: Room };
  const [scanMode,    setScanMode]    = React.useState<ScanMode | null>(null);
  const [scanLoading, setScanLoading] = React.useState(false);

  // ── Modals ─────────────────────────────────────────────────────────────
  const [idModal, setIdModal] = React.useState(false);

  // ── Toast ──────────────────────────────────────────────────────────────
  const [toast, setToast] = React.useState<{ msg: string; ok: boolean } | null>(null);
  const showToast = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 4500); };

  // ── Profile ────────────────────────────────────────────────────────────
  const [pwResetSent, setPwResetSent] = React.useState(false);

  // ── Digital ID ─────────────────────────────────────────────────────────
  const qrData   = `https://iscene.app/verify?uid=${user.uid}&name=${encodeURIComponent(fullName)}&role=facilitator`;
  const qrImgSrc = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrData)}`;

  // ── Load data ──────────────────────────────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [regSnap, roomSnap, resSnap, attSnap] = await Promise.allSettled([
          getDocs(query(collection(db, 'registrations'), orderBy('fullName'))),
          getDocs(collection(db, 'rooms')),
          getDocs(collection(db, 'reservations')),
          getDocs(collection(db, 'attendance')),
        ]);
        if (cancelled) return;
        setParticipants(
          regSnap.status === 'fulfilled'
            ? regSnap.value.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ParticipantReg, 'id'>) }))
            : []
        );
        setRooms(
          roomSnap.status === 'fulfilled'
            ? roomSnap.value.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Room, 'id'>) }))
            : []
        );
        setReservations(
          resSnap.status === 'fulfilled'
            ? resSnap.value.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Reservation, 'id'>) }))
            : []
        );
        setAttendance(
          attSnap.status === 'fulfilled'
            ? attSnap.value.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AttendanceRecord, 'id'>) }))
            : []
        );

        if (
          regSnap.status === 'rejected' ||
          roomSnap.status === 'rejected' ||
          resSnap.status === 'rejected' ||
          attSnap.status === 'rejected'
        ) {
          console.error('Facilitator dashboard partially failed to load.', {
            registrations: regSnap.status,
            rooms: roomSnap.status,
            reservations: resSnap.status,
            attendance: attSnap.status,
          });
        }
      } catch (err) { console.error(err); }
      finally { if (!cancelled) setLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // ── Derived stats ──────────────────────────────────────────────────────
  const approvedCount   = participants.filter((p) => p.status === 'approved').length;
  const checkedInCount  = new Set(attendance.filter((a) => a.type === 'entrance').map((a) => a.uid)).size;
  const speakersCount   = participants.filter((p) => p.sector === 'Speakers').length;
  const pendingCount    = participants.filter((p) => p.status === 'pending').length;
  const checkedInSet    = new Set(attendance.filter((a) => a.type === 'entrance').map((a) => a.uid));
  const reservedSet     = new Set(reservations.map((r) => r.uid));

  // ── Filtered participants ──────────────────────────────────────────────
  const filtered = React.useMemo(() => {
    return participants.filter((p) => {
      const fullName = (p.fullName || '').toLowerCase();
      const uid = p.uid || '';
      const id = p.id || '';
      const q = searchQuery.toLowerCase();
      const matchSearch = !searchQuery || fullName.includes(q) || uid.includes(searchQuery) || id.includes(searchQuery);
      const matchRole   = !filterRole   || p.sector === filterRole;
      const matchStatus = !filterStatus || p.status === filterStatus;
      return matchSearch && matchRole && matchStatus;
    });
  }, [participants, searchQuery, filterRole, filterStatus]);

  const totalPages    = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated     = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const uniqueSectors = Array.from(new Set(participants.map((p) => p.sector).filter(Boolean)));

  // ── QR Scan result handler ─────────────────────────────────────────────
  const handleScanResult = async (text: string) => {
    if (!scanMode) return;
    setScanLoading(true);
    try {
      const url = new URL(text);
      const uid = url.searchParams.get('uid');
      if (!uid) { showToast('❌ Invalid QR — no UID found.', false); setScanMode(null); return; }

      const regQuery = query(collection(db, 'registrations'), where('uid', '==', uid), limit(1));
      const regSnap  = await getDocs(regQuery);
      if (regSnap.empty) { showToast('❌ No registration found for this QR.', false); setScanMode(null); return; }
      const regData  = regSnap.docs[0].data() as any;
      const pName    = regData.fullName || uid;

      if (regData.status !== 'approved') {
        showToast(`⚠️ ${pName} is not yet approved.`, false);
        setScanMode(null);
        return;
      }

      if (scanMode.type === 'entrance') {
        const docId = `${uid}_entrance`;
        await setDoc(doc(db, 'attendance', docId), {
          uid, type: 'entrance', recordedBy: user.uid, createdAt: Timestamp.now(),
        }, { merge: true });
        setAttendance((prev) => {
          const filtered = prev.filter((a) => a.id !== docId);
          return [...filtered, { id: docId, uid, type: 'entrance', createdAt: Timestamp.now() }];
        });
        showToast(`✅ ${pName} — Entrance check-in recorded!`);
      } else {
        const room = scanMode.room;
        const hasReservation = reservations.some((r) => r.uid === uid && r.roomId === room.id);
        if (!hasReservation) {
          showToast(`⚠️ ${pName} has no reservation for "${room.name}".`, false);
        } else {
          const docId = `${uid}_${room.id}`;
          await setDoc(doc(db, 'attendance', docId), {
            uid, type: 'room', roomId: room.id, roomName: room.name, recordedBy: user.uid, createdAt: Timestamp.now(),
          }, { merge: true });
          setAttendance((prev) => {
            const f = prev.filter((a) => a.id !== docId);
            return [...f, { id: docId, uid, type: 'room', roomId: room.id, createdAt: Timestamp.now() }];
          });
          showToast(`✅ ${pName} — Checked into "${room.name}"!`);
        }
      }
    } catch (err) {
      console.error(err);
      showToast('❌ Failed to process QR. Try again.', false);
    } finally {
      setScanLoading(false);
      setScanMode(null);
    }
  };

  // ── Status badge ───────────────────────────────────────────────────────
  const statusBadge = (p: ParticipantReg) => {
    if (checkedInSet.has(p.uid))      return { label: 'Checked In', cls: 'text-blue-500' };
    if (p.status === 'approved')      return { label: 'Confirmed',  cls: 'text-emerald-500' };
    return                                   { label: 'Pending',    cls: 'text-amber-500' };
  };

  // ── Participant detail getters ─────────────────────────────────────────
  const participantReservations = (uid: string) => reservations.filter((r) => r.uid === uid);
  const participantAttendance   = (uid: string) => attendance.filter((a) => a.uid === uid);

  // ── Sidebar nav items ─────────────────────────────────────────────────
  const NAV = [
    { id: 'overview'      as Tab, label: 'Overview',        icon: <LayoutDashboard size={19} /> },
    { id: 'participants'  as Tab, label: 'Participants',     icon: <Users size={19} /> },
    { id: 'accommodations'as Tab, label: 'Accommodations',  icon: <BedDouble size={19} /> },
    { id: 'travel'        as Tab, label: 'Travel Schedule',  icon: <Plane size={19} /> },
    { id: 'calendar'      as Tab, label: 'Event Calendar',   icon: <CalendarDays size={19} /> },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-600" size={36} />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Page title mapping
  const PAGE_TITLES: Record<Tab, string> = {
    overview:       'Overview',
    participants:   'Participant Management',
    accommodations: 'Accommodations',
    travel:         'Travel Schedule',
    calendar:       'Event Calendar',
    profile:        'My Profile',
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] px-5 py-3 rounded-2xl text-sm font-semibold shadow-lg ${toast.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* ── Mobile sidebar backdrop ─────────────────────────────────── */}
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* ═══════════════ SIDEBAR ═══════════════ */}
      <aside className={`w-72 bg-white border-r border-slate-200 flex flex-col shrink-0 fixed lg:relative inset-y-0 left-0 z-40 transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        {/* Logo */}
        <div className="p-6 flex items-center gap-3 border-b border-slate-100">
          <div className="bg-blue-50 p-2.5 rounded-xl">
            <img src="/iscene.png" alt="iSCENE" className="w-7 h-7 rounded-full object-contain" />
          </div>
          <div>
            <h1 className="font-black text-lg tracking-tight leading-none">iSCENE 2026</h1>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mt-0.5">Facilitator Hub</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-4 py-5 space-y-1 overflow-y-auto">
          {NAV.map(({ id, label, icon }) => (
            <button key={id} type="button" onClick={() => { setActiveTab(id); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === id ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-slate-600 hover:bg-slate-100'}`}>
              {icon}<span>{label}</span>
            </button>
          ))}
          <div className="pt-6">
            <p className="px-4 text-[9px] font-black text-slate-300 uppercase tracking-widest mb-2">Support</p>
            <button type="button" onClick={() => { setActiveTab('profile'); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'profile' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-slate-600 hover:bg-slate-100'}`}>
              <Settings size={19} /><span>Profile & Settings</span>
            </button>
          </div>
        </nav>

        {/* User card */}
        <div className="p-4 border-t border-slate-100">
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl">
            {profilePicUrl
              ? <img src={profilePicUrl} alt={fullName} className="w-10 h-10 rounded-full object-cover" />
              : <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-black">{myInitials}</div>}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">{fullName}</p>
              <p className="text-[10px] text-slate-400">Lead Facilitator</p>
            </div>
            <button type="button" onClick={() => { setActiveTab('profile'); setSidebarOpen(false); }} className="text-slate-400 hover:text-blue-600 transition-colors" title="Profile">
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

      {/* ═══════════════ MAIN CONTENT ═══════════════ */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Top header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => setSidebarOpen(true)} className="lg:hidden w-9 h-9 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100">
              <Menu size={20} />
            </button>
            <h2 className="text-lg font-black">{PAGE_TITLES[activeTab]}</h2>
            {activeTab === 'participants' && (
              <>
                <div className="h-5 w-px bg-slate-200 hidden sm:block" />
                <span className="text-sm text-slate-400 hidden sm:block">{filtered.length} attendee{filtered.length !== 1 ? 's' : ''}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            {(activeTab === 'participants' || activeTab === 'overview') && (
              <div className="relative hidden sm:block">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                  className="pl-9 pr-4 py-2 bg-slate-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 w-56"
                  placeholder="Search by name or ID…" />
              </div>
            )}
            <button type="button" className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 relative">
              <Bell size={17} />
              {pendingCount > 0 && <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-[9px] text-white font-black flex items-center justify-center">{pendingCount}</span>}
            </button>
            <button type="button" onClick={() => setScanMode({ type: 'entrance' })}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-md shadow-blue-200 hover:bg-blue-700 transition-colors">
              <ScanLine size={15} /><span className="hidden sm:inline">Scan Entrance</span>
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* ══ OVERVIEW ══ */}
          {activeTab === 'overview' && (
            <>
              {/* Stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {[
                  { label: 'Checked In',   value: checkedInCount, sub: `+${Math.round((checkedInCount/Math.max(1,approvedCount))*100)}%`, subCls: 'text-emerald-500' },
                  { label: 'Speakers',     value: speakersCount,  sub: 'On Track', subCls: 'text-blue-500' },
                  { label: 'Session Rooms',value: rooms.length,   sub: `/ ${rooms.length} total`, subCls: 'text-slate-400' },
                  { label: 'Pending',      value: pendingCount,   sub: pendingCount > 0 ? 'Needs Review' : 'All Clear', subCls: pendingCount > 0 ? 'text-red-500' : 'text-emerald-500' },
                ].map(({ label, value, sub, subCls }) => (
                  <div key={label} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-sm text-slate-500 mb-1">{label}</p>
                    <div className="flex items-end gap-2">
                      <span className="text-3xl font-black">{value.toLocaleString()}</span>
                      <span className={`text-xs font-bold mb-1 ${subCls}`}>{sub}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Quick Action Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {[
                  { label: 'Scan Entrance', icon: <ScanLine size={22} />, color: 'bg-blue-600', action: () => setScanMode({ type: 'entrance' }) },
                  { label: 'Participants',   icon: <Users size={22} />,   color: 'bg-indigo-500', action: () => setActiveTab('participants') },
                  { label: 'Rooms',          icon: <BookOpen size={22} />, color: 'bg-purple-500', action: () => setActiveTab('calendar') },
                  { label: 'My Digital ID',  icon: <CreditCard size={22} />, color: 'bg-emerald-500', action: () => setIdModal(true) },
                ].map(({ label, icon, color, action }) => (
                  <button key={label} type="button" onClick={action}
                    className={`${color} text-white p-5 rounded-2xl flex flex-col items-start gap-3 hover:opacity-90 transition-opacity shadow-sm`}>
                    {icon}
                    <span className="text-sm font-bold">{label}</span>
                  </button>
                ))}
              </div>

              {/* Recent Activity */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <h3 className="text-base font-black mb-4">Recent Entrance Check-ins</h3>
                {attendance.filter((a) => a.type === 'entrance').length === 0 ? (
                  <p className="text-sm text-slate-400 py-4 text-center">No check-ins recorded yet. Use "Scan Entrance" to begin.</p>
                ) : (
                  <div className="space-y-3">
                    {attendance.filter((a) => a.type === 'entrance').slice(-5).reverse().map((a) => {
                      const p = participants.find((pp) => pp.uid === a.uid);
                      const date = a.createdAt?.toDate ? a.createdAt.toDate() : new Date();
                      return (
                        <div key={a.id} className="flex items-center gap-3">
                          {p?.profilePictureUrl
                            ? <img src={p.profilePictureUrl} alt={p.fullName} className="w-9 h-9 rounded-full object-cover" />
                            : <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-black ${avatarColors(p?.fullName || '')}`}>{initials(p?.fullName || '??')}</div>}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold">{p?.fullName || a.uid}</p>
                            <p className="text-[11px] text-slate-400">{p?.sector || '—'}</p>
                          </div>
                          <p className="text-xs text-slate-400 shrink-0">{date.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}</p>
                          <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ══ PARTICIPANTS ══ */}
          {activeTab === 'participants' && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              {/* Filters */}
              <div className="p-5 border-b border-slate-200 flex flex-wrap gap-3 items-center justify-between">
                <div className="flex flex-wrap gap-2">
                  {/* Role filter */}
                  <div className="relative">
                    <select value={filterRole} onChange={(e) => { setFilterRole(e.target.value); setPage(1); }}
                      className="appearance-none pl-4 pr-8 py-2 bg-blue-50 text-blue-600 border border-blue-200 rounded-full text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer">
                      <option value="">All Roles</option>
                      {uniqueSectors.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <ChevronRight size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 rotate-90 text-blue-500 pointer-events-none" />
                  </div>
                  {/* Status filter */}
                  <div className="relative">
                    <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
                      className="appearance-none pl-4 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-full text-sm font-medium text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer">
                      <option value="">Travel Status</option>
                      <option value="approved">Approved</option>
                      <option value="pending">Pending</option>
                    </select>
                    <ChevronRight size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 rotate-90 text-slate-400 pointer-events-none" />
                  </div>
                </div>
                {/* Mobile search */}
                <div className="sm:hidden relative w-full">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                    className="w-full pl-9 pr-4 py-2 bg-slate-100 rounded-xl text-sm outline-none" placeholder="Search…" />
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-slate-400 text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Name &amp; ID</th>
                      <th className="px-5 py-4 font-semibold">Role</th>
                      <th className="px-5 py-4 font-semibold hidden lg:table-cell">Accommodation</th>
                      <th className="px-5 py-4 font-semibold hidden xl:table-cell">Travel / Flight</th>
                      <th className="px-5 py-4 font-semibold">Status</th>
                      <th className="px-6 py-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginated.length === 0 ? (
                      <tr><td colSpan={6} className="px-6 py-14 text-center text-slate-400">
                        <Users size={36} className="mx-auto mb-2 text-slate-200" /><p>No participants found.</p>
                      </td></tr>
                    ) : paginated.map((p) => {
                      const sb = statusBadge(p);
                      return (
                        <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-5">
                            <div className="flex items-center gap-3">
                              {p.profilePictureUrl
                                ? <img src={p.profilePictureUrl} alt={p.fullName} className="w-10 h-10 rounded-full object-cover" />
                                : <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-black ${avatarColors(p.fullName)}`}>{initials(p.fullName)}</div>}
                              <div>
                                <p className="font-bold text-sm">{p.fullName}</p>
                                <p className="text-xs text-slate-400">{shortId(p.id)}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-5">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${sectorBadge(p.sector)}`}>{p.sector || 'Participant'}</span>
                          </td>
                          <td className="px-5 py-5 hidden lg:table-cell">
                            {p.accommodationHotel ? (
                              <div>
                                <p className="text-sm font-medium">{p.accommodationHotel}{p.accommodationRoom ? ` ${p.accommodationRoom}` : ''}</p>
                                {p.accommodationCheckIn && <p className="text-xs text-slate-400">Check-in: {p.accommodationCheckIn}</p>}
                              </div>
                            ) : <span className="text-xs text-slate-300">—</span>}
                          </td>
                          <td className="px-5 py-5 hidden xl:table-cell">
                            {p.flightRoute || p.flightNumber ? (
                              <div className="flex items-start gap-2">
                                {p.travelDelay
                                  ? <AlertTriangle size={15} className="text-red-500 mt-0.5 shrink-0" />
                                  : p.transportMode === 'bus' ? <Bus size={15} className="text-slate-400 mt-0.5 shrink-0" />
                                  : <Plane size={15} className="text-slate-400 mt-0.5 shrink-0" />}
                                <div>
                                  <p className={`text-sm font-medium ${p.travelDelay ? 'text-red-500' : ''}`}>
                                    {p.flightRoute || p.transportMode || '—'} {p.flightNumber ? `(${p.flightNumber})` : ''}
                                  </p>
                                  {p.arrivalTime && <p className="text-xs text-slate-400">{p.travelDelay ? 'Delayed: ' : 'Arriving '}{p.arrivalTime}</p>}
                                </div>
                              </div>
                            ) : <span className="text-xs text-slate-300">—</span>}
                          </td>
                          <td className="px-5 py-5">
                            <div className={`flex items-center gap-1.5 ${sb.cls}`}>
                              <div className="w-1.5 h-1.5 rounded-full bg-current" />
                              <span className="text-xs font-bold">{sb.label}</span>
                            </div>
                          </td>
                          <td className="px-6 py-5 text-right">
                            <button type="button" onClick={() => setSelectedParticipant(p)} className="text-slate-400 hover:text-blue-600 transition-colors">
                              <MoreHorizontal size={20} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="p-5 bg-slate-50 flex items-center justify-between flex-wrap gap-3">
                <p className="text-xs text-slate-400 font-medium">Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} participants</p>
                <div className="flex items-center gap-1.5">
                  <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 disabled:opacity-40 hover:border-blue-400 hover:text-blue-600 transition-all"><ChevronLeft size={15} /></button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((p) => (
                    <button key={p} onClick={() => setPage(p)} className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold transition-colors ${p === page ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100 border border-slate-200'}`}>{p}</button>
                  ))}
                  {totalPages > 5 && <><span className="text-slate-400 px-1">…</span><button onClick={() => setPage(totalPages)} className="w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold text-slate-500 border border-slate-200 hover:bg-slate-100">{totalPages}</button></>}
                  <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 disabled:opacity-40 hover:border-blue-400 hover:text-blue-600 transition-all"><ChevronRight size={15} /></button>
                </div>
              </div>
            </div>
          )}

          {/* ══ ACCOMMODATIONS ══ */}
          {activeTab === 'accommodations' && (
            <div>
              <div className="mb-5">
                <h2 className="text-xl font-black">Accommodation Details</h2>
                <p className="text-slate-400 text-sm mt-1">View hotel and check-in details for all registered attendees</p>
              </div>
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-slate-400 text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Name &amp; ID</th>
                      <th className="px-5 py-4 font-semibold">Role</th>
                      <th className="px-5 py-4 font-semibold">Hotel / Venue</th>
                      <th className="px-5 py-4 font-semibold">Room</th>
                      <th className="px-5 py-4 font-semibold">Check-in Date</th>
                      <th className="px-5 py-4 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {participants.filter((p) => p.status === 'approved').map((p) => {
                      const sb = statusBadge(p);
                      return (
                        <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              {p.profilePictureUrl
                                ? <img src={p.profilePictureUrl} alt={p.fullName} className="w-9 h-9 rounded-full object-cover" />
                                : <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-black ${avatarColors(p.fullName)}`}>{initials(p.fullName)}</div>}
                              <div>
                                <p className="font-bold text-sm">{p.fullName}</p>
                                <p className="text-[11px] text-slate-400">{shortId(p.id)}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4"><span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${sectorBadge(p.sector)}`}>{p.sector || 'Participant'}</span></td>
                          <td className="px-5 py-4 text-sm font-medium">{p.accommodationHotel || <span className="text-slate-300">—</span>}</td>
                          <td className="px-5 py-4 text-sm">{p.accommodationRoom || <span className="text-slate-300">—</span>}</td>
                          <td className="px-5 py-4 text-sm text-slate-500">{p.accommodationCheckIn || <span className="text-slate-300">—</span>}</td>
                          <td className="px-5 py-4">
                            <div className={`flex items-center gap-1.5 ${sb.cls}`}>
                              <div className="w-1.5 h-1.5 rounded-full bg-current" />
                              <span className="text-xs font-bold">{sb.label}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══ TRAVEL ══ */}
          {activeTab === 'travel' && (
            <div>
              <div className="mb-5">
                <h2 className="text-xl font-black">Travel Schedule</h2>
                <p className="text-slate-400 text-sm mt-1">Flight and ground transport details for all attendees</p>
              </div>
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-slate-400 text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Name &amp; ID</th>
                      <th className="px-5 py-4 font-semibold">Role</th>
                      <th className="px-5 py-4 font-semibold">Travel / Flight</th>
                      <th className="px-5 py-4 font-semibold">Arrival</th>
                      <th className="px-5 py-4 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {participants.filter((p) => p.status === 'approved').map((p) => {
                      const sb = statusBadge(p);
                      return (
                        <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              {p.profilePictureUrl
                                ? <img src={p.profilePictureUrl} alt={p.fullName} className="w-9 h-9 rounded-full object-cover" />
                                : <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-black ${avatarColors(p.fullName)}`}>{initials(p.fullName)}</div>}
                              <div>
                                <p className="font-bold text-sm">{p.fullName}</p>
                                <p className="text-[11px] text-slate-400">{shortId(p.id)}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4"><span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${sectorBadge(p.sector)}`}>{p.sector || 'Participant'}</span></td>
                          <td className="px-5 py-4">
                            {p.flightRoute || p.flightNumber ? (
                              <div className="flex items-center gap-2">
                                {p.travelDelay ? <AlertTriangle size={14} className="text-red-500 shrink-0" /> : <Plane size={14} className="text-slate-400 shrink-0" />}
                                <div>
                                  <p className={`text-sm font-medium ${p.travelDelay ? 'text-red-500' : ''}`}>{p.flightRoute || p.transportMode || '—'} {p.flightNumber ? `(${p.flightNumber})` : ''}</p>
                                </div>
                              </div>
                            ) : <span className="text-sm text-slate-300">—</span>}
                          </td>
                          <td className="px-5 py-4 text-sm text-slate-500">{p.arrivalTime || <span className="text-slate-300">—</span>}</td>
                          <td className="px-5 py-4">
                            <div className={`flex items-center gap-1.5 ${sb.cls}`}>
                              <div className="w-1.5 h-1.5 rounded-full bg-current" />
                              <span className="text-xs font-bold">{sb.label}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══ CALENDAR (Rooms / Sessions) ══ */}
          {activeTab === 'calendar' && (
            <div>
              <div className="mb-5">
                <h2 className="text-xl font-black">Event Calendar — Session Rooms</h2>
                <p className="text-slate-400 text-sm mt-1">Monitor session capacity and scan room attendance</p>
              </div>
              {rooms.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm py-16 text-center text-slate-400">
                  <CalendarDays size={40} className="mx-auto mb-3 text-slate-200" />
                  <p className="font-medium">No session rooms set up yet</p>
                  <p className="text-sm mt-1">Contact the event admin to create rooms.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {rooms.map((room) => {
                    const roomReservations = reservations.filter((r) => r.roomId === room.id);
                    const roomAttendees    = attendance.filter((a) => a.type === 'room' && a.roomId === room.id);
                    const cap              = room.capacity || 0;
                    const pct              = cap > 0 ? Math.min(100, (roomReservations.length / cap) * 100) : 0;
                    return (
                      <div key={room.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col gap-4">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0"><BookOpen size={18} className="text-blue-600" /></div>
                          <div className="flex-1 min-w-0">
                            <p className="font-black text-base leading-tight">{room.name}</p>
                            {room.presenter && <p className="text-xs text-slate-400 mt-0.5">Presenter: {room.presenter}</p>}
                            {room.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{room.description}</p>}
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between text-xs font-medium text-slate-500 mb-1">
                            <span>Reservations</span>
                            <span>{roomReservations.length}{cap > 0 ? ` / ${cap}` : ''}</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs text-slate-400">
                            <CheckCircle2 size={13} className="text-emerald-500" />{roomAttendees.length} checked in
                          </div>
                          <button type="button" onClick={() => setScanMode({ type: 'room', room })}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-full text-xs font-bold hover:bg-blue-100 transition-colors">
                            <QrCode size={13} /> Scan Room
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ══ PROFILE ══ */}
          {activeTab === 'profile' && (
            <div className="max-w-2xl">
              <div className="space-y-4">
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
                  {profilePicUrl
                    ? <img src={profilePicUrl} alt={fullName} className="w-16 h-16 rounded-full object-cover ring-2 ring-blue-100" />
                    : <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-black">{myInitials}</div>}
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-lg">{fullName}</p>
                    <p className="text-sm text-slate-500">{user.email}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">Facilitator</span>
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
                      { label: 'Sector',       value: registration?.sector },
                      { label: 'Organization', value: registration?.sectorOffice },
                      { label: 'Position',     value: registration?.positionTitle },
                      { label: 'Contact',      value: registration?.contactNumber },
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
        </div>
      </main>

      {/* ═══════════════ PARTICIPANT DETAIL DRAWER ═══════════════ */}
      {selectedParticipant && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedParticipant(null)} />
          <div className="fixed top-0 right-0 z-50 h-full w-full max-w-sm bg-white shadow-2xl flex flex-col overflow-y-auto">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-start gap-4 shrink-0">
              {selectedParticipant.profilePictureUrl
                ? <img src={selectedParticipant.profilePictureUrl} alt={selectedParticipant.fullName} className="w-14 h-14 rounded-full object-cover ring-2 ring-blue-100" />
                : <div className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-black ${avatarColors(selectedParticipant.fullName)}`}>{initials(selectedParticipant.fullName)}</div>}
              <div className="flex-1 min-w-0">
                <p className="font-black text-base">{selectedParticipant.fullName}</p>
                <p className="text-xs text-slate-400">{shortId(selectedParticipant.id)}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sectorBadge(selectedParticipant.sector)}`}>{selectedParticipant.sector || 'Participant'}</span>
                  {(() => { const sb = statusBadge(selectedParticipant); return <span className={`text-[10px] font-bold ${sb.cls}`}>● {sb.label}</span>; })()}
                </div>
              </div>
              <button type="button" onClick={() => setSelectedParticipant(null)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200 shrink-0"><X size={15} /></button>
            </div>

            <div className="flex-1 p-5 space-y-5">
              {/* Contact */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Contact</p>
                <div className="space-y-1.5 text-sm">
                  {selectedParticipant.email && <p className="text-slate-600"><span className="text-slate-400">Email: </span>{selectedParticipant.email}</p>}
                  {selectedParticipant.contactNumber && <p className="text-slate-600"><span className="text-slate-400">Phone: </span>{selectedParticipant.contactNumber}</p>}
                  {selectedParticipant.sectorOffice && <p className="text-slate-600"><span className="text-slate-400">Org: </span>{selectedParticipant.sectorOffice}</p>}
                </div>
              </div>

              {/* Accommodation */}
              {(selectedParticipant.accommodationHotel || selectedParticipant.accommodationRoom) && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Accommodation</p>
                  <div className="bg-slate-50 rounded-xl p-3 flex items-start gap-2 text-sm">
                    <BedDouble size={16} className="text-slate-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium">{selectedParticipant.accommodationHotel}</p>
                      {selectedParticipant.accommodationRoom && <p className="text-slate-500 text-xs">{selectedParticipant.accommodationRoom}</p>}
                      {selectedParticipant.accommodationCheckIn && <p className="text-slate-400 text-xs">Check-in: {selectedParticipant.accommodationCheckIn}</p>}
                    </div>
                  </div>
                </div>
              )}

              {/* Travel */}
              {(selectedParticipant.flightRoute || selectedParticipant.flightNumber) && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Travel / Flight</p>
                  <div className={`rounded-xl p-3 flex items-start gap-2 text-sm ${selectedParticipant.travelDelay ? 'bg-red-50' : 'bg-slate-50'}`}>
                    {selectedParticipant.travelDelay ? <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" /> : <Plane size={16} className="text-slate-400 mt-0.5 shrink-0" />}
                    <div>
                      <p className={`font-medium ${selectedParticipant.travelDelay ? 'text-red-600' : ''}`}>{selectedParticipant.flightRoute} {selectedParticipant.flightNumber ? `(${selectedParticipant.flightNumber})` : ''}</p>
                      {selectedParticipant.arrivalTime && <p className="text-xs text-slate-500">{selectedParticipant.travelDelay ? 'Delayed: ' : 'Arriving '}{selectedParticipant.arrivalTime}</p>}
                    </div>
                  </div>
                </div>
              )}

              {/* Reservations */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Session Reservations</p>
                {participantReservations(selectedParticipant.uid).length === 0
                  ? <p className="text-xs text-slate-300 py-2">No reservations found.</p>
                  : participantReservations(selectedParticipant.uid).map((r) => {
                      const room = rooms.find((rm) => rm.id === r.roomId);
                      const isAttended = attendance.some((a) => a.uid === selectedParticipant.uid && a.roomId === r.roomId && a.type === 'room');
                      return (
                        <div key={r.id} className="flex items-center gap-2 py-2 border-b border-slate-100 last:border-0">
                          <BookOpen size={14} className="text-blue-400 shrink-0" />
                          <span className="text-sm flex-1">{room?.name || r.roomId}</span>
                          {isAttended ? <CheckCircle2 size={14} className="text-emerald-500 shrink-0" /> : <Clock size={14} className="text-slate-300 shrink-0" />}
                        </div>
                      );
                    })}
              </div>

              {/* Attendance history */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Attendance</p>
                {participantAttendance(selectedParticipant.uid).length === 0
                  ? <p className="text-xs text-slate-300 py-2">No check-ins recorded.</p>
                  : participantAttendance(selectedParticipant.uid).map((a) => {
                      const date = a.createdAt?.toDate ? a.createdAt.toDate() : new Date();
                      return (
                        <div key={a.id} className="flex items-center gap-2 py-2 border-b border-slate-100 last:border-0">
                          <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                          <span className="text-sm flex-1 capitalize">{a.type === 'entrance' ? 'Main Entrance' : (a as any).roomName || a.type}</span>
                          <span className="text-xs text-slate-400">{date.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      );
                    })}
              </div>
            </div>

            {/* Scan entrance shortcut */}
            {!checkedInSet.has(selectedParticipant.uid) && (
              <div className="p-5 border-t border-slate-100 shrink-0">
                <button type="button" onClick={() => setScanMode({ type: 'entrance' })}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors">
                  <ScanLine size={16} /> Mark Entrance (Scan)
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══════════════ QR SCANNER ═══════════════ */}
      {scanMode && !scanLoading && (
        <QrScanModal
          title={scanMode.type === 'entrance' ? 'Scan Entrance QR' : `Scan for: ${scanMode.room.name}`}
          subtitle={scanMode.type === 'entrance' ? 'Scan participant digital ID to record main entrance check-in' : `Verify reservation and mark attendance for this room`}
          onClose={() => setScanMode(null)}
          onResult={handleScanResult}
        />
      )}

      {scanLoading && (
        <div className="fixed inset-0 z-[90] bg-black/70 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-8 flex flex-col items-center gap-3">
            <Loader2 className="animate-spin text-blue-600" size={32} />
            <p className="text-sm font-bold">Processing QR…</p>
          </div>
        </div>
      )}

      {/* ═══════════════ DIGITAL ID ═══════════════ */}
      {idModal && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xs bg-white rounded-3xl overflow-hidden shadow-2xl">
            <div className="bg-indigo-600 px-4 py-3 flex items-center justify-between">
              <div><p className="text-white text-xs font-black tracking-widest uppercase">iSCENE 2026</p><p className="text-indigo-200 text-[10px]">Facilitator Staff Pass</p></div>
              <button type="button" onClick={() => setIdModal(false)} className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white"><X size={14} /></button>
            </div>
            <div className="px-5 py-5 flex flex-col items-center bg-gradient-to-b from-white to-slate-50">
              {profilePicUrl
                ? <img src={profilePicUrl} alt={fullName} className="w-20 h-20 rounded-full object-cover mb-3 ring-4 ring-indigo-100 shadow-md" />
                : <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-700 flex items-center justify-center text-2xl font-black text-white mb-3 ring-4 ring-indigo-100">{myInitials}</div>}
              <h3 className="text-base font-black text-center">{fullName}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{registration?.sectorOffice || 'Facilitator'}</p>
              <span className="mt-2 px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-bold">Lead Facilitator</span>
              <div className="mt-4 p-3 bg-white rounded-2xl shadow-sm border border-slate-100">
                <img src={qrImgSrc} alt="QR" className="w-44 h-44" />
              </div>
              <p className="mt-2 text-[11px] text-slate-400 font-mono tracking-widest">ID #{user.uid.slice(0, 8).toUpperCase()}</p>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[10px] text-slate-400">April 9–11, 2026</span>
              <a href={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(qrData)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline">
                <Download size={11} /> Download
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
