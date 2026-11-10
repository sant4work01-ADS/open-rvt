/* eslint-disable react-hooks/immutability -- los refs del visor son mutables por diseño. */
import * as THREE from "three";
import { ajustarAspecto, camaraOrtografica } from "../vistas";
import { crearCamaraDeVista, crearNavegacion } from "./camara";
import { parsearCota, parsearElevacion } from "../cotas";
import {  } from "./anotaciones";
import {  } from "../inferencias3d";
import { useCallback, useEffect, useRef } from "react";

import { useHerramientaVisor } from "./useHerramientaVisor";
export function useControlesVisor(c: ReturnType<typeof useHerramientaVisor>) {
  const {
    contenedor,
    camara,
    bloqueoFlechas,
    bloqueoShift,
    ultimaInferenciaEmpujar,
    setMarcadorEmpujar,
    setGuiaEmpujar,
    setCaraEmpujarHover,
    navegacion,
    vistaDeCamara,
    herramienta,
    puntosHerramienta,
    empujarRect,
    empujarCara,
    ajustarToken,
    setZoomTick,
    cotaEditando,
    setCotaEditando,
    textoCotaEditando,
    setErrorCota,
    moverSiguientes,
    separarEjes,
    editarRebase,
    separarNiveles,
    editarNivel,
    vista,
    cajaVista,
    aplicarCamara,
  } = c;

  useEffect(() => {
    if (
      herramienta !== "empujar" ||
      (puntosHerramienta.length === 0 && !empujarRect && !empujarCara)
    ) {
      ultimaInferenciaEmpujar.current = null;
      bloqueoFlechas.current = null;
      bloqueoShift.current = null;
      const id = setTimeout(() => {
        setMarcadorEmpujar(null);
        setGuiaEmpujar(null);
        setCaraEmpujarHover(null);
      }, 0);
      return () => clearTimeout(id);
    }
  }, [herramienta, puntosHerramienta.length, empujarRect, empujarCara]);

  // Ajustar la cámara a la vista (botón y F). Es la única acción que reencuadra.
  const ajustar = useCallback(() => {
    const nodo = contenedor.current;
    if (!nodo) return;
    const aspecto = Math.max(nodo.clientWidth, 1) / Math.max(nodo.clientHeight, 1);
    const nav = crearNavegacion(vista, cajaVista, aspecto);
    navegacion.current = nav;
    vistaDeCamara.current = vista.id;
    camara.current = crearCamaraDeVista(vista, cajaVista, aspecto, nav);
    aplicarCamara();
  }, [aplicarCamara, vista, cajaVista]);

  // O038: el árbol pide «Ajustar» con el doble clic; la primera vez no dispara.
  const ajustarTokenPrevio = useRef(ajustarToken);
  useEffect(() => {
    if (ajustarToken === ajustarTokenPrevio.current) return;
    ajustarTokenPrevio.current = ajustarToken;
    ajustar();
  }, [ajustarToken, ajustar]);

  // O006d: zoom con + y − desde el teclado, centrado en la vista.
  const zoomEnCentro = useCallback(
    (factor: number) => {
      const camera = camara.current;
      const nav = navegacion.current;
      if (!camera || !nav) return;
      if (camera instanceof THREE.OrthographicCamera) {
        camera.left *= factor;
        camera.right *= factor;
        camera.top *= factor;
        camera.bottom *= factor;
        camera.updateProjectionMatrix();
      } else if (camera instanceof THREE.PerspectiveCamera) {
        nav.distancia = Math.max(0.5, nav.distancia * factor);
      }
      aplicarCamara();
      setZoomTick((tick) => tick + 1);
    },
    [aplicarCamara],
  );

  // O030: 100 % de papel: 1 mm de papel mide 1 mm en pantalla (96 px/pulgada CSS).
  const zoomAl100 = useCallback(() => {
    const camera = camara.current;
    const nodo = contenedor.current;
    if (!(camera instanceof THREE.OrthographicCamera) || !nodo) return;
    const altoPx = Math.max(nodo.clientHeight, 1);
    const mundoPorPx = (vista.escala / 1000) * (25.4 / 96);
    const altoActual = camera.top - camera.bottom;
    if (!(altoActual > 0)) return;
    const factor = (mundoPorPx * altoPx) / altoActual;
    zoomEnCentro(factor);
  }, [vista.escala, zoomEnCentro]);

  const restablecerIso = useCallback(() => {    const nav = navegacion.current;
    if (!nav) return;
    nav.direccion.copy(nav.inicial.direccion);
    nav.objetivo.copy(nav.inicial.objetivo);
    nav.distancia = nav.inicial.distancia;
    const camera = camara.current;
    if (camera instanceof THREE.OrthographicCamera) {
      const nodo = contenedor.current;
      const aspecto = nodo
        ? Math.max(nodo.clientWidth, 1) / Math.max(nodo.clientHeight, 1)
        : 1;
      const inicial = crearNavegacion(vista, cajaVista, aspecto);
      const limites = ajustarAspecto(
        camaraOrtografica(cajaVista, [nav.direccion.x, nav.direccion.y, nav.direccion.z]),
        aspecto,
      );
      camera.left = limites.izquierda;
      camera.right = limites.derecha;
      camera.top = limites.arriba;
      camera.bottom = limites.abajo;
      nav.distancia = inicial.distancia;
    }
    aplicarCamara();
  }, [aplicarCamara, cajaVista, vista]);

  const confirmarCota = async () => {
    if (!cotaEditando) return;
    const valor =
      cotaEditando.tipo === "elevacion"
        ? parsearElevacion(textoCotaEditando)
        : parsearCota(textoCotaEditando);
    if (valor === null) {
      setErrorCota(
        cotaEditando.tipo === "elevacion"
          ? "Cota no válida: use .1, 0,1, 10cm, 100mm o un número negativo."
          : "Cota no válida: use .15, 0,15, 15cm o 150mm (mayor que cero).",
      );
      return;
    }
    setErrorCota(null);
    const edicion = cotaEditando;
    setCotaEditando(null);
    if (edicion.tipo === "parcial" && edicion.referencia && edicion.mover) {
      await separarEjes(edicion.referencia, edicion.mover, valor, moverSiguientes);
    } else if (edicion.tipo === "rebase") {
      await editarRebase(valor);
    } else if (edicion.tipo === "nivel" && edicion.referencia && edicion.mover) {
      await separarNiveles(edicion.referencia, edicion.mover, valor, moverSiguientes);
    } else if (edicion.tipo === "elevacion" && edicion.nivel && edicion.nombre) {
      await editarNivel(edicion.nivel, edicion.nombre, valor);
    }
  };

  return {
    ...c,
    ajustar,
    ajustarTokenPrevio,
    zoomEnCentro,
    zoomAl100,
    restablecerIso,
    confirmarCota,
  };
}
