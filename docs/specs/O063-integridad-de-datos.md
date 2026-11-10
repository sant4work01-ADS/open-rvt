# O063 — Integridad de datos: guardado, núcleo caído, rollback, losas, unidades, totales

Origen: auditoría del 9-nov. Ningún dato del usuario se pierde ni se cobra mal sin aviso.
Lee los archivos grandes con grep y sed -n. Lo nuevo va en módulos propios (300–600 líneas).

## 1. Guardado atómico (nucleo, guardar IFC)
- Escribir en `<destino>.tmp` en la misma carpeta, flush + fsync, y `os.replace(tmp, destino)`.
- Antes de reemplazar, si `destino` existe, copiarlo a `<destino>.bak` (uno solo, se sobrescribe).
- Si falla la escritura, `destino` queda intacto y se borra el .tmp; el error llega a la UI.
- Prueba: guardar sobre un archivo existente → .bak igual al anterior byte a byte, destino nuevo
  legible con ifcopenshell; simular fallo a media escritura (monkeypatch) → destino sin cambios.

## 2. Núcleo caído o con timeout (src-tauri/src/nucleo.rs ~l.20, 212-224, 320-382)
- No reintentar automáticamente un método que muta el modelo (lista explícita: todo lo que no sea
  lectura/consulta/teselar/medicion). Las lecturas sí pueden reintentarse una vez.
- Tras muerte o timeout: emitir un evento a la UI; la UI muestra un aviso MODAL «El núcleo se
  reinició; los cambios sin guardar de este modelo se perdieron. Abre de nuevo el archivo.» y
  bloquea la edición (los comandos de edición quedan deshabilitados) hasta abrir/crear un modelo.
- `geometria.teselar` con tiempo límite propio de 180 s; el resto sigue en 60 s.
- Pruebas: Rust (unitaria de la clasificación mutador/lectura) y vitest del aviso y el bloqueo.

## 3. Rollback de la instantánea (servidor.py / despachar; modelo.py ~l.181)
- Si un comando mutador lanza excepción después de `_instantanea()`, se restaura el modelo a esa
  instantánea y se saca del historial, y luego se devuelve el error.
- Prueba: comando que crea un muro y falla a la mitad (monkeypatch) → el modelo tiene los mismos
  elementos que antes (mismos GlobalId) y deshacer no ve un paso extra.

## 4. Losa sin contorno legible (modelado.py ~l.8141/8154)
- Quitar el cuadrado 1×1 de respaldo. Si no se puede leer el contorno, la losa sale en Cantidades
  con un error visible «sin contorno legible» y SIN área ni volumen (no suma). Mismo trato en
  `_tope_dado` (~l.474): se anota el aviso, no se ignora en silencio.
- Prueba: losa con representación BRep sin pset de contorno → error en el resultado, área ausente.

## 5. Unidad del IFC (modelado.py ~l.2798; modelo.py ~l.255)
- Al abrir, leer la escala con `ifcopenshell.util.unit.calculate_unit_scale`. Si no es 1.0 (metros),
  rechazar la apertura con el mensaje «El archivo está en <unidad>; OPEN-RVT solo abre IFC en
  metros por ahora.» (no convertir todavía).
- Prueba: IFC creado en milímetros → error claro; IFC en metros → abre igual que hoy.

## 6. Totales por unidad (src/features/modelo/CantidadesView.tsx ~l.86-88, 139)
- Quitar el total general mezclado; mostrar un total por unidad (m, m², m³, kg, pza).
- Prueba vitest con partidas en m² y m³: dos totales correctos, a mano.

## 7. shapely declarada
- Agregar `shapely` a dependencies de nucleo/pyproject.toml y comprobar que el python embebido
  del instalador (herramientas/preparar_python.sh) la incluye.

## Batería
pytest completo, tsc, lint, vitest completo, cargo test del src-tauri, E2E o035 o050 o054 o056
o057 o058 o059 o061 o062 herramientas (uno a la vez, con `pesado`). docs/progreso/O063.md con salidas.
