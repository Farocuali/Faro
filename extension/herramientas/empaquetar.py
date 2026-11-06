#!/usr/bin/env python3
"""
Arma los paquetes de FARO a partir del código fuente.

Uso:
  python3 herramientas/empaquetar.py                      # sin Client ID incorporado
  python3 herramientas/empaquetar.py --client-id 123456789-xxx.apps.googleusercontent.com --clave-selector AIza...

Genera en dist/:
  chrome/                      carpeta lista para «Cargar descomprimida» (ID fijo de desarrollo)
  faro-chrome-dev.zip          esa misma carpeta, comprimida
  faro-chrome-web-store.zip    para la Chrome Web Store (sin la clave de desarrollo)
  faro-firefox.xpi             para Firefox (escritorio y Android; hay que firmarlo en addons.mozilla.org)
"""
import argparse, json, re, shutil, zipfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DIST = RAIZ / "dist"

# Qué entra en la extensión (lista explícita: nada de tests, herramientas ni node_modules).
INCLUIR = ["*.js", "*.html", "*.css", "icons/*.png", "lib/*", "_locales/*/messages.json", "LICENSE"]
EXCLUIR = {"package.json", "package-lock.json"}


def archivos():
    vistos = set()
    for patron in INCLUIR:
        for f in sorted(RAIZ.glob(patron)):
            if f.is_file() and f.name not in EXCLUIR and f not in vistos:
                vistos.add(f)
                yield f


def manifest_firefox(m):
    m = json.loads(json.dumps(m))
    m.pop("key", None)
    m.pop("side_panel", None)
    m["permissions"] = [p for p in m["permissions"] if p not in ("sidePanel", "offscreen")]
    m["background"] = {"scripts": ["config.js", "i18n.js", "faro-ops.js", "google.js", "background.js"]}
    m["sidebar_action"] = {"default_panel": "sidepanel.html", "default_title": "FARO",
                           "default_icon": {"16": "icons/icon16.png", "32": "icons/icon32.png"}, "open_at_install": False}
    m["browser_specific_settings"] = {
        "gecko": {"id": "faro@farocuali.github.io", "strict_min_version": "128.0",
                  "data_collection_permissions": {"required": ["websiteContent", "authenticationInfo", "personallyIdentifyingInfo", "personalCommunications"]}},
        "gecko_android": {"strict_min_version": "128.0"},
    }
    return m


def comprimir(destino, contenidos):
    with zipfile.ZipFile(destino, "w", zipfile.ZIP_DEFLATED) as z:
        for nombre, datos in contenidos:
            z.writestr(nombre, datos)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--client-id", default="", help="Client ID de Google para incorporar (opcional)")
    ap.add_argument("--clave-selector", default="", help="Clave de API del selector de Google (Picker) para incorporar")
    args = ap.parse_args()
    if args.client_id and not re.fullmatch(r"\d+-[\w.-]+\.apps\.googleusercontent\.com", args.client_id):
        raise SystemExit("El Client ID tiene la forma 123456789-xxx.apps.googleusercontent.com")
    if args.clave_selector and not re.fullmatch(r"AIza[\w-]{20,}", args.clave_selector):
        raise SystemExit("La clave del selector empieza con AIza")
    if bool(args.client_id) != bool(args.clave_selector):
        raise SystemExit("--client-id y --clave-selector van juntos (son del mismo proyecto de Google Cloud)")

    manifest = json.loads((RAIZ / "manifest.json").read_text(encoding="utf-8"))
    config = (f'// Generado por herramientas/empaquetar.py\nself.FARO_CONFIG = {{ clientIdPredeterminado: {json.dumps(args.client_id)}, '
              f'claveSelectorPredeterminada: {json.dumps(args.clave_selector)} }};\n')

    contenidos = []
    for f in archivos():
        rel = f.relative_to(RAIZ).as_posix()
        if rel in ("manifest.json",):
            continue
        datos = config.encode() if rel == "config.js" else f.read_bytes()
        contenidos.append((rel, datos))

    if DIST.exists():
        shutil.rmtree(DIST)
    (DIST / "chrome").mkdir(parents=True)

    dev = [("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")] + contenidos
    for nombre, datos in dev:
        destino = DIST / "chrome" / nombre
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_bytes(datos.encode() if isinstance(datos, str) else datos)
    comprimir(DIST / "faro-chrome-dev.zip", [("faro/" + n, d) for n, d in dev])

    tienda = dict(manifest)
    tienda.pop("key", None)
    comprimir(DIST / "faro-chrome-web-store.zip", [("manifest.json", json.dumps(tienda, ensure_ascii=False, indent=2) + "\n")] + contenidos)

    ff = [("manifest.json", json.dumps(manifest_firefox(manifest), ensure_ascii=False, indent=2) + "\n")]
    ff += [(n, d) for n, d in contenidos if n not in ("offscreen.html", "offscreen.js")]
    comprimir(DIST / "faro-firefox.xpi", ff)

    print(f"FARO {manifest['version']} · {len(contenidos) + 1} archivos · Client ID incorporado: {'sí' if args.client_id else 'no'}")
    for f in sorted(DIST.glob("*.*")):
        print(f"  dist/{f.name:28} {f.stat().st_size // 1024:>6} KB")


if __name__ == "__main__":
    main()
