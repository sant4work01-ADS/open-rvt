# O004 — Python embebido en los instaladores

## Objetivo
Que el usuario instale OPEN-RVT en **otra máquina limpia** (Windows o Linux, sin Python) y pueda modelar. Para eso el instalador lleva su propio Python con el núcleo, IfcOpenShell y numpy, en `recursos/python/` junto al ejecutable. `nucleo.rs` ya lo busca ahí (ver `python_embebido`).

## Parte 1: script `herramientas/preparar_python.sh <linux|windows>`
Arma `src-tauri/recursos/python/` (ignorada por git) para la plataforma indicada.

### Windows
1. Baja el **embeddable zip** oficial de Python 3.12 x64 de python.org. Fija la versión y su SHA256 en el script.
2. Descomprímelo.
3. Edita `python312._pth`: descomenta `import site` y agrega `Lib\site-packages` y la ruta del núcleo.
4. Baja con `pip download --platform win_amd64 --python-version 3.12 --only-binary=:all: --no-deps` los wheels de `ifcopenshell==0.9.0.post1` y `numpy`, más las dependencias que de verdad importe el núcleo (compruébalo).
5. Descomprime los wheels en `Lib/site-packages`.
6. Copia `nucleo/openrvt_nucleo`.

### Linux
1. Usa **python-build-standalone** (astral-sh), con la variante `cpython-3.12.*-x86_64-unknown-linux-gnu-install_only`. Fija la versión y su SHA256.
2. `pip install --target` de los mismos paquetes.
3. Copia el núcleo.

### Peso
- **Recorta:** `__pycache__`, `tests/`, `idlelib`, `tkinter` y `ensurepip` donde exista.
- Anota el peso final de cada plataforma. Meta: menos de 80 MB comprimido en el instalador.

## Parte 2: empaquetado Tauri
- `tauri.conf.json` → `bundle.resources` mapea `recursos/python/` a `recursos/python/` junto al ejecutable, en ambas plataformas.
  - Comprueba la ruta real donde Tauri deja los recursos: en .deb va en `/usr/lib/<app>/`.
  - Si no coincide con `ejecutable/recursos/python`, ajusta `python_embebido` en `nucleo.rs` para usar `app.path().resource_dir()`, con una prueba.
- **Windows:** el núcleo arranca **sin abrir una consola**. Usa `pythonw.exe` o el flag `CREATE_NO_WINDOW` en el `Command`.
- **Versión 0.2.0** en `package.json`, `Cargo.toml`, `tauri.conf.json` y `Cargo.lock`.

## Parte 3: construir y probar
- **Construye:**
  - Linux: `npx tauri build --bundles deb`;
  - Windows: `npx tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc --bundles nsis`, como en O002.
- **Prueba Linux en limpio:** instala el .deb en un contenedor o chroot sin Python del sistema, con `OPENRVT_PYTHON` sin definir. Si no hay contenedor, extrae el .deb con `dpkg-deb -x` y ejecuta el binario con `PATH` sin python3.
  - Comprueba con el E2E (o un script) que `nucleo.ping` responde y que se puede crear un proyecto y un muro y guardarlo.
- **Prueba Windows:**
  - extrae el setup (o instálalo en silencio con `/S` en una carpeta de Windows desde WSL);
  - ejecuta directamente el `python.exe` embebido con `-c "import ifcopenshell, openrvt_nucleo; print(ifcopenshell.version)"`;
  - luego ejecuta un intercambio JSON-RPC de `proyecto.nuevo` → `muros.crear` → `proyecto.guardar` contra ese Python, por stdin.
- **Copia final:** deja los instaladores en `instaladores/` (reemplaza los 0.1.0).

## Entrega
- `docs/progreso/O004.md` con la etiqueta «LISTA PARA REVISIÓN»: pesos (Python suelto, instalador .deb y .exe), salidas de las pruebas y desviaciones.
- Commits en español. No hagas push.

## No hagas
- No cambies la interfaz ni el núcleo, salvo lo de arranque descrito arriba.
- No uses PyInstaller ni conda.
