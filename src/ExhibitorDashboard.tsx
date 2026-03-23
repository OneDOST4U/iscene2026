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
  MapPin,
  Calendar,
  Info,
  Plus,
  Edit2,
  Mail,
  LogOut,
  ExternalLink,
  Rocket,
  Menu,
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
  updateDoc,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, auth, storage } from './firebase';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type ExhibitorTab = 'my-booth' | 'materials' | 'digital-id' | 'profile';

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

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
type Props = { user: FirebaseUser; registration: any; onSignOut: () => Promise<void> };

export function ExhibitorDashboard({ user, registration, onSignOut }: Props) {
  const fullName = (registration?.fullName as string) || user.email || 'Exhibitor';
  const orgName = (registration?.sectorOffice as string) || 'Technology Booth';
  const profilePicUrl = (registration?.profilePictureUrl as string | undefined) || null;
  const initials = fullName.split(' ').map((p: string) => p[0]).join('').toUpperCase().slice(0, 2);
  const approvalStatus = (registration?.status as string) || 'pending';
  const boothNumber = `#${registration?.id?.slice(0, 6).toUpperCase() || 'TBD'}`;

  // ── Tabs ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = React.useState<ExhibitorTab>('my-booth');
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

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
  const [boothImageUrl, setBoothImageUrl] = React.useState((registration?.boothImageUrl as string) || '');
  const [boothBackgroundUrl, setBoothBackgroundUrl] = React.useState((registration?.boothBackgroundUrl as string) || '');
  const [uploadingBoothImage, setUploadingBoothImage] = React.useState(false);
  const [uploadingBoothBackground, setUploadingBoothBackground] = React.useState(false);
  const [savingBooth, setSavingBooth] = React.useState(false);

  // ── ID modal ──────────────────────────────────────────────────────────
  const [idModal, setIdModal] = React.useState(false);

  // ── Profile ───────────────────────────────────────────────────────────
  const [pwResetSent, setPwResetSent] = React.useState(false);

  // ── Toast ─────────────────────────────────────────────────────────────
  const [toast, setToast] = React.useState<string | null>(null);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 4000); };

  // ── Derived ───────────────────────────────────────────────────────────
  const digitalIdQrData = `https://iscene.app/verify?uid=${user.uid}&name=${encodeURIComponent(fullName)}&role=exhibitor`;
  const digitalIdQrImg = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(digitalIdQrData)}`;
  const idNumber = user.uid.slice(0, 8).toUpperCase();

  // ── Event milestones ──────────────────────────────────────────────────
  const milestones = [
    { label: 'Setup Period Starts', date: 'Apr 8, 2026 · 08:00 AM', icon: <Calendar size={20} className="text-amber-600" />, iconBg: 'bg-amber-100', locked: false },
    { label: 'Event Opening Day', date: 'Apr 9, 2026 · 09:00 AM', icon: <Rocket size={20} className="text-blue-600" />, iconBg: 'bg-blue-100', locked: false },
    { label: 'Networking Night', date: 'Apr 10, 2026 · 06:00 PM', icon: <Store size={20} className="text-slate-400" />, iconBg: 'bg-slate-100', locked: true },
    { label: 'Closing Ceremony', date: 'Apr 11, 2026 · 05:00 PM', icon: <CheckCircle2 size={20} className="text-slate-400" />, iconBg: 'bg-slate-100', locked: true },
  ];

  // ── Load data ─────────────────────────────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    getDocs(query(collection(db, 'presenterMaterials'), where('uid', '==', user.uid), orderBy('createdAt', 'desc')))
      .then((snap) => {
        if (!cancelled) setMaterials(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BoothMaterial, 'id'>) })));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user.uid]);

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
    setSavingBooth(true);
    try {
      await updateDoc(doc(db, 'registrations', registration.id), {
        boothDescription: boothDesc, boothWebsite, boothProducts,
        boothImageUrl: boothImageUrl.trim() || '', boothBackgroundUrl: boothBackgroundUrl.trim() || '',
      });
      setEditing(false);
      showToast('✅ Booth profile updated.');
    } catch { showToast('❌ Failed to save. Try again.'); }
    finally { setSavingBooth(false); }
  };

  const handleBoothImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) { showToast('Please select an image file.'); return; }
    setUploadingBoothImage(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const path = `boothImages/${user.uid}/${Date.now()}_${safeName}`;
      const snap = await uploadBytes(ref(storage, path), file, { contentType: file.type || 'image/jpeg' });
      const url = await getDownloadURL(snap.ref);
      setBoothImageUrl(url);
      showToast('✅ Booth image uploaded. Click Save to keep.');
    } catch { showToast('❌ Upload failed. Try a smaller image (<5MB).'); }
    finally { setUploadingBoothImage(false); e.target.value = ''; }
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

  // ── Sidebar nav item ──────────────────────────────────────────────────
  const NavItem = ({ tab, icon, label }: { tab: ExhibitorTab; icon: React.ReactNode; label: string }) => (
    <button type="button" onClick={() => { setActiveTab(tab); setSidebarOpen(false); if (tab === 'digital-id') setIdModal(true); }}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-full text-sm font-medium transition-all ${activeTab === tab && tab !== 'digital-id' ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'text-slate-600 hover:bg-slate-100'}`}>
      {icon}<span>{label}</span>
    </button>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-600" size={36} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen overflow-hidden bg-slate-50 text-slate-900">

      {/* ── Toast ─────────────────────────────────────────────────────── */}
      {toast && (
        <div className={`fixed left-4 right-4 top-5 z-50 px-5 py-3 rounded-2xl text-sm font-semibold shadow-lg sm:left-auto sm:right-5 ${toast.startsWith('✅') ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
          {toast}
        </div>
      )}

      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden"
        />
      )}

      {/* ── Sidebar ───────────────────────────────────────────────────── */}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col gap-8 border-r border-slate-200 bg-white p-6 transition-transform duration-200 lg:relative lg:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-2">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-white border border-slate-100 shadow-sm flex items-center justify-center">
            <img src="/iscene.png" alt="iSCENE" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-base font-black leading-none">Exhibitor Hub</h1>
            <p className="text-[11px] text-slate-400 mt-0.5">iSCENE 2026</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
          <NavItem tab="my-booth" icon={<Store size={18} />} label="My Booth" />
          <NavItem tab="materials" icon={<FolderOpen size={18} />} label="My Materials" />
          <button type="button" onClick={() => setIdModal(true)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-full text-sm font-medium text-slate-600 hover:bg-slate-100 transition-all">
            <CreditCard size={18} /><span>Digital ID</span>
          </button>
          <NavItem tab="profile" icon={<User size={18} />} label="Profile" />
        </nav>

        {/* User info */}
        <div className="p-4 bg-slate-50 rounded-2xl">
          <div className="flex items-center gap-3">
            {profilePicUrl
              ? <img src={profilePicUrl} alt={fullName} className="w-10 h-10 rounded-full object-cover shrink-0" />
              : <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-black shrink-0">{initials}</div>}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">{fullName}</p>
              <p className="text-[11px] text-slate-400 truncate">{orgName}</p>
            </div>
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

      {/* ── Main ──────────────────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 overflow-y-auto min-h-screen">

        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur lg:hidden">
          <div className="flex items-center gap-3 px-4 py-4">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600"
            >
              <Menu size={18} />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-900">Exhibitor Hub</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">iSCENE 2026</p>
            </div>
          </div>
        </header>

        {/* ══════════════ MY BOOTH ══════════════ */}
        {activeTab === 'my-booth' && (
          <div className="max-w-5xl p-4 sm:p-6 md:p-8 lg:p-12">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
              {/* LEFT: What participants see */}
              <section>
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">What Participants See</h3>
                <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className={`h-32 w-full flex items-center justify-center overflow-hidden ${boothImageUrl ? '' : 'bg-gradient-to-br from-blue-100 via-blue-50 to-slate-100'}`}>
                    {boothImageUrl ? (
                      <img src={boothImageUrl} alt="Booth" className="w-full h-full object-cover" />
                    ) : (
                      <Store size={48} className="text-blue-300" />
                    )}
                  </div>
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-black text-blue-600 shrink-0">{initials}</div>
                      <div>
                        <p className="font-bold text-sm">{fullName}</p>
                        <p className="text-[10px] text-slate-400">{registration?.sector || 'Exhibitor (Booth)'}</p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-2 mb-2">{orgName || 'Event booth participant'}</p>
                    {boothDesc && <p className="text-xs text-slate-600 line-clamp-2 mb-2">{boothDesc}</p>}
                    <div className="flex items-center justify-between flex-wrap gap-1">
                      <span className="text-[11px] text-slate-400">Booth {boothNumber}</span>
                      <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Approved</span>
                    </div>
                    {materials.length > 0 && (
                      <p className="text-[11px] text-slate-400 mt-2">{materials.length} material{materials.length !== 1 ? 's' : ''} available</p>
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
                            onChange={(e) => { const files = Array.from(e.target.files || []); if (files.length) { handleUpload(files); e.target.value = ''; } }} />
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
          </div>
        )}

        {/* ══════════════ MATERIALS ══════════════ */}
        {activeTab === 'materials' && (
          <div className="max-w-4xl p-4 sm:p-6 md:p-8 lg:p-12">
            <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-black">My Materials</h2>
                <p className="text-slate-500 text-sm mt-1">Manage your uploaded booth assets</p>
              </div>
              <label className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-200 transition-colors hover:bg-blue-700 sm:w-auto ${uploading ? 'opacity-70 pointer-events-none' : ''}`}>
                <input type="file" className="hidden" accept="image/*,video/*,.pdf" multiple
                  onChange={(e) => { const files = Array.from(e.target.files || []); if (files.length) { handleUpload(files); e.target.value = ''; } }} />
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
                    onChange={(e) => { const files = Array.from(e.target.files || []); if (files.length) { handleUpload(files); e.target.value = ''; } }} />
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

        {/* ══════════════ PROFILE ══════════════ */}
        {activeTab === 'profile' && (
          <div className="max-w-2xl p-4 sm:p-6 md:p-8 lg:p-12">
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
                    <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">Technology Booth</span>
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
                    { label: 'Position', value: registration?.positionTitle },
                    { label: 'Contact', value: registration?.contactNumber },
                    { label: 'Booth #', value: boothNumber },
                    { label: 'Status', value: registration?.status || 'pending' },
                  ].map(({ label, value }) => (
                    <div key={label}><p className="text-[11px] text-slate-400 mb-0.5">{label}</p><p className="font-semibold text-xs truncate">{value || '—'}</p></div>
                  ))}
                </div>
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
      </main>

      {/* ── Edit Booth Modal ───────────────────────────────────────────── */}
      {editing && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-base">Edit Booth Profile</h3>
              <button type="button" onClick={() => setEditing(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X size={15} /></button>
            </div>
            <div className="space-y-4">
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
                <label className="text-xs font-bold text-slate-500 mb-1 block">Booth Image (optional)</label>
                <div className="flex items-center gap-3">
                  {boothImageUrl && <img src={boothImageUrl} alt="Booth" className="h-14 w-14 rounded-lg object-cover border border-slate-200" />}
                  <label className={`flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold cursor-pointer hover:bg-slate-50 ${uploadingBoothImage ? 'opacity-60' : ''}`}>
                    <input type="file" accept="image/*" className="hidden" onChange={handleBoothImageUpload} />
                    {uploadingBoothImage ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
                    {uploadingBoothImage ? 'Uploading…' : 'Upload'}
                  </label>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Booth Background (optional)</label>
                <div className="flex items-center gap-3">
                  {boothBackgroundUrl && <img src={boothBackgroundUrl} alt="Background" className="h-10 w-16 rounded-lg object-cover border border-slate-200" />}
                  <label className={`flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold cursor-pointer hover:bg-slate-50 ${uploadingBoothBackground ? 'opacity-60' : ''}`}>
                    <input type="file" accept="image/*" className="hidden" onChange={handleBoothBackgroundUpload} />
                    {uploadingBoothBackground ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                    {uploadingBoothBackground ? 'Uploading…' : 'Upload'}
                  </label>
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
            <div className="bg-blue-600 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-white text-xs font-black tracking-widest uppercase">iSCENE 2026</p>
                <p className="text-blue-200 text-[10px]">Technology Booth Exhibitor</p>
              </div>
              <button type="button" onClick={() => setIdModal(false)} className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white"><X size={14} /></button>
            </div>
            <div className="px-5 py-5 flex flex-col items-center bg-gradient-to-b from-white to-slate-50">
              {profilePicUrl
                ? <img src={profilePicUrl} alt={fullName} className="w-20 h-20 rounded-full object-cover mb-3 ring-4 ring-blue-100 shadow-md" />
                : <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-2xl font-black text-white mb-3 ring-4 ring-blue-100">{initials}</div>}
              <h3 className="text-base font-black text-center">{fullName}</h3>
              <p className="text-xs text-slate-500 mt-0.5 text-center">{orgName}</p>
              <span className="mt-2 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-[11px] font-bold">Technology Booth</span>
              <div className="mt-4 p-3 bg-white rounded-2xl shadow-sm border border-slate-100">
                <img src={digitalIdQrImg} alt="Digital ID QR" className="w-44 h-44" />
              </div>
              <p className="mt-2 text-[11px] text-slate-400 font-mono tracking-widest">ID #{idNumber}</p>
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
    </div>
  );
}
