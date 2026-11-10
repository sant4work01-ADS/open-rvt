/* eslint-disable react-hooks/immutability -- los refs del visor son mutables por diseño. */
import * as THREE from "three";
import { clasificarEmpujar, crearRectangulo, puntosRectangulo } from "../empujar";
import { colocarAbertura, describirEnganche, distanciaAEjeParalelo, ejeOrtogonal, restringirEje, type Punto2 } from "../herramientas";
import { diagonalCaja } from "../vistas";
import { etiquetaCota } from "./anotaciones";
import { type Vec3 } from "../inferencias3d";
import { useEffect } from "react";

import { useAnotacionesVisor } from "./useAnotacionesVisor";
export function useHerramientaVisor(c: ReturnType<typeof useAnotacionesVisor>) {
  const {
    grupoHerramienta,
    caraEmpujarHover,
    herramienta,
    puntosHerramienta,
    ratonHerramienta,
    engancheHerramienta,
    referencias,
    voltearSiguiente,
    ejeLibre,
    vistaPreviaRecorte,
    empujarRect,
    empujarAltura,
    empujarClasificacion,
    empujarZ,
    empujarCara,
    oscuro,
    vista,
    caja,
    zEmpujar,
    trazoEjePrevio,
    cajaVista,
    metrosPorPixelActual,
  } = c;

  useEffect(() => {
    const grupoLocal = grupoHerramienta.current;
    if (!grupoLocal) return;
    while (grupoLocal.children.length) {
      const hijo = grupoLocal.children.pop()!;
      hijo.traverse((objeto) => {
        const malla = objeto as THREE.Mesh;
        if (malla.geometry) malla.geometry.dispose();
        const material = malla.material;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else if (material) material.dispose();
      });
    }
    if (vista.tipo !== "planta" || !herramienta) return;
    const z = (vista.alturaPlano ?? caja.max[2]) + 0.03;
    const metrosPorPixel = metrosPorPixelActual();
    const escala = Math.max(diagonalCaja(cajaVista), 2);
    const tamano = Math.max(escala * 0.018, 0.06);
    const colorPuntos = new THREE.Color(0xd97706);
    const colorSnap = new THREE.Color(0x0ea5e9);
    const materialLinea = new THREE.LineBasicMaterial({
      color: colorPuntos,
      depthTest: false,
      transparent: true,
      opacity: 0.95,
    });
    materialLinea.depthTest = false;

    const polilinea = (puntos: Punto2[], cerrada = false) => {
      if (puntos.length < 2) return;
      const lista = cerrada ? [...puntos, puntos[0]] : puntos;
      const geometria = new THREE.BufferGeometry().setFromPoints(
        lista.map(([x, y]) => new THREE.Vector3(x, y, z)),
      );
      const linea = new THREE.Line(geometria, materialLinea);
      linea.renderOrder = 12;
      grupoLocal.add(linea);
    };

    polilinea(puntosHerramienta);
    // O006d: con familia existente el eje se previsualiza paralelo, con sus extremos.
    const restriccionEje =
      herramienta === "eje" && puntosHerramienta.length > 0 && ratonHerramienta
        ? restringirEje(
            puntosHerramienta[0],
            ejeOrtogonal(puntosHerramienta[0], ratonHerramienta).fin,
            referencias.ejes,
            ejeLibre,
          )
        : null;
    const trazoEje =
      restriccionEje ??
      (trazoEjePrevio
        ? {
            inicio: trazoEjePrevio.inicio,
            fin: trazoEjePrevio.fin,
            vertical: trazoEjePrevio.vertical,
          }
        : null);
    if (trazoEje) {
      polilinea([trazoEje.inicio, trazoEje.fin]);
      const cercano = distanciaAEjeParalelo(
        ratonHerramienta ?? trazoEje.fin,
        referencias.ejes,
        trazoEje.vertical,
      );
      if (cercano && cercano.distancia > 0.02) {
        const medio: Punto2 = trazoEje.vertical
          ? [trazoEje.inicio[0], (trazoEje.inicio[1] + trazoEje.fin[1]) / 2]
          : [(trazoEje.inicio[0] + trazoEje.fin[0]) / 2, trazoEje.inicio[1]];
        const enEje: Punto2 = trazoEje.vertical
          ? [cercano.referencia.x1, medio[1]]
          : [medio[0], cercano.referencia.y1];
        polilinea([enEje, medio]);
        const texto = `${cercano.distancia.toFixed(2)} m`;
        const cota = etiquetaCota(
          texto,
          oscuro ? "#bae6fd" : "#0369a1",
          oscuro ? "#262b33" : "#ffffff",
          Math.max(tamano * 0.026, 0.2),
        );
        if (cota) {
          cota.position.set(
            (enEje[0] + medio[0]) / 2,
            (enEje[1] + medio[1]) / 2,
            z + 0.08,
          );
          cota.renderOrder = 19;
          grupoLocal.add(cota);
        }
      }
    } else if (puntosHerramienta.length > 0 && ratonHerramienta) {
      polilinea([puntosHerramienta[puntosHerramienta.length - 1], ratonHerramienta]);
      // O005c: cota temporal mientras se traza (muro, eje, losa, mover y copiar).
      const origen = puntosHerramienta[puntosHerramienta.length - 1];
      const largo = Math.hypot(
        ratonHerramienta[0] - origen[0],
        ratonHerramienta[1] - origen[1],
      );
      if (largo > 0.02) {
        const texto = `${largo.toFixed(2)} m`;
        const cota = etiquetaCota(
          texto,
          oscuro ? "#e8eaed" : "#1f2328",
          oscuro ? "#262b33" : "#ffffff",
          Math.max(tamano * 0.028, 0.22),
        );
        if (cota) {
          cota.position.set(
            (origen[0] + ratonHerramienta[0]) / 2,
            (origen[1] + ratonHerramienta[1]) / 2,
            z + 0.06,
          );
          cota.renderOrder = 18;
          grupoLocal.add(cota);
        }
      }
    }
    if (herramienta === "losa" && puntosHerramienta.length > 0) {
      // O050: polígono sombreado y cerrado hasta el cursor; el vértice de cierre
      // nunca forma parte del contorno guardado.
      const conCursor =
        ratonHerramienta &&
        Math.hypot(
          ratonHerramienta[0] - puntosHerramienta[puntosHerramienta.length - 1][0],
          ratonHerramienta[1] - puntosHerramienta[puntosHerramienta.length - 1][1],
        ) > 1e-6
          ? [...puntosHerramienta, ratonHerramienta]
          : puntosHerramienta;
      if (conCursor.length >= 3) {
        const forma = new THREE.Shape();
        forma.moveTo(conCursor[0][0], conCursor[0][1]);
        for (const [x, y] of conCursor.slice(1)) forma.lineTo(x, y);
        forma.closePath();
        const malla = new THREE.Mesh(
          new THREE.ShapeGeometry(forma),
          new THREE.MeshBasicMaterial({
            color: 0xf59e0b,
            transparent: true,
            opacity: 0.2,
            depthTest: false,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        );
        malla.position.z = z;
        malla.renderOrder = 11;
        grupoLocal.add(malla);
      }
      polilinea(conCursor, conCursor.length >= 3);
      const sobrePrimero =
        conCursor.length >= 3 &&
        ratonHerramienta !== null &&
        metrosPorPixel > 0 &&
        Math.hypot(
          ratonHerramienta[0] - puntosHerramienta[0][0],
          ratonHerramienta[1] - puntosHerramienta[0][1],
        ) <=
          12 * metrosPorPixel;
      if (sobrePrimero) {
        const marca = new THREE.Mesh(
          new THREE.CircleGeometry(tamano * 0.55, 24),
          new THREE.MeshBasicMaterial({
            color: 0x16a34a,
            transparent: true,
            opacity: 0.9,
            depthTest: false,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        );
        marca.position.set(puntosHerramienta[0][0], puntosHerramienta[0][1], z + 0.002);
        marca.renderOrder = 15;
        grupoLocal.add(marca);
      }
    }
    if (puntosHerramienta.length > 0) {
      for (const [x, y] of puntosHerramienta) {
        const geometria = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(x - tamano / 2, y, z),
          new THREE.Vector3(x + tamano / 2, y, z),
          new THREE.Vector3(x, y - tamano / 2, z),
          new THREE.Vector3(x, y + tamano / 2, z),
        ]);
        const cruz = new THREE.LineSegments(
          geometria,
          new THREE.LineBasicMaterial({ color: colorPuntos, depthTest: false }),
        );
        cruz.renderOrder = 13;
        grupoLocal.add(cruz);
      }
    }

    // Vista previa de puerta/ventana sobre el muro.
    if ((herramienta === "puerta" || herramienta === "ventana") && ratonHerramienta) {
      const ancho = herramienta === "puerta" ? 0.9 : 1.2;
      const colocada = colocarAbertura(referencias, ratonHerramienta, ancho);
      if (colocada) {
        const { muro } = colocada;
        const largo = Math.hypot(muro.x2 - muro.x1, muro.y2 - muro.y1) || 1;
        const ux = (muro.x2 - muro.x1) / largo;
        const uy = (muro.y2 - muro.y1) / largo;
        const nx = -uy;
        const ny = ux;
        const medio = muro.espesor / 2;
        const esquinas: Punto2[] = [];
        for (const [d, lado] of [
          [colocada.distancia, -medio],
          [colocada.distancia + ancho, -medio],
          [colocada.distancia + ancho, medio],
          [colocada.distancia, medio],
        ] as Array<[number, number]>) {
          esquinas.push([
            muro.x1 + ux * d + nx * lado * (voltearSiguiente ? -1 : 1),
            muro.y1 + uy * d + ny * lado * (voltearSiguiente ? -1 : 1),
          ]);
        }
        const geometria = new THREE.BufferGeometry().setFromPoints(
          [...esquinas, esquinas[0]].map(([x, y]) => new THREE.Vector3(x, y, z)),
        );
        const linea = new THREE.Line(
          geometria,
          new THREE.LineBasicMaterial({ color: 0x2563eb, depthTest: false }),
        );
        linea.renderOrder = 14;
        grupoLocal.add(linea);
      }
    }

    if (herramienta === "recortar_extender" && vistaPreviaRecorte) {
      const geometria = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(vistaPreviaRecorte.x1, vistaPreviaRecorte.y1, z + 0.05),
        new THREE.Vector3(vistaPreviaRecorte.x2, vistaPreviaRecorte.y2, z + 0.05),
      ]);
      const linea = new THREE.Line(
        geometria,
        new THREE.LineBasicMaterial({
          color: 0xf59e0b,
          transparent: true,
          opacity: 0.55,
          depthTest: false,
        }),
      );
      linea.renderOrder = 20;
      grupoLocal.add(linea);
    }

    if (engancheHerramienta) {
      const [x, y] = engancheHerramienta.punto;
      // O006e: símbolo de 10 px de pantalla, independiente del zoom.
      const r = Math.max(metrosPorPixel * 5, 1e-5);
      const puntosForma: Record<string, THREE.Vector3[]> = {
        extremo: [
          new THREE.Vector3(x - r, y - r, z),
          new THREE.Vector3(x + r, y - r, z),
          new THREE.Vector3(x + r, y + r, z),
          new THREE.Vector3(x - r, y + r, z),
          new THREE.Vector3(x - r, y - r, z),
        ],
        medio: [
          new THREE.Vector3(x, y - r, z),
          new THREE.Vector3(x + r, y + r, z),
          new THREE.Vector3(x - r, y + r, z),
          new THREE.Vector3(x, y - r, z),
        ],
        interseccion: [
          new THREE.Vector3(x - r, y - r, z),
          new THREE.Vector3(x + r, y + r, z),
          new THREE.Vector3(x + r, y - r, z),
          new THREE.Vector3(x - r, y + r, z),
        ],
        cuadricula: [],
        perpendicular: [
          new THREE.Vector3(x, y, z),
          new THREE.Vector3(x, y + r, z),
          new THREE.Vector3(x + r * 0.8, y + r * 0.8, z),
          new THREE.Vector3(x - r * 0.8, y + r * 0.8, z),
          new THREE.Vector3(x, y, z),
        ],
      };
      const forma = puntosForma[engancheHerramienta.tipo] ?? [];
      if (forma.length >= 2) {
        const geometria = new THREE.BufferGeometry().setFromPoints(forma);
        const marcador = new THREE.Line(
          geometria,
          new THREE.LineBasicMaterial({ color: colorSnap, depthTest: false }),
        );
        marcador.renderOrder = 15;
        grupoLocal.add(marcador);
      }
      const etiqueta = etiquetaCota(
        describirEnganche(engancheHerramienta, referencias),
        "#0ea5e9",
        oscuro ? "#141416" : "#ffffff",
        Math.max(metrosPorPixel * 10, 1e-4),
      );
      if (etiqueta) {
        etiqueta.position.set(
          x + metrosPorPixel * 10,
          y - metrosPorPixel * 13,
          z + 0.002,
        );
        etiqueta.renderOrder = 16;
        grupoLocal.add(etiqueta);
      }
    }
  }, [
    herramienta,
    puntosHerramienta,
    ratonHerramienta,
    engancheHerramienta,
    referencias,
    voltearSiguiente,
    vista,
    cajaVista,
    oscuro,
    ejeLibre,
    trazoEjePrevio,
    metrosPorPixelActual,
    vistaPreviaRecorte,
  ]);

  // O046: vista previa del empujar/tirar en 3D: contorno, relleno y sólido.
  useEffect(() => {
    const grupoLocal = grupoHerramienta.current;
    if (!grupoLocal) return;
    while (grupoLocal.children.length) {
      const hijo = grupoLocal.children.pop()!;
      hijo.traverse((objeto) => {
        const malla = objeto as THREE.Mesh;
        if (malla.geometry) malla.geometry.dispose();
        const material = malla.material;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else if (material) material.dispose();
      });
    }
    if (herramienta !== "empujar") return;
    if (vista.tipo !== "iso" && vista.tipo !== "perspectiva") return;

    // O056: resalta la cara tocada y previsualiza su posición al empujar.
    const agregarCara = (
      poligono: Vec3[],
      normal: THREE.Vector3,
      desplazamiento: number,
      color: number,
      opacidad: number,
    ) => {
      if (poligono.length < 3) return;
      const posiciones: number[] = [];
      const desplazar = (p: Vec3): [number, number, number] => [
        p.x + normal.x * (0.006 + desplazamiento),
        p.y + normal.y * (0.006 + desplazamiento),
        p.z + normal.z * (0.006 + desplazamiento),
      ];
      for (let i = 1; i + 1 < poligono.length; i += 1) {
        const a = desplazar(poligono[0]);
        const b = desplazar(poligono[i]);
        const c = desplazar(poligono[i + 1]);
        posiciones.push(...a, ...b, ...c);
      }
      const geometria = new THREE.BufferGeometry();
      geometria.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(posiciones, 3),
      );
      const malla = new THREE.Mesh(
        geometria,
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: opacidad,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      malla.renderOrder = 12;
      grupoLocal.add(malla);
      const borde = new THREE.BufferGeometry().setFromPoints(
        [...poligono, poligono[0]].map((p) => {
          const [x, y, z] = desplazar(p);
          return new THREE.Vector3(x, y, z);
        }),
      );
      const linea = new THREE.Line(
        borde,
        new THREE.LineBasicMaterial({ color, depthTest: false }),
      );
      linea.renderOrder = 15;
      grupoLocal.add(linea);
    };

    if (empujarCara?.poligono) {
      const normal = new THREE.Vector3(...empujarCara.normal).normalize();
      agregarCara(empujarCara.poligono, normal, 0, 0x2563eb, 0.2);
      agregarCara(
        empujarCara.poligono,
        normal,
        empujarCara.distancia,
        0x0ea5e9,
        0.38,
      );
      const desde = empujarCara.poligono.map(
        (p) => new THREE.Vector3(p.x, p.y, p.z),
      );
      const hasta = empujarCara.poligono.map(
        (p) =>
          new THREE.Vector3(
            p.x + normal.x * empujarCara.distancia,
            p.y + normal.y * empujarCara.distancia,
            p.z + normal.z * empujarCara.distancia,
          ),
      );
      const lineas: THREE.Vector3[] = [];
      for (let i = 0; i < desde.length; i += 1) {
        lineas.push(desde[i], hasta[i]);
      }
      const geometria = new THREE.BufferGeometry().setFromPoints(lineas);
      const guia = new THREE.LineSegments(
        geometria,
        new THREE.LineDashedMaterial({
          color: 0x0ea5e9,
          dashSize: 0.12,
          gapSize: 0.08,
          depthTest: false,
        }),
      );
      guia.computeLineDistances();
      guia.renderOrder = 16;
      grupoLocal.add(guia);
      return;
    }
    if (caraEmpujarHover) {
      const normal = new THREE.Vector3(...caraEmpujarHover.normal).normalize();
      agregarCara(
        caraEmpujarHover.poligono,
        normal,
        0,
        0x2563eb,
        caraEmpujarHover.clasificacion.accion === "ninguna" ? 0.18 : 0.32,
      );
      return;
    }

    const rect =
      empujarRect ??
      (puntosHerramienta[0] && ratonHerramienta
        ? crearRectangulo(puntosHerramienta[0], ratonHerramienta)
        : null);
    if (!rect) return;
    const esquinas = puntosRectangulo(rect);
    const ancho = Math.abs(rect.x2 - rect.x1);
    const largo = Math.abs(rect.y2 - rect.y1);
    if (ancho < 1e-6 || largo < 1e-6) return;
    const cotaPlano = empujarZ ?? zEmpujar;
    const z = cotaPlano + 0.02;
    const clase =
      empujarClasificacion === "auto"
        ? clasificarEmpujar(rect, empujarAltura ?? 0).clase
        : empujarClasificacion;
    const color =
      clase === "losa"
        ? 0x64748b
        : clase === "muro"
          ? 0x2563eb
          : clase === "columna"
            ? 0x16a34a
            : 0xd97706;

    // Relleno translúcido del contorno.
    const relleno = new THREE.BufferGeometry();
    relleno.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          esquinas[0][0], esquinas[0][1], z,
          esquinas[1][0], esquinas[1][1], z,
          esquinas[2][0], esquinas[2][1], z,
          esquinas[0][0], esquinas[0][1], z,
          esquinas[2][0], esquinas[2][1], z,
          esquinas[3][0], esquinas[3][1], z,
        ],
        3,
      ),
    );
    const mallaRelleno = new THREE.Mesh(
      relleno,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    mallaRelleno.renderOrder = 11;
    grupoLocal.add(mallaRelleno);

    const borde = new THREE.BufferGeometry().setFromPoints(
      [...esquinas, esquinas[0]].map(([x, y]) => new THREE.Vector3(x, y, z)),
    );
    const linea = new THREE.Line(
      borde,
      new THREE.LineBasicMaterial({ color, depthTest: false }),
    );
    linea.renderOrder = 14;
    grupoLocal.add(linea);

    const altura = empujarAltura ?? 0;
    if (empujarRect && Math.abs(altura) > 1e-6) {
      const centroX = (rect.x1 + rect.x2) / 2;
      const centroY = (rect.y1 + rect.y2) / 2;
      const cajaSolido = new THREE.BoxGeometry(ancho, largo, Math.abs(altura));
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const solido = new THREE.Mesh(cajaSolido, material);
      solido.position.set(centroX, centroY, cotaPlano + altura / 2);
      solido.renderOrder = 10;
      grupoLocal.add(solido);
      const aristas = new THREE.LineSegments(
        new THREE.EdgesGeometry(cajaSolido),
        new THREE.LineBasicMaterial({ color, depthTest: false }),
      );
      aristas.position.copy(solido.position);
      aristas.renderOrder = 15;
      grupoLocal.add(aristas);
      // Línea de altura en la primera esquina.
      const vertical = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(esquinas[0][0], esquinas[0][1], cotaPlano),
        new THREE.Vector3(esquinas[0][0], esquinas[0][1], cotaPlano + altura),
      ]);
      const lineaAltura = new THREE.Line(
        vertical,
        new THREE.LineDashedMaterial({
          color,
          dashSize: 0.12,
          gapSize: 0.08,
          depthTest: false,
        }),
      );
      lineaAltura.computeLineDistances();
      lineaAltura.renderOrder = 16;
      grupoLocal.add(lineaAltura);
    }
  }, [
    herramienta,
    vista.tipo,
    empujarRect,
    empujarAltura,
    empujarClasificacion,
    puntosHerramienta,
    ratonHerramienta,
    zEmpujar,
    empujarZ,
    empujarCara,
    caraEmpujarHover,
  ]);

  return {
    ...c,

  };
}
