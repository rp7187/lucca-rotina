import { render } from "preact";
import { App } from "./app";
import "./styles.css";

render(<App />, document.getElementById("app")!);

// Offline: o service worker guarda o app no celular (só no build; no dev atrapalharia o recarregamento).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  // Já havia um service worker controlando a página = não é a 1ª visita. Se outro assumir, chegou versão nova:
  // o app mostra o aviso "Atualizar" (não recarrega sozinho para não perder uma edição em andamento).
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController) window.dispatchEvent(new Event("app-update"));
  });
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" });
      // No iPhone o app instalado costuma voltar do segundo plano sem recarregar: procura versão nova ao voltar.
      document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update().catch(() => {}); });
      await navigator.serviceWorker.ready;
      // Arquivos já carregados nesta 1ª visita (JS/CSS com hash) vão para o cache também.
      const urls = performance.getEntriesByType("resource").map((r) => r.name).filter((u) => u.startsWith(location.origin));
      (reg.active ?? navigator.serviceWorker.controller)?.postMessage({ type: "cache", urls: [location.href, ...urls] });
    } catch { /* sem service worker: o app funciona, só não offline */ }
  });
}
