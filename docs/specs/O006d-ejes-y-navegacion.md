# O006d — Ejes con restricciones iniciales, retícula en ambos sentidos y navegación

El usuario probó la 0.5.0. Esto es lo que pidió:

## 1. Navegación que se descubra y funcione con touchpad
- **Lo que ya hay:** rueda para el zoom, botón medio o espacio + arrastre para el paneo, y el botón Ajustar. El usuario no lo encontró.
- **Touchpad:**
  - pellizco (`wheel` con `ctrlKey`) = zoom hacia el cursor;
  - desplazamiento con dos dedos (`wheel` con `deltaX` o `deltaY` sin `ctrlKey`, y valores pequeños o no enteros de `deltaMode=0`) = **paneo**;
  - la rueda de ratón (saltos grandes, `deltaMode=1`, o enteros de ±100 o ±120) = zoom.

  Implementa una heurística y anótala. Agrega una opción en Configuración: «Rueda/touchpad: zoom o paneo».
- **Atajos:** `Shift` + rueda = paneo horizontal; `+` y `−` = zoom; `F` o doble clic con el botón medio = Ajustar.
- **Ayuda visible:** abajo a la derecha del visor, un texto discreto «Rueda: zoom · Botón medio/Espacio+arrastrar: mover · F: ajustar» que se puede cerrar y queda oculto una vez cerrado. Agrégalo también al manual de Ayuda.
- **vitest:** clasificación de eventos `wheel` (ratón contra touchpad y pellizco).

## 2. «Ejes por separaciones» en ambos sentidos a la vez
### El diálogo
Tiene dos bloques en la misma pantalla:
- **Ejes verticales (numerados):** separaciones, por ejemplo «5, 4.5, 5», y la primera etiqueta (1).
- **Ejes horizontales (con letras):** separaciones, por ejemplo «4, 4», y la primera etiqueta (A).

Cualquiera de los dos bloques puede ir vacío.

### Longitud de los ejes, dos modos
- **«Desde el origen»** (el actual): origen y longitud fija.
- **«Rebase sobre los ejes opuestos»** (por omisión): cada eje va de un extremo al otro de la familia perpendicular y sobresale un **rebase** (1.5 m por omisión) en cada punta. Por ejemplo, los verticales van desde `A − 1.5` hasta `C + 1.5`.
  - Si solo hay una familia, se usa el modo origen con la longitud indicada.
  - El rebase se guarda en el pset `OPENRVT_Reticula` del `IfcGrid`.
  - Cuando cambia la separación de la familia opuesta, por cotas o por mover un eje, los extremos se **recalculan**: los ejes siguen rebasando la misma distancia.

### Cotas del rebase
- En planta, en un extremo, se dibuja una **cota del rebase** (del eje opuesto extremo a la punta del eje).
- Es **editable** con doble clic, igual que las cotas entre ejes: cambia el rebase de toda la familia.
- La cota del rebase se dibuja más chica (o con otro color) para distinguirla.

### Vista previa
En vivo, en planta, antes de aceptar.

## 3. Eje suelto con restricciones iniciales
**Al dibujar un eje con la herramienta Eje, si ya hay ejes:**
- **Paralelo:** si el trazo forma menos de 15° con una familia existente, el eje se **fuerza paralelo** a esa familia.
- **Longitud y extremos:** el eje toma la longitud y los extremos alineados de los ejes de su familia. Es decir, el mismo inicio y fin proyectados, o el rebase de la retícula si existe. El segundo clic solo define la posición (la distancia perpendicular).
- **Cota temporal:** mientras se mueve el cursor, se ve la distancia al eje paralelo más cercano. Se puede **teclear la distancia** y dar Enter, como en Muro.
- **Etiqueta:** la siguiente de su familia.
- **Sin restricciones:** con **Ctrl** (o Alt) presionado se dibuja libre, como ahora. Ayuda a la vista: «Ctrl: eje libre».
- **El primer eje** (sin otros) se dibuja libre, como ahora.

**Después de crearlo:**
- Se edita a gusto (Mover y propiedades) sin que las restricciones lo regresen. Son **solo iniciales**.
- Las **cotas automáticas** entre ejes paralelos (O006a) lo incluyen de inmediato. Verifica con un E2E: 3 ejes sueltos paralelos → 2 cotas parciales y 1 total, editables.

## 4. Verificación
- **Todo en verde:** build, vitest, cargo test, clippy y pytest.
- **pytest:**
  - crear la retícula en ambos sentidos en modo rebase;
  - recalcular los extremos al cambiar una separación;
  - cambiar el rebase.
- **vitest:**
  - la restricción de paralelismo y de longitud;
  - Ctrl libre;
  - la heurística de `wheel`.
- **E2E:**
  - retícula «5, 4.5, 5» × «4, 4» con rebase 1.5: los verticales miden 8 + 3 = 11 m y los horizontales 14.5 + 3 = 17.5 m;
  - editar el rebase a 2: los verticales pasan a 12 m;
  - dibujar un eje suelto a unos 6 m del eje 4 con la distancia tecleada «6»: queda paralelo, con la misma longitud y con su cota de 6.00.
- **Capturas:** `o006d_reticula.png` y `o006d_eje_suelto.png`. Ábrelas y revisa que se lean.

## Entrega
- **Versión 0.5.1.** A partir de ahora, la versión **solo sube el último número** en cada entrega, igual que PresupuestosPro (0.13.x). El segundo número solo cambia en hitos grandes que defina el supervisor.
- `docs/progreso/O006d.md` con la etiqueta «LISTA PARA REVISIÓN».
- Commits en español. No hagas push.
