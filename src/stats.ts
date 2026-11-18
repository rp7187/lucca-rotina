import { entryEnd, feedDur, sideDur, type Entry, type Feed, type Sleep } from "./model";
import { HOUR, addDays, startOfDay } from "./time";

/** Intervalos maiores que isso são tratados como "sem registro" (não entram nas médias). */
const MAX_GAP = 12 * HOUR;

export type DayStats = {
  day: number; // início do dia (00:00 local)
  partial: boolean; // hoje (dia ainda em curso)
  feeds: number;
  feedMs: number;
  leftMs: number;
  rightMs: number;
  intervals: number[]; // início→início entre mamadas consecutivas (ms), atribuídos ao dia da 2ª
  sleepMs: number; // sono dentro do dia (sonecas que cruzam a meia-noite são divididas)
  naps: number; // sonecas iniciadas no dia
  longestSleepMs: number;
  wakeWindows: number[]; // fim de uma soneca → início da próxima
  baths: number;
};

export type Summary = {
  basisDays: number; // dias usados nas médias
  feedsPerDay: number | null;
  avgFeedMs: number | null;
  avgIntervalMs: number | null;
  sleepPerDay: number | null;
  napsPerDay: number | null;
  avgNapMs: number | null;
  longestSleepMs: number | null;
  avgWakeMs: number | null;
  bathsPerDay: number | null;
  leftMs: number;
  rightMs: number;
};

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/** Estatísticas dos últimos `nDays` dias (incluindo hoje). */
export function computeStats(entries: Entry[], now: number, nDays: number) {
  const today = startOfDay(now);
  const first = addDays(today, -(nDays - 1));
  const feeds = entries.filter((e): e is Feed => e.kind === "feed").sort((a, b) => a.start - b.start);
  const sleeps = entries.filter((e): e is Sleep => e.kind === "sleep").sort((a, b) => a.start - b.start);

  const days: DayStats[] = [];
  for (let d = first; d <= today; d = addDays(d, 1)) {
    days.push({ day: d, partial: d === today, feeds: 0, feedMs: 0, leftMs: 0, rightMs: 0, intervals: [], sleepMs: 0, naps: 0, longestSleepMs: 0, wakeWindows: [], baths: 0 });
  }
  const dayOf = (t: number) => days.find((x) => x.day === startOfDay(t));

  feeds.forEach((f, i) => {
    const d = dayOf(f.start);
    if (!d) return;
    d.feeds++;
    d.feedMs += feedDur(f, now);
    d.leftMs += sideDur(f, "E", now);
    d.rightMs += sideDur(f, "D", now);
    const prev = feeds[i - 1];
    if (prev && f.start - prev.start <= MAX_GAP) d.intervals.push(f.start - prev.start);
  });

  sleeps.forEach((s, i) => {
    const end = entryEnd(s, now);
    for (const d of days) d.sleepMs += overlap(s.start, end, d.day, addDays(d.day, 1));
    const d = dayOf(s.start);
    if (!d) return;
    d.naps++;
    d.longestSleepMs = Math.max(d.longestSleepMs, end - s.start);
    const prev = sleeps[i - 1];
    if (prev?.end != null) {
      const gap = s.start - prev.end;
      if (gap > 0 && gap <= MAX_GAP) d.wakeWindows.push(gap);
    }
  });

  for (const e of entries) if (e.kind === "bath") { const d = dayOf(e.start); if (d) d.baths++; }

  // Médias por dia: só dias completos desde o primeiro registro (hoje distorce: o dia não acabou).
  const firstRecord = entries.length ? startOfDay(Math.min(...entries.map((e) => e.start))) : today;
  let basis = days.filter((d) => !d.partial && d.day >= firstRecord);
  if (!basis.length) basis = days.filter((d) => d.partial);
  const perDay = (f: (d: DayStats) => number) => (basis.length ? basis.reduce((s, d) => s + f(d), 0) / basis.length : null);
  const totalFeeds = basis.reduce((s, d) => s + d.feeds, 0);
  const totalNaps = basis.reduce((s, d) => s + d.naps, 0);

  const summary: Summary = {
    basisDays: basis.length,
    feedsPerDay: perDay((d) => d.feeds),
    avgFeedMs: totalFeeds ? basis.reduce((s, d) => s + d.feedMs, 0) / totalFeeds : null,
    avgIntervalMs: mean(basis.flatMap((d) => d.intervals)),
    sleepPerDay: perDay((d) => d.sleepMs),
    napsPerDay: perDay((d) => d.naps),
    avgNapMs: totalNaps ? basis.reduce((s, d) => s + d.sleepMs, 0) / totalNaps : null,
    longestSleepMs: days.some((d) => d.longestSleepMs) ? Math.max(...days.map((d) => d.longestSleepMs)) : null,
    avgWakeMs: mean(basis.flatMap((d) => d.wakeWindows)),
    bathsPerDay: perDay((d) => d.baths),
    leftMs: days.reduce((s, d) => s + d.leftMs, 0),
    rightMs: days.reduce((s, d) => s + d.rightMs, 0),
  };

  // Mamadas por hora do dia (início), no período todo.
  const byHour = Array.from({ length: 24 }, () => 0);
  for (const f of feeds) if (f.start >= first) byHour[new Date(f.start).getHours()]++;

  return { days, summary, byHour, first };
}

/** Blocos de um dia para a linha do tempo (recortados em 00:00–24:00). */
export function dayBlocks(entries: Entry[], day: number, now: number) {
  const end = addDays(day, 1);
  const out: { kind: Entry["kind"]; from: number; to: number; entry: Entry }[] = [];
  for (const e of entries) {
    const a = Math.max(e.start, day);
    const b = Math.min(entryEnd(e, now), end);
    if (e.kind === "bath") {
      // pontual: entra como marcador no horário
      if (e.start >= day && e.start < end) out.push({ kind: e.kind, from: (e.start - day) / HOUR, to: (e.start - day) / HOUR, entry: e });
      continue;
    }
    if (b > a) out.push({ kind: e.kind, from: (a - day) / HOUR, to: (b - day) / HOUR, entry: e });
  }
  return out;
}
