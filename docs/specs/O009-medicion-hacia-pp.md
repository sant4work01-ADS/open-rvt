# O009 — Medición: cada tipo dice cómo se mide y las cantidades salen hacia PresupuestosPro

**Para qué:** el usuario cotiza obra (bardas, cuartos, remodelaciones). Del modelo deben salir las cantidades con su **número generador**, listas para PresupuestosPro (PP), sin volver a medir a mano.

**Base:** O007a (tipos, capas con función y lado), O007b/O007c (estructura, `cantidades.estructura`, cortes por prioridad, `area_neta_m2` del muro). **Reutilízalo**: no recalcules volúmenes por otro camino.

**En paralelo** corre la spec 089 de PP, que importa el archivo de esta spec. El formato del punto 4 es el contrato entre las dos: **no lo cambies.**

## 1. Partidas de medición del tipo (pset `OPENRVT_Medicion`)
Un tipo tiene una **lista de partidas**. Cada partida tiene:
- `Nombre`: texto, por ejemplo «Muro de block 15»;
- `ClavePP`: texto, la clave del concepto en PP (puede ir vacía);
- `Unidad`: `m`, `m2`, `m3`, `kg` o `pza`;
- `Criterio`: uno de la tabla de abajo;
- `Capa`: índice de la capa, solo en `area_capa`.

Guárdala como JSON en una sola propiedad `Partidas` del pset. Es más simple que una propiedad por campo y sobrevive a guardar el IFC.

| Clase | Criterio | Unidad | Cálculo |
|---|---|---|---|
| Muro | `area_nucleo` | m2 | `area_neta_m2` de O007c (largo × alto − vanos − castillos y columnas − cerramientos y dalas) |
| Muro | `area_capa` | m2 | largo de la cara de esa capa × alto − vanos (los castillos no se descuentan) |
| Muro | `largo` | m | largo del eje |
| Losa | `area` | m2 | área del contorno − huecos |
| Losa | `volumen` | m3 | neto de `cantidades.estructura` |
| Losa | `cimbra_borde` | m2 | perímetro × espesor |
| Columna, castillo, trabe, cerramiento, dala, contratrabe y zapata corrida | `volumen` | m3 | neto de `cantidades.estructura` |
| Las mismas | `acero` | kg | `acero_kg` del elemento |
| Columna y trabe | `cimbra` | m2 | columna: perímetro × altura; trabe: (2 × peralte + base) × largo neto |
| Castillo | `cimbra` | m2 | alojado: 2 × B × altura (las 2 caras que dan a los paños del muro); suelto: perímetro × altura |
| Zapata aislada | `volumen`, `acero`, `plantilla` (m2 = largo × ancho), `excavacion` (m3 = (largo + 0.40) × (ancho + 0.40) × desplante) | — | — |
| Puerta y ventana | `piezas` | pza | 1 |

**Largo de la cara de una capa:** usa las mismas reglas de esquina que la planta de O006e (inglete en L; en T, el que llega termina en el núcleo pasante). Calcúlalo en el núcleo con shapely: largo = área de la banda de la capa en planta ÷ su espesor.

**Partidas por omisión** de los tipos semilla, con la clave vacía:
- muros: `area_nucleo` del núcleo, más `area_capa` por cada capa de acabado (por ejemplo «Aplanado exterior», «Yeso interior», «Pintura interior»);
- estructura: `volumen` + `acero` + `cimbra` (zapata: `volumen` + `acero` + `plantilla` + `excavacion`);
- losas: `area` + `volumen` + `cimbra_borde`;
- puertas y ventanas: `piezas`.

## 2. Editor de tipos
- Nueva pestaña **«Medición»** en el centro del editor, para todas las clases. Es una tabla editable con Nombre, Clave PP, Unidad (solo lectura, sale del criterio), Criterio (select con los criterios válidos de la clase) y Capa (select con las capas, solo en `area_capa`).
- Botones: Agregar partida, Quitar y «Restablecer las de omisión».
- Cambiar las partidas no regenera la geometría. Va en un paso de deshacer.

## 3. Cálculo: `medicion.calcular(nivel=None)`
Devuelve, por partida (agrupando por `ClavePP` + `Unidad`, y si la clave está vacía, por `Nombre` + `Unidad`), el total y sus **renglones de generador**. Un renglón por elemento:
- `eje`: los ejes de la liga (por ejemplo «A-1»). En muros, los ejes de sus extremos si caen en ejes (por ejemplo «A / 1-2»); si no, vacío;
- `tramo`: nombre del nivel;
- `descripcion`: tipo + nombre del elemento (+ «capa: Aplanado exterior»);
- `piezas`, `largo`, `ancho` y `alto` cuando el criterio es un producto simple (muro: largo y alto; columna: ancho, peralte y altura). Cuando no lo es (con descuentos), los factores van vacíos y el resultado directo;
- `resultado`, redondeado a 4 decimales;
- `globalid` del elemento.

## 4. Formato de intercambio (contrato con PP): `medicion.exportar(ruta)`
Escribe un JSON UTF-8 con extensión `.openrvt-medicion.json`:

```json
{
  "formato": "openrvt-medicion",
  "version": 1,
  "proyecto": "Casa Naranjo",
  "archivo_ifc": "casa.ifc",
  "fecha": "2026-10-25T18:30:00",
  "partidas": [
    {
      "clave": "MUR-B15",
      "nombre": "Muro de block 15",
      "unidad": "m2",
      "total": 62.4,
      "renglones": [
        {"eje": "A / 1-2", "tramo": "Nivel 0", "descripcion": "Muro block 15 · M-1",
         "piezas": null, "largo": 7.0, "ancho": null, "alto": 2.6, "resultado": 18.2,
         "globalid": "2x…"}
      ]
    }
  ]
}
```

- Los números van como números JSON, nunca como texto.
- `clave` puede ser `""`. PP decide qué hacer con esas partidas.
- `total` es igual a la suma de los `resultado` (prueba).

## 5. Interfaz
- Nueva vista **«Cantidades»** en el panel de vistas (bajo 3D). Es una tabla de partidas (Clave, Nombre, Unidad, Total) con filtro por nivel; al desplegar una partida se ven sus renglones.
  - Clic en un renglón: selecciona el elemento en el modelo.
  - Las partidas sin clave salen con un aviso amarillo: «Sin clave de PP: ponla en el tipo».
- Botón **«Exportar a PresupuestosPro…»**: diálogo de guardar y `medicion.exportar`.
- Si la vista existe, la captura `o007c_cantidades` queda cubierta por esta.

## Verificación
- **Todo en verde:** build, vitest, cargo test, clippy y pytest.
- **pytest, valores exactos:** rectángulo de ejes de 7.00 × 5.00, muros de núcleo 0.15 centrado en el eje, aplanado exterior 0.015 y yeso interior 0.015, alto 2.60, sin castillos:
  - núcleo: 24.00 × 2.60 = **62.40 m²**;
  - aplanado exterior: largo de cara = 24 + 8 × 0.0825 = 24.66 → **64.116 m²**;
  - yeso interior: 24 − 8 × 0.0825 = 23.34 → **60.684 m²**;
  - con una puerta de 0.90 × 2.10 en un muro de 7.00: núcleo **60.51**, exterior **62.226** e interior **58.794**;
  - con los 10 castillos automáticos de O007c (15 × 15): el núcleo baja por las caras de los castillos y los acabados **no cambian**;
  - columna C-1 de 3.00 m de alto: cimbra = 1.20 × 3.00 = **3.60 m²**; Z-1 con desplante 1.00: excavación = 1.60 × 1.60 × 1.00 = **2.56 m³** y plantilla **1.44 m²**;
  - `exportar` → el JSON cumple el formato (claves, tipos numéricos) y cada `total` = Σ `resultado`;
  - guardar y reabrir conserva las partidas.
- **vitest:** la pestaña Medición (agregar, cambiar el criterio, restablecer) y la vista Cantidades (despliega y selecciona).
- **E2E:**
  1. Dibuja el rectángulo con una puerta.
  2. Pon claves PP a 3 partidas en el editor de tipos.
  3. Abre Cantidades.
  4. Exporta.
  5. Revisa el JSON.
- **Capturas:** `o009_medicion_tipo.png` y `o009_cantidades.png`.
- **Ejemplo para PP:** deja en `docs/ejemplos/rectangulo.openrvt-medicion.json` el archivo exportado del E2E. La spec 089 de PP lo usa como dato de prueba.

## Entrega
- **Versión 0.5.6:** solo el último número, en Cargo.toml, package.json, tauri.conf.json y Cargo.lock.
- **Manual de Ayuda:** sección «Medición y cantidades», en español y en inglés, más «Novedades de la versión 0.5.6».
- `docs/progreso/O009.md` con «LISTA PARA REVISIÓN».
- Commits en español. No hagas push.
- **Nada se aplaza.**
