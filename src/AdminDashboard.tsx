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
  Mail,
  Phone,
  Building2,
  Briefcase,
  UserCog,
  ShieldCheck,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  Timestamp,
  query,
  orderBy,
} from 'firebase/firestore';
import { db, storage } from './firebase';
import { ref, getDownloadURL } from 'firebase/storage';

type Tab = 'dashboard' | 'registrations' | 'rooms' | 'meals' | 'booths' | 'analytics';

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
  createdAt: any;
};

type Meal = {
  id: string;
  type: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  createdAt: any;
};

const BOOTH_SECTORS = ['Food (Booth)', 'Exhibitor (Booth)', 'Exhibitor'];
const ROLE_OPTIONS = [
  'Participants',
  'Speakers',
  'Facilitators',
  'Food (Booth)',
  'Exhibitor',
  'Exhibitor (Booth)',
  'DOST',
];

const MEAL_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  snacks: 'Snacks (AM)',
  lunch: 'Lunch',
  snacks_pm: 'Snacks (PM)',
  dinner: 'Dinner',
};

const TIME_OPTIONS = Array.from({ length: 27 }, (_, index) => {
  const totalMinutes = 7 * 60 + index * 30;
  const hours24 = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${String(hours12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;
});

function formatDate(value: any) {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : '—';
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
  return 'bg-blue-100 text-blue-700';
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
  const [editingRegistration, setEditingRegistration] = React.useState<any | null>(null);
  const [registrationSaving, setRegistrationSaving] = React.useState(false);
  const [registrationDeleting, setRegistrationDeleting] = React.useState(false);
  const [passwordResetting, setPasswordResetting] = React.useState(false);
  const [actionMessage, setActionMessage] = React.useState<string | null>(null);
  const [proofError, setProofError] = React.useState<string | null>(null);

  const [rooms, setRooms] = React.useState<Room[]>([]);
  const [roomsLoading, setRoomsLoading] = React.useState(false);
  const [newRoomName, setNewRoomName] = React.useState('');
  const [newRoomCapacity, setNewRoomCapacity] = React.useState('');
  const [newRoomDesc, setNewRoomDesc] = React.useState('');
  const [newRoomStartTime, setNewRoomStartTime] = React.useState('');
  const [newRoomEndTime, setNewRoomEndTime] = React.useState('');
  const [newRoomDate, setNewRoomDate] = React.useState('');
  const [newRoomMaterials, setNewRoomMaterials] = React.useState('');
  const [newRoomPresenterChoice, setNewRoomPresenterChoice] = React.useState('');
  const [newRoomSelectedPresenters, setNewRoomSelectedPresenters] = React.useState<string[]>([]);
  const [newRoomPresenters, setNewRoomPresenters] = React.useState('');
  const [roomSaving, setRoomSaving] = React.useState(false);

  const [meals, setMeals] = React.useState<Meal[]>([]);
  const [mealsLoading, setMealsLoading] = React.useState(false);
  const [newMealType, setNewMealType] = React.useState('lunch');
  const [newMealDate, setNewMealDate] = React.useState('');
  const [newMealStart, setNewMealStart] = React.useState('');
  const [newMealEnd, setNewMealEnd] = React.useState('');
  const [mealSaving, setMealSaving] = React.useState(false);

  const adminInitials = (user.email || 'AD').slice(0, 2).toUpperCase();

  const boothRegs = React.useMemo(
    () => registrations.filter((r) => BOOTH_SECTORS.includes((r.sector as string) || '')),
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

  const clearMessageSoon = React.useCallback((message: string) => {
    setActionMessage(message);
    window.setTimeout(() => setActionMessage(null), 3500);
  }, []);

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

  React.useEffect(() => {
    loadRooms();
    loadMeals();
  }, [loadMeals, loadRooms]);

  React.useEffect(() => {
    setSidebarOpen(false);
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

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    if (!newRoomStartTime || !newRoomEndTime) {
      setActionMessage('Please choose both a start time and an end time.');
      return;
    }
    const startIndex = TIME_OPTIONS.indexOf(newRoomStartTime);
    const endIndex = TIME_OPTIONS.indexOf(newRoomEndTime);
    if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
      setActionMessage('End time must be later than the start time.');
      return;
    }
    setRoomSaving(true);
    try {
      const manualPresenterNames = newRoomPresenters
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      const presenterNames = Array.from(
        new Set([...newRoomSelectedPresenters, ...manualPresenterNames]),
      );
      const timeline = `${newRoomStartTime} - ${newRoomEndTime}`;
      const payload = {
        name: newRoomName.trim(),
        capacity: parseInt(newRoomCapacity, 10) || 0,
        description: newRoomDesc.trim(),
        timeline,
        sessionDate: newRoomDate,
        materials: newRoomMaterials.trim(),
        presenterNames,
        createdAt: Timestamp.now(),
      };
      const docRef = await addDoc(collection(db, 'rooms'), payload);
      const createdRoom = { id: docRef.id, ...payload };
      setRooms((prev) => [createdRoom, ...prev]);
      setSelectedQrRoom(createdRoom);
      setNewRoomName('');
      setNewRoomCapacity('');
      setNewRoomDesc('');
      setNewRoomStartTime('');
      setNewRoomEndTime('');
      setNewRoomDate('');
      setNewRoomMaterials('');
      setNewRoomPresenterChoice('');
      setNewRoomSelectedPresenters([]);
      setNewRoomPresenters('');
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
      clearMessageSoon('Breakout room deleted.');
    } catch (err) {
      console.error('deleteRoom', err);
    }
  };

  const handleCreateMeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMealDate) return;
    setMealSaving(true);
    try {
      const payload = {
        type: newMealType,
        sessionDate: newMealDate,
        startTime: newMealStart,
        endTime: newMealEnd,
        createdAt: Timestamp.now(),
      };
      const docRef = await addDoc(collection(db, 'meals'), payload);
      setMeals((prev) => [{ id: docRef.id, ...payload }, ...prev]);
      setNewMealType('lunch');
      setNewMealDate('');
      setNewMealStart('');
      setNewMealEnd('');
      clearMessageSoon('Meal window created.');
    } catch (err) {
      console.error('createMeal', err);
    } finally {
      setMealSaving(false);
    }
  };

  const handleDeleteMeal = async (id: string) => {
    if (!window.confirm('Delete this meal window?')) return;
    try {
      await deleteDoc(doc(db, 'meals', id));
      setMeals((prev) => prev.filter((meal) => meal.id !== id));
      clearMessageSoon('Meal window deleted.');
    } catch (err) {
      console.error('deleteMeal', err);
    }
  };

  const handleViewProof = async (proofPath: string) => {
    setProofError(null);
    try {
      const url = await getDownloadURL(ref(storage, proofPath));
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
      const updates = {
        fullName: editingRegistration.fullName || '',
        email: editingRegistration.email || '',
        sector: editingRegistration.sector || '',
        status: editingRegistration.status || 'pending',
        positionTitle: editingRegistration.positionTitle || '',
        sectorOffice: editingRegistration.sectorOffice || '',
        contactNumber: editingRegistration.contactNumber || '',
      };
      await onSaveRegistration(editingRegistration.id, updates);
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
          <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 lg:hidden"
              >
                <Menu size={18} />
              </button>
              <div>
                <h2 className="text-xl font-black sm:text-2xl">
                  {activeTab === 'registrations'
                    ? 'Participant Management'
                    : activeTab === 'rooms'
                    ? 'Breakout Rooms'
                    : activeTab === 'meals'
                    ? 'Meals & Food'
                    : activeTab === 'booths'
                    ? 'Booth Management'
                    : activeTab === 'analytics'
                    ? 'Analytics'
                    : 'Event Overview'}
                </h2>
                <p className="text-xs text-slate-500 sm:text-sm">
                  Responsive admin controls for mobile, tablet, and desktop.
                </p>
              </div>
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <button
                type="button"
                onClick={onExportPdf}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
              >
                <FileText size={15} />
                PDF
              </button>
              <button
                type="button"
                onClick={onExportCsv}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                <Download size={15} />
                CSV
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
          {actionMessage && (
            <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">
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
              <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <h3 className="text-2xl font-black">Participant Registrations</h3>
                  <p className="text-sm text-slate-500">Edit participant details, roles, approval state, deletion, and password resets.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onExportPdf}
                    className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 sm:hidden"
                  >
                    <FileText size={15} />
                    Export PDF
                  </button>
                  <button
                    type="button"
                    onClick={onExportCsv}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 sm:hidden"
                  >
                    <Download size={15} />
                    Export CSV
                  </button>
                </div>
              </div>

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
                </p>
              </div>

              {proofError && (
                <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
                  {proofError}
                </div>
              )}

              <div className="space-y-3 lg:hidden">
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
                    <div key={registration.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-base font-black">{registration.fullName || '—'}</p>
                          <p className="truncate text-xs text-slate-500">{registration.email || '—'}</p>
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
                        <p>Created: {formatDate(registration.createdAt)}</p>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingRegistration({ ...registration })}
                          className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700"
                        >
                          <Pencil size={13} />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateStatus(registration, 'approved')}
                          disabled={registration.status === 'approved'}
                          className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateStatus(registration, 'declined')}
                          disabled={registration.status === 'declined'}
                          className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Decline
                        </button>
                        {registration.proofOfPaymentPath ? (
                          <button
                            type="button"
                            onClick={() => handleViewProof(registration.proofOfPaymentPath)}
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
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] text-sm">
                    <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-left">Participant</th>
                        <th className="px-4 py-3 text-left">Role</th>
                        <th className="px-4 py-3 text-left">Contact</th>
                        <th className="px-4 py-3 text-left">Organization</th>
                        <th className="px-4 py-3 text-left">Status</th>
                        <th className="px-4 py-3 text-left">Created</th>
                        <th className="px-4 py-3 text-left">Proof</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {registrationsLoading && (
                        <tr>
                          <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                            Loading registrations...
                          </td>
                        </tr>
                      )}
                      {!registrationsLoading && registrationsView.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                            No registrations found.
                          </td>
                        </tr>
                      )}
                      {!registrationsLoading &&
                        registrationsView.map((registration) => (
                          <tr key={registration.id} className="transition-colors hover:bg-blue-50/40">
                            <td className="px-4 py-3">
                              <div className="font-bold">{registration.fullName || '—'}</div>
                              <div className="text-xs text-slate-500">{registration.email || '—'}</div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${sectorColor(registration.sector || '')}`}>
                                {registration.sector || '—'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-600">{registration.contactNumber || '—'}</td>
                            <td className="px-4 py-3 text-xs text-slate-600">{registration.sectorOffice || '—'}</td>
                            <td className="px-4 py-3">
                              <StatusBadge status={registration.status || 'pending'} />
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-500">{formatDate(registration.createdAt)}</td>
                            <td className="px-4 py-3">
                              {registration.proofOfPaymentPath ? (
                                <button
                                  type="button"
                                  onClick={() => handleViewProof(registration.proofOfPaymentPath)}
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
                                  onClick={() => setEditingRegistration({ ...registration })}
                                  className="rounded-lg bg-blue-50 p-2 text-blue-600 hover:bg-blue-100"
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  type="button"
                                  title="Approve"
                                  onClick={() => onUpdateStatus(registration, 'approved')}
                                  disabled={registration.status === 'approved'}
                                  className="rounded-lg bg-emerald-50 p-2 text-emerald-600 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <CheckCircle2 size={14} />
                                </button>
                                <button
                                  type="button"
                                  title="Decline"
                                  onClick={() => onUpdateStatus(registration, 'declined')}
                                  disabled={registration.status === 'declined'}
                                  className="rounded-lg bg-red-50 p-2 text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <XCircle size={14} />
                                </button>
                                <button
                                  type="button"
                                  title="Reset to pending"
                                  onClick={() => onUpdateStatus(registration, 'pending')}
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
              <div className="mb-5">
                <h3 className="text-2xl font-black">Breakout Rooms</h3>
                <p className="text-sm text-slate-500">Create sessions, assign presenters, and generate room QR codes.</p>
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h4 className="mb-4 flex items-center gap-2 text-lg font-black">
                    <Plus size={18} className="text-blue-600" />
                    Create Breakout Room
                  </h4>
                  <form onSubmit={handleCreateRoom} className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label="Room Name *">
                        <input value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} required className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="AI & Smart Cities" />
                      </Field>
                      <Field label="Max Capacity">
                        <input value={newRoomCapacity} onChange={(e) => setNewRoomCapacity(e.target.value)} type="number" min="0" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="50" />
                      </Field>
                    </div>
                    <Field label="Description">
                      <textarea value={newRoomDesc} onChange={(e) => setNewRoomDesc(e.target.value)} rows={3} className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="Brief room description..." />
                    </Field>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label="Session Date">
                        <input value={newRoomDate} onChange={(e) => setNewRoomDate(e.target.value)} type="date" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                      </Field>
                      <Field label="Start Time">
                        <select value={newRoomStartTime} onChange={(e) => setNewRoomStartTime(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                          <option value="">Choose start time</option>
                          {TIME_OPTIONS.map((time) => (
                            <option key={`start-${time}`} value={time}>
                              {time}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label="End Time">
                        <select value={newRoomEndTime} onChange={(e) => setNewRoomEndTime(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                          <option value="">Choose end time</option>
                          {TIME_OPTIONS.map((time) => (
                            <option key={`end-${time}`} value={time}>
                              {time}
                            </option>
                          ))}
                        </select>
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
                    <Field label="Materials / Equipment">
                      <input value={newRoomMaterials} onChange={(e) => setNewRoomMaterials(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="Projector, Whiteboard, Laptops" />
                    </Field>
                    <button type="submit" disabled={roomSaving} className="w-full rounded-xl bg-blue-600 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50">
                      {roomSaving ? 'Creating...' : 'Create Room & Generate QR'}
                    </button>
                  </form>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h4 className="mb-4 flex items-center gap-2 text-lg font-black">
                    <QrCode size={18} className="text-blue-600" />
                    QR Preview
                  </h4>
                  {selectedQrRoom ? (
                    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`https://www.iscene.app/scan?type=room&id=${selectedQrRoom.id}`)}`}
                          alt={`QR for ${selectedQrRoom.name}`}
                          className="h-52 w-52"
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
                    <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-3 text-center text-slate-400">
                      <QrCode size={56} className="text-slate-200" />
                      <p className="max-w-sm text-sm">Select any room below to preview and download its attendance QR code.</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6">
                <h4 className="mb-3 text-lg font-black">All Breakout Rooms ({rooms.length})</h4>
                {roomsLoading && <p className="text-sm text-slate-400">Loading rooms...</p>}
                {!roomsLoading && rooms.length === 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400 shadow-sm">
                    No breakout rooms yet. Use the form above to create one.
                  </div>
                )}
                <div className="space-y-3">
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
                          {room.description && <p className="mt-1 text-xs text-slate-500">{room.description}</p>}
                          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
                            {room.sessionDate && <span>{room.sessionDate}</span>}
                            {room.timeline && <span>{room.timeline}</span>}
                            {room.presenterNames?.length > 0 && <span>{room.presenterNames.join(', ')}</span>}
                            {room.materials && <span>{room.materials}</span>}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedQrRoom(room)}
                            className="flex items-center gap-1.5 rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-600 hover:bg-blue-100"
                          >
                            <QrCode size={13} />
                            View QR
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRoom(room.id)}
                            className="rounded-xl p-2 text-slate-400 hover:bg-red-50 hover:text-red-500"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {activeTab === 'meals' && (
            <section>
              <div className="mb-5">
                <h3 className="text-2xl font-black">Meals & Food</h3>
                <p className="text-sm text-slate-500">Create meal windows and manage food booth operators.</p>
              </div>
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h4 className="mb-4 flex items-center gap-2 text-lg font-black">
                    <Plus size={18} className="text-blue-600" />
                    Create Meal Window
                  </h4>
                  <form onSubmit={handleCreateMeal} className="space-y-4">
                    <Field label="Meal Type">
                      <select value={newMealType} onChange={(e) => setNewMealType(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="breakfast">Breakfast</option>
                        <option value="snacks">Snacks (AM)</option>
                        <option value="lunch">Lunch</option>
                        <option value="snacks_pm">Snacks (PM)</option>
                        <option value="dinner">Dinner</option>
                      </select>
                    </Field>
                    <Field label="Session Date *">
                      <input value={newMealDate} onChange={(e) => setNewMealDate(e.target.value)} type="date" required className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                    </Field>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label="Claim Opens">
                        <input value={newMealStart} onChange={(e) => setNewMealStart(e.target.value)} type="time" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                      </Field>
                      <Field label="Claim Closes">
                        <input value={newMealEnd} onChange={(e) => setNewMealEnd(e.target.value)} type="time" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                      </Field>
                    </div>
                    <button type="submit" disabled={mealSaving} className="w-full rounded-xl bg-blue-600 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50">
                      {mealSaving ? 'Saving...' : 'Create Meal Window'}
                    </button>
                  </form>
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
                <h4 className="mb-3 text-lg font-black">Scheduled Meal Windows ({meals.length})</h4>
                {mealsLoading && <p className="text-sm text-slate-400">Loading meal windows...</p>}
                {!mealsLoading && meals.length === 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400 shadow-sm">
                    No meal windows yet. Use the form above to create one.
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {meals.map((meal) => (
                    <div key={meal.id} className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div>
                        <p className="font-black">{MEAL_LABELS[meal.type] || meal.type}</p>
                        <p className="mt-1 text-xs text-slate-500">{meal.sessionDate || '—'}</p>
                        {meal.startTime && meal.endTime && (
                          <p className="mt-1 text-xs font-semibold text-blue-600">
                            {meal.startTime} - {meal.endTime}
                          </p>
                        )}
                      </div>
                      <button type="button" onClick={() => handleDeleteMeal(meal.id)} className="rounded-xl p-2 text-slate-400 hover:bg-red-50 hover:text-red-500">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {activeTab === 'booths' && (
            <section>
              <div className="mb-5">
                <h3 className="text-2xl font-black">Booth Management</h3>
                <p className="text-sm text-slate-500">Approve and manage exhibitor and food booth registrations.</p>
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                    <h4 className="text-lg font-black">Exhibitor Booths</h4>
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-black text-blue-600">
                      {boothRegs.filter((r) => ['Exhibitor', 'Exhibitor (Booth)'].includes(r.sector)).length}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {boothRegs.filter((r) => ['Exhibitor', 'Exhibitor (Booth)'].includes(r.sector)).length === 0 && (
                      <p className="p-6 text-sm text-slate-400">No exhibitor registrations yet.</p>
                    )}
                    {boothRegs
                      .filter((r) => ['Exhibitor', 'Exhibitor (Booth)'].includes(r.sector))
                      .map((registration) => (
                        <div key={registration.id} className="flex items-center justify-between gap-3 px-5 py-4">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold">{registration.fullName || '—'}</p>
                            <p className="truncate text-xs text-slate-500">{registration.sectorOffice || registration.email || '—'}</p>
                          </div>
                          <div className="flex items-center gap-2">
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
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                    <h4 className="text-lg font-black">Food Booths</h4>
                    <span className="rounded-full bg-orange-50 px-3 py-1 text-[11px] font-black text-orange-600">
                      {boothRegs.filter((r) => r.sector === 'Food (Booth)').length}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {boothRegs.filter((r) => r.sector === 'Food (Booth)').length === 0 && (
                      <p className="p-6 text-sm text-slate-400">No food booth registrations yet.</p>
                    )}
                    {boothRegs
                      .filter((r) => r.sector === 'Food (Booth)')
                      .map((registration) => (
                        <div key={registration.id} className="flex items-center justify-between gap-3 px-5 py-4">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold">{registration.fullName || '—'}</p>
                            <p className="truncate text-xs text-slate-500">{registration.sectorOffice || registration.email || '—'}</p>
                          </div>
                          <div className="flex items-center gap-2">
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
                </div>
              </div>
            </section>
          )}

          {activeTab === 'analytics' && (
            <section>
              <div className="mb-5">
                <h3 className="text-2xl font-black">Analytics</h3>
                <p className="text-sm text-slate-500">Live overview of registrations, sectors, and event readiness.</p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Total Registered" value={totalRegistrations} sub="All sectors" tone="blue" />
                <StatCard
                  label="Approved"
                  value={approvedRegistrations}
                  sub={`${totalRegistrations ? Math.round((approvedRegistrations / totalRegistrations) * 100) : 0}% approval`}
                  tone="green"
                />
                <StatCard label="Pending" value={pendingRegistrations} sub="Awaiting review" tone="amber" />
                <StatCard label="Declined" value={declinedCount} sub="Not approved" tone="purple" />
              </div>

              <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h4 className="text-lg font-black">Registrations by Sector</h4>
                  <div className="mt-4 space-y-4">
                    {sectorFilterOptions.map((sector) => {
                      const total = registrations.filter((r) => r.sector === sector).length;
                      const approved = registrations.filter((r) => r.sector === sector && r.status === 'approved').length;
                      const pct = totalRegistrations ? Math.round((total / totalRegistrations) * 100) : 0;
                      return (
                        <div key={sector}>
                          <div className="mb-1 flex justify-between gap-3 text-sm">
                            <span className="truncate font-medium text-slate-700">{sector}</span>
                            <span className="text-xs font-bold text-slate-500">
                              {approved}/{total} approved
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
                  <h4 className="text-lg font-black">Operational Snapshot</h4>
                  <div className="mt-4 space-y-3">
                    {[
                      { label: 'Participant records visible to admin', value: totalRegistrations },
                      { label: 'Rooms configured', value: rooms.length },
                      { label: 'Meal windows configured', value: meals.length },
                      { label: 'Booth operators', value: boothRegs.length },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                        <span className="text-sm text-slate-600">{row.label}</span>
                        <span className="text-sm font-black text-slate-900">{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
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
                <Field label="Created">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
                    {formatDate(editingRegistration.createdAt)}
                  </div>
                </Field>
              </div>

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
