import { useEffect, useState } from "preact/hooks";
import type { Store } from "../app";
import { isEntry } from "../model";
import { requestPersist } from "../db";

export function Settings({ store }: { store: Store }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<number | null>(null);
  const standalone = typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

  useEffect(() => {
    requestPersist().then(setPersisted);
    navigator.storage?.estimate?.().then((e) => setUsage(e.usage ?? null)).catch(() => {});
  }, [store.entries.length]);

  async function exportBackup() {
    const name = `lucca-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const blob = new Blob([JSON.stringify({ app: "lucca-rotina", version: 1, exportedAt: new Date().toISOString(), entries: store.entries })], { type: "application/json" });
    const file = new File([blob], name, { type: "application/json" });
    try {
      // iPhone: abre o menu de compartilhar (Salvar em Arquivos, AirDrop, WhatsApp…)
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Backup Lucca" });
        setMsg("Backup compartilhado.");
        return;
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMsg("Backup baixado.");
  }

  async function importBackup(file: File) {
    try {
      const data = JSON.parse(await file.text());
      const list: unknown[] = Array.isArray(data) ? data : data?.entries;
      if (!Array.isArray(list)) throw new Error("arquivo sem registros");
      const valid = list.filter(isEntry);
      if (!valid.length) throw new Error("nenhum registro válido");
      if (!confirm(`Importar ${valid.length} registro(s)? Registros iguais serão substituídos; os demais são mantidos.`)) return;
      await store.merge(valid);
      setMsg(`${valid.length} registro(s) importado(s).`);
    } catch (e) {
      setMsg(`Não foi possível importar: ${(e as Error).message}`);
    }
  }

  return (
    <>
      <header class="page-head"><h1>Ajustes</h1></header>

      <section class="card">
        <h2>Backup</h2>
        <p class="muted small">
          Os dados ficam só neste celular. Faça um backup de vez em quando (ex.: toda semana) e guarde no Arquivos/iCloud
          ou mande para você mesmo — se o Safari apagar os dados do site, dá para restaurar.
        </p>
        <div class="actions">
          <button type="button" class="btn primary sleep" onClick={exportBackup}>Exportar backup</button>
          <label class="btn ghost file">
            Importar backup
            <input type="file" accept="application/json,.json" onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              if (f) importBackup(f);
              e.currentTarget.value = "";
            }} />
          </label>
        </div>
        {msg && <p class="note" role="status">{msg}</p>}
      </section>

      <section class="card">
        <h2>Armazenamento</h2>
        <ul class="facts">
          <li><span class="muted">Registros</span><b>{store.entries.length}</b></li>
          <li><span class="muted">Espaço usado</span><b>{usage == null ? "—" : usage < 1024 * 1024 ? `${Math.ceil(usage / 1024)} KB` : `${(usage / 1024 / 1024).toFixed(1)} MB`}</b></li>
          <li><span class="muted">Instalado na tela de início</span><b>{standalone ? "sim" : "não"}</b></li>
          <li><span class="muted">Armazenamento protegido</span><b>{persisted == null ? "—" : persisted ? "sim" : "não"}</b></li>
        </ul>
        {!standalone && (
          <p class="muted small">
            Para usar como app: no Safari, toque em <b>Compartilhar</b> → <b>Adicionar à Tela de Início</b>. Assim ele abre em tela
            cheia, funciona sem internet e o iPhone protege melhor os dados.
          </p>
        )}
      </section>

      <section class="card">
        <h2>Apagar tudo</h2>
        <p class="muted small">Remove todos os registros deste celular. Exporte um backup antes.</p>
        <button type="button" class="btn ghost danger" onClick={async () => {
          if (!store.entries.length) return;
          if (confirm(`Apagar os ${store.entries.length} registros?`) && confirm("Tem certeza? Não dá para desfazer.")) {
            await store.clear();
            setMsg("Registros apagados.");
          }
        }}>Apagar todos os registros</button>
      </section>
    </>
  );
}
