import React from 'react';
import {
  Home,
  CalendarDays,
  Star,
  Upload,
  QrCode,
  CreditCard,
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
  Plus,
  LogOut,
  Mail,
  Edit2,
  Trash2,
  ExternalLink,
  ArrowLeft,
  ImageUp,
  RefreshCw,
  Menu,
  MessageCircle,
  Newspaper,
  DoorOpen,
  Utensils,
  Search,
  Zap,
  User,
  Bell,
  AlertTriangle,
  Plane,
  Hotel,
  Luggage,
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
import { getEntranceCalendarDateKey, isEntranceCheckedInForDateKey, mealSessionDateKeyManila } from './entranceCheckInDay';
import { QrScanModal } from './QrScanModal';
import { ArticleBrowsePanel } from './ArticleBrowsePanel';
import type { ArticleDoc } from './ArticlesManager';
import { useArticleCategoryNames } from './useArticleCategoryNames';
import { formatSessionDateTime, roomsOverlap } from './sessionRoomUtils';
import { registrationSectorEligibleForMeal } from './mealEligibility';
import { MealEntitlementCard } from './MealEntitlementCard';

const TRAVEL_ACCOMMODATION_REMINDER_MS = 3 * 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type PresenterTab =
  | 'home'
  | 'sessions'
  | 'breakouts'
  | 'reviews'
  | 'meals'
  | 'uploads'
  | 'travel'
  | 'articles'
  | 'profile';

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

type AttendeeReservation = {
  id: string;
  roomId: string;
  roomName: string;
  attended: boolean;
  reviewSubmitted: boolean;
  reservedAt: any;
};

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
  venue?: string;
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

const MEAL_LABELS: Record<string, string> = {
  breakfast: '🌅 Breakfast',
  snacks: '🍪 Snacks (AM)',
  lunch: '🍱 Lunch',
  snacks_pm: '🥤 Snacks (PM)',
  dinner: '🍽️ Dinner',
  kit: 'Kit',
};

const BREAKOUT_CARD_GRADIENTS = [
  'from-blue-700 via-blue-800 to-cyan-900',
  'from-emerald-600 via-teal-700 to-slate-900',
  'from-orange-500 via-red-600 to-rose-900',
  'from-purple-600 via-violet-700 to-indigo-900',
  'from-cyan-600 via-blue-700 to-slate-900',
  'from-amber-500 via-orange-600 to-red-800',
];

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
  const firstName = fullName.trim().split(/\s+/)[0] || 'there';
  const roleTitle = (registration?.positionTitle as string) || 'Presenter';
  const profilePicUrl = (registration?.profilePictureUrl as string | undefined) || null;
  const initials = fullName.split(' ').map((p: string) => p[0]).join('').toUpperCase().slice(0, 2);
  const registrationId = registration?.id as string | undefined;
  const participantSector = (registration?.sector as string) || '';
  const { names: articleCategoryChipNames } = useArticleCategoryNames();

  // ── Navigation ─────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = React.useState<PresenterTab>('home');
  const [mobileDrawerOpen, setMobileDrawerOpen] = React.useState(false);

  // ── Data ───────────────────────────────────────────────────────────────
  const [assignedRooms, setAssignedRooms] = React.useState<Room[]>([]);
  const [allRooms, setAllRooms] = React.useState<Room[]>([]);
  const [sessionReviews, setSessionReviews] = React.useState<SessionReview[]>([]);
  const [materials, setMaterials] = React.useState<PresenterMaterial[]>([]);
  const [entranceAttendanceRaw, setEntranceAttendanceRaw] = React.useState<Record<string, unknown> | null>(null);
  const [entranceTodayKey, setEntranceTodayKey] = React.useState(() => getEntranceCalendarDateKey());
  const hasEntryAttendance = React.useMemo(
    () => isEntranceCheckedInForDateKey(entranceAttendanceRaw, entranceTodayKey),
    [entranceAttendanceRaw, entranceTodayKey],
  );
  const [loading, setLoading] = React.useState(true);

  const [selectedRoomForChat, setSelectedRoomForChat] = React.useState<Room | null>(null);
  const [roomChatMessages, setRoomChatMessages] = React.useState<{ id: string; roomId: string; participantName: string; text: string; createdAt: any }[]>([]);

  // ── Modals / UI ────────────────────────────────────────────────────────
  const [scanModal, setScanModal] = React.useState(false);
  const [idModal, setIdModal] = React.useState(false);
  const [scanToast, setScanToast] = React.useState<string | null>(null);
  const [pwResetSent, setPwResetSent] = React.useState(false);
  const [travelDetails, setTravelDetails] = React.useState('');
  const [accommodationDetails, setAccommodationDetails] = React.useState('');
  const [travelSaving, setTravelSaving] = React.useState(false);
  const [editingTravel, setEditingTravel] = React.useState(false);
  type InAppNotifyType = 'travel';
  type InAppNotificationItem = { id: string; msg: string; type: InAppNotifyType; read: boolean; createdAt: number };
  const [inAppNotifications, setInAppNotifications] = React.useState<InAppNotificationItem[]>([]);
  const [bellPanelOpen, setBellPanelOpen] = React.useState(false);
  const [contentNotify, setContentNotify] = React.useState<{ msg: string; type: 'travel' } | null>(null);
  const [editingSessionRoom, setEditingSessionRoom] = React.useState<Room | null>(null);
  const [editSessionForm, setEditSessionForm] = React.useState({ name: '', description: '', sessionDate: '', startTime: '', endTime: '', projectDetail: '', backgroundImage: '' });
  const [editSessionBgFile, setEditSessionBgFile] = React.useState<File | null>(null);
  const [editSessionSaving, setEditSessionSaving] = React.useState(false);

  // ── Upload ───────────────────────────────────────────────────────────────
  const [uploadingFile, setUploadingFile] = React.useState(false);
  const [uploadRoomId, setUploadRoomId] = React.useState<string>('');

  // ── Articles (read-only browse, same as participant app) ─────────────────
  const [speakerArticles, setSpeakerArticles] = React.useState<ArticleDoc[]>([]);
  const [speakerArticlesLoading, setSpeakerArticlesLoading] = React.useState(true);
  const [speakerArticleSearchQuery, setSpeakerArticleSearchQuery] = React.useState('');
  const [speakerArticleCategoryFilter, setSpeakerArticleCategoryFilter] = React.useState<string>('all');

  const [attendeeReservations, setAttendeeReservations] = React.useState<Record<string, AttendeeReservation>>({});
  const [meals, setMeals] = React.useState<MealWindow[]>([]);
  const [foodClaims, setFoodClaims] = React.useState<FoodClaim[]>([]);
  const [boothRegs, setBoothRegs] = React.useState<{ id?: string; uid?: string; fullName?: string; boothLocationDetails?: string; status?: string }[]>([]);
  const [claimClockTick, setClaimClockTick] = React.useState(() => Date.now());
  const [attendeeMaterials, setAttendeeMaterials] = React.useState<
    { id: string; roomId?: string; roomName?: string; fileName: string; downloadUrl: string; fileType: string; fileSizeBytes: number }[]
  >([]);
  const [breakoutDateFilter, setBreakoutDateFilter] = React.useState<string>('all');
  const [breakoutSearchQuery, setBreakoutSearchQuery] = React.useState('');
  const [overlapModal, setOverlapModal] = React.useState<{ conflictingRoomName: string } | null>(null);
  const [reviewSearchQuery, setReviewSearchQuery] = React.useState('');
  const [reviewSessionFilter, setReviewSessionFilter] = React.useState<string>('all');
  const [reviewRatingFilter, setReviewRatingFilter] = React.useState<string>('all');

  const eligibleMeals = React.useMemo(
    () => meals.filter((m) => registrationSectorEligibleForMeal(m, registrationId, participantSector)),
    [meals, participantSector, registrationId],
  );

  const hasClaimedMeal = (mealId: string) => foodClaims.some((c) => c.mealId === mealId);

  const unclaimedMealsCount = React.useMemo(
    () => eligibleMeals.filter((m) => !foodClaims.some((c) => c.mealId === m.id)).length,
    [eligibleMeals, foodClaims],
  );
  const mealsBadgeDisplay = unclaimedMealsCount;
  const reviewsBadgeDisplay = sessionReviews.length > 0 ? Math.min(99, sessionReviews.length) : 0;

  React.useEffect(() => {
    setTravelDetails((registration?.travelDetails as string) || '');
    setAccommodationDetails((registration?.accommodationDetails as string) || '');
  }, [registration?.id, registration?.travelDetails, registration?.accommodationDetails]);

  const pushInAppNotification = React.useCallback((msg: string, type: InAppNotifyType) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    setInAppNotifications((prev) => [{ id, msg, type, read: false, createdAt: Date.now() }, ...prev].slice(0, 40));
  }, []);

  const bellUnreadCount = inAppNotifications.filter((n) => !n.read).length;

  const travelAccIncomplete =
    !String(travelDetails || '').trim() || !String(accommodationDetails || '').trim();

  React.useEffect(() => {
    if (loading) return;
    const t = String(travelDetails || '').trim();
    const a = String(accommodationDetails || '').trim();
    const storageKey = `iscene_${user.uid}_presenterTravelAccReminder`;
    if (t && a) {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* ignore */
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
      /* still show this session */
    }
    const travelMsg =
      'Please add your flight and accommodation in Travel & stay — both help organizers with logistics.';
    setContentNotify({ msg: travelMsg, type: 'travel' });
    pushInAppNotification(travelMsg, 'travel');
    const tid = window.setTimeout(() => setContentNotify(null), 8000);
    return () => window.clearTimeout(tid);
  }, [loading, user.uid, travelDetails, accommodationDetails, pushInAppNotification]);

  const handleBellToggle = React.useCallback(() => {
    setBellPanelOpen((open) => {
      if (open) return false;
      setInAppNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      return true;
    });
  }, []);

  const desktopPageHeader = React.useMemo(() => {
    switch (activeTab) {
      case 'home':
        return { title: 'Home', subtitle: hasEntryAttendance ? "You're checked in · manage sessions and join breakouts like an attendee." : 'Scan the entrance QR when you arrive, then explore sessions and entitlements.' };
      case 'sessions':
        return { title: 'My sessions', subtitle: 'Sessions where you are assigned as a presenter — edit details and view Q&A.' };
      case 'breakouts':
        return { title: 'Break out room', subtitle: 'Reserve other sessions to attend as a participant. Scan the room QR to check in.' };
      case 'reviews':
        return { title: 'Session reviews', subtitle: 'Feedback from attendees for your sessions.' };
      case 'meals':
        return { title: 'My entitlements', subtitle: 'Food, kits, and giveaways — claim at the assigned stall with your digital ID.' };
      case 'uploads':
        return { title: 'Booth assets', subtitle: 'Upload and manage digital materials linked to your sessions.' };
      case 'travel':
        return {
          title: 'Travel & stay',
          subtitle: 'Flight and accommodation details for organizers — same fields as the participant app.',
        };
      case 'articles':
        return { title: 'Articles', subtitle: 'News and updates from the organizers.' };
      case 'profile':
        return { title: 'My profile', subtitle: '' };
      default:
        return { title: 'iSCENE 2026', subtitle: '' };
    }
  }, [activeTab, hasEntryAttendance]);

  const breakoutDateOptions = React.useMemo(() => {
    const dates = [...new Set(allRooms.map((r) => r.sessionDate).filter(Boolean))];
    return ['all', ...dates];
  }, [allRooms]);

  const roomsForBreakoutDate = React.useMemo(
    () => (breakoutDateFilter === 'all' ? allRooms : allRooms.filter((r) => r.sessionDate === breakoutDateFilter)),
    [allRooms, breakoutDateFilter],
  );

  const filteredBreakoutRooms = React.useMemo(() => {
    const q = breakoutSearchQuery.trim().toLowerCase();
    const tokens = q.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return roomsForBreakoutDate;
    return roomsForBreakoutDate.filter((r) => {
      const hay = [
        r.name,
        r.description,
        r.venue,
        r.timeline,
        r.materials,
        r.projectDetail,
        ...(r.presenterNames || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [roomsForBreakoutDate, breakoutSearchQuery]);

  const isPresentingRoom = React.useCallback((roomId: string) => assignedRooms.some((r) => r.id === roomId), [assignedRooms]);

  React.useEffect(() => {
    const id = window.setInterval(() => setClaimClockTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  React.useEffect(() => {
    const unsubMeals = onSnapshot(
      query(collection(db, 'meals'), orderBy('createdAt', 'desc')),
      (snap) => setMeals(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MealWindow, 'id'>) }))),
      () => {},
    );
    return () => unsubMeals();
  }, [user.uid]);

  React.useEffect(() => {
    const unsubBooths = onSnapshot(
      query(collection(db, 'registrations'), where('sector', 'in', ['Exhibitor (Booth)', 'Exhibitor', 'Food (Booth)'])),
      (snap) =>
        setBoothRegs(
          snap.docs.filter((d) => d.data().status === 'approved').map((d) => ({ id: d.id, ...d.data() })),
        ),
      () => setBoothRegs([]),
    );
    return () => unsubBooths();
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const loadAttendee = async () => {
      try {
        const resSnap = await getDocs(query(collection(db, 'reservations'), where('uid', '==', user.uid)));
        if (cancelled) return;
        const resMap: Record<string, AttendeeReservation> = {};
        resSnap.docs.forEach((d) => {
          const data = d.data() as Omit<AttendeeReservation, 'id'>;
          if (data.roomId) resMap[data.roomId] = { id: d.id, ...data };
        });
        setAttendeeReservations(resMap);
      } catch (e) {
        console.error('[iSCENE] speaker attendee data', e);
      }
    };
    void loadAttendee();
    return () => {
      cancelled = true;
    };
  }, [user.uid]);

  React.useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'foodClaims'), where('participantUid', '==', user.uid)),
      (snap) => {
        setFoodClaims(snap.docs.map((d) => ({ id: d.id, mealId: (d.data() as any).mealId, claimedAt: (d.data() as any).claimedAt })));
      },
      (err) => {
        console.error('foodClaims speaker', err);
        setFoodClaims([]);
      },
    );
    return () => unsub();
  }, [user.uid]);

  React.useEffect(() => {
    const ids = Object.keys(attendeeReservations).slice(0, 30);
    if (ids.length === 0) {
      setAttendeeMaterials([]);
      return;
    }
    getDocs(query(collection(db, 'presenterMaterials'), where('roomId', 'in', ids)))
      .then((snap) =>
        setAttendeeMaterials(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      )
      .catch(() => setAttendeeMaterials([]));
  }, [attendeeReservations]);

  React.useEffect(() => {
    let cancelled = false;
    setSpeakerArticlesLoading(true);
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
        setSpeakerArticles(list);
      })
      .catch((e) => {
        console.error('[iSCENE] speaker articles load', e);
        if (!cancelled) setSpeakerArticles([]);
      })
      .finally(() => {
        if (!cancelled) setSpeakerArticlesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user.uid]);

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
    const ref = doc(db, 'attendance', `${user.uid}_entrance`);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setEntranceAttendanceRaw(snap.exists() ? (snap.data() as Record<string, unknown>) : null);
      },
      (err) => console.error('[iSCENE] speaker entrance attendance snapshot', err),
    );
    return () => unsub();
  }, [user.uid]);

  const getReviewRating = (r: SessionReview): number => {
    if (typeof r.rating === 'number') return r.rating;
    if (r.part2?.length) return Math.round(r.part2.reduce((s, sp) => s + sp.ratings.acceptability, 0) / r.part2.length);
    return 5;
  };

  const reviewSessionOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    sessionReviews.forEach((r) => {
      const id = r.roomId || '_unknown';
      const label = (r.roomName || 'Session').trim() || 'Session';
      if (!map.has(id)) map.set(id, label);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [sessionReviews]);

  const filteredSessionReviews = React.useMemo(() => {
    let list = sessionReviews;
    const q = reviewSearchQuery.trim().toLowerCase();
    if (q) {
      const tokens = q.split(/\s+/).filter(Boolean);
      list = list.filter((rev) => {
        const hay = [
          rev.participantName,
          rev.roomName,
          rev.part4,
          rev.comment,
          rev.part1?.levelOfContent,
          rev.part1?.appropriateness,
          rev.part1?.applicability,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return tokens.every((t) => hay.includes(t));
      });
    }
    if (reviewSessionFilter !== 'all') {
      list = list.filter((rev) => (rev.roomId || '_unknown') === reviewSessionFilter);
    }
    if (reviewRatingFilter !== 'all') {
      const want = parseInt(reviewRatingFilter, 10);
      list = list.filter((rev) => getReviewRating(rev) === want);
    }
    return list;
  }, [sessionReviews, reviewSearchQuery, reviewSessionFilter, reviewRatingFilter]);

  const reviewsGroupedBySession = React.useMemo(() => {
    const groups = new Map<string, { label: string; items: SessionReview[] }>();
    filteredSessionReviews.forEach((rev) => {
      const key = rev.roomId || '_unknown';
      const label = (rev.roomName || 'Session').trim() || 'Session';
      if (!groups.has(key)) groups.set(key, { label, items: [] });
      groups.get(key)!.items.push(rev);
    });
    return Array.from(groups.entries())
      .map(([key, g]) => ({ key, label: g.label, items: g.items }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [filteredSessionReviews]);

  const avgRating = sessionReviews.length > 0
    ? (sessionReviews.reduce((s, r) => s + getReviewRating(r), 0) / sessionReviews.length).toFixed(1)
    : '—';

  // Rooms for dropdown: assigned first, fallback to all rooms if none assigned
  const roomsForDropdown = assignedRooms.length > 0 ? assignedRooms : allRooms;

  // ── Load data ──────────────────────────────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        // Rooms where this presenter is listed (by name and/or uid — rules use presenterUids for review reads)
        const [byNameSnap, byUidSnap] = await Promise.all([
          getDocs(query(collection(db, 'rooms'), where('presenterNames', 'array-contains', fullName))),
          getDocs(query(collection(db, 'rooms'), where('presenterUids', 'array-contains', user.uid))),
        ]);
        const roomMap = new Map<string, Room>();
        byNameSnap.docs.forEach((d) => roomMap.set(d.id, { id: d.id, ...(d.data() as Omit<Room, 'id'>) }));
        byUidSnap.docs.forEach((d) => {
          if (!roomMap.has(d.id)) roomMap.set(d.id, { id: d.id, ...(d.data() as Omit<Room, 'id'>) });
        });
        const rooms: Room[] = Array.from(roomMap.values());
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

  // ── Parse QR content (same rules as participant app: entrance + room time-in) ───
  const parseQrContent = (raw: string): { type: string | null; id: string | null } => {
    const trimmed = (raw || '').trim();
    if (!trimmed) return { type: null, id: null };
    const lower = trimmed.toLowerCase();
    if (lower === 'entrance' || lower === 'main' || lower === 'mainentrance' || lower.includes('main entrance')) {
      return { type: 'entrance', id: null };
    }
    try {
      let urlStr = trimmed;
      if (!trimmed.startsWith('http')) {
        urlStr = trimmed.startsWith('?') ? `https://iscene.app/scan${trimmed}` : `https://iscene.app/scan?${trimmed}`;
      }
      const url = new URL(urlStr);
      const type = url.searchParams.get('type') || url.searchParams.get('Type');
      const id = url.searchParams.get('id') || url.searchParams.get('roomId');
      return { type: type || null, id: id || null };
    } catch {
      /* fall through */
    }
    const typeMatch = trimmed.match(/[?&]type=([^&\s#]+)/i) || trimmed.match(/\btype[=:]\s*([^\s&,#]+)/i);
    const idMatch = trimmed.match(/[?&]id=([^&\s#]+)/i) || trimmed.match(/[?&]roomId=([^&\s#]+)/i);
    return {
      type: typeMatch ? typeMatch[1].trim() : null,
      id: idMatch ? idMatch[1].trim() : null,
    };
  };

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleScanResult = async (text: string) => {
    setScanModal(false);
    try {
      const { type, id } = parseQrContent(text);
      if (type === 'entrance') {
        const docRef = doc(db, 'attendance', `${user.uid}_entrance`);
        const today = getEntranceCalendarDateKey();
        const existing = await getDoc(docRef);
        if (existing.exists() && isEntranceCheckedInForDateKey(existing.data() as Record<string, unknown>, today)) {
          setScanToast("✅ You're already checked in for today.");
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
      } else if (type === 'room' && id) {
        const resId = `${user.uid}_${id}`;
        const resDocRef = doc(db, 'reservations', resId);
        const existing = await getDoc(resDocRef);
        const room = allRooms.find((r) => r.id === id);
        const alreadyAttended = existing.exists() && (existing.data() as { attended?: boolean })?.attended;
        if (alreadyAttended) {
          setScanToast('✅ Already timed in.');
        } else if (existing.exists()) {
          await updateDoc(resDocRef, { attended: true, attendedAt: Timestamp.now() });
          setAttendeeReservations((prev) => ({
            ...prev,
            [id]: { ...prev[id], attended: true },
          }));
          setScanToast('✅ Time in recorded!');
        } else {
          await setDoc(
            resDocRef,
            {
              uid: user.uid,
              roomId: id,
              roomName: room?.name || id,
              attended: true,
              reviewSubmitted: false,
              reservedAt: Timestamp.now(),
              attendedAt: Timestamp.now(),
            },
            { merge: true },
          );
          setAttendeeReservations((prev) => ({
            ...prev,
            [id]: {
              id: resId,
              roomId: id,
              roomName: room?.name || id,
              attended: true,
              reviewSubmitted: false,
              reservedAt: Timestamp.now(),
            },
          }));
          setScanToast('✅ Time in recorded!');
        }
      } else {
        setScanToast('❌ Unrecognized QR. Use main entrance or breakout room QR.');
      }
    } catch (err) {
      console.error('Scan error:', err);
      setScanToast('❌ Could not process scan. Try again.');
    }
    setTimeout(() => setScanToast(null), 4000);
  };

  const handleAttendeeReserve = async (room: Room) => {
    setOverlapModal(null);
    const reservedRoomIds = (Object.values(attendeeReservations) as AttendeeReservation[]).map((r) => r.roomId);
    for (const rid of reservedRoomIds) {
      const existingRoom = allRooms.find((r) => r.id === rid);
      if (existingRoom && roomsOverlap(existingRoom, room)) {
        setOverlapModal({ conflictingRoomName: existingRoom.name });
        return;
      }
    }
    const resId = `${user.uid}_${room.id}`;
    await setDoc(doc(db, 'reservations', resId), {
      uid: user.uid,
      roomId: room.id,
      roomName: room.name,
      attended: false,
      reviewSubmitted: false,
      reservedAt: Timestamp.now(),
    });
    setAttendeeReservations((prev) => ({
      ...prev,
      [room.id]: { id: resId, roomId: room.id, roomName: room.name, attended: false, reviewSubmitted: false, reservedAt: Timestamp.now() },
    }));
  };

  const handleAttendeeCancelReservation = async (room: Room) => {
    const resId = `${user.uid}_${room.id}`;
    await deleteDoc(doc(db, 'reservations', resId));
    setAttendeeReservations((prev) => {
      const next = { ...prev };
      delete next[room.id];
      return next;
    });
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
    } catch (err: any) {
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

  const handleSaveTravel = async () => {
    if (!registrationId) return;
    setTravelSaving(true);
    try {
      await updateDoc(doc(db, 'registrations', registrationId), { travelDetails, accommodationDetails });
      setEditingTravel(false);
    } finally {
      setTravelSaving(false);
    }
  };

  const dismissContentNotify = React.useCallback(() => {
    setContentNotify(null);
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center overflow-x-hidden bg-slate-50">
        <Loader2 className="animate-spin text-blue-600" size={36} />
      </div>
    );
  }

  const goTab = (t: PresenterTab) => {
    setActiveTab(t);
    setMobileDrawerOpen(false);
  };

  const presenterMobileBackTabs: PresenterTab[] = ['sessions', 'reviews', 'meals', 'uploads', 'articles', 'travel', 'profile'];
  const showPresenterMobileBack = presenterMobileBackTabs.includes(activeTab);

  function NavItem({
    icon,
    label,
    active,
    onClick,
    badge,
  }: {
    icon: React.ReactNode;
    label: string;
    active: boolean;
    onClick: () => void;
    badge?: number;
  }) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left text-[13px] font-semibold transition-all ${
          active
            ? 'border-blue-500/25 bg-blue-600 text-white shadow-md shadow-blue-200/80'
            : 'border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50'
        }`}
      >
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl [&_svg]:shrink-0 ${
            active ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600'
          }`}
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1 leading-snug">{label}</span>
        {badge != null && badge > 0 ? (
          <span
            className={`flex h-6 min-w-[24px] shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-black tabular-nums ${
              active ? 'bg-white/25 text-white' : 'bg-blue-600 text-white'
            }`}
          >
            {badge > 99 ? '99+' : badge}
          </span>
        ) : null}
      </button>
    );
  }

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
  // Sessions table (shared between home preview and sessions tab)
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
  // Main render (tab panels shared by mobile + desktop shells — same pattern as participant app)
  // ─────────────────────────────────────────────────────────────────────
  const tabContent = (
    <>
        {/* ══════════════════════ HOME ══════════════════════ */}
        {activeTab === 'home' && (
          <>
            {/* Mobile home — matches participant app rhythm */}
            <div className="md:hidden">
              <div className="px-4 pb-2 pt-5">
                <h2 className="text-xl font-black tracking-tight">Welcome, {firstName}!</h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  {hasEntryAttendance ? "You're checked in · Presenter portal" : 'Scan the entrance QR when you arrive.'}
                </p>
              </div>
              <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3">
                {[
                  { label: 'Registered', done: true },
                  { label: 'Approved', done: true },
                  { label: 'Checked in', done: hasEntryAttendance },
                  { label: 'Presenter', done: true },
                ].map(({ label, done }) => (
                  <div
                    key={label}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
                      done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {done ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                    {label}
                  </div>
                ))}
              </div>
              <div className="px-4 pb-4">
                <p className="mb-3 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <Zap size={12} /> Quick actions
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { icon: <QrCode size={20} className="text-blue-600" />, label: 'Scan QR', bg: 'bg-blue-50', action: () => setScanModal(true) },
                    { icon: <CalendarDays size={20} className="text-emerald-600" />, label: 'My sessions', bg: 'bg-emerald-50', action: () => goTab('sessions') },
                    { icon: <Star size={20} className="text-purple-600" />, label: 'Reviews', bg: 'bg-purple-50', action: () => goTab('reviews'), badge: reviewsBadgeDisplay },
                    { icon: <Utensils size={20} className="text-orange-500" />, label: 'My meals', bg: 'bg-orange-50', action: () => goTab('meals'), badge: mealsBadgeDisplay },
                    { icon: <Upload size={20} className="text-amber-600" />, label: 'Booth assets', bg: 'bg-amber-50', action: () => goTab('uploads') },
                    { icon: <Newspaper size={20} className="text-rose-500" />, label: 'Articles', bg: 'bg-rose-50', action: () => goTab('articles') },
                    {
                      icon: <Luggage size={20} className="text-cyan-600" />,
                      label: 'Travel & stay',
                      bg: 'bg-cyan-50',
                      action: () => goTab('travel'),
                      badge: travelAccIncomplete ? 1 : undefined,
                    },
                    { icon: <CreditCard size={20} className="text-indigo-600" />, label: 'My ID', bg: 'bg-indigo-50', action: () => setIdModal(true) },
                    { icon: <DoorOpen size={20} className="text-indigo-600" />, label: 'Breakouts', bg: 'bg-indigo-50', action: () => goTab('breakouts') },
                  ].map(({ icon, label, bg, action, badge }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={action}
                      className="relative flex min-h-[92px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-slate-100 bg-white p-2.5 shadow-sm transition-all hover:shadow-md active:scale-95"
                      aria-label={badge != null && badge > 0 ? `${label}, ${badge} updates` : label}
                    >
                      {badge != null && badge > 0 ? (
                        <span className="absolute right-1.5 top-1.5 z-10 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-black leading-none text-white" aria-hidden>
                          {badge > 99 ? '99+' : badge}
                        </span>
                      ) : null}
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${bg}`}>{icon}</div>
                      <span className="line-clamp-2 text-center text-[10px] font-semibold leading-tight text-slate-600">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
              {assignedRooms.length > 0 ? (
                <div className="px-4 pb-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-800">Your sessions</p>
                    <button type="button" onClick={() => goTab('sessions')} className="text-xs font-semibold text-blue-600">
                      View all →
                    </button>
                  </div>
                  <div className="max-h-[280px] space-y-3 overflow-y-auto">
                    {assignedRooms.map((room, i) => (
                      <button
                        key={room.id}
                        type="button"
                        onClick={() => goTab('sessions')}
                        className="flex w-full cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition-all hover:shadow-md active:scale-[0.99]"
                      >
                        <div
                          className={`h-[80px] min-h-[80px] w-20 shrink-0 ${!room.backgroundImage ? `bg-gradient-to-br ${BREAKOUT_CARD_GRADIENTS[i % BREAKOUT_CARD_GRADIENTS.length]}` : ''}`}
                          style={
                            room.backgroundImage
                              ? {
                                  backgroundImage: `url(${room.backgroundImage})`,
                                  backgroundSize: 'contain',
                                  backgroundPosition: 'center',
                                  backgroundRepeat: 'no-repeat',
                                  backgroundColor: '#f1f5f9',
                                }
                              : undefined
                          }
                        />
                        <div className="flex min-w-0 flex-1 items-start justify-between gap-2 p-4">
                          <div className="min-w-0">
                            <p className="mb-0.5 text-[11px] text-slate-500">
                              {formatSessionDateTime(room)}
                              {room.venue ? ` · ${room.venue}` : ''}
                            </p>
                            <p className="truncate text-sm font-bold text-slate-800">{room.name}</p>
                          </div>
                          <ChevronRight size={16} className="mt-1 shrink-0 text-slate-300" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Desktop home — participant-style hero + grid + two columns */}
            <div className="hidden space-y-7 py-4 sm:py-6 lg:py-8 md:block">
              <div
                className="relative h-52 overflow-hidden rounded-2xl shadow-lg"
                style={{ backgroundImage: 'url(/icon.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                <div className="absolute bottom-0 left-0 p-6">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-white/70">iSCENE 2026 · Presenter</p>
                  <h2 className="text-2xl font-black leading-tight text-white">
                    Welcome, {firstName}
                    <br />
                    <span className="text-lg font-bold text-white/90">Innovating the future of science</span>
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setIdModal(true)}
                  className="absolute bottom-5 right-5 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg transition-colors hover:bg-blue-700"
                >
                  View my ID
                </button>
              </div>
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <Zap size={16} className="text-blue-600" />
                  <h2 className="text-sm font-bold text-slate-700">Quick actions</h2>
                </div>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                  {[
                    { icon: <QrCode size={20} className="text-blue-600" />, label: 'Attendance', bg: 'bg-blue-50', action: () => setScanModal(true) },
                    { icon: <Star size={20} className="text-purple-600" />, label: 'Reviews', bg: 'bg-purple-50', action: () => goTab('reviews'), badge: reviewsBadgeDisplay },
                    { icon: <CalendarDays size={20} className="text-emerald-600" />, label: 'My sessions', bg: 'bg-emerald-50', action: () => goTab('sessions') },
                    { icon: <DoorOpen size={20} className="text-indigo-600" />, label: 'Join breakouts', bg: 'bg-indigo-50', action: () => goTab('breakouts') },
                    { icon: <Utensils size={20} className="text-orange-500" />, label: 'My meals', bg: 'bg-orange-50', action: () => goTab('meals'), badge: mealsBadgeDisplay },
                    { icon: <Upload size={20} className="text-amber-600" />, label: 'Booth assets', bg: 'bg-amber-50', action: () => goTab('uploads') },
                    { icon: <Newspaper size={20} className="text-rose-500" />, label: 'Articles', bg: 'bg-rose-50', action: () => goTab('articles') },
                    {
                      icon: <Luggage size={20} className="text-cyan-600" />,
                      label: 'Travel & stay',
                      bg: 'bg-cyan-50',
                      action: () => goTab('travel'),
                      badge: travelAccIncomplete ? 1 : undefined,
                    },
                  ].map(({ icon, label, bg, action, badge }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={action}
                      className="relative flex flex-col items-center gap-2.5 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                    >
                      {badge != null && badge > 0 ? (
                        <span className="absolute right-2 top-2 z-10 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-black leading-none text-white" aria-hidden>
                          {badge > 99 ? '99+' : badge}
                        </span>
                      ) : null}
                      <div className={`flex h-11 w-11 items-center justify-center rounded-full ${bg}`}>{icon}</div>
                      <span className="text-center text-[12px] font-medium text-slate-600">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-5 gap-6">
                <div className="col-span-3 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-slate-800">Your assigned sessions</h2>
                    <button type="button" onClick={() => goTab('sessions')} className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline">
                      Full list <ChevronRight size={13} />
                    </button>
                  </div>
                  <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <SessionsTable limit={4} />
                  </section>
                </div>
                <div className="col-span-2 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-slate-800">Latest reviews</h2>
                    <button type="button" onClick={() => goTab('reviews')} className="text-xs font-semibold text-blue-600 hover:underline">
                      All reviews →
                    </button>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    {sessionReviews.length === 0 ? (
                      <p className="py-8 text-center text-sm text-slate-400">No reviews yet.</p>
                    ) : (
                      <div className="space-y-3">
                        {sessionReviews.slice(0, 4).map((rev) => (
                          <div key={rev.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <Stars rating={getReviewRating(rev)} />
                              <span className="text-[10px] font-bold uppercase text-blue-700">{rev.roomName?.slice(0, 18) || 'Session'}</span>
                            </div>
                            {(rev.part4 || rev.comment) ? (
                              <p className="line-clamp-2 text-xs italic text-slate-600">&quot;{rev.part4 || rev.comment}&quot;</p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div
                    className={`rounded-2xl border p-4 text-sm font-medium ${hasEntryAttendance ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-100 text-slate-600'}`}
                  >
                    <CheckCircle2 className="mb-1 inline" size={16} />{' '}
                    {hasEntryAttendance ? 'Checked in at main venue today' : 'Not checked in at venue yet — use Scan QR on the entrance.'}
                  </div>
                </div>
              </div>
            </div>
          </>
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

        {/* ══════════════════════ JOIN BREAKOUTS (as attendee) ══════════════════════ */}
        {activeTab === 'breakouts' && (
          <div className="p-4 sm:p-6 lg:p-8">
            <div className="mb-6 max-w-2xl">
              <h2 className="text-2xl font-black">Join breakouts</h2>
              <p className="mt-1 text-sm text-slate-500">
                Reserve sessions you are <strong>not</strong> presenting to attend as a participant. Scan the room QR to check in. One overlapping reservation at a time — same rules as the participant app.
              </p>
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
              {breakoutDateOptions.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setBreakoutDateFilter(d)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                    breakoutDateFilter === d
                      ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300'
                  }`}
                >
                  {d === 'all' ? 'All dates' : new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                </button>
              ))}
            </div>
            <label htmlFor="speaker-breakout-search" className="sr-only">
              Search breakout sessions
            </label>
            <div className="relative mb-6 max-w-2xl">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                id="speaker-breakout-search"
                type="search"
                value={breakoutSearchQuery}
                onChange={(e) => setBreakoutSearchQuery(e.target.value)}
                placeholder="Search title, venue, description, presenters…"
                autoComplete="off"
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            {attendeeMaterials.length > 0 && (
              <section className="mb-8 max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                <h3 className="mb-3 text-base font-bold text-slate-800">Materials from sessions you joined</h3>
                <ul className="space-y-2">
                  {attendeeMaterials.map((mat) => (
                    <li key={mat.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                      <FileText size={18} className="shrink-0 text-blue-600" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">{mat.fileName}</p>
                        <p className="text-[11px] text-slate-400">{mat.roomName || 'Session'}</p>
                      </div>
                      <a
                        href={mat.downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 rounded-full border border-blue-200 px-3 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50"
                      >
                        Open
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <div className="max-w-3xl space-y-3">
              {filteredBreakoutRooms.length === 0 ? (
                <div className="rounded-2xl border border-slate-100 bg-white py-12 text-center text-sm text-slate-400 shadow-sm">
                  No sessions match this date or search.
                </div>
              ) : (
                filteredBreakoutRooms.map((room, i) => {
                  const res = attendeeReservations[room.id];
                  const presenting = isPresentingRoom(room.id);
                  const grad = BREAKOUT_CARD_GRADIENTS[i % BREAKOUT_CARD_GRADIENTS.length];
                  return (
                    <div
                      key={room.id}
                      className="flex overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                    >
                      <div
                        className={`w-24 min-h-[100px] shrink-0 ${!room.backgroundImage ? `bg-gradient-to-br ${grad}` : ''}`}
                        style={
                          room.backgroundImage
                            ? {
                                backgroundImage: `url(${room.backgroundImage})`,
                                backgroundSize: 'contain',
                                backgroundPosition: 'center',
                                backgroundRepeat: 'no-repeat',
                                backgroundColor: '#f1f5f9',
                              }
                            : undefined
                        }
                      />
                      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[11px] text-slate-500">
                            {formatSessionDateTime(room)}
                            {room.venue ? ` · ${room.venue}` : ''}
                          </p>
                          {presenting ? (
                            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-black uppercase text-violet-800">
                              You present
                            </span>
                          ) : null}
                        </div>
                        <p className="text-sm font-bold text-slate-900">{room.name}</p>
                        {room.description ? (
                          <p className="line-clamp-2 text-[11px] text-slate-400">{room.description}</p>
                        ) : null}
                        <div className="mt-1 flex flex-wrap gap-2">
                          {presenting ? (
                            <span className="text-xs font-medium text-slate-500">No need to reserve — you are assigned as presenter.</span>
                          ) : !res ? (
                            <button
                              type="button"
                              onClick={() => void handleAttendeeReserve(room)}
                              className="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
                            >
                              Reserve
                            </button>
                          ) : res.attended ? (
                            <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-700">Checked in</span>
                          ) : (
                            <>
                              <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">Reserved</span>
                              <button
                                type="button"
                                onClick={() => void handleAttendeeCancelReservation(room)}
                                className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100"
                              >
                                Cancel
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════ REVIEWS TAB ══════════════════════ */}
        {activeTab === 'reviews' && (
          <div className="flex min-h-0 flex-col px-4 pb-4 pt-4 sm:px-6 md:px-0 md:pb-8 md:pt-6">
            <div className="mb-4 shrink-0 md:hidden">
              <h2 className="text-2xl font-black">Attendee Reviews</h2>
              <p className="mt-1 text-sm text-slate-500">Feedback submitted by attendees for your sessions</p>
            </div>
            <div className="mb-4 flex shrink-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              {sessionReviews.length > 0 ? (
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:px-5">
                  <Stars rating={Math.round(parseFloat(avgRating) || 0)} />
                  <span className="text-2xl font-black">{avgRating}</span>
                  <span className="text-sm text-slate-400">
                    / {sessionReviews.length} review{sessionReviews.length !== 1 ? 's' : ''}
                    {filteredSessionReviews.length !== sessionReviews.length ? (
                      <span className="text-blue-600"> · {filteredSessionReviews.length} shown</span>
                    ) : null}
                  </span>
                </div>
              ) : null}
            </div>

            {sessionReviews.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-400 shadow-sm sm:p-16">
                <Star size={48} className="mx-auto mb-4 text-slate-200" />
                <p className="font-medium">No reviews yet</p>
                <p className="mt-1 text-sm">Attendee feedback will appear here once they review your sessions.</p>
              </div>
            ) : (
              <>
                <div className="mb-3 flex shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                  <label htmlFor="speaker-review-search" className="sr-only">
                    Search reviews
                  </label>
                  <div className="relative min-w-0 flex-1 sm:max-w-md">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" aria-hidden />
                    <input
                      id="speaker-review-search"
                      type="search"
                      value={reviewSearchQuery}
                      onChange={(e) => setReviewSearchQuery(e.target.value)}
                      placeholder="Search name, session, comment…"
                      autoComplete="off"
                      className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-9 text-sm shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                    {reviewSearchQuery ? (
                      <button
                        type="button"
                        aria-label="Clear search"
                        onClick={() => setReviewSearchQuery('')}
                        className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      >
                        <X size={16} />
                      </button>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={reviewSessionFilter}
                      onChange={(e) => setReviewSessionFilter(e.target.value)}
                      aria-label="Filter by session"
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="all">All sessions</option>
                      {reviewSessionOptions.map(([id, label]) => (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={reviewRatingFilter}
                      onChange={(e) => setReviewRatingFilter(e.target.value)}
                      aria-label="Filter by rating"
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="all">All ratings</option>
                      {[5, 4, 3, 2, 1].map((n) => (
                        <option key={n} value={String(n)}>
                          {n} star{n !== 1 ? 's' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div
                  className="min-h-[12rem] max-h-[calc(100dvh-15.5rem)] overflow-y-auto overscroll-y-contain pr-0.5 [-webkit-overflow-scrolling:touch] md:max-h-[calc(100vh-13rem)] lg:max-h-[calc(100vh-11rem)]"
                >
                  {filteredSessionReviews.length === 0 ? (
                    <div className="rounded-2xl border border-slate-100 bg-white py-12 text-center text-sm text-slate-400 shadow-sm">
                      No reviews match your search or filters.
                    </div>
                  ) : (
                    <div className="space-y-8 pb-2">
                      {reviewsGroupedBySession.map(({ key, label, items }) => (
                        <section key={key} className="space-y-3">
                          <div className="sticky top-0 z-10 flex items-baseline justify-between gap-2 border-b border-slate-200 bg-slate-50/95 py-2 backdrop-blur-sm">
                            <h3 className="text-sm font-black uppercase tracking-wide text-slate-800">{label}</h3>
                            <span className="text-[11px] font-bold text-slate-400">
                              {items.length} review{items.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="space-y-3">
                            {items.map((rev) => {
                              const displayRating = getReviewRating(rev);
                              const commentText = rev.part4 || rev.comment;
                              const initial = (rev.participantName || 'A').trim().charAt(0).toUpperCase() || 'A';
                              return (
                                <div key={rev.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                                  <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="flex items-center gap-3">
                                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-black text-blue-600">
                                        {initial}
                                      </div>
                                      <div>
                                        <p className="text-sm font-bold text-slate-700">{rev.participantName || 'Attendee'}</p>
                                        <p className="text-[11px] text-slate-400">{relativeTime(rev.submittedAt)}</p>
                                      </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Stars rating={displayRating} />
                                    </div>
                                  </div>
                                  {commentText ? (
                                    <p className="rounded-xl bg-slate-50 p-3 text-sm italic text-slate-600">&quot;{commentText}&quot;</p>
                                  ) : null}
                                  {rev.part1 ? (
                                    <div className="mt-2 text-xs text-slate-500">
                                      <p>
                                        <strong>Part I:</strong> Content {rev.part1.levelOfContent} · Appropriateness{' '}
                                        {rev.part1.appropriateness} · Applicability {rev.part1.applicability}
                                      </p>
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        </section>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ══════════════════════ MY MEALS (as participant) ══════════════════════ */}
        {activeTab === 'meals' && (
          <>
            {/* Mobile title — matches participant app; desktop uses sticky page header */}
            <div className="px-4 pt-5 pb-2 md:hidden">
              <h2 className="text-2xl font-black tracking-tight">My Entitlements</h2>
              <p className="mt-1 text-sm text-slate-500">Food, kits, and giveaways — claim at the assigned stall.</p>
            </div>

            {eligibleMeals.length === 0 ? (
              <div className="mx-4 rounded-2xl border border-slate-100 bg-white p-10 text-center text-sm text-slate-400 shadow-sm md:mx-0 md:p-12">
                No entitlements are configured for your registration sector yet. If you should receive meals, ask organizers to include{' '}
                <strong>Speakers</strong> (or your sector) on the meal window, or add you under eligible participants.
              </div>
            ) : (
              <>
                {(() => {
                  const claimedCount = eligibleMeals.filter((m) => hasClaimedMeal(m.id)).length;
                  const pickupTodayCount = eligibleMeals.filter(
                    (m) => !hasClaimedMeal(m.id) && mealSessionDateKeyManila(m.sessionDate) === entranceTodayKey,
                  ).length;
                  const upcomingCount = eligibleMeals.filter((m) => {
                    if (hasClaimedMeal(m.id)) return false;
                    const k = mealSessionDateKeyManila(m.sessionDate);
                    return k != null && k > entranceTodayKey;
                  }).length;
                  return (
                    <div className="flex flex-wrap gap-2 px-4 pb-3 md:px-0">
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-[11px] font-bold text-amber-900">
                        Pick up today: {pickupTodayCount}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600">
                        Upcoming: {upcomingCount}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-bold text-emerald-800">
                        <CheckCircle2 size={12} aria-hidden /> Claimed: {claimedCount}
                      </span>
                    </div>
                  );
                })()}
                <div className="flex flex-col gap-3 px-4 pb-8 md:grid md:grid-cols-2 md:gap-4 md:px-0 lg:grid-cols-3">
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
              </>
            )}
          </>
        )}

        {/* ══════════════════════ UPLOADS TAB ══════════════════════ */}
        {activeTab === 'uploads' && (
          <div className="p-4 sm:p-6 lg:p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-black">Booth Uploads</h2>
              <p className="text-slate-500 text-sm mt-1">Upload and manage your booth digital assets</p>
            </div>
            <div className="max-w-3xl">
                {/* Large upload zone */}
                <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                  <div className="mb-4">
                    <div className="flex items-center gap-2 text-emerald-600 mb-1"><CheckCircle2 size={14} /><span className="text-xs font-bold uppercase tracking-wider">Admin Approved</span></div>
                    <h3 className="text-lg font-bold">Upload Digital Assets</h3>
                    <p className="text-sm text-slate-500">Supported: JPG, PNG, MP4, PDF · Max 200 MB per file</p>
                  </div>
                  <label className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-colors group sm:p-12 ${uploadingFile ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-blue-400 hover:bg-blue-50/30'}`}>
                    <input type="file" multiple className="hidden" accept="image/*,video/*,.pdf,application/pdf" disabled={uploadingFile}
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        const roomId = uploadRoomId || undefined;
                        files.forEach((f) => handleFileUpload(f, roomId));
                        e.target.value = '';
                      }} />
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
                        {roomsForDropdown.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}{r.venue ? ` · ${r.venue}` : ''}
                          </option>
                        ))}
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
          </div>
        )}

        {/* ══════════════════════ TRAVEL & STAY ══════════════════════ */}
        {activeTab === 'travel' && (
          <div className="max-w-2xl px-4 pb-8 pt-5 md:px-0 md:pt-0">
            <div className="mb-4 md:hidden">
              <h2 className="text-2xl font-black tracking-tight">Travel &amp; stay</h2>
              <p className="mt-1 text-sm text-slate-500">
                Add flight and accommodation so organizers can support you on site.
              </p>
            </div>
            <div
              className={`rounded-2xl border-2 p-5 shadow-sm transition-colors ${
                travelAccIncomplete
                  ? 'border-orange-300 bg-orange-50/80 ring-1 ring-orange-200/80'
                  : 'border-slate-100 bg-white'
              }`}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  {travelAccIncomplete ? <AlertTriangle size={16} className="shrink-0 text-orange-600" aria-hidden /> : null}
                  <p
                    className={`text-[11px] font-bold uppercase tracking-wide ${
                      travelAccIncomplete ? 'text-orange-800' : 'text-slate-400'
                    }`}
                  >
                    Flight &amp; accommodation
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingTravel(!editingTravel)}
                  className="flex shrink-0 items-center gap-1 text-xs font-bold text-blue-600"
                >
                  <Edit2 size={11} /> {editingTravel ? 'Cancel' : 'Edit'}
                </button>
              </div>
              {travelAccIncomplete && !editingTravel ? (
                <p className="mb-2 text-xs font-semibold text-orange-800">
                  Please add both flight and accommodation details when you can.
                </p>
              ) : null}
              {editingTravel ? (
                <div className="space-y-3">
                  <div>
                    <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                      <Plane size={12} className="text-blue-600" aria-hidden /> Flight details
                    </p>
                    <textarea
                      value={travelDetails}
                      onChange={(e) => setTravelDetails(e.target.value)}
                      rows={3}
                      className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Airline, flight numbers, arrival/departure times, airports…"
                    />
                  </div>
                  <div>
                    <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                      <Hotel size={12} className="text-violet-600" aria-hidden /> Accommodation
                    </p>
                    <textarea
                      value={accommodationDetails}
                      onChange={(e) => setAccommodationDetails(e.target.value)}
                      rows={3}
                      className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Hotel name, check-in/out dates, confirmation number, special requests…"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleSaveTravel()}
                    disabled={travelSaving || !registrationId}
                    className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {travelSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="text-[11px] text-slate-400">Flight</p>
                    <p className={!String(travelDetails || '').trim() ? 'font-semibold text-orange-800' : 'text-slate-700'}>
                      {travelDetails || 'Not provided'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400">Accommodation</p>
                    <p
                      className={
                        !String(accommodationDetails || '').trim() ? 'font-semibold text-orange-800' : 'text-slate-700'
                      }
                    >
                      {accommodationDetails || 'Not provided'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════ ARTICLES TAB ══════════════════════ */}
        {activeTab === 'articles' && (
          <>
            <div className="md:hidden">
              <ArticleBrowsePanel
                variant="mobile"
                loading={speakerArticlesLoading}
                articles={speakerArticles}
                searchQuery={speakerArticleSearchQuery}
                onSearchChange={setSpeakerArticleSearchQuery}
                categoryFilter={speakerArticleCategoryFilter}
                onCategoryChange={setSpeakerArticleCategoryFilter}
                categoryChipNames={articleCategoryChipNames}
              />
            </div>
            <div className="hidden md:block">
              <div className="max-w-3xl pb-8">
                <ArticleBrowsePanel
                  variant="desktop"
                  loading={speakerArticlesLoading}
                  articles={speakerArticles}
                  searchQuery={speakerArticleSearchQuery}
                  onSearchChange={setSpeakerArticleSearchQuery}
                  categoryFilter={speakerArticleCategoryFilter}
                  onCategoryChange={setSpeakerArticleCategoryFilter}
                  categoryChipNames={articleCategoryChipNames}
                />
              </div>
            </div>
          </>
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
              <button
                type="button"
                onClick={() => goTab('travel')}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50/40"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                    <Luggage size={18} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Travel &amp; stay</p>
                    <p className="text-sm font-semibold text-slate-800">
                      {travelAccIncomplete ? 'Add flight & accommodation' : 'Details on file'}
                    </p>
                  </div>
                </div>
                {travelAccIncomplete ? (
                  <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-black text-orange-800">
                    Needed
                  </span>
                ) : (
                  <ChevronRight size={18} className="shrink-0 text-slate-300" />
                )}
              </button>
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
    </>
  );

  return (
    <>
      {bellPanelOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[65] bg-black/25"
            aria-label="Close notifications"
            onClick={() => setBellPanelOpen(false)}
          />
          <div
            className="fixed right-3 top-14 z-[70] max-h-[min(24rem,70vh)] w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
            role="dialog"
            aria-label="Notifications"
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-3 py-2.5">
              <p className="text-sm font-black text-slate-800">Notifications</p>
              {inAppNotifications.length > 0 ? (
                <button
                  type="button"
                  className="shrink-0 text-[11px] font-bold text-blue-600 hover:underline"
                  onClick={() => setInAppNotifications([])}
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
                    className="border-b border-l-4 border-b-slate-100 border-l-orange-500 bg-orange-50/30 py-2.5 pl-3 pr-3 text-left last:border-b-0"
                  >
                    <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      Travel &amp; stay
                    </p>
                    <p className={`text-sm leading-snug ${n.read ? 'text-slate-600' : 'font-semibold text-slate-900'}`}>
                      {n.msg}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {new Date(n.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  </li>
                ))
              )}
            </ul>
          </div>
        </>
      ) : null}
      <div className="relative flex min-h-dvh max-w-md flex-col overflow-x-hidden border-x border-slate-200 bg-slate-50 shadow-xl md:hidden">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-1 border-b border-slate-200 bg-white/90 px-3 py-3 backdrop-blur-md sm:px-4">
          <div className="flex shrink-0 items-center gap-0.5">
            {showPresenterMobileBack ? (
              <button
                type="button"
                onClick={() => goTab('home')}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition-colors hover:bg-slate-200"
                aria-label="Back to home"
              >
                <ArrowLeft size={20} />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600 transition-colors hover:bg-blue-100"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-center gap-2 px-1">
            <img src="/iscene.png" alt="iSCENE" className="h-8 w-8 shrink-0 rounded-full border border-slate-100 bg-white object-contain p-0.5 shadow-sm" />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-base font-black leading-tight tracking-tight text-blue-600">iSCENE 2026</span>
              <span className="text-[9px] font-bold uppercase tracking-widest opacity-60">Presenter</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={handleBellToggle}
              className="relative flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700"
              aria-label="Notifications"
              aria-expanded={bellPanelOpen}
              aria-haspopup="dialog"
            >
              <Bell size={18} />
              {bellUnreadCount > 0 ? (
                <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                  {Math.min(99, bellUnreadCount)}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => setScanModal(true)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700"
              aria-label="Scan QR"
            >
              <QrCode size={18} />
            </button>
          </div>
        </header>
        {scanToast ? (
          <div
            className={`mx-4 mt-2 rounded-xl px-4 py-2.5 text-center text-sm font-semibold ${scanToast.startsWith('✅') ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}
          >
            {scanToast}
          </div>
        ) : null}
        {contentNotify ? (
          <div className="mx-4 mt-2 flex items-center justify-between gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-900">
            <span>{contentNotify.msg}</span>
            <button
              type="button"
              onClick={dismissContentNotify}
              className="shrink-0 rounded-full p-1 hover:bg-black/5"
              aria-label="Dismiss"
            >
              <X size={16} />
            </button>
          </div>
        ) : null}
        <main className="min-h-0 flex-1 overflow-y-auto pb-28">{tabContent}</main>
        <nav className="fixed bottom-0 z-30 flex w-full max-w-md items-center justify-between gap-1 border-t border-slate-200 bg-white/95 px-2 pb-5 pt-3 backdrop-blur-md">
          <div className="flex min-w-0 flex-1 justify-around">
            {(
              [
                { id: 'home' as const, label: 'HOME', icon: <Home size={22} /> },
                { id: 'breakouts' as const, label: 'BREAK OUT', icon: <Rocket size={22} /> },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => goTab(item.id)}
                className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 ${activeTab === item.id ? 'text-blue-600' : 'text-slate-400'}`}
              >
                {item.icon}
                <span className="text-center text-[8px] font-black uppercase leading-tight">{item.label}</span>
              </button>
            ))}
          </div>
          <div className="relative -top-6 shrink-0">
            <button
              type="button"
              onClick={() => setScanModal(true)}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-400/50 transition-transform hover:bg-blue-700 active:scale-90"
              aria-label="Scan QR"
            >
              <QrCode size={26} />
            </button>
          </div>
          <div className="flex min-w-0 flex-1 justify-around">
            {(
              [
                { id: 'sessions' as const, label: 'PRESENT', icon: <CalendarDays size={20} /> },
                { id: 'profile' as const, label: 'PROFILE', icon: <User size={20} /> },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => goTab(item.id)}
                className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 ${activeTab === item.id ? 'text-blue-600' : 'text-slate-400'}`}
              >
                {item.icon}
                <span className="text-center text-[8px] font-black uppercase leading-tight">{item.label}</span>
              </button>
            ))}
          </div>
        </nav>
        {mobileDrawerOpen ? (
          <>
            <button
              type="button"
              aria-label="Close menu backdrop"
              onClick={() => setMobileDrawerOpen(false)}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            />
            <div className="fixed left-0 top-0 z-50 flex h-full w-72 max-w-[85vw] flex-col bg-white shadow-2xl">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-4">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <img src="/iscene.png" alt="iSCENE" className="h-9 w-9 shrink-0 rounded-full border border-slate-100 bg-white object-contain p-0.5 shadow-sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black leading-tight text-blue-600">iSCENE 2026</p>
                    <p className="text-[10px] text-slate-400">Presenter portal</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={handleBellToggle}
                    className="relative flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600"
                    aria-label="Notifications"
                    aria-expanded={bellPanelOpen}
                    aria-haspopup="dialog"
                  >
                    <Bell size={17} />
                    {bellUnreadCount > 0 ? (
                      <span className="absolute right-0.5 top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold leading-none text-white">
                        {Math.min(99, bellUnreadCount)}
                      </span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileDrawerOpen(false)}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600"
                    aria-label="Close menu"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
              <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
                <p className="px-1 pb-2 pt-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Main</p>
                <NavItem icon={<Home size={17} />} label="Home" active={activeTab === 'home'} onClick={() => goTab('home')} />
                <NavItem
                  icon={<DoorOpen size={17} />}
                  label="Join breakouts"
                  active={activeTab === 'breakouts'}
                  onClick={() => goTab('breakouts')}
                />
                <p className="px-1 pb-2 pt-4 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Your program</p>
                <NavItem icon={<CalendarDays size={17} />} label="My sessions" active={activeTab === 'sessions'} onClick={() => goTab('sessions')} />
                <NavItem icon={<Star size={17} />} label="Reviews" active={activeTab === 'reviews'} onClick={() => goTab('reviews')} badge={reviewsBadgeDisplay || undefined} />
                <NavItem icon={<Utensils size={17} />} label="My meals" active={activeTab === 'meals'} onClick={() => goTab('meals')} badge={mealsBadgeDisplay || undefined} />
                <NavItem icon={<Upload size={17} />} label="Booth assets" active={activeTab === 'uploads'} onClick={() => goTab('uploads')} />
                <NavItem
                  icon={<Newspaper size={17} />}
                  label="Articles"
                  active={activeTab === 'articles'}
                  onClick={() => goTab('articles')}
                />
                <NavItem
                  icon={<Luggage size={17} />}
                  label="Travel & stay"
                  active={activeTab === 'travel'}
                  onClick={() => goTab('travel')}
                  badge={travelAccIncomplete ? 1 : undefined}
                />
                <p className="px-1 pb-2 pt-4 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Quick tools</p>
                <NavItem
                  icon={<QrCode size={17} />}
                  label="Scan QR"
                  active={false}
                  onClick={() => {
                    setMobileDrawerOpen(false);
                    setScanModal(true);
                  }}
                />
                <NavItem
                  icon={<CreditCard size={17} />}
                  label="My digital ID"
                  active={false}
                  onClick={() => {
                    setMobileDrawerOpen(false);
                    setIdModal(true);
                  }}
                />
                <NavItem
                  icon={<User size={17} />}
                  label="Profile"
                  active={activeTab === 'profile'}
                  onClick={() => goTab('profile')}
                />
              </nav>
              <div className="border-t border-slate-100 p-4">
                <button
                  type="button"
                  onClick={onSignOut}
                  className="w-full rounded-full border border-red-200 py-2 text-xs font-bold text-red-600 hover:bg-red-50"
                >
                  Sign out
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>

      <div className="hidden min-h-dvh w-full overflow-x-hidden bg-slate-50 text-slate-900 md:flex">
        <aside className="fixed z-30 flex h-full w-56 flex-col border-r border-slate-100 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-5">
            <img src="/iscene.png" alt="iSCENE" className="h-10 w-10 shrink-0 rounded-full border border-slate-100 bg-white object-contain p-0.5 shadow-sm" />
            <div>
              <p className="text-sm font-black leading-tight">iSCENE 2026</p>
              <p className="text-[11px] text-slate-400">Science Conference</p>
            </div>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
            <p className="px-1 pb-2 pt-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Main</p>
            <NavItem icon={<Home size={17} />} label="Home" active={activeTab === 'home'} onClick={() => goTab('home')} />
            <NavItem icon={<DoorOpen size={17} />} label="Join breakouts" active={activeTab === 'breakouts'} onClick={() => goTab('breakouts')} />
            <p className="px-1 pb-2 pt-4 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Your program</p>
            <NavItem icon={<CalendarDays size={17} />} label="My sessions" active={activeTab === 'sessions'} onClick={() => goTab('sessions')} />
            <NavItem icon={<Star size={17} />} label="Reviews" active={activeTab === 'reviews'} onClick={() => goTab('reviews')} badge={reviewsBadgeDisplay || undefined} />
            <NavItem icon={<Utensils size={17} />} label="My meals" active={activeTab === 'meals'} onClick={() => goTab('meals')} badge={mealsBadgeDisplay || undefined} />
            <NavItem icon={<Upload size={17} />} label="Booth assets" active={activeTab === 'uploads'} onClick={() => goTab('uploads')} />
            <NavItem
              icon={<Luggage size={17} />}
              label="Travel & stay"
              active={activeTab === 'travel'}
              onClick={() => goTab('travel')}
              badge={travelAccIncomplete ? 1 : undefined}
            />
            <NavItem icon={<Newspaper size={17} />} label="Articles" active={activeTab === 'articles'} onClick={() => goTab('articles')} />
            <NavItem icon={<User size={17} />} label="Profile" active={activeTab === 'profile'} onClick={() => goTab('profile')} />
          </nav>
          <div className="border-t border-slate-100 p-4">
            <div className="mb-3 flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-100">
                {profilePicUrl ? (
                  <img src={profilePicUrl} alt={fullName} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-sm font-black text-blue-600">{initials}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-800">{fullName}</p>
                <p className="truncate text-[11px] text-slate-500">{participantSector || 'Presenter'}</p>
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
        <main className="ml-56 min-h-dvh flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-10 xl:px-12 2xl:px-14">
            <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/80 py-4 backdrop-blur-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1 pr-2">
                  <h1 className="text-2xl font-black leading-tight text-slate-900">{desktopPageHeader.title}</h1>
                  {desktopPageHeader.subtitle ? (
                    <p className="mt-1 max-w-prose text-sm leading-relaxed text-slate-500">{desktopPageHeader.subtitle}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2 pt-0.5">
                  {scanToast ? (
                    <span
                      className={`hidden max-w-[10rem] truncate rounded-full px-3 py-1.5 text-xs font-semibold sm:inline ${scanToast.startsWith('✅') ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}
                      title={scanToast}
                    >
                      {scanToast}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleBellToggle}
                    className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-colors hover:bg-blue-100"
                    aria-label="Notifications"
                    aria-expanded={bellPanelOpen}
                    aria-haspopup="dialog"
                  >
                    <Bell size={17} />
                    {bellUnreadCount > 0 ? (
                      <span className="absolute right-0 top-0 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold leading-none text-white">
                        {Math.min(99, bellUnreadCount)}
                      </span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => setScanModal(true)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 transition-colors hover:bg-blue-100"
                    aria-label="Scan QR"
                  >
                    <QrCode size={17} className="text-slate-600" />
                  </button>
                  <button
                    type="button"
                    onClick={() => goTab('profile')}
                    className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-600 text-xs font-black text-white ring-2 ring-blue-200 transition-all hover:ring-blue-400"
                  >
                    {profilePicUrl ? (
                      <img src={profilePicUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span>{initials}</span>
                    )}
                  </button>
                </div>
              </div>
            </header>
            {tabContent}
          </div>
        </main>
      </div>

      {/* Overlap reservation (attendee breakout) */}
      {overlapModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="mb-3 text-lg font-black text-slate-900">Cannot reserve</h3>
            <p className="mb-4 text-sm leading-relaxed text-slate-600">
              You already reserved <span className="font-bold text-slate-800">&quot;{overlapModal.conflictingRoomName}&quot;</span>.
              Times overlap — you can only hold one breakout reservation at a time. Cancel the other reservation first, then try again.
            </p>
            <button
              type="button"
              onClick={() => setOverlapModal(null)}
              className="w-full rounded-xl bg-blue-600 py-3 font-bold text-white hover:bg-blue-700"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* ── QR Scanner modal ─────────────────────────────────────────── */}
      {scanModal && (
        <QrScanModal
          showTakePhoto={false}
          subtitle="Scan for main venue entrance check-in or a breakout room QR (check-in / walk-in)"
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
    </>
  );
}
