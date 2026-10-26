# Asistente que modela a partir de imágenes y CAD (usuario, 2026-10-26)

## Pedido del usuario
- Una función en el asistente para **pasarle imágenes o CAD** (planos, croquis, fotos, DWG/DXF).
- El asistente los **lee y razona** según su prompt de sistema, y **se pone a construir el modelo**.
- Lineamientos y **flujos de trabajo bien definidos**, con **herramientas suficientes**.
- Que pueda **ver el entorno** (capturas de la vista 3D o de las plantas) para **mejorar y pulir** el
  modelo.
- Que use lo que haya en la **biblioteca** como assets: tipos y familias IFC.
- Sería para cuando haya modelos capaces (visión y razonamiento espacial).

## Notas del supervisor (para cuando se diseñe)
- **Base:** el mismo arnés del asistente de PresupuestosPro, con conjuntos de herramientas,
  límite de pasos, confirmación, verificación automática y registro (specs 060 a 090 de PP).
- **Entrada:**
  - **CAD (DXF/DWG):** se lee de forma determinista con CADCraft o lo que se elija. El modelo no
    «ve» el CAD: recibe capas, polilíneas, cotas y bloques ya extraídos, como datos.
  - **Imagen:** va al modelo con visión, después de que el usuario la escala y la ubica sobre una
    retícula (como las «imágenes escaladas tipo CAD» del flujo v0). El modelo propone ejes,
    niveles y muros, y el usuario confirma la escala.
- **Flujo propuesto:**
  1. Leer la entrada.
  2. Proponer ejes y niveles.
  3. Proponer muros, losas y columnas con tipos de la biblioteca.
  4. Construir por etapas, con un grupo de deshacer por etapa.
  5. Verificar: choques, elementos sin tipo, alturas contra niveles y cerramientos abiertos.
  6. Capturar las vistas y compararlas con la entrada.
  7. Corregir.
- **«Ver el entorno»:** una herramienta `capturar_vista(vista, encuadre)` que devuelve una imagen
  al modelo, más consultas exactas por datos (no solo por imagen) para que no adivine medidas.
- **Herramientas mínimas:**
  - `crear_ejes`, `crear_niveles` y `colocar_elementos` por lote, con tipo y restricciones a ejes y
    niveles;
  - `buscar_en_biblioteca` (tipos IFC);
  - `verificar_modelo`;
  - `capturar_vista`.
- **Riesgo:** las medidas inventadas. Toda cota debe salir de una cota del CAD, de la escala
  confirmada o de lo que diga el usuario. Si falta, pregunta.
- **Prueba:** una batería de evals como la de PP, con planos de prueba y su modelo esperado, para
  medir qué modelos sirven antes de recomendarlos.

## Caso de prueba 1: croquis a mano de un baño (`croquis/2026-10-26-bano-a-mano.jpg`)
- **Lectura esperada:**
  - Ejes: 1–2 a 2.80 m y A–B a 1.80 m.
  - Muros perimetrales en los cuatro ejes.
  - Inodoro contra el muro del eje 1, mirando al este.
  - Mueble de lavabo contra el muro del eje A, junto al eje 2.
  - Ventana en el muro A, cerca del eje 1, de 0.40 m de alto.
  - Puerta en el muro B, junto al eje 2, de 0.90 × 2.20 m. Abre hacia adentro y la hoja queda
    contra el muro del eje 2.
- **Preguntas que debe hacer (no inventar):**
  - Espesor de muro y si los ejes van al centro.
  - Altura de entrepiso.
  - Ancho y antepecho de la ventana, y su distancia al eje 1.
  - Distancia de la puerta al eje 2.
  - Medidas del mueble.
  - Tipos de la biblioteca para el inodoro y el lavabo.
- **Si el usuario dice «usa lo típico», propone y marca como supuesto:**
  - muro de 15 cm a eje;
  - entrepiso de 2.50 m;
  - ventana de 0.60 × 0.40 m con antepecho de 1.80 m;
  - mueble de 0.55 m de fondo.
