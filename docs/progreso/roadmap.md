# Roadmap del proyecto

Actualizado el 2026-11-02. El Gantt está en `docs/roadmap.html`; la captura de la app, en
`docs/progreso/roadmap.png`.

## Cifras

- **54 tareas** en `TAREAS`: 36 hechas, 11 pendientes, 6 futuras y 1 hito (MVP).
- De las 54, el KPI excluye las 6 de `FX` y el hito: quedan **47 tareas de MVP**, con
  **36 hechas** (el KPI muestra 36 / 47). El avance ponderado por duración da **55 %**.
- Todas las specs `docs/specs/O001` a `O033` están en `main`, así que van como `hecho` al 100 %.

## De dónde salió cada fecha

- **Inicio (`ini`)**: primer commit que agrega el archivo de la spec
  (`git log --diff-filter=A --format=%as -- docs/specs/<archivo>`). Todas las altas caen entre
  el 2026-10-24 y el 2026-10-31.
- **Fin (`fin`)**: commit «Integra …» o versión que incluyó la tarea. Las versiones 0.5.16 a
  0.5.18 y los merges del 2026-11-01 fijan O032 y O033; las versiones 0.3.x, 0.4.0 y 0.5.x
  fijan las anteriores.
- **Fechas dudosas** (no hay commit «Integra» explícito, se usó la versión de cierre):
  - O003A–B: merge O003b del 2026-10-25.
  - O006C, O006D, O006E: merges 0.5.0, 0.5.1 y 0.5.4 del 2026-10-25.
  - O007A–C: merges 0.5.2, 0.5.3 y 0.5.5 del 2026-10-25.
  - O014A–B: O014a se integró el 2026-10-30 y O014b el 2026-10-31; por eso la fila agrupada
    termina el 2026-10-31.
  - O017–O031: cierres de versión del 2026-10-31; el commit «Integra» no siempre nombra la
    spec.
  - O032 y O033: 2026-11-01, día de las versiones 0.5.16 a 0.5.18.
- **MVP**: `docs/vision.md` define el primer MVP útil como muros, losas, puertas y ventanas en
  planta y 3D, exportación IFC y cantidades hacia PresupuestosPro. Se cumple al integrar O009
  (medición, versión 0.5.6) el **2026-10-25**; el hito va hecho en esa fecha.
- **Pendientes**: arrancan el 2026-11-03 con la regla pedida (lunes a jueves una tarea cada dos
  días; sábado y domingo dos tareas por día). Inicio de cada una:
  O034 3 nov, O035 5 nov, O036 y planos 7 nov, escaleras y cubiertas 8 nov, recortar/extender
  9 nov, espejo/matriz 11 nov, copiar muro y barandales 14 nov, DXF 15 nov.
- **FX**: fechas estimadas de una semana por idea, después de los pendientes (18 nov a 29 dic).

## Agrupaciones

Se unieron sub-specs del mismo tema en una fila: O001A–B (motores IFC), O003A–B (núcleo y
modelado), O005A–B (lineamientos), O006A–B (cotas), O007A–C (tipos y estructura), O011A–B
(ejes y anotación), O012A–B (uniones), O014A–B (niveles), O021A–B (acomodo de ejes y textos).

## Pendientes y reutilización

Las 11 pendientes son las pedidas: O034 (asas de borde de losa), O035 (muro hasta el lecho de la
zapata), O036 (lo que `docs/progreso/O028.md` dejó pendiente), planos y PDF, escaleras, cubiertas,
y cinco puntos de `docs/hoja-de-ruta.md`: recortar/extender, espejo/matriz, copiar muro con vanos,
barandales y exportación DXF. Las 6 ideas de `ideas/` que quedan en `FX` son cálculo estructural,
asistente desde imágenes/CAD, instalaciones, plugin de SketchUp, render con Blender y armado
paramétrico del acero.

## Verificación

- DOM headless: 54 `class="fila"` para 54 tareas; 53 barras + 1 hito; `k-avance` = 55 %;
  sin `undefined` ni `NaN`.
- Captura 1600×1100: barras de color por fase, línea «hoy» del 2026-11-02 y fin de semana
  sombreado.
