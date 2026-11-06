# O047: motor de inferencias 3D (módulo puro), fase 1 del modelado estilo SketchUp

## Para qué
Es la fase 1 de `ideas/2026-11-06-modelado-estilo-sketchup.md`: al dibujar en 3D, el cursor se «pega» a puntos y
direcciones útiles, como en los modeladores de empujar/tirar. En esta tarea va **solo el módulo puro y sus
pruebas**; la integración a la vista 3D se hace después, junto con O046, que corre en paralelo. No toques
`Visor3D.tsx` ni `estado.ts`.

**Sala limpia:** NO abras ni busques el código de IngeTrazo ni de SketchUp. Trabaja solo con esta spec.

## Qué hace (decisiones, no las cambies)
Archivo nuevo `src/features/modelo/inferencias3d.ts` (sin dependencias nuevas; puede importar tipos de
`three` como `Vector3`/`Ray`/`Camera`, pero la lógica debe probarse sin escena ni WebGL).

```ts
inferir(entrada: EntradaInferencia): Inferencia
```
- **Entrada:**
  - `rayo` (origen y dirección del cursor en el mundo);
  - `proyectar(p) → {x, y}` en píxeles de pantalla (función inyectada);
  - `candidatos`: vértices, aristas (segmentos 3D) y caras planas (polígono 3D con su normal) de la escena
    cercana;
  - `puntoPrevio?`: último punto fijado de la herramienta;
  - `planoTrabajo`: plano del nivel activo;
  - `bloqueo?`: dirección bloqueada (eje X/Y/Z o la de una arista) por Shift o flechas;
  - `tolerancia_px` (por omisión 10).
- **Salida:**
  - `punto` 3D;
  - `tipo`: `"extremo" | "medio" | "sobre_arista" | "interseccion" | "sobre_cara" | "eje_x" | "eje_y" | "eje_z" |
    "paralelo" | "perpendicular" | "plano"`;
  - `referencia` (índice del candidato o eje);
  - `guia?`: segmento para dibujar la línea punteada de inferencia.
- **Prioridad**, de mayor a menor: extremo > medio > intersección de dos aristas > sobre arista > eje desde
  `puntoPrevio` (X rojo, Y verde, Z azul) > paralelo/perpendicular a una arista vista > sobre cara > plano de
  trabajo.
  - Dentro de la misma prioridad gana la menor distancia en píxeles.
  - Una de menor prioridad solo gana si está más cerca por más de 3 px.
- **Tolerancias en píxeles** (medidas con `proyectar`), nunca en metros: así funcionan igual de cerca que de lejos.
- **Ejes desde `puntoPrevio`:**
  - el punto sobre la recta del eje más cercano al rayo (distancia entre rectas), si su distancia en pantalla al
    cursor es ≤ `tolerancia_px`;
  - con `bloqueo`, el resultado siempre cae sobre esa recta, aunque esté lejos.
- **Paralelo/perpendicular:** a las aristas que pasan en pantalla a ≤ 40 px del cursor, desde `puntoPrevio`.
- **Sobre cara:** intersección del rayo con el plano de la cara y prueba de punto dentro del polígono. Gana la más
  cercana a la cámara.
- Un candidato **detrás** de la cámara o tapado por una cara más cercana no cuenta. Para lo tapado, basta comparar
  la profundidad a lo largo del rayo contra la cara más cercana intersecada.

## Pruebas obligatorias (vitest, `inferencias3d.test.ts`)
Usa una cámara ortográfica y una de perspectiva sintéticas con su `proyectar`, y casos calculados a mano y
explicados en el comentario:
- cursor a 5 px de un vértice → extremo; a 12 px → no;
- el mismo caso con la cámara 10 veces más lejos → mismo resultado (tolerancia en px);
- punto medio de una arista de (0,0,0) a (4,0,0) → (2,0,0);
- dos aristas que se cruzan → intersección exacta;
- desde `puntoPrevio` (1,1,0) con el cursor cerca del eje X → punto con y = 1 y z = 0;
- bloqueo Z desde (1,1,0) con el cursor lejos → x = 1, y = 1 y z según el rayo;
- paralelo a una arista oblicua de 30°;
- perpendicular;
- prioridad: extremo a 6 px contra eje a 2 px → gana el eje (más de 3 px más cerca); a 4 px → gana el extremo;
- vértice tapado por una cara → no cuenta;
- candidato detrás de la cámara → no cuenta;
- sin candidatos → plano de trabajo; rayo paralelo al plano → resultado nulo y documentado.

## Comprobaciones finales
`npx tsc --noEmit`, `npm run lint` y vitest `--maxWorkers=2` del archivo nuevo y de la suite completa, con `pesado`.

## Reglas
- Sin push, merge, cambio de versión ni dependencias nuevas.
- Resumen en `docs/progreso/O047.md`, con la API final y cómo cablearla en la herramienta de O046.
