# O064 — Partir los archivos gigantes (solo mover código)

Regla del dueño: meta 300–600 líneas por archivo, tope 1000. Esta tarea SOLO MUEVE código:
cero cambios de lógica, de nombres públicos o de comportamiento. Si ves un bug, anótalo en el
progreso y no lo toques.

## Parte A — nucleo/openrvt_nucleo/modelado.py (8254 líneas; rama o064a)
- `ModeladoMixin` se arma con mixins temáticos en módulos nuevos dentro de
  `nucleo/openrvt_nucleo/modelado/` (paquete): muros, losas, estructura (columnas, castillos,
  cerramientos, dados/zapatas), vigas, aperturas, niveles/ejes, tipos/materiales, lectura de IFC
  ajeno, utilidades geométricas. Agrupa por tema según lo que encuentres; cada módulo ≤ 1000.
- `modelado/__init__.py` define `class ModeladoMixin(MuroPielMixin, MurosMixin, LosasMixin, ...)` y
  reexporta TODO nombre que hoy se importe desde fuera: los de interacciones.py, medicion.py,
  modelo.py y nucleo/tests (PSET_RESTRICCIONES, altura_restringida, TOLERANCIA_CALCULO, _gid,
  _nombre, _poligono_area, _texto, …). Haz la lista con
  `grep -rhn "from .*modelado import" nucleo -A12` y verifica cada nombre.
- Los imports de los demás archivos NO cambian: `from .modelado import X` sigue funcionando.
- Comprobación de que nada se perdió: script que liste los métodos de ModeladoMixin (dir) y los
  nombres de nivel módulo en main y en la rama → misma lista (pega la salida en el progreso).
- Batería: pytest completo (mismo número que main: 430 passed), ruff si existe, E2E o058 o061 o062.

## Parte B — src/features/modelo/Visor3D.tsx (9569 líneas; rama o064b)
- Sacar a módulos dentro de `src/features/modelo/visor/`: construcción de mallas por categoría,
  aristas/materiales, cámara y controles, selección/picking, anotaciones 3D (niveles, ejes, cotas),
  herramientas de dibujo, overlays. Funciones puras y hooks (`useXxx`) con los mismos parámetros.
- `Visor3D.tsx` queda como componente que arma esas piezas (meta ≤ 1000) y sigue exportando lo que
  hoy exporta (búscalo con `grep -rn "from './Visor3D'\|from \"./Visor3D\"\|Visor3D'" src e2e`).
- Comprobación: tsc, lint 0 errores, vitest completo (mismo número que main: 793), E2E o035 o050
  o054 o056 o057 o058 o059 o061 o062 herramientas, y una captura 3D comparada con main (igual).

Cada parte: `docs/progreso/O064A.md` / `O064B.md` con salidas, tamaños finales (`wc -l`) y
`bash ~/repos/metodologia/taller/tamanos.sh . main`. Commit por cada módulo movido.
