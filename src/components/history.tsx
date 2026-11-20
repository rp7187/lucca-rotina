import { useState } from "preact/hooks";
import type { Store } from "../app";
import { useNow } from "../hooks";
import { entryEnd, feedDur, sideDur, sidesLabel, type Entry, type Feed } from "../model";
import { HOUR, addDays, clock, dayLabel, dur, startOfDay } from "../time";

type Filter = "all" | Entry["kind"];
const FILTERS: [Filter, string][] = [["all", "Tudo"], ["feed", "Mamadas"], ["sleep", "Sono"], ["bath", "Banho"]];

export function History({ store }: { store: Store }) {
  const now = useNow(30_000);
  const [daysShown, setDaysShown] = useState(7);
  const [filter, setFilter] = useState<Filter>("all");
  const [adding, setAdding] = useState(false);

  // Tempo desde a mamada anterior (início → início), para mostrar "+2h40" em cada mamada.
  const feeds = store.entries.filter((e): e is Feed => e.kind === "feed");
  const sincePrev = new Map<string, number>();
  feeds.forEach((f, i) => { if (i > 0 && f.start - feeds[i - 1].start <= 12 * HOUR) sincePrev.set(f.id, f.start - feeds[i - 1].start); });

  const groups = new Map<number, Entry[]>();
  for (const e of [...store.entries].reverse()) {
    const d = startOfDay(e.start);
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d)!.push(e);
  }
  const days = [...groups.entries()];
  const add = (kind: Entry["kind"]) => { setAdding(false); store.edit({ kind }); };

  return (
    <>
      <header class="page-head">
        <h1>Histórico</h1>
        <button type="button" class="btn small ghost" aria-expanded={adding} onClick={() => setAdding(!adding)}>{adding ? "Fechar" : "+ Registrar"}</button>
      </header>
      {adding && (
        <div class="add-row">
          <span class="muted">Lançar um registro antigo:</span>
          <div class="actions">
            <button type="button" class="btn small ghost" onClick={() => add("feed")}><span class="dot feed" /> Mamada</button>
            <button type="button" class="btn small ghost" onClick={() => add("sleep")}><span class="dot sleep" /> Sono</button>
            <button type="button" class="btn small ghost" onClick={() => add("bath")}><span class="dot bath" /> Banho</button>
          </div>
        </div>
      )}
      {days.length > 0 && (
        <div class="chips" role="group" aria-label="Mostrar">
          {FILTERS.map(([f, label]) => (
            <button key={f} type="button" class={`chip ${filter === f ? "on" : ""}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>{label}</button>
          ))}
        </div>
      )}
      {!days.length && <p class="muted empty">Nada registrado ainda. Use a aba Agora ou o botão "+ Registrar" para lançar registros antigos.</p>}
      {days.slice(0, daysShown).map(([day, list]) => {
        const shown = filter === "all" ? list : list.filter((e) => e.kind === filter);
        return (
          <section key={day} class="day">
            <div class="day-head">
              <h2>{dayLabel(day, now)}</h2>
              <DaySummary entries={store.entries} list={list} day={day} now={now} />
            </div>
            {shown.length === 0 ? <p class="muted small day-empty">Nenhum registro deste tipo.</p> : (
              <ul class="list">
                {shown.map((e) => (
                  <li key={e.id}>
                    <button type="button" class="item" onClick={() => store.edit(e)}>
                      <span class={`dot ${e.kind}`} />
                      <span class="what">
                        {e.kind === "feed" ? `Mamada · ${sidesLabel(e)}` : e.kind === "bath" ? "Banho" : "Sono"}
                        {e.kind === "feed" && (
                          <small class="muted">
                            {[
                              ...(["E", "D"] as const).filter((s) => sideDur(e, s, now) > 0).map((s) => `${s} ${dur(sideDur(e, s, now))}`),
                              ...(sincePrev.has(e.id) ? [`${dur(sincePrev.get(e.id)!)} depois da anterior`] : []),
                            ].join(" · ")}
                          </small>
                        )}
                      </span>
                      {e.kind === "bath" ? (
                        <span class="when"><b>{clock(e.start)}</b></span>
                      ) : (
                        <span class="when">
                          {clock(e.start)}–{e.end ? clock(e.end) : "agora"}
                          <b>{dur(e.kind === "feed" ? feedDur(e, now) : (e.end ?? now) - e.start)}</b>
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      {days.length > daysShown && (
        <button type="button" class="btn ghost wide" onClick={() => setDaysShown((n) => n + 7)}>Mostrar mais dias</button>
      )}
    </>
  );
}

/** "8 mamadas · 13h10 de sono · 1 banho" (sono do dia de 00:00 a 24:00, como nas Estatísticas). */
function DaySummary({ entries, list, day, now }: { entries: Entry[]; list: Entry[]; day: number; now: number }) {
  const end = addDays(day, 1);
  const nFeeds = list.filter((e) => e.kind === "feed").length;
  const nBaths = list.filter((e) => e.kind === "bath").length;
  const sleepMs = entries.reduce((s, e) => s + (e.kind === "sleep" ? Math.max(0, Math.min(entryEnd(e, now), end) - Math.max(e.start, day)) : 0), 0);
  const parts = [
    `${nFeeds} ${nFeeds === 1 ? "mamada" : "mamadas"}`,
    `${dur(sleepMs)} de sono`,
    ...(nBaths ? [`${nBaths} ${nBaths === 1 ? "banho" : "banhos"}`] : []),
  ];
  return <span class="day-sum">{parts.join(" · ")}</span>;
}
