# Flujo de trabajo y política de licencias (usuario, 2026-10-22, palabras casi textuales)

## Licencias
«Lo que sea libre será usado; lo que nos limite o coaccione por licencia será construido, si es que
limita. Si esa GPL no nos limita la usamos; si nos limita se construye.»

## Camino
Analizar los recursos que tenemos y empezar a trabajar con el **core**. Cuando el core sea usable, se
le empiezan a añadir cosas: visibilidad, edición, etc.

## Flujo de trabajo (primera idea)
1. Crear el proyecto.
2. Dibujar **ejes**, espaciados con cota; **congelar** los ejes.
3. Crear **niveles**, espaciados con cotas; poder **bloquearlos**.
4. Con eso ya hay **planta y alzado** como referencias.
5. Elegir un **elemento predefinido** y dibujarlo con vector tipo CAD o con **snap a ejes y niveles**,
   definidos como **restricciones** del elemento. Y así para todo.
6. Las restricciones no son solo ejes y niveles: **los elementos y sus caras** también sirven
   (p. ej. una trabe, una contratrabe, un cerramiento). Se define en su momento.
7. **Capas** (o algo así), organizadas en **árbol tipo presupuesto**: preliminares, cimentación,
   estructura… Las capas se pueden **congelar, ocultar**, etc.
8. Añadir elementos y poder **editarlos y ajustarlos**.
9. **Cortes** verticales y horizontales que afectan cómo se ve el modelo **y cómo lo tratan las
   demás herramientas**. Igual para **alzados**.
10. Apartado de **instalaciones**.
11. **Imágenes de referencia**, escaladas como en CAD: punto, otro punto y a dónde se escala (u otra
    forma de escala/ajuste).
12. Con el proyecto completo: **liga a PresupuestosPro**.
13. **Renders**, aunque sea con Eevee de Blender o algo así.

Saldrán muchas cosas intermedias y más específicas, como pasó en PresupuestosPro.
