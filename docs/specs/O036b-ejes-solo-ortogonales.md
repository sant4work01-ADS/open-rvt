# O036b: los ejes solo son horizontales o verticales (se quita «Girar eje»)

Reporte del usuario al ver la captura de O036, con el eje 2 girado 10°: «el eje 2 está chueco, cosa que no es posible:
los ejes son rectos, solo en 2 direcciones».

## Decisiones ya tomadas (no las cambies)
1. **Se quita por completo «Girar eje» (O036, parte 2).**
   - **Interfaz:** el botón «Girar» de la cinta y su entrada en el menú contextual, la barra de opciones del giro, el
     comando en `comandos.ts` y todo el estado y código de giro en `estado.ts`, `BarraHerramienta.tsx` y
     `Visor3D.tsx`.
   - **Núcleo:** el método `ejes_girar` de `modelado.py` y su ruta en `servidor.py`.
   - **Pruebas:** las que solo prueban el giro (`giro.test.tsx`, `comandos.o036.test.ts` en la parte de giro, los
     casos de giro de `test_o036.py` y del E2E `o036.test.js`). No dejes código muerto.
2. **El auto-enlace de O036 (parte 1) se queda tal cual** con sus pruebas: muro, contratrabe o trabe creados con dos
   clics sobre cruces quedan enlazados.
3. **Ejes solo ortogonales:**
   - **Al dibujarlo.** La herramienta Eje solo crea ejes horizontales o verticales: el segundo punto se fuerza a la
     dirección dominante (|dx| ≥ |dy| → horizontal; si no, vertical). La vista previa ya se ve forzada.
   - **«Ejes por separaciones».** Ya es ortogonal; compruébalo.
   - **Mover un eje o arrastrar sus extremos** conserva su dirección: uno horizontal sigue horizontal y uno vertical
     sigue vertical.
   - **Núcleo (`ejes_crear`, `ejes_mover` o como se llamen).** Rechaza un eje oblicuo (|dx| > 1e-9 y |dy| > 1e-9) con el
     mensaje «Los ejes solo pueden ser horizontales o verticales». Así vale para cualquier puerta de entrada.
   - **Archivo viejo con un eje oblicuo:** se abre sin error y sin tocarlo. En la carga se avisa una vez: «El eje X no
     es horizontal ni vertical».

## Pruebas obligatorias
- **pytest:**
  - crear un eje de (0,0) a (3,4): se rechaza;
  - de (0,0) a (5,0): se acepta;
  - mover un eje horizontal 2 m en y: sigue horizontal;
  - el auto-enlace de O036 sigue pasando.
- **vitest:** dibujar un eje con clics en (0,0) y (5, 0.8) lo deja horizontal de (0,0) a (5,0); con (0.6, 5) lo deja
  vertical.
- **E2E `o036.test.js`** sin la parte de giro, más un paso nuevo: dibujar un eje con un segundo clic algo inclinado y
  comprobar que quedó horizontal. Capturas en `docs/progreso/O036/`, leídas como imagen.
- **Comprobaciones finales:**
  - `npx tsc --noEmit`, `npm run lint`, vitest `--maxWorkers=3` y pytest completo;
  - los E2E de ejes: o011, o028, o036 y o042.

## Reglas
- `modelado.py`, `interacciones.py`, `Visor3D.tsx` y `estado.ts` conservan su fin de línea (CRLF).
- Sin push, merge, cambio de versión ni dependencias nuevas.
- Resumen en `docs/progreso/O036b.md`.
