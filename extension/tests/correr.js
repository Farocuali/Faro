// Corre todas las pruebas. Uso: npm test   (o: node tests/correr.js --sin-navegador)
const { spawnSync } = require("child_process");
const path = require("path");
const sinNavegador = process.argv.includes("--sin-navegador");
const pruebas = ["ops", "acuerdo", "google", "google-pestana", "complemento", "traducciones", "biblio"];
if (!sinNavegador) {
  // La prueba del navegador usa el paquete armado: se rearma antes.
  const r = spawnSync("python3", [path.join(__dirname, "..", "herramientas", "empaquetar.py")], { encoding: "utf8" });
  if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
  pruebas.push("e2e");
}
let fallidas = [];
for (const p of pruebas) {
  const r = spawnSync(process.execPath, [path.join(__dirname, `${p}.test.js`)], { encoding: "utf8", timeout: 300000 });
  process.stdout.write(r.stdout || "");
  if (r.stderr) process.stderr.write(r.stderr);
  const fallos = (r.stdout.match(/✗/g) || []).length;
  if (r.status !== 0 || fallos) fallidas.push(p);
}
const total = pruebas.length;
console.log(`\n${total - fallidas.length}/${total} grupos de pruebas OK` + (fallidas.length ? ` · fallaron: ${fallidas.join(", ")}` : ""));
process.exit(fallidas.length ? 1 : 0);
