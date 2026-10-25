# Elementos estructurales, editor de tipos, muros multicapa e instalaciones (usuario, 2026-10-25)

## Pedido del usuario
- Agregar elementos como zapatas aisladas, contratrabes, castillos y cerramientos, y **definir cómo interactúan entre sí**.
- Un **editor de elementos** para personalizarlos. Por ejemplo, las dimensiones de una columna o de un castillo, o su acero.
- **Muros multicapa:** núcleo de ladrillo o block, aplanado de mortero (repellado y fino), pintura, yeso, azulejo…
- **Instalaciones:** primero, que se puedan usar en el editor. Al final, el programa aprovecha toda la información.
- **«Primero es integración».** Las reglas de cálculo y la liga con PP van después.

## Principio de diseño (supervisor)
**Todo elemento sale de un tipo.**
- El tipo es un `IfcXxxType` y guarda:
  - **la geometría paramétrica:** sección, capas, dimensiones;
  - **el armado:** parámetros;
  - **la forma de medirse:** reservado para PP.
- La instancia solo guarda la posición, el nivel y sus excepciones.
- Al editar el tipo, cambian todas sus instancias. Así funcionan Revit y OPUS: el tipo de muro es como la matriz y la instancia como la cantidad. Esto deja lista la liga con PresupuestosPro: **tipo → concepto**.

Los parámetros propios van en psets `OPENRVT_*` del tipo. Siempre que IFC4 tenga la entidad, se usa la estándar: `IfcMaterialLayerSet`, `IfcRectangleProfileDef`, `IfcColumn`, `IfcFooting`, etc. Así otro programa BIM los entiende.

## Catálogo de elementos

| Elemento | Clase IFC4 | PredefinedType | Tipo define |
|---|---|---|---|
| Zapata aislada | `IfcFooting` | `PAD_FOOTING` | largo × ancho × peralte; dado opcional (sección y alto); plantilla de concreto pobre (espesor) |
| Zapata corrida | `IfcFooting` | `STRIP_FOOTING` | sección (ancho × peralte, o trapecial con corona); sigue un trazo |
| Contratrabe | `IfcFooting` | `FOOTING_BEAM` | sección b × h; une zapatas |
| Columna | `IfcColumn` | `COLUMN` | sección rectangular o circular |
| Castillo | `IfcColumn` | `USERDEFINED` «CASTILLO» | sección (15×15, 12×20…); va dentro del muro |
| Trabe | `IfcBeam` | `BEAM` | sección b × h |
| Cerramiento o dala de cerramiento | `IfcBeam` | `USERDEFINED` «CERRAMIENTO» | sección; corona el muro |
| Dala de desplante | `IfcBeam` | `USERDEFINED` «DALA_DESPLANTE» | sección; base del muro sobre el cimiento |
| Muro | `IfcWall` | `STANDARD` | capas (`IfcMaterialLayerSet`) |
| Losa | `IfcSlab` | `FLOOR` / `ROOF` | capas (concreto, firme, acabados) |

### Armado (acero) como parámetros del tipo, en el pset `OPENRVT_Armado`
- **Longitudinal:** cantidad y número de varilla (#3…#8, con su diámetro y su peso por m). En zapatas, parrilla en X e Y: número y separación.
- **Transversal:** estribos (número de varilla, separación en los extremos y en el centro, y longitud de la zona de confinamiento).
- **Recubrimiento.**
- **Castillo prefabricado** (armex): marca y modelo, como alternativa al armado.

En el editor se ve **la sección dibujada**, con las varillas y el estribo. Más adelante se generan las `IfcReinforcingBar` reales, de forma opcional, para el despiece. Primero bastan los parámetros: con ellos ya salen los kg de acero.

## Interacciones (reglas)
### 1. Prioridad de unión (quién corta a quién)
Sirve para que ningún volumen se cuente dos veces. Es la base de la cuantificación:

**zapata > contratrabe > columna > trabe > losa > castillo > cerramiento/dala > muro (núcleo) > acabados del muro**

Por ejemplo, el muro se interrumpe en el castillo, y el castillo llega hasta el cerramiento.

### 2. Alojamiento y dependencia
- **Castillo:**
  - se aloja en un muro; su ancho por omisión es el espesor del núcleo;
  - se coloca con un clic sobre el muro, o automáticamente en esquinas, en remates y a cada N m (la regla de mampostería confinada, 3 m por omisión, configurable);
  - si el muro se mueve, el castillo lo sigue;
  - **los acabados del muro pasan por encima del castillo:** el aplanado cubre el castillo. El núcleo no.
- **Cerramiento y dala de desplante:**
  - van ligados al muro: mismo trazo, ancho del núcleo, arriba o abajo;
  - si el muro cambia de largo o de altura, se recalculan;
  - el muro reduce su núcleo por la altura del cerramiento y de la dala.
- **Columna:**
  - se coloca en los cruces de ejes (con imán); un clic en «en todos los cruces» la pone en todos;
  - la base va a la cara superior de la zapata o del dado, y la parte de arriba al nivel superior o al lecho bajo de la trabe.
- **Zapata aislada:**
  - al crear una columna se ofrece una zapata debajo (centrada);
  - excéntrica en el lindero: la columna queda al ras de un lado;
  - su desplante es la profundidad desde el nivel de piso.
- **Contratrabe:** va de zapata a zapata siguiendo los ejes; su lecho alto queda al nivel de desplante del firme. Opción: «unir todas las zapatas de la retícula».
- **Trabe:** va de columna a columna; su lecho alto es el nivel menos el espesor de la losa (la losa se apoya en ella).
- **Losa:** se apoya en trabes y muros; su contorno se puede tomar de los paños (ya existe la opción «losa desde muros»).

### 3. Edición en cadena
- Si cambias la sección de un tipo, cambian todas sus instancias, y las dependientes se reajustan. Por ejemplo, la columna crece y la trabe se recorta.
- Si mueves un eje, se mueven las columnas y las zapatas ligadas a él. Esto sigue la idea de las cotas de ejes de O006.

## Muro multicapa
### Capa
Material, espesor, **función** y lado:
- función: núcleo, acabado, aislante o membrana;
- lado: exterior o interior respecto al núcleo.

### Biblioteca de materiales (`IfcMaterial` + pset `OPENRVT_Material`)
Cada material lleva:
- categoría, color y rayado para la planta y el corte;
- la unidad en que se mide (m², m³, kg);
- para PP, más adelante, el insumo.

Materiales semilla:
- núcleos: block de concreto 12/15/20, tabique rojo recocido, tabique hueco y tablaroca;
- acabados: aplanado de mortero (repellado, 1.5 cm), fino (0.5 cm), yeso (1 cm), pintura (película), azulejo con su pegazulejo, y pasta o tirol.

### Ejemplos de tipos

| Tipo | Capas, de exterior a interior |
|---|---|
| Muro block 15 aplanado-yeso | pintura · fino 0.5 · repellado 1.5 · block 15 · yeso 1.0 · pintura |
| Muro tabique 14 aplanado ambos lados | fino · repellado · tabique 14 · repellado · fino |
| Muro baño | fino · repellado · block 15 · repellado · pegazulejo · azulejo |

### Comportamiento
- La **línea de ubicación** puede ser el eje del núcleo, la cara exterior o la cara interior.
- En planta, a escala 1:50, se dibujan las capas; a 1:100, solo el contorno (fino y grueso según los lineamientos de O005).
- **Acabado distinto por cara o por tramo:** la instancia puede sobreescribir el acabado de una cara. Por ejemplo, azulejo solo hasta 1.20 m en la cocina. Va en una fase posterior (con zonas de acabado).

## Instalaciones (primero, integración en el editor)
Disciplinas y elementos IFC4:

| Disciplina | Elementos | Clases |
|---|---|---|
| Hidráulica | tubería (fría y caliente), conexiones (codo, te, reducción), válvulas, tinaco o cisterna, calentador, muebles (WC, lavabo, regadera, fregadero) | `IfcPipeSegment`, `IfcPipeFitting`, `IfcValve`, `IfcTank`, `IfcSanitaryTerminal` |
| Sanitaria | tubería con pendiente, registros, coladeras, bajadas pluviales | `IfcPipeSegment`, `IfcDistributionChamberElement`, `IfcWasteTerminal` |
| Eléctrica | tablero, circuitos, salidas (contacto, apagador, centro de luz, arbotante), luminarias, poliducto o conduit, cajas | `IfcElectricDistributionBoard`, `IfcOutlet`, `IfcSwitchingDevice`, `IfcLightFixture`, `IfcCableCarrierSegment`, `IfcJunctionBox` |
| Gas | tubería, regulador, medidor, aparatos | `IfcPipeSegment`, `IfcValve`, `IfcFlowMeter` |

### Integración (fase 1)
- **Tipos por disciplina:** diámetro, material (PVC, CPVC, cobre, PEX, poliducto…) y, en los aparatos, las dimensiones y la altura de montaje.
- **Trazo de tuberías:** polilínea en planta con elevación y **pendiente** (sanitaria, 2 % por omisión). Las conexiones se ponen solas en los quiebres.
- **Aparatos:** se colocan alojados en un muro (contactos y apagadores a su altura, de pared) o en una losa (centros de luz).
- **Sistemas:** cada elemento pertenece a uno (`IfcDistributionSystem`: «Hidráulica fría», «Circuito C-1»…) y se colorea por sistema.
- **Vistas por disciplina:** filtro de categorías con planos de instalación.

### Después (cuando la integración esté)
- cálculo de cargas por circuito y cuadro de cargas;
- diámetros por unidades mueble;
- caídas de pendiente;
- choques con la estructura (tubería que atraviesa una trabe);
- cuantificación hacia PP.

## Fases (specs)
| Fase | Contenido |
|---|---|
| **O007a** | Editor de tipos (marco general) + biblioteca de materiales + muros multicapa (capas en planta y corte) |
| **O007b** | Elementos estructurales: zapata aislada y corrida, contratrabe, columna, castillo, trabe, cerramiento y dala; tipos con sección y armado; herramientas para colocarlos |
| **O007c** | Interacciones: prioridad de unión (cortes), alojamiento (castillo y cerramiento en el muro), columnas en los cruces, zapata bajo la columna, edición en cadena |
| **O008a** | Instalaciones, integración: tipos, trazo de tubería con pendiente, aparatos alojados, sistemas, vistas por disciplina |
| **O008b** | Instalaciones, inteligencia: cálculos, choques y cuantificación |
| **O009** | Medición: cada tipo dice cómo se mide (m, m², m³, kg de acero) → liga con PP |
