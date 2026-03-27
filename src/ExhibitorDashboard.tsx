import React from 'react';
import {
  Store,
  FolderOpen,
  CreditCard,
  User,
  Upload,
  Download,
  Trash2,
  X,
  ChevronRight,
  CheckCircle2,
  Loader2,
  FileText,
  Image as ImageIcon,
  Film,
  Info,
  Plus,
  Edit2,
  Mail,
  LogOut,
  ExternalLink,
  Menu,
  Copy,
  ClipboardList,
  Link2,
  QrCode,
  UtensilsCrossed,
  Utensils,
  Clock,
  Home,
  Bell,
  Newspaper,
  Zap,
  AlertTriangle,
} from 'lucide-react';
import { User as FirebaseUser, sendPasswordResetEmail } from 'firebase/auth';
import {
  collection,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  Timestamp,
  updateDoc,
  onSnapshot,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, auth, storage } from './firebase';
import { EXHIBITOR_BOOTH_CATEGORIES, exhibitorCategoryLabel } from './exhibitorBoothCategory';
import { QrScanModal } from './QrScanModal';
import { getEntranceCalendarDateKey, isEntranceCheckedInForDateKey } from './entranceCheckInDay';
import { registrationSectorEligibleForMeal } from './mealEligibility';
import { MealEntitlementCard } from './MealEntitlementCard';
import { ArticleBrowsePanel } from './ArticleBrowsePanel';
import type { ArticleDoc } from './ArticlesManager';
import { useArticleCategoryNames } from './useArticleCategoryNames';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type ExhibitorTab = 'home' | 'my-booth' | 'materials' | 'meals' | 'main-hall' | 'articles' | 'digital-id' | 'profile';

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

type FoodClaim = { id: string; mealId: string; claimedAt: unknown };

const TRAVEL_ACCOMMODATION_REMINDER_MS = 3 * 60 * 60 * 1000;

const MEAL_LABELS: Record<string, string> = {
  breakfast: '🌅 Breakfast',
  snacks: '🍪 Snacks (AM)',
  lunch: '🍱 Lunch',
  snacks_pm: '🥤 Snacks (PM)',
  dinner: '🍽️ Dinner',
  kit: 'Kit',
};

type BoothMaterial = {
  id: string;
  uid: string;
  fileName: string;
  materialName?: string;
  storagePath: string;
  downloadUrl: string;
  fileType: string;
  fileSizeBytes: number;
  createdAt: any;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(type: string) {
  if (type.startsWith('image/')) return <ImageIcon size={18} className="text-blue-600" />;
  if (type.startsWith('video/')) return <Film size={18} className="text-purple-600" />;
  if (type === 'application/pdf') return <FileText size={18} className="text-red-600" />;
  return <FileText size={18} className="text-slate-500" />;
}
function fileIconBg(type: string) {
  if (type.startsWith('image/')) return 'bg-blue-100';
  if (type.startsWith('video/')) return 'bg-purple-100';
  if (type === 'application/pdf') return 'bg-red-100';
  return 'bg-slate-100';
}

function trimUrl(u: unknown): string {
  return typeof u === 'string' ? u.trim() : '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
type Props = { user: FirebaseUser; registration: any; onSignOut: () => Promise<void> };

export function ExhibitorDashboard({ user, registration, onSignOut }: Props) {
  const fullName = (registration?.fullName as string) || user.email || 'Exhibitor';
  const firstName = fullName.split(' ')[0] || 'Exhibitor';
  const orgName = (registration?.sectorOffice as string) || 'Technology Booth';
  const profilePicUrl = (registration?.profilePictureUrl as string | undefined) || null;
  const initials = fullName.split(' ').map((p: string) => p[0]).join('').toUpperCase().slice(0, 2);
  const approvalStatus = (registration?.status as string) || 'pending';
  const boothNumber = `#${registration?.id?.slice(0, 6).toUpperCase() || 'TBD'}`;

  // ── Tabs ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = React.useState<ExhibitorTab>('home');
  const [mobileDrawerOpen, setMobileDrawerOpen] = React.useState(false);
  const [bellPanelOpen, setBellPanelOpen] = React.useState(false);
  const mobileBellRef = React.useRef<HTMLDivElement | null>(null);

  // ── Articles ─────────────────────────────────────────────────────────
  const [exhibitorArticles, setExhibitorArticles] = React.useState<ArticleDoc[]>([]);
  const [articlesLoading, setArticlesLoading] = React.useState(true);
  const [articleSearchQuery, setArticleSearchQuery] = React.useState('');
  const [articleCategoryFilter, setArticleCategoryFilter] = React.useState<string>('all');
  const articleCategoriesState = useArticleCategoryNames();

  // ── Materials ─────────────────────────────────────────────────────────
  const [materials, setMaterials] = React.useState<BoothMaterial[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [uploading, setUploading] = React.useState(false);
  const [editingMaterialId, setEditingMaterialId] = React.useState<string | null>(null);
  const [editingMaterialName, setEditingMaterialName] = React.useState('');

  // ── Booth edit ────────────────────────────────────────────────────────
  const [editing, setEditing] = React.useState(false);
  const [boothDesc, setBoothDesc] = React.useState((registration?.boothDescription as string) || '');
  const [boothWebsite, setBoothWebsite] = React.useState((registration?.boothWebsite as string) || '');
  const [boothProducts, setBoothProducts] = React.useState((registration?.boothProducts as string) || '');
  const [boothBackgroundUrl, setBoothBackgroundUrl] = React.useState((registration?.boothBackgroundUrl as string) || '');
  const [boothCategory, setBoothCategory] = React.useState((registration?.boothCategory as string) || '');
  const [boothCategoryOther, setBoothCategoryOther] = React.useState((registration?.boothCategoryOther as string) || '');
  const [boothLocationDetails, setBoothLocationDetails] = React.useState((registration?.boothLocationDetails as string) || '');
  const [uploadingBoothBackground, setUploadingBoothBackground] = React.useState(false);
  const [savingBooth, setSavingBooth] = React.useState(false);

  // ── ID modal ──────────────────────────────────────────────────────────
  const [idModal, setIdModal] = React.useState(false);

  // ── Profile / travel ──────────────────────────────────────────────────
  const [pwResetSent, setPwResetSent] = React.useState(false);
  const [editingTravel, setEditingTravel] = React.useState(false);
  const [travelDetails, setTravelDetails] = React.useState((registration?.travelDetails as string) || '');
  const [accommodationDetails, setAccommodationDetails] = React.useState((registration?.accommodationDetails as string) || '');
  const [travelSaving, setTravelSaving] = React.useState(false);

  type InAppNotifyType = 'travel';
  type InAppNotificationItem = { id: string; msg: string; type: InAppNotifyType; read: boolean; createdAt: number };
  const [inAppNotifications, setInAppNotifications] = React.useState<InAppNotificationItem[]>([]);
  const [contentNotify, setContentNotify] = React.useState<{ msg: string; type: 'travel' } | null>(null);

  const pushInAppNotification = React.useCallback((msg: string, type: InAppNotifyType) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    setInAppNotifications((prev) => [{ id, msg, type, read: false, createdAt: Date.now() }, ...prev].slice(0, 40));
  }, []);

  const notifyCategoryLabel = (_t: InAppNotifyType) => 'Travel & accommodation';

  const bellUnreadCount = inAppNotifications.filter((n) => !n.read).length;

  const travelAccIncomplete =
    !String(travelDetails || '').trim() || !String(accommodationDetails || '').trim();

  // ── Meals & main hall ───────────────────────────────────────────────────
  const [meals, setMeals] = React.useState<MealWindow[]>([]);
  const [foodClaims, setFoodClaims] = React.useState<FoodClaim[]>([]);
  const [boothRegs, setBoothRegs] = React.useState<{ id?: string; uid?: string; fullName?: string; boothLocationDetails?: string; status?: string }[]>([]);
  const [claimClockTick, setClaimClockTick] = React.useState(() => Date.now());
  const [scanModal, setScanModal] = React.useState(false);
  const [scanToast, setScanToast] = React.useState<string | null>(null);
  const [entranceAttendanceRaw, setEntranceAttendanceRaw] = React.useState<Record<string, unknown> | null>(null);
  const [entranceTodayKey, setEntranceTodayKey] = React.useState(() => getEntranceCalendarDateKey());

  // ── Toast ─────────────────────────────────────────────────────────────
  const [toast, setToast] = React.useState<string | null>(null);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 4000); };

  // ── Derived ───────────────────────────────────────────────────────────
  const digitalIdQrData = `https://iscene.app/verify?uid=${user.uid}&name=${encodeURIComponent(fullName)}&role=exhibitor`;
  const digitalIdQrImg = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(digitalIdQrData)}`;
  const idNumber = user.uid.slice(0, 8).toUpperCase();
  const sectorLabel = (registration?.sector as string) || 'Exhibitor (Booth)';
  const bgUrl = trimUrl(boothBackgroundUrl);
  const registrationId = registration?.id as string | undefined;
  const exhibitorSector = (registration?.sector as string) || '';

  const hasEntryAttendance = React.useMemo(
    () => isEntranceCheckedInForDateKey(entranceAttendanceRaw, entranceTodayKey),
    [entranceAttendanceRaw, entranceTodayKey],
  );

  const eligibleMeals = React.useMemo(
    () => meals.filter((m) => registrationSectorEligibleForMeal(m, registrationId, exhibitorSector)),
    [meals, registrationId, exhibitorSector],
  );
  const hasClaimedMeal = (mealId: string) => foodClaims.some((c) => c.mealId === mealId);
  const mealsBadgeDisplay = eligibleMeals.filter((m) => !hasClaimedMeal(m.id)).length;

  React.useEffect(() => {
    let mealsAck: string | null = null;
    let storageError: string | null = null;
    try {
      mealsAck = localStorage.getItem(`iscene_${user.uid}_badgeAck_exhibitor_meals`);
    } catch (err) {
      storageError = err instanceof Error ? err.message : 'localStorage_access_error';
    }
    // #region agent log
    fetch('http://127.0.0.1:7397/ingest/56484124-7df3-4537-80fa-738427537570',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ec45ad'},body:JSON.stringify({sessionId:'ec45ad',runId:'pre-fix-quick-actions',hypothesisId:'H2',location:'src/ExhibitorDashboard.tsx:quickActionBadges',message:'Exhibitor quick-action meals badge source vs persisted ack',data:{eligibleMeals:eligibleMeals.length,unclaimedMeals:mealsBadgeDisplay,hasMealsAck:mealsAck !== null,storageError},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  }, [user.uid, eligibleMeals.length, mealsBadgeDisplay]);

  const boothChecklist = [
    { done: !!bgUrl, label: 'Banner background', hint: 'Wide image participants see at the top' },
    { done: !!boothDesc.trim(), label: 'Booth description', hint: 'Tell visitors what you offer' },
    { done: materials.length > 0, label: 'At least one material', hint: 'Brochures, PDFs, or media' },
    { done: !!boothWebsite.trim(), label: 'Website link', hint: 'Optional but recommended' },
  ];
  const checklistDone = boothChecklist.filter((c) => c.done).length;

  const copyVerifyLink = async () => {
    try {
      await navigator.clipboard.writeText(digitalIdQrData);
      showToast('✅ Verification link copied to clipboard.');
    } catch {
      showToast('❌ Could not copy. Copy manually from your browser.');
    }
  };

  // ── Load data ─────────────────────────────────────────────────────────
  React.useEffect(() => {
    setBoothCategory((registration?.boothCategory as string) || '');
    setBoothCategoryOther((registration?.boothCategoryOther as string) || '');
    setBoothLocationDetails((registration?.boothLocationDetails as string) || '');
  }, [registration?.id, registration?.boothCategory, registration?.boothCategoryOther, registration?.boothLocationDetails]);

  React.useEffect(() => {
    setTravelDetails((registration?.travelDetails as string) || '');
    setAccommodationDetails((registration?.accommodationDetails as string) || '');
  }, [registration?.id, registration?.travelDetails, registration?.accommodationDetails]);

  React.useEffect(() => {
    const tick = () => setEntranceTodayKey(getEntranceCalendarDateKey());
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    setArticlesLoading(true);
    getDocs(query(collection(db, 'articles'), orderBy('createdAt', 'desc')))
      .then((snap) => {
        if (cancelled) return;
        const list: ArticleDoc[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ArticleDoc, 'id'>) }));
        setExhibitorArticles(list);
      })
      .catch(() => {
        if (!cancelled) setExhibitorArticles([]);
      })
      .finally(() => {
        if (!cancelled) setArticlesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!bellPanelOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (mobileBellRef.current?.contains(t)) return;
      setBellPanelOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [bellPanelOpen]);

  React.useEffect(() => {
    const refAtt = doc(db, 'attendance', `${user.uid}_entrance`);
    const unsub = onSnapshot(
      refAtt,
      (snap) => setEntranceAttendanceRaw(snap.exists() ? (snap.data() as Record<string, unknown>) : null),
      () => setEntranceAttendanceRaw(null),
    );
    return () => unsub();
  }, [user.uid]);

  React.useEffect(() => {
    const id = window.setInterval(() => setClaimClockTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

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
    (async () => {
      setLoading(true);
      try {
        const [matSnap, mealsSnap, claimsSnap] = await Promise.all([
          getDocs(query(collection(db, 'presenterMaterials'), where('uid', '==', user.uid), orderBy('createdAt', 'desc'))),
          getDocs(query(collection(db, 'meals'), orderBy('createdAt', 'desc'))),
          getDocs(query(collection(db, 'foodClaims'), where('participantUid', '==', user.uid))),
        ]);
        if (!cancelled) {
          setMaterials(matSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BoothMaterial, 'id'>) })));
          setMeals(mealsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MealWindow, 'id'>) })));
          setFoodClaims(
            claimsSnap.docs.map((d) => ({
              id: d.id,
              mealId: (d.data() as { mealId?: string }).mealId ?? '',
              claimedAt: (d.data() as { claimedAt?: unknown }).claimedAt,
            })),
          );
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user.uid]);

  React.useEffect(() => {
    const unsubMeals = onSnapshot(
      query(collection(db, 'meals'), orderBy('createdAt', 'desc')),
      (snap) => setMeals(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MealWindow, 'id'>) }))),
      () => {},
    );
    const unsubClaims = onSnapshot(
      query(collection(db, 'foodClaims'), where('participantUid', '==', user.uid)),
      (snap) =>
        setFoodClaims(
          snap.docs.map((d) => ({
            id: d.id,
            mealId: (d.data() as { mealId?: string }).mealId ?? '',
            claimedAt: (d.data() as { claimedAt?: unknown }).claimedAt,
          })),
        ),
      () => {},
    );
    return () => {
      unsubMeals();
      unsubClaims();
    };
  }, [user.uid]);

  React.useEffect(() => {
    if (loading) return;
    const t = String(travelDetails || '').trim();
    const a = String(accommodationDetails || '').trim();
    const storageKey = `iscene_${user.uid}_exhibitor_lastTravelAccReminder`;
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

  const handleBellToggle = React.useCallback(() => {
    setBellPanelOpen((open) => {
      if (open) return false;
      setInAppNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      return true;
    });
  }, []);

  const handleSaveTravel = async () => {
    if (!registration?.id) return;
    setTravelSaving(true);
    try {
      await updateDoc(doc(db, 'registrations', registration.id), { travelDetails, accommodationDetails });
      setEditingTravel(false);
      showToast('✅ Travel details saved.');
    } catch {
      showToast('❌ Could not save. Try again.');
    } finally {
      setTravelSaving(false);
    }
  };

  // ── Upload ────────────────────────────────────────────────────────────
  const handleUpload = async (files: File[]) => {
    const valid = files.filter((f) => f.size <= 200 * 1024 * 1024);
    if (valid.length === 0) { showToast('❌ No valid files (max 200 MB each).'); return; }
    if (valid.length < files.length) showToast(`⚠️ Skipped ${files.length - valid.length} file(s) over 200 MB.`);
    setUploading(true);
    let successCount = 0;
    try {
      for (const file of valid) {
        const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const storagePath = `presenterMaterials/${user.uid}/${Date.now()}_${safeName}`;
        const snap = await uploadBytes(ref(storage, storagePath), file);
        const downloadUrl = await getDownloadURL(snap.ref);
        const materialName = file.name;
        const docRef = await addDoc(collection(db, 'presenterMaterials'), {
          uid: user.uid, presenterName: fullName,
          fileName: file.name, materialName, storagePath, downloadUrl,
          fileType: file.type, fileSizeBytes: file.size,
          status: 'uploaded', createdAt: Timestamp.now(),
        });
        setMaterials((prev) => [{ id: docRef.id, uid: user.uid, fileName: file.name, materialName, storagePath, downloadUrl, fileType: file.type, fileSizeBytes: file.size, createdAt: Timestamp.now() }, ...prev]);
        successCount++;
      }
      showToast(successCount > 1 ? `✅ ${successCount} files uploaded!` : '✅ File uploaded successfully!');
    } catch { showToast('❌ Upload failed. Please try again.'); }
    finally { setUploading(false); }
  };

  const handleMaterialNameUpdate = async (mat: BoothMaterial, newName: string) => {
    const name = (newName || mat.fileName).trim();
    if (name === (mat.materialName ?? mat.fileName)) return;
    try {
      await updateDoc(doc(db, 'presenterMaterials', mat.id), { materialName: name });
      setMaterials((prev) => prev.map((m) => m.id === mat.id ? { ...m, materialName: name } : m));
      showToast('✅ Material name updated.');
    } catch { showToast('❌ Failed to update name.'); }
  };

  const handleDelete = async (mat: BoothMaterial) => {
    try {
      await deleteDoc(doc(db, 'presenterMaterials', mat.id));
      try { await deleteObject(ref(storage, mat.storagePath)); } catch {}
      setMaterials((prev) => prev.filter((m) => m.id !== mat.id));
      showToast('✅ File deleted.');
    } catch { showToast('❌ Failed to delete file.'); }
  };

  const handleSaveBooth = async () => {
    if (!registration?.id) return;
    if (boothCategory === 'Other' && !boothCategoryOther.trim()) {
      showToast('❌ Please describe your category when you choose Other.');
      return;
    }
    setSavingBooth(true);
    try {
      const boothImageUrlCleared = '';
      await updateDoc(doc(db, 'registrations', registration.id), {
        boothDescription: boothDesc, boothWebsite, boothProducts,
        boothImageUrl: boothImageUrlCleared, boothBackgroundUrl: boothBackgroundUrl.trim() || '',
        boothCategory: boothCategory.trim() || '',
        boothCategoryOther: boothCategory === 'Other' ? boothCategoryOther.trim() : '',
        boothLocationDetails: boothLocationDetails.trim() || '',
      });
      setEditing(false);
      showToast('✅ Booth profile updated.');
    } catch { showToast('❌ Failed to save. Try again.'); }
    finally { setSavingBooth(false); }
  };

  const handleBoothBackgroundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) { showToast('Please select an image file.'); return; }
    setUploadingBoothBackground(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const path = `boothBackgrounds/${user.uid}/${Date.now()}_${safeName}`;
      const snap = await uploadBytes(ref(storage, path), file, { contentType: file.type || 'image/jpeg' });
      const url = await getDownloadURL(snap.ref);
      setBoothBackgroundUrl(url);
      showToast('✅ Background uploaded. Click Save to keep.');
    } catch { showToast('❌ Upload failed. Try a smaller image (<5MB).'); }
    finally { setUploadingBoothBackground(false); e.target.value = ''; }
  };

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
        setScanToast('✅ Main Hall check-in recorded!');
        setScanModal(false);
      } else if (type === 'room' && id) {
        setScanToast('❌ Exhibitors check in only at the Main Hall. Scan the entrance QR, not a breakout room.');
        setScanModal(false);
      } else {
        setScanToast('❌ Unrecognized QR. Use the Main Hall / entrance QR.');
        setScanModal(false);
      }
    } catch (err) {
      console.error('Scan error:', err);
      setScanToast('❌ Could not process scan. Try again.');
      setScanModal(false);
    }
    setTimeout(() => setScanToast(null), 4000);
  };

  // ── Sidebar nav item ──────────────────────────────────────────────────
  const NavItem = ({
    tab,
    icon,
    label,
    badge,
  }: {
    tab: ExhibitorTab;
    icon: React.ReactNode;
    label: string;
    badge?: number;
  }) => (
    <button
      type="button"
      onClick={() => {
        setActiveTab(tab);
        if (tab === 'digital-id') setIdModal(true);
      }}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-full text-sm font-medium transition-all ${
        activeTab === tab && tab !== 'digital-id'
          ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
          : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {badge != null && badge > 0 ? (
        <span
          className={`min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full text-[10px] font-black shrink-0 ${
            activeTab === tab && tab !== 'digital-id' ? 'bg-white/25 text-white' : 'bg-orange-500 text-white'
          }`}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </button>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-600" size={36} />
      </div>
    );
  }

  const exhibitorBellPanel = bellPanelOpen ? (
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

  const renderExhibitorTabPanels = () => (
    <>
        {/* ══════════════ HOME (mobile-first welcome) ══════════════ */}
        {activeTab === 'home' && (
          <>
            <div className="px-4 pt-5 pb-2">
              <h2 className="text-xl font-black tracking-tight">Welcome, {firstName}!</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {hasEntryAttendance
                  ? "You're checked in at the Main Hall · enjoy the event!"
                  : 'Scan the Main Hall entrance QR when you arrive.'}
              </p>
            </div>
            <div className="flex gap-2 px-4 py-3 overflow-x-auto no-scrollbar">
              {[
                { label: 'Registered', done: true },
                { label: 'Approved', done: approvalStatus === 'approved' },
                { label: 'Checked In', done: hasEntryAttendance },
              ].map(({ label, done }) => (
                <div
                  key={label}
                  className={`shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
                    done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {done ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                  {label}
                </div>
              ))}
            </div>
            {travelAccIncomplete ? (
              <button
                type="button"
                onClick={() => setActiveTab('profile')}
                className="mx-4 mb-3 flex w-[calc(100%-2rem)] items-start gap-2 rounded-2xl border-2 border-orange-300 bg-orange-50 px-4 py-3 text-left shadow-sm active:scale-[0.99] transition-transform"
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
            <div className="px-4 pb-4">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1">
                <Zap size={12} /> Quick Actions
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { icon: <QrCode size={20} className="text-blue-600" />, label: 'Scan QR', bg: 'bg-blue-50', action: () => setScanModal(true) },
                  { icon: <CreditCard size={20} className="text-indigo-600" />, label: 'My ID', bg: 'bg-indigo-50', action: () => setIdModal(true) },
                  {
                    icon: <Store size={20} className="text-emerald-600" />,
                    label: 'Booths',
                    bg: 'bg-emerald-50',
                    action: () => setActiveTab('my-booth'),
                  },
                  {
                    icon: <Utensils size={20} className="text-orange-500" />,
                    label: 'Meals',
                    bg: 'bg-orange-50',
                    action: () => setActiveTab('meals'),
                    badge: mealsBadgeDisplay,
                  },
                  {
                    icon: <Newspaper size={20} className="text-rose-500" />,
                    label: 'Articles',
                    bg: 'bg-rose-50',
                    action: () => setActiveTab('articles'),
                  },
                  {
                    icon: <FolderOpen size={20} className="text-violet-600" />,
                    label: 'Materials',
                    bg: 'bg-violet-50',
                    action: () => setActiveTab('materials'),
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
            </div>
            <div className="px-4 pb-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold text-slate-800">Your booth</p>
                <button type="button" onClick={() => setActiveTab('my-booth')} className="text-xs font-semibold text-blue-600">
                  Manage →
                </button>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('my-booth')}
                className="w-full text-left rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md active:scale-[0.99] transition-all flex items-center gap-3 p-3 sm:p-4"
              >
                <div
                  className={`h-[4.5rem] w-[4.5rem] sm:h-24 sm:w-24 shrink-0 rounded-xl overflow-hidden flex items-center justify-center ${
                    bgUrl ? 'bg-slate-50' : 'bg-gradient-to-br from-blue-100 via-blue-50 to-slate-100'
                  }`}
                >
                  {bgUrl ? (
                    <img
                      src={bgUrl}
                      alt=""
                      className="max-h-full max-w-full h-full w-full object-contain object-center p-1.5"
                    />
                  ) : (
                    <Store size={32} className="text-blue-300" />
                  )}
                </div>
                <div className="flex-1 min-w-0 flex items-center justify-between gap-3">
                  <div className="min-w-0 py-0.5">
                    <p className="text-sm font-bold text-slate-800 truncate">{orgName || fullName}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Booth {boothNumber}</p>
                    <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{boothDesc || 'Tap to edit your booth profile and uploads.'}</p>
                  </div>
                  <ChevronRight size={18} className="text-slate-300 shrink-0 self-center" aria-hidden />
                </div>
              </button>
            </div>
            {/* Desktop home: extra quick row */}
            <div className="hidden md:block px-4 sm:px-6 lg:px-10 pb-10 max-w-5xl mx-auto w-full">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-bold text-slate-700 mb-3">Exhibitor tools</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('main-hall')}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50"
                  >
                    <QrCode size={16} className="text-blue-600" /> Main Hall check-in
                  </button>
                  <button
                    type="button"
                    onClick={copyVerifyLink}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50"
                  >
                    <Copy size={16} /> Copy verify link
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ══════════════ MY BOOTH ══════════════ */}
        {activeTab === 'my-booth' && (
          <div className="max-w-5xl mx-auto w-full p-4 sm:p-6 md:p-8 lg:p-12 space-y-6 md:space-y-8">
            <div className="grid grid-cols-1 gap-6 md:gap-8 xl:grid-cols-2">
              {/* LEFT: What participants see (matches participant app: background banner + profile avatar) */}
              <section>
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">What Participants See</h3>
                <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className={`h-32 w-full flex items-center justify-center overflow-hidden shrink-0 ${bgUrl ? '' : 'bg-gradient-to-br from-blue-100 via-blue-50 to-slate-100'}`}>
                    {bgUrl ? (
                      <img src={bgUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Store size={48} className="text-blue-300" />
                    )}
                  </div>
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-blue-100 flex items-center justify-center text-xs font-black text-blue-600 shrink-0">
                        {profilePicUrl ? (
                          <img src={profilePicUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          initials
                        )}
                      </div>
                      <div>
                        <p className="font-bold text-sm">{fullName}</p>
                        <p className="text-[10px] text-slate-400">{sectorLabel}</p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 max-h-14 overflow-y-auto mb-2 pr-0.5 leading-relaxed [scrollbar-width:thin]">{orgName || 'Event booth participant'}</p>
                    {boothDesc ? <p className="text-xs text-slate-600 max-h-16 overflow-y-auto mb-2 pr-0.5 [scrollbar-width:thin]">{boothDesc}</p> : null}
                    <div className="flex items-center justify-between flex-wrap gap-1">
                      <span className="text-[11px] text-slate-400">Booth {boothNumber}</span>
                      <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Approved</span>
                    </div>
                    {materials.length > 0 && (
                      <p className="text-[11px] text-slate-400 mt-2">{materials.length} material{materials.length !== 1 ? 's' : ''} available to download</p>
                    )}
                  </div>
                </div>
              </section>

              {/* RIGHT: Edit your booth */}
              <section>
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Edit Your Booth</h3>
                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-black text-base">Booth Profile</span>
                    <button type="button" onClick={() => setEditing(true)}
                      className="flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 transition-colors">
                      <Edit2 size={14} /> Edit Profile
                    </button>
                  </div>
                  <div className="space-y-3 text-sm">
                    <div><span className="text-[11px] text-slate-400 block">Organization</span><p className="font-semibold">{orgName || '—'}</p></div>
                    <div><span className="text-[11px] text-slate-400 block">Booth Number</span><p className="font-bold text-blue-600">{boothNumber}</p></div>
                    {boothLocationDetails?.trim() ? (
                      <div><span className="text-[11px] text-slate-400 block">Booth location</span><p className="text-slate-700 text-xs whitespace-pre-wrap">{boothLocationDetails}</p></div>
                    ) : null}
                    <div><span className="text-[11px] text-slate-400 block">Status</span><p className={`font-bold ${approvalStatus === 'approved' ? 'text-emerald-600' : 'text-amber-600'}`}>{approvalStatus === 'approved' ? 'Approved' : 'Pending'}</p></div>
                    {(boothDesc || boothProducts || boothWebsite) && (
                      <>
                        {boothDesc && <div><span className="text-[11px] text-slate-400 block">Description</span><p className="text-slate-700 line-clamp-2">{boothDesc}</p></div>}
                        {boothProducts && <div><span className="text-[11px] text-slate-400 block">Products / Services</span><p className="text-slate-700">{boothProducts}</p></div>}
                        {boothWebsite && <div><span className="text-[11px] text-slate-400 block">Website</span><a href={boothWebsite} target="_blank" rel="noopener noreferrer" className="text-blue-600 flex items-center gap-1 hover:underline">{boothWebsite} <ExternalLink size={11} /></a></div>}
                      </>
                    )}
                  </div>
                  <div className="mt-5 pt-5 border-t border-slate-100">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-sm text-slate-600">Materials ({materials.length})</span>
                      <div className="flex items-center gap-2">
                        <label className={`flex cursor-pointer items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 transition-colors ${uploading ? 'opacity-70 pointer-events-none' : ''}`}>
                          <input type="file" className="hidden" accept="image/*,video/*,.pdf" multiple
                            onChange={(e) => { const files = Array.from(e.target.files || []) as File[]; if (files.length) { handleUpload(files); e.target.value = ''; } }} />
                          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                          {uploading ? 'Uploading…' : 'Upload'}
                        </label>
                        <button type="button" onClick={() => setActiveTab('materials')} className="text-blue-600 text-sm font-bold hover:underline">
                          View all
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {/* Quick actions */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Quick actions</h3>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <button type="button" onClick={copyVerifyLink} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-100 transition-colors">
                  <Copy size={16} className="text-blue-600" /> Copy verify link
                </button>
                <button type="button" onClick={() => setIdModal(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 transition-colors">
                  <CreditCard size={16} /> Open digital ID
                </button>
                <button type="button" onClick={() => setActiveTab('meals')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-900 hover:bg-amber-100 transition-colors">
                  <UtensilsCrossed size={16} /> Meals & entitlements
                </button>
                <button type="button" onClick={() => setActiveTab('main-hall')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50 transition-colors">
                  <QrCode size={16} className="text-blue-600" /> Main Hall check-in
                </button>
                <button type="button" onClick={() => setActiveTab('materials')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-bold text-blue-700 hover:bg-blue-100 transition-colors">
                  <FolderOpen size={16} /> Manage materials
                </button>
                <a href={digitalIdQrData} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors">
                  <Link2 size={16} className="text-slate-500" /> Open verify URL
                </a>
              </div>
            </section>

            {/* Booth readiness */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <ClipboardList size={20} className="text-blue-600" />
                  <h3 className="text-sm font-black text-slate-800">Booth readiness</h3>
                </div>
                <span className="text-xs font-bold text-slate-500">{checklistDone}/{boothChecklist.length} done</span>
              </div>
              <ul className="space-y-3">
                {boothChecklist.map((item) => (
                  <li key={item.label} className="flex gap-3">
                    <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black ${item.done ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                      {item.done ? '✓' : ''}
                    </span>
                    <div>
                      <p className={`text-sm font-bold ${item.done ? 'text-slate-800' : 'text-slate-600'}`}>{item.label}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{item.hint}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}

        {/* ══════════════ MATERIALS ══════════════ */}
        {activeTab === 'materials' && (
          <div className="max-w-4xl mx-auto w-full p-4 sm:p-6 md:p-8 lg:p-12">
            <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-black">My Materials</h2>
                <p className="text-slate-500 text-sm mt-1">Manage your uploaded booth assets</p>
              </div>
              <label className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-200 transition-colors hover:bg-blue-700 sm:w-auto ${uploading ? 'opacity-70 pointer-events-none' : ''}`}>
                <input type="file" className="hidden" accept="image/*,video/*,.pdf" multiple
                  onChange={(e) => { const files = Array.from(e.target.files || []) as File[]; if (files.length) { handleUpload(files); e.target.value = ''; } }} />
                {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                {uploading ? 'Uploading…' : 'Upload'}
              </label>
            </div>

            {materials.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm sm:p-16">
                <FolderOpen size={48} className="mx-auto mb-4 text-slate-200" />
                <p className="font-bold text-slate-500 mb-1">No files yet</p>
                <p className="text-sm text-slate-400 mb-6">Upload your brochures, product demos, or brand assets.</p>
                <label className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-full text-sm font-bold cursor-pointer hover:bg-blue-700">
                  <input type="file" className="hidden" accept="image/*,video/*,.pdf" multiple
                    onChange={(e) => { const files = Array.from(e.target.files || []) as File[]; if (files.length) { handleUpload(files); e.target.value = ''; } }} />
                  <Plus size={16} /> Upload Your First File
                </label>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="space-y-3 p-4 md:hidden">
                  {materials.map((mat) => (
                    <div key={mat.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-start gap-3">
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${fileIconBg(mat.fileType)}`}>{fileIcon(mat.fileType)}</div>
                        <div className="min-w-0 flex-1">
                          {editingMaterialId === mat.id ? (
                            <div className="flex items-center gap-2">
                              <input value={editingMaterialName} onChange={(e) => setEditingMaterialName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') { handleMaterialNameUpdate(mat, editingMaterialName); setEditingMaterialId(null); } }}
                                className="flex-1 min-w-0 text-sm font-bold border border-blue-300 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500" autoFocus />
                              <button type="button" onClick={() => { handleMaterialNameUpdate(mat, editingMaterialName); setEditingMaterialId(null); }} className="text-blue-600 text-xs font-bold">Save</button>
                              <button type="button" onClick={() => { setEditingMaterialId(null); }} className="text-slate-400 text-xs">Cancel</button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-bold text-slate-800 flex-1">{mat.materialName ?? mat.fileName}</p>
                              <button type="button" onClick={() => { setEditingMaterialId(mat.id); setEditingMaterialName(mat.materialName ?? mat.fileName); }} className="text-slate-400 hover:text-blue-600 shrink-0" title="Rename"><Edit2 size={14} /></button>
                            </div>
                          )}
                          <div className="mt-3 space-y-2 text-sm text-slate-500">
                            <p><span className="font-semibold text-slate-700">Size:</span> {formatBytes(mat.fileSizeBytes)}</p>
                            <p><span className="font-semibold text-slate-700">Type:</span> {mat.fileType.split('/')[0] || 'file'}</p>
                          </div>
                          <div className="mt-3 flex items-center gap-3">
                            <a href={mat.downloadUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 transition-colors" title="Download"><Download size={16} /></a>
                            <button type="button" onClick={() => handleDelete(mat)} className="text-slate-300 hover:text-red-500 transition-colors" title="Delete"><Trash2 size={16} /></button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[680px] text-left">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                      <th className="px-6 py-4 font-bold">Material Name</th>
                      <th className="px-6 py-4 font-bold">Size</th>
                      <th className="px-6 py-4 font-bold">Type</th>
                      <th className="px-6 py-4 font-bold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {materials.map((mat) => (
                      <tr key={mat.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${fileIconBg(mat.fileType)}`}>{fileIcon(mat.fileType)}</div>
                            {editingMaterialId === mat.id ? (
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <input value={editingMaterialName} onChange={(e) => setEditingMaterialName(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') { handleMaterialNameUpdate(mat, editingMaterialName); setEditingMaterialId(null); } }}
                                  className="flex-1 min-w-0 max-w-[200px] text-sm font-bold border border-blue-300 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500" autoFocus />
                                <button type="button" onClick={() => { handleMaterialNameUpdate(mat, editingMaterialName); setEditingMaterialId(null); }} className="text-blue-600 text-xs font-bold shrink-0">Save</button>
                                <button type="button" onClick={() => setEditingMaterialId(null)} className="text-slate-400 text-xs shrink-0">Cancel</button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 min-w-0">
                                <p className="text-sm font-bold truncate max-w-[200px]">{mat.materialName ?? mat.fileName}</p>
                                <button type="button" onClick={() => { setEditingMaterialId(mat.id); setEditingMaterialName(mat.materialName ?? mat.fileName); }} className="text-slate-400 hover:text-blue-600 shrink-0" title="Rename"><Edit2 size={14} /></button>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-500">{formatBytes(mat.fileSizeBytes)}</td>
                        <td className="px-6 py-4">
                          <span className="text-[11px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-medium capitalize">{mat.fileType.split('/')[0]}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <a href={mat.downloadUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 transition-colors" title="Download"><Download size={16} /></a>
                            <button type="button" onClick={() => handleDelete(mat)} className="text-slate-300 hover:text-red-500 transition-colors" title="Delete"><Trash2 size={16} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════ MEALS (matches participant My Entitlements UX) ══════════════ */}
        {activeTab === 'meals' && (
          <div className="max-w-6xl mx-auto w-full px-4 pt-5 pb-4 sm:px-6 md:px-8 lg:px-12 md:py-8">
            <div className="mb-4 md:mb-8">
              <h2 className="text-2xl font-black tracking-tight">My Entitlements</h2>
              <p className="text-sm text-slate-500 mt-1">
                Food and kits — during the pickup window, open Digital ID so the food booth can scan your QR.
              </p>
            </div>
            {eligibleMeals.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-100 p-10 md:p-12 text-center text-slate-400 text-sm shadow-sm">
                No entitlements available for you yet.
              </div>
            ) : (
              <div className="flex flex-col gap-3 md:grid md:grid-cols-2 xl:grid-cols-3 md:gap-4">
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

        {/* ══════════════ MAIN HALL (entrance only) ══════════════ */}
        {activeTab === 'main-hall' && (
          <div className="max-w-lg mx-auto w-full p-4 sm:p-6 md:p-8 lg:p-12">
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">Main Hall check-in</h2>
            <p className="text-slate-500 text-sm mt-2 leading-relaxed max-w-prose">
              Exhibitors time in only at the Main Hall. Scan the entrance QR when you arrive. Breakout room QRs will not count for your check-in.
            </p>
            <div
              className={`mt-6 rounded-2xl border p-5 md:p-6 shadow-sm ${
                hasEntryAttendance ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'
              }`}
            >
              <p className="text-sm font-bold text-slate-800">
                {hasEntryAttendance ? "You're checked in for today." : 'Not checked in yet for today.'}
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
          <>
            <div className="md:hidden">
              <ArticleBrowsePanel
                variant="mobile"
                loading={articlesLoading}
                articles={exhibitorArticles}
                searchQuery={articleSearchQuery}
                onSearchChange={setArticleSearchQuery}
                categoryFilter={articleCategoryFilter}
                onCategoryChange={setArticleCategoryFilter}
                categoryChipNames={articleCategoriesState.names}
              />
            </div>
            <div className="hidden md:block max-w-5xl mx-auto w-full">
              <ArticleBrowsePanel
                variant="desktop"
                loading={articlesLoading}
                articles={exhibitorArticles}
                searchQuery={articleSearchQuery}
                onSearchChange={setArticleSearchQuery}
                categoryFilter={articleCategoryFilter}
                onCategoryChange={setArticleCategoryFilter}
                categoryChipNames={articleCategoriesState.names}
              />
            </div>
          </>
        )}

        {/* ══════════════ PROFILE ══════════════ */}
        {activeTab === 'profile' && (
          <div className="max-w-2xl mx-auto w-full p-4 sm:p-6 md:p-8 lg:p-12">
            <h2 className="text-2xl font-black mb-6">My Profile</h2>
            <div className="space-y-4">
              {/* Avatar */}
              <div className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
                {profilePicUrl
                  ? <img src={profilePicUrl} alt={fullName} className="w-16 h-16 rounded-full object-cover ring-2 ring-blue-100" />
                  : <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-black">{initials}</div>}
                <div className="flex-1 min-w-0">
                  <p className="font-black text-lg">{fullName}</p>
                  <p className="text-sm text-slate-500">{user.email}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{sectorLabel}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${approvalStatus === 'approved' ? 'text-emerald-600 bg-emerald-50' : 'text-amber-600 bg-amber-50'}`}>
                      {approvalStatus === 'approved' ? '✓ Approved' : '⏳ Pending'}
                    </span>
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
                    { label: 'Organization', value: registration?.sectorOffice },
                    { label: 'Sector', value: registration?.sector },
                    {
                      label: 'Listing category',
                      value: exhibitorCategoryLabel({
                        boothCategory: registration?.boothCategory,
                        boothCategoryOther: registration?.boothCategoryOther,
                      }),
                    },
                    { label: 'Position', value: registration?.positionTitle },
                    { label: 'Contact', value: registration?.contactNumber },
                    { label: 'Booth #', value: boothNumber },
                    { label: 'Status', value: registration?.status || 'pending' },
                  ].map(({ label, value }) => (
                    <div key={label}><p className="text-[11px] text-slate-400 mb-0.5">{label}</p><p className="font-semibold text-xs truncate">{value || '—'}</p></div>
                  ))}
                </div>
              </div>

              {/* Travel & accommodation */}
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
                      onClick={handleSaveTravel}
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
      {toast && (
        <div
          className={`fixed left-4 right-4 top-5 z-50 px-5 py-3 rounded-2xl text-sm font-semibold shadow-lg sm:left-auto sm:right-5 ${
            toast.startsWith('✅') ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
          }`}
        >
          {toast}
        </div>
      )}
      {scanToast && (
        <div
          className={`hidden md:flex fixed left-4 right-4 top-[4.5rem] z-50 px-5 py-3 rounded-2xl text-sm font-semibold shadow-lg sm:left-auto sm:right-5 sm:max-w-md ${
            scanToast.startsWith('✅') ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-50 text-amber-900 border border-amber-200'
          }`}
        >
          {scanToast}
        </div>
      )}

      <div className="md:hidden flex flex-col min-h-screen max-w-md mx-auto border-x border-slate-200 shadow-xl bg-slate-50 text-slate-900 relative w-full">
        <header className="sticky top-0 z-20 flex items-center justify-between bg-white/90 backdrop-blur-md p-4 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setMobileDrawerOpen(true)}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-blue-50 text-blue-600"
          >
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
              aria-label={bellUnreadCount > 0 ? `Notifications, ${bellUnreadCount} unread` : 'Notifications'}
              aria-expanded={bellPanelOpen}
            >
              <Bell size={18} />
              {bellUnreadCount > 0 ? (
                <span
                  className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-orange-500 text-white text-[10px] font-black leading-none border-2 border-white shadow-sm"
                  aria-hidden
                >
                  {bellUnreadCount > 99 ? '99+' : bellUnreadCount}
                </span>
              ) : null}
            </button>
            {exhibitorBellPanel}
          </div>
        </header>
        {contentNotify ? (
          <div className="mx-4 mt-2 flex items-start gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2.5 text-orange-900 shadow-sm">
            <AlertTriangle size={16} className="shrink-0 mt-0.5 text-orange-600" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-bold text-[10px] uppercase tracking-wide text-orange-800">Action needed</p>
              <p className="text-sm font-semibold leading-snug mt-0.5">{contentNotify.msg}</p>
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
              className="shrink-0 p-0.5 rounded-lg text-orange-700 hover:bg-orange-100"
              onClick={() => setContentNotify(null)}
              aria-label="Dismiss notification"
            >
              <X size={16} />
            </button>
          </div>
        ) : null}
        {scanToast && (
          <div
            className={`mx-4 mt-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-center ${
              scanToast.startsWith('✅') ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-50 text-amber-900 border border-amber-200'
            }`}
          >
            {scanToast}
          </div>
        )}
        <main className="flex-1 pb-28 overflow-y-auto">{renderExhibitorTabPanels()}</main>
        <nav className="fixed bottom-0 z-30 flex w-full max-w-md items-center justify-between gap-1 border-t border-slate-200 bg-white/95 backdrop-blur-md px-2 pb-5 pt-3 sm:px-4 left-1/2 -translate-x-1/2">
          <div className="flex flex-1 justify-around min-w-0">
            {([
              { id: 'home' as const, label: 'HOME', icon: <Home size={22} /> },
              { id: 'my-booth' as const, label: 'BOOTHS', icon: <Store size={22} /> },
            ] as const).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 ${activeTab === item.id ? 'text-blue-600' : 'text-slate-400'}`}
              >
                {item.icon}
                <span className="text-[8px] font-black uppercase leading-tight text-center">{item.label}</span>
              </button>
            ))}
          </div>
          <div className="relative -top-6 shrink-0">
            <button
              type="button"
              onClick={() => setScanModal(true)}
              className="w-14 h-14 flex items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-400/50 active:scale-90 transition-transform hover:bg-blue-700"
            >
              <QrCode size={26} />
            </button>
          </div>
          <div className="flex flex-1 justify-around min-w-0">
            {([
              { id: 'meals' as const, label: 'MEALS', icon: <Utensils size={20} />, badge: mealsBadgeDisplay },
              { id: 'profile' as const, label: 'PROFILE', icon: <User size={20} /> },
            ] as const).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 ${activeTab === item.id ? 'text-blue-600' : 'text-slate-400'}`}
                aria-label={
                  item.id === 'profile' && travelAccIncomplete
                    ? `${item.label}, flight and accommodation needed`
                    : 'badge' in item && item.badge != null && item.badge > 0
                      ? `${item.label}, ${item.badge} unclaimed`
                      : item.label
                }
              >
                {'badge' in item && item.badge != null && item.badge > 0 ? (
                  <span className="absolute top-0 right-2 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-blue-600 text-white text-[9px] font-black leading-none z-10" aria-hidden>
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                ) : null}
                {item.id === 'profile' && travelAccIncomplete ? (
                  <span
                    className="absolute top-0 right-2 w-2.5 h-2.5 rounded-full bg-orange-500 border-2 border-white z-10 shadow-sm"
                    aria-hidden
                  />
                ) : null}
                {item.icon}
                <span className="text-[8px] font-black uppercase leading-tight text-center">{item.label}</span>
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
            <div className="fixed top-0 left-0 z-50 h-full w-72 max-w-[85vw] bg-white shadow-2xl flex flex-col">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <img src="/iscene.png" alt="iSCENE" className="w-9 h-9 rounded-full object-contain bg-white p-0.5 shadow-sm" />
                  <div>
                    <p className="text-sm font-black leading-tight text-blue-600">Exhibitor Hub</p>
                    <p className="text-[10px] text-slate-400">iSCENE 2026</p>
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
              <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
                {(
                  [
                    { id: 'home' as ExhibitorTab, label: 'Home', icon: <Home size={18} /> },
                    { id: 'my-booth' as ExhibitorTab, label: 'Manage booth', icon: <Store size={18} /> },
                    { id: 'materials' as ExhibitorTab, label: 'Materials', icon: <FolderOpen size={18} /> },
                    { id: 'meals' as ExhibitorTab, label: 'Meals', icon: <UtensilsCrossed size={18} /> },
                    { id: 'main-hall' as ExhibitorTab, label: 'Main Hall check-in', icon: <QrCode size={18} /> },
                    { id: 'articles' as ExhibitorTab, label: 'Articles', icon: <Newspaper size={18} /> },
                    { id: 'profile' as ExhibitorTab, label: 'Profile', icon: <User size={18} /> },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileDrawerOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                      activeTab === item.id ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {item.icon}
                    <span className="flex-1 text-left">{item.label}</span>
                    {item.id === 'profile' && travelAccIncomplete ? (
                      <span
                        className={`shrink-0 text-[10px] font-black uppercase ${
                          activeTab === item.id ? 'text-orange-200' : 'text-orange-600'
                        }`}
                      >
                        !
                      </span>
                    ) : null}
                  </button>
                ))}
              </nav>
              <div className="px-3 pb-3 space-y-1 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setIdModal(true);
                    setMobileDrawerOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  <CreditCard size={18} />
                  <span>Digital ID</span>
                </button>
              </div>
              <div className="mt-auto border-t border-slate-100 p-4">
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
        )}
      </div>

      <div className="hidden md:flex min-h-screen w-full overflow-hidden bg-slate-50 text-slate-900">
        <aside className="w-56 shrink-0 border-r border-slate-200 bg-white flex flex-col min-h-screen sticky top-0 self-start h-screen overflow-y-auto">
          <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-100">
            <img src="/iscene.png" alt="iSCENE" className="w-10 h-10 rounded-full object-contain bg-white p-0.5 shadow-sm shrink-0" />
            <div>
              <p className="text-sm font-black leading-tight">Exhibitor Hub</p>
              <p className="text-[11px] text-slate-400">iSCENE 2026</p>
            </div>
          </div>
          <nav className="flex-1 px-3 py-4 space-y-1">
            <NavItem tab="home" icon={<Home size={17} />} label="Home" />
            <NavItem tab="my-booth" icon={<Store size={17} />} label="My Booth" />
            <NavItem tab="materials" icon={<FolderOpen size={17} />} label="Materials" />
            <NavItem tab="meals" icon={<UtensilsCrossed size={17} />} label="Meals" />
            <NavItem tab="main-hall" icon={<QrCode size={17} />} label="Main Hall" />
            <NavItem tab="articles" icon={<Newspaper size={17} />} label="Articles" />
            <button
              type="button"
              onClick={() => setIdModal(true)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-full text-sm font-medium text-slate-600 hover:bg-slate-100 transition-all"
            >
              <CreditCard size={17} />
              <span>Digital ID</span>
            </button>
            <NavItem
              tab="profile"
              icon={<User size={17} />}
              label="Profile"
              badge={travelAccIncomplete ? 1 : undefined}
            />
          </nav>
          <div className="border-t border-slate-100 p-4">
            <div className="mb-3 flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
              {profilePicUrl ? (
                <img src={profilePicUrl} alt={fullName} className="w-10 h-10 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-black shrink-0">
                  {initials}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-800">{fullName}</p>
                <p className="truncate text-[11px] text-slate-500">{orgName}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="w-full rounded-full border border-red-200 py-2 text-xs font-bold text-red-600 hover:bg-red-50"
            >
              Sign out
            </button>
          </div>
        </aside>
        <main className="flex-1 min-w-0 overflow-y-auto min-h-screen">
          {contentNotify ? (
            <div className="sticky top-0 z-10 mx-4 mt-4 mb-2 flex items-start gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-orange-900 shadow-sm">
              <AlertTriangle size={18} className="shrink-0 mt-0.5 text-orange-600" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-[10px] uppercase tracking-wide text-orange-800">Action needed</p>
                <p className="text-sm font-semibold leading-snug mt-0.5">{contentNotify.msg}</p>
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
                className="shrink-0 p-1 rounded-lg text-orange-700 hover:bg-orange-100"
                onClick={() => setContentNotify(null)}
                aria-label="Dismiss notification"
              >
                <X size={18} />
              </button>
            </div>
          ) : null}
          {renderExhibitorTabPanels()}
        </main>
      </div>

      {/* ── Edit Booth Modal ───────────────────────────────────────────── */}
      {editing && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-md max-h-[min(90vh,44rem)] overflow-y-auto bg-white rounded-3xl p-6 shadow-2xl my-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-base">Edit Booth Profile</h3>
              <button type="button" onClick={() => setEditing(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X size={15} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Booth category *</label>
                <select
                  value={boothCategory}
                  onChange={(e) => {
                    const v = e.target.value;
                    setBoothCategory(v);
                    if (v !== 'Other') setBoothCategoryOther('');
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select category</option>
                  {EXHIBITOR_BOOTH_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              {boothCategory === 'Other' && (
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Describe category *</label>
                  <input
                    value={boothCategoryOther}
                    onChange={(e) => setBoothCategoryOther(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. Healthcare, Education"
                  />
                </div>
              )}
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Booth location details</label>
                <p className="text-[10px] text-slate-400 mb-1">Where visitors find you on the expo floor (you or admin can edit).</p>
                <textarea
                  value={boothLocationDetails}
                  onChange={(e) => setBoothLocationDetails(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm resize-none outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Exhibition Hall — booth A12, near the main aisle"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Booth Description</label>
                <textarea value={boothDesc} onChange={(e) => setBoothDesc(e.target.value)} rows={3}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm resize-none outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Brief description of your booth and what you offer…" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Products / Services</label>
                <input value={boothProducts} onChange={(e) => setBoothProducts(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Smart City Solutions, IoT Devices…" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Website URL</label>
                <input value={boothWebsite} onChange={(e) => setBoothWebsite(e.target.value)}
                  type="url" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://your-company.com" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Booth background</label>
                <p className="text-[10px] text-slate-400 mb-1">Wide banner image participants see at the top of your booth card.</p>
                <div className="flex items-center gap-3 flex-wrap">
                  {boothBackgroundUrl && <img src={boothBackgroundUrl} alt="Background" className="h-10 w-16 rounded-lg object-cover border border-slate-200" />}
                  <label className={`flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold cursor-pointer hover:bg-slate-50 ${uploadingBoothBackground ? 'opacity-60' : ''}`}>
                    <input type="file" accept="image/*" className="hidden" onChange={handleBoothBackgroundUpload} />
                    {uploadingBoothBackground ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                    {uploadingBoothBackground ? 'Uploading…' : 'Upload'}
                  </label>
                  {boothBackgroundUrl ? (
                    <button type="button" onClick={() => setBoothBackgroundUrl('')} className="text-xs font-bold text-red-600 hover:underline">Clear</button>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button type="button" onClick={() => setEditing(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-bold hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={handleSaveBooth} disabled={savingBooth}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {savingBooth ? <><Loader2 size={14} className="animate-spin" />Saving…</> : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Digital ID Modal ───────────────────────────────────────────── */}
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
                  : <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-2xl font-black text-white mb-3 ring-4 ring-blue-100">{initials}</div>}
                <h3 className="text-base font-black text-slate-900 text-center">{fullName}</h3>
                <p className="text-xs text-slate-500 mt-0.5 text-center">{registration?.positionTitle}{orgName ? ` · ${orgName}` : ''}</p>
                <span className="mt-2 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-[11px] font-bold">{sectorLabel}</span>
                <div className="mt-4 p-3 bg-white rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
                  <img src={digitalIdQrImg} alt="Digital ID QR" className="w-44 h-44 relative z-10" />
                </div>
                <p className="mt-3 text-[11px] text-slate-500 font-mono tracking-widest text-center">
                  ID <span className="text-slate-400">#</span>{idNumber}
                </p>
              </div>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[10px] text-slate-400">April 9–11, 2026</span>
              <a href={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(digitalIdQrData)}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline">
                <Download size={11} /> Download QR
              </a>
            </div>
          </div>
        </div>
      )}

      {scanModal && (
        <QrScanModal
          subtitle="Scan the Main Hall / entrance QR only"
          onClose={() => setScanModal(false)}
          onResult={handleScanResult}
        />
      )}
    </>
  );
}
