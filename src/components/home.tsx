import { useMemo, useState } from "preact/hooks";
import type { Store } from "../app";
import { AdjustStart } from "./adjust-start";
import { useNow } from "../hooks";
import { SIDE_NAME, entryEnd, feedDur, other, sideDur, sidesLabel, uid, type Bath, type Entry, type Feed, type Side, type Sleep } from "../model";
import { dayBlocks, predictNextFeed } from "../stats";
import { MIN, addDays, ago, clock, dayLabel, dur, startOfDay, timer } from "../time";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Arredonda para 5 min: a previsão é aproximada ("por volta de 15:50"). */
const round5 = (t: number) => Math.round(t / (5 * MIN)) * 5 * MIN;

export function Home({ store }: { store: Store }) {
  const now = useNow();
  const feeds = store.entries.filter((e): e is Feed => e.kind === "feed");
  const sleeps = store.entries.filter((e): e is Sleep => e.kind === "sleep");
  const activeFeed = feeds.find((f) => f.end === null);
  const activeSleep = sleeps.find((s) => s.end === null);
  const baths = store.entries.filter((e): e is Bath => e.kind === "bath");

  return (
    <>
      <header class="hello">
        <h1>Lucca</h1>
        <p class="muted">{capitalize(new Date(now).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }))}</p>
      </header>
      <TodayStrip entries={store.entries} feeds={feeds} sleeps={sleeps} baths={baths} now={now} />
      <FeedCard store={store} feeds={feeds} active={activeFeed} sleeping={activeSleep} sleeps={sleeps} now={now} />
      <SleepCard store={store} sleeps={sleeps} active={activeSleep} now={now} />
      <BathCard store={store} baths={baths} now={now} />
    </>
  );
}

function FeedCard({ store, feeds, active, sleeping, sleeps, now }: { store: Store; feeds: Feed[]; active?: Feed; sleeping?: Sleep; sleeps: Sleep[]; now: number }) {
  const [adjusting, setAdjusting] = useState(false);
  const next = useMemo(() => predictNextFeed(store.entries, Date.now()), [store.entries]);
  const last = [...feeds].reverse().find((f) => f.end !== null);
  const suggested: Side = last ? other(last.segments[0]?.side ?? "D") : "E";

  if (active) {
    const seg = active.segments[active.segments.length - 1];
    const close = (t: number) => active.segments.map((g) => (g.end === null ? { ...g, end: t } : g));
    return (
      <section class="card feed live" aria-live="polite">
        <div class="card-head"><span class="dot feed" />Mamando · {SIDE_NAME[seg.side]}</div>
        <div class="big-timer">{timer(feedDur(active, now))}</div>
        <div class="sides">
          {(["E", "D"] as const).map((s) => (
            <div key={s} class={`side ${s === seg.side ? "on" : ""}`}>
              <span>{SIDE_NAME[s]}</span><b>{timer(sideDur(active, s, now))}</b>
            </div>
          ))}
        </div>
        <div class="actions">
          <button type="button" class={`btn side-${other(seg.side)}`} onClick={() => {
            const t = Date.now();
            store.save({ ...active, segments: [...close(t), { side: other(seg.side), start: t, end: null }] });
          }}>Trocar para {SIDE_NAME[other(seg.side)]}</button>
          <button type="button" class="btn primary feed" onClick={async () => {
            const t = Date.now();
            await store.save({ ...active, end: t, segments: close(t) });
            // Depois de mamar o bebê costuma dormir: oferece já iniciar a soneca (a partir do fim da mamada).
            if (!sleeping && confirm("Mamada finalizada. Iniciar uma soneca agora?")) {
              await store.save({ id: uid(), kind: "sleep", start: t, end: null });
            }
          }}>Finalizar</button>
        </div>
        {adjusting ? (
          <AdjustStart title="Começou às" start={active.start} latest={active.segments[0].end ?? Date.now()}
            onCancel={() => setAdjusting(false)}
            onSave={(t) => {
              store.save({ ...active, start: t, segments: active.segments.map((g, i) => (i === 0 ? { ...g, start: t } : g)) });
              // Soneca encerrada por esta mamada (fim = início antigo): passa a terminar no novo início.
              const cut = sleeps.find((x) => x.end !== null && Math.abs(x.end - active.start) < 60_000 && x.start < t);
              if (cut && t < active.start) store.save({ ...cut, end: t });
              setAdjusting(false);
            }} />
        ) : (
          <div class="minor">
            <button type="button" class="link" onClick={() => setAdjusting(true)}>Começou antes? Ajustar início</button>
            <button type="button" class="link danger" onClick={() => { if (confirm("Descartar esta mamada?")) store.remove(active.id); }}>Descartar</button>
          </div>
        )}
      </section>
    );
  }

  const start = async (side: Side) => {
    // Mamar acorda o bebê: a soneca em andamento é encerrada (com confirmação).
    if (sleeping) {
      if (!confirm(`O Lucca está dormindo desde ${clock(sleeping.start)}. Iniciar a mamada encerra a soneca agora. Continuar?`)) return;
      await store.save({ ...sleeping, end: Date.now() });
    }
    const t = Date.now();
    await store.save({ id: uid(), kind: "feed", start: t, end: null, segments: [{ side, start: t, end: null }] });
  };
  return (
    <section class="card feed">
      <div class="card-head"><span class="dot feed" />Mamada</div>
      {last ? (
        <p class="status">
          Última <b>{ago(now - last.start)}</b>
          <span class="muted"> · {clock(last.start)} · {dur(feedDur(last, now))} · {sidesLabel(last)}</span>
        </p>
      ) : <p class="status muted">Nenhuma mamada registrada ainda.</p>}
      {next && (
        <p class="predict">
          {now < round5(next.at)
            ? <>Próxima por volta de <b>{clock(round5(next.at))}</b> <span class="muted">· em {dur(round5(next.at) - now)}</span></>
            : <>Próxima prevista para <b>{clock(round5(next.at))}</b></>}
          <small>{next.sameTime ? "Neste horário, costuma" : "Costuma"} mamar a cada {dur(next.typical)}.</small>
        </p>
      )}
      <div class="actions">
        {(["E", "D"] as const).map((s) => (
          <button key={s} type="button" class={`btn big side-${s} ${s === suggested ? "suggested" : "ghost"}`} onClick={() => start(s)}>
            {SIDE_NAME[s]}
            {s === suggested && last && <small>sugerido</small>}
          </button>
        ))}
      </div>
    </section>
  );
}

function SleepCard({ store, sleeps, active, now }: { store: Store; sleeps: Sleep[]; active?: Sleep; now: number }) {
  const [adjusting, setAdjusting] = useState(false);
  const last = [...sleeps].reverse().find((s) => s.end !== null);
  if (active) {
    return (
      <section class="card sleep live" aria-live="polite">
        <div class="card-head"><span class="dot sleep" />Dormindo desde {clock(active.start)}</div>
        <div class="big-timer">{timer(now - active.start)}</div>
        <div class="actions">
          <button type="button" class="btn primary sleep" onClick={() => store.save({ ...active, end: Date.now() })}>Acordou</button>
        </div>
        {adjusting ? (
          <AdjustStart title="Dormiu às" start={active.start} latest={Date.now()}
            onCancel={() => setAdjusting(false)}
            onSave={(t) => { store.save({ ...active, start: t }); setAdjusting(false); }} />
        ) : (
          <div class="minor">
            <button type="button" class="link" onClick={() => setAdjusting(true)}>Dormiu antes? Ajustar início</button>
            <button type="button" class="link danger" onClick={() => { if (confirm("Descartar esta soneca?")) store.remove(active.id); }}>Descartar</button>
          </div>
        )}
      </section>
    );
  }
  return (
    <section class="card sleep">
      <div class="card-head"><span class="dot sleep" />Sono</div>
      {last ? (
        <p class="status">
          Acordado <b>{ago(now - last.end!)}</b>
          <span class="muted"> · último sono {clock(last.start)}–{clock(last.end!)} ({dur(last.end! - last.start)})</span>
        </p>
      ) : <p class="status muted">Nenhuma soneca registrada ainda.</p>}
      <div class="actions">
        <button type="button" class="btn big primary sleep" onClick={() => store.save({ id: uid(), kind: "sleep", start: Date.now(), end: null })}>
          Iniciar soneca
        </button>
      </div>
    </section>
  );
}

function BathCard({ store, baths, now }: { store: Store; baths: Bath[]; now: number }) {
  const last = baths[baths.length - 1];
  // Banho é raro: cartão compacto, numa linha só.
  return (
    <section class="card bath compact">
      <div class="bath-info">
        <div class="card-head"><span class="dot bath" />Banho</div>
        <span class="bath-last">
          {last ? <>Último <b>{dayLabel(last.start, now).toLowerCase()}, {clock(last.start)}</b></> : <span class="muted">Nenhum registrado</span>}
        </span>
      </div>
      <div class="bath-actions">
        <button type="button" class="btn small primary bath" onClick={() => {
          const t = Date.now();
          if (confirm(`Registrar banho agora (${clock(t)})?`)) store.save({ id: uid(), kind: "bath", start: t, end: t });
        }}>Agora</button>
        <button type="button" class="btn small ghost" onClick={() => store.edit({ kind: "bath" })}>Outro horário</button>
      </div>
    </section>
  );
}

/** Resumo de hoje no topo: totais e uma faixa 0h–24h com sono, mamadas e banhos. */
function TodayStrip({ entries, feeds, sleeps, baths, now }: { entries: Entry[]; feeds: Feed[]; sleeps: Sleep[]; baths: Bath[]; now: number }) {
  const d0 = startOfDay(now);
  const d1 = addDays(d0, 1);
  const todayFeeds = feeds.filter((f) => f.start >= d0);
  const sleepMs = sleeps.reduce((s, x) => s + Math.max(0, Math.min(entryEnd(x, now), d1) - Math.max(x.start, d0)), 0);
  const todayBaths = baths.filter((b) => b.start >= d0);
  const blocks = dayBlocks(entries, d0, now);
  const W = 360, LANE = 22, H = 40;
  const x = (h: number) => (h / 24) * W;
  const nowH = (now - d0) / 3_600_000;
  return (
    <section class="card strip" aria-label="Resumo de hoje">
      <p class="strip-sum">
        <span><b>{todayFeeds.length}</b> {todayFeeds.length === 1 ? "mamada" : "mamadas"} <span class="muted">({dur(todayFeeds.reduce((s, f) => s + feedDur(f, now), 0))})</span></span>
        <span><b>{dur(sleepMs)}</b> de sono</span>
        <span>{todayBaths.length ? <>banho <b>{clock(todayBaths[todayBaths.length - 1].start)}</b></> : <span class="muted">sem banho</span>}</span>
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Linha do tempo de hoje">
        <rect x={0} y={0} width={W} height={LANE} rx={5} class="lane" />
        <rect x={0} y={0} width={x(7)} height={LANE} rx={5} class="lane-night" />
        <rect x={x(19)} y={0} width={x(24) - x(19)} height={LANE} rx={5} class="lane-night" />
        <rect x={x(nowH)} y={0} width={Math.max(0, W - x(nowH))} height={LANE} class="lane-future" />
        {blocks.filter((b) => b.kind === "sleep").map((b, j) => (
          <rect key={`s${j}`} x={x(b.from)} y={2} width={Math.max(2, x(b.to) - x(b.from))} height={LANE - 4} rx={3} class="blk sleep" />
        ))}
        {blocks.filter((b) => b.kind === "feed").map((b, j) => (
          <rect key={`f${j}`} x={x(b.from) - 1} y={6} width={Math.max(4, x(b.to) - x(b.from)) + 2} height={LANE - 12} rx={2} class="blk feed" />
        ))}
        {blocks.filter((b) => b.kind === "bath").map((b, j) => (
          <rect key={`b${j}`} x={x(b.from) - 2.5} y={-3} width={5} height={LANE + 6} rx={2.5} class="blk bath" />
        ))}
        <line x1={x(nowH)} x2={x(nowH)} y1={-4} y2={LANE + 4} class="now-mark" />
        {[0, 6, 12, 18, 24].map((h) => (
          <text key={h} x={x(h)} y={H - 2} class="xtick" text-anchor={h === 0 ? "start" : h === 24 ? "end" : "middle"}>{h}h</text>
        ))}
      </svg>
    </section>
  );
}
