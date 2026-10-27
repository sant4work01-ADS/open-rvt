# O011: ejes con codos y extremos libres, anotación nítida, niveles en alzado y paneles plegables

Pedido del usuario (2026-10-27), con la captura `docs/notas-usuario/capturas/2026-10-27-alzado-ejes-niveles.jpg`:

> «necesito poderle poner unas 2 articulaciones a las líneas de ejes para no amontonarlos, también
> una opción para poder romper las reglas de alineación de algunos ejes para extenderlos más
> buscando una presentación correcta. […] los globos de eje, ya sea letra o número, deben ser más
> nítidos, porque al hacer zoom se pierde la nitidez y se ve rasterizado… lo mismo para los números
> de las cotas. […] las líneas de los niveles no llegan hasta el total de los ejes […] los globos de
> ejes se deben ver hacia arriba, no hacia abajo. Los niveles no aceptan cota de .1 algo. Necesito
> un botón para colapsar y expandir esos paneles […] también para el lado derecho.»

Versión: **0.5.8**. Lee primero `docs/METODO-DE-TRABAJO.md` y `CONTRIBUTING.md` («Cómo se prueba»).

**Fuera de alcance:** los defectos del 3D (esquinas, empates). El usuario los explicará después.

## 1. Cotas que empiezan con punto (`.15`)

`parsearCota` (`src/features/modelo/cotas.ts:173`) exige un dígito antes del punto, así que `.15`,
`,15` y `.15m` fallan. `parsearElevacion` sí los acepta.

- Una sola regla de lectura numérica, compartida por las dos funciones: una función interna que
  devuelve el valor en metros. Acepta:
  - `.15`, `,15` y `0.15`;
  - las unidades `m`, `cm` y `mm`;
  - espacios.

  Cada función conserva su validación propia: `parsearCota` exige un valor > 0, y
  `parsearElevacion` admite negativos.
- Mensaje de error de `parsearCota`: «Cota no válida: use .15, 0,15, 15cm o 150mm (mayor que
  cero).».
- Pruebas: `.15` → 0.15, `,15` → 0.15, `.15m` → 0.15, `15cm` → 0.15, `150mm` → 0.15, `0` → null,
  `-.15` → null en cota y −0.15 en elevación, `4.5.6` → null.

## 2. Globos de eje y números de cota nítidos con cualquier zoom

Hoy son `THREE.Sprite` con `CanvasTexture` (`burbujaEje` en `Visor3D.tsx:394` y sus vecinas en
431 y 472). Son de mapa de bits y se pixelan al acercar.

- Se reemplazan por **vectores**:
  - **El círculo del globo:** un anillo (`Line2`, o una malla de anillo con 64 segmentos o más) con
    relleno de fondo.
  - **El texto:** texto **SDF** con `troika-three-text` (licencia MIT; agrégalo a `package.json`).
    Lo usan los globos de eje, los números de cota, las etiquetas de nivel («Nivel 2 +6.00») y el
    total de cotas.
- **Tamaño en «papel»:** igual que en Revit, el tamaño de la anotación sale de la escala de la
  vista (globo de 8 mm a 1:100 = 0.8 m de modelo). Al hacer zoom crece con el dibujo y se mantiene
  nítido.
- **Colores** iguales a los de hoy, en tema claro y oscuro.
- **Prueba de nitidez (E2E):**
  1. Captura un globo con zoom ×1 y con zoom ×8.
  2. A ×8, en el borde del círculo no debe haber escalones de más de 1 px. Usa una métrica simple:
     cuenta los píxeles de color intermedio a lo largo de una línea radial; deben ser ≤ 2.
  3. Guarda las capturas en `resultados/O011/`.

## 3. Ejes: hasta 2 codos por extremo y extremos libres por vista

### Modelo
Son ajustes **de anotación por vista**, como en Revit: no cambian el `IfcGrid`. Van en el objeto
`Vista` (`src/features/modelo/tipos.ts:34`) y se guardan donde ya se guardan las demás propiedades
de la vista. Agrega:

```ts
/** O011: ajustes de eje en esta vista. Clave: GlobalId del eje. */
ejes?: Record<string, AjusteEjeVista>;
interface AjusteEjeVista {
  /** Extremos libres: si existe, ese extremo no sigue la alineación común. */
  extremoInicio?: [number, number];   // XY de la vista (m)
  extremoFin?: [number, number];
  /** Codos: 0, 1 o 2 vértices entre el final de la línea y el globo, por extremo. */
  codosInicio?: [number, number][];   // máx. 2
  codosFin?: [number, number][];      // máx. 2
}
```

Compatibilidad: una vista sin `ejes` se dibuja como hoy. Agrega una prueba que abre un modelo de
la 0.5.7.

### Reglas
- **Alineación por omisión:** como hoy, todos los extremos del mismo lado comparten la línea de
  alineación. Al arrastrar uno se mueven todos.
- **Candado por extremo:** con un eje seleccionado aparece un candado en cada extremo. Abierto, ese
  extremo se arrastra solo y se guarda en `extremoInicio` o `extremoFin`. Al cerrarlo, el extremo
  vuelve a la alineación común y se borra el ajuste.
- **Codos:**
  - **Agregar:** con el eje seleccionado, el botón «Agregar codo», o el menú contextual sobre el
    extremo, crea un codo. Va a una distancia en papel de 5 mm del globo y desplazado 5 mm de
    lado, como el «Add elbow» de Revit.
  - **Mover:** los dos vértices se arrastran con sus asas.
  - **Límite:** máximo 2 por extremo; el botón se deshabilita al llegar a 2.
  - **Quitar:** el menú contextual del codo ofrece «Quitar codo».
  - **Dibujo:** el tramo entre el extremo de la línea y el globo se dibuja como polilínea con la
    misma línea del eje.
- Todo se puede deshacer y rehacer (una sola entrada por arrastre).
- Funciona en plantas y alzados. En el 3D no aplica.

### Pruebas
- **Unitarias:** la geometría de la polilínea con 0, 1 y 2 codos, con coordenadas calculadas a mano
  en el comentario.
- **E2E:**
  1. agregar 2 codos a un eje;
  2. intentar un tercero y comprobar que el botón está deshabilitado;
  3. abrir el candado de un extremo y arrastrarlo 1 m: solo ese eje cambia;
  4. cerrar el candado: vuelve a la alineación;
  5. guardar, reabrir y comprobar que persiste;
  6. Ctrl+Z.

## 4. Alzados: niveles y globos

Mira la captura: las líneas de nivel solo llegan a los ejes de la derecha, y los globos de eje
salen abajo.

- **Líneas de nivel:** en alzados y cortes, cada línea de nivel se extiende a lo ancho de **todos
  los ejes visibles** de la vista, más el margen de la etiqueta (3 mm en papel). Lo mismo para la
  línea de cota «Total».
- **Globos de eje:** en alzados y cortes van **arriba**, encima del nivel más alto visible más un
  margen de 3 mm en papel, con la línea del eje desde abajo del nivel más bajo hasta el globo. Abajo
  no se dibuja ningún globo. Los codos y extremos libres de la sección 3 también aplican aquí.
- **Prueba E2E** sobre el modelo de la captura (5 niveles, 7 ejes): la coordenada X de cada línea
  de nivel cubre del eje más a la izquierda al más a la derecha, y todos los globos quedan por
  encima del Nivel 4.

## 5. Paneles laterales plegables

- **Panel izquierdo** (Vistas, Paleta, Capas…):
  - un botón «‹» en su encabezado, donde el usuario marcó en verde, lo pliega y deja solo la barra
    de iconos;
  - plegado, un botón «›» lo vuelve a abrir.
- **Panel derecho** (Propiedades de la vista o del elemento): lo mismo, con «›» para plegar y «‹»
  para abrir. El botón «Propiedades» de la barra superior sigue funcionando.
- El visor ocupa el espacio liberado y se reajusta solo, sin deformarse.
- El estado de cada panel se recuerda entre sesiones, en la configuración de la app.
- **Atajos:** Ctrl+Alt+← (izquierdo) y Ctrl+Alt+→ (derecho), en la tabla de atajos.
- **Pruebas:** vitest de los botones y un E2E que pliega los dos paneles y comprueba que el canvas
  creció.

## Entrega

- `npm test` (vitest), `npx tsc --noEmit`, eslint, pytest si tocas Python y los E2E nuevos y
  relacionados, todo en verde.
- Capturas antes y después en `resultados/O011/`:
  - alzado Norte del modelo de la captura;
  - globo con zoom ×8;
  - eje con 2 codos;
  - paneles plegados.
- Versión 0.5.8 en `package.json`, `src-tauri/tauri.conf.json` y `Cargo.toml`.
- `docs/progreso/O011.md` con una tabla pedido → hecho → prueba y las «Notas de la versión».
- Commits en español. Sin push.
