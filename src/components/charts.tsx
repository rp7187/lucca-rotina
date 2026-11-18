import { useState } from "preact/hooks";
import type { Entry } from "../model";
import { clock, dur } from "../time";
import { dayBlocks } from "../stats";

/*
 * Gráficos em SVG puro (sem biblioteca). Cores pelos papéis definidos em styles.css
 * (--sleep, --feed, --left, --right), validados para o fundo escuro, inclusive daltonismo.
 * Toque em uma barra/linha mostra o valor na linha de detalhe acima do gráfico.
 */

type BarProps = {
  values: number[];
  labels: string[]; // rótulo de cada barra (aparece no detalhe)
  ticks: (i: number) => string | null; // rótulo do eixo x (null = sem rótulo)
  format: (v: number) => string;
  formatAverage?: (v: number) => string;
  color: "sleep" | "feed";
  average?: number | null;
  averageLabel?: string;
  partialLast?: boolean; // última barra = hoje (dia em curso)
};

export function BarChart({ values, labels, ticks, format, formatAverage = format, color, average, averageLabel = "média", partialLast }: BarProps) {
  const [sel, setSel] = useState<number | null>(null);
  const W = 340, H = 140, top = 14, bottom = 20, left = 2, right = 2;
  const max = Math.max(1e-9, ...values, average ?? 0);
  const n = values.length;
  const slot = (W - left - right) / n;
  const bw = Math.max(2, Math.min(28, slot - 2)); // 2px de respiro entre barras
  const y = (v: number) => top + (H - top - bottom) * (1 - v / max);
  const base = H - bottom;
  const detail = sel !== null ? `${labels[sel]}: ${format(values[sel])}${partialLast && sel === n - 1 ? " (até agora)" : ""}` : null;

  return (
    <figure class="chart">
      <p class="chart-detail" aria-live="polite">{detail ?? (average != null ? `${averageLabel}: ${formatAverage(average)}` : " ")}</p>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={labels.map((l, i) => `${l}: ${format(values[i])}`).join("; ")}>
        <line x1={0} x2={W} y1={base} y2={base} class="axis" />
        {values.map((v, i) => {
          const x = left + i * slot + (slot - bw) / 2;
          const h = Math.max(0, base - y(v));
          const r = Math.min(4, bw / 2, h);
          // barra com topo arredondado (4px) e base reta, ancorada no eixo
          const d = h <= 0 ? "" : `M${x},${base}V${base - h + r}Q${x},${base - h} ${x + r},${base - h}H${x + bw - r}Q${x + bw},${base - h} ${x + bw},${base - h + r}V${base}Z`;
          return (
            <g key={i} onClick={() => setSel(sel === i ? null : i)} class="hit">
              <rect x={left + i * slot} y={0} width={slot} height={H} fill="transparent" />
              {d && <path d={d} class={`bar ${color} ${partialLast && i === n - 1 ? "partial" : ""} ${sel === i ? "sel" : ""}`} />}
              {ticks(i) && <text x={left + i * slot + slot / 2} y={H - 5} class="tick" text-anchor="middle">{ticks(i)}</text>}
            </g>
          );
        })}
        {average != null && average > 0 && (
          <line x1={0} x2={W} y1={y(average)} y2={y(average)} class="avg" />
        )}
      </svg>
    </figure>
  );
}

/** Linha do tempo 24 h: uma faixa por dia (mais recente em cima), sono e mamadas. */
export function Timeline({ entries, days, now, dayName, initialDay = null }: { entries: Entry[]; days: number[]; now: number; dayName: (d: number) => string; initialDay?: number | null }) {
  const [sel, setSel] = useState<number | null>(initialDay);
  const W = 340, labelW = 44, row = 18, gap = 6, top = 4;
  const plotW = W - labelW - 4;
  const ordered = [...days].reverse();
  const H = top + ordered.length * (row + gap) + 18;
  const x = (h: number) => labelW + (h / 24) * plotW;
  const selBlocks = sel !== null ? dayBlocks(entries, sel, now) : [];

  return (
    <figure class="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Linha do tempo de sono e mamadas por dia">
        {[0, 6, 12, 18, 24].map((h) => (
          <g key={h}>
            <line x1={x(h)} x2={x(h)} y1={top} y2={H - 16} class="grid" />
            <text x={x(h)} y={H - 4} class="tick" text-anchor="middle">{h === 24 ? "24h" : `${h}h`}</text>
          </g>
        ))}
        {ordered.map((d, i) => {
          const y0 = top + i * (row + gap);
          const blocks = dayBlocks(entries, d, now);
          return (
            <g key={d} class="hit" onClick={() => setSel(sel === d ? null : d)}>
              <rect x={0} y={y0 - gap / 2} width={W} height={row + gap} fill="transparent" />
              <rect x={labelW} y={y0} width={plotW} height={row} rx={3} class={`lane ${sel === d ? "sel" : ""}`} />
              <text x={0} y={y0 + row / 2 + 4} class="tick day">{dayName(d)}</text>
              {blocks.filter((b) => b.kind === "sleep").map((b, j) => (
                <rect key={`s${j}`} x={x(b.from)} y={y0 + 2} width={Math.max(1.5, x(b.to) - x(b.from))} height={row - 4} rx={2} class="blk sleep" />
              ))}
              {blocks.filter((b) => b.kind === "feed").map((b, j) => (
                <rect key={`f${j}`} x={x(b.from) - 1} y={y0 + 4} width={Math.max(3, x(b.to) - x(b.from)) + 2} height={row - 8} rx={2} class="blk feed" />
              ))}
              {blocks.filter((b) => b.kind === "bath").map((b, j) => (
                // banho: marcador fino da altura da faixa (formato diferente dos blocos de sono/mamada)
                <rect key={`b${j}`} x={x(b.from) - 2} y={y0 - 2} width={4} height={row + 4} rx={2} class="blk bath" />
              ))}
            </g>
          );
        })}
      </svg>
      <Legend items={[["sleep", "Sono"], ["feed", "Mamada"], ["bath", "Banho"]]} />
      {sel !== null && (
        <div class="day-detail">
          <b>{dayName(sel)}</b>
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
    </figure>
  );
}

/** Divisão entre os peitos: barra empilhada com rótulos diretos. */
export function SideSplit({ left, right }: { left: number; right: number }) {
  const total = left + right;
  if (!total) return <p class="muted">Sem mamadas no período.</p>;
  const pl = left / total;
  const W = 340, H = 22, gap = 2;
  const wl = Math.max(0, pl * W - gap / 2);
  return (
    <figure class="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Esquerdo ${Math.round(pl * 100)}%, Direito ${Math.round((1 - pl) * 100)}%`}>
        {wl > 0 && <rect x={0} y={0} width={wl} height={H} rx={4} class="blk left" />}
        {pl < 1 && <rect x={pl > 0 ? wl + gap : 0} y={0} width={W - (pl > 0 ? wl + gap : 0)} height={H} rx={4} class="blk right" />}
      </svg>
      <div class="split-labels">
        <span><i class="sw left" />Esquerdo <b>{Math.round(pl * 100)}%</b> <span class="muted">{dur(left)}</span></span>
        <span><i class="sw right" />Direito <b>{Math.round((1 - pl) * 100)}%</b> <span class="muted">{dur(right)}</span></span>
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
