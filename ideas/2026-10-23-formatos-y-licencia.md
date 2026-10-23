# Formatos (RVT, OPUS) y licencia

Fecha: 2026-10-23 · Decisión del usuario.

- Licencia del proyecto: **GPL-3** (copyleft): abierto y que nadie pueda cerrarlo. Se pueden integrar librerías GPL/LGPL
  (IfcOpenShell, Bonsai, LibreDWG, Blender). Descartado lo cerrado/de pago (ODA BimRv, APIs de Autodesk).
- Prioridad: **aceptar formatos abiertos (IFC) y OPUS**, aunque no se gane dinero.

## RVT → no se usa
Decisión final: **solo IFC**. Revit exporta e importa IFC; OPEN-RVT no leerá ni escribirá .rvt.

## OPUS
- Sin cifrar: lectura vía SqlLocalDB (ya en PresupuestosPro, crate datos/importar_opus).
- Cifradas: solo detectar y avisar (spec 047). Un descifrador publicado requiere consulta legal (LFDA 2020:
  protección técnica, con excepción de interoperabilidad).
