# Hoja de ruta del editor

Orden decidido por el supervisor después de O004 (0.2.0). Cada tarea deja la app usable y con su instalador.

| Tarea | Contenido | Por qué en este orden |
|---|---|---|
| **O005** | **Lineamientos de dibujo:** plumillas (grosor y estilo de línea por categoría, por corte o proyección y por escala), rellenos de corte por material, líneas ocultas y de proyección arriba del corte en planta, abatimientos de puertas, símbolos de ventana | Hoy las plantas no se leen como plano arquitectónico. Es la base de todo lo que se imprime. |
| O006 | **Anotación:** cotas alineadas y en cadena (asociativas al muro), cotas temporales al seleccionar, textos, etiquetas de puertas y ventanas, niveles en alzado y corte, ejes con burbuja en todas las vistas | Necesita las plumillas de O005. |
| O007 | **Edición avanzada:** pinzamientos (grips) para estirar muros, recortar y extender, desfase, alinear, espejo, matriz, y copiar un muro con sus vanos | Velocidad de modelado al estilo Revit. |
| O008 | **Más elementos:** columnas, vigas, cubiertas (planas y a dos aguas), escaleras rectas, barandales y muros con capas compuestas | Completa una casa real. |
| O009 | **Láminas:** hojas con cuadro de datos, vistas colocadas a escala y exportación a PDF y DXF | El entregable del arquitecto. |
| O010 | **Cuantificación:** tablas por categoría (longitud, área y volumen netos) y **plantillas con criterio de medición** (lineal, área, volumen, pieza o perfil), como lo pidió el usuario | La base del enlace con PresupuestosPro. |
| O011 | **Enlace con PresupuestosPro:** exportar las cantidades por concepto | Después de O010. |

## Reglas que siguen vigentes
- IfcOpenShell es el núcleo, y toda edición pasa por comandos del núcleo.
- La interfaz es la de PresupuestosPro. Los archivos copiados llevan `// OPEN-RVT:`.
- Al cerrar cada tarea: pruebas en verde, capturas de la app real y publicación con el actualizador. Versión: solo sube el último número (0.5.1, 0.5.2…), como PresupuestosPro; el segundo número cambia solo en hitos grandes.
