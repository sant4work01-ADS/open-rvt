# O062: el muro no muestra líneas en las franjas de cerramiento y losa

Origen: prueba del dueño de la 0.5.34 (capturas `docs/notas-usuario/2026-11-09-o062-{4,5,6}.png`).
Obra: `nucleo/tests/datos/o061-fallo-dueno.ifc`. Base: main 0.5.34. No decides diseño.

## Causa

`_cuerpo_muro` (`modelado.py` ~l.2892) arma el cuerpo como prismas apilados por tramo vertical
(`_tramos_verticales_muro`). Cada tramo lleva su tapa superior e inferior. El visor dibuja aristas
con `THREE.EdgesGeometry(geometria, 30)` (`Visor3D.tsx` l.2750). El borde de cada tapa interna
forma 90° con la cara lateral, así que aparece una línea horizontal en 2.20, 2.40, 3.08 y 3.20
sobre una cara exterior que es plana y continua.

## Regla

La malla del muro debe ser una sola superficie cerrada (manifold), con vértices compartidos:
- Las caras laterales coplanares de tramos consecutivos comparten vértices y aristas, sin
  vértices sueltos en T. Si hace falta, triangula la cara completa con sus cortes.
- Las caras horizontales internas solo existen donde la sección cambia: la diferencia simétrica
  entre la sección de abajo y la de arriba (por ejemplo, el hueco del cerramiento dentro del muro).
  Nunca va una tapa entre dos tramos con la misma sección.
- Mismo volumen y mismas cantidades que hoy: el volumen por la malla y por el núcleo no cambia
  respecto a main (comparar con valores a mano de test_o058 y test_o061).
- Aplica igual a los castillos partidos por losas (`_tramos_columna_por_losas`) y a cualquier
  elemento que hoy se apile por tramos.

## Pruebas

- `nucleo/tests/test_o062.py` con la obra del dueño. Implementa en Python la misma detección que
  `EdgesGeometry(…, 30)`: une vértices a 1e-6, saca las aristas cuyo ángulo diedro es mayor de 30°
  o que tienen una sola cara. Comprueba que:
  a) Ningún muro tiene aristas de borde (con una sola cara): la malla está cerrada.
  b) Sobre las caras exteriores de cada muro (y = −0.10, y = 1.60, x = −0.10, x = 2.60) no hay
     ninguna arista marcada con z estrictamente entre 0.12 y 3.60. Hoy falla en 2.20, 2.40, 3.08
     y 3.20.
  c) Volumen de la malla de cada muro igual al de main (valores a mano, tolerancia 1e-6).
  d) Lo mismo con el muro de `o058-muro-n0-n5.ifc`.
- E2E: vuelve a correr `e2e/o061.test.js` (o un `e2e/o062.test.js` con la misma obra) con
  capturas 3D de cerca en `docs/progreso/O062/`. Revísalas como imagen: la cara del muro sin líneas
  horizontales en las franjas.
- Batería: pytest completo (0 fallos), tsc, lint, vitest --maxWorkers=2, E2E o035, o050, o054,
  o056, o057, o058, o059, o061, herramientas; todo con `pesado`, uno a la vez. Revierte las
  capturas ajenas.

## Entrega

Rama `o062`, commits por punto, `docs/progreso/O062.md` con salidas reales. Sin push, merge ni versión.
