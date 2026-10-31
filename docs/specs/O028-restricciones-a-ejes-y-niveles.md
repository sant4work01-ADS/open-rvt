# O028: elementos enlazados a ejes y niveles (cruces de ejes, tramos entre ejes, zapatas y contratrabes)

Pedido del usuario (31-oct): «no veo restricciones para zapatas ni contratrabes; quiero definir como restricción
los cruces entre ejes (zapatas, columnas, incluso muros para inicio y fin de un tramo) y que si muevo un eje o
nivel todo lo enlazado se mueva y redimensione». Va DESPUÉS de O026 (Alinear) en la misma rama: reutiliza su
pset `OPENRVT_Restricciones`, su propagación y su candado. Base vertical: O016 (base/tope por nivel en muros y
columnas). Referencia: comportamiento de Revit (columnas «en rejillas», elementos alojados en ejes).

## 1. Restricción vertical para todos los estructurales
- O016 hoy cubre IfcWall e IfcColumn. Extender a: zapata aislada y corrida (`IfcFooting` PAD/STRIP: nivel de
  referencia + desfase = profundidad de desplante, el peralte sale del tipo), contratrabe (`FOOTING_BEAM`: lecho
  superior = nivel + desfase), trabe, cerramiento y dala (`IfcBeam`: nivel + desfase), castillo (base/tope como
  columna). Panel de propiedades muestra «Nivel de referencia» y «Desfase» para cada uno.
- Mover un nivel → todos los enlazados cambian de z (y altura si tienen base y tope en niveles distintos).

## 2. Restricción en planta a ejes
- **Puntual (zapata aislada, columna, castillo)**: anclada a un cruce de ejes (eje A + eje B) con desfase
  local (dx, dy) en m, medido en las direcciones de los ejes. Mover cualquiera de los dos ejes → el elemento se
  traslada. Girar un eje → el elemento sigue el cruce (y su rotación si estaba alineada al eje).
- **Lineal (muro, contratrabe, trabe, zapata corrida, dala, cerramiento)**: en un eje «guía» con desfase
  lateral (centro, cara interior, cara exterior o distancia), e **inicio y fin en cruces** (eje guía × eje
  inicial, eje guía × eje final) con desfase longitudinal en cada extremo. Mover un eje transversal → el
  tramo se alarga o acorta; mover el eje guía → se traslada. Uniones de muros y cotas se recalculan.
- Al CREAR: si el clic cae en un cruce (enganche al cruce) o a lo largo de un eje, la restricción se crea sola y
  se ve el candado cerrado; desactivable en la barra de opciones («Enlazar a ejes»).
- Herramientas por lote en la cinta (Estructura): «Columnas en ejes» y «Zapatas en ejes» (seleccionas ejes →
  un elemento en cada cruce, todos enlazados), «Contratrabes entre ejes» y «Muros entre ejes» (seleccionas un eje
  guía y se crean tramos entre cada par de cruces consecutivos).
- Propiedades del elemento: «Enlazado a: A-1 (dx 0.00, dy 0.00)» o «Eje B, de 1 a 3», con botón «Soltar
  enlace» y edición de desfases.

## 3. Núcleo (Python)
- En `nucleo/openrvt_nucleo/modelado.py`: lectura tolerante (modelos viejos sin enlace = nada cambia),
  `enlazar_a_cruce`, `enlazar_tramo`, `soltar_enlace`, y la propagación al editar ejes (`eje_editar`/mover) y
  niveles (`nivel_editar`, `niveles_separacion`), en UNA transacción (Deshacer en un paso). Detecta ciclos y
  ejes borrados (al borrar un eje, los enlazados se sueltan y quedan donde estaban, con aviso).
- Pruebas `nucleo/tests/test_o028.py` con valores calculados a mano:
  - ejes A (x=0), B (x=5), 1 (y=0), 2 (y=4): zapata en A-1 con dx 0.10 → centro (0.10, 0); mover A a x=1 →
    (1.10, 0);
  - contratrabe en eje 1 de A a B, sección 0.20: largo 5.00; mover B a x=6 → largo 6.00 (con desfases 0);
  - muro en eje 2 de A a B por su cara exterior (espesor 0.15) → eje del muro en y=4.075; mover 2 a y=5 → 5.075;
  - mover nivel de desplante −1.20 → −1.50: zapata y contratrabe bajan 0.30; columna con base en ese nivel y
    tope en Nivel 1 se alarga 0.30;
  - borrar el eje B → la contratrabe queda con su último largo y sin enlace en el extremo final.

## Pruebas de la app
- vitest de la UI (propiedades del enlace, herramientas por lote).
- E2E `e2e/o028.test.js` con la app real: 3×3 ejes → «Zapatas en ejes» (9) y «Contratrabes entre ejes» en un
  eje → mover un eje 1 m → medir que zapatas y contratrabes siguieron (posiciones y largos al centímetro);
  mover el nivel de desplante → bajan; Deshacer en un paso. Capturas en `docs/progreso/O028/`.
- NO toques dibujo de niveles/cotas ni `estilos.ts` (O024/O025) ni las asas de ejes (O027).
- vitest `--maxWorkers=3`, `npx tsc --noEmit`, `npm run lint`, pytest del núcleo. Binario E2E con
  `OPENRVT_E2E_BINARIO` en `C:/...`, `CARGO_TARGET_DIR=$HOME/.cache/pp-target/openrvt-o026`, `-j 3`.
- LF; NO cambies fines de línea de archivos existentes. Commits por parte; sin push, merge, versión ni
  dependencias nuevas.
