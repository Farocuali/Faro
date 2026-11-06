// FARO en la extensión: las librerías vienen dentro del paquete (lib/), sin descargas.
// Son los mismos archivos que FARO web descarga de jsDelivr (huellas SHA-384 verificadas al empaquetar).
const FARO_LIBS = {
  mammoth:   { file: "lib/mammoth.browser.min.js", global: "mammoth" },
  cytoscape: { file: "lib/cytoscape.min.js", global: "cytoscape" },
  pdfjs:     { file: "lib/pdf.min.mjs" },
  pdfworker: { file: "lib/pdf.worker.min.mjs" }
};
const _libPromises = {};
function ensureLib(name) {
  if (_libPromises[name]) return _libPromises[name];
  const spec = FARO_LIBS[name];
  let p;
  if (name === "pdfjs") {
    p = (async () => {
      const lib = await import(chrome.runtime.getURL(FARO_LIBS.pdfjs.file));
      lib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL(FARO_LIBS.pdfworker.file);
      window.pdfjsLib = lib;
      return lib;
    })();
  } else {
    if (window[spec.global]) return Promise.resolve(window[spec.global]);
    p = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = chrome.runtime.getURL(spec.file);
      s.onload = () => (window[spec.global] ? resolve(window[spec.global]) : reject(new Error("no-global")));
      s.onerror = () => reject(new Error("load-failed"));
      document.head.appendChild(s);
    });
  }
  _libPromises[name] = p;
  p.catch(() => { delete _libPromises[name]; });
  return p;
}
