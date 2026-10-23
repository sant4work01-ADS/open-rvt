# Motores de render de Blender en OPEN-RVT

Fecha: 2026-10-23 · Origen: conversación con el usuario (pruebas de render con Blender).

## Idea
Usar los motores de Blender para los renders de OPEN-RVT (el flujo v0 ya menciona EEVEE).

## Opciones y licencias
| Vía | Motor | Licencia | Implicación |
|---|---|---|---|
| Blender como programa externo (`blender -b -P script.py`), exportando la escena (glTF/USD) | EEVEE y Cycles | GPL-3 (Blender) | Llamar a un programa aparte NO obliga a OPEN-RVT a ser GPL. El usuario instala Blender (gratis). La más simple para empezar. |
| Cycles *standalone* embebido (repo oficial cycles) | Cycles | Apache 2.0 | Se puede integrar dentro de OPEN-RVT con cualquier licencia. Más trabajo (API C++, materiales propios). |
| EEVEE embebido | EEVEE | GPL-3, ligado al código de Blender | No existe como librería separada: embeberlo obligaría a GPL y a arrastrar medio Blender. Mejor usarlo vía Blender externo. |

## Propuesta
1. v0: botón «Renderizar» que exporta la vista/escena y llama a Blender externo con EEVEE (rápido, vista previa).
2. Si las pruebas de render prometen: opción «calidad final» con Cycles (externo primero; embebido solo si se necesita sin Blender instalado).

## Pendiente
- Resultados de las pruebas de render (costo, tiempo, calidad) — proyecto de pruebas aparte.
- Formato de intercambio: glTF (simple, materiales PBR) vs USD (más completo).
