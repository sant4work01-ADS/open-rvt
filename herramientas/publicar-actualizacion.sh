#!/bin/bash
# Uso: herramientas/publicar-actualizacion.sh "<notas>"
# Compila el instalador de Windows en local (nativo en Windows), firmado con la llave del
# updater de OPEN-RVT, lo sube como release del repositorio público de GitHub con
# latest.json como adjunto. La versión sale de src-tauri/tauri.conf.json del repositorio;
# súbela y haz commit antes. La primera publicación la hace el supervisor.
set -euo pipefail
export PYTHONUTF8=1 PYTHONIOENCODING=utf-8  # Windows: si no, python escribe latest.json en cp1252
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NOTAS="${1:?uso: publicar-actualizacion.sh \"<notas>\"}"
REPO=sant4work01-ADS/open-rvt; UA="Mozilla/5.0 (OPEN-RVT-publicar)"

cd "$RAIZ"
V=$(python3 -c "import json; print(json.load(open('src-tauri/tauri.conf.json'))['version'])")
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "El repositorio tiene cambios sin commitear"; exit 1; }

# Python embebido de Windows antes de compilar (O004).
herramientas/preparar_python.sh windows

echo "== Compilando $V (firmado)"
export CARGO_TARGET_DIR=$HOME/.cache/pp-target/openrvt-win PATH=$HOME/pp-trabajo/bin:$PATH
export TAURI_SIGNING_PRIVATE_KEY=$(cat ~/.tauri/openrvt-updater.key) TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
npx tauri build --target x86_64-pc-windows-msvc --bundles nsis > /tmp/openrvt-publicar.log 2>&1 || { tail -30 /tmp/openrvt-publicar.log; exit 1; }
D=$CARGO_TARGET_DIR/x86_64-pc-windows-msvc/release/bundle/nsis
EXE=$(ls -t "$D"/*"_${V}_"*setup.exe | head -1); SIG=$EXE.sig
command -v cygpath >/dev/null && { EXE=$(cygpath -m "$EXE"); SIG=$EXE.sig; }  # curl de Windows no entiende /c/...
[ -f "$SIG" ] || { echo "No se generó la firma $SIG"; exit 1; }
NOMBRE=OPEN-RVT_${V}_x64-setup.exe

URL=https://github.com/$REPO/releases/download/v$V/$NOMBRE
LATEST_URL=https://github.com/$REPO/releases/latest/download/latest.json

echo "== latest.json"
python3 -c 'import json,sys,datetime
open(sys.argv[5],"w",encoding="utf-8").write(json.dumps({"version":sys.argv[1],"notes":sys.argv[2],
 "pub_date":datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
 "platforms":{"windows-x86_64":{"signature":open(sys.argv[3]).read().strip(),"url":sys.argv[4]}}},ensure_ascii=False,indent=2))' "$V" "$NOTAS" "$SIG" "$URL" /tmp/latest.json

echo "== Release v$V en GitHub"
gh release delete "v$V" -R "$REPO" --yes --cleanup-tag >/dev/null 2>&1 || true
gh release create "v$V" -R "$REPO" --target main --latest --title "OPEN-RVT $V" --notes "$NOTAS"   "$EXE#$NOMBRE" "$SIG#$NOMBRE.sig" /tmp/latest.json

# Comprobación de lo que ve la app, sin credenciales: UTF-8, versión, firma y descarga.
curl -sfL -A "$UA" "$LATEST_URL" -o /tmp/openrvt-latest.json
python3 -c 'import json,sys; d=json.loads(open(sys.argv[1],"rb").read().decode("utf-8")); w=d["platforms"]["windows-x86_64"]
assert d["version"]==sys.argv[2], d["version"]; assert w["signature"]==open(sys.argv[3]).read().strip(), "firma distinta"' /tmp/openrvt-latest.json "$V" "$SIG"
[ "$(curl -s -o /dev/null -w '%{http_code}' -L -I -A "$UA" "$URL")" = 200 ] || { echo "El instalador no se descarga: $URL"; exit 1; }
echo "VERIFICADO $V"
echo "Instalador: $URL"
