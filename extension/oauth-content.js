// Corre solo en las páginas públicas de FARO (farocuali.github.io/Faro/…).
// 1) Inicio de sesión desde una pestaña (navegadores sin chrome.identity, como Firefox para Android):
//    Google vuelve con #access_token=…&state=faro_…; se borra de la barra y se le pasa a la extensión.
// 2) acceso.html: cuando la persona elige el Doc en el selector de Google, la página pone #faro-acceso-ok=<id>.
(() => {
  function revisar() {
    const h = location.hash;
    if (/[#&]state=faro_/.test(h) && /(access_token|error)=/.test(h)) {
      history.replaceState(null, "", location.pathname + location.search);
      chrome.runtime.sendMessage({ tipo: "google-token-web", hash: h.slice(1) }).catch(() => {});
      return;
    }
    const m = h.match(/^#faro-acceso-ok=([\w-]{5,})$/);
    if (m) chrome.runtime.sendMessage({ tipo: "docs-acceso-ok", docId: m[1] }).catch(() => {});
  }
  revisar();
  window.addEventListener("hashchange", revisar);
})();
