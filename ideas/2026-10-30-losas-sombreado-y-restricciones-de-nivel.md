# Losas sombreadas y restricciones de nivel superior/inferior (pedido del usuario, 2026-10-30)

## 1. Sombreado de losas
- Hoy la losa no se ve sombreada (relleno/achurado) en las vistas. Debe mostrarse con relleno
  en planta y con achurado de corte en cortes/elevaciones, como el resto de elementos cortados.
- Patrón y color definidos por el tipo/material de la losa (configurable), igual en pantalla,
  impresión y exportación.

## 2. Restricción de base y tope por nivel (spec aparte)
- Elementos verticales (muros, columnas; luego escaleras, etc.) con:
  - **nivel inferior (base)** + desfase;
  - **nivel superior (tope)** + desfase, o «sin conexión» con altura fija.
- Al mover la cota de un nivel, los elementos ligados cambian su altura/posición solos.
- Panel de propiedades con ambos combos de nivel; validación: tope por encima de base
  (altura > 0), aviso si se borra un nivel con elementos ligados.
- En IFC: exportar/leer la relación con IfcBuildingStorey y las alturas resultantes.

## Criterios (para la spec)
- Prueba: muro base N0 (0.00), tope N1 (+3.00) → altura 3.00; mover N1 a +3.20 → 3.20.
- Con desfases: base N0 +0.10, tope N1 −0.20 → altura 2.70.
- Losa visible con relleno en planta y achurado en corte (captura en E2E).

## 2026-10-31: zapatas «sobre o bajo» el nivel (pospuesto)
El usuario: por ahora basta con que la zapata cuelgue del nivel (desplante hacia abajo). A futuro: campo
«Cara de referencia» (superior al nivel / inferior apoyada sobre el nivel / desplante) como Revit, y quitar
la restricción de tope en zapatas.
