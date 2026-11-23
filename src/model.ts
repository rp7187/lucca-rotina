/** Lado do peito: Esquerdo / Direito. */
export type Side = "E" | "D";

/** Trecho contínuo de uma mamada em um dos peitos (a troca de lado abre um novo trecho). */
export type Segment = { side: Side; start: number; end: number | null };

/** Mamada no peito. `end === null` = em andamento. Tempos em ms (epoch). */
export type Feed = { id: string; kind: "feed"; start: number; end: number | null; segments: Segment[] };

/** Soneca / sono. `end === null` = dormindo agora. */
export type Sleep = { id: string; kind: "sleep"; start: number; end: number | null };

/** Banho: só o horário (registro pontual; `end` = `start`). Adicionado depois da v1 — tipo novo, os antigos não mudam. */
export type Bath = { id: string; kind: "bath"; start: number; end: number };

/** Marca de uma medição especial: a do nascimento e a da alta do hospital (no máximo uma de cada). */
export type MeasureTag = "birth" | "discharge";

/**
 * Medição de peso e/ou altura (registro pontual; `end` = `start`, ao meio-dia da data informada).
 * Adicionado depois da v1 — tipo novo, os antigos não mudam. Peso em gramas, altura em cm; ao menos um dos dois.
 */
export type Measure = { id: string; kind: "measure"; start: number; end: number; weightG?: number; heightCm?: number; tag?: MeasureTag };

export type Entry = Feed | Sleep | Bath | Measure;

/** Registro novo ainda sem dados (abre o formulário). `tag` só para medição. */
export type Draft = { kind: Entry["kind"]; tag?: MeasureTag };

export const KIND_NAME: Record<Entry["kind"], string> = { feed: "mamada", sleep: "soneca", bath: "banho", measure: "medição" };
export const TAG_NAME: Record<MeasureTag, string> = { birth: "Nascimento", discharge: "Alta do hospital" };

export const SIDE_NAME: Record<Side, string> = { E: "Esquerdo", D: "Direito" };
export const other = (s: Side): Side => (s === "E" ? "D" : "E");

/** randomUUID só existe em contexto seguro (HTTPS/localhost); no teste pela rede local cai no fallback. */
export const uid = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const segDur = (g: Segment, now: number) => Math.max(0, (g.end ?? now) - g.start);
export const feedDur = (f: Feed, now: number) => f.segments.reduce((s, g) => s + segDur(g, now), 0);
export const sideDur = (f: Feed, side: Side, now: number) =>
  f.segments.filter((g) => g.side === side).reduce((s, g) => s + segDur(g, now), 0);
export const entryEnd = (e: Entry, now: number) => e.end ?? now;

/** "E → D" */
export const sidesLabel = (f: Feed) => {
  const seq: Side[] = [];
  for (const g of f.segments) if (seq[seq.length - 1] !== g.side) seq.push(g.side);
  return seq.join(" → ");
};

/**
 * Monta os trechos a partir do formulário de edição: começa pelo `first`, depois o outro lado.
 * Minutos zerados são ignorados.
 */
export function segmentsFromForm(start: number, first: Side, minFirst: number, minSecond: number): Segment[] {
  const segs: Segment[] = [];
  let t = start;
  for (const [side, min] of [[first, minFirst], [other(first), minSecond]] as const) {
    if (min > 0) {
      segs.push({ side, start: t, end: t + min * 60_000 });
      t += min * 60_000;
    }
  }
  return segs;
}

export function isEntry(x: unknown): x is Entry {
  if (!x || typeof x !== "object") return false;
  const e = x as Record<string, unknown>;
  const okTimes = typeof e.id === "string" && typeof e.start === "number" && (e.end === null || typeof e.end === "number");
  if (!okTimes) return false;
  if (e.kind === "sleep") return true;
  if (e.kind === "bath") return typeof e.end === "number";
  if (e.kind === "measure") {
    const optNum = (v: unknown) => v === undefined || (typeof v === "number" && v > 0);
    return typeof e.end === "number" && optNum(e.weightG) && optNum(e.heightCm) &&
      (e.weightG !== undefined || e.heightCm !== undefined) &&
      (e.tag === undefined || e.tag === "birth" || e.tag === "discharge");
  }
  return e.kind === "feed" && Array.isArray(e.segments) &&
    e.segments.every((g: Record<string, unknown>) => (g.side === "E" || g.side === "D") && typeof g.start === "number");
}
