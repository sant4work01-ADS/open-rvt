# Plugin para SketchUp (BIM + costos)

Idea del usuario, 2026-10-22. Para después; no es prioridad todavía.

Un plugin de SketchUp que mezcle OPEN-RVT y PresupuestosPro:

- **Caja BIM:** dibujar elementos BIM (muros, losas, columnas, trabes…) con todas sus propiedades.
- **Caja de costos:** sacar cantidades del modelo y generar el presupuesto o los archivos de costos (formato de PresupuestosPro).
- **Enlace:** el modelo alimenta al presupuesto; si cambia el modelo, cambian las cantidades.

## Modelo de negocio
Este sí podría venderse (Extension Warehouse o venta directa) como fuente de financiamiento. Meta modesta: unos 40 USD al mes que cubran por lo menos los tokens.

## Por definir
- Licencia y precio (el resto de los proyectos es libre).
- API de SketchUp: Ruby y HtmlDialog para la UI.
- Cómo reutilizar el motor Rust de PresupuestosPro desde Ruby (biblioteca nativa, o sidecar con IPC).
