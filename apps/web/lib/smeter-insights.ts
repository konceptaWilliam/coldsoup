// Aggregate-scoring logic for S-meters, ported from the standalone
// rehearsal-pain-planner (lib/insights.ts + lib/queries.ts). Pure functions,
// no framework deps. Presentation labels (day names, insight copy) are built
// client-side via i18n; the server returns classifications + indices only.

export interface SMeterMemberScore {
  userId: string;
  displayName: string;
  score: number;
}

export interface SMeterDaySummary {
  dayIndex: number;
  avg: number;
  max: number;
  min: number;
  scores: number[];
  memberScores: SMeterMemberScore[];
  classification: string;
}

export interface SMeterStats {
  days: SMeterDaySummary[];
  bestDay: number;
  worstDay: number;
  insights: { dayIndex: number; classification: string }[];
}

export function classifyDay(s: { avg: number; max: number }): string {
  if (s.max === 6) return "blocked";
  if (s.avg <= 2.0) return "perfect";
  if (s.avg <= 2.8) return "great";
  if (s.avg <= 3.5) return "okay";
  if (s.avg <= 4.5) return "tough";
  return "bad";
}

// Lowest average wins.
export function findBestDay(days: SMeterDaySummary[]): number {
  let b = 0;
  for (let i = 1; i < days.length; i++) {
    if (days[i].avg < days[b].avg) b = i;
  }
  return b;
}

// Highest max wins (a single "absolutely can't" blocks the day), avg breaks ties.
export function findWorstDay(days: SMeterDaySummary[]): number {
  let w = 0;
  for (let i = 1; i < days.length; i++) {
    if (
      days[i].max > days[w].max ||
      (days[i].max === days[w].max && days[i].avg > days[w].avg)
    ) {
      w = i;
    }
  }
  return w;
}

// Build the full aggregate from every member's per-day scores. `expected` is the
// day count (7 for weekly, customDates.length for dates) so empty days still appear.
export function buildStats(
  responses: { dayIndex: number; painScore: number; userId: string; displayName: string }[],
  expected: number
): SMeterStats {
  const byDay = new Map<number, typeof responses>();
  for (const r of responses) {
    const arr = byDay.get(r.dayIndex);
    if (arr) arr.push(r);
    else byDay.set(r.dayIndex, [r]);
  }

  const days: SMeterDaySummary[] = [];
  for (let d = 0; d < expected; d++) {
    const rs = byDay.get(d) ?? [];
    const scores = rs.map((r) => r.painScore);
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const max = scores.length ? Math.max(...scores) : 0;
    const min = scores.length ? Math.min(...scores) : 0;
    days.push({
      dayIndex: d,
      avg: Math.round(avg * 100) / 100,
      max,
      min,
      scores: [...scores].sort((a, b) => a - b),
      memberScores: rs.map((r) => ({ userId: r.userId, displayName: r.displayName, score: r.painScore })),
      classification: classifyDay({ avg, max }),
    });
  }

  return {
    days,
    bestDay: findBestDay(days),
    worstDay: findWorstDay(days),
    insights: days.map((d) => ({ dayIndex: d.dayIndex, classification: d.classification })),
  };
}
