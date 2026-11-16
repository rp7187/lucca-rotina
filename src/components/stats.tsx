import { useState } from "preact/hooks";
import { useNow } from "../hooks";
import type { Entry } from "../model";
import { computeStats } from "../stats";
import { HOUR, dur, shortDay } from "../time";
import { BarChart, SideSplit, Timeline } from "./charts";

const PERIODS = [7, 14, 30] as const;
const weekday = (t: number) => new Date(t).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");

export function Stats({ entries }: { entries: Entry[] }) {
  const now = useNow(60_000);
  const [n, setN] = useState<(typeof PERIODS)[number]>(7);
  const [table, setTable] = useState(false);
  const { days, summary: s, byHour } = computeStats(entries, now, n);
  const fmt = (v: number | null, f: (x: number) => string) => (v == null ? "—" : f(v));
  const hoursFmt = (v: number) => dur(v);
  const dayName = (d: number) => (n <= 7 ? weekday(d) : shortDay(d));
  const tickEvery = n <= 7 ? 1 : n <= 14 ? 2 : 5;
  const dayTicks = (i: number) => ((days.length - 1 - i) % tickEvery === 0 ? dayName(days[i].day) : null);
  const labels = days.map((d) => `${weekday(d.day)} ${shortDay(d.day)}`);

  if (!entries.length) {
    return (
      <>
        <header class="page-head"><h1>Estatísticas</h1></header>
        <p class="muted empty">As estatísticas aparecem depois dos primeiros registros.</p>
      </>
    );
  }

  return (
    <>
      <header class="page-head">
        <h1>Estatísticas</h1>
        <div class="seg" role="group" aria-label="Período">
          {PERIODS.map((p) => (
            <button key={p} type="button" class={n === p ? "on" : ""} aria-pressed={n === p} onClick={() => setN(p)}>{p} dias</button>
          ))}
        </div>
      </header>
      <p class="muted note">Médias por dia sobre {s.basisDays} dia(s) completo(s){s.basisDays && days[days.length - 1].partial ? " — hoje entra nos gráficos, não nas médias" : ""}.</p>

      <section class="kpis">
        <Kpi label="Mamadas por dia" value={fmt(s.feedsPerDay, (v) => v.toFixed(1).replace(".", ","))} />
        <Kpi label="Intervalo médio" value={fmt(s.avgIntervalMs, hoursFmt)} hint="início a início" />
        <Kpi label="Duração média" value={fmt(s.avgFeedMs, hoursFmt)} hint="por mamada" />
        <Kpi label="Sono por dia" value={fmt(s.sleepPerDay, hoursFmt)} />
        <Kpi label="Sonecas por dia" value={fmt(s.napsPerDay, (v) => v.toFixed(1).replace(".", ","))} hint={s.avgNapMs ? `média ${dur(s.avgNapMs)}` : undefined} />
        <Kpi label="Janela acordado" value={fmt(s.avgWakeMs, hoursFmt)} hint="entre sonecas" />
        <Kpi label="Maior sono" value={fmt(s.longestSleepMs, hoursFmt)} hint="no período" />
      </section>

      <section class="card">
        <h2>Rotina do dia</h2>
        <p class="muted small">Toque em um dia para ver os horários.</p>
        <Timeline entries={entries} days={days.map((d) => d.day)} now={now} dayName={(d) => (n <= 7 ? weekday(d) : shortDay(d))} />
      </section>

      <section class="card">
        <h2>Sono por dia</h2>
        <BarChart values={days.map((d) => d.sleepMs / HOUR)} labels={labels} ticks={dayTicks} format={(v) => dur(v * HOUR)}
          color="sleep" average={s.sleepPerDay != null ? s.sleepPerDay / HOUR : null} partialLast />
      </section>

      <section class="card">
        <h2>Mamadas por dia</h2>
        <BarChart values={days.map((d) => d.feeds)} labels={labels} ticks={dayTicks} format={(v) => `${v} mamada${v === 1 ? "" : "s"}`}
          formatAverage={(v) => `${v.toFixed(1).replace(".", ",")} mamadas`} color="feed" average={s.feedsPerDay} partialLast />
      </section>

      <section class="card">
        <h2>Mamadas por horário</h2>
        <p class="muted small">Quantas mamadas começaram em cada hora, no período.</p>
        <BarChart values={byHour} labels={byHour.map((_, h) => `${h}h–${h + 1}h`)} ticks={(h) => (h % 6 === 0 ? `${h}h` : null)}
          format={(v) => `${v} mamada${v === 1 ? "" : "s"}`} color="feed" />
      </section>

      <section class="card">
        <h2>Peito</h2>
        <p class="muted small">Tempo total em cada lado no período.</p>
        <SideSplit left={s.leftMs} right={s.rightMs} />
      </section>

      <button type="button" class="btn ghost wide" onClick={() => setTable(!table)}>{table ? "Ocultar tabela" : "Ver tabela por dia"}</button>
      {table && (
        <div class="table-wrap">
          <table>
            <thead><tr><th>Dia</th><th>Mamadas</th><th>Mamando</th><th>Intervalo</th><th>Sono</th><th>Sonecas</th></tr></thead>
            <tbody>
              {[...days].reverse().map((d) => {
                const iv = d.intervals.length ? d.intervals.reduce((a, b) => a + b, 0) / d.intervals.length : null;
                return (
                  <tr key={d.day}>
                    <td>{shortDay(d.day)}{d.partial ? "*" : ""}</td><td>{d.feeds}</td><td>{dur(d.feedMs)}</td>
                    <td>{iv == null ? "—" : dur(iv)}</td><td>{dur(d.sleepMs)}</td><td>{d.naps}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p class="muted small">* hoje, até agora.</p>
        </div>
      )}
    </>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div class="kpi">
      <span class="muted">{label}</span>
      <b>{value}</b>
      {hint && <small class="muted">{hint}</small>}
    </div>
  );
}
