# Proyectos libres a reciclar

Primera pasada (2026-10-22). Licencias tomadas de los repos oficiales cuando se pudo; las marcadas
«(verificar)» salen de fuentes secundarias. **Antes de copiar código, confirmar el LICENSE del repo.**

## Lo que importa de las licencias (resumen sin abogado)
- **LGPL** (IfcOpenShell, FreeCAD, OCCT): se puede **usar como biblioteca** desde nuestro programa
  sin que todo nuestro código tenga que ser LGPL; si modificamos la biblioteca, esos cambios se publican.
- **GPL-3.0** (Bonsai): si **copiamos o derivamos código** de Bonsai, OPEN-RVT tiene que ser GPL-3.0.
  Como la idea ya es software libre, probablemente no sea problema — pero amarra la licencia.
- **AGPL-3.0** (xeokit): como GPL, y además obliga a publicar el código aunque solo se use por red.
- **MIT / Apache-2.0 / MPL-2.0** (That Open, truck, web-ifc): las más libres para reciclar.

## IfcOpenShell — la pieza central
Repo: https://github.com/IfcOpenShell/IfcOpenShell · núcleo en C++ con API en Python.
Es una «caja de herramientas» IFC; casi todo es **LGPL-3.0-or-later**:

| Módulo | Qué hace | Por qué nos sirve |
|---|---|---|
| ifcopenshell (python + C++ ifcparse/ifcgeom) | Leer, escribir y generar geometría de IFC | Base de datos del modelo = el propio IFC |
| ifcopenshell.api | Funciones de alto nivel para editar el modelo (crear muro, asignar tipo…) | Lógica de edición ya resuelta |
| ifcconvert | IFC → OBJ, glTF, SVG, STEP, etc. | Exportar vistas y 3D |
| ifccsv | Exportar/importar cédulas (schedules) | Tablas de cantidades |
| **ifc5d** | Informes y optimización de **costos** desde IFC | **Puente natural con PresupuestosPro** |
| ifc4d | IFC ↔ software de programación de obra | Programa de obra |
| ifcclash | Detección de interferencias | Revisión de modelo |
| ifcdiff | Comparar versiones de un modelo | Control de cambios |
| ifctester | Validar el modelo con IDS (reglas) | Revisión de calidad |
| bcf | Incidencias BCF | Comentarios/revisiones |
| **ifcmcp** | Servidor MCP para consultar y editar IFC | **Base para el agente de IA asistente** |

## Bonsai (antes BlenderBIM) — el «Revit libre» más avanzado hoy
Add-on de Blender para modelar en **IFC nativo** (el archivo IFC es el modelo). **GPL-3.0-or-later**.
Vive dentro del mismo repo de IfcOpenShell. Trae flujo BIM completo: muros, losas, tipos, vistas,
**planos 2D (drawings en SVG)**, cédulas, costos (usa ifc5d) y programa (ifc4d).
- A favor: es lo más cercano a lo que queremos y está muy vivo.
- En contra: depende de Blender (interfaz de Blender, curva de aprendizaje alta para quien viene de
  Revit; pesado comparado con la meta de «abrir en segundos»).
- Cómo reciclarlo: estudiar sus flujos y su uso de ifcopenshell.api; reutilizar su lógica si
  aceptamos GPL-3.0.

## FreeCAD (BIM Workbench)
CAD paramétrico, **LGPL** (2.0+ según Wikipedia; verificar). Desde la 1.0 el BIM Workbench une Arch+BIM
y trae **NativeIFC** (edita el IFC directamente, también usando IfcOpenShell). Núcleo geométrico OCCT.
- Útil como referencia de herramientas paramétricas (muros, ventanas, escaleras) y de planos 2D.

## Open CASCADE Technology (OCCT)
Núcleo geométrico B-rep (sólidos, booleanas, STEP). **LGPL-2.1 con excepción** (verificar versión
actual). Lo usan FreeCAD e IfcOpenShell.

## That Open Engine (antes IFC.js)
- `@thatopen/components`: **MIT**. Para apps BIM en navegador: visor 3D, cotas, navegación en planta,
  exportar DXF.
- `web-ifc`: motor IFC en WASM, **MPL-2.0** (verificar en github.com/ThatOpen/engine_web-ifc).
- Útil si la interfaz es web/Tauri (como PresupuestosPro): visor 3D ligero sin Blender.

## Núcleos CAD en Rust (si vamos por Tauri + Rust)
- **truck** (ricosjp/truck): núcleo B-rep en Rust, **Apache-2.0**, activo (push mayo 2026). Madurez por evaluar.
- **Fornjot**: reportado como ya no en desarrollo con su alcance original; componentes extra en 0BSD. Solo referencia.

## Visores
- **xeokit-sdk**: visor BIM web muy bueno, pero **AGPL-3.0** + licencia comercial. Evitar salvo que
  OPEN-RVT sea AGPL.

## Pendiente de evaluar
LibreCAD / QCAD (2D, DXF), libredwg (DWG, GPL-3), IfcOpenShell-viewer, Speckle (intercambio),
OpenStudio/EnergyPlus (energía), BlenderBIM drawings como referencia de láminas.

## Fuentes
- https://github.com/IfcOpenShell/IfcOpenShell (tabla de módulos y licencias)
- https://github.com/ThatOpen/engine_components (MIT)
- https://wiki.freecad.org/Manual:BIM_modeling/en · https://en.wikipedia.org/wiki/FreeCAD
- https://github.com/ricosjp/truck · https://github.com/xeokit/xeokit-sdk
- https://alternativeto.net/software/blenderbim-add-on/about (renombre BlenderBIM → Bonsai, 2024)
