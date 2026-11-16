import { useCallback, useEffect, useState } from "preact/hooks";
import * as db from "./db";
import type { Entry } from "./model";
import { Home } from "./components/home";
import { History } from "./components/history";
import { Stats } from "./components/stats";
import { Settings } from "./components/settings";
import { EditSheet } from "./components/edit-sheet";

export type Store = {
  entries: Entry[];
  save: (e: Entry) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Importação de backup: mescla por id (registros iguais são substituídos). */
  merge: (es: Entry[]) => Promise<void>;
  clear: () => Promise<void>;
  edit: (e: Entry | { kind: Entry["kind"] }) => void;
};

type Tab = "home" | "history" | "stats" | "settings";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "home", label: "Agora", icon: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" },
  { id: "history", label: "Histórico", icon: "M4 6h16M4 12h16M4 18h10" },
  { id: "stats", label: "Estatísticas", icon: "M4 20V10m6 10V4m6 16v-7m4 7H2" },
  { id: "settings", label: "Ajustes", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" },
];

const byStart = (a: Entry, b: Entry) => a.start - b.start;

export function App() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [editing, setEditing] = useState<Entry | { kind: Entry["kind"] } | null>(null);

  useEffect(() => {
    db.getAll().then((es) => setEntries(es.sort(byStart))).catch((e) => setError(String(e)));
    db.requestPersist();
  }, []);

  const guard = useCallback(async (op: () => Promise<void>) => {
    try { await op(); } catch (e) { setError(`Não foi possível salvar: ${e}`); }
  }, []);

  if (error) return <main class="page"><p class="error">{error}</p></main>;
  if (!entries) return <main class="page" />;

  const store: Store = {
    entries,
    save: (e) => guard(async () => {
      await db.put(e);
      setEntries((cur) => [...(cur ?? []).filter((x) => x.id !== e.id), e].sort(byStart));
    }),
    remove: (id) => guard(async () => {
      await db.remove(id);
      setEntries((cur) => (cur ?? []).filter((x) => x.id !== id));
    }),
    merge: (es) => guard(async () => {
      await db.putMany(es);
      setEntries((cur) => {
        const map = new Map((cur ?? []).map((x) => [x.id, x]));
        for (const e of es) map.set(e.id, e);
        return [...map.values()].sort(byStart);
      });
    }),
    clear: () => guard(async () => { await db.clearAll(); setEntries([]); }),
    edit: setEditing,
  };

  return (
    <>
      <main class="page">
        {tab === "home" && <Home store={store} />}
        {tab === "history" && <History store={store} />}
        {tab === "stats" && <Stats entries={entries} />}
        {tab === "settings" && <Settings store={store} />}
      </main>
      <nav class="tabbar" aria-label="Navegação">
        {TABS.map((t) => (
          <button key={t.id} type="button" class={tab === t.id ? "on" : ""} aria-current={tab === t.id ? "page" : undefined}
            onClick={() => { setTab(t.id); window.scrollTo(0, 0); }}>
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d={t.icon} /></svg>
            {t.label}
          </button>
        ))}
      </nav>
      {editing && <EditSheet store={store} entry={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
