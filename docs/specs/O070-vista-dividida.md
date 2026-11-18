# O070 — Pantalla dividida en dos vistas

Pedido del dueño (17-nov): dividir el área de trabajo en 2 vistas distintas, redimensionables;
clic en una la activa y los mismos paneles laterales sirven para la vista activa.
Versión al integrar: **0.5.43** (O069 lleva la 0.5.42).

## Comportamiento
- Ribbon pestaña «Vista»: botones «Dividir vertical», «Dividir horizontal» y «Una vista».
  También clic derecho en una vista del navegador → «Abrir en el otro panel».
- Con la pantalla dividida hay 2 paneles, cada uno con SU vista (planta, alzado, corte, 3D), su
  cámara, su zoom y sus botones de zoom. Separador arrastrable entre los dos (mín. 20 % de
  cada lado), cursor de redimensionar, doble clic en el separador = 50/50.
- **Panel activo**: borde de color de acento de 2 px y su nombre en la barra del visor. Clic (o
  rueda, o arrastre) dentro de un panel lo activa ANTES de procesar el clic.
- El navegador de vistas abre la vista en el panel activo. La vista marcada en el navegador es la
  del panel activo.
- Propiedades de la vista, rango de vista, categorías, estilos: actúan sobre la vista del panel
  activo y se refrescan al cambiar de panel.
- Selección compartida: el elemento seleccionado se resalta en los dos paneles; Propiedades del
  elemento es una sola.
- Herramientas (Muro, Ventana, Mover…): trabajan en el panel activo; si el usuario cambia de
  panel con una herramienta a medias, se cancela (como Esc).
- Cualquier cambio del modelo redibuja los dos paneles. La geometría teselada se comparte (NO
  teselar dos veces).
- Estado guardado en el pset de vistas: dividida sí/no, orientación, proporción y vista de cada
  panel; al reabrir el IFC queda igual.
- Lo que hoy existe en una sola vista (atajos, Esc, Ajustar, pellizco del touchpad) funciona igual
  en el panel activo.

## Implementación (fija)
Dos instancias del visor actual, cada una con su canvas y su cámara; el estado de cámara/vista
por panel (`paneles: [{vistaId, camara}]`, `panelActivo: 0|1`) en el estado del modelo; las
funciones que hoy leen «la vista activa» leen la del panel activo. Componente nuevo
`visor/AreaDividida.tsx` (≤ 300 líneas). Archivos ≤ 600 líneas.

## Pruebas
vitest: dividir/unir; abrir vista en panel activo; cambiar panel cancela herramienta; propiedades
de vista muestran la del panel activo; la proporción del separador respeta el 20 %; estado
guardado y leído del pset.
E2E (con `pesado`): dividir vertical, Planta Nivel 0 a la izquierda y 3D Perspectiva a la derecha;
dibujar un muro en la planta → aparece en el 3D; seleccionar el muro en el 3D → resaltado en la
planta y en Propiedades; arrastrar el separador al 70 %; desactivar categoría Muros con el 3D
activo → solo el 3D los oculta. Capturas `docs/capturas/o070-*.png`.

Correr pytest, vitest y clippy completos. Informe `docs/progreso/O070.md` con salidas reales.
