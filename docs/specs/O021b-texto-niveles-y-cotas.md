# O021b: texto de nivel tachado y cotas chicas encimadas (pendiente tras O014b)

De `ideas/niveles-estilo-cotas.md`, «Pendiente tras O014b»:
1. El texto «Npt +2.00m» queda tachado por la propia línea de nivel: ponerlo ARRIBA de la línea con un margen
   (≥ 1.5 mm de papel a la escala de la vista), sin que la línea cruce ningún texto. Prueba geométrica: la caja
   del texto no intersecta la línea.
2. Cotas pequeñas (0.10, 0.20) se montan sobre líneas de extensión: si el texto no cabe entre las líneas, va
   fuera (al lado de la cota, alternando lados si hay varias seguidas) o con línea de referencia. Prueba: cadena
   0.10/0.20/3.00 → ninguna caja de texto intersecta otra ni una línea de extensión.
3. Alzado y corte: mismas reglas; no rompas la corrección del espejo en corte (0, 1) de O015.

Pruebas: vitest de las funciones de colocación; E2E `e2e/o021b.test.js` con medidas de cajas en alzado;
capturas en `docs/progreso/O021b/`. Mismas reglas de verificación y entrega que O021.
