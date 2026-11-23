import type { ComponentChildren } from "preact";

/** Cartão de número com botão "i" (explicação). */
export function Tile({ id, open, toggle, label, value, sub, delta }: {
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

export function Explain({ info, texts }: { info: string | null; texts: Record<string, [string, string]> }) {
  const t = info ? texts[info] : undefined;
  if (!t) return null;
  return <div class="explain" id={`explain-${info}`} role="note"><strong>{t[0]}</strong>{t[1]}</div>;
}
