# O067 — Cambiar la losa de nivel (y su desfase)

Queja del dueño (10-nov): no hay forma de mover una losa a otro nivel. Muros, columnas, zapatas y
cerramientos sí tienen «Nivel base»; la losa no. Versión al integrar: **0.5.40**.

## Qué hacer

### Núcleo (`nucleo/openrvt_nucleo/modelado/editar.py`, rama `IfcSlab`)
`elemento_editar(gid, cambios)` acepta en una losa:
- `nivel` (globalid de IfcBuildingStorey): reasigna el contenedor (`spatial_api.assign_container`) al nuevo nivel.
- `desfase` (m, número; negativo permitido): guarda `OPENRVT_Losa.Desfase`.
Con cualquiera de los dos: z del ObjectPlacement = `Elevation(nivel) + Desfase`; luego
`_regenerar_losa(losa)` y `_recalcular_uniones_estructura()` (el recorte contra trabes/columnas y
los muros que apoya/cubre deben rehacerse en la cota nueva). Una sola instantánea (un Deshacer
regresa todo). Nivel inexistente o desfase no numérico → error -32602 con mensaje en español, sin
tocar el modelo. El uso NO cambia solo (si era firme sigue firme).
Comprobar que `_mover_elementos_nivel` (mover un nivel) sigue moviendo la losa con su nivel nuevo.

### Panel (`src/features/modelo/PanelPropiedades.tsx`, bloque `esLosa`)
Antes de «Uso»: select «Nivel» (`data-testid="prop-nivel-losa"`) con los niveles del modelo, valor
= nivel actual de la losa; y `CampoEditable` «Desfase (m)» (`testid="elemento-desfase-losa"`,
paso 0.01). Llaman a `editar(gid, { nivel })` / `editar(gid, { desfase })`. Si las propiedades no
traen el nivel actual, agregarlo en lo que entrega el núcleo para el elemento (no adivinar en TS).

## Pruebas (valores a mano)
pytest `nucleo/tests/test_o067_losa_nivel.py`, modelo con N0 (0.00), N1 (3.00), N2 (6.00):
1. Losa 4×5 en N0 desfase 0, espesor 0.12 → editar nivel=N1 → contenedor N1, z = 3.00, Area = 20.00, Desfase = 0.
2. Luego desfase = -0.05 → z = 2.95; contenedor sigue N1.
3. Deshacer ×2 → contenedor N0, z = 0.00.
4. Cantidades por nivel (`cantidades_estructura(nivel=N1)`) cuentan la losa en N1 y ya no en N0.
5. Muro N1→N2 bajo la losa movida a N2: el muro queda cubierto (tope a la cara inferior de la losa, 6.00−0.12 si así lo hace O058); escribe el valor esperado de la regla actual.
6. Nivel inexistente → error, modelo sin cambios (mismo z y contenedor).
7. Mover el nivel N1 a 3.50 con la losa en N1 → z = 3.50 + desfase.
8. Validación `ifcopenshell.validate` del IFC guardado sin errores.
vitest: el panel de una losa muestra `prop-nivel-losa` con el nivel actual y al cambiarlo llama
`editar` con `{ nivel: <gid> }`.
E2E (con `pesado`, tras `herramientas/preparar_python.sh windows`): crear losa en Nivel 0, cambiarla
a Nivel 1 desde el panel, comprobar en el árbol del proyecto que cuelga de Nivel 1. Captura en
`docs/capturas/o067-losa-nivel.png`.

Correr pytest, vitest y clippy completos. Informe en `docs/progreso/O067.md` con las salidas reales.
