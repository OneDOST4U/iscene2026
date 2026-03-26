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
  MapPin,
  AlertTriangle,
  Search,
  Newspaper,
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
import { EXHIBITOR_BOOTH_CATEGORIES, exhibitorCategoryLabel } from './exhibitorBoothCategory';
import { ArticleBrowsePanel } from './ArticleBrowsePanel';
import type { ArticleDoc } from './ArticlesManager';
import { useArticleCategoryNames } from './useArticleCategoryNames';
import { getEntranceCalendarDateKey, isEntranceCheckedInForDateKey, mealSessionDateKeyManila } from './entranceCheckInDay';
import { registrationSectorEligibleForMeal } from './mealEligibility';
import { MealEntitlementCard } from './MealEntitlementCard';
import { formatSessionDateTime, roomsOverlap } from './sessionRoomUtils';
import { QrScanModal } from './QrScanModal';
import { jsPDF } from 'jspdf';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type Tab = 'home' | 'schedule' | 'exhibitors' | 'materials' | 'profile' | 'meals' | 'articles';

const TRAVEL_ACCOMMODATION_REMINDER_MS = 3 * 60 * 60 * 1000;

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

/** Banner strip: booth background image only (not logo or profile). */
function exhibitorBackgroundSrc(booth: { boothBackgroundUrl?: string }): string {
  const u = typeof booth.boothBackgroundUrl === 'string' ? booth.boothBackgroundUrl.trim() : '';
  return u;
}

function exhibitorProfileSrc(booth: { profilePictureUrl?: string }): string {
  const u = typeof booth.profilePictureUrl === 'string' ? booth.profilePictureUrl.trim() : '';
  return u;
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
  const labels = [
    { n: 1, l: 'Poor' },
    { n: 2, l: 'Average' },
    { n: 3, l: 'Good' },
    { n: 4, l: 'Very Good' },
    { n: 5, l: 'Excellent' },
  ];
  return (
    <div className="grid grid-cols-5 gap-2 w-full">
      {labels.map(({ n, l }) => (
        <button key={n} type="button" onClick={() => onChange(n)} title={l} className={`aspect-square min-h-[2.5rem] rounded-xl text-sm font-bold transition-all flex items-center justify-center active:scale-95 ${value === n ? 'bg-blue-600 text-white ring-2 ring-blue-300 shadow-md shadow-blue-200/50' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{n}</button>
      ))}
    </div>
  );
}

function DOSTPart1Scale({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const opts = [{ v: 'low', l: 'Low' }, { v: 'satisfactory', l: 'Satisfactory' }, { v: 'very_good', l: 'Very Good' }];
  return (
    <div className="grid grid-cols-3 gap-2">
      {opts.map((o) => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)} className={`py-2.5 rounded-xl text-sm font-semibold transition-colors ${value === o.v ? 'bg-blue-600 text-white ring-2 ring-blue-300 shadow-md shadow-blue-200/50' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-[0.98]'}`}>{o.l}</button>
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
function NavItem({ icon, label, active, onClick, badge }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void; badge?: number }) {
  return (
    <button type="button" onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${active ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'}`}>
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {badge != null && badge > 0 && (
        <span className={`min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full text-[10px] font-black shrink-0 ${active ? 'bg-white/25 text-white' : 'bg-blue-600 text-white'}`}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
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
  const { names: articleCategoryChipNames } = useArticleCategoryNames();

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
  const [entranceAttendanceRaw, setEntranceAttendanceRaw] = React.useState<Record<string, unknown> | null>(null);
  const [entranceTodayKey, setEntranceTodayKey] = React.useState(() => getEntranceCalendarDateKey());

  const hasEntryAttendance = React.useMemo(
    () => isEntranceCheckedInForDateKey(entranceAttendanceRaw, entranceTodayKey),
    [entranceAttendanceRaw, entranceTodayKey],
  );

  const [loading, setLoading] = React.useState(true);

  // ── Modals ─────────────────────────────────────────────────────────────────
  const [scanModal, setScanModal] = React.useState(false);
  const [scanModalRoom, setScanModalRoom] = React.useState<Room | null>(null);
  const [idModal, setIdModal] = React.useState(false);
  const [reviewModal, setReviewModal] = React.useState<{ roomId: string; roomName: string; presenterNames: string[]; fromRoom?: Room } | null>(null);
  const [certModal, setCertModal] = React.useState(false);
  const [certificatePreview, setCertificatePreview] = React.useState<{ roomId: string; roomName: string } | null>(null);
  const [detailRoom, setDetailRoom] = React.useState<Room | null>(null);
  const [exhibitorDetailBooth, setExhibitorDetailBooth] = React.useState<any | null>(null);
  const [exhibitorMaterials, setExhibitorMaterials] = React.useState<{ id: string; fileName: string; materialName?: string; downloadUrl: string; fileType: string; fileSizeBytes: number }[]>([]);
  const [roomChatMessages, setRoomChatMessages] = React.useState<{ id: string; roomId: string; uid: string; participantName: string; text: string; createdAt: any }[]>([]);
  const [roomChatInput, setRoomChatInput] = React.useState('');
  const [roomChatSending, setRoomChatSending] = React.useState(false);

  // ── Mobile filter ──────────────────────────────────────────────────────────
  const [mobileFilter, setMobileFilter] = React.useState<string>('all');
  const [roomSearchQuery, setRoomSearchQuery] = React.useState('');

  const [exhibitorSearchQuery, setExhibitorSearchQuery] = React.useState('');
  const [exhibitorCategoryFilter, setExhibitorCategoryFilter] = React.useState<string>('all');

  const [participantArticles, setParticipantArticles] = React.useState<ArticleDoc[]>([]);
  const [articlesLoading, setArticlesLoading] = React.useState(true);
  const [articleSearchQuery, setArticleSearchQuery] = React.useState('');
  const [articleCategoryFilter, setArticleCategoryFilter] = React.useState<string>('all');

  // ── Mobile sidebar drawer ──────────────────────────────────────────────────
  const [mobileDrawerOpen, setMobileDrawerOpen] = React.useState(false);

  // ── Review form (DOST) ─────────────────────────────────────────────────────
  const [reviewSaving, setReviewSaving] = React.useState(false);
  const [dostPart1, setDostPart1] = React.useState({ levelOfContent: 'satisfactory', appropriateness: 'satisfactory', applicability: 'satisfactory' });
  const [dostPart2, setDostPart2] = React.useState<Record<string, DOSTSpeakerRatings>>({});
  const [dostPart3, setDostPart3] = React.useState({ venue: 5, food: 5, organizerResponse: 5, description: '' });
  const [dostPart4, setDostPart4] = React.useState('');
  const [part4Error, setPart4Error] = React.useState<string | null>(null);


  // ── Profile edit ───────────────────────────────────────────────────────────
  const [editingTravel, setEditingTravel] = React.useState(false);
  const [travelDetails, setTravelDetails] = React.useState((registration?.travelDetails as string) || '');
  const [accommodationDetails, setAccommodationDetails] = React.useState((registration?.accommodationDetails as string) || '');
  const [travelSaving, setTravelSaving] = React.useState(false);
  const [pwResetSent, setPwResetSent] = React.useState(false);

  // ── Scan toast ─────────────────────────────────────────────────────────────
  const [scanToast, setScanToast] = React.useState<string | null>(null);
  const [overlapModal, setOverlapModal] = React.useState<{ conflictingRoomName: string } | null>(null);

  // ── Content notification (new meals, rooms, certificates) ───────────────────
  const [contentNotify, setContentNotify] = React.useState<{ msg: string; type: 'meal' | 'room' | 'certificate' | 'travel' } | null>(null);
  type InAppNotifyType = 'meal' | 'room' | 'certificate' | 'travel';
  type InAppNotificationItem = { id: string; msg: string; type: InAppNotifyType; read: boolean; createdAt: number };
  const [inAppNotifications, setInAppNotifications] = React.useState<InAppNotificationItem[]>([]);
  const [bellPanelOpen, setBellPanelOpen] = React.useState(false);
  const mobileBellRef = React.useRef<HTMLDivElement>(null);
  const desktopBellRef = React.useRef<HTMLDivElement>(null);

  const [claimClockTick, setClaimClockTick] = React.useState(() => Date.now());
  React.useEffect(() => {
    const tick = () => setEntranceTodayKey(getEntranceCalendarDateKey());
    const id = window.setInterval(tick, 60_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);
  React.useEffect(() => {
    const id = window.setInterval(() => setClaimClockTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  React.useEffect(() => {
    const ref = doc(db, 'attendance', `${user.uid}_entrance`);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setEntranceAttendanceRaw(snap.exists() ? (snap.data() as Record<string, unknown>) : null);
      },
      (err) => console.error('[iSCENE] entrance attendance snapshot', err),
    );
    return () => unsub();
  }, [user.uid]);

  const pushInAppNotification = React.useCallback((msg: string, type: InAppNotifyType) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    setInAppNotifications((prev) => [{ id, msg, type, read: false, createdAt: Date.now() }, ...prev].slice(0, 40));
  }, []);

  const bellUnreadCount = inAppNotifications.filter((n) => !n.read).length;
  const prevCountsRef = React.useRef({ meals: 0, rooms: 0, certificates: 0 });
  const hasInitialSyncRef = React.useRef({ meals: false, rooms: false });
  /** Room IDs seen on last rooms update — ID diff detects new docs (count-based failed with loadAll vs snapshot race / orderBy issues). */
  const prevRoomIdsRef = React.useRef<Set<string> | null>(null);
  const certNotifyInitializedRef = React.useRef(false);

  // ── Derived ────────────────────────────────────────────────────────────────
  const firstName = (registration?.fullName as string | undefined)?.split(' ')[0] || 'Attendee';
  const fullName = (registration?.fullName as string) || user.email || 'Attendee';
  const initials = fullName.split(' ').map((p: string) => p[0]).join('').toUpperCase().slice(0, 2);
  const profilePicUrl = (registration?.profilePictureUrl as string | undefined) || null;

  const attendedRoomIds = (Object.values(reservations) as Reservation[]).filter((r) => r.attended).map((r) => r.roomId);
  const reviewedRoomIds = React.useMemo(() => {
    const s = new Set<string>(Object.keys(reviews));
    (Object.values(reservations) as Reservation[]).forEach((r) => {
      if (r.reviewSubmitted) s.add(r.roomId);
    });
    return Array.from(s);
  }, [reviews, reservations]);
  const certifiableRooms = React.useMemo(() => {
    return attendedRoomIds
      .filter((rid) => reviewedRoomIds.includes(rid))
      .map((rid) => {
        const room = rooms.find((r) => r.id === rid);
        return { roomId: rid, roomName: room?.name || 'Session' };
      });
  }, [attendedRoomIds, reviewedRoomIds, rooms]);
  const certReady = certifiableRooms.length > 0;

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
  const travelAccIncomplete =
    !String(travelDetails || '').trim() || !String(accommodationDetails || '').trim();
  const eligibleMeals = React.useMemo(
    () => meals.filter((m) => registrationSectorEligibleForMeal(m, registrationId, participantSector)),
    [meals, participantSector, registrationId],
  );
  /** Exhibitor directory only — Food (Booth) regs are loaded for meal pickup labels only */
  const exhibitorOnlyBoothRegs = React.useMemo(
    () => boothRegs.filter((b) => String(b.sector) !== 'Food (Booth)'),
    [boothRegs],
  );
  const hasClaimedMeal = (mealId: string) => foodClaims.some((c) => c.mealId === mealId);
  const unclaimedMealsCount = eligibleMeals.filter((m) => !hasClaimedMeal(m.id)).length;

  const filteredBoothRegs = React.useMemo(() => {
    const q = exhibitorSearchQuery.trim().toLowerCase();
    return exhibitorOnlyBoothRegs.filter((b) => {
      if (exhibitorCategoryFilter !== 'all') {
        const cat = String(b.boothCategory || '').trim();
        if (exhibitorCategoryFilter === 'Other') {
          if (cat !== 'Other') return false;
        } else if (cat !== exhibitorCategoryFilter) return false;
      }
      if (!q) return true;
      const blob = [
        b.fullName,
        b.sectorOffice,
        b.boothDescription,
        b.boothProducts,
        exhibitorCategoryLabel(b),
      ]
        .map((x) => String(x || '').toLowerCase())
        .join(' ');
      return blob.includes(q);
    });
  }, [exhibitorOnlyBoothRegs, exhibitorSearchQuery, exhibitorCategoryFilter]);

  const exhibitorCategoryChipCls = (c: string) =>
    `text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
      c === 'Tech'
        ? 'bg-blue-100 text-blue-800'
        : c === 'Innovation'
          ? 'bg-violet-100 text-violet-800'
          : c === 'Business'
            ? 'bg-amber-100 text-amber-800'
            : c === 'Agriculture'
              ? 'bg-emerald-100 text-emerald-900'
              : 'bg-slate-100 text-slate-700'
    }`;
  const scheduleNewCount = React.useMemo(() => rooms.filter((r) => !reservations[r.id]).length, [rooms, reservations]);

  const badgeStorageKey = (k: string) => `iscene_${user.uid}_badgeAck_${k}`;
  const parseAck = (v: string | null): number | null => {
    if (v === null) return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  };
  const [ackCertCount, setAckCertCount] = React.useState<number | null>(() => parseAck(localStorage.getItem(`iscene_${user.uid}_badgeAck_cert`)));
  const [ackMealsCount, setAckMealsCount] = React.useState<number | null>(() => parseAck(localStorage.getItem(`iscene_${user.uid}_badgeAck_meals`)));
  const [ackScheduleCount, setAckScheduleCount] = React.useState<number | null>(() => parseAck(localStorage.getItem(`iscene_${user.uid}_badgeAck_schedule`)));

  React.useEffect(() => {
    if (ackCertCount !== null && certifiableRooms.length < ackCertCount) {
      const n = certifiableRooms.length;
      setAckCertCount(n);
      localStorage.setItem(badgeStorageKey('cert'), String(n));
    }
  }, [certifiableRooms.length, ackCertCount, user.uid]);
  React.useEffect(() => {
    if (ackMealsCount !== null && unclaimedMealsCount < ackMealsCount) {
      setAckMealsCount(unclaimedMealsCount);
      localStorage.setItem(badgeStorageKey('meals'), String(unclaimedMealsCount));
    }
  }, [unclaimedMealsCount, ackMealsCount, user.uid]);
  React.useEffect(() => {
    if (ackScheduleCount !== null && scheduleNewCount < ackScheduleCount) {
      setAckScheduleCount(scheduleNewCount);
      localStorage.setItem(badgeStorageKey('schedule'), String(scheduleNewCount));
    }
  }, [scheduleNewCount, ackScheduleCount, user.uid]);

  React.useEffect(() => {
    if (!certModal && !certificatePreview) return;
    const n = certifiableRooms.length;
    setAckCertCount(n);
    localStorage.setItem(badgeStorageKey('cert'), String(n));
  }, [certModal, certificatePreview, certifiableRooms.length, user.uid]);

  const prevTabRef = React.useRef<Tab>(activeTab);
  React.useEffect(() => {
    const prev = prevTabRef.current;
    if (activeTab === 'schedule' && prev !== 'schedule') {
      setAckScheduleCount(scheduleNewCount);
      localStorage.setItem(badgeStorageKey('schedule'), String(scheduleNewCount));
    }
    if (activeTab === 'meals' && prev !== 'meals') {
      setAckMealsCount(unclaimedMealsCount);
      localStorage.setItem(badgeStorageKey('meals'), String(unclaimedMealsCount));
    }
    prevTabRef.current = activeTab;
  }, [activeTab, scheduleNewCount, unclaimedMealsCount, user.uid]);

  const certBadgeDisplay = ackCertCount === null
    ? certifiableRooms.length
    : Math.max(0, certifiableRooms.length - ackCertCount);
  const mealsBadgeDisplay = ackMealsCount === null
    ? unclaimedMealsCount
    : Math.max(0, unclaimedMealsCount - ackMealsCount);
  const scheduleBadgeDisplay = ackScheduleCount === null
    ? scheduleNewCount
    : Math.max(0, scheduleNewCount - ackScheduleCount);

  /** Persist quick-action badge acks for notification types (certificate / meals / schedule). */
  const syncQuickActionBadgesForNotifyTypes = React.useCallback((types: Set<InAppNotifyType>) => {
    const storageKey = (suffix: string) => `iscene_${user.uid}_badgeAck_${suffix}`;
    if (types.has('certificate')) {
      const n = certifiableRooms.length;
      setAckCertCount(n);
      try {
        localStorage.setItem(storageKey('cert'), String(n));
      } catch {
        /* ignore quota / private mode */
      }
    }
    if (types.has('meal')) {
      setAckMealsCount(unclaimedMealsCount);
      try {
        localStorage.setItem(storageKey('meals'), String(unclaimedMealsCount));
      } catch {
        /* ignore */
      }
    }
    if (types.has('room')) {
      setAckScheduleCount(scheduleNewCount);
      try {
        localStorage.setItem(storageKey('schedule'), String(scheduleNewCount));
      } catch {
        /* ignore */
      }
    }
  }, [user.uid, certifiableRooms.length, unclaimedMealsCount, scheduleNewCount]);

  const digitalIdQrData = `https://www.iscene.app/verify?uid=${user.uid}&name=${encodeURIComponent(fullName)}`;
  const digitalIdQrImg = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(digitalIdQrData)}`;
  const idNumber = user.uid.slice(0, 8).toUpperCase();

  // Filter chips derived from rooms dates
  const mobileFilterOptions = React.useMemo(() => {
    const dates = [...new Set(rooms.map((r) => r.sessionDate).filter(Boolean))];
    return ['all', ...dates];
  }, [rooms]);

  const roomsForScheduleDate = React.useMemo(
    () => (mobileFilter === 'all' ? rooms : rooms.filter((r) => r.sessionDate === mobileFilter)),
    [rooms, mobileFilter],
  );

  const filteredRooms = React.useMemo(() => {
    const q = roomSearchQuery.trim().toLowerCase();
    const tokens = q.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return roomsForScheduleDate;
    return roomsForScheduleDate.filter((r) => {
      const hay = [
        r.name,
        r.description,
        r.venue,
        r.timeline,
        r.materials,
        r.projectDetail,
        ...(r.presenterNames || []),
        ...(r.presenterTitles || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [roomsForScheduleDate, roomSearchQuery]);

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadAll = React.useCallback(async () => {
    setLoading(true);
    try {
      const load = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => {
        try { return await fn(); } catch (e) { console.error('loadAll query failed', e); return fallback; }
      };

      const [mealsSnap, resSnap, revSnap, boothSnap, claimsSnap] = await Promise.all([
        load(() => getDocs(query(collection(db, 'meals'), orderBy('createdAt', 'desc'))), { docs: [] } as { docs: any[] }),
        load(() => getDocs(query(collection(db, 'reservations'), where('uid', '==', user.uid))), { docs: [] } as { docs: any[] }),
        load(() => getDocs(query(collection(db, 'reviews'), where('uid', '==', user.uid))), { docs: [] } as { docs: any[] }),
        load(() => getDocs(query(collection(db, 'registrations'), where('sector', 'in', ['Exhibitor (Booth)', 'Exhibitor', 'Food (Booth)']))), { docs: [] } as { docs: any[] }),
        load(() => getDocs(query(collection(db, 'foodClaims'), where('participantUid', '==', user.uid))), { docs: [] } as { docs: any[] }),
      ]);

      /* Rooms: only real-time listener (no orderBy) — avoids missing docs without createdAt and races with loadAll */
      setMeals(mealsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MealWindow, 'id'>) })));
      setFoodClaims(claimsSnap.docs.map((d) => ({ id: d.id, mealId: (d.data() as any).mealId, claimedAt: (d.data() as any).claimedAt })));

      const resMap: Record<string, Reservation> = {};
      resSnap.docs.forEach((d) => { const data = d.data() as Omit<Reservation, 'id'>; resMap[data.roomId] = { id: d.id, ...data }; });
      setReservations(resMap);

      const revList = revSnap.docs.map((d) => {
        const data = d.data() as Omit<Review, 'id'>;
        return { id: d.id, ...data };
      });
      const ms = (r: Review) =>
        (r as any).submittedAt?.toMillis?.() ??
        ((r as any).submittedAt?.seconds != null ? (r as any).submittedAt.seconds * 1000 : 0);
      revList.sort((a, b) => ms(b) - ms(a));
      const revMap: Record<string, Review> = {};
      revList.forEach((r) => {
        if (r.roomId && !revMap[r.roomId]) revMap[r.roomId] = r;
      });
      setReviews(revMap);

      setBoothRegs(boothSnap.docs.filter((d) => d.data().status === 'approved').map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error('loadAll', err); }
    finally { setLoading(false); }
  }, [user.uid]);

  React.useEffect(() => { loadAll(); }, [loadAll]);

  React.useEffect(() => {
    let cancelled = false;
    setArticlesLoading(true);
    getDocs(collection(db, 'articles'))
      .then((snap) => {
        if (cancelled) return;
        const list: ArticleDoc[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ArticleDoc, 'id'>),
        }));
        list.sort((a, b) => {
          const ta = (a.createdAt as { seconds?: number } | undefined)?.seconds ?? (a.updatedAt as { seconds?: number } | undefined)?.seconds ?? 0;
          const tb = (b.createdAt as { seconds?: number } | undefined)?.seconds ?? (b.updatedAt as { seconds?: number } | undefined)?.seconds ?? 0;
          return tb - ta;
        });
        setParticipantArticles(list);
      })
      .catch((e) => {
        console.error('[iSCENE] participant articles load', e);
        if (!cancelled) setParticipantArticles([]);
      })
      .finally(() => {
        if (!cancelled) setArticlesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  // Real-time updates for meals, rooms, food claims; notifications when new content created
  React.useEffect(() => {
    const unsubMeals = onSnapshot(query(collection(db, 'meals'), orderBy('createdAt', 'desc')), (snap) => {
      const newMeals = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MealWindow, 'id'>) }));
      const count = newMeals.length;
      if (hasInitialSyncRef.current.meals) {
        if (count > prevCountsRef.current.meals) {
          const n = count - prevCountsRef.current.meals;
          const mealMsg = `🍽️ ${n} new meal${n > 1 ? 's' : ''} available!`;
          setContentNotify({ msg: mealMsg, type: 'meal' });
          pushInAppNotification(mealMsg, 'meal');
          setTimeout(() => setContentNotify(null), 4000);
        }
      } else hasInitialSyncRef.current.meals = true;
      prevCountsRef.current.meals = count;
      setMeals(newMeals);
    }, (err) => console.error('[iSCENE] meals snapshot', err));
    const unsubRooms = onSnapshot(
      query(collection(db, 'rooms')),
      (snap) => {
        const newRooms = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Room, 'id'>) }));
        const sorted = [...newRooms].sort((a, b) => {
          const ac = (a as any).createdAt?.toMillis?.() ?? ((a as any).createdAt?.seconds != null ? (a as any).createdAt.seconds * 1000 : 0);
          const bc = (b as any).createdAt?.toMillis?.() ?? ((b as any).createdAt?.seconds != null ? (b as any).createdAt.seconds * 1000 : 0);
          if (bc !== ac) return bc - ac;
          return (a.name || '').localeCompare(b.name || '');
        });
        const nextIds = new Set(sorted.map((r) => r.id));
        if (prevRoomIdsRef.current !== null) {
          let added = 0;
          for (const id of nextIds) {
            if (!prevRoomIdsRef.current.has(id)) added++;
          }
          if (added > 0) {
            const roomMsg = `📅 ${added} new breakout session${added > 1 ? 's' : ''} added!`;
            setContentNotify({ msg: roomMsg, type: 'room' });
            pushInAppNotification(roomMsg, 'room');
            setTimeout(() => setContentNotify(null), 5000);
          }
        }
        prevRoomIdsRef.current = nextIds;
        prevCountsRef.current.rooms = sorted.length;
        hasInitialSyncRef.current.rooms = true;
        setRooms(sorted);
      },
      (err) => console.error('[iSCENE] rooms snapshot — check Firestore rules / network', err),
    );
    const unsubClaims = onSnapshot(query(collection(db, 'foodClaims'), where('participantUid', '==', user.uid)), (snap) => {
      setFoodClaims(snap.docs.map((d) => ({ id: d.id, mealId: (d.data() as any).mealId, claimedAt: (d.data() as any).claimedAt })));
    });
    const unsubBooths = onSnapshot(query(collection(db, 'registrations'), where('sector', 'in', ['Exhibitor (Booth)', 'Exhibitor', 'Food (Booth)'])), (snap) => {
      setBoothRegs(snap.docs.filter((d) => d.data().status === 'approved').map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubMeals(); unsubRooms(); unsubClaims(); unsubBooths(); };
  }, [user.uid, pushInAppNotification]);

  // Notification when new certificate becomes available (user completed review)
  React.useEffect(() => {
    const count = certifiableRooms.length;
    if (certNotifyInitializedRef.current && count > prevCountsRef.current.certificates) {
      const certMsg = '🏆 New certificate available! View & download from Profile.';
      setContentNotify({ msg: certMsg, type: 'certificate' });
      pushInAppNotification(certMsg, 'certificate');
      setTimeout(() => setContentNotify(null), 5000);
    }
    certNotifyInitializedRef.current = true;
    prevCountsRef.current.certificates = count;
  }, [certifiableRooms, pushInAppNotification]);

  React.useEffect(() => {
    if (reviewModal) {
      const raw = reviewModal.presenterNames || [];
      const names = raw.filter((n) => n && String(n).trim() && n.toLowerCase() !== 'presenter').length
        ? raw.filter((n) => n && String(n).trim() && n.toLowerCase() !== 'presenter')
        : ['Speaker'];
      const init: Record<string, DOSTSpeakerRatings> = {};
      names.forEach((n) => { init[n] = getDefaultDOSTSpeakerRatings(); });
      setDostPart2(init);
      setDostPart1({ levelOfContent: 'satisfactory', appropriateness: 'satisfactory', applicability: 'satisfactory' });
      setDostPart3({ venue: 5, food: 5, organizerResponse: 5, description: '' });
      setDostPart4('');
      setPart4Error(null);
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

  React.useEffect(() => {
    if (loading) return;
    const t = String(travelDetails || '').trim();
    const a = String(accommodationDetails || '').trim();
    const storageKey = `iscene_${user.uid}_lastTravelAccReminder`;
    if (t && a) {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* ignore quota / private mode */
      }
      return;
    }
    let last = 0;
    try {
      last = Number(localStorage.getItem(storageKey) || '0');
    } catch {
      last = 0;
    }
    const now = Date.now();
    if (last && now - last < TRAVEL_ACCOMMODATION_REMINDER_MS) return;
    try {
      localStorage.setItem(storageKey, String(now));
    } catch {
      /* still show toast once this session */
    }
    const travelMsg = 'Please complete your travel and accommodation in Profile (both required for organizers).';
    setContentNotify({ msg: travelMsg, type: 'travel' });
    pushInAppNotification(travelMsg, 'travel');
    const tid = window.setTimeout(() => setContentNotify(null), 8000);
    return () => window.clearTimeout(tid);
  }, [loading, user.uid, travelDetails, accommodationDetails, pushInAppNotification]);

  React.useEffect(() => {
    if (!bellPanelOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (mobileBellRef.current?.contains(t) || desktopBellRef.current?.contains(t)) return;
      setBellPanelOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [bellPanelOpen]);

  const handleBellToggle = React.useCallback(() => {
    setBellPanelOpen((open) => {
      if (open) return false;
      setInAppNotifications((prev) => {
        const unreadTypes = new Set(prev.filter((n) => !n.read).map((n) => n.type));
        queueMicrotask(() => syncQuickActionBadgesForNotifyTypes(unreadTypes));
        return prev.map((n) => ({ ...n, read: true }));
      });
      return true;
    });
  }, [syncQuickActionBadgesForNotifyTypes]);

  const dismissContentNotify = React.useCallback(() => {
    setContentNotify((cur) => {
      if (cur && (cur.type === 'certificate' || cur.type === 'meal' || cur.type === 'room')) {
        queueMicrotask(() => syncQuickActionBadgesForNotifyTypes(new Set([cur.type])));
      }
      return null;
    });
  }, [syncQuickActionBadgesForNotifyTypes]);

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
        const today = getEntranceCalendarDateKey();
        const existing = await getDoc(docRef);
        if (existing.exists() && isEntranceCheckedInForDateKey(existing.data() as Record<string, unknown>, today)) {
          setScanToast("✅ You're already checked in for today.");
          setScanModal(false);
          setTimeout(() => setScanToast(null), 4000);
          return;
        }
        await setDoc(
          docRef,
          {
            uid: user.uid,
            name: fullName,
            type: 'entrance',
            entranceDateKey: today,
            scannedAt: Timestamp.now(),
          },
          { merge: true },
        );
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
    setOverlapModal(null);
    const reservedRoomIds = (Object.values(reservations) as Reservation[]).map((r) => r.roomId);
    for (const rid of reservedRoomIds) {
      const existingRoom = rooms.find((r) => r.id === rid);
      if (existingRoom && roomsOverlap(existingRoom, room)) {
        setOverlapModal({ conflictingRoomName: existingRoom.name });
        return;
      }
    }
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

  const handleDownloadCertificate = async (session: { roomId: string; roomName: string }) => {
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
      pdf.text('This certifies that', w / 2, 118, { align: 'center' });
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.text(fullName, w / 2, 130, { align: 'center' });
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`has participated in the breakout session "${session.roomName}" at the iSCENE 2026 Global Summit.`, w / 2, 142, { align: 'center', maxWidth: w - 40 });
      pdf.setFontSize(10);
      pdf.text(new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }), w / 2, 158, { align: 'center' });
      const safeName = session.roomName.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 40);
      const filename = `iSCENE2026_Certificate_${fullName.replace(/\s+/g, '_')}_${safeName}.pdf`;
      const blob = pdf.output('blob');
      const url = URL.createObjectURL(blob);
      const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent.toLowerCase());
      if (isMobile) {
        window.open(url, '_blank', 'noopener');
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Certificate generation failed:', err);
    }
  };

  const handleSubmitReview = async () => {
    if (!reviewModal) return;
    const resRow = reservations[reviewModal.roomId];
    if (reviews[reviewModal.roomId] || resRow?.reviewSubmitted) {
      // #region agent log
      fetch('http://127.0.0.1:7397/ingest/56484124-7df3-4537-80fa-738427537570',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d914bb'},body:JSON.stringify({sessionId:'d914bb',runId:'dup-guard',hypothesisId:'G',location:'ParticipantDashboard.tsx:handleSubmitReview:blocked',message:'submit skipped already submitted',data:{roomId:reviewModal.roomId},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      return;
    }
    setPart4Error(null);
    const commentsTrimmed = dostPart4.trim();
    if (!commentsTrimmed) {
      setPart4Error('Comments & suggestions are required before submitting.');
      return;
    }
    setReviewSaving(true);
    try {
      const part2Arr = Object.entries(dostPart2).map(([speakerName, ratings]) => ({ speakerName, ratings }));
      // Firestore rejects undefined in nested fields — omit optional description when empty (see debug-d914bb invalid-argument part3.description).
      const part3DescTrimmed = dostPart3.description?.trim() ?? '';
      const part3Payload: {
        venue: number;
        food: number;
        organizerResponse: number;
        description?: string;
      } = {
        venue: dostPart3.venue,
        food: dostPart3.food,
        organizerResponse: dostPart3.organizerResponse,
      };
      if (part3DescTrimmed) part3Payload.description = part3DescTrimmed;
      const payload = {
        uid: user.uid,
        participantName: fullName,
        roomId: reviewModal.roomId,
        roomName: reviewModal.roomName,
        part1: dostPart1,
        part2: part2Arr,
        part3: part3Payload,
        part4: commentsTrimmed,
        submittedAt: Timestamp.now(),
      };
      // #region agent log
      fetch('http://127.0.0.1:7397/ingest/56484124-7df3-4537-80fa-738427537570',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d914bb'},body:JSON.stringify({sessionId:'d914bb',runId:'post-desc-fix',hypothesisId:'F',location:'ParticipantDashboard.tsx:handleSubmitReview:start',message:'submit review start',data:{roomId:reviewModal.roomId,part3HasDescription:part3DescTrimmed.length>0},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      const docRef = await addDoc(collection(db, 'reviews'), payload);
      const resRef = doc(db, 'reservations', `${user.uid}_${reviewModal.roomId}`);
      await setDoc(
        resRef,
        {
          uid: user.uid,
          roomId: reviewModal.roomId,
          roomName: reviewModal.roomName,
          reviewSubmitted: true,
        },
        { merge: true },
      );
      setReviews((prev) => ({
        ...prev,
        [reviewModal.roomId]: {
          id: docRef.id,
          roomId: reviewModal.roomId,
          part1: dostPart1,
          part2: part2Arr,
          part3: { ...part3Payload, ...(part3DescTrimmed ? {} : { description: '' }) },
          part4: commentsTrimmed,
        },
      }));
      setReservations((prev) => {
        const cur = prev[reviewModal.roomId];
        const nextRes: Reservation = cur
          ? { ...cur, reviewSubmitted: true }
          : {
              id: `${user.uid}_${reviewModal.roomId}`,
              roomId: reviewModal.roomId,
              roomName: reviewModal.roomName,
              attended: true,
              reviewSubmitted: true,
              reservedAt: Timestamp.now(),
            };
        return { ...prev, [reviewModal.roomId]: nextRes };
      });
      // #region agent log
      fetch('http://127.0.0.1:7397/ingest/56484124-7df3-4537-80fa-738427537570',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d914bb'},body:JSON.stringify({sessionId:'d914bb',runId:'pre-fix',hypothesisId:'C',location:'ParticipantDashboard.tsx:handleSubmitReview:success',message:'submit review ok',data:{reviewDocId:docRef.id,roomId:reviewModal.roomId},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      setReviewModal(null);
    } catch (err: any) {
      // #region agent log
      fetch('http://127.0.0.1:7397/ingest/56484124-7df3-4537-80fa-738427537570',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d914bb'},body:JSON.stringify({sessionId:'d914bb',runId:'pre-fix',hypothesisId:'A,C',location:'ParticipantDashboard.tsx:handleSubmitReview:catch',message:'submit review failed',data:{code:err?.code,message:String(err?.message||err)},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      console.error('Failed to submit review:', err);
      setPart4Error('Failed to save. Please check your connection and try again.');
    } finally {
      setReviewSaving(false);
    }
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

  /** Must run before any early return — same hook order when loading vs loaded. */
  const desktopPageHeader = React.useMemo(() => {
    switch (activeTab) {
      case 'home':
        return {
          title: 'Home',
          subtitle: hasEntryAttendance ? "You're checked in · Enjoy the event!" : 'Scan the entrance QR when you arrive.',
        };
      case 'schedule':
        return { title: 'Breakout Sessions', subtitle: 'Reserve · Check in · Review' };
      case 'exhibitors':
        return { title: 'Exhibitors', subtitle: 'Approved booth participants at iSCENE 2026.' };
      case 'materials':
        return { title: 'Session Materials', subtitle: 'Access materials from your reserved sessions.' };
      case 'articles':
        return { title: 'Articles Home', subtitle: 'News, updates, and resources from the organizers.' };
      case 'meals':
        return {
          title: 'My Entitlements',
          subtitle: 'Food, kits, and giveaways — claim at the assigned stall within the time window.',
        };
      case 'profile':
        return { title: 'My Profile', subtitle: 'View and update your registration details' };
      default:
        return { title: 'iSCENE 2026', subtitle: '' };
    }
  }, [activeTab, hasEntryAttendance]);

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
      <div
        className={`rounded-2xl shadow-sm p-5 border-2 transition-colors ${
          travelAccIncomplete
            ? 'bg-orange-50/80 border-orange-300 ring-1 ring-orange-200/80'
            : 'bg-white border-slate-100'
        }`}
      >
        <div className="flex items-center justify-between mb-3 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {travelAccIncomplete ? <AlertTriangle size={16} className="text-orange-600 shrink-0" aria-hidden /> : null}
            <p className={`text-[11px] font-bold uppercase tracking-wide ${travelAccIncomplete ? 'text-orange-800' : 'text-slate-400'}`}>
              Travel &amp; Accommodation
            </p>
          </div>
          <button type="button" onClick={() => setEditingTravel(!editingTravel)} className="text-blue-600 text-xs font-bold flex items-center gap-1 shrink-0">
            <Edit2 size={11} /> {editingTravel ? 'Cancel' : 'Edit'}
          </button>
        </div>
        {travelAccIncomplete && !editingTravel ? (
          <p className="text-xs font-semibold text-orange-800 mb-2">Please add both travel and accommodation details.</p>
        ) : null}
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
            <div>
              <p className="text-[11px] text-slate-400">Travel</p>
              <p className={!String(travelDetails || '').trim() ? 'font-semibold text-orange-800' : 'text-slate-700'}>
                {travelDetails || 'Not provided'}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">Accommodation</p>
              <p className={!String(accommodationDetails || '').trim() ? 'font-semibold text-orange-800' : 'text-slate-700'}>
                {accommodationDetails || 'Not provided'}
              </p>
            </div>
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
            <p className="text-[11px] text-slate-500 mb-0.5">{formatSessionDateTime(room)}{room.venue ? ` · ${room.venue}` : ''}</p>
            <p className="text-sm font-bold leading-snug text-slate-800">{room.name}</p>
            {room.description && <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{room.description}</p>}
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          {!res ? (
            <button type="button" className="text-slate-300 hover:text-blue-500 transition-colors" onClick={() => handleReserve(room)} title="Reserve slot">
              <Bookmark size={16} fill="none" />
            </button>
          ) : res.attended ? (
            <button type="button" className="text-blue-500" title="Reserved">
              <Bookmark size={16} fill="currentColor" />
            </button>
          ) : (
            <>
              <button type="button" className="text-blue-500" title="Reserved">
                <Bookmark size={16} fill="currentColor" />
              </button>
              <button type="button" onClick={() => handleCancelReservation(room)} className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full hover:bg-red-100">Cancel</button>
            </>
          )}
          {res?.attended && !(rev || res?.reviewSubmitted) && (
            <button type="button" onClick={() => setReviewModal({ roomId: room.id, roomName: room.name, presenterNames: room.presenterNames || [] })} className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full hover:bg-amber-100">Review</button>
          )}
          {rev && <span className="text-amber-400 text-xs">{'★'.repeat(getReviewDisplayRating(rev))}</span>}
          {res?.reviewSubmitted && !rev && <span className="text-[10px] font-bold text-emerald-600">Reviewed</span>}
          <ChevronRight size={18} className="text-slate-300 mt-1" />
          </div>
        </div>
      </div>
    );
  };

  const notifyCategoryLabel = (t: InAppNotifyType): string => {
    switch (t) {
      case 'meal': return 'Meals';
      case 'room': return 'Breakout sessions';
      case 'travel': return 'Travel & accommodation';
      case 'certificate': return 'Certificate';
      default: return 'Update';
    }
  };

  const renderBellPanel = () =>
    bellPanelOpen ? (
      <div
        className="absolute right-0 top-full mt-2 z-[60] w-[min(calc(100vw-2rem),20rem)] rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden"
        role="dialog"
        aria-label="Notification list"
      >
        <div className="px-3 py-2.5 border-b border-slate-100 flex items-center justify-between gap-2 bg-slate-50/80">
          <p className="text-sm font-black text-slate-800">Notifications</p>
          {inAppNotifications.length > 0 ? (
            <button
              type="button"
              className="text-[11px] font-bold text-blue-600 hover:underline shrink-0"
              onClick={() => {
                setInAppNotifications((prev) => {
                  const allTypes = new Set(prev.map((n) => n.type));
                  queueMicrotask(() => syncQuickActionBadgesForNotifyTypes(allTypes));
                  return [];
                });
              }}
            >
              Clear all
            </button>
          ) : null}
        </div>
        <ul className="max-h-72 overflow-y-auto py-1">
          {inAppNotifications.length === 0 ? (
            <li className="px-3 py-8 text-center text-sm text-slate-500">No notifications yet.</li>
          ) : (
            inAppNotifications.map((n) => (
              <li
                key={n.id}
                className={`px-3 py-2.5 border-b border-slate-100 last:border-0 border-l-4 pl-3 text-left ${
                  n.type === 'meal'
                    ? 'border-l-amber-500 bg-amber-50/30'
                    : n.type === 'room'
                    ? 'border-l-blue-500 bg-blue-50/30'
                    : n.type === 'travel'
                    ? 'border-l-orange-500 bg-orange-50/30'
                    : 'border-l-emerald-500 bg-emerald-50/30'
                }`}
              >
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-0.5">{notifyCategoryLabel(n.type)}</p>
                <p className={`text-sm leading-snug ${n.read ? 'text-slate-600' : 'text-slate-900 font-semibold'}`}>{n.msg}</p>
                <p className="text-[10px] text-slate-400 mt-1">{new Date(n.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}</p>
              </li>
            ))
          )}
        </ul>
      </div>
    ) : null;

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
        <div ref={mobileBellRef} className="relative shrink-0">
          <button
            type="button"
            onClick={handleBellToggle}
            className="relative w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 text-slate-700"
            aria-label="Notifications"
            aria-expanded={bellPanelOpen}
            aria-haspopup="dialog"
          >
            <Bell size={18} />
            {bellUnreadCount > 0 ? (
              <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
                {Math.min(99, bellUnreadCount)}
              </span>
            ) : null}
          </button>
          {renderBellPanel()}
        </div>
      </header>

      {/* Scan toast */}
      {scanToast && (
        <div className={`mx-4 mt-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-center ${scanToast.startsWith('✅') ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
          {scanToast}
        </div>
      )}

      {/* Content notification (new meals, rooms, certificates) */}
      {contentNotify && (
        <div
          className={`mx-4 mt-2 rounded-xl px-4 py-3 text-sm font-semibold flex items-center justify-between gap-3 ${
            contentNotify.type === 'meal' ? 'bg-amber-50 text-amber-800 border border-amber-200' :
            contentNotify.type === 'room' ? 'bg-blue-50 text-blue-800 border border-blue-200' :
            contentNotify.type === 'travel' ? 'bg-orange-50 text-orange-900 border border-orange-200' :
            'bg-emerald-50 text-emerald-800 border border-emerald-200'
          }`}
        >
          <span>{contentNotify.msg}</span>
          <button type="button" onClick={dismissContentNotify} className="shrink-0 p-1 rounded-full hover:bg-black/5" aria-label="Dismiss">
            <X size={16} />
          </button>
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
                  { icon: <Award size={20} className={certReady ? 'text-amber-500' : 'text-purple-600'} />, label: 'Certificate', bg: certReady ? 'bg-amber-50' : 'bg-purple-50', action: () => setCertModal(true), badge: certBadgeDisplay },
                  { icon: <CreditCard size={20} className="text-indigo-600" />, label: 'My ID', bg: 'bg-indigo-50', action: () => setIdModal(true) },
                  { icon: <CalendarDays size={20} className="text-emerald-600" />, label: 'Schedule', bg: 'bg-emerald-50', action: () => setActiveTab('schedule'), badge: scheduleBadgeDisplay },
                  { icon: <Utensils size={20} className="text-orange-500" />, label: 'Meals', bg: 'bg-orange-50', action: () => setActiveTab('meals'), badge: mealsBadgeDisplay },
                  { icon: <Newspaper size={20} className="text-rose-500" />, label: 'Articles Home', bg: 'bg-rose-50', action: () => setActiveTab('articles') },
                ].map(({ icon, label, bg, action, badge }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={action}
                    className="relative bg-white rounded-2xl p-3 flex flex-col items-center gap-2 shadow-sm border border-slate-100 hover:shadow-md active:scale-95 transition-all"
                    aria-label={badge != null && badge > 0 ? `${label}, ${badge} notification${badge > 1 ? 's' : ''}` : label}
                  >
                    {badge != null && badge > 0 && (
                      <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-blue-600 text-white text-[10px] font-black leading-none z-10" aria-hidden>
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
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
                        <p className="text-[11px] text-slate-500 mb-0.5">{formatSessionDateTime(room)}{room.venue ? ` · ${room.venue}` : ''}</p>
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

            <div className="px-4 pb-2">
              <label htmlFor="breakout-room-search-mobile" className="sr-only">
                Search breakout sessions
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" aria-hidden />
                <input
                  id="breakout-room-search-mobile"
                  type="search"
                  value={roomSearchQuery}
                  onChange={(e) => setRoomSearchQuery(e.target.value)}
                  placeholder="Search title, description, venue, speakers…"
                  autoComplete="off"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
                {roomSearchQuery ? (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => setRoomSearchQuery('')}
                    className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    <X size={16} />
                  </button>
                ) : null}
              </div>
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
                <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center text-sm text-slate-400 shadow-sm">
                  {rooms.length === 0
                    ? 'No breakout sessions yet.'
                    : roomsForScheduleDate.length === 0
                      ? 'No sessions for this date.'
                      : 'No sessions match your search. Try other keywords or clear the search.'}
                </div>
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
                        <p className="text-[11px] text-slate-500 mb-0.5">{formatSessionDateTime(room)}{room.venue ? ` · ${room.venue}` : ''}</p>
                        <p className="text-sm font-bold text-slate-800 leading-snug">{room.name}</p>
                        {room.description && <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{room.description}</p>}
                        <div className="flex items-center gap-2 mt-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                          {!res ? (
                            <button type="button" onClick={() => handleReserve(room)} className="px-3 py-1.5 rounded-full bg-blue-600 text-white text-xs font-bold">Reserve</button>
                          ) : res.attended ? (
                            null
                          ) : (
                            <>
                              <span className="px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">Reserved</span>
                              <button type="button" onClick={() => handleCancelReservation(room)} className="px-3 py-1.5 rounded-full bg-red-100 text-red-700 text-xs font-bold">Cancel</button>
                            </>
                          )}
                          {res?.attended && !(rev || res?.reviewSubmitted) && (
                            <button type="button" onClick={() => setReviewModal({ roomId: room.id, roomName: room.name, presenterNames: room.presenterNames || [] })} className="px-3 py-1.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
                              Review
                            </button>
                          )}
                          {rev && <span className="text-amber-400 text-xs font-bold">{'★'.repeat(getReviewDisplayRating(rev))}</span>}
                          {res?.reviewSubmitted && !rev && <span className="text-xs font-bold text-emerald-600">Reviewed</span>}
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
              {exhibitorOnlyBoothRegs.length > 0 && (
                <div className="mt-4 space-y-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={2} />
                    <input
                      type="search"
                      value={exhibitorSearchQuery}
                      onChange={(e) => setExhibitorSearchQuery(e.target.value)}
                      placeholder="Search name, org, products…"
                      className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      autoComplete="off"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setExhibitorCategoryFilter('all')}
                      className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors ${
                        exhibitorCategoryFilter === 'all'
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300'
                      }`}
                    >
                      All
                    </button>
                    {EXHIBITOR_BOOTH_CATEGORIES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setExhibitorCategoryFilter(c)}
                        className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors ${
                          exhibitorCategoryFilter === c
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {exhibitorOnlyBoothRegs.length === 0 ? (
              <div className="mx-4 bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400 text-sm shadow-sm">No exhibitors yet.</div>
            ) : filteredBoothRegs.length === 0 ? (
              <div className="mx-4 bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400 text-sm shadow-sm">
                No exhibitors match your search or filter.
              </div>
            ) : (
              <div className="px-4 flex flex-col gap-4 pb-4">
                {filteredBoothRegs.map((booth, i) => {
                  const boothBg = exhibitorBackgroundSrc(booth);
                  const boothProf = exhibitorProfileSrc(booth);
                  const catLabel = exhibitorCategoryLabel(booth);
                  const chipKey = String(booth.boothCategory || '').trim() || 'Other';
                  return (
                  <button key={booth.id} type="button" onClick={() => setExhibitorDetailBooth(booth)} className="w-full text-left flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow">
                    <div className={`h-32 w-full flex items-center justify-center overflow-hidden shrink-0 ${boothBg ? '' : `bg-gradient-to-br ${CARD_GRADIENTS[i % CARD_GRADIENTS.length]}`}`}>
                      {boothBg ? (
                        <img src={boothBg} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Store size={40} className="text-white/40" />
                      )}
                    </div>
                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-8 h-8 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-xs font-black ${!boothProf ? SECTOR_COLORS[i % SECTOR_COLORS.length] : 'bg-slate-100'}`}>
                          {boothProf ? (
                            <img src={boothProf} alt="" className="w-full h-full object-cover block" />
                          ) : (
                            (booth.fullName as string)?.[0] || 'B'
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-sm">{booth.fullName || '—'}</p>
                          <p className="text-[10px] text-slate-400">{booth.sector}</p>
                          {catLabel ? (
                            <span className={`mt-1 inline-block ${exhibitorCategoryChipCls(chipKey)}`}>{catLabel}</span>
                          ) : null}
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 mb-2 max-h-20 overflow-y-auto overscroll-y-contain pr-1 leading-relaxed [scrollbar-width:thin]">{booth.sectorOffice || 'Event booth participant'}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-400">Booth #{booth.id.slice(0, 4).toUpperCase()}</span>
                      </div>
                    </div>
                  </button>
                );
                })}
              </div>
            )}
          </>
        )}

        {/* ── ARTICLES tab ─────────────────────────────────── */}
        {activeTab === 'articles' && (
          <ArticleBrowsePanel
            variant="mobile"
            loading={articlesLoading}
            articles={participantArticles}
            searchQuery={articleSearchQuery}
            onSearchChange={setArticleSearchQuery}
            categoryFilter={articleCategoryFilter}
            onCategoryChange={setArticleCategoryFilter}
            categoryChipNames={articleCategoryChipNames}
          />
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
              ) : eligibleMeals.map((meal) => (
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
      <nav className="fixed bottom-0 z-30 flex w-full max-w-md items-center justify-between gap-1 border-t border-slate-200 bg-white/95 backdrop-blur-md px-2 pb-5 pt-3 sm:px-4">
        <div className="flex flex-1 justify-around min-w-0">
          {([
            { id: 'home' as const, label: 'HOME', icon: <Home size={22} /> },
            { id: 'schedule' as const, label: 'BREAK OUT', icon: <Rocket size={22} /> },
          ] as const).map((item) => (
            <button key={item.id} type="button" onClick={() => setActiveTab(item.id)}
              className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 ${activeTab === item.id ? 'text-blue-600' : 'text-slate-400'}`}>
              {item.icon}
              <span className="text-[8px] font-black uppercase leading-tight text-center">{item.label}</span>
            </button>
          ))}
        </div>

        {/* Center QR button */}
        <div className="relative -top-6 shrink-0">
          <button type="button" onClick={() => setScanModal(true)}
            className="w-14 h-14 flex items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-400/50 active:scale-90 transition-transform hover:bg-blue-700">
            <QrCode size={26} />
          </button>
        </div>

        <div className="flex flex-1 justify-around min-w-0">
          {([
            { id: 'exhibitors' as const, label: 'EXHIBIT', icon: <Users size={20} /> },
            { id: 'profile' as const, label: 'PROFILE', icon: <User size={20} /> },
          ] as const).map((item) => (
            <button key={item.id} type="button" onClick={() => setActiveTab(item.id)}
              className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 ${activeTab === item.id ? 'text-blue-600' : 'text-slate-400'}`}>
              <span className="relative inline-flex">
                {item.icon}
                {item.id === 'profile' && travelAccIncomplete ? (
                  <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-orange-500 ring-2 ring-white" aria-hidden />
                ) : null}
              </span>
              <span className="text-[8px] font-black uppercase leading-tight text-center">{item.label}</span>
            </button>
          ))}
        </div>
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
                { id: 'schedule' as Tab, label: 'Break out room', icon: <Rocket size={18} />, badge: scheduleBadgeDisplay },
                { id: 'exhibitors' as Tab, label: 'Exhibitors', icon: <Store size={18} /> },
                { id: 'materials' as Tab, label: 'Materials', icon: <BookOpen size={18} /> },
                { id: 'articles' as Tab, label: 'Articles Home', icon: <Newspaper size={18} /> },
                { id: 'meals' as Tab, label: 'My Meals', icon: <Utensils size={18} />, badge: mealsBadgeDisplay },
                { id: 'profile' as Tab, label: 'Profile', icon: <User size={18} />, badge: travelAccIncomplete ? 1 : undefined },
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
          <NavItem icon={<CalendarDays size={17} />} label="Schedule" active={activeTab === 'schedule'} onClick={() => setActiveTab('schedule')} badge={scheduleBadgeDisplay} />
          <NavItem icon={<Store size={17} />} label="Exhibitors" active={activeTab === 'exhibitors'} onClick={() => setActiveTab('exhibitors')} />
          <NavItem icon={<BookOpen size={17} />} label="Materials" active={activeTab === 'materials'} onClick={() => setActiveTab('materials')} />
          <NavItem icon={<Newspaper size={17} />} label="Articles Home" active={activeTab === 'articles'} onClick={() => setActiveTab('articles')} />
          <NavItem icon={<Utensils size={17} />} label="My Meals" active={activeTab === 'meals'} onClick={() => setActiveTab('meals')} badge={mealsBadgeDisplay} />
          <NavItem icon={<User size={17} />} label="Profile" active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} badge={travelAccIncomplete ? 1 : undefined} />
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

      {/* Main — max-width + stronger side padding on laptop so content isn’t flush to the sidebar */}
      <main className="flex-1 ml-56 overflow-y-auto min-h-screen">
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-10 xl:px-12 2xl:px-14">
        {/* Top header — title row separate from toast so flex doesn’t crush the subtitle */}
        <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-sm border-b border-slate-100 py-4">
          <div className="flex items-start justify-between gap-4 min-w-0">
            <div className="min-w-0 flex-1 pr-2">
              <h1 className="text-2xl font-black leading-tight text-slate-900">{desktopPageHeader.title}</h1>
              {desktopPageHeader.subtitle ? (
                <p className="text-slate-500 text-sm mt-1 max-w-prose leading-relaxed">{desktopPageHeader.subtitle}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2 sm:gap-3 shrink-0 pt-0.5">
              {scanToast && <span className={`hidden sm:inline text-xs font-semibold px-3 py-1.5 rounded-full shrink-0 max-w-[10rem] truncate ${scanToast.startsWith('✅') ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`} title={scanToast}>{scanToast}</span>}
              <button type="button" onClick={() => setScanModal(true)} className="w-9 h-9 rounded-full bg-slate-100 hover:bg-blue-100 flex items-center justify-center transition-colors shrink-0"><QrCode size={17} className="text-slate-600" /></button>
              <div ref={desktopBellRef} className="relative shrink-0">
                <button
                  type="button"
                  onClick={handleBellToggle}
                  className="relative w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
                  aria-label="Notifications"
                  aria-expanded={bellPanelOpen}
                  aria-haspopup="dialog"
                >
                  <Bell size={17} className="text-slate-600" />
                  {bellUnreadCount > 0 ? (
                    <span className="absolute top-0.5 right-0.5 min-w-4 h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold leading-none">
                      {Math.min(99, bellUnreadCount)}
                    </span>
                  ) : null}
                </button>
                {renderBellPanel()}
              </div>
              <button type="button" onClick={() => setActiveTab('profile')} className="w-9 h-9 rounded-full overflow-hidden bg-blue-600 flex items-center justify-center text-white text-xs font-black ring-2 ring-blue-200 hover:ring-blue-400 transition-all shrink-0">
                {profilePicUrl
                  ? <img src={profilePicUrl} alt={fullName} className="w-full h-full object-cover" />
                  : <span>{initials}</span>}
              </button>
            </div>
          </div>
          {contentNotify ? (
            <div
              className={`mt-3 flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold border w-full ${
                contentNotify.type === 'meal' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                contentNotify.type === 'room' ? 'bg-blue-50 text-blue-800 border-blue-200' :
                contentNotify.type === 'travel' ? 'bg-orange-50 text-orange-900 border-orange-200' :
                'bg-emerald-50 text-emerald-800 border-emerald-200'
              }`}
            >
              <span className="min-w-0 flex-1 leading-snug">{contentNotify.msg}</span>
              <button type="button" onClick={dismissContentNotify} className="p-1 rounded-full hover:bg-black/5 shrink-0 mt-0.5" aria-label="Dismiss"><X size={14} /></button>
            </div>
          ) : null}
        </header>

        {/* HOME */}
        {activeTab === 'home' && (
          <div className="py-4 sm:py-6 lg:py-8 space-y-7">
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
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                {[
                  { icon: <QrCode size={20} className="text-blue-600" />, label: 'Attendance', bg: 'bg-blue-50', action: () => setScanModal(true) },
                  { icon: <Award size={20} className={certReady ? 'text-amber-500' : 'text-purple-600'} />, label: 'Certificate', bg: certReady ? 'bg-amber-50' : 'bg-purple-50', action: () => setCertModal(true), badge: certBadgeDisplay },
                  { icon: <CalendarDays size={20} className="text-emerald-600" />, label: 'Schedule', bg: 'bg-emerald-50', action: () => setActiveTab('schedule'), badge: scheduleBadgeDisplay },
                  { icon: <Utensils size={20} className="text-orange-500" />, label: 'Meals', bg: 'bg-orange-50', action: () => setActiveTab('meals'), badge: mealsBadgeDisplay },
                  { icon: <BookOpen size={20} className="text-orange-500" />, label: 'Materials', bg: 'bg-orange-50', action: () => setActiveTab('materials') },
                  { icon: <Newspaper size={20} className="text-rose-500" />, label: 'Articles Home', bg: 'bg-rose-50', action: () => setActiveTab('articles') },
                ].map(({ icon, label, bg, action, badge }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={action}
                    className="relative bg-white rounded-2xl p-4 flex flex-col items-center gap-2.5 shadow-sm border border-slate-100 hover:shadow-md hover:-translate-y-0.5 transition-all"
                    aria-label={badge != null && badge > 0 ? `${label}, ${badge} notification${badge > 1 ? 's' : ''}` : label}
                  >
                    {badge != null && badge > 0 && (
                      <span className="absolute top-2 right-2 min-w-[20px] h-5 px-1 flex items-center justify-center rounded-full bg-blue-600 text-white text-[10px] font-black leading-none z-10" aria-hidden>
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
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
                  {exhibitorOnlyBoothRegs.length === 0
                    ? <div className="bg-white rounded-2xl border border-slate-100 p-5 text-center text-slate-400 text-xs shadow-sm">No exhibitors yet.</div>
                    : <div className="space-y-3">
                        {exhibitorOnlyBoothRegs.slice(0, 3).map((booth, i) => {
                          const fBg = exhibitorBackgroundSrc(booth);
                          const fProf = exhibitorProfileSrc(booth);
                          const featCat = exhibitorCategoryLabel(booth);
                          const featChipKey = String(booth.boothCategory || '').trim() || 'Other';
                          return (
                          <button key={booth.id} type="button" onClick={() => setExhibitorDetailBooth(booth)} className="w-full text-left bg-white rounded-2xl border border-slate-100 p-3 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                            <div className={`h-20 w-full rounded-xl mb-2 flex items-center justify-center overflow-hidden ${fBg ? '' : 'bg-gradient-to-br from-slate-100 to-slate-200'}`}>
                              {fBg ? <img src={fBg} alt="" className="w-full h-full object-cover" /> : <Store size={28} className="text-slate-300" />}
                            </div>
                            <div className="flex items-center gap-2 mb-2">
                              <div className={`w-8 h-8 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-xs font-black ${!fProf ? SECTOR_COLORS[i % SECTOR_COLORS.length] : 'bg-slate-100'}`}>
                                {fProf ? (
                                  <img src={fProf} alt="" className="w-full h-full object-cover block" />
                                ) : (
                                  (booth.fullName as string)?.[0] || 'B'
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold truncate">{booth.fullName || '—'}</p>
                                <p className="text-[10px] text-slate-400 truncate">{booth.sector}</p>
                                {featCat ? (
                                  <span className={`mt-0.5 inline-block ${exhibitorCategoryChipCls(featChipKey)}`}>{featCat}</span>
                                ) : null}
                              </div>
                            </div>
                            <p className="text-[10px] text-slate-500 max-h-14 overflow-y-auto overscroll-y-contain pr-1 leading-relaxed [scrollbar-width:thin]">{booth.sectorOffice || 'Event booth participant'}</p>
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-[10px] text-slate-400">Booth #{booth.id.slice(0, 4).toUpperCase()}</span>
                              <span className="text-[11px] font-bold text-blue-600 flex items-center gap-0.5">View <ExternalLink size={10} /></span>
                            </div>
                          </button>
                        );
                        })}
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
          <div className="py-4 sm:py-6 lg:py-8">
            <div className="mb-4 max-w-2xl space-y-3">
              <label htmlFor="breakout-room-search-desktop" className="sr-only">
                Search breakout sessions
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" aria-hidden />
                <input
                  id="breakout-room-search-desktop"
                  type="search"
                  value={roomSearchQuery}
                  onChange={(e) => setRoomSearchQuery(e.target.value)}
                  placeholder="Search title, description, venue, speakers…"
                  autoComplete="off"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
                {roomSearchQuery ? (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => setRoomSearchQuery('')}
                    className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    <X size={16} />
                  </button>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {mobileFilterOptions.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setMobileFilter(f)}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                      mobileFilter === f
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                        : 'bg-blue-100/70 text-blue-700 hover:bg-blue-100'
                    }`}
                  >
                    {f === 'all' ? 'All Tracks' : new Date(f).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                  </button>
                ))}
              </div>
            </div>
            {rooms.length === 0 ? (
              <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center text-slate-400 shadow-sm">No breakout sessions yet.</div>
            ) : filteredRooms.length === 0 ? (
              <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center text-sm text-slate-400 shadow-sm">
                {roomsForScheduleDate.length === 0
                  ? 'No sessions for this date.'
                  : 'No sessions match your search. Try other keywords or clear the search.'}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredRooms.map((room, i) => {
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
                      className="flex cursor-pointer overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition-shadow hover:shadow-md"
                    >
                      <div
                        className={`w-24 min-h-[100px] shrink-0 ${!room.backgroundImage ? `bg-gradient-to-br ${grad}` : ''}`}
                        style={room.backgroundImage ? { backgroundImage: `url(${room.backgroundImage})`, backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', backgroundColor: '#f1f5f9' } : undefined}
                      />
                      <div className="flex flex-1 min-w-0 items-start justify-between gap-4 p-5">
                        <div className="min-w-0 flex-1">
                          <p className="mb-0.5 text-[11px] text-slate-500">
                            {formatSessionDateTime(room)}
                            {room.venue && ` · ${room.venue}`}
                          </p>
                          <h3 className="text-sm font-bold leading-snug text-slate-800">{room.name}</h3>
                          {room.description && <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">{room.description}</p>}
                          <div className="mt-2 flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            {!res ? (
                              <button type="button" onClick={() => handleReserve(room)} className="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700">
                                Reserve
                              </button>
                            ) : res.attended ? (
                              <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-700">
                                <CheckCircle2 size={12} /> Reserved
                              </span>
                            ) : (
                              <>
                                <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-700">
                                  <CheckCircle2 size={12} /> Reserved
                                </span>
                                <button type="button" onClick={() => handleCancelReservation(room)} className="rounded-full bg-red-100 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-200">
                                  Cancel
                                </button>
                              </>
                            )}
                            {res?.attended && !(rev || res?.reviewSubmitted) && (
                              <button type="button" onClick={() => setReviewModal({ roomId: room.id, roomName: room.name, presenterNames: room.presenterNames || [] })} className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-200">
                                <Star size={11} /> Review
                              </button>
                            )}
                            {rev && <span className="text-xs font-bold text-amber-500">{'★'.repeat(getReviewDisplayRating(rev))}</span>}
                            {res?.reviewSubmitted && !rev && <span className="text-xs font-bold text-emerald-600">Reviewed</span>}
                          </div>
                        </div>
                        <ChevronRight size={20} className="shrink-0 text-slate-300" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* EXHIBITORS */}
        {activeTab === 'exhibitors' && (
          <div className="py-4 sm:py-6 lg:py-8">
            {exhibitorOnlyBoothRegs.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center text-slate-400 shadow-sm">No exhibitors yet.</div>
            ) : (
              <>
                <div className="mb-6 max-w-2xl space-y-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" strokeWidth={2} />
                    <input
                      type="search"
                      value={exhibitorSearchQuery}
                      onChange={(e) => setExhibitorSearchQuery(e.target.value)}
                      placeholder="Search name, organization, products…"
                      className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                      autoComplete="off"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setExhibitorCategoryFilter('all')}
                      className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                        exhibitorCategoryFilter === 'all'
                          ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300'
                      }`}
                    >
                      All
                    </button>
                    {EXHIBITOR_BOOTH_CATEGORIES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setExhibitorCategoryFilter(c)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                          exhibitorCategoryFilter === c
                            ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
                {filteredBoothRegs.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center text-slate-400 shadow-sm">
                    No exhibitors match your search or filter.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredBoothRegs.map((booth, i) => {
                      const dBg = exhibitorBackgroundSrc(booth);
                      const dProf = exhibitorProfileSrc(booth);
                      const catLabel = exhibitorCategoryLabel(booth);
                      const chipKey = String(booth.boothCategory || '').trim() || 'Other';
                      return (
                        <button
                          key={booth.id}
                          type="button"
                          onClick={() => setExhibitorDetailBooth(booth)}
                          className="text-left bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow"
                        >
                          <div
                            className={`h-28 flex items-center justify-center overflow-hidden shrink-0 ${dBg ? '' : `bg-gradient-to-br ${CARD_GRADIENTS[i % CARD_GRADIENTS.length]}`}`}
                          >
                            {dBg ? (
                              <img src={dBg} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <Store size={40} className="text-white/30" />
                            )}
                          </div>
                          <div className="p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <div
                                className={`w-8 h-8 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-xs font-black ${!dProf ? SECTOR_COLORS[i % SECTOR_COLORS.length] : 'bg-slate-100'}`}
                              >
                                {dProf ? (
                                  <img src={dProf} alt="" className="w-full h-full object-cover block" />
                                ) : (
                                  (booth.fullName as string)?.[0] || 'B'
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-bold truncate">{booth.fullName || '—'}</p>
                                <p className="text-[10px] text-slate-400 truncate">{booth.sector}</p>
                                {catLabel ? (
                                  <span className={`mt-1 inline-block ${exhibitorCategoryChipCls(chipKey)}`}>{catLabel}</span>
                                ) : null}
                              </div>
                            </div>
                            <p className="text-xs text-slate-500 mb-3 max-h-24 overflow-y-auto overscroll-y-contain pr-1 leading-relaxed [scrollbar-width:thin]">
                              {booth.sectorOffice || 'Event booth participant'}
                            </p>
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-slate-400">Booth #{booth.id.slice(0, 4).toUpperCase()}</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* MATERIALS */}
        {activeTab === 'materials' && (
          <div className="py-4 sm:py-6 lg:py-8">
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

        {/* ARTICLES */}
        {activeTab === 'articles' && (
          <ArticleBrowsePanel
            variant="desktop"
            loading={articlesLoading}
            articles={participantArticles}
            searchQuery={articleSearchQuery}
            onSearchChange={setArticleSearchQuery}
            categoryFilter={articleCategoryFilter}
            onCategoryChange={setArticleCategoryFilter}
            categoryChipNames={articleCategoryChipNames}
          />
        )}

        {/* MEALS */}
        {activeTab === 'meals' && (
          <div className="py-4 sm:py-6 lg:py-8">
            {eligibleMeals.length === 0
              ? <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center text-slate-400 shadow-sm">No entitlements available for you yet.</div>
              : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                  {eligibleMeals.map((meal) => (
                    <MealEntitlementCard
                      key={meal.id}
                      meal={meal}
                      mealLabels={MEAL_LABELS}
                      boothRegs={boothRegs}
                      now={new Date(claimClockTick)}
                      claimed={hasClaimedMeal(meal.id)}
                      onClaim={() => setIdModal(true)}
                      paddingClass="p-5"
                    />
                  ))}
                </div>}
          </div>
        )}

        {/* PROFILE */}
        {activeTab === 'profile' && (
          <div className="py-4 sm:py-6 lg:py-8 max-w-2xl">
            <ProfileContent />
          </div>
        )}
        </div>
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

      {/* Overlap reservation popup */}
      {overlapModal && (
        <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6">
            <h3 className="text-lg font-black text-slate-900 mb-3">Cannot Reserve</h3>
            <p className="text-slate-600 text-sm leading-relaxed mb-4">
              You already reserved <span className="font-bold text-slate-800">&quot;{overlapModal.conflictingRoomName}&quot;</span>. There is an overlap — you can only reserve one breakout room at a time. Cancel your existing reservation first to reserve this session.
            </p>
            <button
              type="button"
              onClick={() => setOverlapModal(null)}
              className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700"
            >
              OK
            </button>
          </div>
        </div>
      )}

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
              {/* Diagonal staggered watermark pattern - like classic "sample" style */}
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
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[10px] text-slate-400">April 9–11, 2026</span>
              <a href={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(digitalIdQrData)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline"><Download size={11} /> Download QR</a>
            </div>
          </div>
        </div>
      )}

      {/* Certificate modal - one certificate per attended & reviewed session */}
      {certModal && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
            <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-4 bg-gradient-to-r from-blue-600 to-blue-700 rounded-t-[22px] text-white">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center"><Trophy size={20} /></div>
                <div>
                  <h3 className="font-black text-lg tracking-tight">Certificates</h3>
                  <p className="text-[11px] font-medium text-blue-100">Your earned participation certificates</p>
                </div>
              </div>
              <button type="button" onClick={() => setCertModal(false)} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors shrink-0"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 bg-slate-50">
            {certifiableRooms.length > 0 ? (
              <div className="space-y-6 overflow-y-auto">
                <p className="text-xs text-slate-500 mb-2">One certificate per attended session. Preview below and download as PDF.</p>
                {certifiableRooms.map((s) => (
                  <div key={s.roomId} className="space-y-3">
                    <div className="aspect-[297/210] max-w-full mx-auto bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden shrink-0">
                      <div className="h-full w-full flex flex-col items-center justify-center p-4 sm:p-6 text-center">
                        <img src="/iscene.png" alt="" className="w-10 h-10 sm:w-12 sm:h-12 object-contain mb-2" />
                        <h2 className="text-lg sm:text-xl font-bold text-slate-800">iSCENE 2026</h2>
                        <p className="text-[10px] sm:text-xs text-slate-600 mb-1">International Smart &amp; Sustainable Cities Expo</p>
                        <p className="text-sm sm:text-base font-bold text-slate-800 mb-2">Certificate of Participation</p>
                        <p className="text-xs text-slate-600 mb-0.5">This certifies that</p>
                        <p className="text-base sm:text-lg font-bold text-slate-900 mb-1">{fullName}</p>
                        <p className="text-[10px] sm:text-xs text-slate-600 max-w-xs mx-auto leading-tight">
                          has participated in the breakout session &ldquo;{s.roomName}&rdquo; at the iSCENE 2026 Global Summit.
                        </p>
                        <p className="text-[10px] text-slate-500 mt-2">{new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => handleDownloadCertificate(s)} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 text-sm shadow-md shadow-blue-200/50"><Download size={18} /> Download PDF</button>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="space-y-2 mb-4">
                  {[{label:'Attend a breakout session',done:attendedRoomIds.length>0},{label:'Submit a session review',done:reviewedRoomIds.length>0}].map(({label,done})=>(
                    <div key={label} className="flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-200">
                      {done?<CheckCircle2 size={18} className="text-blue-600 shrink-0"/>:<Clock size={18} className="text-slate-400 shrink-0"/>}
                      <span className={`text-sm ${done?'text-slate-800 font-medium':'text-slate-500'}`}>{label}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-500 text-center">Attend a session and submit a review to earn a certificate for that session.</p>
              </>
            )}
            </div>
          </div>
        </div>
      )}

      {/* Certificate preview modal - shows certificate design with download button */}
      {certificatePreview && (
        <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] border border-slate-200">
            <div className="flex items-center justify-between gap-3 px-5 py-4 bg-gradient-to-r from-blue-600 to-blue-700 rounded-t-[22px] text-white shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center"><Award size={20} /></div>
                <h3 className="font-black text-lg tracking-tight">Certificate Preview</h3>
              </div>
              <button type="button" onClick={() => setCertificatePreview(null)} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors shrink-0"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50">
              {/* Certificate design - landscape layout matching PDF */}
              <div className="aspect-[297/210] max-w-full mx-auto bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden" style={{ minHeight: 200 }}>
                <div className="h-full w-full flex flex-col items-center justify-center p-6 sm:p-8 text-center">
                  <img src="/iscene.png" alt="" className="w-12 h-12 sm:w-14 sm:h-14 object-contain mb-3" />
                  <h2 className="text-xl sm:text-2xl font-bold text-slate-800">iSCENE 2026</h2>
                  <p className="text-xs sm:text-sm text-slate-600 mb-2">International Smart &amp; Sustainable Cities Expo</p>
                  <p className="text-base sm:text-lg font-bold text-slate-800 mb-4">Certificate of Participation</p>
                  <p className="text-sm text-slate-600 mb-1">This certifies that</p>
                  <p className="text-lg sm:text-xl font-bold text-slate-900 mb-2">{fullName}</p>
                  <p className="text-xs sm:text-sm text-slate-600 max-w-md">
                    has participated in the breakout session &ldquo;{certificatePreview.roomName}&rdquo; at the iSCENE 2026 Global Summit.
                  </p>
                  <p className="text-xs text-slate-500 mt-4">{new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                </div>
              </div>
              <button type="button" onClick={() => handleDownloadCertificate(certificatePreview)} className="w-full mt-4 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-md shadow-blue-200/50"><Download size={20} /> Download PDF</button>
            </div>
          </div>
        </div>
      )}

      {/* Exhibitor Booth Detail modal */}
      {exhibitorDetailBooth && (() => {
        const detailBannerUrl = exhibitorBackgroundSrc(exhibitorDetailBooth);
        const detailProfileUrl = exhibitorProfileSrc(exhibitorDetailBooth);
        return (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg max-h-[90vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="font-black text-lg">Booth Profile</h3>
              <button type="button" onClick={() => setExhibitorDetailBooth(null)} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {/* Booth background banner only (not logo / profile) */}
              <div className={`h-36 flex items-center justify-center overflow-hidden shrink-0 ${detailBannerUrl ? '' : 'bg-gradient-to-br from-blue-100 via-blue-50 to-slate-100'}`}>
                {detailBannerUrl ? (
                  <img src={detailBannerUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Store size={48} className="text-blue-300" />
                )}
              </div>
              <div className="p-5 space-y-4">
                {/* Profile */}
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-base font-black text-blue-600 shrink-0 overflow-hidden">
                    {detailProfileUrl ? (
                      <img src={detailProfileUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      (exhibitorDetailBooth.fullName as string)?.[0] || 'B'
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-black text-lg">{exhibitorDetailBooth.fullName || '—'}</p>
                    <p className="text-sm text-slate-500 max-h-20 overflow-y-auto [scrollbar-width:thin] leading-snug pr-0.5">{exhibitorDetailBooth.sectorOffice || exhibitorDetailBooth.sector || 'Exhibitor'}</p>
                    {exhibitorCategoryLabel(exhibitorDetailBooth) ? (
                      <span
                        className={`mt-1 inline-block ${exhibitorCategoryChipCls(String(exhibitorDetailBooth.boothCategory || '').trim() || 'Other')}`}
                      >
                        {exhibitorCategoryLabel(exhibitorDetailBooth)}
                      </span>
                    ) : null}
                    <p className="text-[11px] text-slate-400 mt-1">Booth #{exhibitorDetailBooth.id?.slice(0, 6).toUpperCase() || '—'}</p>
                  </div>
                </div>
                {/* Title & details */}
                {exhibitorDetailBooth.boothDescription && (
                  <div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Description</p>
                    <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5 [scrollbar-width:thin]">
                      <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{exhibitorDetailBooth.boothDescription}</p>
                    </div>
                  </div>
                )}
                {exhibitorDetailBooth.boothProducts && (
                  <div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Products / Services</p>
                    <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5 [scrollbar-width:thin]">
                      <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{exhibitorDetailBooth.boothProducts}</p>
                    </div>
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
        );
      })()}

      {/* Breakout Room Detail - Full view with Back */}
      {detailRoom && (() => {
        const res = reservations[detailRoom.id];
        const rev = reviews[detailRoom.id];
        const reviewDone = !!(rev || res?.reviewSubmitted);
        const roomMats = presenterMaterials.filter((m) => m.roomId === detailRoom.id);
        const currentStep = !res ? 1 : !res.attended ? 2 : !reviewDone ? 3 : 4;
        const steps = [
          { id: 'reserve', label: 'RESERVE', done: !!res, current: currentStep === 1 },
          { id: 'timein', label: 'TIME IN', done: res?.attended, current: currentStep === 2 },
          { id: 'review', label: 'REVIEW', done: reviewDone, current: currentStep === 3 },
          { id: 'cert', label: 'CERTIFICATE', done: reviewDone && !!res?.attended, current: currentStep === 4 },
        ];
        return (
        <div className="fixed inset-0 z-[70] min-h-dvh max-h-dvh overflow-y-auto overflow-x-hidden bg-slate-100 overscroll-y-contain pt-[env(safe-area-inset-top)]">
          {/* Header with Back */}
          <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-slate-200 px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-3 max-w-[100vw]">
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
                    ? () => {
                        setReviewModal({ roomId: detailRoom.id, roomName: detailRoom.name, presenterNames: detailRoom.presenterNames || [], fromRoom: detailRoom });
                        setDetailRoom(null);
                      }
                    : s.id === 'cert'
                    ? () => {
                        const certForThisRoom = certifiableRooms.find((c) => c.roomId === detailRoom.id);
                        if (certForThisRoom) {
                          setCertificatePreview(certForThisRoom);
                        } else {
                          setCertModal(true);
                        }
                      }
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
                      <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">
                        {s.id === 'review' ? (reviewDone ? 'SUBMITTED' : s.label) : s.label}
                      </span>
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

            {/* Session description - below image, above reserve slot; capped height, scrollable */}
            {detailRoom.description && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 sm:p-6 max-h-[200px] overflow-y-auto">
                <p className="text-slate-700 leading-relaxed text-sm sm:text-base">{detailRoom.description}</p>
              </div>
            )}

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
              {/* Left: Training Materials */}
              <div className="lg:col-span-2 space-y-6">
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

              {/* Right: Live Q&A */}
              <div className="space-y-6">
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
            <div id="detail-actions-bar" className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 sm:justify-between">
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 flex-1 sm:flex-initial min-w-0 w-full sm:w-auto">
                {!res
                  ? <button type="button" onClick={async () => { await handleReserve(detailRoom); }} className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700">Reserve Slot</button>
                  : !res.attended
                    ? <>
                        <button type="button" onClick={() => { setScanModalRoom(detailRoom); setScanModal(true); }} className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 flex items-center justify-center gap-2"><QrCode size={18} /> Scan QR at Breakout Room Entrance</button>
                        <button type="button" onClick={async () => { await handleCancelReservation(detailRoom); setDetailRoom(null); }} className="w-full sm:w-auto px-6 py-3 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600">Cancel reservation</button>
                      </>
                    : <span className="w-full sm:w-auto px-6 py-3 bg-emerald-100 text-emerald-700 font-bold rounded-xl flex items-center justify-center gap-2"><CheckCircle2 size={18} /> Timed In</span>}
                {res?.attended && !reviewDone && (
                  <button type="button" onClick={() => { setReviewModal({ roomId: detailRoom.id, roomName: detailRoom.name, presenterNames: detailRoom.presenterNames || [], fromRoom: detailRoom }); setDetailRoom(null); }} className="w-full sm:w-auto px-6 py-3 bg-amber-100 text-amber-700 font-bold rounded-xl hover:bg-amber-200 flex items-center justify-center gap-2"><Star size={18} /> Submit Review</button>
                )}
              </div>
              <button type="button" onClick={() => { setDetailRoom(null); setOverlapModal(null); }} className="w-full sm:w-auto sm:shrink-0 px-6 py-3 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600">Close</button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* DOST Review modal */}
      {reviewModal && (() => {
        const resForReviewModal = reservations[reviewModal.roomId];
        const reviewAlreadySubmitted = !!(reviews[reviewModal.roomId] || resForReviewModal?.reviewSubmitted);
        return (
        <div className="fixed inset-0 z-[70] flex max-h-dvh min-h-dvh w-full max-w-[100vw] items-end justify-center overflow-hidden bg-black/60 backdrop-blur-sm md:items-center md:p-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] md:pt-4 md:pb-4">
          <div className="flex max-h-[min(94dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl md:max-h-[min(90dvh,calc(100dvh-2rem))] md:rounded-3xl">
            {/* Mobile sheet handle */}
            <div className="md:hidden w-12 h-1 rounded-full bg-slate-300 mx-auto mt-2" aria-hidden />
            <div className="shrink-0 flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white">
              <div className="min-w-0 flex-1 pr-3">
                <h3 className="font-black text-lg text-slate-900">Session Evaluation Form</h3>
                <p className="text-sm font-semibold text-blue-600 mt-0.5 truncate">{reviewModal.roomName}</p>
              </div>
              <button type="button" onClick={() => { if (reviewModal?.fromRoom) setDetailRoom(reviewModal.fromRoom); setReviewModal(null); }} className="w-10 h-10 shrink-0 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 text-slate-600 active:scale-95 transition-transform" aria-label="Close"><X size={18} /></button>
            </div>
            {reviewAlreadySubmitted ? (
              <>
                <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 ring-4 ring-emerald-100/80">
                    <CheckCircle2 size={36} strokeWidth={2.25} />
                  </div>
                  <div className="space-y-2 max-w-sm">
                    <p className="text-xl font-black text-slate-900">Submitted</p>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Your evaluation for this session is saved. You cannot submit again for this breakout.
                    </p>
                  </div>
                </div>
                <div className="shrink-0 border-t border-slate-200 bg-white p-4 sm:p-5 pt-3">
                  <div
                    className="flex w-full cursor-default items-center justify-center gap-2 rounded-xl bg-emerald-100 py-3.5 font-bold text-emerald-800"
                    role="status"
                    aria-live="polite"
                  >
                    <CheckCircle2 size={18} /> Submitted
                  </div>
                </div>
              </>
            ) : (
            <>
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 pb-8">
              {/* Part I */}
              <section className="space-y-5 p-5 sm:p-6 bg-gradient-to-br from-slate-50 to-white rounded-2xl border border-slate-200/80 shadow-sm">
                <div>
                  <h4 className="font-bold text-slate-800 text-base">PART I. SUBJECT MATTER</h4>
                  <p className="text-xs text-slate-500 mt-1">Rate: Low · Satisfactory · Very Good</p>
                </div>
                <div className="space-y-6">
                  <div className="space-y-2"><p className="text-sm font-semibold text-slate-700">Level of Content</p><DOSTPart1Scale value={dostPart1.levelOfContent} onChange={(v) => setDostPart1((p) => ({ ...p, levelOfContent: v }))} /></div>
                  <div className="space-y-2"><p className="text-sm font-semibold text-slate-700">Appropriateness</p><DOSTPart1Scale value={dostPart1.appropriateness} onChange={(v) => setDostPart1((p) => ({ ...p, appropriateness: v }))} /></div>
                  <div className="space-y-2"><p className="text-sm font-semibold text-slate-700">Applicability</p><DOSTPart1Scale value={dostPart1.applicability} onChange={(v) => setDostPart1((p) => ({ ...p, applicability: v }))} /></div>
                </div>
              </section>

              {/* Part II - Per speaker (exclude generic "Presenter" placeholder) */}
              {((reviewModal.presenterNames || []).filter((n) => n && String(n).trim() && n.toLowerCase() !== 'presenter').length
                ? (reviewModal.presenterNames || []).filter((n) => n && String(n).trim() && n.toLowerCase() !== 'presenter')
                : ['Speaker']
              ).map((speakerName) => {
                const r = dostPart2[speakerName] || getDefaultDOSTSpeakerRatings();
                const setR = (up: Partial<DOSTSpeakerRatings>) => setDostPart2((p) => ({ ...p, [speakerName]: { ...(p[speakerName] || getDefaultDOSTSpeakerRatings()), ...up } }));
                return (
                  <section key={speakerName} className="space-y-5 p-5 sm:p-6 bg-white rounded-2xl border border-slate-200 shadow-sm">
                    <div className="pb-4 border-b border-slate-200">
                      <h4 className="font-bold text-slate-800 text-base">PART II. SPEAKER</h4>
                      <p className="text-sm font-semibold text-blue-600 mt-1">{speakerName}</p>
                      <p className="text-xs text-slate-500 mt-0.5">1 Poor → 5 Excellent</p>
                    </div>
                    <div className="space-y-6">
                      <div className="space-y-3"><p className="text-sm font-semibold text-slate-700">Achievement of Session Objectives</p><DOSTScale15 value={r.achievementOfObjectives} onChange={(v) => setR({ achievementOfObjectives: v })} /></div>
                      <div>
                        <p className="text-sm font-semibold text-slate-700 mb-4">Mastery of Subject Matter</p>
                        <div className="space-y-4">
                          {[
                            { k: 'exhibitKnowledge', l: 'Ability to exhibit knowledge of subject matter' },
                            { k: 'answerQuestions', l: 'Ability to answer participant\'s questions' },
                            { k: 'currentDevelopments', l: 'Ability to inject current developments' },
                            { k: 'balanceTheoryPractice', l: 'Ability to balance principles/theories with practical applications' },
                          ].map(({ k, l }) => (
                            <div key={k} className="space-y-3">
                              <p className="text-sm text-slate-600 leading-snug">{l}</p>
                              <DOSTScale15 value={(r.mastery as any)[k]} onChange={(v) => setR({ mastery: { ...r.mastery, [k]: v } })} />
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-700 mb-4">Presentation of Subject Matter</p>
                        <div className="space-y-4">
                          {[
                            { k: 'preparedness', l: 'Preparedness of speaker' },
                            { k: 'organizeMaterials', l: 'Ability to organize materials for clarity and precision' },
                            { k: 'arouseInterest', l: 'Ability to arouse interest' },
                            { k: 'instructionalMaterials', l: 'Ability to use appropriate instructional materials' },
                          ].map(({ k, l }) => (
                            <div key={k} className="space-y-3">
                              <p className="text-sm text-slate-600 leading-snug">{l}</p>
                              <DOSTScale15 value={(r.presentation as any)[k]} onChange={(v) => setR({ presentation: { ...r.presentation, [k]: v } })} />
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-700 mb-4">Teacher-Related Personality Traits</p>
                        <div className="space-y-4">
                          {[
                            { k: 'rapport', l: 'Ability to establish rapport' },
                            { k: 'considerateness', l: 'Considerateness' },
                          ].map(({ k, l }) => (
                            <div key={k} className="space-y-3">
                              <p className="text-sm text-slate-600 leading-snug">{l}</p>
                              <DOSTScale15 value={(r.personality as any)[k]} onChange={(v) => setR({ personality: { ...r.personality, [k]: v } })} />
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="pt-4 border-t border-slate-200 space-y-3"><p className="text-sm font-semibold text-slate-700">Acceptability of Speaker as Resource Person</p><DOSTScale15 value={r.acceptability} onChange={(v) => setR({ acceptability: v })} /></div>
                    </div>
                  </section>
                );
              })}

              {/* Part III */}
              <section className="space-y-5 p-5 sm:p-6 bg-gradient-to-br from-slate-50 to-white rounded-2xl border border-slate-200/80 shadow-sm">
                <div>
                  <h4 className="font-bold text-slate-800 text-base">PART III. TRAINING ENVIRONMENT</h4>
                  <p className="text-xs text-slate-500 mt-1">1 Poor → 5 Excellent</p>
                </div>
                <div className="space-y-6">
                  <div className="space-y-3"><p className="text-sm font-semibold text-slate-700">Venue (room size, lighting, etc.)</p><DOSTScale15 value={dostPart3.venue} onChange={(v) => setDostPart3((p) => ({ ...p, venue: v }))} /></div>
                  <div className="space-y-3"><p className="text-sm font-semibold text-slate-700">Food</p><DOSTScale15 value={dostPart3.food} onChange={(v) => setDostPart3((p) => ({ ...p, food: v }))} /></div>
                  <div className="space-y-3"><p className="text-sm font-semibold text-slate-700">Ability of organizer to respond to participant&apos;s needs</p><DOSTScale15 value={dostPart3.organizerResponse} onChange={(v) => setDostPart3((p) => ({ ...p, organizerResponse: v }))} /></div>
                  <div className="space-y-2 pt-2">
                    <p className="text-xs font-medium text-slate-500">Description (optional)</p>
                    <textarea
                      value={dostPart3.description}
                      onChange={(e) => setDostPart3((p) => ({ ...p, description: e.target.value }))}
                      rows={2}
                      aria-required="false"
                      className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      placeholder="Additional remarks (optional)…"
                    />
                  </div>
                </div>
              </section>

              {/* Part IV - Required */}
              <section className="space-y-4 p-5 sm:p-6 bg-white rounded-2xl border border-slate-200 shadow-sm">
                <div>
                  <h4 className="font-bold text-slate-800 text-base">PART IV. COMMENTS & SUGGESTIONS <span className="text-red-500">*</span></h4>
                  <p className="text-xs text-slate-500 mt-1">Required. To improve future provision of DOST training assistance.</p>
                </div>
                <div className="space-y-2">
                  <textarea
                    value={dostPart4}
                    onChange={(e) => { setDostPart4(e.target.value); setPart4Error(null); }}
                    rows={4}
                    className={`w-full bg-slate-50 border rounded-xl p-4 text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none placeholder:text-slate-400 ${part4Error ? 'border-red-400 ring-2 ring-red-200' : 'border-slate-200 focus:border-blue-500'}`}
                    placeholder="Your comments, suggestions, and recommendations..."
                  />
                  {part4Error && <p className="text-sm font-medium text-red-600">{part4Error}</p>}
                </div>
              </section>
            </div>
            <div className="shrink-0 p-4 sm:p-5 pt-3 border-t border-slate-200 bg-white">
              <button type="button" onClick={handleSubmitReview} disabled={reviewSaving || !dostPart4.trim()} className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-blue-200/50 active:scale-[0.98] transition-transform">
                {reviewSaving ? <><Loader2 size={18} className="animate-spin" /> Submitting…</> : <><Star size={18} /> Submit Review</>}
              </button>
            </div>
            </>
            )}
          </div>
        </div>
        );
      })()}
    </>
  );
}
