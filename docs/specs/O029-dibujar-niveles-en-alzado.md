# O029: herramienta «Nivel» para dibujar niveles en alzado/corte (como la herramienta Eje)

Pedido del usuario (31-oct): «así como se dibujan ejes, quiero poder insertar niveles intermedios». Hoy los
niveles solo se crean desde la lista (`NivelesView.tsx`, núcleo `nivel_crear` en `modelado.py:515`).
Va DESPUÉS de O024/O025 (dibujo y estilos de nivel), O027 (asas) y O028 (enlaces), y reutiliza lo que esas tareas dejaron.

## Comportamiento
1. Ribbon «Modelar» → DATOS → «Nivel» (atajo `LL`). Solo se activa en alzado o corte; en planta o 3D, aviso «Abre un
   alzado o corte».
2. Dos clics, igual que la herramienta Eje: inicio y fin de la línea, siempre horizontal (el 2.º clic solo
   decide el largo). La cabeza queda en el extremo derecho, según `EstiloNivel`.
3. Mientras se mueve el cursor:
   - cotas temporales al nivel de abajo y al de arriba más cercanos;
   - las cotas temporales se pueden editar escribiendo un número y Enter, por ejemplo 0.50 sobre Nivel 1;
   - enganches a 0.05 m, a los extremos de los niveles existentes (alineación de cabezas) y a caras horizontales
     de losas y vigas.
4. Barra de opciones:
   - Nombre automático: siguiente número, o «Nivel 1.5» si cae entre Nivel 1 y Nivel 2; editable.
   - Casilla «Crear vista de planta», marcada por omisión: crea la vista de planta del nivel en el navegador.
   - Elevación exacta (campo numérico) como alternativa al clic.
5. «Copiar/Desfasar nivel»: seleccionas un nivel, Copiar con un desfase vertical (por ejemplo +3.00) y aparece el nuevo.
   Arreglo de N niveles a separación fija (como Arreglo de Revit).
6. El nivel nuevo aparece en todas las vistas de alzado y corte, en la lista de niveles y en las restricciones
   (base y tope de O016 y O028). Un solo paso de Deshacer.
7. Validaciones:
   - dos niveles a la misma elevación (±1 mm) → aviso, no se crea;
   - nombre repetido → sufijo automático.

## Pruebas
- vitest de nombre automático (entre «Nivel 1» y «Nivel 2» → «Nivel 1.5»), enganches, cota temporal editable y
  validaciones.
- pytest del núcleo:
  - crear un nivel intermedio a +1.50 entre 0.00 y 3.00 → orden correcto y planta creada;
  - deshacer → desaparecen el nivel y la planta.
- E2E `e2e/o029.test.js` con la app real:
  1. abre Alzado Norte;
  2. «Nivel», clic, escribe 1.50 y Enter → aparece «Npt +1.50m» medido;
  3. aparece la planta nueva en el navegador;
  4. Copiar el nivel +3.00 → +4.50;
  5. Deshacer en un paso.

  Capturas en `docs/progreso/O029/`.
- vitest `--maxWorkers=3`, `npx tsc --noEmit`, `npm run lint`, pytest del núcleo.
- LF; NO cambies fines de línea de archivos existentes. Commits por parte; sin push, merge, versión ni dependencias
  nuevas.
