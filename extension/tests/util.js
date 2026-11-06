// Utilidades compartidas por las pruebas.
const path = require("path");
const RAIZ = path.join(__dirname, "..");
let fallas = 0;
function ok(condicion, mensaje) {
  console.log((condicion ? "  ✓ " : "  ✗ ") + mensaje);
  if (!condicion) { fallas++; process.exitCode = 1; }
}
module.exports = { RAIZ, ok, fallas: () => fallas, archivo: (f) => path.join(RAIZ, f) };
