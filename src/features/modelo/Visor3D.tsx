/* eslint-disable react-hooks/immutability -- los refs del visor son mutables por diseño. */
import { useEffect } from "react";
import * as THREE from "three";
import { type AjusteEjeVista, type ElementoMalla } from "./tipos";
import { useModelo } from "./estado";
import { aliasCiclico, candidatosBajoPunto, ORDEN_CICLO, siguienteCandidato, textoPistaTab, type CandidatoTab } from "./seleccionCiclica";
import { detectorRueda, textoResumenGrabacion } from "@/lib/rueda";
import { copiarTexto } from "@/lib/portapapeles";
import { buscarEnganche, colocarAbertura, type Punto2 } from "./herramientas";
import { caraEnPunto, rectaDeEje, rectaDeMalla } from "./alinear";
import { alturaEnEjeVertical, clasificarEmpujar, textoDimensiones } from "./empujar";
import { caraEnPunto as caraPlanaEnPunto, clasificarCaraEmpujar, distanciaSobreNormal, type AccionEmpujarCara, type ElementoCara, type ResultadoCara } from "./empujarCaras";
import { inferir, type CandidatosInferencia, type Inferencia, type Vec3 } from "./inferencias3d";
import { caraSuperiorEn, filtrarPorCercania, unirCandidatos } from "./candidatos3d";
import { contornoPrevio, desfaseConArrastre, leerPoligonoWkt } from "./asasLosa";
import { ControlesZoom } from "./ControlesZoom";
import { accionArrastre } from "./orbita";
import { normalizarAjusteNivel } from "./niveles";
import { MAXIMO_CODOS, agregarCodoEje, arrastrarExtremoEje, extremoEje, geometriaEje, globoVisibleEje, imanAlineacion, imanMultiplo, mmPapelAMetros, normalizarAjusteEje, restablecerExtremoEje, candadoArrastreAsa, desplazamientoArrastreNivel, destinoArrastreAsa, destinoArrastreCodo, puntoAsaEje, type DireccionEjeArrastre, type LadoEje, type TipoAsaArrastre } from "./ejesVista";
import { bloqueoDeInferencia, colorDeGuia, etiquetaInferencia, formaDeMarcador, redondearVec } from "./visor/utilidades";
import {  } from "./visor/anotaciones";
import { useEstadoVisor } from "./visor/useEstadoVisor";
import { usePunteroVisor } from "./visor/usePunteroVisor";
import { useAnotacionesVisor } from "./visor/useAnotacionesVisor";
import { useHerramientaVisor } from "./visor/useHerramientaVisor";
import { useControlesVisor } from "./visor/useControlesVisor";
import { useRuedaVisor } from "./visor/useRuedaVisor";
import { useOverlaysVisor } from "./visor/useOverlaysVisor";
import { useGuiasVisor } from "./visor/useGuiasVisor";
import { type CtxEscena } from "./visor/escena/contexto";
import { construirBaseEscena } from "./visor/escena/base";
import { construirMurosPlanta } from "./visor/escena/murosPlanta";
import { construirEstructuraPlanta } from "./visor/escena/estructuraPlanta";
import { construirEjesPlanta } from "./visor/escena/ejesPlanta";
import { construirCotasPlanta } from "./visor/escena/cotasPlanta";
import { construirNivelesAlzado } from "./visor/escena/nivelesAlzado";
import { construirAsasYDatasets } from "./visor/escena/asasYDatasets";
import { type Props } from "./visor/tipos";


/** Distancia de un punto a un segmento (para saber si un cerramiento tiene muro debajo). */


const ARRIBA = new THREE.Vector3(0, 0, 1);

export function Visor3D({
  vista,
  vistas,
  niveles,
  mallas,
  estilos,
  aberturas,
  caja,
  seleccion,
  seleccionados,
  modoCorte,
  puntoCorte,
  onSeleccionar,
  onSeleccionarVarios,
  onPuntoCorte,
  onEscape,
  onCambiarAnotacion,
  claveModelo = "",
  elementosOcultos = [],
  elementosBloqueados = [],
}: Props) {
  const c1 = useEstadoVisor({
    vista,
    vistas,
    niveles,
    mallas,
    estilos,
    aberturas,
    caja,
    seleccion,
    seleccionados,
    modoCorte,
    puntoCorte,
    onSeleccionar,
    onSeleccionarVarios,
    onPuntoCorte,
    onEscape,
    onCambiarAnotacion,
    claveModelo,
    elementosOcultos,
    elementosBloqueados,
  });
  const c2 = usePunteroVisor(c1);


  // Vista activa y geometría: filtros de categorías/niveles, recorte y relleno.
  const {
    abrirCopiarAcomodo,
    abrirEditorCota,
    actualizarVista,
    agregarCodoVista,
    ajusteActualEje,
    ajusteEnCurso,
    ajusteEnCursoRef,
    ajustesNivelEnCurso,
    alternarCandadoAlinear,
    alternarCandadoVista,
    alternarOrbitar,
    altoBurbujaRef,
    aplicarAlinear,
    aplicarCamara,
    arrastre,
    arrastreEje,
    arrastreLosa,
    arrastreNivel,
    arrastreNota,
    asaEjeEn,
    asaLosaEn,
    asaNivelEn,
    ayudaVisible,
    bloqueoFlechas,
    bloqueoShift,
    cacheCandidatos,
    cajaVista,
    camara,
    candados,
    caraEmpujarHover,
    cerrarAyuda,
    clicEmpujar,
    clicEnPlanta,
    clicNivel,
    clicRecorte,
    confirmarEmpujar,
    confirmarEmpujarCara,
    contenedor,
    contextoEje,
    copiarAcomodoAVistas,
    cotaEditando,
    cotaEn,
    cotasNivel,
    crucesDeEjeVista,
    detenerGrabacion,
    diagnosticoRueda,
    dialogoCopiarEje,
    dimensiones,
    distanciaParalelo,
    dobleClicEnPlanta,
    editorCota,
    editorDesfaseLosa,
    ejeSeleccionado,
    ejeSeleccionadoRef,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- solo se usa en un tipo
    ejesInteraccion,
    elegirReferenciaAlinear,
    empujarAltura,
    empujarCara,
    empujarClasificacion,
    empujarRect,
    empujarZ,
    engancheHerramienta,
    errorCota,
    espacio,
    eventosGrabados,
    exportarDiagnostico,
    fijarAjustesEjes,
    fijarAjustesNiveles,
    fijarAlturaEmpujar,
    fijarAviso,
    fijarGlobos,
    fijarMoverSiguientes,
    fijarNivelSeleccionado,
    fijarPistaTab,
    fijarRaton,
    grabando,
    grupo,
    guiaArrastre,
    guiaCodo,
    guiaEmpujar,
    herramienta,
    iniciarEmpujarCara,
    iniciarGrabacion,
    lineaEjeEn,
    lineaNivelEn,
    longitudTecleada,
    mallas3d,
    marcadorEmpujar,
    menuEje,
    meshes,
    metrosPorPixelActual,
    modoOrbitar,
    moverEmpujar,
    moverEmpujarCara,
    moverNota,
    moverSiguientes,
    mundoPorPxRef,
    navegacion,
    nivelGlobalidPorNombre,
    nivelSeleccionado,
    notaEditando,
    notaSeleccionada,
    notasPx,
    opcionesNivel,
    oscuro,
    panelAnotaciones,
    pantallaDePunto,
    persistirAjusteEje,
    previewLosaPx,
    propiedades,
    puntoVistaDeMundo,
    puntoVistaDesdeEvento,
    puntosHerramienta,
    quitarCodoVista,
    ratonHerramienta,
    referenciaAlinear,
    referencias,
    resaltado,
    resaltadoRef,
    restablecerEjeVista,
    restablecerTodosLosEjes,
    resumenGrabacion,
    seleccionarNota,
    setAjusteEnCurso,
    setAjustesNivelEnCurso,
    setArrastreNota,
    setCandados,
    setCaraEmpujarHover,
    setCotaEditando,
    setDiagnosticoRueda,
    setDialogoCopiarEje,
    setEditorDesfaseLosa,
    setEjeSeleccionado,
    setErrorCota,
    setGuiaArrastre,
    setGuiaCodo,
    setGuiaEmpujar,
    setMarcadorEmpujar,
    setMenuEje,
    setNotaEditando,
    setPanelAnotaciones,
    setPreviewLosaPx,
    setResaltado,
    setTextoCotaEditando,
    setTextoNota,
    setVentanaSeleccion,
    soltarLosaCancelado,
    textoCotaEditando,
    textoNota,
    trazoEjePrevio,
    ultimaInferenciaEmpujar,
    ultimaZ,
    ultimoMedio,
    ultimoPuntero,
    ventanaSeleccion,
    vistaPreviaRecorte,
    zEmpujar,
    zoomTick,
  } = c2;
  useEffect(() => {
  const ctx: CtxEscena = { ...c2, visibles: [], murosCapas: [], datosCotas: [], datosNiveles: [] };
  ctx.grupoLocal = grupo.current;
  if (!ctx.grupoLocal) return;
  Object.assign(ctx, construirBaseEscena(ctx));

    // O006e: planta de muros limpia. El contorno es la unión de las huellas; las
    // capas se recortan contra el núcleo vecino y el rayado no duplica traslapes.
  Object.assign(ctx, construirMurosPlanta(ctx));

    // O007b: simbología de los elementos estructurales en planta. Las columnas y
    // castillos se rellenan con el rayado de concreto; trabes, cerramientos, dalas,
    // zapatas y contratrabes se dibujan con líneas discontinuas.
  Object.assign(ctx, construirEstructuraPlanta(ctx));

    // O005c: ejes en todas las plantas, con la plumilla «Ejes» de O005. Se dibujan a
    // partir de modelo.referencias porque geometria.teselar no devuelve mallas de ejes.
  Object.assign(ctx, construirEjesPlanta(ctx));

    // O006a: cotas de ejes automáticas en planta. Se derivan de los ejes; no son
    // IfcAnnotation y no se guardan en el IFC.
  Object.assign(ctx, construirCotasPlanta(ctx));

    // O006a: niveles y ejes en alzados y cortes. La línea de nivel va de extremo a
    // extremo del modelo más 1 m por lado; la cabeza y las cotas quedan en el extremo.
  Object.assign(ctx, construirNivelesAlzado(ctx));

    // O027: un punto de asa por cada zona interactiva, de tamaño constante en
    // pantalla. Se resaltan al pasar el cursor y se ocultan las de ejes no activos.
  Object.assign(ctx, construirAsasYDatasets(ctx));

    return () => {
      for (const malla of meshes.current) {
        malla.geometry.dispose();
        const material = malla.material;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material.dispose();
      }
    };
  }, [
    mallas,
    vista,
    vistas,
    caja,
    oscuro,
    seleccion,
    seleccionados,
    propiedades,
    resaltado,
    puntoCorte,
    nivelGlobalidPorNombre,
    estilos,
    aberturas,
    referencias,
    cajaVista,
    dimensiones.alto,
    niveles,
    ajusteEnCurso,
    ajustesNivelEnCurso,
    zoomTick,
    elementosOcultos,
    elementosBloqueados,
  ]);

  // O055: ejes, niveles, cotas y notas de las vistas 3D. Se dibujan aparte del
  // modelo para que ninguna de las tres formas de sombreado las tape y para no
  // engordar el efecto principal del visor.
  const c4 = useAnotacionesVisor(c2);

  // O003b: marcadores de la herramienta de dibujo (puntos, snap y vista previa).
  const c5 = useHerramientaVisor(c4);

  // O049: al terminar o cambiar de herramienta se apaga el marcador. La
  // limpieza se aplaza para no encadenar renders dentro del efecto.
  const c6 = useControlesVisor(c5);

  // Rueda: zoom hacia el cursor en ortográficas y acercamiento en 3D.
  const c7 = useRuedaVisor(c6);

  // Paneo, órbita, selección, toques y puntos del corte.
  const {
    ajustar,
    confirmarCota,
    restablecerIso,
    zoomAl100,
    zoomEnCentro,
  } = c7;
  useEffect(() => {
    const nodo = contenedor.current;
    if (!nodo) return;
    nodo.style.touchAction = "none";

    // O006e: pantalla táctil. Un dedo arrastra para panear; dos dedos pellizcan
    // (zoom) y panean; un toque limpio equivale a un clic.
    const toques = new Map<number, { x: number; y: number }>();
    let toqueInicial: { x: number; y: number; ms: number; movido: boolean } | null = null;
    let pinza: { dist: number; cx: number; cy: number } | null = null;

    const zoomEnPantalla = (factor: number, clientX: number, clientY: number) => {
      const camera = camara.current;
      const nav = navegacion.current;
      if (!camera || !nav) return;
      if (camera instanceof THREE.OrthographicCamera) {
        const rect = nodo.getBoundingClientRect();
        const raton = new THREE.Vector2(
          ((clientX - rect.left) / rect.width) * 2 - 1,
          -((clientY - rect.top) / rect.height) * 2 + 1,
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
        if (hayPunto) nav.objetivo.sub(punto).multiplyScalar(factor).add(punto);
        camera.updateProjectionMatrix();
      } else if (camera instanceof THREE.PerspectiveCamera) {
        nav.distancia = Math.max(0.5, nav.distancia * factor);
      }
      // Recolocar la cámara sobre el objetivo nuevo: con el objetivo ya desplazado
      // hacia el punto bajo el cursor, el zoom queda anclado en ese punto.
      aplicarCamara();
    };

    const panearPixeles = (dx: number, dy: number) => {
      const camera = camara.current;
      const nav = navegacion.current;
      if (!camera || !nav) return;
      const alto = Math.max(nodo.clientHeight, 1);
      let escala = 1;
      if (camera instanceof THREE.OrthographicCamera) {
        escala = Math.max((camera.top - camera.bottom) / alto, 1e-6);
      } else if (camera instanceof THREE.PerspectiveCamera) {
        escala = (2 * nav.distancia * Math.tan((camera.fov * Math.PI) / 360)) / alto;
      }
      const derecha = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const arriba = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      nav.objetivo
        .add(derecha.multiplyScalar(-dx * escala))
        .add(arriba.multiplyScalar(dy * escala));
    };

    const puntoPlanta = (evento: PointerEvent): Punto2 | null => {
      const camera = camara.current;
      if (!camera || vista.tipo !== "planta") return null;
      const rect = nodo.getBoundingClientRect();
      const raton = new THREE.Vector2(
        ((evento.clientX - rect.left) / rect.width) * 2 - 1,
        -((evento.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const rayo = new THREE.Raycaster();
      rayo.setFromCamera(raton, camera);
      const z = vista.alturaPlano ?? caja.max[2] + 1;
      const plano = new THREE.Plane(new THREE.Vector3(0, 0, 1), -z);
      const punto = new THREE.Vector3();
      if (!rayo.ray.intersectPlane(plano, punto)) return null;
      return [punto.x, punto.y];
    };

    const rayoPantalla = (clientX: number, clientY: number) => {
      const camera = camara.current;
      if (!camera) return null;
      const rect = nodo.getBoundingClientRect();
      const raton = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      const rayo = new THREE.Raycaster();
      rayo.setFromCamera(raton, camera);
      return {
        origen: [rayo.ray.origin.x, rayo.ray.origin.y, rayo.ray.origin.z] as [
          number,
          number,
          number,
        ],
        direccion: [
          rayo.ray.direction.x,
          rayo.ray.direction.y,
          rayo.ray.direction.z,
        ] as [number, number, number],
      };
    };

    /** O049: proyección mundo → píxeles de la página. */
    const proyectarLienzo = (p: Vec3): { x: number; y: number } => {
      const camera = camara.current;
      const rect = nodo.getBoundingClientRect();
      if (!camera) return { x: 0, y: 0 };
      camera.updateMatrixWorld();
      const v = new THREE.Vector3(p.x, p.y, p.z).project(camera);
      return {
        x: rect.left + ((v.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - v.y) / 2) * rect.height,
      };
    };

    /** O049: pinta el marcador y la guía de la inferencia; devuelve el punto. */
    const anotarInferenciaEmpujar = (inf: Inferencia): Vec3 | null => {
      if (!inf.punto || inf.tipo === null || inf.tipo === "plano") {
        setMarcadorEmpujar(null);
        setGuiaEmpujar(null);
        ultimaInferenciaEmpujar.current = null;
        return inf.punto ? redondearVec(inf.punto) : null;
      }
      const punto = redondearVec(inf.punto);
      const pantalla = proyectarLienzo(punto);
      const rect = nodo.getBoundingClientRect();
      const etiqueta = etiquetaInferencia(inf.tipo);
      setMarcadorEmpujar({
        x: pantalla.x - rect.left,
        y: pantalla.y - rect.top,
        tipo: inf.tipo,
        etiqueta,
        punto,
        // Cerca del borde derecho el tooltip se dibuja hacia la izquierda para
        // que el recorte del visor no lo oculte.
        tooltipIzquierda: pantalla.x - rect.left > rect.width * 0.7,
      });
      ultimaInferenciaEmpujar.current = { punto, tipo: inf.tipo, etiqueta };
      if (inf.guia) {
        const a = proyectarLienzo(redondearVec(inf.guia.inicio));
        const b = proyectarLienzo(redondearVec(inf.guia.fin));
        setGuiaEmpujar({
          x1: a.x - rect.left,
          y1: a.y - rect.top,
          x2: b.x - rect.left,
          y2: b.y - rect.top,
          color: colorDeGuia(inf.tipo),
          tipo: inf.tipo,
        });
      } else {
        setGuiaEmpujar(null);
      }
      return punto;
    };

    /**
     * O049: una sola entrada a `inferir()` para la herramienta Empujar/Tirar.
     * El rayo viene de la cámara, los candidatos de las mallas visibles cercanas
     * a 60 px y el plano de trabajo del nivel o de la cara superior ya fijada.
     */
    const inferenciaEmpujarEn = (
      clientX: number,
      clientY: number,
      shiftKey: boolean,
    ): { inf: Inferencia; candidatos: CandidatosInferencia; punto: Vec3 | null } | null => {
      const rayoCrudo = rayoPantalla(clientX, clientY);
      if (!rayoCrudo) return null;
      const rayo = {
        origen: {
          x: rayoCrudo.origen[0],
          y: rayoCrudo.origen[1],
          z: rayoCrudo.origen[2],
        },
        direccion: {
          x: rayoCrudo.direccion[0],
          y: rayoCrudo.direccion[1],
          z: rayoCrudo.direccion[2],
        },
      };
      const cursor = { x: clientX, y: clientY };
      const cercanas = filtrarPorCercania(mallas3d.current, proyectarLienzo, cursor, 60);
      const unidos = unirCandidatos(
        cercanas.map((m) => cacheCandidatos.current.obtener(m.malla, mallas)),
      );
      // O049: la herramienta solo dibuja sobre caras horizontales (normal +Z).
      // Las caras verticales no son destino válido y, además, ocluirían puntos
      // medios y extremos de las tapas que el usuario sí quiere enganchar.
      const candidatos: CandidatosInferencia = {
        ...unidos,
        caras: (unidos.caras ?? []).filter(
          (cara) => !!cara.normal && cara.normal.z >= 1 - 1e-6,
        ),
      };
      const cota = empujarZ ?? zEmpujar;
      const primera = puntosHerramienta[0];
      const puntoPrevio = primera
        ? { x: primera[0], y: primera[1], z: cota }
        : undefined;
      const planoTrabajo = {
        punto: { x: 0, y: 0, z: cota },
        normal: { x: 0, y: 0, z: 1 },
      };
      let bloqueo = bloqueoFlechas.current ?? undefined;
      if (!bloqueo && shiftKey) {
        if (!bloqueoShift.current) {
          const libre = inferir({
            rayo,
            proyectar: proyectarLienzo,
            candidatos,
            ...(puntoPrevio ? { puntoPrevio } : {}),
            planoTrabajo,
          });
          bloqueoShift.current = bloqueoDeInferencia(libre, candidatos);
        }
        bloqueo = bloqueoShift.current ?? undefined;
      } else if (!shiftKey) {
        bloqueoShift.current = null;
      }
      const inf = inferir({
        rayo,
        proyectar: proyectarLienzo,
        candidatos,
        ...(puntoPrevio ? { puntoPrevio } : {}),
        planoTrabajo,
        ...(bloqueo ? { bloqueo } : {}),
      });
      const punto = anotarInferenciaEmpujar(inf);
      return { inf, candidatos, punto };
    };

    // O056: elemento y cara real bajo el cursor. Se exige que el punto caiga
    // dentro de la cara con un margen: en las esquinas (donde los E2E de O046 y
    // O049 empiezan sus contornos) sigue mandando el plano y se crean sólidos.
    const elementoDeMalla = (malla: ElementoMalla): ElementoCara => ({
      clase: malla.clase,
      alias: malla.estructura?.alias ?? null,
      eje: malla.eje ?? null,
      datos: malla.estructura?.datos ?? null,
    });

    const caraBajoCursor = (
      clientX: number,
      clientY: number,
    ): {
      globalid: string;
      normal: [number, number, number];
      punto: [number, number, number];
      poligono: Vec3[];
      clasificacion: ResultadoCara;
    } | null => {
      const camera = camara.current;
      if (!camera) return null;
      const rect = nodo.getBoundingClientRect();
      const raton = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      const rayo = new THREE.Raycaster();
      rayo.setFromCamera(raton, camera);
      const impacto = rayo.intersectObjects(meshes.current, false)[0];
      const gid = impacto?.object.userData.globalid as string | undefined;
      if (!impacto || !gid) return null;
      const malla = mallas.find((m) => m.globalid === gid);
      if (!malla) return null;
      const candidatos = cacheCandidatos.current.obtener(malla, mallas);
      // Margen de 0.05 m: cerca de aristas, esquinas y bordes sigue mandando el
      // plano con sus inferencias (O046/O049); solo el interior claro de una cara
      // inicia el empuje.
      const cara = caraPlanaEnPunto(
        { x: impacto.point.x, y: impacto.point.y, z: impacto.point.z },
        candidatos.caras ?? [],
        1e-4,
        0.05,
      );
      if (!cara || !cara.normal) return null;
      const largo = Math.hypot(cara.normal.x, cara.normal.y, cara.normal.z);
      if (largo < 1e-9) return null;
      const normal: [number, number, number] = [
        cara.normal.x / largo,
        cara.normal.y / largo,
        cara.normal.z / largo,
      ];
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (const p of cara.poligono) {
        cx += p.x;
        cy += p.y;
        cz += p.z;
      }
      const n = Math.max(cara.poligono.length, 1);
      const centro = { x: cx / n, y: cy / n, z: cz / n };
      const clasificacion = clasificarCaraEmpujar(elementoDeMalla(malla), {
        normal: { x: normal[0], y: normal[1], z: normal[2] },
        centro,
      });
      return {
        globalid: gid,
        normal,
        punto: [centro.x, centro.y, centro.z],
        poligono: cara.poligono,
        clasificacion,
      };
    };

    (nodo as unknown as Record<string, unknown>).__openrvtCaraEmpujarEn = (
      clientX: number,
      clientY: number,
    ) => caraBajoCursor(clientX, clientY);

    // O056: candidatos cercanos de los demás elementos para enganchar la distancia.
    const candidatosSin = (globalid: string, clientX: number, clientY: number) => {
      const cercanas = filtrarPorCercania(
        mallas3d.current,
        proyectarLienzo,
        { x: clientX, y: clientY },
        60,
      ).filter((m) => m.globalid !== globalid);
      return unirCandidatos(
        cercanas.map((m) => cacheCandidatos.current.obtener(m.malla, mallas)),
      );
    };

    // O041: elementos bajo el cursor para Tab. En planta se detectan por geometría
    // (el cerramiento queda arriba del corte y no tiene malla que el rayo toque); en
    // alzado, corte y 3D se suma el rayo y la línea del cerramiento en pantalla.
    const candidatosEn = (clientX: number, clientY: number): CandidatoTab[] => {
      const encontrados = new Map<string, CandidatoTab>();
      const agregar = (gid: string | null | undefined) => {
        if (!gid || encontrados.has(gid)) return;
        const malla = mallas.find((m) => m.globalid === gid);
        if (!malla) return;
        const alias = aliasCiclico(malla);
        if (!alias) return;
        encontrados.set(gid, { globalid: gid, nombre: malla.nombre, alias });
      };
      if (vista.tipo === "planta") {
        const punto = puntoPlanta({ clientX, clientY } as PointerEvent);
        if (punto) {
          for (const candidato of candidatosBajoPunto(mallas, punto)) {
            encontrados.set(candidato.globalid, candidato);
          }
        }
      }
      const camera = camara.current;
      if (camera) {
        const rect = nodo.getBoundingClientRect();
        const raton = new THREE.Vector2(
          ((clientX - rect.left) / rect.width) * 2 - 1,
          -((clientY - rect.top) / rect.height) * 2 + 1,
        );
        const rayo = new THREE.Raycaster();
        rayo.setFromCamera(raton, camera);
        for (const impacto of rayo.intersectObjects(meshes.current, false)) {
          agregar(impacto.object.userData.globalid as string | undefined);
        }
      }
      if (vista.tipo !== "planta") {
        // Cerramiento sin malla visible: se mide su eje proyectado a la pantalla.
        for (const malla of mallas) {
          if (aliasCiclico(malla) !== "cerramiento" || !malla.estructura?.datos) continue;
          const datos = malla.estructura.datos;
          const z = Number(datos.Z) || 0;
          const a = pantallaDePunto([Number(datos.X1), Number(datos.Y1), z]);
          const b = pantallaDePunto([Number(datos.X2), Number(datos.Y2), z]);
          if (!a || !b) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const largo2 = dx * dx + dy * dy;
          if (largo2 <= 1) continue;
          const t = Math.max(
            0,
            Math.min(1, ((clientX - a.x) * dx + (clientY - a.y) * dy) / largo2),
          );
          if (Math.hypot(clientX - (a.x + t * dx), clientY - (a.y + t * dy)) <= 10) {
            agregar(malla.globalid);
          }
        }
      }
      return [...encontrados.values()].sort(
        (a, b) => ORDEN_CICLO.indexOf(a.alias) - ORDEN_CICLO.indexOf(b.alias),
      );
    };

    const hacerClic = (
      clientX: number,
      clientY: number,
      shift: boolean,
      agregar: boolean,
      soloSeleccion = false,
    ) => {
      const camera = camara.current;
      if (!camera) return;
      const falso = { clientX, clientY } as PointerEvent;
      // O051: con «Orbitar» activo, un clic sin arrastre solo selecciona; no debe
      // disparar la herramienta Empujar/Tirar ni ninguna otra.
      if (soloSeleccion) {
        setEjeSeleccionado(null);
        const rect = nodo.getBoundingClientRect();
        const raton = new THREE.Vector2(
          ((clientX - rect.left) / rect.width) * 2 - 1,
          -((clientY - rect.top) / rect.height) * 2 + 1,
        );
        const rayo = new THREE.Raycaster();
        rayo.setFromCamera(raton, camera);
        const impacto = rayo.intersectObjects(meshes.current, false)[0];
        const gidTocado = impacto?.object.userData.globalid ?? null;
        if (gidTocado && elementosBloqueados.includes(gidTocado)) {
          onSeleccionar(null, agregar);
          return;
        }
        onSeleccionar(gidTocado, agregar);
        return;
      }
      if (herramienta === "alinear") {
        // O026: primer clic en la referencia; el segundo en la cara a mover.
        const rectAlinear = nodo.getBoundingClientRect();
        const ratonAlinear = new THREE.Vector2(
          ((clientX - rectAlinear.left) / rectAlinear.width) * 2 - 1,
          -((clientY - rectAlinear.top) / rectAlinear.height) * 2 + 1,
        );
        const rayoAlinear = new THREE.Raycaster();
        rayoAlinear.setFromCamera(ratonAlinear, camera);
        const linea = lineaEjeEn(clientX, clientY);
        if (linea) {
          elegirReferenciaAlinear({ tipo: "eje", globalid: linea });
          return;
        }
        const impactoAlinear = rayoAlinear.intersectObjects(meshes.current, false)[0];
        const gidAlinear = impactoAlinear?.object.userData.globalid as string | undefined;
        if (!gidAlinear) return;
        const mallaAlinear = useModelo.getState().mallas.find(
          (m) => m.globalid === gidAlinear,
        );
        if (!mallaAlinear) return;
        const puntoAlinear: Punto2 =
          vista.tipo === "planta"
            ? (puntoPlanta(falso) ?? [impactoAlinear.point.x, impactoAlinear.point.y])
            : [impactoAlinear.point.x, impactoAlinear.point.y];
        const referencia = referenciaAlinear;
        if (!referencia) {
          const recta = rectaDeMalla(mallaAlinear);
          elegirReferenciaAlinear({
            tipo: "elemento",
            globalid: gidAlinear,
            cara: recta ? caraEnPunto(recta, puntoAlinear) : "centro",
          });
          return;
        }
        if (referencia.tipo === "nivel") {
          let zMin = Infinity;
          let zMax = -Infinity;
          for (let i = 2; i < mallaAlinear.vertices.length; i += 3) {
            const z = mallaAlinear.vertices[i];
            if (z < zMin) zMin = z;
            if (z > zMax) zMax = z;
          }
          const caraNivel =
            impactoAlinear.point.z > (zMin + zMax) / 2 ? "tope" : "base";
          void aplicarAlinear(gidAlinear, caraNivel, puntoAlinear);
          return;
        }
        let direccion: { ux: number; uy: number } | undefined;
        if (referencia.tipo === "eje") {
          const eje = referencias.ejes.find((e) => e.globalid === referencia.globalid);
          if (eje) {
            const recta = rectaDeEje(eje);
            direccion = { ux: recta.ux, uy: recta.uy };
          }
        } else if (referencia.tipo === "elemento") {
          const mallaRef = useModelo
            .getState()
            .mallas.find((m) => m.globalid === referencia.globalid);
          const recta = mallaRef ? rectaDeMalla(mallaRef) : null;
          if (recta) direccion = { ux: recta.ux, uy: recta.uy };
        } else {
          direccion = { ux: 1, uy: 0 };
        }
        const recta = rectaDeMalla(mallaAlinear, direccion);
        // Si se toca la cara del lado positivo, el centro queda del lado negativo
        // de la referencia (y al revés): el núcleo recibe la cara que coincide.
        const cara = recta
          ? caraEnPunto(recta, puntoAlinear) === "cara1"
            ? "cara2"
            : "cara1"
          : "cercana";
        void aplicarAlinear(gidAlinear, cara, puntoAlinear);
        return;
      }
      if (
        herramienta === "empujar" &&
        (vista.tipo === "iso" || vista.tipo === "perspectiva")
      ) {
        if (empujarCara) {
          void confirmarEmpujarCara();
          return;
        }
        if (empujarRect) {
          void confirmarEmpujar();
          return;
        }
        const caraHover = caraBajoCursor(clientX, clientY);
        const res = inferenciaEmpujarEn(clientX, clientY, shift);
        // O056: una cara que se puede empujar manda sobre las inferencias; el
        // enganche se usa después, al mover el ratón, para fijar la distancia.
        // Excepción: en una cara vertical, un enganche a su borde superior
        // (O049: el punto medio del borde de una losa) sigue dibujando sobre
        // la superficie de arriba en vez de empujar el canto.
        if (caraHover && caraHover.clasificacion.accion !== "ninguna") {
          const vertical = Math.abs(caraHover.normal[2]) < 0.5;
          const zMax = Math.max(...caraHover.poligono.map((p) => p.z));
          const engancheArriba =
            vertical &&
            !!res &&
            !!res.punto &&
            !!res.inf.tipo &&
            res.inf.tipo !== "plano" &&
            res.punto.z >= zMax - 1e-6;
          if (!engancheArriba) {
            setCaraEmpujarHover(null);
            iniciarEmpujarCara({
              globalid: caraHover.globalid,
              normal: caraHover.normal,
              punto: caraHover.punto,
              accion: caraHover.clasificacion.accion as Exclude<
                AccionEmpujarCara,
                "ninguna"
              >,
              etiqueta: caraHover.clasificacion.etiqueta,
              poligono: caraHover.poligono,
            });
            return;
          }
        }
        setCaraEmpujarHover(null);
        if (!res || !res.punto) return;
        // O049: si el primer punto cae sobre una cara superior, el contorno se
        // dibuja en su plano y el sólido nace con ese desfase.
        const cara = caraSuperiorEn(res.punto, res.candidatos.caras ?? []);
        // La cota sale del punto ya redondeado (no del vértice float32 de la
        // malla) para que el desfase guardado sea 0.12 y no 0.119999997.
        void clicEmpujar(
          [res.punto.x, res.punto.y],
          cara ? res.punto.z : undefined,
        );
        return;
      }
      if (herramienta === "nivel" && (vista.tipo === "alzado" || vista.tipo === "corte")) {
        const punto = puntoVistaDesdeEvento(clientX, clientY);
        if (punto) void clicNivel(punto);
        return;
      }
      if (herramienta === "recortar_extender" && vista.tipo === "planta") {
        const punto = puntoPlanta(falso);
        if (!punto) return;
        const estado = useModelo.getState();
        const pendiente =
          estado.modoRecorte === "esquina"
            ? !estado.recorteInicial
            : !estado.referenciaRecorte;
        let objetivo: { tipo: "eje" | "elemento"; globalid: string } | null = null;
        if (pendiente && estado.modoRecorte !== "esquina") {
          const linea = lineaEjeEn(clientX, clientY);
          if (linea) objetivo = { tipo: "eje", globalid: linea };
        }
        if (!objetivo) {
          const rect = nodo.getBoundingClientRect();
          const raton = new THREE.Vector2(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1,
          );
          const rayo = new THREE.Raycaster();
          rayo.setFromCamera(raton, camera);
          const impacto = rayo.intersectObjects(meshes.current, false)[0];
          const gid = impacto?.object.userData.globalid as string | undefined;
          if (gid) objetivo = { tipo: "elemento", globalid: gid };
        }
        if (objetivo) void clicRecorte({ ...objetivo, punto });
        return;
      }
      if (herramienta && vista.tipo === "planta") {
        const punto = puntoPlanta(falso);
        if (punto) {
          void clicEnPlanta(punto, shift, agregar, metrosPorPixelActual());
        }
        return;
      }
      const rect = nodo.getBoundingClientRect();
      const raton = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      const rayo = new THREE.Raycaster();
      rayo.setFromCamera(raton, camera);
      if (modoCorte && vista.tipo === "planta") {
        const z = vista.alturaPlano ?? caja.max[2] + 1;
        const plano = new THREE.Plane(new THREE.Vector3(0, 0, 1), -z);
        const punto = new THREE.Vector3();
        if (rayo.ray.intersectPlane(plano, punto)) {
          onPuntoCorte([punto.x, punto.y]);
        }
        return;
      }
      // Un solo clic en el texto de una cota la edita (como en Revit).
      const cotaClic = cotaEn(clientX, clientY);
      if (cotaClic && cotaClic.tipo !== "total") {
        abrirEditorCota(cotaClic, clientX, clientY);
        return;
      }
      // O011: primero las asas y las líneas de eje; después las mallas.
      const asa = asaEjeEn(clientX, clientY);
      if (asa) {
        setEjeSeleccionado(asa.globalid);
        setCandados({ inicio: false, fin: false });
        setMenuEje(null);
        onSeleccionar(null, agregar);
        return;
      }
      const linea = lineaEjeEn(clientX, clientY);
      if (linea) {
        setEjeSeleccionado(linea);
        setCandados({ inicio: false, fin: false });
        setMenuEje(null);
        onSeleccionar(null, agregar);
        return;
      }
      // O029: elegir un nivel en el alzado para Copiar/Mover desde Modificar.
      const nivelTocado = lineaNivelEn(clientX, clientY);
      if (nivelTocado) {
        fijarNivelSeleccionado(nivelTocado);
        setEjeSeleccionado(null);
        setCandados({ inicio: false, fin: false });
        setMenuEje(null);
        onSeleccionar(null, agregar);
        return;
      }
      setEjeSeleccionado(null);
      const impacto = rayo.intersectObjects(meshes.current, false)[0];
      const gidTocado = impacto?.object.userData.globalid ?? null;
      // O038: lo bloqueado en el árbol se ve pero no se puede seleccionar.
      if (gidTocado && elementosBloqueados.includes(gidTocado)) {
        onSeleccionar(null, agregar);
        return;
      }
      onSeleccionar(gidTocado, agregar);
    };

    // O027: el codo se crea cuando el arrastre supera el umbral de 3 px, no al
    // pulsar, para que un clic normal sobre el asa no deje un codo suelto.
    const prepararCodoArrastre = (
      asa: (typeof ejesInteraccion.current)[number],
      ctx: NonNullable<typeof contextoEje.current>,
      inicial: Record<string, AjusteEjeVista>,
    ) => {
      const bases = ctx.bases[asa.globalid];
      const ajuste = inicial[asa.globalid];
      if (!bases) return;
      const g = geometriaEje(ajuste, bases.inicio, bases.fin, {
        globoInicio: true,
        diametroGlobo: mmPapelAMetros(8, vista.escala),
      });
      const globo = asa.lado === "inicio" ? (g.globoInicio ?? bases.inicio) : g.globoFin;
      const dx = bases.fin[0] - bases.inicio[0];
      const dy = bases.fin[1] - bases.inicio[1];
      const largo = Math.hypot(dx, dy);
      if (largo <= 1e-9) return;
      const direccion: Punto2 =
        asa.lado === "inicio" ? [-dx / largo, -dy / largo] : [dx / largo, dy / largo];
      inicial[asa.globalid] = agregarCodoEje(
        ajuste,
        asa.lado,
        globo,
        direccion,
        mmPapelAMetros(8, vista.escala),
        crucesDeEjeVista(asa.globalid),
      );
    };

    const alBajar = (evento: PointerEvent) => {
      // O011: los botones y menús flotantes sobre el visor no deben iniciar
      // selección ni desmontarse al soltar (el evento burbujea hasta el contenedor).
      if (
        evento.target instanceof Element &&
        evento.target.closest("button, [role='menu'], input, select, textarea")
      ) {
        return;
      }
      if (evento.pointerType === "touch") {
        evento.preventDefault();
        toques.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });
        try {
          nodo.setPointerCapture(evento.pointerId);
        } catch {
          /* el puntero pudo terminar antes */
        }
        if (toques.size === 1) {
          toqueInicial = {
            x: evento.clientX,
            y: evento.clientY,
            ms: performance.now(),
            movido: false,
          };
          pinza = null;
        } else if (toques.size === 2) {
          const [a, b] = [...toques.values()];
          pinza = {
            dist: Math.hypot(a.x - b.x, a.y - b.y),
            cx: (a.x + b.x) / 2,
            cy: (a.y + b.y) / 2,
          };
          if (toqueInicial) toqueInicial.movido = true;
        }
        return;
      }
      const botonMedio = evento.button === 1;
      const izquierdo = evento.button === 0;
      const es3dVista = vista.tipo === "iso" || vista.tipo === "perspectiva";
      // O020: el botón derecho orbita en 3D; en 2D no hace nada aquí.
      if (evento.button === 2 && !es3dVista) return;
      if (!botonMedio && !izquierdo && evento.button !== 2) return;
      // O006d: doble clic con el botón medio = Ajustar (el `dblclick` del navegador
      // no siempre conserva `button = 1` en WebKitGTK).
      if (botonMedio) {
        const ahora = performance.now();
        if (ahora - ultimoMedio.current < 400) {
          ultimoMedio.current = 0;
          evento.preventDefault();
          ajustar();
          return;
        }
        ultimoMedio.current = ahora;
      }
      const accion = accionArrastre({
        boton: evento.button,
        shift: evento.shiftKey,
        espacio: espacio.current,
        modoOrbitar,
        es3d: es3dVista,
      });
      const paneable = accion !== "seleccionar";
      if (paneable) {
        evento.preventDefault();
        nodo.style.cursor = "grabbing";
      }
      // O034: arrastrar el asa del borde de una losa en planta.
      if (izquierdo && !paneable && !herramienta && !modoCorte && vista.tipo === "planta") {
        const asaLosa = asaLosaEn(evento.clientX, evento.clientY);
        if (asaLosa) {
          soltarLosaCancelado.current = false;
          const punto = puntoPlanta(evento);
          if (punto) {
            const props = useModelo.getState().propiedades;
            const pset = props?.psets?.OPENRVT_Losa as
              | Record<string, unknown>
              | undefined;
            const crudo = pset?.Contorno;
            arrastreLosa.current = {
              globalid: props?.globalid ?? "",
              indice: asaLosa.indice,
              desfaseInicial: asaLosa.desfase,
              desfase: asaLosa.desfase,
              normal: asaLosa.normal,
              medio: asaLosa.medio,
              inicio: punto,
              poligono: leerPoligonoWkt(typeof crudo === "string" ? crudo : null),
              movido: false,
              pantallaInicio: { x: evento.clientX, y: evento.clientY },
            };
            setPreviewLosaPx(null);
            setEditorDesfaseLosa(null);
            try {
              nodo.setPointerCapture(evento.pointerId);
            } catch {
              /* eventos sintéticos de las pruebas */
            }
            evento.preventDefault();
            return;
          }
        }
      }
      // O014b: arrastrar una cabeza de nivel para colocarla a mano.
      if (izquierdo && !paneable && !herramienta && !modoCorte) {
        const asaNivel = asaNivelEn(evento.clientX, evento.clientY);
        const puntoNivel = asaNivel
          ? puntoVistaDesdeEvento(evento.clientX, evento.clientY)
          : null;
        if (asaNivel && puntoNivel) {
          arrastreNivel.current = {
            globalid: asaNivel.globalid,
            elev: asaNivel.elev,
            desplazamiento: asaNivel.desplazamiento,
            desplazamientoInicial: asaNivel.desplazamiento,
            inicio: puntoNivel,
            pantallaInicio: { x: evento.clientX, y: evento.clientY },
            movido: false,
          };
          setAjustesNivelEnCurso({});
          evento.preventDefault();
          return;
        }
      }
      // O011: arrastrar un globo, un extremo libre o un codo de eje.
      if (izquierdo && !paneable && !herramienta && !modoCorte) {
        const asa = asaEjeEn(evento.clientX, evento.clientY);
        const ctx = contextoEje.current;
        if (asa && ctx) {
          const eje = referencias.ejes.find((e) => e.globalid === asa.globalid);
          const punto = puntoVistaDesdeEvento(evento.clientX, evento.clientY);
          if (eje && punto) {
            setEjeSeleccionado(asa.globalid);
            setMenuEje(null);
            const inicial: Record<string, AjusteEjeVista> = JSON.parse(
              JSON.stringify(vista.ejes ?? {}),
            );
            const inicialConCambios = ajusteEnCurso
              ? JSON.parse(JSON.stringify(ajusteEnCurso))
              : inicial;
            arrastreEje.current = {
              globalid: asa.globalid,
              etiqueta: asa.etiqueta,
              lado: asa.lado,
              indice: asa.tipo === "codo" ? asa.indice : null,
              candado: candadoArrastreAsa(
                asa.tipo,
                !candados[asa.lado],
                !!(asa.lado === "inicio"
                  ? vista.ejes?.[asa.globalid]?.codosInicio
                  : vista.ejes?.[asa.globalid]?.codosFin
                )?.length,
              ),
              familia:
                ctx.tipo === "planta"
                  ? eje.vertical
                    ? "vertical"
                    : "horizontal"
                  : "alzado",
              inicio: punto,
              // El asa del extremo de la línea se dibuja justo en su punto; la del
              // globo y la del codo nuevo no (el globo va un radio arriba).
              asaInicio: asa.tipo !== "base" && ctx.bases[asa.globalid]
                ? puntoAsaEje(
                    inicialConCambios[asa.globalid],
                    ctx.bases[asa.globalid],
                    asa.lado,
                    asa.tipo,
                    asa.tipo === "codo" ? asa.indice : null,
                  )
                : (puntoVistaDeMundo(asa.punto) ?? punto),
              originales: inicial,
              movido: false,
              tipo: asa.tipo,
              pantallaInicio: { x: evento.clientX, y: evento.clientY },
              codoCreado: false,
              modoCodo: null,
            };
            ajusteEnCursoRef.current = inicialConCambios;
            setAjusteEnCurso(inicialConCambios);
            setGuiaCodo(null);
          }
          evento.preventDefault();
          return;
        }
      }
      // El clic izquierdo también se registra: al soltar se selecciona o se toma el
      // punto del corte, pero solo se arrastra cuando toca (botón medio o espacio).
      arrastre.current = {
        x: evento.clientX,
        y: evento.clientY,
        inicioX: evento.clientX,
        inicioY: evento.clientY,
        boton: evento.button,
        movido: false,
        paneable,
        accion,
      };
      if (!paneable) setVentanaSeleccion(null);
      if (paneable) {
        try {
          nodo.setPointerCapture(evento.pointerId);
        } catch {
          /* los eventos sintéticos de las pruebas no tienen puntero activo */
        }
      }
    };
    const alMover = (evento: PointerEvent) => {
      const nav = navegacion.current;
      const camera = camara.current;
      if (!nav || !camera) return;
      if (evento.pointerType !== "touch") {
        ultimoPuntero.current = { x: evento.clientX, y: evento.clientY };
      }
      // O041: al pasar el cursor se resalta lo que Tab seleccionaría a continuación.
      if (
        evento.buttons === 0 &&
        evento.pointerType !== "touch" &&
        !arrastre.current &&
        !arrastreLosa.current &&
        !arrastreNivel.current &&
        !arrastreEje.current &&
        !herramienta &&
        !modoCorte
      ) {
        const candidatos = candidatosEn(evento.clientX, evento.clientY);
        const siguiente = siguienteCandidato(
          candidatos,
          useModelo.getState().seleccion,
        );
        const gid = siguiente?.globalid ?? null;
        if (gid !== resaltadoRef.current) {
          resaltadoRef.current = gid;
          setResaltado(gid);
          fijarPistaTab(textoPistaTab(siguiente));
        }
      }
      if (
        herramienta === "recortar_extender" &&
        vista.tipo === "planta" &&
        evento.buttons === 0
      ) {
        const estado = useModelo.getState();
        const hayReferencia =
          estado.modoRecorte === "esquina"
            ? !!estado.recorteInicial
            : !!estado.referenciaRecorte;
        if (hayReferencia) {
          const punto = puntoPlanta(evento);
          const rect = nodo.getBoundingClientRect();
          const raton = new THREE.Vector2(
            ((evento.clientX - rect.left) / rect.width) * 2 - 1,
            -((evento.clientY - rect.top) / rect.height) * 2 + 1,
          );
          const rayo = new THREE.Raycaster();
          rayo.setFromCamera(raton, camera);
          const impacto = rayo.intersectObjects(meshes.current, false)[0];
          const gid = impacto?.object.userData.globalid as string | undefined;
          if (punto && gid) estado.previsualizarRecorte(gid, punto);
          else if (estado.vistaPreviaRecorte) estado.previsualizarRecorte("", [0, 0]);
        }
      }
      // O034: el borde de la losa sigue al puntero en su normal exterior.
      const arrLosa = arrastreLosa.current;
      if (arrLosa) {
        if (!arrLosa.movido) {
          const recorrido = Math.hypot(
            evento.clientX - arrLosa.pantallaInicio.x,
            evento.clientY - arrLosa.pantallaInicio.y,
          );
          if (recorrido < 3) return;
          arrLosa.movido = true;
        }
        const crudo = puntoPlanta(evento);
        if (!crudo) return;
        // O034: primero los imanes de la planta (extremos, medios, cruces e
        // intersecciones); si no hay ninguno, se usa el punto y el redondeo de
        // 0.005 m de `desfaseConArrastre`.
        const enganche = buscarEnganche(
          crudo,
          useModelo.getState().referencias,
          null,
          mundoPorPxRef.current,
        );
        const punto = enganche.tipo === "cuadricula" ? crudo : enganche.punto;
        const delta: Punto2 = [
          punto[0] - arrLosa.inicio[0],
          punto[1] - arrLosa.inicio[1],
        ];
        const nuevo = desfaseConArrastre(
          arrLosa.desfaseInicial,
          arrLosa.normal,
          delta,
        );
        arrLosa.desfase = nuevo;
        const rect = nodo.getBoundingClientRect();
        const z = (vista.alturaPlano ?? caja.max[2]) + 0.02;
        if (arrLosa.poligono) {
          const contorno = contornoPrevio(
            arrLosa.poligono,
            arrLosa.indice,
            arrLosa.normal,
            nuevo - arrLosa.desfaseInicial,
          );
          const puntos = contorno
            ? contorno.map((punto) => {
                const pantalla = pantallaDePunto([punto[0], punto[1], z]);
                return pantalla
                  ? { x: pantalla.x - rect.left, y: pantalla.y - rect.top }
                  : null;
              })
            : null;
          setPreviewLosaPx(
            puntos && puntos.every((punto) => punto !== null)
              ? (puntos as Array<{ x: number; y: number }>)
              : null,
          );
        } else {
          setPreviewLosaPx(null);
        }
        const desplazamiento = nuevo - arrLosa.desfaseInicial;
        const medioNuevo: Punto2 = [
          arrLosa.medio[0] + arrLosa.normal[0] * desplazamiento,
          arrLosa.medio[1] + arrLosa.normal[1] * desplazamiento,
        ];
        const antes = pantallaDePunto([arrLosa.medio[0], arrLosa.medio[1], z]);
        const despues = pantallaDePunto([medioNuevo[0], medioNuevo[1], z]);
        if (antes && despues) {
          const signo = nuevo > 0 ? "+" : "";
          // Dos decimales como en la cota de Revit («+0.20»); solo se añade el
          // tercero cuando el paso de 0.005 m lo necesita.
          const decimales =
            Math.abs(Math.round(nuevo * 1000) % 10) < 1e-9 ? 2 : 3;
          setGuiaArrastre({
            x1: antes.x - rect.left,
            y1: antes.y - rect.top,
            x2: despues.x - rect.left,
            y2: despues.y - rect.top,
            texto: `${signo}${nuevo.toFixed(decimales)} m`,
            enganchado: true,
          });
        }
        evento.preventDefault();
        return;
      }
      // O014b: la cabeza de nivel sigue al puntero en vertical.
      const arrNivel = arrastreNivel.current;
      if (arrNivel) {
        // Umbral de 3 px: un clic sobre la cabeza no la mueve ni le crea codo.
        if (!arrNivel.movido) {
          const recorrido = Math.hypot(
            evento.clientX - arrNivel.pantallaInicio.x,
            evento.clientY - arrNivel.pantallaInicio.y,
          );
          if (recorrido < 3) return;
        }
        const punto = puntoVistaDesdeEvento(evento.clientX, evento.clientY);
        if (punto) {
          arrNivel.movido = true;
          // Suma lo que se movió el puntero al desplazamiento que tenía (no salta
          // a donde se pulsó) y se engancha de vuelta sobre su línea.
          const { valor: desplazamiento, enganchado } = desplazamientoArrastreNivel(
            arrNivel.desplazamientoInicial,
            arrNivel.inicio[1],
            punto[1],
            8 * mundoPorPxRef.current,
            evento.shiftKey,
          );
          arrNivel.desplazamiento = desplazamiento;
          setAjustesNivelEnCurso({
            [arrNivel.globalid]: { desplazamiento },
          });
          const rect = nodo.getBoundingClientRect();
          const py = evento.clientY - rect.top;
          setGuiaArrastre({
            x1: 0,
            y1: py,
            x2: rect.width,
            y2: py,
            texto: `${desplazamiento.toFixed(3)} m`,
            enganchado,
          });
          evento.preventDefault();
          return;
        }
      }
      // O027: movimiento restringido de un extremo, globo o codo de eje.
      const arrEje = arrastreEje.current;
      if (arrEje) {
        const ctx = contextoEje.current;
        if (!ctx) return;
        // Umbral de 3 px: un clic no inicia el arrastre ni crea codos.
        if (!arrEje.movido) {
          const recorrido = Math.hypot(
            evento.clientX - arrEje.pantallaInicio.x,
            evento.clientY - arrEje.pantallaInicio.y,
          );
          if (recorrido < 3) return;
          arrEje.movido = true;
          if (arrEje.tipo === "codo-nuevo" && !arrEje.codoCreado) {
            const inicial: Record<string, AjusteEjeVista> = JSON.parse(
              JSON.stringify(arrEje.originales),
            );
            prepararCodoArrastre(
              {
                globalid: arrEje.globalid,
                etiqueta: arrEje.etiqueta,
                lado: arrEje.lado,
                tipo: "codo-nuevo",
                indice: null,
                punto: [0, 0, 0],
              },
              ctx,
              inicial,
            );
            arrEje.originales = inicial;
            arrEje.codoCreado = true;
            // O042: el codo ya tiene sus dos nodos; el arrastre sigue sobre V2.
            const creado = inicial[arrEje.globalid];
            const codosCreados =
              (arrEje.lado === "inicio" ? creado?.codosInicio : creado?.codosFin) ?? [];
            if (codosCreados.length >= 2) {
              arrEje.tipo = "codo";
              arrEje.indice = 1;
              arrEje.asaInicio = [codosCreados[1][0], codosCreados[1][1]];
              arrEje.modoCodo = null;
            }
            const conCodo = { ...(ajusteEnCursoRef.current ?? {}), ...inicial };
            ajusteEnCursoRef.current = conCodo;
            setAjusteEnCurso(conCodo);
          }
        }
        const punto = puntoVistaDesdeEvento(evento.clientX, evento.clientY);
        if (!punto) return;
        const direccion: DireccionEjeArrastre =
          arrEje.familia === "horizontal" ? "horizontal" : "vertical";
        const ajusteEje =
          normalizarAjusteEje(
            (ajusteEnCursoRef.current ?? arrEje.originales)[arrEje.globalid] ??
              arrEje.originales[arrEje.globalid],
          ) ?? {};
        const codosLado =
          (arrEje.lado === "inicio" ? ajusteEje.codosInicio : ajusteEje.codosFin) ?? [];
        let tipoAsa: TipoAsaArrastre;
        if (arrEje.tipo === "base") tipoAsa = "extremo";
        else if (arrEje.tipo === "codo") tipoAsa = "codo";
        else tipoAsa = codosLado.length > 0 ? "globo" : "extremo";

        // O044: V1 solo se mueve a lo largo del eje; V2 en X o en Y. La dirección
        // de V2 se elige con el componente mayor de los primeros 4 px y queda fija
        // hasta soltar; el siguiente arrastre puede usar la otra.
        let modoCodo = arrEje.modoCodo;
        let destino: Punto2;
        if (arrEje.tipo === "codo" && arrEje.indice !== null) {
          const paso = mmPapelAMetros(1, vista.escala);
          const v1 = (codosLado[0] ?? arrEje.asaInicio) as Punto2;
          const v2 = (codosLado[1] ?? arrEje.asaInicio) as Punto2;
          if (arrEje.indice === 0) {
            const r = destinoArrastreCodo(v1, v2, arrEje.inicio, punto, direccion, 0, "eje", paso);
            destino = r.punto;
          } else {
            if (!modoCodo) {
              const recorrido = Math.hypot(
                evento.clientX - arrEje.pantallaInicio.x,
                evento.clientY - arrEje.pantallaInicio.y,
              );
              if (recorrido < 4) return;
              const deltaMundo: Punto2 = [
                punto[0] - arrEje.inicio[0],
                punto[1] - arrEje.inicio[1],
              ];
              modoCodo =
                Math.abs(deltaMundo[0]) >= Math.abs(deltaMundo[1]) ? "x" : "y";
              arrEje.modoCodo = modoCodo;
            }
            const r = destinoArrastreCodo(
              v1,
              v2,
              arrEje.inicio,
              punto,
              direccion,
              1,
              modoCodo,
              paso,
            );
            destino = r.punto;
          }
        } else {
          // El destino parte del asa, no del puntero: pulsar fuera del centro ya no
          // hace saltar el punto ni lo saca de su línea de restricción.
          destino = destinoArrastreAsa(
            arrEje.asaInicio,
            arrEje.inicio,
            punto,
            tipoAsa,
            direccion,
            evento.shiftKey,
          );
        }

        // Imanes: extremos a la alineación de los demás ejes (o a los niveles en
        // alzado); globos desplazados a múltiplos de un diámetro.
        let enganchado = false;
        const tolerancia = 8 * mundoPorPxRef.current;
        if (!evento.shiftKey && tipoAsa === "globo") {
          const perp = direccion === "vertical" ? 0 : 1;
          const iman = imanMultiplo(
            destino[perp],
            arrEje.asaInicio[perp],
            altoBurbujaRef.current,
            tolerancia,
          );
          if (iman.enganchado) {
            destino[perp] = iman.valor;
            enganchado = true;
          }
        } else if (!evento.shiftKey && tipoAsa === "extremo") {
          const along = direccion === "vertical" ? 1 : 0;
          const candidatos: number[] = [];
          if (ctx.tipo === "planta") {
            for (const otro of referencias.ejes) {
              if (otro.globalid === arrEje.globalid) continue;
              if (otro.vertical !== (direccion === "vertical")) continue;
              const b = ctx.bases[otro.globalid];
              if (!b) continue;
              for (const lado of ["inicio", "fin"] as const) {
                candidatos.push(
                  extremoEje(arrEje.originales[otro.globalid], lado, b.inicio, b.fin)[along],
                );
              }
            }
          } else {
            for (const nivel of niveles) candidatos.push(nivel.elevacion);
          }
          const iman = imanAlineacion(destino[along], candidatos, tolerancia);
          if (iman.enganchado) {
            destino[along] = iman.valor;
            enganchado = true;
          }
        }

        // Cota temporal y línea guía mientras se arrastra.
        const rect = nodo.getBoundingClientRect();
        const distancia = Math.hypot(
          destino[0] - arrEje.asaInicio[0],
          destino[1] - arrEje.asaInicio[1],
        );
        const guiaVertical =
          arrEje.tipo === "codo" && modoCodo
            ? modoCodo === "eje"
              ? direccion === "vertical"
              : modoCodo === "y"
            : tipoAsa === "globo"
              ? direccion === "vertical"
              : direccion === "horizontal";
        const px = evento.clientX - rect.left;
        const py = evento.clientY - rect.top;
        setGuiaArrastre({
          x1: guiaVertical ? px : 0,
          y1: guiaVertical ? 0 : py,
          x2: guiaVertical ? px : rect.width,
          y2: guiaVertical ? rect.height : py,
          texto: `${distancia.toFixed(3)} m`,
          enganchado,
        });

        const cambios: Record<string, AjusteEjeVista> = {
          ...(ajusteEnCursoRef.current ?? {}),
        };
        if (arrEje.indice !== null) {
          const actual = normalizarAjusteEje(cambios[arrEje.globalid] ?? arrEje.originales[arrEje.globalid]) ?? {};
          const clave = arrEje.lado === "inicio" ? "codosInicio" : "codosFin";
          const codos = [...(actual[clave] ?? [])];
          codos[arrEje.indice] = [destino[0], destino[1]];
          // O044: los dos nodos son independientes. El globo se deriva de V2, así
          // que arrastrar V1 no mueve el tramo final ni el globo.
          cambios[arrEje.globalid] = { ...actual, [clave]: codos };
        } else {
          // O021: candado cerrado = arrastra la alineación común de los ejes
          // paralelos; abierto = solo este eje. La decisión vive en una función pura.
          const siguientes = arrastrarExtremoEje(
            cambios,
            ctx.bases,
            referencias.ejes,
            arrEje.globalid,
            arrEje.lado,
            [destino[0], destino[1]],
            arrEje.candado,
            arrEje.familia,
          );
          Object.assign(cambios, siguientes);
        }
        ajusteEnCursoRef.current = cambios;
        setAjusteEnCurso(cambios);
        evento.preventDefault();
        return;
      }
      // O027: resaltado y cursor de la dirección permitida al pasar por un asa.
      if (!arrastre.current?.paneable && !arrastreEje.current) {
        const asaHover = asaEjeEn(evento.clientX, evento.clientY);
        for (const objeto of grupo.current?.children ?? []) {
          const datos = objeto.userData?.asaEje as
            | { globalid: string; lado: LadoEje; tipo: string; indice: number | null }
            | undefined;
          if (!datos) continue;
          const material = (objeto as unknown as THREE.Points).material as
            | THREE.PointsMaterial
            | undefined;
          if (!material) continue;
          const activa =
            !!asaHover &&
            datos.globalid === asaHover.globalid &&
            datos.lado === asaHover.lado &&
            datos.tipo === asaHover.tipo &&
            datos.indice === asaHover.indice;
          objeto.visible =
            activa ||
            ejeSeleccionadoRef.current === null ||
            datos.globalid === ejeSeleccionadoRef.current;
          material.color.set(
            activa
              ? "#38bdf8"
              : datos.globalid === ejeSeleccionadoRef.current
                ? "#f59e0b"
                : "#94a3b8",
          );
          material.size =
            datos.tipo === "codo" ? (activa ? 6 : 5) : activa ? 16 : 12;
        }
        if (asaHover) {
          const ctxHover = contextoEje.current;
          const ejeHover = referencias.ejes.find((e) => e.globalid === asaHover.globalid);
          const vertical = ctxHover?.tipo === "planta" ? !!ejeHover?.vertical : true;
          if (asaHover.tipo === "codo") {
            const pAsa = pantallaDePunto(asaHover.punto);
            if (pAsa) {
              const rectHover = nodo.getBoundingClientRect();
              setGuiaCodo({
                x: pAsa.x - rectHover.left,
                y: pAsa.y - rectHover.top,
                vertical,
                ambos: asaHover.indice === 1,
              });
            }
          } else {
            setGuiaCodo(null);
          }
          const ajusteHover = ajusteActualEje(asaHover.globalid);
          const codosHover =
            (asaHover.lado === "inicio"
              ? ajusteHover?.codosInicio
              : ajusteHover?.codosFin) ?? [];
          const tipoHover =
            asaHover.tipo === "base"
              ? "extremo"
              : asaHover.tipo === "codo"
                ? "codo"
                : codosHover.length > 0
                  ? "globo"
                  : "extremo";
          const mueveVertical = tipoHover === "globo" ? !vertical : vertical;
          nodo.style.cursor = mueveVertical ? "ns-resize" : "ew-resize";
          nodo.dataset.asaResaltada = `${asaHover.etiqueta}/${asaHover.lado}/${asaHover.tipo}`;
          nodo.dataset.asaCursor = mueveVertical ? "vertical" : "horizontal";
        } else {
          nodo.dataset.asaCursor = "";
          nodo.dataset.asaResaltada = "";
          setGuiaCodo(null);
          if (!herramienta && !modoCorte) nodo.style.cursor = "";
        }
      }
      if (evento.pointerType === "touch" && toques.has(evento.pointerId)) {
        evento.preventDefault();
        const anterior = toques.get(evento.pointerId)!;
        toques.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });
        if (toques.size >= 2) {
          const [a, b] = [...toques.values()];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          const cx = (a.x + b.x) / 2;
          const cy = (a.y + b.y) / 2;
          if (pinza && dist > 1) {
            zoomEnPantalla(pinza.dist / dist, cx, cy);
            panearPixeles(cx - pinza.cx, cy - pinza.cy);
          }
          pinza = { dist, cx, cy };
        } else {
          panearPixeles(evento.clientX - anterior.x, evento.clientY - anterior.y);
          if (
            toqueInicial &&
            Math.hypot(
              evento.clientX - toqueInicial.x,
              evento.clientY - toqueInicial.y,
            ) > 4
          ) {
            toqueInicial.movido = true;
          }
        }
        aplicarCamara();
        return;
      }
      if (
        herramienta === "empujar" &&
        (vista.tipo === "iso" || vista.tipo === "perspectiva") &&
        evento.buttons === 0 &&
        !arrastre.current?.paneable
      ) {
        if (empujarCara) {
          const rayo = rayoPantalla(evento.clientX, evento.clientY);
          if (!rayo) return;
          const rayo3 = {
            origen: { x: rayo.origen[0], y: rayo.origen[1], z: rayo.origen[2] },
            direccion: {
              x: rayo.direccion[0],
              y: rayo.direccion[1],
              z: rayo.direccion[2],
            },
          };
          const normal = {
            x: empujarCara.normal[0],
            y: empujarCara.normal[1],
            z: empujarCara.normal[2],
          };
          const puntoCara = {
            x: empujarCara.punto[0],
            y: empujarCara.punto[1],
            z: empujarCara.punto[2],
          };
          const inf = inferir({
            rayo: rayo3,
            proyectar: proyectarLienzo,
            candidatos: candidatosSin(
              empujarCara.globalid,
              evento.clientX,
              evento.clientY,
            ),
            planoTrabajo: { punto: puntoCara, normal },
          });
          anotarInferenciaEmpujar(inf);
          let distancia: number | null;
          if (inf.punto && inf.tipo && inf.tipo !== "plano") {
            distancia =
              (inf.punto.x - puntoCara.x) * normal.x +
              (inf.punto.y - puntoCara.y) * normal.y +
              (inf.punto.z - puntoCara.z) * normal.z;
          } else {
            distancia = distanciaSobreNormal(rayo3, puntoCara, normal);
          }
          if (distancia !== null) {
            moverEmpujarCara(Math.round(distancia * 1e6) / 1e6);
          }
          return;
        }
        if (empujarRect) {
          setMarcadorEmpujar(null);
          setGuiaEmpujar(null);
          ultimaInferenciaEmpujar.current = null;
          const centro: [number, number, number] = [
            (empujarRect.x1 + empujarRect.x2) / 2,
            (empujarRect.y1 + empujarRect.y2) / 2,
            empujarZ ?? zEmpujar,
          ];
          const rayo = rayoPantalla(evento.clientX, evento.clientY);
          const altura = rayo ? alturaEnEjeVertical(rayo, centro) : null;
          if (altura !== null) {
            // Cerca del plano se toma como altura cero: evita sólidos de micras.
            fijarAlturaEmpujar(Math.abs(altura) < 0.005 ? 0 : altura);
          }
          return;
        }
        const caraHover = caraBajoCursor(evento.clientX, evento.clientY);
        if (caraHover) {
          const rect = nodo.getBoundingClientRect();
          setCaraEmpujarHover({
            ...caraHover,
            x: evento.clientX - rect.left,
            y: evento.clientY - rect.top,
            tooltipIzquierda: evento.clientX - rect.left > rect.width * 0.7,
          });
        } else {
          setCaraEmpujarHover(null);
        }
        const res = inferenciaEmpujarEn(evento.clientX, evento.clientY, evento.shiftKey);
        // Los enganches (vértice, arista, punto medio, cara) mandan sobre la
        // cara que haya debajo: así O049 sigue enganchando bordes de una losa
        // aunque el rayo roce su cara lateral.
        if (res && res.punto && res.inf.tipo && res.inf.tipo !== "plano") {
          moverEmpujar([res.punto.x, res.punto.y]);
          return;
        }
        if (caraHover) return;
        if (res && res.punto) {
          moverEmpujar([res.punto.x, res.punto.y]);
          return;
        }
      }
      if (herramienta === "nivel" && (vista.tipo === "alzado" || vista.tipo === "corte")) {
        const punto = puntoVistaDesdeEvento(evento.clientX, evento.clientY);
        if (punto) fijarRaton(punto, evento.shiftKey, metrosPorPixelActual());
      } else if (herramienta && vista.tipo === "planta") {
        const punto = puntoPlanta(evento);
        if (punto) fijarRaton(punto, evento.shiftKey, metrosPorPixelActual());
      }
      const arr = arrastre.current;
      if (!arr) return;
      const dx = evento.clientX - arr.x;
      const dy = evento.clientY - arr.y;
      if (Math.abs(evento.clientX - arr.inicioX) + Math.abs(evento.clientY - arr.inicioY) > 4) {
        arr.movido = true;
      }
      arr.x = evento.clientX;
      arr.y = evento.clientY;
      if (!arr.paneable) {
        if (arr.movido && arr.boton === 0 && !herramienta) {
          const marco = nodo.getBoundingClientRect();
          setVentanaSeleccion({
            x1: arr.inicioX,
            y1: arr.inicioY,
            x2: evento.clientX,
            y2: evento.clientY,
            ox: marco.left,
            oy: marco.top,
          });
        }
        return;
      }
      // O020: la acción se decidió al pulsar (órbita o paneo), no por el botón.
      const panear = arr.accion === "panear";
      const alto = Math.max(nodo.clientHeight, 1);
      if (panear) {
        const derecha = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
        const arriba = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
        let escala = 1;
        if (camera instanceof THREE.OrthographicCamera) {
          escala = (camera.top - camera.bottom) / alto;
        } else if (camera instanceof THREE.PerspectiveCamera) {
          escala = (2 * nav.distancia * Math.tan((camera.fov * Math.PI) / 360)) / alto;
        }
        const desplazamiento = derecha
          .multiplyScalar(-dx * escala)
          .add(arriba.multiplyScalar(dy * escala));
        nav.objetivo.add(desplazamiento);
      } else {
        // Órbita: giro alrededor del objetivo.
        const yaw = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 0, 1),
          -dx * 0.006,
        );
        nav.direccion.applyQuaternion(yaw);
        const derecha = new THREE.Vector3().crossVectors(ARRIBA, nav.direccion).normalize();
        const pitch = new THREE.Quaternion().setFromAxisAngle(derecha, -dy * 0.006);
        nav.direccion.applyQuaternion(pitch).normalize();
        if (nav.direccion.z < 0.05) {
          nav.direccion.z = 0.05;
          nav.direccion.normalize();
        }
      }
      aplicarCamara();
    };
    const alSoltar = (evento: PointerEvent) => {
      if (evento.pointerType === "touch") {
        const estaba = toques.get(evento.pointerId);
        toques.delete(evento.pointerId);
        if (toques.size === 0) {
          const toque = toqueInicial;
          toqueInicial = null;
          pinza = null;
          if (
            toque &&
            !toque.movido &&
            estaba &&
            performance.now() - toque.ms < 350
          ) {
            hacerClic(
              evento.clientX,
              evento.clientY,
              evento.shiftKey,
              evento.ctrlKey || evento.metaKey || evento.altKey,
            );
          }
        } else if (toques.size === 1) {
          pinza = null;
          if (toqueInicial) toqueInicial.movido = true;
        }
        return;
      }
      if (soltarLosaCancelado.current) {
        soltarLosaCancelado.current = false;
        setPreviewLosaPx(null);
        setGuiaArrastre(null);
        return;
      }
      const arrLosa = arrastreLosa.current;
      if (arrLosa) {
        arrastreLosa.current = null;
        setPreviewLosaPx(null);
        setGuiaArrastre(null);
        if (arrLosa.movido) {
          if (arrLosa.globalid) {
            // Mismo comando que la tabla de Propiedades: un solo paso de deshacer.
            void useModelo
              .getState()
              .editarElemento(arrLosa.globalid, {
                cambio_borde: { indice: arrLosa.indice, desfase: arrLosa.desfase },
              });
          }
        } else {
          const rect = nodo.getBoundingClientRect();
          setEditorDesfaseLosa({
            globalid: arrLosa.globalid,
            indice: arrLosa.indice,
            izquierda: Math.max(70, Math.min(rect.width - 70, evento.clientX - rect.left)),
            arriba: Math.max(8, Math.min(rect.height - 48, evento.clientY - rect.top - 38)),
            valor: String(arrLosa.desfase),
          });
        }
        return;
      }
      const arrNivel = arrastreNivel.current;
      if (arrNivel) {
        arrastreNivel.current = null;
        if (arrNivel.movido) {
          void fijarAjustesNiveles(vista.id, {
            [arrNivel.globalid]:
              normalizarAjusteNivel({ desplazamiento: arrNivel.desplazamiento }) ?? null,
          });
        }
        setAjustesNivelEnCurso({});
        setGuiaArrastre(null);
        return;
      }
      const arrEje = arrastreEje.current;
      if (arrEje) {
        arrastreEje.current = null;
        const cambios = ajusteEnCursoRef.current;
        if (arrEje.movido && cambios) {
          // Una sola escritura al soltar = una sola entrada de deshacer.
          void fijarAjustesEjes(vista.id, cambios);
        }
        ajusteEnCursoRef.current = null;
        setAjusteEnCurso(null);
        setGuiaArrastre(null);
        return;
      }
      const arr = arrastre.current;
      arrastre.current = null;
      const rectangulo = ventanaSeleccion;
      setVentanaSeleccion(null);
      nodo.style.cursor = modoCorte || herramienta ? "crosshair" : "";
      if (!arr) return;
      if (arr.movido) {
        if (
          arr.boton === 0 &&
          !arr.paneable &&
          !herramienta &&
          rectangulo &&
          camara.current
        ) {
          const x1 = Math.min(rectangulo.x1, rectangulo.x2);
          const x2 = Math.max(rectangulo.x1, rectangulo.x2);
          const y1 = Math.min(rectangulo.y1, rectangulo.y2);
          const y2 = Math.max(rectangulo.y1, rectangulo.y2);
          const rect = nodo.getBoundingClientRect();
          const encontrados: string[] = [];
          for (const malla of meshes.current) {
            malla.geometry.computeBoundingSphere();
            const centro = malla.geometry.boundingSphere?.center;
            if (!centro) continue;
            const proyectado = centro.clone().project(camara.current);
            const x = rect.left + ((proyectado.x + 1) / 2) * rect.width;
            const y = rect.top + ((1 - proyectado.y) / 2) * rect.height;
            if (x >= x1 && x <= x2 && y >= y1 && y <= y2) {
              const gid = malla.userData.globalid as string | undefined;
              if (gid && !encontrados.includes(gid)) encontrados.push(gid);
            }
          }
          onSeleccionarVarios(encontrados);
        }
        return;
      }
      if (evento.button === 0 && !espacio.current) {
        const es3dClic = vista.tipo === "iso" || vista.tipo === "perspectiva";
        hacerClic(
          evento.clientX,
          evento.clientY,
          evento.shiftKey,
          evento.ctrlKey || evento.metaKey || evento.altKey,
          modoOrbitar && es3dClic && arr.boton === 0,
        );
      }
    };
    const alDobleClic = (evento: MouseEvent) => {
      // O006d: doble clic con el botón medio = Ajustar.
      if (evento.button === 1) {
        evento.preventDefault();
        ajustar();
        return;
      }
      // O021: doble clic en un asa de eje = devolver ese extremo a automático.
      const asaEje = asaEjeEn(evento.clientX, evento.clientY);
      if (asaEje) {
        evento.preventDefault();
        persistirAjusteEje(
          asaEje.globalid,
          restablecerExtremoEje(ajusteActualEje(asaEje.globalid), asaEje.lado),
        );
        return;
      }
      // O014b: doble clic en el asa de una cabeza nivel = volver al acomodo automático.
      const asaNivel = asaNivelEn(evento.clientX, evento.clientY);
      if (asaNivel) {
        evento.preventDefault();
        void fijarAjustesNiveles(vista.id, { [asaNivel.globalid]: null });
        return;
      }
      const cotaDoble = cotaEn(evento.clientX, evento.clientY);
      if (cotaDoble) {
        evento.preventDefault();
        abrirEditorCota(cotaDoble, evento.clientX, evento.clientY);
        return;
      }
      // O007a: sin herramienta, el doble clic puede abrir «Editar tipo» del muro
      // seleccionado; la decisión final vive en el estado del modelo.
      evento.preventDefault();
      void dobleClicEnPlanta();
    };
    const alMenuContextual = (evento: MouseEvent) => {
      // O020: en 3D el botón derecho orbita y no debe abrir el menú del navegador.
      if (vista.tipo === "iso" || vista.tipo === "perspectiva") {
        evento.preventDefault();
        return;
      }
      const asa = asaEjeEn(evento.clientX, evento.clientY);
      if (!asa) return;
      evento.preventDefault();
      const rect = nodo.getBoundingClientRect();
      setEjeSeleccionado(asa.globalid);
      setMenuEje({
        x: evento.clientX - rect.left,
        y: evento.clientY - rect.top,
        globalid: asa.globalid,
        lado: asa.lado,
        indice: asa.tipo === "codo" ? asa.indice : null,
      });
    };
    const alTecla = (evento: KeyboardEvent) => {
      const objetivo = evento.target as HTMLElement | null;
      if (objetivo && ["INPUT", "TEXTAREA", "SELECT"].includes(objetivo.tagName)) return;
      // O027: Escape cancela el arrastre y devuelve todo a como estaba.
      if (
        evento.key === "Escape" &&
        (arrastreEje.current || arrastreNivel.current || arrastreLosa.current)
      ) {
        if (arrastreLosa.current) soltarLosaCancelado.current = true;
        arrastreEje.current = null;
        arrastreNivel.current = null;
        arrastreLosa.current = null;
        ajusteEnCursoRef.current = null;
        setAjusteEnCurso(null);
        setAjustesNivelEnCurso({});
        setPreviewLosaPx(null);
        setGuiaArrastre(null);
        evento.preventDefault();
        // El atajo global de App (mismo `window`) deseleccionaría la losa con Esc:
        // hay que cortar también los demás oyentes del mismo nodo.
        evento.stopImmediatePropagation();
        return;
      }
      if (evento.key === "Escape" && (menuEje || ejeSeleccionado)) {
        setMenuEje(null);
        setEjeSeleccionado(null);
        evento.preventDefault();
        return;
      }
      // O049: flechas fijan el eje de la inferencia mientras dura el trazo.
      if (herramienta === "empujar") {
        const ejes: Record<string, "x" | "y" | "z"> = {
          ArrowRight: "x",
          ArrowLeft: "y",
          ArrowUp: "z",
        };
        const eje = ejes[evento.key];
        if (eje) {
          evento.preventDefault();
          evento.stopPropagation();
          const actual = bloqueoFlechas.current;
          bloqueoFlechas.current =
            actual?.tipo === "eje" && actual.eje === eje
              ? null
              : { tipo: "eje", eje };
          nodo.dataset.bloqueoEmpujar =
            bloqueoFlechas.current?.tipo === "eje"
              ? bloqueoFlechas.current.eje
              : "";
          return;
        }
      }
      // O041: Tab recorre muro → cerramiento → castillo → muro bajo el cursor.
      if (evento.key === "Tab" && !evento.ctrlKey && !evento.metaKey && !evento.altKey) {
        const posicion = ultimoPuntero.current;
        if (!posicion) return;
        const candidatos = candidatosEn(posicion.x, posicion.y);
        const siguiente = siguienteCandidato(
          candidatos,
          useModelo.getState().seleccion,
        );
        if (!siguiente) return;
        evento.preventDefault();
        evento.stopPropagation();
        resaltadoRef.current = siguiente.globalid;
        setResaltado(siguiente.globalid);
        fijarPistaTab(textoPistaTab(siguiente));
        onSeleccionar(siguiente.globalid);
        return;
      }
      // O050: Espacio cierra la losa en curso (mínimo tres vértices).
      if (evento.code === "Space" && herramienta === "losa") {
        const estadoLosa = useModelo.getState();
        if (estadoLosa.puntosHerramienta.length > 0) {
          evento.preventDefault();
          evento.stopPropagation();
          void estadoLosa.dobleClicEnPlanta();
          return;
        }
      }
      if (evento.code === "Space") {
        espacio.current = true;
        evento.preventDefault();
        return;
      }
      const tecla = evento.key.toLowerCase();
      // O006e: diagnóstico de la rueda y el touchpad.
      if (evento.ctrlKey && evento.shiftKey && tecla === "d") {
        evento.preventDefault();
        setDiagnosticoRueda((visible) => !visible);
        return;
      }
      if (evento.ctrlKey || evento.metaKey || evento.altKey) return;
      // O006d: + y − acercan y alejan; F ajusta la vista.
      if (tecla === "+" || tecla === "=") {
        evento.preventDefault();
        zoomEnCentro(0.8);
        return;
      }
      if (tecla === "-" || tecla === "_") {
        evento.preventDefault();
        zoomEnCentro(1.25);
        return;
      }
      if (tecla === "f") {
        evento.preventDefault();
        ajustar();
        return;
      }
      if (tecla === "z") ultimaZ.current = performance.now();
      if (tecla === "a" && performance.now() - ultimaZ.current < 1200) {
        ultimaZ.current = 0;
        ajustar();
      }
    };
    const alSoltarTecla = (evento: KeyboardEvent) => {
      if (evento.code === "Space") espacio.current = false;
      if (evento.key === "Shift" && herramienta === "empujar") {
        bloqueoShift.current = null;
      }
    };
    // O049: último punto inferido para las pruebas E2E.
    (nodo as unknown as Record<string, unknown>).__openrvtEmpujarInferencia = () =>
      ultimaInferenciaEmpujar.current;
    // O049: diagnóstico de candidatos de Empujar/Tirar para las pruebas E2E.
    (nodo as unknown as Record<string, unknown>).__openrvtEmpujarCandidatos = (
      clientX: number,
      clientY: number,
    ) => {
      const cercanas = filtrarPorCercania(
        mallas3d.current,
        proyectarLienzo,
        { x: clientX, y: clientY },
        60,
      );
      const candidatos = unirCandidatos(
        cercanas.map((m) => cacheCandidatos.current.obtener(m.malla, mallas)),
      );
      return {
        mallas: mallas3d.current.length,
        cercanas: cercanas.map((m) => m.globalid),
        vertices: candidatos.vertices?.length ?? 0,
        aristas: candidatos.aristas?.length ?? 0,
        caras: candidatos.caras?.length ?? 0,
      };
    };
    // Utilidad de las pruebas E2E: candidatos de Tab bajo un punto de la pantalla.
    (nodo as unknown as Record<string, unknown>).__openrvtCandidatosTab = (
      clientX: number,
      clientY: number,
    ) => candidatosEn(clientX, clientY);
    // Utilidad de las pruebas E2E: GlobalId de la primera malla bajo un píxel.
    (nodo as unknown as Record<string, unknown>).__openrvtImpactoEn = (
      clientX: number,
      clientY: number,
    ) => {
      const camera = camara.current;
      if (!camera) return null;
      const rect = nodo.getBoundingClientRect();
      const raton = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      const rayo = new THREE.Raycaster();
      rayo.setFromCamera(raton, camera);
      const impacto = rayo.intersectObjects(meshes.current, false)[0];
      return impacto?.object.userData.globalid ?? null;
    };
    (nodo as unknown as Record<string, unknown>).__openrvtZoomEn = (
      factor: number,
      clientX: number,
      clientY: number,
    ) => {
      zoomEnPantalla(factor, clientX, clientY);
    };
    nodo.addEventListener("pointerdown", alBajar);
    nodo.addEventListener("dblclick", alDobleClic);
    nodo.addEventListener("contextmenu", alMenuContextual);
    window.addEventListener("pointermove", alMover);
    window.addEventListener("pointerup", alSoltar);
    // O034: en captura para que Escape cancele el arrastre antes de que el atajo
    // global de App (burbuja en el mismo `window`) deseleccione la losa.
    window.addEventListener("keydown", alTecla, true);
    window.addEventListener("keyup", alSoltarTecla);
    return () => {
      nodo.removeEventListener("pointerdown", alBajar);
      nodo.removeEventListener("dblclick", alDobleClic);
      nodo.removeEventListener("contextmenu", alMenuContextual);
      window.removeEventListener("pointermove", alMover);
      window.removeEventListener("pointerup", alSoltar);
      window.removeEventListener("keydown", alTecla, true);
      window.removeEventListener("keyup", alSoltarTecla);
    };
  }, [
    aplicarCamara,
    ajustar,
    zoomEnCentro,
    caja,
    modoCorte,
    onPuntoCorte,
    onSeleccionar,
    onSeleccionarVarios,
    onEscape,
    vista,
    modoOrbitar,
    herramienta,
    referenciaAlinear,
    elegirReferenciaAlinear,
    aplicarAlinear,
    fijarRaton,
    clicEnPlanta,
    clicNivel,
    clicRecorte,
    dobleClicEnPlanta,
    ventanaSeleccion,
    fijarAviso,
    fijarPistaTab,
    pantallaDePunto,
    metrosPorPixelActual,
    asaEjeEn,
    asaLosaEn,
    asaNivelEn,
    lineaEjeEn,
    lineaNivelEn,
    fijarNivelSeleccionado,
    puntoVistaDeMundo,
    puntoVistaDesdeEvento,
    candados,
    ejeSeleccionado,
    menuEje,
    fijarAjustesEjes,
    fijarAjustesNiveles,
    referencias.ejes,
    vista.ejes,
    elementosBloqueados,
    mallas,
    empujarRect,
    zEmpujar,
    empujarZ,
    fijarAlturaEmpujar,
    moverEmpujar,
    clicEmpujar,
    confirmarEmpujar,
    empujarCara,
    iniciarEmpujarCara,
    moverEmpujarCara,
    confirmarEmpujarCara,
  ]);

  const c9 = useOverlaysVisor(c7);

  const c10 = useGuiasVisor(c9);

  const {
    abrirEditorNotaExistente,
    ajusteSeleccionado,
    alHacerClicVisor,
    codosFinSel,
    codosInicioSel,
    confirmarNota,
    cotasFantasma,
    ejeSeleccionadoDatos,
    esAlzadoOCorte,
    guiaAlinear,
    lineaFantasmaNivel,
    posicionNotaArrastrada,
    puedeAnotarEje,
    zNivelHerramienta,
  } = c10;
  return (
    <div
      ref={contenedor}
      data-testid="visor"
      data-vista={vista.id}
      data-tipo={vista.tipo}
      data-mallas={mallas.length}
      data-herramienta={herramienta ?? undefined}
      data-nivel-seleccionado={nivelSeleccionado ?? undefined}
      data-enganche={engancheHerramienta?.tipo}
      data-largo-tecleado={longitudTecleada || undefined}
      data-puntos-herramienta={puntosHerramienta.length}
      data-eje-seleccionado={ejeSeleccionado ?? undefined}
      data-seleccion={seleccion ?? undefined}
      data-recorte-preview={vistaPreviaRecorte ? "si" : "no"}
      data-ejes-ajustes={JSON.stringify(vista.ejes ?? {})}
      onClick={alHacerClicVisor}
      className="relative min-h-0 flex-1 overflow-hidden bg-background"
    >
      {notasPx.length > 0 && (
        <div data-testid="notas-visor" className="pointer-events-none absolute inset-0 z-20">
          {notasPx.map(({ nota, x, y }) => {
            const arrastre =
              arrastreNota?.globalid === nota.globalid ? arrastreNota : null;
            return (
              <div
                key={nota.globalid}
                data-testid={`nota-${nota.globalid}`}
                data-seleccionada={notaSeleccionada === nota.globalid ? "si" : "no"}
                className={`pointer-events-auto absolute flex -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded border bg-white/85 px-1.5 py-0.5 text-[11px] text-neutral-900 shadow ${
                  notaSeleccionada === nota.globalid ? "border-amber-500 ring-1 ring-amber-400" : "border-neutral-300"
                }`}
                style={{ left: x + (arrastre?.dx ?? 0), top: y + (arrastre?.dy ?? 0) }}
                title="Clic para seleccionar; doble clic para editar; arrastre para mover"
                onPointerDown={(evento) => {
                  evento.stopPropagation();
                  (evento.target as HTMLElement).setPointerCapture?.(evento.pointerId);
                  setArrastreNota({
                    globalid: nota.globalid,
                    x0: evento.clientX,
                    y0: evento.clientY,
                    dx: 0,
                    dy: 0,
                    posicion: nota.posicion,
                  });
                  seleccionarNota(nota.globalid);
                }}
                onPointerMove={(evento) => {
                  if (arrastre?.globalid !== nota.globalid) return;
                  evento.stopPropagation();
                  setArrastreNota({
                    ...arrastre,
                    dx: evento.clientX - arrastre.x0,
                    dy: evento.clientY - arrastre.y0,
                  });
                }}
                onPointerUp={(evento) => {
                  if (arrastre?.globalid !== nota.globalid) return;
                  evento.stopPropagation();
                  const dx = evento.clientX - arrastre.x0;
                  const dy = evento.clientY - arrastre.y0;
                  setArrastreNota(null);
                  if (Math.hypot(dx, dy) < 3) return;
                  void moverNota(
                    nota.globalid,
                    posicionNotaArrastrada(arrastre.posicion, dx, dy),
                  );
                }}
                onDoubleClick={(evento) => {
                  evento.stopPropagation();
                  abrirEditorNotaExistente(nota, x, y);
                }}
              >
                <span className="inline-block h-2 w-2 rounded-full bg-neutral-900" />
                {nota.texto}
              </div>
            );
          })}
        </div>
      )}
      {notaEditando && (
        <div
          data-testid="nota-editor"
          className="absolute z-30 flex -translate-x-1/2 flex-col gap-1 rounded border bg-background p-2 text-xs shadow-lg"
          style={{ left: notaEditando.izquierda, top: notaEditando.arriba }}
        >
          <span className="text-[10px] text-muted-foreground">
            {notaEditando.globalid ? "Editar nota" : "Nueva nota"} · Enter confirma, Esc cancela
          </span>
          <input
            data-testid="nota-campo"
            autoFocus
            value={textoNota}
            onChange={(evento) => setTextoNota(evento.target.value)}
            onKeyDown={(evento) => {
              evento.stopPropagation();
              if (evento.key === "Enter") {
                evento.preventDefault();
                void confirmarNota();
              } else if (evento.key === "Escape") {
                evento.preventDefault();
                setNotaEditando(null);
              }
            }}
            className="w-56 rounded border bg-background px-2 py-1"
          />
        </div>
      )}
      {ventanaSeleccion && (
        <div
          data-testid="ventana-seleccion"
          className="pointer-events-none absolute z-10 border border-sky-500 bg-sky-500/10"
          style={{
            // Antes se dibujaba con coordenadas de página dentro del visor y salía
            // corrido el ancho del panel de vistas y el alto de la cinta.
            left: Math.min(ventanaSeleccion.x1, ventanaSeleccion.x2) - ventanaSeleccion.ox,
            top: Math.min(ventanaSeleccion.y1, ventanaSeleccion.y2) - ventanaSeleccion.oy,
            width: Math.abs(ventanaSeleccion.x2 - ventanaSeleccion.x1),
            height: Math.abs(ventanaSeleccion.y2 - ventanaSeleccion.y1),
          }}
        />
      )}
      {herramienta === "alinear" && vista.tipo !== "planta" && (
        <div
          data-testid="alinear-niveles"
          className="absolute left-2 top-12 z-30 flex max-w-[16rem] flex-wrap gap-1 rounded border bg-background/95 p-1 text-[11px] shadow"
        >
          <span className="w-full text-muted-foreground">
            Referencia: un nivel (base o tope según la mitad que toque)
          </span>
          {niveles.map((nivel) => (
            <button
              key={nivel.globalid}
              type="button"
              data-testid={`alinear-nivel-${nivel.globalid}`}
              onClick={() =>
                elegirReferenciaAlinear({ tipo: "nivel", globalid: nivel.globalid })
              }
              className="rounded border px-1 py-0.5 hover:bg-muted"
            >
              {nivel.nombre}
            </button>
          ))}
        </div>
      )}
      {guiaAlinear && (
        <svg
          data-testid="guia-alinear"
          className="pointer-events-none absolute inset-0 z-20 h-full w-full"
          aria-hidden="true"
        >
          <line
            x1={guiaAlinear.x1}
            y1={guiaAlinear.y1}
            x2={guiaAlinear.x2}
            y2={guiaAlinear.y2}
            stroke="#1d6feb"
            strokeWidth={2}
            strokeDasharray="8 6"
          />
        </svg>
      )}
      {guiaAlinear?.candado && (
        <button
          type="button"
          data-testid="candado-alinear"
          data-bloqueada={guiaAlinear.bloqueada ? "si" : "no"}
          title={
            guiaAlinear.bloqueada
              ? "Candado cerrado: quitar la restricción"
              : "Cerrar el candado y guardar la restricción"
          }
          onClick={() => void alternarCandadoAlinear()}
          className="absolute z-30 -translate-x-1/2 -translate-y-1/2 rounded border bg-background/95 p-1 text-sm shadow"
          style={{ left: guiaAlinear.candado.x, top: guiaAlinear.candado.y }}
        >
          {guiaAlinear.bloqueada ? "\u{1F512}" : "\u{1F513}"}
        </button>
      )}
      {guiaEmpujar && (
        <svg
          data-testid="empujar-guia"
          data-tipo={guiaEmpujar.tipo}
          className="pointer-events-none absolute inset-0 z-20 h-full w-full"
          aria-hidden="true"
        >
          <line
            x1={guiaEmpujar.x1}
            y1={guiaEmpujar.y1}
            x2={guiaEmpujar.x2}
            y2={guiaEmpujar.y2}
            stroke={guiaEmpujar.color}
            strokeWidth={2}
            strokeDasharray="8 6"
          />
        </svg>
      )}
      {marcadorEmpujar && (
        <div
          className="pointer-events-none absolute z-30"
          style={{ left: marcadorEmpujar.x, top: marcadorEmpujar.y }}
        >
          <span
            className="absolute"
            style={{ left: 0, top: 0, transform: "translate(-50%, -50%)" }}
          >
            <span
              data-testid="empujar-marcador"
              data-tipo={marcadorEmpujar.tipo}
              data-etiqueta={marcadorEmpujar.etiqueta}
              data-punto={`${marcadorEmpujar.punto.x},${marcadorEmpujar.punto.y},${marcadorEmpujar.punto.z}`}
              className="block"
              style={formaDeMarcador(marcadorEmpujar.tipo)}
            >
              {marcadorEmpujar.tipo === "interseccion" ? "×" : ""}
            </span>
          </span>
          <span
            data-testid="empujar-tooltip"
            className={`absolute -top-2 whitespace-nowrap rounded bg-background/95 px-1 py-0.5 text-[11px] shadow ${
              marcadorEmpujar.tooltipIzquierda ? "right-3" : "left-3"
            }`}
          >
            {marcadorEmpujar.etiqueta}
          </span>
        </div>
      )}
      {caraEmpujarHover && (
        <div
          className="pointer-events-none absolute z-30"
          style={{ left: caraEmpujarHover.x, top: caraEmpujarHover.y }}
        >
          <span
            data-testid="empujar-cara-tooltip"
            data-accion={caraEmpujarHover.clasificacion.accion}
            className={`absolute -top-2 whitespace-nowrap rounded bg-background/95 px-1 py-0.5 text-[11px] shadow ${
              caraEmpujarHover.tooltipIzquierda ? "right-3" : "left-3"
            }`}
          >
            {caraEmpujarHover.clasificacion.accion === "ninguna"
              ? caraEmpujarHover.clasificacion.motivo
              : caraEmpujarHover.clasificacion.etiqueta}
          </span>
        </div>
      )}
      {empujarCara && (
        <div
          data-testid="empujar-cara-distancia"
          className="pointer-events-none absolute bottom-20 left-2 z-10 whitespace-nowrap rounded bg-background/95 px-2 py-1 text-[11px] shadow"
        >
          <strong>{empujarCara.etiqueta}</strong> ·{" "}
          {empujarCara.distancia >= 0 ? "+" : ""}
          {empujarCara.distancia.toFixed(2)} m
        </div>
      )}
      {herramienta === "empujar" &&
        (vista.tipo === "iso" || vista.tipo === "perspectiva") && (
          <div
            data-testid="empujar-preview"
            data-paso={
              empujarCara ? "cara" : empujarRect ? "altura" : "contorno"
            }
            className="pointer-events-none absolute bottom-12 left-2 z-10 whitespace-nowrap rounded bg-background/95 px-2 py-1 text-[11px] shadow"
          >
            <strong>Empujar/Tirar</strong>
            {empujarCara ? (
              <>
                {" "}
                · {empujarCara.etiqueta} ·{" "}
                {empujarCara.distancia >= 0 ? "+" : ""}
                {empujarCara.distancia.toFixed(2)} m
              </>
            ) : empujarRect ? (
              <>
                {" "}
                · {textoDimensiones(empujarRect)}
                {empujarAltura !== null && (
                  <span data-testid="empujar-preview-altura">
                    {" "}
                    · h {empujarAltura.toFixed(2)} m
                  </span>
                )}
                <span data-testid="empujar-preview-clase">
                  {" "}
                  ·{" "}
                  {empujarClasificacion === "auto"
                    ? clasificarEmpujar(empujarRect, empujarAltura ?? 0).clase
                    : empujarClasificacion}
                </span>
              </>
            ) : (
              <> · primer clic en el nivel activo</>
            )}
          </div>
        )}
      {herramienta === "nivel" && ratonHerramienta && (
        <div
          data-testid="nivel-preview"
          className="pointer-events-none absolute bottom-12 left-2 z-10 whitespace-nowrap rounded bg-background/95 px-2 py-1 text-[11px] shadow"
        >
          <strong data-testid="nivel-preview-nombre">
            {opcionesNivel.nombre || "Nivel"}
          </strong>{" "}
          · {(zNivelHerramienta ?? ratonHerramienta[1]).toFixed(2)} m
          {cotasNivel?.inferior && (
            <span data-testid="nivel-preview-inferior">
              {" "}
              = {cotasNivel.inferior.nombre} +{" "}
              {((zNivelHerramienta ?? ratonHerramienta[1]) - cotasNivel.inferior.elevacion).toFixed(2)}
            </span>
          )}
          {cotasNivel?.superior && (
            <span data-testid="nivel-preview-superior">
              {" "}
              · {cotasNivel.superior.nombre} −{" "}
              {(cotasNivel.superior.elevacion - (zNivelHerramienta ?? ratonHerramienta[1])).toFixed(2)}
            </span>
          )}
        </div>
      )}
      {herramienta === "nivel" && esAlzadoOCorte && lineaFantasmaNivel && (
        <svg
          data-testid="nivel-fantasma"
          className="pointer-events-none absolute inset-0 z-10 h-full w-full"
        >
          <line
            x1={lineaFantasmaNivel.x1}
            y1={lineaFantasmaNivel.y}
            x2={lineaFantasmaNivel.x2}
            y2={lineaFantasmaNivel.y}
            stroke="#0891b2"
            strokeWidth={1.5}
            strokeDasharray="8 4"
          />
          {(cotasFantasma ?? []).map((fila, i) => (
            <g key={i} data-testid={`nivel-cota-temporal-${i}`}>
              <line
                x1={lineaFantasmaNivel.x2 - 70}
                y1={fila.y1}
                x2={lineaFantasmaNivel.x2 - 70}
                y2={fila.y2}
                stroke="#0e7490"
                strokeWidth={1}
              />
              <text
                x={lineaFantasmaNivel.x2 - 66}
                y={(fila.y1 + fila.y2) / 2 + 4}
                fill="#0e7490"
                fontSize={11}
              >
                {fila.texto}
              </text>
            </g>
          ))}
        </svg>
      )}
      {guiaCodo && (
        <svg
          data-testid="guia-codo"
          data-direcciones={guiaCodo.ambos ? "x,y" : guiaCodo.vertical ? "vertical" : "horizontal"}
          className="pointer-events-none absolute inset-0 z-10 h-full w-full"
        >
          <defs>
            <marker
              id="o044-flecha-codo"
              viewBox="0 0 6 6"
              refX="3"
              refY="3"
              markerWidth="4"
              markerHeight="4"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L6,3 L0,6 z" fill="#16a34a" />
            </marker>
          </defs>
          {(guiaCodo.ambos || !guiaCodo.vertical) && (
            <line
              x1={guiaCodo.x - 15}
              y1={guiaCodo.y}
              x2={guiaCodo.x + 15}
              y2={guiaCodo.y}
              stroke="#16a34a"
              strokeWidth={2}
              markerStart="url(#o044-flecha-codo)"
              markerEnd="url(#o044-flecha-codo)"
            />
          )}
          {(guiaCodo.ambos || guiaCodo.vertical) && (
            <line
              x1={guiaCodo.x}
              y1={guiaCodo.y - 15}
              x2={guiaCodo.x}
              y2={guiaCodo.y + 15}
              stroke="#16a34a"
              strokeWidth={2}
              markerStart="url(#o044-flecha-codo)"
              markerEnd="url(#o044-flecha-codo)"
            />
          )}
        </svg>
      )}
      {guiaArrastre && (
        <>
          <svg
            data-testid="guia-arrastre"
            data-enganchado={guiaArrastre.enganchado ? "si" : "no"}
            className="pointer-events-none absolute inset-0 z-10 h-full w-full"
          >
            <line
              x1={guiaArrastre.x1}
              y1={guiaArrastre.y1}
              x2={guiaArrastre.x2}
              y2={guiaArrastre.y2}
              stroke={guiaArrastre.enganchado ? "#0ea5e9" : "#94a3b8"}
              strokeWidth={guiaArrastre.enganchado ? 2 : 1}
              strokeDasharray="6 4"
            />
          </svg>
          <div
            data-testid="cota-arrastre"
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded bg-background/95 px-1.5 py-0.5 text-[11px] font-medium shadow"
            style={{
              left: (guiaArrastre.x1 + guiaArrastre.x2) / 2,
              top: (guiaArrastre.y1 + guiaArrastre.y2) / 2,
            }}
          >
            {guiaArrastre.texto}
          </div>
        </>
      )}
      {previewLosaPx && (
        <svg
          data-testid="preview-losa"
          data-puntos={previewLosaPx.length}
          className="pointer-events-none absolute inset-0 z-20 h-full w-full"
        >
          <polygon
            points={previewLosaPx.map((punto) => `${punto.x},${punto.y}`).join(" ")}
            fill="rgba(245, 158, 11, 0.12)"
            stroke="#f59e0b"
            strokeWidth={2}
            strokeDasharray="6 3"
          />
        </svg>
      )}
      {editorDesfaseLosa && (
        <div
          data-testid="asa-losa-editor"
          className="absolute z-30 flex items-center gap-1 rounded border bg-background/95 p-1 text-[11px] shadow"
          style={{ left: editorDesfaseLosa.izquierda, top: editorDesfaseLosa.arriba }}
        >
          <span className="text-muted-foreground">Desfase</span>
          <input
            data-testid="asa-losa-desfase"
            autoFocus
            type="text"
            inputMode="decimal"
            value={editorDesfaseLosa.valor}
            onChange={(evento) =>
              setEditorDesfaseLosa((actual) =>
                actual ? { ...actual, valor: evento.target.value } : actual,
              )
            }
            onKeyDown={(evento) => {
              evento.stopPropagation();
              if (evento.key === "Escape") {
                evento.preventDefault();
                setEditorDesfaseLosa(null);
                return;
              }
              if (evento.key !== "Enter") return;
              evento.preventDefault();
              const valor = Number(editorDesfaseLosa.valor.replace(",", "."));
              const editor = editorDesfaseLosa;
              setEditorDesfaseLosa(null);
              if (!Number.isFinite(valor)) return;
              void useModelo.getState().editarElemento(editor.globalid, {
                cambio_borde: { indice: editor.indice, desfase: valor },
              });
            }}
            onBlur={() => setEditorDesfaseLosa(null)}
            className="w-20 rounded border bg-background px-1 py-0.5 text-right"
          />
          <span className="text-muted-foreground">m</span>
        </div>
      )}
      <div className="absolute left-2 top-2 z-10 flex gap-1">
        <button
          type="button"
          data-testid="visor-ajustar"
          title="Ajustar la vista (F, Z y luego A, doble clic medio)"
          onClick={ajustar}
          className="rounded border bg-background/90 px-2 py-1 text-xs shadow-sm hover:bg-muted"
        >
          Ajustar
        </button>
        {vista.tipo === "iso" && (
          <button
            type="button"
            data-testid="visor-restablecer-iso"
            onClick={restablecerIso}
            className="rounded border bg-background/90 px-2 py-1 text-xs shadow-sm hover:bg-muted"
          >
            Restablecer iso
          </button>
        )}
        {(vista.tipo === "iso" || vista.tipo === "perspectiva") && (
          <div className="relative">
            <button
              type="button"
              data-testid="visor-anotaciones"
              aria-expanded={panelAnotaciones}
              title="Mostrar u ocultar ejes, niveles, cotas y notas"
              onClick={() => setPanelAnotaciones((abierto) => !abierto)}
              className={
                panelAnotaciones
                  ? "rounded border bg-accent px-2 py-1 text-xs font-medium text-accent-foreground shadow-sm"
                  : "rounded border bg-background/90 px-2 py-1 text-xs shadow-sm hover:bg-muted"
              }
            >
              Anotaciones
            </button>
            {panelAnotaciones && (
              <div
                data-testid="visor-anotaciones-panel"
                className="absolute left-0 top-8 z-30 flex w-44 flex-col gap-1 rounded border bg-background/95 p-2 text-[11px] shadow-lg"
              >
                {(
                  [
                    ["ejes3d", "Ejes"],
                    ["niveles3d", "Niveles"],
                    ["cotas3d", "Cotas"],
                    ["notas3d", "Notas"],
                  ] as const
                ).map(([clave, nombre]) => (
                  <label key={clave} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      data-testid={`visor-anotaciones-${clave}`}
                      checked={
                        clave === "notas3d" ? vista.notas3d !== false : vista[clave] === true
                      }
                      onChange={(evento) =>
                        void actualizarVista(vista.id, { [clave]: evento.target.checked })
                      }
                    />
                    {nombre}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {puedeAnotarEje && (
        <div
          data-testid="eje-acciones"
          className="absolute left-2 top-11 z-20 flex max-w-[min(640px,80vw)] flex-wrap items-center gap-1 rounded border bg-background/95 p-1.5 text-[11px] shadow-md"
        >
          <span className="px-1 font-semibold">Eje {ejeSeleccionadoDatos!.etiqueta}</span>
          <button
            type="button"
            data-testid="eje-candado-inicio"
            aria-pressed={candados.inicio}
            title="Candado del extremo de inicio: cerrado mueve los ejes alineados; abierto mueve solo este eje"
            onClick={() => alternarCandadoVista(ejeSeleccionadoDatos!.globalid, "inicio")}
            className={`rounded border px-1.5 py-0.5 ${
              candados.inicio ? "bg-amber-200 text-amber-950" : "hover:bg-muted"
            }`}
          >
            {candados.inicio ? "🔓" : "🔒"} Inicio
          </button>
          <button
            type="button"
            data-testid="eje-candado-fin"
            aria-pressed={candados.fin}
            title="Candado del extremo final: cerrado mueve los ejes alineados; abierto mueve solo este eje"
            onClick={() => alternarCandadoVista(ejeSeleccionadoDatos!.globalid, "fin")}
            className={`rounded border px-1.5 py-0.5 ${
              candados.fin ? "bg-amber-200 text-amber-950" : "hover:bg-muted"
            }`}
          >
            {candados.fin ? "🔓" : "🔒"} Fin
          </button>
          <label className="flex items-center gap-1" title="Mostrar u ocultar el globo del extremo de inicio">
            <input
              type="checkbox"
              data-testid="eje-globo-inicio"
              checked={globoVisibleEje(ajusteSeleccionado, "inicio")}
              onChange={(e) =>
                fijarGlobos(ejeSeleccionadoDatos!.globalid, { globoInicio: e.target.checked })
              }
            />
            Globo inicio
          </label>
          <label className="flex items-center gap-1" title="Mostrar u ocultar el globo del extremo final">
            <input
              type="checkbox"
              data-testid="eje-globo-fin"
              checked={globoVisibleEje(ajusteSeleccionado, "fin")}
              onChange={(e) =>
                fijarGlobos(ejeSeleccionadoDatos!.globalid, { globoFin: e.target.checked })
              }
            />
            Globo fin
          </label>
          <button
            type="button"
            data-testid="eje-codo-inicio-agregar"
            disabled={codosInicioSel >= MAXIMO_CODOS}
            onClick={() => agregarCodoVista(ejeSeleccionadoDatos!.globalid, "inicio")}
            className="rounded border px-1.5 py-0.5 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
          >
            Agregar codo (inicio) {codosInicioSel}/{MAXIMO_CODOS}
          </button>
          <button
            type="button"
            data-testid="eje-codo-fin-agregar"
            disabled={codosFinSel >= MAXIMO_CODOS}
            onClick={() => agregarCodoVista(ejeSeleccionadoDatos!.globalid, "fin")}
            className="rounded border px-1.5 py-0.5 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
          >
            Agregar codo (fin) {codosFinSel}/{MAXIMO_CODOS}
          </button>
        </div>
      )}
      {menuEje && (
        <div
          data-testid="eje-menu"
          role="menu"
          className="absolute z-30 min-w-40 rounded border bg-background p-1 text-xs shadow-lg"
          style={{ left: menuEje.x, top: menuEje.y }}
        >
          {menuEje.indice !== null ? (
            <button
              type="button"
              role="menuitem"
              data-testid="eje-quitar-codo"
              className="w-full rounded px-2 py-1 text-left hover:bg-muted"
              onClick={() => {
                quitarCodoVista(menuEje.globalid, menuEje.lado, menuEje.indice!);
                setMenuEje(null);
              }}
            >
              Quitar codo
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              data-testid="eje-menu-agregar-codo"
              disabled={
                (menuEje.lado === "inicio" ? codosInicioSel : codosFinSel) >= MAXIMO_CODOS
              }
              className="w-full rounded px-2 py-1 text-left hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => {
                agregarCodoVista(menuEje.globalid, menuEje.lado);
                setMenuEje(null);
              }}
            >
              Agregar codo
            </button>
          )}
          {menuEje.indice === null && (
            <>
              <button
                type="button"
                role="menuitem"
                data-testid="eje-menu-globos-ambos"
                className="w-full rounded px-2 py-1 text-left hover:bg-muted"
                onClick={() => {
                  fijarGlobos(menuEje.globalid, { globoInicio: true, globoFin: true });
                  setMenuEje(null);
                }}
              >
                Mostrar globo en ambos extremos
              </button>
              <button
                type="button"
                role="menuitem"
                data-testid="eje-menu-ocultar-inicio"
                className="w-full rounded px-2 py-1 text-left hover:bg-muted"
                onClick={() => {
                  fijarGlobos(menuEje.globalid, { globoInicio: false });
                  setMenuEje(null);
                }}
              >
                Ocultar globo inicio
              </button>
              <button
                type="button"
                role="menuitem"
                data-testid="eje-menu-ocultar-fin"
                className="w-full rounded px-2 py-1 text-left hover:bg-muted"
                onClick={() => {
                  fijarGlobos(menuEje.globalid, { globoFin: false });
                  setMenuEje(null);
                }}
              >
                Ocultar globo fin
              </button>
            </>
          )}
          <button
            type="button"
            role="menuitem"
            data-testid="eje-menu-restablecer"
            className="w-full rounded px-2 py-1 text-left hover:bg-muted"
            onClick={() => {
              restablecerEjeVista(menuEje.globalid);
              setMenuEje(null);
            }}
          >
            Restablecer acomodo de este eje
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid="eje-menu-restablecer-todos"
            className="w-full rounded px-2 py-1 text-left hover:bg-muted"
            onClick={() => {
              restablecerTodosLosEjes();
              setMenuEje(null);
            }}
          >
            Restablecer todos los ejes de la vista
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid="eje-menu-copiar"
            className="w-full rounded px-2 py-1 text-left hover:bg-muted"
            onClick={() => {
              abrirCopiarAcomodo(menuEje.globalid);
              setMenuEje(null);
            }}
          >
            Copiar acomodo a otras vistas…
          </button>
          <button
            type="button"
            role="menuitem"
            className="w-full rounded px-2 py-1 text-left hover:bg-muted"
            onClick={() => setMenuEje(null)}
          >
            Cerrar
          </button>
        </div>
      )}
      {dialogoCopiarEje && (
        <div
          data-testid="eje-copiar-dialogo"
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setDialogoCopiarEje(null)}
        >
          <div
            className="w-full max-w-sm rounded border bg-background p-3 text-xs shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-2 font-semibold">Copiar acomodo a otras vistas</p>
            {vistas.filter((v) => v.id !== vista.id && v.tipo === vista.tipo).length === 0 ? (
              <p className="mb-2 text-muted-foreground">No hay otras vistas del mismo tipo.</p>
            ) : (
              <div className="mb-2 flex flex-col gap-1">
                {vistas
                  .filter((v) => v.id !== vista.id && v.tipo === vista.tipo)
                  .map((v) => (
                    <label key={v.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        data-testid={`eje-copiar-vista-${v.id}`}
                        checked={dialogoCopiarEje.seleccion.includes(v.id)}
                        onChange={(e) =>
                          setDialogoCopiarEje((d) =>
                            d
                              ? {
                                  ...d,
                                  seleccion: e.target.checked
                                    ? [...d.seleccion, v.id]
                                    : d.seleccion.filter((id) => id !== v.id),
                                }
                              : d,
                          )
                        }
                      />
                      <span>{v.nombre}</span>
                    </label>
                  ))}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                data-testid="eje-copiar-cancelar"
                className="rounded border px-2 py-1 hover:bg-muted"
                onClick={() => setDialogoCopiarEje(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                data-testid="eje-copiar-aceptar"
                className="rounded border bg-primary px-2 py-1 text-primary-foreground hover:opacity-90"
                onClick={copiarAcomodoAVistas}
              >
                Copiar
              </button>
            </div>
          </div>
        </div>
      )}
      <ControlesZoom
        onAcercar={() => zoomEnCentro(0.8)}
        onAlejar={() => zoomEnCentro(1.25)}
        onAjustar={ajustar}
        orbitar={modoOrbitar}
        onAlternarOrbitar={alternarOrbitar}
        mostrarOrbitar={vista.tipo === "iso" || vista.tipo === "perspectiva"}
        aEscala={
          (vista.anotacionEscala ??
            (vista.tipo === "alzado" || vista.tipo === "corte" ? "papel" : "pantalla")) === "papel"
        }
        onAlternarAEscala={() =>
          onCambiarAnotacion?.(
            (vista.anotacionEscala ??
              (vista.tipo === "alzado" || vista.tipo === "corte" ? "papel" : "pantalla")) === "papel"
              ? "pantalla"
              : "papel",
          )
        }
        onZoom100={zoomAl100}
      />
      {ayudaVisible && (
        <div
          data-testid="ayuda-navegacion"
          className="absolute bottom-12 right-3 z-10 flex max-w-[min(520px,60vw)] items-center gap-2 rounded border bg-background/90 px-2 py-1 text-[11px] text-muted-foreground shadow-sm"
        >
          <span>
            Pellizca para zoom · Ctrl + dos dedos también hace zoom · botones +/− abajo a la
            derecha · Shift + dos dedos o arrastre con botón derecho = orbitar; botón
            Orbitar para usar un dedo
          </span>
          <button
            type="button"
            data-testid="ayuda-navegacion-cerrar"
            aria-label="Cerrar la ayuda de navegación"
            title="Cerrar (no vuelve a aparecer)"
            onClick={cerrarAyuda}
            className="rounded px-1 text-sm leading-none hover:bg-muted"
          >
            ×
          </button>
        </div>
      )}
      {diagnosticoRueda && (
        <div
          data-testid="diagnostico-rueda"
          className="absolute right-2 top-12 z-30 max-h-[60vh] w-[min(720px,92vw)] overflow-auto rounded border bg-background/95 p-2 text-[10px] shadow-lg"
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <strong>Diagnóstico de rueda/touchpad</strong>
            <div className="flex items-center gap-1">
              <button
                type="button"
                data-testid="diagnostico-rueda-grabar"
                onClick={grabando ? detenerGrabacion : iniciarGrabacion}
                title="Graba 10 s de rueda, puntero, toques y Control"
                className="rounded border px-1.5 py-0.5 hover:bg-muted"
              >
                {grabando ? "Detener" : "Grabar 10 s"}
              </button>
              <button
                type="button"
                data-testid="diagnostico-rueda-copiar-resumen"
                onClick={() =>
                  copiarTexto(
                    resumenGrabacion
                      ? textoResumenGrabacion(resumenGrabacion)
                      : "Sin grabación: pulsa «Grabar 10 s».",
                  )
                }
                title="Copia el resumen en texto para pegarlo"
                className="rounded border px-1.5 py-0.5 hover:bg-muted"
              >
                Copiar resumen
              </button>
              <button
                type="button"
                data-testid="diagnostico-rueda-exportar"
                onClick={() => void exportarDiagnostico()}
                title="Guarda el diagnóstico completo en JSON"
                className="rounded border px-1.5 py-0.5 hover:bg-muted"
              >
                Exportar…
              </button>
              <button
                type="button"
                data-testid="diagnostico-rueda-cerrar"
                onClick={() => setDiagnosticoRueda(false)}
                className="rounded px-1 text-sm leading-none hover:bg-muted"
                aria-label="Cerrar el diagnóstico"
              >
                ×
              </button>
            </div>
          </div>
          <p className="mb-1 text-muted-foreground">
            {grabando ? "Grabando… " : ""}detectado: {detectorRueda.ultimoDispositivo() ?? "—"}
          </p>
          {resumenGrabacion ? (
            <div data-testid="diagnostico-rueda-resumen">
              <p className="mb-1">
                {resumenGrabacion.total} eventos · {Math.round(resumenGrabacion.duracionMs)} ms ·
                zoom {resumenGrabacion.zoom.eventos} · producto{" "}
                {Number(resumenGrabacion.zoom.productoFactores.toFixed(6))} · escala{" "}
                {resumenGrabacion.zoom.escalaInicial ?? "—"} →{" "}
                {resumenGrabacion.zoom.escalaFinal ?? "—"}
              </p>
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b">
                    <th className="px-1">grupo</th>
                    <th className="px-1">n</th>
                    <th className="px-1">ctrl %</th>
                    <th className="px-1">modo</th>
                    <th className="px-1">ΔY mín/máx/media</th>
                    <th className="px-1">fracc. %</th>
                    <th className="px-1">intervalo ms</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(resumenGrabacion.porTipo).map(([tipo, grupo]) => (
                    <tr key={`tipo-${tipo}`} className="border-b border-border/40">
                      <td className="px-1">tipo {tipo}</td>
                      <td className="px-1">{grupo.cantidad}</td>
                      <td className="px-1">{grupo.pctCtrl.toFixed(1)}</td>
                      <td className="px-1">{grupo.deltaMode ?? "—"}</td>
                      <td className="px-1">
                        {grupo.deltaYMin === null
                          ? "—"
                          : `${grupo.deltaYMin} / ${grupo.deltaYMax} / ${grupo.deltaYMedia}`}
                      </td>
                      <td className="px-1">
                        {grupo.pctFraccionarios === null
                          ? "—"
                          : grupo.pctFraccionarios.toFixed(1)}
                      </td>
                      <td className="px-1">
                        {grupo.intervaloMedioMs === null
                          ? "—"
                          : grupo.intervaloMedioMs.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                  {Object.entries(resumenGrabacion.porAccion).map(([accion, grupo]) => (
                    <tr key={`accion-${accion}`} className="border-b border-border/40">
                      <td className="px-1">acción {accion}</td>
                      <td className="px-1">{grupo.cantidad}</td>
                      <td className="px-1">{grupo.pctCtrl.toFixed(1)}</td>
                      <td className="px-1">{grupo.deltaMode ?? "—"}</td>
                      <td className="px-1">
                        {grupo.deltaYMin === null
                          ? "—"
                          : `${grupo.deltaYMin} / ${grupo.deltaYMax} / ${grupo.deltaYMedia}`}
                      </td>
                      <td className="px-1">
                        {grupo.pctFraccionarios === null
                          ? "—"
                          : grupo.pctFraccionarios.toFixed(1)}
                      </td>
                      <td className="px-1">
                        {grupo.intervaloMedioMs === null
                          ? "—"
                          : grupo.intervaloMedioMs.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p data-testid="diagnostico-rueda-nativos" className="mt-1">
                nativo:{" "}
                {Object.entries(resumenGrabacion.nativos.porMensaje)
                  .map(([mensaje, cantidad]) => `${mensaje} ${cantidad}`)
                  .join(" · ") || "—"}{" "}
                · ventana:{" "}
                {Object.entries(resumenGrabacion.nativos.porVentana)
                  .map(([ventana, cantidad]) => `${ventana} ${cantidad}`)
                  .join(" · ") || "—"}
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground">
              Sin grabación. Pulsa «Grabar 10 s», reproduce el gesto y vuelve a pulsar «Detener».
            </p>
          )}
          <details data-testid="diagnostico-rueda-eventos" className="mt-1">
            <summary className="cursor-pointer">
              Últimos {Math.min(20, eventosGrabados.length)} de {eventosGrabados.length} eventos
            </summary>
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b">
                  <th className="px-1">ms</th>
                  <th className="px-1">tipo</th>
                  <th className="px-1">ctrl</th>
                  <th className="px-1">ΔX</th>
                  <th className="px-1">ΔY</th>
                  <th className="px-1">acción</th>
                  <th className="px-1">escala</th>
                </tr>
              </thead>
              <tbody>
                {eventosGrabados.slice(-20).map((registro, indice) => (
                  <tr key={`${registro.t}-${indice}`} className="border-b border-border/40">
                    <td className="px-1">{Math.round(registro.t)}</td>
                    <td className="px-1">
                      {registro.tipo}
                      {registro.pointerType ? ` (${registro.pointerType})` : ""}
                      {registro.toques !== undefined ? ` (${registro.toques} toques)` : ""}
                    </td>
                    <td className="px-1">{registro.ctrlKey ? "sí" : "no"}</td>
                    <td className="px-1">{registro.deltaX ?? "—"}</td>
                    <td className="px-1">{registro.deltaY ?? "—"}</td>
                    <td className="px-1">{registro.accion ?? "—"}</td>
                    <td className="px-1">
                      {registro.escalaAntes === undefined
                        ? "—"
                        : `${registro.escalaAntes} → ${registro.escalaDespues}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      )}
      {cotaEditando && (
        <div
          ref={editorCota}
          data-testid="cota-editor"
          className="absolute z-30 flex -translate-x-1/2 flex-col gap-1 rounded border bg-background p-2 text-xs shadow-lg"
          style={{ left: cotaEditando.izquierda, top: cotaEditando.arriba }}
        >
          <div className="flex items-center gap-1">
            <input
              data-testid="cota-campo"
              autoFocus
              value={textoCotaEditando}
              onChange={(e) => {
                setTextoCotaEditando(e.target.value);
                setErrorCota(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void confirmarCota();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setCotaEditando(null);
                }
              }}
              className="w-28 rounded border bg-background px-2 py-1 text-right"
            />
            <span className="text-muted-foreground">m</span>
          </div>
          {errorCota && (
            <span
              data-testid="cota-error"
              className="max-w-[15rem] text-[10px] leading-tight text-red-600"
            >
              {errorCota}
            </span>
          )}
          {cotaEditando.tipo !== "elevacion" && cotaEditando.tipo !== "rebase" && (
            <label
              className="flex items-center gap-1 whitespace-nowrap text-muted-foreground"
              title={
                cotaEditando.tipo === "nivel"
                  ? "También desplaza los niveles superiores la misma distancia."
                  : "También desplaza los ejes siguientes la misma distancia."
              }
            >
              <input
                type="checkbox"
                data-testid="cota-mover-siguientes"
                checked={moverSiguientes}
                onChange={(e) => fijarMoverSiguientes(e.target.checked)}
              />
              {cotaEditando.tipo === "nivel" ? "Mover los de arriba" : "Mover los siguientes"}
            </label>
          )}
        </div>
      )}
      {modoCorte && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded bg-background/90 px-3 py-1 text-xs shadow">
          {puntoCorte ? "Haga el segundo clic" : "Haga el primer clic en la planta"}
        </div>
      )}
      {herramienta && vista.tipo === "planta" && (
        <div
          data-testid="pista-herramienta"
          className="pointer-events-none absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-2 rounded bg-background/90 px-3 py-1 text-xs shadow"
        >
          {engancheHerramienta && (
            <span data-testid="pista-snap">Snap: {engancheHerramienta.tipo}</span>
          )}
          {ratonHerramienta && (
            <span>
              x {ratonHerramienta[0].toFixed(2)} · y {ratonHerramienta[1].toFixed(2)}
            </span>
          )}
          {longitudTecleada && (
            <span data-testid="pista-longitud-tecleada" className="font-semibold text-amber-600">
              {longitudTecleada} m · Enter
            </span>
          )}
          {herramienta === "eje" && (
            <span data-testid="pista-eje-libre">Ctrl/Alt: sin familia</span>
          )}
          {herramienta === "eje" && distanciaParalelo && (
            <span data-testid="pista-distancia-eje" className="font-semibold text-sky-600">
              distancia {distanciaParalelo.distancia.toFixed(2)} m
            </span>
          )}
          {puntosHerramienta.length > 0 && ratonHerramienta && herramienta !== "losa" && (
            <span data-testid="pista-longitud">
              {herramienta === "eje" && trazoEjePrevio
                ? Math.hypot(
                    trazoEjePrevio.fin[0] - trazoEjePrevio.inicio[0],
                    trazoEjePrevio.fin[1] - trazoEjePrevio.inicio[1],
                  ).toFixed(2)
                : Math.hypot(
                    ratonHerramienta[0] - puntosHerramienta[puntosHerramienta.length - 1][0],
                    ratonHerramienta[1] - puntosHerramienta[puntosHerramienta.length - 1][1],
                  ).toFixed(2)}{" "}
              m
            </span>
          )}
          {(herramienta === "puerta" || herramienta === "ventana") &&
            ratonHerramienta &&
            (() => {
              const ancho = herramienta === "puerta" ? 0.9 : 1.2;
              const colocada = colocarAbertura(referencias, ratonHerramienta, ancho);
              return colocada ? (
                <span data-testid="pista-cotas">
                  cota inicio {colocada.desdeInicio.toFixed(2)} m · cota fin{" "}
                  {colocada.hastaFin.toFixed(2)} m
                </span>
              ) : null;
            })()}
        </div>
      )}
    </div>
  );
}
