import { TAG_NAME, type Draft, type Entry, type Measure } from "../model";
import { ageText, cm, cmDelta, gDelta, gainPerDay, growthSummary, kg, measuresOf } from "../growth";
import { shortDay } from "../time";
import { LineChart } from "./charts";
import { Explain, Tile } from "./tiles";

type Tip = (id: string) => { id: string; open: boolean; toggle: () => void };
const num = (s: string) => s.replace(/ (kg|cm)$/, "");

/** Peso e altura desde o nascimento. Não depende do período escolhido nas Estatísticas. */
export function GrowthBlock({ entries, now, info, tip, onEdit }: {
  entries: Entry[]; now: number; info: string | null; tip: Tip; onEdit: (e: Entry | Draft) => void;
}) {
  const ms = measuresOf(entries);
  const g = growthSummary(ms);
  const { birth, discharge, lastW, lastH } = g;
  const age = (t: number) => (birth ? ageText(birth.start, t) : null);
  const describe = (m: Measure, value: string) => `${shortDay(m.start)}${m.tag ? ` · ${TAG_NAME[m.tag]}` : birth ? ` · com ${age(m.start)}` : ""} · ${value}`;
  // 4º cartão: ganho desde a alta; sem alta, desde o nascimento.
  const since = g.sinceDischarge ? { label: "Desde a alta", gain: g.sinceDischarge, id: "growth.discharge" }
    : g.sinceBirth ? { label: "Desde o nascimento", gain: g.sinceBirth, id: "growth.birth" } : null;
  const tiles = [
    lastW && <Tile key="w" {...tip("growth.weight")} label="Peso" value={kg(lastW.weightG!)} sub={`em ${shortDay(lastW.start)}`}
      delta={birth?.weightG != null && lastW !== birth ? <><b>{gDelta(lastW.weightG! - birth.weightG)}</b> desde o nascimento</> : undefined} />,
    g.recent && <Tile key="r" {...tip("growth.recent")} label="Ganho por dia" value={`${gDelta(g.recent.gPerDay)}/dia`}
      sub={`desde ${shortDay(g.recent.from.start)} (${g.recent.days} dia${g.recent.days === 1 ? "" : "s"})`} />,
    lastH && <Tile key="h" {...tip("growth.height")} label="Altura" value={cm(lastH.heightCm!)} sub={`em ${shortDay(lastH.start)}`}
      delta={birth?.heightCm != null && lastH !== birth ? <><b>{cmDelta(lastH.heightCm! - birth.heightCm)}</b> desde o nascimento</> : undefined} />,
    since && <Tile key="s" {...tip(since.id)} label={since.label} value={gDelta(since.gain.gPerDay * since.gain.days)}
      sub={`média de ${gDelta(since.gain.gPerDay)}/dia em ${since.gain.days} dias`} />,
  ].filter(Boolean);

  return (
    <section class="block" aria-labelledby="h-growth">
      <div class="block-head"><span class="dot measure" /><h2 id="h-growth">Crescimento</h2></div>
      <p class="period">Desde o nascimento. Não depende do período escolhido no topo.</p>

      {!ms.length ? (
        <section class="card">
          <p class="sub">Registre o peso e a altura do nascimento e da alta do hospital. Depois, lance cada nova medição (consulta, vacina, farmácia).</p>
          <div class="actions growth-add">
            <button type="button" class="btn small primary measure" onClick={() => onEdit({ kind: "measure", tag: "birth" })}>Nascimento</button>
            <button type="button" class="btn small ghost" onClick={() => onEdit({ kind: "measure", tag: "discharge" })}>Alta do hospital</button>
            <button type="button" class="btn small ghost" onClick={() => onEdit({ kind: "measure" })}>Outra medição</button>
          </div>
        </section>
      ) : <>
        {(lastW || lastH) && (
          <p class="headline">
            {birth && <>Com <b>{ageText(birth.start, now)}</b>, </>}
            {lastW && <>{birth ? "pesa" : "Pesa"} <b>{kg(lastW.weightG!)}</b></>}
            {lastW && lastH && " e "}
            {lastH && <>{!lastW && !birth ? "Mede" : "mede"} <b>{cm(lastH.heightCm!)}</b></>}
            {" "}<span class="muted">(última medição em {shortDay(Math.max(lastW?.start ?? 0, lastH?.start ?? 0))})</span>.
          </p>
        )}
        <div class="tiles">{tiles}</div>
        <Explain info={info} texts={{
          "growth.weight": ["Peso", "Peso da medição mais recente. Embaixo, quanto mudou desde o nascimento."],
          "growth.recent": ["Ganho por dia", "Diferença entre as duas últimas pesagens dividida pelos dias entre elas. Exemplo: 4,10 kg em 18/11 e 3,65 kg em 04/11 dão 450 g em 14 dias, ou 32 g por dia."],
          "growth.height": ["Altura", "Altura (comprimento) da medição mais recente. Embaixo, quanto cresceu desde o nascimento."],
          "growth.discharge": ["Desde a alta", "Peso ganho desde a pesagem da alta do hospital até a última, e a média por dia nesse tempo."],
          "growth.birth": ["Desde o nascimento", "Peso ganho desde o nascimento até a última pesagem, e a média por dia nesse tempo."],
        }} />
        {g.lowest && (
          <p class="sub growth-note">
            Menor peso depois do nascimento: <b>{kg(g.lowest.weightG!)}</b> em {shortDay(g.lowest.start)} ({Math.round(((birth!.weightG! - g.lowest.weightG!) / birth!.weightG!) * 100)}% abaixo do peso ao nascer).
            {g.regained ? <> Voltou ao peso do nascimento em <b>{shortDay(g.regained.start)}</b>, com {ageText(birth!.start, g.regained.start)}.</> : " Ainda abaixo do peso do nascimento na última pesagem."}
          </p>
        )}
        {(!birth || !discharge) && (
          <div class="growth-missing">
            <span class="muted">Falta registrar:</span>
            {!birth && <button type="button" class="chip" onClick={() => onEdit({ kind: "measure", tag: "birth" })}>+ Nascimento</button>}
            {!discharge && <button type="button" class="chip" onClick={() => onEdit({ kind: "measure", tag: "discharge" })}>+ Alta do hospital</button>}
          </div>
        )}

        {g.ws.length > 0 && (
          <section class="card">
            <h3>Peso</h3>
            <p class="sub">Em quilos, a cada medição. Toque em um ponto para ver a data.</p>
            <LineChart key={`w${g.ws.length}`} color="measure" points={g.ws.map((m) => ({ t: m.start, v: m.weightG! / 1000 }))} steps={[0.25, 0.5, 1, 2, 5]}
              tick={(v) => String(Number(v.toFixed(2))).replace(".", ",")} short={(v) => num(kg(v * 1000))}
              describe={(i) => describe(g.ws[i], kg(g.ws[i].weightG!))}
              summary={g.ws.length > 1 ? `${gDelta(g.ws[g.ws.length - 1].weightG! - g.ws[0].weightG!)} desde ${shortDay(g.ws[0].start)}` : ""} />
          </section>
        )}
        {g.hs.length > 0 && (
          <section class="card">
            <h3>Altura</h3>
            <p class="sub">Em centímetros, a cada medição.</p>
            <LineChart key={`h${g.hs.length}`} color="measure" points={g.hs.map((m) => ({ t: m.start, v: m.heightCm! }))} steps={[1, 2, 5, 10]}
              tick={(v) => String(v)} short={(v) => num(cm(v))}
              describe={(i) => describe(g.hs[i], cm(g.hs[i].heightCm!))}
              summary={g.hs.length > 1 ? `${cmDelta(g.hs[g.hs.length - 1].heightCm! - g.hs[0].heightCm!)} desde ${shortDay(g.hs[0].start)}` : ""} />
          </section>
        )}

        <section class="card">
          <div class="card-row">
            <h3>Medições</h3>
            <button type="button" class="btn small ghost" onClick={() => onEdit({ kind: "measure" })}>+ Nova medição</button>
          </div>
          <ul class="list flat">
            {[...ms].reverse().map((m) => {
              const prev = g.ws.filter((x) => x.start < m.start).pop();
              const gain = m.weightG != null && prev ? gainPerDay(m, prev) : null;
              return (
                <li key={m.id}>
                  <button type="button" class="item" onClick={() => onEdit(m)}>
                    <span class="dot measure" />
                    <span class="what">
                      {shortDay(m.start)}{m.tag ? ` · ${TAG_NAME[m.tag]}` : ""}
                      <small class="muted">{[birth && !m.tag ? age(m.start) : null, gain ? `${gDelta(gain.gPerDay)}/dia` : null].filter(Boolean).join(" · ") || " "}</small>
                    </span>
                    <span class="when">
                      {m.heightCm != null ? cm(m.heightCm) : " "}
                      <b>{m.weightG != null ? kg(m.weightG) : " "}</b>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </>}
    </section>
  );
}
