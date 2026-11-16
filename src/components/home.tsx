import type { Store } from "../app";
import { useNow } from "../hooks";
import { SIDE_NAME, entryEnd, feedDur, other, sideDur, sidesLabel, uid, type Feed, type Side, type Sleep } from "../model";
import { MIN, addDays, ago, clock, dur, startOfDay, timer } from "../time";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function Home({ store }: { store: Store }) {
  const now = useNow();
  const feeds = store.entries.filter((e): e is Feed => e.kind === "feed");
  const sleeps = store.entries.filter((e): e is Sleep => e.kind === "sleep");
  const activeFeed = feeds.find((f) => f.end === null);
  const activeSleep = sleeps.find((s) => s.end === null);

  return (
    <>
      <header class="hello">
        <h1>Lucca</h1>
        <p class="muted">{capitalize(new Date(now).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }))}</p>
      </header>
      <FeedCard store={store} feeds={feeds} active={activeFeed} now={now} />
      <SleepCard store={store} sleeps={sleeps} active={activeSleep} now={now} />
      <Today feeds={feeds} sleeps={sleeps} now={now} />
    </>
  );
}

function FeedCard({ store, feeds, active, now }: { store: Store; feeds: Feed[]; active?: Feed; now: number }) {
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
          <button type="button" class="btn primary feed" onClick={() => {
            const t = Date.now();
            store.save({ ...active, end: t, segments: close(t) });
          }}>Finalizar</button>
        </div>
        <div class="minor">
          <button type="button" class="link" onClick={() => {
            const shift = 5 * MIN;
            store.save({ ...active, start: active.start - shift, segments: active.segments.map((g, i) => (i === 0 ? { ...g, start: g.start - shift } : g)) });
          }}>Começou antes? −5 min</button>
          <button type="button" class="link danger" onClick={() => { if (confirm("Descartar esta mamada?")) store.remove(active.id); }}>Descartar</button>
        </div>
      </section>
    );
  }

  const start = (side: Side) => {
    const t = Date.now();
    store.save({ id: uid(), kind: "feed", start: t, end: null, segments: [{ side, start: t, end: null }] });
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
  const last = [...sleeps].reverse().find((s) => s.end !== null);
  if (active) {
    return (
      <section class="card sleep live" aria-live="polite">
        <div class="card-head"><span class="dot sleep" />Dormindo desde {clock(active.start)}</div>
        <div class="big-timer">{timer(now - active.start)}</div>
        <div class="actions">
          <button type="button" class="btn primary sleep" onClick={() => store.save({ ...active, end: Date.now() })}>Acordou</button>
        </div>
        <div class="minor">
          <button type="button" class="link" onClick={() => store.save({ ...active, start: active.start - 5 * MIN })}>Dormiu antes? −5 min</button>
          <button type="button" class="link danger" onClick={() => { if (confirm("Descartar esta soneca?")) store.remove(active.id); }}>Descartar</button>
        </div>
      </section>
    );
  }
  return (
    <section class="card sleep">
      <div class="card-head"><span class="dot sleep" />Sono</div>
      {last ? (
        <p class="status">
          Acordado <b>{ago(now - last.end!)}</b>
          <span class="muted"> · última soneca {clock(last.start)}–{clock(last.end!)} ({dur(last.end! - last.start)})</span>
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

function Today({ feeds, sleeps, now }: { feeds: Feed[]; sleeps: Sleep[]; now: number }) {
  const d0 = startOfDay(now);
  const d1 = addDays(d0, 1);
  const todayFeeds = feeds.filter((f) => f.start >= d0);
  const sleepMs = sleeps.reduce((s, x) => s + Math.max(0, Math.min(entryEnd(x, now), d1) - Math.max(x.start, d0)), 0);
  return (
    <section class="today">
      <div><span class="muted">Mamadas hoje</span><b>{todayFeeds.length}</b><small class="muted">{dur(todayFeeds.reduce((s, f) => s + feedDur(f, now), 0))} no total</small></div>
      <div><span class="muted">Sono hoje</span><b>{dur(sleepMs)}</b><small class="muted">{sleeps.filter((s) => s.start >= d0).length} soneca(s)</small></div>
    </section>
  );
}
