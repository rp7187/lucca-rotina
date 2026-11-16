import { useState } from "preact/hooks";
import { HOUR, MIN, addDays, clock, pad } from "../time";

const QUICK = [5, 10, 15, 20, 30];

/** "HH:MM" → horário de hoje; se ficar no futuro, é de ontem (ex.: 23:50 informado às 00:10). */
function resolveTime(hhmm: string, now: number): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const d = new Date(now);
  d.setHours(+m[1], +m[2], 0, 0);
  let t = d.getTime();
  if (t > now + MIN) t = addDays(t, -1);
  return t;
}

/**
 * Corrige o início de um registro em andamento: digitar o horário ou tocar em "há N min".
 * `latest` = início não pode passar disso (ex.: fim do 1º trecho da mamada, ou agora).
 */
export function AdjustStart({ title, start, latest, onSave, onCancel }: {
  title: string;
  start: number;
  latest: number;
  onSave: (t: number) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(clock(start));
  const [error, setError] = useState<string | null>(null);

  function save(t: number | null) {
    const now = Date.now();
    if (t === null) return setError("Informe o horário (ex.: 14:05).");
    if (t > Math.min(latest, now)) return setError(`O início precisa ser até ${clock(Math.min(latest, now))}.`);
    if (now - t > 12 * HOUR) return setError("Mais de 12 horas atrás: lance pelo Histórico.");
    onSave(t);
  }

  return (
    <form class="adjust" onSubmit={(e) => { e.preventDefault(); save(resolveTime(value, Date.now())); }}>
      <label>
        {title}
        <input type="time" value={value} onInput={(e) => { setValue(e.currentTarget.value); setError(null); }} required />
      </label>
      <div class="chips" role="group" aria-label="Minutos atrás">
        {QUICK.map((m) => (
          <button key={m} type="button" class="chip" onClick={() => {
            const t = Date.now() - m * MIN;
            const d = new Date(t);
            setValue(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
            setError(null);
          }}>há {m} min</button>
        ))}
      </div>
      {error && <p class="error" role="alert">{error}</p>}
      <div class="actions">
        <button type="button" class="btn ghost small" onClick={onCancel}>Cancelar</button>
        <button type="submit" class="btn small primary-neutral">Salvar início</button>
      </div>
    </form>
  );
}
