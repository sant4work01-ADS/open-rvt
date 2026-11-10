/* eslint-disable react-hooks/immutability -- los refs del visor son mutables por diseño. */
// OPEN-RVT: visor three.js del módulo Modelo. Dibuja mallas en coordenadas de mundo,
// cámaras ortográficas para plantas/alzados/cortes y órbita libre en 3D, con recorte y
// relleno de sección por stencil (técnica del ejemplo webgl_clipping_stencil).
import { useEffect } from "react";
import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import type { AjusteEjeVista, ElementoMalla } from "./tipos";
import {
  categoriaVisible,
  dibujaSiluetaSobreCorte,
  elementoVisibleEnPlanta,
} from "./vistas";
import {  } from "./visorRenderer";
import { useModelo } from "./estado";
import {
  calcularPlantaMuros,
  contornoCerramientoPlanta,
  lineaEjeCerramientoPlanta,
  type MuroPlanta,
} from "./planta";
import {
  aliasCiclico,
  candidatosBajoPunto,
  ORDEN_CICLO,
  siguienteCandidato,
  textoPistaTab,
  type CandidatoTab,
} from "./seleccionCiclica";
import {
  detectorRueda,
  textoResumenGrabacion,
} from "@/lib/rueda";
import {  } from "@tauri-apps/api/event";
import { copiarTexto } from "@/lib/portapapeles";
import {  } from "@/lib/dialogos";
import {  } from "@/lib/bindings";
import {
  buscarEnganche,
  colocarAbertura,
  type Punto2,
} from "./herramientas";
import {
  caraEnPunto,
  rectaDeEje,
  rectaDeMalla,
} from "./alinear";
import { bordesDePset } from "./bordesLosa";
import {
  alturaEnEjeVertical,
  clasificarEmpujar,
  textoDimensiones,
} from "./empujar";
import {
  caraEnPunto as caraPlanaEnPunto,
  clasificarCaraEmpujar,
  distanciaSobreNormal,
  type AccionEmpujarCara,
  type ElementoCara,
  type ResultadoCara,
} from "./empujarCaras";
import {
  inferir,
  type CandidatosInferencia,
  type Inferencia,
  type Vec3,
} from "./inferencias3d";
import {
  caraSuperiorEn,
  envolventeDeMalla,
  filtrarPorCercania,
  unirCandidatos,
} from "./candidatos3d";
import {
  asasDeLosa,
  contornoPrevio,
  desfaseConArrastre,
  hayAsasLosa,
  leerPoligonoWkt,
} from "./asasLosa";
import {
  calcularFamiliasCotas,
  posicionTextoEntreMarcas,
} from "./cotas";
import { ControlesZoom } from "./ControlesZoom";
import {
  accionArrastre,
} from "./orbita";
import { DESFASE_NOMBRE_CABEZA, normalizarAjusteNivel } from "./niveles";
import { calcularLayoutAlzado, enlazarTramosCota, formatearNumero, segmentosTrazoPunto } from "./anotacionVista";
import {
  categoriaOculta,
  factorEscala,
  grosorMm,
  materialPorCapa,
  altoAnotacionMundo,
  mmAMundo,
  mmAMundoConMinimoPx,
  rellenoDeElemento,
  type MaterialNombre,
  type PatronLinea,
  type RelacionCorte,
} from "./estilos";
import {
  basePlano,
  colocarSimbolo,
  dividirEnCapas,
  geometriaPuerta,
  geometriaVentana,
  interseccionPlanoMalla,
  siluetaProyectada,
  type Punto2 as PuntoSeccion,
  type Punto3,
} from "./seccion";
import {
  centroCaja,
  diagonalCaja,
  direccionAlzado,
} from "./vistas";
import {
  aristasInternasUniones,
  aristasParaElemento,
  mallaConNormalesPlanas,
} from "./geometria";
import { agregarAristasOcultasSobreMuro } from "./aristasSobreMuro";
import { crearMaterialElemento } from "./materialElemento";
import { crearMallasCapas } from "./capas3d";
import {
  MAXIMO_CODOS,
  agregarCodoEje,
  asasCodoVista,
  arrastrarExtremoEje,
  extremoEje,
  geometriaEje,
  globoVisibleEje,
  imanAlineacion,
  imanMultiplo,
  mmPapelAMetros,
  normalizarAjusteEje,
  restablecerExtremoEje,
  candadoArrastreAsa,
  desplazamientoArrastreNivel,
  destinoArrastreAsa,
  destinoArrastreCodo,
  puntoAsaEje,
  puntoAsaCodoNuevo,
  type DireccionEjeArrastre,
  type LadoEje,
  type TipoAsaArrastre,
} from "./ejesVista";
import {
  bloqueoDeInferencia,
  colorDeGuia,
  etiquetaInferencia,
  formaDeMarcador,
  muroBajoCerramiento,
  redondearVec,
} from "./visor/utilidades";
import {
  centroCorte,
  colorDeFondo,
  normalCorte,
  planosVista,
} from "./visor/camara";
import {
  crearMaterialLinea,
  esquinasRectangulo,
  geometriaProyeccionLosa,
  lineaCerrada,
  materialProyeccionTenue,
  materialRelleno,
  rayadoRectangulo,
} from "./visor/lineas";
import {
  anchoTextoAprox,
  burbujaEje,
  crearAsaPunto,
  orientarAnotacion,
  textoCota,
} from "./visor/anotaciones";
import { useEstadoVisor } from "./visor/useEstadoVisor";
import { usePunteroVisor } from "./visor/usePunteroVisor";
import { useAnotacionesVisor } from "./visor/useAnotacionesVisor";
import { useHerramientaVisor } from "./visor/useHerramientaVisor";
import { useControlesVisor } from "./visor/useControlesVisor";
import { useRuedaVisor } from "./visor/useRuedaVisor";
import { useOverlaysVisor } from "./visor/useOverlaysVisor";
import { useGuiasVisor } from "./visor/useGuiasVisor";
import type { CotaInteractiva, Props } from "./visor/tipos";

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
    anotacionesAlzado,
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
    asasLosa,
    asasNivel,
    ayudaVisible,
    bloqueoFlechas,
    bloqueoShift,
    burbujasEje,
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
    cotasInteraccion,
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
    grosores,
    grupo,
    guiaArrastre,
    guiaCodo,
    guiaEmpujar,
    herramienta,
    iniciarEmpujarCara,
    iniciarGrabacion,
    lineaEjeEn,
    lineaNivelEn,
    lineasEje,
    lineasNivelRef,
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
    renderer,
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
    const inicioEfecto = performance.now();
    const grupoLocal = grupo.current;
    if (!grupoLocal) return;
    ejesInteraccion.current = [];
    lineasEje.current = [];
    asasNivel.current = [];
    burbujasEje.current = [];
    if (contenedor.current) contenedor.current.dataset.candadosAlineados = "[]";
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
    meshes.current = [];

    const { planos, relleno } = planosVista(vista, caja);
    const diseno = vista.estilo === "lineas-ocultas";
    const fondo = colorDeFondo(oscuro);
    const colorTrazo = oscuro ? "#e8eaed" : "#1f2328";
    const colorArista = new THREE.Color(colorTrazo);
    const tamano = Math.max(diagonalCaja(cajaVista), 2);
    const nivelesVisibles = new Set(vista.nivelesVisibles);
    const ocultosArbol = new Set(elementosOcultos);
    const visibles = mallas.filter((malla) => {
      if (!categoriaVisible(vista, malla.categoria)) return false;
      if (categoriaOculta(vista, malla.categoria)) return false;
      // O038: el ojo del árbol del proyecto oculta el elemento en todas las vistas.
      if (ocultosArbol.has(malla.globalid)) return false;
      // O005c: en planta puertas y ventanas se dibujan solo con su simbología 2D;
      // su marco y su hoja en 3D no deben asomar como un rectángulo fuera del muro.
      if (
        vista.tipo === "planta" &&
        (malla.clase === "IfcDoor" || malla.clase === "IfcWindow")
      ) {
        return false;
      }
      const gid = nivelGlobalidPorNombre.get(malla.nivel);
      if (vista.tipo === "planta") {
        // O043: la planta es un corte horizontal; se ve lo que cruza el plano o
        // queda dentro de la profundidad de vista, venga del nivel que venga.
        let minZ = Infinity;
        let maxZ = -Infinity;
        for (let i = 2; i < malla.vertices.length; i += 3) {
          const z = malla.vertices[i];
          if (z < minZ) minZ = z;
          if (z > maxZ) maxZ = z;
        }
        if (!elementoVisibleEnPlanta(vista, gid, minZ, maxZ)) return false;
      } else if (nivelesVisibles.size > 0 && gid && !nivelesVisibles.has(gid)) {
        return false;
      }
      return true;
    });

    // O049: la inferencia usa las mismas mallas visibles que el dibujo. La caja
    // se calcula una vez por redibujo; los candidatos se arman al acercarse.
    mallas3d.current = visibles.map((elemento) => ({
      globalid: elemento.globalid,
      malla: elemento,
      envolvente: envolventeDeMalla(elemento),
    }));

    // O012: en 3D no se dibujan las aristas que caen sobre la cara de otro
    // elemento unido del mismo material (extremos de viga contra columnas).
    const internasAristas =
      vista.tipo === "iso" || vista.tipo === "perspectiva"
        ? aristasInternasUniones(
            visibles
              .filter((elemento) =>
                ["vigas", "columnas", "muros", "otros"].includes(elemento.categoria),
              )
              .map((elemento) => ({
                globalid: elemento.globalid,
                categoria: elemento.categoria,
                vertices: elemento.vertices,
                indices: elemento.indices,
              })),
          )
        : new Set<string>();
    // O062: las aristas coplanares de losas y estructura sobre una cara del muro
    // se ocultan; si no, se cuelan por delante de la piel con el LineBasicMaterial.
    if (vista.tipo === "iso" || vista.tipo === "perspectiva") {
      agregarAristasOcultasSobreMuro(internasAristas, visibles);
    }

    // O012: en 3D las capas de acabado se dibujan como franjas con el mismo
    // contorno ingleteado/recortado que la planta.
    const murosCapas: MuroPlanta[] =
      vista.tipo === "iso" || vista.tipo === "perspectiva"
        ? visibles
            .filter(
              (elemento) => elemento.categoria === "muros" && elemento.eje,
            )
            .map((elemento) => ({
              globalid: elemento.globalid,
              eje: elemento.eje as [number, number, number, number],
              capas: elemento.capas,
            }))
        : [];

    // Grosor en píxeles: mm de papel de la tabla × escala de la vista × zoom actual.
    const camaraActual = camara.current;
    let mundoPorPx = Math.max(tamano / 900, 1e-4);
    if (camaraActual instanceof THREE.OrthographicCamera) {
      mundoPorPx = Math.max((camaraActual.top - camaraActual.bottom) / Math.max(dimensiones.alto, 1), 1e-6);
    } else if (camaraActual instanceof THREE.PerspectiveCamera) {
      const nav = navegacion.current;
      mundoPorPx = Math.max(
        (2 * (nav?.distancia ?? 10) * Math.tan((camaraActual.fov * Math.PI) / 360)) /
          Math.max(dimensiones.alto, 1),
        1e-6,
      );
    }
    mundoPorPxRef.current = mundoPorPx;
    altoBurbujaRef.current = mmAMundo(8, vista.escala);
    grosores.current = [];
    const registro = grosores.current;
    const grosorDe = (categoria: Parameters<typeof grosorMm>[2], tipo: "corte" | "proyeccion") =>
      grosorMm(estilos, vista, categoria, tipo);

    // Plano de sección exacto y origen para colocar rellenos y contornos.
    const corteZ = vista.alturaPlano ?? caja.max[2];
    let planoSeccion: { normal: Punto3; constante: number } | null = null;
    let origenSeccion: THREE.Vector3 | null = null;
    if (vista.tipo === "planta") {
      planoSeccion = { normal: [0, 0, 1], constante: -corteZ };
      origenSeccion = new THREE.Vector3(0, 0, corteZ);
    } else if (vista.tipo === "corte") {
      const [nx, ny] = normalCorte(vista);
      const origen = centroCorte(vista, caja);
      planoSeccion = {
        normal: [nx, ny, 0],
        constante: -(nx * origen.x + ny * origen.y),
      };
      origenSeccion = origen;
    }
    const desplazamientoSeccion = planoSeccion
      ? new THREE.Vector3(
          planoSeccion.normal[0] * -0.004,
          planoSeccion.normal[1] * -0.004,
          planoSeccion.normal[2] * -0.004,
        )
      : new THREE.Vector3();
    const base = planoSeccion ? basePlano(planoSeccion.normal) : null;
    const normalSeccion = planoSeccion
      ? new THREE.Vector3(...planoSeccion.normal).normalize()
      : new THREE.Vector3(0, 0, 1);

    let polilineasSeccion = 0;
    let lineasCapasPlanta = 0;
    let mallasCapas3D = 0;
    // O015: cuántos rellenos de losa se generaron (patrón de corte y proyección).
    let rellenosLosaPatron = 0;
    let rellenosLosaProyeccion = 0;

    /** Coloca un polígono de relleno en el plano de sección. */
    const agregarRelleno = (
      puntos: Punto3[],
      material: MaterialNombre,
      group: THREE.Group,
    ): void => {
      if (!base || puntos.length < 3) return;
      const origen = origenSeccion ?? new THREE.Vector3();
      const local = puntos.map(
        ([x, y, z]) =>
          new THREE.Vector2(
            (x - origen.x) * base.u[0] + (y - origen.y) * base.u[1] + (z - origen.z) * base.u[2],
            (x - origen.x) * base.v[0] + (y - origen.y) * base.v[1] + (z - origen.z) * base.v[2],
          ),
      );
      const forma = new THREE.Shape(local);
      const geometria = new THREE.ShapeGeometry(forma);
      const material2d = materialRelleno(material, estilos, colorTrazo);
      const malla = new THREE.Mesh(geometria, material2d);
      malla.matrixAutoUpdate = false;
      malla.matrix.makeBasis(
        new THREE.Vector3(...base.u),
        new THREE.Vector3(...base.v),
        normalSeccion,
      );
      malla.matrix.setPosition(origen);
      // O015: por encima de la tapa gris del stencil (1.1) para que el patrón del
      // material se vea también en «Sombreado».
      malla.renderOrder = 1.2;
      group.add(malla);
    };

    const stencilBase =
      relleno && vista.estilo === "sombreado"
        ? new THREE.MeshBasicMaterial({
            depthWrite: false,
            depthTest: false,
            colorWrite: false,
            stencilWrite: true,
            stencilFunc: THREE.AlwaysStencilFunc,
            clippingPlanes: planos,
          })
        : null;

    for (const elemento of visibles) {
      // O040: la dala de desplante queda abajo del corte y cubierta por el muro; en
      // planta no se dibuja (ni cuerpo, ni aristas, ni simbología).
      if (vista.tipo === "planta" && elemento.estructura?.alias === "dala") {
        continue;
      }
      const geometria = new THREE.BufferGeometry();
      geometria.setAttribute("position", new THREE.BufferAttribute(elemento.vertices, 3));
      geometria.setIndex(new THREE.BufferAttribute(elemento.indices, 1));
      // O010: normales planas por cara (vértices no compartidos) para que las caras
      // de un muro se vean de un tono uniforme en isométrico y en perspectiva.
      const plana = mallaConNormalesPlanas(elemento.vertices, elemento.indices);
      const geometriaSolido = new THREE.BufferGeometry();
      geometriaSolido.setAttribute("position", new THREE.BufferAttribute(plana.posiciones, 3));
      geometriaSolido.setAttribute("normal", new THREE.BufferAttribute(plana.normales, 3));

      const seleccionado =
        elemento.globalid === seleccion ||
        seleccionados.includes(elemento.globalid) ||
        elemento.globalid === resaltado;
      const opaco = elemento.opacidad >= 1;
      // O007a: en 3D el sólido lleva el color de la capa exterior del muro; si la
      // capa no trae color de biblioteca, se conserva el color de la categoría.
      const colorExterior =
        elemento.categoria === "muros" && elemento.capas.length > 0
          ? elemento.capas[0].color
          : undefined;
      const color = seleccionado
        ? new THREE.Color(0x2f7dd1)
        : new THREE.Color(colorExterior || elemento.color);

      // Cota inferior/superior del elemento para separar lo que queda arriba del corte.
      let minZ = Infinity;
      let maxZ = -Infinity;
      let minD = Infinity;
      let maxD = -Infinity;
      for (let i = 0; i < elemento.vertices.length; i += 3) {
        const x = elemento.vertices[i];
        const y = elemento.vertices[i + 1];
        const z = elemento.vertices[i + 2];
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
        if (planoSeccion) {
          const d =
            x * planoSeccion.normal[0] +
            y * planoSeccion.normal[1] +
            z * planoSeccion.normal[2];
          minD = Math.min(minD, d);
          maxD = Math.max(maxD, d);
        }
      }
      // O005b: por encima del corte solo se dibuja la silueta de losas, cubiertas y
      // vigas del mismo nivel. El resto (viguetas y elementos del piso de arriba) no
      // aparece en la planta.
      const encimaDelCorte =
        vista.tipo === "planta" && planoSeccion !== null && minZ > corteZ + 1e-4;
      const nivelDelElemento = nivelGlobalidPorNombre.get(elemento.nivel);
      const siluetaArriba =
        encimaDelCorte &&
        dibujaSiluetaSobreCorte(vista, elemento.categoria, nivelDelElemento, minZ);

      // O015: la relación con el plano de corte y el relleno salen de una regla
      // única (`rellenoDeElemento`), no de casos sueltos por categoría.
      const atraviesa =
        planoSeccion !== null &&
        minD <= -planoSeccion.constante + 1e-4 &&
        maxD >= -planoSeccion.constante - 1e-4;
      const relacion: RelacionCorte =
        vista.tipo === "planta"
          ? encimaDelCorte
            ? "arriba"
            : maxZ < corteZ - 1e-4
              ? "debajo"
              : "cortado"
          : atraviesa
            ? "cortado"
            : "arriba";
      const rellenoElemento = rellenoDeElemento(
        elemento.categoria,
        relacion,
        vista.estilo,
      );

      const material = crearMaterialElemento({
        diseno,
        seleccionado,
        color,
        fondo,
        opaco,
        opacidad: elemento.opacidad,
        planos,
        categoria: elemento.categoria,
      });
      // Lo que queda por encima del corte no se dibuja como cara: solo su silueta
      // discontinua, para que no tape la planta.
      const capas3d =
        !encimaDelCorte && murosCapas.length > 0
          ? crearMallasCapas(elemento, murosCapas, minZ, maxZ, {
              seleccionado,
              planos,
              opacidad: elemento.opacidad,
              aberturas,
            })
          : [];
      if (capas3d.length > 0) {
        // Las franjas cubren toda la sección: se sustituye el cuerpo de un solo
        // color para que no haya caras coplanares en competencia.
        for (const malla of capas3d) {
          malla.renderOrder = 0;
          grupoLocal.add(malla);
          meshes.current.push(malla);
          mallasCapas3D += 1;
        }
        material.dispose();
        geometriaSolido.dispose();
      } else if (!encimaDelCorte) {
        const malla = new THREE.Mesh(geometriaSolido, material);
        malla.userData.globalid = elemento.globalid;
        malla.renderOrder = 0;
        grupoLocal.add(malla);
        meshes.current.push(malla);
      } else {
        material.dispose();
        geometriaSolido.dispose();
      }

      const categoriaEstilo = elemento.categoria;
      // O040: el cerramiento y la dala no se dibujan como silueta genérica: el
      // cerramiento se traza con dos líneas discontinuas en la simbología y la dala
      // (abajo del corte, cubierta) no se dibuja.
      const esCerramientoODala =
        elemento.estructura?.alias === "cerramiento" ||
        elemento.estructura?.alias === "dala";
      if (diseno) {
        if (siluetaArriba && !esCerramientoODala) {
          const mm = grosorDe("arriba-corte", "proyeccion");
          const siluetas =
            mm === null ? [] : siluetaProyectada(elemento.vertices, elemento.indices);
          if (mm !== null && siluetas.length > 0) {
            const materialLinea = crearMaterialLinea({
              mm,
              escala: vista.escala,
              color: seleccionado ? "#ff8a00" : "#444",
              // Siempre trazo discontinuo largo, como pide la spec.
              patron: "discontinua-larga",
              registro,
              mundoPorPx,
              profundidad: true,
            });
            const zSilueta = corteZ + 0.04;
            for (const polilinea of siluetas) {
              const puntos = polilinea.map(([x, y]) => [x, y, zSilueta] as [number, number, number]);
              if (puntos.length < 2) continue;
              const primero = puntos[0];
              const ultimo = puntos[puntos.length - 1];
              if (Math.hypot(primero[0] - ultimo[0], primero[1] - ultimo[1]) > 1e-4) {
                puntos.push(primero);
              }
              lineaCerrada(puntos, materialLinea, 0.6, grupoLocal);
            }
          }
        } else if (!encimaDelCorte) {
          const bordes = new THREE.EdgesGeometry(geometria, 30);
          const mm = grosorDe(categoriaEstilo, "proyeccion");
          // O006e: en planta los muros se dibujan con la huella unida, no con las
          // aristas de cada cuerpo (que dejarían líneas dentro de la esquina).
          if (mm !== null && !(vista.tipo === "planta" && categoriaEstilo === "muros")) {
            const materialLinea = crearMaterialLinea({
              mm,
              escala: vista.escala,
              color: seleccionado ? "#ff8a00" : "#444",
              patron: "continua",
              registro,
              mundoPorPx,
              profundidad: true,
            });
            materialLinea.clippingPlanes = planos;
            const segmentos = new LineSegmentsGeometry().fromEdgesGeometry(bordes);
            const lineas = new LineSegments2(segmentos, materialLinea);
            lineas.computeLineDistances();
            lineas.renderOrder = 0.5;
            grupoLocal.add(lineas);
          }
          bordes.dispose();
        }
      } else if (
        // O010: en 3D (iso y perspectiva) las aristas se dibujan siempre, también en
        // «Sombreado»; antes la perspectiva se quedaba sin bordes.
        (vista.estilo !== "sombreado" ||
          vista.tipo === "iso" ||
          vista.tipo === "perspectiva") &&
        !encimaDelCorte &&
        !(vista.tipo === "planta" && categoriaEstilo === "muros")
      ) {
        const segmentos = aristasParaElemento(
          elemento.vertices,
          elemento.indices,
          internasAristas,
        );
        if (segmentos.length > 0) {
          const geometriaAristas = new THREE.BufferGeometry();
          geometriaAristas.setAttribute(
            "position",
            new THREE.BufferAttribute(segmentos, 3),
          );
          const aristas = new THREE.LineSegments(
            geometriaAristas,
            new THREE.LineBasicMaterial({
              color: seleccionado ? new THREE.Color(0xff8a00) : colorArista,
              clippingPlanes: planos,
            }),
          );
          aristas.userData.globalid = elemento.globalid;
          aristas.renderOrder = 0.5;
          grupoLocal.add(aristas);
        }
      }

      // O015: la losa que queda debajo del corte se rellena con una proyección
      // tenue sobre el plano de planta, además de su contorno de proyección.
      if (rellenoElemento === "proyeccion-tenue" && vista.tipo === "planta") {
        const geometriaProyeccion = geometriaProyeccionLosa(elemento, corteZ - 0.01);
        if (geometriaProyeccion) {
          const proyeccion = new THREE.Mesh(geometriaProyeccion, materialProyeccionTenue());
          proyeccion.userData.globalid = elemento.globalid;
          proyeccion.renderOrder = 1.05;
          grupoLocal.add(proyeccion);
          meshes.current.push(proyeccion);
          rellenosLosaProyeccion += 1;
        }
      }

      // Sección real del plano de corte con esta malla (solo si lo atraviesa).
      if (
        planoSeccion &&
        origenSeccion &&
        !encimaDelCorte &&
        atraviesa &&
        (rellenoElemento === "patron" || rellenoElemento === "patron-sombreado")
      ) {
        const polilineas = interseccionPlanoMalla(
          elemento.vertices,
          elemento.indices,
          planoSeccion,
        );
        if (polilineas.length > 0) {
          const mmCorte = grosorDe(categoriaEstilo, "corte");
          const colorCorte = seleccionado
            ? "#ff8a00"
            : estilos.categorias[categoriaEstilo].color;
          for (const polilinea of polilineas) {
            polilineasSeccion += 1;
            const puntos = polilinea.puntos.map((p) => [
              p[0] + desplazamientoSeccion.x,
              p[1] + desplazamientoSeccion.y,
              p[2] + desplazamientoSeccion.z,
            ] as [number, number, number]);
            if (puntos.length >= 2) {
              const esMuroEnPlanta = vista.tipo === "planta" && categoriaEstilo === "muros";
              if (mmCorte !== null && !esMuroEnPlanta) {
                const materialCorte = crearMaterialLinea({
                  mm: mmCorte,
                  escala: vista.escala,
                  color: colorCorte,
                  registro,
                  mundoPorPx,
                  profundidad: false,
                });
                lineaCerrada([...puntos, puntos[0]], materialCorte, 1.3, grupoLocal);
              }
              // Relleno por material: una banda por capa del IfcMaterialLayerSet.
              if (!base) continue;
              const mapa2d = polilinea.puntos.map(([x, y, z]) => {
                const dx = x - origenSeccion.x;
                const dy = y - origenSeccion.y;
                const dz = z - origenSeccion.z;
                return [
                  dx * base.u[0] + dy * base.u[1] + dz * base.u[2],
                  dx * base.v[0] + dy * base.v[1] + dz * base.v[2],
                ] as PuntoSeccion;
              });
              const capas = elemento.capas ?? [];
              const bandas =
                capas.length > 1
                  ? dividirEnCapas(mapa2d, capas)
                  : [{ puntos: mapa2d, material: elemento.tipo }];
              for (const banda of bandas) {
                const puntos3 = banda.puntos.map(([u, v]) => {
                  const dx = origenSeccion.x + base.u[0] * u + base.v[0] * v;
                  const dy = origenSeccion.y + base.u[1] * u + base.v[1] * v;
                  const dz = origenSeccion.z + base.u[2] * u + base.v[2] * v;
                  return [dx, dy, dz] as Punto3;
                });
                // O006e: en planta el relleno y el rayado del muro salen de la
                // huella unida, no de cada banda de la sección 3D.
                if (!(vista.tipo === "planta" && categoriaEstilo === "muros")) {
                  agregarRelleno(
                    puntos3,
                    materialPorCapa(banda.material),
                    grupoLocal,
                  );
                  if (categoriaEstilo === "losas") rellenosLosaPatron += 1;
                }
              }
              if (capas.length > 1 && !esMuroEnPlanta) {
                // Línea fina entre capas: contorno de cada banda con trazo de 0,1 mm.
                for (const banda of bandas) {
                  const esNucleo = elemento.capas.some(
                    (capa) => capa.funcion === "núcleo" && capa.material === banda.material,
                  );
                  const mm = (esNucleo ? 0.35 : 0.1) * factorEscala(vista.escala);
                  const materialBanda = crearMaterialLinea({
                    mm,
                    escala: vista.escala,
                    color: colorCorte,
                    registro,
                    mundoPorPx,
                    profundidad: false,
                  });
                  const puntosBanda = banda.puntos.map(([u, v]) => [
                    origenSeccion!.x + base.u[0] * u + base.v[0] * v + desplazamientoSeccion.x,
                    origenSeccion!.y + base.u[1] * u + base.v[1] * v + desplazamientoSeccion.y,
                    origenSeccion!.z + base.u[2] * u + base.v[2] * v + desplazamientoSeccion.z,
                  ] as [number, number, number]);
                  lineaCerrada(
                    [...puntosBanda, puntosBanda[0]],
                    materialBanda,
                    esNucleo ? 1.8 : 1.2,
                    grupoLocal,
                  );
                }
              }
            }
          }
        }
      }

      if (stencilBase && relleno) {
        const materialAtras = stencilBase.clone();
        materialAtras.side = THREE.BackSide;
        materialAtras.stencilFail = THREE.IncrementWrapStencilOp;
        materialAtras.stencilZFail = THREE.IncrementWrapStencilOp;
        materialAtras.stencilZPass = THREE.IncrementWrapStencilOp;
        const atras = new THREE.Mesh(geometria, materialAtras);
        atras.renderOrder = 1;
        grupoLocal.add(atras);
        const materialFrente = stencilBase.clone();
        materialFrente.side = THREE.FrontSide;
        materialFrente.stencilFail = THREE.DecrementWrapStencilOp;
        materialFrente.stencilZFail = THREE.DecrementWrapStencilOp;
        materialFrente.stencilZPass = THREE.DecrementWrapStencilOp;
        const frente = new THREE.Mesh(geometria, materialFrente);
        frente.renderOrder = 1;
        grupoLocal.add(frente);
      }
    }

    // Relleno de la sección por stencil solo en «Sombreado».
    if (relleno && vista.estilo === "sombreado" && visibles.length > 0) {
      const materialStencil = new THREE.MeshBasicMaterial({
        color: new THREE.Color(0x4a4a4a),
        side: THREE.DoubleSide,
        depthWrite: false,
        stencilWrite: true,
        stencilRef: 0,
        stencilFunc: THREE.NotEqualStencilFunc,
        stencilFail: THREE.ReplaceStencilOp,
        stencilZFail: THREE.ReplaceStencilOp,
        stencilZPass: THREE.ReplaceStencilOp,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      });
      const tapa = new THREE.Mesh(new THREE.PlaneGeometry(tamano * 2, tamano * 2), materialStencil);
      const normal = relleno.plano.normal.clone().normalize();
      tapa.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      tapa.position.copy(relleno.origen);
      tapa.renderOrder = 1.1;
      tapa.onAfterRender = (rendererLocal) => rendererLocal.clearStencil();
      grupoLocal.add(tapa);
    }

    // O006e: planta de muros limpia. El contorno es la unión de las huellas; las
    // capas se recortan contra el núcleo vecino y el rayado no duplica traslapes.
    if (vista.tipo === "planta" && !categoriaOculta(vista, "muros")) {
      const murosPlanta: MuroPlanta[] = visibles
        .filter((elemento) => elemento.categoria === "muros" && elemento.eje)
        .map((elemento) => ({
          globalid: elemento.globalid,
          eje: elemento.eje as [number, number, number, number],
          capas: elemento.capas,
        }));
      // O007c: castillos y columnas recortan el núcleo; los acabados solo se cortan
      // en las columnas y pasan por encima del castillo.
      const seccionesPlanta = visibles
        .filter(
          (elemento) =>
            elemento.estructura &&
            (elemento.estructura.alias === "castillo" ||
              elemento.estructura.alias === "columna"),
        )
        .map((elemento) => {
          const seccion = elemento.estructura?.seccion ?? {};
          const datos = elemento.estructura?.datos ?? {};
          const numero = (valor: unknown, respaldo = 0) => Number(valor) || respaldo;
          const ancho = numero(datos.B, numero(seccion.B, numero(seccion.D, 0.15)));
          const fondo = numero(datos.H, numero(seccion.H, numero(seccion.D, 0.15)));
          return {
            globalid: elemento.globalid,
            x: numero(datos.X),
            y: numero(datos.Y),
            ancho,
            fondo,
            rotacion: numero(datos.Rotacion),
            funcion: elemento.estructura?.alias === "columna"
              ? ("columna" as const)
              : ("castillo" as const),
          };
        });
      if (murosPlanta.length > 0) {
        const planta = calcularPlantaMuros(murosPlanta, seccionesPlanta);
        // E2E: el contorno que de verdad se dibuja, para medirlo sin leer píxeles.
        (window as unknown as { __OPENRVT_PLANTA_MUROS__?: unknown }).__OPENRVT_PLANTA_MUROS__ =
          planta.contorno;
        const zPlantas = corteZ + 0.035;
        const colorPlantas = oscuro ? "#e5e7eb" : estilos.categorias.muros.color;
        const materialContorno = crearMaterialLinea({
          mm: 0.35,
          escala: vista.escala,
          color: colorPlantas,
          registro,
          mundoPorPx,
          profundidad: false,
        });
        for (const poligono of planta.contorno) {
          for (const anillo of [poligono.exterior, ...poligono.huecos]) {
            if (anillo.length < 3) continue;
            lineaCerrada(
              anillo.map(([x, y]) => [x, y, zPlantas] as [number, number, number]),
              materialContorno,
              2.1,
              grupoLocal,
            );
          }
        }
        if (vista.escala <= 50) {
          const materialFino = crearMaterialLinea({
            mm: 0.1,
            escala: vista.escala,
            color: colorPlantas,
            registro,
            mundoPorPx,
            profundidad: false,
          });
          const materialNucleo = crearMaterialLinea({
            mm: 0.35,
            escala: vista.escala,
            color: colorPlantas,
            registro,
            mundoPorPx,
            profundidad: false,
          });
          const materialRaya = crearMaterialLinea({
            mm: 0.08,
            escala: vista.escala,
            color: colorPlantas,
            registro,
            mundoPorPx,
            profundidad: false,
          });
          for (const capa of planta.capas) {
            const material = capa.funcion === "núcleo" ? materialNucleo : materialFino;
            for (const linea of capa.lineas) {
              if (linea.length < 2) continue;
              lineaCerrada(
                linea.map(([x, y]) => [x, y, zPlantas] as [number, number, number]),
                material,
                capa.funcion === "núcleo" ? 1.8 : 0.8,
                grupoLocal,
              );
              lineasCapasPlanta += 1;
            }
          }
          for (const linea of planta.rayado) {
            if (linea.length < 2) continue;
            lineaCerrada(
              linea.map(([x, y]) => [x, y, zPlantas] as [number, number, number]),
              materialRaya,
              0.7,
              grupoLocal,
            );
            lineasCapasPlanta += 1;
          }
        }
      }
    }

    // O007b: simbología de los elementos estructurales en planta. Las columnas y
    // castillos se rellenan con el rayado de concreto; trabes, cerramientos, dalas,
    // zapatas y contratrabes se dibujan con líneas discontinuas.
    if (vista.tipo === "planta") {
      const zEstructura = corteZ + 0.045;
      const p3 = (p: [number, number]): [number, number, number] => [p[0], p[1], zEstructura];
      for (const elemento of visibles) {
        const estructura = elemento.estructura;
        if (!estructura) continue;
        const seccion = estructura.seccion ?? {};
        const datos = estructura.datos ?? {};
        const numero = (valor: unknown, respaldo = 0) =>
          Number(valor) || respaldo;
        const alias = estructura.alias;
        const color =
          seleccion === elemento.globalid ||
          seleccionados.includes(elemento.globalid) ||
          resaltado === elemento.globalid
            ? "#ff8a00"
            : estilos.categorias[elemento.categoria].color;
        const mm = grosorDe(elemento.categoria, "corte") ?? 0.35;
        const trazado = (
          puntos: Array<[number, number]>,
          patron: PatronLinea,
          grosor = mm,
          cerrada = true,
        ) => {
          if (puntos.length < 2) return;
          const material = crearMaterialLinea({
            mm: grosor,
            escala: vista.escala,
            color,
            patron,
            registro,
            mundoPorPx,
            profundidad: false,
          });
          const lista = puntos.map(p3);
          if (cerrada) lista.push(p3(puntos[0]));
          lineaCerrada(lista, material, 1.35, grupoLocal);
        };
        if (alias === "columna" || alias === "castillo") {
          const ancho = numero(datos.B, numero(seccion.B, 0.30));
          const fondo = numero(datos.H, numero(seccion.H, 0.30));
          const cx = numero(datos.X);
          const cy = numero(datos.Y);
          const rotacion = numero(datos.Rotacion);
          const esquinas = esquinasRectangulo(cx, cy, rotacion, ancho, fondo);
          agregarRelleno(
            esquinas.map(([x, y]) => [x, y, zEstructura] as Punto3),
            "concreto",
            grupoLocal,
          );
          if (String(seccion.Forma ?? "rectangular") === "circular") {
            const radio = numero(seccion.D, ancho) / 2;
            const circulo: Array<[number, number]> = [];
            for (let i = 0; i < 24; i += 1) {
              const angulo = (i / 24) * Math.PI * 2;
              circulo.push([cx + radio * Math.cos(angulo), cy + radio * Math.sin(angulo)]);
            }
            trazado(circulo, "continua");
          } else {
            trazado(esquinas, "continua");
            const materialRaya = crearMaterialLinea({
              mm: 0.08,
              escala: vista.escala,
              color,
              registro,
              mundoPorPx,
              profundidad: false,
            });
            const coseno = Math.cos(rotacion);
            const seno = Math.sin(rotacion);
            for (const [[x1, y1], [x2, y2]] of rayadoRectangulo(ancho, fondo)) {
              const punto = (x: number, y: number): [number, number, number] => [
                cx + x * coseno - y * seno,
                cy + x * seno + y * coseno,
                zEstructura,
              ];
              lineaCerrada([punto(x1, y1), punto(x2, y2)], materialRaya, 1.2, grupoLocal);
            }
          }
        } else if (alias === "cerramiento") {
          // O041: en planta el cerramiento es UNA línea discontinua sobre su eje,
          // fina y encima del achurado del muro. Al seleccionarlo se resalta su
          // huella completa; suelto (sin muro debajo) se dibuja el contorno completo.
          const ancho = numero(seccion.B, 0.20);
          const eje: [number, number, number, number] = [
            numero(datos.X1),
            numero(datos.Y1),
            numero(datos.X2),
            numero(datos.Y2),
          ];
          const resaltadoAqui = seleccion === elemento.globalid || seleccionados.includes(elemento.globalid) || resaltado === elemento.globalid;
          const material = crearMaterialLinea({
            mm,
            escala: vista.escala,
            color: resaltadoAqui ? "#ff8a00" : color,
            patron: "discontinua",
            registro,
            mundoPorPx,
            profundidad: false,
          });
          if (resaltadoAqui || !muroBajoCerramiento(eje, mallas)) {
            const contorno = contornoCerramientoPlanta(eje, ancho);
            if (contorno.length > 0) {
              lineaCerrada(contorno.map((p) => p3(p)), material, 1.35, grupoLocal);
            }
          } else {
            const linea = lineaEjeCerramientoPlanta(eje);
            if (linea) {
              lineaCerrada([p3(linea[0]), p3(linea[1])], material, 1.35, grupoLocal);
            }
          }
        } else if (alias === "trabe") {
          const ancho = numero(seccion.B, 0.20);
          const x1 = numero(datos.X1);
          const y1 = numero(datos.Y1);
          const x2 = numero(datos.X2);
          const y2 = numero(datos.Y2);
          const largo = Math.hypot(x2 - x1, y2 - y1);
          if (largo <= 1e-6) continue;
          const ux = (x2 - x1) / largo;
          const uy = (y2 - y1) / largo;
          const nx = -uy * ancho / 2;
          const ny = ux * ancho / 2;
          trazado(
            [
              [x1 + nx, y1 + ny], [x2 + nx, y2 + ny],
              [x2 - nx, y2 - ny], [x1 - nx, y1 - ny],
            ],
            "discontinua",
          );
        } else if (alias === "zapata") {
          const largo = numero(seccion.Largo, 1.20);
          const ancho = numero(seccion.Ancho, 1.20);
          const esquinas = esquinasRectangulo(
            numero(datos.X), numero(datos.Y), numero(datos.Rotacion), largo, ancho,
          );
          trazado(esquinas, "discontinua-larga");
          const dadoB = numero(seccion.DadoB);
          const dadoH = numero(seccion.DadoH);
          if (dadoB > 0 && dadoH > 0) {
            trazado(
              esquinasRectangulo(
                numero(datos.X), numero(datos.Y), numero(datos.Rotacion), dadoB, dadoH,
              ),
              "discontinua",
            );
          }
        } else if (alias === "zapata_corrida" || alias === "contratrabe") {
          const ancho = alias === "zapata_corrida"
            ? numero(seccion.Ancho, 0.60)
            : numero(seccion.B, 0.20);
          const x1 = numero(datos.X1);
          const y1 = numero(datos.Y1);
          const x2 = numero(datos.X2);
          const y2 = numero(datos.Y2);
          const largo = Math.hypot(x2 - x1, y2 - y1);
          if (largo <= 1e-6) continue;
          const ux = (x2 - x1) / largo;
          const uy = (y2 - y1) / largo;
          const nx = -uy * ancho / 2;
          const ny = ux * ancho / 2;
          trazado(
            [
              [x1 + nx, y1 + ny], [x2 + nx, y2 + ny],
              [x2 - nx, y2 - ny], [x1 - nx, y1 - ny],
            ],
            "discontinua-larga",
          );
        }
      }
    }

    // O005: simbología 2D de puertas y ventanas, solo en plantas.
    if (vista.tipo === "planta") {
      const z = corteZ + 0.02;
      for (const abertura of aberturas) {
        const esPuerta = abertura.clase === "IfcDoor";
        if (!categoriaVisible(vista, abertura.categoria)) continue;
        if (categoriaOculta(vista, abertura.categoria)) continue;
        const mm = grosorDe(abertura.categoria, "corte") ?? 0.25;
        const mmFino = grosorDe(abertura.categoria, "proyeccion") ?? 0.13;
        const colorSimbolo = estilos.categorias[abertura.categoria].color;
        const a3 = (p: Punto2): [number, number, number] => [p[0], p[1], z];
        if (esPuerta) {
          const { hoja, arco } = geometriaPuerta({
            ancho: abertura.ancho,
            volteado: abertura.volteado,
          });
          const hojaMundo = colocarSimbolo(hoja, abertura.centro, abertura.angulo);
          const arcoMundo = colocarSimbolo(arco, abertura.centro, abertura.angulo);
          const materialHoja = crearMaterialLinea({
            mm,
            escala: vista.escala,
            color: colorSimbolo,
            registro,
            mundoPorPx,
            profundidad: false,
          });
          lineaCerrada(hojaMundo.map(a3), materialHoja, 2, grupoLocal);
          const materialArco = crearMaterialLinea({
            mm: Math.min(mmFino, 0.18),
            escala: vista.escala,
            color: colorSimbolo,
            registro,
            mundoPorPx,
            profundidad: false,
          });
          lineaCerrada(arcoMundo.map(a3), materialArco, 2, grupoLocal);
        } else {
          const { lineas, alfeizar } = geometriaVentana({
            ancho: abertura.ancho,
            espesor: abertura.espesor,
          });
          const materialVentana = crearMaterialLinea({
            mm: mmFino,
            escala: vista.escala,
            color: colorSimbolo,
            registro,
            mundoPorPx,
            profundidad: false,
          });
          for (const linea of lineas) {
            lineaCerrada(
              colocarSimbolo(linea, abertura.centro, abertura.angulo).map(a3),
              materialVentana,
              2,
              grupoLocal,
            );
          }
          const materialAlfeizar = crearMaterialLinea({
            mm: 0.1,
            escala: vista.escala,
            color: colorSimbolo,
            registro,
            mundoPorPx,
            profundidad: false,
          });
          lineaCerrada(
            colocarSimbolo(alfeizar, abertura.centro, abertura.angulo).map(a3),
            materialAlfeizar,
            1.9,
            grupoLocal,
          );
        }
      }
    }

    // O005c: ejes en todas las plantas, con la plumilla «Ejes» de O005. Se dibujan a
    // partir de modelo.referencias porque geometria.teselar no devuelve mallas de ejes.
    if (vista.tipo === "planta" && referencias.ejes.length > 0) {
      const mmEjes = grosorDe("ejes", "proyeccion");
      if (mmEjes !== null) {
        const zEje = corteZ + 0.05;
        const estiloEje = estilos.categorias.ejes;
        const colorEje = oscuro ? "#e0b07a" : estiloEje.color;
        const materialEje = crearMaterialLinea({
          mm: mmEjes,
          escala: vista.escala,
          color: colorEje,
          patron: "trazo-punto",
          profundidad: false,
          registro,
          mundoPorPx,
        });
        // O037: material continuo para el trazo-punto dibujado por segmentos; antes
        // las asas usaban el material discontinuo y quedaban partidas.
        const materialEjeContinuo = crearMaterialLinea({
          mm: mmEjes,
          escala: vista.escala,
          color: colorEje,
          profundidad: false,
          registro,
          mundoPorPx,
        });
        // O044: de V1 al globo la línea es continua, del mismo grosor y color.
        const materialEjeSolido = crearMaterialLinea({
          mm: mmEjes,
          escala: vista.escala,
          color: colorEje,
          profundidad: false,
          registro,
          mundoPorPx,
        });
        // O011: el globo mide 8 mm de papel (0.8 m a 1:100), como en Revit.
        const altoBurbuja = mmAMundo(8, vista.escala);
        contextoEje.current = {
          tipo: "planta",
          d: [0, 0],
          h: [1, 0],
          profundidad: 0,
          z: zEje,
          bases: Object.fromEntries(
            referencias.ejes.map((eje) => [
              eje.globalid,
              { inicio: [eje.x1, eje.y1] as Punto2, fin: [eje.x2, eje.y2] as Punto2 },
            ]),
          ),
        };
        for (const eje of referencias.ejes) {
          const dx = eje.x2 - eje.x1;
          const dy = eje.y2 - eje.y1;
          const largo = Math.hypot(dx, dy);
          if (largo < 1e-6) continue;
          const ajuste = ajusteEnCurso?.[eje.globalid] ?? vista.ejes?.[eje.globalid];
          const tocaInicio = !!ajuste && (!!ajuste.extremoInicio || !!ajuste.codosInicio?.length);
          const g = geometriaEje(ajuste, [eje.x1, eje.y1], [eje.x2, eje.y2], {
            globoInicio: tocaInicio,
            diametroGlobo: altoBurbuja,
          });
          const puntos = g.puntos.map(([x, y]) => [x, y, zEje] as [number, number, number]);
          // O042: el patrón trazo-punto llega hasta V1; de V1 al globo el tramo es
          // continuo y fino. Sin codos se dibuja toda la línea con su patrón.
          for (const [a, b] of segmentosTrazoPunto(g.ejeDiscontinuo, vista.escala)) {
            lineaCerrada(
              [[a[0], a[1], zEje], [b[0], b[1], zEje]],
              materialEjeContinuo,
              1.6,
              grupoLocal,
            );
          }
          for (const tramo of g.tramosSolidos) {
            if (tramo.length < 2) continue;
            lineaCerrada(
              tramo.map(([x, y]) => [x, y, zEje] as [number, number, number]),
              materialEjeSolido,
              1.7,
              grupoLocal,
            );
          }
          lineasEje.current.push({ globalid: eje.globalid, etiqueta: eje.etiqueta, puntos });
          const globos: Array<{ punto: Punto2; lado: LadoEje }> = [];
          if (globoVisibleEje(ajuste, "fin")) globos.push({ punto: g.globoFin, lado: "fin" });
          if (g.globoInicio && globoVisibleEje(ajuste, "inicio")) {
            globos.push({ punto: g.globoInicio, lado: "inicio" });
          }
          for (const { punto, lado } of globos) {
            const burbuja = burbujaEje(
              eje.etiqueta,
              colorEje,
              oscuro ? "#1f2328" : "#ffffff",
            );
            if (burbuja) {
              burbuja.position.set(punto[0], punto[1], zEje + 0.01);
              burbuja.scale.set(altoBurbuja, altoBurbuja, 1);
              burbuja.renderOrder = 20;
              grupoLocal.add(burbuja);
              burbujasEje.current.push({ etiqueta: eje.etiqueta, grupo: burbuja });
            }
            // O042: con codo el globo se deriva de V2 y no tiene pinzamiento.
            const codosLado = (lado === "inicio" ? ajuste?.codosInicio : ajuste?.codosFin) ?? [];
            if (codosLado.length === 0) {
              ejesInteraccion.current.push({
                globalid: eje.globalid,
                etiqueta: eje.etiqueta,
                lado,
                tipo: "globo",
                indice: null,
                punto: [punto[0], punto[1], zEje],
              });
            }
          }
          // O044: V1 y V2 se ven como puntos pequeños (como en la referencia) y los
          // dos son pinzamientos. Nada de cuadros alrededor de los nodos.
          const radioNodo = mmAMundo(0.55, vista.escala);
          for (const codo of [
            ...(ajuste?.codosInicio ?? []),
            ...(ajuste?.codosFin ?? []),
          ]) {
            const nodo = new THREE.Mesh(
              new THREE.CircleGeometry(radioNodo, 12),
              new THREE.MeshBasicMaterial({
                color: new THREE.Color(colorEje),
                side: THREE.DoubleSide,
                depthTest: false,
                depthWrite: false,
              }),
            );
            nodo.position.set(codo[0], codo[1], zEje + 0.02);
            nodo.renderOrder = 19;
            grupoLocal.add(nodo);
          }
          for (const asaCodo of asasCodoVista(ajuste)) {
            ejesInteraccion.current.push({
              globalid: eje.globalid,
              etiqueta: eje.etiqueta,
              lado: asaCodo.lado,
              tipo: "codo",
              indice: asaCodo.indice,
              punto: [asaCodo.punto[0], asaCodo.punto[1], zEje],
            });
          }
          // O021: sin codo, un asa junto al globo para crearlo arrastrando.
          for (const { lado } of globos) {
            const codosLado = (lado === "inicio" ? ajuste?.codosInicio : ajuste?.codosFin) ?? [];
            if (codosLado.length > 0) continue;
            const separacionCodo = altoBurbuja * 0.9;
            const asaCodo = puntoAsaCodoNuevo(
              ajuste,
              { inicio: [eje.x1, eje.y1], fin: [eje.x2, eje.y2] },
              lado,
              separacionCodo,
              altoBurbuja,
            );
            ejesInteraccion.current.push({
              globalid: eje.globalid,
              etiqueta: eje.etiqueta,
              lado,
              tipo: "codo-nuevo",
              indice: null,
              punto: [asaCodo[0], asaCodo[1], zEje],
            });
          }
          // O042 (revisión): en un extremo con codo el extremo original ya no se
          // dibuja; su pinzamiento quedaría flotando fuera de la polilínea. Ese
          // lado solo conserva los pinzamientos de V1 y V2.
          if ((ajuste?.codosInicio?.length ?? 0) === 0) {
            ejesInteraccion.current.push({
              globalid: eje.globalid,
              etiqueta: eje.etiqueta,
              lado: "inicio",
              tipo: "base",
              indice: null,
              punto: [g.baseInicio[0], g.baseInicio[1], zEje],
            });
          }
          if ((ajuste?.codosFin?.length ?? 0) === 0) {
            ejesInteraccion.current.push({
              globalid: eje.globalid,
              etiqueta: eje.etiqueta,
              lado: "fin",
              tipo: "base",
              indice: null,
              punto: [g.baseFin[0], g.baseFin[1], zEje],
            });
          }
        }

        // O027: un candado por grupo de extremos alineados (no uno por eje), junto
        // a la fila. Cerrado mueve la alineación; abierto mueve solo el eje pulsado.
        const grupos = new Map<
          string,
          { vertical: boolean; lado: LadoEje; puntos: Punto2[] }
        >();
        for (const eje of referencias.ejes) {
          const bases = contextoEje.current?.bases[eje.globalid];
          if (!bases) continue;
          const ajuste = ajusteEnCurso?.[eje.globalid] ?? vista.ejes?.[eje.globalid];
          for (const lado of ["inicio", "fin"] as const) {
            const p = extremoEje(ajuste, lado, bases.inicio, bases.fin);
            const coordenada = eje.vertical ? p[1] : p[0];
            const clave = `${eje.vertical ? "v" : "h"}:${lado}:${coordenada.toFixed(3)}`;
            const grupo = grupos.get(clave) ?? { vertical: !!eje.vertical, lado, puntos: [] };
            grupo.puntos.push(p);
            grupos.set(clave, grupo);
          }
        }
        const candadosAlineados: Array<{
          familia: string;
          lado: LadoEje;
          estado: string;
          ejes: number;
        }> = [];
        const tamanoCandado = altoBurbuja * 0.55;
        for (const grupo of grupos.values()) {
          if (grupo.puntos.length < 2) continue;
          const centro: Punto2 = [
            grupo.puntos.reduce((suma, p) => suma + p[0], 0) / grupo.puntos.length,
            grupo.puntos.reduce((suma, p) => suma + p[1], 0) / grupo.puntos.length,
          ];
          const signo = grupo.lado === "inicio" ? -1 : 1;
          const alto = grupo.vertical
            ? centro[1] + signo * altoBurbuja * 1.6
            : centro[1];
          const x = grupo.vertical ? centro[0] : centro[0] + signo * altoBurbuja * 1.6;
          const ancho = tamanoCandado * 0.62;
          const fondo = alto - tamanoCandado * 0.15;
          const techo = alto + tamanoCandado * 0.35;
          lineaCerrada(
            [
              [x - ancho / 2, fondo, zEje],
              [x + ancho / 2, fondo, zEje],
              [x + ancho / 2, techo, zEje],
              [x - ancho / 2, techo, zEje],
              [x - ancho / 2, fondo, zEje],
            ],
            materialEje,
            2.2,
            grupoLocal,
          );
          const abierto = candados[grupo.lado];
          const arco = abierto ? 0.8 : 1;
          const puntosArco: Array<[number, number, number]> = [];
          for (let i = 0; i <= 8; i += 1) {
            const t = Math.PI * (i / 8) * arco;
            puntosArco.push([
              x + Math.cos(t) * (ancho / 2) + (abierto ? ancho * 0.35 : 0),
              techo + Math.sin(t) * tamanoCandado * 0.35,
              zEje,
            ]);
          }
          lineaCerrada(puntosArco, materialEje, 2.2, grupoLocal);
          candadosAlineados.push({
            familia: grupo.vertical ? "vertical" : "horizontal",
            lado: grupo.lado,
            estado: abierto ? "abierto" : "cerrado",
            ejes: grupo.puntos.length,
          });
        }
        if (contenedor.current) {
          contenedor.current.dataset.candadosAlineados = JSON.stringify(candadosAlineados);
        }
      }
    }

    // O006a: cotas de ejes automáticas en planta. Se derivan de los ejes; no son
    // IfcAnnotation y no se guardan en el IFC.
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

    // O006a: niveles y ejes en alzados y cortes. La línea de nivel va de extremo a
    // extremo del modelo más 1 m por lado; la cabeza y las cotas quedan en el extremo.
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

    // O027: un punto de asa por cada zona interactiva, de tamaño constante en
    // pantalla. Se resaltan al pasar el cursor y se ocultan las de ejes no activos.
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
