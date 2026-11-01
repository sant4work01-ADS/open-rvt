# O033: la zapata corrida falla, no cuelga del nivel y no se alinea (bug del usuario)

Reporte del usuario (31-oct), con una captura de Alzado Norte. Zapata corrida «ZC-1 Zapata corrida 60» entre los ejes 1 y
2, bajo dos muros a eje. Al seleccionarla:
- **Error.** Propiedades y la barra de estado dicen «No existe el elemento 32QIAF…» (el GlobalId de la misma
  zapata) en cuanto se edita una propiedad.
- **Valores absurdos.** Propiedades muestra «Desplante (m) 0», «Desfase de base 0», «Restricción de tope: Sin
  conexión» y «Altura (m) 0».
  - Un desplante de 0 lo prohíbe el propio núcleo (`modelado.py:4753`).
  - Altura y tope no aplican a una zapata.
- **No cuelga del nivel.** El usuario espera que la zapata cuelgue de Npt 0: su posición se define desde el nivel y lo
  sigue. En la captura queda suelta, muy por debajo, y no es claro de dónde sale esa altura.
- **No se alinea.** En planta y en alzado la zapata no queda centrada bajo los muros y ejes: sobresale de un lado (el
  extremo verde a la derecha) y del otro no llega.

## Causa probable (confírmala con una prueba antes de arreglar)
Hay dos parámetros para lo mismo. O028 aplicó «Restricción de base + Desfase de base» a las zapatas.
`_aplicar_restricciones` (`modelado.py`, rama `STRIP_FOOTING`, cerca de la línea 476) hace
`Desplante = Elevation − z` con `z = nivel + desfase`. Con un desfase de 0 deja `Desplante = 0` y `Z` sobre el nivel.
Después, `editar` (cerca de 4753) rechaza el desplante 0 y el panel queda apuntando a un elemento que ya no existe.
Esa es la secuencia probable; verifica la exacta.

## Comportamiento correcto (regla única)
1. **Un solo parámetro de altura.** En zapatas aisladas y corridas, la posición vertical se define con:
   - «Nivel de base», el nivel del que cuelga;
   - «Desplante (m)»: profundidad del fondo de la zapata bajo ese nivel, siempre mayor que 0, 0.80 por omisión.
   - El peralte sale del tipo.
   - No existen «Desfase de base», «Restricción de tope» ni «Altura» para zapatas: quítalos del panel y de
     `_aplicar_restricciones`.
   - El dato guardado es el desplante. `Z` siempre se deriva así:
     - corrida: `Z = elevación − desplante + peralte/2`;
     - aislada: la fórmula equivalente.
2. **Cuelga del nivel.**
   - Si cambia la elevación del nivel, la zapata baja o sube igual y conserva su desplante.
   - Si cambia el nivel de base en Propiedades, conserva el desplante respecto al nuevo nivel.
   - Un solo paso de Deshacer.
3. **Editar nunca deja el panel huérfano.**
   - Si el núcleo rechaza un valor (desplante ≤ 0), el elemento queda como estaba: sin instantánea perdida y con el
     mismo GlobalId. El campo vuelve a su valor y aparece el aviso del rechazo.
   - Si una edición regenera el elemento, conserva su GlobalId. Revisa también zapata aislada, contratrabe y trabe con
     el mismo patrón.
4. **Alineación con ejes y muros.**
   - Una zapata corrida creada sobre un eje, o con «Zapatas en ejes» o «Contratrabes entre ejes», queda con su eje
     longitudinal sobre el eje: centrada, sin excentricidad.
   - En los extremos llega al cruce de ejes y se prolonga medio ancho de la zapata más allá, para que las esquinas
     cierren con las zapatas perpendiculares sin hueco ni sobrante. Los parámetros «Prolongación inicio/fin (m)»
     son editables y por omisión valen medio ancho cuando el extremo está en un cruce.
   - Si la zapata está bajo un muro enlazado al mismo eje, queda centrada bajo el muro. La excentricidad o línea de
     ubicación la agrega O032; aquí solo el centrado.
   - Mover el eje mueve la zapata y recalcula las prolongaciones (O028).
5. **Muros sobre zapata.** Sin cambios en esta tarea: dejar anotado en el progreso si el muro debe bajar hasta el lecho
   superior de la zapata.

## Pruebas
- **pytest:**
  - reproducir el error de la captura antes del arreglo (debe fallar), luego en verde;
  - corrida con desplante 0.80 bajo Nivel 0 → fondo en −0.80 y tope en −0.80 + peralte;
  - subir Nivel 0 +0.50 → la zapata sube 0.50;
  - desplante 0 → rechazo sin cambios y con el mismo GlobalId;
  - cambiar el nivel de base;
  - zapata en eje → centrada (±1e-6), con prolongaciones de medio ancho;
  - esquina en L sin hueco (unión de volúmenes);
  - deshacer en un paso;
  - zapata vieja (archivo de 0.5.14) abre y conserva su posición.
- **vitest:** el panel de zapata no muestra «Desfase de base», «Restricción de tope» ni «Altura».
- **E2E `e2e/o033.test.js`:** ejes 1–2, muros a eje, «Zapatas en ejes».
  1. Selecciona la zapata: sin error en la barra de estado.
  2. Desplante 1.00 → se ve más abajo en Alzado Norte.
  3. Cambia la cota de Npt 0 → la zapata la sigue.
  4. Captura de planta y alzado en `docs/progreso/O033/`, leídas como imagen, mostrando la zapata centrada bajo los
     muros y las esquinas cerradas.
- vitest `--maxWorkers=3`, `npx tsc --noEmit`, `npm run lint` (con 0 errores de verdad), pytest del núcleo.
- `modelado.py` es CRLF: edítalo conservando CRLF; el resto LF. Commit tras cada punto. Sin push, merge, cambio de
  versión ni dependencias nuevas.
