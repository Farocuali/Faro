// Página de bienvenida: se abre una sola vez, al instalar FARO.
const ES = FaroI18n.es;
const C = ES ? {
  bajada: "Investigación cualitativa en tu navegador. Así se empieza:",
  pasos: [
    ["Paso 1", "Codificá en Google Docs", "Abrí un Doc: abajo a la derecha está el botón <b>FARO</b>. Seleccioná un fragmento, copialo (<kbd>Ctrl</kbd>+<kbd>C</kbd>) y escribí el código."],
    ["Paso 2", "Conectá Google (opcional)", "Así los códigos se guardan dentro del Doc, se resaltan y tu proyecto se respalda en Drive. Se hace desde el botón <b>G</b> de FARO."],
    ["Paso 3", "Analizá en FARO completo", "Libro de códigos, descripción densa, redes, citas y bibliografía. Abrilo desde el ícono del faro → clic derecho → <b>Abrir FARO</b>."]
  ],
  abrir: "Abrir FARO", google: "Conectar Google",
  nota: "Tu trabajo se guarda en este navegador. Respaldalo seguido (en FARO: «Respaldar / Descargar datos») o activá la copia automática en Drive."
} : {
  bajada: "Qualitative research in your browser. Here's how to start:",
  pasos: [
    ["Step 1", "Code in Google Docs", "Open a Doc: the <b>FARO</b> button is at the bottom right. Select a fragment, copy it (<kbd>Ctrl</kbd>+<kbd>C</kbd>) and type the code."],
    ["Step 2", "Connect Google (optional)", "Codes are then stored inside the Doc, highlighted, and your project is backed up to Drive. Do it from FARO's <b>G</b> button."],
    ["Step 3", "Analyse in full FARO", "Codebook, thick description, networks, citations and bibliography. Open it from the lighthouse icon → right-click → <b>Open FARO</b>."]
  ],
  abrir: "Open FARO", google: "Connect Google",
  nota: "Your work is stored in this browser. Back it up often (in FARO: “Backup / Download data”) or turn on automatic copies to Drive."
};

document.documentElement.lang = ES ? "es" : "en";
document.getElementById("bajada").textContent = C.bajada;
document.getElementById("nota").textContent = C.nota;
document.getElementById("pasos").innerHTML = C.pasos
  .map(([n, t, p]) => `<section class="paso"><div class="num">${n}</div><h2>${t}</h2><p>${p}</p></section>`).join("");
const abrir = document.getElementById("abrir-faro");
abrir.textContent = C.abrir;
abrir.addEventListener("click", () => { location.href = chrome.runtime.getURL("faro.html"); });
const google = document.getElementById("google");
google.textContent = C.google;
google.addEventListener("click", () => { location.href = chrome.runtime.getURL("faro.html#google"); });
