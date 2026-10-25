#!/usr/bin/env bash
# Compara los archivos copiados de PresupuestosPro con su origen.
#
# Uso: herramientas/comparar-con-pp.sh [ruta-de-presupuestos-pro]
# Por omisión usa $PP_RUTA o /home/sant4/pp-trabajo/presupuestos-pro.
set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PP="${1:-${PP_RUTA:-/home/sant4/pp-trabajo/presupuestos-pro}}"
TABLA="$RAIZ/docs/origen-pp.md"
COMMIT="fd60cde"

if [ ! -d "$PP" ]; then
  echo "No existe la ruta de PresupuestosPro: $PP" >&2
  exit 2
fi
if [ ! -f "$TABLA" ]; then
  echo "No existe la tabla $TABLA" >&2
  exit 2
fi

identicos=0
adaptados=0
nuevos_pp=0
total=0

echo "Comparando contra $PP ($(git -C "$PP" rev-parse --short HEAD 2>/dev/null || echo 'sin git'))"
echo "Commit de origen: $COMMIT"
echo

# Cada fila de la tabla: | `archivo` | `archivo pp` | estado | motivo |
while IFS= read -r linea; do
  [ "${linea#| \`}" = "$linea" ] && continue
  propio=$(printf '%s' "$linea" | awk -F'|' '{print $2}' | tr -d '`' | xargs)
  origen=$(printf '%s' "$linea" | awk -F'|' '{print $3}' | tr -d '`' | xargs)
  [ -z "$propio" ] || [ -z "$origen" ] && continue

  total=$((total + 1))
  a="$RAIZ/$propio"
  b="$PP/$origen"

  echo "=== $propio  <-  $origen"
  if [ ! -e "$b" ]; then
    echo "  (no existe en PP)"
  elif diff -rq "$b" "$a" >/dev/null 2>&1; then
    identicos=$((identicos + 1))
  else
    adaptados=$((adaptados + 1))
    diff -ru "$b" "$a" || true
  fi

  # ¿PP cambió este archivo después del commit de origen?
  if [ -d "$PP/.git" ] || git -C "$PP" rev-parse --git-dir >/dev/null 2>&1; then
    if ! git -C "$PP" diff --quiet "$COMMIT" -- "$origen" 2>/dev/null; then
      nuevos_pp=$((nuevos_pp + 1))
      echo "  [PP cambió este archivo desde $COMMIT]"
    fi
  fi
  echo
done < <(grep '^| `' "$TABLA")

echo "──────────────────────────────────────────────────────────────"
echo "Resumen de $total archivos copiados:"
echo "  idénticos a PP:                 $identicos"
echo "  adaptados:                      $adaptados"
echo "  con cambios nuevos en PP desde $COMMIT: $nuevos_pp"
if [ "$nuevos_pp" -gt 0 ]; then
  echo "  (revisa los avisos «PP cambió este archivo» de arriba al sincronizar)"
fi
