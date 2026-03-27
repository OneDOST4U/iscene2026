import React from 'react';
import {
  LayoutDashboard,
  Users,
  DoorOpen,
  UtensilsCrossed,
  Store,
  BarChart3,
  Plus,
  Trash2,
  QrCode,
  Eye,
  FileText,
  Download,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Menu,
  X,
  Pencil,
  KeyRound,
  Search,
  Save,
  Image as ImageIcon,
  Film,
  Package,
  MessageCircle,
  Mail,
  Phone,
  Briefcase,
  UserCog,
  ShieldCheck,
  Loader2,
  Upload,
  ChevronRight,
  Star,
  Newspaper,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  setDoc,
  updateDoc,
  Timestamp,
  query,
  orderBy,
  where,
  onSnapshot,
  deleteField,
} from 'firebase/firestore';
import { db, storage } from './firebase';
import { formatMealTimeRangeForDisplay } from './mealClaimWindow';
import { EXHIBITOR_BOOTH_CATEGORIES } from './exhibitorBoothCategory';
import { ArticlesManager } from './ArticlesManager';
import { ref, getDownloadURL, uploadBytes, deleteObject } from 'firebase/storage';

type Tab = 'dashboard' | 'registrations' | 'rooms' | 'meals' | 'booths' | 'materials' | 'articles' | 'analytics';

export type AdminDashboardProps = {
  user: User;
  registrations: any[];
  registrationsLoading: boolean;
  filteredRegistrations: any[];
  sectorFilterOptions: string[];
  filterSector: string;
  filterStatus: string;
  totalRegistrations: number;
  pendingRegistrations: number;
  approvedRegistrations: number;
  onFilterSectorChange: (s: string) => void;
  onFilterStatusChange: (s: string) => void;
  onUpdateStatus: (reg: any, status: string) => Promise<void>;
  onSaveRegistration: (registrationId: string, updates: Record<string, any>) => Promise<void>;
  onDeleteRegistration: (reg: any) => Promise<void>;
  onSendPasswordReset: (email: string) => Promise<void>;
  onExportPdf: () => void;
  onExportCsv: () => void;
  onSignOut: () => Promise<void>;
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
  presenterTitles?: string[];
  venue?: string;
  backgroundImage?: string;
  projectDetail?: string;
  certificateProcessSteps?: string;
  createdAt: any;
};

type RoomChatMessage = {
  id: string;
  roomId: string;
  uid: string;
  participantName: string;
  text: string;
  createdAt: any;
};

type Venue = { id: string; name: string; order?: number };

type Meal = {
  id: string;
  type: string;
  itemType?: 'food' | 'kit' | 'both';
  name?: string;
  location?: string;
  /** Extra pickup / service area directions (food & both); shown to participants and booth staff */
  foodLocationDetails?: string;
  assignedBoothUid?: string;
  eligibleSectors?: string[];
  eligibleParticipantIds?: string[];
  sessionDate: string;
  startTime: string;
  endTime: string;
  createdAt: any;
};

const BOOTH_SECTORS = ['Food (Booth)', 'Exhibitor (Booth)', 'Exhibitor'];
const BOOTH_LIST_PAGE_SIZE = 5;
const ROLE_OPTIONS = [
  'Participants',
  'Speakers',
  'Facilitators',
  'Food (Booth)',
  'Exhibitor',
  'Exhibitor (Booth)',
  'DOST',
  'Articles',
];

const MEAL_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  snacks: 'Snacks (AM)',
  lunch: 'Lunch',
  snacks_pm: 'Snacks (PM)',
  dinner: 'Dinner',
  kit: 'Kit',
};

/** Admin list filters — matches `Meal.type` values saved from Create Entitlement */
const MEAL_ADMIN_TYPE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All meal types' },
  { value: 'breakfast', label: MEAL_LABELS.breakfast },
  { value: 'snacks', label: MEAL_LABELS.snacks },
  { value: 'lunch', label: MEAL_LABELS.lunch },
  { value: 'snacks_pm', label: MEAL_LABELS.snacks_pm },
  { value: 'dinner', label: MEAL_LABELS.dinner },
  { value: 'kit', label: MEAL_LABELS.kit },
];

/** Booth dropdown + meal summary: show physical placement when set on the registration */
function formatBoothOptionLabel(reg: {
  fullName?: string;
  sector?: string;
  sectorOffice?: string;
  boothLocationDetails?: string;
}): string {
  const name = String(reg.fullName || 'Booth').trim();
  const sector = String(reg.sector || '').trim();
  const org = String(reg.sectorOffice || '').trim();
  const loc = String(reg.boothLocationDetails || '').trim();
  if (loc) {
    const who = org ? `${name} · ${org}` : name;
    return `${loc} — ${who}`;
  }
  if (org) return `${name} — ${org} (${sector})`;
  return `${name} (${sector})`;
}

/** Short label for entitlement "Assigned booth" dropdown — booth name only */
function formatBoothSelectName(reg: { fullName?: string }) {
  return String(reg.fullName || 'Booth').trim() || 'Booth';
}

const DEFAULT_VENUE_OPTIONS = [
  'Main Hall',
  'Conference Hall A',
  'Conference Hall B',
  'Room A',
  'Room B',
  'Room C',
  'Exhibition Hall',
  'Annex',
  'Outdoor Area',
  'TBD',
];

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const AMPM = ['AM', 'PM'];

function timeToMinutes(str: string): number {
  const m = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return -1;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const pm = m[3].toUpperCase() === 'PM';
  if (h === 12) h = 0;
  return (h + (pm ? 12 : 0)) * 60 + min;
}

function TimePickerScrollColumn({ options, selected, onSelect, isOpen }: { options: string[]; selected: string; onSelect: (v: string) => void; isOpen: boolean }) {
  const selectedRef = React.useRef<HTMLButtonElement>(null);
  const hasScrolledRef = React.useRef(false);
  React.useEffect(() => {
    if (!isOpen) {
      hasScrolledRef.current = false;
      return;
    }
    if (hasScrolledRef.current) return;
    const t = requestAnimationFrame(() => {
      selectedRef.current?.scrollIntoView({ block: 'center', behavior: 'auto' });
      hasScrolledRef.current = true;
    });
    return () => cancelAnimationFrame(t);
  }, [isOpen]);
  return (
    <div className="flex-1 min-w-0 overflow-y-auto h-36 rounded-lg border border-slate-200 bg-slate-50" style={{ scrollbarWidth: 'thin' }}>
      <div className="py-10">
        {options.map((opt) => (
          <button
            key={opt}
            ref={selected === opt ? selectedRef : undefined}
            type="button"
            onClick={() => onSelect(opt)}
            className={`w-full py-1.5 text-sm font-medium transition-colors ${selected === opt ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-200'}`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function TimePicker({
  value,
  onChange,
  placeholder,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  id?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const match = value ? value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i) : null;
  const [hour, setHour] = React.useState(match ? match[1].padStart(2, '0') : '08');
  const [minute, setMinute] = React.useState(match ? match[2] : '00');
  const [ampm, setAmPm] = React.useState(match ? match[3].toUpperCase() : 'AM');

  React.useEffect(() => {
    if (value) {
      const m = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      if (m) {
        const h = parseInt(m[1], 10);
        setHour(h >= 1 && h <= 12 ? String(h).padStart(2, '0') : '08');
        setMinute(m[2]);
        setAmPm(m[3].toUpperCase());
      }
    }
  }, [value]);

  const apply = () => {
    const h = parseInt(hour, 10) || 1;
    const m = parseInt(minute, 10) || 0;
    onChange(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`);
    setOpen(false);
  };

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative" id={id}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-left outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between"
      >
        <span className={value ? 'text-slate-800' : 'text-slate-400'}>{value || placeholder || 'Choose time'}</span>
        <ChevronRight size={16} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 left-0 right-0 rounded-xl border border-slate-200 bg-white shadow-xl p-3">
          <div className="flex gap-2 mb-3">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-1 text-center">Hour</p>
              <TimePickerScrollColumn options={HOURS} selected={hour.padStart(2, '0')} onSelect={(v) => setHour(String(parseInt(v, 10)).padStart(2, '0'))} isOpen={open} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-1 text-center">Min</p>
              <TimePickerScrollColumn options={MINUTES} selected={minute} onSelect={setMinute} isOpen={open} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-1 text-center">AM/PM</p>
              <TimePickerScrollColumn options={AMPM} selected={ampm} onSelect={setAmPm} isOpen={open} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={apply} className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700">Apply</button>
            <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDate(value: any) {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : '—';
}

function formatDateTime(value: any) {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
}

function statusColor(status: string) {
  if (status === 'approved') return 'bg-emerald-100 text-emerald-700';
  if (status === 'declined') return 'bg-red-100 text-red-700';
  return 'bg-amber-100 text-amber-700';
}

function sectorColor(sector: string) {
  if (sector === 'Speakers') return 'bg-purple-100 text-purple-700';
  if (sector === 'Facilitators') return 'bg-indigo-100 text-indigo-700';
  if (sector === 'Food (Booth)') return 'bg-orange-100 text-orange-700';
  if (sector === 'Exhibitor' || sector === 'Exhibitor (Booth)') return 'bg-cyan-100 text-cyan-700';
  if (sector === 'Articles') return 'bg-violet-100 text-violet-700';
  return 'bg-blue-100 text-blue-700';
}

function getInitials(name: string) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return 'U';
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

function getRegistrationProfileImage(registration: any) {
  return (
    registration?.profilePictureUrl ||
    registration?.profilePhotoURL ||
    registration?.photoURL ||
    registration?.avatarUrl ||
    registration?.avatar ||
    registration?.photoUrl ||
    ''
  );
}

function getRegistrationProofRef(registration: any) {
  return (
    registration?.proofOfPaymentPath ||
    registration?.proofOfPaymentUrl ||
    registration?.paymentProofUrl ||
    registration?.receiptUrl ||
    ''
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${statusColor(status || 'pending')}`}>
      {status || 'pending'}
    </span>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub: string;
  tone: 'blue' | 'green' | 'amber' | 'purple';
}) {
  const toneClass = {
    blue: 'text-blue-600 bg-blue-50',
    green: 'text-emerald-600 bg-emerald-50',
    amber: 'text-amber-600 bg-amber-50',
    purple: 'text-purple-600 bg-purple-50',
  }[tone];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <div className="mt-3 flex items-end gap-3">
        <span className="text-3xl font-black text-slate-900">{value}</span>
        <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${toneClass}`}>{sub}</span>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Create Entitlement Form (refactored – native selects, no overlay dropdowns)
// ─────────────────────────────────────────────────────────────────────────────
export type EntitlementFormPayload = {
  type: string;
  itemType: 'food' | 'kit' | 'both';
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

type CreateEntitlementFormProps = {
  allBoothRegs: {
    id: string;
    fullName?: string;
    sector?: string;
    uid?: string;
    sectorOffice?: string;
    boothLocationDetails?: string;
  }[];
  allRoleOptions: string[];
  approvedRegistrations: { id: string; fullName?: string; sector?: string; email?: string }[];
  /** When set, form loads this meal and saves update to the same id */
  initialMeal?: Meal | null;
  onCancelEdit?: () => void;
  onSubmit: (payload: EntitlementFormPayload, mealId?: string) => Promise<void>;
  onValidationError: (msg: string) => void;
};

function CreateEntitlementForm({
  allBoothRegs,
  allRoleOptions,
  approvedRegistrations,
  initialMeal = null,
  onCancelEdit,
  onSubmit,
  onValidationError,
}: CreateEntitlementFormProps) {
  const [itemType, setItemType] = React.useState<'food' | 'kit' | 'both'>('food');
  const [mealType, setMealType] = React.useState('lunch');
  const [name, setName] = React.useState('');
  const [sessionDate, setSessionDate] = React.useState('');
  const [startTime, setStartTime] = React.useState('');
  const [endTime, setEndTime] = React.useState('');
  /** Food (Booth) operator for this entitlement; empty = any food booth can process */
  const [assignedBoothUid, setAssignedBoothUid] = React.useState('');
  /** Optional extra directions for this meal only (saved on entitlement, not booth profile) */
  const [foodLocationDetails, setFoodLocationDetails] = React.useState('');
  const [eligibleSectors, setEligibleSectors] = React.useState<string[]>([]);
  const [eligibleParticipantIds, setEligibleParticipantIds] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);

  const editingMealId = initialMeal?.id;

  React.useEffect(() => {
    if (!initialMeal) {
      setItemType('food');
      setMealType('lunch');
      setName('');
      setSessionDate('');
      setStartTime('');
      setEndTime('');
      setAssignedBoothUid('');
      setFoodLocationDetails('');
      setEligibleSectors([]);
      setEligibleParticipantIds([]);
      return;
    }
    const m = initialMeal;
    const it = (m.itemType as 'food' | 'kit' | 'both') || 'food';
    setItemType(it);
    if (it === 'kit') {
      setMealType('lunch');
    } else {
      const allowed = ['breakfast', 'snacks', 'lunch', 'snacks_pm', 'dinner'];
      setMealType(allowed.includes(m.type) ? m.type : 'lunch');
    }
    setName(m.name || '');
    setSessionDate(m.sessionDate || '');
    setStartTime(m.startTime || '');
    setEndTime(m.endTime || '');
    setAssignedBoothUid(m.assignedBoothUid || '');
    setFoodLocationDetails(m.foodLocationDetails || '');
    setEligibleSectors(m.eligibleSectors?.length ? [...m.eligibleSectors] : []);
    setEligibleParticipantIds(m.eligibleParticipantIds?.length ? [...m.eligibleParticipantIds] : []);
  }, [initialMeal]);

  /** Food / kit entitlements are issued only by Food (Booth) — not exhibitor research booths */
  const foodServiceBoothRegs = React.useMemo(
    () => allBoothRegs.filter((r) => (r.sector as string) === 'Food (Booth)'),
    [allBoothRegs],
  );

  const selectedAssignedBooth = React.useMemo(
    () => (assignedBoothUid ? foodServiceBoothRegs.find((r) => (r.uid || '') === assignedBoothUid) : undefined),
    [assignedBoothUid, foodServiceBoothRegs],
  );

  /** Physical placement (stall / hall) from booth profile — shown below booth name, saved as meal.location */
  const boothPlacementFromProfile =
    selectedAssignedBooth != null ? String(selectedAssignedBooth.boothLocationDetails || '').trim() : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionDate?.trim()) {
      onValidationError('Please select a Session Date.');
      return;
    }
    setSaving(true);
    try {
      const locationLabel = boothPlacementFromProfile || undefined;

      await onSubmit(
        {
          type: itemType === 'kit' ? 'kit' : mealType,
          itemType,
          name: name.trim() || undefined,
          location: locationLabel,
          foodLocationDetails:
            itemType === 'food' || itemType === 'both' ? foodLocationDetails.trim() || undefined : undefined,
          assignedBoothUid: assignedBoothUid || undefined,
          eligibleSectors: eligibleSectors.length > 0 ? eligibleSectors : undefined,
          eligibleParticipantIds: eligibleParticipantIds.length > 0 ? eligibleParticipantIds : undefined,
          sessionDate,
          startTime,
          endTime,
        },
        editingMealId,
      );
      if (!editingMealId) {
        setItemType('food');
        setMealType('lunch');
        setName('');
        setSessionDate('');
        setStartTime('');
        setEndTime('');
        setFoodLocationDetails('');
        setAssignedBoothUid('');
        setEligibleSectors([]);
        setEligibleParticipantIds([]);
      }
    } catch (err: unknown) {
      console.error('createMeal', err);
      const msg = err instanceof Error ? err.message : 'Failed to create entitlement. Check console.';
      onValidationError(`Error: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const addPerson = (regId: string) => {
    if (regId && !eligibleParticipantIds.includes(regId)) {
      setEligibleParticipantIds((prev) => [...prev, regId]);
    }
  };

  const toggleSector = (sector: string) => {
    setEligibleSectors((prev) =>
      prev.includes(sector) ? prev.filter((s) => s !== sector) : [...prev, sector]
    );
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <Field label="Item Type">
        <select value={itemType} onChange={(e) => setItemType(e.target.value as 'food' | 'kit' | 'both')} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500">
          <option value="food">Food</option>
          <option value="kit">Kit</option>
          <option value="both">Both (Food &amp; Kit)</option>
        </select>
      </Field>
      <Field label="Display Name (optional)">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Day 0 Starter Kit" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
      </Field>
      {(itemType === 'food' || itemType === 'both') && (
        <Field label="Meal Type">
          <select value={mealType} onChange={(e) => setMealType(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500">
            <option value="breakfast">Breakfast</option>
            <option value="snacks">Snacks (AM)</option>
            <option value="lunch">Lunch</option>
            <option value="snacks_pm">Snacks (PM)</option>
            <option value="dinner">Dinner</option>
          </select>
        </Field>
      )}
      <Field label="Session Date *">
        <input value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} type="date" required className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Claim Opens">
          <input value={startTime} onChange={(e) => setStartTime(e.target.value)} type="time" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        </Field>
        <Field label="Claim Closes">
          <input value={endTime} onChange={(e) => setEndTime(e.target.value)} type="time" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        </Field>
      </div>
      <Field label="Assigned booth">
        <select
          value={assignedBoothUid}
          onChange={(e) => setAssignedBoothUid(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Any food booth (all food operators can process)</option>
          {foodServiceBoothRegs.map((r) => (
            <option key={r.id} value={r.uid || ''} disabled={!r.uid}>
              {formatBoothSelectName(r)}{!r.uid ? ' — no login uid' : ''}
            </option>
          ))}
        </select>
        <p className="text-[10px] text-slate-400 mt-1">
          Choose first. Only <strong className="font-semibold text-slate-600">Food (Booth)</strong> accounts can issue food; pickup location below comes from that booth&apos;s saved profile.
        </p>
      </Field>
      {assignedBoothUid ? (
        <Field label="Pickup location (from booth profile)">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 whitespace-pre-wrap">
            {boothPlacementFromProfile || '—'}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            Stall / hall line from this booth&apos;s registration (shown to participants as 📍). Empty until they set it on their booth profile.
          </p>
        </Field>
      ) : (
        <p className="text-[10px] text-slate-400 -mt-1">
          Pick a specific booth to show its saved pickup location, or leave &quot;Any food booth&quot; for a shared window.
        </p>
      )}
      {(itemType === 'food' || itemType === 'both') && (
        <Field label="Extra notes (optional)">
          <textarea
            value={foodLocationDetails}
            onChange={(e) => setFoodLocationDetails(e.target.value)}
            rows={3}
            placeholder="e.g. Use the side entrance this day, ask for the conference lunch badge…"
            className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-[10px] text-slate-400 mt-1">
            Shown to <strong className="font-semibold text-slate-600">everyone</strong> when claiming (participants, speakers, booths) — meal-specific directions on top of the stall line above.
          </p>
        </Field>
      )}
      <Field label="Eligible Sectors">
        <div className="flex flex-wrap gap-2">
          {allRoleOptions.map((sector) => (
            <label key={sector} className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={eligibleSectors.includes(sector)} onChange={() => toggleSector(sector)} className="rounded border-slate-300 text-blue-600" />
              <span className="text-xs font-medium">{sector}</span>
            </label>
          ))}
        </div>
        <p className="text-[10px] text-slate-400 mt-1">Leave empty = all sectors eligible</p>
      </Field>
      <Field label="Specific Persons (optional)">
        <select value="" onChange={(e) => addPerson(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Add a person...</option>
          {approvedRegistrations.filter((r) => !eligibleParticipantIds.includes(r.id)).map((r) => (
            <option key={r.id} value={r.id}>{r.fullName} ({r.sector})</option>
          ))}
        </select>
        {eligibleParticipantIds.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {eligibleParticipantIds.map((regId) => {
              const reg = approvedRegistrations.find((r) => r.id === regId);
              return (
                <span key={regId} className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700">
                  {reg?.fullName || regId.slice(0, 8)}
                  <button type="button" onClick={() => setEligibleParticipantIds((prev) => prev.filter((x) => x !== regId))} className="hover:bg-blue-200 rounded-full p-0.5" aria-label="Remove">
                    <X size={12} />
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </Field>
      {onCancelEdit && editingMealId ? (
        <button
          type="button"
          onClick={() => onCancelEdit()}
          className="w-full rounded-xl border border-slate-200 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50"
        >
          Cancel editing
        </button>
      ) : null}
      <button
        type="button"
        disabled={saving}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (saving) return;
          if (!sessionDate?.trim()) {
            onValidationError('Please select a Session Date.');
            return;
          }
          handleSubmit(e as unknown as React.FormEvent);
        }}
        className="w-full rounded-xl bg-blue-600 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
      >
        {saving ? 'Saving...' : editingMealId ? 'Update Entitlement' : 'Create Entitlement'}
      </button>
    </form>
  );
}

export function AdminDashboard({
  user,
  registrations,
  registrationsLoading,
  filteredRegistrations,
  sectorFilterOptions,
  filterSector,
  filterStatus,
  totalRegistrations,
  pendingRegistrations,
  approvedRegistrations,
  onFilterSectorChange,
  onFilterStatusChange,
  onUpdateStatus,
  onSaveRegistration,
  onDeleteRegistration,
  onSendPasswordReset,
  onExportPdf,
  onExportCsv,
  onSignOut,
}: AdminDashboardProps) {
  const [activeTab, setActiveTab] = React.useState<Tab>('dashboard');
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [searchText, setSearchText] = React.useState('');
  const [selectedQrRoom, setSelectedQrRoom] = React.useState<Room | null>(null);
  const [editingRoom, setEditingRoom] = React.useState<Room | null>(null);
  const [roomDetailView, setRoomDetailView] = React.useState<Room | null>(null);
  const [roomDetailReviews, setRoomDetailReviews] = React.useState<
    { id: string; participantName?: string; part4?: string; comment?: string; submittedAt?: any }[]
  >([]);
  const [roomDetailReviewsLoading, setRoomDetailReviewsLoading] = React.useState(false);
  const [chatModalRoom, setChatModalRoom] = React.useState<Room | null>(null);
  const [roomChatMessages, setRoomChatMessages] = React.useState<RoomChatMessage[]>([]);
  const [editingRegistration, setEditingRegistration] = React.useState<any | null>(null);
  const [registrationSaving, setRegistrationSaving] = React.useState(false);
  const [registrationDeleting, setRegistrationDeleting] = React.useState(false);
  const [passwordResetting, setPasswordResetting] = React.useState(false);
  const [actionMessage, setActionMessage] = React.useState<string | null>(null);
  const [proofError, setProofError] = React.useState<string | null>(null);
  const [proofPreviewUrl, setProofPreviewUrl] = React.useState<string | null>(null);
  const [proofPreviewLoading, setProofPreviewLoading] = React.useState(false);
  const [uploadingBoothBackground, setUploadingBoothBackground] = React.useState(false);
  const [expandedExhibitorId, setExpandedExhibitorId] = React.useState<string | null>(null);
  const [boothExhibitorSearch, setBoothExhibitorSearch] = React.useState('');
  const [boothFoodSearch, setBoothFoodSearch] = React.useState('');
  const [boothExhibitorStatusFilter, setBoothExhibitorStatusFilter] = React.useState<
    'all' | 'pending' | 'approved' | 'declined'
  >('all');
  const [boothFoodStatusFilter, setBoothFoodStatusFilter] = React.useState<'all' | 'pending' | 'approved' | 'declined'>(
    'all',
  );
  const [boothExhibitorPage, setBoothExhibitorPage] = React.useState(0);
  const [boothFoodPage, setBoothFoodPage] = React.useState(0);
  const [analyticsDayFilter, setAnalyticsDayFilter] = React.useState<'all' | 'today' | 'last7' | 'last30' | 'custom'>('all');
  const [analyticsRoleFilter, setAnalyticsRoleFilter] = React.useState<string>('all');
  const [analyticsEventFilter, setAnalyticsEventFilter] = React.useState<'all' | 'registrations' | 'breakouts' | 'meals'>('all');
  const [analyticsDateFrom, setAnalyticsDateFrom] = React.useState('');
  const [analyticsDateTo, setAnalyticsDateTo] = React.useState('');

  const [rooms, setRooms] = React.useState<Room[]>([]);
  const [roomsLoading, setRoomsLoading] = React.useState(false);
  const [newRoomName, setNewRoomName] = React.useState('');
  const [newRoomVenue, setNewRoomVenue] = React.useState('');
  const [newRoomCapacity, setNewRoomCapacity] = React.useState('');
  const [newRoomDesc, setNewRoomDesc] = React.useState('');
  const [newRoomStartTime, setNewRoomStartTime] = React.useState('');
  const [newRoomEndTime, setNewRoomEndTime] = React.useState('');
  const [newRoomDate, setNewRoomDate] = React.useState('');
  const [newRoomPresenterChoice, setNewRoomPresenterChoice] = React.useState('');
  const [newRoomSelectedPresenters, setNewRoomSelectedPresenters] = React.useState<string[]>([]);
  const [newRoomPresenters, setNewRoomPresenters] = React.useState('');
  const [newRoomBackgroundImage, setNewRoomBackgroundImage] = React.useState('');
  const [roomBackgroundUploading, setRoomBackgroundUploading] = React.useState(false);
  const [roomSaving, setRoomSaving] = React.useState(false);

  const [venues, setVenues] = React.useState<Venue[]>([]);
  const [editingVenue, setEditingVenue] = React.useState<Venue | null>(null);
  const [newVenueName, setNewVenueName] = React.useState('');
  const [venueSaving, setVenueSaving] = React.useState(false);

  const [meals, setMeals] = React.useState<Meal[]>([]);
  const [mealsLoading, setMealsLoading] = React.useState(false);
  const [editingMeal, setEditingMeal] = React.useState<Meal | null>(null);
  const [mealAdminFilterType, setMealAdminFilterType] = React.useState<string>('all');
  const [mealAdminFilterDay, setMealAdminFilterDay] = React.useState<string>('');

  const mealSessionDayOptions = React.useMemo(() => {
    const set = new Set<string>();
    meals.forEach((m) => {
      const raw = String(m.sessionDate || '').trim();
      if (raw) set.add(raw.slice(0, 10));
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [meals]);

  const filteredMeals = React.useMemo(() => {
    return meals.filter((m) => {
      if (mealAdminFilterType !== 'all' && m.type !== mealAdminFilterType) return false;
      if (mealAdminFilterDay) {
        const day = String(m.sessionDate || '').trim().slice(0, 10);
        if (day !== mealAdminFilterDay) return false;
      }
      return true;
    });
  }, [meals, mealAdminFilterType, mealAdminFilterDay]);

  type PresenterMaterial = {
    id: string;
    uid: string;
    presenterName?: string;
    roomId?: string;
    roomName?: string;
    fileName: string;
    storagePath: string;
    downloadUrl: string;
    fileType: string;
    fileSizeBytes: number;
    status: string;
    createdAt: any;
  };
  const [adminMaterials, setAdminMaterials] = React.useState<PresenterMaterial[]>([]);
  const [adminUploadRoomId, setAdminUploadRoomId] = React.useState('');
  const [adminUploadingFile, setAdminUploadingFile] = React.useState(false);
  const adminMaterialsInputRef = React.useRef<HTMLInputElement>(null);

  const adminInitials = (user.email || 'AD').slice(0, 2).toUpperCase();

  const boothRegs = React.useMemo(
    () => registrations.filter((r) => BOOTH_SECTORS.includes((r.sector as string) || '')),
    [registrations],
  );
  const exhibitorBoothRegs = React.useMemo(
    () => boothRegs.filter((r) => ['Exhibitor', 'Exhibitor (Booth)'].includes((r.sector as string) || '')),
    [boothRegs],
  );
  const foodBoothRegsList = React.useMemo(
    () => boothRegs.filter((r) => (r.sector as string) === 'Food (Booth)'),
    [boothRegs],
  );

  const exhibitorBoothFiltered = React.useMemo(() => {
    let list = exhibitorBoothRegs;
    if (boothExhibitorStatusFilter !== 'all') {
      list = list.filter((r) => ((r.status as string) || 'pending') === boothExhibitorStatusFilter);
    }
    const q = boothExhibitorSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) =>
      [
        r.fullName,
        r.email,
        r.sectorOffice,
        r.positionTitle,
        r.contactNumber,
        r.boothLocationDetails,
        r.boothDescription,
        r.boothProducts,
        r.sector,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [exhibitorBoothRegs, boothExhibitorStatusFilter, boothExhibitorSearch]);

  const foodBoothFiltered = React.useMemo(() => {
    let list = foodBoothRegsList;
    if (boothFoodStatusFilter !== 'all') {
      list = list.filter((r) => ((r.status as string) || 'pending') === boothFoodStatusFilter);
    }
    const q = boothFoodSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) =>
      [
        r.fullName,
        r.email,
        r.sectorOffice,
        r.positionTitle,
        r.contactNumber,
        r.boothLocationDetails,
        r.boothDescription,
        r.boothProducts,
        r.sector,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [foodBoothRegsList, boothFoodStatusFilter, boothFoodSearch]);

  const exhibitorBoothPageItems = React.useMemo(() => {
    const start = boothExhibitorPage * BOOTH_LIST_PAGE_SIZE;
    return exhibitorBoothFiltered.slice(start, start + BOOTH_LIST_PAGE_SIZE);
  }, [exhibitorBoothFiltered, boothExhibitorPage]);

  const foodBoothPageItems = React.useMemo(() => {
    const start = boothFoodPage * BOOTH_LIST_PAGE_SIZE;
    return foodBoothFiltered.slice(start, start + BOOTH_LIST_PAGE_SIZE);
  }, [foodBoothFiltered, boothFoodPage]);

  const exhibitorBoothTotalPages =
    exhibitorBoothFiltered.length === 0 ? 0 : Math.ceil(exhibitorBoothFiltered.length / BOOTH_LIST_PAGE_SIZE);
  const foodBoothTotalPages =
    foodBoothFiltered.length === 0 ? 0 : Math.ceil(foodBoothFiltered.length / BOOTH_LIST_PAGE_SIZE);

  React.useEffect(() => {
    setBoothExhibitorPage(0);
  }, [boothExhibitorSearch, boothExhibitorStatusFilter]);
  React.useEffect(() => {
    setBoothFoodPage(0);
  }, [boothFoodSearch, boothFoodStatusFilter]);

  React.useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(exhibitorBoothFiltered.length / BOOTH_LIST_PAGE_SIZE) - 1);
    if (boothExhibitorPage > maxPage) setBoothExhibitorPage(maxPage);
  }, [exhibitorBoothFiltered.length, boothExhibitorPage]);

  React.useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(foodBoothFiltered.length / BOOTH_LIST_PAGE_SIZE) - 1);
    if (boothFoodPage > maxPage) setBoothFoodPage(maxPage);
  }, [foodBoothFiltered.length, boothFoodPage]);

  const foodBoothRegs = React.useMemo(
    () => registrations.filter((r) => (r.sector as string) === 'Food (Booth)' && (r.status as string) === 'approved' && r.uid),
    [registrations],
  );
  const allBoothRegs = React.useMemo(
    () => registrations.filter((r) => BOOTH_SECTORS.includes((r.sector as string) || '') && (r.status as string) === 'approved' && r.uid),
    [registrations],
  );
  const presenterRegs = React.useMemo(
    () => registrations.filter((r) => (r.sector as string) === 'Speakers'),
    [registrations],
  );
  const presenterOptions = React.useMemo(
    () => {
      const speakerNames = presenterRegs
        .map((registration) => String(registration.fullName || '').trim())
        .filter(Boolean);
      const uniqueSpeakerNames = Array.from(new Set(speakerNames)) as string[];
      return uniqueSpeakerNames.sort((a, b) => a.localeCompare(b));
    },
    [presenterRegs],
  );
  const declinedCount = React.useMemo(
    () => registrations.filter((r) => (r.status as string) === 'declined').length,
    [registrations],
  );

  const allRoleOptions = React.useMemo(
    () => Array.from(new Set([...ROLE_OPTIONS, ...sectorFilterOptions])).filter(Boolean).sort(),
    [sectorFilterOptions],
  );
  const analyticsRoleOptions = React.useMemo(
    () => ['all', ...Array.from(new Set(registrations.map((r) => String(r.sector || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b))],
    [registrations],
  );

  const registrationsView = React.useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return filteredRegistrations;
    return filteredRegistrations.filter((r) =>
      [
        r.fullName,
        r.email,
        r.sector,
        r.contactNumber,
        r.positionTitle,
        r.sectorOffice,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [filteredRegistrations, searchText]);

  const analyticsWindow = React.useMemo(() => {
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);
    if (analyticsDayFilter === 'today') {
      return { start: startOfToday, end: endOfToday };
    }
    if (analyticsDayFilter === 'last7') {
      const start = new Date(startOfToday);
      start.setDate(start.getDate() - 6);
      return { start, end: endOfToday };
    }
    if (analyticsDayFilter === 'last30') {
      const start = new Date(startOfToday);
      start.setDate(start.getDate() - 29);
      return { start, end: endOfToday };
    }
    if (analyticsDayFilter === 'custom') {
      const start = analyticsDateFrom ? new Date(`${analyticsDateFrom}T00:00:00`) : null;
      const end = analyticsDateTo ? new Date(`${analyticsDateTo}T23:59:59`) : null;
      return { start, end };
    }
    return { start: null as Date | null, end: null as Date | null };
  }, [analyticsDayFilter, analyticsDateFrom, analyticsDateTo]);

  const withinAnalyticsWindow = React.useCallback(
    (value: any) => {
      const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
      if (!date || Number.isNaN(date.getTime())) return false;
      const { start, end } = analyticsWindow;
      if (start && date < start) return false;
      if (end && date > end) return false;
      return true;
    },
    [analyticsWindow],
  );

  const analyticsRegs = React.useMemo(() => {
    return registrations.filter((r) => {
      if (analyticsRoleFilter !== 'all' && String(r.sector || '') !== analyticsRoleFilter) return false;
      if (!withinAnalyticsWindow(r.createdAt)) return false;
      return true;
    });
  }, [registrations, analyticsRoleFilter, withinAnalyticsWindow]);

  const analyticsRooms = React.useMemo(() => {
    return rooms.filter((room) => {
      if (analyticsEventFilter !== 'all' && analyticsEventFilter !== 'breakouts') return false;
      if (analyticsRoleFilter !== 'all') {
        const presenterMatches = registrations.some(
          (reg) =>
            String(reg.sector || '') === analyticsRoleFilter &&
            ((room.presenterUids || []).includes(reg.uid) || (room.presenterNames || []).includes(String(reg.fullName || ''))),
        );
        if (!presenterMatches) return false;
      }
      if (analyticsDayFilter === 'all') return true;
      if (!room.sessionDate) return false;
      return withinAnalyticsWindow(new Date(`${room.sessionDate}T12:00:00`));
    });
  }, [rooms, analyticsEventFilter, analyticsRoleFilter, registrations, analyticsDayFilter, withinAnalyticsWindow]);

  const analyticsMeals = React.useMemo(() => {
    return meals.filter((meal) => {
      if (analyticsEventFilter !== 'all' && analyticsEventFilter !== 'meals') return false;
      if (analyticsDayFilter === 'all') return true;
      if (!meal.sessionDate) return false;
      return withinAnalyticsWindow(new Date(`${meal.sessionDate}T12:00:00`));
    });
  }, [meals, analyticsEventFilter, analyticsDayFilter, withinAnalyticsWindow]);

  const analyticsTotals = React.useMemo(() => {
    const approved = analyticsRegs.filter((r) => String(r.status || '') === 'approved').length;
    const pending = analyticsRegs.filter((r) => String(r.status || 'pending') === 'pending').length;
    const declined = analyticsRegs.filter((r) => String(r.status || '') === 'declined').length;
    return {
      registrations: analyticsRegs.length,
      approved,
      pending,
      declined,
      rooms: analyticsRooms.length,
      meals: analyticsMeals.length,
    };
  }, [analyticsRegs, analyticsRooms.length, analyticsMeals.length]);

  const analyticsSectorBars = React.useMemo(() => {
    const total = analyticsTotals.registrations || 1;
    return analyticsRoleOptions
      .filter((sector) => sector !== 'all')
      .map((sector) => {
        const count = analyticsRegs.filter((r) => String(r.sector || '') === sector).length;
        return { sector, count, pct: Math.round((count / total) * 100) };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [analyticsRoleOptions, analyticsRegs, analyticsTotals.registrations]);

  const analyticsDailySeries = React.useMemo(() => {
    const buckets = new Map<string, number>();
    analyticsRegs.forEach((r) => {
      const d = r.createdAt?.toDate ? r.createdAt.toDate() : r.createdAt ? new Date(r.createdAt) : null;
      if (!d || Number.isNaN(d.getTime())) return;
      const key = d.toISOString().slice(0, 10);
      buckets.set(key, (buckets.get(key) || 0) + 1);
    });
    return Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-10)
      .map(([date, count]) => ({ date, count }));
  }, [analyticsRegs]);

  React.useEffect(() => {
    if (activeTab !== 'analytics') return;
    // #region agent log
    fetch('http://127.0.0.1:7397/ingest/56484124-7df3-4537-80fa-738427537570', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'ec45ad' },
      body: JSON.stringify({
        sessionId: 'ec45ad',
        runId: 'admin-analytics-filters-charts',
        hypothesisId: 'A1_A2_A3',
        location: 'src/AdminDashboard.tsx:analyticsFiltersEffect',
        message: 'Analytics filters and chart data snapshot',
        data: {
          analyticsDayFilter,
          analyticsRoleFilter,
          analyticsEventFilter,
          analyticsDateFrom,
          analyticsDateTo,
          registrationCount: analyticsTotals.registrations,
          sectorBars: analyticsSectorBars.length,
          dailyPoints: analyticsDailySeries.length,
          roomsCount: analyticsTotals.rooms,
          mealsCount: analyticsTotals.meals,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, [
    activeTab,
    analyticsDayFilter,
    analyticsRoleFilter,
    analyticsEventFilter,
    analyticsDateFrom,
    analyticsDateTo,
    analyticsTotals.registrations,
    analyticsTotals.rooms,
    analyticsTotals.meals,
    analyticsSectorBars.length,
    analyticsDailySeries.length,
  ]);

  React.useEffect(() => {
    if (activeTab !== 'registrations') return;
    const sample = registrationsView.slice(0, 5).map((r) => ({
      id: r.id,
      fullName: r.fullName || null,
      profilePictureUrl: r.profilePictureUrl || null,
      photoURL: r.photoURL || null,
      avatarUrl: r.avatarUrl || null,
      proofOfPaymentPath: r.proofOfPaymentPath || null,
      proofOfPaymentUrl: r.proofOfPaymentUrl || null,
      paymentProofUrl: r.paymentProofUrl || null,
      receiptUrl: r.receiptUrl || null,
    }));
    // #region agent log
    fetch('http://127.0.0.1:7397/ingest/56484124-7df3-4537-80fa-738427537570', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'ec45ad' },
      body: JSON.stringify({
        sessionId: 'ec45ad',
        runId: 'registrations-media-debug',
        hypothesisId: 'H1_H2_H3',
        location: 'src/AdminDashboard.tsx:registrationsViewEffect',
        message: 'Registration media fields snapshot',
        data: {
          total: registrationsView.length,
          profilePictureUrlCount: registrationsView.filter((r) => Boolean(r.profilePictureUrl)).length,
          photoURLCount: registrationsView.filter((r) => Boolean(r.photoURL)).length,
          avatarUrlCount: registrationsView.filter((r) => Boolean(r.avatarUrl)).length,
          proofOfPaymentPathCount: registrationsView.filter((r) => Boolean(r.proofOfPaymentPath)).length,
          proofOfPaymentUrlCount: registrationsView.filter((r) => Boolean(r.proofOfPaymentUrl)).length,
          paymentProofUrlCount: registrationsView.filter((r) => Boolean(r.paymentProofUrl)).length,
          receiptUrlCount: registrationsView.filter((r) => Boolean(r.receiptUrl)).length,
          sample,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, [activeTab, registrationsView]);

  React.useEffect(() => {
    if (!registrations.length) return;
    const first = registrations[0];
    // #region agent log
    fetch('http://127.0.0.1:7397/ingest/56484124-7df3-4537-80fa-738427537570', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'ec45ad' },
      body: JSON.stringify({
        sessionId: 'ec45ad',
        runId: 'registrations-media-debug',
        hypothesisId: 'H4',
        location: 'src/AdminDashboard.tsx:registrationsRawEffect',
        message: 'Raw registrations loaded',
        data: {
          activeTab,
          total: registrations.length,
          firstId: first.id || null,
          firstName: first.fullName || null,
          firstProfilePictureUrl: first.profilePictureUrl || null,
          firstPhotoURL: first.photoURL || null,
          firstAvatarUrl: first.avatarUrl || null,
          firstProofPath: first.proofOfPaymentPath || null,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, [registrations, activeTab]);

  React.useEffect(() => {
    if (!editingRegistration) return;
    // #region agent log
    fetch('http://127.0.0.1:7397/ingest/56484124-7df3-4537-80fa-738427537570', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'ec45ad' },
      body: JSON.stringify({
        sessionId: 'ec45ad',
        runId: 'manage-participant-media-debug',
        hypothesisId: 'H1_H2_H3_H4',
        location: 'src/AdminDashboard.tsx:editingRegistrationEffect',
        message: 'Manage Participant media fields snapshot',
        data: {
          id: editingRegistration.id || null,
          fullName: editingRegistration.fullName || null,
          sector: editingRegistration.sector || null,
          profilePictureUrl: editingRegistration.profilePictureUrl || null,
          profilePhotoURL: editingRegistration.profilePhotoURL || null,
          photoURL: editingRegistration.photoURL || null,
          avatarUrl: editingRegistration.avatarUrl || null,
          avatar: editingRegistration.avatar || null,
          photoUrl: editingRegistration.photoUrl || null,
          proofOfPaymentPath: editingRegistration.proofOfPaymentPath || null,
          proofOfPaymentUrl: editingRegistration.proofOfPaymentUrl || null,
          paymentProofUrl: editingRegistration.paymentProofUrl || null,
          receiptUrl: editingRegistration.receiptUrl || null,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, [editingRegistration]);

  React.useEffect(() => {
    let cancelled = false;
    const loadProofPreview = async () => {
      if (!editingRegistration) {
        setProofPreviewUrl(null);
        setProofPreviewLoading(false);
        return;
      }
      const proofRef = getRegistrationProofRef(editingRegistration);
      if (!proofRef) {
        setProofPreviewUrl(null);
        setProofPreviewLoading(false);
        return;
      }
      setProofPreviewLoading(true);
      try {
        const resolvedUrl = /^https?:\/\//i.test(proofRef) ? proofRef : await getDownloadURL(ref(storage, proofRef));
        if (cancelled) return;
        setProofPreviewUrl(resolvedUrl);
        // #region agent log
        fetch('http://127.0.0.1:7397/ingest/56484124-7df3-4537-80fa-738427537570', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'ec45ad' },
          body: JSON.stringify({
            sessionId: 'ec45ad',
            runId: 'manage-participant-media-debug',
            hypothesisId: 'H5',
            location: 'src/AdminDashboard.tsx:proofPreviewEffect:success',
            message: 'Resolved proof preview URL',
            data: { registrationId: editingRegistration.id || null, hasPreviewUrl: Boolean(resolvedUrl), proofRef },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
      } catch (err) {
        if (cancelled) return;
        setProofPreviewUrl(null);
        // #region agent log
        fetch('http://127.0.0.1:7397/ingest/56484124-7df3-4537-80fa-738427537570', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'ec45ad' },
          body: JSON.stringify({
            sessionId: 'ec45ad',
            runId: 'manage-participant-media-debug',
            hypothesisId: 'H5',
            location: 'src/AdminDashboard.tsx:proofPreviewEffect:error',
            message: 'Failed resolving proof preview URL',
            data: { registrationId: editingRegistration.id || null, proofRef },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
      } finally {
        if (!cancelled) setProofPreviewLoading(false);
      }
    };
    void loadProofPreview();
    return () => {
      cancelled = true;
    };
  }, [editingRegistration]);

  const clearMessageSoon = React.useCallback((message: string) => {
    setActionMessage(message);
    window.setTimeout(() => setActionMessage(null), 3500);
  }, []);

  const handleExportPdfClick = React.useCallback(() => {
    if (!filteredRegistrations.length) {
      clearMessageSoon('No registrations to export. Clear sector/status filters or add participants first.');
      return;
    }
    onExportPdf();
  }, [filteredRegistrations.length, onExportPdf, clearMessageSoon]);

  const handleExportCsvClick = React.useCallback(() => {
    if (!filteredRegistrations.length) {
      clearMessageSoon('No registrations to export. Clear sector/status filters or add participants first.');
      return;
    }
    onExportCsv();
  }, [filteredRegistrations.length, onExportCsv, clearMessageSoon]);

  const loadRooms = React.useCallback(async () => {
    setRoomsLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'rooms'), orderBy('createdAt', 'desc')));
      setRooms(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Room, 'id'>) })));
    } catch (err) {
      console.error('loadRooms', err);
    } finally {
      setRoomsLoading(false);
    }
  }, []);

  const loadMeals = React.useCallback(async () => {
    setMealsLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'meals'), orderBy('createdAt', 'desc')));
      setMeals(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Meal, 'id'>) })));
    } catch (err) {
      console.error('loadMeals', err);
    } finally {
      setMealsLoading(false);
    }
  }, []);

  const venueNames = React.useMemo(
    () => venues.map((v) => v.name).sort((a, b) => a.localeCompare(b)),
    [venues],
  );
  const displayedVenueOptions = venueNames;

  React.useEffect(() => {
    loadRooms();
    loadMeals();
  }, [loadMeals, loadRooms]);

  React.useEffect(() => {
    const unsub = onSnapshot(collection(db, 'venues'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Venue, 'id'>) }));
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setVenues(list);
    });
    return () => unsub();
  }, []);

  React.useEffect(() => {
    setSidebarOpen(false);
  }, [activeTab]);

  React.useEffect(() => {
    if (!roomDetailView?.id) {
      setRoomDetailReviews([]);
      return;
    }
    let cancelled = false;
    setRoomDetailReviewsLoading(true);
    getDocs(query(collection(db, 'reviews'), where('roomId', '==', roomDetailView.id)))
      .then((snap) => {
        if (cancelled) return;
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })) as {
          id: string;
          participantName?: string;
          part4?: string;
          comment?: string;
          submittedAt?: any;
        }[];
        const ms = (r: (typeof list)[0]) =>
          r.submittedAt?.toMillis?.() ?? (r.submittedAt?.seconds != null ? r.submittedAt.seconds * 1000 : 0);
        list.sort((a, b) => ms(b) - ms(a));
        setRoomDetailReviews(list);
      })
      .catch(() => {
        if (!cancelled) setRoomDetailReviews([]);
      })
      .finally(() => {
        if (!cancelled) setRoomDetailReviewsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [roomDetailView?.id]);

  const roomIdForChat = chatModalRoom?.id ?? roomDetailView?.id;
  React.useEffect(() => {
    if (!roomIdForChat) {
      setRoomChatMessages([]);
      return;
    }
    const q = query(
      collection(db, 'roomChat'),
      where('roomId', '==', roomIdForChat),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setRoomChatMessages(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RoomChatMessage, 'id'>) })));
    });
    return () => unsub();
  }, [roomIdForChat]);

  React.useEffect(() => {
    if (activeTab !== 'materials') return;
    const q = query(collection(db, 'presenterMaterials'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setAdminMaterials(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PresenterMaterial, 'id'>) })));
    }, (err) => {
      console.error('presenterMaterials', err);
      setAdminMaterials([]);
    });
    return () => unsub();
  }, [activeTab]);

  const addSelectedPresenter = React.useCallback(() => {
    const presenterName = newRoomPresenterChoice.trim();
    if (!presenterName) return;
    setNewRoomSelectedPresenters((prev) =>
      prev.includes(presenterName) ? prev : [...prev, presenterName],
    );
    setNewRoomPresenterChoice('');
  }, [newRoomPresenterChoice]);

  const removeSelectedPresenter = React.useCallback((presenterName: string) => {
    setNewRoomSelectedPresenters((prev) => prev.filter((item) => item !== presenterName));
  }, []);

  const handleCreateVenue = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newVenueName.trim();
    if (!name) return;
    setVenueSaving(true);
    setActionMessage(null);
    try {
      await addDoc(collection(db, 'venues'), { name, order: venues.length });
      setNewVenueName('');
      setEditingVenue(null);
      clearMessageSoon('Room added.');
    } catch (err: any) {
      console.error('createVenue', err);
      const msg = err?.code === 'permission-denied'
        ? 'Permission denied. Deploy Firestore rules (firebase deploy --only firestore:rules) and ensure your account has the admin custom claim.'
        : `Failed to save room: ${err?.message || err}`;
      setActionMessage(msg);
      setTimeout(() => setActionMessage(null), 6000);
    } finally {
      setVenueSaving(false);
    }
  };

  const handleUpdateVenue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVenue) return;
    const name = newVenueName.trim();
    if (!name) return;
    setVenueSaving(true);
    try {
      await updateDoc(doc(db, 'venues', editingVenue.id), { name });
      setNewVenueName('');
      setEditingVenue(null);
      clearMessageSoon('Room updated.');
    } catch (err) {
      console.error('updateVenue', err);
    } finally {
      setVenueSaving(false);
    }
  };

  const handleDeleteVenue = async (id: string) => {
    if (!window.confirm('Delete this room? Breakout sessions using it will keep the name as custom text.')) return;
    try {
      await deleteDoc(doc(db, 'venues', id));
      if (editingVenue?.id === id) { setEditingVenue(null); setNewVenueName(''); }
      clearMessageSoon('Room deleted.');
    } catch (err) {
      console.error('deleteVenue', err);
    }
  };

  const openEditVenue = (venue: Venue) => {
    setEditingVenue(venue);
    setNewVenueName(venue.name);
  };

  const seedDefaultVenues = async () => {
    if (venues.length > 0) return;
    setVenueSaving(true);
    setActionMessage(null);
    try {
      for (let i = 0; i < DEFAULT_VENUE_OPTIONS.length; i++) {
        await addDoc(collection(db, 'venues'), { name: DEFAULT_VENUE_OPTIONS[i], order: i });
      }
      clearMessageSoon('Default rooms added.');
    } catch (err: any) {
      console.error('seedVenues', err);
      const msg = err?.code === 'permission-denied'
        ? 'Permission denied. Deploy Firestore rules and ensure your account has the admin claim.'
        : `Failed to load defaults: ${err?.message || err}`;
      setActionMessage(msg);
      setTimeout(() => setActionMessage(null), 6000);
    } finally {
      setVenueSaving(false);
    }
  };

  const handleAdminMaterialUpload = async (file: File, roomId?: string) => {
    if (!user?.uid || !file || file.size > 200 * 1024 * 1024) {
      setActionMessage('File too large (max 200 MB).');
      setTimeout(() => setActionMessage(null), 4000);
      return;
    }
    setAdminUploadingFile(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const storagePath = `presenterMaterials/${user.uid}/${Date.now()}_${safeName}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);
      const room = roomId ? rooms.find((r) => r.id === roomId) : undefined;
      await addDoc(collection(db, 'presenterMaterials'), {
        uid: user.uid,
        presenterName: user.email || 'Admin',
        roomId: roomId || null,
        roomName: room?.name || null,
        fileName: file.name,
        storagePath,
        downloadUrl,
        fileType: file.type,
        fileSizeBytes: file.size,
        status: 'uploaded',
        createdAt: Timestamp.now(),
      });
      clearMessageSoon(`Uploaded: ${file.name}`);
    } catch (err: any) {
      console.error('Admin material upload', err);
      setActionMessage(err?.code === 'permission-denied' ? 'Permission denied. Check storage rules.' : `Upload failed: ${err?.message || err}`);
      setTimeout(() => setActionMessage(null), 5000);
    } finally {
      setAdminUploadingFile(false);
    }
  };

  const handleAdminDeleteMaterial = async (mat: PresenterMaterial) => {
    if (!window.confirm(`Delete "${mat.fileName}"?`)) return;
    try {
      try {
        const storageRef = ref(storage, mat.storagePath);
        await deleteObject(storageRef);
      } catch (storageErr) {
        console.warn('Storage delete', storageErr);
      }
      await deleteDoc(doc(db, 'presenterMaterials', mat.id));
      clearMessageSoon('Material deleted.');
    } catch (err: any) {
      console.error('Delete material', err);
      setActionMessage(`Delete failed: ${err?.message || err}`);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    if (!newRoomStartTime || !newRoomEndTime) {
      setActionMessage('Please choose both a start time and an end time.');
      return;
    }
    const startMins = timeToMinutes(newRoomStartTime);
    const endMins = timeToMinutes(newRoomEndTime);
    if (startMins < 0 || endMins < 0 || endMins <= startMins) {
      setActionMessage('End time must be later than the start time.');
      return;
    }
    setRoomSaving(true);
    try {
      // #region agent log
      fetch('http://127.0.0.1:7397/ingest/56484124-7df3-4537-80fa-738427537570',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ec45ad'},body:JSON.stringify({sessionId:'ec45ad',runId:'admin-room-background',hypothesisId:'A1',location:'src/AdminDashboard.tsx:handleCreateRoom:start',message:'Create room requested',data:{hasBackgroundImage:!!newRoomBackgroundImage.trim(),roomName:newRoomName.trim()},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      const manualPresenterNames = newRoomPresenters
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      const presenterNames = Array.from(
        new Set([...newRoomSelectedPresenters, ...manualPresenterNames]),
      );
      const presenterUids = Array.from(
        new Set(
          presenterNames
            .map((name) => presenterRegs.find((r) => (r.fullName as string)?.trim() === name)?.uid)
            .filter((uid): uid is string => !!uid),
        ),
      );
      const presenterTitles = presenterNames
        .map((name) => presenterRegs.find((r) => (r.fullName as string)?.trim() === name)?.positionTitle as string | undefined)
        .map((t) => (t && String(t).trim()) || undefined);
      const timeline = `${newRoomStartTime} - ${newRoomEndTime}`;
      const venue = newRoomVenue?.trim() || '';
      const payload: Record<string, any> = {
        name: newRoomName.trim(),
        ...(venue && { venue }),
        capacity: parseInt(newRoomCapacity, 10) || 0,
        description: newRoomDesc.trim(),
        timeline,
        sessionDate: newRoomDate,
        materials: '',
        presenterNames,
        ...(presenterUids.length > 0 && { presenterUids }),
        ...(presenterTitles.some(Boolean) && { presenterTitles: presenterTitles.map((t) => t ?? null) }),
        ...(newRoomBackgroundImage.trim() && { backgroundImage: newRoomBackgroundImage.trim() }),
        projectDetail: null,
        certificateProcessSteps: null,
        createdAt: Timestamp.now(),
      };
      Object.keys(payload).forEach((k) => { if (payload[k] === undefined) delete payload[k]; });
      const docRef = await addDoc(collection(db, 'rooms'), payload);
      const createdRoom = { id: docRef.id, ...payload };
      setRooms((prev) => [createdRoom, ...prev]);
      setSelectedQrRoom(createdRoom);
      setNewRoomName('');
      setNewRoomVenue('');
      setNewRoomCapacity('');
      setNewRoomDesc('');
      setNewRoomStartTime('');
      setNewRoomEndTime('');
      setNewRoomDate('');
      setNewRoomPresenterChoice('');
      setNewRoomSelectedPresenters([]);
      setNewRoomPresenters('');
      setNewRoomBackgroundImage('');
      clearMessageSoon('Breakout room created.');
    } catch (err) {
      console.error('createRoom', err);
    } finally {
      setRoomSaving(false);
    }
  };

  const handleDeleteRoom = async (id: string) => {
    if (!window.confirm('Delete this breakout room?')) return;
    try {
      await deleteDoc(doc(db, 'rooms', id));
      setRooms((prev) => prev.filter((room) => room.id !== id));
      if (selectedQrRoom?.id === id) setSelectedQrRoom(null);
      if (editingRoom?.id === id) setEditingRoom(null);
      if (roomDetailView?.id === id) setRoomDetailView(null);
      if (chatModalRoom?.id === id) setChatModalRoom(null);
      clearMessageSoon('Breakout room deleted.');
    } catch (err) {
      console.error('deleteRoom', err);
    }
  };

  const openEditRoom = (room: Room) => {
    setEditingRoom(room);
    setNewRoomName(room.name);
    const venueMatch = room.venue && displayedVenueOptions.includes(room.venue) ? room.venue : '';
    setNewRoomVenue(venueMatch);
    setNewRoomCapacity(String(room.capacity || ''));
    setNewRoomDesc(room.description || '');
    setNewRoomDate(room.sessionDate || '');
    const names = room.presenterNames || [];
    const registeredSet = new Set(presenterOptions.map((n) => n.trim().toLowerCase()));
    const fromDropdown = names.filter((n) => registeredSet.has(String(n).trim().toLowerCase()));
    const manual = names.filter((n) => !registeredSet.has(String(n).trim().toLowerCase()));
    setNewRoomSelectedPresenters(fromDropdown);
    setNewRoomPresenters(manual.join(', '));
    setNewRoomBackgroundImage(room.backgroundImage || '');
    const [start, end] = (room.timeline || '').split(/\s*-\s*/);
    setNewRoomStartTime(start?.trim() || '');
    setNewRoomEndTime(end?.trim() || '');
  };

  const closeEditRoom = () => {
    setEditingRoom(null);
    setNewRoomName('');
    setNewRoomVenue('');
    setNewRoomCapacity('');
    setNewRoomDesc('');
    setNewRoomStartTime('');
    setNewRoomEndTime('');
    setNewRoomDate('');
    setNewRoomPresenterChoice('');
    setNewRoomSelectedPresenters([]);
    setNewRoomPresenters('');
    setNewRoomBackgroundImage('');
  };

  const handleUpdateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRoom) return;
    if (!newRoomName.trim()) return;
    if (!newRoomStartTime || !newRoomEndTime) {
      setActionMessage('Please choose both a start time and an end time.');
      return;
    }
    const startMins = timeToMinutes(newRoomStartTime);
    const endMins = timeToMinutes(newRoomEndTime);
    if (startMins < 0 || endMins < 0 || endMins <= startMins) {
      setActionMessage('End time must be later than the start time.');
      return;
    }
    setRoomSaving(true);
    try {
      // #region agent log
      fetch('http://127.0.0.1:7397/ingest/56484124-7df3-4537-80fa-738427537570',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ec45ad'},body:JSON.stringify({sessionId:'ec45ad',runId:'admin-room-background',hypothesisId:'A2',location:'src/AdminDashboard.tsx:handleUpdateRoom:start',message:'Update room requested',data:{roomId:editingRoom.id,hasBackgroundImage:!!newRoomBackgroundImage.trim()},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      const manualPresenterNames = newRoomPresenters.split(',').map((p) => p.trim()).filter(Boolean);
      const presenterNames = Array.from(new Set([...newRoomSelectedPresenters, ...manualPresenterNames]));
      const presenterUids = Array.from(
        new Set(
          presenterNames
            .map((name) => presenterRegs.find((r) => (r.fullName as string)?.trim() === name)?.uid)
            .filter((uid): uid is string => !!uid),
        ),
      );
      const presenterTitles = presenterNames
        .map((name) => presenterRegs.find((r) => (r.fullName as string)?.trim() === name)?.positionTitle as string | undefined)
        .map((t) => (t && String(t).trim()) || undefined);
      const timeline = `${newRoomStartTime} - ${newRoomEndTime}`;
      const venueValue = newRoomVenue?.trim() || '';
      const payload: Record<string, any> = {
        name: newRoomName.trim(),
        venue: venueValue ? venueValue : deleteField(),
        capacity: parseInt(newRoomCapacity, 10) || 0,
        description: newRoomDesc.trim(),
        timeline,
        sessionDate: newRoomDate,
        backgroundImage: newRoomBackgroundImage.trim() ? newRoomBackgroundImage.trim() : deleteField(),
        presenterNames,
        ...(presenterUids.length > 0 && { presenterUids }),
        ...(presenterTitles.some(Boolean) && { presenterTitles: presenterTitles.map((t) => t ?? null) }),
      };
      if (presenterUids.length === 0) payload.presenterUids = deleteField();
      Object.keys(payload).forEach((k) => { if (payload[k] === undefined) delete payload[k]; });
      await updateDoc(doc(db, 'rooms', editingRoom.id), payload);
      const payloadForState = { ...payload };
      if (presenterUids.length === 0) delete payloadForState.presenterUids;
      const updated = { ...editingRoom, ...payloadForState };
      setRooms((prev) => prev.map((r) => (r.id === editingRoom.id ? updated : r)));
      if (selectedQrRoom?.id === editingRoom.id) setSelectedQrRoom(updated);
      if (roomDetailView?.id === editingRoom.id) setRoomDetailView(updated);
      if (chatModalRoom?.id === editingRoom.id) setChatModalRoom(updated);
      closeEditRoom();
      clearMessageSoon('Breakout room updated.');
    } catch (err: any) {
      console.error('updateRoom', err);
      setActionMessage('Failed to update room. Please try again.');
      setTimeout(() => setActionMessage(null), 4000);
    } finally {
      setRoomSaving(false);
    }
  };

  const handleRoomBackgroundUpload = async (file: File) => {
    if (!user?.uid) {
      setActionMessage('Link account to upload room background.');
      return;
    }
    if (!file || !file.type.startsWith('image/')) {
      setActionMessage('Please choose an image file.');
      return;
    }
    setRoomBackgroundUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const path = `rooms/backgrounds/${user.uid}/${Date.now()}_${safeName}`;
      await uploadBytes(ref(storage, path), file, { contentType: file.type || 'image/jpeg' });
      const url = await getDownloadURL(ref(storage, path));
      setNewRoomBackgroundImage(url);
      // #region agent log
      fetch('http://127.0.0.1:7397/ingest/56484124-7df3-4537-80fa-738427537570',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ec45ad'},body:JSON.stringify({sessionId:'ec45ad',runId:'admin-room-background',hypothesisId:'A3',location:'src/AdminDashboard.tsx:handleRoomBackgroundUpload:success',message:'Room background uploaded',data:{storagePath:path,fileSize:file.size},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      clearMessageSoon('Room background uploaded.');
    } catch (err: any) {
      console.error('room background upload', err);
      // #region agent log
      fetch('http://127.0.0.1:7397/ingest/56484124-7df3-4537-80fa-738427537570',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ec45ad'},body:JSON.stringify({sessionId:'ec45ad',runId:'admin-room-background',hypothesisId:'A4',location:'src/AdminDashboard.tsx:handleRoomBackgroundUpload:error',message:'Room background upload failed',data:{errorMessage:err?.message || 'unknown'},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      setActionMessage(`Background upload failed: ${err?.message || err}`);
      setTimeout(() => setActionMessage(null), 5000);
    } finally {
      setRoomBackgroundUploading(false);
    }
  };

  const handleSaveMeal = async (payload: EntitlementFormPayload, mealId?: string) => {
    if (mealId) {
      const ref = doc(db, 'meals', mealId);
      const docPayload: Record<string, unknown> = {
        type: payload.type,
        itemType: payload.itemType,
        sessionDate: payload.sessionDate,
        startTime: payload.startTime,
        endTime: payload.endTime,
        name: payload.name?.trim() ? payload.name.trim() : deleteField(),
        location: payload.location?.trim() ? payload.location.trim() : deleteField(),
        foodLocationDetails: payload.foodLocationDetails?.trim() ? payload.foodLocationDetails.trim() : deleteField(),
        assignedBoothUid: payload.assignedBoothUid?.trim() ? payload.assignedBoothUid.trim() : deleteField(),
        eligibleSectors: payload.eligibleSectors?.length ? payload.eligibleSectors : deleteField(),
        eligibleParticipantIds: payload.eligibleParticipantIds?.length ? payload.eligibleParticipantIds : deleteField(),
      };
      await updateDoc(ref, docPayload);
      setMeals((prev) =>
        prev.map((m) => {
          if (m.id !== mealId) return m;
          const next: Meal = {
            ...m,
            type: payload.type,
            itemType: payload.itemType,
            sessionDate: payload.sessionDate,
            startTime: payload.startTime,
            endTime: payload.endTime,
          };
          if (payload.name?.trim()) next.name = payload.name.trim();
          else delete next.name;
          if (payload.location?.trim()) next.location = payload.location.trim();
          else delete next.location;
          if (payload.foodLocationDetails?.trim()) next.foodLocationDetails = payload.foodLocationDetails.trim();
          else delete next.foodLocationDetails;
          if (payload.assignedBoothUid?.trim()) next.assignedBoothUid = payload.assignedBoothUid.trim();
          else delete next.assignedBoothUid;
          if (payload.eligibleSectors?.length) next.eligibleSectors = payload.eligibleSectors;
          else delete next.eligibleSectors;
          if (payload.eligibleParticipantIds?.length) next.eligibleParticipantIds = payload.eligibleParticipantIds;
          else delete next.eligibleParticipantIds;
          return next;
        }),
      );
      setEditingMeal(null);
      clearMessageSoon('Entitlement updated.');
      return;
    }

    const docPayload: Record<string, unknown> = {
      type: payload.type,
      itemType: payload.itemType,
      sessionDate: payload.sessionDate,
      startTime: payload.startTime,
      endTime: payload.endTime,
      createdAt: Timestamp.now(),
    };
    if (payload.name?.trim()) docPayload.name = payload.name.trim();
    if (payload.location?.trim()) docPayload.location = payload.location.trim();
    if (payload.foodLocationDetails?.trim()) docPayload.foodLocationDetails = payload.foodLocationDetails.trim();
    if (payload.assignedBoothUid?.trim()) docPayload.assignedBoothUid = payload.assignedBoothUid.trim();
    if (payload.eligibleSectors?.length) docPayload.eligibleSectors = payload.eligibleSectors;
    if (payload.eligibleParticipantIds?.length) docPayload.eligibleParticipantIds = payload.eligibleParticipantIds;

    Object.keys(docPayload).forEach((k) => {
      if (docPayload[k] === undefined) delete docPayload[k];
    });

    const docRef = await addDoc(collection(db, 'meals'), docPayload);
    setMeals((prev) => [{ id: docRef.id, ...docPayload } as Meal, ...prev]);
    clearMessageSoon('Entitlement created.');
  };

  const handleDeleteMeal = async (id: string) => {
    if (!window.confirm('Delete this meal window?')) return;
    try {
      await deleteDoc(doc(db, 'meals', id));
      setMeals((prev) => prev.filter((meal) => meal.id !== id));
      setEditingMeal((e) => (e?.id === id ? null : e));
      clearMessageSoon('Meal window deleted.');
    } catch (err) {
      console.error('deleteMeal', err);
    }
  };

  const handleViewProof = async (proofRef: string) => {
    setProofError(null);
    try {
      if (!proofRef) return;
      if (/^https?:\/\//i.test(proofRef)) {
        window.open(proofRef, '_blank', 'noopener,noreferrer');
        return;
      }
      const url = await getDownloadURL(ref(storage, proofRef));
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('viewProof', err);
      setProofError('Unable to open proof of payment. Check storage permissions.');
    }
  };

  const handleSaveRegistration = async () => {
    if (!editingRegistration?.id) return;
    setRegistrationSaving(true);
    try {
      const updates: Record<string, any> = {
        fullName: editingRegistration.fullName || '',
        email: editingRegistration.email || '',
        sector: editingRegistration.sector || '',
        status: editingRegistration.status || 'pending',
        positionTitle: editingRegistration.positionTitle || '',
        sectorOffice: editingRegistration.sectorOffice || '',
        contactNumber: editingRegistration.contactNumber || '',
        accommodationDetails: editingRegistration.accommodationDetails || '',
        travelDetails: editingRegistration.travelDetails || '',
        notes: editingRegistration.notes || '',
      };
      if (BOOTH_SECTORS.includes(editingRegistration.sector as string)) {
        updates.boothLocationDetails = String(editingRegistration.boothLocationDetails || '').trim();
      }
      if (['Exhibitor', 'Exhibitor (Booth)'].includes(editingRegistration.sector)) {
        updates.boothDescription = editingRegistration.boothDescription || '';
        updates.boothProducts = editingRegistration.boothProducts || '';
        updates.boothWebsite = editingRegistration.boothWebsite || '';
        updates.boothImageUrl = '';
        // #region agent log
        fetch('http://127.0.0.1:7397/ingest/56484124-7df3-4537-80fa-738427537570', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'ebc0f7' }, body: JSON.stringify({ sessionId: 'ebc0f7', runId: 'post-fix', hypothesisId: 'H-admin-save', location: 'AdminDashboard.tsx:handleSaveRegistration', message: 'booth registration boothImageUrl cleared', data: { sector: editingRegistration.sector, boothImageUrl: updates.boothImageUrl }, timestamp: Date.now() }) }).catch(() => {});
        // #endregion
        updates.boothBackgroundUrl = editingRegistration.boothBackgroundUrl || '';
        updates.boothCategory = (editingRegistration.boothCategory as string | undefined)?.trim() || '';
        updates.boothCategoryOther =
          editingRegistration.boothCategory === 'Other'
            ? String(editingRegistration.boothCategoryOther || '').trim()
            : '';
      }
      if (editingRegistration.sector === 'Food (Booth)') {
        updates.boothDescription = editingRegistration.boothDescription || '';
        updates.boothProducts = editingRegistration.boothProducts || '';
        updates.boothWebsite = editingRegistration.boothWebsite || '';
        updates.boothBackgroundUrl = editingRegistration.boothBackgroundUrl || '';
        updates.boothImageUrl = '';
        // #region agent log
        fetch('http://127.0.0.1:7397/ingest/56484124-7df3-4537-80fa-738427537570', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'ebc0f7' }, body: JSON.stringify({ sessionId: 'ebc0f7', runId: 'post-fix', hypothesisId: 'H-food-admin-save', location: 'AdminDashboard.tsx:handleSaveRegistration', message: 'food booth save boothImageUrl cleared', data: { sector: editingRegistration.sector, boothImageUrl: updates.boothImageUrl }, timestamp: Date.now() }) }).catch(() => {});
        // #endregion
      }
      await onSaveRegistration(editingRegistration.id, updates);
      const uid = editingRegistration.uid as string | undefined;
      if (uid) {
        try {
          if (updates.sector === 'Articles') {
            await setDoc(doc(db, 'articleCategoryEditors', uid), { updatedAt: Timestamp.now() }, { merge: true });
          } else {
            try {
              await deleteDoc(doc(db, 'articleCategoryEditors', uid));
            } catch {
              /* editor doc may not exist */
            }
          }
        } catch (syncErr) {
          console.error('articleCategoryEditors sync', syncErr);
        }
      }
      clearMessageSoon('Participant details updated.');
      setEditingRegistration(null);
    } catch (err) {
      console.error('saveRegistration', err);
      clearMessageSoon('Unable to save participant changes.');
    } finally {
      setRegistrationSaving(false);
    }
  };

  const handleDeleteRegistration = async () => {
    if (!editingRegistration?.id) return;
    setRegistrationDeleting(true);
    try {
      await onDeleteRegistration(editingRegistration);
      clearMessageSoon('Participant registration deleted.');
      setEditingRegistration(null);
    } catch (err) {
      console.error('deleteRegistration', err);
      clearMessageSoon('Unable to delete this registration.');
    } finally {
      setRegistrationDeleting(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!editingRegistration?.email) {
      clearMessageSoon('This participant has no email address saved.');
      return;
    }
    setPasswordResetting(true);
    try {
      await onSendPasswordReset(editingRegistration.email);
      clearMessageSoon('Password reset email sent.');
    } catch (err) {
      console.error('passwordReset', err);
      clearMessageSoon('Unable to send password reset email.');
    } finally {
      setPasswordResetting(false);
    }
  };

  const navItems: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    { id: 'registrations', label: 'Participants', icon: <Users size={18} />, badge: pendingRegistrations || undefined },
    { id: 'rooms', label: 'Breakout Rooms', icon: <DoorOpen size={18} /> },
    { id: 'meals', label: 'Meals & Food', icon: <UtensilsCrossed size={18} /> },
    { id: 'booths', label: 'Booths', icon: <Store size={18} /> },
    { id: 'materials', label: 'Training Materials', icon: <Package size={18} /> },
    { id: 'articles', label: 'Articles', icon: <Newspaper size={18} /> },
    { id: 'analytics', label: 'Analytics', icon: <BarChart3 size={18} /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex min-h-screen bg-slate-100 text-slate-900">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:relative lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-3 border-b border-slate-100 p-6">
          <img
            src="/iscene.png"
            alt="iSCENE 2026 logo"
            className="h-11 w-11 rounded-2xl bg-blue-50 object-contain"
          />
          <div>
            <h1 className="text-xl font-black tracking-tight">iSCENE 2026</h1>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-blue-600">Admin Portal</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-5 text-sm font-medium">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors ${
                activeTab === item.id
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>
              {item.badge !== undefined && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${activeTab === item.id ? 'bg-white/20 text-white' : 'bg-amber-400 text-white'}`}>
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="border-t border-slate-100 p-4">
          <div className="mb-3 flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 overflow-hidden">
              <img
                src="/iscene.png"
                alt="iSCENE admin"
                className="h-8 w-8 object-contain"
              />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{user.email || 'Admin'}</p>
              <p className="text-[11px] text-slate-500">Super Admin</p>
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

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 lg:hidden"
              >
                <Menu size={18} />
              </button>
              <div className="flex items-center gap-3">
                {activeTab === 'booths' && (
                  <img src="/iscene.png" alt="iSCENE 2026" className="h-8 w-auto object-contain hidden sm:block" />
                )}
                <div className="min-w-0">
                  <h2 className="text-xl font-black sm:text-2xl">
                    {activeTab === 'registrations'
                      ? 'Participant Registrations'
                      : activeTab === 'rooms'
                      ? 'Breakout Rooms'
                      : activeTab === 'meals'
                      ? 'Meals & Food'
                      : activeTab === 'booths'
                      ? 'Booth Management'
                      : activeTab === 'materials'
                      ? 'Training Materials'
                      : activeTab === 'articles'
                      ? 'Articles'
                      : activeTab === 'analytics'
                      ? 'Analytics'
                      : 'Event Overview'}
                  </h2>
                  <p className="text-xs text-slate-500 sm:text-sm">
                    {activeTab === 'registrations'
                      ? 'Edit participant details, roles, approval state, deletion, and password resets.'
                      : 'Responsive admin controls for mobile, tablet, and desktop.'}
                  </p>
                </div>
              </div>
            </div>
            {activeTab === 'registrations' && (
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleExportPdfClick}
                  className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 sm:gap-2 sm:px-4 sm:text-sm"
                >
                  <FileText size={15} className="shrink-0" />
                  PDF
                </button>
                <button
                  type="button"
                  onClick={handleExportCsvClick}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 sm:gap-2 sm:px-4 sm:text-sm"
                >
                  <Download size={15} className="shrink-0" />
                  CSV
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
          {actionMessage && (
            <div className={`mb-4 rounded-2xl border px-4 py-3 text-sm font-semibold ${actionMessage.includes('Permission') || actionMessage.includes('Failed') ? 'border-red-200 bg-red-50 text-red-700' : 'border-blue-100 bg-blue-50 text-blue-700'}`}>
              {actionMessage}
            </div>
          )}

          {activeTab === 'dashboard' && (
            <section>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Total Registrations" value={totalRegistrations} sub="All sectors" tone="blue" />
                <StatCard label="Pending Approval" value={pendingRegistrations} sub="Needs action" tone="amber" />
                <StatCard label="Approved" value={approvedRegistrations} sub="Ready to attend" tone="green" />
                <StatCard label="Breakout Rooms" value={rooms.length} sub="Configured rooms" tone="purple" />
              </div>

              <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="text-lg font-black">Registrations by Sector</h3>
                  <div className="mt-4 space-y-4">
                    {sectorFilterOptions.length === 0 && <p className="text-sm text-slate-400">No registrations yet.</p>}
                    {sectorFilterOptions.slice(0, 12).map((sector) => {
                      const count = registrations.filter((r) => r.sector === sector).length;
                      const pct = totalRegistrations ? Math.round((count / totalRegistrations) * 100) : 0;
                      return (
                        <div key={sector}>
                          <div className="mb-1 flex justify-between gap-3 text-sm">
                            <span className="truncate font-medium text-slate-700">{sector}</span>
                            <span className="shrink-0 font-bold text-blue-600">{count} ({pct}%)</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="text-lg font-black">Quick Status</h3>
                  <div className="mt-4 space-y-3">
                    {[
                      { label: 'Presenter registrations', value: presenterRegs.length },
                      { label: 'Booth registrations', value: boothRegs.length },
                      { label: 'Declined registrations', value: declinedCount },
                      { label: 'Breakout rooms created', value: rooms.length },
                      { label: 'Meal windows scheduled', value: meals.length },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                        <span className="text-sm text-slate-600">{label}</span>
                        <span className="text-sm font-black text-slate-900">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeTab === 'registrations' && (
            <section>
              <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <div className="relative md:col-span-2">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      placeholder="Search participant name, email, role, contact..."
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <select
                    value={filterSector}
                    onChange={(e) => onFilterSectorChange(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All sectors</option>
                    {sectorFilterOptions.map((sector) => (
                      <option key={sector} value={sector}>
                        {sector}
                      </option>
                    ))}
                  </select>
                  <select
                    value={filterStatus}
                    onChange={(e) => onFilterStatusChange(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All statuses</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="declined">Declined</option>
                  </select>
                </div>
                <p className="mt-3 text-xs font-medium text-slate-400">
                  Showing {registrationsView.length} of {totalRegistrations} participants
                  {registrationsView.length > 10 ? (
                    <span className="text-slate-400"> · Scroll the list below to see all</span>
                  ) : null}
                </p>
              </div>

              {proofError && (
                <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
                  {proofError}
                </div>
              )}

              <div
                className={
                  registrationsView.length > 10
                    ? 'max-h-[min(70vh,56rem)] space-y-3 overflow-y-auto overflow-x-hidden pr-1 lg:hidden'
                    : 'space-y-3 lg:hidden'
                }
              >
                {registrationsLoading && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400 shadow-sm">
                    Loading registrations...
                  </div>
                )}
                {!registrationsLoading && registrationsView.length === 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400 shadow-sm">
                    No registrations found.
                  </div>
                )}
                {!registrationsLoading &&
                  registrationsView.map((registration) => (
                    <div
                      key={registration.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setEditingRegistration({ ...registration })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setEditingRegistration({ ...registration });
                        }
                      }}
                      className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-200">
                            {getRegistrationProfileImage(registration) ? (
                              <img
                                src={getRegistrationProfileImage(registration)}
                                alt={registration.fullName || 'User'}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span className="text-xs font-black text-slate-600">{getInitials(registration.fullName || '')}</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-base font-black">{registration.fullName || '—'}</p>
                            <p className="truncate text-xs text-slate-500">{registration.email || '—'}</p>
                          </div>
                        </div>
                        <StatusBadge status={registration.status || 'pending'} />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${sectorColor(registration.sector || '')}`}>
                          {registration.sector || '—'}
                        </span>
                        {registration.positionTitle && (
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                            {registration.positionTitle}
                          </span>
                        )}
                      </div>
                      <div className="mt-3 space-y-1 text-xs text-slate-500">
                        <p>Contact: {registration.contactNumber || '—'}</p>
                        <p>Organization: {registration.sectorOffice || '—'}</p>
                        <p>Accommodation: {registration.accommodationDetails || '—'}</p>
                        <p>Travel / Flight: {registration.travelDetails || '—'}</p>
                        <p className="text-red-600">Food Allergy / Dietary: {registration.notes || '—'}</p>
                        <p>Date of Registration: {formatDateTime(registration.createdAt)}</p>
                        {registration.approvedAt && <p>Date of Approval: {formatDateTime(registration.approvedAt)}</p>}
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingRegistration({ ...registration });
                          }}
                          className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700"
                        >
                          <Pencil size={13} />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void onUpdateStatus(registration, 'approved');
                          }}
                          disabled={registration.status === 'approved'}
                          className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void onUpdateStatus(registration, 'declined');
                          }}
                          disabled={registration.status === 'declined'}
                          className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Decline
                        </button>
                        {getRegistrationProofRef(registration) ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleViewProof(getRegistrationProofRef(registration));
                            }}
                            className="flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700"
                          >
                            <Eye size={13} />
                            Proof
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
              </div>

              <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:block">
                <div
                  className={
                    registrationsView.length > 10
                      ? 'max-h-[min(70vh,56rem)] overflow-auto'
                      : 'overflow-x-auto'
                  }
                >
                  <table className="w-full min-w-[1180px] text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-black uppercase tracking-wider text-slate-500 shadow-[0_1px_0_0_rgb(241_245_249)]">
                      <tr>
                        <th className="px-4 py-3 text-left">Participant</th>
                        <th className="px-4 py-3 text-left">Role & Position</th>
                        <th className="px-4 py-3 text-left">Contact</th>
                        <th className="px-4 py-3 text-left">Organization</th>
                        <th className="px-4 py-3 text-left">Accommodation</th>
                        <th className="px-4 py-3 text-left">Travel / Flight</th>
                        <th className="px-4 py-3 text-left">Dietary</th>
                        <th className="px-4 py-3 text-left">Status</th>
                        <th className="px-4 py-3 text-left">Date of Registration</th>
                        <th className="px-4 py-3 text-left">Proof</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {registrationsLoading && (
                        <tr>
                          <td colSpan={11} className="px-4 py-10 text-center text-slate-400">
                            Loading registrations...
                          </td>
                        </tr>
                      )}
                      {!registrationsLoading && registrationsView.length === 0 && (
                        <tr>
                          <td colSpan={11} className="px-4 py-10 text-center text-slate-400">
                            No registrations found.
                          </td>
                        </tr>
                      )}
                      {!registrationsLoading &&
                        registrationsView.map((registration) => (
                          <tr
                            key={registration.id}
                            onClick={() => setEditingRegistration({ ...registration })}
                            className="cursor-pointer transition-colors hover:bg-blue-50/40"
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-200">
                                  {getRegistrationProfileImage(registration) ? (
                                    <img
                                      src={getRegistrationProfileImage(registration)}
                                      alt={registration.fullName || 'User'}
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    <span className="text-xs font-black text-slate-600">{getInitials(registration.fullName || '')}</span>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="truncate font-bold">{registration.fullName || '—'}</div>
                                  <div className="truncate text-xs text-slate-500">{registration.email || '—'}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col items-start gap-1">
                                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${sectorColor(registration.sector || '')}`}>
                                  {registration.sector || '—'}
                                </span>
                                {registration.positionTitle && (
                                  <span className="text-[10px] font-bold text-slate-500">
                                    {registration.positionTitle}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-600">{registration.contactNumber || '—'}</td>
                            <td className="px-4 py-3 text-xs text-slate-600 whitespace-pre-wrap">{registration.sectorOffice || '—'}</td>
                            <td className="px-4 py-3 text-xs text-slate-600">
                              <span className="block min-w-[120px] max-w-[220px] whitespace-pre-wrap" title={registration.accommodationDetails || ''}>
                                {registration.accommodationDetails || '—'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-600">
                              <span className="block min-w-[120px] max-w-[220px] whitespace-pre-wrap" title={registration.travelDetails || ''}>
                                {registration.travelDetails || '—'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs">
                              <span className="block min-w-[120px] max-w-[220px] whitespace-pre-wrap text-red-600" title={registration.notes || ''}>
                                {registration.notes || '—'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge status={registration.status || 'pending'} />
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-500">
                              <div>{formatDateTime(registration.createdAt)}</div>
                              {registration.approvedAt && (
                                <div className="text-emerald-600 mt-0.5" title="Approved at">✓ {formatDateTime(registration.approvedAt)}</div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {getRegistrationProofRef(registration) ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleViewProof(getRegistrationProofRef(registration));
                                  }}
                                  className="flex items-center gap-1 rounded-xl bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-100"
                                >
                                  <Eye size={13} />
                                  View
                                </button>
                              ) : (
                                <span className="text-xs text-slate-400">None</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  title="Edit participant"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingRegistration({ ...registration });
                                  }}
                                  className="rounded-lg bg-blue-50 p-2 text-blue-600 hover:bg-blue-100"
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  type="button"
                                  title="Approve"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void onUpdateStatus(registration, 'approved');
                                  }}
                                  disabled={registration.status === 'approved'}
                                  className="rounded-lg bg-emerald-50 p-2 text-emerald-600 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <CheckCircle2 size={14} />
                                </button>
                                <button
                                  type="button"
                                  title="Decline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void onUpdateStatus(registration, 'declined');
                                  }}
                                  disabled={registration.status === 'declined'}
                                  className="rounded-lg bg-red-50 p-2 text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <XCircle size={14} />
                                </button>
                                <button
                                  type="button"
                                  title="Reset to pending"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void onUpdateStatus(registration, 'pending');
                                  }}
                                  disabled={registration.status === 'pending' || !registration.status}
                                  className="rounded-lg bg-slate-100 p-2 text-slate-500 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <RefreshCw size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {activeTab === 'rooms' && (
            <section>
              <div id="create-room-form" className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="space-y-6">
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h4 className="mb-4 flex items-center gap-2 text-lg font-black">
                      {editingRoom ? <Pencil size={18} className="text-amber-600" /> : <Plus size={18} className="text-blue-600" />}
                      {editingRoom ? 'Edit Breakout Session' : 'Create Breakout Session'}
                    </h4>
                  <form onSubmit={editingRoom ? handleUpdateRoom : handleCreateRoom} className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label="Room Name *">
                        <input value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} required className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="AI & Smart Cities" />
                      </Field>
                      <Field label="Conduct Venue">
                        <select value={newRoomVenue} onChange={(e) => setNewRoomVenue(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                          <option value="">Select room where session will be held</option>
                          {displayedVenueOptions.map((v) => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label="Max Capacity">
                        <input value={newRoomCapacity} onChange={(e) => setNewRoomCapacity(e.target.value)} type="number" min="0" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="50" />
                      </Field>
                    </div>
                    <Field label="Description">
                      <textarea value={newRoomDesc} onChange={(e) => setNewRoomDesc(e.target.value)} rows={3} className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="Brief room description..." />
                    </Field>
                    <Field label="Background Image">
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <label className={`inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold cursor-pointer hover:bg-slate-50 ${roomBackgroundUploading ? 'opacity-60' : ''}`}>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              disabled={roomBackgroundUploading}
                              onChange={async (e) => {
                                const f = e.target.files?.[0];
                                e.currentTarget.value = '';
                                if (!f) return;
                                await handleRoomBackgroundUpload(f);
                              }}
                            />
                            {roomBackgroundUploading ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
                            {roomBackgroundUploading ? 'Uploading…' : 'Upload image'}
                          </label>
                          <button
                            type="button"
                            onClick={() => setNewRoomBackgroundImage('')}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                          >
                            Clear
                          </button>
                        </div>
                        <input
                          value={newRoomBackgroundImage}
                          onChange={(e) => setNewRoomBackgroundImage(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="https://... image url"
                        />
                        {newRoomBackgroundImage ? (
                          <div className="h-24 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                            <img src={newRoomBackgroundImage} alt="" className="h-full w-full object-contain" />
                          </div>
                        ) : null}
                      </div>
                    </Field>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label="Session Date">
                        <input value={newRoomDate} onChange={(e) => setNewRoomDate(e.target.value)} type="date" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                      </Field>
                      <Field label="Start Time">
                        <TimePicker value={newRoomStartTime} onChange={setNewRoomStartTime} placeholder="Choose start time" />
                      </Field>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label="End Time">
                        <TimePicker value={newRoomEndTime} onChange={setNewRoomEndTime} placeholder="Choose end time" />
                      </Field>
                      <Field label="Timeline Preview">
                        <div className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
                          {newRoomStartTime && newRoomEndTime ? `${newRoomStartTime} - ${newRoomEndTime}` : 'Choose start and end time'}
                        </div>
                      </Field>
                    </div>
                    <Field label="Presenter(s)">
                      <div className="space-y-3">
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <select value={newRoomPresenterChoice} onChange={(e) => setNewRoomPresenterChoice(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                            <option value="">Choose a registered speaker</option>
                            {presenterOptions.map((presenterName) => (
                              <option key={presenterName} value={presenterName}>
                                {presenterName}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={addSelectedPresenter}
                            className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-bold text-blue-600 transition-colors hover:bg-blue-100"
                          >
                            Add Speaker
                          </button>
                        </div>
                        {newRoomSelectedPresenters.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {newRoomSelectedPresenters.map((presenterName) => (
                              <button
                                key={presenterName}
                                type="button"
                                onClick={() => removeSelectedPresenter(presenterName)}
                                className="inline-flex items-center gap-2 rounded-full bg-purple-50 px-3 py-1 text-xs font-bold text-purple-700"
                              >
                                {presenterName}
                                <X size={12} />
                              </button>
                            ))}
                          </div>
                        )}
                        <input value={newRoomPresenters} onChange={(e) => setNewRoomPresenters(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="Type additional presenter names separated by commas" />
                        <p className="text-xs text-slate-400">
                          Pick from registered speakers above, then add any guest or manual names here if needed.
                        </p>
                      </div>
                    </Field>
                    <div className="flex gap-2">
                      <button type="submit" disabled={roomSaving} className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50">
                        {roomSaving ? (editingRoom ? 'Updating...' : 'Creating...') : (editingRoom ? 'Update Session' : 'Create Session & Generate QR')}
                      </button>
                      {editingRoom && <button type="button" onClick={closeEditRoom} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button>}
                    </div>
                  </form>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <h4 className="text-lg font-black">Breakout Sessions ({rooms.length})</h4>
                      <button
                        type="button"
                        onClick={() => { closeEditRoom(); document.getElementById('create-room-form')?.scrollIntoView({ behavior: 'smooth' }); }}
                        className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
                      >
                        <Plus size={18} />
                        Create Session
                      </button>
                    </div>
                    {roomsLoading && <p className="text-sm text-slate-400">Loading...</p>}
                    {!roomsLoading && rooms.length === 0 && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                        No breakout sessions yet. Use the form above to create one.
                      </div>
                    )}
                    <div className="max-h-[min(55vh,28rem)] overflow-y-auto overscroll-y-contain space-y-3 pr-1 [scrollbar-width:thin]">
                      {rooms.map((room) => (
                        <div key={room.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-black">{room.name}</p>
                                {room.capacity > 0 && (
                                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                                    {room.capacity} seats
                                  </span>
                                )}
                              </div>
                              {room.description && (
                                <div className="mt-1 max-h-[100px] overflow-y-auto">
                                  <p className="text-xs text-slate-500">{room.description}</p>
                                </div>
                              )}
                              <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
                                {room.venue && <span>{room.venue}</span>}
                                {room.sessionDate && <span>{room.sessionDate}</span>}
                                {room.timeline && <span>{room.timeline}</span>}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5 flex-wrap">
                              <button
                                type="button"
                                onClick={() => openEditRoom(room)}
                                className="flex items-center gap-1 rounded-xl bg-amber-500 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-amber-600 shadow-sm"
                              >
                                <Pencil size={12} />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedQrRoom(room)}
                                className="flex items-center gap-1 rounded-xl bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-100"
                              >
                                <QrCode size={12} />
                                View QR
                              </button>
                              <button
                                type="button"
                                onClick={() => setChatModalRoom(room)}
                                className="flex items-center gap-1 rounded-xl bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100"
                                title="View live chat"
                              >
                                <MessageCircle size={12} />
                                Chat
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteRoom(room.id)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                                title="Delete"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <h4 className="text-lg font-black">Rooms ({venues.length})</h4>
                      <form onSubmit={editingVenue ? handleUpdateVenue : handleCreateVenue} className="flex flex-wrap items-center gap-2">
                        <input
                          value={newVenueName}
                          onChange={(e) => setNewVenueName(e.target.value)}
                          placeholder={editingVenue ? 'Room name' : 'New room'}
                          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 w-36"
                        />
                        <button type="submit" disabled={venueSaving || !newVenueName.trim()} className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                          <Plus size={14} />
                          {venueSaving ? '...' : editingVenue ? 'Update' : 'Create Room'}
                        </button>
                        {editingVenue && (
                          <button type="button" onClick={() => { setEditingVenue(null); setNewVenueName(''); }} className="rounded-xl border border-slate-200 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
                            Cancel
                          </button>
                        )}
                      </form>
                    </div>
                    {venues.length === 0 ? (
                      <div className="space-y-3">
                        <button type="button" onClick={seedDefaultVenues} disabled={venueSaving} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">
                          Load default rooms
                        </button>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                          No rooms yet. Add above or load defaults. Rooms are venues where breakout sessions are held.
                        </div>
                      </div>
                    ) : (
                      <div className="max-h-[min(55vh,22rem)] overflow-y-auto overscroll-y-contain space-y-3 pr-1 [scrollbar-width:thin]">
                      {venues.map((v) => (
                        <div key={v.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 flex-1">
                              <p className="font-black line-clamp-2 break-words" title={v.name}>{v.name}</p>
                              <p className="mt-1 text-xs text-slate-500">Venue for breakout sessions</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5 flex-wrap">
                              <button
                                type="button"
                                onClick={() => openEditVenue(v)}
                                className="flex items-center gap-1 rounded-xl bg-amber-500 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-amber-600 shadow-sm"
                              >
                                <Pencil size={12} />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteVenue(v.id)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                                title="Delete"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col min-h-0">
                  <h4 className="mb-4 flex items-center gap-2 text-lg font-black shrink-0">
                    <QrCode size={18} className="text-blue-600" />
                    Main Entrance QR
                  </h4>
                  <div className="mb-6 flex flex-col items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/50 p-4 shrink-0">
                    <p className="text-sm font-semibold text-slate-700">Place this QR at the main entrance for self check-in</p>
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent('https://www.iscene.app/scan?type=entrance')}`}
                        alt="Main entrance QR"
                        className="h-44 w-44"
                      />
                    </div>
                    <a
                      href={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent('https://www.iscene.app/scan?type=entrance')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
                    >
                      <Download size={14} />
                      Download Main Entrance QR
                    </a>
                  </div>

                  <h4 className="mb-4 mt-6 flex items-center gap-2 text-lg font-black shrink-0">
                    <QrCode size={18} className="text-blue-600" />
                    Room QR Preview
                  </h4>
                  {selectedQrRoom ? (
                    <div className="flex flex-col items-center justify-center gap-3 text-center">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(`https://www.iscene.app/scan?type=room&id=${selectedQrRoom.id}`)}`}
                          alt={`QR for ${selectedQrRoom.name}`}
                          className="h-28 w-28"
                        />
                      </div>
                      <div>
                        <p className="font-black">{selectedQrRoom.name}</p>
                        <p className="text-xs text-slate-500">
                          {selectedQrRoom.timeline}
                          {selectedQrRoom.sessionDate ? ` · ${selectedQrRoom.sessionDate}` : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-center gap-2">
                        <a
                          href={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(`https://www.iscene.app/scan?type=room&id=${selectedQrRoom.id}`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
                        >
                          <Download size={14} />
                          Download QR
                        </a>
                        <button
                          type="button"
                          onClick={() => setSelectedQrRoom(null)}
                          className="rounded-full bg-slate-100 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-2 py-6 text-center text-slate-400">
                      <QrCode size={36} className="text-slate-200" />
                      <p className="max-w-xs text-xs">Select a session below to preview its QR.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

              {/* Edit Room Modal */}
              {editingRoom && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
                  <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden my-8">
                    <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                      <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                        <Pencil size={20} className="text-amber-600" />
                        Edit Breakout Session
                      </h3>
                      <button type="button" onClick={closeEditRoom} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200"><X size={18} /></button>
                    </div>
                    <form onSubmit={handleUpdateRoom} className="flex-1 overflow-y-auto p-5 space-y-4">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Field label="Room Name *">
                          <input value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} required className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="AI & Smart Cities" />
                        </Field>
                        <Field label="Conduct Venue">
                          <select value={newRoomVenue} onChange={(e) => setNewRoomVenue(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                            <option value="">Select room where session will be held</option>
                            {displayedVenueOptions.map((v) => (
                              <option key={v} value={v}>{v}</option>
                            ))}
                          </select>
                        </Field>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Field label="Max Capacity">
                          <input value={newRoomCapacity} onChange={(e) => setNewRoomCapacity(e.target.value)} type="number" min="0" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="50" />
                        </Field>
                      </div>
                      <Field label="Description">
                        <textarea value={newRoomDesc} onChange={(e) => setNewRoomDesc(e.target.value)} rows={3} className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="Brief room description..." />
                      </Field>
                      <Field label="Background Image">
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <label className={`inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold cursor-pointer hover:bg-slate-50 ${roomBackgroundUploading ? 'opacity-60' : ''}`}>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                disabled={roomBackgroundUploading}
                                onChange={async (e) => {
                                  const f = e.target.files?.[0];
                                  e.currentTarget.value = '';
                                  if (!f) return;
                                  await handleRoomBackgroundUpload(f);
                                }}
                              />
                              {roomBackgroundUploading ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
                              {roomBackgroundUploading ? 'Uploading…' : 'Upload image'}
                            </label>
                            <button
                              type="button"
                              onClick={() => setNewRoomBackgroundImage('')}
                              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                            >
                              Clear
                            </button>
                          </div>
                          <input
                            value={newRoomBackgroundImage}
                            onChange={(e) => setNewRoomBackgroundImage(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="https://... image url"
                          />
                          {newRoomBackgroundImage ? (
                            <div className="h-24 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                              <img src={newRoomBackgroundImage} alt="" className="h-full w-full object-contain" />
                            </div>
                          ) : null}
                        </div>
                      </Field>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Field label="Session Date">
                          <input value={newRoomDate} onChange={(e) => setNewRoomDate(e.target.value)} type="date" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                        </Field>
                        <Field label="Start Time">
                          <TimePicker value={newRoomStartTime} onChange={setNewRoomStartTime} placeholder="Choose start time" />
                        </Field>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Field label="End Time">
                          <TimePicker value={newRoomEndTime} onChange={setNewRoomEndTime} placeholder="Choose end time" />
                        </Field>
                        <Field label="Timeline">
                          <div className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
                            {newRoomStartTime && newRoomEndTime ? `${newRoomStartTime} - ${newRoomEndTime}` : 'Choose start and end time'}
                          </div>
                        </Field>
                      </div>
                      <Field label="Presenter(s)">
                        <div className="space-y-3">
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <select value={newRoomPresenterChoice} onChange={(e) => setNewRoomPresenterChoice(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                              <option value="">Choose a speaker</option>
                              {presenterOptions.map((n) => <option key={n} value={n}>{n}</option>)}
                            </select>
                            <button type="button" onClick={addSelectedPresenter} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-bold text-blue-600 hover:bg-blue-100">Add</button>
                          </div>
                          {newRoomSelectedPresenters.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {newRoomSelectedPresenters.map((name) => (
                                <button key={name} type="button" onClick={() => removeSelectedPresenter(name)} className="inline-flex items-center gap-2 rounded-full bg-purple-50 px-3 py-1 text-xs font-bold text-purple-700">
                                  {name}<X size={12} />
                                </button>
                              ))}
                            </div>
                          )}
                          <input value={newRoomPresenters} onChange={(e) => setNewRoomPresenters(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="Additional names (comma-separated)" />
                        </div>
                      </Field>
                      <div className="flex gap-2 pt-2">
                        <button type="submit" disabled={roomSaving} className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                          {roomSaving ? <><Loader2 size={16} className="animate-spin" /> Updating...</> : 'Update Room'}
                        </button>
                        <button type="button" onClick={closeEditRoom} disabled={roomSaving} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed">Cancel</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Room Detail Modal with Chat */}
              {roomDetailView && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                  <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[min(90dvh,calc(100dvh-2rem))] flex flex-col overflow-hidden">
                    <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-4 shrink-0">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-xl font-black text-slate-900">{roomDetailView.name}</h3>
                        <p className="text-sm text-slate-500 mt-1">{roomDetailView.timeline}{roomDetailView.sessionDate ? ` · ${roomDetailView.sessionDate}` : ''}</p>
                        {roomDetailView.presenterNames?.length > 0 && <p className="text-xs text-slate-400 mt-0.5">Speakers: {roomDetailView.presenterNames.join(', ')}</p>}
                      </div>
                      <button type="button" onClick={() => setRoomDetailView(null)} className="shrink-0 w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200"><X size={18} /></button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-5 space-y-6">
                      {roomDetailView.backgroundImage && (
                        <div className="rounded-xl overflow-hidden h-32 border border-slate-200">
                          <img src={roomDetailView.backgroundImage} alt="" className="w-full h-full object-contain bg-slate-100" />
                        </div>
                      )}
                      {roomDetailView.projectDetail && (
                        <div>
                          <h4 className="text-sm font-bold text-slate-700 mb-2">Project Detail</h4>
                          <p className="text-sm text-slate-600 whitespace-pre-wrap">{roomDetailView.projectDetail}</p>
                        </div>
                      )}
                      {roomDetailView.certificateProcessSteps && (
                        <div>
                          <h4 className="text-sm font-bold text-slate-700 mb-2">Certificate Process</h4>
                          <p className="text-sm text-slate-600 whitespace-pre-wrap">{roomDetailView.certificateProcessSteps}</p>
                        </div>
                      )}
                      <div>
                        <h4 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                          <MessageCircle size={16} /> Discussion Q&A ({roomChatMessages.length})
                        </h4>
                        <div className="rounded-xl border border-slate-200 bg-slate-50/50 max-h-48 overflow-y-auto p-3 space-y-3">
                          {roomChatMessages.length === 0 ? (
                            <p className="text-sm text-slate-400 text-center py-4">No questions yet. Participants can post questions from the room detail view.</p>
                          ) : (
                            roomChatMessages.map((msg) => (
                              <div key={msg.id} className="flex flex-col gap-0.5 p-3 rounded-lg bg-white border border-slate-100">
                                <p className="text-xs font-semibold text-slate-700">{msg.participantName || 'Anonymous'}</p>
                                <p className="text-sm text-slate-600">{msg.text}</p>
                                <p className="text-[10px] text-slate-400">
                                  {msg.createdAt?.toDate ? msg.createdAt.toDate().toLocaleString() : '—'}
                                </p>
                              </div>
                            ))
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2">Read-only for admin. Participants can add questions from their dashboard.</p>
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                          <Star size={16} className="text-amber-500" /> Session evaluations ({roomDetailReviews.length})
                        </h4>
                        {roomDetailReviewsLoading ? (
                          <p className="text-sm text-slate-400 py-4 flex items-center gap-2">
                            <Loader2 size={16} className="animate-spin" /> Loading reviews…
                          </p>
                        ) : roomDetailReviews.length === 0 ? (
                          <p className="text-sm text-slate-400 rounded-xl border border-slate-200 bg-slate-50/50 py-6 text-center">
                            No attendee evaluations yet for this session.
                          </p>
                        ) : (
                          <div className="rounded-xl border border-slate-200 bg-slate-50/50 max-h-56 overflow-y-auto p-3 space-y-3">
                            {roomDetailReviews.map((rev) => {
                              const text = rev.part4 || rev.comment;
                              return (
                                <div key={rev.id} className="flex flex-col gap-0.5 rounded-lg border border-slate-100 bg-white p-3">
                                  <p className="text-xs font-semibold text-slate-700">{rev.participantName || 'Attendee'}</p>
                                  {text ? <p className="text-sm text-slate-600 italic">&ldquo;{text}&rdquo;</p> : <p className="text-xs text-slate-400">(No written comments)</p>}
                                  <p className="text-[10px] text-slate-400">
                                    {rev.submittedAt?.toDate ? rev.submittedAt.toDate().toLocaleString() : '—'}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <p className="text-[10px] text-slate-400 mt-2">
                          Speakers see these in their portal after breakout rooms include their account in <strong>presenterUids</strong> (re-save the session in admin if needed).
                        </p>
                      </div>
                    </div>
                    <div className="p-5 border-t border-slate-100 flex gap-2 shrink-0">
                      <button type="button" onClick={() => { openEditRoom(roomDetailView); setRoomDetailView(null); }} className="flex-1 rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-white hover:bg-amber-600">Edit Room</button>
                      <button type="button" onClick={() => setRoomDetailView(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100">Close</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Chat / Live Q&A Modal */}
              {chatModalRoom && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
                  <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden my-8">
                    <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                      <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                        <MessageCircle size={20} className="text-blue-600" />
                        Live Chat — {chatModalRoom.name}
                      </h3>
                      <button type="button" onClick={() => setChatModalRoom(null)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200"><X size={18} /></button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-5">
                      <p className="text-xs text-slate-500 mb-3">Questions from participants in this breakout session.</p>
                      <div className="rounded-xl border border-slate-200 bg-slate-50/50 max-h-80 overflow-y-auto p-3 space-y-3">
                        {roomChatMessages.length === 0 ? (
                          <p className="text-sm text-slate-400 text-center py-8">No questions yet. Participants can post from the room view.</p>
                        ) : (
                          roomChatMessages.map((msg) => (
                            <div key={msg.id} className="flex flex-col gap-0.5 p-3 rounded-lg bg-white border border-slate-100">
                              <p className="text-xs font-semibold text-slate-700">{msg.participantName || 'Anonymous'}</p>
                              <p className="text-sm text-slate-600">{msg.text}</p>
                              <p className="text-[10px] text-slate-400">
                                {msg.createdAt?.toDate ? msg.createdAt.toDate().toLocaleString() : '—'}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          {activeTab === 'meals' && (
            <section>
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h4 className="mb-4 flex items-center gap-2 text-lg font-black">
                    {editingMeal ? (
                      <Pencil size={18} className="text-amber-600" />
                    ) : (
                      <Plus size={18} className="text-blue-600" />
                    )}
                    {editingMeal ? 'Edit Entitlement' : 'Create Entitlement'}
                  </h4>
                  <CreateEntitlementForm
                    key={editingMeal?.id ?? 'create-entitlement'}
                    initialMeal={editingMeal}
                    onCancelEdit={() => setEditingMeal(null)}
                    allBoothRegs={allBoothRegs}
                    allRoleOptions={allRoleOptions}
                    approvedRegistrations={filteredRegistrations.filter((r) => (r.status as string) === 'approved')}
                    onSubmit={handleSaveMeal}
                    onValidationError={clearMessageSoon}
                  />
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h4 className="mb-4 text-lg font-black">Food Booth Operators</h4>
                  {boothRegs.filter((r) => r.sector === 'Food (Booth)').length === 0 ? (
                    <p className="text-sm text-slate-400">No food booth registrations yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {boothRegs
                        .filter((r) => r.sector === 'Food (Booth)')
                        .map((registration) => (
                          <div key={registration.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold">{registration.fullName || '—'}</p>
                              <p className="truncate text-xs text-slate-500">{registration.sectorOffice || registration.email || '—'}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <StatusBadge status={registration.status || 'pending'} />
                              <button
                                type="button"
                                onClick={() => setEditingRegistration({ ...registration })}
                                className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-blue-600 hover:bg-blue-50"
                              >
                                Manage
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6">
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
                  <div>
                    <h4 className="text-lg font-black">Scheduled Entitlements</h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {mealsLoading
                        ? 'Loading…'
                        : filteredMeals.length === meals.length
                          ? `Showing ${meals.length} entitlement${meals.length === 1 ? '' : 's'}`
                          : `Showing ${filteredMeals.length} of ${meals.length} entitlements`}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <label className="flex flex-col gap-1 min-w-[160px]">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Meal type</span>
                      <select
                        value={mealAdminFilterType}
                        onChange={(e) => setMealAdminFilterType(e.target.value)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {MEAL_ADMIN_TYPE_FILTER_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 min-w-[160px]">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Session day</span>
                      <select
                        value={mealAdminFilterDay}
                        onChange={(e) => setMealAdminFilterDay(e.target.value)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">All days</option>
                        {mealSessionDayOptions.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </label>
                    {(mealAdminFilterType !== 'all' || mealAdminFilterDay !== '') && (
                      <button
                        type="button"
                        onClick={() => {
                          setMealAdminFilterType('all');
                          setMealAdminFilterDay('');
                        }}
                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 self-end sm:self-auto"
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                </div>
                {mealsLoading && <p className="text-sm text-slate-400">Loading entitlements...</p>}
                {!mealsLoading && meals.length === 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400 shadow-sm">
                    No entitlements yet. Use the form above to create one.
                  </div>
                )}
                {!mealsLoading && meals.length > 0 && filteredMeals.length === 0 && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center text-sm text-amber-900 shadow-sm">
                    No entitlements match the current filters. Try another meal type or day, or clear filters.
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredMeals.map((meal) => (
                    <div key={meal.id} className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div>
                        <p className="font-black">{meal.name || MEAL_LABELS[meal.type] || meal.type}</p>
                        <p className="mt-1 text-xs text-slate-500">{meal.sessionDate || '—'}</p>
                        {meal.startTime && meal.endTime && (
                          <p className="mt-1 text-xs font-semibold text-blue-600">
                            {formatMealTimeRangeForDisplay(meal.startTime, meal.endTime)}
                          </p>
                        )}
                        {meal.location && <p className="mt-1 text-xs text-slate-500">📍 Pickup / booth: {meal.location}</p>}
                        {meal.foodLocationDetails && (
                          <p className="mt-1 text-xs text-slate-600 whitespace-pre-wrap">🍽 {meal.foodLocationDetails}</p>
                        )}
                        {meal.assignedBoothUid && (() => {
                          const br = allBoothRegs.find((r) => r.uid === meal.assignedBoothUid);
                          const placement = br?.boothLocationDetails ? String(br.boothLocationDetails).trim() : '';
                          return (
                            <div className="mt-1 text-[10px] text-slate-500 space-y-0.5">
                              {placement ? (
                                <p className="text-slate-700">
                                  <span className="font-bold text-slate-600">Booth placement:</span> {placement}
                                </p>
                              ) : null}
                              <p>
                                <span className="font-bold text-slate-600">Staff booth:</span>{' '}
                                {br ? `${br.fullName || '—'} (${br.sector || '—'})` : 'Assigned'}
                              </p>
                            </div>
                          );
                        })()}
                        {meal.itemType && (
                          <span className={`mt-1 inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            meal.itemType === 'kit' ? 'bg-amber-100 text-amber-700' :
                            meal.itemType === 'both' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {meal.itemType === 'kit' ? 'Kit' : meal.itemType === 'both' ? 'Food & Kit' : 'Food'}
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          title="Edit"
                          onClick={() => setEditingMeal(meal)}
                          className="rounded-xl p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          onClick={() => handleDeleteMeal(meal.id)}
                          className="rounded-xl p-2 text-slate-400 hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {activeTab === 'booths' && (
            <section className="space-y-4">
              <p className="text-sm text-slate-500">
                Exhibitor and food booths are listed separately. Up to {BOOTH_LIST_PAGE_SIZE} per section; use search and status filters, then Previous / Next.
              </p>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                    <h4 className="text-lg font-black">Exhibitor Booths</h4>
                    <span className="rounded-full bg-cyan-50 px-3 py-1 text-[11px] font-black text-cyan-600">
                      {exhibitorBoothRegs.length}
                    </span>
                  </div>
                  <p className="px-5 pt-3 text-xs text-slate-500">Products, research & company booths — not food.</p>
                  <div className="px-5 pb-3 pt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input
                        type="search"
                        value={boothExhibitorSearch}
                        onChange={(e) => setBoothExhibitorSearch(e.target.value)}
                        placeholder="Search name, org, email, location…"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-cyan-500"
                      />
                    </div>
                    <select
                      value={boothExhibitorStatusFilter}
                      onChange={(e) =>
                        setBoothExhibitorStatusFilter(e.target.value as 'all' | 'pending' | 'approved' | 'declined')
                      }
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-cyan-500 sm:w-40"
                    >
                      <option value="all">All statuses</option>
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="declined">Declined</option>
                    </select>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {exhibitorBoothRegs.length === 0 && (
                      <p className="p-6 text-sm text-slate-400">No exhibitor registrations yet.</p>
                    )}
                    {exhibitorBoothRegs.length > 0 && exhibitorBoothFiltered.length === 0 && (
                      <p className="p-6 text-sm text-slate-400">No exhibitor booths match your search or filter.</p>
                    )}
                    {exhibitorBoothPageItems.map((registration) => (
                        <div key={registration.id}>
                          <div
                            className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-slate-50/50 transition-colors"
                            onClick={() => setExpandedExhibitorId((id) => (id === registration.id ? null : registration.id))}
                          >
                            <div className="flex shrink-0">
                              {registration.boothBackgroundUrl ? (
                                <img src={registration.boothBackgroundUrl} alt="Background" className="h-12 w-20 rounded-lg object-contain bg-slate-100 border border-slate-200" />
                              ) : (
                                <div className="h-12 w-20 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-300 text-[10px]">BG</div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-bold">{registration.fullName || '—'}</p>
                              <p className="truncate text-xs text-slate-500">{registration.sectorOffice || registration.email || '—'}</p>
                              {registration.boothLocationDetails ? (
                                <p className="truncate text-[11px] text-cyan-700 mt-0.5" title={String(registration.boothLocationDetails)}>
                                  📍 {String(registration.boothLocationDetails)}
                                </p>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                              <StatusBadge status={registration.status || 'pending'} />
                              <button
                                type="button"
                                onClick={() => setEditingRegistration({ ...registration })}
                                className="rounded-xl bg-cyan-500 px-3 py-2 text-xs font-bold text-white hover:bg-cyan-600"
                              >
                                Edit
                              </button>
                            </div>
                            <ChevronRight size={18} className={`shrink-0 text-slate-300 transition-transform ${expandedExhibitorId === registration.id ? 'rotate-90' : ''}`} />
                          </div>
                          {expandedExhibitorId === registration.id && (
                            <div className="border-t border-slate-100 bg-slate-50/80 px-5 py-4 space-y-4">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                                <div><p className="text-[11px] text-slate-400 mb-0.5">Booth location</p><p className="text-slate-700 whitespace-pre-wrap">{registration.boothLocationDetails || '—'}</p></div>
                                <div><p className="text-[11px] text-slate-400 mb-0.5">Description / Topic</p><p className="text-slate-700 whitespace-pre-wrap">{registration.boothDescription || '—'}</p></div>
                                <div><p className="text-[11px] text-slate-400 mb-0.5">Products / Services</p><p className="text-slate-700">{registration.boothProducts || '—'}</p></div>
                                <div><p className="text-[11px] text-slate-400 mb-0.5">Website</p>{registration.boothWebsite ? <a href={registration.boothWebsite} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{registration.boothWebsite}</a> : <span className="text-slate-500">—</span>}</div>
                                <div><p className="text-[11px] text-slate-400 mb-0.5">Contact</p><p className="text-slate-700">{registration.contactNumber || registration.email || '—'}</p></div>
                                <div><p className="text-[11px] text-slate-400 mb-0.5">Organization</p><p className="text-slate-700">{registration.sectorOffice || '—'}</p></div>
                              </div>
                              {registration.boothBackgroundUrl ? (
                                <div className="flex flex-wrap gap-2">
                                  <img src={registration.boothBackgroundUrl} alt="Background" className="h-16 w-24 rounded-xl object-contain bg-white border border-slate-200" />
                                </div>
                              ) : null}
                              <button type="button" onClick={() => setEditingRegistration({ ...registration })} className="rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-white hover:bg-cyan-600">
                                Edit Booth Details
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                  {exhibitorBoothRegs.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3 bg-slate-50/80">
                      <p className="text-[11px] text-slate-500">
                        {exhibitorBoothFiltered.length === 0
                          ? '—'
                          : `Showing ${boothExhibitorPage * BOOTH_LIST_PAGE_SIZE + 1}–${Math.min((boothExhibitorPage + 1) * BOOTH_LIST_PAGE_SIZE, exhibitorBoothFiltered.length)} of ${exhibitorBoothFiltered.length}`}
                        {exhibitorBoothTotalPages > 1 ? ` · Page ${boothExhibitorPage + 1} of ${exhibitorBoothTotalPages}` : null}
                      </p>
                      {exhibitorBoothTotalPages > 1 ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={boothExhibitorPage <= 0}
                            onClick={() => setBoothExhibitorPage((p) => Math.max(0, p - 1))}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Previous
                          </button>
                          <button
                            type="button"
                            disabled={boothExhibitorPage >= exhibitorBoothTotalPages - 1}
                            onClick={() => setBoothExhibitorPage((p) => p + 1)}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Next
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                    <h4 className="text-lg font-black">Food Booths</h4>
                    <span className="rounded-full bg-orange-50 px-3 py-1 text-[11px] font-black text-orange-600">
                      {foodBoothRegsList.length}
                    </span>
                  </div>
                  <p className="px-5 pt-3 text-xs text-slate-500">Food service & concessions only.</p>
                  <div className="px-5 pb-3 pt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input
                        type="search"
                        value={boothFoodSearch}
                        onChange={(e) => setBoothFoodSearch(e.target.value)}
                        placeholder="Search name, org, email, location…"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                    <select
                      value={boothFoodStatusFilter}
                      onChange={(e) =>
                        setBoothFoodStatusFilter(e.target.value as 'all' | 'pending' | 'approved' | 'declined')
                      }
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-orange-500 sm:w-40"
                    >
                      <option value="all">All statuses</option>
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="declined">Declined</option>
                    </select>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {foodBoothRegsList.length === 0 && (
                      <p className="p-6 text-sm text-slate-400">No food booth registrations yet.</p>
                    )}
                    {foodBoothRegsList.length > 0 && foodBoothFiltered.length === 0 && (
                      <p className="p-6 text-sm text-slate-400">No food booths match your search or filter.</p>
                    )}
                    {foodBoothPageItems.map((registration) => (
                        <div key={registration.id} className="flex items-center gap-3 px-5 py-4">
                          <div className="flex shrink-0">
                            {registration.boothBackgroundUrl ? (
                              <img src={registration.boothBackgroundUrl} alt="Background" className="h-12 w-20 rounded-lg object-cover border border-slate-200" />
                            ) : (
                              <div className="h-12 w-20 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-300 text-[10px]">BG</div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold">{registration.fullName || '—'}</p>
                            <p className="truncate text-xs text-slate-500">{registration.sectorOffice || registration.email || '—'}</p>
                            {registration.boothLocationDetails ? (
                              <p className="truncate text-[11px] text-orange-700 mt-0.5" title={String(registration.boothLocationDetails)}>
                                📍 {String(registration.boothLocationDetails)}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <StatusBadge status={registration.status || 'pending'} />
                            <button
                              type="button"
                              onClick={() => setEditingRegistration({ ...registration })}
                              className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
                            >
                              Manage
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                  {foodBoothRegsList.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3 bg-slate-50/80">
                      <p className="text-[11px] text-slate-500">
                        {foodBoothFiltered.length === 0
                          ? '—'
                          : `Showing ${boothFoodPage * BOOTH_LIST_PAGE_SIZE + 1}–${Math.min((boothFoodPage + 1) * BOOTH_LIST_PAGE_SIZE, foodBoothFiltered.length)} of ${foodBoothFiltered.length}`}
                        {foodBoothTotalPages > 1 ? ` · Page ${boothFoodPage + 1} of ${foodBoothTotalPages}` : null}
                      </p>
                      {foodBoothTotalPages > 1 ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={boothFoodPage <= 0}
                            onClick={() => setBoothFoodPage((p) => Math.max(0, p - 1))}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Previous
                          </button>
                          <button
                            type="button"
                            disabled={boothFoodPage >= foodBoothTotalPages - 1}
                            onClick={() => setBoothFoodPage((p) => p + 1)}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Next
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {activeTab === 'materials' && (
            <section className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h4 className="mb-4 text-lg font-black">Session Training Materials</h4>
                <p className="text-sm text-slate-500 mb-4">Upload files for breakout sessions. Participants see materials linked to sessions they reserved.</p>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:flex-wrap">
                  {rooms.length > 0 && (
                    <div className="sm:min-w-[200px]">
                      <label className="text-xs font-bold text-slate-600 mb-1 block">Link to breakout session</label>
                      <select
                        value={adminUploadRoomId}
                        onChange={(e) => setAdminUploadRoomId(e.target.value)}
                        className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <option value="">— Select session —</option>
                        {rooms.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}{r.venue ? ` · ${r.venue}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <input
                    ref={adminMaterialsInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    accept="image/*,video/*,.pdf,application/pdf"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      const roomId = adminUploadRoomId || undefined;
                      files.forEach((f) => handleAdminMaterialUpload(f, roomId));
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => adminMaterialsInputRef.current?.click()}
                    disabled={adminUploadingFile}
                    className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 shrink-0"
                  >
                    {adminUploadingFile ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                    {adminUploadingFile ? 'Uploading…' : 'Upload File(s)'}
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-2">JPG, PNG, MP4, PDF · Max 200 MB per file</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <h4 className="px-5 py-4 text-lg font-black border-b border-slate-100">All Materials ({adminMaterials.length})</h4>
                {adminMaterials.length === 0 ? (
                  <div className="py-16 text-center text-slate-400">
                    <Package size={40} className="mx-auto mb-3 text-slate-200" />
                    <p className="font-medium">No materials uploaded yet</p>
                    <p className="text-sm mt-1">Speakers and admin can upload training materials above.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px] text-left">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                          <th className="px-6 py-4 font-bold">File</th>
                          <th className="px-6 py-4 font-bold">Session</th>
                          <th className="px-6 py-4 font-bold">Uploaded by</th>
                          <th className="px-6 py-4 font-bold">Size</th>
                          <th className="px-6 py-4 font-bold">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {adminMaterials.map((mat) => (
                          <tr key={mat.id} className="hover:bg-slate-50">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                                  mat.fileType.startsWith('image/') ? 'bg-blue-100' : mat.fileType.startsWith('video/') ? 'bg-purple-100' : 'bg-red-100'
                                }`}>
                                  {mat.fileType.startsWith('image/') ? <ImageIcon size={18} className="text-blue-600" /> :
                                    mat.fileType.startsWith('video/') ? <Film size={18} className="text-purple-600" /> :
                                    <FileText size={18} className="text-red-600" />}
                                </div>
                                <div>
                                  <p className="text-sm font-bold truncate max-w-[200px]">{mat.fileName}</p>
                                  <p className="text-[11px] text-slate-400">
                                    {mat.createdAt?.toDate ? mat.createdAt.toDate().toLocaleDateString() : '—'}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-600">{mat.roomName || <span className="text-slate-300">—</span>}</td>
                            <td className="px-6 py-4 text-sm text-slate-500">{mat.presenterName || '—'}</td>
                            <td className="px-6 py-4 text-sm text-slate-500">
                              {mat.fileSizeBytes < 1024 ? `${mat.fileSizeBytes} B` :
                                mat.fileSizeBytes < 1024 * 1024 ? `${(mat.fileSizeBytes / 1024).toFixed(1)} KB` :
                                `${(mat.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <a href={mat.downloadUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700" title="Download">
                                  <Download size={18} />
                                </a>
                                <button type="button" onClick={() => handleAdminDeleteMaterial(mat)} className="text-slate-300 hover:text-red-500" title="Delete">
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          )}

          {activeTab === 'articles' && (
            <section className="overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-sm">
              <div className="relative overflow-hidden border-b border-violet-900/15 bg-gradient-to-r from-violet-600 via-indigo-600 to-violet-800 px-5 py-5">
                <div
                  className="pointer-events-none absolute inset-0 opacity-25 bg-[radial-gradient(ellipse_at_80%_0%,_white,transparent)]"
                  aria-hidden
                />
                <h4 className="relative text-lg font-black text-white drop-shadow-sm">Event articles</h4>
                <p className="relative mt-1 text-sm text-violet-100/95">
                  Manage articles, header images, and attachments. Authors (sector <strong className="text-white">Articles</strong>) only see their own posts.
                </p>
              </div>
              <div className="p-5">
                <ArticlesManager mode="admin" user={user} />
              </div>
            </section>
          )}

          {activeTab === 'analytics' && (
            <section>
              <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <select
                    value={analyticsDayFilter}
                    onChange={(e) => setAnalyticsDayFilter(e.target.value as 'all' | 'today' | 'last7' | 'last30' | 'custom')}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All days</option>
                    <option value="today">Today</option>
                    <option value="last7">Last 7 days</option>
                    <option value="last30">Last 30 days</option>
                    <option value="custom">Custom range</option>
                  </select>
                  <select
                    value={analyticsRoleFilter}
                    onChange={(e) => setAnalyticsRoleFilter(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {analyticsRoleOptions.map((role) => (
                      <option key={role} value={role}>
                        {role === 'all' ? 'All roles' : role}
                      </option>
                    ))}
                  </select>
                  <select
                    value={analyticsEventFilter}
                    onChange={(e) => setAnalyticsEventFilter(e.target.value as 'all' | 'registrations' | 'breakouts' | 'meals')}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All events</option>
                    <option value="registrations">Registration event</option>
                    <option value="breakouts">Breakout sessions</option>
                    <option value="meals">Meal events</option>
                  </select>
                  {analyticsDayFilter === 'custom' ? (
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={analyticsDateFrom}
                        onChange={(e) => setAnalyticsDateFrom(e.target.value)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="date"
                        value={analyticsDateTo}
                        onChange={(e) => setAnalyticsDateTo(e.target.value)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  ) : (
                    <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
                      Filter by day, role, and event source
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Total Registered" value={analyticsTotals.registrations} sub="Filtered registrations" tone="blue" />
                <StatCard
                  label="Approved"
                  value={analyticsTotals.approved}
                  sub={`${analyticsTotals.registrations ? Math.round((analyticsTotals.approved / analyticsTotals.registrations) * 100) : 0}% approval`}
                  tone="green"
                />
                <StatCard label="Pending" value={analyticsTotals.pending} sub="Awaiting review" tone="amber" />
                <StatCard label="Declined" value={analyticsTotals.declined} sub="Not approved" tone="purple" />
              </div>

              <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h4 className="text-lg font-black">Bar Chart: Registrations by Role</h4>
                  <div className="mt-4 space-y-4">
                    {analyticsSectorBars.map(({ sector, count, pct }) => {
                      const approved = analyticsRegs.filter((r) => String(r.sector || '') === sector && String(r.status || '') === 'approved').length;
                      return (
                        <div key={sector}>
                          <div className="mb-1 flex justify-between gap-3 text-sm">
                            <span className="truncate font-medium text-slate-700">{sector}</span>
                            <span className="text-xs font-bold text-slate-500">
                              {approved}/{count} approved
                            </span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h4 className="text-lg font-black">Chart: Daily Registration Trend</h4>
                  <div className="mt-4">
                    {analyticsDailySeries.length === 0 ? (
                      <div className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
                        No registration points for current filters.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {analyticsDailySeries.map((point) => {
                          const max = Math.max(...analyticsDailySeries.map((p) => p.count), 1);
                          const pct = Math.max(6, Math.round((point.count / max) * 100));
                          return (
                            <div key={point.date}>
                              <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                                <span>{point.date}</span>
                                <span className="font-bold text-slate-700">{point.count}</span>
                              </div>
                              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h4 className="text-lg font-black">Operational Snapshot (Filtered)</h4>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                  {[
                    { label: 'Filtered registrations', value: analyticsTotals.registrations },
                    { label: 'Breakout sessions (event filter)', value: analyticsTotals.rooms },
                    { label: 'Meal events (event filter)', value: analyticsTotals.meals },
                    { label: 'Booth operators', value: boothRegs.length },
                    { label: 'Pending approvals', value: analyticsTotals.pending },
                    { label: 'Declined', value: analyticsTotals.declined },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                      <span className="text-sm text-slate-600">{row.label}</span>
                      <span className="text-sm font-black text-slate-900">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-xs text-blue-700">
                Filters apply to registration-based charts and stats; event filter also controls breakout/meal event counters.
              </div>
            </section>
          )}
        </div>
      </main>

      {editingRegistration && (
        <>
          <button
            type="button"
            aria-label="Close participant editor"
            onClick={() => setEditingRegistration(null)}
            className="fixed inset-0 z-[60] bg-slate-950/50"
          />
          <div className="fixed inset-y-0 right-0 z-[70] w-full max-w-2xl overflow-y-auto border-l border-slate-200 bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
              <div>
                <h3 className="text-xl font-black">Manage Participant</h3>
                <p className="text-sm text-slate-500">Edit participant details, role, status, and account access.</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingRegistration(null)}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-6 p-5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 flex-col items-center text-center sm:flex-row sm:items-center sm:text-left">
                    <div className="mb-2 flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white sm:mb-0 sm:mr-3 sm:h-16 sm:w-16">
                      {getRegistrationProfileImage(editingRegistration) ? (
                        <img
                          src={getRegistrationProfileImage(editingRegistration)}
                          alt={editingRegistration.fullName || 'Participant'}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-base font-black text-slate-600">{getInitials(editingRegistration.fullName || '')}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-lg font-black text-slate-900">{editingRegistration.fullName || '—'}</p>
                      <p className="truncate text-sm text-slate-500">{editingRegistration.email || '—'}</p>
                      <div className="mt-1 flex justify-center sm:justify-start">
                        <StatusBadge status={editingRegistration.status || 'pending'} />
                      </div>
                    </div>
                  </div>
                  <div className="w-full rounded-xl border border-slate-200 bg-white p-3 sm:max-w-[220px]">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Proof of payment</p>
                    {proofPreviewLoading ? (
                      <p className="text-xs text-slate-400">Loading preview...</p>
                    ) : proofPreviewUrl ? (
                      <a href={proofPreviewUrl} target="_blank" rel="noopener noreferrer" className="block">
                        <img src={proofPreviewUrl} alt="Proof of payment" className="h-24 w-full rounded-lg border border-slate-200 bg-slate-100 object-contain" />
                      </a>
                    ) : (
                      <p className="text-xs text-slate-400">No proof uploaded</p>
                    )}
                    {getRegistrationProofRef(editingRegistration) ? (
                      <button
                        type="button"
                        onClick={() => handleViewProof(getRegistrationProofRef(editingRegistration))}
                        className="mt-2 inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-100"
                      >
                        <Eye size={13} />
                        View file
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Full Name">
                  <input
                    value={editingRegistration.fullName || ''}
                    onChange={(e) => setEditingRegistration((prev: any) => ({ ...prev, fullName: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </Field>
                <Field label="Email">
                  <input
                    value={editingRegistration.email || ''}
                    onChange={(e) => setEditingRegistration((prev: any) => ({ ...prev, email: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </Field>
                <Field label="Role / Sector">
                  <select
                    value={editingRegistration.sector || ''}
                    onChange={(e) => setEditingRegistration((prev: any) => ({ ...prev, sector: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {allRoleOptions.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Status">
                  <select
                    value={editingRegistration.status || 'pending'}
                    onChange={(e) => setEditingRegistration((prev: any) => ({ ...prev, status: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="declined">Declined</option>
                  </select>
                </Field>
                <Field label="Position Title">
                  <input
                    value={editingRegistration.positionTitle || ''}
                    onChange={(e) => setEditingRegistration((prev: any) => ({ ...prev, positionTitle: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </Field>
                <Field label="Organization / Office">
                  <input
                    value={editingRegistration.sectorOffice || ''}
                    onChange={(e) => setEditingRegistration((prev: any) => ({ ...prev, sectorOffice: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </Field>
                <Field label="Contact Number">
                  <input
                    value={editingRegistration.contactNumber || ''}
                    onChange={(e) => setEditingRegistration((prev: any) => ({ ...prev, contactNumber: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </Field>
                <Field label="Date of Registration">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
                    {formatDate(editingRegistration.createdAt)}
                  </div>
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <Field label="Accommodation Details">
                  <textarea
                    value={editingRegistration.accommodationDetails || ''}
                    onChange={(e) => setEditingRegistration((prev: any) => ({ ...prev, accommodationDetails: e.target.value }))}
                    rows={2}
                    className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </Field>
                <Field label="Travel / Flight Details">
                  <textarea
                    value={editingRegistration.travelDetails || ''}
                    onChange={(e) => setEditingRegistration((prev: any) => ({ ...prev, travelDetails: e.target.value }))}
                    rows={2}
                    className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </Field>
                <Field label="Food Allergy / Dietary Requirements">
                  <textarea
                    value={editingRegistration.notes || ''}
                    onChange={(e) => setEditingRegistration((prev: any) => ({ ...prev, notes: e.target.value }))}
                    rows={3}
                    className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </Field>
              </div>

              {editingRegistration.sector === 'Food (Booth)' && (
                <div className="rounded-2xl border border-orange-200 bg-orange-50/50 p-5 space-y-4">
                  <h4 className="flex items-center gap-2 text-sm font-black text-slate-900">
                    <UtensilsCrossed size={16} className="text-orange-600" />
                    Food booth details
                  </h4>
                  <div className="grid grid-cols-1 gap-4">
                    <Field label="Booth location details (shown to participants & staff)">
                      <textarea
                        value={editingRegistration.boothLocationDetails || ''}
                        onChange={(e) =>
                          setEditingRegistration((prev: any) => ({ ...prev, boothLocationDetails: e.target.value }))
                        }
                        rows={3}
                        placeholder="e.g. Exhibition Hall — north row, stall 5, near restrooms"
                        className="w-full resize-none rounded-xl border border-orange-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </Field>
                    <Field label="Booth description">
                      <textarea
                        value={editingRegistration.boothDescription || ''}
                        onChange={(e) =>
                          setEditingRegistration((prev: any) => ({ ...prev, boothDescription: e.target.value }))
                        }
                        rows={3}
                        className="w-full resize-none rounded-xl border border-orange-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-orange-500"
                        placeholder="What you serve, specials, or stall focus…"
                      />
                    </Field>
                    <Field label="Products / Services">
                      <input
                        value={editingRegistration.boothProducts || ''}
                        onChange={(e) =>
                          setEditingRegistration((prev: any) => ({ ...prev, boothProducts: e.target.value }))
                        }
                        className="w-full rounded-xl border border-orange-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-orange-500"
                        placeholder="e.g. Burgers, coffee, snacks…"
                      />
                    </Field>
                    <Field label="Website URL">
                      <input
                        value={editingRegistration.boothWebsite || ''}
                        onChange={(e) =>
                          setEditingRegistration((prev: any) => ({ ...prev, boothWebsite: e.target.value }))
                        }
                        type="url"
                        className="w-full rounded-xl border border-orange-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-orange-500"
                        placeholder="https://…"
                      />
                    </Field>
                    <Field label="Booth background">
                      <p className="text-[10px] text-slate-500 mb-2">Banner image for listings (booth logo image is not used).</p>
                      <div className="flex items-center gap-3 flex-wrap">
                        {editingRegistration.boothBackgroundUrl && (
                          <img
                            src={editingRegistration.boothBackgroundUrl}
                            alt="Background"
                            className="h-12 w-20 rounded-xl object-contain bg-white border border-orange-200"
                          />
                        )}
                        {editingRegistration.uid ? (
                          <label
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl border border-orange-200 bg-white text-sm font-semibold cursor-pointer hover:bg-orange-50/80 ${uploadingBoothBackground ? 'opacity-60' : ''}`}
                          >
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={async (e) => {
                                const f = e.target.files?.[0];
                                if (!f || !f.type.startsWith('image/')) return;
                                setUploadingBoothBackground(true);
                                try {
                                  const path = `boothBackgrounds/${editingRegistration.uid}/${Date.now()}_${f.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
                                  await uploadBytes(ref(storage, path), f, { contentType: f.type || 'image/jpeg' });
                                  const url = await getDownloadURL(ref(storage, path));
                                  setEditingRegistration((prev: any) => ({ ...prev, boothBackgroundUrl: url }));
                                } catch (err) {
                                  console.error(err);
                                } finally {
                                  setUploadingBoothBackground(false);
                                  e.target.value = '';
                                }
                              }}
                            />
                            {uploadingBoothBackground ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
                            {uploadingBoothBackground ? 'Uploading…' : 'Upload'}
                          </label>
                        ) : (
                          <span className="text-xs text-slate-500">Link account to upload</span>
                        )}
                        {editingRegistration.boothBackgroundUrl ? (
                          <button
                            type="button"
                            onClick={() => setEditingRegistration((prev: any) => ({ ...prev, boothBackgroundUrl: '' }))}
                            className="text-xs font-bold text-red-600 hover:underline"
                          >
                            Clear
                          </button>
                        ) : null}
                      </div>
                    </Field>
                  </div>
                </div>
              )}

              {['Exhibitor', 'Exhibitor (Booth)'].includes(editingRegistration.sector) && (
                <div className="rounded-2xl border border-cyan-200 bg-cyan-50/50 p-5 space-y-4">
                  <h4 className="flex items-center gap-2 text-sm font-black text-slate-900">
                    <Store size={16} className="text-cyan-600" />
                    Booth / Topic Details
                  </h4>
                  <div className="grid grid-cols-1 gap-4">
                    <Field label="Booth location details (physical placement)">
                      <textarea
                        value={editingRegistration.boothLocationDetails || ''}
                        onChange={(e) =>
                          setEditingRegistration((prev: any) => ({ ...prev, boothLocationDetails: e.target.value }))
                        }
                        rows={2}
                        placeholder="e.g. Expo floor — booth A12"
                        className="w-full resize-none rounded-xl border border-cyan-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-cyan-500"
                      />
                    </Field>
                    <Field label="Booth category (Exhibitors page)">
                      <select
                        value={editingRegistration.boothCategory || ''}
                        onChange={(e) =>
                          setEditingRegistration((prev: any) => ({
                            ...prev,
                            boothCategory: e.target.value,
                            boothCategoryOther:
                              e.target.value === 'Other' ? prev.boothCategoryOther || '' : '',
                          }))
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Not set</option>
                        {EXHIBITOR_BOOTH_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </Field>
                    {editingRegistration.boothCategory === 'Other' && (
                      <Field label="Describe category">
                        <input
                          value={editingRegistration.boothCategoryOther || ''}
                          onChange={(e) =>
                            setEditingRegistration((prev: any) => ({ ...prev, boothCategoryOther: e.target.value }))
                          }
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="e.g. Healthcare, Education"
                        />
                      </Field>
                    )}
                    <Field label="Booth Description / Topic">
                      <textarea
                        value={editingRegistration.boothDescription || ''}
                        onChange={(e) => setEditingRegistration((prev: any) => ({ ...prev, boothDescription: e.target.value }))}
                        rows={3}
                        className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Description of booth, topic, or focus area…"
                      />
                    </Field>
                    <Field label="Products / Services">
                      <input
                        value={editingRegistration.boothProducts || ''}
                        onChange={(e) => setEditingRegistration((prev: any) => ({ ...prev, boothProducts: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g. Smart City Solutions, IoT Devices…"
                      />
                    </Field>
                    <Field label="Website URL">
                      <input
                        value={editingRegistration.boothWebsite || ''}
                        onChange={(e) => setEditingRegistration((prev: any) => ({ ...prev, boothWebsite: e.target.value }))}
                        type="url"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="https://your-company.com"
                      />
                    </Field>
                    <Field label="Booth Background">
                      <div className="flex items-center gap-3">
                        {editingRegistration.boothBackgroundUrl && (
                          <img src={editingRegistration.boothBackgroundUrl} alt="Background" className="h-12 w-20 rounded-xl object-contain bg-slate-100 border border-slate-200" />
                        )}
                        {editingRegistration.uid ? (
                        <label className={`flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold cursor-pointer hover:bg-slate-50 ${uploadingBoothBackground ? 'opacity-60' : ''}`}>
                          <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (!f || !f.type.startsWith('image/')) return;
                            setUploadingBoothBackground(true);
                            try {
                              const path = `boothBackgrounds/${editingRegistration.uid}/${Date.now()}_${f.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
                              await uploadBytes(ref(storage, path), f, { contentType: f.type || 'image/jpeg' });
                              const url = await getDownloadURL(ref(storage, path));
                              setEditingRegistration((prev: any) => ({ ...prev, boothBackgroundUrl: url }));
                            } catch (err) { console.error(err); }
                            finally { setUploadingBoothBackground(false); e.target.value = ''; }
                          }} />
                          {uploadingBoothBackground ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
                          {uploadingBoothBackground ? 'Uploading…' : 'Upload'}
                        </label>
                        ) : <span className="text-xs text-slate-500">Link account to upload</span>}
                        {(editingRegistration.boothBackgroundUrl) && (
                          <button type="button" onClick={() => setEditingRegistration((prev: any) => ({ ...prev, boothBackgroundUrl: '' }))} className="text-xs font-bold text-red-600 hover:underline">Clear</button>
                        )}
                      </div>
                    </Field>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
                <div className="flex items-start gap-3">
                  <Mail size={16} className="mt-0.5 text-blue-600" />
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-slate-400">Email</p>
                    <p className="text-sm font-semibold text-slate-700">{editingRegistration.email || '—'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Phone size={16} className="mt-0.5 text-blue-600" />
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-slate-400">Contact</p>
                    <p className="text-sm font-semibold text-slate-700">{editingRegistration.contactNumber || '—'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <ShieldCheck size={16} className="mt-0.5 text-blue-600" />
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-slate-400">Current Status</p>
                    <div className="mt-1"><StatusBadge status={editingRegistration.status || 'pending'} /></div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <h4 className="flex items-center gap-2 text-sm font-black text-slate-900">
                  <UserCog size={16} className="text-blue-600" />
                  Admin Account Actions
                </h4>
                <p className="mt-1 text-xs text-slate-500">
                  Password changes are handled via reset email for security.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handlePasswordReset}
                    disabled={passwordResetting}
                    className="flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                  >
                    <KeyRound size={15} />
                    {passwordResetting ? 'Sending...' : 'Send Password Reset'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateStatus(editingRegistration, 'approved')}
                    className="rounded-xl bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-100"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateStatus(editingRegistration, 'declined')}
                    className="rounded-xl bg-red-50 px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-100"
                  >
                    Decline
                  </button>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 z-10 flex flex-col gap-3 border-t border-slate-100 bg-white p-5 sm:flex-row sm:justify-between">
              <button
                type="button"
                onClick={handleDeleteRegistration}
                disabled={registrationDeleting}
                className="flex items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-3 text-sm font-black text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 size={16} />
                {registrationDeleting ? 'Deleting...' : 'Delete Registration'}
              </button>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setEditingRegistration(null)}
                  className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveRegistration}
                  disabled={registrationSaving}
                  className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  <Save size={16} />
                  {registrationSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
