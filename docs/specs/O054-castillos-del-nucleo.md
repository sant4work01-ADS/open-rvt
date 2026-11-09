# O054: castillos, trabes y cerramientos del ancho del núcleo; esquinas cerradas

Notas del dueño: `docs/notas-usuario/2026-11-07-cerramientos-y-castillos-0.5.28.md` (léela completa).
Modelo real: `docs/notas-usuario/capturas/2026-11-07/modelo-dueno-0.5.28.ifc`. Código: `nucleo/openrvt_nucleo/interacciones.py`
(`_capas_nucleo`, `_castillo_en`, `castillos_automaticos`, `_actualizar_castillos`, `_lineal_en_muro`), `uniones.py`.

## Decisiones ya tomadas (no las cambies)
1. **Ancho del núcleo por defecto.** Castillo, trabe, dala y cerramiento ligados a un muro miden, en la dirección del
   espesor del muro, el núcleo de ese muro. A lo largo del muro, la medida del tipo. El recubrimiento del muro los cubre.
2. **Castillo de esquina, T o cruce:** si el castillo cae a ≤ 0.05 m del cruce de ejes de núcleo de dos o más muros
   conectados, se centra en el cruce y mide núcleo del muro A × núcleo del muro B (cada lado igual al núcleo del muro
   perpendicular). Block 20 + Block 20 → 0.20 × 0.20. Aplica a `castillo_crear_en_muro`, `castillos_automaticos` y a los
   castillos existentes: se recalcula al abrir el IFC y al editar o mover muros (el modelo del dueño se repara solo al abrirlo).
3. **Sección propia:** opción por elemento en Propiedades, «Ancho: del núcleo / del tipo» (propiedad `AnchoDelMuro`).
   Con «del tipo» usa B × H del tipo. Si sobresale del núcleo, el muro (todas sus capas) termina en la cara del castillo;
   si no sobresale, el recubrimiento sigue corrido por encima.
4. **Medida real en el nombre.** Nombre del elemento, etiqueta en planta, Propiedades y cantidades dicen la sección real
   (p. ej. «Castillo 20×20», «Cerramiento 20×20»). El tipo conserva su nombre. Nunca más «15×15» si mide 15×20.
5. Sin huecos ni traslapes: en el cruce manda el castillo; los cerramientos se cortan en su cara.
6. Propiedades del cerramiento: quita el texto «la altura la manda el cerramiento» (el muro ya no cambia por él).
7. `OPENRVT_Estructura` → `Nivel` se muestra en Propiedades con el nombre del nivel, no el GlobalId (el dato guardado no cambia).

## Pruebas obligatorias (fallan si está mal; valores a mano)
- pytest `nucleo/tests/test_o054.py`:
  - Rectángulo 2.50 × 1.50 de ejes, 4 muros Block 20 (núcleo 0.20), cerramientos a Nivel 2 y castillos en las 4 esquinas:
    cada castillo 0.20 × 0.20 centrado en el cruce; en la franja del cerramiento el área en planta de
    cerramientos + castillos suma **1.60 m²** (anillo 2.70×1.70 − 2.30×1.30) y la suma de áreas individuales también
    da 1.60 (sin traslapes). Comprueba con la geometría real (`ifcopenshell.geom`), no con los psets.
  - Abrir `modelo-dueno-0.5.28.ifc`: mismos 1.60 m² en 2.20–2.40, castillos 0.20 × 0.20, nombres con medida real.
  - Castillo intermedio (no en esquina) en Block 15 con tipo 15×15: 0.15 a lo largo × núcleo de Block 15 en espesor.
  - «Del tipo» 0.30 × 0.30 en Block 15: el muro y sus capas terminan en las caras del castillo (volumen del muro baja lo
    que corresponde, calculado a mano en la prueba).
  - Cantidades: volumen de concreto de castillos y cerramientos del rectángulo = valor a mano, sin doble conteo.
  - Deshacer revierte el redimensionado en un paso; guardar y reabrir conserva todo.
- E2E `e2e/o054.test.js` con clics reales: abrir el modelo del dueño, captura 3D de cada esquina y de la planta con
  etiquetas, en `docs/progreso/O054/`. **Léelas como imagen** y di qué se ve.
- Además: pytest completo, `npx tsc --noEmit`, `npm run lint`, vitest `--maxWorkers=2`, E2E `o050`, `o045`,
  `cerramiento-dueno`, `cerramiento-niveles`, `cerramiento-rectangulo`.

## Entorno
Windows, Git Bash. `herramientas/preparar_python.sh windows` antes de cada E2E.
- E2E: `timeout 1500 pesado bash -c 'CARGO_TARGET_DIR="$HOME/.cache/pp-target/openrvt-o054" npx tauri build --debug --no-bundle >/tmp/o054-build.log 2>&1 && NODE_PATH="$PWD/../openrvt-o045/e2e/node_modules" CARGO_TARGET_DIR="$HOME/.cache/pp-target/openrvt-o054" node --test e2e/<archivo>'`
- pytest: `~/.venvs/openrvt/Scripts/python.exe -m pytest nucleo/tests -q` (con `pesado`).

## Reglas
- CRLF en `modelado.py`, `interacciones.py`, `Visor3D.tsx`, `estado.ts`. No toques `Visor3D.tsx` (es de O055) salvo
  que sea imprescindible; si lo tocas, dilo en el progreso.
- Sin push, merge, cambio de versión ni dependencias nuevas. Commits pequeños en la rama o054.
- Prohibido aplazar puntos o debilitar una prueba. Lo que no salga va como NO HECHO.
- Resumen en `docs/progreso/O054.md` con la salida real de cada prueba.
