import { entryEnd, feedDur, sideDur, type Bath, type Entry, type Feed, type Sleep } from "./model";
import { HOUR, addDays, startOfDay } from "./time";

/** Intervalos maiores que isso são tratados como "sem registro" (não entram nas médias). */
const MAX_GAP = 12 * HOUR;

export type Longest = { ms: number; start: number; end: number; ongoing: boolean };

export type DayStats = {
  day: number; // início do dia (00:00 local)
  partial: boolean; // dia ainda em curso (ou recortado num horário, na comparação de "Hoje")
  feeds: number;
  feedMs: number;
  leftMs: number;
  rightMs: number;
  intervals: number[]; // início→início entre mamadas consecutivas (ms), atribuídos ao dia da 2ª
  bands: number[]; // mamadas iniciadas em cada faixa de 3h (8 faixas: 0–3h, 3–6h…)
  sleepMs: number; // sono dentro do dia (sono que cruza a meia-noite é dividido)
  sleeps: number; // sonos iniciados no dia (dia e noite)
  sleepDurs: number[]; // duração de cada sono terminado que começou no dia
  longest: Longest | null; // maior sono iniciado no dia
  wakeWindows: number[]; // fim de um sono → início do próximo
  baths: number[]; // horários dos banhos
};

export type Summary = {
  days: number; // dias usados nas médias
  feedsPerDay: number | null;
  interval: number | null; // "mama a cada"
  feedDur: number | null; // duração média de uma mamada
  bands: number[]; // mamadas por faixa de 3h, por dia
  sleepPerDay: number | null;
  sleepsPerDay: number | null;
  sleepDur: number | null; // duração média de um sono
  wake: number | null; // acordado entre sonos
  longest: Longest | null;
  bathsPerDay: number | null;
  bathTimes: number[];
  leftMs: number;
  rightMs: number;
};

type Split = { feeds: Feed[]; sleeps: Sleep[]; baths: Bath[] };

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
export const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

function split(entries: Entry[]): Split {
  const byStart = (a: Entry, b: Entry) => a.start - b.start;
  return {
    feeds: entries.filter((e): e is Feed => e.kind === "feed").sort(byStart),
    sleeps: entries.filter((e): e is Sleep => e.kind === "sleep").sort(byStart),
    baths: entries.filter((e): e is Bath => e.kind === "bath").sort(byStart),
  };
}

/** Números de um dia. `cut` recorta o dia num horário (usado para comparar "hoje até agora" com "ontem até a mesma hora"). */
function dayStats({ feeds, sleeps, baths }: Split, day: number, now: number, cut = Infinity): DayStats {
  const dayEnd = addDays(day, 1);
  const end = Math.min(dayEnd, cut, now);
  const d: DayStats = {
    day, partial: end < dayEnd, feeds: 0, feedMs: 0, leftMs: 0, rightMs: 0, intervals: [], bands: Array(8).fill(0),
    sleepMs: 0, sleeps: 0, sleepDurs: [], longest: null, wakeWindows: [], baths: [],
  };

  feeds.forEach((f, i) => {
    if (f.start < day || f.start >= end) return;
    d.feeds++;
    d.feedMs += feedDur(f, now);
    d.leftMs += sideDur(f, "E", now);
    d.rightMs += sideDur(f, "D", now);
    d.bands[Math.floor(new Date(f.start).getHours() / 3)]++;
    const prev = feeds[i - 1];
    if (prev && f.start - prev.start <= MAX_GAP) d.intervals.push(f.start - prev.start);
  });

  sleeps.forEach((s, i) => {
    const sEnd = Math.min(entryEnd(s, now), cut);
    d.sleepMs += overlap(s.start, sEnd, day, end);
    if (s.start < day || s.start >= end) return;
    d.sleeps++;
    const ms = sEnd - s.start;
    if (s.end !== null && s.end <= cut) d.sleepDurs.push(ms);
    if (!d.longest || ms > d.longest.ms) d.longest = { ms, start: s.start, end: sEnd, ongoing: s.end === null };
    const prev = sleeps[i - 1];
    if (prev?.end != null) {
      const gap = s.start - prev.end;
      if (gap > 0 && gap <= MAX_GAP) d.wakeWindows.push(gap);
    }
  });

  for (const b of baths) if (b.start >= day && b.start < end) d.baths.push(b.start);
  return d;
}

function summarize(days: DayStats[]): Summary {
  const n = days.length;
  const sum = (f: (d: DayStats) => number) => days.reduce((s, d) => s + f(d), 0);
  const perDay = (f: (d: DayStats) => number) => (n ? sum(f) / n : null);
  const feeds = sum((d) => d.feeds);
  let longest: Longest | null = null;
  for (const d of days) if (d.longest && (!longest || d.longest.ms > longest.ms)) longest = d.longest;
  return {
    days: n,
    feedsPerDay: perDay((d) => d.feeds),
    interval: mean(days.flatMap((d) => d.intervals)),
    feedDur: feeds ? sum((d) => d.feedMs) / feeds : null,
    bands: Array.from({ length: 8 }, (_, i) => (n ? sum((d) => d.bands[i]) / n : 0)),
    sleepPerDay: perDay((d) => d.sleepMs),
    sleepsPerDay: perDay((d) => d.sleeps),
    sleepDur: mean(days.flatMap((d) => d.sleepDurs)),
    wake: mean(days.flatMap((d) => d.wakeWindows)),
    longest,
    bathsPerDay: perDay((d) => d.baths.length),
    bathTimes: days.flatMap((d) => d.baths),
    leftMs: sum((d) => d.leftMs),
    rightMs: sum((d) => d.rightMs),
  };
}

/**
 * Estatísticas do período.
 * - `nDays === 1`: hoje até agora, comparado com ontem até o mesmo horário.
 * - demais: médias dos `nDays` dias completos antes de hoje, comparadas com os `nDays` dias anteriores a eles.
 *   Hoje entra só nos gráficos (`days`), como última barra.
 * Dias antes do primeiro registro não entram nas médias (puxariam tudo para baixo).
 */
export function computeStats(entries: Entry[], now: number, nDays: number) {
  const sp = split(entries);
  const today = startOfDay(now);
  const firstRecord = entries.length ? startOfDay(Math.min(...entries.map((e) => e.start))) : today;
  const range = (from: number) => Array.from({ length: nDays }, (_, i) => dayStats(sp, addDays(from, i), now));

  let cur: DayStats[], prev: DayStats[], days: DayStats[];
  if (nDays === 1) {
    cur = [dayStats(sp, today, now)];
    prev = [dayStats(sp, addDays(today, -1), now, addDays(now, -1))];
    days = cur;
  } else {
    cur = range(addDays(today, -nDays));
    prev = range(addDays(today, -2 * nDays));
    days = [...cur, dayStats(sp, today, now)];
  }
  const curBasis = cur.filter((d) => d.day >= firstRecord);
  const prevBasis = prev.filter((d) => d.day >= firstRecord);

  return {
    days,
    cur: summarize(curBasis),
    prev: prevBasis.length ? summarize(prevBasis) : null,
    basisFirst: curBasis[0]?.day ?? null,
    basisLast: cur[cur.length - 1].day,
    lastBath: sp.baths[sp.baths.length - 1] ?? null,
  };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/**
 * Previsão da próxima mamada: início da última + intervalo típico.
 * O intervalo muda muito entre dia e noite, então usa os intervalos dos últimos 7 dias que começaram
 * perto do mesmo horário (±2h); com poucos exemplos, usa todos os dos 7 dias. Mediana, para um registro
 * esquecido não distorcer. Sem pelo menos 4 intervalos, não prevê.
 */
export function predictNextFeed(entries: Entry[], now: number): { at: number; typical: number; sameTime: boolean } | null {
  const feeds = entries.filter((e): e is Feed => e.kind === "feed").sort((a, b) => a.start - b.start);
  const last = feeds[feeds.length - 1];
  if (!last || last.end === null) return null;
  const minuteOfDay = (t: number) => { const d = new Date(t); return d.getHours() * 60 + d.getMinutes(); };
  const ref = minuteOfDay(last.start);
  const all: number[] = [], near: number[] = [];
  for (let i = 1; i < feeds.length; i++) {
    const a = feeds[i - 1], gap = feeds[i].start - a.start;
    if (a.start < addDays(now, -7) || gap > MAX_GAP) continue;
    all.push(gap);
    const diff = Math.abs(minuteOfDay(a.start) - ref);
    if (Math.min(diff, 1440 - diff) <= 120) near.push(gap);
  }
  const sameTime = near.length >= 4;
  const pool = sameTime ? near : all;
  if (pool.length < 4) return null;
  const typical = median(pool);
  return { at: last.start + typical, typical, sameTime };
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
