# ED1: recortar y extender elementos lineales

Funciona como «Recortar/Extender a esquina» y «Recortar/Extender elemento» de Revit, en planta.

## Decisiones ya tomadas (no las cambies)

### Alcance
- **Elementos:** los lineales con eje, es decir muro, contratrabe, trabe, dala, cerramiento y zapata corrida.
- **Vista:** solo en planta.

### Herramienta «Recortar/Extender» (cinta, grupo MODIFICAR; atajo `TR`)
Tiene tres modos, que se eligen en la barra de opciones:

1. **A esquina** (por omisión).
   - Se hace clic en dos elementos lineales. Los dos se recortan o extienden hasta su intersección y forman una
     esquina en L.
   - En cada uno se conserva el lado donde se hizo clic.
2. **Un elemento.**
   - Primer clic: la referencia, que puede ser un elemento lineal o un eje.
   - Segundo clic: el elemento a recortar o extender hasta la línea de la referencia.
   - Se conserva el lado del clic.
3. **Varios elementos.**
   - Primer clic: la referencia.
   - Después, clic en cada elemento a ajustar. Enter o Esc termina.

### Vista previa y reglas
- **Vista previa:** al pasar el cursor sobre el segundo elemento se ve en tenue cómo quedaría.
- **Se mide sobre la línea de ubicación** de cada elemento (eje del muro o línea que use, O032). Las uniones de muros y
  los acabados se recalculan con el mecanismo que ya existe.
- **Elementos paralelos:** si son paralelos y no se cortan, no cambia nada y aparece el mensaje «Los elementos son
  paralelos».
- **Enlaces a ejes:**
  - el extremo que se ajusta pierde su enlace a eje (`EnlaceEje…` de ese extremo);
  - el otro extremo conserva el suyo.
- **Deshacer:** cada operación es un solo paso.
- **GlobalId:** se conservan.
- **Dependientes:** castillos, cerramientos y vanos se recalculan con el mecanismo de dependientes, en lote. Un vano
  que queda fuera del muro recortado se borra con aviso («Se borró la puerta P-1: quedó fuera del muro»).

### Núcleo
- Nuevo método `elementos_recortar_extender(globalid, referencia, punto_conservar)`.
- `referencia` es un GlobalId de elemento o de eje.
- El modo «a esquina» llama dos veces con la referencia cruzada, dentro de **una** sola transacción de deshacer.

## Archivos
`nucleo/openrvt_nucleo/modelado.py` (junto a `elementos_mover`, ~5397), `src/features/modelo/planta.ts`,
`src/features/modelo/geometria.ts`, `src/features/modelo/herramientas.ts` y la cinta.

## Pruebas obligatorias (valores a mano)

### pytest `nucleo/tests/test_ed1.py`
- **Esquina:**
  - Muro M1 de (0,0) a (3,0) y muro M2 de (4,1) a (4,5).
  - A esquina, con clic en M1 cerca de (1,0) y en M2 cerca de (4,3): M1 queda de (0,0) a (4,0) y M2 de (4,0) a (4,5).
  - El área de M1 es 4 × 2.60.
- **Recorte contra un eje:**
  - Muro de (0,0) a (6,0) y eje x=4.
  - Recortar conservando el lado (1,0) lo deja de (0,0) a (4,0).
  - Recortar conservando el lado (5,0) lo deja de (4,0) a (6,0).
- **Extender:** contratrabe de (0,0) a (2,0) hasta un muro en x=5 (eje del muro): queda de (0,0) a (5,0).
- **Paralelos:** se rechazan y no cambia nada.
- **Vano fuera:** muro con puerta en x=5 recortado a x=4. La puerta se borra y llega el aviso.
- **Enlaces:** el extremo ajustado pierde su enlace y el otro lo conserva.
- **Deshacer:** devuelve todo exacto (±1e-9).

### vitest
- Intersección de líneas, incluidos paralelos y casi paralelos.
- Elección del lado a conservar según el punto del clic.
- Atajo `TR`.

### E2E `e2e/ed1.test.js`, con clics reales
1. Dibujar dos muros que no se tocan y unirlos con A esquina.
2. Recortar un muro contra un eje.
3. Extender una contratrabe hasta un muro.
4. Deshacer y Rehacer.
5. Capturas en `docs/progreso/ED1/` (antes, vista previa y después), leídas como imagen.

### Al cerrar
- `npx tsc --noEmit` y `npm run lint`.
- vitest con `--maxWorkers=3` y pytest completo.
- Los E2E o028, o032 y o041.

## Reglas
- `modelado.py`, `interacciones.py`, `Visor3D.tsx` y `estado.ts` conservan su fin de línea (CRLF).
- Sin push, merge, cambio de versión ni dependencias nuevas.
- Resumen en `docs/progreso/ED1.md`.
