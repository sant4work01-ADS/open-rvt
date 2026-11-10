/* eslint-disable react-hooks/immutability -- la escena es mutable por diseño. */
import * as THREE from "three";
import { anchoTextoAprox, textoCota } from "../anotaciones";
import { calcularFamiliasCotas, posicionTextoEntreMarcas } from "../../cotas";
import { crearMaterialLinea, lineaCerrada } from "../lineas";
import { formatearNumero } from "../../anotacionVista";
import { mmAMundo, mmAMundoConMinimoPx } from "../../estilos";
import { type CotaInteractiva } from "../tipos";
import type { CtxEscena } from "./contexto";

export function construirCotasPlanta(ctx: CtxEscena) {
  const {
    corteZ,
    cotasInteraccion,
    grosorDe,
    grupoLocal,
    mundoPorPx,
    oscuro,
    referencias,
    registro,
    tamano,
    estilos,
    vista,
  } = ctx;

    const datosCotas: Array<{
      vertical: boolean;
      parciales: string[];
      total: string | null;
      rebase: string | null;
    }> = [];
    cotasInteraccion.current = [];
    if (vista.tipo === "planta" && vista.cotasEjes !== false) {
      const familias = calcularFamiliasCotas(referencias.ejes, referencias.reticula);
      const mmCota = grosorDe("cotas", "proyeccion");
      if (mmCota !== null) {
        const estiloColorCota =
          estilos.cotas.lista.find(
            (c) => c.nombre === (vista.estiloCota ?? estilos.cotas.porDefecto),
          )?.color ?? estilos.categorias.cotas.color;
        const colorCota = oscuro ? "#e8eaed" : estiloColorCota;
        const materialCota = crearMaterialLinea({
          mm: mmCota,
          escala: vista.escala,
          color: colorCota,
          registro,
          mundoPorPx,
          profundidad: false,
        });
        const altoBurbuja = Math.max(tamano * 0.035, 0.35);
        const separacion = mmAMundo(1, vista.escala);
        // O006b: el texto conserva 2,5 mm de papel, pero en pantalla nunca baja de
        // 11 px (y las marcas oblicuas, de 6 px) para que se lea al alejar la vista.
        // El estilo de cota de la vista (Vista → Estilos de anotación) manda también
        // en planta: alto de texto, remate, tamaño de remate, color y decimales.
        const estiloCotaPlanta =
          estilos.cotas.lista.find(
            (c) => c.nombre === (vista.estiloCota ?? estilos.cotas.porDefecto),
          ) ?? estilos.cotas.lista[0];
        const marca = mmAMundoConMinimoPx(
          estiloCotaPlanta.tamanoRemate,
          vista.escala,
          mundoPorPx,
          6 * (estiloCotaPlanta.tamanoRemate / 2),
        );
        const altoTexto = mmAMundoConMinimoPx(
          estiloCotaPlanta.altoTexto,
          vista.escala,
          mundoPorPx,
          11 * (estiloCotaPlanta.altoTexto / 2.5),
        );
        const textoValorCota = (valor: number) =>
          formatearNumero(valor, estiloCotaPlanta.decimales, estiloCotaPlanta.unidad);
        const sepParcial = altoBurbuja / 2 + Math.max(mmAMundo(5, vista.escala), altoTexto * 0.6);
        // La total se separa de la cadena de parciales al menos 1,5 veces el texto.
        const sepTotal = sepParcial + Math.max(mmAMundo(6, vista.escala), altoTexto * 1.5);
        const exceso = mmAMundo(2, vista.escala);
        const fondo = oscuro ? "#1f2328" : "#ffffff";
        // O006d: la cota del rebase se distingue por color y tamaño algo menor.
        const colorRebase = oscuro ? "#7dd3fc" : "#0369a1";
        const materialRebase = crearMaterialLinea({
          mm: Math.max(mmCota * 0.75, 0.09),
          escala: vista.escala,
          color: colorRebase,
          registro,
          mundoPorPx,
          profundidad: false,
        });
        const altoTextoRebase = altoTexto * 0.85;
        const zCota = corteZ + 0.06;
        for (const familia of familias) {
          const [ux, uy] = familia.direccion;
          const [nx, ny] = familia.normal;
          const tBase = familia.bordeBurbujas;
          const punto = (s: number, t: number): [number, number, number] => [
            nx * s + ux * t,
            ny * s + uy * t,
            zCota,
          ];
          const textos = {
            vertical: familia.ejes[0].vertical,
            parciales: [] as string[],
            total: null as string | null,
            rebase: null as string | null,
          };
          // O006d: cota del rebase en un extremo, del eje opuesto a la punta.
          if (familia.rebase) {
            const minS = Math.min(
              ...familia.ejes.map((eje) => eje.x1 * nx + eje.y1 * ny),
            );
            const sRebase = minS - Math.max(mmAMundo(12, vista.escala), altoTexto * 2.2);
            const { desde, hasta } = familia.rebase;
            const dibujarMarca = (t: number) => {
              const bx = nx * sRebase + ux * t;
              const by = ny * sRebase + uy * t;
              const dx = (nx + ux) / Math.SQRT2;
              const dy = (ny + uy) / Math.SQRT2;
              lineaCerrada(
                [
                  [bx - (dx * marca) / 2, by - (dy * marca) / 2, zCota],
                  [bx + (dx * marca) / 2, by + (dy * marca) / 2, zCota],
                ],
                materialRebase,
                3.1,
                grupoLocal,
              );
            };
            lineaCerrada(
              [punto(sRebase, desde), punto(sRebase, hasta)],
              materialRebase,
              2,
              grupoLocal,
            );
            dibujarMarca(desde);
            dibujarMarca(hasta);
            // Líneas de referencia cortas hacia los ejes medidos.
            for (const t of [desde, hasta]) {
              lineaCerrada(
                [punto(minS - separacion, t), punto(sRebase - separacion, t)],
                materialRebase,
                1.2,
                grupoLocal,
              );
            }
            const etiqueta = textoValorCota(familia.rebase.valor);
            // O010: el valor del rebase se rotula para que no parezca una cota suelta.
            const sprite = textoCota(`Rebase ${etiqueta}`, colorRebase, fondo, altoTextoRebase);
            if (sprite) {
              const pos = punto(sRebase - altoTexto * 0.9, (desde + hasta) / 2);
              sprite.position.set(pos[0], pos[1], zCota + 0.01);
              sprite.renderOrder = 21;
              grupoLocal.add(sprite);
              cotasInteraccion.current.push({
                tipo: "rebase",
                texto: etiqueta,
                valor: familia.rebase.valor,
                punto: pos,
                referencia: familia.rebase.referencia,
                mover: familia.rebase.mover,
              });
            }
            textos.rebase = etiqueta;
          }
          if (familia.ejes.length < 2 || !familia.total) {
            datosCotas.push(textos);
            continue;
          }
          // Líneas de extensión: 1 mm de separación con la burbuja y un poco de exceso.
          for (const eje of familia.ejes) {
            const s = eje.x2 * nx + eje.y2 * ny;
            const t = eje.x2 * ux + eje.y2 * uy;
            lineaCerrada(
              [punto(s, t + separacion), punto(s, tBase + sepTotal + exceso)],
              materialCota,
              3,
              grupoLocal,
            );
          }
          // hacia: +1 si el interior del tramo queda hacia +s, −1 si hacia −s.
          const marcar = (s: number, t: number, hacia: 1 | -1 = 1) => {
            const bx = nx * s + ux * t;
            const by = ny * s + uy * t;
            if (estiloCotaPlanta.remate === "punto") {
              const disco = new THREE.Mesh(
                new THREE.CircleGeometry(marca / 3, 24),
                new THREE.MeshBasicMaterial({
                  color: new THREE.Color(colorCota),
                  side: THREE.DoubleSide,
                  depthTest: false,
                  depthWrite: false,
                }),
              );
              disco.position.set(bx, by, zCota);
              disco.renderOrder = 22;
              grupoLocal.add(disco);
              return;
            }
            if (estiloCotaPlanta.remate !== "tick-arquitectonico") {
              // Flecha: punta en la marca, alas hacia el interior del tramo.
              const largo = marca;
              const ala = (signo: number): [number, number, number] => [
                bx + nx * hacia * largo + ux * signo * largo * 0.25,
                by + ny * hacia * largo + uy * signo * largo * 0.25,
                zCota,
              ];
              const punta: [number, number, number] = [bx, by, zCota];
              if (estiloCotaPlanta.remate === "flecha-rellena") {
                const geometria = new THREE.BufferGeometry();
                geometria.setAttribute(
                  "position",
                  new THREE.Float32BufferAttribute([...punta, ...ala(1), ...ala(-1)], 3),
                );
                const malla = new THREE.Mesh(
                  geometria,
                  new THREE.MeshBasicMaterial({
                    color: new THREE.Color(colorCota),
                    side: THREE.DoubleSide,
                    depthTest: false,
                    depthWrite: false,
                  }),
                );
                malla.renderOrder = 22;
                grupoLocal.add(malla);
              } else {
                lineaCerrada([ala(1), punta, ala(-1)], materialCota, 3.1, grupoLocal);
              }
              return;
            }
            const dx = (nx + ux) / Math.SQRT2;
            const dy = (ny + uy) / Math.SQRT2;
            lineaCerrada(
              [
                [bx - (dx * marca) / 2, by - (dy * marca) / 2, zCota],
                [bx + (dx * marca) / 2, by + (dy * marca) / 2, zCota],
              ],
              materialCota,
              3.1,
              grupoLocal,
            );
          };
          // O006b: coloca el texto sobre la línea de cota. Si no cabe entre las dos
          // marcas, se saca afuera del tramo con una línea guía en vez de encimarse.
          const colocarTextoCota = (
            etiqueta: string,
            desde: number,
            hasta: number,
            t: number,
            datos: { tipo: CotaInteractiva["tipo"]; valor: number; referencia?: string; mover?: string },
          ): void => {
            const sprite = textoCota(etiqueta, colorCota, fondo, altoTexto);
            if (!sprite) return;
            const { centro: s, fuera } = posicionTextoEntreMarcas(
              desde,
              hasta,
              anchoTextoAprox(etiqueta, altoTexto),
              marca,
            );
            if (fuera) {
              // Línea guía desde el centro del tramo hasta el texto sacado afuera.
              const borde = Math.max(desde, hasta);
              lineaCerrada(
                [punto((desde + hasta) / 2, t), punto(borde + marca * 0.6, t + altoTexto * 0.15)],
                materialCota,
                1.4,
                grupoLocal,
              );
            }
            const pos = punto(s, t + altoTexto * 0.9);
            sprite.position.set(pos[0], pos[1], zCota + 0.01);
            sprite.renderOrder = 20;
            grupoLocal.add(sprite);
            cotasInteraccion.current.push({ ...datos, texto: etiqueta, punto: pos });
          };
          // Cadena de parciales.
          for (const cota of familia.parciales) {
            const t = tBase + sepParcial;
            lineaCerrada(
              [punto(cota.desde, t), punto(cota.hasta, t)],
              materialCota,
              3,
              grupoLocal,
            );
            marcar(cota.desde, t, cota.hasta >= cota.desde ? 1 : -1);
            marcar(cota.hasta, t, cota.hasta >= cota.desde ? -1 : 1);
            const etiqueta = textoValorCota(cota.valor);
            colocarTextoCota(etiqueta, cota.desde, cota.hasta, t, {
              tipo: "parcial",
              valor: cota.valor,
              referencia: cota.referencia,
              mover: cota.mover,
            });
            textos.parciales.push(etiqueta);
          }
          // Cota total, más afuera y de lectura.
          const tTotal = tBase + sepTotal;
          lineaCerrada(
            [punto(familia.total.desde, tTotal), punto(familia.total.hasta, tTotal)],
            materialCota,
            3,
            grupoLocal,
          );
          const sentidoTotal = familia.total.hasta >= familia.total.desde ? 1 : -1;
          marcar(familia.total.desde, tTotal, sentidoTotal);
          marcar(familia.total.hasta, tTotal, sentidoTotal === 1 ? -1 : 1);
          const etiquetaTotal = textoValorCota(familia.total.valor);
          colocarTextoCota(
            etiquetaTotal,
            familia.total.desde,
            familia.total.hasta,
            tTotal,
            { tipo: "total", valor: familia.total.valor },
          );
          textos.total = etiquetaTotal;
          datosCotas.push(textos);
        }
      }
    }

  return {
    datosCotas,
  };
}
