# O003b — Herramientas de modelado

## Objetivo
Segunda mitad del editor: modelar una casa sencilla desde cero y guardarla como IFC válido.
- **Qué se puede crear:** niveles, ejes, muros, losas, puertas y ventanas.
- **Edición:** mover, borrar y cambiar propiedades, con deshacer y rehacer.

**Base:** O003a ya está en `main`. Ya existen el núcleo JSON-RPC (`nucleo/openrvt_nucleo/`), el puente `nucleo_llamar`, el visor three.js y las vistas.

**Decisiones tomadas (no las cambies):**
- Toda edición pasa por **comandos del núcleo** que usan la API de IfcOpenShell (`ifcopenshell.api`), como en `docs/evaluaciones/O001-motor-ifc.md` (O001b). El frontend no arma IFC.
- No cambies el aspecto de la interfaz copiada de PresupuestosPro.

## Parte 1: núcleo (métodos nuevos en `servidor.py` y `modelo.py` o módulos nuevos)
### Reglas para todos los métodos
- **Historial:** todo método que modifica deja su instantánea para deshacer, con el mecanismo de O003a.
- **Respuesta:** devuelve `{creados, modificados, borrados}` como listas de GlobalId, para que el visor re-tesele solo esos.

### Niveles
- `niveles.crear(nombre, elevacion)`
- `niveles.editar(globalid, nombre?, elevacion?)`
- `niveles.borrar(globalid)`: error si el nivel tiene elementos.
- Al crear un nivel, el frontend crea su vista de planta.

### Ejes
- Usan `IfcGrid`, uno por proyecto.
- `ejes.crear(etiqueta, x1, y1, x2, y2)` y `ejes.borrar(globalid)`.
- Etiquetas automáticas: números para los ejes verticales y letras para los horizontales, editables.

### Tipos de muro
- Al crear un proyecto nuevo se crean como `IfcWallType` con capas de material (`IfcMaterialLayerSet`):

| Tipo | Espesor |
|---|---|
| Block 12 | 0.12 m |
| Block 15 | 0.15 m |
| Block 20 | 0.20 m |
| Tabique | 0.14 m |
| Concreto | 0.15 m |

- `tipos.listar(clase)` devuelve los tipos de esa clase.
- En un archivo abierto que no los tenga, se agregan al crear el primer muro.

### Muros
- `muros.crear(tipo, nivel, x1, y1, x2, y2, altura=2.60, alineacion="centro"|"interior"|"exterior")`: muro por eje, con `IfcRelConnectsPathElements`.
- **Unión automática** con los muros cuyos extremos coincidan (± 1 cm): en L y en T.

### Losas
- `losas.crear(nivel, puntos[[x,y]…], espesor=0.12, desfase=0)`: polígono cerrado con `IfcSlab` FLOOR.
- `losas.desde_muros(nivel, globalids)`: el contorno exterior de un circuito cerrado de muros.

### Puertas y ventanas
- `aberturas.crear(clase="IfcDoor"|"IfcWindow", muro, distancia, ancho, alto, antepecho)`:
  - crea `IfcOpeningElement` + `IfcRelVoidsElement` + `IfcRelFillsElement`, con geometría simple de marco y hoja;
  - `distancia` se mide desde el inicio del muro.
- **Valores por omisión:**

| Elemento | Ancho | Alto | Antepecho |
|---|---|---|---|
| Puerta | 0.90 m | 2.10 m | 0 m |
| Ventana | 1.20 m | 1.20 m | 0.90 m |

- **Error** si no cabe en el muro o se traslapa con otra abertura.

### Edición general
- `elementos.mover(globalids, dx, dy, dz)`: los muros arrastran sus aberturas.
- `elementos.borrar(globalids)`: un muro borra sus aberturas y quita sus uniones.
- `elementos.copiar(globalids, dx, dy, dz)`
- `elementos.editar(globalid, cambios)`: nombre, tipo, altura, espesor de losa, ancho y alto de aberturas.
  - Si se cambia el tipo de un muro, se re-genera la geometría.

### Validación
- `proyecto.validar()` usa `ifcopenshell.validate` y devuelve una lista de problemas.

### Pruebas (pytest)
- **Casa de prueba:** 4 muros Block 15 en un rectángulo de 8 × 6 m, una losa desde muros, una puerta y dos ventanas.
  - Guardar, reabrir, conteos correctos, `validar` sin errores.
  - Volumen de muros con aberturas descontadas (± 1 %).
- Las uniones L quedan conectadas.
- Mover un muro mueve sus ventanas.
- Deshacer tres veces y rehacer tres veces deja el mismo estado.
- Una abertura que no cabe da error y el servidor sigue vivo.

## Parte 2: herramientas en la app
### Ribbon
- Nueva pestaña **Modelar**, con los mismos componentes del ribbon de PP:
  - grupo **Datos**: Nivel y Eje;
  - grupo **Construir**: Muro, Losa, Puerta y Ventana;
  - grupo **Modificar**: Mover, Copiar y Borrar;
  - grupo **Historial**: Deshacer y Rehacer.
- **Atajos al estilo Revit:**
  - WA muro, SB losa, DR puerta, WN ventana, GR eje, LL nivel;
  - MV mover, CO copiar, Supr borrar;
  - Ctrl+Z y Ctrl+Y;
  - Esc cancela la herramienta.
- **Selector de tipo:** al activar Muro aparece en la barra de opciones de la herramienta, junto con altura y alineación.

### Dibujo en planta
- Las herramientas trabajan **solo en vistas de planta**.
- **Puntos de enganche (snaps):**
  - qué se engancha: extremo, punto medio, intersección de ejes, perpendicular y cuadrícula de 0.05 m;
  - el ángulo se fija en múltiplos de 15° (Shift lo desactiva);
  - el marcador del snap activo se dibuja.
- **Longitud tecleada:** mientras dibujas un muro, teclear un número fija la longitud en metros y Enter confirma (por ejemplo `4.5`).
- **Cadena de muros:** se encadenan hasta Esc o doble clic.
- **Losa:** clic por vértice y doble clic para cerrar, o «Desde muros» seleccionando el circuito.
- **Puerta y ventana:**
  - se colocan sobre un muro con vista previa;
  - la posición se ajusta a 0.05 m y la cota a los extremos se muestra mientras se mueve;
  - Espacio voltea el lado de abatimiento.
- **Mover y copiar:** punto base y punto destino, con los mismos snaps.

### Selección y propiedades
- **Selección:** clic, Ctrl+clic para agregar y ventana de arrastre.
- **Panel de propiedades:**
  - con un elemento seleccionado, sus propiedades se vuelven **editables** (las de `elementos.editar`) y se guardan con Enter o al perder el foco;
  - los psets siguen en solo lectura.

### Refresco
- Tras cada comando se re-teselan solo los GlobalId devueltos y la barra de estado muestra el mensaje del núcleo.
- **Tiempo máximo** de un comando de muro sobre FZK-Haus: 500 ms.

### Módulo «Niveles y ejes»
- Hoy está vacío. Hazlo una tabla de niveles, con nombre y elevación editables y botones agregar y borrar.
- Debajo, la lista de ejes.

## Parte 3: verificación
- **Todo en verde:** `npm run build`, `npx vitest run`, `cargo test --workspace`, `cargo clippy -- -D warnings` y `pytest nucleo/tests`.
- **vitest:** la matemática de los snaps, la longitud tecleada y el ángulo a 15°.
- **E2E con la app real (como en O003a):**
  1. Proyecto nuevo.
  2. Dibuja 4 muros con longitud tecleada (8, 6, 8, 6).
  3. Losa desde muros, una puerta y una ventana.
  4. Mueve un muro, deshaz el movimiento y guarda.
  5. Reabre y comprueba los conteos.
- **Capturas a 1600 × 900:** `o003b_planta_dibujando.png` (con el snap visible), `o003b_casa_iso.png` y `o003b_propiedades_muro.png`.

## Entrega
- `docs/progreso/O003b.md` con la etiqueta «LISTA PARA REVISIÓN»: qué se hizo, salidas de pruebas, tiempos, capturas y desviaciones.
- Archivos copiados de PP que toques: comentario `// OPEN-RVT:` y actualizar `docs/origen-pp.md`.
- Commits en español al cerrar cada parte. No hagas push.

## No hagas
- No implementes cubiertas, escaleras, columnas, cotas o anotaciones, ni el enlace a PresupuestosPro.
- No empaquetes Python en los instaladores.
- No uses web-ifc.
