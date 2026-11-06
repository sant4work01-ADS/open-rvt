# O046: prototipo de empujar/tirar en la vista 3D (modelado estilo SketchUp con BIM)

## Para qué
El dueño quiere modelar con la facilidad de SketchUp, pero con todo como BIM: cada sólido nace como un
elemento IFC (ver `ideas/2026-11-06-modelado-estilo-sketchup.md`). Esta tarea es la **prueba**: ver si se
siente bien antes de invertir en las fases 1-3.

**Sala limpia:** NO abras ni busques el código de IngeTrazo ni de SketchUp. Trabaja solo con esta spec y con el
código de OPEN-RVT.

## Qué hace (decisiones, no las cambies)
1. **Herramienta nueva «Empujar/Tirar»** (`herramienta: "empujar"` en `estado.ts`), con un botón en el ribbon
   (pestaña Modelar). Funciona en las vistas **3D (perspectiva e isométrica)**; en las plantas el botón queda
   deshabilitado, con el tooltip «Solo en 3D».
2. **Paso 1, contorno:**
   - clic en un punto del plano del **nivel activo** (rayo del ratón contra el plano z = cota del nivel), y
     clic en la esquina opuesta para formar un rectángulo alineado a X/Y;
   - vista previa: contorno y relleno translúcido, con la cota temporal de ancho × largo;
   - mientras está a medias, se puede teclear `ancho,largo` (en metros) + Enter: el rectángulo sale desde el
     primer punto, en la dirección hacia donde está el ratón.
3. **Paso 2, altura:**
   - al mover el ratón, la altura sigue el movimiento vertical en pantalla, proyectado sobre el eje Z del mundo
     en el punto del contorno. Es la vista previa del sólido extruido;
   - se puede teclear la altura + Enter;
   - clic o Enter confirma y Esc cancela todo sin dejar nada;
   - altura negativa = hacia abajo del nivel (permitido solo para «Genérico»; para el resto, error claro).
4. **Clasificación automática**, con un selector en la barra de la herramienta: Auto / Losa / Muro / Columna /
   Genérico. Auto decide así, con r = lado menor, R = lado mayor y h = altura:
   - h ≤ 0.30 → **Losa** (`losa_crear` con el rectángulo y espesor = h);
   - si no, r ≤ 0.35 y R ≥ 3·r → **Muro** (`muro_crear` por el eje largo, centrado, con altura h y el tipo de muro
     cuyo espesor sea el más cercano a r; si la diferencia es > 0.02 m, aviso «se usó el tipo X de Y cm»);
   - si no, R ≤ 0.80 y h ≥ 1.0 → **Columna** (`columna_crear` en el centro, con rotación 0 si R va en X, o π/2 si va en Y,
     altura h y el tipo de columna más parecido; si no hay tipo de esas medidas, se crea uno con el nombre
     «Columna r×R»);
   - si no → **Genérico**: método nuevo del núcleo `generico_crear(nivel, puntos, altura, nombre="Genérico")`,
     que crea un `IfcBuildingElementProxy` con `IfcExtrudedAreaSolid` del contorno, ligado al nivel,
     con cantidades `NetVolume` y `NetArea` de la base.
   - El mismo elemento elegido a mano ignora la regla.
5. **Deshacer:** cada sólido creado es un paso de deshacer; el Ctrl+Z existente lo quita completo.
6. Al confirmar, la herramienta sigue activa para dibujar el siguiente (como las demás herramientas).

## Pruebas obligatorias
- **vitest** (módulo puro nuevo `src/features/modelo/empujar.ts`, sin three.js de escena):
  - rayo contra plano horizontal: casos a mano (rayo vertical, oblicuo 45°, paralelo al plano → null);
  - clasificación: tabla de al menos 10 casos con su resultado esperado razonado en el comentario
    (0.15×4×2.6 → Muro; 4×5×0.12 → Losa; 0.3×0.3×2.6 → Columna; 2×2×1 → Genérico; borde h = 0.30 → Losa;
    r = 0.35, R = 1.05 → Muro; r = 0.35, R = 1.04 → Columna;…);
  - parseo de lo tecleado (`4,0.15`, `4 , 0.15`, `4;0.15`, `-1` para la altura y textos inválidos).
- **pytest:** `generico_crear` de 2 × 3 × 1.5 da un volumen de 9.000 m³ (a mano) y un área de base de 6.000 m²;
  queda en el nivel; deshacer lo quita; contorno de menos de 3 puntos o altura 0 → error claro sin cambiar el
  modelo.
- **E2E `e2e/o046.test.js` con clics reales** en la vista de perspectiva de un modelo nuevo:
  - un rectángulo tecleado `4,0.15` y altura `2.6` → 1 IfcWall de 4 m de largo y 2.6 de alto;
  - `5,4` y `0.12` → 1 IfcSlab de 20 m² de área;
  - `0.3,0.3` y `2.6` → 1 IfcColumn;
  - `2,2` y `1` → 1 IfcBuildingElementProxy de 4 m³;
  - Ctrl+Z quita el último; Esc a media operación no deja nada;
  - con el ratón, sin teclear: un sólido cualquiera (comprueba que se crea 1 elemento);
  - capturas en `docs/progreso/O046/` de: contorno a medias, vista previa de la altura y los 4 elementos, leídas
    como imagen y descritas en el progreso.
- **Comprobaciones finales:** `npx tsc --noEmit`, `npm run lint`, vitest `--maxWorkers=2`, pytest completo y los
  E2E o046, o045 y herramientas.

## Reglas
- `modelado.py`, `interacciones.py`, `Visor3D.tsx` y `estado.ts` conservan su fin de línea CRLF.
- Lo nuevo de geometría va en `empujar.ts`; en `Visor3D.tsx`, solo el cableado mínimo.
- Sin push, merge, cambio de versión ni dependencias nuevas.
- Todo lo pesado (E2E, pytest o vitest completos, `tauri build`) se corre con `pesado <comando>`; Playwright
  con `--workers=1`.
- Resumen en `docs/progreso/O046.md`: qué se siente bien, qué no y qué falta para las fases 1-3.
