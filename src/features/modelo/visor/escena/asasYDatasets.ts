/* eslint-disable react-hooks/immutability -- la escena es mutable por diseño. */
import * as THREE from "three";
import { asasDeLosa, hayAsasLosa, leerPoligonoWkt } from "../../asasLosa";
import { bordesDePset } from "../../bordesLosa";
import { crearAsaPunto } from "../anotaciones";
import { grosorMm } from "../../estilos";
import { normalCorte } from "../camara";
import type { CtxEscena } from "./contexto";

export function construirAsasYDatasets(ctx: CtxEscena) {
  const {
    asasLosa,
    contenedor,
    corteZ,
    cotasInteraccion,
    datosCotas,
    datosNiveles,
    ejeSeleccionadoRef,
    ejesInteraccion,
    grupoLocal,
    herramienta,
    inicioEfecto,
    lineasCapasPlanta,
    mallasCapas3D,
    mundoPorPx,
    polilineasSeccion,
    propiedades,
    referencias,
    registro,
    rellenosLosaPatron,
    rellenosLosaProyeccion,
    renderer,
    tamano,
    visibles,
    caja,
    puntoCorte,
    vistas,
    estilos,
    seleccionados,
    seleccion,
    vista,
    modoCorte,
  } = ctx;

    const seleccionActual = ejeSeleccionadoRef.current;
    for (const asa of ejesInteraccion.current) {
      const sprite = crearAsaPunto(
        seleccionActual === null || asa.globalid === seleccionActual ? "#f59e0b" : "#94a3b8",
      );
      sprite.position.set(asa.punto[0], asa.punto[1], asa.punto[2]);
      // O044: los pinzamientos de V1 y V2 son redondos y pequeños (2.5 px de radio).
      const materialAsa = sprite.material as THREE.PointsMaterial;
      materialAsa.size = asa.tipo === "codo" ? 5 : 12;
      sprite.userData.asaEje = {
        globalid: asa.globalid,
        lado: asa.lado,
        tipo: asa.tipo,
        indice: asa.indice,
      };
      sprite.visible =
        seleccionActual === null || asa.globalid === seleccionActual;
      grupoLocal.add(sprite);
    }

    // Datos para las pruebas y las capturas: lo que realmente se está dibujando.
    const nodoVisor = contenedor.current;
    if (nodoVisor) {
      nodoVisor.dataset.ejes = String(referencias.ejes.length);
      nodoVisor.dataset.ejesEtiquetas = referencias.ejes.map((eje) => eje.etiqueta).join(",");
      nodoVisor.dataset.cotas = JSON.stringify(datosCotas);
      nodoVisor.dataset.cotasParciales = datosCotas
        .flatMap((f) => f.parciales)
        .join(",");
      nodoVisor.dataset.cotasTotales = datosCotas
        .map((f) => f.total ?? "")
        .filter(Boolean)
        .join(",");
      // O023: el rebase se rotula en el dibujo; la prueba comprueba la etiqueta real.
      nodoVisor.dataset.cotasRebases = datosCotas
        .map((f) => (f.rebase ? `Rebase ${f.rebase}` : ""))
        .filter(Boolean)
        .join(",");
      nodoVisor.dataset.nivelesCotas = JSON.stringify(datosNiveles);
      nodoVisor.dataset.nivelesTexto = datosNiveles
        .flatMap((n) => [n.nombre, n.elevacion, ...n.cabezas, ...n.parciales, n.total ?? ""])
        .join(" ");
      nodoVisor.dataset.cotasEditables = String(
        cotasInteraccion.current.filter((c) => c.tipo !== "total").length,
      );
      nodoVisor.dataset.mallasDibujadas = String(visibles.length);
      // O043: qué mallas entraron en la vista (para comprobar el corte horizontal).
      nodoVisor.dataset.mallasVisibles = visibles
        .map((elemento) => elemento.globalid)
        .join(",");
      nodoVisor.dataset.seccionPolilineas = String(polilineasSeccion);
      nodoVisor.dataset.capasPlanta = String(lineasCapasPlanta);
      nodoVisor.dataset.capas3d = String(mallasCapas3D);
      nodoVisor.dataset.estiloMurosCorte = String(
        grosorMm(estilos, vista, "muros", "corte") ?? "",
      );
      nodoVisor.dataset.estiloMurosProyeccion = String(
        grosorMm(estilos, vista, "muros", "proyeccion") ?? "",
      );
      nodoVisor.dataset.rellenoMateriales = String(
        Object.values(estilos.materiales).filter((m) => m.patron !== "vidrio").length,
      );
      nodoVisor.dataset.rellenoLosaPatron = String(rellenosLosaPatron);
      nodoVisor.dataset.rellenoLosaProyeccion = String(rellenosLosaProyeccion);
      nodoVisor.dataset.estiloVista = vista.estilo;
      nodoVisor.dataset.redibujo = String(
        Number(nodoVisor.dataset.redibujo ?? "0") + 1,
      );
      nodoVisor.dataset.redibujoMs = String(
        Math.round(performance.now() - inicioEfecto),
      );
      const tamanoBuffer = renderer.current?.getDrawingBufferSize(new THREE.Vector2());
      if (tamanoBuffer) {
        for (const entrada of registro) {
          entrada.material.resolution.set(tamanoBuffer.x, tamanoBuffer.y);
        }
      }
    }

    // O034: asas triangulares en el punto medio de cada borde de la losa
    // seleccionada, apuntando hacia afuera. Solo en planta y con una losa.
    asasLosa.current = [];
    if (
      vista.tipo === "planta" &&
      !herramienta &&
      !modoCorte &&
      hayAsasLosa(seleccion, seleccionados, propiedades?.clase)
    ) {
      const pset = propiedades?.psets?.OPENRVT_Losa as
        | Record<string, unknown>
        | undefined;
      const poligono = leerPoligonoWkt(
        typeof pset?.Contorno === "string" ? pset.Contorno : null,
      );
      const asas = asasDeLosa(bordesDePset(pset), poligono);
      const tamanoAsa = Math.max(mundoPorPx * 10, 0.05);
      const zAsa = corteZ + 0.02;
      for (const asa of asas) {
        const [mx, my] = asa.medio;
        const [nx, ny] = asa.normal;
        const tx = -ny;
        const ty = nx;
        const base = tamanoAsa * 0.55;
        const vertices = new Float32Array([
          mx + nx * tamanoAsa,
          my + ny * tamanoAsa,
          zAsa,
          mx - nx * base + tx * base,
          my - ny * base + ty * base,
          zAsa,
          mx - nx * base - tx * base,
          my - ny * base - ty * base,
          zAsa,
        ]);
        const geometria = new THREE.BufferGeometry();
        geometria.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
        const material = new THREE.MeshBasicMaterial({
          color: new THREE.Color(0xf59e0b),
          side: THREE.DoubleSide,
          depthTest: false,
          depthWrite: false,
          transparent: true,
          opacity: 0.95,
        });
        const asaMalla = new THREE.Mesh(geometria, material);
        asaMalla.renderOrder = 18;
        asaMalla.userData.asaLosa = { indice: asa.indice };
        grupoLocal.add(asaMalla);
        asasLosa.current.push({ ...asa, punto: [mx, my, zAsa] });
      }
    }
    if (contenedor.current) {
      contenedor.current.dataset.asasLosa = String(asasLosa.current.length);
    }

    // Trazas de los cortes sobre las plantas, con flechas en los extremos.
    if (vista.tipo === "planta") {
      const z = (vista.alturaPlano ?? caja.max[2]) + 0.02;
      const lineas: number[] = [];
      for (const corte of vistas) {
        if (corte.tipo !== "corte" || !corte.puntoA || !corte.puntoB) continue;
        const [ax, ay] = corte.puntoA;
        const [bx, by] = corte.puntoB;
        lineas.push(ax, ay, z, bx, by, z);
        const [nx, ny] = normalCorte(corte);
        const largo = Math.max(tamano * 0.04, 0.25);
        for (const [px, py] of [
          [ax, ay],
          [bx, by],
        ]) {
          const puntaX = px + nx * largo;
          const puntaY = py + ny * largo;
          lineas.push(px, py, z, puntaX, puntaY, z);
          lineas.push(
            puntaX,
            puntaY,
            z,
            puntaX - nx * largo * 0.6 - ny * largo * 0.35,
            puntaY - ny * largo * 0.6 + nx * largo * 0.35,
            z,
            puntaX,
            puntaY,
            z,
            puntaX - nx * largo * 0.6 + ny * largo * 0.35,
            puntaY - ny * largo * 0.6 - nx * largo * 0.35,
            z,
          );
        }
      }
      if (puntoCorte) {
        const [px, py] = puntoCorte;
        const r = Math.max(tamano * 0.015, 0.08);
        lineas.push(px - r, py, z, px + r, py, z, px, py - r, z, px, py + r, z);
      }
      if (lineas.length > 0) {
        const geometria = new THREE.BufferGeometry();
        geometria.setAttribute("position", new THREE.Float32BufferAttribute(lineas, 3));
        grupoLocal.add(
          new THREE.LineSegments(
            geometria,
            new THREE.LineBasicMaterial({ color: new THREE.Color(0xc0392b) }),
          ),
        );
      }
    }

  return {
    seleccionActual,
    nodoVisor,
  };
}
