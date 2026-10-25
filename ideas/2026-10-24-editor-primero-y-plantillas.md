# Editor primero; plantillas de elementos con indicador de medición (usuario, 2026-10-24)

## Prioridad (decisión)
1. Lo primero es un **editor** que use el núcleo IFC: crear y editar elementos.
2. El enlace a PresupuestosPro se agrega después, sobre el editor y sus elementos.

Esto cambia el orden de la ruta C de `docs/caminos-posibles.md`: el «visor + cuantificador» deja de ser el primer paso.

## Elemento → concepto (idea, se definirá después)
- Los elementos salen de **plantillas**. Cada plantilla trae un **indicador** de si se contabiliza y de cómo se mide. Ejemplos:
  - solo recto longitudinal (m);
  - por perfil de sección (área de sección × largo);
  - otros que se irán definiendo.
- Cómo se mide depende de la plantilla, no del elemento suelto.

## Interfaz (decisión del usuario, 2026-10-24)
- Igual que PresupuestosPro: ribbon, sidebar y área de trabajo. Es una app propia de escritorio (Tauri), **no Blender**.
- Blender queda solo como motor de render, si se usa.

## Plataformas (decisión del usuario, 2026-10-24)
Multiplataforma: **Windows y Linux** desde el inicio. Toda dependencia debe tener versión para las dos; IfcOpenShell, Tauri y web-ifc la tienen.

## Motor (decisión del usuario, 2026-10-24)
**IfcOpenShell es el núcleo.** Su peso, de unos 45 MB en el instalador, no es problema: «yo pensé que hablábamos de varios GB». No se reescribe en Rust. O001 y O001b siguen para medir rendimiento y edición, y para ver si web-ifc sirve como visor rápido dentro del webview.
