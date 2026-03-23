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
  Camera,
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
import { db, auth } from './firebase';
import { QrScanModal } from './QrScanModal';

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Types
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Helpers
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Main Component - QrScanModal imported from ./QrScanModal
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Main Component
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type Props = { user: FirebaseUser; registration: any; onSignOut: () => Promise<void> };

function FacilitatorDashboard({ user, registration, onSignOut }: Props) {
  const fullName   = (registration?.fullName as string) || user.email || 'Facilitator';
  const profilePicUrl = (registration?.profilePictureUrl as string | undefined) || null;
  const myInitials = initials(fullName);

  // â”€â”€ Nav â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [activeTab, setActiveTab] = React.useState<Tab>('overview');
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  // â”€â”€ Data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [participants, setParticipants]   = React.useState<ParticipantReg[]>([]);
  const [rooms,        setRooms]          = React.useState<Room[]>([]);
  const [reservations, setReservations]   = React.useState<Reservation[]>([]);
  const [attendance,   setAttendance]     = React.useState<AttendanceRecord[]>([]);
  const [loading,      setLoading]        = React.useState(true);

  // â”€â”€ Participant table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [searchQuery,   setSearchQuery]   = React.useState('');
  const [filterRole,    setFilterRole]    = React.useState('');
  const [filterStatus,  setFilterStatus]  = React.useState('');
  const [page,          setPage]          = React.useState(1);
  const PAGE_SIZE = 8;

  // â”€â”€ Detail modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [selectedParticipant, setSelectedParticipant] = React.useState<ParticipantReg | null>(null);

  // â”€â”€ QR Scan state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  type ScanMode = { type: 'entrance' } | { type: 'room'; room: Room };
  const [scanMode,    setScanMode]    = React.useState<ScanMode | null>(null);
  const [scanLoading, setScanLoading] = React.useState(false);

  // â”€â”€ Modals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [idModal, setIdModal] = React.useState(false);

  // â”€â”€ Toast â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [toast, setToast] = React.useState<{ msg: string; ok: boolean } | null>(null);
  const showToast = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 4500); };

  // â”€â”€ Profile â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [pwResetSent, setPwResetSent] = React.useState(false);

  // â”€â”€ Digital ID â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const qrData   = `https://iscene.app/verify?uid=${user.uid}&name=${encodeURIComponent(fullName)}&role=facilitator`;
  const qrImgSrc = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrData)}`;

  // â”€â”€ Load data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Derived stats â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const approvedCount   = participants.filter((p) => p.status === 'approved').length;
  const checkedInCount  = new Set(attendance.filter((a) => a.type === 'entrance').map((a) => a.uid)).size;
  const speakersCount   = participants.filter((p) => p.sector === 'Speakers').length;
  const pendingCount    = participants.filter((p) => p.status === 'pending').length;
  const checkedInSet    = new Set(attendance.filter((a) => a.type === 'entrance').map((a) => a.uid));
  const reservedSet     = new Set(reservations.map((r) => r.uid));

  // â”€â”€ Filtered participants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ QR Scan result handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleScanResult = async (text: string) => {
    if (!scanMode) return;
    // Delay showing loading spinner so the QrScanModal's 1500ms success animation can finish
    const startLoading = setTimeout(() => setScanLoading(true), 1600);
    try {
      const trimmed = (text || '').trim();
      let uid: string | null = null;
      try {
        const urlStr = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
        const url = new URL(urlStr);
        uid = url.searchParams.get('uid');
      } catch {
        const match = trimmed.match(/[?&]uid=([^&\s]+)/);
        uid = match ? decodeURIComponent(match[1]) : null;
      }
      if (!uid) { showToast('âŒ Invalid QR â€” no UID found.', false); setScanMode(null); return; }

      const regQuery = query(collection(db, 'registrations'), where('uid', '==', uid), limit(1));
      const regSnap  = await getDocs(regQuery);
      if (regSnap.empty) { showToast('âŒ No registration found for this QR.', false); setScanMode(null); return; }
      const regData  = regSnap.docs[0].data() as any;
      const pName    = regData.fullName || uid;

      if (regData.status !== 'approved') {
        showToast(`âš ï¸ ${pName} is not yet approved.`, false);
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
        showToast(`âœ… ${pName} â€” Entrance check-in recorded!`);
      } else {
        const room = scanMode.room;
        const hasReservation = reservations.some((r) => r.uid === uid && r.roomId === room.id);
        if (!hasReservation) {
          showToast(`âš ï¸ ${pName} has no reservation for "${room.name}".`, false);
        } else {
          const docId = `${uid}_${room.id}`;
          await setDoc(doc(db, 'attendance', docId), {
            uid, type: 'room', roomId: room.id, roomName: room.name, recordedBy: user.uid, createdAt: Timestamp.now(),
          }, { merge: true });
          setAttendance((prev) => {
            const f = prev.filter((a) => a.id !== docId);
            return [...f, { id: docId, uid, type: 'room', roomId: room.id, createdAt: Timestamp.now() }];
          });
          showToast(`âœ… ${pName} â€” Checked into "${room.name}"!`);
        }
      }
    } catch (err) {
      console.error(err);
      showToast('âŒ Failed to process QR. Try again.', false);
    } finally {
      clearTimeout(startLoading);
      setScanLoading(false);
    }
  };

  // â”€â”€ Status badge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const statusBadge = (p: ParticipantReg) => {
    if (checkedInSet.has(p.uid))      return { label: 'Checked In', cls: 'text-blue-500' };
    if (p.status === 'approved')      return { label: 'Confirmed',  cls: 'text-emerald-500' };
    return                                   { label: 'Pending',    cls: 'text-amber-500' };
  };

  // â”€â”€ Participant detail getters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const participantReservations = (uid: string) => reservations.filter((r) => r.uid === uid);
  const participantAttendance   = (uid: string) => attendance.filter((a) => a.uid === uid);

  // â”€â”€ Sidebar nav items â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Page title mapping
  const PAGE_TITLES: Record<Tab, string> = {
    overview:       'Overview',
    participants:   'Participant Management',
    accommodations: 'Accommodations',
    travel:         'Travel Schedule',
    calendar:       'Event Calendar',
    profile:        'My Profile',
  };

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] px-5 py-3 rounded-2xl text-sm font-semibold shadow-lg ${toast.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* â”€â”€ Mobile sidebar backdrop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• SIDEBAR â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
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

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• MAIN CONTENT â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
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
                  placeholder="Search by name or IDâ€¦" />
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

          {/* â•â• OVERVIEW â•â• */}
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
                            <p className="text-[11px] text-slate-400">{p?.sector || 'â€”'}</p>
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

          {/* â•â• PARTICIPANTS â•â• */}
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
                    className="w-full pl-9 pr-4 py-2 bg-slate-100 rounded-xl text-sm outline-none" placeholder="Searchâ€¦" />
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
                            ) : <span className="text-xs text-slate-300">â€”</span>}
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
                                    {p.flightRoute || p.transportMode || 'â€”'} {p.flightNumber ? `(${p.flightNumber})` : ''}
                                  </p>
                                  {p.arrivalTime && <p className="text-xs text-slate-400">{p.travelDelay ? 'Delayed: ' : 'Arriving '}{p.arrivalTime}</p>}
                                </div>
                              </div>
                            ) : <span className="text-xs text-slate-300">â€”</span>}
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
                <p className="text-xs text-slate-400 font-medium">Showing {(page - 1) * PAGE_SIZE + 1}â€“{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} participants</p>
                <div className="flex items-center gap-1.5">
                  <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 disabled:opacity-40 hover:border-blue-400 hover:text-blue-600 transition-all"><ChevronLeft size={15} /></button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((p) => (
                    <button key={p} onClick={() => setPage(p)} className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold transition-colors ${p === page ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100 border border-slate-200'}`}>{p}</button>
                  ))}
                  {totalPages > 5 && <><span className="text-slate-400 px-1">â€¦</span><button onClick={() => setPage(totalPages)} className="w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold text-slate-500 border border-slate-200 hover:bg-slate-100">{totalPages}</button></>}
                  <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 disabled:opacity-40 hover:border-blue-400 hover:text-blue-600 transition-all"><ChevronRight size={15} /></button>
                </div>
              </div>
            </div>
          )}

          {/* â•â• ACCOMMODATIONS â•â• */}
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
                          <td className="px-5 py-4 text-sm font-medium">{p.accommodationHotel || <span className="text-slate-300">â€”</span>}</td>
                          <td className="px-5 py-4 text-sm">{p.accommodationRoom || <span className="text-slate-300">â€”</span>}</td>
                          <td className="px-5 py-4 text-sm text-slate-500">{p.accommodationCheckIn || <span className="text-slate-300">â€”</span>}</td>
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

          {/* â•â• TRAVEL â•â• */}
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
                                  <p className={`text-sm font-medium ${p.travelDelay ? 'text-red-500' : ''}`}>{p.flightRoute || p.transportMode || 'â€”'} {p.flightNumber ? `(${p.flightNumber})` : ''}</p>
                                </div>
                              </div>
                            ) : <span className="text-sm text-slate-300">â€”</span>}
                          </td>
                          <td className="px-5 py-4 text-sm text-slate-500">{p.arrivalTime || <span className="text-slate-300">â€”</span>}</td>
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

          {/* â•â• CALENDAR (Rooms / Sessions) â•â• */}
          {activeTab === 'calendar' && (
            <div>
              <div className="mb-5">
                <h2 className="text-xl font-black">Event Calendar â€” Session Rooms</h2>
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

          {/* â•â• PROFILE â•â• */}
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
                        {registration?.status === 'approved' ? 'âœ“ Approved' : 'â³ Pending'}
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
                      <div key={label}><p className="text-[11px] text-slate-400 mb-0.5">{label}</p><p className="font-semibold text-xs">{value || 'â€”'}</p></div>
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

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PARTICIPANT DETAIL DRAWER â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
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
                  {(() => { const sb = statusBadge(selectedParticipant); return <span className={`text-[10px] font-bold ${sb.cls}`}>â— {sb.label}</span>; })()}
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

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• QR SCANNER â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {scanMode && (
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
            <p className="text-sm font-bold">Processing QRâ€¦</p>
          </div>
        </div>
      )}

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• DIGITAL ID â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
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
              <span className="text-[10px] text-slate-400">April 9â€“11, 2026</span>
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

export { FacilitatorDashboard };
