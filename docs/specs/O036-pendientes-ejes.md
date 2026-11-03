# O036: pendientes de O028 en ejes

Son los dos puntos que O028 dejó como PENDIENTE en `docs/progreso/O028.md`.

## Decisiones ya tomadas (no las cambies)

### 1. Auto-enlace de lineales creados con dos clics sobre cruces
- **Elementos:** muro, contratrabe y trabe creados con dos clics.
- **Cuándo se enlazan:** si **los dos** clics caen en un cruce de ejes. Usa el imán de cruce y la misma tolerancia
  que ya usan columnas y zapatas.
- **Cómo queda el enlace:**
  - `EnlaceEjeGuia` = el eje que comparten los dos cruces;
  - `EnlaceEjeInicio` y `EnlaceEjeFin` = los ejes que cruzan en cada punto.
  - Usa la misma ruta del núcleo que las herramientas por lote (`modelado.py`, ~1814).
- **Sin enlace:** si solo un clic cae en un cruce, o los dos cruces no comparten eje, se crea sin enlace, como hoy.
- **Comportamiento enlazado:**
  - muestra el candado de enlace, como columnas y zapatas;
  - si se mueve el eje, el elemento lo sigue, como los creados por lote.

### 2. Girar un eje
- **Comando «Girar».** Va en el menú contextual del eje y en la cinta, junto a Mover.
  - **Centro de giro:** se elige con un clic. Por omisión es el punto medio del eje.
  - **Ángulo:** campo en grados (positivo = antihorario) o un segundo clic.
  - Enter aplica; Esc cancela.
- **Qué cambia.** El eje gira en el IfcGrid; cambia su geometría real.
  - Lo enlazado lo sigue con la propagación por posición absoluta que ya existe:
    - columnas y zapatas, a sus cruces nuevos;
    - lineales, entre sus cruces nuevos.
  - Las anotaciones de la vista (globos, codos, cotas) siguen al eje.
  - Es un solo paso de Deshacer y se conservan los GlobalId.
- **Rechazo.** Si el giro deja paralelo un eje enlazado (sin cruce), se rechaza con un mensaje claro y no cambia
  nada.

## Pruebas obligatorias (valores a mano)

### pytest `nucleo/tests/test_o036.py`
- **Retícula:** ejes 1 (x=0), 2 (x=4), A (y=0) y B (y=3).
- **Auto-enlace:**
  - Un muro de (0,0) a (4,0), creado por la ruta de dos clics, queda enlazado a A, con inicio 1 y fin 2.
  - Si el eje 2 se mueve a x=5, el muro queda de 5 m.
  - Un muro con un extremo fuera de cruce queda sin enlace.
- **Giro rechazado:** girar 90° el eje A alrededor de (0,0) lo deja paralelo al eje 1. Se rechaza y no cambia nada.
- **Giro válido:** girar el eje 2 10° alrededor de (4, 1.5).
  - El cruce 2-A queda en el punto calculado a mano en la prueba (escribe el cálculo).
  - El muro enlazado termina ahí.
  - Una columna en 2-B se mueve a su cruce nuevo.
- **Deshacer:** devuelve todo exacto (±1e-9).

### vitest
- El campo de ángulo.
- La conversión de grados a radianes.

### E2E `e2e/o036.test.js`, con clics reales
1. Crear la retícula 2×2 con la herramienta Eje.
2. Dibujar un muro con dos clics en cruces y comprobar que queda enlazado.
3. Girar un eje con el comando y comprobar que el muro lo sigue.
4. Deshacer.
5. Guardar capturas en `docs/progreso/O036/` y leerlas como imagen.

### Al terminar
Pasan:
- `npx tsc --noEmit`;
- `npm run lint`;
- vitest con `--maxWorkers=3`;
- pytest completo;
- los E2E de ejes: o011, o028 y o042.

## Reglas
- `modelado.py` e `interacciones.py` conservan su fin de línea (CRLF). `Visor3D.tsx` es CRLF y se queda así.
- Sin push, merge, cambio de versión ni dependencias nuevas.
- Resumen en `docs/progreso/O036.md`.
