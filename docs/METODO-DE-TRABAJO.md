# Método de trabajo

Cómo se construye y se verifica el software de este proyecto (y de OPEN-RVT y los demás).
Escrito el 2026-10-27, después de la auditoría 096/097: había 1 571 pruebas en verde y 203
errores reales.

> **«No es lo mismo que algo funcione a que algo esté bien hecho.»** — el dueño del proyecto.

## 1. Principios
1. **La fuente de verdad es el mundo real, no el código.** Las fórmulas salen de la norma (RLOPSRM,
   LIVA, LISR, NTC…) o de la práctica de obra, no de lo que hace la implementación. La
   especificación también se equivoca: cuando cita una regla legal, se confirma contra la ley, y
   las reglas fiscales las valida un contador.
2. **El dinero y los datos del usuario son sagrados.** Que un monto salga mal o que datos de una
   obra aparezcan en otra es un fallo grave, aunque «funcione».
3. **Nadie aprueba su propio trabajo.** Quien escribe el código no escribe la única prueba que lo
   valida, ni da por buena su entrega. Siempre hay una segunda mirada independiente.
4. **Reglas generales, no parches.** Si un caso falla, se corrige la regla que lo produce; nunca
   se mete una excepción por dato. Ejemplo: no se agrega «limón» a una lista de palabras para que
   pase una prueba.
5. **Primero lo importante.** Primero el dinero, luego la integridad, el flujo y por último la
   presentación. Se trabaja por partes y en ese orden.

## 2. Arquitectura que evita errores
- **Una sola capa de validación** (`datos`) por la que pasan TODAS las puertas de entrada:
  pantalla, asistente, importación, pegar, plantillas y API. Una puerta que escribe sin pasar por
  ella es un error, aunque hoy no falle.
- **El cálculo vive en un solo lugar** (`motor`, `control`). La interfaz y los reportes muestran
  lo que el cálculo da; no recalculan dinero por su cuenta, ni con `f64` ni con `Number`.
- **Lo que ya se autorizó no cambia.** Un documento autorizado, cobrado o cerrado guarda su
  resultado (snapshot) y no se recalcula al editar otra cosa.
- **Operaciones compuestas en una transacción** y en un solo paso de deshacer.

## 3. Cómo se prueba
Toda funcionalidad nueva o corregida lleva:

| Tipo de prueba | Qué demuestra | Ejemplo |
|---|---|---|
| **Referencia externa** | El valor esperado sale de la norma o de un caso calculado a mano y anotado en el comentario | FASAR con Tp/Tl de ejemplo; carátula calculada a mano |
| **Flujo completo** | La pieza está conectada: comando o interfaz → dato guardado → reporte | Crear contrato → estimar → la carátula del reporte E2 cuadra con la de la pantalla |
| **Secuencia** | Varios pasos en orden y editar algo anterior | E1 → E2 autorizada → editar E1: E2 no cambia |
| **Bordes** | Negativos, cero, vacío, datos incompletos | Conceptos sin programar; pegar sin clave |
| **Invariante** | Ninguna puerta viola una regla | Ninguna ruta acepta un precio negativo; Σ explosión = CD total |

Reglas:
- La aserción usa el monto exacto, y debe fallar si el resultado está mal.
- Un hallazgo se corrige primero con una prueba roja; el arreglo termina cuando esa prueba
  pasa.
- **Verificador independiente:** (en PresupuestosPro: `herramientas/auditoria/verificar_096.py`; en OPEN-RVT: el que se haga para cantidades y cálculo estructural NTC) recalcula
  con las fórmulas de la norma, sin ver el código. Se corre en cada release y debe dar 0 fallas.
- **Obra demo de regresión:** (en PresupuestosPro: `cargo run -p datos --example obra_demo_096`) reconstruye una obra
  completa (presupuesto, contratos, estimaciones, contrato cerrado) por la misma ruta que la
  interfaz.

## 4. Flujo de una tarea
1. **Spec** (supervisor): qué, por qué, la fuente normativa y los casos de referencia. Es
   precisa y corta; el trabajador no decide el diseño.
2. **Pruebas primero:** la referencia, el flujo y las invariantes del cambio, escritas antes o
   sin mirar la implementación.
3. **Implementación** por el trabajador, con commits pequeños y progreso anotado.
4. **Revisión del supervisor:** leer el diff, rechazar pruebas que copian la salida del código y
   rechazar parches por dato.
5. **Integración:** suite completa, E2E, demo regenerada y verificador independiente en 0 fallas.
6. **Release** con notas que el usuario entienda.

## 5. Auditorías periódicas
Cada hito grande lleva una auditoría por áreas, como la 096/097:
- revisores que **solo buscan errores**, cada uno con su área;
- cada hallazgo con su severidad, archivo y línea, cómo reproducirlo y una prueba roja;
- un verificador de cálculos con prohibición de leer el código.

Al cerrar el desarrollo se hace además la revisión de calidad de ingeniería
(`docs/pendientes-usuario.md`).

## 6. Definición de terminado
- [ ] Las pruebas de referencia, de flujo e invariantes del cambio están en verde.
- [ ] Ninguna puerta de entrada nueva se salta la validación compartida.
- [ ] No quedan `unwrap`/`expect` en rutas de datos del usuario, ni errores tragados.
- [ ] El dinero se maneja con `Decimal` de punta a punta.
- [ ] La suite completa, clippy, tsc, eslint y los E2E tocados pasan.
- [ ] La demo y el verificador independiente dan 0 fallas, cuando el cambio toca cálculo.
- [ ] El manual y las notas de la versión están actualizados.
