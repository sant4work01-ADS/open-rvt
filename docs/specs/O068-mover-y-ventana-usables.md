# O068 — Mover y Ventana/Puerta que sirvan de verdad

Queja del dueño (17-nov, 0.5.39): «Mover está de adorno, para nada sirve». «Ventana no me deja
posicionarla, no me deja elegir un nivel como altura, no me deja ponerla donde quiero». Versión al
integrar: **0.5.41** (O067 lleva la 0.5.40; si O068 se integra antes, toma la 0.5.40).

Código actual: `src/features/modelo/estado/slices/clicPlanta.ts` (líneas ~236-268),
`estado/slices/herramientas.ts`, `estado/ayudas/edicion.ts` (`moverSeleccion`), núcleo
`modelado/edicion.py` (`elementos_mover`) y `aberturas.crear` en `servidor.py`.

## 0. Primero reproducir (E2E, con `pesado`)
Antes de arreglar, un E2E que haga lo que hizo el dueño y falle con el código actual:
a) Muro de 5 m en Nivel 0 → botón Mover del ribbon SIN selección previa → clic en el muro → 2 clics
   (base y destino a 2 m en X) → el muro debe quedar desplazado 2.00 m.
b) Lo mismo con selección previa.
c) Mover un eje (los ejes del ribbon «Eje») 1.00 m.
Anota en `docs/progreso/O068.md` qué falla y por qué (causa real, con la línea).

## 1. Mover (igual para Copiar)
- Sin selección al activar: fase «seleccionar». Cada clic sobre un elemento lo agrega o quita
  (resaltado). Enter, clic derecho o el botón «Listo» de la barra de opciones pasa a «punto base».
  Con selección previa salta directo a «punto base».
- Punto base y destino usan los MISMOS enganches que Muro (extremo, medio, cruce de ejes,
  intersección) y bloqueo ortogonal con Shift.
- Tras el punto base: vista previa en vivo de la selección desplazada (contorno punteado) + línea
  base→cursor con la distancia en m. Teclear un número + Enter mueve esa distancia en la dirección
  del cursor (como la longitud tecleada de Muro).
- Ejes: se pueden mover (cambia su posición; las cotas y burbujas los siguen). Los elementos
  enganchados al eje NO se mueven solos (no inventar).
- Errores del núcleo (abertura fuera del muro, cerramiento ligado) se ven como aviso; nada falla
  en silencio. Esc cancela en cualquier fase.
- Al terminar, Mover queda activo con la selección para mover otra vez (Esc para salir).

## 2. Ventana y Puerta (mismo código)
### Barra de opciones al activar la herramienta (como la de Muro)
Ancho (m), Alto (m), Antepecho (m, ventana 0.90 / puerta 0.00 por defecto) y **Nivel de referencia**
(select con los niveles; por defecto el nivel de la VISTA activa, no la base del muro). Se recuerdan
entre colocaciones.
### Colocar
- Al pasar sobre un muro: vista previa de la abertura centrada en el cursor, con cotas temporales a
  ambos extremos del muro (o a la abertura vecina más cercana).
- Clic coloca ahí. Teclear un número + Enter coloca la abertura con su borde a esa distancia del
  extremo del muro más cercano al cursor.
- Altura real: z_inferior = Elevation(nivel de referencia) + antepecho. El núcleo recibe
  `nivel` (globalid) y `antepecho` relativo a ese nivel, y lo convierte a la base del muro. Un muro
  N0→N5 debe aceptar una ventana en N2. Si queda fuera del muro (abajo, arriba o a los lados) →
  aviso claro con el motivo; no se crea nada.
- Espacio sigue volteando el lado.
### Editar después (PanelPropiedades, ventana/puerta seleccionada)
Campos editables: Ancho, Alto, Antepecho, Nivel de referencia, Distancia al inicio del muro.
Cada cambio regenera el vano, una sola instantánea por cambio. Mover (punto 1) desliza la abertura
sobre su muro (el núcleo ya lo soporta).

## Pruebas (valores a mano)
pytest `nucleo/tests/test_o068_aberturas.py`, niveles N0 0.00, N1 3.00, N2 6.00; muro 6 m N0→N2
(altura 6.00):
1. Ventana nivel=N1, antepecho 0.90, alto 1.20, ancho 1.20, distancia 2.00 → vano z = 3.90 a 5.10
   sobre la base del muro, x de 2.00 a 3.20.
2. Ventana nivel=N1 antepecho 2.50 alto 1.20 → 5.50+1.20 = 6.70 > 6.00 → error, modelo sin cambios.
3. Editar antepecho 0.90→1.10 → z 4.10; Deshacer → 3.90.
4. Editar distancia 2.00→4.50 → 4.50+1.20 = 5.70 ≤ 6.00 OK; a 5.00 → error.
5. Mover la ventana dx=1.00 → distancia 3.00.
6. Área neta del muro (0.15 de espesor, 6×6 = 36 m²) con la ventana = 36 − 1.44 = 34.56 m².
7. `ifcopenshell.validate` del IFC guardado sin errores.
vitest: barra de opciones de Ventana (valores por defecto, nivel = el de la vista), fases de Mover
(seleccionar → base → destino), distancia tecleada en Mover y en Ventana.
E2E: los 3 casos del punto 0 en verde, más: ventana en vista Planta Nivel 1 sobre muro N0→N2 con
nivel por defecto N1 → en Alzado Sur se ve a 3.90 (comprobar por propiedades). Capturas en
`docs/capturas/o068-*.png`.

Correr pytest, vitest y clippy completos. Informe en `docs/progreso/O068.md` con las salidas reales.
