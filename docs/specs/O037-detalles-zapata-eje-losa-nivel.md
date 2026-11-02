# O037: cuatro detalles del usuario (zapata, eje con codo, bordes de losa, nivel borrado)

Reporte del usuario (2-nov) con 4 capturas en `docs/progreso/O037/reporte/` (léelas como imagen antes de empezar).
Son bugs: para cada uno, **primero una prueba que lo reproduzca y falle**, luego el arreglo, luego verde. Commit tras
cada punto.

## 1. Desfase minúsculo en zapata aislada (`1-zapata-desfase.png`)
Alzado Norte, «Zapata Z-1 Zapata 1.20×1.20» con dado, Nivel de base «Nivel 1», Desplante 1. Entre la cara superior
del dado y la línea del nivel queda una franja delgada (marcada con flechas): el dado no llega al nivel.
- **Correcto:** la cara superior del dado (o de la zapata, si no tiene dado) queda exactamente en la cota del nivel de
  base: `tope_dado = elevación_nivel` (±1e-6). El fondo queda en `elevación − desplante`. La altura del dado se deriva:
  `dado_alto = desplante − peralte`; si sale ≤ 0, se rechaza con aviso (desplante menor que el peralte).
- Revisa de dónde sale la franja (dado alto fijo del tipo, redondeo, espesor de losa, desfase heredado de O028) y
  confírmalo en la prueba.
- Junto al campo «Desplante (m)» pon un `title` que diga: «Profundidad del fondo de la zapata bajo el nivel de base».
- Mismo criterio para la zapata corrida: su cara superior no debe quedar flotando por un residuo.

## 2. Error en codo de eje (`2-eje-codo.png`)
Eje «A» con un quiebre (polilínea). En planta:
- el patrón de trazos se reinicia en cada tramo y deja huecos justo junto al vértice;
- hay un pinzamiento (cuadro con punto) suelto, fuera de la línea, cerca del círculo;
- la línea que llega a la cabeza «A» queda cortada.
**Correcto:**
- el patrón de trazos es continuo a lo largo de toda la polilínea (la distancia acumulada sigue en el vértice) y en cada
  vértice hay un trazo lleno;
- los pinzamientos están exactamente sobre la línea: uno por vértice y extremos, y si hay de punto medio, en el punto
  medio real de su tramo; ningún pinzamiento queda fuera;
- la cabeza se conecta con el extremo sin hueco;
- arrastrar el pinzamiento del vértice mueve solo ese vértice.
Código: `src/features/modelo/ejesVista.ts` y donde se dibujen los pinzamientos de ejes.

## 3. Desfase de borde en losa no funciona bien (`3-losa-desfase-bordes.png`)
Losa con 4 lados «libre», todos con desfase 0, y aun así la losa queda mucho más grande que los muros. El contorno
guardado tiene valores como −0.4175 / 1.9175, que parecen desfases acumulados.
**Hipótesis (confírmala):** al editar el desfase de un borde «libre», el nuevo contorno se guarda como base, y la
siguiente edición desplaza otra vez sobre el contorno ya desplazado. Volver a 0 no regresa al original.
**Correcto:**
- Cada borde guarda su línea base sin desfase (el contorno dibujado o el de muros/ejes). El contorno final siempre se
  calcula como `base + desfase`: idempotente.
- Desfase 0.30 → el lado se mueve 0.30 hacia afuera. Volver a 0 → contorno idéntico al original (±1e-9). Repetir el
  mismo valor dos veces → no cambia nada.
- El campo general «Desfase de bordes (m)» aplica el valor a todos los lados con la misma regla, sin acumular.
- Un valor negativo mete el lado hacia adentro.
- Las losas guardadas con la versión anterior (sin base) se abren tomando su contorno actual como base.
Código: `_normalizar_bordes_losa` y `_linea_de_borde` en `nucleo/openrvt_nucleo/modelado.py` (cerca de 4129).

## 4. Nivel eliminado pero no desaparece (`4-nivel-borrado.png`)
Hay 7 niveles (Planta Nivel 0–6, Npt 0.00 a +3.60). Los niveles Npt +16.22 y +19.22 se borraron, pero el Alzado Norte
los sigue dibujando con sus cotas (3.00, 12.62, 19.22).
**Correcto:**
- Tras `niveles.borrar`, todas las vistas quitan el nivel en el acto: alzados, cadena de cotas, lista de plantas y
  cualquier caché de niveles en el frontend.
- Deshacer lo regresa en todas.
- Al reabrir el archivo, el nivel borrado no aparece.
- Comprueba si el núcleo borra de verdad el `IfcBuildingStorey` o solo lo oculta. Si lo borra y aún se ve, el fallo
  está en el frontend (estado de niveles o anotaciones del alzado).

## Pruebas
- **pytest:**
  - 1: tope del dado = nivel, fondo, desplante < peralte rechazado;
  - 3: idempotencia, 0.30 → 0 → original, campo general, archivo viejo;
  - 4: el nivel borrado no está en el IFC ni en `modelo.niveles`.
- **vitest:**
  - 2: pinzamientos sobre la línea (distancia ≤ 1e-6) y patrón continuo en el vértice;
  - 4: el alzado no dibuja niveles borrados.
- **E2E `e2e/o037.test.js`** (patrón de `e2e/o032.test.js`): crear los 4 casos y capturar en `docs/progreso/O037/`:
  - zapata en alzado;
  - eje con codo en planta;
  - losa tras 0.30 → 0;
  - alzado tras borrar dos niveles altos.
  Lee cada captura como imagen y confirma que se ve bien.
- Corre también:
  - vitest `--maxWorkers=3`;
  - `npx tsc --noEmit`;
  - `npm run lint`;
  - pytest del núcleo completo.
- **Reglas:**
  - `modelado.py` es CRLF: consérvalo; el resto, LF.
  - Antes del E2E con binario release, corre `herramientas/preparar_python.sh windows`.
  - Sin push, merge, cambio de versión ni dependencias nuevas.
  - Resumen en `docs/progreso/O037.md`.
