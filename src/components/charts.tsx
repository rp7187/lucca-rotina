import { useState } from "preact/hooks";
import type { Entry } from "../model";
import { clock, dur, pad } from "../time";
import { dayBlocks } from "../stats";

/*
 * Gráficos em SVG puro (sem biblioteca). Cores pelos papéis definidos em styles.css
 * (--sleep, --feed, --left, --right, --bath), validados para o fundo escuro, inclusive daltonismo.
 * Toque em uma barra/dia mostra o valor na linha de detalhe acima do gráfico.
 */

/** Escala "redonda" do eixo vertical: até 4 divisões, com folga em cima para o valor escrito na barra. */
function niceScale(vmax: number, unit: "h" | "n") {
  const steps = unit === "h" ? [1, 2, 3, 4, 6, 8] : [1, 2, 5, 10, 20];
  const step = steps.find((s) => Math.ceil(vmax / s) <= 4) ?? steps[steps.length - 1];
  let max = Math.max(step, Math.ceil(vmax / step) * step);
  if (max < vmax * 1.12) max += step;
  return { step, max };
}

type BarProps = {
  values: (number | null)[]; // null = dia sem registro
  labels: string[]; // nome de cada barra (aparece no detalhe)
  ticks: (i: number) => string | null; // rótulo do eixo x (null = sem rótulo)
  unit: "h" | "n"; // horas ou contagem (define a escala do eixo)
  short: (v: number) => string; // valor escrito em cima da barra
  format: (v: number) => string; // valor no detalhe ao tocar
  formatAverage: (v: number) => string;
  color: "sleep" | "feed";
  average?: number | null;
  partialLast?: boolean; // última barra = hoje (dia em curso)
  showValues?: boolean;
};

export function BarChart({ values, labels, ticks, unit, short, format, formatAverage, color, average, partialLast, showValues }: BarProps) {
  const [sel, setSel] = useState<number | null>(null);
  const W = 360, H = 220, L = 34, R = 4, T = 10, B = 26;
  const pw = W - L - R, ph = H - T - B, base = T + ph;
  const { step, max } = niceScale(Math.max(1e-9, average ?? 0, ...values.map((v) => v ?? 0)), unit);
  const y = (v: number) => T + ph * (1 - v / max);
  const n = values.length;
  const slot = pw / n;
  const bw = Math.min(32, slot * 0.68);
  const gridVals: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) gridVals.push(v);

  const selV = sel !== null ? values[sel] : null;
  const detail = sel !== null ? (
    <><b>{labels[sel]}</b>: {selV == null ? "sem registro" : format(selV)}{partialLast && sel === n - 1 ? " (até agora)" : ""}</>
  ) : average != null ? (
    <><span class="avg-sw" aria-hidden="true" /> média {formatAverage(average)}{partialLast ? " · barra clara = hoje, até agora" : ""}</>
  ) : " ";

  return (
    <figure class="chart">
      <p class="chart-detail" aria-live="polite">{detail}</p>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={labels.map((l, i) => `${l}: ${values[i] == null ? "sem registro" : format(values[i]!)}`).join("; ")}>
        {gridVals.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} class={v === 0 ? "axis" : "grid"} />
            <text x={L - 6} y={y(v) + 4} class="ytick" text-anchor="end">{unit === "h" ? `${v}h` : v}</text>
          </g>
        ))}
        {values.map((v, i) => {
          const x = L + i * slot + (slot - bw) / 2;
          const h = v ? base - y(v) : 0;
          const r = Math.min(5, bw / 2, h);
          // barra com topo arredondado e base reta, ancorada no eixo
          const d = h <= 0 ? "" : `M${x},${base}V${base - h + r}Q${x},${base - h} ${x + r},${base - h}H${x + bw - r}Q${x + bw},${base - h} ${x + bw},${base - h + r}V${base}Z`;
          const tick = ticks(i);
          return (
            <g key={i} onClick={() => setSel(sel === i ? null : i)} class="hit">
              <rect x={L + i * slot} y={0} width={slot} height={H} fill="transparent" />
              {d && <path d={d} class={`bar ${color} ${partialLast && i === n - 1 ? "partial" : ""} ${sel === i ? "sel" : ""}`} />}
              {d && showValues && <text x={x + bw / 2} y={y(v!) - 6} class="val" text-anchor="middle">{short(v!)}</text>}
              {tick && <text x={L + i * slot + slot / 2} y={H - 6} class="xtick" text-anchor="middle">{tick}</text>}
            </g>
          );
        })}
        {average != null && average > 0 && <line x1={L} x2={W - R} y1={y(average)} y2={y(average)} class="avg" />}
      </svg>
    </figure>
  );
}

const BAND_NAME = ["madrugada", "madrugada", "manhã", "manhã", "tarde", "tarde", "noite", "noite"];

/** Mamadas por faixa de 3h, em barras horizontais com o número ao lado. */
export function HourBands({ values, format }: { values: number[]; format: (v: number) => string }) {
  const max = Math.max(1e-9, ...values);
  const top = values.indexOf(Math.max(...values));
  return (
    <div class="hbars">
      {values.map((v, i) => (
        <div key={i} class={`hrow ${i === top && v ? "top" : ""}`}>
          <span class="lab">{pad(i * 3)}h–{pad(i * 3 + 3)}h<small>{BAND_NAME[i]}</small></span>
          <span class="track"><span class="fill" style={{ width: `${(v / max) * 100}%` }} /></span>
          <span class="num">{format(v)}</span>
        </div>
      ))}
    </div>
  );
}
export const bandText = (i: number) => `de ${i * 3}h às ${i * 3 + 3}h (${BAND_NAME[i]})`;

/** Linha do tempo 24 h: uma faixa por dia (mais recente em cima), com a noite (19h–7h) sombreada. */
export function Timeline({ entries, days, now, dayName, dayTitle, initialDay = null, maxRows = 14 }: {
  entries: Entry[]; days: number[]; now: number; dayName: (d: number) => string; dayTitle: (d: number) => string;
  initialDay?: number | null; maxRows?: number;
}) {
  const [sel, setSel] = useState<number | null>(initialDay);
  const [all, setAll] = useState(false);
  const W = 360, LW = 58, row = 30, gap = 8, top = 4;
  const pw = W - LW - 4;
  const ordered = [...days].reverse();
  const shown = all ? ordered : ordered.slice(0, maxRows);
  const H = top + shown.length * (row + gap) + 20;
  const x = (h: number) => LW + (h / 24) * pw;
  const hours = [0, 3, 6, 9, 12, 15, 18, 21, 24];
  const selBlocks = sel !== null ? dayBlocks(entries, sel, now).sort((a, b) => a.entry.start - b.entry.start) : [];

  return (
    <figure class="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Linha do tempo de sono, mamadas e banhos por dia">
        {hours.map((h) => (
          <g key={h}>
            <line x1={x(h)} x2={x(h)} y1={top} y2={H - 18} class="grid" stroke-dasharray={h % 6 ? "2 4" : undefined} />
            {h % 6 === 0 && <text x={x(h)} y={H - 4} class="xtick" text-anchor="middle">{h}h</text>}
          </g>
        ))}
        {shown.map((d, i) => {
          const y0 = top + i * (row + gap);
          const blocks = dayBlocks(entries, d, now);
          return (
            <g key={d} class="hit" onClick={() => setSel(sel === d ? null : d)}>
              <rect x={0} y={y0 - gap / 2} width={W} height={row + gap} fill="transparent" />
              <rect x={LW} y={y0} width={pw} height={row} rx={4} class={`lane ${sel === d ? "sel" : ""}`} />
              <rect x={LW} y={y0} width={x(7) - LW} height={row} rx={4} class="lane-night" />
              <rect x={x(19)} y={y0} width={x(24) - x(19)} height={row} rx={4} class="lane-night" />
              <text x={0} y={y0 + row / 2 + 5} class={`tl-day ${i === 0 && dayName(d) === "hoje" ? "today" : ""}`}>{dayName(d)}</text>
              {blocks.filter((b) => b.kind === "sleep").map((b, j) => (
                <rect key={`s${j}`} x={x(b.from)} y={y0 + 3} width={Math.max(2, x(b.to) - x(b.from))} height={row - 6} rx={3} class="blk sleep" />
              ))}
              {blocks.filter((b) => b.kind === "feed").map((b, j) => (
                <rect key={`f${j}`} x={x(b.from) - 1} y={y0 + 7} width={Math.max(4, x(b.to) - x(b.from)) + 2} height={row - 14} rx={2} class="blk feed" />
              ))}
              {blocks.filter((b) => b.kind === "bath").map((b, j) => (
                // banho: marcador fino mais alto que a faixa (formato diferente dos blocos de sono/mamada)
                <rect key={`b${j}`} x={x(b.from) - 2.5} y={y0 - 3} width={5} height={row + 6} rx={2.5} class="blk bath" />
              ))}
            </g>
          );
        })}
      </svg>
      <Legend items={[["sleep", "Sono"], ["feed", "Mamada"], ["bath", "Banho"], ["night", "Noite (19h–7h)"]]} />
      {sel !== null && (
        <div class="day-detail">
          <b>{dayTitle(sel)}</b>
          {selBlocks.length === 0 && <span class="muted"> · sem registros</span>}
          <ul>
            {selBlocks.map((b, j) => (
              <li key={j}><span class={`dot ${b.kind}`} />
                {b.kind === "bath" ? <>Banho {clock(b.entry.start)}</> : <>{b.kind === "feed" ? "Mamada" : "Sono"} {clock(b.entry.start)}–{b.entry.end ? clock(b.entry.end) : "agora"} <span class="muted">({dur((b.entry.end ?? now) - b.entry.start)})</span></>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {ordered.length > maxRows && (
        <button type="button" class="btn ghost wide tl-more" onClick={() => setAll(!all)}>
          {all ? `Mostrar só os últimos ${maxRows} dias` : `Mostrar todos os ${ordered.length} dias`}
        </button>
      )}
    </figure>
  );
}

/** Divisão entre os peitos: barra empilhada com rótulos diretos. */
export function SideSplit({ left, right }: { left: number; right: number }) {
  const total = left + right;
  if (!total) return <p class="muted">Sem mamadas no período.</p>;
  const pl = Math.round((left / total) * 100);
  return (
    <figure class="chart">
      <div class="split" role="img" aria-label={`Esquerdo ${pl}%, Direito ${100 - pl}%`}>
        {left > 0 && <div class="left" style={{ flex: left }} />}
        {right > 0 && <div class="right" style={{ flex: right }} />}
      </div>
      <div class="split-labels">
        <span><i class="sw left" />Esquerdo <b>{pl}%</b> <span class="muted">· {dur(left)}</span></span>
        <span><i class="sw right" />Direito <b>{100 - pl}%</b> <span class="muted">· {dur(right)}</span></span>
      </div>
    </figure>
  );
}

export function Legend({ items }: { items: [string, string][] }) {
  return (
    <div class="legend">
      {items.map(([k, label]) => <span key={k}><i class={`sw ${k}`} />{label}</span>)}
    </div>
  );
}
