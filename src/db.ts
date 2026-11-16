import type { Entry } from "./model";

/**
 * Armazenamento 100% local (IndexedDB do Safari). Um único "store" com todos os registros;
 * o volume é pequeno (poucos KB por mês), então o app carrega tudo na memória ao abrir.
 */
const DB_NAME = "lucca-rotina";
const STORE = "entries";

let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req ? req.result : (undefined as T));
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const getAll = () => run<Entry[]>("readonly", (s) => s.getAll() as IDBRequest<Entry[]>);
export const put = (e: Entry) => run("readwrite", (s) => { s.put(e); });
export const remove = (id: string) => run("readwrite", (s) => { s.delete(id); });
export const putMany = (es: Entry[]) => run("readwrite", (s) => { for (const e of es) s.put(e); });
export const clearAll = () => run("readwrite", (s) => { s.clear(); });

/** Pede ao navegador para não apagar os dados por falta de espaço/uso (melhor esforço). */
export async function requestPersist(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch {
    return false;
  }
}
