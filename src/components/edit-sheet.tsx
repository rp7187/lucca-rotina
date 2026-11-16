import { useEffect, useState } from "preact/hooks";
import type { Store } from "../app";
import { SIDE_NAME, other, segmentsFromForm, sideDur, uid, type Entry, type Side } from "../model";
import { MIN, fromLocalInput, toLocalInput } from "../time";

/** Lançar / corrigir um registro. `entry` sem id = novo. */
export function EditSheet({ store, entry, onClose }: { store: Store; entry: Entry | { kind: Entry["kind"] }; onClose: () => void }) {
  const existing = "id" in entry ? entry : null;
  const now = Date.now();
  const isFeed = entry.kind === "feed";
  const active = existing?.end === null;

  const [start, setStart] = useState(toLocalInput(existing?.start ?? now - (isFeed ? 20 : 60) * MIN));
  const [end, setEnd] = useState(toLocalInput(existing?.end ?? now));
  const firstSide: Side = existing?.kind === "feed" ? existing.segments[0]?.side ?? "E" : "E";
  const [first, setFirst] = useState<Side>(firstSide);
  const [minFirst, setMinFirst] = useState(existing?.kind === "feed" ? String(Math.round(sideDur(existing, firstSide, now) / MIN)) : "15");
  const [minSecond, setMinSecond] = useState(existing?.kind === "feed" ? String(Math.round(sideDur(existing, other(firstSide), now) / MIN)) : "0");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(ev: Event) {
    ev.preventDefault();
    const s = fromLocalInput(start);
    if (s === null) return setError("Informe o início.");
    if (s > Date.now() + MIN) return setError("O início não pode ser no futuro.");
    if (isFeed) {
      const a = Number(minFirst.replace(",", "."));
      const b = Number(minSecond.replace(",", "."));
      if (!(a >= 0) || !(b >= 0) || a + b <= 0) return setError("Informe os minutos em pelo menos um dos lados.");
      if (a + b > 180) return setError("Duração acima de 3 horas: confira os minutos.");
      const segments = segmentsFromForm(s, first, a, b);
      await store.save({ id: existing?.id ?? uid(), kind: "feed", start: s, end: segments[segments.length - 1].end, segments });
    } else {
      const e = fromLocalInput(end);
      if (e === null || e <= s) return setError("O fim precisa ser depois do início.");
      if (e - s > 16 * 3_600_000) return setError("Soneca acima de 16 horas: confira as datas.");
      await store.save({ id: existing?.id ?? uid(), kind: "sleep", start: s, end: e });
    }
    onClose();
  }

  return (
    <div class="sheet-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="sheet-wrap" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <form class="sheet" onSubmit={submit}>
        <h2 id="sheet-title">{existing ? "Editar" : "Lançar"} {isFeed ? "mamada" : "soneca"}</h2>
        {active ? (
          <p class="muted">Este registro está em andamento: finalize na aba Agora para editar.</p>
        ) : (
          <>
            <label>Início<input type="datetime-local" value={start} onInput={(e) => setStart(e.currentTarget.value)} required /></label>
            {isFeed ? (
              <>
                <span class="label">Começou pelo</span>
                <div class="seg">
                  {(["E", "D"] as const).map((s) => (
                    <button key={s} type="button" class={first === s ? "on" : ""} aria-pressed={first === s} onClick={() => setFirst(s)}>{SIDE_NAME[s]}</button>
                  ))}
                </div>
                <div class="two">
                  <label>Minutos no {SIDE_NAME[first].toLowerCase()}<input type="number" inputMode="numeric" min="0" max="180" value={minFirst} onInput={(e) => setMinFirst(e.currentTarget.value)} /></label>
                  <label>Minutos no {SIDE_NAME[other(first)].toLowerCase()}<input type="number" inputMode="numeric" min="0" max="180" value={minSecond} onInput={(e) => setMinSecond(e.currentTarget.value)} /></label>
                </div>
              </>
            ) : (
              <label>Fim<input type="datetime-local" value={end} onInput={(e) => setEnd(e.currentTarget.value)} required /></label>
            )}
            {error && <p class="error" role="alert">{error}</p>}
          </>
        )}
        <div class="actions">
          {existing && (
            <button type="button" class="btn ghost danger" onClick={async () => {
              if (confirm("Apagar este registro?")) { await store.remove(existing.id); onClose(); }
            }}>Apagar</button>
          )}
          <button type="button" class="btn ghost" onClick={onClose}>Cancelar</button>
          {!active && <button type="submit" class={`btn primary ${entry.kind}`}>Salvar</button>}
        </div>
      </form>
      </div>
    </div>
  );
}
