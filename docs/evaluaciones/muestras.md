# Muestras de la evaluación O001

Descargadas con `herramientas/bajar_muestras.sh` (idempotente) en `muestras/`, que **no se
versiona**. Fecha de descarga: 2026-10-24.

| Archivo | Tamaño | Esquema | Origen | Licencia |
|---|---:|---|---|---|
| `AC20-FZK-Haus.ifc` | 2 570 803 B (2.45 MiB) | IFC4 | [KIT IFC Examples](https://www.ifcwiki.org/index.php?title=KIT_IFC_Examples) — vivienda ficticia de 2 niveles exportada con ArchiCAD 20.<br>`https://www.ifcwiki.org/images/e/e3/AC20-FZK-Haus.ifc` | Uso libre («unrestricted use») del IAI/KIT; se pide citar a Institute for Automation and Applied Informatics (IAI) / Karlsruhe Institute of Technology (KIT) si se usa en publicaciones. |
| `AC20-Institute-Var-2.ifc` | 10 934 237 B (10.43 MiB) | IFC4 | [KIT IFC Examples](https://www.ifcwiki.org/index.php?title=KIT_IFC_Examples) — «Office Building», edificio de oficinas ficticio exportado con ArchiCAD 20.<br>`https://www.ifcwiki.org/images/9/98/AC20-Institute-Var-2.ifc` | Igual que el anterior: uso libre del IAI/KIT con atribución en publicaciones. |
| `IFC2X3-Building-Architecture.ifc` | 92 542 B (90.4 KiB) | IFC2X3 TC1 | [buildingSMART/Sample-Test-Files](https://github.com/buildingSMART/Sample-Test-Files), `IFC 2.3.0.1 (IFC 2x3 TC1)/Simple-Scene/Building-Architecture.ifc`.<br>`https://raw.githubusercontent.com/buildingSMART/Sample-Test-Files/main/IFC%202.3.0.1%20(IFC%202x3%20TC1)/Simple-Scene/Building-Architecture.ifc` | CC BY 4.0 (LICENSE del repositorio, © buildingSMART International Ltd.). |

SHA-256:

```
70cc8ff245fc0894201d96496c031005a5cbd7a96b22d8a1b87c5a883fb77994  AC20-FZK-Haus.ifc
cfb2124497b25d9a72101075e84be0feb44ff669cb1bd3251be11efebeea945c  AC20-Institute-Var-2.ifc
c4db65ba847f6b369a95d6c54fa11f4750cbe6d59f021934e8923d8d578e5885  IFC2X3-Building-Architecture.ifc
```

## Nota sobre la muestra IFC4 mediana

La especificación pedía «un IFC4 de arquitectura mediano (oficinas o escuela) del mismo repo
[buildingSMART/Sample-Test-Files]: el más grande que pese menos de 50 MB». En la rama `main` de ese
repositorio el único IFC4 de arquitectura es `IFC 4.0.2.1 (IFC 4 ADD2 TC1)/Simple-Scene/
Building-Architecture.ifc`, de solo 142 325 B (unos 8 elementos), y no hay ningún modelo de oficinas
o escuela. Por eso se usó el «Office Building» (10.43 MiB, IFC4) del repositorio público de ejemplos
del KIT, que sí cumple el tipo, el tamaño y el esquema pedidos. El IFC2X3 sí se tomó del repositorio
de buildingSMART.

## Cómo se midió

- Apertura: tiempo de `OpenModel` / `ifcopenshell.open`.
- Teselado: recorrido completo de `StreamAllMeshes` (web-ifc) o `ifcopenshell.geom.iterator` con
  `USE_WORLD_COORDS` (IfcOpenShell).
- Los tiempos son la mediana de 3 corridas en procesos separados.
- Memoria: pico de RSS del proceso (`VmHWM` en Linux).
- Volumen de malla: teorema de la divergencia sobre los triángulos.
- Área en planta: unión rasterizada de los triángulos proyectados al plano XY, con scanline y
  resolución adaptativa (al menos 16 celdas en el lado menor, tope de 4 M de celdas).
- Malla cerrada: no hay aristas de borde (conteo impar). Se reporta aparte si es 2-variedad
  (`manifold`).
