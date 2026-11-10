/* eslint-disable react-hooks/immutability -- los refs del visor son mutables por diseño. */
import * as THREE from "three";
import { anchoTextoAprox, burbujaEje, textoCota } from "./anotaciones";
import { calcularCotas3d, calcularEjes3d, calcularNiveles3d, conmutadoresAnotaciones3D, elegirEsquinaEtiqueta, elevacionBaseNiveles, notaVisibleEnVista, type Nota } from "../anotaciones3d";
import { calcularFamiliasCotas } from "../cotas";
import { colorDeFondo } from "./camara";
import { useEffect } from "react";

import { usePunteroVisor } from "./usePunteroVisor";
export function useAnotacionesVisor(c: ReturnType<typeof usePunteroVisor>) {
  const {
    contenedor,
    grupo,
    referencias,
    notas,
    notaSeleccionada,
    oscuro,
    dimensiones,
    zoomTick,
    grupoAnotaciones3d,
    orientablesAnot3d,
    setNotasPx,
    ejeSeleccionado,
    mundoPorPxRef,
    ejeSeleccionadoRef,
    vista,
    niveles,
    mallas,
    caja,
    pantallaDePunto,
  } = c;

  useEffect(() => {
    const grupoLocal = grupo.current;
    if (!grupoLocal) return;
    if (grupoAnotaciones3d.current) {
      grupoLocal.remove(grupoAnotaciones3d.current);
      grupoAnotaciones3d.current.traverse((objeto) => {
        const malla = objeto as THREE.Mesh;
        malla.geometry?.dispose?.();
        const material = malla.material;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material?.dispose?.();
      });
    }
    const grupoAnot = new THREE.Group();
    grupoLocal.add(grupoAnot);
    grupoAnotaciones3d.current = grupoAnot;
    orientablesAnot3d.current = [];

    const es3d = vista.tipo === "iso" || vista.tipo === "perspectiva";
    const conmutadores = conmutadoresAnotaciones3D(vista);
    const color = oscuro ? "#e8eaed" : "#1f2328";
    const fondo = colorDeFondo(oscuro).getStyle();
    const mundoPorPx = Math.max(mundoPorPxRef.current, 1e-6);
    const altoTexto = Math.max(mundoPorPx * 12, 0.05);
    const zBase = elevacionBaseNiveles(niveles);

    const agregarLinea = (
      puntos: Array<[number, number, number]>,
      discontinuo = false,
      cerrada = false,
    ) => {
      const geometria = new THREE.BufferGeometry();
      const lista = cerrada ? [...puntos, puntos[0]] : puntos;
      geometria.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(lista.flat(), 3),
      );
      const material = discontinuo
        ? new THREE.LineDashedMaterial({
            color: new THREE.Color(color),
            dashSize: Math.max(mundoPorPx * 8, 0.08),
            gapSize: Math.max(mundoPorPx * 5, 0.05),
            depthTest: false,
            depthWrite: false,
            transparent: true,
          })
        : new THREE.LineBasicMaterial({
            color: new THREE.Color(color),
            depthTest: false,
            depthWrite: false,
            transparent: true,
          });
      const linea = new THREE.Line(geometria, material);
      if (discontinuo) linea.computeLineDistances();
      linea.renderOrder = 19;
      grupoAnot.add(linea);
      return linea;
    };

    const agregarOrientable = (objeto: THREE.Object3D) => {
      grupoAnot.add(objeto);
      orientablesAnot3d.current.push(objeto);
    };

    let globos = 0;
    let nivelesDibujados = 0;
    let cotasDibujadas = 0;
    // O055: cajas en pantalla para comprobar que ninguna etiqueta de nivel choca
    // con un globo de eje ni con otra etiqueta de nivel.
    const globosPx: Array<{ x: number; y: number; ancho: number; alto: number }> = [];
    const etiquetasNivelPx: Array<{ x: number; y: number; ancho: number; alto: number }> = [];

    if (es3d && conmutadores.ejes) {
      const ejes = calcularEjes3d(referencias.ejes, zBase);
      for (const eje of ejes) {
        agregarLinea([eje.inicio, eje.fin]);
        for (const extremo of [eje.inicio, eje.fin]) {
          const globo = burbujaEje(eje.etiqueta, color, fondo);
          if (!globo) continue;
          const diametro = Math.max(mundoPorPx * 22, 0.08);
          globo.scale.setScalar(diametro);
          globo.position.set(...extremo);
          agregarOrientable(globo);
          globos += 1;
          const centro = pantallaDePunto(extremo);
          if (centro) {
            const radio = diametro / (2 * mundoPorPx);
            globosPx.push({
              x: centro.x - radio,
              y: centro.y - radio,
              ancho: radio * 2,
              alto: radio * 2,
            });
          }
        }
      }
    }

    if (es3d && conmutadores.niveles) {
      const visibles = new Set(vista.nivelesVisibles);
      const lista =
        visibles.size === 0
          ? niveles
          : niveles.filter((n) => visibles.has(n.globalid));
      for (const nivel of calcularNiveles3d(lista, caja)) {
        agregarLinea(nivel.esquinas, true, true);
        const etiqueta = textoCota(nivel.texto, color, fondo, altoTexto);
        if (etiqueta) {
          // La caja del rótulo se aproxima con el ancho de `anchoTextoAprox` y el
          // alto real en pantalla, con 2 px de holgura.
          const anchoPx = Math.max(0.1, anchoTextoAprox(nivel.texto, altoTexto)) / mundoPorPx + 2;
          const altoPx = altoTexto / mundoPorPx + 2;
          const candidatas = nivel.esquinasEtiqueta.map((punto) => {
            const centro = pantallaDePunto(punto);
            return {
              x: (centro?.x ?? 0) - anchoPx / 2,
              y: (centro?.y ?? 0) - altoPx / 2,
              ancho: anchoPx,
              alto: altoPx,
            };
          });
          const indice = elegirEsquinaEtiqueta(candidatas, [...globosPx, ...etiquetasNivelPx]);
          etiqueta.position.set(...nivel.esquinasEtiqueta[indice]);
          etiqueta.renderOrder = 22;
          agregarOrientable(etiqueta);
          etiquetasNivelPx.push(candidatas[indice]);
        }
        nivelesDibujados += 1;
      }
    }

    if (es3d && conmutadores.cotas) {
      const familias = calcularFamiliasCotas(referencias.ejes, referencias.reticula);
      for (const cota of calcularCotas3d(familias, zBase)) {
        agregarLinea([cota.inicio, cota.fin]);
        const texto = textoCota(cota.texto, color, fondo, altoTexto * 0.9);
        if (texto) {
          texto.position.set(...cota.textoPos);
          texto.renderOrder = 22;
          agregarOrientable(texto);
        }
        cotasDibujadas += 1;
      }
    }

    // Notas: se ven en todas las vistas donde su punto cae dentro. En 3D respetan
    // la casilla «Notas»; en planta, alzado y corte siempre están encendidas.
    const notasVisiblesPx: Array<{ nota: Nota; x: number; y: number }> = [];
    const nodoVisor = contenedor.current;
    const mostradas: string[] = [];
    if (!es3d || conmutadores.notas) {
      for (const nota of notas) {
        if (!notaVisibleEnVista(nota, vista, caja)) continue;
        const pantalla = pantallaDePunto(nota.posicion);
        if (!pantalla || !nodoVisor) continue;
        const rect = nodoVisor.getBoundingClientRect();
        notasVisiblesPx.push({
          nota,
          x: pantalla.x - rect.left,
          y: pantalla.y - rect.top,
        });
        mostradas.push(nota.globalid);
        // Punto ancla en el mundo, siempre encima de la geometría.
        const ancla = new THREE.Mesh(
          new THREE.SphereGeometry(Math.max(mundoPorPx * 4, 0.015), 12, 8),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(notaSeleccionada === nota.globalid ? "#f59e0b" : "#1f2328"),
            depthTest: false,
            depthWrite: false,
          }),
        );
        ancla.position.set(...nota.posicion);
        ancla.renderOrder = 30;
        grupoAnot.add(ancla);
      }
    }
    setNotasPx(notasVisiblesPx);

    if (nodoVisor) {
      nodoVisor.dataset.globosEjes3d = String(globos);
      nodoVisor.dataset.globosEjesPx = JSON.stringify(globosPx);
      nodoVisor.dataset.etiquetasNivelPx = JSON.stringify(etiquetasNivelPx);
      nodoVisor.dataset.niveles3d = String(nivelesDibujados);
      nodoVisor.dataset.cotas3d = String(cotasDibujadas);
      nodoVisor.dataset.notas3d = String(notasVisiblesPx.length);
      nodoVisor.dataset.notasVisibles = mostradas.join(",");
      nodoVisor.dataset.notasTexto = notasVisiblesPx.map((n) => n.nota.texto).join(" | ");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    vista,
    niveles,
    referencias,
    caja,
    notas,
    oscuro,
    zoomTick,
    dimensiones.alto,
    dimensiones.ancho,
    notaSeleccionada,
    mallas,
  ]);

  // O027: al cambiar de eje seleccionado se muestran solo sus asas (y todas si no
  // hay selección) para que no queden dibujadas tras deseleccionar.
  useEffect(() => {
    ejeSeleccionadoRef.current = ejeSeleccionado;
    for (const objeto of grupo.current?.children ?? []) {
      const asa = objeto.userData?.asaEje as { globalid?: string } | undefined;
      if (asa) {
        // eslint-disable-next-line react-hooks/immutability -- la escena es mutable por diseño
        objeto.visible = ejeSeleccionado === null || asa.globalid === ejeSeleccionado;
      }
    }
  }, [ejeSeleccionado]);

  return {
    ...c,

  };
}
