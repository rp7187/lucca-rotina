import type { Entry, Measure } from "./model";
import { pad, startOfDay } from "./time";

const DAY = 86_400_000;

export const measuresOf = (entries: Entry[]) =>
  entries.filter((e): e is Measure => e.kind === "measure").sort((a, b) => a.start - b.start);

/* ---------- formatos ---------- */

/** 3250 → "3,25 kg"; 3255 → "3,255 kg"; 4100 → "4,10 kg". */
export function kg(g: number): string {
  let s = (g / 1000).toFixed(3);
  if (s.endsWith("0")) s = s.slice(0, -1);
  return `${s.replace(".", ",")} kg`;
}
/** Diferença de peso: "+850 g", "−120 g", "+1,25 kg". */
export function gDelta(g: number): string {
  const sign = g > 0 ? "+" : g < 0 ? "−" : "";
  const a = Math.abs(Math.round(g));
  return a >= 1000 ? `${sign}${kg(a)}` : `${sign}${a} g`;
}
/** 49.5 → "49,5 cm"; 54 → "54 cm". */
export const cm = (v: number) => `${Number(v.toFixed(1)).toString().replace(".", ",")} cm`;
export const cmDelta = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${cm(Math.abs(v))}`;

/** Lê "3,25", "3.250" ou "3250" (gramas) → gramas. */
export function parseWeight(s: string): number | null {
  const v = Number(s.trim().replace(",", "."));
  if (!s.trim() || !Number.isFinite(v) || v <= 0) return null;
  return Math.round(v > 100 ? v : v * 1000);
}
export function parseHeight(s: string): number | null {
  const v = Number(s.trim().replace(",", "."));
  if (!s.trim() || !Number.isFinite(v) || v <= 0) return null;
  return Math.round(v * 10) / 10;
}

/** Data para <input type="date"> e de volta (meio-dia local: a hora não importa para medições). */
export const toDateInput = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export function fromDateInput(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], 12).getTime() : null;
}

/* ---------- idade ---------- */

function addMonths(t: number, n: number) {
  const d = new Date(t);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d.getTime();
}
export const daysBetween = (a: number, b: number) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);

/** Idade em "12 dias", "1 mês e 5 dias", "3 meses". */
export function ageText(birth: number, t: number): string {
  const b = startOfDay(birth), d = startOfDay(t);
  let months = 0;
  while (addMonths(b, months + 1) <= d) months++;
  const days = daysBetween(addMonths(b, months), d);
  const dd = `${days} dia${days === 1 ? "" : "s"}`;
  if (!months) return dd;
  const mm = months === 1 ? "1 mês" : `${months} meses`;
  return days ? `${mm} e ${dd}` : mm;
}

/* ---------- resumo ---------- */

export type WeightGain = { gPerDay: number; days: number; from: Measure };

/** Ganho médio por dia entre duas medições de peso (null se no mesmo dia). */
export function gainPerDay(to: Measure, from: Measure): WeightGain | null {
  const days = daysBetween(from.start, to.start);
  if (days < 1 || to.weightG == null || from.weightG == null) return null;
  return { gPerDay: (to.weightG - from.weightG) / days, days, from };
}

export function growthSummary(ms: Measure[]) {
  const birth = ms.find((m) => m.tag === "birth") ?? null;
  const discharge = ms.find((m) => m.tag === "discharge") ?? null;
  const ws = ms.filter((m) => m.weightG != null);
  const hs = ms.filter((m) => m.heightCm != null);
  const lastW = ws[ws.length - 1] ?? null;
  const prevW = ws[ws.length - 2] ?? null;
  const lastH = hs[hs.length - 1] ?? null;

  // Menor peso depois do nascimento e quando voltou ao peso do nascimento (fatos, sem juízo).
  let lowest: Measure | null = null, regained: Measure | null = null;
  if (birth?.weightG != null) {
    for (const m of ws) {
      if (m.start <= birth.start || m === birth) continue;
      if (!regained && (!lowest || m.weightG! < lowest.weightG!)) lowest = m;
      if (lowest && lowest.weightG! < birth.weightG && !regained && m.weightG! >= birth.weightG) regained = m;
    }
    if (lowest && lowest.weightG! >= birth.weightG) lowest = null;
  }

  return {
    birth, discharge, ws, hs, lastW, prevW, lastH, lowest, regained,
    recent: lastW && prevW ? gainPerDay(lastW, prevW) : null,
    sinceDischarge: lastW && discharge?.weightG != null && lastW !== discharge ? gainPerDay(lastW, discharge) : null,
    sinceBirth: lastW && birth?.weightG != null && lastW !== birth ? gainPerDay(lastW, birth) : null,
  };
}
