# O030: ver la anotación a escala (tamaño de papel fijo, no reacciona al zoom)

Pedido del usuario (31-oct), viendo la captura de O025: «hay que tener opción de activar que se vea a escala y no
reaccione al zoom, para ir afinando más eso». Va en la rama de O024/O025, después de O025b.

## Comportamiento
1. **Modo «A escala»**:
   - Textos, cabezas de nivel, globos, remates y separaciones de cota miden sus mm de papel × la escala de la vista.
   - Por ejemplo: un texto de 2.5 mm a 1:100 mide 0.25 m de modelo.
   - Se comportan como geometría: al acercar crecen y al alejar se achican junto con el dibujo, igual que en el
     plano impreso.
   - Lo que se ve es exactamente lo que saldrá impreso.
2. **Modo «Pantalla»**, el actual:
   - La anotación conserva un tamaño legible en pantalla con cualquier zoom.
3. **Dónde se cambia el modo**:
   - Interruptor en la barra inferior del visor, junto a Ajustar/Orbitar («A escala»).
   - También en Propiedades de la vista → Anotación.
   - Se guarda por vista. Por omisión: «A escala» en alzado/corte y «Pantalla» en planta.
4. **Zoom 1:1 de papel**:
   - Botón «100 %»: un mm de papel mide un mm en el monitor (usa los DPI de Windows).
   - Sirve para revisar tamaños reales.
5. **Lo que no cambia con el modo**:
   - Cambiar la escala de la vista (1:50, 1:100) sí cambia el tamaño de la anotación en modelo.
   - Los grosores de línea siguen la misma regla que los textos en cada modo.
   - Las asas de edición (O027) siempre son de tamaño constante en pantalla.

## Pruebas
- vitest: con «A escala» a 1:100, el alto del texto en modelo es 0.25 m sin importar el zoom; con zoom ×2, el alto
  en px se duplica; en «Pantalla», el alto en px es constante. La colocación sin encimes (O025) se cumple en ambos
  modos.
- E2E `e2e/o030.test.js`: alzado con los niveles de la referencia; activar «A escala»; medir el alto en px de
  «Npt +2.20m» a dos zooms (la razón es igual a la del zoom ±3 %); desactivar → alto constante ±1 px. Capturas en
  `docs/progreso/O030/` a zoom de anotación con el modo «A escala».
- vitest `--maxWorkers=3`, `npx tsc --noEmit`, `npm run lint` (con 0 errores de verdad; incluye e2e/).
- LF; NO cambies fines de línea de archivos existentes. Commits por parte; sin push, merge, versión ni dependencias
  nuevas.
