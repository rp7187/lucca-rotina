import { useEffect, useState } from "preact/hooks";
import type { Store } from "../app";
import { KIND_NAME, SIDE_NAME, TAG_NAME, other, segmentsFromForm, sideDur, uid, type Draft, type Entry, type Measure, type MeasureTag, type Side } from "../model";
import { cm, fromDateInput, kg, measuresOf, parseHeight, parseWeight, toDateInput } from "../growth";
import { MIN, fromLocalInput, startOfDay, toLocalInput } from "../time";

/** Lançar / corrigir um registro. `entry` sem id = novo. */
export function EditSheet({ store, entry, onClose }: { store: Store; entry: Entry | Draft; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return entry.kind === "measure"
    ? <MeasureSheet store={store} entry={entry as Measure | Draft} onClose={onClose} />
    : <EventSheet store={store} entry={entry} onClose={onClose} />;
}

function Shell({ onClose, onSubmit, children }: { onClose: () => void; onSubmit: (ev: Event) => void; children: preact.ComponentChildren }) {
  return (
    <div class="sheet-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="sheet-wrap" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <form class="sheet" onSubmit={onSubmit}>{children}</form>
      </div>
    </div>
  );
}

const TAGS: (MeasureTag | "none")[] = ["birth", "discharge", "none"];

/** Peso e/ou altura numa data; pode ser a do nascimento ou a da alta (no máximo uma de cada). */
function MeasureSheet({ store, entry, onClose }: { store: Store; entry: Measure | Draft; onClose: () => void }) {
  const existing = "id" in entry ? entry : null;
  const all = measuresOf(store.entries);
  const taken = (t: MeasureTag) => all.some((m) => m.tag === t && m.id !== existing?.id);
  const [tag, setTag] = useState<MeasureTag | "none">(entry.tag && !taken(entry.tag) ? entry.tag : "none");
  const [date, setDate] = useState(toDateInput(existing?.start ?? Date.now()));
  const [weight, setWeight] = useState(existing?.weightG != null ? kg(existing.weightG).replace(" kg", "") : "");
  const [height, setHeight] = useState(existing?.heightCm != null ? cm(existing.heightCm).replace(" cm", "") : "");
  const [error, setError] = useState<string | null>(null);

  async function submit(ev: Event) {
    ev.preventDefault();
    const t = fromDateInput(date);
    if (t === null) return setError("Informe a data.");
    if (startOfDay(t) > Date.now()) return setError("A data não pode ser no futuro.");
    const w = weight.trim() ? parseWeight(weight) : undefined;
    const h = height.trim() ? parseHeight(height) : undefined;
    if (w === null || (w !== undefined && (w < 500 || w > 30_000))) return setError("Peso fora do esperado: use quilos, por exemplo 3,250.");
    if (h === null || (h !== undefined && (h < 30 || h > 130))) return setError("Altura fora do esperado: use centímetros, por exemplo 49,5.");
    if (w === undefined && h === undefined) return setError("Informe o peso, a altura ou os dois.");
    const others = all.filter((m) => m.id !== existing?.id);
    const birth = others.find((m) => m.tag === "birth");
    if (tag === "birth" && others.some((m) => startOfDay(m.start) < startOfDay(t))) return setError("Há medições com data anterior a esta. Confira a data do nascimento.");
    if (tag !== "birth" && birth && startOfDay(t) < startOfDay(birth.start)) return setError("A data é anterior ao nascimento.");
    const m: Measure = { id: existing?.id ?? uid(), kind: "measure", start: t, end: t };
    if (w !== undefined) m.weightG = w;
    if (h !== undefined) m.heightCm = h;
    if (tag !== "none") m.tag = tag;
    await store.save(m);
    onClose();
  }

  return (
    <Shell onClose={onClose} onSubmit={submit}>
      <h2 id="sheet-title">{existing ? "Editar" : "Lançar"} medição</h2>
      <span class="label">Tipo</span>
      <div class="seg full three-way">
        {TAGS.map((t) => (
          <button key={t} type="button" class={tag === t ? "on" : ""} aria-pressed={tag === t} disabled={t !== "none" && taken(t)}
            onClick={() => setTag(t)}>{t === "none" ? "Medição" : t === "birth" ? "Nascimento" : "Alta"}</button>
        ))}
      </div>
      {tag !== "none" && <p class="muted small">{TAG_NAME[tag]}: só pode haver uma.</p>}
      <label>{tag === "birth" ? "Data do nascimento" : tag === "discharge" ? "Data da alta" : "Data"}<input type="date" value={date} onInput={(e) => setDate(e.currentTarget.value)} required /></label>
      <div class="two">
        <label>Peso (kg)<input type="text" inputMode="decimal" placeholder="3,250" value={weight} onInput={(e) => setWeight(e.currentTarget.value)} /></label>
        <label>Altura (cm)<input type="text" inputMode="decimal" placeholder="49,5" value={height} onInput={(e) => setHeight(e.currentTarget.value)} /></label>
      </div>
      <p class="muted small">Pode deixar um dos dois em branco.</p>
      {error && <p class="error" role="alert">{error}</p>}
      <div class="actions">
        {existing && (
          <button type="button" class="btn ghost danger" onClick={async () => {
            if (confirm("Apagar esta medição?")) { await store.remove(existing.id); onClose(); }
          }}>Apagar</button>
        )}
        <button type="button" class="btn ghost" onClick={onClose}>Cancelar</button>
        <button type="submit" class="btn primary measure">Salvar</button>
      </div>
    </Shell>
  );
}

/** Mamada, soneca ou banho. */
function EventSheet({ store, entry, onClose }: { store: Store; entry: Entry | Draft; onClose: () => void }) {
  const existing = "id" in entry ? entry : null;
  const now = Date.now();
  const isFeed = entry.kind === "feed";
  const isBath = entry.kind === "bath";
  const active = existing?.end === null;

  const [start, setStart] = useState(toLocalInput(existing?.start ?? now - (isBath ? 0 : isFeed ? 20 : 60) * MIN));
  const [end, setEnd] = useState(toLocalInput(existing?.end ?? now));
  const firstSide: Side = existing?.kind === "feed" ? existing.segments[0]?.side ?? "E" : "E";
  const [first, setFirst] = useState<Side>(firstSide);
  const [minFirst, setMinFirst] = useState(existing?.kind === "feed" ? String(Math.round(sideDur(existing, firstSide, now) / MIN)) : "15");
  const [minSecond, setMinSecond] = useState(existing?.kind === "feed" ? String(Math.round(sideDur(existing, other(firstSide), now) / MIN)) : "0");
  const [error, setError] = useState<string | null>(null);

  async function submit(ev: Event) {
    ev.preventDefault();
    const s = fromLocalInput(start);
    if (s === null) return setError("Informe o início.");
    if (s > Date.now() + MIN) return setError(isBath ? "O horário não pode ser no futuro." : "O início não pode ser no futuro.");
    if (isBath) {
      await store.save({ id: existing?.id ?? uid(), kind: "bath", start: s, end: s });
    } else if (isFeed) {
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
        <h2 id="sheet-title">{existing ? "Editar" : "Lançar"} {KIND_NAME[entry.kind]}</h2>
        {active ? (
          <p class="muted">Este registro está em andamento: finalize na aba Agora para editar.</p>
        ) : (
          <>
            <label>{isBath ? "Data e hora" : "Início"}<input type="datetime-local" value={start} onInput={(e) => setStart(e.currentTarget.value)} required /></label>
            {isBath ? null : isFeed ? (
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
