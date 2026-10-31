# Niveles: estilo, articulación y cotas (pedido del usuario, 2026-10-29)

Referencia: `img/niveles-referencia.jpg`. Al usuario no le gustan los niveles actuales. Los colores de la imagen son solo referenciales.

## Cómo deben verse
- **Línea de nivel**: trazo-punto, de lado a lado de la vista.
- **Cabeza del nivel** (extremo derecho): triángulo invertido relleno apoyado en la línea, con el texto `Npt +2.20m` (prefijo `Npt`, signo, 2 decimales, unidad). `Npt 0.00m` sin signo.
- **Articulación (codo)**: cuando dos niveles quedan muy juntos y sus cabezas se encimarían (ej. +2.00 y +2.20, 0.20 m), la cabeza se desplaza con una línea guía quebrada (codo) desde un punto sobre la línea del nivel hasta el triángulo. El codo se arrastra con pinzamientos (grips) y la app lo propone sola cuando hay traslape.
- **Cotas automáticas** a la derecha, entre la línea y la cabeza:
  - cadena de cotas entre niveles consecutivos (0.50, 1.00, 0.50, 0.20);
  - cota total del primer al último nivel (2.20) en una segunda fila;
  - se actualizan al mover un nivel.
- **Ejes (rejillas)**: burbuja circular arriba; la misma articulación con codo cuando una burbuja se enciman con otra (ver el primer eje de la imagen).

## Centrado del texto (pedido del usuario, 2026-10-30)
- El número o letra de la burbuja del eje (y el texto de la cabeza del nivel) hoy no queda bien centrado. Revisar y centrar de verdad: centro geométrico del glifo (no la línea base), horizontal y vertical, con 1, 2 o 3 caracteres (A, 12, A.1), a cualquier zoom y en impresión/exportación.

## Criterios
- El texto de burbujas y cabezas queda centrado (desviación ≤ 0.5 px a zoom 100 % y 400 %, medida con prueba).
- Ninguna cabeza ni burbuja se encima con otra en la vista por omisión.
- Las cotas suman exacto (la total = suma de la cadena) y usan la precisión del proyecto.
- Configurable por estilo de nivel: prefijo, decimales, unidad, tipo de cabeza, color y si lleva cotas.

## Fallo visto al revisar O015 (2026-10-30)
- En la vista de **corte** con dirección (0, 1) los textos de nivel y cotas salen **en espejo**
  («00.E+ I leviN»). Ya pasaba antes de O015 (`docs/capturas/o015-antes-corte.png`). Corregir en O014b:
  el texto siempre se lee de izquierda a derecha en cualquier dirección de corte/alzado (prueba con
  direcciones (0,1), (0,-1), (1,0), (-1,0) y una diagonal).

## Pendiente tras O014b (31-oct)
- El texto «Npt +2.00m» queda tachado por la propia línea de nivel: ponerlo ARRIBA de la línea con un margen.
- Cotas pequeñas (0.10, 0.20) se montan sobre líneas de extensión: texto fuera o con línea de referencia.
