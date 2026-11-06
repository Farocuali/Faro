# Cambios / Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); versiones según [SemVer](https://semver.org/lang/es/).

## [1.4.0] — 2026-11-06

### Agregado
- **Memos por fragmento**: una nota analítica pegada a cada fragmento codificado (botón ✎ en el panel de Google Docs y ventana «Memos» en el menú «＋» de FARO). En FARO se ven al pasar el mouse por el fragmento (subrayado punteado). Se incluyen en los respaldos.
- **Citar con memo**: en «Citar en la tesis», opción para copiar la cita junto con su memo (con seudónimos).
- **Anexo de codificación**: arma el anexo metodológico de la tesis (libro de códigos con definiciones y un ejemplo real, frecuencias, registro de decisiones, último cálculo de acuerdo y, si se elige, memos). Se descarga para Word o se crea como Google Doc.

### Corregido
- El resaltado de fragmentos en FARO quedaba trabado cuando la pestaña estaba en segundo plano.

## [1.3.0] — 2026-11-04

### Cambiado
- **Permiso por archivo**: la conexión con Google usa solo `drive.file` (no sensible). FARO ya no pide ver todos los Docs: cada persona le da acceso a cada Doc una vez, con el selector oficial de Google (`acceso.html`). Sin la verificación de permisos sensibles ni el tope de 100 personas.
- El Client ID debe incluir el número de proyecto; se suma la clave de API del selector (configurable o incorporada al empaquetar con `--clave-selector`).

### Agregado
- Aviso y botón «Dar acceso a FARO a este Doc» en el panel; el panel se actualiza solo al volver.
- Plantillas de GitHub para reportar problemas y proponer mejoras.

## [1.2.0] — 2026-11-04

### Agregado
- **Citar en la tesis**: pestaña en el panel de Docs que copia fragmentos de todo el proyecto como citas con fuente y fecha.
- **Saturación**: gráfico de códigos nuevos por material (menú «＋» de FARO).
- **Registro de decisiones**: historial automático del libro de códigos y notas propias; CSV y Google Doc.
- **Seudónimos** en citas, exportaciones e informes; aviso de nombres reales en Docs.
- **α de Krippendorff** para dos o más codificadoras y κ por pares.
- **Colores por código** elegibles, usados en FARO, Docs y el complemento.
- Panel de Docs **movible y minimizable**, **definición del código** al codificar y **atajos Alt+Shift+1…9**.

## [1.1.0] — 2026-11-04

### Agregado
- Códigos guardados **dentro del Google Doc** como rangos con nombre (`faro|<id>|<código>`): siguen al texto aunque se edite. «Sincronizar con el Doc» los trae a FARO.
- **Complemento de Google Docs** (Apps Script) para codificar seleccionando, sin copiar.
- **Acuerdo entre codificadoras**: κ de Cohen por código y material, acuerdo sobre lo codificado, desacuerdos con citas; CSV y Google Doc.
- Interfaz **en inglés** (según el idioma del navegador) y ficha de la tienda bilingüe (`_locales`).
- Lista de fragmentos codificados en el panel de Docs, con opción de quitarlos.
- Página de **bienvenida** al instalar.
- **Client ID de Google incorporable** al empaquetar (`--client-id`).
- **Política de privacidad** (castellano/inglés) con la declaración de *Limited Use* de Google.
- Pruebas automáticas (`npm test`), integración continua en GitHub Actions y `herramientas/empaquetar.py`.
- Metadatos de cita: `CITATION.cff`, `.zenodo.json`, borrador para JOSS.

## [1.0.2] — 2026-11-04
### Agregado
- Inicio de sesión con Google desde una pestaña (Firefox para Android).
### Cambiado
- Ventana de Google más clara.

## [1.0.1] — 2026-11-04
### Corregido
- Lectura del texto de Google Docs desde la extensión (el desvío a googleusercontent.com bloqueaba la lectura desde la página).

## [1.0.0] — 2026-11-04
### Agregado
- FARO completo como extensión; panel de FARO en Google Docs; Drive; captura web; bibliografía con verificación en CrossRef; versión para Firefox.
