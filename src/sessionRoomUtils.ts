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
