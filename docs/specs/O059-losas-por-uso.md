# O059: losas por uso (firme, entrepiso, azotea)

Origen: el dueño (9-nov) quiere que firmes, entrepisos y azoteas «no se revuelvan».
Idea: `ideas/2026-11-09-tipos-de-losa-por-uso.md`. Base: main 0.5.32 (incluye O058).

## Qué se pide (decidido; no rediseñar)

Una sola herramienta Losa con un selector **Uso**. Tres usos:

| Uso (clave) | Etiqueta | PredefinedType | Name por omisión | Espesor por omisión |
|---|---|---|---|---|
| `firme` | Firme / losa de cimentación | BASESLAB | `Firme` | 0.10 |
| `entrepiso` | Entrepiso | FLOOR | `Losa de entrepiso` | 0.12 |
| `azotea` | Azotea | ROOF | `Losa de azotea` | 0.12 |

1. **Núcleo** (`modelado.py`, `losa_crear` l.~5196 y `losa_desde_muros` l.~5592): nuevo
   parámetro `uso` (por omisión `entrepiso`; inválido → error -32602 en español). Fija
   PredefinedType, Name y guarda `Uso` en el pset `OPENRVT_Losa`. Si el cliente no manda
   espesor, usa el de la tabla.
2. **Lectura única** `uso_de_losa(losa)` (un solo lugar, la usan todos): pset `Uso` →
   si falta, PredefinedType (BASESLAB→firme, ROOF→azotea) → si es FLOOR sin `Uso` y su nivel
   es el más bajo del proyecto → `firme`; si no → `entrepiso`. No reescribe el archivo al abrir.
3. **Propiedades**: campo «Uso» editable (select) en losas. Cambiarlo actualiza `Uso`,
   PredefinedType y el Name solo si el Name era uno de los de omisión. Deshacer lo revierte.
4. **Muros (O058)**: un `firme` nunca cubre la corona de un muro (solo apoya). Entrepiso y
   azotea siguen las reglas de O058 sin cambios.
5. **Cantidades** (`medicion.py`): las partidas de losa llevan el uso en el nombre
   («Área de firme», «Volumen de firme», «Área de losa de entrepiso», …, igual para azotea)
   para que no se sumen juntas. El total de área y volumen de todas las losas no cambia.
6. **Interfaz** (`BarraHerramienta.tsx`, herramienta losa): select `data-testid="losa-uso"`
   con las tres etiquetas, guardado en `opcionesLosa.uso` (por omisión `entrepiso`); se manda
   en crear y en «desde muros». Etiqueta en Propiedades: `data-testid="prop-uso-losa"`.
7. Fuera de alcance: plantillas de PresupuestosPro, pendientes de azotea, impermeabilizante.

## Pruebas (valores a mano)

- `nucleo/tests/test_o059.py`:
  a) Crear las tres en un rectángulo 4×5 (20 m²): PredefinedType, Name, `Uso`, espesor
     por omisión; volúmenes firme 2.00 m³, entrepiso 2.40, azotea 2.40.
  b) `uso_de_losa` con IFC viejo `nucleo/tests/datos/o057-fallo-dueno.ifc`: losas de N0 →
     firme, las demás → entrepiso; el archivo no cambia si solo se abre.
  c) Cambiar uso entrepiso→azotea y deshacer.
  d) Muro N0 con tope N1 y un firme en N1 a su corona: el firme NO baja la corona.
  e) Cantidades: partidas separadas por uso; suma de áreas = 60.00 m² y de volúmenes =
     6.80 m³ con las tres de (a).
  f) Uso inválido → error.
- `e2e/o059.test.js`: proyecto nuevo, dibujar firme en N0 y azotea en N1 con el selector,
  revisar Propiedades (uso), cambiar la de N1 a entrepiso, guardar, reabrir y comprobar;
  capturas en `docs/progreso/O059/` (3D y Cantidades), revisarlas como imagen.
- Batería: pytest completo (5 fallos previos de test_o035 conocidos), `npx tsc --noEmit`,
  `npm run lint`, vitest `--maxWorkers=2`, E2E o050, o054, o056, o057, o058, herramientas.
  Todo con `pesado`, Playwright/E2E de uno en uno.

## Entrega

Commits en la rama `o059`; `docs/progreso/O059.md` con salidas reales. Sin push, merge ni
cambio de versión.
