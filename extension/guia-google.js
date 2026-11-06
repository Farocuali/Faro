// Muestra la guía en el idioma del navegador y las URIs de redireccionamiento exactas de esta instalación.
const enEspanol = FaroI18n.es;
document.getElementById("guia-es").hidden = !enEspanol;
document.getElementById("guia-en").hidden = enEspanol;
document.documentElement.lang = enEspanol ? "es" : "en";
document.title = enEspanol ? "FARO · Conectar Google" : "FARO · Connect Google";

const uris = [];
if (chrome.identity?.getRedirectURL) uris.push(chrome.identity.getRedirectURL());
uris.push("https://farocuali.github.io/Faro/"); // inicio de sesión en una pestaña (Firefox para Android)

for (const caja of document.querySelectorAll(".uris")) {
  for (const u of uris) {
    const fila = document.createElement("div");
    fila.className = "copiar";
    const campo = document.createElement("input");
    campo.className = "dato"; campo.readOnly = true; campo.value = u;
    const b = document.createElement("button");
    const etiqueta = enEspanol ? "Copiar" : "Copy";
    b.type = "button"; b.textContent = etiqueta;
    b.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(u); } catch { campo.select(); document.execCommand("copy"); }
      b.textContent = enEspanol ? "Copiado ✓" : "Copied ✓";
      setTimeout(() => { b.textContent = etiqueta; }, 1500);
    });
    fila.append(campo, b);
    caja.append(fila);
  }
}
