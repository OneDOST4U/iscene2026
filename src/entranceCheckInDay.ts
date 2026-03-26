/** Event-local calendar day for daily entrance check-in (Philippines). */
export const ENTRANCE_CHECKIN_TIMEZONE = 'Asia/Manila';

export function getEntranceCalendarDateKey(d = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: ENTRANCE_CHECKIN_TIMEZONE });
}

function timestampToDateKey(ts: { toDate?: () => Date } | null | undefined): string | null {
  if (!ts || typeof ts.toDate !== 'function') return null;
  try {
    return getEntranceCalendarDateKey(ts.toDate());
  } catch {
    return null;
  }
}

/**
 * Whether an `attendance/{uid}_entrance` document counts as checked in for `todayKey`.
 * Prefers `entranceDateKey` (YYYY-MM-DD); falls back to `scannedAt` or `createdAt` for older docs.
 */
export function isEntranceCheckedInForDateKey(
  data: Record<string, unknown> | undefined | null,
  todayKey: string,
): boolean {
  if (!data) return false;
  const explicit = typeof data.entranceDateKey === 'string' ? data.entranceDateKey.trim() : '';
  if (explicit) return explicit === todayKey;
  const fromScan = timestampToDateKey(data.scannedAt as { toDate?: () => Date });
  if (fromScan) return fromScan === todayKey;
  const fromCreated = timestampToDateKey(data.createdAt as { toDate?: () => Date });
  if (fromCreated) return fromCreated === todayKey;
  return false;
}

/**
 * Normalized YYYY-MM-DD for a meal entitlement's `sessionDate` in Manila.
 * Matches how the event thinks about "the day" of pickup (same as entrance check-in).
 */
export function mealSessionDateKeyManila(sessionDate: string | undefined | null): string | null {
  if (sessionDate == null) return null;
  const raw = String(sessionDate).trim();
  if (!raw) return null;
  const ymd = raw.split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-CA', { timeZone: ENTRANCE_CHECKIN_TIMEZONE });
}

/** True when the meal's session day is "today" in Manila. */
export function isMealSessionDateTodayManila(sessionDate: string | undefined | null): boolean {
  const k = mealSessionDateKeyManila(sessionDate);
  if (!k) return false;
  return k === getEntranceCalendarDateKey();
}
