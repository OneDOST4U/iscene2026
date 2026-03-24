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
