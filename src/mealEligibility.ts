/** Registration `sector` values for expo exhibitors (see App registration form). */
export const EXHIBITOR_REGISTRATION_SECTORS = ['Exhibitor', 'Exhibitor (Booth)'] as const;

export function isExhibitorRegistrationSector(sector: string | undefined | null): boolean {
  const s = (sector || '').trim();
  return (EXHIBITOR_REGISTRATION_SECTORS as readonly string[]).includes(s);
}

type MealEligibilitySource = {
  eligibleSectors?: string[];
  eligibleParticipantIds?: string[];
};

/** Same rule for participant app “My Entitlements”, food booth claim validation, and exhibitor hub. */
export function registrationSectorEligibleForMeal(
  meal: MealEligibilitySource,
  registrationId: string | undefined,
  sector: string,
): boolean {
  const byPerson =
    meal.eligibleParticipantIds &&
    meal.eligibleParticipantIds.length > 0 &&
    registrationId &&
    meal.eligibleParticipantIds.includes(registrationId);
  if (byPerson) return true;

  const list = meal.eligibleSectors;
  if (!list || list.length === 0) return true;
  return list.includes(sector);
}

/**
 * Sectors to use in `where('sector', 'in', …)` when loading approved registrations for a meal.
 * Returns null = load all approved (up to limit). Otherwise deduped list (chunk to ≤10 per Firestore `in` query).
 */
export function sectorsForFoodBoothRegistrationQuery(meal: MealEligibilitySource): string[] | null {
  const raw = meal.eligibleSectors?.filter((s) => String(s).trim()) ?? [];
  if (raw.length === 0) return null;
  return Array.from(new Set(raw));
}

/** @deprecated Eligible sectors are strict; exhibitors are not implied by “Participants”-only lists. */
export function mealImpliedIncludesExhibitors(_meal: MealEligibilitySource): boolean {
  return false;
}
