# O006a — Cotas entre ejes y entre niveles (las cotas mandan)

**Pedido del usuario:** «no veo cotas entre esos ejes; las cotas van a definir el espacio entre ejes. Y así para niveles».

**Idea central:** la cota no es solo un dibujo. Al editar su valor se mueve el eje o el nivel. Es la forma principal de fijar separaciones, como en Revit.

**Base:** `main` en 0.3.1. Los ejes ya se dibujan en planta a partir de `modelo.referencias.ejes` (O005c).

## 1. Núcleo (Python)
### `ejes.mover`
- **Firma:** `ejes.mover(globalid, desplazamiento)` desplaza el eje en perpendicular a su dirección, en metros y con signo.
- **Implementación:** modifica las coordenadas de los puntos de su `AxisCurve`.
- Un solo paso de deshacer.

### `ejes.separacion`
- **Firma:** `ejes.separacion(referencia, mover, distancia, cadena=true)`.
- Deja el eje `mover` a `distancia` del eje `referencia`. Los dos ejes deben ser paralelos; si no lo son, da error en español.
- Con `cadena=true`, los ejes paralelos que están **más allá** de `mover` (del lado contrario a `referencia`) se desplazan lo mismo, para conservar sus separaciones.
- Todo en un solo paso de deshacer.

### `ejes.crear_por_separaciones`
- **Firma:** `ejes.crear_por_separaciones(direccion, origen, separaciones, longitud, primera_etiqueta)`.
- Por ejemplo, `"vertical"`, `0`, `[5, 4.5, 5]`, `20`, `"1"` crea los ejes 1-2-3-4. Las etiquetas siguen la numeración (1, 2, 3… o A, B, C…).
- Si alguna etiqueta ya existe, da error en español.

### `niveles.separacion`
- **Firma:** `niveles.separacion(inferior, superior, altura, cadena=true)`.
- Fija la elevación del nivel superior en la elevación del inferior más la altura.
- Con `cadena=true`, los niveles que están arriba de `superior` suben o bajan lo mismo.

### Al cambiar la elevación de un nivel
Por `nivel_editar` o por `niveles.separacion`:
- los **elementos contenidos** en ese nivel se desplazan en Z lo mismo (su `ObjectPlacement`), igual que en Revit;
- si el `IfcBuildingStorey` tiene `ObjectPlacement` y los elementos son relativos a él, basta con mover el nivel. **Verifica cuál es el caso** en las casas de O003b y en FZK-Haus, y que no se mueva nada dos veces;
- todo en un solo paso de deshacer.

### Pruebas pytest
- `mover` y `separacion`, con cadena y sin cadena;
- error por ejes no paralelos;
- `crear_por_separaciones`;
- `niveles.separacion`: un muro del nivel 2 sube 0.30 m cuando el entrepiso pasa de 2.70 a 3.00;
- deshacer de cada uno;
- guardar y reabrir conserva todo.

## 2. Cotas de ejes en planta (frontend)
- **Cálculo:** son **automáticas y derivadas**, sin `IfcAnnotation`. Se calculan de `ejes_listar` en cada planta.
- **Agrupación:** se agrupan las familias de ejes **paralelos**. Por cada familia se dibujan dos líneas de cota afuera del extremo de las burbujas:
  - una **cadena de parciales** (entre ejes consecutivos);
  - una **cota total** (del primero al último), más afuera.
- **Lado:** se dibujan del lado de las burbujas.
- **Si hay un solo eje en la familia:** no hay cota.
- **Dibujo:**
  - plumilla nueva «Cotas» en `estilos.ts`, de 0.13 mm;
  - marcas oblicuas a 45° de 2 mm de papel (estilo arquitectónico);
  - líneas de extensión con separación de 1 mm al objeto;
  - texto encima de la línea, de 2.5 mm de papel, con escala por zoom igual que las plumillas;
  - formato en metros con 2 decimales («4.50»).
- **Editar:**
  - doble clic en un texto de cota parcial abre un campo en el sitio; con Enter llama a `ejes.separacion(eje_izq_o_inferior, eje_der_o_superior, valor, cadena)`;
  - casilla «Mover los siguientes» marcada por omisión (`cadena`); la elección se recuerda en la sesión;
  - en la cota total, la edición escala no tiene sentido: se muestra solo de lectura;
  - se aceptan «4.5», «4,5» y «450cm». Un valor ≤ 0 o no numérico muestra un error en la barra de estado.
- **Propiedades de la vista:** «Cotas de ejes» (sí o no), activada por omisión. Se guarda en la vista.
- **Diálogo de creación:** «Crear ejes por separaciones», en la pestaña **Arquitectura**, junto a Eje. Pide dirección, origen, separaciones separadas por coma, longitud y primera etiqueta, con una vista previa en planta antes de aceptar.

## 3. Niveles y sus cotas en alzados y cortes
- **Cada nivel en alzados y cortes:**
  - línea trazo-punto horizontal a lo ancho del modelo, más 1 m por lado;
  - cabeza en un extremo: triángulo de cota de nivel, nombre y elevación («N2  +3.00»), con la plumilla «Niveles» (0.13 mm);
  - hoy no se ven; verifícalo en la captura.
- **Cotas entre niveles:**
  - cadena vertical de entrepisos y cota total, al lado de las cabezas;
  - doble clic edita el valor y llama a `niveles.separacion`, con la casilla «Mover los de arriba» marcada por omisión;
  - doble clic en la elevación de la cabeza la edita directo (`nivel_editar`).
- **Ejes en alzados y cortes:** si un eje cruza el plano de la vista, se dibuja como línea vertical trazo-punto con su burbuja abajo, para referencia. Ese dibujo no se edita.

## 4. Verificación
- **Todo en verde:** `npm run build`, `npx vitest run`, `cargo test --workspace`, `cargo clippy -- -D warnings` y `pytest nucleo/tests`.
- **vitest:**
  - agrupación por familias paralelas;
  - orden y valores de la cadena;
  - parseo de «4,5», «450cm» y valores inválidos;
  - que la cota total no sea editable.
- **E2E (app real):**
  1. crea ejes por separaciones 5, 4.5, 5 (verticales) y 4, 4 (horizontales);
  2. comprueba que las cotas muestran 5.00 / 4.50 / 5.00 / 14.50 y 4.00 / 4.00 / 8.00;
  3. edita 4.50 a 6.00 con cadena y comprueba que el total pasa a 16.00 y que el último eje se movió 1.5 m;
  4. haz Ctrl+Z y comprueba que todo vuelve;
  5. en un alzado, cambia el entrepiso a 3.00 y comprueba que los muros del nivel superior subieron.
- **Capturas a 1600 × 900, revisadas por ti:**
  - `o006a_planta_cotas.png`: la retícula con sus cotas;
  - `o006a_editar_cota.png`: el campo abierto;
  - `o006a_alzado_niveles.png`: los niveles con cabezas y cotas.

  Revisa que el texto no se encime con las burbujas y que se lea a 1:100.

## Entrega
- Versión **0.4.0** en los cuatro archivos.
- **No subas instaladores a git** (están en `.gitignore`); el supervisor publica.
- `docs/progreso/O006a.md` con la etiqueta «LISTA PARA REVISIÓN».
- Commits en español al cerrar cada parte. No hagas push.

## No hagas
- No hagas restricciones ni candados: los muros **no** siguen al eje al moverlo (eso es O007).
- No hagas cotas libres a muros, textos ni etiquetas (O006b).
- No uses librerías nuevas.
