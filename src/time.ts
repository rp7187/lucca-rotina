export const MIN = 60_000;
export const HOUR = 3_600_000;

export const pad = (n: number) => String(n).padStart(2, "0");

export const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
/** Soma dias no calendário local (seguro em mudança de horário). */
export const addDays = (t: number, n: number) => {
  const d = new Date(t);
  d.setDate(d.getDate() + n);
  return d.getTime();
};

/** "14:05" */
export const clock = (t: number) => {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** "18 min", "1h05", "2h" */
export function dur(ms: number): string {
  const m = Math.round(ms / MIN);
  if (ms > 0 && m === 0) return "<1 min";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h${pad(r)}` : `${h}h`;
}

/** Cronômetro: "07:42" ou "1:07:42" */
export function timer(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const x = s % 60;
  return h ? `${h}:${pad(m)}:${pad(x)}` : `${pad(m)}:${pad(x)}`;
}

export const ago = (ms: number) => (ms < MIN ? "agora" : `há ${dur(ms)}`);

/** "10/11" */
export const shortDay = (t: number) => new Date(t).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

/** "Hoje", "Ontem", "sáb., 08/11" */
export function dayLabel(t: number, now: number): string {
  const today = startOfDay(now);
  const d = startOfDay(t);
  if (d === today) return "Hoje";
  if (d === addDays(today, -1)) return "Ontem";
  return new Date(t).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
}

/** Valor para <input type="datetime-local"> no fuso local. */
export function toLocalInput(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fromLocalInput(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
}
