# O016: restricciones de base y tope por nivel (muros y columnas)

Pedido del usuario (2026-10-30): «no veo una opción para definir un nivel superior y uno inferior
como restricciones». Lee la parte 2 de `ideas/2026-10-30-losas-sombreado-y-restricciones-de-nivel.md`.
Como en Revit: restricción de base y restricción de tope con desfases.

Código: núcleo Python `nucleo/openrvt_nucleo/modelado.py` (`muro_crear` ~1652, `columna_crear` ~2204,
`_altura_columna` ~1934, `nivel_editar` ~371, `niveles_separacion` ~429, `nivel_borrar` ~472, edición
de propiedades ~3400–3520) y el panel de propiedades del frontend (`src/features/modelo/`, busca con grep
dónde se editan «altura» de muros y columnas). NO toques la zona de dibujo de niveles/ejes de `Visor3D.tsx`
(la trabaja O014a en paralelo).

## 1. Modelo de datos
- Pset `OPENRVT_Restricciones` en cada IfcWall/IfcColumn con: `NivelBase` (GlobalId del storey),
  `DesfaseBase` (m), `NivelTope` (GlobalId o vacío = «sin conexión»), `DesfaseTope` (m),
  `AlturaSinConexion` (m, se usa solo si no hay tope).
- Elementos existentes sin pset: base = su storey contenedor con desfase = z − elevación; tope vacío y
  altura sin conexión = su altura actual (lectura tolerante, nada cambia al abrir un modelo viejo).
- Función pura (sin IFC) `altura_restringida(elev_base, desf_base, elev_tope|None, desf_tope, altura_sin)`
  → `(z_inferior, altura)`; lanza error si altura ≤ 0.

## 2. Comportamiento
- Crear muro/columna: el nivel activo es la base (desfase 0); tope por omisión = el nivel inmediato superior
  si existe (desfase 0), si no «sin conexión» con 2.60. Las columnas mantienen su `nivel_superior` actual
  pero ahora se guarda como restricción.
- Nuevo método RPC `restricciones_editar(globalid, nivel_base?, desfase_base?, nivel_tope?, desfase_tope?, altura_sin_conexion?)`
  con una sola instantánea de deshacer; recalcula z y altura; valida que la altura resultante sea > 0 y
  que los vanos del muro sigan cabiendo (mismo error que hoy al cambiar altura).
- Al cambiar la elevación de un nivel (`nivel_editar`, `niveles_separacion`), TODO elemento cuya base o tope
  apunte a ese nivel se recalcula (no solo los contenidos), dentro de la misma instantánea.
- `nivel_borrar`: si algún elemento lo usa como base o tope, error -32021 que diga cuántos y cuáles
  (nombres), igual que hoy con elementos contenidos.
- Editar «altura» directamente en un elemento con tope ligado: lo pasa a «sin conexión» con esa altura.
- IFC: la base también define el storey contenedor (IfcRelContainedInSpatialStructure).

## 3. Interfaz
- Panel de propiedades de muro y columna: «Restricción de base» (combo de niveles) + «Desfase de base»,
  «Restricción de tope» (combo con «Sin conexión» + niveles) + «Desfase de tope», y «Altura» editable solo
  si es «Sin conexión» (si no, se muestra calculada y de solo lectura). Mensajes de error del núcleo visibles.

## 4. Pruebas (valores obligatorios)
- pytest (`nucleo/tests/test_o016.py`):
  - `altura_restringida(0,0,3.0,0,None)` → `(0.0, 3.00)`; con desfases base +0.10 y tope −0.20 → `(0.10, 2.70)`;
    sin tope y 2.60 → `(0.0, 2.60)`; base 3.0 tope 3.0 → error.
  - Muro base N0 (0.00), tope N1 (+3.00) → altura 3.00; `nivel_editar(N1, elevacion=3.20)` → 3.20 y su z no cambia.
  - Mover N0 a −0.10 con muro base N0/tope N1(+3.00) → z −0.10, altura 3.10.
  - Columna creada con `nivel_superior`=N1 → restricción guardada; mover N1 recalcula.
  - Muro con ventana de antepecho 1.0 y alto 1.2: bajar N1 a +2.00 → error «abertura fuera» y nada cambia.
  - `nivel_borrar(N1)` con un muro que lo usa de tope → error -32021 con el nombre del muro.
  - Un deshacer revierte `restricciones_editar` completo.
  - Guardar IFC, reabrir: el pset y las alturas se conservan; un IFC viejo sin pset abre igual.
- vitest del panel: los combos muestran los niveles, «Sin conexión» habilita la altura, y se llama al RPC con
  los argumentos correctos.
- E2E con la app real: crear N0/N1, muro con tope N1, editar la elevación de N1 a 3.20 desde «Niveles y ejes»
  y comprobar en el panel que la altura del muro dice 3.20. Captura `docs/capturas/o016-*.png`.

## Reglas
- `pytest` del núcleo (con el venv del proyecto), `npx tsc --noEmit`, `npm run lint`, `npx vitest run --maxWorkers=3`,
  Rust con `-j 3` si lo tocas.
- Commits en español al cerrar cada parte; progreso en `docs/progreso/O016.md` (reanudable).
- Sin push, merge, versión ni dependencias nuevas.
