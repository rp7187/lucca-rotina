import { useState } from "preact/hooks";
import { useNow } from "../hooks";
import type { Entry } from "../model";
import { computeStats } from "../stats";
import { HOUR, dur, shortDay } from "../time";
import { BarChart, SideSplit, Timeline } from "./charts";

/** 1 = só hoje (totais do dia até agora); demais = últimos N dias com médias por dia. */
const PERIODS = [1, 7, 14, 30] as const;
const weekday = (t: number) => new Date(t).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");

export function Stats({ entries }: { entries: Entry[] }) {
  const now = useNow(60_000);
  const [n, setN] = useState<(typeof PERIODS)[number]>(7);
  const [table, setTable] = useState(false);
  const today = n === 1;
  const one = (v: number) => (today ? String(Math.round(v)) : v.toFixed(1).replace(".", ","));
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
            <button key={p} type="button" class={n === p ? "on" : ""} aria-pressed={n === p} onClick={() => setN(p)}>{p === 1 ? "Hoje" : `${p} dias`}</button>
          ))}
        </div>
      </header>
      <p class="muted note">
        {today
          ? "Hoje, de 00:00 até agora."
          : `Médias por dia sobre ${s.basisDays} dia(s) completo(s)${s.basisDays && days[days.length - 1].partial ? " — hoje entra nos gráficos, não nas médias" : ""}.`}
      </p>

      <section class="kpis">
        <Kpi label={today ? "Mamadas" : "Mamadas por dia"} value={fmt(s.feedsPerDay, one)} />
        <Kpi label="Intervalo médio" value={fmt(s.avgIntervalMs, hoursFmt)} hint="início a início" />
        <Kpi label="Duração média" value={fmt(s.avgFeedMs, hoursFmt)} hint="por mamada" />
        <Kpi label={today ? "Sono" : "Sono por dia"} value={fmt(s.sleepPerDay, hoursFmt)} />
        <Kpi label={today ? "Sonecas" : "Sonecas por dia"} value={fmt(s.napsPerDay, one)} hint={s.avgNapMs ? `média ${dur(s.avgNapMs)}` : undefined} />
        <Kpi label="Janela acordado" value={fmt(s.avgWakeMs, hoursFmt)} hint="entre sonecas" />
        <Kpi label={today ? "Banhos" : "Banhos por dia"} value={fmt(s.bathsPerDay, one)} />
        <Kpi label="Maior sono" value={fmt(s.longestSleepMs, hoursFmt)} hint={today ? "hoje" : "no período"} />
      </section>

      <section class="card">
        <h2>Rotina do dia</h2>
        <p class="muted small">{today ? "Horários de hoje." : "Toque em um dia para ver os horários."}</p>
        <Timeline key={n} initialDay={today ? days[0].day : null} entries={entries} days={days.map((d) => d.day)} now={now} dayName={(d) => (today ? "hoje" : n <= 7 ? weekday(d) : shortDay(d))} />
      </section>

      {!today && <>
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
      </>}

      <section class="card">
        <h2>Mamadas por horário</h2>
        <p class="muted small">Quantas mamadas começaram em cada hora, {today ? "hoje" : "no período"}.</p>
        <BarChart values={byHour} labels={byHour.map((_, h) => `${h}h–${h + 1}h`)} ticks={(h) => (h % 6 === 0 ? `${h}h` : null)}
          format={(v) => `${v} mamada${v === 1 ? "" : "s"}`} color="feed" />
      </section>

      <section class="card">
        <h2>Peito</h2>
        <p class="muted small">Tempo total em cada lado {today ? "hoje" : "no período"}.</p>
        <SideSplit left={s.leftMs} right={s.rightMs} />
      </section>

      {!today && <button type="button" class="btn ghost wide" onClick={() => setTable(!table)}>{table ? "Ocultar tabela" : "Ver tabela por dia"}</button>}
      {table && !today && (
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
