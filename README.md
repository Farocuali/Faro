<p align="center"><img src="extension/icons/icon128.png" alt="FARO" width="96"></p>

# FARO · Fichero Analítico de Registro y Observación

[![Pruebas](https://github.com/farocuali/Faro/actions/workflows/pruebas.yml/badge.svg)](https://github.com/farocuali/Faro/actions/workflows/pruebas.yml)
[![Licencia: MIT](https://img.shields.io/badge/licencia-MIT-1f3a5f.svg)](LICENSE)
<!-- Cuando Zenodo asigne el DOI, agregá acá el badge que te da Zenodo. -->

**[Español](#español) · [English](#english)**

## Español

FARO es una herramienta gratuita de **investigación cualitativa y etnográfica** que funciona entera en el navegador: sin servidores, sin cuentas, sin instalar nada.

- **Usarlo ya:** https://farocuali.github.io/Faro/
- **Extensión de navegador y complemento de Google Docs** (codificar dentro de tus Docs, captura web, acuerdo entre codificadoras): ver [`extension/`](extension/README.md).

### Qué hay en este repositorio

| Archivo / carpeta | Qué es |
|---|---|
| `index.html` | FARO web (lo que se ve en farocuali.github.io/Faro) |
| `privacidad.html` | Política de privacidad (la pide Google) |
| `acceso.html` | Página con el selector de Google para darle acceso a FARO a un Doc (la usa la extensión) |
| `extension/` | Código de la extensión, del complemento de Docs, pruebas y documentación |
| `CITATION.cff`, `.zenodo.json` | Cómo citar FARO y datos para el DOI de Zenodo |

Cuando cambia `index.html`, hay que actualizar la copia que lleva la extensión: `python3 extension/herramientas/importar-faro.py index.html`.

### Cómo citar

Gueler, M. y Wegman, R. (2026). *FARO: Fichero Analítico de Registro y Observación* (versión 1.4.0) [Software]. https://github.com/farocuali/Faro

## English

FARO is a free tool for **qualitative and ethnographic research** that runs entirely in the browser: no servers, no accounts, nothing to install.

- **Use it now:** https://farocuali.github.io/Faro/
- **Browser extension and Google Docs add-on** (code inside your Docs, web capture, inter-coder agreement): see [`extension/`](extension/README.md).

`index.html` is FARO web; `privacidad.html` is the privacy policy; `acceso.html` is the Google picker page used by the extension; `extension/` holds the extension, the add-on, tests and docs. See [`CITATION.cff`](CITATION.cff) to cite FARO.
