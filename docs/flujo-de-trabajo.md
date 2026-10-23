# Flujo de trabajo (borrador v0)

Ordenado a partir de [la idea del usuario](../ideas/2026-10-22-flujo-y-licencias.md). Es un borrador
para discutir; los nombres y detalles se definen al diseñar cada parte.

## 0. Core primero
Antes de cualquier herramienta visual, un **core usable**: modelo de datos del proyecto, ejes,
niveles, elementos, restricciones, capas, guardado/abrir, deshacer. Luego visibilidad, edición, etc.

## 1. Referencias del proyecto
| Paso | Qué | Estados |
|---|---|---|
| Proyecto | nombre, unidades, ubicación | — |
| Ejes | rejilla con nombres (A, B… / 1, 2…), espaciado por cota | congelado |
| Niveles | alturas por cota (NPT, entrepisos, azotea) | bloqueado |
| Vistas base | planta por nivel y alzados generados de ejes + niveles | — |

## 2. Elementos con restricciones
- Catálogo de **elementos predefinidos** (muro, columna, trabe, contratrabe, losa, zapata, cerramiento,
  puerta, ventana…).
- Se dibujan con **vector tipo CAD** o con **snap** a referencias.
- Cada elemento guarda sus **restricciones**: a ejes, a niveles y a **otros elementos o sus caras**
  (p. ej. «muro de nivel 1 a fondo de trabe»). Si la referencia se mueve, el elemento se ajusta.
- Edición y ajuste después de dibujar (mover, estirar, cambiar tipo, cambiar restricciones).

## 3. Organización: capas en árbol tipo presupuesto
- Árbol de capas como capítulos de presupuesto: Preliminares › Cimentación › Estructura › Albañilería
  › Instalaciones › Acabados…
- Cada capa: visible/oculta, congelada (no editable), bloqueada, color/estilo.
- Este mismo árbol es el que después **se liga a PresupuestosPro** (capítulos ↔ capas, elementos ↔
  conceptos, cantidades ↔ generadores).

## 4. Cortes y alzados
- Cortes **horizontales** (plantas) y **verticales** (secciones), y alzados.
- Un corte no es solo un dibujo: **cambia cómo se ve el modelo y cómo lo tratan las demás
  herramientas** (p. ej. qué se cuantifica o se edita en esa vista).

## 5. Disciplinas
- Apartado de **instalaciones** (hidráulica, sanitaria, eléctrica…), probablemente como ramas del árbol
  de capas con herramientas propias.

## 6. Referencias externas
- **Imágenes** (planos escaneados, croquis) escaladas como en CAD: punto A, punto B y distancia real.
- Más adelante: DWG/DXF e IFC como referencia.

## 7. Salidas
- Liga a **PresupuestosPro** (cantidades por elemento/capa → conceptos y generadores).
- **Renders** (p. ej. Eevee de Blender exportando el modelo).
- Planos y láminas (por definir).

## Política de licencias
Lo libre se usa. Si una licencia nos limita u obliga, eso se construye nosotros. GPL se usa si no limita.
