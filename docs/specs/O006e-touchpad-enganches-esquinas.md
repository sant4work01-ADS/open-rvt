# O006e — Touchpad, enganches fiables y esquinas de muros limpias

**Reporte del usuario (2026-10-25), con la 0.5.2 en Windows:**
- el touchpad todavía no se reconoce bien;
- el enganche a los cruces de ejes falla a veces;
- las esquinas de los muros quedan muy mal acabadas.

**En paralelo** corre O007b (rama o007b), que agrega elementos estructurales y un enganche «cruce de ejes». **No agregues tipos de enganche nuevos.** Arregla el motor de enganches que ya existe (`interseccion` ya es el cruce de ejes). El supervisor resuelve el merge.

## 1. Enganches (`src/features/modelo/herramientas.ts` y quien la llame)
Causas encontradas por el supervisor; corrige las cuatro:
1. **La tolerancia está en metros** (`TOLERANCIA_ENGANCHE = 0.25`). Pásala a **píxeles de pantalla**:
   - `TOLERANCIA_PX = 12`;
   - `buscarEnganche` recibe `metrosPorPixel` y usa `tolerancia = 12 × metrosPorPixel`;
   - el visor ya calcula `mundoPorPx`: pásalo.
2. **El ángulo a 15° mueve el punto ya enganchado.** `puntoDibujo` aplica `fijarAngulo` después del enganche y lo saca del cruce.
   - Si el enganche es `extremo`, `medio`, `interseccion` o `perpendicular`, el punto se respeta tal cual, sin `fijarAngulo`.
   - El ángulo solo se aplica con el tipo `cuadricula`.
3. **La prioridad gana aunque esté más lejos:** un `medio` a 0.24 m le gana a una `interseccion` a 0.01 m.
   - Nueva regla: de los candidatos discretos dentro de la tolerancia, gana **el más cercano**.
   - La prioridad (`interseccion` > `extremo` > `medio` > `perpendicular`) solo desempata cuando la diferencia de distancia es ≤ 3 px.
4. **Las referencias deben estar al día:** `intersecciones` se recalcula después de cualquier cambio de ejes (crear, mover, rebase, eje suelto, borrar, deshacer).
   - Verifica dónde se llenan las `Referencias` y asegúralo con una prueba.
   - Las intersecciones incluyen los cruces de **todos** los pares de ejes no paralelos, dentro de sus segmentos más 0.5 m de tolerancia.

**Marcador visual:** el punto enganchado se dibuja con un símbolo por tipo, de 10 px de pantalla:
- cuadro: extremo;
- triángulo: medio;
- X: intersección;
- ⊥: perpendicular;
- nada: cuadrícula.

Además, un texto pequeño junto al cursor con el tipo («Intersección A-3»).

**vitest:**
- a 3 zooms (`metrosPorPixel` = 0.002, 0.02 y 0.2), un clic a 8 px de un cruce engancha y uno a 16 px no;
- con el ángulo a 15° activo, enganchar un cruce a 37° del origen devuelve el cruce exacto;
- un medio a 10 px y un cruce a 2 px: gana el cruce;
- después de mover un eje 1 m, el cruce nuevo engancha y el viejo ya no.

## 2. Touchpad (`src/lib/rueda.ts`, `Visor3D.tsx`)
**Causa:** `clasificarRueda` decide por un solo evento. Varios touchpads de Windows (los que no son «precision», o con el driver de ELAN/Synaptics) mandan `deltaY` entero de 100 o 120, igual que una rueda. Por eso el desplazamiento con dos dedos se vuelve zoom.

**Corrección:**
- **Clasificación por ráfaga,** con un objeto `DetectorRueda` y estado:
  - un evento con `|deltaY|` no entero, o con `deltaX ≠ 0`, marca **touchpad** durante 60 s;
  - si llegan más de 3 eventos en menos de 40 ms entre sí, con `|deltaY|` < 50, también es touchpad;
  - una rueda real manda eventos sueltos con delta ≥ 100 y > 30 ms entre sí;
  - el último dispositivo detectado se guarda en `localStorage`, como la preferencia que ya existe.
- **Gestos en modo touchpad:**
  - dos dedos = paneo;
  - pellizco (`ctrlKey`) = zoom hacia el cursor;
  - **Shift + dos dedos = órbita** en las vistas 3D;
  - en planta, Shift + dos dedos hace paneo horizontal, como ahora.
- **Configuración → Navegación:** «Dispositivo: Automático / Ratón / Touchpad», con el detectado entre paréntesis. Si el usuario elige uno, se usa siempre ese.
  - Reutiliza la `PreferenciaRueda` que existe; no hagas un segundo sistema.
- **Pantalla táctil (pointer events `touch`):**
  - un dedo arrastrando en vacío = paneo;
  - dos dedos = zoom por pellizco y paneo;
  - un toque = clic.
- **Diagnóstico:** `Ctrl+Shift+D` muestra un panel con los últimos 20 eventos `wheel` (deltaX, deltaY, deltaMode, ctrlKey, ms entre eventos) y la clasificación de cada uno. Sirve para que el usuario reporte si sigue fallando.
- **vitest del detector:**
  - una secuencia de rueda (100, 100 con 80 ms entre eventos) → zoom;
  - una secuencia de touchpad (enteros de 100 con 8 ms entre eventos) → paneo;
  - deltas fraccionarios → paneo;
  - pellizco con `ctrlKey` → zoom.

## 3. Esquinas de muros (núcleo y planta)
**Problema:** la planta dibuja cada muro y sus capas por separado, así que en las uniones en L, T y X las líneas se cruzan y queda el contorno de cada muro dentro de la esquina.

**Corrección:**
- **Geometría (núcleo):** al unir, los dos muros se recortan o se extienden hasta que sus caras exteriores e interiores se encuentran (inglete en L, a tope en T).
  - Comprueba que `_unir_muros` produce las representaciones recortadas. Si `connect_path` no las regenera, llama a la regeneración de IfcOpenShell (`geometry.regenerate_wall_representation` o equivalente).
  - **Enganche al eje:** un extremo de muro que cae a menos de la tolerancia de **la cara o del eje** de otro muro se lleva al eje de ese muro, para que la unión se forme. Hoy solo une si los extremos coinciden.
- **Planta (dibujo):**
  - **Contorno:** por nivel, el contorno de los muros de la misma clase es la **unión geométrica** de sus huellas (en el núcleo, con shapely, que ya viene con IfcOpenShell; o con clipper en TS). Ninguna línea de contorno queda dentro de una esquina.
  - **Capas a 1:50:** cada línea de capa se recorta contra la huella unida y en la esquina **se une con la línea de la misma capa** del otro muro:
    - en L, en inglete;
    - en T, la capa del muro que llega termina en la cara del núcleo del muro pasante, y los acabados del muro pasante siguen de largo.
  - **Rayado del núcleo:** se recorta igual, sin traslapes que lo dupliquen.
- **3D:** sin caras coplanares en las esquinas, es decir, sin parpadeo (z-fighting).
- **pytest:**
  - L, T y X con Block 15 y con «Block 15 aplanado-yeso»;
  - el volumen total = suma de los volúmenes recortados, sin doble conteo: L de 4 m + 3 m, h = 2.60, e = 0.15 → (4 + 3 − 0.15) × 0.15 × 2.60 = **2.6715 m³** ± 0.001, cuando los dos se dibujan por ejes que se encuentran en la esquina;
  - el extremo a 5 cm del eje de otro muro se une.
- **vitest:**
  - la huella unida de una L tiene 6 vértices;
  - la de una T tiene 8;
  - ninguna línea de capa cruza el interior de la otra pieza.

## 4. Verificación y entrega
- **Todo en verde:** build, vitest, cargo test, clippy y pytest.
- **E2E:**
  - una caja de 4 muros (L en las 4 esquinas) con un muro interior en T y un cruce en X;
  - capturas a 1:50 y 1:100: `o006e_esquinas_150.png`, `o006e_esquinas_1100.png` y `o006e_3d.png`;
  - captura del enganche a un cruce con el marcador: `o006e_enganche.png`.
  - **Ábrelas y revisa** que no haya líneas dentro de las esquinas.
- **Versión 0.5.4:** solo sube el último número. O007b usa 0.5.3; si choca, el supervisor lo arregla.
- Manual de Ayuda: «Novedades de la versión 0.5.4» y una sección «Navegación con touchpad» (es/en).
- `docs/progreso/O006e.md` con la etiqueta «LISTA PARA REVISIÓN».
- Commits en español al cerrar cada parte (1, 2 y 3). No hagas push.
- **Nada se aplaza.**
