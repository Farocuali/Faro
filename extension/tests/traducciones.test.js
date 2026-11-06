// Cada texto de la interfaz tiene su traducción al inglés, y las variables {x} coinciden.
const fs = require("fs");
const { execFileSync } = require("child_process");
const { archivo, ok } = require("./util");
console.log("traducciones");
global.chrome = { i18n: { getUILanguage: () => "en-US" } };
const ctx = {};
new Function("self", fs.readFileSync(archivo("i18n.js"), "utf8"))(Object.assign(ctx, { chrome: global.chrome, navigator: {} }));
const I = ctx.FaroI18n;
const claves = JSON.parse(execFileSync("node", [archivo("herramientas/textos.js")]).toString());
const faltan = claves.filter((k) => !(k in I.EN));
ok(faltan.length === 0, `todos los textos (${claves.length}) tienen traducción` + (faltan.length ? ": " + faltan.join(" | ") : ""));
const vars = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
const malas = Object.entries(I.EN).filter(([es, en]) => vars(es) !== vars(en));
ok(malas.length === 0, "las variables {x} coinciden en castellano e inglés");
ok(I.t("{n} fragmentos", { n: 3 }) === "3 fragments" && !I.es, "en inglés traduce y reemplaza variables");
for (const loc of ["es", "en"]) {
  const m = JSON.parse(fs.readFileSync(archivo(`_locales/${loc}/messages.json`), "utf8"));
  ok(m.nombre.message.length <= 75 && m.descripcion.message.length <= 132, `_locales/${loc}: nombre y descripción dentro de los límites de la tienda`);
}
