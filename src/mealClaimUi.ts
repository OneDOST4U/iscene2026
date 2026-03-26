import { getEntranceCalendarDateKey, isMealSessionDateTodayManila, mealSessionDateKeyManila } from './entranceCheckInDay';
import { getMealClaimWindowPhase, isMealInClaimWindow } from './mealClaimWindow';

/** Minimal meal fields for claim UI (all dashboards) */
export type MealClaimUiMeal = {
  id: string;
  type: string;
  itemType?: 'food' | 'kit' | 'both';
  name?: string;
  location?: string;
  foodLocationDetails?: string;
  assignedBoothUid?: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
};

export type MealClaimFooterState = { kind: 'claimed' | 'ready' | 'did_not_claim'; hint?: string };

/** Pickup line: entitlement location, else stall/name from assigned food booth registration */
export function mealPickupLocationLabel(
  meal: MealClaimUiMeal,
  boothRegs: { uid?: string; fullName?: string; boothLocationDetails?: string }[],
): string | null {
  const loc = String(meal.location || '').trim();
  if (loc) return loc;
  const uid = meal.assignedBoothUid;
  if (!uid) return null;
  const br = boothRegs.find((b) => String(b.uid || '') === String(uid));
  if (!br) return null;
  const placement = String(br.boothLocationDetails || '').trim();
  if (placement) return placement;
  const name = String(br.fullName || '').trim();
  return name || null;
}

/**
 * Line to show below the time on entitlement cards: stall/venue from meal or booth,
 * else the first line of organizer “note” when no dedicated location field is set.
 */
export function mealLocationLineForCard(
  meal: MealClaimUiMeal,
  boothRegs: { uid?: string; fullName?: string; boothLocationDetails?: string }[],
): string | null {
  const fromMeal = mealPickupLocationLabel(meal, boothRegs);
  if (fromMeal) return fromMeal;
  const note = String(meal.foodLocationDetails || '').trim();
  if (!note) return null;
  const first = note.split(/\r?\n/)[0]?.trim();
  return first || null;
}

/** Show the amber “Note for this pickup” box only when details add more than the single line under the clock. */
export function mealFoodLocationDetailsShowNoteBox(meal: MealClaimUiMeal, locationLine: string | null): boolean {
  const note = String(meal.foodLocationDetails || '').trim();
  if (!note) return false;
  if (note.includes('\n')) return true;
  const single = note.split(/\r?\n/)[0]?.trim() ?? '';
  if (!locationLine) return true;
  return single !== locationLine.trim();
}

/** Footer: Claim (only when window open) | Claimed | Did not claim */
export function resolveMealClaimFooter(meal: MealClaimUiMeal, now: Date, claimed: boolean): MealClaimFooterState {
  if (claimed) return { kind: 'claimed' };
  const isToday = isMealSessionDateTodayManila(meal.sessionDate);
  const inWindow = isMealInClaimWindow(meal, now);
  if (isToday && inWindow) return { kind: 'ready' };
  const todayKey = getEntranceCalendarDateKey();
  const mk = mealSessionDateKeyManila(meal.sessionDate);
  if (mk && mk > todayKey) {
    return { kind: 'did_not_claim', hint: 'Not available until this session date.' };
  }
  if (isToday && !inWindow) {
    const phase = getMealClaimWindowPhase(meal, now);
    if (phase === 'before') return { kind: 'did_not_claim', hint: 'Pickup is not open yet — see the time above.' };
    if (phase === 'after') return { kind: 'did_not_claim', hint: 'Pickup window has ended for today.' };
    return { kind: 'did_not_claim', hint: 'Not ready to claim yet.' };
  }
  if (mk && mk < todayKey) {
    return { kind: 'did_not_claim', hint: 'Pickup date has passed.' };
  }
  return { kind: 'did_not_claim', hint: 'Not ready to claim yet.' };
}
