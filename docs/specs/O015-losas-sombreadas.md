# O015: losas sombreadas en planta y en corte

Pedido del usuario (2026-10-30): «no veo que el elemento esté sombreado en cuanto a losas».
Lee `ideas/2026-10-30-losas-sombreado-y-restricciones-de-nivel.md` (solo la parte 1; la parte 2,
restricciones de nivel, NO se hace aquí).

Código: `src/features/modelo/Visor3D.tsx` (relleno de sección por stencil ~1743, «O005b: por encima
del corte solo se dibuja la silueta de losas» ~1477, `texturaPatron` ~550), `src/features/modelo/estilos.ts`
(materiales y patrones).

## 1. Diagnóstico primero
Escribe en `docs/progreso/O015.md` por qué hoy la losa no sale rellena, con evidencia (líneas de código
y una captura `docs/capturas/o015-antes-*.png`) en: planta con la losa cortada, planta con la losa
debajo del plano de corte, corte transversal y alzado. Luego corrige la REGLA (no un caso suelto).

## 2. Comportamiento esperado
- **Corte / sección** (planta cuyo plano de corte atraviesa la losa, y cortes): la sección de la losa se
  rellena con el patrón del material de su tipo (concreto → patrón `concreto`), igual que los muros cortados.
- **Planta con la losa debajo del corte** (lo normal en planta arquitectónica): la losa se ve con un
  relleno de proyección tenue (gris claro al 15 % sobre el fondo) y su contorno con el grosor de proyección
  de la categoría «losas».
- **Alzado** (sin corte): no se achura; solo aristas, como hoy.
- Funciona en estilos de vista «Líneas» y «Sombreado» (en «Líneas» el patrón es el achurado vectorial/textura,
  sin relleno gris de sombreado).
- El patrón y su escala salen de `Estilos.materiales` del material de la losa; cambiarlo en el diálogo de estilos
  cambia la vista sin reabrir.

## 3. Pruebas
- vitest: la función que decide el relleno de un elemento por categoría y relación con el plano de corte
  (sácala a una función pura, p. ej. `rellenoDeElemento(categoria, relacion: "cortado"|"debajo"|"arriba", estiloVista)`)
  con casos: losa cortada → patrón del material; losa debajo → «proyeccion-tenue»; losa arriba → «ninguno»;
  muro cortado → igual que antes (sin regresión).
- E2E con la app real: modelo con nivel 0, muro y losa de concreto de 0.12 m a +2.80; planta Nivel 1 con corte
  a +2.90… y corte transversal; captura `docs/capturas/o015-despues-*.png` y verificación por píxeles de que el
  área de la losa tiene relleno (proporción de píxeles no-fondo dentro del contorno ≥ 30 % en corte, ≥ 5 % en planta).

## Reglas
- `npx tsc --noEmit`, `npm run lint`, `npx vitest run --maxWorkers=3`.
- Commits en español; progreso en `docs/progreso/O015.md`. Sin push, merge, versión ni dependencias nuevas.
- NO toques la zona de niveles/ejes (la trabaja O014a en paralelo).
