/* eslint-disable react-hooks/immutability -- los refs del visor son mutables por diseño. */
import * as THREE from "three";
import { mmAMundo } from "../estilos";
import {  } from "../asasLosa";
import { type LadoEje } from "../ejesVista";
import { useEffect } from "react";
import { useModelo } from "../estado";

import { useRuedaVisor } from "./useRuedaVisor";
export function useOverlaysVisor(c: ReturnType<typeof useRuedaVisor>) {
  const {
    contenedor,
    camara,
    grupo,
    herramienta,
    oscuro,
    cotasInteraccion,
    anotacionesAlzado,
    asasLosa,
    ejesInteraccion,
    lineasEje,
    lineasNivelRef,
    burbujasEje,
    asasNivel,
    vista,
    estilos,
    modoCorte,
    pantallaDePunto,
    zoomEnCentro,
  } = c;

  useEffect(() => {
    const nodo = contenedor.current;
    if (nodo) nodo.style.cursor = modoCorte || herramienta ? "crosshair" : "";
  }, [modoCorte, herramienta]);

  // Utilidad de las pruebas E2E: proyecta un punto del modelo a coordenadas de pantalla.
  useEffect(() => {
    const nodo = contenedor.current;
    if (!nodo) return;
    (nodo as unknown as Record<string, unknown>).__openrvtMundoAPantalla = (
      x: number,
      y: number,
      z = 0,
    ) => {
      const camera = camara.current;
      if (!camera) return null;
      camera.updateMatrixWorld();
      const punto = new THREE.Vector3(x, y, z).project(camera);
      const rect = nodo.getBoundingClientRect();
      return {
        x: rect.left + ((punto.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - punto.y) / 2) * rect.height,
      };
    };
    // O049: estado vivo de la herramienta para las pruebas E2E (puntos 2D y cota).
    (nodo as unknown as Record<string, unknown>).__openrvtEmpujar = () => {
      const estado = useModelo.getState();
      return {
        z: estado.empujarZ,
        puntos: estado.puntosHerramienta,
        rect: estado.empujarRect,
        altura: estado.empujarAltura,
        cara: estado.empujarCara,
      };
    };
    // O014b: asa en pantalla de la cabeza de un nivel (para arrastrarla en E2E).
    (nodo as unknown as Record<string, unknown>).__openrvtNivelAPantalla = (
      globalid: string,
    ) => {
      const asa = asasNivel.current.find((a) => a.globalid === globalid);
      if (!asa) return null;
      return pantallaDePunto(asa.punto);
    };
    // O034: asas de borde de losa en pantalla (índice de borde del pset).
    (nodo as unknown as Record<string, unknown>).__openrvtAsaLosaAPantalla = (
      indice: number,
    ) => {
      const asa = asasLosa.current.find((a) => a.indice === indice);
      if (!asa) return null;
      return pantallaDePunto(asa.punto);
    };
    (nodo as unknown as Record<string, unknown>).__openrvtAsasLosa = () =>
      asasLosa.current.map((a) => ({
        indice: a.indice,
        medio: a.medio,
        normal: a.normal,
        desfase: a.desfase,
      }));
    // O026: mover un eje desde la E2E por el mismo comando que la interfaz.
    (nodo as unknown as Record<string, unknown>).__openrvtMoverEje = (
      globalid: string,
      desplazamiento: number,
    ) => useModelo.getState().moverEje(globalid, desplazamiento);
    // O011: posición en pantalla de un globo o extremo de eje (para las E2E).
    (nodo as unknown as Record<string, unknown>).__openrvtEjeAPantalla = (
      etiqueta: string,
      lado: LadoEje = "fin",
      indiceCodo?: number,
      tipoAsa?: "globo" | "base",
    ) => {
      const camera = camara.current;
      if (!camera) return null;
      const asa = ejesInteraccion.current.find((a) => {
        // WebDriver envía `undefined` como null: ambos significan «sin codo».
        if (indiceCodo !== undefined && indiceCodo !== null) {
          return (
            a.etiqueta === etiqueta &&
            a.lado === lado &&
            a.tipo === "codo" &&
            a.indice === indiceCodo
          );
        }
        if (a.etiqueta !== etiqueta || a.lado !== lado || a.tipo === "codo") return false;
        // O031: con globos desplazados, la asa «globo» ya no sirve para arrastrar
        // el extremo real; las pruebas piden explícitamente la asa «base».
        return tipoAsa === undefined || a.tipo === tipoAsa;
      });
      if (!asa) return null;
      camera.updateMatrixWorld();
      const punto = new THREE.Vector3(...asa.punto).project(camera);
      const rect = nodo.getBoundingClientRect();
      return {
        x: rect.left + ((punto.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - punto.y) / 2) * rect.height,
      };
    };
    // O011: centro y radio en pantalla del globo, para medir la nitidez del borde.
    (nodo as unknown as Record<string, unknown>).__openrvtEjeBurbujaPantalla = (
      etiqueta: string,
    ) => {
      const camera = camara.current;
      if (!camera) return null;
      // O042: el globo con codo ya no tiene asa; se mide su grupo dibujado para
      // que las capturas y las pruebas sigan viendo el centro real.
      const burbuja = burbujasEje.current.find((b) => b.etiqueta === etiqueta);
      if (!burbuja) return null;
      camera.updateMatrixWorld();
      const centro = burbuja.grupo.position.clone();
      const radioMundo = mmAMundo(8, vista.escala) / 2;
      const derecha = new THREE.Vector3()
        .setFromMatrixColumn(camera.matrixWorld, 0)
        .normalize()
        .multiplyScalar(radioMundo);
      const borde = centro.clone().add(derecha);
      const pc = centro.clone().project(camera);
      const pb = borde.clone().project(camera);
      const rect = nodo.getBoundingClientRect();
      const x = rect.left + ((pc.x + 1) / 2) * rect.width;
      const y = rect.top + ((1 - pc.y) / 2) * rect.height;
      const xb = rect.left + ((pb.x + 1) / 2) * rect.width;
      const yb = rect.top + ((1 - pb.y) / 2) * rect.height;
      return {
        x,
        y,
        radio: Math.hypot(xb - x, yb - y),
        anchoVentana: window.innerWidth,
        altoVentana: window.innerHeight,
        dpr: window.devicePixelRatio || 1,
        colorAnillo: oscuro ? "#e0b07a" : estilos.categorias.ejes.color,
        colorFondo: oscuro ? "#1f2328" : "#ffffff",
      };
    };
    // O021: caja en pantalla del texto real del globo y desviación de su centro
    // respecto del centro del globo (para medir el centrado con 1, 2 o 3 caracteres).
    (nodo as unknown as Record<string, unknown>).__openrvtEjeTextoGloboPantalla = (
      etiqueta: string,
    ) => {
      const camera = camara.current;
      if (!camera) return null;
      const entrada = burbujasEje.current.find((b) => b.etiqueta === etiqueta);
      if (!entrada) return null;
      const texto = entrada.grupo.children.find(
        (hijo) => (hijo as THREE.Object3D & { text?: string }).text !== undefined,
      ) as (THREE.Mesh & { textRenderInfo?: { visibleBounds?: [number, number, number, number] } }) | undefined;
      if (!texto) return null;
      camera.updateMatrixWorld();
      entrada.grupo.updateMatrixWorld(true);
      const rect = nodo.getBoundingClientRect();
      if (!texto.geometry) return null;
      texto.geometry.computeBoundingBox();
      const caja = texto.geometry.boundingBox;
      if (!caja) return null;
      const cajaLocal = {
        x0: caja.min.x + texto.position.x,
        x1: caja.max.x + texto.position.x,
        y0: caja.min.y + texto.position.y,
        y1: caja.max.y + texto.position.y,
      };
      const puntos: Array<{ x: number; y: number }> = [];
      for (const x of [cajaLocal.x0, cajaLocal.x1]) {
        for (const y of [cajaLocal.y0, cajaLocal.y1]) {
          const p = new THREE.Vector3(x, y, texto.position.z).applyMatrix4(texto.matrixWorld).project(camera);
          puntos.push({
            x: rect.left + ((p.x + 1) / 2) * rect.width,
            y: rect.top + ((1 - p.y) / 2) * rect.height,
          });
        }
      }
      const mundoGlobo = new THREE.Vector3();
      entrada.grupo.getWorldPosition(mundoGlobo);
      const centroGlobo = pantallaDePunto([mundoGlobo.x, mundoGlobo.y, mundoGlobo.z]);
      if (!centroGlobo) return null;
      const x0 = Math.min(...puntos.map((p) => p.x));
      const x1 = Math.max(...puntos.map((p) => p.x));
      const y0 = Math.min(...puntos.map((p) => p.y));
      const y1 = Math.max(...puntos.map((p) => p.y));
      return {
        etiqueta,
        x0,
        y0,
        x1,
        y1,
        centro: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 },
        centroGlobo,
        desviacion: Math.hypot((x0 + x1) / 2 - centroGlobo.x, (y0 + y1) / 2 - centroGlobo.y),
      };
    };
    // O011b: rectángulos de etiquetas, globos y líneas de eje en pantalla, para
    // comprobar que nada se encima en el alzado.
    (nodo as unknown as Record<string, unknown>).__openrvtAlzadoAnotacionesPantalla = () => {
      const camera = camara.current;
      if (!camera) return null;
      camera.updateMatrixWorld();
      const rect = nodo.getBoundingClientRect();
      const proyectar = (x: number, y: number, z: number) => {
        const punto = new THREE.Vector3(x, y, z).project(camera);
        return {
          x: rect.left + ((punto.x + 1) / 2) * rect.width,
          y: rect.top + ((1 - punto.y) / 2) * rect.height,
        };
      };
      const etiquetas = anotacionesAlzado.current.map((anotacion) => {
        const [x, y, z] = anotacion.centro;
        const hw = anotacion.ancho / 2;
        const hh = anotacion.alto / 2;
        const esquinas = [
          proyectar(x - anotacion.h[0] * hw, y - anotacion.h[1] * hw, z + hh),
          proyectar(x + anotacion.h[0] * hw, y + anotacion.h[1] * hw, z + hh),
          proyectar(x + anotacion.h[0] * hw, y + anotacion.h[1] * hw, z - hh),
          proyectar(x - anotacion.h[0] * hw, y - anotacion.h[1] * hw, z - hh),
        ];
        return {
          tipo: anotacion.tipo,
          texto: anotacion.texto,
          x0: Math.min(...esquinas.map((p) => p.x)),
          y0: Math.min(...esquinas.map((p) => p.y)),
          x1: Math.max(...esquinas.map((p) => p.x)),
          y1: Math.max(...esquinas.map((p) => p.y)),
        };
      });
      const globos = ejesInteraccion.current
        .filter((asa) => asa.tipo === "globo")
        .map((asa) => {
          const centro = new THREE.Vector3(...asa.punto);
          const radioMundo = mmAMundo(8, vista.escala) / 2;
          const derecha = new THREE.Vector3()
            .setFromMatrixColumn(camera.matrixWorld, 0)
            .normalize()
            .multiplyScalar(radioMundo);
          const borde = centro.clone().add(derecha);
          const pc = centro.clone().project(camera);
          const pb = borde.clone().project(camera);
          return {
            etiqueta: asa.etiqueta,
            x: rect.left + ((pc.x + 1) / 2) * rect.width,
            y: rect.top + ((1 - pc.y) / 2) * rect.height,
            radio: Math.hypot(
              ((pb.x - pc.x) / 2) * rect.width,
              ((pc.y - pb.y) / 2) * rect.height,
            ),
          };
        });
      const lineas = lineasEje.current.map((linea) => ({
        etiqueta: linea.etiqueta,
        puntos: linea.puntos.map(([x, y, z]) => proyectar(x, y, z)),
      }));
      const lineasNivel = lineasNivelRef.current.map((linea) => ({
        tipo: linea.tipo,
        elev: linea.elev,
        puntos: linea.puntos.map(([x, y, z]) => proyectar(x, y, z)),
      }));
      return { etiquetas, globos, lineas, lineasNivel };
    };
    // Utilidad de las E2E: acercar o alejar por un factor exacto (0.125 = ×8).
    (nodo as unknown as Record<string, unknown>).__openrvtZoom = (factor: number) => {
      zoomEnCentro(factor);
    };
    // Punto medio de la línea del eje (para seleccionarlo con un clic).
    (nodo as unknown as Record<string, unknown>).__openrvtEjeLineaAPantalla = (
      etiqueta: string,
    ) => {
      const camera = camara.current;
      if (!camera) return null;
      const linea = lineasEje.current.find((l) => l.etiqueta === etiqueta);
      if (!linea || linea.puntos.length === 0) return null;
      const medio = linea.puntos[Math.floor(linea.puntos.length / 2)];
      camera.updateMatrixWorld();
      const punto = new THREE.Vector3(...medio).project(camera);
      const rect = nodo.getBoundingClientRect();
      return {
        x: rect.left + ((punto.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - punto.y) / 2) * rect.height,
      };
    };
    // O012: cuenta las aristas dibujadas dentro de una caja del modelo (E2E de uniones).
    (nodo as unknown as Record<string, unknown>).__openrvtAristasEnCaja = (
      minimo: [number, number, number],
      maximo: [number, number, number],
    ) => {
      const grupoActual = grupo.current;
      if (!grupoActual) return 0;
      let total = 0;
      grupoActual.traverse((objeto) => {
        const lineas = objeto as THREE.LineSegments;
        if (!lineas.isLineSegments || !lineas.userData.globalid) return;
        const posiciones = lineas.geometry?.getAttribute("position");
        if (!posiciones) return;
        for (let i = 0; i + 1 < posiciones.count; i += 2) {
          const x = (posiciones.getX(i) + posiciones.getX(i + 1)) / 2;
          const y = (posiciones.getY(i) + posiciones.getY(i + 1)) / 2;
          const z = (posiciones.getZ(i) + posiciones.getZ(i + 1)) / 2;
          const dentro =
            x >= minimo[0] - 1e-6 && x <= maximo[0] + 1e-6 &&
            y >= minimo[1] - 1e-6 && y <= maximo[1] + 1e-6 &&
            z >= minimo[2] - 1e-6 && z <= maximo[2] + 1e-6;
          if (dentro) total += 1;
        }
      });
      return total;
    };
    // O019: cuenta las aristas verticales únicas dibujadas (E2E de esquinas en 3D).
    // Deduplica por posición: dos muros ingleteados comparten la misma vertical.
    (nodo as unknown as Record<string, unknown>).__openrvtAristasVerticales = (
      detalle = false,
    ) => {
      const grupoActual = grupo.current;
      if (!grupoActual) return 0;
      const vistas = new Set<string>();
      grupoActual.traverse((objeto) => {
        const lineas = objeto as THREE.LineSegments;
        if (!lineas.isLineSegments || !lineas.userData.globalid) return;
        const posiciones = lineas.geometry?.getAttribute("position");
        if (!posiciones) return;
        for (let i = 0; i + 1 < posiciones.count; i += 2) {
          const x1 = posiciones.getX(i);
          const y1 = posiciones.getY(i);
          const z1 = posiciones.getZ(i);
          const x2 = posiciones.getX(i + 1);
          const y2 = posiciones.getY(i + 1);
          const z2 = posiciones.getZ(i + 1);
          if (Math.abs(x2 - x1) > 1e-4 || Math.abs(y2 - y1) > 1e-4) continue;
          if (Math.abs(z2 - z1) < 1e-4) continue;
          vistas.add(
            [x1, y1, Math.min(z1, z2), Math.max(z1, z2)]
              .map((valor) => valor.toFixed(4))
              .join(","),
          );
        }
      });
      return detalle ? [...vistas] : vistas.size;
    };
    // O006a: posición en pantalla de un texto de cota (para el doble clic de las E2E).
    (nodo as unknown as Record<string, unknown>).__openrvtCotaAPantalla = (
      texto: string,
      indice = 0,
    ) => {
      const camera = camara.current;
      if (!camera) return null;
      const candidatas = cotasInteraccion.current.filter((c) => c.texto === texto);
      const cota = candidatas[indice];
      if (!cota) return null;
      camera.updateMatrixWorld();
      const punto = new THREE.Vector3(...cota.punto).project(camera);
      const rect = nodo.getBoundingClientRect();
      return {
        x: rect.left + ((punto.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - punto.y) / 2) * rect.height,
      };
    };
  });

  return {
    ...c,

  };
}
