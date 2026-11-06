#!/usr/bin/env python3
"""
Importa FARO web (el index.html de https://github.com/farocuali/Faro) a la extensión.

Uso:   python3 herramientas/importar-faro.py ruta/al/index.html

Genera, en la carpeta de la extensión:
  faro.html      — el HTML de FARO, sin scripts en línea y con una política de seguridad apta para extensiones
  faro-libs.js   — carga Cytoscape, Mammoth y PDF.js desde lib/ (las extensiones no pueden cargar código remoto)
  faro-app.js    — el código de FARO, tal cual, con un único ajuste (la ventana de impresión)

Volvé a correrlo cada vez que se actualice FARO web.
"""
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent


def falla(msg):
    sys.exit(f"ERROR: {msg}\nEl formato de index.html cambió: revisá este script.")


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    html = Path(sys.argv[1]).read_text(encoding="utf-8")

    bloques = list(re.finditer(r"<script>(.*?)</script>", html, re.S))
    if len(bloques) != 2:
        falla(f"esperaba 2 bloques <script>, encontré {len(bloques)}")
    libs, app = bloques
    if "FARO_LIBS" not in libs.group(1) or "function ensureLib" not in libs.group(1):
        falla("el primer <script> ya no es el cargador de librerías")

    codigo = app.group(1)

    # 1) Ventana de impresión: usa un onclick y un <script> en línea, que la política de la extensión bloquea.
    viejo_boton = '<button onclick="window.print()"'
    viejo_script = "<scr`+`ipt>setTimeout(function(){window.print();},400);</scr`+`ipt>"
    viejo_cierre = "  w.document.close();\n}"
    for pieza in (viejo_boton, viejo_script, viejo_cierre):
        if codigo.count(pieza) != 1:
            falla(f"no encontré exactamente una vez: {pieza[:50]}")
    codigo = codigo.replace(viejo_boton, '<button id="faro-imprimir"')
    codigo = codigo.replace(viejo_script, "")
    codigo = codigo.replace(
        viejo_cierre,
        "  w.document.close();\n"
        "  // [extensión] sin JS en línea: el botón y la impresión automática se conectan desde acá.\n"
        "  try{ const b=w.document.getElementById(\"faro-imprimir\"); if(b) b.addEventListener(\"click\",()=>w.print()); }catch(e){}\n"
        "  setTimeout(()=>{ try{ w.print(); }catch(e){} },400);\n"
        "}",
    )

    if re.search(r"\son(click|change|input|keydown|keyup|submit|load|error)=", codigo):
        falla("quedó un manejador de eventos en línea")

    # 2) Política de seguridad: misma lista de servicios que FARO web, más Google Docs/Drive,
    #    y scripts solo desde la propia extensión.
    m = re.search(r'<meta http-equiv="Content-Security-Policy" content="([^"]+)"\s*/?>', html)
    if not m:
        falla("no encontré la meta de Content-Security-Policy")
    connect = re.search(r"connect-src ([^;]+);", m.group(1))
    if not connect:
        falla("no encontré connect-src")
    servicios = [s for s in connect.group(1).split() if "cdn.jsdelivr.net" not in s]
    for extra in ("https://docs.googleapis.com", "https://www.googleapis.com", "https://oauth2.googleapis.com"):
        if extra not in servicios:
            servicios.append(extra)
    csp = (
        "default-src 'none'; script-src 'self'; worker-src 'self'; style-src 'unsafe-inline'; "
        "font-src data:; img-src data: blob:; media-src blob:; "
        f"connect-src 'self' {' '.join(servicios)}; "
        "object-src 'none'; base-uri 'none'; form-action 'none'"
    )

    nuevo = html[: libs.start()] + '<script src="faro-libs.js"></script>' + html[libs.end(): app.start()]
    nuevo += '<script src="faro-app.js"></script>\n<script src="i18n.js"></script>\n<script src="faro-ops.js"></script>\n<script src="acuerdo.js"></script>\n<script src="faro-ext.js"></script>\n<script src="faro-herramientas.js"></script>'
    nuevo += html[app.end():]
    nuevo = nuevo.replace(m.group(0), f'<meta http-equiv="Content-Security-Policy" content="{csp}"/>')
    if "<script>" in nuevo:
        falla("quedó un <script> en línea en el HTML")

    # 3) Prompts de «Recomendar bibliografía» (ES y EN), para el panel lateral.
    import json
    prompts = {}
    for idioma in ("ES", "EN"):
        mp = re.search(r"const RECOMENDAR_SYSTEM_" + idioma + r" = `([\s\S]*?)`;", codigo)
        if not mp or "${" in mp.group(1):
            falla(f"no encontré RECOMENDAR_SYSTEM_{idioma}")
        prompts[idioma] = mp.group(1)
    mg = re.search(r'if\(useGround\) system\+=L\("((?:[^"\\]|\\.)*)","((?:[^"\\]|\\.)*)"\)', codigo)
    if not mg:
        falla("no encontré el agregado de búsqueda web (useGround)")
    ground = {"ES": json.loads('"' + mg.group(1) + '"'), "EN": json.loads('"' + mg.group(2) + '"')}
    salida = ["// Generado por herramientas/importar-faro.py: copia textual de los prompts de FARO web. No editar a mano.\n"]
    for idioma in ("ES", "EN"):
        salida.append(f"const RECOMENDAR_SYSTEM_{idioma} = {json.dumps(prompts[idioma], ensure_ascii=False)};\n")
        salida.append(f"const RECOMENDAR_GROUNDING_{idioma} = {json.dumps(ground[idioma], ensure_ascii=False)};\n")
    (RAIZ / "prompts.js").write_text("\n".join(salida), encoding="utf-8")

    (RAIZ / "faro.html").write_text(nuevo, encoding="utf-8")
    (RAIZ / "faro-app.js").write_text(
        "// Generado por herramientas/importar-faro.py a partir de FARO web. No editar a mano.\n" + codigo,
        encoding="utf-8",
    )
    print(f"OK  faro.html ({len(nuevo)//1024} KB) y faro-app.js ({len(codigo)//1024} KB)")


if __name__ == "__main__":
    main()
