# O052: recorrido del dueño por las demás herramientas

Pedido del dueño (6-nov): «hay demasiado que pulir, ya tenemos rato en desarrollo». Sus reportes rara vez salen en las
pruebas porque estas llaman al núcleo o usan casos a modo. Aquí se usa la app como él: solo clics y teclas.

## Qué hacer
Escribe `e2e/o052.test.js`, con este recorrido en un modelo nuevo, en orden y sobre el mismo archivo. Tras cada paso
comprueba el resultado real (elementos, medidas, avisos) y toma captura en `docs/progreso/O052/`. **Lee cada captura como
imagen.** Antes del recorrido crea niveles 0 / 2.60 / 5.20 con el cuadro de Nivel.

1. Retícula 2 × 2 de 4 × 3 m. Zapatas en los 4 cruces. Columna en cada cruce.
2. Contratrabe entre dos ejes. Trabe en Planta Nivel 1 entre dos columnas. Dala sobre un muro.
3. Muros en cadena sobre los ejes (5 clics, cierra el rectángulo), con longitud tecleada en uno. Esquinas limpias en planta.
4. Puerta y ventana en un muro. Voltear con Espacio. Mover la puerta. Borrarla. Deshacer y Rehacer.
5. Mover un muro: lo que está ligado lo sigue. Copiar un muro **con su ventana**. Espejo y Matriz de una columna.
6. Recortar/Extender dos muros que no llegan. Alinear uno a un eje.
7. Cambiar la elevación de Nivel 1 de 2.60 a 2.80: muros, columnas y trabes se ajustan en alzado y 3D.
8. Corte y las 4 vistas de alzado: nada desaparece ni se ve en espejo. 3D: orbita y selecciona.
9. Cantidades: compara con el cálculo a mano de muros y losa de ese modelo, escrito en un comentario de la prueba.
10. Guardar, cerrar, abrir: mismo número de elementos y mismas medidas.

## Qué hacer con lo que falle
Por cada falla, en este orden: anótala en `docs/progreso/O052.md` (paso, qué se esperaba, qué pasó, captura), encuentra la
causa, corrígela y deja la prueba en verde. Un commit por falla. Sigue con el siguiente paso; no te quedes atorado: si una
falla te lleva más de 40 pasos, márcala **NO HECHO** con la causa y continúa.

Solo se arreglan errores: **no agregues funciones ni cambies comportamiento** que ya funciona. Si un paso no existe como
función, anótalo como «no existe» y sáltalo. Si dudas de cómo debe comportarse, anótalo como pregunta para el dueño.

## NO toques
Cerramientos, castillos, dibujo de losa y `losa_crear`: son de O050, que corre a la vez. Evita tocar `estado.ts` y
`modelado.py` salvo cambios pequeños y localizados, para no chocar con O050.

## Entorno
Windows, Git Bash. Rama o052, en el worktree actual. `herramientas/preparar_python.sh windows` antes de los E2E.
- E2E: `timeout 1500 pesado bash -c 'CARGO_TARGET_DIR="$HOME/.cache/pp-target/openrvt-o052" npx tauri build --debug --no-bundle >/tmp/o052-build.log 2>&1 && NODE_PATH="$PWD/../openrvt-o045/e2e/node_modules" CARGO_TARGET_DIR="$HOME/.cache/pp-target/openrvt-o052" node --test e2e/o052.test.js'`
- Toma como ejemplo `e2e/o051.test.js` para los clics y teclas reales.

## Reglas
- CRLF en `modelado.py`, `interacciones.py`, `Visor3D.tsx`, `estado.ts`.
- Sin push, merge, cambio de versión ni dependencias nuevas.
- Prohibido debilitar una prueba para que pase.
- Al final: `npx tsc --noEmit`, `npm run lint`, vitest `--maxWorkers=2` con `pesado`, pytest
  (`~/.venvs/openrvt/Scripts/python.exe -m pytest nucleo/tests -q`, con `pesado`). Salidas reales en `docs/progreso/O052.md`.
