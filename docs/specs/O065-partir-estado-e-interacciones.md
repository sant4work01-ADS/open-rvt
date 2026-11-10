# O065 — Partir estado.ts e interacciones.py (solo mover código)

Mismas reglas que O064 (léela): cero cambios de lógica, nombres o comportamiento; meta 300–600,
tope 1000; el archivo original queda como índice que reexporta lo que hoy se importa desde fuera.

## Parte A — nucleo/openrvt_nucleo/interacciones.py (2549; rama o065a)
- Paquete `nucleo/openrvt_nucleo/interacciones/` con mixins o módulos por tema; `__init__.py`
  reexporta todo lo que hoy se importa (`grep -rhn "from .*interacciones import" nucleo -A12`).
- Comprobación con el mismo método que O064A (`herramientas/instantanea_modelado.py` o uno igual).
- Batería: pytest completo (main hoy: 421 recogidas, 415 passed + 6 skipped), E2E o058 o061.

## Parte B — src/features/modelo/estado.ts (3767; rama o065b)
- Partir el store en slices/módulos dentro de `src/features/modelo/estado/`; `estado.ts` queda
  como índice que arma el store y reexporta lo mismo (`grep -rn "from './estado'\|/estado'" src e2e`).
- Batería: tsc, lint 0 errores, vitest completo (main: 793), E2E o035 o050 o054 o056 o057 o058
  o059 o061 o062 herramientas (copia `muestras/` de ~/repos/open-rvt al worktree antes).

Cada parte: docs/progreso/O065A.md / O065B.md con salidas y `wc -l` final. Commit por módulo.
