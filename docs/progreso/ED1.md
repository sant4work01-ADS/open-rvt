# ED1 — Recortar y extender elementos lineales

**LISTO PARA REVISIÓN**

Implementa la herramienta «Recortar/Extender» de la cinta, grupo MODIFICAR, atajo `TR`,
con sus tres modos en la barra de opciones: **A esquina** (por omisión), **Un elemento**
y **Varios elementos**. Trabaja solo en planta sobre muros, contratrabes, trabes, dalas,
cerramientos y zapatas corridas.

## Qué se hizo

### Núcleo (`nucleo/openrvt_nucleo/modelado.py`)

- Nuevo método `elementos_recortar_extender(globalid, referencia, punto_conservar)`.
  `referencia` puede ser el GlobalId de un elemento lineal o de un eje.
- Nuevo método `elementos_recortar_esquina(globalid_a, globalid_b, punto_a, punto_b)`:
  resuelve la esquina en **una sola** instantánea de deshacer llamando internamente dos
  veces al recorte cruzado.
- Se mide sobre la línea de ubicación de cada elemento (eje/paño del muro según O032).
- Se conserva el lado donde se hizo el clic; el otro extremo se lleva a la intersección.
- Paralelos y casi paralelos: se rechaza con el mensaje «Los elementos son paralelos.»,
  sin tocar el modelo ni el historial.
- Enlaces a ejes: el extremo ajustado pierde `EnlaceEjeInicio/Fin` y su desfase; el otro
  extremo conserva su enlace. Se añadió soporte de tramo con un solo extremo enlazado.
- Al mover el extremo inicial se rebasan las distancias de castillos y vanos para que
  sigan en el mismo punto del mundo.
- Los vanos que quedan fuera del muro se borran con aviso, por ejemplo
  «Se borró la puerta …: quedó fuera del muro.».
- Después del ajuste se recalculan uniones y dependientes con el mecanismo existente.
- Un solo paso de deshacer por operación; GlobalId conservados.

### Interfaz

- `src/features/ribbon/comandos.ts`: comando «Recortar/Extender» en Modificar, atajo `TR`.
- `src/app/App.tsx`: activación con `TR`, Enter/Esc terminan la secuencia de varios.
- `src/features/modelo/BarraHerramienta.tsx`: selector de modo y paso actual.
- `src/features/modelo/estado.ts`: modos, referencia, primer elemento y vista previa.
- `src/features/modelo/Visor3D.tsx`: clics sobre mallas o líneas de eje, vista previa
  tenue en planta y atributo `data-recorte-preview`.
- `src/features/modelo/planta.ts`: intersección de rectas (paralelas/casi paralelas) y
  elección del lado a conservar, como funciones puras.

## Pruebas

### pytest `nucleo/tests/test_ed1.py` — 11 pruebas

Valores escritos a mano en la cabecera del archivo:

- Esquina M1 (0,0)-(3,0) y M2 (4,1)-(4,5): quedan (0,0)-(4,0) y (4,0)-(4,5); área de M1
  4 × 2.60 = 10.40 m².
- Recorte contra el eje x=4: conservando (1,0) queda (0,0)-(4,0); conservando (5,0) queda
  (4,0)-(6,0).
- Extensión de contratrabe (0,0)-(2,0) hasta el muro x=5: queda (0,0)-(5,0).
- Paralelos: se rechazan sin cambios y sin instantánea.
- Vano a 5.00 m en muro de 6.00 m: al recortar a 4.00 m se borra y llega el aviso.
- Enlaces: el extremo ajustado pierde su enlace y el otro lo conserva.
- Deshacer devuelve ambos muros exactos (±1e-9).
- Flujo por el servidor JSON-RPC: recorte → guardar IFC → reabrir → coordenadas exactas y
  medición de muros 10.40 m².
- Bordes: columnas y referencias no lineales se rechazan; un `punto_conservar` vacío no
  cambia el modelo ni deja instantánea; al recortar el inicio de un muro, el vano que
  queda dentro se rebasa a la nueva distancia (1.00 m) y sigue existiendo.

```
$ uv run --with pytest --with ifcopenshell==0.9.0.post1 --with numpy --python 3.12 \
    pytest nucleo/tests/test_ed1.py -q
........                                                                 [100%]
```

### vitest `src/features/modelo/recortarExtender.test.ts` — 10 pruebas

- Intersección exacta de rectas (4,0), parámetros t y s.
- Paralelas y casi paralelas (seno 1e-6) sin corte; línea degenerada sin corte.
- Lado conservado según el clic: recorte por ambos lados, extensión y corte detrás del
  inicio; corte que anula la longitud.
- Atajo `TR`: el comando existe en Modificar, lleva `atajo = "TR"` y activa la herramienta.

### E2E `e2e/ed1.test.js` — clics reales

Con la app Tauri y WebDriver:

1. Dibuja M1, M2, M3, M4 y una contratrabe; abre el IFC guardado.
2. Activa la herramienta con la tecla `TR`.
3. A esquina con dos clics reales: captura antes, vista previa (comprueba
   `data-recorte-preview="si"` y píxeles naranjas nuevos en el PNG) y después.
4. Recorta M3 contra el eje x=4 conservando el clic en (1,6).
5. Extiende la contratrabe hasta el muro en x=5.
6. Deshacer (Ctrl+Z) y Rehacer (Ctrl+Y), comprobando los extremos tras cada paso.

Capturas: `docs/progreso/ED1/ed1-antes.png`, `ed1-previa.png`, `ed1-despues.png`.

```
$ OPENRVT_PYTHON=… OPENRVT_NUCLEO_DIR=…/nucleo \
  CARGO_TARGET_DIR=$HOME/.cache/pp-target/openrvt-ed1 \
  npx node --test e2e/ed1.test.js
✔ ED1: recortar y extender con clics reales (10.0 s)
```

Antes de construir el binario se ejecutó `herramientas/preparar_python.sh windows`
(163 MB sueltos, 54.0 MiB comprimidos) y el binario debug con `npx tauri build --debug
--no-bundle`.

## Cierre

- `npx tsc --noEmit`: sin errores.
- `npm run lint`: sin errores (solo avisos preexistentes de fast-refresh y hooks).
- vitest completo con `--maxWorkers=3`: **642 pasan, 1 falla**. La única falla es
  `actualizaciones.test.tsx > CA-8 · Linux descarga aparte`, que espera detectar Linux
  en el `navigator` del navegador de pruebas; en esta máquina Windows siempre da
  «Actualizar ahora». No toca nada de ED1 y no se modificó.
- pytest completo: **277 pasan, 6 omitidas, 5 fallan**. Las 5 fallas son de
  `test_o035.py` y vienen de `pytest.approx()` sobre listas de tuplas (el pytest actual
  del entorno ya no admite estructuras anidadas); las pruebas de ED1 pasan todas. No se
  tocaron esas pruebas.
- E2E o028, o032 y o041 ejecutados con el mismo binario: **3 de 3 pasan**.
- Capturas de esos E2E regeneradas por la corrida y revertidas para no ensuciar el
  commit; solo se agregan las de `docs/progreso/ED1/`.

Sin push, sin merge, sin cambio de versión ni dependencias nuevas.

