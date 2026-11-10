# O066 — Copiar sin perder datos y abrir un IFC ajeno sin modificarlo

Origen: auditoría del 9-nov, hallazgos 5 y 8. Primero la prueba que falla, luego el arreglo.
Lo nuevo en módulos propios (300–600 líneas).

## 1. Copia genérica completa (modelado/copiar.py, rama genérica de `_copiar_elementos`)
- La copia de cualquier clase que no sea muro/losa/estructura recibe: el mismo contenedor espacial
  (`ContainedInStructure` del original → `assign_container`), el mismo tipo (`assign_type` si el
  original tiene `IsTypedBy`) y copia de TODOS sus psets y qtos (incluidos los OPENRVT_*), como
  psets nuevos (no compartidos con el original).
- Prueba: puerta suelta, IfcRailing y IfcMember con tipo, nivel y 2 psets → la copia tiene mismo
  nivel, mismo tipo, psets con los mismos valores; editar un pset de la copia no cambia el original.

## 2. IFC ajeno: abrir no modifica nada
- «Ajeno» = el archivo no tiene ningún pset `OPENRVT_*` y ningún IfcApplication con
  ApplicationFullName que contenga «OPEN-RVT». Función `es_ifc_ajeno(modelo)` en módulo propio.
- Al abrir un ajeno NO se ejecutan: `_asegurar_biblioteca`, `crear_tipos_estructura`, ni
  ninguna `_reparar_*` / `_recalcular_*` / `_restaurar_*`. Los propios siguen igual que hoy.
- La siembra (biblioteca y tipos) se hace sola justo antes del PRIMER comando que crea un elemento
  OPEN-RVT en ese modelo, dentro de la misma instantánea (deshacer la quita también).
- `modelo.abrir` devuelve `ajeno: true|false`.
- Pruebas: abrir muestras/AC20-FZK-Haus.ifc y guardarlo sin editar → mismo número de entidades por
  clase que el original (comparar `by_type` de todas las clases) y ningún IfcMaterial nuevo;
  luego crear un muro → aparecen los tipos/materiales; deshacer → vuelve al conteo original.

## 3. Guardar sobre un ajeno
- Si `ajeno` y el usuario pulsa «Guardar» sobre la ruta original: modal «Este IFC no lo creó
  OPEN-RVT. Guardarlo reescribe el archivo completo.» con botones **Guardar como…** (por omisión),
  **Sobrescribir** y **Cancelar**. «Guardar como» a otra ruta no pregunta.
- Prueba vitest del modal y sus tres caminos; E2E: abrir FZK, crear un muro, Guardar → aparece el
  modal; Cancelar → el archivo original no cambió (mismo hash).

## Batería
pytest completo, tsc, lint 0 errores, vitest completo, E2E o035 o050 o054 o056 o057 o058 o059
o061 o062 herramientas (copia `muestras/` de ~/repos/open-rvt al worktree). docs/progreso/O066.md.
