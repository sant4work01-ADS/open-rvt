# Caminos posibles (sin decidir)

Borrador para discutir cuando arranquemos. Nada de esto está decidido.

## A. Sobre Bonsai/Blender
Usar Blender + Bonsai como base y hacer encima una capa «tipo Revit» (paneles, atajos, plantillas en
español, normativa MX) y el enlace a PresupuestosPro.
- + Lo más rápido para tener algo completo. + Planos, costos y programa ya existen.
- − Pesado; interfaz de Blender; GPL-3.0 obligatoria.

## B. Programa propio con IfcOpenShell como motor
App de escritorio propia (Tauri como PresupuestosPro, o Qt) que usa IfcOpenShell (LGPL) para el
modelo y la geometría, y un visor ligero (That Open / three.js) para 3D y planta.
- + Ligero, interfaz pensada para quien viene de Revit, misma familia que PresupuestosPro.
- − Más trabajo: herramientas de modelado y planos se hacen nosotros (copiando ideas de Bonsai/FreeCAD).
- Ojo: IfcOpenShell es C++/Python; desde Rust habría que enlazar C++ o correr Python como servicio.

## C. Híbrido por etapas
1. Empezar con B solo como **visor + cuantificador IFC → PresupuestosPro** (útil desde el día uno:
   abrir el IFC que te pasan y sacar cantidades a presupuesto).
2. Agregar edición sencilla (muros, losas, vanos) con ifcopenshell.api.
3. Planos 2D y láminas.
4. Familias paramétricas y lo demás.

Primera impresión (Opus): C es la más realista; el paso 1 ya aporta y conecta con PresupuestosPro.
