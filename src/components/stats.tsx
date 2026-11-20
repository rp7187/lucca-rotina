import { useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { useNow } from "../hooks";
import type { Entry } from "../model";
import { computeStats, mean } from "../stats";
import { HOUR, MIN, clock, dayLabel, dur, pad, shortDay, startOfDay } from "../time";
import { BarChart, HourBands, SideSplit, Timeline, bandText } from "./charts";

/** 1 = só hoje (até agora); demais = médias dos últimos N dias completos. */
const PERIODS = [1, 7, 14, 30] as const;
type Period = (typeof PERIODS)[number];

const weekday = (t: number) => new Date(t).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
const dec = (v: number) => v.toFixed(1).replace(".", ",");

/** "▲ +0,6" / "▼ −12 min" / "igual"; vazio quando não há base de comparação. */
function deltaCount(a: number | null | undefined, b: number | null | undefined) {
  if (a == null || b == null) return null;
  const d = a - b;
  if (Math.abs(d) < 0.05) return <>igual</>;
  return <>{d > 0 ? "▲" : "▼"} <b>{d > 0 ? "+" : "−"}{dec(Math.abs(d))}</b></>;
}
function deltaDur(a: number | null | undefined, b: number | null | undefined) {
  if (a == null || b == null) return null;
  const d = Math.round((a - b) / MIN);
  if (d === 0) return <>igual</>;
  return <>{d > 0 ? "▲" : "▼"} <b>{d > 0 ? "+" : "−"}{dur(Math.abs(d) * MIN)}</b></>;
}

export function Stats({ entries }: { entries: Entry[] }) {
  const now = useNow(60_000);
  const [n, setN] = useState<Period>(7);
  const [info, setInfo] = useState<string | null>(null);
  const [table, setTable] = useState(false);

  if (!entries.length) {
    return (
      <>
        <header class="page-head"><h1>Estatísticas</h1></header>
        <p class="muted empty">As estatísticas aparecem depois dos primeiros registros.</p>
      </>
    );
  }

  const today = n === 1;
  const todayStart = startOfDay(now);
  const { days, cur: c, prev: p, basisFirst, basisLast, lastBath } = computeStats(entries, now, n);
  const num = (v: number | null) => (v == null ? "—" : today ? String(Math.round(v)) : dec(v));
  const time = (v: number | null) => (v == null ? "—" : dur(v));
  const tip = (id: string) => ({ id, open: info === id, toggle: () => setInfo(info === id ? null : id) });

  // Eixo e nomes dos dias nos gráficos
  const tickEvery = n <= 7 ? 1 : n <= 14 ? 2 : 5;
  const dayTick = (i: number) => {
    const d = days[i].day;
    if (d === todayStart) return "hoje";
    if ((days.length - 1 - i) % tickEvery) return null;
    return n <= 7 ? weekday(d) : String(new Date(d).getDate());
  };
  const dayTitle = (d: number) => (d === todayStart ? "Hoje" : `${weekday(d)}, ${shortDay(d)}`);
  const labels = days.map((d) => dayTitle(d.day));
  const showValues = n <= 7;

  // Texto do período
  const periodText = today
    ? `Hoje, de 00:00 até agora (${clock(now)}). As setas comparam com ontem até o mesmo horário.`
    : !c.days
      ? "Ainda não há um dia completo de registros. Veja \"Hoje\" ou volte amanhã."
      : `Médias ${c.days === n ? `dos ${n} dias completos` : `dos ${c.days} dias completos com registro`} de ${shortDay(basisFirst!)} a ${shortDay(basisLast)}. ` +
        "Hoje aparece nos gráficos, mas não entra nas médias porque ainda não acabou." +
        (p ? ` As setas comparam com os ${n} dias anteriores.` : "");

  // Mamadas
  const feedHead = today ? (
    c.feedsPerDay ? <>Até agora mamou <b>{c.feedsPerDay} {c.feedsPerDay === 1 ? "vez" : "vezes"}</b>{c.interval != null && <>, uma a cada <b>{dur(c.interval)}</b></>}{c.feedDur != null && <>, por cerca de <b>{dur(c.feedDur)}</b> cada</>}.</> : <>Nenhuma mamada hoje ainda.</>
  ) : c.feedsPerDay ? (
    <>Mamou em média <b>{dec(c.feedsPerDay)} vezes por dia</b>{c.interval != null && <>, uma a cada <b>{dur(c.interval)}</b></>}{c.feedDur != null && <>, por cerca de <b>{dur(c.feedDur)}</b> cada</>}.</>
  ) : null;
  const topBand = c.bands.indexOf(Math.max(...c.bands));
  const tot = c.leftMs + c.rightMs;
  const pl = tot ? c.leftMs / tot : 0.5;
  const balance = !tot ? "" : Math.abs(pl - 0.5) <= 0.05 ? "Bem equilibrado entre os dois lados." : `Mais tempo no ${pl > 0.5 ? "Esquerdo" : "Direito"}.`;

  // Sono
  const sleepHead = today ? (
    <>Até agora dormiu <b>{dur(c.sleepPerDay ?? 0)}</b>{!!c.sleepsPerDay && <> em <b>{c.sleepsPerDay} {c.sleepsPerDay === 1 ? "sono" : "sonos"}</b></>}{c.wake != null && <>, ficando acordado cerca de <b>{dur(c.wake)}</b> entre um e outro</>}.</>
  ) : c.sleepsPerDay ? (
    <>Dormiu em média <b>{dur(c.sleepPerDay!)} por dia</b>, em <b>{dec(c.sleepsPerDay)} sonos</b>{c.sleepDur != null && <> de cerca de <b>{dur(c.sleepDur)}</b></>}{c.wake != null && <>, e ficou acordado cerca de <b>{dur(c.wake)}</b> entre um e outro</>}.</>
  ) : null;
  const lg = c.longest;
  const lgWhen = lg && `${lg.start >= todayStart ? "hoje" : `${weekday(lg.start)} ${new Date(lg.start).getDate()}`}, ${clock(lg.start)}–${lg.ongoing ? "agora" : clock(lg.end)}`;

  // Banho: faixa em que cai a metade do meio dos horários
  const bathMins = c.bathTimes.map((t) => { const d = new Date(t); return d.getHours() * 60 + d.getMinutes(); }).sort((a, b) => a - b);
  const q = (f: number) => bathMins[Math.min(bathMins.length - 1, Math.floor(f * bathMins.length))];
  const hm = (m: number) => { const r = Math.round(m / 5) * 5; return `${pad(Math.floor(r / 60) % 24)}:${pad(r % 60)}`; };
  const bathUsual = !bathMins.length ? "—" : bathMins.length === 1 ? hm(bathMins[0]) : `${hm(q(0.25))}–${hm(q(0.75))}`;

  return (
    <>
      <header class="page-head stats-head">
        <h1>Estatísticas</h1>
        <div class="seg full" role="group" aria-label="Período">
          {PERIODS.map((v) => (
            <button key={v} type="button" class={n === v ? "on" : ""} aria-pressed={n === v} onClick={() => { setN(v); setInfo(null); }}>{v === 1 ? "Hoje" : `${v} dias`}</button>
          ))}
        </div>
        <p class="period">{periodText}</p>
      </header>

      {/* ---------- Mamadas ---------- */}
      <section class="block" aria-labelledby="h-feed">
        <div class="block-head"><span class="dot feed" /><h2 id="h-feed">Mamadas</h2></div>
        {feedHead && <p class="headline">{feedHead}</p>}
        <div class="tiles three">
          <Tile {...tip("feed.count")} label={today ? "Mamadas hoje" : "Mamadas por dia"} value={num(c.feedsPerDay)} delta={deltaCount(c.feedsPerDay, p?.feedsPerDay)} />
          <Tile {...tip("feed.interval")} label="Mama a cada" value={time(c.interval)} delta={deltaDur(c.interval, p?.interval)} />
          <Tile {...tip("feed.dur")} label="Cada mamada dura" value={time(c.feedDur)} delta={deltaDur(c.feedDur, p?.feedDur)} />
        </div>
        <Explain info={info} texts={{
          "feed.count": [today ? "Mamadas hoje" : "Mamadas por dia", today ? "Quantas mamadas começaram hoje, de 00:00 até agora." : "Total de mamadas do período dividido pelo número de dias."],
          "feed.interval": ["Mama a cada", "Tempo do início de uma mamada até o início da seguinte. Exemplo: começou às 10:00 e a próxima às 12:50, então mamou a cada 2h50. Pausas de mais de 12h (registro esquecido) ficam de fora."],
          "feed.dur": ["Cada mamada dura", "Tempo mamando em uma mamada, somando os dois peitos, do início até finalizar."],
        }} />

        {!today && <>
          <section class="card">
            <h3>Mamadas por dia</h3>
            <BarChart key={n} values={days.map((d) => d.feeds)} labels={labels} ticks={dayTick} unit="n" color="feed" partialLast showValues={showValues}
              short={(v) => String(v)} format={(v) => `${v} mamada${v === 1 ? "" : "s"}`} average={c.feedsPerDay} formatAverage={(v) => `${dec(v)} por dia`} />
          </section>
          <section class="card">
            <h3>Mama a cada…</h3>
            <p class="sub">Tempo médio entre o início de uma mamada e o da seguinte, em cada dia. Barra mais alta = mamadas mais espaçadas.</p>
            <BarChart key={n} values={days.map((d) => { const m = mean(d.intervals); return m == null ? null : m / HOUR; })} labels={labels} ticks={dayTick} unit="h" color="feed" partialLast showValues={showValues}
              short={(v) => dur(v * HOUR)} format={(v) => `a cada ${dur(v * HOUR)}`} average={c.interval != null ? c.interval / HOUR : null} formatAverage={(v) => `a cada ${dur(v * HOUR)}`} />
          </section>
        </>}

        <section class="card">
          <h3>Horário das mamadas</h3>
          <p class="sub">
            {today ? "Quantas mamadas começaram em cada faixa de 3 horas hoje." : "Em média, quantas mamadas começam em cada faixa de 3 horas por dia."}
            {c.bands[topBand] > 0 && <> Mais mamadas <b>{bandText(topBand)}</b>.</>}
          </p>
          <HourBands values={c.bands} format={(v) => (today ? String(v) : dec(v))} />
        </section>

        <section class="card">
          <h3>Peito</h3>
          <p class="sub">Tempo total mamando em cada lado {today ? "hoje" : "no período"}. {balance}</p>
          <SideSplit left={c.leftMs} right={c.rightMs} />
        </section>
      </section>

      {/* ---------- Sono ---------- */}
      <section class="block" aria-labelledby="h-sleep">
        <div class="block-head"><span class="dot sleep" /><h2 id="h-sleep">Sono</h2></div>
        {sleepHead && <p class="headline">{sleepHead}</p>}
        <div class="tiles">
          <Tile {...tip("sleep.total")} label={today ? "Dormiu hoje" : "Dorme por dia"} value={time(c.sleepPerDay)} delta={deltaDur(c.sleepPerDay, p?.sleepPerDay)} />
          <Tile {...tip("sleep.count")} label={today ? "Sonos hoje" : "Sonos por dia"} value={num(c.sleepsPerDay)}
            sub={c.sleepDur != null ? `cerca de ${dur(c.sleepDur)} cada` : undefined} delta={deltaCount(c.sleepsPerDay, p?.sleepsPerDay)} />
          <Tile {...tip("sleep.wake")} label="Acordado entre sonos" value={time(c.wake)} delta={deltaDur(c.wake, p?.wake)} />
          <Tile {...tip("sleep.longest")} label="Maior sono seguido" value={lg ? dur(lg.ms) : "—"} sub={lgWhen ?? undefined} delta={deltaDur(lg?.ms, p?.longest?.ms)} />
        </div>
        <Explain info={info} texts={{
          "sleep.total": [today ? "Dormiu hoje" : "Dorme por dia", "Soma de todo o sono do dia, de 00:00 a 24:00, contando dia e noite. Um sono que passa da meia-noite é dividido entre os dois dias."],
          "sleep.count": [today ? "Sonos hoje" : "Sonos por dia", "Quantas vezes dormiu, de dia e de noite. Embaixo, quanto dura um sono em média."],
          "sleep.wake": ["Acordado entre sonos", "Do fim de um sono até o começo do próximo: quanto tempo costuma ficar acordado. Pausas de mais de 12h ficam de fora."],
          "sleep.longest": ["Maior sono seguido", `O sono mais longo sem acordar ${today ? "hoje" : "no período"}, com o dia e o horário.`],
        }} />

        {!today && (
          <section class="card">
            <h3>Sono por dia</h3>
            <p class="sub">Total dormido em cada dia, de 00:00 a 24:00.</p>
            <BarChart key={n} values={days.map((d) => d.sleepMs / HOUR)} labels={labels} ticks={dayTick} unit="h" color="sleep" partialLast showValues={showValues}
              short={(v) => dur(v * HOUR)} format={(v) => `${dur(v * HOUR)} de sono`} average={c.sleepPerDay != null ? c.sleepPerDay / HOUR : null} formatAverage={(v) => `${dur(v * HOUR)} por dia`} />
          </section>
        )}

        <section class="card">
          <h3>Rotina do dia</h3>
          <p class="sub">Cada faixa é um dia, de 0h a 24h. Toque em um dia para ver os horários.</p>
          <Timeline key={n} initialDay={today ? todayStart : null} entries={entries} days={days.map((d) => d.day)} now={now} dayTitle={dayTitle}
            dayName={(d) => (d === todayStart ? "hoje" : n <= 7 ? weekday(d) : `${weekday(d)} ${new Date(d).getDate()}`)} />
        </section>
      </section>

      {/* ---------- Banho ---------- */}
      <section class="block" aria-labelledby="h-bath">
        <div class="block-head"><span class="dot bath" /><h2 id="h-bath">Banho</h2></div>
        <div class="tiles">
          <Tile {...tip("bath.count")} label={today ? "Banhos hoje" : "Banhos por dia"} value={num(c.bathsPerDay)}
            sub={!today && lastBath ? `último: ${dayLabel(lastBath.start, now).toLowerCase()}, ${clock(lastBath.start)}` : undefined} delta={deltaCount(c.bathsPerDay, p?.bathsPerDay)} />
          {today
            ? <Tile {...tip("bath.last")} label="Último banho" value={lastBath ? clock(lastBath.start) : "—"} sub={lastBath ? dayLabel(lastBath.start, now).toLowerCase() : undefined} />
            : <Tile {...tip("bath.when")} label="Horário de costume" value={bathUsual} sub={bathMins.length > 1 ? "na maioria dos dias" : undefined} />}
        </div>
        <Explain info={info} texts={{
          "bath.count": [today ? "Banhos hoje" : "Banhos por dia", today ? "Quantos banhos foram registrados hoje." : "Total de banhos do período dividido pelo número de dias."],
          "bath.last": ["Último banho", "Horário do banho registrado mais recentemente."],
          "bath.when": ["Horário de costume", "Faixa de horário em que acontece a maioria dos banhos do período (a metade do meio, sem os horários mais fora do comum)."],
        }} />
      </section>

      {!today && <button type="button" class="btn ghost wide" onClick={() => setTable(!table)}>{table ? "Ocultar tabela" : "Ver tabela dia a dia"}</button>}
      {table && !today && (
        <div class="table-wrap">
          <table>
            <thead><tr><th>Dia</th><th>Mamadas</th><th>Mama a cada</th><th>Tempo mamando</th><th>Sono total</th><th>Sonos</th><th>Banho</th></tr></thead>
            <tbody>
              {[...days].reverse().map((d) => {
                const iv = mean(d.intervals);
                return (
                  <tr key={d.day}>
                    <td>{d.day === todayStart ? "Hoje*" : `${weekday(d.day)} ${shortDay(d.day)}`}</td><td>{d.feeds}</td><td>{iv == null ? "—" : dur(iv)}</td>
                    <td>{dur(d.feedMs)}</td><td>{dur(d.sleepMs)}</td><td>{d.sleeps}</td><td>{d.baths.length ? d.baths.map(clock).join(", ") : "—"}</td>
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

function Tile({ id, open, toggle, label, value, sub, delta }: {
  id: string; open: boolean; toggle: () => void; label: string; value: string; sub?: string; delta?: ComponentChildren;
}) {
  return (
    <div class={`tile ${open ? "on" : ""}`}>
      <div class="tile-top">
        <span class="tl">{label}</span>
        <button type="button" class={`info ${open ? "on" : ""}`} onClick={toggle} aria-expanded={open} aria-controls={`explain-${id}`} aria-label={`Como é calculado: ${label}`}>i</button>
      </div>
      <b class="tv">{value}</b>
      {sub && <span class="ts">{sub}</span>}
      {delta != null && <span class="delta">{delta}</span>}
    </div>
  );
}

function Explain({ info, texts }: { info: string | null; texts: Record<string, [string, string]> }) {
  const t = info ? texts[info] : undefined;
  if (!t) return null;
  return <div class="explain" id={`explain-${info}`} role="note"><strong>{t[0]}</strong>{t[1]}</div>;
}
