# O001 — Comparar motores IFC: IfcOpenShell vs web-ifc

**LISTA PARA REVISIÓN**

Fecha: 2026-10-24 · Worktree `o001` · Sin interfaz, como pide la especificación.

Se midieron los dos motores sobre tres muestras reales: apertura, teselado, triángulos, memoria,
volumen de malla, área en planta y cantidades base. Todo el código, las muestras y los resultados
están en el repositorio; las muestras no se versionan.

## 1. Muestras

| Muestra | Tamaño | Esquema | Contenido | Origen / licencia |
|---|---:|---|---|---|
| `AC20-FZK-Haus.ifc` | 2.45 MiB | IFC4 | Vivienda ficticia de 2 niveles (KIT) | KIT/IAI, uso libre con atribución |
| `AC20-Institute-Var-2.ifc` | 10.43 MiB | IFC4 | Edificio de oficinas ficticio, mediano (KIT) | KIT/IAI, uso libre con atribución |
| `IFC2X3-Building-Architecture.ifc` | 90.4 KiB | IFC2X3 TC1 | Escena simple de arquitectura | buildingSMART, CC BY 4.0 |

Detalle de URL, SHA-256 y la nota sobre por qué el IFC4 mediano vino del KIT y no de
`buildingSMART/Sample-Test-Files`: [`muestras.md`](muestras.md).

Descarga idempotente: `./herramientas/bajar_muestras.sh`.

## 2. Tiempos, triángulos y memoria

Mediana de 3 corridas en procesos separados, Linux x86_64, 12 hilos. `Total = apertura + teselado +
extracción` (la extracción incluye cantidades y cálculo de volumen/área). Los triángulos son los de
todo el modelo teselado, no solo los de las clases objetivo.

| Muestra | Motor | Apertura (s) | Teselado (s) | Extracción (s) | Total (s) | Triángulos | RSS pico (MB) | Elementos | Sin malla | Malla abierta |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| AC20-FZK-Haus | A | 0.078 | 1.688 | 0.311 | **2.084** | 24 168 | 212.1 | 38 | 0 | 0 |
| AC20-FZK-Haus | B | 0.039 | 0.165 | 0.135 | **0.336** | 21 650 | 210.5 | 38 | 0 | 9 |
| AC20-Institute-Var-2 | A | 0.233 | 2.170 | 1.420 | **4.340** | 50 960 | 291.7 | 436 | 0 | 4 |
| AC20-Institute-Var-2 | B | 0.147 | 0.405 | 0.449 | **0.989** | 43 772 | 224.3 | 436 | 0 | 4 |
| IFC2X3-Building-Architecture | A | 0.005 | 0.187 | 0.037 | **0.229** | 1 170 | 107.8 | 8 | 1 | 0 |
| IFC2X3-Building-Architecture | B | 0.005 | 0.008 | 0.029 | **0.042** | 1 130 | 155.2 | 8 | 1 | 0 |

Lectura:

- En teselado puro, B fue 10.2× más rápido en FZK-Haus, 5.4× en Institute y 23× en el IFC2X3.
  En total (incluyendo cantidades) la ventaja baja a 6.2×, 4.4× y 5.5×.
- A genera más triángulos que B en las tres muestras (+11.6 %, +16.4 %, +3.5 %).
- El RSS pico es parecido en los modelos IFC4 (A 212–292 MB, B 210–224 MB). En el archivo pequeño
  B pesa más porque el runtime de Node + WASM ya ocupa ~133 MB de base, contra ~85 MB de Python +
  IfcOpenShell.
- `Sin malla`: el techo del IFC2X3 no tiene representación geométrica en ninguno de los dos.
- `Malla abierta`: A considera cerrada la malla si no tiene aristas de borde (conteo impar). B deja
  abiertas 9 de las 11 ventanas de FZK-Haus por 2 aristas de borde y 2 aristas con 3 caras
  (T-junctions de la teselación); aun así su volumen coincide con A hasta la sexta decimal. Las 4
  escaleras de Institute quedan abiertas en ambos motores. Se guarda además `manifold` en los JSON.

## 3. Concordancia A vs B

Comparación por `GlobalId`, volumen de malla, umbral 1 %.

| Muestra | Comunes | Comparables | Pasan 1 % | Concordancia | Solo mallas cerradas |
|---|---:|---:|---:|---:|---:|
| AC20-FZK-Haus | 38 | 38 | 0 | **100.00 %** | 100.00 % (29) |
| AC20-Institute-Var-2 | 436 | 436 | 6 | **98.62 %** | 99.54 % (432) |
| IFC2X3-Building-Architecture | 8 | 7 | 0 | **100.00 %** | 100.00 % (7) |

No falta ningún elemento en ninguno de los dos motores. En el IFC2X3 solo hay 7 comparables porque
el techo no tiene malla.

### 10 peores casos de toda la evaluación

| Muestra | Clase | Nombre | Vol. A (m³) | Vol. B (m³) | Diferencia |
|---|---|---|---:|---:|---:|
| Institute | IfcColumn | Stütze-001 | 0.084279 | 0.080285 | 4.7388 % |
| Institute | IfcColumn | Stütze-001 | 0.084279 | 0.080285 | 4.7388 % |
| Institute | IfcStair | Treppe-2-OG | 5.156640 | 5.048888 | 2.0896 % |
| Institute | IfcStair | Treppe-1-OG | 5.268427 | 5.160328 | 2.0518 % |
| Institute | IfcStair | Treppe-EG | 5.380214 | 5.271768 | 2.0156 % |
| Institute | IfcStair | Treppe-KG | 5.492000 | 5.383207 | 1.9809 % |
| Institute | IfcDoor | Tür-019 | 0.341763 | 0.341763 | 0.0000 % |
| Institute | IfcDoor | Tür-018 | 0.168900 | 0.168900 | 0.0000 % |
| Institute | IfcDoor | Tür-018 | 0.168900 | 0.168900 | 0.0000 % |
| Institute | IfcDoor | Tür-017 | 0.168900 | 0.168900 | 0.0000 % |

Solo 6 de 481 elementos comparados superan el 1 %, y todos son de Institute: dos columnas
circulares (B las poligoniza con muchos menos lados: ~12, frente a una malla más fina de A) y cuatro
escaleras (~2 %, por la distinta triangulación de peldaños y barandillas). En FZK-Haus la peor
diferencia fue 0.0010 % y en el IFC2X3, 0.0004 %.

## 4. Cantidades base

`Qto_*BaseQuantities` se leyó de `IfcRelDefinesByProperties` → `IfcElementQuantity` (las cantidades
estándar y, cuando faltaban, las de ArchiCAD), convirtiendo unidades del proyecto a SI (el IFC2X3
declara longitud en mm, área en m² y volumen en m³).

| Muestra | Motor | Volumen: con qto | Volumen: pasan 2 % | Mediana vol. | Área: con qto | Área: pasan 2 % | Mediana área |
|---|---|---:|---:|---:|---:|---:|---:|
| AC20-FZK-Haus | A | 38/38 | 9 | 0.00 % | 17/38 | 6 | 1.62 % |
| AC20-FZK-Haus | B | 38/38 | 9 | 0.00 % | 17/38 | 6 | 1.62 % |
| AC20-Institute-Var-2 | A | 436/436 | 209 | 0.00 % | 149/436 | 15 | 1.17 % |
| AC20-Institute-Var-2 | B | 436/436 | 210 | 0.00 % | 149/436 | 17 | 1.17 % |
| IFC2X3-Building-Architecture | A | 7/8 | 0 | 0.00 % | 3/8 | 2 | 29.26 % |
| IFC2X3-Building-Architecture | B | 7/8 | 0 | 0.00 % | 3/8 | 2 | 29.26 % |

### Volumen por clase (motor A)

| Muestra | Clase | n | Con qto | Pasan 2 % | Mediana |
|---|---|---:|---:|---:|---:|
| FZK-Haus | IfcBeam | 4 | 4 | 0 | 0.00 % |
| FZK-Haus | IfcDoor | 5 | 5 | 0 | 0.00 % |
| FZK-Haus | IfcSlab | 4 | 4 | 0 | 0.00 % |
| FZK-Haus | IfcStair | 1 | 1 | 0 | 0.00 % |
| FZK-Haus | IfcWallStandardCase | 13 | 13 | 0 | 0.00 % |
| FZK-Haus | IfcWindow | 11 | 11 | 9 | 86.06 % |
| Institute | IfcColumn | 2 | 2 | 0 | 1.46 % |
| Institute | IfcDoor | 77 | 77 | 0 | 0.00 % |
| Institute | IfcSlab | 26 | 26 | 0 | 0.00 % |
| Institute | IfcStair | 4 | 4 | 3 | 4.02 % |
| Institute | IfcWallStandardCase | 121 | 121 | 0 | 0.00 % |
| Institute | IfcWindow | 206 | 206 | 206 | 85.63 % |
| IFC2X3 | IfcSlab | 3 | 3 | 0 | 0.00 % |
| IFC2X3 | IfcWall | 4 | 4 | 0 | 0.00 % |

Hechos que explican los «pasan 2 %»:

- **Ventanas:** la cantidad base `Volume` de estos ARCHICAD es solo el marco, mientras la malla
  incluye marco + hoja + vidrio. Ejemplo FZK-Haus: 0.0397 m³ de base contra 0.0738 m³ de malla. Por
  eso 9/11 ventanas de FZK y 206/206 de Institute se marcan; no es un error de medición.
  Excluyendo ventanas, ninguna de FZK pasa del 2 %; en Institute solo 3 escaleras.
- **Escaleras:** la base `NetVolume` de Institute queda 4.0 % (mediana) por debajo de la malla;
  coinciden con las diferencias A/B de ~2 % más el sesgo propio de la cantidad base.
- **Área:** `qto_area` solo se llena cuando el archivo trae un área equivalente a la proyección en
  planta (`Net/GrossFootprintArea`, `NetArea` de losa, `Fläche` de columna). Los 2 casos del IFC2X3
  que pasan son las losas inclinadas de techo: su `NetArea` es área de superficie (22.40 y 31.21 m²)
  y no proyección horizontal (15.84 y 22.07 m²), diferencia ~29 %. En FZK-Haus los 2 peores son
  también las losas inclinadas (13.2 %). Los muros quedan a 2.1–2.5 % porque la cantidad base
  `NetFootprintArea` se calcula como largo × espesor y la unión rasterizada de la malla recorta las
  esquinas y los solapes. Esta diferencia de semántica queda anotada, no oculta.

## 5. Por tipo

Resumen del motor A (el motor B da cifras casi idénticas; ver CSVs). `largo` es el largo del eje
principal de la planta; en puertas y ventanas equivale al ancho. `área lateral` de muro es el
promedio de las dos caras grandes, comparable con `NetSideArea`.

| Muestra | Clase | n | Volumen total (m³) | Área planta total (m²) | Largo/ancho medio (m) | Alto medio (m) | Área lateral total (m²) |
|---|---|---:|---:|---:|---:|---:|---:|
| FZK-Haus | IfcBeam | 4 | 0.695 | 3.907 | 10.770 | 0.180 | — |
| FZK-Haus | IfcDoor | 5 | 0.542 | 0.610 | 1.136 | 2.083 | — |
| FZK-Haus | IfcSlab | 4 | 76.992 | 363.107 | 13.614 | 1.803 | — |
| FZK-Haus | IfcStair | 1 | 0.208 | 1.532 | 1.705 | 3.560 | — |
| FZK-Haus | IfcWallStandardCase | 13 | 54.504 | 31.423 | 8.639 | 2.417 | 192.590 |
| FZK-Haus | IfcWindow | 11 | 0.725 | 1.482 | 1.818 | 1.164 | — |
| Institute | IfcColumn | 2 | 0.169 | 0.062 | 0.200 | 2.700 | — |
| Institute | IfcDoor | 77 | 8.515 | 11.594 | 1.107 | 2.100 | — |
| Institute | IfcSlab | 26 | 1 031.907 | 3 245.387 | 20.511 | 0.789 | — |
| Institute | IfcStair | 4 | 21.297 | 62.609 | 5.499 | 4.194 | — |
| Institute | IfcWallStandardCase | 121 | 662.485 | 325.399 | 9.746 | 2.637 | 2 426.412 |
| Institute | IfcWindow | 206 | 9.495 | 14.781 | 0.996 | 1.510 | — |
| IFC2X3 | IfcRoof | 1 | — | — | — | — | — |
| IFC2X3 | IfcSlab | 3 | 22.521 | 63.609 | 7.067 | 2.433 | — |
| IFC2X3 | IfcWall | 4 | 7.450 | 2.458 | 3.951 | 2.926 | 43.291 |

Notas:

- **Muro:** largo, alto, área lateral neta (promedio de caras, incluye jambas de huecos) y volumen.
  Para FZK-Haus, la suma de áreas laterales (192.59 m²) queda ~3 % por encima de la suma de
  `NetSideArea` por cara porque la malla incluye los retornos de las ventanas.
- **Losa:** área en planta y volumen. Las losas de cubierta inclinadas tienen área de planta menor
  que su área de superficie; el volumen no se ve afectado.
- **Puerta y ventana:** ancho (columna `largo`), alto y conteo (número de filas). FZK-Haus: 5
  puertas de 1.136 × 2.083 m y 11 ventanas de 1.818 × 1.164 m. Institute: 77 puertas de
  1.107 × 2.100 m y 206 ventanas de 0.996 × 1.510 m.
- **Columna, trabe y escalera:** se reportan sus dimensiones medias y totales; las columnas
  circulares son el único caso donde la distinta poligonización mueve el volumen más del 1 %.

## 6. Uso desde Tauri + Rust

Lo probado:

- **web-ifc 0.0.74** con Node 24 en Linux: `IfcAPI.Init()` + `OpenModel` + `StreamAllMeshes`.
  Es el mismo WASM que correría en el webview. `Init()` tarda 0.017–0.018 s.
- **IfcOpenShell 0.9.0.post1** con Python 3.14 en Linux: importar el módulo tarda 0.15–0.19 s y se
  puede llamar como proceso aparte (CLI o sidecar) sin problema.
- **Lo que no se probó:** Tauri, WebView2/WebKit, Windows, wasm multihilo (`web-ifc-mt.wasm`), enlace
  de IfcOpenShell en C++, ni empaquetado del sidecar. Los tiempos son de Linux x86_64.

Tamaño de lo que habría que empaquetar en Windows:

| Ruta | Qué se distribuye | Tamaño comprimido | Tamaño instalado aprox. |
|---|---|---:|---:|
| web-ifc | `web-ifc.wasm` (1 320 042 B) + bundle JS | **1.26 MiB** wasm (0.46 MiB gzip); el paquete npm completo son 24 MB, pero no todo se envía | ~2–3 MB en el instalador |
| IfcOpenShell | wheel Windows `ifcopenshell 0.9.0.post1` cp314 (42 967 662 B) + numpy (12 703 552 B) + shapely (1 843 568 B) + 5 dependencias pequeñas + Python embeddable 3.14 amd64 (11 994 671 B) | **~66.7 MB** (55.2 MB de wheels + 11.4 MB de Python) | **~254 MB** medidos en el venv Linux con las mismas dependencias |

Caminos de integración:

- **web-ifc en el webview:** cargar el `.wasm` desde el bundle de Tauri respetando el MIME
  `application/wasm`; usar la versión monohilo salvo que se configuren cabeceras COOP/COEP para
  `SharedArrayBuffer`. El parser y la teselación corren dentro del webview; para no bloquear la UI
  conviene moverlos a un Web Worker.
- **IfcOpenShell como proceso Python aparte:** sidecar con Python embebido + site-packages; el
  proceso Rust le pasa la ruta del IFC y recibe JSON/CSV por stdin/stdout. Es la ruta que se midió
  (CLI). Alternativa: enlazar el núcleo C++ de IfcOpenShell desde Rust; no se probó y obliga a
  manejar el ABI de C++ y las dependencias nativas (OpenCASCADE).
- **IfcOpenShell dentro del webview** no es viable tal cual: es una biblioteca nativa de Python/C++,
  no WASM.

## 7. Licencias

| Motor | Licencia | Si OPEN-RVT se distribuye como GPL-3.0 |
|---|---|---|
| IfcOpenShell | LGPL-3.0 | Es compatible con GPL-3.0. Al enlazarlo/distribuirlo hay que cumplir la LGPL: avisar que usa IfcOpenShell, incluir su licencia y el código fuente (o la oferta de fuente), y permitir que el usuario reemplace la biblioteca (enlace dinámico o sidecar facilita esto). Las modificaciones a IfcOpenShell siguen siendo LGPL. |
| web-ifc | MPL-2.0 | Es compatible con GPL-3.0 (MPL 2.0 permite distribución como parte de una obra mayor bajo GPL). Hay que conservar la licencia MPL y publicar el código fuente de los archivos MPL que se modifiquen; no obliga a abrir el resto de OPEN-RVT. |

Ninguna de las dos licencias impide que OPEN-RVT sea GPL-3.0. La diferencia práctica es de
obligaciones: LGPL exige facilitar el reemplazo de la biblioteca y cubre el núcleo completo;
MPL solo alcanza a los archivos de web-ifc.

## 8. Hechos que deciden (sin recomendación)

1. **Velocidad:** B fue 4.4–6.2× más rápido en total y 5.4–23× en teselado puro. A tarda 2.08 s en
   la casa, 4.34 s en el edificio de oficinas y 0.23 s en el IFC2X3; B, 0.34 s, 0.99 s y 0.04 s.
2. **Tamaño de distribución:** la ruta web-ifc suma ~1.3 MB de WASM; la ruta IfcOpenShell suma
   ~67 MB comprimidos (wheel de 43 MB + numpy + Python embebido) y ~254 MB instalados.
3. **Precisión de volumen:** coinciden al 100 % en FZK-Haus y en el IFC2X3 y al 98.6 % en Institute;
   las únicas diferencias >1 % son 2 columnas circulares (4.74 %) y 4 escaleras (~2 %).
4. **Malla cerrada:** A cerró las 11 ventanas de FZK-Haus; B dejó 9 abiertas por aristas de borde,
   aunque el volumen coincide. Si el producto exige mallas estancas para impresión/exportación, es
   un dato a favor de A; para visualización y cantidades, no cambió los números.
5. **Triángulos:** A genera 3.5–16.4 % más triángulos que B en las mismas muestras.
6. **Memoria:** en los modelos IFC4 ambos rondan 210–292 MB de RSS pico; en archivos pequeños B
   parte de una base más alta (~133 MB de Node+WASM contra ~85 MB de Python+IfcOpenShell).
7. **Cantidades base:** ambos leen las mismas 38/436/7 cantidades de volumen y 17/149/3 de área.
   La mediana de error contra la base es 0.00 % en volumen para los dos. Las ventanas explican casi
   todos los casos >2 % porque la base solo mide el marco.
8. **Integración:** B entra en el webview como WASM; A necesita un sidecar Python o un enlace C++.
   Ninguna de las dos se probó dentro de Tauri ni en Windows en esta tarea.
9. **Licencias:** LGPL-3.0 (A) y MPL-2.0 (B) son compatibles con un OPEN-RVT GPL-3.0; cambian las
   obligaciones de reemplazo y de publicación de fuentes.

## 9. Reproducción

```bash
./herramientas/bajar_muestras.sh

python3 -m venv ~/.venvs/openrvt
~/.venvs/openrvt/bin/pip install ifcopenshell pytest

for f in muestras/*.ifc; do
  ~/.venvs/openrvt/bin/python evaluacion/a_ifcopenshell.py "$f" --repeticiones 3
  (cd evaluacion && npm install && node b_webifc.mjs "../$f" --repeticiones 3)
done

~/.venvs/openrvt/bin/python -m pytest evaluacion/test_comparar.py -q
~/.venvs/openrvt/bin/python evaluacion/comparar.py \
  resultados/AC20-FZK-Haus_a.csv resultados/AC20-FZK-Haus_b.csv \
  --json resultados/AC20-FZK-Haus_comparacion.json
~/.venvs/openrvt/bin/python evaluacion/resumir.py \
  AC20-FZK-Haus AC20-Institute-Var-2 IFC2X3-Building-Architecture
```

Salidas versionadas:

- `resultados/<muestra>_<motor>.csv` — columnas pedidas:
  `globalid, clase, nombre, nivel, volumen_malla, area_planta, qto_volumen, qto_area, largo, alto, cerrada`.
- `resultados/<muestra>_<motor>.json` — métricas, corridas y filas con `area_lateral`, `manifold` y
  `sin_malla`.
- `resultados/<muestra>_comparacion.json` — faltantes, diferencias, peores casos y comparación
  contra cantidades base.

## 10. Limitaciones y desviaciones

- **Muestra IFC4 mediana:** `Sample-Test-Files` no tiene un IFC4 de oficinas/escuela; se usó el
  «Office Building» del KIT (10.43 MiB, IFC4). Ver la nota completa en `muestras.md`.
- **No se probó Tauri ni Windows.** Los números de tamaño de Windows salen de los wheels publicados
  en PyPI y del Python embeddable oficial; no se ejecutó el motor A en Windows.
- **Área en planta:** es la unión rasterizada de los triángulos proyectados, no una medición CAD
  exacta; el error de rasterización es <0.5 % en las plantas medidas. Las diferencias de 2–2.5 %
  contra `NetFootprintArea` de los muros son de semántica de la cantidad base. Se usa la misma
  fórmula en A y B, por lo que la comparación entre motores no está sesgada.
- **`qto_area`:** se deja vacío cuando el archivo no trae un área equivalente a la proyección en
  planta. Por eso hay menos comparables de área que de volumen.
- **Ventanas:** la cantidad base de volumen es solo el marco; las diferencias >2 % son semánticas,
  no de teselación.
- **Tiempos:** una sola máquina Linux, 12 hilos; no se midió el arranque completo de Tauri ni el
  costo de serializar a través del puente Rust↔Python.
