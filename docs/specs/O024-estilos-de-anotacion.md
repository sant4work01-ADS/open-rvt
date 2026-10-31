# O024: editor de estilos de anotación (niveles, ejes y cotas)

Pedido del usuario (31-oct): «quiero editor de estilo de cota», «quiero poder definir cuánto estará separado el
globo de eje en los alzados con respecto al último nivel», «los niveles no me gustan, las cotas tampoco».
Referencia visual obligatoria: `ideas/img/niveles-referencia.jpg` y `ideas/niveles-estilo-cotas.md`.
Estado actual (lo que NO gusta): `docs/progreso/O021b/o021b-alzado-niveles-cotas.png`.

Hoy existe `EstiloNivel` (`src/features/modelo/estilos.ts:51`) y `DialogoEstilos.tsx`/`DialogoCotas.tsx`. Se amplía
a tres familias de estilos, guardadas en el mismo JSON de estilos (proyectos viejos → valores por omisión).
Todas las medidas en **mm de papel** (se escalan con la escala de la vista, como el grosor de línea).

## Modelo de datos
1. `EstiloNivel` (amplía el actual): patrón de línea (`continua | trazo | trazo-punto`, por omisión trazo-punto),
   color, grosor; cabeza (`triangulo-relleno | triangulo | circulo | ninguna`, por omisión triángulo relleno
   invertido apoyado en la línea), tamaño de cabeza (mm, por omisión 3.5 de ancho), lado de la cabeza
   (`derecha | izquierda | ambos`), texto: prefijo (`Npt`), decimales, unidad, signo `+` (sí/no), alto de texto
   (mm, 2.5), si muestra el nombre del nivel (por omisión NO); extensión de la línea más allá del último
   elemento/eje (mm).
2. `EstiloEje` (nuevo): patrón de línea (trazo-punto), color, grosor; diámetro del globo (mm, 8); alto de
   texto (mm, 3.5); globos en (`inicio | fin | ambos`); **en alzado y corte: separación del globo sobre el
   último nivel visible** (mm de papel, por omisión 10) y **extensión bajo el primer nivel** (mm, 5).
   Se puede sobrescribir por vista en Propiedades de la vista («Separación de globos sobre el último nivel»).
3. `EstiloCota` (nuevo, puede haber varios con nombre; uno por omisión «Cota 1:100»): remate
   (`flecha-rellena | flecha-abierta | tick-arquitectonico | punto`, por omisión flecha rellena como la
   referencia), tamaño del remate (mm, 2.5); alto de texto (mm, 2.5); posición del texto (`sobre-la-linea |
   centrado-cortando-la-linea`, por omisión sobre la línea, sin que la línea lo atraviese); separación
   texto–línea (mm, 1); separación de la línea de extensión al objeto (mm, 1.5) y prolongación más allá de la
   línea de cota (mm, 1.5); distancia entre filas de cotas (cadena y total) (mm, 7); decimales y unidad;
   color; texto chico que no cabe: `fuera-con-flechas-hacia-adentro` (como el 0.20 de la referencia) o
   `con-linea-de-referencia`.

## Editor
- Ribbon «Vista» → «Estilos de anotación» abre un diálogo con tres pestañas (Niveles, Ejes, Cotas). Cada una:
  formulario a la izquierda y **vista previa en vivo** a la derecha (un mini alzado con 5 niveles 0.00, 0.50,
  1.50, 2.00, 2.20 y 4 ejes, igual que la referencia), dibujada con las mismas funciones que el visor.
- Cotas: lista de estilos con Nuevo, Duplicar, Renombrar, Eliminar; el estilo por omisión de cada vista se elige
  en Propiedades de la vista.
- Cambios se aplican al cerrar con «Aceptar» (Deshacer los revierte en un paso).

## Pruebas
- vitest: valores por omisión, lectura de JSON viejo, sobrescritura por vista de la separación del globo,
  validaciones (sin negativos, rangos razonables).
- vitest de la vista previa: con el estilo por omisión, la geometría generada coincide con la referencia
  (flechas rellenas, trazo-punto, triángulo relleno a la derecha, texto «Npt +2.20m»).
- E2E (en O025, que usa todo esto en el visor).
- vitest `--maxWorkers=3`, `npx tsc --noEmit`, `npm run lint`. LF; NO cambies los fines de línea de archivos
  existentes (si un archivo tiene CRLF, déjalo en CRLF). Commits por parte; sin push, merge, versión ni
  dependencias nuevas.
