import React from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from './firebase';
import { DEFAULT_ARTICLE_CATEGORIES } from './articleCategories';

export type ArticleCategoryRow = { id: string; name: string; sortOrder: number };

/**
 * Live category labels from Firestore `articleCategories`, ordered by sortOrder.
 * Falls back to DEFAULT_ARTICLE_CATEGORIES when the collection is empty (before admin seeds).
 */
export function useArticleCategoryNames(): {
  rows: ArticleCategoryRow[];
  names: string[];
  loading: boolean;
  fromFirestore: boolean;
} {
  const [rows, setRows] = React.useState<ArticleCategoryRow[]>([]);
  const [loading, setLoading] = React.useState(true);

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
        setRows(list);
        setLoading(false);
      },
      () => {
        setRows([]);
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  const fromFirestore = rows.length > 0;
  const names = React.useMemo(() => {
    if (rows.length > 0) return rows.map((r) => r.name);
    return [...DEFAULT_ARTICLE_CATEGORIES];
  }, [rows]);

  return { rows, names, loading, fromFirestore };
}
