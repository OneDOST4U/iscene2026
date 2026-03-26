/** Default labels seeded into Firestore `articleCategories` and used as fallback when the collection is empty. */
export const DEFAULT_ARTICLE_CATEGORIES = [
  'Uncategorized',
  'News & updates',
  'Events & schedule',
  'Program & sessions',
  'Partners & sponsors',
  'Exhibition & booths',
  'Resources & downloads',
  'Media & gallery',
  'Press release',
  'Community',
  'Other',
] as const;

/** @deprecated Use DEFAULT_ARTICLE_CATEGORIES; kept for older imports. */
export const ARTICLE_CATEGORIES = DEFAULT_ARTICLE_CATEGORIES;

export type ArticleCategory = (typeof DEFAULT_ARTICLE_CATEGORIES)[number];

export function articleCategoryLabel(article: {
  category?: string;
  categoryOther?: string;
}): string {
  const c = typeof article.category === 'string' ? article.category.trim() : '';
  const base = c || 'Uncategorized';
  if (base === 'Other') {
    const o = typeof article.categoryOther === 'string' ? article.categoryOther.trim() : '';
    return o ? `Other: ${o}` : 'Other';
  }
  return base;
}
