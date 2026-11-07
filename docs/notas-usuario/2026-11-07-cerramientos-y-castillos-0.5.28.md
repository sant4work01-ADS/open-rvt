# Notas del dueño sobre 0.5.28 (7-nov)

Evidencia: `capturas/2026-11-07/` (2 capturas y su modelo). Datos leídos del IFC.
Modelo: 8 muros Block 20 en rectángulo 2.50 × 1.50 (N0→N1 de 0 a 2.20, N2→N3 de 2.40 a 3.00),
niveles 0 / 2.20 / 2.40 / 3.00 / 3.20 / 3.60, cerramientos en Nivel 2 (2.20–2.40), 4 castillos, 2 losas, 4 zapatas.

## 1. Las esquinas del cerramiento quedan sin cerrar (`esquinas-cerramiento.png`)
El dueño marcó las 4 esquinas. Cada cerramiento va de eje a eje (X1 0 → X2 2.5) con ancho 0.20, así que
termina en el cruce de ejes y falta el cuadro exterior de 0.10 × 0.10 en cada esquina.
Debe: cerrar la esquina como los muros, sin huecos ni traslapes que dupliquen volumen o acero.

## 2. Castillo 15×15 falso (`castillo-15x15-falso.png`)
El nombre dice 15×15, pero con `AnchoDelMuro = true` mide B 0.15 × H 0.20 (el dueño acotó .15 y .20 en planta).
Lo que dice el nombre no es lo que hay en el modelo; afecta cantidades y acero.

## 3. Hallazgos al revisar el modelo (no los marcó el dueño)
- **Mismo engaño en el cerramiento:** tipo «15×20», pero B 0.20 × H 0.20.
- **Castillos con giro distinto por esquina:** Rotación 0, 0, −90° y 180°. El de la esquina (2.5, 0) queda
  0.20 × 0.15 y los otros 0.15 × 0.20; en planta no coinciden entre sí.
- **El castillo no llena la esquina del muro:** 0.15 de ancho contra 0.20 del muro.
- **Texto viejo en Propiedades del cerramiento:** «la altura la manda el cerramiento». Ya no es cierto: el muro no cambia.
- **OPENRVT_Estructura muestra el GlobalId en `Nivel`,** no el nombre del nivel.

## Por decidir antes de la spec
Sección real cuando el muro es más ancho que el tipo: ¿el elemento toma el ancho del muro y su nombre lo dice, o
conserva la sección del tipo? Recomendación: tomar el ancho del muro y mostrar la medida real en nombre, etiqueta y cantidades.

## Criterio de cierre
Abrir este mismo modelo, ver las esquinas cerradas en 3D y que el dueño lo confirme.
