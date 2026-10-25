# O001b — Comparar motores IFC para EDITAR (complemento de O001)

## Objetivo
El primer producto es un **editor** (decisión del usuario, 2026-10-24), no un visor. Esta prueba mide qué tan bien edita cada motor. Se trabaja en la misma rama y carpeta que O001 y se reutilizan sus scripts de medición.

## Prueba de edición: el mismo guion en los dos motores
Guiones: `evaluacion/a_editar.py` (IfcOpenShell, con `ifcopenshell.api`) y `evaluacion/b_editar.mjs` (web-ifc).

1. Crea un IFC4 nuevo con proyecto, sitio, edificio y 2 niveles (0.00 y 3.00 m) y unidades métricas.
2. **Muros:** 4 muros de 0.15 × 3.00 m que forman un rectángulo de 8 × 6 m (ejes), con tipo `IfcWallType` «Block 15» y capa de material de 0.15 m.
3. **Losa:** de 0.12 m sobre el nivel 1, con el contorno exterior de los muros.
4. **Puerta:** una puerta de 0.90 × 2.10 m en el muro sur, con su `IfcOpeningElement` (vano que corta el muro) y `IfcRelFillsElement`.
5. **Edición:** alarga el muro este 1 m, de modo que el rectángulo queda de 9 × 6 m, y el muro sur debe seguirlo, ya sea por la conexión o a mano. Cambia el espesor del tipo «Block 15» a 0.20 m y comprueba que los 4 muros se actualizan.
6. **Guardado:** guarda, vuelve a abrir con el **otro** motor, tesela y mide el volumen de malla de cada muro.

## Qué se mide (va en el informe de O001, sección «Edición»)
- **Pasos que el motor resuelve solo y los que hubo que programar a mano:** geometría del muro desde eje y espesor, vano que resta, conexiones entre muros, propagación del cambio de tipo.
- **Volumen esperado contra medido**, con 1 % de tolerancia:
  - muro sur con vano después de la edición: (9.0 × 3.0 − 0.9 × 2.1) × 0.20;
  - en los demás muros, el largo según las uniones que declare el guion.
- **Validez:** el IFC resultante abre en el otro motor y pasa `ifcopenshell.validate` sin errores de esquema.
- **Costo:** líneas de código de cada guion y tiempo de cada operación.

## Pruebas
`evaluacion/test_editar.py`: el IFC de IfcOpenShell tiene 4 muros, 1 losa, 1 puerta y 1 vano, y el volumen del muro sur coincide dentro del 1 %.

## Reglas
Las mismas de O001. No hagas push.
