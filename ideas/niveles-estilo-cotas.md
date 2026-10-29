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

## Criterios
- Ninguna cabeza ni burbuja se encima con otra en la vista por omisión.
- Las cotas suman exacto (la total = suma de la cadena) y usan la precisión del proyecto.
- Configurable por estilo de nivel: prefijo, decimales, unidad, tipo de cabeza, color y si lleva cotas.
