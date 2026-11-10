/* eslint-disable react-hooks/immutability -- los refs del visor son mutables por diseño. */
import * as THREE from "three";
import { accionRuedaConShift } from "../orbita";
import { debeIgnorarGestoNativo, factorGestoZoom } from "@/lib/gestos";
import { detectorRueda, factorZoomRueda, type EventoGrabado, type TipoEventoGrabado } from "@/lib/rueda";
import { diagonalCaja } from "../vistas";
import { listen } from "@tauri-apps/api/event";
import { mmAPx } from "../estilos";
import { useEffect } from "react";

import { useControlesVisor } from "./useControlesVisor";
import { ARRIBA } from "./camara";
export function useRuedaVisor(c: ReturnType<typeof useControlesVisor>) {
  const {
    contenedor,
    camara,
    grosores,
    navegacion,
    preferenciaRueda,
    fijarDetectado,
    grabando,
    grabacionRef,
    temporizadorGrabacion,
    actualizarGrosoresRef,
    ultimoWheelCtrlRef,
    distanciaGestoRef,
    toquesNativosRef,
    vista,
    detenerGrabacion,
    cajaVista,
    aplicarCamara,
    aplicarZoom,
  } = c;

  useEffect(() => {
    const nodo = contenedor.current;
    if (!nodo) return;
    const actualizarGrosores = () => {
      const camera = camara.current;
      if (!camera) return;
      const alto = Math.max(nodo.clientHeight, 1);
      const ancho = Math.max(nodo.clientWidth, 1);
      let mundoPorPx = diagonalCaja(cajaVista) / alto;
      if (camera instanceof THREE.OrthographicCamera) {
        mundoPorPx = Math.max((camera.top - camera.bottom) / alto, 1e-6);
      } else if (camera instanceof THREE.PerspectiveCamera) {
        const nav = navegacion.current;
        mundoPorPx = Math.max(
          (2 * (nav?.distancia ?? 10) * Math.tan((camera.fov * Math.PI) / 360)) / alto,
          1e-6,
        );
      }
      for (const entrada of grosores.current) {
        entrada.material.linewidth = Math.max(
          mmAPx(entrada.mm, entrada.escala, mundoPorPx),
          0.8,
        );
        entrada.material.resolution.set(ancho, alto);
      }
    };
    actualizarGrosoresRef.current = actualizarGrosores;
    const escalaActual = () => {
      const camera = camara.current;
      const nav = navegacion.current;
      if (!camera || !nav) return undefined;
      if (camera instanceof THREE.OrthographicCamera) return camera.top - camera.bottom;
      if (camera instanceof THREE.PerspectiveCamera) return nav.distancia;
      return undefined;
    };
    const alRodar = (evento: WheelEvent) => {
      evento.preventDefault();
      // O018: si el pellizco llega como wheel con Ctrl, el gesto nativo se ignora.
      if (evento.ctrlKey) ultimoWheelCtrlRef.current = performance.now();
      const camera = camara.current;
      const nav = navegacion.current;
      if (!camera || !nav) return;
      const accion = detectorRueda.clasificar(evento, preferenciaRueda);
      const dispositivo = detectorRueda.ultimoDispositivo();
      if (dispositivo) fijarDetectado(dispositivo);
      const escalaAntes = escalaActual();
      const factor = accion === "zoom" ? factorZoomRueda(evento, dispositivo) : undefined;
      if (accion === "zoom" && factor !== undefined) {
        aplicarZoom(factor, { x: evento.clientX, y: evento.clientY });
      } else {
        // O006e: en 3D, Shift + dos dedos orbita; en planta panea en horizontal.
        // O020: orbita con cualquier dispositivo detectado (el touchpad ELAN se
        // confunde con ratón y antes solo paneaba).
        const es3d = vista.tipo === "iso" || vista.tipo === "perspectiva";
        if (evento.shiftKey && accionRuedaConShift(es3d) === "orbitar") {
          const yaw = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 0, 1),
            (evento.deltaX || evento.deltaY) * 0.006,
          );
          nav.direccion.applyQuaternion(yaw);
          const derecha = new THREE.Vector3().crossVectors(ARRIBA, nav.direccion).normalize();
          const pitch = new THREE.Quaternion().setFromAxisAngle(
            derecha,
            evento.deltaY * 0.006,
          );
          nav.direccion.applyQuaternion(pitch).normalize();
          if (nav.direccion.z < 0.05) {
            nav.direccion.z = 0.05;
            nav.direccion.normalize();
          }
        } else {
          const alto = Math.max(nodo.clientHeight, 1);
          let escala = 1;
          if (camera instanceof THREE.OrthographicCamera) {
            escala = Math.max((camera.top - camera.bottom) / alto, 1e-6);
          } else if (camera instanceof THREE.PerspectiveCamera) {
            escala =
              (2 * nav.distancia * Math.tan((camera.fov * Math.PI) / 360)) / alto;
          }
          const dx =
            accion === "paneo-horizontal"
              ? evento.deltaX || evento.deltaY
              : evento.deltaX;
          const dy = accion === "paneo-horizontal" ? 0 : evento.deltaY;
          const derecha = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
          const arriba = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
          nav.objetivo
            .add(derecha.multiplyScalar(dx * escala))
            .add(arriba.multiplyScalar(-dy * escala));
        }
      }
      aplicarCamara();
      actualizarGrosores();
      // O017b: el diagnóstico guarda la escala real antes y después de este zoom.
      const grabacion = grabacionRef.current;
      if (grabacion && grabacion.eventos.length < 5000) {
        grabacion.eventos.push({
          t: performance.now() - grabacion.inicio,
          tipo: "wheel",
          ctrlKey: evento.ctrlKey,
          shiftKey: evento.shiftKey,
          deltaX: evento.deltaX,
          deltaY: evento.deltaY,
          deltaMode: evento.deltaMode,
          accion,
          dispositivo: dispositivo ?? undefined,
          factor,
          escalaAntes: accion === "zoom" ? escalaAntes : undefined,
          escalaDespues: accion === "zoom" ? escalaActual() : undefined,
        });
      }
    };
    nodo.addEventListener("wheel", alRodar, { passive: false });
    return () => nodo.removeEventListener("wheel", alRodar);
  }, [
    aplicarCamara,
    aplicarZoom,
    cajaVista,
    preferenciaRueda,
    fijarDetectado,
    vista.tipo,
  ]);

  // O017b: grabación de 10 s con puntero, toques y Control. Los `wheel` los
  // registra `alRodar` para poder anotar la escala antes y después del zoom.
  useEffect(() => {
    if (!grabando) return;
    const grabacion = grabacionRef.current ?? { inicio: performance.now(), eventos: [] };
    grabacionRef.current = grabacion;
    const registrar = (tipo: TipoEventoGrabado, evento: Event) => {
      if (grabacion.eventos.length >= 5000) return;
      const base: EventoGrabado = {
        t: performance.now() - grabacion.inicio,
        tipo,
        ctrlKey: Boolean((evento as MouseEvent).ctrlKey),
        shiftKey: Boolean((evento as MouseEvent).shiftKey),
      };
      if (tipo.startsWith("pointer")) {
        base.pointerType = (evento as PointerEvent).pointerType;
      } else if (tipo.startsWith("touch")) {
        base.toques = (evento as TouchEvent).touches?.length ?? 0;
      } else if (tipo.startsWith("key")) {
        base.key = (evento as KeyboardEvent).key;
      }
      grabacion.eventos.push(base);
    };
    const opciones: AddEventListenerOptions = { capture: true, passive: true };
    const tipos: TipoEventoGrabado[] = [
      "pointerdown",
      "pointermove",
      "pointerup",
      "touchstart",
      "touchmove",
      "touchend",
    ];
    const alPuntero = (evento: Event) => registrar(evento.type as TipoEventoGrabado, evento);
    for (const tipo of tipos) window.addEventListener(tipo, alPuntero, opciones);
    const alTecla = (evento: Event) => {
      const tecla = evento as KeyboardEvent;
      if (tecla.key !== "Control") return;
      registrar(tecla.type === "keydown" ? "keydown" : "keyup", tecla);
    };
    window.addEventListener("keydown", alTecla, opciones);
    window.addEventListener("keyup", alTecla, opciones);
    temporizadorGrabacion.current = window.setTimeout(() => detenerGrabacion(), 10_000);
    return () => {
      if (temporizadorGrabacion.current !== null) {
        window.clearTimeout(temporizadorGrabacion.current);
        temporizadorGrabacion.current = null;
      }
      for (const tipo of tipos) window.removeEventListener(tipo, alPuntero, opciones);
      window.removeEventListener("keydown", alTecla, opciones);
      window.removeEventListener("keyup", alTecla, opciones);
    };
  }, [grabando, detenerGrabacion]);

  // O018: gestos que Windows entrega por la escucha nativa. Se registran en la
  // grabación como `nativo:<mensaje>` y, si nadie los duplicó con Ctrl + rueda,
  // mueven el zoom con la misma `aplicarZoom` de la rueda.
  useEffect(() => {
    interface CargaGestoNativo {
      ms: number;
      ventana: string;
      mensaje: string;
      detalle?: Record<string, unknown>;
    }
    const puntoDelDetalle = (detalle: Record<string, unknown> | undefined) => {
      const x = Number(detalle?.x);
      const y = Number(detalle?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y) || (x === 0 && y === 0)) {
        return undefined;
      }
      // Windows entrega píxeles físicos de pantalla; el visor usa píxeles CSS.
      const dpr = window.devicePixelRatio || 1;
      return { x: x / dpr - window.screenX, y: y / dpr - window.screenY };
    };
    const manejar = (carga: CargaGestoNativo) => {
      const { mensaje, detalle, ventana } = carga;
      const grabacion = grabacionRef.current;
      if (grabacion && grabacion.eventos.length < 5000) {
        grabacion.eventos.push({
          t: performance.now() - grabacion.inicio,
          tipo: `nativo:${mensaje}`,
          ctrlKey: Boolean(detalle?.control),
          shiftKey: false,
          ventana,
          detalle,
        });
      }
      const ahora = performance.now();
      if (mensaje.startsWith("WM_MOUSEWHEEL") || mensaje.startsWith("WM_MOUSEHWHEEL")) {
        if (detalle?.control) ultimoWheelCtrlRef.current = ahora;
        return;
      }
      if (mensaje === "GID_ZOOM") {
        const actual = Number(detalle?.ullArguments);
        const flags = Number(detalle?.flags ?? 0);
        if (flags & 1) distanciaGestoRef.current = null;
        const anterior = distanciaGestoRef.current;
        distanciaGestoRef.current = actual > 0 ? actual : null;
        if (anterior === null) return;
        const factor = factorGestoZoom(anterior, actual);
        if (factor === 1 || debeIgnorarGestoNativo(ultimoWheelCtrlRef.current, ahora)) {
          return;
        }
        aplicarZoom(1 / factor, puntoDelDetalle(detalle));
        return;
      }
      if (!mensaje.startsWith("WM_POINTER")) return;
      if (mensaje === "WM_POINTERUP") {
        toquesNativosRef.current.delete(Number(detalle?.pointerId));
        distanciaGestoRef.current = null;
        return;
      }
      if (detalle?.tipo !== "touchpad") return;
      const id = Number(detalle?.pointerId);
      const x = Number(detalle?.x) || 0;
      const y = Number(detalle?.y) || 0;
      toquesNativosRef.current.set(id, { x, y });
      if (toquesNativosRef.current.size !== 2) {
        distanciaGestoRef.current = null;
        return;
      }
      const [a, b] = [...toquesNativosRef.current.values()];
      const distancia = Math.hypot(a.x - b.x, a.y - b.y);
      const anterior = distanciaGestoRef.current;
      distanciaGestoRef.current = distancia > 0 ? distancia : null;
      if (anterior === null) return;
      const factor = factorGestoZoom(anterior, distancia);
      if (factor === 1 || debeIgnorarGestoNativo(ultimoWheelCtrlRef.current, ahora)) {
        return;
      }
      aplicarZoom(1 / factor, puntoDelDetalle(detalle));
    };
    let vivo = true;
    let quitar: (() => void) | undefined;
    listen<CargaGestoNativo>("gesto-nativo", (evento) => manejar(evento.payload))
      .then((desuscribir) => {
        if (vivo) quitar = desuscribir;
        else desuscribir();
      })
      .catch(() => {
        /* fuera de Tauri (vitest) no hay bus de eventos */
      });
    return () => {
      vivo = false;
      quitar?.();
    };
  }, [aplicarZoom]);

  return {
    ...c,

  };
}
