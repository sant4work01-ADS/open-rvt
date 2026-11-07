# Notas del dueño sobre 0.5.28 (7-nov)

Evidencia: `capturas/2026-11-07/` (2 capturas y su modelo). Datos leídos del IFC.
Modelo: 8 muros Block 20 en rectángulo 2.50 × 1.50 (N0→N1 de 0 a 2.20, N2→N3 de 2.40 a 3.00),
niveles 0 / 2.20 / 2.40 / 3.00 / 3.20 / 3.60, cerramientos en Nivel 2 (2.20–2.40), 4 castillos, 2 losas, 4 zapatas.

## 1. Las esquinas del cerramiento quedan sin cerrar (`esquinas-cerramiento.png`)
El dueño marcó las 4 esquinas. Medido en la geometría del IFC: los castillos van de 0 a 3.60 y atraviesan el
cerramiento (2.20–2.40). La columna manda y corta el cerramiento en la cara del castillo. Como el castillo mide 0.15
en un muro de 0.20, queda una franja vacía de 0.025 × 0.20 por el lado exterior de cada esquina.
Debe: cerrar la esquina como los muros, sin huecos ni traslapes que dupliquen volumen o acero.

## 2. Castillo 15×15 falso (`castillo-15x15-falso.png`)
El nombre dice 15×15, pero con `AnchoDelMuro = true` mide B 0.15 × H 0.20 (el dueño acotó .15 y .20 en planta).
Lo que dice el nombre no es lo que hay en el modelo; afecta cantidades y acero.

## 3. Hallazgos al revisar el modelo (no los marcó el dueño)
- **Mismo engaño en el cerramiento:** tipo «15×20», pero B 0.20 × H 0.20.
- **Castillo de esquina según el muro donde se colocó:** B va a lo largo del muro y H = núcleo, por eso en (2.5, 0)
  queda 0.20 × 0.15 y en las otras 0.15 × 0.20. En una esquina hay dos muros y ninguna de las dos orientaciones la llena.
- **Texto viejo en Propiedades del cerramiento:** «la altura la manda el cerramiento». Ya no es cierto: el muro no cambia.
- **OPENRVT_Estructura muestra el GlobalId en `Nivel`,** no el nombre del nivel.

## 4. Regla del dueño: castillos, trabes y dalas contra el muro
- Normal: el elemento es del ancho del núcleo del muro, y el recubrimiento del muro lo cubre por completo.
- También puede no ser así y sobresalir: entonces el muro se restringe al lado del castillo.
- El dueño dice que la herramienta Muro funciona bien y pregunta si sirve de base para estos elementos.

## 5. Propuesta técnica (pendiente de que el dueño la apruebe)
- Reusar de Muro: trazo en cadena, enganches, longitud tecleada, cota temporal y línea de ubicación por núcleo.
- No reusar el inglete de muros en estructura: `uniones.py` ya da la regla de concreto (columna manda, traslape en esquina).
- Ancho: por defecto «del núcleo del muro»; opción de sección propia. Nombre, etiqueta y cantidades dicen la medida real.
- En una esquina o cruce de muros, el castillo mide núcleo × núcleo de los muros que recibe (0.20 × 0.20 en Block 20).
- Si la sección propia sobresale del muro, el muro termina en la cara del castillo.

## 6. Pedido del dueño: anotaciones en vistas 3D
- En las vistas 3D quiere poder activar ejes, niveles, cotas y demás anotaciones.
- Quiere poder agregar notas, y que sean visibles en cualquier modo de vista.

## Criterio de cierre
Abrir este mismo modelo, ver las esquinas cerradas en 3D y que el dueño lo confirme.
