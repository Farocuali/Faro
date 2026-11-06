// Lista los textos de la interfaz que pasan por t() o que están en el HTML del panel lateral.
// Uso: node herramientas/textos.js  → imprime JSON {claves:[...]}; lo usa también la prueba de traducciones.
const fs = require("fs");
const path = require("path");
const raiz = path.join(__dirname, "..");
const claves = new Set();
for (const f of ["docs-content.js", "sidepanel.js", "biblio.js", "background.js"]) {
  const src = fs.readFileSync(path.join(raiz, f), "utf8");
  const re = /\bt\(\s*(["'])((?:\\.|(?!\1).)*)\1/g;
  let m;
  while ((m = re.exec(src))) claves.add(m[2].replace(/\\'/g, "'").replace(/\\"/g, '"'));
  // t(cond ? "a" : "b")
  const re2 = /\bt\(\s*[^"'()]+\?\s*(["'])((?:\\.|(?!\1).)*)\1\s*:\s*(["'])((?:\\.|(?!\3).)*)\3/g;
  while ((m = re2.exec(src))) { claves.add(m[2]); claves.add(m[4]); }
}
// HTML del panel lateral: textos, placeholder/title/aria-label y bloques data-i18n-html
const html = fs.readFileSync(path.join(raiz, "sidepanel.html"), "utf8").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "");
for (const m of html.matchAll(/<(\w+)[^>]*data-i18n-html[^>]*>([\s\S]*?)<\/\1>/g)) claves.add(m[2].trim().replace(/\s+/g, " "));
const sinHtml = html.replace(/<(\w+)[^>]*data-i18n-html[^>]*>[\s\S]*?<\/\1>/g, "");
for (const m of sinHtml.matchAll(/>([^<>]+)</g)) { const x = m[1].trim().replace(/\s+/g, " "); if (/[a-záéíóúñ]{2}/i.test(x) && x !== "FARO") claves.add(x); }
for (const m of html.matchAll(/(?:placeholder|title|aria-label)="([^"]+)"/g)) if (/[a-záéíóúñ]{3}/i.test(m[1])) claves.add(m[1]);
console.log(JSON.stringify([...claves].sort(), null, 1));
