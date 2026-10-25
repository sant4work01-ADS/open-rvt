#!/usr/bin/env bash
# Descarga las muestras IFC de la evaluación O001. Es idempotente: no vuelve
# a bajar un archivo que ya existe y tiene contenido.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESTINO="$RAIZ/muestras"
mkdir -p "$DESTINO"

# nombre|url
MUESTRAS=(
  "AC20-FZK-Haus.ifc|https://www.ifcwiki.org/images/e/e3/AC20-FZK-Haus.ifc"
  "AC20-Institute-Var-2.ifc|https://www.ifcwiki.org/images/9/98/AC20-Institute-Var-2.ifc"
  "IFC2X3-Building-Architecture.ifc|https://raw.githubusercontent.com/buildingSMART/Sample-Test-Files/main/IFC%202.3.0.1%20(IFC%202x3%20TC1)/Simple-Scene/Building-Architecture.ifc"
)

for item in "${MUESTRAS[@]}"; do
  nombre="${item%%|*}"
  url="${item#*|}"
  salida="$DESTINO/$nombre"
  if [[ -s "$salida" ]]; then
    echo "ya existe: $nombre ($(stat -c%s "$salida") bytes)"
    continue
  fi
  echo "bajando: $nombre"
  curl -fL --retry 3 --retry-delay 2 -o "$salida.tmp" "$url"
  mv "$salida.tmp" "$salida"
  echo "listo: $nombre ($(stat -c%s "$salida") bytes)"
done

echo
sha256sum "$DESTINO"/*.ifc
