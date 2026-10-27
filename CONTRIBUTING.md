# Cómo contribuir a OPEN-RVT

## Cómo se prueba (regla del proyecto, 2026-10-26)

Aprendido en la auditoría de PresupuestosPro: había 865 pruebas en verde y unos 170 errores reales.
1. **Valores esperados de la norma o la ley,** o de un caso calculado a mano y anotado en el comentario. Nunca se copian de la salida del código. La especificación también se puede equivocar: se confirma contra la fuente.
2. **Al menos una prueba de flujo completo** por función (comando o interfaz → dato guardado → reporte). Una pieza probada pero desconectada no sirve.
3. **Secuencias y bordes:** varios pasos en orden, editar algo anterior, negativos, cero, vacío, datos incompletos, y que copiar y pegar conserve todo.
4. **Una sola capa de validación** para todas las puertas de entrada (pantalla, asistente, importación, pegar), con **pruebas de invariantes** del tipo «ninguna puerta acepta un valor imposible».
5. **Independencia:** en cálculos (dinero, cálculo estructural), un verificador escrito sin ver el código, a partir de la norma.
