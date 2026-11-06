# Modelado estilo SketchUp con BIM al 100 % (idea del dueño, 6-nov)

El dueño vio IngeTrazo (ingelibre, GPL-3.0, Python + Qt): un modelador libre muy inspirado en SketchUp,
con BIM como una capa opcional de etiquetas sobre la malla. Lo quiere así de fácil de usar, pero con BIM
completo y orientado a arquitectura e ingeniería: «inspirado descaradamente en SketchUp».

## Propuesta
- No hacer un programa nuevo: agregar a OPEN-RVT un **modo de modelado tipo SketchUp** sobre el núcleo
  IFC que ya existe (IfcOpenShell).
  - empujar/tirar;
  - motor de inferencias (ejes, paralelo, perpendicular, puntos medios);
  - cinta métrica y medidas tecleadas;
  - grupos y componentes;
  - órbita fluida.
- **Diferencia clave con IngeTrazo:** cada sólido nace como un elemento IFC con tipo, nivel y
  restricciones (muro, losa, columna…), no como malla etiquetada después. Lo que no se pueda clasificar
  queda como `IfcBuildingElementProxy`.
- MCP desde el inicio, con pocas herramientas y un recetario, como el de IngeTrazo (ver la prueba del 5-nov:
  una casa sale en una sola llamada).

## Licencias
- La forma de trabajar de SketchUp (empujar/tirar, inferencias, interfaz) se puede imitar: los flujos y las ideas no
  tienen derechos de autor, y la patente original del modelado de SketchUp (US 6,628,279, de 2000) ya
  venció.
- No se puede usar el nombre, el logo, los iconos, los textos de su ayuda ni el 3D Warehouse.
- El código de IngeTrazo es GPL-3.0: solo se puede copiar si OPEN-RVT se publica también como GPL. Mientras
  la licencia siga privada, solo sirve como referencia de ideas.
- Leer `.skp` para interoperar se puede, pero el lector de IngeTrazo es GPL. Habría que escribir uno propio
  o decidir publicar como GPL.

## Pendiente de decisión del dueño
- ¿OPEN-RVT pasa a GPL? Si pasa, se puede reutilizar código de IngeTrazo, como el lector `.skp` y la geometría;
  si no, se construye todo propio.
- Respeta la directriz del 26-oct («que funcione bien lo que hay»): esto entra cuando el dueño lo ordene.
