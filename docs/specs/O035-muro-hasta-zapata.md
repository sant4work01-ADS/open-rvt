# O035: el muro baja hasta el lecho superior de la cimentación

Hoy un muro del nivel más bajo nace en el nivel (o en su desfase de base). Si debajo hay una zapata corrida o una
contratrabe, queda un hueco entre el muro y la cimentación: en obra el muro (o su enrase) llega a la cimentación.

## Decisiones ya tomadas (no las cambies)
- **Regla.** Si en planta el eje del muro queda sobre una **zapata corrida** o una **contratrabe** (su huella en planta
  contiene el tramo del eje), la base del muro baja hasta la **cara superior** de ese elemento en ese tramo.
  - Si solo una parte del muro queda sobre la cimentación, solo esa parte baja (la base del muro sigue la cimentación
    por tramos); el resto queda donde estaba.
  - Zapatas aisladas: el muro **no** baja por ellas (las cubre la contratrabe).
  - Si el usuario puso a mano un desfase de base distinto de 0, se respeta y no se baja.
- **Propiedad.** Nueva casilla en Propiedades del muro: «Bajar hasta la cimentación» (pset `OPENRVT_Muro`,
  `BajarACimentacion`, por omisión **sí**). Al quitarla, el muro vuelve a nacer en su nivel.
- **Recalcular.** Al mover, editar o borrar la zapata corrida o la contratrabe, o al cambiar su peralte o desplante,
  la base del muro se recalcula (mismo mecanismo de dependientes que castillos y cerramientos, en lote, una sola
  regeneración por muro). Deshacer en un paso.
- **Cantidades.** La parte del muro bajo el nivel es muro (su tipo y acabados no cambian; los acabados **no** bajan
  del nivel). Losa y firme conservan su volumen: donde muro y losa se traslapan, la losa tiene prioridad (como el dado
  en O041). La cimentación conserva el suyo.
- **Planta y alzado.** En alzado se ve el muro llegar a la cimentación sin hueco.

## Archivos a reciclar
- `nucleo/openrvt_nucleo/uniones.py`, `nucleo/openrvt_nucleo/modelado.py` (`_actualizar_dependientes_muro`,
  `_regenerar_muro`, la regla del dado bajo losa de O041 en `55ba0da`).

## Pruebas obligatorias (valores a mano)
- **pytest `nucleo/tests/test_o035.py`:**
  - muro de 4 m × 2.60 m, Block 15, sobre contratrabe con cara superior a −0.30 → base del muro en −0.30, altura
    total 2.90, volumen bruto 4 × 2.90 × 0.15 = 1.74 m³;
  - mismo muro sobre zapata corrida con cara superior a −0.50 → altura 3.10;
  - muro de 6 m con solo 3 m sobre contratrabe → solo ese tramo baja (volumen = 3×2.60×0.15 + 3×2.90×0.15);
  - muro con desfase de base −0.10 puesto a mano → no baja;
  - casilla desactivada → nace en el nivel;
  - mover la contratrabe 1 m de lado (fuera del muro) → el muro vuelve a nacer en el nivel; deshacer → vuelve a bajar;
  - con firme de 0.10 a nivel 0 encima: el firme conserva su volumen exacto;
  - zapata aislada debajo → no baja;
  - todo se tesela (`geometria.teselar` sin elementos sin geometría).
- **vitest:** casilla «Bajar hasta la cimentación» en el panel del muro.
- **E2E `e2e/o035.test.js`, con clics reales:** dibujar contratrabe y luego un muro encima con las herramientas;
  comprobar la base; quitar la casilla en Propiedades; capturas de alzado y 3D en `docs/progreso/O035/`.
- Corre la batería de E2E que toque muros y cimentación (o012, o012b, o033, o041), `npx tsc --noEmit`,
  `npm run lint`, vitest `--maxWorkers=3` y pytest completo.

## Reglas
- `modelado.py` e `interacciones.py` conservan su fin de línea (CRLF).
- Sin push, merge, cambio de versión ni dependencias nuevas.
- Resumen en `docs/progreso/O035.md`.
