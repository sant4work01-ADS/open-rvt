/* eslint-disable react-hooks/immutability -- la escena es mutable por diseño. */
import { calcularPlantaMuros, type MuroPlanta } from "../../planta";
import { categoriaOculta } from "../../estilos";
import { crearMaterialLinea, lineaCerrada } from "../lineas";
import type { CtxEscena } from "./contexto";

export function construirMurosPlanta(ctx: CtxEscena) {
  const {
    corteZ,
    grupoLocal,
    lineasCapasPlanta: lineasCapasPlantaPrevia,
    mundoPorPx,
    oscuro,
    registro,
    visibles,
    estilos,
    vista,
  } = ctx;
  let lineasCapasPlanta = lineasCapasPlantaPrevia;

    if (vista.tipo === "planta" && !categoriaOculta(vista, "muros")) {
      const murosPlanta: MuroPlanta[] = visibles
        .filter((elemento) => elemento.categoria === "muros" && elemento.eje)
        .map((elemento) => ({
          globalid: elemento.globalid,
          eje: elemento.eje as [number, number, number, number],
          capas: elemento.capas,
        }));
      // O007c: castillos y columnas recortan el núcleo; los acabados solo se cortan
      // en las columnas y pasan por encima del castillo.
      const seccionesPlanta = visibles
        .filter(
          (elemento) =>
            elemento.estructura &&
            (elemento.estructura.alias === "castillo" ||
              elemento.estructura.alias === "columna"),
        )
        .map((elemento) => {
          const seccion = elemento.estructura?.seccion ?? {};
          const datos = elemento.estructura?.datos ?? {};
          const numero = (valor: unknown, respaldo = 0) => Number(valor) || respaldo;
          const ancho = numero(datos.B, numero(seccion.B, numero(seccion.D, 0.15)));
          const fondo = numero(datos.H, numero(seccion.H, numero(seccion.D, 0.15)));
          return {
    lineasCapasPlanta,
            globalid: elemento.globalid,
            x: numero(datos.X),
            y: numero(datos.Y),
            ancho,
            fondo,
            rotacion: numero(datos.Rotacion),
            funcion: elemento.estructura?.alias === "columna"
              ? ("columna" as const)
              : ("castillo" as const),
          };
        });
      if (murosPlanta.length > 0) {
        const planta = calcularPlantaMuros(murosPlanta, seccionesPlanta);
        // E2E: el contorno que de verdad se dibuja, para medirlo sin leer píxeles.
        (window as unknown as { __OPENRVT_PLANTA_MUROS__?: unknown }).__OPENRVT_PLANTA_MUROS__ =
          planta.contorno;
        const zPlantas = corteZ + 0.035;
        const colorPlantas = oscuro ? "#e5e7eb" : estilos.categorias.muros.color;
        const materialContorno = crearMaterialLinea({
          mm: 0.35,
          escala: vista.escala,
          color: colorPlantas,
          registro,
          mundoPorPx,
          profundidad: false,
        });
        for (const poligono of planta.contorno) {
          for (const anillo of [poligono.exterior, ...poligono.huecos]) {
            if (anillo.length < 3) continue;
            lineaCerrada(
              anillo.map(([x, y]) => [x, y, zPlantas] as [number, number, number]),
              materialContorno,
              2.1,
              grupoLocal,
            );
          }
        }
        if (vista.escala <= 50) {
          const materialFino = crearMaterialLinea({
            mm: 0.1,
            escala: vista.escala,
            color: colorPlantas,
            registro,
            mundoPorPx,
            profundidad: false,
          });
          const materialNucleo = crearMaterialLinea({
            mm: 0.35,
            escala: vista.escala,
            color: colorPlantas,
            registro,
            mundoPorPx,
            profundidad: false,
          });
          const materialRaya = crearMaterialLinea({
            mm: 0.08,
            escala: vista.escala,
            color: colorPlantas,
            registro,
            mundoPorPx,
            profundidad: false,
          });
          for (const capa of planta.capas) {
            const material = capa.funcion === "núcleo" ? materialNucleo : materialFino;
            for (const linea of capa.lineas) {
              if (linea.length < 2) continue;
              lineaCerrada(
                linea.map(([x, y]) => [x, y, zPlantas] as [number, number, number]),
                material,
                capa.funcion === "núcleo" ? 1.8 : 0.8,
                grupoLocal,
              );
              lineasCapasPlanta += 1;
            }
          }
          for (const linea of planta.rayado) {
            if (linea.length < 2) continue;
            lineaCerrada(
              linea.map(([x, y]) => [x, y, zPlantas] as [number, number, number]),
              materialRaya,
              0.7,
              grupoLocal,
            );
            lineasCapasPlanta += 1;
          }
        }
      }
    }

  return {

  };
}
