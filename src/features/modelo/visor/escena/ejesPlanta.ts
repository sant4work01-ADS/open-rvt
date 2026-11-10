/* eslint-disable react-hooks/immutability -- la escena es mutable por diseño. */
import * as THREE from "three";
import { asasCodoVista, extremoEje, geometriaEje, globoVisibleEje, puntoAsaCodoNuevo, type LadoEje } from "../../ejesVista";
import { burbujaEje } from "../anotaciones";
import { crearMaterialLinea, lineaCerrada } from "../lineas";
import { mmAMundo } from "../../estilos";
import { segmentosTrazoPunto } from "../../anotacionVista";
import { type Punto2 } from "../../herramientas";
import type { CtxEscena } from "./contexto";

export function construirEjesPlanta(ctx: CtxEscena) {
  const {
    ajusteEnCurso,
    burbujasEje,
    candados,
    contenedor,
    contextoEje,
    corteZ,
    ejesInteraccion,
    grosorDe,
    grupoLocal,
    lineasEje,
    mundoPorPx,
    oscuro,
    referencias,
    registro,
    vista,
    estilos,
  } = ctx;

    if (vista.tipo === "planta" && referencias.ejes.length > 0) {
      const mmEjes = grosorDe("ejes", "proyeccion");
      if (mmEjes !== null) {
        const zEje = corteZ + 0.05;
        const estiloEje = estilos.categorias.ejes;
        const colorEje = oscuro ? "#e0b07a" : estiloEje.color;
        const materialEje = crearMaterialLinea({
          mm: mmEjes,
          escala: vista.escala,
          color: colorEje,
          patron: "trazo-punto",
          profundidad: false,
          registro,
          mundoPorPx,
        });
        // O037: material continuo para el trazo-punto dibujado por segmentos; antes
        // las asas usaban el material discontinuo y quedaban partidas.
        const materialEjeContinuo = crearMaterialLinea({
          mm: mmEjes,
          escala: vista.escala,
          color: colorEje,
          profundidad: false,
          registro,
          mundoPorPx,
        });
        // O044: de V1 al globo la línea es continua, del mismo grosor y color.
        const materialEjeSolido = crearMaterialLinea({
          mm: mmEjes,
          escala: vista.escala,
          color: colorEje,
          profundidad: false,
          registro,
          mundoPorPx,
        });
        // O011: el globo mide 8 mm de papel (0.8 m a 1:100), como en Revit.
        const altoBurbuja = mmAMundo(8, vista.escala);
        contextoEje.current = {
          tipo: "planta",
          d: [0, 0],
          h: [1, 0],
          profundidad: 0,
          z: zEje,
          bases: Object.fromEntries(
            referencias.ejes.map((eje) => [
              eje.globalid,
              { inicio: [eje.x1, eje.y1] as Punto2, fin: [eje.x2, eje.y2] as Punto2 },
            ]),
          ),
        };
        for (const eje of referencias.ejes) {
          const dx = eje.x2 - eje.x1;
          const dy = eje.y2 - eje.y1;
          const largo = Math.hypot(dx, dy);
          if (largo < 1e-6) continue;
          const ajuste = ajusteEnCurso?.[eje.globalid] ?? vista.ejes?.[eje.globalid];
          const tocaInicio = !!ajuste && (!!ajuste.extremoInicio || !!ajuste.codosInicio?.length);
          const g = geometriaEje(ajuste, [eje.x1, eje.y1], [eje.x2, eje.y2], {
            globoInicio: tocaInicio,
            diametroGlobo: altoBurbuja,
          });
          const puntos = g.puntos.map(([x, y]) => [x, y, zEje] as [number, number, number]);
          // O042: el patrón trazo-punto llega hasta V1; de V1 al globo el tramo es
          // continuo y fino. Sin codos se dibuja toda la línea con su patrón.
          for (const [a, b] of segmentosTrazoPunto(g.ejeDiscontinuo, vista.escala)) {
            lineaCerrada(
              [[a[0], a[1], zEje], [b[0], b[1], zEje]],
              materialEjeContinuo,
              1.6,
              grupoLocal,
            );
          }
          for (const tramo of g.tramosSolidos) {
            if (tramo.length < 2) continue;
            lineaCerrada(
              tramo.map(([x, y]) => [x, y, zEje] as [number, number, number]),
              materialEjeSolido,
              1.7,
              grupoLocal,
            );
          }
          lineasEje.current.push({ globalid: eje.globalid, etiqueta: eje.etiqueta, puntos });
          const globos: Array<{ punto: Punto2; lado: LadoEje }> = [];
          if (globoVisibleEje(ajuste, "fin")) globos.push({ punto: g.globoFin, lado: "fin" });
          if (g.globoInicio && globoVisibleEje(ajuste, "inicio")) {
            globos.push({ punto: g.globoInicio, lado: "inicio" });
          }
          for (const { punto, lado } of globos) {
            const burbuja = burbujaEje(
              eje.etiqueta,
              colorEje,
              oscuro ? "#1f2328" : "#ffffff",
            );
            if (burbuja) {
              burbuja.position.set(punto[0], punto[1], zEje + 0.01);
              burbuja.scale.set(altoBurbuja, altoBurbuja, 1);
              burbuja.renderOrder = 20;
              grupoLocal.add(burbuja);
              burbujasEje.current.push({ etiqueta: eje.etiqueta, grupo: burbuja });
            }
            // O042: con codo el globo se deriva de V2 y no tiene pinzamiento.
            const codosLado = (lado === "inicio" ? ajuste?.codosInicio : ajuste?.codosFin) ?? [];
            if (codosLado.length === 0) {
              ejesInteraccion.current.push({
                globalid: eje.globalid,
                etiqueta: eje.etiqueta,
                lado,
                tipo: "globo",
                indice: null,
                punto: [punto[0], punto[1], zEje],
              });
            }
          }
          // O044: V1 y V2 se ven como puntos pequeños (como en la referencia) y los
          // dos son pinzamientos. Nada de cuadros alrededor de los nodos.
          const radioNodo = mmAMundo(0.55, vista.escala);
          for (const codo of [
            ...(ajuste?.codosInicio ?? []),
            ...(ajuste?.codosFin ?? []),
          ]) {
            const nodo = new THREE.Mesh(
              new THREE.CircleGeometry(radioNodo, 12),
              new THREE.MeshBasicMaterial({
                color: new THREE.Color(colorEje),
                side: THREE.DoubleSide,
                depthTest: false,
                depthWrite: false,
              }),
            );
            nodo.position.set(codo[0], codo[1], zEje + 0.02);
            nodo.renderOrder = 19;
            grupoLocal.add(nodo);
          }
          for (const asaCodo of asasCodoVista(ajuste)) {
            ejesInteraccion.current.push({
              globalid: eje.globalid,
              etiqueta: eje.etiqueta,
              lado: asaCodo.lado,
              tipo: "codo",
              indice: asaCodo.indice,
              punto: [asaCodo.punto[0], asaCodo.punto[1], zEje],
            });
          }
          // O021: sin codo, un asa junto al globo para crearlo arrastrando.
          for (const { lado } of globos) {
            const codosLado = (lado === "inicio" ? ajuste?.codosInicio : ajuste?.codosFin) ?? [];
            if (codosLado.length > 0) continue;
            const separacionCodo = altoBurbuja * 0.9;
            const asaCodo = puntoAsaCodoNuevo(
              ajuste,
              { inicio: [eje.x1, eje.y1], fin: [eje.x2, eje.y2] },
              lado,
              separacionCodo,
              altoBurbuja,
            );
            ejesInteraccion.current.push({
              globalid: eje.globalid,
              etiqueta: eje.etiqueta,
              lado,
              tipo: "codo-nuevo",
              indice: null,
              punto: [asaCodo[0], asaCodo[1], zEje],
            });
          }
          // O042 (revisión): en un extremo con codo el extremo original ya no se
          // dibuja; su pinzamiento quedaría flotando fuera de la polilínea. Ese
          // lado solo conserva los pinzamientos de V1 y V2.
          if ((ajuste?.codosInicio?.length ?? 0) === 0) {
            ejesInteraccion.current.push({
              globalid: eje.globalid,
              etiqueta: eje.etiqueta,
              lado: "inicio",
              tipo: "base",
              indice: null,
              punto: [g.baseInicio[0], g.baseInicio[1], zEje],
            });
          }
          if ((ajuste?.codosFin?.length ?? 0) === 0) {
            ejesInteraccion.current.push({
              globalid: eje.globalid,
              etiqueta: eje.etiqueta,
              lado: "fin",
              tipo: "base",
              indice: null,
              punto: [g.baseFin[0], g.baseFin[1], zEje],
            });
          }
        }

        // O027: un candado por grupo de extremos alineados (no uno por eje), junto
        // a la fila. Cerrado mueve la alineación; abierto mueve solo el eje pulsado.
        const grupos = new Map<
          string,
          { vertical: boolean; lado: LadoEje; puntos: Punto2[] }
        >();
        for (const eje of referencias.ejes) {
          const bases = contextoEje.current?.bases[eje.globalid];
          if (!bases) continue;
          const ajuste = ajusteEnCurso?.[eje.globalid] ?? vista.ejes?.[eje.globalid];
          for (const lado of ["inicio", "fin"] as const) {
            const p = extremoEje(ajuste, lado, bases.inicio, bases.fin);
            const coordenada = eje.vertical ? p[1] : p[0];
            const clave = `${eje.vertical ? "v" : "h"}:${lado}:${coordenada.toFixed(3)}`;
            const grupo = grupos.get(clave) ?? { vertical: !!eje.vertical, lado, puntos: [] };
            grupo.puntos.push(p);
            grupos.set(clave, grupo);
          }
        }
        const candadosAlineados: Array<{
          familia: string;
          lado: LadoEje;
          estado: string;
          ejes: number;
        }> = [];
        const tamanoCandado = altoBurbuja * 0.55;
        for (const grupo of grupos.values()) {
          if (grupo.puntos.length < 2) continue;
          const centro: Punto2 = [
            grupo.puntos.reduce((suma, p) => suma + p[0], 0) / grupo.puntos.length,
            grupo.puntos.reduce((suma, p) => suma + p[1], 0) / grupo.puntos.length,
          ];
          const signo = grupo.lado === "inicio" ? -1 : 1;
          const alto = grupo.vertical
            ? centro[1] + signo * altoBurbuja * 1.6
            : centro[1];
          const x = grupo.vertical ? centro[0] : centro[0] + signo * altoBurbuja * 1.6;
          const ancho = tamanoCandado * 0.62;
          const fondo = alto - tamanoCandado * 0.15;
          const techo = alto + tamanoCandado * 0.35;
          lineaCerrada(
            [
              [x - ancho / 2, fondo, zEje],
              [x + ancho / 2, fondo, zEje],
              [x + ancho / 2, techo, zEje],
              [x - ancho / 2, techo, zEje],
              [x - ancho / 2, fondo, zEje],
            ],
            materialEje,
            2.2,
            grupoLocal,
          );
          const abierto = candados[grupo.lado];
          const arco = abierto ? 0.8 : 1;
          const puntosArco: Array<[number, number, number]> = [];
          for (let i = 0; i <= 8; i += 1) {
            const t = Math.PI * (i / 8) * arco;
            puntosArco.push([
              x + Math.cos(t) * (ancho / 2) + (abierto ? ancho * 0.35 : 0),
              techo + Math.sin(t) * tamanoCandado * 0.35,
              zEje,
            ]);
          }
          lineaCerrada(puntosArco, materialEje, 2.2, grupoLocal);
          candadosAlineados.push({
            familia: grupo.vertical ? "vertical" : "horizontal",
            lado: grupo.lado,
            estado: abierto ? "abierto" : "cerrado",
            ejes: grupo.puntos.length,
          });
        }
        if (contenedor.current) {
          contenedor.current.dataset.candadosAlineados = JSON.stringify(candadosAlineados);
        }
      }
    }

  return {

  };
}
