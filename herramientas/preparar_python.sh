#!/usr/bin/env bash
# Arma src-tauri/recursos/python/ con un Python propio, IfcOpenShell, numpy y el
# núcleo de OPEN-RVT para la plataforma indicada.
#
# Uso: herramientas/preparar_python.sh <linux|windows>
#
# Las versiones y los SHA256 de los archivos base están fijados aquí. Los archivos
# descargados se guardan en la caché (~/.cache/openrvt-python) y se reutilizan.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLATAFORMA="${1:-}"
DESTINO="$RAIZ/src-tauri/recursos/python"
CACHE="${OPENRVT_CACHE:-$HOME/.cache/openrvt-python}"

# --- Versiones fijadas ---------------------------------------------------------
PYTHON_WINDOWS="3.12.9"
SHA_WINDOWS="615861fb801e8b04c847598db4e1e46e4b046295017caa37cb5486dde72b5865"
URL_WINDOWS="https://www.python.org/ftp/python/$PYTHON_WINDOWS/python-$PYTHON_WINDOWS-embed-amd64.zip"

PYTHON_LINUX="3.12.15"
PBS_TAG="20261021"
# Variante install_only_stripped: la install_only trae símbolos de depuración (65 MB
# frente a 33 MB) y `strip` del sistema corrompe estos binarios.
SHA_LINUX="6d7521138fd33afddc1ccd08abb007d9a2829e38117c2576f9efdc0ec73ce772"
URL_LINUX="https://github.com/astral-sh/python-build-standalone/releases/download/$PBS_TAG/cpython-$PYTHON_LINUX%2B$PBS_TAG-x86_64-unknown-linux-gnu-install_only_stripped.tar.gz"

# Dependencias que importa de verdad el núcleo (IfcOpenShell + numpy + su cadena).
PAQUETES=(
  "ifcopenshell==0.9.0.post1"
  "numpy==2.5.4"
  "shapely==2.2.0"
  "isodate==0.7.2"
  "python-dateutil==3.0.0"
  "lark==1.3.1"
  "pyparsing==3.3.3"
  "typing-extensions==4.16.0"
  "six==1.17.0"
)

uso() {
  echo "uso: $0 <linux|windows>" >&2
  exit 2
}

[[ "$PLATAFORMA" == "linux" || "$PLATAFORMA" == "windows" ]] || uso

mkdir -p "$CACHE"

bajar() {
  local url="$1" archivo="$2" sha="$3"
  if [[ -f "$CACHE/$archivo" && "$(sha256sum "$CACHE/$archivo" | cut -d' ' -f1)" == "$sha" ]]; then
    echo "caché: $archivo"
    return
  fi
  echo "bajando: $url"
  curl -fL --retry 3 --retry-delay 2 -o "$CACHE/$archivo.tmp" "$url"
  local real
  real="$(sha256sum "$CACHE/$archivo.tmp" | cut -d' ' -f1)"
  if [[ "$real" != "$sha" ]]; then
    rm -f "$CACHE/$archivo.tmp"
    echo "SHA256 no coincide para $archivo: esperado $sha, obtenido $real" >&2
    exit 1
  fi
  mv "$CACHE/$archivo.tmp" "$CACHE/$archivo"
}

peso() {
  du -sh "$1" | cut -f1
}

peso_comprimido() {
  tar -C "$(dirname "$1")" -czf - "$(basename "$1")" | wc -c | awk '{printf "%.1f MiB", $1/1048576}'
}

recortar() {
  local destino="$1"
  find "$destino" -type d -name __pycache__ -prune -exec rm -rf {} +
  find "$destino" -type f \( -name '*.pyc' -o -name '*.pyo' \) -delete
  find "$destino" -type d -name tests -prune -exec rm -rf {} +
  find "$destino" -type d \( -name idlelib -o -name tkinter -o -name ensurepip \) -prune -exec rm -rf {} +
  find "$destino" -type d -name 'test' -prune -exec rm -rf {} + 2>/dev/null || true
  find "$destino" -type d -name '*.dist-info' -prune -exec rm -rf {} +
  rm -rf "$destino/tzdata" 2>/dev/null || true
}

# IfcOpenShell trae conectores de formatos que el núcleo no usa (Collada, IGES, OBJ,
# glTF, SVG, TTL) y núcleos de geometría alternativos. El núcleo solo lee/escribe IFC
# y tesela con OpenCASCADE; se conservan esos conectores y esquemas.
recortar_ifcopenshell() {
  local sp="$1"
  local ifc="$sp/ifcopenshell"
  [[ -d "$ifc" ]] || return 0
  rm -f "$ifc"/ifcopenshell_geometry_dae.so "$ifc"/ifcopenshell_geometry_glb.so
  rm -f "$ifc"/ifcopenshell_geometry_igs.so "$ifc"/ifcopenshell_geometry_obj.so
  rm -f "$ifc"/ifcopenshell_geometry_stp.so "$ifc"/ifcopenshell_geometry_svg.so
  rm -f "$ifc"/ifcopenshell_geometry_svgfill.so "$ifc"/ifcopenshell_geometry_ttl.so
  rm -f "$ifc"/ifcopenshell_geometry_kernel_cgal.so
  rm -f "$ifc"/ifcopenshell_geometry_kernel_cgalsimple.so
  rm -f "$ifc"/ifcopenshell_geometry_kernel_manifold.so
  rm -f "$ifc"/ifcopenshell_geometry_kernel_passthrough.so
  rm -f "$ifc"/ifcopenshell_document_json_*.so "$ifc"/ifcopenshell_document_xml_*.so
  rm -f "$ifc"/ifcopenshell_geometry_writer_*.so
  rm -f "$ifc"/ifcopenshell_geometry_tree_opencascade_*.so
  rm -f "$ifc"/libOpenCOLLADA*.so "$ifc"/libGeneratedSaxParser.so
  rm -f "$ifc"/libMathMLSolver.so "$ifc"/libUTF.so
  rm -f "$ifc"/libTKDEIGES.so.* "$ifc"/libTKV3d.so.* "$ifc"/libTKHLR.so.*
  rm -f "$ifc"/libTKVCAF.so.* "$ifc"/libTKLCAF.so.* "$ifc"/libTKCAF.so.*
  rm -f "$ifc"/libTKXCAF.so.* "$ifc"/libwgpu_native.so "$ifc"/libmanifold.so.*
}

# Recorte de la instalación completa de Linux: quita lo que no usa el núcleo.
recortar_linux() {
  local destino="$1"
  recortar "$destino"
  rm -rf "$destino/include" "$destino/share"
  rm -rf "$destino/lib/python3.12/config-3.12-x86_64-linux-gnu"
  rm -rf "$destino/lib/python3.12/lib2to3" "$destino/lib/python3.12/pydoc_data"
  rm -rf "$destino"/lib/tcl* "$destino"/lib/tk* "$destino"/lib/itcl* "$destino"/lib/thread*
  rm -f "$destino"/lib/libtcl* "$destino"/lib/libtk*
  rm -f "$destino"/lib/python3.12/lib-dynload/_tkinter*
  rm -rf "$destino/lib/python3.12/site-packages/pip" "$destino"/lib/python3.12/site-packages/pip-*.dist-info
  rm -f "$destino"/bin/2to3* "$destino"/bin/idle* "$destino"/bin/pydoc* "$destino"/*-config
  rm -f "$destino"/bin/pip "$destino"/bin/pip3 "$destino"/bin/pip3.12
  # El ejecutable de python-build-standalone es autónomo: libpython no se usa y,
  # además, sus enlaces simbólicos harían que Tauri duplicara 30 MB en el .deb.
  rm -f "$destino"/lib/libpython3*.so* "$destino"/lib/libpython3.so
  rm -rf "$destino/lib/pkgconfig"
  find "$destino" -type l -delete
  # Los .so de las ruedas sí se pueden pelar; el ejecutable y libpython del
  # python-build-standalone no (su `strip` pierde las versiones de símbolos).
  find "$destino/lib/python3.12/site-packages" -type f -name '*.so*' \
    -exec strip --strip-unneeded {} + 2>/dev/null || true
}

copiar_nucleo() {
  local destino="$1"
  rm -rf "$destino/nucleo"
  mkdir -p "$destino/nucleo"
  cp -a "$RAIZ/nucleo/openrvt_nucleo" "$destino/nucleo/"
  find "$destino/nucleo" -type d -name __pycache__ -prune -exec rm -rf {} +
}

case "$PLATAFORMA" in
  windows)
    ARCHIVO="python-$PYTHON_WINDOWS-embed-amd64.zip"
    bajar "$URL_WINDOWS" "$ARCHIVO" "$SHA_WINDOWS"
    rm -rf "$DESTINO"
    mkdir -p "$DESTINO"
    echo "descomprimiendo $ARCHIVO"
    unzip -q "$CACHE/$ARCHIVO" -d "$DESTINO"

    PTH="$DESTINO/python312._pth"
    [[ -f "$PTH" ]] || { echo "falta python312._pth" >&2; exit 1; }
    # Descomenta «import site», agrega site-packages y la carpeta del núcleo.
    sed -i 's/\r$//' "$PTH"
    sed -i 's/^#import site/import site/' "$PTH"
    grep -qx 'import site' "$PTH" || echo 'import site' >> "$PTH"
    grep -qx 'Lib\\site-packages' "$PTH" || echo 'Lib\site-packages' >> "$PTH"
    grep -qx 'nucleo' "$PTH" || echo 'nucleo' >> "$PTH"

    RUEDAS="$CACHE/ruedas-windows-$PYTHON_WINDOWS"
    mkdir -p "$RUEDAS"
    rm -f "$RUEDAS"/*.whl
    echo "descargando ruedas win_amd64 cp$PYTHON_WINDOWS"
    python3 -m pip download -q --dest "$RUEDAS" \
      --platform win_amd64 --python-version 3.12 --implementation cp --abi cp312 \
      --only-binary=:all: --no-deps "${PAQUETES[@]}"

    mkdir -p "$DESTINO/Lib/site-packages"
    for rueda in "$RUEDAS"/*.whl; do
      echo "  $(basename "$rueda")"
      unzip -q -o "$rueda" -d "$DESTINO/Lib/site-packages"
    done
    copiar_nucleo "$DESTINO"
    recortar "$DESTINO/Lib/site-packages"
    recortar_ifcopenshell "$DESTINO/Lib/site-packages"
    ;;

  linux)
    ARCHIVO="pbs-$PYTHON_LINUX-$PBS_TAG.tar.gz"
    bajar "$URL_LINUX" "$ARCHIVO" "$SHA_LINUX"
    rm -rf "$DESTINO"
    mkdir -p "$DESTINO"
    echo "descomprimiendo $ARCHIVO"
    tar -xzf "$CACHE/$ARCHIVO" -C "$DESTINO" --strip-components=1

    SITEPKG="$DESTINO/lib/python3.12/site-packages"
    mkdir -p "$SITEPKG"
    echo "instalando paquetes en $SITEPKG"
    "$DESTINO/bin/python3" -m pip install -q --no-cache-dir --no-compile \
      --target "$SITEPKG" "${PAQUETES[@]}"

    copiar_nucleo "$DESTINO"
    # Ruta relativa: funciona aunque la app se instale en otra carpeta.
    printf '../../../nucleo\n' > "$SITEPKG/openrvt-nucleo.pth"
    recortar_linux "$DESTINO"
    recortar_ifcopenshell "$SITEPKG"
    ;;

esac

echo
echo "Python ($PLATAFORMA): $(peso "$DESTINO") suelto, $(peso_comprimido "$DESTINO") comprimido"
echo "  $DESTINO"

if [[ "$PLATAFORMA" == "linux" ]]; then
  "$DESTINO/bin/python3.12" -c 'import ifcopenshell, numpy, openrvt_nucleo; print("import ok:", ifcopenshell.version, numpy.__version__)'
fi
