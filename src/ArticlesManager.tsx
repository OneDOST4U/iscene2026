import React from 'react';
import { User } from 'firebase/auth';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  onSnapshot,
  Timestamp,
  deleteField,
  getDocs,
  orderBy,
  writeBatch,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from './firebase';
import { DEFAULT_ARTICLE_CATEGORIES, articleCategoryLabel } from './articleCategories';
import type { ArticleCategoryRow } from './useArticleCategoryNames';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  Upload,
  FileText,
  ExternalLink,
  ImageIcon,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';

export type ArticleAttachment = {
  url: string;
  path: string;
  fileName: string;
};

export type ArticleDoc = {
  id: string;
  title: string;
  description: string;
  authorUid: string;
  authorName?: string;
  attachments?: ArticleAttachment[];
  attachmentUrl?: string;
  attachmentPath?: string;
  attachmentFileName?: string;
  headerImageUrl?: string;
  headerImagePath?: string;
  category?: string;
  categoryOther?: string;
  createdAt?: { seconds?: number; toDate?: () => Date };
  updatedAt?: { seconds?: number; toDate?: () => Date };
};

type Props = {
  mode: 'admin' | 'author';
  user: User;
  authorDisplayName?: string;
};

const MAX_ATTACHMENT_MB = 50;
const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024;
const MAX_HEADER_BYTES = 5 * 1024 * 1024;

function attachmentsFromDoc(a: ArticleDoc): ArticleAttachment[] {
  const raw = a.attachments;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.filter(
      (x): x is ArticleAttachment =>
        !!x && typeof (x as ArticleAttachment).url === 'string' && typeof (x as ArticleAttachment).path === 'string',
    );
  }
  if (a.attachmentUrl && a.attachmentPath) {
    return [{ url: a.attachmentUrl, path: a.attachmentPath, fileName: a.attachmentFileName || 'Attachment' }];
  }
  return [];
}

function formatArticleDate(a: ArticleDoc): string {
  const t = a.updatedAt?.toDate?.() || a.createdAt?.toDate?.();
  if (!t) return '—';
  return t.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

async function deleteStoragePath(path: string | undefined) {
  if (!path) return;
  try {
    await deleteObject(ref(storage, path));
  } catch {
    /* missing file or permission */
  }
}

function storageErrorMessage(err: unknown): string {
  const code =
    err && typeof err === 'object' && 'code' in err ? String((err as { code: string }).code) : '';
  const message =
    err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : '';
  if (code === 'storage/unauthorized') {
    return `${code}: deploy latest storage.rules (articleAttachments + articleHeaders).`;
  }
  if (code === 'storage/canceled') return 'Upload was canceled.';
  return [code, message].filter(Boolean).join(' — ') || 'Unknown error';
}

export function ArticlesManager({ mode, user, authorDisplayName }: Props) {
  const [articles, setArticles] = React.useState<ArticleDoc[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [categoryRows, setCategoryRows] = React.useState<ArticleCategoryRow[]>([]);
  const [categoriesLoading, setCategoriesLoading] = React.useState(true);
  const [newCategoryName, setNewCategoryName] = React.useState('');
  const [categoryBusy, setCategoryBusy] = React.useState(false);
  const [categoryOpError, setCategoryOpError] = React.useState<string | null>(null);
  const [editingCategory, setEditingCategory] = React.useState<{ id: string; name: string } | null>(null);
  const categorySeedAttemptedRef = React.useRef(false);

  const [modalOpen, setModalOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [title, setTitle] = React.useState('');
  const [category, setCategory] = React.useState<string>('Uncategorized');
  const [categoryOther, setCategoryOther] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [attachments, setAttachments] = React.useState<ArticleAttachment[]>([]);
  const [headerImageUrl, setHeaderImageUrl] = React.useState<string | undefined>();
  const [headerImagePath, setHeaderImagePath] = React.useState<string | undefined>();
  const [uploading, setUploading] = React.useState(false);
  const [uploadingLabel, setUploadingLabel] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setLoading(true);
    setError(null);
    const coll = collection(db, 'articles');
    const refOrQuery =
      mode === 'author' ? query(coll, where('authorUid', '==', user.uid)) : coll;
    const unsub = onSnapshot(
      refOrQuery,
      (snap) => {
        const rows: ArticleDoc[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ArticleDoc, 'id'>) }));
        rows.sort((a, b) => {
          const ta = a.createdAt?.toDate?.()?.getTime() ?? 0;
          const tb = b.createdAt?.toDate?.()?.getTime() ?? 0;
          return tb - ta;
        });
        setArticles(rows);
        setLoading(false);
      },
      (err: unknown) => {
        console.error('articles snapshot', err);
        const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: string }).code) : '';
        const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : '';
        if (code === 'permission-denied') {
          setError(
            'Permission denied loading articles. Deploy the latest firestore.rules (articles collection) in Firebase Console.',
          );
        } else if (code === 'failed-precondition' || /index/i.test(msg)) {
          setError(
            'Firestore needs an index for this query, or rules are out of date. Try: firebase deploy --only firestore:rules,firestore:indexes — Details: ' +
              (msg || code),
          );
        } else {
          setError(msg || code || 'Could not load articles.');
        }
        setLoading(false);
      },
    );
    return () => unsub();
  }, [mode, user.uid]);

  React.useEffect(() => {
    const q = query(collection(db, 'articleCategories'), orderBy('sortOrder', 'asc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: ArticleCategoryRow[] = snap.docs.map((d) => {
          const data = d.data() as { name?: string; sortOrder?: number };
          return {
            id: d.id,
            name: String(data.name || '').trim() || '—',
            sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : 0,
          };
        });
        setCategoryRows(list);
        setCategoriesLoading(false);
      },
      (err) => {
        console.error('articleCategories snapshot', err);
        setCategoryRows([]);
        setCategoriesLoading(false);
      },
    );
    return () => unsub();
  }, []);

  React.useEffect(() => {
    if (mode !== 'admin' || categoriesLoading || categoryRows.length > 0 || categorySeedAttemptedRef.current) return;
    categorySeedAttemptedRef.current = true;
    void (async () => {
      try {
        const snap = await getDocs(collection(db, 'articleCategories'));
        if (!snap.empty) return;
        const batch = writeBatch(db);
        DEFAULT_ARTICLE_CATEGORIES.forEach((name, i) => {
          const r = doc(collection(db, 'articleCategories'));
          batch.set(r, { name, sortOrder: i, createdAt: Timestamp.now() });
        });
        await batch.commit();
      } catch (e) {
        console.error('seed articleCategories', e);
        categorySeedAttemptedRef.current = false;
      }
    })();
  }, [mode, categoriesLoading, categoryRows.length]);

  const baselineCategoryNames = React.useMemo(
    () => (categoryRows.length > 0 ? categoryRows.map((r) => r.name) : [...DEFAULT_ARTICLE_CATEGORIES]),
    [categoryRows],
  );

  const sortedCategoryRows = React.useMemo(
    () => [...categoryRows].sort((a, b) => a.sortOrder - b.sortOrder),
    [categoryRows],
  );

  const categorySelectOptions = React.useMemo(() => {
    const base = [...baselineCategoryNames];
    const uniq = new Set(base);
    if (modalOpen && category && !uniq.has(category)) {
      return [category, ...base];
    }
    return base;
  }, [baselineCategoryNames, modalOpen, category]);

  const openNew = () => {
    setEditingId(null);
    setTitle('');
    setCategory('Uncategorized');
    setCategoryOther('');
    setDescription('');
    setAttachments([]);
    setHeaderImageUrl(undefined);
    setHeaderImagePath(undefined);
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (a: ArticleDoc) => {
    if (mode === 'author' && a.authorUid !== user.uid) return;
    setEditingId(a.id);
    setTitle(a.title || '');
    const rawCat = (a.category || '').trim();
    const baseline =
      categoryRows.length > 0 ? categoryRows.map((r) => r.name) : [...DEFAULT_ARTICLE_CATEGORIES];
    if (baseline.includes(rawCat)) {
      setCategory(rawCat);
      setCategoryOther(rawCat === 'Other' ? (a.categoryOther || '').trim() : '');
    } else if (rawCat) {
      setCategory('Other');
      setCategoryOther(rawCat);
    } else {
      setCategory('Uncategorized');
      setCategoryOther('');
    }
    setDescription(a.description || '');
    setAttachments(attachmentsFromDoc(a));
    setHeaderImageUrl(a.headerImageUrl);
    setHeaderImagePath(a.headerImagePath);
    setError(null);
    setModalOpen(true);
  };

  const handleAddCategory = async () => {
    const n = newCategoryName.trim();
    if (!n) return;
    if (n.length > 120) {
      setCategoryOpError('Category name is too long (max 120 characters).');
      return;
    }
    setCategoryBusy(true);
    setCategoryOpError(null);
    try {
      const maxOrder = categoryRows.length ? Math.max(...categoryRows.map((r) => r.sortOrder), -1) : -1;
      await addDoc(collection(db, 'articleCategories'), {
        name: n,
        sortOrder: maxOrder + 1,
        createdAt: Timestamp.now(),
      });
      setNewCategoryName('');
    } catch (e) {
      console.error(e);
      setCategoryOpError(
        'Could not add category. Deploy latest Firestore rules, or ensure your account is admin or an Articles-sector author.',
      );
    } finally {
      setCategoryBusy(false);
    }
  };

  const handleSaveCategoryEdit = async () => {
    if (!editingCategory) return;
    const n = editingCategory.name.trim();
    if (!n || n.length > 120) {
      setCategoryOpError('Enter a valid name (1–120 characters).');
      return;
    }
    setCategoryBusy(true);
    setCategoryOpError(null);
    try {
      await updateDoc(doc(db, 'articleCategories', editingCategory.id), { name: n });
      setEditingCategory(null);
    } catch (e) {
      console.error(e);
      setCategoryOpError('Could not update category.');
    } finally {
      setCategoryBusy(false);
    }
  };

  const handleDeleteCategory = async (row: ArticleCategoryRow) => {
    if (!window.confirm(`Delete category “${row.name}”? Existing articles keep their current label.`)) return;
    setCategoryBusy(true);
    setCategoryOpError(null);
    try {
      await deleteDoc(doc(db, 'articleCategories', row.id));
      if (editingCategory?.id === row.id) setEditingCategory(null);
    } catch (e) {
      console.error(e);
      setCategoryOpError('Could not delete category.');
    } finally {
      setCategoryBusy(false);
    }
  };

  const moveCategoryRow = async (row: ArticleCategoryRow, dir: -1 | 1) => {
    const sorted = [...categoryRows].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((r) => r.id === row.id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= sorted.length) return;
    const a = sorted[idx];
    const b = sorted[j];
    setCategoryBusy(true);
    setCategoryOpError(null);
    try {
      await Promise.all([
        updateDoc(doc(db, 'articleCategories', a.id), { sortOrder: b.sortOrder }),
        updateDoc(doc(db, 'articleCategories', b.id), { sortOrder: a.sortOrder }),
      ]);
    } catch (e) {
      console.error(e);
      setCategoryOpError('Could not reorder categories.');
    } finally {
      setCategoryBusy(false);
    }
  };

  const removeAttachmentAt = async (index: number) => {
    const att = attachments[index];
    if (!att) return;
    await deleteStoragePath(att.path);
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const removeHeaderImage = async () => {
    await deleteStoragePath(headerImagePath);
    setHeaderImageUrl(undefined);
    setHeaderImagePath(undefined);
  };

  const handleAttachmentFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    const added: ArticleAttachment[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadingLabel(`Uploading ${i + 1}/${files.length}…`);
        if (file.size > MAX_ATTACHMENT_BYTES) {
          setError(`“${file.name}” is over ${MAX_ATTACHMENT_MB} MB — skipped.`);
          continue;
        }
        const safe = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const path = `articleAttachments/${user.uid}/${Date.now()}_${i}_${safe}`;
        const contentType = file.type || 'application/octet-stream';
        const snap = await uploadBytes(ref(storage, path), file, { contentType });
        const url = await getDownloadURL(snap.ref);
        added.push({ url, path, fileName: file.name });
      }
      if (added.length > 0) {
        setAttachments((prev) => [...prev, ...added]);
      }
    } catch (err) {
      console.error(err);
      setError(`Upload failed: ${storageErrorMessage(err)}`);
    } finally {
      setUploading(false);
      setUploadingLabel('');
    }
  };

  const handleHeaderFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Header image must be an image file (JPG, PNG, WebP, …).');
      return;
    }
    if (file.size > MAX_HEADER_BYTES) {
      setError('Header image must be 5 MB or smaller.');
      return;
    }
    setUploading(true);
    setUploadingLabel('Uploading header…');
    setError(null);
    try {
      await deleteStoragePath(headerImagePath);
      const safe = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const path = `articleHeaders/${user.uid}/${Date.now()}_${safe}`;
      const snap = await uploadBytes(ref(storage, path), file, { contentType: file.type || 'image/jpeg' });
      const url = await getDownloadURL(snap.ref);
      setHeaderImagePath(path);
      setHeaderImageUrl(url);
    } catch (err) {
      console.error(err);
      setError(`Header upload failed: ${storageErrorMessage(err)}`);
    } finally {
      setUploading(false);
      setUploadingLabel('');
    }
  };

  const handleSave = async () => {
    const t = title.trim();
    const d = description.trim();
    if (!t || !d) {
      setError('Title and description are required.');
      return;
    }
    if (category === 'Other' && !categoryOther.trim()) {
      setError('Please describe the category when you choose Other.');
      return;
    }
    setSaving(true);
    setError(null);
    const now = Timestamp.now();
    const authorName =
      mode === 'author'
        ? (authorDisplayName || user.displayName || user.email || '').trim() || 'Author'
        : (user.email || 'Admin').trim();

    const legacyClear = {
      attachmentUrl: deleteField(),
      attachmentPath: deleteField(),
      attachmentFileName: deleteField(),
    };

    try {
      if (editingId) {
        const refDoc = doc(db, 'articles', editingId);
        const payload: Record<string, unknown> = {
          title: t,
          description: d,
          category: category.trim() || 'Uncategorized',
          updatedAt: now,
          attachments,
          ...legacyClear,
        };
        if (category === 'Other') {
          payload.categoryOther = categoryOther.trim();
        } else {
          payload.categoryOther = deleteField();
        }
        if (headerImageUrl && headerImagePath) {
          payload.headerImageUrl = headerImageUrl;
          payload.headerImagePath = headerImagePath;
        } else {
          payload.headerImageUrl = deleteField();
          payload.headerImagePath = deleteField();
        }
        await updateDoc(refDoc, payload as any);
      } else {
        await addDoc(collection(db, 'articles'), {
          title: t,
          description: d,
          category: category.trim() || 'Uncategorized',
          ...(category === 'Other' ? { categoryOther: categoryOther.trim() } : {}),
          authorUid: user.uid,
          authorName,
          attachments,
          ...(headerImageUrl && headerImagePath ? { headerImageUrl, headerImagePath } : {}),
          createdAt: now,
          updatedAt: now,
        });
      }
      setModalOpen(false);
    } catch (err) {
      console.error(err);
      setError('Save failed. Check permissions.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (a: ArticleDoc) => {
    if (mode === 'author' && a.authorUid !== user.uid) return;
    if (!window.confirm(`Delete article “${a.title}”?`)) return;
    try {
      for (const att of attachmentsFromDoc(a)) {
        await deleteStoragePath(att.path);
      }
      await deleteStoragePath(a.headerImagePath);
      await deleteStoragePath(a.attachmentPath);
      await deleteDoc(doc(db, 'articles', a.id));
    } catch (err) {
      console.error(err);
      setError('Delete failed.');
    }
  };

  return (
    <div className="space-y-4">
      {error && !modalOpen && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="rounded-2xl border border-violet-200/90 bg-gradient-to-br from-violet-50/90 to-white p-4 shadow-sm">
        <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-black text-violet-950">Article categories</h3>
            <p className="mt-0.5 max-w-xl text-xs text-slate-600">
              Admins and <strong>Articles</strong> authors can add, rename, reorder, or remove these labels. Participants use them to filter articles.
            </p>
          </div>
          {categoriesLoading ? (
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-violet-600" aria-hidden />
          ) : null}
        </div>
        {categoryOpError ? (
          <p className="mb-2 text-xs font-semibold text-red-600">{categoryOpError}</p>
        ) : null}
        {!categoriesLoading && categoryRows.length === 0 ? (
          <p className="mb-3 text-xs text-slate-500">
            {mode === 'admin'
              ? 'Creating default categories in Firestore… If nothing appears, refresh the page after deploying updated rules.'
              : 'No custom categories in the database yet — the article editor below uses the built-in default list until an admin opens the Articles tab once (to seed defaults) or you create categories here if you have access.'}
          </p>
        ) : null}
        {categoryRows.length > 0 ? (
          <ul className="mb-3 max-h-56 space-y-1.5 overflow-y-auto pr-0.5 [scrollbar-width:thin]">
            {sortedCategoryRows.map((row, idx) => (
              <li
                key={row.id}
                className="flex items-center gap-1 rounded-xl border border-slate-100 bg-white/95 px-2 py-1.5 shadow-sm"
              >
                <div className="flex shrink-0 flex-col gap-0">
                  <button
                    type="button"
                    disabled={categoryBusy || idx === 0}
                    onClick={() => void moveCategoryRow(row, -1)}
                    className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                    aria-label="Move up"
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    type="button"
                    disabled={categoryBusy || idx === sortedCategoryRows.length - 1}
                    onClick={() => void moveCategoryRow(row, 1)}
                    className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                    aria-label="Move down"
                  >
                    <ChevronDown size={16} />
                  </button>
                </div>
                {editingCategory?.id === row.id ? (
                  <>
                    <input
                      value={editingCategory.name}
                      onChange={(e) => setEditingCategory({ id: row.id, name: e.target.value })}
                      className="min-w-0 flex-1 rounded-lg border border-violet-200 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-violet-400"
                      maxLength={120}
                    />
                    <button
                      type="button"
                      disabled={categoryBusy}
                      onClick={() => void handleSaveCategoryEdit()}
                      className="shrink-0 rounded-lg bg-violet-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-violet-700 disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      disabled={categoryBusy}
                      onClick={() => setEditingCategory(null)}
                      className="shrink-0 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{row.name}</span>
                    <button
                      type="button"
                      disabled={categoryBusy}
                      onClick={() => setEditingCategory({ id: row.id, name: row.name })}
                      className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-violet-50 hover:text-violet-700"
                      aria-label={`Edit ${row.name}`}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      disabled={categoryBusy}
                      onClick={() => void handleDeleteCategory(row)}
                      className="shrink-0 rounded-lg p-1.5 text-red-500 hover:bg-red-50"
                      aria-label={`Delete ${row.name}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 border-t border-violet-100/80 pt-3">
          <input
            type="text"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="New category name"
            maxLength={120}
            className="min-w-[10rem] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
          />
          <button
            type="button"
            disabled={categoryBusy || !newCategoryName.trim()}
            onClick={() => void handleAddCategory()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-violet-300 bg-white px-3 py-2 text-xs font-bold text-violet-800 hover:bg-violet-50 disabled:opacity-50"
          >
            <Plus size={14} />
            Add category
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          {mode === 'admin'
            ? 'Create, edit, or remove articles. Choose a category, then add text, attachments, or a header image.'
            : 'Create articles with a category, description, optional header banner, and file attachments.'}
        </p>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-700"
        >
          <Plus size={18} />
          New article
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
        </div>
      ) : articles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center text-slate-500">
          No articles yet. Click <strong>New article</strong> to add one.
        </div>
      ) : (
        <div className="space-y-3">
          {articles.map((a) => {
            const atts = attachmentsFromDoc(a);
            return (
              <div
                key={a.id}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                {a.headerImageUrl ? (
                  <div className="h-32 w-full overflow-hidden bg-slate-100">
                    <img src={a.headerImageUrl} alt="" className="h-full w-full object-cover" />
                  </div>
                ) : null}
                <div className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-slate-900">{a.title}</p>
                      <span className="inline-flex rounded-full bg-violet-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-800">
                        {articleCategoryLabel(a)}
                      </span>
                    </div>
                    {mode === 'admin' && (
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        By {a.authorName || a.authorUid} · {formatArticleDate(a)}
                      </p>
                    )}
                    {mode === 'author' && (
                      <p className="mt-0.5 text-[11px] text-slate-400">Updated {formatArticleDate(a)}</p>
                    )}
                    <p className="mt-2 max-h-40 min-h-0 overflow-y-auto whitespace-pre-wrap pr-1 text-sm leading-relaxed text-slate-600 [scrollbar-width:thin]">
                      {a.description}
                    </p>
                    {atts.length > 0 && (
                      <ul className="mt-2 flex flex-col gap-1">
                        {atts.map((att) => (
                          <li key={att.path}>
                            <a
                              href={att.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-bold text-violet-600 hover:underline"
                            >
                              <FileText size={14} />
                              {att.fileName}
                              <ExternalLink size={12} />
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(a)}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                      <Pencil size={14} className="mr-1 inline" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(a)}
                      className="rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50"
                    >
                      <Trash2 size={14} className="mr-1 inline" />
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-black">{editingId ? 'Edit article' : 'New article'}</h3>
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-full p-2 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>
            {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-500">Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                  placeholder="Article title"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-500">Category</label>
                <select
                  value={category}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCategory(v);
                    if (v !== 'Other') setCategoryOther('');
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                >
                  {categorySelectOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                {category === 'Other' && (
                  <input
                    value={categoryOther}
                    onChange={(e) => setCategoryOther(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="e.g. Research highlights, Local news…"
                  />
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-500">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={6}
                  className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                  placeholder="Full text or summary…"
                />
              </div>

              <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-4">
                <label className="mb-1 block text-xs font-bold text-violet-800">Header banner (optional)</label>
                <p className="mb-2 text-[10px] text-violet-700/80">Wide image shown at the top of this article in lists. Max 5 MB.</p>
                {headerImageUrl ? (
                  <div className="mb-2 space-y-2">
                    <div className="h-24 w-full overflow-hidden rounded-lg border border-violet-200 bg-white">
                      <img src={headerImageUrl} alt="" className="h-full w-full object-cover" />
                    </div>
                    <button
                      type="button"
                      onClick={() => void removeHeaderImage()}
                      className="text-xs font-bold text-red-600 hover:underline"
                    >
                      Remove header image
                    </button>
                  </div>
                ) : null}
                <label
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-violet-900 hover:bg-violet-50 ${uploading ? 'pointer-events-none opacity-60' : ''}`}
                >
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => void handleHeaderFile(e)} />
                  {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
                  {headerImageUrl ? 'Replace header' : 'Upload header image'}
                </label>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-500">Attachments (optional)</label>
                <p className="mb-2 text-[10px] text-slate-400">
                  PDF, images, documents — select multiple files. Up to {MAX_ATTACHMENT_MB} MB each.
                </p>
                {attachments.length > 0 && (
                  <ul className="mb-2 space-y-1 rounded-xl border border-slate-100 bg-slate-50 p-2">
                    {attachments.map((att, idx) => (
                      <li
                        key={att.path}
                        className="flex items-center justify-between gap-2 text-xs text-slate-700"
                      >
                        <span className="min-w-0 truncate font-medium">{att.fileName}</span>
                        <button
                          type="button"
                          onClick={() => void removeAttachmentAt(idx)}
                          className="shrink-0 font-bold text-red-600 hover:underline"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <label
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50 ${uploading ? 'pointer-events-none opacity-60' : ''}`}
                >
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => void handleAttachmentFiles(e)}
                  />
                  {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                  {uploading ? uploadingLabel || 'Uploading…' : 'Add files'}
                </label>
              </div>
            </div>
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || uploading}
                onClick={() => void handleSave()}
                className="flex-1 rounded-xl bg-violet-600 py-2.5 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
