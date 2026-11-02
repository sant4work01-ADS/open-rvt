# O040: los cerramientos fallan (restricción de nivel, dibujo en planta, flujo completo)

Reporte del usuario (2-nov): «los cerramientos fallan, no puedo definir nivel de restricción, no se dibujan bien en
planta, y así». Es un bug con poco detalle.

**Antes de arreglar**, recorre el flujo completo con el modelo de prueba y anota cada falla en
`docs/progreso/O040.md`. El modelo de prueba:
- ejes 1–2 × A–B de 4 × 3 m;
- 4 muros Block 15 a eje, de Nivel 0 a Nivel 1 (Npt +2.60);
- losa en Nivel 1;
- castillos automáticos;
- «Cerramiento» sobre los 4 muros.

Cada falla que encuentres lleva su prueba que falle primero. Commit tras cada punto.

## Lo que hay hoy (léelo)
- `interacciones.py:_lineal_en_muro`: crea la viga en la corona nominal del muro (`z + altura − peralte/2`) y la liga
  al muro (`OPENRVT_Liga.Muro`).
- O028 (`modelado.py:_aplicar_restricciones`, rama `IfcBeam`): le aplica «Restricción de base + Desfase». Para
  `_lecho_bajo` (dala y cerramiento) mide al lecho **inferior**.
- `_actualizar_dependientes_muro`: vuelve a colocar el cerramiento con el muro.
- Hipótesis: la restricción y la liga se pisan. Editar el nivel del cerramiento lo mueve; después el muro lo regresa
  a la corona, o al revés. Para el cerramiento lo lógico es el lecho **superior**, no el inferior. Confírmalo.

## Comportamiento correcto
1. **Altura del cerramiento, regla única.** El dato guardado es el **lecho superior** del cerramiento:
   `Nivel de referencia + Desfase (m)`. El peralte sale del tipo y el fondo es `tope − peralte`.
   - **Ligado al muro** (al crearlo en un muro, por omisión):
     - el Nivel de referencia es el nivel de tope del muro y el Desfase es el desfase de tope del muro;
     - en el panel ambos se ven como texto, no editables, con la leyenda «Sigue la corona del muro M-…» y un botón
       «Soltar del muro» (mismo patrón que «Soltar enlace» de la zapata);
     - si se cambia el tope o la altura del muro, el cerramiento lo sigue.
   - **Suelto:** «Nivel de referencia» es un selector de niveles y «Desfase (m)» es editable.
     - Cambiar de nivel conserva el desfase respecto al nuevo nivel.
     - Cambiar la elevación del nivel mueve el cerramiento.
     - Cada cambio es un solo paso de Deshacer, con el GlobalId estable.
   - **Muro sin tope ligado** («sin conexión»): el cerramiento ligado toma `base del muro + altura`.
   - Para cerramientos no aplican «Restricción de tope» ni «Altura»: quítalos del panel, como hizo O033 con las
     zapatas.
2. **Corona del muro y castillos.**
   - La corona del muro termina en el fondo del cerramiento (`_rango_vertical_muro` ya lo intenta; verifícalo con un
     cerramiento suelto también).
   - Los castillos llegan al fondo del cerramiento.
   - Si se cambia el tipo y con él el peralte, se recalculan muro, castillos y cantidades.
3. **Esquinas.**
   - En L, T y cruz, los cerramientos de muros que se tocan cierran sin hueco y sin volumen duplicado. Usa la misma
     regla de prioridad que O007c para que las cantidades no cuenten dos veces la esquina.
   - En el 3D la esquina se ve llena.
4. **Planta (plano de corte 1.20 m, `vistas.ts:512`):**
   - el cerramiento queda por arriba del corte y se dibuja como **proyección superior**: dos líneas discontinuas
     (línea oculta) del ancho del cerramiento, finas, sin relleno, encima del muro y sin taparle el achurado;
   - la dala de desplante, que queda abajo y cubierta, no se dibuja en planta;
   - un elemento que cruce el plano de corte se dibuja cortado, como hoy;
   - documenta la regla en `planta.ts`.
5. **Flujo completo**, todo en verde. Si encuentras más fallas, arréglalas y anótalas.
   - Crear en muro y crear en varios muros a la vez.
   - Mover y estirar el muro: el cerramiento lo sigue.
   - Borrar el muro: el cerramiento cae con él.
   - Deshacer y rehacer.
   - Cambiar tipo.
   - Alzado y corte: se ve en su cota.
   - Cantidades: volumen, acero y cimbra según O009.
   - Guardar y reabrir.
   - Archivo de 0.5.18 con cerramientos viejos: abre y conserva su posición.

## Pruebas
- **pytest:** cada falla del recorrido, más:
  - ligado: tope = corona del muro (±1e-6);
  - subir Nivel 1 en +0.30 → sube 0.30;
  - soltar y cambiar a Nivel 0 + 2.40 → tope 2.40;
  - deshacer en un paso;
  - L sin volumen duplicado (suma de volúmenes = volumen de la unión, calculado a mano);
  - archivo viejo.
- **vitest:**
  - el panel de cerramiento ligado no muestra el selector editable;
  - el suelto sí;
  - la planta dibuja el cerramiento con trazo discontinuo y sin relleno.
- **E2E `e2e/o040.test.js`:**
  1. Crear el modelo de arriba.
  2. Seleccionar un cerramiento: sin error.
  3. Soltar y cambiar el nivel.
  4. Capturas de planta, alzado y 3D en `docs/progreso/O040/`, leídas como imagen.
- **Comprobaciones finales:**
  - `npx tsc --noEmit`;
  - `npm run lint`;
  - vitest `--maxWorkers=3`;
  - pytest del núcleo.
- **Reglas:**
  - `modelado.py` e `interacciones.py`: conserva su fin de línea.
  - **Otra rama (o037) trabaja en paralelo** zapata, eje con codo, bordes de losa y nivel borrado: no toques eso.
  - Sin push, merge, cambio de versión ni dependencias nuevas.
