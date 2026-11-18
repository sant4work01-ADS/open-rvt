# O071 — Cotas de elemento editables y herramientas en 3D

Pedido del dueño (17-nov): al seleccionar un elemento (ventana, puerta…) en CUALQUIER vista
(planta, alzado, corte, 3D) aparecen cotas que se editan para desplazarlo; y poder colocar y mover
también en las vistas 3D. Arranca DESPUÉS de integrar O069 (rama desde main con O069).
Versión: la siguiente libre al integrar.

## 1. Restricción de altura de Ventana/Puerta
Propiedad nueva «Altura referida a»: **Antepecho** (abajo, como hoy: nivel + antepecho) o
**Dintel** (arriba: nivel + desfase = cota superior; antepecho = dintel − alto, calculado). Se
guarda en `OPENRVT_Abertura` (`Referencia` = "antepecho" | "dintel", `NivelDintel`,
`DesfaseDintel`). Si se mueve el nivel del dintel, la ventana lo sigue. Disponible en la barra de
opciones de la herramienta y en Propiedades. Puerta: por defecto Antepecho 0 desde el nivel.

## 2. Cotas temporales de elemento (ventana y puerta)
Al seleccionar una abertura se dibujan cotas en azul con el número editable (clic en el número →
campo; Enter aplica `elementos.editar`; Esc cancela):
- **Horizontal (abajo)**: del extremo del muro (o de la abertura vecina más cercana) al borde de la
  abertura. Editarla cambia `distancia`.
- **Vertical (al lado)**: del nivel de referencia al antepecho. Editarla cambia `antepecho`.
  **No se dibuja si la altura está referida a Dintel** (la altura la manda el nivel); en su lugar
  un candado pequeño junto al dintel.
- Opciones (pestaña Anotar → «Cotas de elemento», guardadas en la config del usuario):
  - «Mostrar las 4»: añade la horizontal del otro extremo del muro y la vertical del dintel al
    tope del muro (o al nivel superior).
  - «Medir a»: **Bordes** (por defecto) o **Centro** del elemento.
- En planta solo hay cotas horizontales (a lo largo del muro). En alzado/corte y 3D, horizontal y
  vertical, dibujadas en el plano de la cara del muro (en 3D siempre de frente a la cámara, texto
  legible, sin quedar ocultas por el muro: se dibujan encima).
- Editar una cota respeta los límites del muro: si no cabe → aviso con el motivo, sin cambios.

## 3. Colocar y mover en 3D
- Ventana/Puerta en iso/perspectiva: el cursor sobre una cara de muro (raycast) muestra la vista
  previa en esa cara; la altura sale de la barra de opciones (nivel + antepecho/dintel); clic
  coloca. Misma validación en rojo que O069.
- Mover/Copiar en 3D: seleccionar con clic (fase de O068); arrastrar el elemento seleccionado:
  una abertura se desliza sobre su muro (horizontal y vertical en el plano de la cara); los demás
  elementos se mueven en el plano horizontal de su nivel. Distancia tecleada + Enter igual que en
  planta. Sustituye el aviso de O069 «Mover trabaja en plantas, alzados y cortes».

## Pruebas (valores a mano)
Muro de (0,0) a (6,0), N0 = 0.00, N1 = 3.00, alto de muro 3.00; ventana ancho 1.20, alto 1.20.
pytest: (a) Referencia Dintel con N1 y desfase −0.40 → dintel 2.60, antepecho 1.40; (b) subir N1 a
3.20 → dintel 2.80, antepecho 1.60; (c) cambiar a Antepecho → antepecho queda 1.60 desde N0 y ya no
sigue al nivel.
vitest: ventana en distancia 2.00, antepecho 0.90 desde N0: cota horizontal = 2.00 (bordes) o
2.60 (centro); con «Mostrar las 4» la del otro lado = 6.00 − 3.20 = 2.80 y la del dintel al tope
= 3.00 − 2.10 = 0.90; editar la horizontal a 3.50 llama `elementos.editar {distancia: 3.50}`;
en centro, editar a 3.50 manda distancia 2.90; con Dintel no hay cota vertical; editar a 5.00
(bordes) → 5.00 + 1.20 > 6.00 → aviso, sin llamada.
E2E (con `pesado`): seleccionar la ventana en Alzado Sur, editar la cota horizontal y la vertical
y comprobar en Propiedades; en 3D Perspectiva colocar una ventana en la cara de un muro y
arrastrarla; cambiar a Dintel y comprobar que desaparece la cota vertical. Capturas
`docs/capturas/o071-*.png`.

Fase siguiente (NO en esta tarea): las mismas cotas para columnas/zapatas (a los ejes) y muros
(a ejes y muros paralelos).

Correr pytest, vitest y clippy completos. Informe `docs/progreso/O071.md` con salidas reales.
