/**
 * Parse meal window times (HTML5 `time` 24h like "15:32" or legacy "3:32 PM").
 * For YYYY-MM-DD session dates, combines date + time in Philippines local wall-clock (+08:00)
 * so claim windows match the event day regardless of the viewer's browser timezone.
 */
export function parseMealWindowTime(timeStr: string, dateStr: string): Date {
  const raw = String(dateStr || '').trim();
  const ymd = raw.split('T')[0];
  const upper = (timeStr || '').toUpperCase().trim();
  const seg = upper.split(/\s+/);
  const timePart = seg[0] || '';
  const period = seg[1];
  const parts = timePart.split(':').map(Number);
  let h = parts[0] || 0;
  const m = parts[1] || 0;
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const iso = `${ymd}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+08:00`;
    return new Date(iso);
  }
  const d = raw ? new Date(raw) : new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

/** True when `now` is between start and end on the meal's session date. */
export function isMealInClaimWindow(
  meal: { sessionDate: string; startTime: string; endTime: string },
  now: Date = new Date(),
): boolean {
  if (!meal.startTime?.trim() || !meal.endTime?.trim()) return false;
  const start = parseMealWindowTime(meal.startTime, meal.sessionDate);
  const end = parseMealWindowTime(meal.endTime, meal.sessionDate);
  return now >= start && now <= end;
}

/** Relative to the meal's session day, is `now` before / during / after the window (times must be set). */
export function getMealClaimWindowPhase(
  meal: { sessionDate: string; startTime: string; endTime: string },
  now: Date = new Date(),
): 'before' | 'during' | 'after' | 'none' {
  if (!meal.startTime?.trim() || !meal.endTime?.trim()) return 'none';
  const start = parseMealWindowTime(meal.startTime, meal.sessionDate);
  const end = parseMealWindowTime(meal.endTime, meal.sessionDate);
  if (now < start) return 'before';
  if (now > end) return 'after';
  return 'during';
}

/** Display one meal time for UI (12-hour with AM/PM). Handles HTML5 `HH:mm` and legacy `h:mm AM/PM`. */
export function formatMealTimeForDisplay(timeStr: string, locale = 'en-PH'): string {
  const raw = String(timeStr || '').trim();
  if (!raw) return '';
  const d = parseMealWindowTime(raw, '2000-01-01');
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12: true });
}

/** Display a pickup window as `3:32 PM – 9:32 PM`. */
export function formatMealTimeRangeForDisplay(startTime: string, endTime: string, locale = 'en-PH'): string {
  const a = formatMealTimeForDisplay(startTime, locale);
  const b = formatMealTimeForDisplay(endTime, locale);
  if (!a && !b) return '';
  if (!a) return b;
  if (!b) return a;
  return `${a} – ${b}`;
}
