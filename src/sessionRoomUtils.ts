import { ENTRANCE_CHECKIN_TIMEZONE, getEntranceCalendarDateKey, mealSessionDateKeyManila } from './entranceCheckInDay';

/** Minutes since midnight in Manila (event clock) for `now`. */
export function getManilaClockMinutesSinceMidnight(now: Date): number {
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: ENTRANCE_CHECKIN_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(now);
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  return hour * 60 + minute;
}

/** Whether the current time is before, during, or after the session’s scheduled window (Manila date + timeline). */
export type BreakoutSchedulePhase = 'during' | 'before' | 'after' | 'unknown';

export function getBreakoutRoomSchedulePhase(
  room: { sessionDate?: string; timeline?: string },
  now: Date = new Date(),
): BreakoutSchedulePhase {
  const sessionKey = mealSessionDateKeyManila(room.sessionDate ?? '');
  const range = parseTimelineToMinutes(String(room.timeline ?? '').trim());
  if (!sessionKey || !range) return 'unknown';

  const todayKey = getEntranceCalendarDateKey(now);
  if (sessionKey < todayKey) return 'after';
  if (sessionKey > todayKey) return 'before';

  const mins = getManilaClockMinutesSinceMidnight(now);
  if (mins < range.start) return 'before';
  if (mins >= range.end) return 'after';
  return 'during';
}

/** Non-null = reservations and breakout QR time-in are not allowed. Null = within window or schedule unknown. */
export function getBreakoutRoomScheduleBlockReason(
  room: { sessionDate?: string; timeline?: string },
  now: Date = new Date(),
): string | null {
  const phase = getBreakoutRoomSchedulePhase(room, now);
  if (phase === 'during' || phase === 'before' || phase === 'unknown') return null;

  if (phase === 'after') {
    const sessionKey = mealSessionDateKeyManila(room.sessionDate ?? '');
    const todayKey = getEntranceCalendarDateKey(now);
    // #region agent log
    fetch('http://127.0.0.1:7397/ingest/56484124-7df3-4537-80fa-738427537570', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'ec45ad' },
      body: JSON.stringify({
        sessionId: 'ec45ad',
        runId: 'breakout-reserve-window',
        hypothesisId: 'RW3',
        location: 'src/sessionRoomUtils.ts:getBreakoutRoomScheduleBlockReason:after',
        message: 'Reservation blocked by after-phase rule',
        data: {
          phase,
          sessionDate: room.sessionDate ?? null,
          timeline: room.timeline ?? null,
          sessionKey: sessionKey ?? null,
          todayKey: todayKey ?? null,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    if (sessionKey && todayKey && sessionKey < todayKey) {
      return 'This session date has passed. Reservations and check-in are closed.';
    }
    return 'The scheduled time for this session has ended. Reservations and check-in are closed.';
  }

  return null;
}

/** Parse timeline (e.g. "8:00 AM - 9:00 AM") to minutes from midnight. Returns null if unparseable. */
export function parseTimelineToMinutes(timeline: string): { start: number; end: number } | null {
  const parts = timeline.split(/[–-]/).map((s) => s.trim());
  if (parts.length !== 2) return null;
  const parseOne = (s: string): number | null => {
    const t = s.trim();
    const m = t.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm|NN|nn)/i);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const min = m[2] ? parseInt(m[2], 10) : 0;
    if (/NN/i.test(m[3])) return 12 * 60 + min;
    if (/PM/i.test(m[3]) && h !== 12) h += 12;
    if (/AM/i.test(m[3]) && h === 12) h = 0;
    return h * 60 + min;
  };
  const start = parseOne(parts[0]);
  const end = parseOne(parts[1]);
  if (start == null || end == null) return null;
  return { start, end };
}

/** Check if two rooms overlap in date and time. Returns true if they overlap. */
export function roomsOverlap(
  a: { sessionDate?: string; timeline?: string },
  b: { sessionDate?: string; timeline?: string },
): boolean {
  if (!a.sessionDate || !b.sessionDate) return false;
  const dateA = String(a.sessionDate).split('T')[0];
  const dateB = String(b.sessionDate).split('T')[0];
  if (dateA !== dateB) return false;
  if (!a.timeline || !b.timeline) return false;
  const rangeA = parseTimelineToMinutes(a.timeline);
  const rangeB = parseTimelineToMinutes(b.timeline);
  if (!rangeA || !rangeB) return false;
  return rangeA.start < rangeB.end && rangeB.start < rangeA.end;
}

/** Format room date + timeline as "March 24, 8am-10pm" */
export function formatSessionDateTime(room: { sessionDate?: string; timeline?: string }): string {
  const parts: string[] = [];
  if (room.sessionDate) {
    const d = new Date(room.sessionDate);
    parts.push(d.toLocaleDateString('en-PH', { month: 'long', day: 'numeric' }));
  }
  if (room.timeline) {
    const short = room.timeline
      .replace(/0?(\d{1,2}):00\s*(AM|PM)/gi, (_, num, m) => String(parseInt(num, 10)) + m.toLowerCase())
      .replace(/(\d{1,2})\s+(am|pm)\b/gi, (_, num, m) => String(parseInt(num, 10)) + m.toLowerCase())
      .replace(/\s*[–-]\s*/g, '-')
      .trim();
    parts.push(short);
  }
  return parts.join(', ') || '—';
}

/** After scheduled session end, Live Q&A posting stays open for this long (Manila). */
export const ROOM_LIVE_QA_GRACE_MS = 60 * 60 * 1000;

/**
 * Scheduled end instant for the breakout session (timeline end on session calendar day, Manila wall time).
 * Null if date/timeline cannot be parsed.
 */
export function getRoomScheduledSessionEndDate(room: { sessionDate?: string; timeline?: string }): Date | null {
  const ymd = mealSessionDateKeyManila(room.sessionDate ?? '');
  const range = parseTimelineToMinutes(String(room.timeline ?? '').trim());
  if (!ymd || !range) return null;
  const endMins = range.end;
  const h = Math.floor(endMins / 60);
  const min = endMins % 60;
  const iso = `${ymd}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00+08:00`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Posting to Live Q&A is allowed until scheduled session end + 1 hour.
 * If schedule is unknown, posting stays allowed (same as other breakout “unknown” behaviors).
 */
export function isRoomLiveQaSendAllowed(
  room: { sessionDate?: string; timeline?: string },
  now: Date = new Date(),
): boolean {
  const end = getRoomScheduledSessionEndDate(room);
  if (!end) return true;
  return now.getTime() <= end.getTime() + ROOM_LIVE_QA_GRACE_MS;
}
