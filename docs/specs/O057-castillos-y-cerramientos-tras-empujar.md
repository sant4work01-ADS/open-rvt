# O057: cerramientos en muros apilados y castillos con tope del usuario (reporte del dueño, 0.5.30)

Versión: ninguna (la sube el supervisor). Rama `o057` desde `main` (0.5.30).
Datos reales: `nucleo/tests/datos/o057-fallo-dueno.ifc` (su IFC) y `docs/notas-usuario/2026-11-09-o057-bitacora.jsonl`
(su bitácora; tipo «accion» = comando enviado, «resultado» = respuesta). Captura: `docs/notas-usuario/2026-11-09-o057.png`.

## Lo que hizo el dueño (de la bitácora)
Niveles: N0 0.00, N1 2.20, N2 2.40, N3 3.00, N4 3.20, N5 3.60. Rectángulo 2.50×1.50 (ejes 1-2 / A-B).
1. 4 muros Block 15 en N0 (tope N1 = 2.20), castillos en las 4 esquinas.
2. 4 cerramientos en planta N1 y luego cambió su NivelBase a N2 (`restricciones.editar`): cerramientos 2.20–2.40. OK.
3. Cambió el NivelTope de los 4 castillos a N5 (3.60) con `restricciones.editar`. OK (castillos 0–3.60).
4. 4 muros Block 15 en N2 (2.40 → tope N3 = 3.00), encima de los primeros.
5. Cerramientos sobre esos muros en planta N4 y N2: el primero creó **2** cerramientos (uno ligado al muro de N0 y otro al
   de N2); los demás fallaron con «Ese tramo ya tiene cerramiento en Nivel 4/2». Con un clic tras el error salió un
   cerramiento **diagonal** de 2.92 m, (0,1.5)→(2.5,0), que el dueño borró.
6. Resultado: los 2 castillos ligados al muro `1c536…` quedaron en **2.20** (ver IFC); los otros 2 siguen en 3.60. El
   cerramiento bueno de N4 (`3vdCX…`) no se ve en la planta.

## Causas (verificadas por el supervisor en el código y el IFC)
A. `interacciones.py::cerramiento_crear` (~l.660-745) toma como tramos TODOS los muros bajo el trazo en planta, de
   cualquier nivel. Con muros apilados liga el cerramiento también al muro de abajo, y el chequeo de duplicados de
   cualquiera de ellos rechaza todo el trazo.
B. `_actualizar_castillos` (~l.1021) recalcula la altura de los castillos del muro (tope/fondo del cerramiento) y PISA
   el NivelTope que el usuario puso a mano: el cerramiento falso del paso 5 los bajó a 2.20 → huecos en las esquinas.
C. El cerramiento queda contenido en el storey del muro y no en el de su NivelBase → no sale en la planta de ese nivel.
D. Tras un error, la herramienta conserva el primer punto y el siguiente clic crea un tramo diagonal.

## Reglas a implementar
1. Un trazo de cerramiento se liga SOLO a los muros cuya corona queda bajo él: de los muros bajo el trazo, los de la
   corona más alta que sea ≤ cara inferior del cerramiento + tolerancia (por tramo de planta). Los muros de pisos de
   abajo se ignoran. El chequeo de duplicados aplica solo a esos muros y a ese nivel. Si no hay ninguno, crear el
   cerramiento suelto en el nivel (como hoy sin muro).
2. Castillo con NivelTope puesto por el usuario: su altura = elevación(NivelTope) + DesfaseTope − base, y ninguna
   operación automática (cerramiento, empuje, unión, castillos automáticos) la cambia. Sin NivelTope, regla O050/O054 igual.
3. El cerramiento se contiene en el storey de su NivelBase (también al editar la restricción) y aparece en esa planta.
4. Tras un error al crear, la herramienta reinicia el trazo (sin primer punto) y el mensaje se ve.
5. No debilitar O050/O054/O056.

## Pruebas (primero las que fallan)
- `nucleo/tests/test_o057.py`, con valores a mano:
  a) Reproducir pasos 1-4 de la bitácora vía comandos y luego `cerramientos.crear` en N4 por los 4 lados (0,1.5)→(2.5,1.5),
     (2.5,1.5)→(2.5,0), (2.5,0)→(0,0), (0,0)→(0,1.5): se crean **4** cerramientos, uno por lado, cada uno ligado al
     muro de N2 de ese lado; ninguno ligado a muros de N0; sin errores. Total del modelo: 8 cerramientos.
  b) Tras (a): los 4 castillos miden 3.60 (base 0.00, tope N5).
  c) Repetir (a) con la planta N2 activa (NivelBase N2): mismos 4 creados sin «ya tiene cerramiento».
  d) Abrir `o057-fallo-dueno.ifc` y reparar: todo cerramiento con NivelBase N4 ligado a un muro de N0 se detecta
     como incorrecto por una función de validación (`validar_cerramientos` o similar) que lo reporte.
  e) Invariante en todas: cerramiento contenido en el storey de su NivelBase; castillo con NivelTope = altura por nivel.
- E2E `e2e/o057.test.js`: mismo flujo por la interfaz (planta N4, Cerramiento, 4 lados) → 4 creados, se ven en la
  planta N4 (captura), los castillos llegan a 3.60 en 3D (captura); un clic tras un error no crea diagonal.
- Batería: pytest completo, tsc, lint, vitest --maxWorkers=2, E2E o056, o055, o051, herramientas (y o050/o054 si existen).
  No commitear capturas viejas que regeneran otros E2E.
- `docs/progreso/O057.md` con salidas reales y capturas leídas como imagen.
