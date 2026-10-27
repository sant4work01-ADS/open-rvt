# O013: corregir lo que falla al integrar O011 + O012 + O012b (versión 0.5.8)

Resultado de la suite E2E completa en `main` (ver `e2e/`), con:

```
OPENRVT_PYTHON=~/.venvs/openrvt/bin/python OPENRVT_E2E_SIN_COMPILAR=1 npm run e2e
```

(Compila antes una vez con `npm run tauri build -- --debug --no-bundle`. Las muestras ya están en
`muestras/`.) Pasan 23 y fallan 12. Lee primero `docs/METODO-DE-TRABAJO.md`.

## 1. Regresión real del enganche (lo más importante)
- **O007b** (`e2e/o007b.test.js`): al colocar columnas con clic a 0.10 m de un cruce de ejes,
  la columna debe quedar en el cruce (0,0), (0,4), (4,0), (4,4). Hoy queda donde cae el clic:
  `[[0.1,-0.1],[0.1,3.9],[3.9,0.1],[4.1,4.1]]`. **El enganche a la intersección de ejes dejó
  de funcionar.**
- **O003b**: «no apareció el snap de punto medio».

Sospecha del supervisor: O011 cambió cómo se dibujan y registran los ejes (polilíneas con codos,
`ejesVista.ts`, `lineasEje`, `ejesInteraccion` en `Visor3D.tsx`). El cálculo de enganches
probablemente dejó de recibir los ejes, o los recibe en otra forma. Encuentra la causa con
`git log -p` / `git bisect` entre `v0.5.7` y `main`, y corrígela **en la regla**: el enganche
usa la línea real del eje en el modelo (sin codos: los codos son anotación de la vista y **no**
cuentan para enganchar). Agrega una prueba vitest del enganche a cruce de ejes con un eje que
tiene codos.

## 2. Pruebas desactualizadas (actualiza la expectativa, no el código)
- **O012-1** (`e2e/o012.test.js:262-272`): O012b fijó la jerarquía «dado > contratrabe», así que
  la contratrabe termina en la **cara del dado**, no se traslapa. Rehaz el comentario de
  cálculo a mano con esa regla (dado de 0.40 × 0.40, CT-1 0.20 × 0.40, 0.08 m²/m). Ejemplo: la
  pasante de 12.20 m con tres dados pierde 0.30 + 0.40 + 0.30 = 1.00 m → 11.20 × 0.08 =
  **0.896**. Calcula igual las demás y usa tolerancia 1e-3.
- **O002 / inicio** (`e2e/inicio.test.js:28`): hoy hay 5 módulos (Modelo, Tipos y materiales,
  Niveles y ejes, Configuración, Ayuda). Actualiza la lista esperada y el título de la prueba.
- **O006c** (`e2e/o006c.test.js:245`): compara con la versión fija `0.5.1`. Léela de
  `package.json` para que no se vuelva a romper.

## 3. Revisa y reporta
- **O003a** (FZK-Haus e Institute: «el modelo no cargó en la barra de estado») y **O005c**:
  córrelas de nuevo con las muestras. Si siguen fallando, encuentra la causa y corrígela.
- **O004** requiere `OPENRVT_E2E_BINARIO` del `.deb`: se corre al publicar. No la toques.

## Entrega
- Suite E2E completa: todo en verde salvo O004.
- vitest, tsc, eslint y pytest en verde.
- `docs/progreso/O013.md` con la causa de la regresión, el arreglo y la prueba.
- Commits en español, sin push y sin cambiar la versión.
