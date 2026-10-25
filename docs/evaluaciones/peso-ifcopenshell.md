# Peso de IfcOpenShell en Windows (medido el 2026-10-24)

Se midió IfcOpenShell 0.9.0.post1 para Python 3.12 en win_amd64, con todas sus dependencias, más el Python 3.12.10 embebido.

| Parte | Instalado | Comprimido (xz, parecido al LZMA de NSIS) |
|---|---|---|
| IfcOpenShell (OCCT, parsers de esquema, util, express) | 125 MB | — |
| numpy (con sus libs) | 43 MB | — |
| Demás dependencias (shapely, lark, etc.) | ~9 MB | — |
| Python embebido | 22 MB | — |
| **Total** | **~200 MB** | **~45 MB** |

Como referencia, el instalador de PresupuestosPro 0.13.18 pesa 22 MB.

## Qué se puede recortar (sin probar todavía)
- Los parsers de esquemas que no se usan: dejar IFC4 e IFC2X3 y quitar las variantes de IFC4X3.
- shapely, si no se usa.
- `express/`, que solo sirve para generar esquemas.

Se estima que el total baja a unos 150 MB instalados y unos 35 MB en el instalador.
