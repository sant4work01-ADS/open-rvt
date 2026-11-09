# O061: losas sin cortes falsos y muro que cubre cerramientos y losa

Origen: prueba del dueño de la 0.5.33 (9-nov). Captura `docs/notas-usuario/2026-11-09-o061.png`,
bitácora `docs/notas-usuario/2026-11-09-o061-bitacora.jsonl`, obra `nucleo/tests/datos/o061-fallo-dueno.ifc`.
Base: main (0.5.33 + O060). No decides diseño.

## Datos de la obra del dueño (medidos)

Niveles N0 0.00, N1 0.12, N2 2.20, N3 2.40, N4 3.00, N5 3.20, N6 3.60. Retícula 2.50 × 1.50.
Cuatro zapatas con dado 0.40×0.40, cara superior del dado en 0.00. Firme (BASESLAB) en N1:
0.00–0.12. Azotea (ROOF) en N5: 3.08–3.20. Cuatro muros de tipo Block 20 (0.20) de N1 a N6
(0.12–3.60). Castillos 15×15 de 0.00 a 3.60. Cerramientos en N3 de 2.20 a 2.40, con
`AnchoDelMuro = True` pero B = 0.15.

## Fallos y reglas

1. **Recorte de losa sin altura.** `_regenerar_losa` (`modelado.py` ~l.5200) llama a
   `uniones.recortar_losa(..., -espesor, 0.0)` en **coordenadas locales**, pero las barras y
   columnas vienen en **cotas absolutas**. Por eso la azotea (3.08–3.20) sale cortada por los dados
   (≤ 0.00) y el firme también; los huecos dejan ver los castillos.
   Regla: el intervalo vertical de la losa es absoluto (elevación del nivel + desfase − espesor …
   elevación del nivel + desfase). Solo recorta un elemento cuyo intervalo se traslape con el de
   la losa **más de la tolerancia** (tocar en una cara no recorta: el dado con cara superior en
   0.00 no recorta un firme de 0.00–0.12).
   Además, **los castillos y los dados nunca recortan una losa**: la losa es continua sobre ellos.
   El área y el volumen de la losa son los de su contorno completo.
2. **Castillo contra losa.** Donde un castillo cruza una losa, el castillo se parte (como el muro en
   O058): su volumen excluye la franja de la losa. Así el concreto no se cuenta dos veces. Los
   cerramientos siguen terminando en la cara del castillo, como ahora.
3. **Cerramiento «ancho del muro».** Con `AnchoDelMuro = True`, B toma el espesor real del muro que
   lo soporta (0.20 en Block 20), al crearlo, al cambiar el tipo del muro y al reabrir una obra
   (se repara al abrir, como `reparar_cerramientos` de O057). Lo mismo para los castillos que
   tengan `AnchoDelMuro = True`.
4. **El muro solo resta lo que de verdad ocupa el elemento.** En `_cuerpo_muro` (O058), el
   elemento intermedio se resta como **sólido** (huella del elemento ∩ huella del muro, en su
   franja vertical), no como toda la franja del muro. Si el elemento es más angosto que el muro,
   el muro queda a sus lados y su cara se ve continua. El volumen del muro baja solo por el
   volumen intersectado.
5. **Nombre del muro.** Si el Name es el de omisión de un tipo («Muro Block 15») y el tipo cambia,
   el Name pasa al del nuevo tipo («Muro Block 20»). Un Name puesto por el usuario no se toca.

## Pruebas (valores a mano)

- `nucleo/tests/test_o061.py` con la obra del dueño:
  a) Al abrir y regenerar, el firme y la azotea tienen `Recorte` igual a su contorno:
     rectángulo −0.10…2.60 × −0.10…1.60 = 2.70 × 1.70 = **4.59 m²**; volumen 4.59 × 0.12 =
     **0.5508 m³** cada una (hoy dan 4.23 m²).
  b) Cerramientos: B = 0.20; caras en y 1.40–1.60 (eje B) y 1.40/−0.10–0.10 (eje A).
  c) Castillo de esquina (0,0): z 0.00–3.60. Volumen = 0.15 × 0.15 × (3.60 − 0.12 firme −
     0.12 azotea) = 0.0225 × 3.36 = **0.0756 m³**.
  d) Muro del eje A (2.50 × 0.20, 0.12–3.60): la cara exterior y = −0.10 tiene vértices de 0.12 a
     3.60 sin hueco en 2.20–2.40 cuando el cerramiento mide 15 (caso con B forzado a 0.15 y
     AnchoDelMuro False): el muro conserva 2 franjas de 0.025 a los lados del cerramiento.
  e) Un dado que solo toca la cara inferior del firme no lo recorta; una trabe que sí se traslapa
     con una losa sí la recorta (la regla vieja sigue viva donde corresponde).
  f) Cambiar el tipo del muro de Block 20 a Block 15: Name «Muro Block 15» y cerramientos B 0.15.
- `e2e/o061.test.js`: abrir la obra del dueño, captura 3D isométrica igual a la del dueño
  (`docs/progreso/O061/01-3d.png`) y una vista de cerca de una esquina; revísalas como imagen: sin
  huecos en losas, sin castillos a la vista, muro continuo sobre cerramientos.
- Batería: pytest completo (0 fallos), tsc, lint, vitest --maxWorkers=2, E2E o035, o050, o054,
  o056, o057, o058, o059, herramientas; todo con `pesado`, uno a la vez.

## Entrega

Rama `o061`, commits por punto, `docs/progreso/O061.md` con salidas reales. Sin push, merge ni versión.
