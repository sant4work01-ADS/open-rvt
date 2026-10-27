# Armado paramétrico y disposición del acero (usuario, 2026-10-27)

## Pedido del usuario
Capturas:
- `capturas/2026-10-27-config-zapata-dado.jpg`: zapata y dado con sus cotas nombradas;
- `capturas/2026-10-27-config-acero.jpg`: tabla de acero por familia de barras.

> «Un ejemplo del sistema para configurar elementos, solo en cuanto a dimensiones y acero. La idea
> es que se puedan adicionar las cantidades requeridas de acero y tipos, y de ahí, en planta y
> alzado, poderlos acomodar de manera correcta para futuros planos de armados y para cálculos
> estructurales. El acero no solo se debe poder definir, sino disponer de la mejor manera, como el
> usuario lo crea conveniente. Es idea nomás.»

### Lo que muestra el ejemplo
- **Dimensiones con nombre por parámetro** (se cotan en el croquis del tipo):
  - zapata: ZL1 (largo), ZL2 (ancho) y ZA1 (peralte);
  - dado: DL1, DL2 (sección) y DA1 (alto).
- **Familias de acero con nombre**, y en cada renglón: forma (VAR o EST), calibre (#3, #2) y
  separación (@ 20 cm), con listas desplegables:
  - zapata: ZL1 (lecho largo), ZT1 (transversal), ZB1 y ZB2 (bastones o lecho superior);
  - dado: DL1 a DL3 (longitudinales) y DT1 a DT3 (estribos).

## Notas del supervisor (para cuando se diseñe)

### Punto de partida
Hoy el tipo guarda el armado en el pset `OPENRVT_Armado` con campos fijos (`ParrillaVarilla`,
`ParrillaSepX`, `EstSepCentro`, etc.). `acero.py` solo **estima kg**; no hay barras IFC.

### Propuesta en 3 capas
1. **Editor de tipo como el del ejemplo:**
   - un croquis paramétrico del elemento, en planta y alzado, con sus cotas nombradas (ZL1,
     DA1…), editables y ligadas a la geometría;
   - una tabla de **familias de barras** donde el usuario agrega o quita renglones.

   Cada renglón lleva:
   - nombre;
   - función: lecho inferior, lecho superior, longitudinal, estribo, bastón o grapa;
   - forma: recta, con gancho, estribo cerrado o en U;
   - calibre;
   - criterio de cantidad: separación (@) **o** número de piezas;
   - zona: toda la pieza, extremos o centro, para el confinamiento de estribos;
   - recubrimiento;
   - ganchos y dobleces.
2. **Disposición automática con reglas y editable a mano:**
   - con la tabla, el núcleo coloca las barras: lechos a recubrimiento, estribos repartidos por
     zona y longitudes de anclaje;
   - en planta, alzado y corte el usuario puede **mover un juego de barras**, cambiar su
     separación, agregar o quitar barras sueltas y cambiar la longitud de un bastón;
   - lo editado a mano queda marcado («fijado por el usuario») y no se recalcula al cambiar el
     tipo, pero se avisa si deja de cumplir el recubrimiento o la separación mínima.
3. **Salida:**
   - barras IFC estándar (`IfcReinforcingBar`, con `IfcReinforcingBarType` por familia y la forma
     en `IfcBendingParameters`), para que otro programa las lea;
   - **planos de armado:** cortes con las varillas, marcas de familia (ZL1 #3 @20) y una tabla de
     **despiece** con marca, forma, cotas de doblez, longitud, piezas y kg por calibre;
   - **cuantificación hacia PresupuestosPro:** kg por calibre que salen de las barras reales, no de
     la estimación;
   - **cálculo estructural:** As colocada por lecho y cuantía, para compararlas con lo requerido.
     Se liga con `2026-10-26-modulo-calculo-estructural.md`.

### Reglas normativas a tomar en cuenta (NTC-Concreto 2023, verificar artículos)
- recubrimiento mínimo según la exposición;
- separaciones máxima y mínima;
- longitudes de desarrollo y de traslape;
- ganchos estándar;
- confinamiento de estribos en columnas.

### Orden sugerido
1. Tabla de familias en el tipo, con migración desde `OPENRVT_Armado`.
2. Barras IFC generadas automáticamente y su despiece.
3. Edición a mano en las vistas.
4. Planos de armado.
5. Enlace con el cálculo.

Antes de lanzar, conviene pedirle al usuario uno de sus planos de armado reales como referencia
de la salida esperada.
