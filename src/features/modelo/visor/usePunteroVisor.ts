/* eslint-disable react-hooks/immutability -- los refs del visor son mutables por diseño. */
import * as THREE from "three";
import { agregarCodoEje, copiarAjusteEje, fijarExtremoEje, geometriaEje, interseccionesEje, mmPapelAMetros, normalizarAjusteEje, quitarCodoEje, type LadoEje } from "../ejesVista";
import { cajaConEjes, centroCaja, diagonalCaja, direccionAlzado } from "../vistas";
import { colorDeFondo, crearCamaraDeVista, crearNavegacion, normalCorte, type CamaraGuardada } from "./camara";
import { commands } from "@/lib/bindings";
import { crearRendererVisor } from "../visorRenderer";
import { detectorRueda, resumirGrabacion } from "@/lib/rueda";
import { distanciaAEjeParalelo, ejeOrtogonal, restringirEje, type Punto2 } from "../herramientas";
import { elegirDestinoDiagnostico } from "@/lib/dialogos";
import { filtrarPorCercania, unirCandidatos } from "../candidatos3d";
import { inferir, type Vec3 } from "../inferencias3d";
import { orientarAnotacion } from "./anotaciones";
import { redondearVec } from "./utilidades";
import { type AjusteEjeVista } from "../tipos";
import { type CotaInteractiva } from "./tipos";
import {  } from "../anotaciones3d";
import { type Punto3 } from "../seccion";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { useEstadoVisor } from "./useEstadoVisor";
let claveCamaras = "";

export function usePunteroVisor(c: ReturnType<typeof useEstadoVisor>) {
  const {
    contenedor,
    escena,
    renderer,
    camara,
    grupo,
    grupoHerramienta,
    mallas3d,
    cacheCandidatos,
    navegacion,
    camarasGuardadas,
    vistaDeCamara,
    herramienta,
    puntosHerramienta,
    ratonHerramienta,
    referencias,
    ejeLibre,
    oscuro,
    setOscuro,
    dimensiones,
    setDimensiones,
    cotasInteraccion,
    orientablesAnot3d,
    cotaEditando,
    setCotaEditando,
    setTextoCotaEditando,
    setErrorCota,
    candados,
    setCandados,
    ajusteEnCurso,
    dialogoCopiarEje,
    setDialogoCopiarEje,
    asasLosa,
    ejesInteraccion,
    lineasEje,
    lineasNivelRef,
    asasNivel,
    contextoEje,
    fijarAjustesEjes,
    fijarAviso,
    preferenciaRueda,
    setGrabando,
    eventosGrabados,
    setEventosGrabados,
    resumenGrabacion,
    setResumenGrabacion,
    grabacionRef,
    temporizadorGrabacion,
    actualizarGrosoresRef,
    vista,
    vistas,
    niveles,
    mallas,
    caja,
    claveModelo,
  } = c;

  const detenerGrabacion = useCallback(() => {
    const grabacion = grabacionRef.current;
    if (!grabacion) return;
    if (temporizadorGrabacion.current !== null) {
      window.clearTimeout(temporizadorGrabacion.current);
      temporizadorGrabacion.current = null;
    }
    const eventos = [...grabacion.eventos].sort((a, b) => a.t - b.t);
    grabacionRef.current = null;
    setGrabando(false);
    setEventosGrabados(eventos);
    setResumenGrabacion(resumirGrabacion(eventos));
  }, []);

  const iniciarGrabacion = useCallback(() => {
    if (grabacionRef.current) {
      detenerGrabacion();
      return;
    }
    grabacionRef.current = { inicio: performance.now(), eventos: [] };
    setEventosGrabados([]);
    setResumenGrabacion(null);
    setGrabando(true);
  }, [detenerGrabacion]);

  // O017b: exporta la grabación con los ajustes reales de WebView2.
  const exportarDiagnostico = useCallback(async () => {
    const ahora = new Date();
    const dos = (n: number) => String(n).padStart(2, "0");
    const nombre =
      `diagnostico-rueda-${ahora.getFullYear()}${dos(ahora.getMonth() + 1)}` +
      `${dos(ahora.getDate())}-${dos(ahora.getHours())}${dos(ahora.getMinutes())}`;
    const destino = await elegirDestinoDiagnostico(nombre);
    if (!destino) return;
    const version = await commands.versionApp();
    const ajustes = await commands.diagnosticoWebview();
    const datos = {
      version_app: version.status === "ok" ? version.data : null,
      fecha: ahora.toISOString(),
      userAgent: navigator.userAgent,
      devicePixelRatio: window.devicePixelRatio,
      preferencia_rueda: preferenciaRueda,
      dispositivo_detectado: detectorRueda.ultimoDispositivo(),
      ajustes_webview: ajustes.status === "ok" ? ajustes.data : null,
      resumen: resumenGrabacion ?? resumirGrabacion(eventosGrabados),
      eventos: eventosGrabados,
    };
    const respuesta = await commands.guardarTexto(destino, JSON.stringify(datos, null, 2));
    if (respuesta.status === "error") {
      fijarAviso(`No se pudo guardar el diagnóstico: ${respuesta.error.mensaje}`);
    }
  }, [eventosGrabados, fijarAviso, preferenciaRueda, resumenGrabacion]);

  // O046: plano del nivel activo en 3D (la vista 3D no guarda un nivel propio).
  const zEmpujar = useMemo(() => {
    const id = vista.nivel ?? niveles[0]?.globalid;
    return niveles.find((n) => n.globalid === id)?.elevacion ?? 0;
  }, [vista.nivel, niveles]);

  const nivelGlobalidPorNombre = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const nivel of niveles) mapa.set(nivel.nombre, nivel.globalid);
    return mapa;
  }, [niveles]);

  // O011: helpers de anotación de ejes. Las coordenadas de la vista son (x, y) en
  // planta y (s, z) en alzados y cortes; las asas se buscan en pantalla.
  const ajusteActualEje = (globalid: string): AjusteEjeVista | undefined =>
    ajusteEnCurso?.[globalid] ?? vista.ejes?.[globalid];

  const pantallaDePunto = useCallback((
    punto: [number, number, number],
  ): { x: number; y: number } | null => {
    const nodo = contenedor.current;
    const camera = camara.current;
    if (!nodo || !camera) return null;
    camera.updateMatrixWorld();
    const p = new THREE.Vector3(...punto).project(camera);
    const rect = nodo.getBoundingClientRect();
    return {
      x: rect.left + ((p.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - p.y) / 2) * rect.height,
    };
  }, []);

  /** O055: rayo de cámara bajo un punto de la ventana. */
  const rayoDePantalla = useCallback((clientX: number, clientY: number) => {
    const nodo = contenedor.current;
    const camera = camara.current;
    if (!nodo || !camera) return null;
    const rect = nodo.getBoundingClientRect();
    const raton = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const rayo = new THREE.Raycaster();
    rayo.setFromCamera(raton, camera);
    return rayo;
  }, []);

  /**
   * O055: punto 3D de una nota bajo el cursor. En 3D usa las inferencias de O049
   * (caras, aristas y vértices); en planta cae a la elevación del nivel y en
   * alzado/corte sobre el plano de la vista.
   */
  const puntoNotaEn = useCallback(
    (clientX: number, clientY: number): Punto3 | null => {
      const rayo = rayoDePantalla(clientX, clientY);
      if (!rayo) return null;
      const es3d = vista.tipo === "iso" || vista.tipo === "perspectiva";
      const ctx = contextoEje.current;
      if (!es3d && ctx && ctx.tipo === "planta") {
        const nivel = niveles.find((n) => n.globalid === vista.nivel);
        const z = nivel?.elevacion ?? ctx.z;
        const plano = new THREE.Plane(new THREE.Vector3(0, 0, 1), -z);
        const punto = new THREE.Vector3();
        if (!rayo.ray.intersectPlane(plano, punto)) return null;
        return [punto.x, punto.y, z];
      }
      if (!es3d && ctx) {
        const normal = new THREE.Vector3(ctx.d[0], ctx.d[1], 0);
        const plano = new THREE.Plane(normal, -ctx.profundidad);
        const punto = new THREE.Vector3();
        if (!rayo.ray.intersectPlane(plano, punto)) return null;
        return [punto.x, punto.y, punto.z];
      }
      // 3D: candidatos de las mallas visibles cercanas, como Empujar/Tirar.
      const nodo = contenedor.current;
      if (!nodo) return null;
      const rect = nodo.getBoundingClientRect();
      const proyectar = (p: Vec3) => {
        const camera = camara.current!;
        camera.updateMatrixWorld();
        const v = new THREE.Vector3(p.x, p.y, p.z).project(camera);
        return {
          x: rect.left + ((v.x + 1) / 2) * rect.width,
          y: rect.top + ((1 - v.y) / 2) * rect.height,
        };
      };
      const cercanas = filtrarPorCercania(mallas3d.current, proyectar, {
        x: clientX,
        y: clientY,
      }, 60);
      const candidatos = unirCandidatos(
        cercanas.map((m) => cacheCandidatos.current.obtener(m.malla, mallas)),
      );
      const camera = camara.current;
      if (!camera) return null;
      camera.updateMatrixWorld();
      const normalCamara = new THREE.Vector3();
      camera.getWorldDirection(normalCamara);
      const centro = centroCaja(caja);
      const inf = inferir({
        rayo: {
          origen: {
            x: rayo.ray.origin.x,
            y: rayo.ray.origin.y,
            z: rayo.ray.origin.z,
          },
          direccion: {
            x: rayo.ray.direction.x,
            y: rayo.ray.direction.y,
            z: rayo.ray.direction.z,
          },
        },
        proyectar,
        candidatos,
        planoTrabajo: {
          punto: { x: centro[0], y: centro[1], z: centro[2] },
          normal: { x: normalCamara.x, y: normalCamara.y, z: normalCamara.z },
        },
      });
      if (inf.punto) {
        const redondeado = redondearVec(inf.punto);
        return [redondeado.x, redondeado.y, redondeado.z];
      }
      // Sin candidatos: el centro de la caja, en el plano de la cámara.
      const centroCaja3d = new THREE.Vector3(
        (caja.min[0] + caja.max[0]) / 2,
        (caja.min[1] + caja.max[1]) / 2,
        (caja.min[2] + caja.max[2]) / 2,
      );
      const plano = new THREE.Plane().setFromNormalAndCoplanarPoint(
        normalCamara,
        centroCaja3d,
      );
      const punto = new THREE.Vector3();
      if (!rayo.ray.intersectPlane(plano, punto)) return null;
      return [punto.x, punto.y, punto.z];
    },
    [caja, mallas, niveles, rayoDePantalla, vista.nivel, vista.tipo],
  );

  const asaEjeEn = useCallback((clientX: number, clientY: number) => {
    let mejor: (typeof ejesInteraccion.current)[number] | null = null;
    let distancia = 16;
    for (const asa of ejesInteraccion.current) {
      const p = pantallaDePunto(asa.punto);
      if (!p) continue;
      const d = Math.hypot(p.x - clientX, p.y - clientY);
      if (d < distancia) {
        distancia = d;
        mejor = asa;
      }
    }
    return mejor;
  }, [pantallaDePunto]);

  // O034: asa de borde de losa bajo el puntero (solo existe en planta con una losa).
  const asaLosaEn = useCallback((clientX: number, clientY: number) => {
    let mejor: (typeof asasLosa.current)[number] | null = null;
    let distancia = 16;
    for (const asa of asasLosa.current) {
      const p = pantallaDePunto(asa.punto);
      if (!p) continue;
      const d = Math.hypot(p.x - clientX, p.y - clientY);
      if (d < distancia) {
        distancia = d;
        mejor = asa;
      }
    }
    return mejor;
  }, [pantallaDePunto]);

  // Cota bajo el puntero: caja generosa alrededor del texto (antes ±18 px y solo con
  // doble clic; el usuario tenía que atinarle muchas veces).
  const cotaEn = useCallback((clientX: number, clientY: number): CotaInteractiva | null => {
    let mejor: CotaInteractiva | null = null;
    let mejorDistancia = Infinity;
    for (const cota of cotasInteraccion.current) {
      const p = pantallaDePunto(cota.punto);
      if (!p) continue;
      const medioAncho = Math.max(30, cota.texto.length * 8 + 12);
      const dx = Math.abs(clientX - p.x);
      const dy = Math.abs(clientY - p.y);
      if (dx <= medioAncho && dy <= 24) {
        const distancia = Math.hypot(dx, dy);
        if (distancia < mejorDistancia) {
          mejorDistancia = distancia;
          mejor = cota;
        }
      }
    }
    return mejor;
  }, [pantallaDePunto]);

  const abrirEditorCota = useCallback(
    (cota: CotaInteractiva, clientX: number, clientY: number) => {
      const nodo = contenedor.current;
      if (!nodo) return;
      if (cota.tipo === "total") {
        fijarAviso("La cota total es de lectura; edite una cota parcial.");
        return;
      }
      const rect = nodo.getBoundingClientRect();
      setCotaEditando({
        tipo: cota.tipo,
        referencia: cota.referencia,
        mover: cota.mover,
        nivel: cota.nivel,
        nombre: cota.nombre,
        valor: cota.valor,
        izquierda: Math.max(90, Math.min(rect.width - 90, clientX - rect.left)),
        arriba: Math.max(8, Math.min(rect.height - 90, clientY - rect.top - 70)),
      });
      setTextoCotaEditando(cota.valor.toFixed(2));
      setErrorCota(null);
    },
    [fijarAviso],
  );

  // Esc cierra el editor de cota aunque el campo haya perdido el foco, y un clic
  // fuera de él también lo cierra.
  const editorCota = useRef<HTMLDivElement | null>(null);
  const hayCotaEditando = cotaEditando !== null;
  useEffect(() => {
    if (!hayCotaEditando) return;
    const alTecla = (evento: KeyboardEvent) => {
      if (evento.key !== "Escape") return;
      evento.preventDefault();
      evento.stopPropagation();
      setCotaEditando(null);
    };
    const alPresionar = (evento: PointerEvent) => {
      const caja = editorCota.current;
      if (caja && evento.target instanceof Node && caja.contains(evento.target)) return;
      setCotaEditando(null);
    };
    window.addEventListener("keydown", alTecla, true);
    window.addEventListener("pointerdown", alPresionar, true);
    return () => {
      window.removeEventListener("keydown", alTecla, true);
      window.removeEventListener("pointerdown", alPresionar, true);
    };
  }, [hayCotaEditando]);

  const asaNivelEn = useCallback((clientX: number, clientY: number) => {
    let mejor: (typeof asasNivel.current)[number] | null = null;
    let distancia = 14;
    for (const asa of asasNivel.current) {
      const p = pantallaDePunto(asa.punto);
      if (!p) continue;
      const d = Math.hypot(p.x - clientX, p.y - clientY);
      if (d < distancia) {
        distancia = d;
        mejor = asa;
      }
    }
    return mejor;
  }, [pantallaDePunto]);

  const lineaEjeEn = useCallback((clientX: number, clientY: number) => {
    let mejor: string | null = null;
    let distancia = 8;
    for (const linea of lineasEje.current) {
      for (let i = 0; i + 1 < linea.puntos.length; i += 1) {
        const a = pantallaDePunto(linea.puntos[i]);
        const b = pantallaDePunto(linea.puntos[i + 1]);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const largo = Math.hypot(dx, dy);
        const t = largo > 1e-9
          ? Math.max(0, Math.min(1, ((clientX - a.x) * dx + (clientY - a.y) * dy) / (largo * largo)))
          : 0;
        const d = Math.hypot(clientX - (a.x + dx * t), clientY - (a.y + dy * t));
        if (d < distancia) {
          distancia = d;
          mejor = linea.globalid;
        }
      }
    }
    return mejor;
  }, [pantallaDePunto]);

  /** O029: nivel cuya línea horizontal pasa bajo el cursor en alzado/corte. */
  const lineaNivelEn = useCallback((clientX: number, clientY: number) => {
    let mejor: string | null = null;
    let distancia = 8;
    for (const linea of lineasNivelRef.current) {
      if (linea.tipo !== "nivel" || linea.elev === undefined) continue;
      const nivel = niveles.find(
        (n) => Math.abs(n.elevacion - (linea.elev ?? 0)) < 1e-6,
      );
      if (!nivel) continue;
      for (let i = 0; i + 1 < linea.puntos.length; i += 1) {
        const a = pantallaDePunto(linea.puntos[i]);
        const b = pantallaDePunto(linea.puntos[i + 1]);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const largo = Math.hypot(dx, dy);
        const t = largo > 1e-9
          ? Math.max(0, Math.min(1, ((clientX - a.x) * dx + (clientY - a.y) * dy) / (largo * largo)))
          : 0;
        const d = Math.hypot(clientX - (a.x + dx * t), clientY - (a.y + dy * t));
        if (d < distancia) {
          distancia = d;
          mejor = nivel.globalid;
        }
      }
    }
    return mejor;
  }, [pantallaDePunto, niveles]);

  /** Punto de la vista bajo el cursor; `null` fuera del plano de dibujo. */
  const puntoVistaDesdeEvento = useCallback((clientX: number, clientY: number): Punto2 | null => {
    const nodo = contenedor.current;
    const camera = camara.current;
    const ctx = contextoEje.current;
    if (!nodo || !camera || !ctx) return null;
    const rect = nodo.getBoundingClientRect();
    const raton = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const rayo = new THREE.Raycaster();
    rayo.setFromCamera(raton, camera);
    const punto = new THREE.Vector3();
    if (ctx.tipo === "planta") {
      const plano = new THREE.Plane(new THREE.Vector3(0, 0, 1), -ctx.z);
      if (!rayo.ray.intersectPlane(plano, punto)) return null;
      return [punto.x, punto.y];
    }
    const normal = new THREE.Vector3(ctx.d[0], ctx.d[1], 0);
    const plano = new THREE.Plane(normal, -ctx.profundidad);
    if (!rayo.ray.intersectPlane(plano, punto)) return null;
    return [punto.x * ctx.h[0] + punto.y * ctx.h[1], punto.z];
  }, []);

  /** Punto de mundo (como el de las asas) en coordenadas de la vista. */
  const puntoVistaDeMundo = useCallback((p: [number, number, number]): Punto2 | null => {
    const ctx = contextoEje.current;
    if (!ctx) return null;
    if (ctx.tipo === "planta") return [p[0], p[1]];
    return [p[0] * ctx.h[0] + p[1] * ctx.h[1], p[2]];
  }, []);

  const persistirAjusteEje = (globalid: string, ajuste: AjusteEjeVista | undefined) => {
    void fijarAjustesEjes(vista.id, { [globalid]: normalizarAjusteEje(ajuste) ?? null });
  };

  const ejesVisiblesDeVista = () =>
    referencias.ejes.filter((eje) => eje.globalid && eje.etiqueta);

  /** O044: cruces reales del eje con los demás ejes de la planta (para el codo). */
  const crucesDeEjeVista = (globalid: string): Punto2[] => {
    const ctx = contextoEje.current;
    const bases = ctx?.bases[globalid];
    if (!ctx || ctx.tipo !== "planta" || !bases) return [];
    const otros: Array<{ inicio: Punto2; fin: Punto2 }> = [];
    for (const eje of ejesVisiblesDeVista()) {
      if (!eje.globalid || eje.globalid === globalid) continue;
      const b = ctx.bases[eje.globalid];
      if (b) otros.push(b);
    }
    return interseccionesEje(bases.inicio, bases.fin, otros);
  };

  const agregarCodoVista = (globalid: string, lado: LadoEje) => {
    const eje = ejesVisiblesDeVista().find((e) => e.globalid === globalid);
    const bases = contextoEje.current?.bases[globalid];
    if (!eje || !bases) return;
    const ajuste = ajusteActualEje(globalid);
    // O042: el codo parte del extremo de la línea (o del globo libre).
    const g = geometriaEje(ajuste, bases.inicio, bases.fin, {
      globoInicio: true,
      diametroGlobo: mmPapelAMetros(8, vista.escala),
    });
    const globo = lado === "inicio" ? (g.globoInicio ?? bases.inicio) : g.globoFin;
    const dx = bases.fin[0] - bases.inicio[0];
    const dy = bases.fin[1] - bases.inicio[1];
    const largo = Math.hypot(dx, dy);
    if (largo < 1e-9) return;
    // Sentido hacia afuera del eje: del interior al extremo que se anota.
    const direccion: Punto2 =
      lado === "inicio" ? [-dx / largo, -dy / largo] : [dx / largo, dy / largo];
    // O044: cruces reales para que la diagonal no salga encima de otro eje.
    const nuevo = agregarCodoEje(
      ajuste,
      lado,
      globo,
      direccion,
      mmPapelAMetros(8, vista.escala),
      crucesDeEjeVista(globalid),
    );
    persistirAjusteEje(globalid, nuevo);
  };

  const alternarCandadoVista = (globalid: string, lado: LadoEje) => {
    const abierto = candados[lado];
    if (abierto) {
      // Al cerrar el candado el extremo vuelve a la alineación común.
      persistirAjusteEje(globalid, fijarExtremoEje(ajusteActualEje(globalid), lado, null));
    }
    setCandados((c) => ({ ...c, [lado]: !abierto }));
  };

  const quitarCodoVista = (globalid: string, lado: LadoEje, indice: number) => {
    persistirAjusteEje(globalid, quitarCodoEje(ajusteActualEje(globalid), lado, indice));
  };

  // O021: globos, restablecer y copiar el acomodo a otras vistas.
  const fijarGlobos = (
    globalid: string,
    cambios: { globoInicio?: boolean; globoFin?: boolean },
  ) => {
    const actual = normalizarAjusteEje(ajusteActualEje(globalid)) ?? {};
    persistirAjusteEje(globalid, normalizarAjusteEje({ ...actual, ...cambios }));
  };

  const restablecerEjeVista = (globalid: string) => {
    persistirAjusteEje(globalid, undefined);
  };

  const restablecerTodosLosEjes = () => {
    const ejes = vista.ejes ?? {};
    const cambios = Object.fromEntries(Object.keys(ejes).map((gid) => [gid, null]));
    if (Object.keys(cambios).length === 0) return;
    void fijarAjustesEjes(vista.id, cambios);
  };

  const abrirCopiarAcomodo = (globalid: string) => {
    const otras = vistas.filter((v) => v.id !== vista.id && v.tipo === vista.tipo);
    setDialogoCopiarEje({
      globalid,
      seleccion: otras.map((v) => v.id),
    });
  };

  const copiarAcomodoAVistas = () => {
    if (!dialogoCopiarEje) return;
    const ajuste = copiarAjusteEje(ajusteActualEje(dialogoCopiarEje.globalid));
    for (const vid of dialogoCopiarEje.seleccion) {
      void fijarAjustesEjes(vid, { [dialogoCopiarEje.globalid]: ajuste ?? null });
    }
    setDialogoCopiarEje(null);
  };

  // O006d: distancia al eje paralelo más cercano mientras se dibuja un eje.
  const restriccionPrevia = useMemo(
    () =>
      herramienta === "eje" && puntosHerramienta.length > 0 && ratonHerramienta
        ? restringirEje(
            puntosHerramienta[0],
            ejeOrtogonal(puntosHerramienta[0], ratonHerramienta).fin,
            referencias.ejes,
            ejeLibre,
          )
        : null,
    [herramienta, puntosHerramienta, ratonHerramienta, referencias.ejes, ejeLibre],
  );
  const distanciaParalelo = useMemo(
    () =>
      restriccionPrevia && ratonHerramienta
        ? distanciaAEjeParalelo(
            ratonHerramienta,
            referencias.ejes,
            restriccionPrevia.vertical,
          )
        : null,
    [restriccionPrevia, ratonHerramienta, referencias.ejes],
  );
  // O036b: sin familia el trazo también se previsualiza horizontal o vertical.
  const trazoEjePrevio = useMemo(() => {
    if (herramienta !== "eje" || puntosHerramienta.length === 0 || !ratonHerramienta) {
      return null;
    }
    if (restriccionPrevia) {
      return {
        inicio: restriccionPrevia.inicio,
        fin: restriccionPrevia.fin,
        vertical: restriccionPrevia.vertical,
      };
    }
    const forzado = ejeOrtogonal(puntosHerramienta[0], ratonHerramienta);
    return { inicio: puntosHerramienta[0], fin: forzado.fin, vertical: forzado.vertical };
  }, [herramienta, puntosHerramienta, ratonHerramienta, restriccionPrevia]);

  // O005c: los ejes también encuadran la planta (burbujas incluidas).
  const cajaVista = useMemo(() => {
    let base = cajaConEjes(caja, referencias.ejes);
    if (vista.tipo === "alzado" || vista.tipo === "corte") {
      // O006a: la cámara debe dejar ver las cabezas de nivel y las cotas de afuera.
      // O011b: las etiquetas van fuera del último eje y las cotas más afuera, así
      // que se amplía el encuadre en el sentido horizontal de la vista.
      const elevaciones = niveles.map((n) => n.elevacion);
      const minZ = Math.min(base.min[2], ...elevaciones);
      const maxZ = Math.max(base.max[2], ...elevaciones);
      const d =
        vista.tipo === "alzado"
          ? direccionAlzado(vista.orientacion ?? "sur")
          : normalCorte(vista);
      let h: [number, number] = [-d[1], d[0]];
      if (vista.tipo === "corte" && vista.puntoA && vista.puntoB) {
        const dx = vista.puntoB[0] - vista.puntoA[0];
        const dy = vista.puntoB[1] - vista.puntoA[1];
        const largo = Math.hypot(dx, dy);
        if (largo > 1e-9) h = [dx / largo, dy / largo];
      }
      const margenAnotacion = 8;
      base = {
        min: [
          base.min[0] - 1 - (h[0] < 0 ? margenAnotacion : 0),
          base.min[1] - 1 - (h[1] < 0 ? margenAnotacion : 0),
          minZ - 0.6,
        ],
        max: [
          base.max[0] + 1 + (h[0] > 0 ? margenAnotacion : 0),
          base.max[1] + 1 + (h[1] > 0 ? margenAnotacion : 0),
          maxZ + 0.6,
        ],
      };
    } else if (vista.tipo === "planta" && vista.cotasEjes !== false) {
      // Las cotas quedan afuera de las burbujas; el margen extra evita recortarlas.
      const margen = 1.6;
      base = {
        min: [base.min[0] - margen, base.min[1] - margen, base.min[2]],
        max: [base.max[0] + margen, base.max[1] + margen, base.max[2]],
      };
    }
    return base;
  }, [caja, referencias, niveles, vista]);

  useEffect(() => {
    const observador = new MutationObserver(() =>
      setOscuro(document.documentElement.classList.contains("dark")),
    );
    observador.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observador.disconnect();
  }, []);

  // Escena, cámara, luces y bucle de dibujo.
  useEffect(() => {
    const nodo = contenedor.current;
    if (!nodo) return;
    const escenaLocal = new THREE.Scene();
    const rendererLocal = crearRendererVisor(nodo, colorDeFondo(oscuro));

    const grupoLocal = new THREE.Group();
    escenaLocal.add(grupoLocal);
    const grupoHerramientaLocal = new THREE.Group();
    escenaLocal.add(grupoHerramientaLocal);
    escenaLocal.add(new THREE.HemisphereLight(0xffffff, 0x6b7280, 1.5));
    const luz = new THREE.DirectionalLight(0xffffff, 1.7);
    luz.position.set(5, -8, 12);
    escenaLocal.add(luz);

    escena.current = escenaLocal;
    renderer.current = rendererLocal;
    grupo.current = grupoLocal;
    grupoHerramienta.current = grupoHerramientaLocal;

    const medir = () => {
      const ancho = Math.max(nodo.clientWidth, 1);
      const alto = Math.max(nodo.clientHeight, 1);
      rendererLocal.setSize(ancho, alto, false);
      setDimensiones({ ancho, alto });
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(nodo);

    let vivo = true;
    const dibujar = () => {
      if (!vivo) return;
      if (camara.current && renderer.current && escena.current) {
        // O055: el globo, la etiqueta y el texto de cota miran siempre a la cámara,
        // también al orbitarla.
        if (orientablesAnot3d.current.length > 0) {
          const camera = camara.current;
          const d = new THREE.Vector3();
          camera.getWorldDirection(d);
          const hacia: [number, number, number] = [-d.x, -d.y, -d.z];
          for (const objeto of orientablesAnot3d.current) {
            const fijo = objeto.userData.haciaCamaraFijo as
              | [number, number, number]
              | undefined;
            orientarAnotacion(objeto, fijo ?? hacia);
          }
        }
        renderer.current.render(escena.current, camara.current);
      }
      requestAnimationFrame(dibujar);
    };
    dibujar();
    return () => {
      vivo = false;
      observador.disconnect();
      rendererLocal.dispose();
      if (rendererLocal.domElement.parentElement === nodo) nodo.removeChild(rendererLocal.domElement);
      escena.current = null;
      renderer.current = null;
      grupo.current = null;
      grupoHerramienta.current = null;
      camara.current = null;
    };
    // La escena se crea una sola vez; el tema y el modelo se actualizan en otros efectos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fondo del tema claro/oscuro.
  useEffect(() => {
    renderer.current?.setClearColor(colorDeFondo(oscuro), 1);
    if (escena.current) escena.current.background = colorDeFondo(oscuro);
  }, [oscuro]);

  /** O010: guarda el encuadre actual de la vista para restaurarlo después. */
  const guardarCamaraActual = useCallback(() => {
    const nav = navegacion.current;
    const camera = camara.current;
    const id = vistaDeCamara.current;
    if (!nav || !camera || !id) return;
    const guardada: CamaraGuardada = {
      tipo: nav.tipo,
      objetivo: [nav.objetivo.x, nav.objetivo.y, nav.objetivo.z],
      direccion: [nav.direccion.x, nav.direccion.y, nav.direccion.z],
      arriba: [nav.arriba.x, nav.arriba.y, nav.arriba.z],
      distancia: nav.distancia,
    };
    if (camera instanceof THREE.OrthographicCamera) {
      guardada.izquierda = camera.left;
      guardada.derecha = camera.right;
      guardada.arribaPlano = camera.top;
      guardada.abajo = camera.bottom;
    } else if (camera instanceof THREE.PerspectiveCamera) {
      guardada.fov = camera.fov;
    }
    camarasGuardadas.current.set(id, guardada);
  }, []);

  const aplicarCamara = useCallback(() => {
    const nav = navegacion.current;
    const camera = camara.current;
    if (!nav || !camera) return;
    camera.up.copy(nav.arriba);
    camera.position.copy(nav.objetivo).addScaledVector(nav.direccion, nav.distancia);
    camera.lookAt(nav.objetivo);
    if (camera instanceof THREE.OrthographicCamera) {
      camera.near = 0.01;
      camera.far = nav.distancia + diagonalCaja(cajaVista) * 3 + 10;
      camera.updateProjectionMatrix();
    } else if (camera instanceof THREE.PerspectiveCamera) {
      // O010: un near proporcional a la distancia evita la pérdida de precisión de
      // profundidad que hacía manchas y caras mal sombreadas en perspectiva.
      camera.near = Math.max(0.01, Math.min(0.1, nav.distancia * 0.004));
      camera.far = nav.distancia + diagonalCaja(cajaVista) * 4 + 10;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
    const nodo = contenedor.current;
    if (nodo) {
      nodo.dataset.camara = JSON.stringify({
        tipo: nav.tipo,
        objetivo: [nav.objetivo.x, nav.objetivo.y, nav.objetivo.z],
        direccion: [nav.direccion.x, nav.direccion.y, nav.direccion.z],
        distancia: nav.distancia,
        izquierda: camera instanceof THREE.OrthographicCamera ? camera.left : null,
        derecha: camera instanceof THREE.OrthographicCamera ? camera.right : null,
        arribaPlano: camera instanceof THREE.OrthographicCamera ? camera.top : null,
        abajo: camera instanceof THREE.OrthographicCamera ? camera.bottom : null,
        fov: camera instanceof THREE.PerspectiveCamera ? camera.fov : null,
      });
    }
    guardarCamaraActual();
  }, [cajaVista, guardarCamaraActual]);
  // O018: único punto de zoom del visor. Lo usan `alRodar` y el gesto nativo de
  // Windows (GID_ZOOM y dos contactos PT_TOUCHPAD), centrado en un punto de
  // pantalla. El factor es el de la convención del visor: <1 acerca.
  const aplicarZoom = useCallback(
    (factor: number, puntoPantalla?: { x: number; y: number }) => {
      const camera = camara.current;
      const nav = navegacion.current;
      const nodo = contenedor.current;
      if (!camera || !nav || !Number.isFinite(factor) || factor <= 0) return;
      const rect = nodo?.getBoundingClientRect();
      const x = puntoPantalla?.x ?? (rect ? rect.left + rect.width / 2 : 0);
      const y = puntoPantalla?.y ?? (rect ? rect.top + rect.height / 2 : 0);
      if (camera instanceof THREE.OrthographicCamera) {
        if (!rect) return;
        const raton = new THREE.Vector2(
          ((x - rect.left) / Math.max(rect.width, 1)) * 2 - 1,
          -((y - rect.top) / Math.max(rect.height, 1)) * 2 + 1,
        );
        const rayo = new THREE.Raycaster();
        rayo.setFromCamera(raton, camera);
        const direccionVista = new THREE.Vector3();
        camera.getWorldDirection(direccionVista);
        const plano = new THREE.Plane().setFromNormalAndCoplanarPoint(
          direccionVista,
          nav.objetivo,
        );
        const punto = new THREE.Vector3();
        const hayPunto = rayo.ray.intersectPlane(plano, punto) !== null;
        camera.left *= factor;
        camera.right *= factor;
        camera.top *= factor;
        camera.bottom *= factor;
        if (hayPunto) {
          nav.objetivo.sub(punto).multiplyScalar(factor).add(punto);
        }
        camera.updateProjectionMatrix();
      } else if (camera instanceof THREE.PerspectiveCamera) {
        nav.distancia = Math.max(0.5, nav.distancia * factor);
      }
      aplicarCamara();
      actualizarGrosoresRef.current();
    },
    [aplicarCamara],
  );
  // O006e: metros de mundo por píxel de pantalla en la cámara actual. Es la base
  // de la tolerancia de enganche (12 px) y del tamaño de su marca (10 px).
  const metrosPorPixelActual = useCallback(() => {
    const camera = camara.current;
    const nodo = contenedor.current;
    if (!camera || !nodo) return 0.02;
    const alto = Math.max(nodo.clientHeight, 1);
    if (camera instanceof THREE.OrthographicCamera) {
      return Math.max((camera.top - camera.bottom) / alto, 1e-6);
    }
    if (camera instanceof THREE.PerspectiveCamera) {
      const nav = navegacion.current;
      return Math.max(
        (2 * (nav?.distancia ?? 10) * Math.tan((camera.fov * Math.PI) / 360)) / alto,
        1e-6,
      );
    }
    return 0.02;
  }, []);


  // O031: al abrir otro modelo se descartan los encuadres guardados del anterior.
  useEffect(() => {
    if (claveCamaras !== claveModelo) {
      camarasGuardadas.current.clear();
      claveCamaras = claveModelo;
    }
  }, [claveModelo, camarasGuardadas]);

  // O010: la cámara se crea/restaura solo al abrir una vista. Los cambios del modelo
  // (cajaVista) NO la reencuadran: solo actualizan near/far más abajo.
  useEffect(() => {
    const nodo = contenedor.current;
    if (!nodo || !renderer.current) return;
    const aspecto = Math.max(nodo.clientWidth, 1) / Math.max(nodo.clientHeight, 1);
    guardarCamaraActual();
    vistaDeCamara.current = vista.id;

    const nav = crearNavegacion(vista, cajaVista, aspecto);
    const guardada = camarasGuardadas.current.get(vista.id);
    if (guardada && guardada.tipo === nav.tipo) {
      nav.objetivo.set(...guardada.objetivo);
      nav.direccion.set(...guardada.direccion).normalize();
      nav.arriba.set(...guardada.arriba);
      nav.distancia = guardada.distancia;
    }
    navegacion.current = nav;
    const camera = crearCamaraDeVista(vista, cajaVista, aspecto, nav);
    if (guardada && guardada.tipo === nav.tipo) {
      if (camera instanceof THREE.OrthographicCamera) {
        camera.left = guardada.izquierda ?? camera.left;
        camera.right = guardada.derecha ?? camera.right;
        camera.top = guardada.arribaPlano ?? camera.top;
        camera.bottom = guardada.abajo ?? camera.bottom;
      } else if (camera instanceof THREE.PerspectiveCamera) {
        camera.fov = guardada.fov ?? camera.fov;
        camera.aspect = aspecto;
      }
    }
    camara.current = camera;
    aplicarCamara();
    // `aplicarCamara` es estable por referencia del componente; se usa a través de refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista.id, vista.tipo, vista.orientacion]);

  // Al cambiar el tamaño del lienzo (por ejemplo, al redimensionar un panel) se
  // conserva el zoom y el centro: solo se adapta el aspecto.
  useEffect(() => {
    const camera = camara.current;
    if (!camera) return;
    const nodo = contenedor.current;
    if (!nodo) return;
    const aspecto = Math.max(nodo.clientWidth, 1) / Math.max(nodo.clientHeight, 1);
    if (camera instanceof THREE.OrthographicCamera) {
      const alto = camera.top - camera.bottom;
      const ancho = alto * aspecto;
      camera.left = -ancho / 2;
      camera.right = ancho / 2;
    } else if (camera instanceof THREE.PerspectiveCamera) {
      camera.aspect = aspecto;
    }
    aplicarCamara();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimensiones.ancho, dimensiones.alto]);

  // O049: el caché por elemento se invalida cuando cambia el modelo.
  useEffect(() => {
    cacheCandidatos.current.limpiar();
  }, [mallas]);

  // Los cambios del modelo solo ajustan el recorte de profundidad.
  useEffect(() => {
    aplicarCamara();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cajaVista]);

  return {
    ...c,
    detenerGrabacion,
    iniciarGrabacion,
    exportarDiagnostico,
    zEmpujar,
    nivelGlobalidPorNombre,
    ajusteActualEje,
    pantallaDePunto,
    rayoDePantalla,
    puntoNotaEn,
    asaEjeEn,
    asaLosaEn,
    cotaEn,
    abrirEditorCota,
    editorCota,
    hayCotaEditando,
    asaNivelEn,
    lineaEjeEn,
    lineaNivelEn,
    puntoVistaDesdeEvento,
    puntoVistaDeMundo,
    persistirAjusteEje,
    ejesVisiblesDeVista,
    crucesDeEjeVista,
    agregarCodoVista,
    alternarCandadoVista,
    quitarCodoVista,
    fijarGlobos,
    restablecerEjeVista,
    restablecerTodosLosEjes,
    abrirCopiarAcomodo,
    copiarAcomodoAVistas,
    restriccionPrevia,
    distanciaParalelo,
    trazoEjePrevio,
    cajaVista,
    guardarCamaraActual,
    aplicarCamara,
    aplicarZoom,
    metrosPorPixelActual,
  };
}
