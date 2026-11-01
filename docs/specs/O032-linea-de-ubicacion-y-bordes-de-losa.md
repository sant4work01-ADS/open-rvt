# O032: línea de ubicación del muro y desfases de bordes de losa

Pedido del usuario (31-oct), con una captura de un alzado: la losa va de eje a eje, pero el muro dibujado a eje
sobresale medio espesor. Por eso la losa no llega al paño exterior y queda un faltante en cada extremo. Pide:
- poder dar un desfase para cubrir ese faltante;
- definir si el muro va a eje, a paño interior o a paño exterior;
- dar a las losas un desfase en cada lado, simétrico o asimétrico.

Hoy:
- `muro_crear` (`modelado.py:2856`) recibe `alineacion` (centro/interior/exterior) solo al crear. No se puede
  cambiar en Propiedades ni se ve qué línea quedó sobre el eje.
- El tipo de muro tiene `LineaUbicacion` (`biblioteca.py:97`), pero no es un parámetro del muro dibujado.
- `losa_crear` (`modelado.py:3918`) guarda un `Contorno` fijo y su `Desfase` es vertical. No hay desfase por borde.

Va después de O028 (enlaces a ejes y niveles) y reutiliza sus restricciones.

## 1. Muro: línea de ubicación editable
- Parámetro de ejemplar **«Línea de ubicación»**. Valores:
  - Eje del muro: el valor por omisión.
  - Paño exterior.
  - Paño interior.
  - Eje del núcleo, cuando el tipo tiene capas.
- Parámetro **«Desfase de ubicación (m)»**: separación de la línea de ubicación respecto a la línea dibujada o al eje
  enlazado. Positivo hacia el exterior.
- La línea dibujada (o el eje al que está enlazado, O028) **no se mueve**: al cambiar la línea de ubicación, el
  cuerpo del muro se recorre. Ejemplo: muro de 0.15 a eje → paño exterior, y su cara exterior queda sobre el eje.
- **Lado exterior:** el lado izquierdo al dibujar de inicio a fin, como en Revit.
  - Se ve con una flecha de volteo en planta al seleccionar el muro.
  - Clic en la flecha, o la barra espaciadora, voltea los lados sin mover la línea de ubicación.
- **Al dibujar:** «Línea de ubicación» y «Desfase» van en la barra de opciones. Se guardan como la última opción usada.
- **Propiedades** muestra y edita ambos parámetros, con un solo paso de Deshacer.
- **Uniones y esquinas:** las que ya existen se recalculan con el cuerpo nuevo, sin huecos ni encimes.
- **En planta** se dibuja la línea de ubicación en trazo fino al seleccionar el muro, para ver qué queda sobre el eje.

## 2. Losa: bordes con referencia y desfase
- Cada borde de la losa guarda:
  - **referencia**: «Libre», «Eje» o «Muro» (paño exterior / eje / paño interior del muro);
  - **desfase (m)**: positivo hacia afuera.
- **Al crear la losa** con «Seleccionar muros» o «Seleccionar ejes», en la barra de opciones:
  - «Borde a: paño exterior / eje / paño interior», con paño exterior por omisión al seleccionar muros;
  - «Desfase» común.
- **Desfase simétrico:** en Propiedades, «Desfase de bordes (m)» con un solo valor aplica el mismo desfase a
  todos los bordes.
- **Desfase asimétrico:**
  - En planta, al seleccionar la losa, cada borde muestra un asa y una cota temporal editable con el desfase de ese
    borde.
  - En Propiedades, la tabla «Bordes» muestra lado n, referencia y desfase.
  - Si los desfases difieren, el valor común se muestra como «Varios».
- **Contorno regenerado:** el contorno real se calcula de nuevo a partir de las referencias y los desfases.
  - Al mover un eje o cambiar un muro (grosor, línea de ubicación), la losa se regenera. Usa el mismo mecanismo de
    `_recalcular_restricciones` de O028.
  - Las losas importadas, sin datos de OPEN-RVT, no se tocan, igual que las vigas y zapatas en O028.
- **Losas existentes de OPEN-RVT:** se abren con todos los bordes «Libre» y desfase 0, así que no cambian.
- **Caso de la captura:** losa entre los ejes 1 y 2 con muros de 0.15 a eje. Con «Borde a: paño exterior», o con
  «Eje» y desfase 0.075, la losa llega al paño exterior de los dos muros.

## 3. Mismo criterio en elementos lineales de estructura
- Contratrabes, trabes y zapatas corridas ganan la misma «Línea de ubicación» (eje / paño / excentricidad en m)
  respecto al eje enlazado, con los mismos campos y el mismo volteo.
- Es solo el parámetro y su regeneración; no hay herramientas nuevas.

## Pruebas
- **pytest:**
  - muro de 0.15 a eje 1 → paño exterior → la cara exterior queda en x del eje (±1e-6);
  - voltear conserva la línea;
  - deshacer en un paso;
  - losa con «Muro / paño exterior» entre dos muros → contorno al paño (caso de la captura);
  - mover el eje 2 en +0.50 → la losa y el muro se regeneran;
  - desfase asimétrico (0.10 izquierda, 0 derecha);
  - losa vieja sin datos abre igual;
  - losa importada no cambia.
- **vitest:** barra de opciones, «Varios», flecha de volteo y cotas temporales por borde.
- **E2E `e2e/o032.test.js`:**
  1. reproduce la captura: ejes 1–2, muros a eje y losa a eje;
  2. comprueba en Alzado Norte que hay faltante;
  3. cambia la losa a «paño exterior» y comprueba que no hay faltante, midiendo el contorno por el núcleo;
  4. cambia un muro a «paño interior» y comprueba que la losa lo sigue.

  Capturas en `docs/progreso/O032/`, leídas como imagen.
- vitest `--maxWorkers=3`, `npx tsc --noEmit`, `npm run lint` (con 0 errores de verdad, incluido `e2e/`) y pytest
  del núcleo.
- LF; NO cambies los fines de línea de archivos existentes (`modelado.py` es CRLF: edítalo conservando CRLF).
- Commit tras cada parte. Sin push, merge, cambio de versión ni dependencias nuevas.
