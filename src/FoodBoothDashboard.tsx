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
  Edit2,
  Save,
  Upload,
  Camera,
  RefreshCw,
  Newspaper,
  Menu,
  Home,
  Users,
  Filter,
  Zap,
  Utensils,
  Bell,
  AlertTriangle,
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
  setDoc,
  documentId,
  updateDoc,
  onSnapshot,
} from 'firebase/firestore';
import { db, auth, storage } from './firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { QrScanModal } from './QrScanModal';
import { ArticleBrowsePanel } from './ArticleBrowsePanel';
import type { ArticleDoc } from './ArticlesManager';
import { useArticleCategoryNames } from './useArticleCategoryNames';
import { registrationSectorEligibleForMeal, sectorsForFoodBoothRegistrationQuery } from './mealEligibility';
import { getEntranceCalendarDateKey, isEntranceCheckedInForDateKey } from './entranceCheckInDay';
import { formatMealTimeForDisplay, formatMealTimeRangeForDisplay } from './mealClaimWindow';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type Tab = 'dashboard' | 'participants' | 'sessions' | 'main-hall' | 'articles' | 'reports' | 'profile';

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
  participantUid: string;
  participantName: string;
  participantRegId: string;
  sector: string;
  mealId: string;
  mealType: string;
  mealName?: string;
  sessionDate: string;
  claimedAt: any;
  claimedBy: string;
  claimedByName?: string;
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
  kit: 'Kit',
};

const TRAVEL_ACCOMMODATION_REMINDER_MS = 3 * 60 * 60 * 1000;

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

function formatEligibility(meal: MealWindow): string {
  if (meal.eligibleParticipantIds && meal.eligibleParticipantIds.length > 0) {
    return `${meal.eligibleParticipantIds.length} specific person${meal.eligibleParticipantIds.length !== 1 ? 's' : ''}`;
  }
  if (meal.eligibleSectors && meal.eligibleSectors.length > 0) {
    return `Sectors: ${meal.eligibleSectors.join(', ')}`;
  }
  return 'All participants';
}

function buildClaimsByDayAndBooth(claims: FoodClaim[], boothFallback: string) {
  const byDay = new Map<string, Map<string, FoodClaim[]>>();
  for (const c of claims) {
    const d = c.claimedAt?.toDate ? c.claimedAt.toDate() : new Date(c.claimedAt);
    const dateKey = d.toISOString().slice(0, 10);
    const boothKey = c.claimedByName ?? boothFallback ?? 'This booth';
    if (!byDay.has(dateKey)) byDay.set(dateKey, new Map());
    const dayMap = byDay.get(dateKey)!;
    if (!dayMap.has(boothKey)) dayMap.set(boothKey, []);
    dayMap.get(boothKey)!.push(c);
  }
  return Array.from(byDay.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([dateKey, boothMap]) => ({
      dateKey,
      dateLabel: new Date(dateKey + 'T12:00:00').toLocaleDateString('en-PH', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      booths: Array.from(boothMap.entries()).map(([boothKey, dayClaims]) => ({
        boothName: boothKey,
        claims: dayClaims.sort((a, b) => {
          const ta = a.claimedAt?.toDate ? a.claimedAt.toDate().getTime() : new Date(a.claimedAt).getTime();
          const tb = b.claimedAt?.toDate ? b.claimedAt.toDate().getTime() : new Date(b.claimedAt).getTime();
          return tb - ta;
        }),
      })),
    }));
}

function escapeCsvCell(value: string): string {
  const s = String(value ?? '').replace(/"/g, '""');
  if (/[",\n\r]/.test(s)) return `"${s}"`;
  return s;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
type Props = { user: FirebaseUser; registration: any; onSignOut: () => Promise<void> };

export function FoodBoothDashboard({ user, registration, onSignOut }: Props) {
  const fullName = (registration?.fullName as string) || user.email || 'Food Booth';
  const firstName = fullName.split(' ')[0] || 'there';
  const approvalStatus = (registration?.status as string) || 'pending';
  const profilePicUrl = (registration?.profilePictureUrl as string | undefined) || null;
  const myInitials = initials(fullName);
  const { names: articleCategoryChipNames } = useArticleCategoryNames();
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const claimListRef = React.useRef<HTMLDivElement>(null);

  // ── Nav ────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = React.useState<Tab>('dashboard');
  const [mobileDrawerOpen, setMobileDrawerOpen] = React.useState(false);

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

  const [entranceAttendanceRaw, setEntranceAttendanceRaw] = React.useState<Record<string, unknown> | null>(null);
  const [entranceTodayKey, setEntranceTodayKey] = React.useState(() => getEntranceCalendarDateKey());
  const hasEntryAttendance = React.useMemo(
    () => isEntranceCheckedInForDateKey(entranceAttendanceRaw, entranceTodayKey),
    [entranceAttendanceRaw, entranceTodayKey],
  );

  // ── Eligible participants list (who can claim for active meal) ───────────
  const [eligibleParticipants, setEligibleParticipants] = React.useState<FoundParticipant[]>([]);
  const [loadingEligible, setLoadingEligible] = React.useState(false);

  // ── Modals ─────────────────────────────────────────────────────────────
  const [idModal, setIdModal] = React.useState(false);

  // ── Articles (read-only, same as participant / presenter browse) ────────
  const [boothArticles, setBoothArticles] = React.useState<ArticleDoc[]>([]);
  const [boothArticlesLoading, setBoothArticlesLoading] = React.useState(true);
  const [boothArticleSearchQuery, setBoothArticleSearchQuery] = React.useState('');
  const [boothArticleCategoryFilter, setBoothArticleCategoryFilter] = React.useState<string>('all');

  // ── Toast ──────────────────────────────────────────────────────────────
  const [toast, setToast] = React.useState<{ msg: string; ok: boolean } | null>(null);
  const showToast = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 4500); };

  // ── Profile ────────────────────────────────────────────────────────────
  const [pwResetSent, setPwResetSent] = React.useState(false);
  const [profileEditing, setProfileEditing] = React.useState(false);
  const [profileSaving, setProfileSaving] = React.useState(false);
  const [registrationOverride, setRegistrationOverride] = React.useState<Record<string, unknown> | null>(null);
  const [editSectorOffice, setEditSectorOffice] = React.useState('');
  const [editPositionTitle, setEditPositionTitle] = React.useState('');
  const [editContactNumber, setEditContactNumber] = React.useState('');
  const [editBoothDescription, setEditBoothDescription] = React.useState('');
  const [editBoothWebsite, setEditBoothWebsite] = React.useState('');
  const [editBoothProducts, setEditBoothProducts] = React.useState('');
  const [editBoothBackgroundUrl, setEditBoothBackgroundUrl] = React.useState('');
  const [editBoothLocationDetails, setEditBoothLocationDetails] = React.useState('');
  const [uploadingBoothBackground, setUploadingBoothBackground] = React.useState(false);

  const [travelDetails, setTravelDetails] = React.useState((registration?.travelDetails as string) || '');
  const [accommodationDetails, setAccommodationDetails] = React.useState((registration?.accommodationDetails as string) || '');
  const [editingTravel, setEditingTravel] = React.useState(false);
  const [travelSaving, setTravelSaving] = React.useState(false);
  type InAppNotifyType = 'travel';
  type InAppNotificationItem = { id: string; msg: string; type: InAppNotifyType; read: boolean; createdAt: number };
  const [inAppNotifications, setInAppNotifications] = React.useState<InAppNotificationItem[]>([]);
  const [contentNotify, setContentNotify] = React.useState<{ msg: string; type: 'travel' } | null>(null);
  const [bellPanelOpen, setBellPanelOpen] = React.useState(false);
  const mobileBellRef = React.useRef<HTMLDivElement | null>(null);
  const desktopBellRef = React.useRef<HTMLDivElement | null>(null);

  const pushInAppNotification = React.useCallback((msg: string, type: InAppNotifyType) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    setInAppNotifications((prev) => [{ id, msg, type, read: false, createdAt: Date.now() }, ...prev].slice(0, 40));
  }, []);

  const notifyCategoryLabel = (_t: InAppNotifyType) => 'Travel & accommodation';

  const travelAccIncomplete =
    !String(travelDetails || '').trim() || !String(accommodationDetails || '').trim();

  const bellUnreadCount = inAppNotifications.filter((n) => !n.read).length;

  const handleBellToggle = React.useCallback(() => {
    setBellPanelOpen((open) => {
      if (open) return false;
      setInAppNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      return true;
    });
  }, []);

  React.useEffect(() => {
    setTravelDetails((registration?.travelDetails as string) || '');
    setAccommodationDetails((registration?.accommodationDetails as string) || '');
  }, [registration?.id, registration?.travelDetails, registration?.accommodationDetails]);

  React.useEffect(() => {
    if (profileEditing && registration) {
      setEditSectorOffice((registration.sectorOffice as string) || '');
      setEditPositionTitle((registration.positionTitle as string) || '');
      setEditContactNumber((registration.contactNumber as string) || '');
      setEditBoothDescription((registration.boothDescription as string) || '');
      setEditBoothWebsite((registration.boothWebsite as string) || '');
      setEditBoothProducts((registration.boothProducts as string) || '');
      setEditBoothBackgroundUrl((registration.boothBackgroundUrl as string) || '');
      setEditBoothLocationDetails((registration.boothLocationDetails as string) || '');
    }
  }, [profileEditing, registration?.id]);

  const handleSaveProfile = React.useCallback(async () => {
    if (!registration?.id) return;
    setProfileSaving(true);
    try {
      const boothImageUrlCleared = '';
      const payload: Record<string, string> = {
        sectorOffice: editSectorOffice.trim() || '',
        positionTitle: editPositionTitle.trim() || '',
        contactNumber: editContactNumber.trim() || '',
        boothDescription: editBoothDescription.trim() || '',
        boothWebsite: editBoothWebsite.trim() || '',
        boothProducts: editBoothProducts.trim() || '',
        boothImageUrl: boothImageUrlCleared,
        boothBackgroundUrl: editBoothBackgroundUrl.trim() || '',
        boothLocationDetails: editBoothLocationDetails.trim() || '',
      };
      await updateDoc(doc(db, 'registrations', registration.id), payload);
      setRegistrationOverride((prev) => ({ ...prev, ...payload }));
      setProfileEditing(false);
      showToast('Profile updated successfully');
    } catch (err) {
      console.error(err);
      showToast('Failed to save. Try again.', false);
    } finally {
      setProfileSaving(false);
    }
  }, [
    registration?.id,
    editSectorOffice,
    editPositionTitle,
    editContactNumber,
    editBoothDescription,
    editBoothWebsite,
    editBoothProducts,
    editBoothBackgroundUrl,
    editBoothLocationDetails,
  ]);

  const handleSaveTravel = React.useCallback(async () => {
    if (!registration?.id) return;
    setTravelSaving(true);
    try {
      await updateDoc(doc(db, 'registrations', registration.id), { travelDetails, accommodationDetails });
      setRegistrationOverride((prev) => ({
        ...(prev || {}),
        travelDetails,
        accommodationDetails,
      }));
      setEditingTravel(false);
      showToast('Travel & accommodation saved.');
    } catch {
      showToast('Could not save travel details. Try again.', false);
    } finally {
      setTravelSaving(false);
    }
  }, [registration?.id, travelDetails, accommodationDetails]);

  const handleBoothBackgroundUpload = React.useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) { showToast('Please select an image file.', false); return; }
    setUploadingBoothBackground(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const path = `boothBackgrounds/${user.uid}/${Date.now()}_${safeName}`;
      const contentType = file.type || 'image/jpeg';
      const snap = await uploadBytes(ref(storage, path), file, { contentType });
      const url = await getDownloadURL(snap.ref);
      setEditBoothBackgroundUrl(url);
      showToast('Background image uploaded. Click Save to keep changes.');
    } catch (err: unknown) {
      console.error('Booth background upload error:', err);
      const msg = err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'storage/unauthorized'
        ? 'Storage rules not deployed. Run: firebase deploy --only storage'
        : 'Upload failed. Try again or use a smaller image (<5MB).';
      showToast(msg, false);
    }
    finally { setUploadingBoothBackground(false); e.target.value = ''; }
  }, [user.uid]);

  // ── Derived ────────────────────────────────────────────────────────────
  const now = new Date();
  const activeMeals = meals.filter(isWithinWindow);
  const [selectedMealId, setSelectedMealId] = React.useState<string | null>(null);
  const activeMeal = React.useMemo(() => {
    if (activeMeals.length === 0) return null;
    if (activeMeals.length === 1) return activeMeals[0];
    const selected = activeMeals.find((m) => m.id === selectedMealId);
    return selected || activeMeals[0];
  }, [activeMeals, selectedMealId]);
  React.useEffect(() => {
    if (activeMeals.length > 0 && (!selectedMealId || !activeMeals.some((m) => m.id === selectedMealId))) {
      setSelectedMealId(activeMeals[0].id);
    }
    if (activeMeals.length === 0) setSelectedMealId(null);
  }, [activeMeals, selectedMealId]);
  const upcomingMeals = meals.filter((m) => !isWithinWindow(m) && parseWindowTime(m.startTime, m.sessionDate) > now);
  const pastMeals = meals.filter((m) => !isWithinWindow(m) && parseWindowTime(m.endTime, m.sessionDate) <= now);

  const claimsForActiveMeal = activeMeal
    ? todayClaims.filter((c) => c.mealId === activeMeal.id)
    : [];

  const sortedMealsPreview = React.useMemo(() => {
    if (meals.length === 0) return [];
    return [...meals]
      .sort((a, b) => {
        const da = new Date(`${a.sessionDate}T12:00:00`).getTime();
        const db = new Date(`${b.sessionDate}T12:00:00`).getTime();
        if (da !== db) return da - db;
        return parseWindowTime(a.startTime, a.sessionDate).getTime() - parseWindowTime(b.startTime, b.sessionDate).getTime();
      });
  }, [meals]);

  const digitalIdQrData = `https://iscene.app/verify?uid=${user.uid}&name=${encodeURIComponent(fullName)}&role=food-booth`;
  const digitalIdQrImg = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(digitalIdQrData)}`;

  // ── Load ───────────────────────────────────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        // Meals (only those assigned to this booth, or unassigned = any booth)
        const mealsSnap = await getDocs(query(collection(db, 'meals'), orderBy('createdAt', 'desc')));
        const allMeals: MealWindow[] = mealsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MealWindow, 'id'>) }));
        const mealList = allMeals.filter((m) => !m.assignedBoothUid || m.assignedBoothUid === user.uid);
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

  React.useEffect(() => {
    if (loading) return;
    const t = String(travelDetails || '').trim();
    const a = String(accommodationDetails || '').trim();
    const storageKey = `iscene_${user.uid}_foodBooth_lastTravelAccReminder`;
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
      /* still show in-session */
    }
    const travelMsg =
      'Please complete your flight and accommodation in Profile (both are required for organizers).';
    setContentNotify({ msg: travelMsg, type: 'travel' });
    pushInAppNotification(travelMsg, 'travel');
    const tid = window.setTimeout(() => setContentNotify(null), 8000);
    return () => window.clearTimeout(tid);
  }, [loading, user.uid, travelDetails, accommodationDetails, pushInAppNotification]);

  React.useEffect(() => {
    if (!bellPanelOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (mobileBellRef.current?.contains(t)) return;
      if (desktopBellRef.current?.contains(t)) return;
      setBellPanelOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [bellPanelOpen]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setBoothArticlesLoading(true);
      try {
        const snap = await getDocs(query(collection(db, 'articles'), orderBy('createdAt', 'desc')));
        if (!cancelled) {
          setBoothArticles(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ArticleDoc, 'id'>) })));
        }
      } catch (e) {
        console.error('[iSCENE] food booth articles', e);
        if (!cancelled) setBoothArticles([]);
      } finally {
        if (!cancelled) setBoothArticlesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Load eligible participants for active meal ─────────────────────────
  React.useEffect(() => {
    if (!activeMeal) {
      setEligibleParticipants([]);
      return;
    }
    let cancelled = false;
    const loadEligible = async () => {
      setLoadingEligible(true);
      try {
        const regRef = collection(db, 'registrations');
        let snap;
        if (activeMeal.eligibleParticipantIds && activeMeal.eligibleParticipantIds.length > 0) {
          const ids = activeMeal.eligibleParticipantIds;
          const results: FoundParticipant[] = [];
          for (let i = 0; i < ids.length; i += 10) {
            const chunk = ids.slice(i, i + 10);
            const q = query(regRef, where(documentId(), 'in', chunk));
            const chunkSnap = await getDocs(q);
            chunkSnap.docs.forEach((d) => {
              const data = d.data() as any;
              if (data.uid) results.push({ id: d.id, uid: data.uid, fullName: data.fullName, sector: data.sector, status: data.status, profilePictureUrl: data.profilePictureUrl });
            });
          }
          results.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
          if (!cancelled) setEligibleParticipants(results);
        } else if (activeMeal.eligibleSectors && activeMeal.eligibleSectors.length > 0) {
          const sectorList = sectorsForFoodBoothRegistrationQuery(activeMeal) ?? [];
          const resultsMap = new Map<string, FoundParticipant>();
          for (let i = 0; i < sectorList.length; i += 10) {
            const chunk = sectorList.slice(i, i + 10);
            if (chunk.length === 0) continue;
            const sectorSnap = await getDocs(query(regRef, where('sector', 'in', chunk), where('status', '==', 'approved'), limit(150)));
            sectorSnap.docs.forEach((d) => {
              const data = d.data() as any;
              if (!data.uid) return;
              resultsMap.set(d.id, {
                id: d.id,
                uid: data.uid,
                fullName: data.fullName,
                sector: data.sector,
                status: data.status,
                profilePictureUrl: data.profilePictureUrl,
              });
            });
          }
          const results = Array.from(resultsMap.values());
          results.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', undefined, { sensitivity: 'base' }));
          if (!cancelled) setEligibleParticipants(results);
        } else {
          snap = await getDocs(query(regRef, where('status', '==', 'approved'), limit(150)));
          const results: FoundParticipant[] = snap.docs.map((d) => {
            const data = d.data() as any;
            return { id: d.id, uid: data.uid, fullName: data.fullName, sector: data.sector, status: data.status, profilePictureUrl: data.profilePictureUrl };
          }).filter((r) => r.uid);
          results.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
          if (!cancelled) setEligibleParticipants(results);
        }
      } catch (err) { console.error(err); setEligibleParticipants([]); }
      finally { if (!cancelled) setLoadingEligible(false); }
    };
    loadEligible();
    return () => { cancelled = true; };
  }, [activeMeal?.id]);

  React.useEffect(() => {
    const tick = () => setEntranceTodayKey(getEntranceCalendarDateKey());
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  React.useEffect(() => {
    const refAtt = doc(db, 'attendance', `${user.uid}_entrance`);
    const unsub = onSnapshot(
      refAtt,
      (snap) => setEntranceAttendanceRaw(snap.exists() ? (snap.data() as Record<string, unknown>) : null),
      () => setEntranceAttendanceRaw(null),
    );
    return () => unsub();
  }, [user.uid]);

  // ── Helpers ────────────────────────────────────────────────────────────
  const hasClaimed = (participantUid: string, mealId: string) =>
    allClaims.some((c) => c.participantUid === participantUid && c.mealId === mealId);

  /** Narrow the on-screen queue as staff type in the search bar (client-side; works with large lists). */
  const eligibleFiltered = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return eligibleParticipants;
    return eligibleParticipants.filter(
      (p) =>
        (p.fullName || '').toLowerCase().includes(q) ||
        (p.sector || '').toLowerCase().includes(q),
    );
  }, [eligibleParticipants, searchQuery]);

  /** Eligible list grouped by registration sector for faster scanning at the booth. */
  const eligibleGroupedBySector = React.useMemo(() => {
    const map = new Map<string, FoundParticipant[]>();
    for (const p of eligibleFiltered) {
      const key = (p.sector || '').trim() || 'No sector listed';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([sector, people]) => ({
        sector,
        people: [...people].sort((x, y) => (x.fullName || '').localeCompare(y.fullName || '', undefined, { sensitivity: 'base' })),
      }));
  }, [eligibleFiltered]);

  // ── Search participants ────────────────────────────────────────────────
  const handleSearch = async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'registrations'),
          where('fullName', '>=', q),
          where('fullName', '<=', q + '\uf8ff'),
          limit(24))
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
      const qType = url.searchParams.get('type') || url.searchParams.get('Type');
      const qId = url.searchParams.get('id') || url.searchParams.get('roomId');
      return { type: qType || null, id: qId || null };
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

  // ── QR scan result (Main Hall time-in OR guest meal QR) ─────────────────
  const handleScanResult = async (text: string) => {
    try {
      const trimmed = (text || '').trim();
      if (!trimmed) {
        showToast('❌ Empty scan.', false);
        return;
      }

      const { type, id } = parseQrContent(trimmed);

      if (type === 'entrance') {
        const docRef = doc(db, 'attendance', `${user.uid}_entrance`);
        const today = getEntranceCalendarDateKey();
        const existing = await getDoc(docRef);
        if (existing.exists() && isEntranceCheckedInForDateKey(existing.data() as Record<string, unknown>, today)) {
          showToast("✅ You're already checked in for today.");
          setScanModal(false);
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
        showToast('✅ Main Hall check-in recorded!');
        setScanModal(false);
        return;
      }

      if (type === 'room' && id) {
        showToast('❌ For your own check-in, scan the Main Hall entrance QR — not a breakout room.', false);
        setScanModal(false);
        return;
      }

      let uid: string | null = null;
      try {
        const urlStr = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
        const url = new URL(urlStr);
        uid = url.searchParams.get('uid');
      } catch {
        const match = trimmed.match(/[?&]uid=([^&\s]+)/);
        uid = match ? decodeURIComponent(match[1]) : null;
      }
      if (!uid) {
        showToast('❌ Not a guest Digital ID. Scan their QR, or scan the Main Hall entrance QR for your time-in.', false);
        return;
      }
      const snap = await getDocs(query(collection(db, 'registrations'), where('uid', '==', uid), limit(1)));
      if (snap.empty) {
        showToast('❌ No registration found for this QR.', false);
        return;
      }
      const d = snap.docs[0];
      const data = d.data() as any;
      const participant: FoundParticipant = {
        id: d.id,
        uid: data.uid,
        fullName: data.fullName,
        sector: data.sector,
        status: data.status,
        profilePictureUrl: data.profilePictureUrl,
      };
      setSearchResults([participant]);
      setSearchQuery(data.fullName);
      setActiveTab('dashboard');
      if (activeMeal) {
        await handleClaim(participant);
      }
    } catch {
      showToast('❌ Invalid QR code.', false);
    }
  };

  // ── Claim meal ─────────────────────────────────────────────────────────
  const handleClaim = async (participant: FoundParticipant) => {
    if (!activeMeal) { showToast('❌ No active entitlement window right now.', false); return; }
    if (participant.status !== 'approved') { showToast('❌ Participant is not approved.', false); return; }
    const isEligible = registrationSectorEligibleForMeal(activeMeal, participant.id, participant.sector || '');
    if (!isEligible) {
      showToast(activeMeal.eligibleParticipantIds?.length ? '❌ Not in the specific persons list.' : `❌ Not eligible. Sectors: ${activeMeal.eligibleSectors?.join(', ')}.`, false);
      return;
    }
    if (hasClaimed(participant.uid, activeMeal.id)) { showToast('⚠️ Already claimed for this session.', false); return; }

    setClaimingFor(participant.uid);
    try {
      // Check globally to prevent duplicate claims (e.g. claimed at another booth)
      const existingSnap = await getDocs(
        query(
          collection(db, 'foodClaims'),
          where('participantUid', '==', participant.uid),
          where('mealId', '==', activeMeal.id)
        )
      );
      if (!existingSnap.empty) {
        const existing = existingSnap.docs[0].data();
        setAllClaims((prev) => {
          if (prev.some((c) => c.participantUid === participant.uid && c.mealId === activeMeal.id)) return prev;
          return [{ id: existingSnap.docs[0].id, ...existing } as FoodClaim, ...prev];
        });
        showToast('⚠️ Already received — cannot claim again for this entitlement.', false);
        setClaimingFor(null);
        return;
      }

      const newClaim: Omit<FoodClaim, 'id'> = {
        participantUid: participant.uid,
        participantName: participant.fullName,
        participantRegId: participant.id.slice(0, 8).toUpperCase(),
        sector: participant.sector,
        mealId: activeMeal.id,
        mealType: activeMeal.type,
        mealName: activeMeal.name,
        sessionDate: activeMeal.sessionDate,
        claimedAt: Timestamp.now(),
        claimedBy: user.uid,
      };
      const docRef = await addDoc(collection(db, 'foodClaims'), { ...newClaim, claimedByName: fullName });
      const claim: FoodClaim = { id: docRef.id, ...newClaim, claimedByName: fullName };
      setAllClaims((prev) => [claim, ...prev]);
      setTodayClaims((prev) => [claim, ...prev]);
      showToast(`✅ ${participant.fullName} — ${activeMeal.name || MEAL_LABELS[activeMeal.type] || activeMeal.type} claimed!`);
    } catch (err) { console.error(err); showToast('❌ Failed to record claim. Try again.', false); }
    finally { setClaimingFor(null); }
  };

  // ── Reports: filters, grouping, pagination ──────────────────────────────
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 8;
  const [reportDateFrom, setReportDateFrom] = React.useState('');
  const [reportDateTo, setReportDateTo] = React.useState('');
  const [reportMealType, setReportMealType] = React.useState<string>('all');
  const [reportSector, setReportSector] = React.useState<string>('all');
  const [reportParticipantQuery, setReportParticipantQuery] = React.useState('');

  const reportFilteredClaims = React.useMemo(() => {
    return allClaims.filter((c) => {
      const d = c.claimedAt?.toDate ? c.claimedAt.toDate() : new Date(c.claimedAt);
      if (reportDateFrom) {
        const from = new Date(`${reportDateFrom}T00:00:00`);
        if (d < from) return false;
      }
      if (reportDateTo) {
        const to = new Date(`${reportDateTo}T23:59:59.999`);
        if (d > to) return false;
      }
      if (reportMealType !== 'all' && c.mealType !== reportMealType) return false;
      if (reportSector !== 'all' && c.sector !== reportSector) return false;
      const q = reportParticipantQuery.trim().toLowerCase();
      if (q) {
        const name = (c.participantName || '').toLowerCase();
        const reg = (c.participantRegId || '').toLowerCase();
        if (!name.includes(q) && !reg.includes(q)) return false;
      }
      return true;
    });
  }, [allClaims, reportDateFrom, reportDateTo, reportMealType, reportSector, reportParticipantQuery]);

  const reportSectorOptions = React.useMemo(() => {
    const s = new Set<string>();
    for (const c of allClaims) {
      if (c.sector) s.add(c.sector);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [allClaims]);

  const claimsByDayAndBooth = React.useMemo(
    () => buildClaimsByDayAndBooth(reportFilteredClaims, fullName),
    [reportFilteredClaims, fullName]
  );

  React.useEffect(() => {
    setPage(1);
  }, [reportDateFrom, reportDateTo, reportMealType, reportSector, reportParticipantQuery]);

  const reportFiltersActive =
    !!reportDateFrom ||
    !!reportDateTo ||
    reportMealType !== 'all' ||
    reportSector !== 'all' ||
    !!reportParticipantQuery.trim();

  const handleExportClaimsCsv = React.useCallback(() => {
    const header = [
      'Date (local)',
      'Time (local)',
      'Participant',
      'Registration ID',
      'Sector',
      'Meal',
      'Meal type',
      'Session date',
      'Claim record ID',
    ];
    const sorted = [...reportFilteredClaims].sort((a, b) => {
      const ta = a.claimedAt?.toDate ? a.claimedAt.toDate().getTime() : new Date(a.claimedAt).getTime();
      const tb = b.claimedAt?.toDate ? b.claimedAt.toDate().getTime() : new Date(b.claimedAt).getTime();
      return tb - ta;
    });
    const lines = [
      header.map(escapeCsvCell).join(','),
      ...sorted.map((c) => {
        const dt = c.claimedAt?.toDate ? c.claimedAt.toDate() : new Date(c.claimedAt);
        return [
          escapeCsvCell(dt.toLocaleDateString('en-CA')),
          escapeCsvCell(dt.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })),
          escapeCsvCell(c.participantName || ''),
          escapeCsvCell(c.participantRegId || ''),
          escapeCsvCell(c.sector || ''),
          escapeCsvCell(c.mealName || MEAL_LABELS[c.mealType] || c.mealType || ''),
          escapeCsvCell(c.mealType || ''),
          escapeCsvCell(c.sessionDate || ''),
          escapeCsvCell(c.id || ''),
        ].join(',');
      }),
    ];
    const csv = `\uFEFF${lines.join('\r\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `iscene-food-claims-${new Date().toISOString().slice(0, 10)}.csv`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    window.setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 500);
  }, [reportFilteredClaims]);

  const paginatedDays = claimsByDayAndBooth.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(claimsByDayAndBooth.length / PAGE_SIZE));

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
      ? claimRecord.claimedAt.toDate().toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true })
      : null;

    const mealShort = activeMeal!.name || MEAL_LABELS[activeMeal!.type] || activeMeal!.type;

    return (
      <tr className="group hover:bg-slate-50 transition-colors">
        <td className="px-3 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            {p.profilePictureUrl ? (
              <img src={p.profilePictureUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover sm:h-10 sm:w-10" />
            ) : (
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-black sm:h-10 sm:w-10 ${avatarColors(p.fullName)}`}>
                {initials(p.fullName)}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{p.fullName}</p>
              <p className="text-[10px] text-slate-400 sm:text-[11px]">ISC-26-{p.id.slice(0, 4).toUpperCase()}</p>
            </div>
          </div>
        </td>
        <td className="px-3 py-3 sm:px-6 sm:py-4">
          <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide sm:text-[10px] ${tier.cls}`}>{tier.label}</span>
        </td>
        <td className="px-3 py-3 text-center sm:px-6 sm:py-4">
          {!isApproved ? (
            <span className="text-[11px] font-medium text-slate-400 sm:text-xs">Not Approved</span>
          ) : claimed ? (
            <div className="flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold text-emerald-600 sm:flex-row sm:gap-1">
              <CheckCircle2 size={14} className="shrink-0" />
              <span className="hidden sm:inline">Claimed {claimedTime ? `(${claimedTime})` : ''}</span>
              <span className="sm:hidden">Done</span>
            </div>
          ) : active ? (
            <div className="mx-auto h-2.5 w-2.5 animate-pulse rounded-full bg-amber-400 ring-4 ring-amber-400/20" />
          ) : (
            <span className="text-[11px] font-medium text-slate-400 sm:text-xs">—</span>
          )}
        </td>
        <td className="px-3 py-3 text-right sm:px-6 sm:py-4">
          {!isApproved ? (
            <span className="inline-block max-w-[5.5rem] rounded-full bg-red-50 px-2 py-1 text-center text-[10px] font-bold text-red-400 sm:max-w-none sm:px-4 sm:py-1.5 sm:text-xs">
              Not approved
            </span>
          ) : claimed ? (
            <button type="button" disabled className="cursor-not-allowed rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-400 sm:px-4 sm:py-1.5 sm:text-xs">
              Claimed ✓
            </button>
          ) : !active ? (
            <span className="inline-block max-w-[6rem] text-[10px] font-bold text-slate-400 sm:max-w-none sm:text-xs">No session</span>
          ) : (
            <button
              type="button"
              disabled={claimingFor === p.uid}
              onClick={() => handleClaim(p)}
              className="ml-auto flex max-w-full items-center justify-center gap-1 rounded-full bg-blue-600 px-2.5 py-1.5 text-[10px] font-bold text-white transition-all hover:bg-blue-700 active:scale-95 disabled:opacity-60 sm:px-4 sm:py-1.5 sm:text-xs"
            >
              {claimingFor === p.uid ? <Loader2 size={12} className="animate-spin" /> : null}
              <span className="truncate sm:max-w-[10rem]">
                <span className="sm:hidden">Claim</span>
                <span className="hidden sm:inline">Claim {mealShort}</span>
              </span>
            </button>
          )}
        </td>
      </tr>
    );
  };

  const foodBoothBellPanel = bellPanelOpen ? (
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
              className="px-3 py-2.5 border-b border-slate-100 last:border-0 border-l-4 border-l-orange-500 bg-orange-50/30 pl-3 text-left"
            >
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-0.5">
                {notifyCategoryLabel(n.type)}
              </p>
              <p className={`text-sm leading-snug ${n.read ? 'text-slate-600' : 'text-slate-900 font-semibold'}`}>
                {n.msg}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">
                {new Date(n.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
              </p>
            </li>
          ))
        )}
      </ul>
    </div>
  ) : null;

  const foodBoothTabPanels = (
    <>

        {/* Search results dropdown */}
        {searchResults.length > 0 && (activeTab === 'dashboard' || activeTab === 'participants') && (
          <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
              <div className="min-w-0 pr-2">
                <p className="text-sm font-bold leading-snug text-slate-700">
                  Search results —{' '}
                  {activeMeal
                    ? `Active: ${activeMeal.name || MEAL_LABELS[activeMeal.type] || activeMeal.type}`
                    : 'No active entitlement'}
                </p>
                {activeMeal ? (
                  <p className="mt-1 text-xs text-slate-500">Who can claim: {formatEligibility(activeMeal)}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => {
                  setSearchResults([]);
                  setSearchQuery('');
                }}
                className="shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Clear search results"
              >
                <X size={16} />
              </button>
            </div>
            {!activeMeal && (
              <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700 sm:px-5">
                <AlertCircle size={16} className="shrink-0" />{' '}
                <span>No active entitlement. Claims only during a live session.</span>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left">
                <thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-wider text-slate-500 sm:text-[10px]">
                  <tr>
                    <th className="px-3 py-2.5 sm:px-6 sm:py-3">Participant</th>
                    <th className="px-3 py-2.5 sm:px-6 sm:py-3">Sector</th>
                    <th className="px-3 py-2.5 text-center sm:px-6 sm:py-3">Status</th>
                    <th className="px-3 py-2.5 text-right sm:px-6 sm:py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {searchResults.map((p) => (
                    <React.Fragment key={p.uid}>{ParticipantRow({ p })}</React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══════════════ DASHBOARD ══════════════ */}
        {activeTab === 'dashboard' && (
          <>
            {/* Mobile home — participant-style welcome, chips, food quick actions, pickup list */}
            <div className="md:hidden">
              <div className="pt-1 pb-2">
                <h2 className="text-xl font-black tracking-tight">Welcome, {firstName}!</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {hasEntryAttendance
                    ? "You're checked in at the Main Hall."
                    : 'Time in at the Main Hall by scanning the entrance QR (fab or Main Hall tab).'}{' '}
                  {activeMeal
                    ? `Now serving: ${activeMeal.name || MEAL_LABELS[activeMeal.type] || activeMeal.type} — scan guest QR or find them below.`
                    : 'When a pickup window is live, validate guests here.'}
                </p>
              </div>
              <div className="flex gap-2 py-3 overflow-x-auto no-scrollbar">
                {[
                  { label: 'Booth', done: approvalStatus === 'approved' },
                  { label: 'Live', done: !!activeMeal },
                  { label: 'Meals', done: meals.length > 0 },
                  { label: 'Main Hall', done: hasEntryAttendance },
                  { label: 'Claims', done: todayClaims.length > 0 },
                ].map(({ label, done }) => (
                  <div
                    key={label}
                    className={`shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
                      done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {done ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                    {label}
                    {label === 'Claims' && todayClaims.length > 0 ? ` · ${todayClaims.length}` : ''}
                  </div>
                ))}
              </div>
              {travelAccIncomplete ? (
                <button
                  type="button"
                  onClick={() => setActiveTab('profile')}
                  className="mx-0 mb-3 flex w-full items-start gap-2 rounded-2xl border-2 border-orange-300 bg-orange-50 px-4 py-3 text-left shadow-sm active:scale-[0.99] transition-transform"
                >
                  <AlertTriangle className="shrink-0 text-orange-600 mt-0.5" size={18} aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-black text-orange-900">Flight &amp; accommodation needed</p>
                    <p className="text-xs text-orange-800/90 mt-0.5 font-medium">
                      Open Profile and complete both fields so organizers can plan your travel and stay.
                    </p>
                    <p className="text-[11px] font-bold text-blue-700 mt-1.5">Go to Profile →</p>
                  </div>
                </button>
              ) : null}
              <div className="pb-4">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1">
                  <Zap size={12} /> Quick actions
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    {
                      icon: <QrCode size={20} className="text-indigo-600" />,
                      label: 'Time in',
                      bg: 'bg-indigo-50',
                      action: () => {
                        setActiveTab('main-hall');
                        setScanModal(true);
                      },
                    },
                    {
                      icon: <Utensils size={20} className="text-orange-500" />,
                      label: 'Serve queue',
                      bg: 'bg-orange-50',
                      action: () => {
                        if (activeMeal) claimListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        else setActiveTab('participants');
                      },
                      badge: activeMeal ? 1 : undefined,
                    },
                    {
                      icon: <CalendarDays size={20} className="text-emerald-600" />,
                      label: 'Meal windows',
                      bg: 'bg-emerald-50',
                      action: () => setActiveTab('sessions'),
                      badge: meals.length > 0 ? Math.min(99, meals.length) : undefined,
                    },
                    {
                      icon: <Users size={20} className="text-cyan-600" />,
                      label: 'People',
                      bg: 'bg-cyan-50',
                      action: () => setActiveTab('participants'),
                    },
                    {
                      icon: <BarChart3 size={20} className="text-amber-600" />,
                      label: 'Reports',
                      bg: 'bg-amber-50',
                      action: () => setActiveTab('reports'),
                      badge: todayClaims.length > 0 ? Math.min(99, todayClaims.length) : undefined,
                    },
                  ].map(({ icon, label, bg, action, badge }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={action}
                      className="relative bg-white rounded-2xl p-3 flex flex-col items-center gap-2 shadow-sm border border-slate-100 hover:shadow-md active:scale-95 transition-all"
                      aria-label={badge != null && badge > 0 ? `${label}, ${badge} pending` : label}
                    >
                      {badge != null && badge > 0 ? (
                        <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-blue-600 text-white text-[10px] font-black leading-none z-10" aria-hidden>
                          {badge > 99 ? '99+' : badge}
                        </span>
                      ) : null}
                      <div className={`w-10 h-10 ${bg} rounded-full flex items-center justify-center`}>{icon}</div>
                      <span className="text-[11px] font-medium text-slate-600 text-center leading-tight">{label}</span>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-2 text-center px-1">
                  Use the center QR button to scan guests or entrance codes.
                </p>
              </div>
              {sortedMealsPreview.length > 0 ? (
                <div className="pb-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-bold text-slate-800">Pickup schedule</p>
                    <button type="button" onClick={() => setActiveTab('sessions')} className="text-xs font-semibold text-blue-600">
                      View all →
                    </button>
                  </div>
                  <div
                    className="min-h-0 max-h-[min(52vh,20rem)] overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] touch-pan-y rounded-xl border border-slate-100 bg-slate-50/40 px-1 py-1.5 space-y-2.5"
                    role="region"
                    aria-label="Pickup schedule, scrollable when long"
                  >
                    {sortedMealsPreview.map((meal) => {
                      const isLive = activeMeals.some((m) => m.id === meal.id);
                      const ended = parseWindowTime(meal.endTime, meal.sessionDate) <= now;
                      const dateLabel = meal.sessionDate
                        ? new Date(meal.sessionDate).toLocaleDateString('en-PH', {
                            weekday: 'long',
                            month: 'long',
                            day: 'numeric',
                          })
                        : '—';
                      const line1 = `${dateLabel} · ${formatMealTimeRangeForDisplay(meal.startTime, meal.endTime)}`;
                      const title = meal.name || MEAL_LABELS[meal.type] || meal.type;
                      return (
                        <button
                          key={meal.id}
                          type="button"
                          onClick={() => setActiveTab('sessions')}
                          className="w-full shrink-0 text-left rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:shadow-md active:scale-[0.99] transition-all flex"
                        >
                          <div
                            className={`w-2 shrink-0 min-h-[4.5rem] ${isLive ? 'bg-blue-500' : ended ? 'bg-slate-200' : 'bg-amber-400'}`}
                            aria-hidden
                          />
                          <div className="flex-1 min-w-0 flex items-start justify-between gap-2 p-4">
                            <div className="min-w-0">
                              <p className="text-[11px] text-slate-500 mb-0.5">{line1}</p>
                              <p className="text-sm font-bold text-slate-800 truncate">{title}</p>
                              {meal.location ? (
                                <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">📍 {meal.location}</p>
                              ) : null}
                              {meal.foodLocationDetails ? (
                                <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2 whitespace-pre-wrap">🍽 {meal.foodLocationDetails}</p>
                              ) : null}
                              {isLive ? (
                                <span className="inline-block mt-1 text-[10px] font-black uppercase text-blue-600">Live pickup</span>
                              ) : null}
                            </div>
                            <ChevronRight size={16} className="text-slate-300 shrink-0 mt-1" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            {travelAccIncomplete ? (
              <button
                type="button"
                onClick={() => setActiveTab('profile')}
                className="mb-6 hidden w-full items-start gap-3 rounded-2xl border-2 border-orange-300 bg-orange-50 px-5 py-4 text-left shadow-sm transition-transform hover:bg-orange-100/80 md:flex"
              >
                <AlertTriangle className="shrink-0 text-orange-600 mt-0.5" size={20} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-base font-black text-orange-900">Flight &amp; accommodation required</p>
                  <p className="mt-1 text-sm text-orange-800/90">
                    Complete both in Profile so organizers can coordinate your travel and hotel stay.
                  </p>
                  <p className="mt-2 text-xs font-bold text-blue-700">Open Profile →</p>
                </div>
              </button>
            ) : null}

            {/* Stats — desktop */}
            <div className="mb-6 hidden md:grid grid-cols-1 gap-4 sm:mb-8 sm:gap-5 md:grid-cols-3">
              {/* Active Session */}
              <div className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-sm font-medium text-slate-500">Active Session</span>
                  <Clock size={20} className="text-blue-500" />
                </div>
                {activeMeal ? (
                  <>
                    {activeMeals.length > 1 ? (
                      <select
                        value={activeMeal.id}
                        onChange={(e) => setSelectedMealId(e.target.value)}
                        className="text-lg font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                        {activeMeals.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name || MEAL_LABELS[m.type] || m.type} ({formatMealTimeRangeForDisplay(m.startTime, m.endTime)})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="break-words text-xl font-black sm:text-2xl">{activeMeal.name || MEAL_LABELS[activeMeal.type] || activeMeal.type}</p>
                    )}
                    <p className="text-xs text-slate-400">{timeUntilEnd(activeMeal)} · {formatMealTimeRangeForDisplay(activeMeal.startTime, activeMeal.endTime)}</p>
                    {activeMeal.location ? (
                      <p className="text-xs text-slate-500 mt-1">📍 {activeMeal.location}</p>
                    ) : null}
                    {activeMeal.foodLocationDetails ? (
                      <p className="text-xs text-slate-600 mt-1 whitespace-pre-wrap">🍽 {activeMeal.foodLocationDetails}</p>
                    ) : null}
                    <p className="text-xs text-slate-500 mt-1.5">
                      <span className="font-medium">Who can claim:</span> {formatEligibility(activeMeal)}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-xl font-black text-slate-400">No Active Session</p>
                    <p className="text-xs text-slate-400">
                      {upcomingMeals[0]
                        ? `Next: ${MEAL_LABELS[upcomingMeals[0].type] || upcomingMeals[0].type} at ${formatMealTimeForDisplay(upcomingMeals[0].startTime)}`
                        : 'No upcoming sessions today'}
                    </p>
                  </>
                )}
              </div>
              {/* Claims Today */}
              <div className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
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
              <div className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-sm font-medium text-slate-500">Last Claimed</span>
                  <BarChart3 size={20} className="text-orange-400" />
                </div>
                {todayClaims[0] ? (
                  <>
                    <p className="text-lg font-black truncate">{todayClaims[0].participantName}</p>
                    <p className="text-xs text-slate-400">
                      {MEAL_LABELS[todayClaims[0].mealType] || todayClaims[0].mealType} · {todayClaims[0].claimedAt?.toDate ? todayClaims[0].claimedAt.toDate().toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true }) : '—'}
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

            {/* Session Timeline — desktop */}
            {meals.length > 0 && (
              <div className="-mx-3 mb-6 hidden md:block overflow-x-auto px-3 pb-4 sm:mx-0 sm:px-0 md:mb-8">
                <div className="flex min-w-[600px] items-start gap-3 sm:gap-4">
                  {[...pastMeals, ...activeMeals, ...upcomingMeals].map((meal) => {
                    const isActive = activeMeals.some((m) => m.id === meal.id);
                    const isPast = !isActive && parseWindowTime(meal.endTime, meal.sessionDate) <= now;
                    return (
                      <div key={meal.id} className={`flex-1 flex flex-col gap-2 ${isPast ? 'opacity-50' : ''}`}>
                        <div className={`h-1 rounded-full relative ${isActive ? 'bg-blue-500' : isPast ? 'bg-slate-300' : 'bg-slate-200'}`}>
                          {isActive && <div className="absolute -top-1.5 left-1/4 w-4 h-4 rounded-full bg-blue-500 ring-4 ring-blue-200" />}
                        </div>
                        <div className={`flex justify-between text-[11px] font-medium ${isActive ? 'text-blue-600 font-bold' : 'text-slate-500'}`}>
                          <span>{formatMealTimeRangeForDisplay(meal.startTime, meal.endTime)}</span>
                          <span>{MEAL_LABELS[meal.type] || meal.type}{isActive ? ' (Live)' : ''}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* People who can claim — list with status */}
            {activeMeal && (
              <div ref={claimListRef} className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md sm:mb-8">
                <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                  <div className="min-w-0">
                    <h3 className="text-base font-black">People Who Can Claim</h3>
                    <p className="mt-0.5 text-sm text-slate-400">
                      {activeMeal.name || MEAL_LABELS[activeMeal.type] || activeMeal.type} — {formatEligibility(activeMeal)}
                    </p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">
                      Grouped by sector · scroll for long queues · use the search bar above to narrow this list
                    </p>
                    {searchQuery.trim() && eligibleParticipants.length > 0 ? (
                      <p className="mt-1 text-[11px] text-blue-600 font-bold">
                        Showing {eligibleFiltered.length} of {eligibleParticipants.length} in this window
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="max-h-[min(70vh,36rem)] overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] touch-pan-y">
                  {loadingEligible ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="animate-spin text-blue-600" size={28} />
                    </div>
                  ) : eligibleParticipants.length === 0 ? (
                    <div className="py-12 text-center text-slate-400">
                      <User size={32} className="mx-auto mb-2 text-slate-200" />
                      <p className="text-sm font-medium">No eligible participants found</p>
                    </div>
                  ) : eligibleFiltered.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 px-4">
                      <Search size={32} className="mx-auto mb-2 text-slate-200" />
                      <p className="text-sm font-medium">No one matches this search in the eligible list</p>
                      <p className="text-xs mt-1 text-slate-500">Clear the search field to see all {eligibleParticipants.length} again</p>
                    </div>
                  ) : (
                    <>
                      {/* Mobile: card list */}
                      <div className="divide-y divide-slate-100 md:hidden">
                        {eligibleGroupedBySector.map(({ sector, people }) => (
                          <div key={sector}>
                            <div className="bg-slate-50 px-4 py-2 text-[11px] font-black uppercase tracking-wide text-slate-700">
                              {sector}{' '}
                              <span className="font-bold normal-case text-slate-500">
                                · {people.length} {people.length === 1 ? 'person' : 'people'}
                              </span>
                            </div>
                            {people.map((p) => {
                              const claimed = hasClaimed(p.uid, activeMeal.id);
                              const isApproved = p.status === 'approved';
                              return (
                                <div key={p.uid} className="flex flex-col gap-3 px-4 py-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex min-w-0 flex-1 items-center gap-3">
                                      {p.profilePictureUrl ? (
                                        <img src={p.profilePictureUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                                      ) : (
                                        <div
                                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-black ${avatarColors(p.fullName)}`}
                                        >
                                          {initials(p.fullName)}
                                        </div>
                                      )}
                                      <div className="min-w-0">
                                        <p className="truncate font-bold text-slate-900">{p.fullName}</p>
                                        <p className="text-[11px] text-slate-400">ISC-26-{p.id.slice(0, 4).toUpperCase()}</p>
                                      </div>
                                    </div>
                                    {!isApproved ? null : claimed ? null : (
                                      <button
                                        type="button"
                                        disabled={claimingFor === p.uid}
                                        onClick={() => handleClaim(p)}
                                        className="shrink-0 rounded-full bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
                                      >
                                        {claimingFor === p.uid ? <Loader2 size={12} className="animate-spin" /> : 'Claim'}
                                      </button>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span
                                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${sectorTier(p.sector).cls}`}
                                    >
                                      {sectorTier(p.sector).label}
                                    </span>
                                    {!isApproved ? (
                                      <span className="text-xs font-medium text-amber-600">Not approved</span>
                                    ) : claimed ? (
                                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
                                        <CheckCircle2 size={14} /> Claimed
                                      </span>
                                    ) : (
                                      <span className="text-xs text-slate-500">Ready to claim</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                      {/* Desktop: table */}
                      <div className="hidden overflow-x-auto md:block">
                        <table className="w-full min-w-[640px] text-left">
                          <thead className="sticky top-0 z-20 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 shadow-sm">
                            <tr>
                              <th className="px-4 py-3 lg:px-6">Participant</th>
                              <th className="px-4 py-3 lg:px-6">Sector</th>
                              <th className="px-4 py-3 text-center lg:px-6">Status</th>
                              <th className="px-4 py-3 text-right lg:px-6">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {eligibleGroupedBySector.map(({ sector, people }) => (
                              <React.Fragment key={sector}>
                                <tr className="border-y border-slate-200 bg-slate-100">
                                  <td
                                    colSpan={4}
                                    className="px-4 py-2.5 text-[11px] font-black uppercase tracking-wide text-slate-700 lg:px-6"
                                  >
                                    {sector}{' '}
                                    <span className="font-bold normal-case text-slate-500">
                                      · {people.length} {people.length === 1 ? 'person' : 'people'}
                                    </span>
                                  </td>
                                </tr>
                                {people.map((p) => {
                                  const claimed = hasClaimed(p.uid, activeMeal.id);
                                  const isApproved = p.status === 'approved';
                                  return (
                                    <tr key={p.uid} className="transition-colors hover:bg-slate-50/50">
                                      <td className="px-4 py-3 lg:px-6">
                                        <div className="flex items-center gap-3">
                                          {p.profilePictureUrl ? (
                                            <img src={p.profilePictureUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
                                          ) : (
                                            <div
                                              className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-black ${avatarColors(p.fullName)}`}
                                            >
                                              {initials(p.fullName)}
                                            </div>
                                          )}
                                          <div className="min-w-0">
                                            <p className="truncate text-sm font-bold">{p.fullName}</p>
                                            <p className="text-[11px] text-slate-400">ISC-26-{p.id.slice(0, 4).toUpperCase()}</p>
                                          </div>
                                        </div>
                                      </td>
                                      <td className="px-4 py-3 lg:px-6">
                                        <span
                                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${sectorTier(p.sector).cls}`}
                                        >
                                          {sectorTier(p.sector).label}
                                        </span>
                                      </td>
                                      <td className="px-4 py-3 text-center lg:px-6">
                                        {!isApproved ? (
                                          <span className="text-xs font-medium text-amber-600">Not Approved</span>
                                        ) : claimed ? (
                                          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
                                            <CheckCircle2 size={14} /> Claimed
                                          </span>
                                        ) : (
                                          <span className="text-xs font-medium text-slate-500">Not yet</span>
                                        )}
                                      </td>
                                      <td className="px-4 py-3 text-right lg:px-6">
                                        {!isApproved ? (
                                          <span className="text-xs text-slate-400">—</span>
                                        ) : claimed ? (
                                          <button
                                            type="button"
                                            disabled
                                            className="cursor-not-allowed rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-400"
                                          >
                                            Claimed ✓
                                          </button>
                                        ) : (
                                          <button
                                            type="button"
                                            disabled={claimingFor === p.uid}
                                            onClick={() => handleClaim(p)}
                                            className="ml-auto flex items-center gap-1 rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60"
                                          >
                                            {claimingFor === p.uid ? <Loader2 size={10} className="animate-spin" /> : null}
                                            Claim
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </React.Fragment>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
                {eligibleParticipants.length > 0 ? (
                  <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-500 sm:px-5">
                    {eligibleParticipants.filter((p) => p.status === 'approved' && hasClaimed(p.uid, activeMeal.id)).length}{' '}
                    of {eligibleParticipants.filter((p) => p.status === 'approved').length} approved claimed
                  </div>
                ) : null}
              </div>
            )}

            {/* Check-in section */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md">
              <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-5">
                <div className="min-w-0">
                  <h3 className="text-base font-black">Participant Check-in</h3>
                  <p className="mt-0.5 text-sm text-slate-400">Search, scan, or use the list above to validate</p>
                </div>
                <button
                  type="button"
                  onClick={() => setScanModal(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-200 transition-colors hover:bg-blue-700 sm:w-auto"
                >
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
                      <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 sm:px-6">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Today's Claims</p>
                      </div>
                      <div className="max-h-[min(50vh,24rem)] overflow-y-auto overflow-x-auto overscroll-y-contain">
                        <table className="w-full min-w-[480px] text-left sm:min-w-[520px]">
                          <thead className="sticky top-0 z-10 bg-slate-50 text-[9px] font-bold uppercase tracking-widest text-slate-400 shadow-sm sm:text-[10px]">
                            <tr>
                              <th className="px-3 py-2.5 sm:px-6 sm:py-3">Participant</th>
                              <th className="px-3 py-2.5 sm:px-6 sm:py-3">Sector</th>
                              <th className="px-3 py-2.5 sm:px-6 sm:py-3">Item</th>
                              <th className="px-3 py-2.5 text-right sm:px-6 sm:py-3">Time</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {todayClaims.map((c) => {
                              const time = c.claimedAt?.toDate ? c.claimedAt.toDate().toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true }) : '—';
                              return (
                                <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-3 py-2.5 sm:px-6 sm:py-3">
                                    <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-black sm:h-9 sm:w-9 sm:text-xs ${avatarColors(c.participantName)}`}>{initials(c.participantName)}</div>
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-bold">{c.participantName}</p>
                                        <p className="text-[10px] text-slate-400 sm:text-[11px]">ISC-26-{c.participantRegId?.slice(0, 4) || '—'}</p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-3 py-2.5 sm:px-6 sm:py-3">
                                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide sm:text-[10px] ${sectorTier(c.sector).cls}`}>{sectorTier(c.sector).label}</span>
                                  </td>
                                  <td className="max-w-[8rem] truncate px-3 py-2.5 text-sm sm:max-w-none sm:px-6 sm:py-3 sm:whitespace-normal">{c.mealName || MEAL_LABELS[c.mealType] || c.mealType}</td>
                                  <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-medium sm:px-6 sm:py-3 sm:text-sm">{time}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50 p-4 sm:p-5">
                <p className="min-w-0 flex-1 text-xs text-slate-400">
                  {todayClaims.length > 0
                    ? `All ${todayClaims.length} claim${todayClaims.length !== 1 ? 's' : ''} today — scroll the list if needed`
                    : 'No claims today'}
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('reports')}
                  className="shrink-0 text-xs font-bold text-blue-600 hover:underline"
                >
                  Full report →
                </button>
              </div>
            </div>
          </>
        )}

        {/* ══════════════ PARTICIPANTS ══════════════ */}
        {activeTab === 'participants' && (
          <div>
            <div className="mb-4 sm:mb-6">
              <h2 className="text-xl font-black sm:text-2xl">Participant Validation</h2>
              <p className="mt-1 text-sm text-slate-500">
                Search by name (same field as Home) or tap Scan QR / the center QR button to validate meal eligibility.
              </p>
            </div>
            <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <button
                type="button"
                onClick={() => setScanModal(true)}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700 sm:inline-flex sm:w-auto"
              >
                <QrCode size={16} /> Scan QR
              </button>
              {activeMeal ? (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {activeMeals.length > 1 ? (
                    <select
                      value={activeMeal.id}
                      onChange={(e) => setSelectedMealId(e.target.value)}
                      className="text-sm font-semibold text-slate-800 bg-white border border-emerald-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      {activeMeals.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name || MEAL_LABELS[m.type] || m.type} ({formatMealTimeRangeForDisplay(m.startTime, m.endTime)})
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-xl px-4 py-2.5">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      Active: <strong>{activeMeal.name || MEAL_LABELS[activeMeal.type] || activeMeal.type}</strong> ·{' '}
                      {formatMealTimeRangeForDisplay(activeMeal.startTime, activeMeal.endTime)} · {timeUntilEnd(activeMeal)}
                    </div>
                    {activeMeal.location ? (
                      <p className="text-xs text-slate-600">📍 {activeMeal.location}</p>
                    ) : null}
                    {activeMeal.foodLocationDetails ? (
                      <p className="text-xs text-slate-700 whitespace-pre-wrap">🍽 {activeMeal.foodLocationDetails}</p>
                    ) : null}
                    <p className="text-xs text-slate-600"><span className="font-medium">Who can claim:</span> {formatEligibility(activeMeal)}</p>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex items-center gap-2 text-sm text-amber-700 bg-amber-50 rounded-xl px-4 py-2.5">
                  <AlertCircle size={16} /> No active entitlement. Claims can only be made during a live session.
                </div>
              )}
            </div>
            {searchResults.length > 0 ? (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4">
                  <p className="text-sm font-bold text-slate-600">
                    {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left">
                    <thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-widest text-slate-400 sm:text-[10px]">
                      <tr>
                        <th className="px-3 py-2.5 sm:px-6 sm:py-3">Participant</th>
                        <th className="px-3 py-2.5 sm:px-6 sm:py-3">Sector</th>
                        <th className="px-3 py-2.5 text-center sm:px-6 sm:py-3">Status</th>
                        <th className="px-3 py-2.5 text-right sm:px-6 sm:py-3">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {searchResults.map((p) => (
                        <React.Fragment key={p.uid}>{ParticipantRow({ p })}</React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
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
            <div className="mb-4 sm:mb-6">
              <h2 className="text-xl font-black sm:text-2xl">Entitlement Sessions</h2>
              <p className="mt-1 text-sm text-slate-500">What can be claimed, by day — who can claim each item</p>
            </div>
            {meals.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm py-16 text-center text-slate-400">
                <CalendarDays size={40} className="mx-auto mb-3 text-slate-200" />
                <p className="font-medium">No entitlements assigned to your booth yet</p>
              </div>
            ) : (
              (() => {
                const allOrdered = [...pastMeals, ...activeMeals, ...upcomingMeals];
                const byDay = new Map<string, MealWindow[]>();
                for (const meal of allOrdered) {
                  const dateKey = meal.sessionDate ? (meal.sessionDate.includes('T') ? meal.sessionDate.slice(0, 10) : meal.sessionDate) : 'unscheduled';
                  if (!byDay.has(dateKey)) byDay.set(dateKey, []);
                  byDay.get(dateKey)!.push(meal);
                }
                const days = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0]));
                return (
                  <div className="space-y-6">
                    {days.map(([dateKey, dayMeals]) => {
                      const dateLabel = dateKey === 'unscheduled' ? 'Unscheduled' : new Date(dateKey + 'T12:00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
                      return (
                        <div key={dateKey} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-6 sm:py-4">
                            <h3 className="flex items-center gap-2 break-words font-black text-slate-800">
                              <CalendarDays size={18} className="text-blue-500" />
                              {dateLabel}
                            </h3>
                            <p className="text-xs text-slate-500 mt-0.5">{dayMeals.length} item{dayMeals.length !== 1 ? 's' : ''} on this day</p>
                          </div>
                          <div className="divide-y divide-slate-100">
                            {dayMeals.map((meal) => {
                              const isActive = activeMeals.some((m) => m.id === meal.id);
                              const isPast = !isActive && parseWindowTime(meal.endTime, meal.sessionDate) <= now;
                              const claimCount = allClaims.filter((c) => c.mealId === meal.id).length;
                              return (
                                <div
                                  key={meal.id}
                                  className={`flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5 ${isActive ? 'bg-blue-50/50' : ''} ${isPast ? 'opacity-65' : ''}`}
                                >
                                  <div
                                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${isActive ? 'bg-blue-600' : 'bg-slate-100'}`}
                                  >
                                    <UtensilsCrossed size={22} className={isActive ? 'text-white' : 'text-slate-400'} />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className="font-black text-slate-800">{meal.name || MEAL_LABELS[meal.type] || meal.type}</p>
                                      {isActive && <span className="text-[10px] font-black bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full uppercase animate-pulse">LIVE</span>}
                                      {isPast && <span className="text-[10px] font-bold bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full uppercase">Ended</span>}
                                    </div>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                      {formatMealTimeRangeForDisplay(meal.startTime, meal.endTime)}
                                      {meal.location && <span className="ml-1">· 📍 {meal.location}</span>}
                                    </p>
                                    {meal.foodLocationDetails && (
                                      <p className="text-xs text-slate-600 mt-1 whitespace-pre-wrap">
                                        🍽 {meal.foodLocationDetails}
                                      </p>
                                    )}
                                    <div className="mt-2 flex items-center gap-2 text-[11px]">
                                      <span className="font-semibold text-slate-600">Who can claim:</span>
                                      <span className="text-slate-600">{formatEligibility(meal)}</span>
                                    </div>
                                  </div>
                                  <div className="flex shrink-0 flex-row items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-start sm:text-right">
                                    <div className="text-left sm:text-right">
                                      <p className="text-xl font-black text-blue-600">{claimCount}</p>
                                      <p className="text-[11px] text-slate-400">claims</p>
                                    </div>
                                    {isActive ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSearchQuery('');
                                          setActiveTab('participants');
                                        }}
                                        className="shrink-0 rounded-full bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
                                      >
                                        Validate
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            )}
          </div>
        )}

        {/* ══════════════ MAIN HALL (staff time-in) ══════════════ */}
        {activeTab === 'main-hall' && (
          <div className="max-w-lg mx-auto w-full">
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">Main Hall check-in</h2>
            <p className="text-slate-500 text-sm mt-2 leading-relaxed">
              Food booth staff time in at the Main Hall like other attendees. Scan the <strong className="font-semibold text-slate-700">entrance</strong> QR — not a breakout room. Use the same scanner as for guest Digital IDs; the app detects the QR type automatically.
            </p>
            <div
              className={`mt-6 rounded-2xl border p-5 md:p-6 shadow-sm ${
                hasEntryAttendance ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'
              }`}
            >
              <p className="text-sm font-bold text-slate-800">
                {hasEntryAttendance
                  ? "You're checked in for today at the Main Hall."
                  : 'Not checked in yet for today.'}
              </p>
              <p className="text-xs text-slate-500 mt-1">Daily reset uses the Philippines calendar (Asia/Manila).</p>
              <button
                type="button"
                onClick={() => setScanModal(true)}
                className="mt-4 w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 active:scale-[0.99] transition-transform min-h-11"
              >
                <QrCode size={18} /> Scan Main Hall QR
              </button>
            </div>
          </div>
        )}

        {/* ══════════════ ARTICLES ══════════════ */}
        {activeTab === 'articles' && (
          <div>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => setActiveTab('dashboard')}
                className="flex items-center gap-2 font-semibold text-slate-600 transition-colors hover:text-blue-600"
              >
                <ArrowLeft size={20} />
                Back to Dashboard
              </button>
            </div>
            <div className="mb-6">
              <div className="mb-2 flex items-center gap-2">
                <Newspaper size={22} className="shrink-0 text-rose-500" />
                <h2 className="text-xl font-black sm:text-2xl">Articles</h2>
              </div>
              <p className="text-sm text-slate-500">Organizer updates and announcements — same library as the attendee app.</p>
            </div>
            <div className="md:hidden">
              <ArticleBrowsePanel
                variant="mobile"
                loading={boothArticlesLoading}
                articles={boothArticles}
                searchQuery={boothArticleSearchQuery}
                onSearchChange={setBoothArticleSearchQuery}
                categoryFilter={boothArticleCategoryFilter}
                onCategoryChange={setBoothArticleCategoryFilter}
                categoryChipNames={articleCategoryChipNames}
              />
            </div>
            <div className="hidden md:block">
              <div className="max-w-4xl">
                <ArticleBrowsePanel
                  variant="desktop"
                  loading={boothArticlesLoading}
                  articles={boothArticles}
                  searchQuery={boothArticleSearchQuery}
                  onSearchChange={setBoothArticleSearchQuery}
                  categoryFilter={boothArticleCategoryFilter}
                  onCategoryChange={setBoothArticleCategoryFilter}
                  categoryChipNames={articleCategoryChipNames}
                />
              </div>
            </div>
          </div>
        )}

        {/* ══════════════ REPORTS ══════════════ */}
        {activeTab === 'reports' && (
          <div>
            <div className="flex items-center gap-4 mb-6">
              <button
                type="button"
                onClick={() => setActiveTab('dashboard')}
                className="flex items-center gap-2 text-slate-600 hover:text-blue-600 font-semibold transition-colors"
              >
                <ArrowLeft size={20} />
                Back to Home
              </button>
            </div>
            <div className="mb-6 flex flex-col gap-4 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-xl font-black sm:text-2xl">Claim Reports</h2>
                <p className="mt-1 text-sm text-slate-500">Filter your booth history and export to CSV for spreadsheets</p>
              </div>
              <div className="shrink-0 text-left sm:text-right">
                <p className="text-2xl font-black text-blue-600">{reportFilteredClaims.length}</p>
                <p className="text-xs text-slate-400">
                  {reportFiltersActive && allClaims.length !== reportFilteredClaims.length
                    ? `matching filters · ${allClaims.length} total recorded`
                    : 'claims in view'}
                </p>
              </div>
            </div>

            <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Filter size={18} className="text-slate-400" />
                <span className="text-sm font-bold text-slate-700">Filters</span>
                {reportFiltersActive ? (
                  <button
                    type="button"
                    onClick={() => {
                      setReportDateFrom('');
                      setReportDateTo('');
                      setReportMealType('all');
                      setReportSector('all');
                      setReportParticipantQuery('');
                    }}
                    className="ml-auto text-xs font-bold text-blue-600 hover:underline"
                  >
                    Clear all
                  </button>
                ) : null}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">From date</span>
                  <input
                    type="date"
                    value={reportDateFrom}
                    onChange={(e) => setReportDateFrom(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">To date</span>
                  <input
                    type="date"
                    value={reportDateTo}
                    onChange={(e) => setReportDateTo(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Meal type</span>
                  <select
                    value={reportMealType}
                    onChange={(e) => setReportMealType(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All types</option>
                    {Object.entries(MEAL_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Sector</span>
                  <select
                    value={reportSector}
                    onChange={(e) => setReportSector(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All sectors</option>
                    {reportSectorOptions.map((sec) => (
                      <option key={sec} value={sec}>
                        {sec}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 sm:col-span-2 xl:col-span-1">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Participant or ID</span>
                  <input
                    type="search"
                    value={reportParticipantQuery}
                    onChange={(e) => setReportParticipantQuery(e.target.value)}
                    placeholder="Search name or reg ID…"
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    aria-label="Filter by participant name or registration ID"
                  />
                </label>
                <div className="flex flex-col justify-end gap-2 sm:col-span-2 lg:col-span-3 xl:col-span-1">
                  <button
                    type="button"
                    onClick={() => handleExportClaimsCsv()}
                    disabled={reportFilteredClaims.length === 0}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-200 transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Download size={18} />
                    Export CSV ({reportFilteredClaims.length})
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md">
              {allClaims.length === 0 ? (
                <div className="py-14 text-center text-slate-400">
                  <BarChart3 size={40} className="mx-auto mb-3 text-slate-200" />
                  <p className="font-medium">No claims recorded yet</p>
                </div>
              ) : reportFilteredClaims.length === 0 ? (
                <div className="py-14 text-center text-slate-400">
                  <BarChart3 size={40} className="mx-auto mb-3 text-slate-200" />
                  <p className="font-medium">No claims match your filters</p>
                  <button
                    type="button"
                    onClick={() => {
                      setReportDateFrom('');
                      setReportDateTo('');
                      setReportMealType('all');
                      setReportSector('all');
                      setReportParticipantQuery('');
                    }}
                    className="mt-3 text-sm font-bold text-blue-600 hover:underline"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                <>
                  {paginatedDays.map((day) => (
                    <div key={day.dateKey} className="border-b border-slate-100 last:border-b-0">
                      <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 sm:px-6 sm:py-4">
                        <h3 className="font-black text-slate-800">{day.dateLabel}</h3>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {day.booths.reduce((sum, b) => sum + b.claims.length, 0)} claim{day.booths.reduce((sum, b) => sum + b.claims.length, 0) !== 1 ? 's' : ''} across {day.booths.length} booth{day.booths.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                      {day.booths.map((booth) => (
                        <div key={booth.boothName} className="border-b border-slate-50 last:border-b-0">
                          <div className="bg-slate-100/60 px-4 py-2 sm:px-6">
                            <p className="text-xs font-bold text-slate-600">{booth.boothName}</p>
                            <p className="text-[10px] text-slate-400">{booth.claims.length} claim{booth.claims.length !== 1 ? 's' : ''}</p>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[520px] text-left">
                            <thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-widest text-slate-400 sm:text-[10px]">
                              <tr>
                                <th className="px-3 py-2.5 sm:px-6 sm:py-3">Participant</th>
                                <th className="px-3 py-2.5 sm:px-6 sm:py-3">Sector</th>
                                <th className="px-3 py-2.5 sm:px-6 sm:py-3">Meal</th>
                                <th className="px-3 py-2.5 sm:px-6 sm:py-3">Time</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {booth.claims.map((c) => {
                                const date = c.claimedAt?.toDate ? c.claimedAt.toDate() : new Date(c.claimedAt);
                                return (
                                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-3 py-2.5 sm:px-6 sm:py-3">
                                      <div className="flex items-center gap-3">
                                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-black ${avatarColors(c.participantName)}`}>{initials(c.participantName)}</div>
                                        <div>
                                          <p className="font-bold text-sm">{c.participantName}</p>
                                          <p className="text-[10px] text-slate-400">ISC-26-{c.participantRegId?.slice(0, 4) || '—'}</p>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-3 py-2.5 sm:px-6 sm:py-3">
                                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase sm:text-[10px] ${sectorTier(c.sector).cls}`}>{sectorTier(c.sector).label}</span>
                                    </td>
                                    <td className="max-w-[7rem] truncate px-3 py-2.5 text-sm font-semibold text-slate-700 sm:max-w-none sm:px-6 sm:py-3 sm:whitespace-normal">
                                      {c.mealName || MEAL_LABELS[c.mealType] || c.mealType}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500 sm:px-6 sm:py-3 sm:text-sm">{date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true })}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                  <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                    <p className="text-xs text-slate-400">
                      Showing day {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, claimsByDayAndBooth.length)} of {claimsByDayAndBooth.length} day{claimsByDayAndBooth.length !== 1 ? 's' : ''}
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-end">
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
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => setActiveTab('dashboard')}
                className="flex items-center gap-2 font-semibold text-slate-600 transition-colors hover:text-blue-600"
              >
                <ArrowLeft size={20} />
                Back to Home
              </button>
              {!profileEditing ? (
                <button
                  type="button"
                  onClick={() => setProfileEditing(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 sm:w-auto"
                >
                  <Edit2 size={16} />
                  Edit Profile
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => setProfileEditing(false)} className="px-4 py-2 rounded-full text-sm font-bold border border-slate-200 text-slate-600 hover:bg-slate-50">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveProfile()}
                    disabled={profileSaving}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-full text-sm font-bold hover:bg-blue-700 disabled:opacity-70"
                  >
                    {profileSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    {profileSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              )}
            </div>
            <h2 className="mb-6 text-xl font-black sm:text-2xl">My Profile</h2>
            <div className="space-y-4">
              <div className="flex flex-col items-stretch gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:p-5">
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
                {profileEditing ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Organization</label>
                      <input value={editSectorOffice} onChange={(e) => setEditSectorOffice(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g. Mcdo" />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Position</label>
                      <input value={editPositionTitle} onChange={(e) => setEditPositionTitle(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g. Cashier" />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Contact</label>
                      <input value={editContactNumber} onChange={(e) => setEditContactNumber(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g. 09568618070" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Booth location details</label>
                      <p className="text-[10px] text-slate-400 mb-1">Where participants find your food booth (you or admin can edit).</p>
                      <textarea
                        value={editBoothLocationDetails}
                        onChange={(e) => setEditBoothLocationDetails(e.target.value)}
                        rows={3}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-orange-500"
                        placeholder="e.g. Hall B, north aisle, stall 12 — near the main entrance"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Booth Description (optional)</label>
                      <textarea value={editBoothDescription} onChange={(e) => setEditBoothDescription(e.target.value)}
                        rows={3} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Brief description of your booth…" />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Booth Website (optional)</label>
                      <input value={editBoothWebsite} onChange={(e) => setEditBoothWebsite(e.target.value)}
                        type="url" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="https://…" />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Products / Services (optional)</label>
                      <input value={editBoothProducts} onChange={(e) => setEditBoothProducts(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g. Burgers, Fries" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Booth background</label>
                      <p className="text-[10px] text-slate-400 mb-2">Wide banner for your booth listing (optional).</p>
                      <div className="flex items-center gap-3 flex-wrap">
                        {editBoothBackgroundUrl && (
                          <img src={editBoothBackgroundUrl} alt="Background" className="h-12 w-20 rounded-xl object-cover border border-slate-200" />
                        )}
                        <label className={`flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold cursor-pointer hover:bg-slate-50 transition-colors ${uploadingBoothBackground ? 'opacity-60 pointer-events-none' : ''}`}>
                          <input type="file" accept="image/*" className="hidden" onChange={handleBoothBackgroundUpload} />
                          {uploadingBoothBackground ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                          {uploadingBoothBackground ? 'Uploading…' : 'Upload'}
                        </label>
                        {editBoothBackgroundUrl ? (
                          <button type="button" onClick={() => setEditBoothBackgroundUrl('')} className="text-xs font-bold text-red-600 hover:underline">Clear</button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {[
                      { label: 'Sector', value: registration?.sector },
                      { label: 'Organization', value: (registrationOverride?.sectorOffice ?? registration?.sectorOffice) as string },
                      { label: 'Position', value: (registrationOverride?.positionTitle ?? registration?.positionTitle) as string },
                      { label: 'Contact', value: (registrationOverride?.contactNumber ?? registration?.contactNumber) as string },
                    ].map(({ label, value }) => (
                      <div key={label}><p className="text-[11px] text-slate-400 mb-0.5">{label}</p><p className="font-semibold text-xs">{value || '—'}</p></div>
                    ))}
                    {((registrationOverride?.boothLocationDetails ?? registration?.boothLocationDetails) as string)?.trim() && (
                      <div className="col-span-2 mt-2 pt-3 border-t border-slate-100">
                        <p className="text-[11px] text-slate-400 mb-0.5">Booth location details</p>
                        <p className="font-semibold text-xs whitespace-pre-wrap">
                          {(registrationOverride?.boothLocationDetails ?? registration?.boothLocationDetails) as string}
                        </p>
                      </div>
                    )}
                    {((registrationOverride?.boothDescription ?? registration?.boothDescription) ||
                      (registrationOverride?.boothWebsite ?? registration?.boothWebsite) ||
                      (registrationOverride?.boothProducts ?? registration?.boothProducts) ||
                      (registrationOverride?.boothBackgroundUrl ?? registration?.boothBackgroundUrl)) && (
                      <div className="col-span-2 mt-2 pt-3 border-t border-slate-100 space-y-2">
                        {(registrationOverride?.boothDescription ?? registration?.boothDescription) && (
                          <div><p className="text-[11px] text-slate-400 mb-0.5">Booth Description</p><p className="font-semibold text-xs">{(registrationOverride?.boothDescription ?? registration?.boothDescription) as string}</p></div>
                        )}
                        {(registrationOverride?.boothWebsite ?? registration?.boothWebsite) && (
                          <div><p className="text-[11px] text-slate-400 mb-0.5">Website</p><a href={(registrationOverride?.boothWebsite ?? registration?.boothWebsite) as string} target="_blank" rel="noopener noreferrer" className="text-blue-600 text-xs font-semibold hover:underline">{(registrationOverride?.boothWebsite ?? registration?.boothWebsite) as string}</a></div>
                        )}
                        {(registrationOverride?.boothProducts ?? registration?.boothProducts) && (
                          <div><p className="text-[11px] text-slate-400 mb-0.5">Products / Services</p><p className="font-semibold text-xs">{(registrationOverride?.boothProducts ?? registration?.boothProducts) as string}</p></div>
                        )}
                        {(registrationOverride?.boothBackgroundUrl ?? registration?.boothBackgroundUrl) && (
                          <div className="mt-2 pt-3 border-t border-slate-100">
                            <p className="text-[11px] text-slate-400 mb-1">Booth background</p>
                            <img src={(registrationOverride?.boothBackgroundUrl ?? registration?.boothBackgroundUrl) as string} alt="Background" className="h-16 w-24 rounded-xl object-cover border border-slate-200" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

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
                    <p
                      className={`text-[11px] font-bold uppercase tracking-wide ${
                        travelAccIncomplete ? 'text-orange-800' : 'text-slate-400'
                      }`}
                    >
                      Flight, travel &amp; accommodation
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingTravel(!editingTravel)}
                    className="text-blue-600 text-xs font-bold flex items-center gap-1 shrink-0"
                  >
                    <Edit2 size={11} /> {editingTravel ? 'Cancel' : 'Edit'}
                  </button>
                </div>
                {travelAccIncomplete && !editingTravel ? (
                  <p className="text-xs font-semibold text-orange-800 mb-2">
                    Please add flight or travel plans and where you are staying (both are required).
                  </p>
                ) : null}
                {editingTravel ? (
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Flight / travel</label>
                      <textarea
                        value={travelDetails}
                        onChange={(e) => setTravelDetails(e.target.value)}
                        rows={3}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm resize-none outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g. Airline, flight numbers, arrival & departure dates/times, airport"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Accommodation</label>
                      <textarea
                        value={accommodationDetails}
                        onChange={(e) => setAccommodationDetails(e.target.value)}
                        rows={3}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm resize-none outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g. Hotel name, check-in/out dates, booking confirmation"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleSaveTravel()}
                      disabled={travelSaving}
                      className="px-5 py-2 bg-blue-600 text-white font-bold rounded-xl text-sm hover:bg-blue-700 disabled:opacity-50"
                    >
                      {travelSaving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2 text-sm">
                    <div>
                      <p className="text-[11px] text-slate-400">Flight / travel</p>
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
    </>
  );

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="relative flex min-h-screen w-full max-w-[100vw] flex-col overflow-x-hidden bg-slate-50 text-slate-900">

      {/* Toast */}
      {toast && (
        <div
          className={`fixed left-3 right-3 top-3 z-50 rounded-2xl px-4 py-3 text-center text-sm font-semibold shadow-lg sm:left-auto sm:right-4 sm:top-4 sm:text-left sm:px-5 ${
            toast.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* ── Mobile shell (participant-style) ───────────────────────── */}
      <div className="relative z-10 flex min-h-[100dvh] flex-col md:hidden max-w-md mx-auto w-full border-x border-slate-200 bg-slate-50 shadow-xl">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/90 p-4 backdrop-blur-md">
          <button
            type="button"
            onClick={() => setMobileDrawerOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <div className="flex min-w-0 flex-1 items-center justify-center gap-2 px-2">
            <img
              src="/iscene.png"
              alt="iSCENE"
              className="h-8 w-8 shrink-0 rounded-full object-contain bg-white p-0.5 shadow-sm"
            />
            <div className="min-w-0 text-center">
              <h1 className="truncate text-base font-black leading-tight tracking-tight text-blue-600">iSCENE 2026</h1>
              <p className="text-[9px] font-bold uppercase tracking-widest opacity-60">Food booth</p>
            </div>
          </div>
          <div ref={mobileBellRef} className="relative shrink-0">
            <button
              type="button"
              onClick={handleBellToggle}
              className="relative flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700"
              aria-label={bellUnreadCount > 0 ? `Notifications, ${bellUnreadCount} unread` : 'Notifications'}
              aria-expanded={bellPanelOpen}
            >
              <Bell size={18} />
              {bellUnreadCount > 0 ? (
                <span
                  className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-orange-500 px-1 text-[10px] font-black leading-none text-white shadow-sm"
                  aria-hidden
                >
                  {bellUnreadCount > 99 ? '99+' : bellUnreadCount}
                </span>
              ) : null}
            </button>
            {foodBoothBellPanel}
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border-2 border-blue-500 ring-2 ring-blue-100 transition-all hover:ring-blue-300"
            aria-label={travelAccIncomplete ? 'Profile, flight and accommodation needed' : 'Profile'}
          >
            {profilePicUrl ? (
              <img src={profilePicUrl} alt={fullName} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-blue-600 text-xs font-black text-white">{myInitials}</div>
            )}
            {travelAccIncomplete ? (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-orange-500 ring-2 ring-white" aria-hidden />
            ) : null}
          </button>
        </header>

        {contentNotify ? (
          <div className="mx-3 mt-2 flex items-start gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2.5 text-orange-900 shadow-sm sm:mx-4">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-orange-600" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wide text-orange-800">Action needed</p>
              <p className="mt-0.5 text-sm font-semibold leading-snug">{contentNotify.msg}</p>
              <button
                type="button"
                className="mt-1.5 text-xs font-bold text-blue-700 hover:underline"
                onClick={() => {
                  setActiveTab('profile');
                  setContentNotify(null);
                }}
              >
                Open Profile
              </button>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-lg p-0.5 text-orange-700 hover:bg-orange-100"
              onClick={() => setContentNotify(null)}
              aria-label="Dismiss notification"
            >
              <X size={16} />
            </button>
          </div>
        ) : null}

        {(activeTab === 'dashboard' || activeTab === 'participants') && (
          <div className="border-b border-slate-100 bg-white px-3 py-2">
            <div className="relative mx-auto max-w-7xl">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch(searchQuery)}
                className="w-full rounded-full border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Search attendee name…"
                aria-label="Search attendee name"
              />
              {searching && (
                <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400" />
              )}
            </div>
          </div>
        )}

        <main className="min-h-0 flex-1 overflow-y-auto px-3 py-4 pb-28 sm:px-4">
          {foodBoothTabPanels}
        </main>

        <nav className="fixed bottom-0 z-30 flex w-full max-w-md items-center justify-between gap-1 border-t border-slate-200 bg-white/95 px-2 pb-5 pt-3 backdrop-blur-md sm:px-4 left-1/2 -translate-x-1/2">
          <div className="flex min-w-0 flex-1 justify-around">
            {(
              [
                { id: 'dashboard' as Tab, label: 'HOME', icon: <Home size={22} /> },
                { id: 'participants' as Tab, label: 'PEOPLE', icon: <Users size={20} /> },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
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
              aria-label="Scan QR code"
            >
              <QrCode size={26} />
            </button>
          </div>

          <div className="flex min-w-0 flex-1 justify-around">
            {(
              [
                { id: 'sessions' as Tab, label: 'SESSIONS', icon: <CalendarDays size={20} /> },
                { id: 'profile' as Tab, label: 'PROFILE', icon: <User size={20} /> },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 ${activeTab === item.id ? 'text-blue-600' : 'text-slate-400'}`}
                aria-label={
                  item.id === 'profile' && travelAccIncomplete
                    ? 'Profile, flight and accommodation needed'
                    : item.label
                }
              >
                <span className="relative inline-flex">
                  {item.icon}
                  {item.id === 'profile' && travelAccIncomplete ? (
                    <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-orange-500 ring-2 ring-white" aria-hidden />
                  ) : null}
                </span>
                <span className="text-center text-[8px] font-black uppercase leading-tight">{item.label}</span>
              </button>
            ))}
          </div>
        </nav>

        {mobileDrawerOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
              onClick={() => setMobileDrawerOpen(false)}
              aria-hidden
            />
            <div className="fixed left-0 top-0 z-50 flex h-full w-72 max-w-[85vw] animate-[slideInLeft_0.22s_ease-out] flex-col bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div className="flex items-center gap-3">
                  <img src="/iscene.png" alt="iSCENE" className="h-9 w-9 rounded-full object-contain bg-white p-0.5 shadow-sm" />
                  <div>
                    <p className="text-sm font-black leading-tight text-blue-600">iSCENE 2026</p>
                    <p className="text-[10px] text-slate-400">Food booth</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500"
                  aria-label="Close menu"
                >
                  <X size={16} />
                </button>
              </div>

              <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
                {(
                  [
                    { id: 'dashboard' as Tab, label: 'Dashboard', icon: <Home size={18} /> },
                    { id: 'participants' as Tab, label: 'Participants', icon: <Users size={18} /> },
                    { id: 'sessions' as Tab, label: 'Sessions', icon: <CalendarDays size={18} /> },
                    { id: 'main-hall' as Tab, label: 'Main Hall check-in', icon: <QrCode size={18} /> },
                    { id: 'articles' as Tab, label: 'Articles', icon: <Newspaper size={18} /> },
                    { id: 'reports' as Tab, label: 'Reports', icon: <BarChart3 size={18} /> },
                    { id: 'profile' as Tab, label: 'Profile', icon: <User size={18} /> },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileDrawerOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
                      activeTab === item.id ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {item.icon}
                    <span className="flex-1 text-left">{item.label}</span>
                    {item.id === 'profile' && travelAccIncomplete ? (
                      <span
                        className={`text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center ${
                          activeTab === item.id ? 'bg-white/20 text-white' : 'bg-orange-100 text-orange-800'
                        }`}
                      >
                        !
                      </span>
                    ) : null}
                  </button>
                ))}
              </nav>

              <div className="space-y-1 px-3 pb-3">
                <button
                  type="button"
                  onClick={() => {
                    setScanModal(true);
                    setMobileDrawerOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  <QrCode size={18} />
                  <span>Scan QR Code</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIdModal(true);
                    setMobileDrawerOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  <CreditCard size={18} />
                  <span>My Digital ID</span>
                </button>
              </div>

              <div className="mt-auto border-t border-slate-100 p-4">
                <div className="mb-3 flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-100">
                    {profilePicUrl ? (
                      <img src={profilePicUrl} alt={fullName} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-sm font-black text-blue-600">{myInitials}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-800">{fullName}</p>
                    <p className="truncate text-[11px] text-slate-500">Food booth operator</p>
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

      {/* ── Desktop top navigation ─────────────────────────────────── */}
      <header className="sticky top-0 z-40 hidden border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur-md md:block sm:px-5 md:px-10 md:py-4">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 gap-y-3">
          <div className="flex min-w-0 flex-1 items-center gap-4 lg:gap-8">
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <img src="/iscene.png" alt="iSCENE 2026" className="h-8 w-auto object-contain sm:h-9" />
            </div>
            <nav className="hidden min-w-0 flex-1 items-center gap-4 text-sm font-medium lg:flex xl:gap-6">
              {([
                { id: 'dashboard' as Tab, label: 'Dashboard' },
                { id: 'participants' as Tab, label: 'Participants' },
                { id: 'sessions' as Tab, label: 'Sessions' },
                { id: 'main-hall' as Tab, label: 'Main Hall' },
                { id: 'articles' as Tab, label: 'Articles' },
                { id: 'reports' as Tab, label: 'Reports' },
              ]).map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={`shrink-0 pb-1 transition-colors ${
                    activeTab === id
                      ? 'border-b-2 border-blue-600 font-semibold text-blue-600'
                      : 'text-slate-500 hover:text-blue-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3 md:gap-4">
            <div className="relative hidden min-w-0 sm:block">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch(searchQuery)}
                className="w-40 rounded-full bg-slate-100 py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 md:w-56"
                placeholder="Search name…"
                aria-label="Search attendee name"
              />
              {searching && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400" />}
            </div>
            <button
              type="button"
              onClick={() => setScanModal(true)}
              className="flex items-center gap-1.5 rounded-full bg-blue-600 px-3 py-2 text-xs font-bold text-white shadow-md shadow-blue-200 transition-colors hover:bg-blue-700 sm:gap-2 sm:px-4 sm:text-sm"
              aria-label="Scan QR code"
            >
              <QrCode size={16} className="shrink-0" />
              <span className="hidden sm:inline">Scan QR</span>
            </button>
            <div ref={desktopBellRef} className="relative hidden shrink-0 sm:block">
              <button
                type="button"
                onClick={handleBellToggle}
                className="relative flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700 sm:h-10 sm:w-10"
                aria-label={bellUnreadCount > 0 ? `Notifications, ${bellUnreadCount} unread` : 'Notifications'}
                aria-expanded={bellPanelOpen}
              >
                <Bell size={18} />
                {bellUnreadCount > 0 ? (
                  <span
                    className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-orange-500 px-1 text-[10px] font-black leading-none text-white shadow-sm"
                    aria-hidden
                  >
                    {bellUnreadCount > 99 ? '99+' : bellUnreadCount}
                  </span>
                ) : null}
              </button>
              {foodBoothBellPanel}
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border-2 border-blue-500 ring-2 ring-blue-100 transition-all hover:ring-blue-300 sm:h-10 sm:w-10"
              aria-label={travelAccIncomplete ? 'Profile, flight and accommodation needed' : 'Profile'}
            >
              {profilePicUrl ? (
                <img src={profilePicUrl} alt={fullName} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-blue-600 text-xs font-black text-white">{myInitials}</div>
              )}
              {travelAccIncomplete ? (
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-orange-500 ring-2 ring-white" aria-hidden />
              ) : null}
            </button>
          </div>
        </div>
      </header>


      
      <main className="hidden md:block mx-auto w-full min-w-0 max-w-7xl flex-1 px-3 py-4 sm:px-5 sm:py-6 md:px-10 md:py-8">
        {contentNotify ? (
          <div className="sticky top-0 z-10 mx-0 mb-4 flex items-start gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-orange-900 shadow-sm">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-orange-600" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wide text-orange-800">Action needed</p>
              <p className="mt-0.5 text-sm font-semibold leading-snug">{contentNotify.msg}</p>
              <button
                type="button"
                className="mt-1.5 text-xs font-bold text-blue-700 hover:underline"
                onClick={() => {
                  setActiveTab('profile');
                  setContentNotify(null);
                }}
              >
                Open Profile
              </button>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-lg p-1 text-orange-700 hover:bg-orange-100"
              onClick={() => setContentNotify(null)}
              aria-label="Dismiss notification"
            >
              <X size={18} />
            </button>
          </div>
        ) : null}
        {foodBoothTabPanels}
      </main>

      <footer className="hidden border-t border-slate-200 px-4 py-4 text-center text-xs text-slate-400 sm:px-8 md:block md:px-10 md:py-5">
        © 2026 iSCENE International Conference · Food Booth Management System
      </footer>

      {/* ── QR Scanner ───────────────────────────────────────────────── */}
      {scanModal && (
        <QrScanModal
          subtitle="Guest Digital ID — or Main Hall entrance QR for your time-in"
          onClose={() => setScanModal(false)}
          onResult={handleScanResult}
        />
      )}

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
              <p className="text-xs text-slate-500 mt-0.5">{(registrationOverride?.sectorOffice ?? registration?.sectorOffice) || 'Food Booth Operator'}</p>
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
