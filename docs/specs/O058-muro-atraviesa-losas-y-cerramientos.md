# O058: muro que atraviesa losas y cerramientos intermedios (reporte del dueño, 0.5.31)

Versión: ninguna (la sube el supervisor). Rama `o058` desde `main` (0.5.31).
Datos reales: `nucleo/tests/datos/o058-muro-n0-n5.ifc` y `docs/notas-usuario/2026-11-09-o058-bitacora.jsonl`.

## Reporte
Niveles N0 0.00, N1 2.20, N2 2.40, N3 3.00, N4 3.20, N5 3.60. Rectángulo 2.50×1.50. Losa en N0 (−0.12 a 0.00),
4 cerramientos 2.20–2.40, 4 castillos 0–3.60, losa en N4 (3.08–3.20). Los 4 muros Block 15 tienen base N0 y tope N5
(pset correcto: Altura 3.60), pero su geometría va de **3.20 a 3.60** (verificado con ifcopenshell.geom). El dueño quería
el muro de N0 a N5.

## Causa (verificada por el supervisor)
`modelado.py::_cuerpo_muro` → `_limites_verticales_muro_nivel` toma como «apoyo» la losa/dala/contratrabe más alta bajo
la corona, aunque esté a media altura: la losa de N4 sube la base del muro a 3.20. Revisar igual la «cubierta» (corona
recortada por cerramiento/losa).

## Reglas
1. Apoyo: solo cuenta un elemento horizontal (losa, dala, contratrabe, zapata corrida, cerramiento) cuya cara INFERIOR
   está ≤ base nominal del muro + tolerancia y cuya cara SUPERIOR está ≥ base nominal − tolerancia (toca la base). Con
   eso se conservan O035 (bajar a zapata corrida/contratrabe) y el apoyo sobre losa/dala de su nivel.
2. Cubierta: solo cuenta uno cuya cara SUPERIOR ≥ corona nominal − tolerancia y cuya cara INFERIOR ≤ corona nominal +
   tolerancia (toca la corona). La corona baja a su cara inferior (regla actual).
3. Elementos intermedios (cara inferior > base y cara superior < corona, encima de la huella del muro): el muro NO cambia
   base ni corona; su cuerpo se parte en tramos y se resta el intervalo vertical del elemento en su huella (muro abajo,
   elemento, muro arriba). Volumen del muro = huella × (alto total − espesores intermedios).
4. Sin cambios en O050/O054/O056/O057.

## Pruebas (primero las que fallan), valores a mano
- `nucleo/tests/test_o058.py`:
  a) IFC del dueño: tras regenerar, cada muro: z mín 0.00 y z máx 3.60 (geom world coords); volumen del muro de 2.50 m
     (y=1.5, Block 15, núcleo 0.15 entre castillos 2.35 m de largo libre… calcular con la huella real que da
     `_huellas_muro` y anotar el cálculo) = huella × (3.60 − 0.20 cerramiento − 0.12 losa N4).
  b) Muro N0 con tope N1 y losa en N1 encima: corona 2.08 (cara inferior de la losa), base 0.00 (regla actual igual).
  c) Muro sobre losa de N0 (losa −0.12…0.00): base 0.00. Muro sobre contratrabe O035: base en su cara superior (igual).
  d) Muro N2 encima de cerramiento 2.20–2.40: base 2.40.
- E2E `e2e/o058.test.js`: niveles como arriba, losa N0, 4 muros N0, cerramientos N2, losa N4, cambiar tope de los muros a
  N5 en Propiedades → en 3D los muros van de 0 a 3.60 con cortes en cerramiento y losa (captura y valor leído del núcleo).
- Batería: pytest completo (los 5 fallos de test_o035 ya existen en main: no cuentan, pero no agregar otros), tsc, lint,
  vitest --maxWorkers=2, E2E o035 (si existe), o050, o054, o056, o057, herramientas. No commitear capturas ajenas.
- `docs/progreso/O058.md` con salidas reales y capturas leídas como imagen.
