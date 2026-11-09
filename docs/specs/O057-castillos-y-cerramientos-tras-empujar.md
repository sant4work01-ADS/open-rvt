# O057: castillos y cerramientos tras empujar (reporte del dueño, 0.5.30)

Versión: ninguna (la sube el supervisor). Rama `o057` desde `main` (0.5.30).

## Reporte del dueño (captura en docs/notas-usuario/2026-11-09-o057.png)
Casa de 4 muros Block 15 con castillos en las esquinas, zapatas y columnas, niveles 0–5. En 3D usó Empujar/Tirar
sobre un muro existente (subió su altura). Después:
1. **Castillos desaparecieron o se les recortó la altura** (esquinas del muro empujado).
2. **Cerramientos: solo uno se pudo dibujar; los demás no** (sobre los otros muros).

Pista del supervisor: `interacciones.py::_actualizar_castillos` pone `max(altura - base, 0.05)`; un castillo de esquina
que `_ajustar_castillo` re-liga a otro muro (o un tope/fondo mal calculado tras el empuje) queda en 0.05 m = «desaparece».
Revisar también qué rechaza `cerramiento_crear`/`cerramiento_crear_en_muro` (y la herramienta en el front) después de
un empuje o con un cerramiento ya puesto en el muro vecino.

## Qué hacer
1. **Primero la prueba que falla**, en pytest (`nucleo/tests/test_o057.py`) y E2E (`e2e/o057.test.js`) con ese flujo:
   4 muros Block 15 en rectángulo 4×3 m en Nivel 0 (altura 2.60), Castillos automáticos, empujar la cara superior de
   un muro +0.40, luego cerramiento en cada uno de los 4 muros (en el orden: muro empujado, después los otros 3).
   Valores esperados (a mano):
   - Ningún castillo con altura < 2.40 m. Castillo de esquina del muro empujado: llega a 3.00 (tope del muro más alto
     que toca, regla O054 «el castillo de esquina manda»); los demás de esquina: 2.60.
   - Los 4 cerramientos se crean (4 IfcBeam/OPENRVT cerramiento nuevos); cada uno sobre su muro, a la corona de ese muro.
   - Un castillo de esquina sigue ligado al mismo par de muros tras el empuje (no cambia de muro al azar).
   - Repetir con el empuje DESPUÉS de los cerramientos: los castillos no bajan; el cerramiento del muro empujado sube con él.
   - Invariante: tras cualquier operación, todo castillo con altura ≥ 0.50 m y base = base de su muro.
2. Arreglar la causa en el núcleo (y el front si el rechazo del cerramiento es ahí). Si un caso no se puede crear, el
   usuario debe ver un mensaje claro, nunca un fallo silencioso. No debilitar O054/O050/O056.
3. Batería: pytest completo, tsc, lint, vitest --maxWorkers=2, E2E o056, o054 (si existe), o050, herramientas.
   No commitear capturas viejas que regeneran otros E2E.
4. `docs/progreso/O057.md` con la causa encontrada, salidas reales y capturas leídas como imagen.
