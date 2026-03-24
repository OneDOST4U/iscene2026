/** Booth focus categories for exhibitor listings and filters (Firestore: boothCategory, boothCategoryOther). */
export const EXHIBITOR_BOOTH_CATEGORIES = ['Tech', 'Innovation', 'Business', 'Agriculture', 'Other'] as const;
export type ExhibitorBoothCategory = (typeof EXHIBITOR_BOOTH_CATEGORIES)[number];

export function isExhibitorBoothCategory(v: string): v is ExhibitorBoothCategory {
  return (EXHIBITOR_BOOTH_CATEGORIES as readonly string[]).includes(v);
}

/** Label shown on cards and in search (uses custom text when category is Other). */
export function exhibitorCategoryLabel(booth: { boothCategory?: string; boothCategoryOther?: string }): string {
  const c = String(booth.boothCategory || '').trim();
  if (!c) return '';
  if (c === 'Other') {
    const custom = String(booth.boothCategoryOther || '').trim();
    return custom || 'Other';
  }
  return c;
}
