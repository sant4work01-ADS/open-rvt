# O069 — Ventana sincronizada en planta y Mover en alzados

Prueba del dueño con 0.5.41 (bitácora 20261117_214656, 17-nov). Versión al integrar: **0.5.42**.

## Fallos reales (de la bitácora)
1. Editó una ventana desde Propiedades (`elementos.editar` con `nivel`, `distancia`, `antepecho`):
   el 3D se actualizó pero **la planta siguió dibujando la ventana en su lugar viejo**.
2. **En planta no puede seleccionar la ventana** (clic sobre el símbolo no la elige).
3. **Mover activado en Alzado Oeste no hace nada**: después de `cmd-mover` no hay ni un clic de
   herramienta registrado. Solo funciona en planta.
4. Ventana en «Planta Nivel 3» sobre un muro de 3.60 m: el nivel por defecto (Nivel 3) deja la
   ventana a 4.30 m, el núcleo la rechaza y cada clic repite el error (8 veces). El dueño tuvo que
   cambiar el nivel a mano.

## Qué hacer
1. **Planta = núcleo.** El símbolo de puerta/ventana en planta sale SIEMPRE de los datos actuales
   del núcleo (distancia, ancho, muro, nivel) tras cualquier comando que los cambie
   (`elementos.editar`, `elementos.mover`, deshacer/rehacer). Encontrar dónde se queda la copia
   vieja (caché de referencias/líneas de planta) y quitarla. Una abertura se dibuja en la planta
   de un nivel si su muro se dibuja ahí y la abertura cruza el plano de corte de esa vista O su
   nivel de referencia es el nivel de la vista.
2. **Seleccionar en planta.** Clic sobre el símbolo de una abertura la selecciona (gana sobre el
   muro que la aloja). Resaltado igual que los demás elementos. Funciona también en la fase
   «seleccionar» de Mover/Copiar.
3. **Mover/Copiar en alzados y cortes.** Mismas fases que en planta (seleccionar → base →
   destino, vista previa, distancia tecleada, Esc). El desplazamiento se toma en el plano del
   alzado: horizontal → dx/dy según la orientación de la vista; vertical → dz. Una ventana movida
   en vertical cambia su antepecho (el núcleo ya acepta dz). En 3D (iso/perspectiva): aviso
   «Mover trabaja en plantas, alzados y cortes».
4. **Nivel por defecto de Ventana/Puerta.** Si con el nivel elegido la abertura no cabe en el muro
   bajo el cursor, la vista previa se pinta en rojo y la barra dice el motivo ANTES del clic; el
   clic no manda nada al núcleo. Si el nivel de la vista queda fuera del muro, el valor por
   defecto pasa a «Base del muro».

## Pruebas (valores a mano)
vitest/estado: (a) tras `elementos.editar` de distancia 0.45→2.00 en un muro de 5 m que va de
(0,0) a (5,0), el símbolo de planta de la ventana (ancho 0.60) va de x=2.00 a x=2.60; (b) tras
Deshacer vuelve a 0.45–1.05; (c) clic en (2.30, 0) con la ventana en 2.00–2.60 selecciona la
ventana, no el muro; (d) en Alzado Sur (mira hacia +y, x a la derecha) mover base (1,1)→(3,1.5)
manda dx=2, dy=0, dz=0.5; en Alzado Este manda dx=0, dy=±2 según la orientación, dz=0.5;
(e) ventana con nivel cuya cota + antepecho + alto > tope del muro → sin llamada al núcleo.
pytest: mover una ventana dz=+0.30 con antepecho 0.90 → antepecho 1.20; con muro de 2.60 y alto
1.20, dz=+0.60 → error, sin cambios.
E2E (con `pesado`): muro + ventana en Planta Nivel 0; cambiar distancia en Propiedades → la planta
la dibuja en el lugar nuevo (comparar con su caja en 3D); seleccionarla con clic en planta;
moverla 0.50 hacia arriba en Alzado Sur. Capturas `docs/capturas/o069-*.png`.

Correr pytest, vitest y clippy completos. Informe `docs/progreso/O069.md` con salidas reales y la
causa encontrada de los fallos 1 y 2 (archivo y línea).
