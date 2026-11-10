/* eslint-disable react-hooks/immutability -- la escena es mutable por diseño. */
import * as THREE from "three";
import { DESFASE_NOMBRE_CABEZA } from "../../niveles";
import { asasCodoVista } from "../../ejesVista";
import { burbujaEje, orientarAnotacion, textoCota } from "../anotaciones";
import { calcularLayoutAlzado, enlazarTramosCota, segmentosTrazoPunto } from "../../anotacionVista";
import { centroCaja, direccionAlzado } from "../../vistas";
import { crearMaterialLinea, lineaCerrada } from "../lineas";
import { factorEscala, altoAnotacionMundo, mmAMundo, mmAMundoConMinimoPx, type PatronLinea } from "../../estilos";
import { normalCorte } from "../camara";
import { type Punto2 } from "../../herramientas";
import type { CtxEscena } from "./contexto";

export function construirNivelesAlzado(ctx: CtxEscena) {
  const {
    ajusteEnCurso,
    anotacionesAlzado,
    aplicarCamara,
    asasNivel,
    burbujasEje,
    camara,
    contenedor,
    contextoEje,
    cotasInteraccion,
    ejesInteraccion,
    grosorDe,
    grupoLocal,
    lineasEje,
    lineasNivelRef,
    mundoPorPx,
    navegacion,
    oscuro,
    referencias,
    registro,
    caja,
    ajustesNivelEnCurso,
    estilos,
    vista,
    niveles,
  } = ctx;

    const datosNiveles: Array<{
      nombre: string;
      elevacion: string;
      cabezas: string[];
      parciales: string[];
      total: string | null;
    }> = [];
    if (vista.tipo === "alzado" || vista.tipo === "corte") {
      const mmNiveles = grosorDe("niveles", "proyeccion");
      if (mmNiveles !== null) {
        const d: [number, number] =
          vista.tipo === "alzado"
            ? [direccionAlzado(vista.orientacion ?? "sur")[0], direccionAlzado(vista.orientacion ?? "sur")[1]]
            : normalCorte(vista);
        let h: [number, number] = [-d[1], d[0]];
        if (vista.tipo === "corte" && vista.puntoA && vista.puntoB) {
          const dx = vista.puntoB[0] - vista.puntoA[0];
          const dy = vista.puntoB[1] - vista.puntoA[1];
          const largo = Math.hypot(dx, dy);
          if (largo > 1e-9) h = [dx / largo, dy / largo];
        }
        const haciaCamara: [number, number, number] =
          vista.tipo === "corte" ? [-d[0], -d[1], 0] : [d[0], d[1], 0];
        const centro = centroCaja(caja);
        const profundidad = centro[0] * d[0] + centro[1] * d[1];
        const planoPunto = vista.puntoA
          ? new THREE.Vector2(vista.puntoA[0], vista.puntoA[1])
          : new THREE.Vector2(centro[0], centro[1]);
        const puntoHZ = (t: number, z: number): [number, number, number] => [
          h[0] * t + d[0] * profundidad,
          h[1] * t + d[1] * profundidad,
          z,
        ];
        const proyectarT = (x: number, y: number) => x * h[0] + y * h[1];
        const esquinasXY: Array<[number, number]> = [
          [caja.min[0], caja.min[1]],
          [caja.min[0], caja.max[1]],
          [caja.max[0], caja.min[1]],
          [caja.max[0], caja.max[1]],
        ];
        const proyecciones = esquinasXY.map(([x, y]) => proyectarT(x, y));
        const tMin = Math.min(...proyecciones) - 1;
        const tMax = Math.max(...proyecciones) + 1;
        const ordenados = [...niveles].sort((a, b) => a.elevacion - b.elevacion);
        const cruces: Array<{ eje: (typeof referencias.ejes)[number]; s: number }> = [];
        for (const eje of referencias.ejes) {
          const ax = eje.x1 - planoPunto.x;
          const ay = eje.y1 - planoPunto.y;
          const bx = eje.x2 - planoPunto.x;
          const by = eje.y2 - planoPunto.y;
          const da = ax * d[0] + ay * d[1];
          const db = bx * d[0] + by * d[1];
          if (Math.abs(da - db) < 1e-9) continue;
          const t = da / (da - db);
          if (t < -1e-6 || t > 1 + 1e-6) continue;
          const x = eje.x1 + t * (eje.x2 - eje.x1);
          const y = eje.y1 + t * (eje.y2 - eje.y1);
          cruces.push({ eje, s: proyectarT(x, y) });
        }
        cruces.sort((a, b) => a.s - b.s);

        const estiloNivel = estilos.niveles;
        const estiloEje = estilos.ejes;
        const estiloCota =
          estilos.cotas.lista.find(
            (c) => c.nombre === (vista.estiloCota ?? estilos.cotas.porDefecto),
          ) ?? estilos.cotas.lista[0];
        const ajustesNivel: Record<string, { desplazamiento: number }> = {
          ...(vista.nivelesAjuste ?? {}),
          ...ajustesNivelEnCurso,
        };
        const ajustesMundo: Record<string, number> = {};
        for (const nivel of ordenados) {
          const ajuste = ajustesNivel[nivel.globalid];
          if (ajuste && Number.isFinite(ajuste.desplazamiento)) {
            ajustesMundo[nivel.globalid] = nivel.elevacion + ajuste.desplazamiento;
          }
        }
        // Tamaños reales de texto (con el mínimo en píxeles del visor): la
        // colocación y las cajas de las pruebas usan exactamente lo dibujado.
        const modoAnotacion =
          vista.anotacionEscala ??
          (vista.tipo === "alzado" || vista.tipo === "corte" ? "papel" : "pantalla");
        const altoTexto = altoAnotacionMundo(
          estiloNivel.altoTexto,
          vista.escala,
          mundoPorPx,
          modoAnotacion,
        );
        const altoTextoCota = altoAnotacionMundo(
          estiloCota.altoTexto,
          vista.escala,
          mundoPorPx,
          modoAnotacion,
        );
        const layout = calcularLayoutAlzado({
          niveles: ordenados,
          ejes: cruces.map(({ eje, s }) => ({ globalid: eje.globalid, etiqueta: eje.etiqueta, s })),
          estiloNivel,
          estiloEje,
          estiloCota,
          escala: vista.escala,
          tMinCaja: tMin,
          tMaxCaja: tMax,
          separacionGlobosMm: vista.separacionGlobos,
          ajustesNivel: ajustesMundo,
          altoTextoNivelMundo: altoTexto,
          altoTextoCotaMundo: altoTextoCota,
          ajustesEje: { ...(vista.ejes ?? {}), ...(ajusteEnCurso ?? {}) },
        });
        // Encuadre exacto de la zona de anotación para las capturas y pruebas.
        const nodoEncuadre = contenedor.current;
        if (nodoEncuadre) {
          (nodoEncuadre as unknown as Record<string, unknown>).__openrvtEnfocarAlzado = (
            tCentro: number,
            zCentro: number,
            altoMundo: number,
          ) => {
            const camera = camara.current;
            const nav = navegacion.current;
            if (!(camera instanceof THREE.OrthographicCamera) || !nav) return;
            const rect = nodoEncuadre.getBoundingClientRect();
            const aspecto = Math.max(rect.width, 1) / Math.max(rect.height, 1);
            const mitad = Math.max(0.4, altoMundo) / 2;
            camera.left = -mitad * aspecto;
            camera.right = mitad * aspecto;
            camera.top = mitad;
            camera.bottom = -mitad;
            camera.updateProjectionMatrix();
            nav.objetivo.set(
              h[0] * tCentro + d[0] * profundidad,
              h[1] * tCentro + d[1] * profundidad,
              zCentro,
            );
            aplicarCamara();
          };
        }
        const patronLinea = (patron: typeof estiloNivel.patron): PatronLinea =>
          patron === "trazo" ? "discontinua" : patron;
        // El trazo-punto se dibuja con segmentos propios (trazo, hueco, punto,
        // hueco): LineMaterial solo admite un guion y un hueco iguales.
        const patronNivel = estiloNivel.patron;
        const patronEjeNivel = estiloEje.patron;
        const colorNivel = oscuro ? "#e8eaed" : estiloNivel.color;
        const colorEje = oscuro ? "#e0b07a" : estiloEje.color;
        const colorCota = oscuro ? "#e8eaed" : estiloCota.color;
        const fondo = oscuro ? "#1f2328" : "#ffffff";
        const materialNivel = crearMaterialLinea({
          mm: estiloNivel.grosor * factorEscala(vista.escala),
          escala: vista.escala,
          color: colorNivel,
          patron: patronNivel === "trazo-punto" ? "continua" : patronLinea(patronNivel),
          registro,
          mundoPorPx,
          profundidad: false,
        });
        const materialEjeNivel = crearMaterialLinea({
          mm: estiloEje.grosor * factorEscala(vista.escala),
          escala: vista.escala,
          color: colorEje,
          patron: patronEjeNivel === "trazo-punto" ? "continua" : patronLinea(patronEjeNivel),
          registro,
          mundoPorPx,
          profundidad: false,
        });
        // O044: tramo continuo del codo en alzado y corte, mismo grosor y color.
        const materialEjeSolidoAlzado = crearMaterialLinea({
          mm: estiloEje.grosor * factorEscala(vista.escala),
          escala: vista.escala,
          color: colorEje,
          registro,
          mundoPorPx,
          profundidad: false,
        });
        const materialCota = crearMaterialLinea({
          mm: estiloCota.grosor * factorEscala(vista.escala),
          escala: vista.escala,
          color: colorCota,
          patron: patronLinea(estiloCota.patron),
          registro,
          mundoPorPx,
          profundidad: false,
        });
        const altoNombre = mmAMundoConMinimoPx(2, vista.escala, mundoPorPx, 8);
        const anchoCabeza = mmAMundo(estiloNivel.tamanoCabeza, vista.escala);
        const altoCabeza = anchoCabeza * 0.7;

        anotacionesAlzado.current = [];
        lineasNivelRef.current = [];
        const nivelMin = ordenados[0]?.elevacion ?? caja.min[2];
        const zBajoEje = nivelMin - mmAMundo(estiloEje.extensionBajoPrimerNivel, vista.escala);
        contextoEje.current = {
          tipo: vista.tipo,
          d,
          h,
          profundidad,
          z: 0,
          bases: Object.fromEntries(
            cruces.map(({ eje, s }) => [
              eje.globalid,
              {
                inicio: [s, zBajoEje] as Punto2,
                fin: [s, layout.zGloboInferior] as Punto2,
              },
            ]),
          ),
        };

        const rellenar = (puntos: Array<[number, number]>, color: string) => {
          if (puntos.length < 3) return;
          const geometria = new THREE.BufferGeometry();
          const vertices: number[] = [];
          for (const [t, z] of puntos) vertices.push(...puntoHZ(t, z));
          geometria.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
          const malla = new THREE.Mesh(
            geometria,
            new THREE.MeshBasicMaterial({
              color: new THREE.Color(color),
              side: THREE.DoubleSide,
              transparent: true,
              depthTest: false,
              depthWrite: false,
            }),
          );
          malla.renderOrder = 21;
          grupoLocal.add(malla);
        };

        for (const linea of layout.lineas) {
          const puntos = linea.puntos.map(([t, z]) => puntoHZ(t, z));
          const material = linea.tipo === "extension" ? materialCota : materialNivel;
          const orden = linea.tipo === "extension" ? 2.7 : 3;
          if (linea.tipo === "nivel" && patronNivel === "trazo-punto") {
            for (const [a, b] of segmentosTrazoPunto(linea.puntos, vista.escala)) {
              lineaCerrada(
                [puntoHZ(a[0], a[1]), puntoHZ(b[0], b[1])],
                material,
                orden,
                grupoLocal,
              );
            }
          } else {
            lineaCerrada(puntos, material, orden, grupoLocal);
          }
          if (linea.punto) {
            // Punto de arranque de la guía sobre la altura del nivel.
            const disco = new THREE.Mesh(
              new THREE.CircleGeometry(mmAMundo(0.6, vista.escala), 16),
              new THREE.MeshBasicMaterial({
                color: new THREE.Color(colorNivel),
                side: THREE.DoubleSide,
                depthTest: false,
                depthWrite: false,
              }),
            );
            const base = puntoHZ(linea.punto[0], linea.punto[1]);
            disco.position.set(base[0], base[1], base[2]);
            orientarAnotacion(disco, haciaCamara);
            disco.renderOrder = 21;
            grupoLocal.add(disco);
          }
          lineasNivelRef.current.push({
            tipo: linea.tipo === "guia-nivel" ? "guia" : linea.tipo,
            elev: linea.elevacion,
            puntos,
          });
        }

        for (const cabeza of layout.cabezas) {
          if (estiloNivel.cabeza === "triangulo-relleno") {
            rellenar(cabeza.poligono, colorNivel);
          } else if (estiloNivel.cabeza === "triangulo") {
            lineaCerrada(
              [...cabeza.poligono, cabeza.poligono[0]].map(([t, z]) => puntoHZ(t, z)),
              materialNivel,
              3,
              grupoLocal,
            );
          } else if (estiloNivel.cabeza === "circulo") {
            const malla = new THREE.Mesh(
              new THREE.CircleGeometry(altoCabeza / 2, 48),
              new THREE.MeshBasicMaterial({
                color: new THREE.Color(colorNivel),
                side: THREE.DoubleSide,
                transparent: true,
                depthTest: false,
                depthWrite: false,
              }),
            );
            const base = puntoHZ(cabeza.t, cabeza.z + altoCabeza / 2);
            malla.position.set(base[0], base[1], base[2]);
            orientarAnotacion(malla, haciaCamara);
            malla.renderOrder = 21;
            grupoLocal.add(malla);
          }
          const posTexto = puntoHZ(cabeza.cajaTexto.centro[0], cabeza.cajaTexto.centro[1]);
          const posBorde = puntoHZ(cabeza.cajaTexto.t0, cabeza.cajaTexto.centro[1]);
          const sprite = textoCota(cabeza.texto, colorNivel, fondo, altoTexto, haciaCamara, "izquierda");
          if (sprite) {
            sprite.position.set(posBorde[0], posBorde[1], posBorde[2]);
            sprite.renderOrder = 20;
            grupoLocal.add(sprite);
            cotasInteraccion.current.push({
              tipo: "elevacion",
              texto: cabeza.texto,
              valor: cabeza.elevacion,
              punto: posTexto,
              nivel: cabeza.globalid,
              nombre: cabeza.nombre,
            });
            anotacionesAlzado.current.push({
              tipo: "nivel",
              texto: cabeza.texto,
              centro: posTexto,
              ancho: cabeza.cajaTexto.t1 - cabeza.cajaTexto.t0,
              alto: altoTexto,
              h: [h[0], h[1], 0],
            });
          }
          asasNivel.current.push({
            globalid: cabeza.globalid,
            nombre: cabeza.nombre,
            elev: cabeza.elevacion,
            desplazamiento: cabeza.desplazamiento,
            punto: puntoHZ(cabeza.t, cabeza.z + altoCabeza / 2),
          });
          if (estiloNivel.mostrarNombre) {
            const nombre = textoCota(cabeza.nombre, colorNivel, fondo, altoNombre, haciaCamara);
            if (nombre) {
              const posNombre = puntoHZ(cabeza.cajaTexto.centro[0], cabeza.z - altoNombre * DESFASE_NOMBRE_CABEZA);
              nombre.position.set(posNombre[0], posNombre[1], posNombre[2]);
              nombre.renderOrder = 20;
              grupoLocal.add(nombre);
            }
          }
        }

        const remate = (t: number, z: number, hacia: "arriba" | "abajo", fuera: boolean) => {
          const largo = mmAMundo(estiloCota.tamanoRemate, vista.escala);
          const signo = hacia === "arriba" ? 1 : -1;
          if (estiloCota.remate === "punto") {
            const disco = new THREE.Mesh(
              new THREE.CircleGeometry(largo / 3, 24),
              new THREE.MeshBasicMaterial({ color: new THREE.Color(colorCota), side: THREE.DoubleSide, depthTest: false, depthWrite: false }),
            );
            const punta = puntoHZ(t, z);
            disco.position.set(punta[0], punta[1], punta[2]);
            orientarAnotacion(disco, haciaCamara);
            disco.renderOrder = 22;
            grupoLocal.add(disco);
            return;
          }
          if (estiloCota.remate === "tick-arquitectonico") {
            lineaCerrada(
              [puntoHZ(t - largo / 2, z - (signo * largo) / 2), puntoHZ(t + largo / 2, z + (signo * largo) / 2)],
              materialCota,
              4,
              grupoLocal,
            );
            return;
          }
          const desplazamiento = (fuera ? -signo : signo) * largo;
          if (estiloCota.remate === "flecha-rellena") {
            rellenar(
              [
                [t, z],
                [t - largo / 2, z + desplazamiento],
                [t + largo / 2, z + desplazamiento],
              ],
              colorCota,
            );
          } else {
            lineaCerrada(
              [
                puntoHZ(t + largo / 2, z + desplazamiento),
                puntoHZ(t, z),
                puntoHZ(t - largo / 2, z + desplazamiento),
              ],
              materialCota,
              4,
              grupoLocal,
            );
          }
        };

        const todosTramos = [
          // O031 (regresión de O025): la cota parcial vuelve a saber entre qué dos
          // niveles está para que el doble clic edite la elevación (O010/O006).
          ...enlazarTramosCota(layout.parciales, ordenados).map((c) => ({
            ...c,
            tipo: "parcial" as const,
          })),
          ...(layout.total ? [{ ...layout.total, tipo: "total" as const }] : []),
        ];
        for (const tramo of todosTramos) {
          for (const r of tramo.remates) remate(r.t, r.z, r.hacia, r.fuera);
          const sprite = textoCota(tramo.texto, colorCota, fondo, altoTextoCota, haciaCamara);
          if (sprite) {
            const pos = puntoHZ(tramo.cajaTexto.centro[0], tramo.cajaTexto.centro[1]);
            sprite.position.set(pos[0], pos[1], pos[2]);
            sprite.renderOrder = 20;
            grupoLocal.add(sprite);
            cotasInteraccion.current.push({
              tipo: tramo.tipo === "parcial" ? "nivel" : "total",
              texto: tramo.texto,
              valor: tramo.valor,
              punto: pos,
              referencia: tramo.tipo === "parcial" ? tramo.referencia : undefined,
              mover: tramo.tipo === "parcial" ? tramo.mover : undefined,
            });
            anotacionesAlzado.current.push({
              tipo: tramo.tipo,
              texto: tramo.texto,
              centro: pos,
              ancho: tramo.cajaTexto.t1 - tramo.cajaTexto.t0,
              alto: altoTextoCota,
              h: [h[0], h[1], 0],
            });
          }
        }

        const nombresGlobos: string[] = [];
        for (const linea of layout.ejesLineas) {
          const ejeLinea = cruces.find(({ s }) => Math.abs(s - linea.puntos[0][0]) < 1e-9)?.eje;
          if (ejeLinea) {
            // O031: la E2E lee las líneas de eje del alzado (incluido el codo).
            lineasEje.current.push({
              globalid: ejeLinea.globalid,
              etiqueta: ejeLinea.etiqueta,
              puntos: linea.puntos.map(([t, z]) => puntoHZ(t, z)),
            });
          }
          if (patronEjeNivel === "trazo-punto") {
            for (const [a, b] of segmentosTrazoPunto(linea.puntosEje ?? linea.puntos, vista.escala)) {
              lineaCerrada(
                [puntoHZ(a[0], a[1]), puntoHZ(b[0], b[1])],
                materialEjeNivel,
                2.9,
                grupoLocal,
              );
            }
          } else {
            lineaCerrada(
              linea.puntos.map(([t, z]) => puntoHZ(t, z)),
              materialEjeNivel,
              2.9,
              grupoLocal,
            );
          }
          for (const tramo of linea.puntosSolidos ?? []) {
            if (tramo.length < 2) continue;
            lineaCerrada(
              tramo.map(([t, z]) => puntoHZ(t, z)),
              materialEjeSolidoAlzado,
              3.1,
              grupoLocal,
            );
          }
        }
        for (const globo of layout.globos) {
          const eje = cruces.find(({ eje: e }) => e.globalid === globo.globalid)?.eje;
          if (!eje) continue;
          nombresGlobos.push(eje.etiqueta);
          const burbuja = burbujaEje(eje.etiqueta, colorEje, fondo, haciaCamara);
          const pos = puntoHZ(globo.t, globo.z);
          if (burbuja) {
            burbuja.position.set(pos[0], pos[1], pos[2]);
            burbuja.scale.set(globo.radio * 2, globo.radio * 2, 1);
            burbuja.renderOrder = 20;
            grupoLocal.add(burbuja);
            burbujasEje.current.push({ etiqueta: eje.etiqueta, grupo: burbuja });
          }
          // O044: con codo el globo no se arrastra y tampoco hay asa de codo nuevo;
          // los pinzamientos del codo son V1 y V2 (se agregan más abajo).
          const ajusteAlzado = ajusteEnCurso?.[eje.globalid] ?? vista.ejes?.[eje.globalid];
          const conCodoFin = (ajusteAlzado?.codosFin?.length ?? 0) > 0;
          if (!conCodoFin) {
            ejesInteraccion.current.push({
              globalid: eje.globalid,
              etiqueta: eje.etiqueta,
              lado: "fin",
              tipo: "globo",
              indice: null,
              punto: pos,
            });
            ejesInteraccion.current.push({
              globalid: eje.globalid,
              etiqueta: eje.etiqueta,
              lado: "fin",
              tipo: "codo-nuevo",
              indice: null,
              punto: puntoHZ(globo.t, globo.z - globo.radio * 1.8),
            });
          }
        }
        for (const { eje, s } of cruces) {
          const ajusteAlzado = ajusteEnCurso?.[eje.globalid] ?? vista.ejes?.[eje.globalid];
          if ((ajusteAlzado?.codosInicio?.length ?? 0) === 0) {
            ejesInteraccion.current.push({
              globalid: eje.globalid,
              etiqueta: eje.etiqueta,
              lado: "inicio",
              tipo: "base",
              indice: null,
              punto: puntoHZ(s, zBajoEje),
            });
          }
          // O031 (regresión de O025b): recuperar las asas de los codos en el
          // alzado, que la reescritura de la anotación había perdido. Sin ellas no
          // se puede arrastrar ni quitar un codo con el menú contextual.
          const ajusteEje = ajusteEnCurso?.[eje.globalid] ?? vista.ejes?.[eje.globalid];
          for (const asaCodo of asasCodoVista(ajusteEje)) {
            ejesInteraccion.current.push({
              globalid: eje.globalid,
              etiqueta: eje.etiqueta,
              lado: asaCodo.lado,
              tipo: "codo",
              indice: asaCodo.indice,
              punto: puntoHZ(asaCodo.punto[0], asaCodo.punto[1]),
            });
          }
        }

        datosNiveles.push({
          nombre: "Niveles",
          elevacion: "",
          cabezas: layout.cabezas.map((c) => c.texto),
          parciales: layout.parciales.map((c) => c.texto),
          total: layout.total?.texto ?? null,
        });

        if (contenedor.current) {
          contenedor.current.dataset.ejesAlzadoOrden = nombresGlobos.join(",");
          contenedor.current.dataset.ejesNivelMin = String(nivelMin);
          contenedor.current.dataset.ejesNivelMax = String(
            ordenados[ordenados.length - 1]?.elevacion ?? 0,
          );
          contenedor.current.dataset.ejesGloboZ = String(layout.zGlobo);
          contenedor.current.dataset.ejesAlzadoDesplazamientos = JSON.stringify(
            layout.globos.map((g) => g.t - (cruces.find((c) => c.eje.globalid === g.globalid)?.s ?? g.t)),
          );
          contenedor.current.dataset.nivelesX = JSON.stringify({
            desde: layout.tInicio,
            hasta: layout.tFin,
            ejes: cruces.map(({ s }) => s),
            etiquetaX: layout.tCabeza,
            parcialX: layout.tCadena,
            totalX: layout.tTotal,
            anotacionFin: layout.tFinAnotacion,
            globoZ: layout.zGlobo,
            radioGlobo: layout.globos[0]?.radio ?? 0,
          });
          contenedor.current.dataset.nivelesZ = JSON.stringify(ordenados.map((n) => n.elevacion));
          contenedor.current.dataset.nivelesPatron = estiloNivel.patron;
          contenedor.current.dataset.nivelesCabezas = JSON.stringify({
            h: [h[0], h[1]],
            d: [d[0], d[1]],
            profundidad,
            ancho: anchoCabeza,
            alto: altoCabeza,
            altoBanda: altoCabeza,
            desfaseInferior: 0,
            bordeTexto: layout.tCabeza + anchoCabeza / 2 + mmAMundo(1, vista.escala),
            haciaCamara,
            guias: layout.lineas
              .filter((linea) => linea.tipo === "guia-nivel")
              .map((linea) => ({ elev: linea.elevacion, puntos: linea.puntos })),
            cabezas: layout.cabezas.map((c) => ({
              z: c.z,
              t: c.t,
              elev: c.elevacion,
              desplazamiento: c.desplazamiento,
              tipo: estiloNivel.cabeza,
              caja: {
                t0: c.poligono.length > 0 ? Math.min(...c.poligono.map((p) => p[0])) : c.t,
                t1: c.cajaTexto.t1,
                z0: Math.min(c.z, c.cajaTexto.z0),
                z1: Math.max(c.z + altoCabeza, c.cajaTexto.z1),
              },
            })),
          });
          contenedor.current.dataset.nivelesAjuste = JSON.stringify({
            automaticos: layout.cabezas.map((c) => c.desplazamiento),
            manuales: ajustesNivel,
          });
          contenedor.current.dataset.nivelesCotaRemate = estiloCota.remate;
          contenedor.current.dataset.nivelesCotaEstilo = estiloCota.nombre;
          contenedor.current.dataset.nivelesSeparacionGlobos = String(layout.separacionGlobos);
        }
      }
    }

  return {
    datosNiveles,
  };
}
