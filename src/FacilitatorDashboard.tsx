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
  Utensils,
  DoorOpen,
  ClipboardList,
  BarChart3,
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
  onSnapshot,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { getEntranceCalendarDateKey } from './entranceCheckInDay';
import { registrationSectorEligibleForMeal } from './mealEligibility';
import { MealEntitlementCard } from './MealEntitlementCard';
import { QrScanModal } from './QrScanModal';
import { formatSessionDateTime, getBreakoutRoomScheduleBlockReason } from './sessionRoomUtils';

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Types
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type Tab =
  | 'overview'
  | 'analytics'
  | 'participants'
  | 'accommodations'
  | 'travel'
  | 'calendar'
  | 'meals'
  | 'profile'
  | 'breakouts'
  | 'foodReports';

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
  accommodationHotel?: string;
  accommodationRoom?: string;
  accommodationCheckIn?: string;
  flightNumber?: string;
  flightRoute?: string;
  arrivalTime?: string;
  transportMode?: string;
  travelDelay?: boolean;
  paymentMethod?: string;
  exhibitorBoothCategory?: string;
  notes?: string;
} & Record<string, unknown>;

type Room = {
  id: string;
  name: string;
  description?: string;
  capacity?: number;
  presenter?: string;
  presenterNames?: string[];
  sessionDate?: string;
  timeline?: string;
  venue?: string;
  backgroundImage?: string;
};

type Reservation = {
  id: string;
  uid: string;
  roomId: string;
  roomName?: string;
  attended?: boolean;
};

type AttendanceRecord = {
  id: string;
  uid: string;
  type: string;
  roomId?: string;
  roomName?: string;
  createdAt: any;
};

type MealWindow = {
  id: string;
  type: string;
  itemType?: 'food' | 'kit' | 'both';
  name?: string;
  location?: string;
  foodLocationDetails?: string;
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
  claimedAt: unknown;
  participantUid?: string;
  participantName?: string;
  participantRegId?: string;
  sector?: string;
  mealType?: string;
  mealName?: string;
  sessionDate?: string;
  claimedBy?: string;
  claimedByName?: string;
};

const MEAL_LABELS: Record<string, string> = {
  breakfast: '🌅 Breakfast',
  snacks: '🍪 Snacks (AM)',
  lunch: '🍱 Lunch',
  snacks_pm: '🥤 Snacks (PM)',
  dinner: '🍽️ Dinner',
  kit: 'Kit',
};

function foodClaimTimeMs(c: FoodClaim): number {
  const raw = c.claimedAt as { toDate?: () => Date } | undefined;
  try {
    return raw?.toDate ? raw.toDate().getTime() : 0;
  } catch {
    return 0;
  }
}

/** Booth operators set `boothBackgroundUrl` in the food/exhibitor booth app; older docs may use other keys. */
function boothBackgroundFromReg(b: Record<string, unknown>): string | undefined {
  for (const key of ['boothBackgroundUrl', 'backgroundImage', 'boothBackgroundImage'] as const) {
    const v = b[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

function mealTypeReportBadgeClass(mealType: string | undefined): string {
  const t = (mealType || '').toLowerCase();
  if (t === 'kit') return 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200/80';
  if (
    t === 'food' ||
    t === 'lunch' ||
    t === 'dinner' ||
    t === 'breakfast' ||
    t === 'snacks' ||
    t === 'snacks_pm'
  ) {
    return 'bg-orange-100 text-orange-900 ring-1 ring-orange-200/80';
  }
  return 'bg-slate-100 text-slate-700 ring-1 ring-slate-200/80';
}

function mealTypeReportBadgeText(mealType: string | undefined): string {
  if (!mealType) return '';
  return mealType.replace(/_/g, ' ').toUpperCase();
}

function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatRegValue(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object' && v !== null && 'toDate' in v && typeof (v as { toDate?: () => Date }).toDate === 'function') {
    try {
      return (v as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return String(v);
    }
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const lines = [headers.map(csvEscape).join(','), ...rows.map((r) => r.map(csvEscape).join(','))];
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener noreferrer';
  a.setAttribute('download', filename);
  document.body.appendChild(a);
  a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 2500);
}

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
  const registrationId = registration?.id as string | undefined;
  const facilitatorSector = (registration?.sector as string) || '';

  // â”€â”€ Nav â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [activeTab, setActiveTab] = React.useState<Tab>('overview');
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  // â”€â”€ Data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [participants, setParticipants]   = React.useState<ParticipantReg[]>([]);
  const [rooms,        setRooms]          = React.useState<Room[]>([]);
  const [reservations, setReservations]   = React.useState<Reservation[]>([]);
  const [attendance,   setAttendance]     = React.useState<AttendanceRecord[]>([]);
  const [loading,      setLoading]        = React.useState(true);
  const [meals, setMeals] = React.useState<MealWindow[]>([]);
  const [allFoodClaims, setAllFoodClaims] = React.useState<FoodClaim[]>([]);
  const [boothRegs, setBoothRegs] = React.useState<
    {
      id?: string;
      uid?: string;
      fullName?: string;
      boothLocationDetails?: string;
      status?: string;
      sector?: string;
      boothBackgroundUrl?: string;
      profilePictureUrl?: string;
      sectorOffice?: string;
      contactNumber?: string;
    }[]
  >([]);
  const [claimClockTick, setClaimClockTick] = React.useState(() => Date.now());

  // â”€â”€ Participant table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [searchQuery,   setSearchQuery]   = React.useState('');
  const [filterRole,    setFilterRole]    = React.useState('');
  const [filterStatus,  setFilterStatus]  = React.useState('');
  const [page,          setPage]          = React.useState(1);
  const PAGE_SIZE = 8;

  // â”€â”€ Detail modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [breakoutSearch, setBreakoutSearch] = React.useState('');
  const [breakoutDateFilter, setBreakoutDateFilter] = React.useState<string>('all');
  const [breakoutAvailabilityFilter, setBreakoutAvailabilityFilter] = React.useState<'all' | 'open' | 'closed'>('all');
  const [breakoutDetailRoom, setBreakoutDetailRoom] = React.useState<Room | null>(null);
  const [calendarSearch, setCalendarSearch] = React.useState('');
  const [calendarDateFilter, setCalendarDateFilter] = React.useState<string>('all');
  const [entranceDateFilter, setEntranceDateFilter] = React.useState<string>('all');
  const [entranceSearch, setEntranceSearch] = React.useState('');
  const [entranceRoleFilter, setEntranceRoleFilter] = React.useState<string>('all');

  const [foodReportSearch, setFoodReportSearch] = React.useState('');
  const [foodReportMealType, setFoodReportMealType] = React.useState<string>('all');
  const [foodReportSector, setFoodReportSector] = React.useState<string>('all');
  const [foodReportDateFrom, setFoodReportDateFrom] = React.useState('');
  const [foodReportDateTo, setFoodReportDateTo] = React.useState('');
  const [foodReportPage, setFoodReportPage] = React.useState(1);
  const FOOD_REPORT_PAGE = 15;

  const [selectedParticipant, setSelectedParticipant] = React.useState<ParticipantReg | null>(null);

  // â”€â”€ QR Scan state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  type ScanMode = { type: 'entrance' };
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

  React.useEffect(() => {
    const id = window.setInterval(() => setClaimClockTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  React.useEffect(() => {
    const unsubMeals = onSnapshot(
      query(collection(db, 'meals'), orderBy('createdAt', 'desc')),
      (snap) => setMeals(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MealWindow, 'id'>) }))),
      () => setMeals([]),
    );
    const unsubClaims = onSnapshot(
      collection(db, 'foodClaims'),
      (snap) =>
        setAllFoodClaims(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FoodClaim, 'id'>) })),
        ),
      () => setAllFoodClaims([]),
    );
    const unsubBooths = onSnapshot(
      query(collection(db, 'registrations'), where('sector', 'in', ['Exhibitor (Booth)', 'Exhibitor', 'Food (Booth)'])),
      (snap) =>
        setBoothRegs(
          snap.docs.filter((d) => d.data().status === 'approved').map((d) => ({ id: d.id, ...d.data() })),
        ),
      () => setBoothRegs([]),
    );
    return () => {
      unsubMeals();
      unsubClaims();
      unsubBooths();
    };
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
      const email = String(p.email || '').toLowerCase();
      const q = searchQuery.toLowerCase();
      const matchSearch =
        !searchQuery ||
        fullName.includes(q) ||
        uid.includes(searchQuery) ||
        id.includes(searchQuery) ||
        email.includes(q);
      const matchRole   = !filterRole   || p.sector === filterRole;
      const matchStatus = !filterStatus || p.status === filterStatus;
      return matchSearch && matchRole && matchStatus;
    });
  }, [participants, searchQuery, filterRole, filterStatus]);

  const totalPages    = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated     = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const uniqueSectors = Array.from(new Set(participants.map((p) => p.sector).filter(Boolean)));

  const eligibleMeals = React.useMemo(
    () => meals.filter((m) => registrationSectorEligibleForMeal(m, registrationId, facilitatorSector)),
    [meals, registrationId, facilitatorSector],
  );
  const myFoodClaims = React.useMemo(
    () => allFoodClaims.filter((c) => c.participantUid === user.uid),
    [allFoodClaims, user.uid],
  );
  const hasClaimedMeal = (mealId: string) => myFoodClaims.some((c) => c.mealId === mealId);
  const mealsBadgeDisplay = eligibleMeals.filter((m) => !hasClaimedMeal(m.id)).length;

  const foodBoothCount = React.useMemo(
    () => boothRegs.filter((b) => (b.sector || '').includes('Food')).length,
    [boothRegs],
  );
  const exhibitorBoothCount = React.useMemo(
    () => boothRegs.filter((b) => !(b.sector || '').includes('Food')).length,
    [boothRegs],
  );

  const breakoutRoomDates = React.useMemo(() => {
    const keys = new Set<string>();
    for (const r of rooms) {
      const raw = r.sessionDate ? String(r.sessionDate).split('T')[0] : '';
      if (raw) keys.add(raw);
    }
    return Array.from(keys).sort();
  }, [rooms]);

  const calendarRoomDates = React.useMemo(() => {
    const keys = new Set<string>();
    for (const r of rooms) {
      const raw = r.sessionDate ? String(r.sessionDate).split('T')[0] : '';
      if (raw) keys.add(raw);
    }
    return Array.from(keys).sort();
  }, [rooms]);

  const filteredCalendarRooms = React.useMemo(() => {
    const q = calendarSearch.trim().toLowerCase();
    return rooms.filter((r) => {
      const dateKey = r.sessionDate ? String(r.sessionDate).split('T')[0] : '';
      if (calendarDateFilter !== 'all' && dateKey !== calendarDateFilter) return false;
      if (!q) return true;
      const name = (r.name || '').toLowerCase();
      const venue = (r.venue || '').toLowerCase();
      const presenter = (r.presenter || '').toLowerCase();
      const presenters = (r.presenterNames || []).join(' ').toLowerCase();
      return name.includes(q) || venue.includes(q) || presenter.includes(q) || presenters.includes(q);
    });
  }, [rooms, calendarSearch, calendarDateFilter]);

  const filteredBreakoutRooms = React.useMemo(() => {
    const q = breakoutSearch.trim().toLowerCase();
    return rooms.filter((r) => {
      const dateKey = r.sessionDate ? String(r.sessionDate).split('T')[0] : '';
      if (breakoutDateFilter !== 'all' && dateKey !== breakoutDateFilter) return false;
      const blocked = !!getBreakoutRoomScheduleBlockReason(r, new Date());
      if (breakoutAvailabilityFilter === 'open' && blocked) return false;
      if (breakoutAvailabilityFilter === 'closed' && !blocked) return false;
      if (!q) return true;
      const name = (r.name || '').toLowerCase();
      const venue = (r.venue || '').toLowerCase();
      const pres = (r.presenterNames || []).join(' ').toLowerCase();
      return name.includes(q) || venue.includes(q) || pres.includes(q);
    });
  }, [rooms, breakoutSearch, breakoutDateFilter, breakoutAvailabilityFilter]);

  const breakoutRoomsByDate = React.useMemo(() => {
    const groups = new Map<string, Room[]>();
    for (const room of filteredBreakoutRooms) {
      const key = room.sessionDate ? String(room.sessionDate).split('T')[0] : 'unscheduled';
      const arr = groups.get(key) || [];
      arr.push(room);
      groups.set(key, arr);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => {
        if (a === 'unscheduled') return 1;
        if (b === 'unscheduled') return -1;
        return a.localeCompare(b);
      })
      .map(([dateKey, roomsInDate]) => ({
        dateKey,
        label: dateKey === 'unscheduled' ? 'Unscheduled' : dateKey,
        rooms: roomsInDate,
      }));
  }, [filteredBreakoutRooms]);

  const filteredFoodReportClaims = React.useMemo(() => {
    return allFoodClaims.filter((c) => {
      const name = (c.participantName || '').toLowerCase();
      const mealN = (c.mealName || '').toLowerCase();
      const mt = c.mealType || '';
      const sec = c.sector || '';
      if (foodReportMealType !== 'all' && mt !== foodReportMealType) return false;
      if (foodReportSector !== 'all' && sec !== foodReportSector) return false;
      const d = c.claimedAt && typeof (c.claimedAt as { toDate?: () => Date }).toDate === 'function'
        ? (c.claimedAt as { toDate: () => Date }).toDate()
        : c.claimedAt
          ? new Date(c.claimedAt as string)
          : new Date(0);
      if (foodReportDateFrom) {
        const from = new Date(`${foodReportDateFrom}T00:00:00`);
        if (d < from) return false;
      }
      if (foodReportDateTo) {
        const to = new Date(`${foodReportDateTo}T23:59:59.999`);
        if (d > to) return false;
      }
      const sq = foodReportSearch.trim().toLowerCase();
      if (!sq) return true;
      return (
        name.includes(sq) ||
        mealN.includes(sq) ||
        (c.participantUid || '').toLowerCase().includes(sq) ||
        (c.claimedByName || '').toLowerCase().includes(sq)
      );
    });
  }, [allFoodClaims, foodReportSearch, foodReportMealType, foodReportSector, foodReportDateFrom, foodReportDateTo]);

  const entranceCheckInDates = React.useMemo(() => {
    const keys = new Set<string>();
    for (const a of attendance) {
      if (a.type !== 'entrance') continue;
      const dt = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || Date.now());
      const key = dt.toISOString().slice(0, 10);
      keys.add(key);
    }
    return Array.from(keys).sort().reverse();
  }, [attendance]);

  const entranceRoleOptions = React.useMemo(() => {
    const set = new Set<string>();
    for (const p of participants) {
      if (p.sector) set.add(p.sector);
    }
    return Array.from(set).sort();
  }, [participants]);

  const filteredEntranceCheckIns = React.useMemo(() => {
    const allEntrance = attendance.filter((a) => a.type === 'entrance');
    const byDay = allEntrance.filter((a) => {
      if (entranceDateFilter === 'all') return true;
      const dt = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || Date.now());
      return dt.toISOString().slice(0, 10) === entranceDateFilter;
    });
    const q = entranceSearch.trim().toLowerCase();
    const byRoleAndSearch = byDay.filter((a) => {
      const p = participants.find((pp) => pp.uid === a.uid);
      if (entranceRoleFilter !== 'all' && (p?.sector || '') !== entranceRoleFilter) return false;
      if (!q) return true;
      const name = (p?.fullName || '').toLowerCase();
      const sector = (p?.sector || '').toLowerCase();
      const uid = (a.uid || '').toLowerCase();
      return name.includes(q) || sector.includes(q) || uid.includes(q);
    });
    return byRoleAndSearch
      .slice()
      .sort((a, b) => {
        const ad = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
        const bd = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
        return bd - ad;
      });
  }, [attendance, entranceDateFilter, entranceSearch, entranceRoleFilter, participants]);

  const foodReportTotalPages = Math.max(1, Math.ceil(filteredFoodReportClaims.length / FOOD_REPORT_PAGE));
  const foodReportSlice = filteredFoodReportClaims.slice(
    (foodReportPage - 1) * FOOD_REPORT_PAGE,
    foodReportPage * FOOD_REPORT_PAGE,
  );

  const uniqueClaimSectors = React.useMemo(
    () => Array.from(new Set(allFoodClaims.map((c) => c.sector).filter(Boolean))) as string[],
    [allFoodClaims],
  );

  const foodClaimsByBoothUid = React.useMemo(() => {
    const m = new Map<string, FoodClaim[]>();
    for (const c of allFoodClaims) {
      const uid = c.claimedBy;
      if (!uid) continue;
      if (!m.has(uid)) m.set(uid, []);
      m.get(uid)!.push(c);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => foodClaimTimeMs(b) - foodClaimTimeMs(a));
    }
    return m;
  }, [allFoodClaims]);

  const entranceRate = approvedCount > 0 ? Math.round((checkedInCount / approvedCount) * 100) : 0;
  const roomAttendanceUniqueCount = React.useMemo(
    () => new Set(attendance.filter((a) => a.type === 'room').map((a) => a.uid)).size,
    [attendance],
  );
  const mealClaimsUniqueCount = React.useMemo(
    () => new Set(allFoodClaims.map((c) => c.participantUid).filter(Boolean)).size,
    [allFoodClaims],
  );
  const roomStats = React.useMemo(
    () =>
      rooms
        .map((room) => {
          const roomRes = reservations.filter((r) => r.roomId === room.id);
          const roomAtt = attendance.filter((a) => a.type === 'room' && a.roomId === room.id);
          const reserved = roomRes.length;
          const checkedIn = new Set(roomAtt.map((a) => a.uid)).size;
          const capacity = Number(room.capacity || 0);
          const reserveRate = capacity > 0 ? Math.round((reserved / capacity) * 100) : 0;
          return { room, reserved, checkedIn, capacity, reserveRate };
        })
        .sort((a, b) => b.reserved - a.reserved),
    [rooms, reservations, attendance],
  );
  const sectorStats = React.useMemo(
    () =>
      Object.entries(
        participants.reduce<Record<string, number>>((acc, p) => {
          const key = p.sector || 'Unspecified';
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {}),
      ).sort((a, b) => b[1] - a[1]),
    [participants],
  );

  const exportParticipantsCsv = () => {
    const headers = [
      'fullName',
      'email',
      'uid',
      'registrationDocId',
      'sector',
      'status',
      'positionTitle',
      'sectorOffice',
      'contactNumber',
      'accommodationHotel',
      'accommodationRoom',
      'accommodationCheckIn',
      'flightRoute',
      'flightNumber',
      'arrivalTime',
      'transportMode',
      'travelDelay',
      'entranceCheckedIn',
      'breakoutReservations',
      'breakoutRoomsCheckedIn',
    ];
    const rows = filtered.map((p) => {
      const entrance = attendance.some((a) => a.uid === p.uid && a.type === 'entrance');
      const resCount = reservations.filter((r) => r.uid === p.uid).length;
      const roomCheckIns = attendance.filter((a) => a.uid === p.uid && a.type === 'room').length;
      return [
        p.fullName,
        p.email ?? '',
        p.uid,
        p.id,
        p.sector,
        p.status,
        p.positionTitle ?? '',
        p.sectorOffice ?? '',
        p.contactNumber ?? '',
        p.accommodationHotel ?? '',
        p.accommodationRoom ?? '',
        p.accommodationCheckIn ?? '',
        p.flightRoute ?? '',
        p.flightNumber ?? '',
        p.arrivalTime ?? '',
        p.transportMode ?? '',
        p.travelDelay ? 'yes' : 'no',
        entrance ? 'yes' : 'no',
        String(resCount),
        String(roomCheckIns),
      ];
    });
    downloadCsv(`iscene2026_participants_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
    showToast(`Exported ${rows.length} row(s).`);
  };

  const exportBreakoutsCsv = () => {
    const headers = [
      'roomId',
      'roomName',
      'sessionDate',
      'timeline',
      'venue',
      'capacity',
      'reservationsCount',
      'uniqueCheckedIn',
      'checkedInNames',
      'reservedNames',
    ];
    const rows = filteredBreakoutRooms.map((room) => {
      const roomRes = reservations.filter((r) => r.roomId === room.id);
      const roomAtt = attendance.filter((a) => a.type === 'room' && a.roomId === room.id);
      const checkedNames = Array.from(
        new Set(
          roomAtt.map((a) => participants.find((pp) => pp.uid === a.uid)?.fullName || a.uid),
        ),
      ).join('; ');
      const reservedNames = Array.from(
        new Set(roomRes.map((r) => participants.find((pp) => pp.uid === r.uid)?.fullName || r.uid)),
      ).join('; ');
      return [
        room.id,
        room.name,
        room.sessionDate ? String(room.sessionDate).split('T')[0] : '',
        room.timeline ?? '',
        room.venue ?? '',
        String(room.capacity ?? ''),
        String(roomRes.length),
        String(new Set(roomAtt.map((a) => a.uid)).size),
        checkedNames,
        reservedNames,
      ];
    });
    downloadCsv(`iscene2026_breakout_rooms_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
    showToast(`Exported ${rows.length} room(s).`);
  };

  const exportFoodClaimsCsv = () => {
    const headers = [
      'participantName',
      'participantUid',
      'sector',
      'mealName',
      'mealType',
      'sessionDate',
      'claimedAt',
      'claimedByName',
    ];
    const rows = filteredFoodReportClaims.map((c) => {
      const at =
        c.claimedAt && typeof (c.claimedAt as { toDate?: () => Date }).toDate === 'function'
          ? (c.claimedAt as { toDate: () => Date }).toDate().toISOString()
          : '';
      return [
        c.participantName ?? '',
        c.participantUid ?? '',
        c.sector ?? '',
        c.mealName ?? '',
        c.mealType ?? '',
        c.sessionDate ? String(c.sessionDate).split('T')[0] : '',
        at,
        c.claimedByName ?? '',
      ];
    });
    downloadCsv(`iscene2026_food_claims_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
    showToast(`Exported ${rows.length} claim(s).`);
  };

  const exportAnalyticsCsv = () => {
    const headers = ['roomId', 'roomName', 'capacity', 'reserved', 'checkedIn', 'reserveRatePercent'];
    const rows = roomStats.map((s) => [
      s.room.id,
      s.room.name,
      String(s.capacity || ''),
      String(s.reserved),
      String(s.checkedIn),
      String(s.reserveRate),
    ]);
    downloadCsv(`iscene2026_facilitator_analytics_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
    showToast(`Exported ${rows.length} analytics row(s).`);
  };

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

      const docId = `${uid}_entrance`;
      await setDoc(
        doc(db, 'attendance', docId),
        {
          uid,
          type: 'entrance',
          entranceDateKey: getEntranceCalendarDateKey(),
          recordedBy: user.uid,
          createdAt: Timestamp.now(),
        },
        { merge: true },
      );
      setAttendance((prev) => {
        const filtered = prev.filter((a) => a.id !== docId);
        return [...filtered, { id: docId, uid, type: 'entrance', createdAt: Timestamp.now() }];
      });
      showToast(`âœ… ${pName} â€” Entrance check-in recorded!`);
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
    { id: 'analytics'     as Tab, label: 'Analytics',       icon: <BarChart3 size={19} /> },
    { id: 'participants'  as Tab, label: 'Participants',     icon: <Users size={19} /> },
    { id: 'meals'         as Tab, label: 'My entitlements', icon: <Utensils size={19} /> },
    { id: 'calendar'      as Tab, label: 'Event Calendar',   icon: <CalendarDays size={19} /> },
    { id: 'breakouts'     as Tab, label: 'Breakout rooms',   icon: <DoorOpen size={19} /> },
    { id: 'foodReports'   as Tab, label: 'Food & booths',    icon: <ClipboardList size={19} /> },
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
    analytics:      'Analytics',
    participants:   'Participant Management',
    accommodations: 'Accommodations',
    travel:         'Travel Schedule',
    meals:          'My Entitlements',
    calendar:       'Event Calendar \u2014 Session Rooms',
    breakouts:      'Breakout rooms',
    foodReports:    'Food & booths',
    profile:        'My Profile',
  };

  const headerNeedsStackedLayout =
    activeTab === 'participants' || activeTab === 'breakouts' || activeTab === 'foodReports';

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
              {icon}
              <span className="flex-1 text-left">{label}</span>
              {id === 'meals' && mealsBadgeDisplay > 0 ? (
                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center ${activeTab === id ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'}`}>
                  {mealsBadgeDisplay > 99 ? '99+' : mealsBadgeDisplay}
                </span>
              ) : null}
            </button>
          ))}
          <div className="pt-6">
            <p className="px-4 text-[9px] font-black text-slate-300 uppercase tracking-widest mb-2">Support</p>
            <button type="button" onClick={() => { setActiveTab('accommodations'); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'accommodations' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-slate-600 hover:bg-slate-100'}`}>
              <BedDouble size={19} /><span>Accommodations</span>
            </button>
            <button type="button" onClick={() => { setActiveTab('travel'); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'travel' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-slate-600 hover:bg-slate-100'}`}>
              <Plane size={19} /><span>Travel Schedule</span>
            </button>
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

        {/* Top header — wraps on narrow screens; export always tappable */}
        <header className={`min-h-16 shrink-0 bg-white border-b border-slate-200 px-3 sm:px-6 ${headerNeedsStackedLayout ? 'py-2 sm:py-0 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:h-16' : 'py-0 h-16 flex items-center justify-between'}`}>
          <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-wrap">
            <button type="button" onClick={() => setSidebarOpen(true)} className="lg:hidden w-9 h-9 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 touch-manipulation shrink-0">
              <Menu size={20} />
            </button>
            <h2 className="text-base sm:text-lg font-black truncate max-w-[min(100%,12rem)] sm:max-w-none">{PAGE_TITLES[activeTab]}</h2>
            {activeTab === 'participants' && (
              <>
                <div className="h-5 w-px bg-slate-200 hidden sm:block" />
                <span className="text-xs sm:text-sm text-slate-400 whitespace-nowrap">{filtered.length} attendee{filtered.length !== 1 ? 's' : ''}</span>
              </>
            )}
            {activeTab === 'breakouts' && (
              <>
                <div className="h-5 w-px bg-slate-200 hidden sm:block" />
                <span className="text-xs sm:text-sm text-slate-400 whitespace-nowrap">{filteredBreakoutRooms.length} session{filteredBreakoutRooms.length !== 1 ? 's' : ''}</span>
              </>
            )}
            {activeTab === 'foodReports' && (
              <>
                <div className="h-5 w-px bg-slate-200 hidden sm:block" />
                <span className="text-xs sm:text-sm text-slate-400 whitespace-nowrap">{filteredFoodReportClaims.length} claim{filteredFoodReportClaims.length !== 1 ? 's' : ''}</span>
              </>
            )}
            {activeTab === 'analytics' && (
              <>
                <div className="h-5 w-px bg-slate-200 hidden sm:block" />
                <span className="text-xs sm:text-sm text-slate-400 whitespace-nowrap">{rooms.length} room{rooms.length !== 1 ? 's' : ''}</span>
              </>
            )}
          </div>
          <div className={`flex items-center gap-2 flex-wrap justify-end min-w-0 ${headerNeedsStackedLayout ? 'w-full sm:w-auto' : 'w-auto'}`}>
            {activeTab === 'participants' && (
              <div className="relative flex-1 min-w-0 sm:flex-initial sm:max-w-[14rem]">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                  className="w-full pl-9 pr-3 py-2.5 sm:py-2 bg-slate-100 rounded-xl text-base sm:text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Search name, email, ID" />
              </div>
            )}
            {activeTab === 'breakouts' && (
              <div className="relative flex-1 min-w-0 sm:flex-initial sm:max-w-[14rem]">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  value={breakoutSearch}
                  onChange={(e) => setBreakoutSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 sm:py-2 bg-slate-100 rounded-xl text-base sm:text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Search sessions"
                />
              </div>
            )}
            {activeTab === 'foodReports' && (
              <div className="relative flex-1 min-w-0 sm:flex-initial sm:max-w-[14rem]">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  value={foodReportSearch}
                  onChange={(e) => { setFoodReportSearch(e.target.value); setFoodReportPage(1); }}
                  className="w-full pl-9 pr-3 py-2.5 sm:py-2 bg-slate-100 rounded-xl text-base sm:text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Search name, meal, booth"
                />
              </div>
            )}
            {activeTab === 'participants' && (
              <button
                type="button"
                onClick={exportParticipantsCsv}
                className="inline-flex shrink-0 items-center gap-1.5 px-3 py-2.5 sm:py-2 rounded-xl border border-slate-200 text-slate-700 text-xs sm:text-sm font-bold hover:bg-slate-50 touch-manipulation active:scale-[0.98]"
              >
                <Download size={16} className="shrink-0" />{' '}
                <span className="hidden sm:inline">Export CSV</span>
                <span className="sm:hidden">Export</span>
              </button>
            )}
            {activeTab === 'breakouts' && (
              <button
                type="button"
                onClick={exportBreakoutsCsv}
                className="inline-flex shrink-0 items-center gap-1.5 px-3 py-2.5 sm:py-2 rounded-xl border border-slate-200 text-slate-700 text-xs sm:text-sm font-bold hover:bg-slate-50 touch-manipulation active:scale-[0.98]"
              >
                <Download size={16} className="shrink-0" /> Export
              </button>
            )}
            {activeTab === 'foodReports' && (
              <button
                type="button"
                onClick={exportFoodClaimsCsv}
                className="inline-flex shrink-0 items-center gap-1.5 px-3 py-2.5 sm:py-2 rounded-xl border border-slate-200 text-slate-700 text-xs sm:text-sm font-bold hover:bg-slate-50 touch-manipulation active:scale-[0.98]"
              >
                <Download size={16} className="shrink-0" /> Export
              </button>
            )}
            {activeTab === 'analytics' && (
              <button
                type="button"
                onClick={exportAnalyticsCsv}
                className="inline-flex shrink-0 items-center gap-1.5 px-3 py-2.5 sm:py-2 rounded-xl border border-slate-200 text-slate-700 text-xs sm:text-sm font-bold hover:bg-slate-50 touch-manipulation active:scale-[0.98]"
              >
                <Download size={16} className="shrink-0" /> Export
              </button>
            )}
            <button type="button" className="w-10 h-10 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 relative touch-manipulation shrink-0">
              <Bell size={17} />
              {pendingCount > 0 && <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-[9px] text-white font-black flex items-center justify-center">{pendingCount}</span>}
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-3 py-4 sm:p-6">

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
                <div className="mb-4 flex flex-col gap-2">
                  <h3 className="text-base font-black">Recent Entrance Check-ins</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input
                        value={entranceSearch}
                        onChange={(e) => setEntranceSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Search name, role, UID"
                      />
                    </div>
                    <select
                      value={entranceRoleFilter}
                      onChange={(e) => setEntranceRoleFilter(e.target.value)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                    >
                      <option value="all">All roles</option>
                      {entranceRoleOptions.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                    <select
                      value={entranceDateFilter}
                      onChange={(e) => setEntranceDateFilter(e.target.value)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                    >
                      <option value="all">All days</option>
                      {entranceCheckInDates.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {filteredEntranceCheckIns.length === 0 ? (
                  <p className="text-sm text-slate-400 py-4 text-center">No check-ins recorded yet. Use "Scan Entrance" to begin.</p>
                ) : (
                  <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                    {filteredEntranceCheckIns.map((a) => {
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
                          <p className="text-xs text-slate-400 shrink-0">{date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true })}</p>
                          <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'analytics' && (
            <div>
              <div className="mb-5">
                <h2 className="text-xl font-black lg:hidden">Event analytics</h2>
                <p className="text-slate-400 text-sm mt-1 lg:mt-0">Attendance, room utilization, and participant distribution</p>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                  <p className="text-xs text-slate-500 font-medium">Approved participants</p>
                  <p className="text-2xl font-black mt-1">{approvedCount}</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">eligible</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                  <p className="text-xs text-slate-500 font-medium">Entrance check-in rate</p>
                  <p className="text-2xl font-black mt-1">{entranceRate}%</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">{checkedInCount} checked in</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                  <p className="text-xs text-slate-500 font-medium">Breakout participation</p>
                  <p className="text-2xl font-black mt-1">{roomAttendanceUniqueCount}</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">unique attendees</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                  <p className="text-xs text-slate-500 font-medium">Meal claim coverage</p>
                  <p className="text-2xl font-black mt-1">{mealClaimsUniqueCount}</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">unique claimants</p>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <div className="xl:col-span-1 bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                  <h3 className="text-sm font-black text-slate-800 mb-3">Participants by sector</h3>
                  {sectorStats.length === 0 ? (
                    <p className="text-sm text-slate-400 py-6 text-center">No participant data yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {sectorStats.slice(0, 8).map(([sector, count]) => {
                        const pct = participants.length > 0 ? Math.round((count / participants.length) * 100) : 0;
                        return (
                          <div key={sector}>
                            <div className="flex justify-between text-xs text-slate-600 mb-1">
                              <span className="truncate pr-2">{sector}</span>
                              <span className="font-semibold">{count} ({pct}%)</span>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <h3 className="text-sm font-black text-slate-800">Room utilization</h3>
                  </div>
                  <div className="overflow-x-auto overscroll-x-contain touch-pan-x [-webkit-overflow-scrolling:touch]">
                    <table className="w-full text-left text-sm min-w-[640px]">
                      <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Session</th>
                          <th className="px-4 py-3 font-semibold">Reserved</th>
                          <th className="px-4 py-3 font-semibold">Checked in</th>
                          <th className="px-4 py-3 font-semibold">Capacity</th>
                          <th className="px-4 py-3 font-semibold">Utilization</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {roomStats.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                              No room analytics available yet.
                            </td>
                          </tr>
                        ) : (
                          roomStats.map((s) => (
                            <tr key={s.room.id} className="hover:bg-slate-50/60">
                              <td className="px-4 py-3">
                                <p className="font-semibold text-slate-900">{s.room.name}</p>
                                <p className="text-xs text-slate-500 mt-0.5">{formatSessionDateTime(s.room)}</p>
                              </td>
                              <td className="px-4 py-3 font-semibold">{s.reserved}</td>
                              <td className="px-4 py-3 font-semibold text-emerald-700">{s.checkedIn}</td>
                              <td className="px-4 py-3">{s.capacity || '—'}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, s.reserveRate)}%` }} />
                                  </div>
                                  <span className="text-xs font-semibold text-slate-600 w-10 text-right">{s.reserveRate}%</span>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
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
              </div>

              {/* Table — horizontal scroll on small screens */}
              <div className="overflow-x-auto overscroll-x-contain touch-pan-x [-webkit-overflow-scrolling:touch]">
                <table className="w-full text-left min-w-[640px]">
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
                              <div className="min-w-0">
                                <p className="font-bold text-sm">{p.fullName}</p>
                                <p className="text-xs text-slate-400">{shortId(p.id)}</p>
                                <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                                  Role: {p.sector || 'Participant'}
                                </p>
                                {(p.positionTitle || p.sectorOffice) && (
                                  <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                                    {[p.positionTitle, p.sectorOffice].filter(Boolean).join(' • ')}
                                  </p>
                                )}
                                {(p.accommodationHotel || p.accommodationRoom) && (
                                  <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                                    Stay: {p.accommodationHotel || '—'}{p.accommodationRoom ? ` (${p.accommodationRoom})` : ''}
                                  </p>
                                )}
                                {(p.flightRoute || p.flightNumber || p.transportMode || p.arrivalTime) && (
                                  <p className={`text-[11px] mt-0.5 truncate ${p.travelDelay ? 'text-red-500' : 'text-slate-500'}`}>
                                    Travel: {p.flightRoute || p.transportMode || '—'}{p.flightNumber ? ` (${p.flightNumber})` : ''}{p.arrivalTime ? ` • ${p.arrivalTime}` : ''}
                                  </p>
                                )}
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
                <h2 className="text-xl font-black lg:hidden">Accommodation Details</h2>
                <p className="text-slate-400 text-sm mt-1 lg:mt-0">View hotel and check-in details for all registered attendees</p>
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

          {/* â•â• TRAVEL â•â• */}
          {activeTab === 'travel' && (
            <div>
              <div className="mb-5">
                <h2 className="text-xl font-black lg:hidden">Travel Schedule</h2>
                <p className="text-slate-400 text-sm mt-1 lg:mt-0">Flight and ground transport details for all attendees</p>
              </div>
              <div className="md:hidden space-y-3">
                {participants.filter((p) => p.status === 'approved').map((p) => {
                  const sb = statusBadge(p);
                  const travelText = [p.flightRoute || p.transportMode || '—', p.flightNumber ? `(${p.flightNumber})` : ''].filter(Boolean).join(' ');
                  return (
                    <div key={p.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                      <div className="flex items-center gap-3">
                        {p.profilePictureUrl
                          ? <img src={p.profilePictureUrl} alt={p.fullName} className="w-9 h-9 rounded-full object-cover" />
                          : <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-black ${avatarColors(p.fullName)}`}>{initials(p.fullName)}</div>}
                        <div className="min-w-0">
                          <p className="font-bold text-sm truncate">{p.fullName}</p>
                          <p className="text-[11px] text-slate-400">{shortId(p.id)}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${sectorBadge(p.sector)}`}>{p.sector || 'Participant'}</span>
                        <span className={`text-xs font-bold ${sb.cls}`}>{sb.label}</span>
                      </div>
                      <div className="mt-3 text-sm">
                        <p className={`font-medium ${p.travelDelay ? 'text-red-500' : 'text-slate-800'}`}>{travelText}</p>
                        <p className="text-xs text-slate-500 mt-1">{p.arrivalTime || '—'}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="hidden md:block bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto overscroll-x-contain touch-pan-x [-webkit-overflow-scrolling:touch]">
                  <table className="w-full text-left min-w-[760px]">
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
                        const hasTravel = !!(p.flightRoute || p.flightNumber || p.transportMode);
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
                              {hasTravel ? (
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
            </div>
          )}

          {/* â•â• MY ENTITLEMENTS â•â• */}
          {activeTab === 'meals' && (
            <div className="max-w-6xl mx-auto w-full">
              <div className="mb-6">
                <div className="lg:hidden">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Entitlements</p>
                  <h2 className="text-2xl font-black tracking-tight">My Entitlements</h2>
                </div>
                <p className="text-sm text-slate-500 mt-1 lg:mt-0">
                  Food, kits, and giveaways — during the pickup window, open Digital ID so the food booth can scan your QR.
                </p>
              </div>
              {eligibleMeals.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-400 shadow-sm text-sm">
                  No entitlements are configured for your registration sector yet. If you should receive meals, ask organizers to include{' '}
                  <strong>Facilitators</strong> (or your sector) on the meal window, or add you under eligible participants.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {eligibleMeals.map((meal) => (
                    <MealEntitlementCard
                      key={meal.id}
                      meal={meal}
                      mealLabels={MEAL_LABELS}
                      boothRegs={boothRegs}
                      now={new Date(claimClockTick)}
                      claimed={hasClaimedMeal(meal.id)}
                      onClaim={() => setIdModal(true)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* â•â• CALENDAR (Rooms / Sessions) â•â• */}
          {activeTab === 'calendar' && (
            <div>
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-xl font-black lg:hidden">
                    Event Calendar {'\u2014'} Session Rooms
                  </h2>
                  <p className="text-slate-400 text-sm mt-1 lg:mt-0">Monitor session capacity and attendance by day</p>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <div className="relative w-full sm:w-56">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      value={calendarSearch}
                      onChange={(e) => setCalendarSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Search session, venue, speaker"
                    />
                  </div>
                  <select
                    value={calendarDateFilter}
                    onChange={(e) => setCalendarDateFilter(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                  >
                    <option value="all">All dates</option>
                    {calendarRoomDates.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {filteredCalendarRooms.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm py-16 text-center text-slate-400">
                  <CalendarDays size={40} className="mx-auto mb-3 text-slate-200" />
                  <p className="font-medium">No session rooms match your filters.</p>
                  <p className="text-sm mt-1">Try a different day or search term.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredCalendarRooms.map((room) => {
                    const roomReservations = reservations.filter((r) => r.roomId === room.id);
                    const roomAttendees    = attendance.filter((a) => a.type === 'room' && a.roomId === room.id);
                    const cap              = room.capacity || 0;
                    const pct              = cap > 0 ? Math.min(100, (roomReservations.length / cap) * 100) : 0;
                    return (
                      <div key={room.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col gap-4">
                        {room.backgroundImage ? (
                          <div className="relative h-28 rounded-xl overflow-hidden">
                            <img src={room.backgroundImage} alt={`${room.name} background`} className="absolute inset-0 w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-slate-900/35" />
                            <div className="absolute left-3 right-3 bottom-2">
                              <p className="font-black text-white text-base leading-tight drop-shadow-sm">{room.name}</p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0"><BookOpen size={18} className="text-blue-600" /></div>
                            <div className="flex-1 min-w-0">
                              <p className="font-black text-base leading-tight">{room.name}</p>
                            </div>
                          </div>
                        )}
                        <div className="min-w-0">
                          {room.presenter && <p className="text-xs text-slate-500 mt-0.5">Presenter: {room.presenter}</p>}
                          {room.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{room.description}</p>}
                          <p className="text-xs text-slate-400 mt-1">{formatSessionDateTime(room)}</p>
                          {room.venue ? <p className="text-xs text-slate-400 mt-0.5">Venue: {room.venue}</p> : null}
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
                          <button type="button" onClick={() => setBreakoutDetailRoom(room)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">
                            View details
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'breakouts' && (
            <div>
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-xl font-black lg:hidden">Breakout sessions</h2>
                  <p className="text-slate-400 text-sm mt-1 lg:mt-0">Grouped by day with reservation and attendance details</p>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <div className="relative w-full sm:w-56">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      value={breakoutSearch}
                      onChange={(e) => setBreakoutSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Search session, venue, speaker"
                    />
                  </div>
                  <select
                    value={breakoutDateFilter}
                    onChange={(e) => setBreakoutDateFilter(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                  >
                    <option value="all">All dates</option>
                    {breakoutRoomDates.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <select
                    value={breakoutAvailabilityFilter}
                    onChange={(e) => setBreakoutAvailabilityFilter(e.target.value as 'all' | 'open' | 'closed')}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                  >
                    <option value="all">All windows</option>
                    <option value="open">Within schedule</option>
                    <option value="closed">Outside schedule</option>
                  </select>
                </div>
              </div>
              {filteredBreakoutRooms.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center text-slate-400">
                  <DoorOpen size={40} className="mx-auto mb-3 text-slate-200" />
                  <p>No sessions match your filters.</p>
                </div>
              ) : (
                <>
                  {breakoutRoomsByDate.map((group) => (
                    <section key={group.dateKey} className="mb-5 last:mb-0">
                      <div className="mb-2 flex items-center justify-between">
                        <h3 className="text-sm font-black text-slate-700">{group.label}</h3>
                        <span className="text-[11px] text-slate-400">{group.rooms.length} session{group.rooms.length !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="md:hidden space-y-3">
                        {group.rooms.map((room) => {
                          const roomRes = reservations.filter((r) => r.roomId === room.id);
                          const roomAtt = attendance.filter((a) => a.type === 'room' && a.roomId === room.id);
                          const uniqueIn = new Set(roomAtt.map((a) => a.uid)).size;
                          const capacity = Number(room.capacity || 0);
                          const fillRate = capacity > 0 ? Math.round((roomRes.length / capacity) * 100) : 0;
                          return (
                            <div key={room.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                              {room.backgroundImage ? (
                                <div className="relative h-28 rounded-xl overflow-hidden mb-3">
                                  <img src={room.backgroundImage} alt={`${room.name} background`} className="absolute inset-0 w-full h-full object-cover" />
                                  <div className="absolute inset-0 bg-slate-900/35" />
                                  <div className="absolute left-3 bottom-2 right-3">
                                    <p className="font-bold text-white leading-tight drop-shadow-sm">{room.name}</p>
                                  </div>
                                </div>
                              ) : (
                                <p className="font-bold text-slate-900">{room.name}</p>
                              )}
                              {room.presenterNames?.length ? <p className="text-xs text-slate-500 mt-1">{room.presenterNames.join(', ')}</p> : null}
                              <p className="text-sm text-slate-600 mt-2">{formatSessionDateTime(room)}</p>
                              {room.venue ? <p className="text-xs text-slate-500 mt-0.5">Venue: {room.venue}</p> : null}
                              <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                                <div className="rounded-lg bg-slate-50 py-2">
                                  <p className="text-[10px] text-slate-400">Reserved</p>
                                  <p className="text-sm font-semibold">{roomRes.length}</p>
                                </div>
                                <div className="rounded-lg bg-slate-50 py-2">
                                  <p className="text-[10px] text-slate-400">Checked in</p>
                                  <p className="text-sm font-semibold text-emerald-700">{uniqueIn}</p>
                                </div>
                                <div className="rounded-lg bg-slate-50 py-2">
                                  <p className="text-[10px] text-slate-400">Fill</p>
                                  <p className="text-sm font-semibold">{capacity > 0 ? `${fillRate}%` : '—'}</p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setBreakoutDetailRoom(room)}
                                className="w-full mt-3 py-2.5 rounded-xl border border-slate-200 text-blue-600 font-bold text-sm touch-manipulation"
                              >
                                View details
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto overscroll-x-contain touch-pan-x [-webkit-overflow-scrolling:touch]">
                          <table className="w-full text-left text-sm min-w-[860px]">
                            <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
                              <tr>
                                <th className="px-4 py-3 font-semibold">Session</th>
                                <th className="px-4 py-3 font-semibold">When</th>
                                <th className="px-4 py-3 font-semibold">Venue</th>
                                <th className="px-4 py-3 font-semibold">Capacity</th>
                                <th className="px-4 py-3 font-semibold">Reserved</th>
                                <th className="px-4 py-3 font-semibold">Checked in</th>
                                <th className="px-4 py-3 font-semibold">Fill rate</th>
                                <th className="px-4 py-3 font-semibold text-right">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {group.rooms.map((room) => {
                                const roomRes = reservations.filter((r) => r.roomId === room.id);
                                const roomAtt = attendance.filter((a) => a.type === 'room' && a.roomId === room.id);
                                const uniqueIn = new Set(roomAtt.map((a) => a.uid)).size;
                                const capacity = Number(room.capacity || 0);
                                const fillRate = capacity > 0 ? Math.round((roomRes.length / capacity) * 100) : 0;
                                return (
                                  <tr key={room.id} className="hover:bg-slate-50/60">
                                    <td className="px-4 py-3">
                                      <div className="flex items-center gap-2">
                                        {room.backgroundImage ? (
                                          <img
                                            src={room.backgroundImage}
                                            alt={`${room.name} background`}
                                            className="w-12 h-9 rounded-md object-cover border border-slate-200 shrink-0"
                                          />
                                        ) : (
                                          <div className="w-12 h-9 rounded-md border border-slate-200 bg-slate-50 shrink-0" />
                                        )}
                                        <div className="min-w-0">
                                          <p className="font-bold text-slate-900 truncate">{room.name}</p>
                                          {room.presenterNames?.length ? <p className="text-xs text-slate-500 mt-0.5 truncate">{room.presenterNames.join(', ')}</p> : null}
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatSessionDateTime(room)}</td>
                                    <td className="px-4 py-3 text-slate-600">{room.venue || '—'}</td>
                                    <td className="px-4 py-3">{capacity || '—'}</td>
                                    <td className="px-4 py-3 font-semibold">{roomRes.length}</td>
                                    <td className="px-4 py-3 font-semibold text-emerald-700">{uniqueIn}</td>
                                    <td className="px-4 py-3">{capacity > 0 ? `${fillRate}%` : '—'}</td>
                                    <td className="px-4 py-3 text-right whitespace-nowrap">
                                      <button
                                        type="button"
                                        onClick={() => setBreakoutDetailRoom(room)}
                                        className="text-blue-600 font-bold text-xs hover:underline"
                                      >
                                        View details
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </section>
                  ))}
                </>
              )}
            </div>
          )}

          {activeTab === 'foodReports' && (
            <div>
              <div className="mb-6">
                <h2 className="text-xl font-black lg:hidden">Food & booth reporting</h2>
                <p className="text-slate-400 text-sm mt-1 lg:mt-0">Booth registrations, meal entitlements, and recorded claims</p>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                {[
                  { label: 'Food booths', value: foodBoothCount, sub: 'approved' },
                  { label: 'Exhibitor booths', value: exhibitorBoothCount, sub: 'approved' },
                  { label: 'Meal entitlements', value: meals.length, sub: 'configured' },
                  { label: 'Total claims', value: allFoodClaims.length, sub: 'recorded' },
                ].map(({ label, value, sub }) => (
                  <div key={label} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                    <p className="text-xs text-slate-500 font-medium">{label}</p>
                    <p className="text-2xl font-black mt-1">{value}</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">{sub}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                <select
                  value={foodReportMealType}
                  onChange={(e) => { setFoodReportMealType(e.target.value); setFoodReportPage(1); }}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="all">All meal types</option>
                  {Array.from(new Set(meals.map((m) => m.type).filter(Boolean))).map((t) => (
                    <option key={t} value={t}>
                      {MEAL_LABELS[t] || t}
                    </option>
                  ))}
                </select>
                <select
                  value={foodReportSector}
                  onChange={(e) => { setFoodReportSector(e.target.value); setFoodReportPage(1); }}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm min-w-[8rem]"
                >
                  <option value="all">All sectors</option>
                  {uniqueClaimSectors.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={foodReportDateFrom}
                  onChange={(e) => { setFoodReportDateFrom(e.target.value); setFoodReportPage(1); }}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
                <input
                  type="date"
                  value={foodReportDateTo}
                  onChange={(e) => { setFoodReportDateTo(e.target.value); setFoodReportPage(1); }}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              {foodReportSlice.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm py-16 text-center text-slate-400">
                  No claims match your filters.
                </div>
              ) : (
                <>
                  <div className="md:hidden space-y-3 max-h-80 overflow-y-auto pr-1">
                    {foodReportSlice.map((c) => {
                      const at =
                        c.claimedAt && typeof (c.claimedAt as { toDate?: () => Date }).toDate === 'function'
                          ? (c.claimedAt as { toDate: () => Date }).toDate().toLocaleString('en-PH')
                          : '—';
                      return (
                        <div key={c.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                          <p className="font-semibold text-slate-900">{c.participantName || '—'}</p>
                          {c.participantUid ? (
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">{c.participantUid}</p>
                          ) : null}
                          <dl className="mt-3 space-y-1.5 text-sm">
                            <div className="flex justify-between gap-2">
                              <dt className="text-slate-500">Sector</dt>
                              <dd className="font-medium text-slate-700 text-right">{c.sector || '—'}</dd>
                            </div>
                            <div className="flex justify-between gap-2">
                              <dt className="text-slate-500">Meal</dt>
                              <dd className="font-medium text-slate-900 text-right">
                                {c.mealName || MEAL_LABELS[c.mealType || ''] || c.mealType || '—'}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-2">
                              <dt className="text-slate-500">Type</dt>
                              <dd className="text-right">
                                {c.mealType ? (
                                  <span
                                    className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${mealTypeReportBadgeClass(c.mealType)}`}
                                  >
                                    {mealTypeReportBadgeText(c.mealType)}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-2">
                              <dt className="text-slate-500">Session date</dt>
                              <dd className="text-slate-700">{c.sessionDate ? String(c.sessionDate).split('T')[0] : '—'}</dd>
                            </div>
                            <div className="flex justify-between gap-2">
                              <dt className="text-slate-500">Booth / staff</dt>
                              <dd className="text-xs text-slate-600 text-right">{c.claimedByName || '—'}</dd>
                            </div>
                            <div className="flex justify-between gap-2 pt-1 border-t border-slate-100">
                              <dt className="text-slate-500">Claimed</dt>
                              <dd className="text-xs text-slate-500">{at}</dd>
                            </div>
                          </dl>
                        </div>
                      );
                    })}
                  </div>
                  <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="overflow-auto max-h-[28rem] overscroll-contain [-webkit-overflow-scrolling:touch]">
                      <table className="w-full text-left text-sm min-w-[640px]">
                        <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
                          <tr>
                            <th className="px-4 py-3 font-semibold">Participant</th>
                            <th className="px-4 py-3 font-semibold hidden sm:table-cell">Sector</th>
                            <th className="px-4 py-3 font-semibold">Meal</th>
                            <th className="px-4 py-3 font-semibold whitespace-nowrap">Type</th>
                            <th className="px-4 py-3 font-semibold hidden md:table-cell">Session date</th>
                            <th className="px-4 py-3 font-semibold hidden lg:table-cell">Booth / staff</th>
                            <th className="px-4 py-3 font-semibold">Claimed</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {foodReportSlice.map((c) => {
                            const at =
                              c.claimedAt && typeof (c.claimedAt as { toDate?: () => Date }).toDate === 'function'
                                ? (c.claimedAt as { toDate: () => Date }).toDate().toLocaleString('en-PH')
                                : '—';
                            return (
                              <tr key={c.id} className="hover:bg-slate-50/60">
                                <td className="px-4 py-3">
                                  <p className="font-semibold text-slate-900">{c.participantName || '—'}</p>
                                  <p className="text-[10px] text-slate-400 font-mono">{c.participantUid || ''}</p>
                                </td>
                                <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">{c.sector || '—'}</td>
                                <td className="px-4 py-3">
                                  <span className="font-medium">{c.mealName || MEAL_LABELS[c.mealType || ''] || c.mealType || '—'}</span>
                                </td>
                                <td className="px-4 py-3 align-middle">
                                  {c.mealType ? (
                                    <span
                                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${mealTypeReportBadgeClass(c.mealType)}`}
                                    >
                                      {mealTypeReportBadgeText(c.mealType)}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-slate-600 hidden md:table-cell whitespace-nowrap">
                                  {c.sessionDate ? String(c.sessionDate).split('T')[0] : '—'}
                                </td>
                                <td className="px-4 py-3 text-slate-600 hidden lg:table-cell text-xs">{c.claimedByName || '—'}</td>
                                <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{at}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {foodReportTotalPages > 1 && (
                      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-t border-slate-100 text-sm">
                        <span className="text-slate-500">
                          Page {foodReportPage} / {foodReportTotalPages}
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={foodReportPage <= 1}
                            onClick={() => setFoodReportPage((p) => Math.max(1, p - 1))}
                            className="px-3 py-1 rounded-lg border border-slate-200 disabled:opacity-40"
                          >
                            Prev
                          </button>
                          <button
                            type="button"
                            disabled={foodReportPage >= foodReportTotalPages}
                            onClick={() => setFoodReportPage((p) => Math.min(foodReportTotalPages, p + 1))}
                            className="px-3 py-1 rounded-lg border border-slate-200 disabled:opacity-40"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  {foodReportTotalPages > 1 && (
                    <div className="md:hidden flex items-center justify-between px-1 py-3 text-sm">
                      <span className="text-slate-500">
                        Page {foodReportPage} / {foodReportTotalPages}
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={foodReportPage <= 1}
                          onClick={() => setFoodReportPage((p) => Math.max(1, p - 1))}
                          className="px-3 py-2 rounded-lg border border-slate-200 disabled:opacity-40 touch-manipulation"
                        >
                          Prev
                        </button>
                        <button
                          type="button"
                          disabled={foodReportPage >= foodReportTotalPages}
                          onClick={() => setFoodReportPage((p) => Math.min(foodReportTotalPages, p + 1))}
                          className="px-3 py-2 rounded-lg border border-slate-200 disabled:opacity-40 touch-manipulation"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
              {boothRegs.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-sm font-black text-slate-800 mb-3">Booth directory</h3>
                  <div className="space-y-5">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-orange-600 mb-2">Food booths</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {boothRegs.filter((b) => (b.sector || '').toLowerCase().includes('food')).map((b) => {
                          const boothBg = boothBackgroundFromReg(b as Record<string, unknown>);
                          const boothName = b.fullName || b.uid || 'Booth';
                          const boothInitial = String(boothName).trim().charAt(0).toUpperCase() || 'B';
                          const boothUid = b.uid || '';
                          const boothClaims = boothUid ? foodClaimsByBoothUid.get(boothUid) ?? [] : [];
                          return (
                          <div key={`food-${b.id || b.uid}`} className="rounded-2xl border border-orange-200 bg-white shadow-sm overflow-hidden">
                            {boothBg ? (
                              <div className="relative h-36 overflow-hidden">
                                <img src={boothBg} alt={`${b.fullName || b.uid} booth`} className="absolute inset-0 w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-slate-900/20" />
                              </div>
                            ) : (
                              <div className="h-36 bg-gradient-to-r from-orange-100 to-orange-50" />
                            )}
                            <div className="p-4">
                              <div className="flex items-start gap-3">
                                {b.profilePictureUrl ? (
                                  <img src={b.profilePictureUrl} alt={boothName} className="w-10 h-10 rounded-full object-cover ring-2 ring-white shadow-sm shrink-0" />
                                ) : (
                                  <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-black shrink-0">
                                    {boothInitial}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="font-bold text-slate-900 truncate">{boothName}</p>
                                  <p className="text-sm text-slate-500">{b.sector || 'Food Booth'}</p>
                                </div>
                              </div>
                              <div className="mt-3 text-sm text-slate-600 space-y-1">
                                {b.sectorOffice ? <p>{b.sectorOffice}</p> : null}
                                {b.contactNumber ? <p className="text-[13px] text-slate-500">{b.contactNumber}</p> : null}
                                {b.boothLocationDetails ? <p className="text-[13px] text-indigo-500">Booth {b.boothLocationDetails}</p> : null}
                              </div>
                              <div className="mt-3 border-t border-slate-100 pt-3">
                                <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Claims ({boothClaims.length})</p>
                                {boothClaims.length === 0 ? (
                                  <p className="text-xs text-slate-400">No claims recorded at this booth yet.</p>
                                ) : (
                                  <ul className="max-h-44 space-y-2 overflow-y-auto overscroll-y-contain pr-1 text-xs [-webkit-overflow-scrolling:touch]">
                                    {boothClaims.map((c) => {
                                      const at =
                                        c.claimedAt && typeof (c.claimedAt as { toDate?: () => Date }).toDate === 'function'
                                          ? (c.claimedAt as { toDate: () => Date }).toDate().toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
                                          : '—';
                                      return (
                                        <li key={c.id} className="rounded-lg bg-slate-50/90 px-2 py-1.5 ring-1 ring-slate-100">
                                          <span className="font-semibold text-slate-800">{c.participantName || c.participantUid || 'Attendee'}</span>
                                          <span className="mt-0.5 block text-[11px] text-slate-500">
                                            {c.mealName || MEAL_LABELS[c.mealType || ''] || c.mealType || 'Meal'} · {at}
                                          </span>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                )}
                              </div>
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-blue-600 mb-2">Exhibitor booths</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {boothRegs.filter((b) => !(b.sector || '').toLowerCase().includes('food')).map((b) => {
                          const boothBg = boothBackgroundFromReg(b as Record<string, unknown>);
                          const boothName = b.fullName || b.uid || 'Booth';
                          const boothInitial = String(boothName).trim().charAt(0).toUpperCase() || 'B';
                          const boothUid = b.uid || '';
                          const boothClaims = boothUid ? foodClaimsByBoothUid.get(boothUid) ?? [] : [];
                          return (
                          <div key={`exhibitor-${b.id || b.uid}`} className="rounded-2xl border border-blue-200 bg-white shadow-sm overflow-hidden">
                            {boothBg ? (
                              <div className="relative h-36 overflow-hidden">
                                <img src={boothBg} alt={`${b.fullName || b.uid} booth`} className="absolute inset-0 w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-slate-900/20" />
                              </div>
                            ) : (
                              <div className="h-36 bg-gradient-to-r from-blue-100 to-blue-50" />
                            )}
                            <div className="p-4">
                              <div className="flex items-start gap-3">
                                {b.profilePictureUrl ? (
                                  <img src={b.profilePictureUrl} alt={boothName} className="w-10 h-10 rounded-full object-cover ring-2 ring-white shadow-sm shrink-0" />
                                ) : (
                                  <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-black shrink-0">
                                    {boothInitial}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="font-bold text-slate-900 truncate">{boothName}</p>
                                  <p className="text-sm text-slate-500">{b.sector || 'Exhibitor Booth'}</p>
                                </div>
                              </div>
                              <div className="mt-3 text-sm text-slate-600 space-y-1">
                                {b.sectorOffice ? <p>{b.sectorOffice}</p> : null}
                                {b.contactNumber ? <p className="text-[13px] text-slate-500">{b.contactNumber}</p> : null}
                                {b.boothLocationDetails ? <p className="text-[13px] text-indigo-500">Booth {b.boothLocationDetails}</p> : null}
                              </div>
                              <div className="mt-3 border-t border-slate-100 pt-3">
                                <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Claims ({boothClaims.length})</p>
                                {boothClaims.length === 0 ? (
                                  <p className="text-xs text-slate-400">No claims recorded at this booth yet.</p>
                                ) : (
                                  <ul className="max-h-44 space-y-2 overflow-y-auto overscroll-y-contain pr-1 text-xs [-webkit-overflow-scrolling:touch]">
                                    {boothClaims.map((c) => {
                                      const at =
                                        c.claimedAt && typeof (c.claimedAt as { toDate?: () => Date }).toDate === 'function'
                                          ? (c.claimedAt as { toDate: () => Date }).toDate().toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
                                          : '—';
                                      return (
                                        <li key={c.id} className="rounded-lg bg-slate-50/90 px-2 py-1.5 ring-1 ring-slate-100">
                                          <span className="font-semibold text-slate-800">{c.participantName || c.participantUid || 'Attendee'}</span>
                                          <span className="mt-0.5 block text-[11px] text-slate-500">
                                            {c.mealName || MEAL_LABELS[c.mealType || ''] || c.mealType || 'Meal'} · {at}
                                          </span>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                )}
                              </div>
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
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
                  {selectedParticipant.positionTitle && <p className="text-slate-600"><span className="text-slate-400">Position: </span>{String(selectedParticipant.positionTitle)}</p>}
                  <p className="text-slate-600"><span className="text-slate-400">UID: </span><span className="font-mono text-xs">{selectedParticipant.uid}</span></p>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">All registration fields</p>
                <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/90 p-3 space-y-1.5 text-[11px]">
                  {Object.entries(selectedParticipant as Record<string, unknown>)
                    .filter(([k]) => k !== 'profilePictureUrl')
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([k, v]) => (
                      <div key={k} className="flex gap-2 border-b border-slate-100/80 pb-1 last:border-0">
                        <span className="text-slate-500 shrink-0 w-[7.5rem] font-mono">{k}</span>
                        <span className="text-slate-800 break-all">{formatRegValue(v)}</span>
                      </div>
                    ))}
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
                          <span className="text-xs text-slate-400">{date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true })}</span>
                        </div>
                      );
                    })}
              </div>
            </div>

          </div>
        </>
      )}

      {breakoutDetailRoom && (
        <>
          <div className="fixed inset-0 z-[55] bg-black/40 backdrop-blur-sm" onClick={() => setBreakoutDetailRoom(null)} />
          <div className="fixed left-1/2 top-1/2 z-[56] w-[min(100vw-2rem,28rem)] max-h-[min(90dvh,32rem)] -translate-x-1/2 -translate-y-1/2 flex flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-start justify-between gap-2 shrink-0">
              <div className="min-w-0">
                <p className="font-black text-slate-900 leading-tight">{breakoutDetailRoom.name}</p>
                <p className="text-xs text-slate-500 mt-1">{formatSessionDateTime(breakoutDetailRoom)}</p>
                {breakoutDetailRoom.venue ? <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1"><MapPin size={12} />{breakoutDetailRoom.venue}</p> : null}
              </div>
              <button type="button" onClick={() => setBreakoutDetailRoom(null)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 shrink-0">
                <X size={15} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Reserved ({reservations.filter((r) => r.roomId === breakoutDetailRoom.id).length})</p>
                <ul className="space-y-1.5">
                  {reservations.filter((r) => r.roomId === breakoutDetailRoom.id).map((r) => {
                    const p = participants.find((pp) => pp.uid === r.uid);
                    const attended = attendance.some((a) => a.uid === r.uid && a.roomId === breakoutDetailRoom.id && a.type === 'room');
                    return (
                      <li key={r.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-slate-50 last:border-0">
                        <span className="text-slate-800 truncate">{p?.fullName || r.uid}</span>
                        {attended ? <span className="text-[10px] font-bold text-emerald-600 shrink-0">Checked in</span> : <span className="text-[10px] text-slate-400 shrink-0">Not yet</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Checked in ({new Set(attendance.filter((a) => a.type === 'room' && a.roomId === breakoutDetailRoom.id).map((a) => a.uid)).size})
                </p>
                <ul className="space-y-1.5">
                  {Array.from(
                    new Map(
                      attendance
                        .filter((a) => a.type === 'room' && a.roomId === breakoutDetailRoom.id)
                        .map((a) => [a.uid, a] as const),
                    ).values(),
                  ).map((a) => {
                    const p = participants.find((pp) => pp.uid === a.uid);
                    return (
                      <li key={a.uid} className="flex items-center gap-2 py-1.5 border-b border-slate-50 last:border-0">
                        <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                        <span className="text-slate-800">{p?.fullName || a.uid}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
            <div className="p-3 border-t border-slate-100">
              <button type="button" onClick={() => setBreakoutDetailRoom(null)} className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-bold hover:bg-slate-50">
                Close
              </button>
            </div>
          </div>
        </>
      )}

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• QR SCANNER â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {scanMode && (
        <QrScanModal
          title="Scan Entrance QR"
          subtitle="Scan participant digital ID to record main entrance check-in"
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
              <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden>
                <div className="absolute -left-16 -top-16 w-[140%] h-[140%] -rotate-45">
                  <div className="grid" style={{ gridTemplateColumns: 'repeat(10, 44px)', gridTemplateRows: 'repeat(12, 44px)' }}>
                    {Array.from({ length: 12 * 10 }).map((_, i) => {
                      const row = Math.floor(i / 10);
                      const col = i % 10;
                      return (
                        <div key={i} className={`flex items-center justify-center ${row % 2 === 1 ? 'translate-x-[22px]' : ''}`}>
                          <div className="w-8 h-8 animate-id-watermark-wave-glow flex items-center justify-center" style={{ animationDelay: `${col * 0.2}s` }}>
                            <img src="/iscene.png" alt="" className="w-6 h-6 object-contain" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="relative z-10 flex flex-col items-center">
                {profilePicUrl
                  ? <img src={profilePicUrl} alt={fullName} className="w-20 h-20 rounded-full object-cover mb-3 ring-4 ring-blue-100 shadow-md" />
                  : <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-2xl font-black text-white mb-3 ring-4 ring-blue-100">{myInitials}</div>}
                <h3 className="text-base font-black text-slate-900 text-center">{fullName}</h3>
                <p className="text-xs text-slate-500 mt-0.5 text-center">{registration?.positionTitle}{registration?.sectorOffice ? ` · ${registration.sectorOffice}` : ''}</p>
                <span className="mt-2 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-[11px] font-bold">{registration?.sector || 'Facilitator'}</span>
                <div className="mt-4 p-3 bg-white rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
                  <img src={qrImgSrc} alt="Digital ID QR" className="w-44 h-44 relative z-10" />
                </div>
                <p className="mt-3 text-[11px] text-slate-500 font-mono tracking-widest text-center">
                  ID <span className="text-slate-400">#</span>{user.uid.slice(0, 8).toUpperCase()}
                </p>
              </div>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[10px] text-slate-400">April 9–11, 2026</span>
              <a href={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(qrData)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline">
                <Download size={11} /> Download QR
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { FacilitatorDashboard };
