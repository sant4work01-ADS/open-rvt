# Visión y alcance

## Para quién
Arquitectos e ingenieros recién egresados, despachos pequeños y estudiantes en México y Latinoamérica.

## Qué debe hacer (borrador, se irá nutriendo)
1. Modelar elementos de edificio: muros, losas, columnas, vigas, puertas, ventanas, escaleras, cubiertas.
2. Niveles, ejes y vistas: planta, cortes, alzados y 3D.
3. Familias / tipos paramétricos editables.
4. Planos y láminas para impresión (PDF), con cotas y etiquetas.
5. Cuantificación de cantidades → exportar a PresupuestosPro (conceptos y generadores).
6. Importar y exportar IFC; importar DWG/DXF como referencia.
7. A futuro: render y un agente de IA asistente (el mismo que se haga para PresupuestosPro).

## Qué NO es (al inicio)
- No es un clon 1:1 de Revit.
- No es colaborativo en la nube en la primera versión.

## Preguntas abiertas
- ¿Escritorio (Tauri + Rust como PresupuestosPro) o extender una base existente (Bonsai/Blender, FreeCAD)?
- ¿Qué núcleo geométrico (OCCT, truck, Fornjot) o qué motor IFC (IfcOpenShell, web-ifc)?
- ¿Cuál es el primer MVP útil? (propuesta: muros + losas + puertas/ventanas en planta y 3D, con
  exportación IFC y de cantidades a PresupuestosPro).
