import { useState } from "preact/hooks";
import type { Store } from "../app";
import { useNow } from "../hooks";
import { feedDur, sideDur, sidesLabel, type Entry } from "../model";
import { clock, dayLabel, dur, startOfDay } from "../time";

export function History({ store }: { store: Store }) {
  const now = useNow(30_000);
  const [daysShown, setDaysShown] = useState(7);
  const groups = new Map<number, Entry[]>();
  for (const e of [...store.entries].reverse()) {
    const d = startOfDay(e.start);
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d)!.push(e);
  }
  const days = [...groups.entries()];

  return (
    <>
      <header class="page-head">
        <h1>Histórico</h1>
        <div class="row-actions">
          <button type="button" class="btn small ghost" onClick={() => store.edit({ kind: "feed" })}>+ Mamada</button>
          <button type="button" class="btn small ghost" onClick={() => store.edit({ kind: "sleep" })}>+ Soneca</button>
          <button type="button" class="btn small ghost" onClick={() => store.edit({ kind: "bath" })}>+ Banho</button>
        </div>
      </header>
      {!days.length && <p class="muted empty">Nada registrado ainda. Use a aba Agora ou os botões acima para lançar registros antigos.</p>}
      {days.slice(0, daysShown).map(([day, list]) => (
        <section key={day} class="day">
          <h2>{dayLabel(day, now)}</h2>
          <ul class="list">
            {list.map((e) => (
              <li key={e.id}>
                <button type="button" class="item" onClick={() => store.edit(e)}>
                  <span class={`dot ${e.kind}`} />
                  <span class="what">
                    {e.kind === "feed" ? `Mamada · ${sidesLabel(e)}` : e.kind === "bath" ? "Banho" : "Soneca"}
                    {e.kind === "feed" && e.segments.length > 0 && (
                      <small class="muted">
                        {(["E", "D"] as const).filter((s) => sideDur(e, s, now) > 0).map((s) => `${s} ${dur(sideDur(e, s, now))}`).join(" · ")}
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
        </section>
      ))}
      {days.length > daysShown && (
        <button type="button" class="btn ghost wide" onClick={() => setDaysShown((n) => n + 7)}>Mostrar mais dias</button>
      )}
    </>
  );
}
