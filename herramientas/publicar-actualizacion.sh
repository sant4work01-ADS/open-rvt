#!/bin/bash
# Uso: herramientas/publicar-actualizacion.sh "<notas>"
# Compila el instalador de Windows en local (nativo en Windows), firmado con la llave del
# updater de OPEN-RVT, lo sube como release al canal de actualizaciones en Gitea y
# actualiza latest.json. La versión sale de src-tauri/tauri.conf.json del repositorio;
# súbela y haz commit antes. La primera publicación la hace el supervisor.
set -euo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NOTAS="${1:?uso: publicar-actualizacion.sh \"<notas>\"}"
# Directo por Tailscale: por Cloudflare las subidas largas fallan con 524.
GITEA=${GITEA_API:-http://100.90.19.93:3000/api/v1}; REPO=sant4/openrvt-actualizaciones
T=$(cat ~/.gitea-pp-token); UA="Mozilla/5.0 (OPEN-RVT-publicar)"
api() { curl -sf -A "$UA" -H "Authorization: token $T" "$@"; }

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
[ -f "$SIG" ] || { echo "No se generó la firma $SIG"; exit 1; }
NOMBRE=OPEN-RVT_${V}_x64-setup.exe

echo "== Release v$V en Gitea"
api -X DELETE "$GITEA/repos/$REPO/releases/tags/v$V" >/dev/null 2>&1 || true
api -X DELETE "$GITEA/repos/$REPO/tags/v$V" >/dev/null 2>&1 || true
RID=$(api -X POST -H "Content-Type: application/json" "$GITEA/repos/$REPO/releases" \
  -d "$(python3 -c 'import json,sys; print(json.dumps({"tag_name":"v"+sys.argv[1],"target_commitish":"main","name":"OPEN-RVT "+sys.argv[1],"body":sys.argv[2],"prerelease":False}))' "$V" "$NOTAS")" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
api -X POST -F "attachment=@$EXE;filename=$NOMBRE" "$GITEA/repos/$REPO/releases/$RID/assets?name=$NOMBRE" >/dev/null
URL=https://gitea.spm.lat/$REPO/releases/download/v$V/$NOMBRE

echo "== latest.json"
LATEST=$(python3 -c 'import json,sys,datetime
print(json.dumps({"version":sys.argv[1],"notes":sys.argv[2],
 "pub_date":datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
 "platforms":{"windows-x86_64":{"signature":open(sys.argv[3]).read().strip(),"url":sys.argv[4]}}},ensure_ascii=False,indent=2))' "$V" "$NOTAS" "$SIG" "$URL")
B64=$(printf '%s' "$LATEST" | base64 -w0)
SHA=$(api "$GITEA/repos/$REPO/contents/latest.json?ref=main" 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin)['sha'])" 2>/dev/null || true)
CUERPO=$(python3 -c 'import json,sys; d={"content":sys.argv[1],"message":"latest.json → "+sys.argv[2],"branch":"main"}
if sys.argv[3]: d["sha"]=sys.argv[3]
print(json.dumps(d))' "$B64" "$V" "$SHA")
if [ -n "$SHA" ]; then api -X PUT -H "Content-Type: application/json" "$GITEA/repos/$REPO/contents/latest.json" -d "$CUERPO" >/dev/null
else api -X POST -H "Content-Type: application/json" "$GITEA/repos/$REPO/contents/latest.json" -d "$CUERPO" >/dev/null; fi
curl -sf -A "$UA" https://gitea.spm.lat/$REPO/raw/branch/main/latest.json | python3 -c "import json,sys; d=json.load(sys.stdin); print('publicado', d['version'], d['platforms']['windows-x86_64']['url'])"
echo "Instalador: $URL"
