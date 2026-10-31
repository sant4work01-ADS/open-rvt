# O031: poner al día los E2E anteriores tras O024–O030 (sin esconder regresiones)

Con el binario release de main (0.5.14) fallan E2E viejos: o014a, o014b, o015, o021, o021b, o023 y o027
(este último: «no existe Planta Nivel 0»). Causas probables:
- O029 cambió «Nivel»: en alzado/corte activa la herramienta de dibujo; en planta/3D o sin niveles agrega el
  siguiente nivel (App.tsx `nuevoNivel`). Un modelo nuevo abre en un alzado: después del primer nivel, los E2E que
  pulsan `cmd-nivel` varias veces dibujan en vez de agregar.
- O025/O030 rehicieron el dibujo de niveles, cotas y globos (textos «Npt», posición de cabezas, cota total en
  otra fila, anotación a escala por omisión en alzado).
- O027 cambió el arrastre de asas (restringido, umbral 3 px, imanes).

## Qué hacer
1. Corre cada E2E listado con el binario release (antes `herramientas/preparar_python.sh windows`;
   `CARGO_TARGET_DIR=$HOME/.cache/pp-target/openrvt-o031`, `-j 3`, `OPENRVT_E2E_BINARIO` en `C:/...`).
2. Para cada falla decide con evidencia (captura, valores) si es:
   - **cambio intencional** (la spec O024–O030 lo pide): actualiza la prueba al comportamiento nuevo, conservando
     lo que verificaba (p. ej. crear niveles: elige antes «3D Isométrica» o una planta y luego `cmd-nivel`;
     textos y posiciones según O025);
   - **regresión** (algo que debía seguir igual y se rompió, p. ej. un eje que ya no sigue su alineación en
     O021): corrige el CÓDIGO, no la prueba, y agrega una prueba vitest que la cubra.
3. Tabla en `docs/progreso/O031.md`: prueba → causa → intencional/regresión → qué cambiaste. Nunca relajes una
   aserción sin justificarlo en la tabla.
4. Al final corre TODOS los `e2e/*.test.js` y anota el resultado de cada uno. Ninguna captura versionada fuera de
   `docs/progreso/O031/` (si un E2E reescribe capturas de docs/, restáuralas con `git checkout -- docs` antes
   de commitear).
- vitest `--maxWorkers=3`, `npx tsc --noEmit`, `npm run lint` (0 errores, incluye e2e/), pytest del núcleo con
  `~/.venvs/openrvt/Scripts/python.exe -m pytest nucleo/tests -q`.
- LF; NO cambies fines de línea de archivos existentes. Commits por parte; sin push, merge, versión ni
  dependencias nuevas.
