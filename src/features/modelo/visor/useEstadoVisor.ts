/* eslint-disable react-hooks/immutability -- los refs del visor son mutables por diseño. */
import * as THREE from "three";
import { CacheCandidatosMallas, type Envolvente, type MallaCandidata } from "../candidatos3d";
import { camarasPorVista, type Navegacion } from "./camara";
import { guardarModoOrbitar, leerModoOrbitar, type AccionArrastre } from "../orbita";
import {  } from "./anotaciones";
import { type AjusteEjeVista } from "../tipos";
import { type AnotacionAlzado, type CotaEnEdicion, type CotaInteractiva } from "./tipos";
import { type AsaLosa } from "../asasLosa";
import { type Bloqueo, type Vec3 } from "../inferencias3d";
import { type EntradaGrosor } from "./lineas";
import { type LadoEje } from "../ejesVista";
import { type Nota } from "../anotaciones3d";
import { type Punto2 } from "../herramientas";
import { type Punto3 } from "../seccion";
import { type ResultadoCara } from "../empujarCaras";
import { useCallback, useEffect, useRef, useState } from "react";
import { useModelo } from "../estado";
import { useRueda, type EventoGrabado, type ResumenGrabacion } from "@/lib/rueda";

import type { Props } from "./tipos";
export function useEstadoVisor({
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
  const contenedor = useRef<HTMLDivElement>(null);
  const escena = useRef<THREE.Scene | null>(null);
  const renderer = useRef<THREE.WebGLRenderer | null>(null);
  const camara = useRef<THREE.Camera | null>(null);
  const grupo = useRef<THREE.Group | null>(null);
  const grupoHerramienta = useRef<THREE.Group | null>(null);
  const meshes = useRef<THREE.Mesh[]>([]);
  // O049: mallas visibles del último dibujo, caché de candidatos y bloqueos.
  const mallas3d = useRef<
    { globalid: string; malla: MallaCandidata; envolvente: Envolvente }[]
  >([]);
  const cacheCandidatos = useRef(new CacheCandidatosMallas());
  const bloqueoFlechas = useRef<Bloqueo | null>(null);
  const bloqueoShift = useRef<Bloqueo | null>(null);
  const ultimaInferenciaEmpujar = useRef<{
    punto: Vec3;
    tipo: string | null;
    etiqueta: string;
  } | null>(null);
  const [marcadorEmpujar, setMarcadorEmpujar] = useState<{
    x: number;
    y: number;
    tipo: string;
    etiqueta: string;
    punto: Vec3;
    tooltipIzquierda: boolean;
  } | null>(null);
  const [guiaEmpujar, setGuiaEmpujar] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    color: string;
    tipo: string;
  } | null>(null);
  // O056: cara de un elemento bajo el cursor y su clasificación.
  const [caraEmpujarHover, setCaraEmpujarHover] = useState<{
    globalid: string;
    normal: [number, number, number];
    punto: [number, number, number];
    poligono: Vec3[];
    clasificacion: ResultadoCara;
    x: number;
    y: number;
    tooltipIzquierda: boolean;
  } | null>(null);
  const grosores = useRef<EntradaGrosor[]>([]);
  const navegacion = useRef<Navegacion | null>(null);
  // O010/O031: la cámara de cada vista se conserva al cambiar de vista, entre
  // redibujos y al volver de otro módulo (mapa a nivel de módulo).
  const camarasGuardadas = useRef(camarasPorVista);
  const vistaDeCamara = useRef<string | null>(null);
  const arrastre = useRef<{
    x: number;
    y: number;
    inicioX: number;
    inicioY: number;
    boton: number;
    movido: boolean;
    paneable: boolean;
    /** O020: qué hace el arrastre, decidido al pulsar. */
    accion: AccionArrastre;
  } | null>(null);
  // Coordenadas de página (como clientX/Y); `ox`/`oy` es la esquina del visor para
  // dibujar el rectángulo dentro de él, que es `relative`.
  const [ventanaSeleccion, setVentanaSeleccion] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    ox: number;
    oy: number;
  } | null>(null);
  // O003b: estado de la herramienta activa.
  const herramienta = useModelo((s) => s.herramienta);
  const referenciaAlinear = useModelo((s) => s.referenciaAlinear);
  const alineando = useModelo((s) => s.alineando);
  const elegirReferenciaAlinear = useModelo((s) => s.elegirReferenciaAlinear);
  const aplicarAlinear = useModelo((s) => s.aplicarAlinear);
  const alternarCandadoAlinear = useModelo((s) => s.alternarCandadoAlinear);
  const puntosHerramienta = useModelo((s) => s.puntosHerramienta);
  const ratonHerramienta = useModelo((s) => s.ratonHerramienta);
  const engancheHerramienta = useModelo((s) => s.engancheHerramienta);
  const referencias = useModelo((s) => s.referencias);
  const voltearSiguiente = useModelo((s) => s.voltearSiguiente);
  const longitudTecleada = useModelo((s) => s.longitudTecleada);
  const ejeLibre = useModelo((s) => s.ejeLibre);
  const fijarRaton = useModelo((s) => s.fijarRatonHerramienta);
  const clicEnPlanta = useModelo((s) => s.clicEnPlanta);
  const clicNivel = useModelo((s) => s.clicNivel);
  const vistaPreviaRecorte = useModelo((s) => s.vistaPreviaRecorte);
  const clicRecorte = useModelo((s) => s.clicRecorte);
  const empujarRect = useModelo((s) => s.empujarRect);
  const empujarAltura = useModelo((s) => s.empujarAltura);
  const empujarClasificacion = useModelo((s) => s.empujarClasificacion);
  const fijarAlturaEmpujar = useModelo((s) => s.fijarAlturaEmpujar);
  const moverEmpujar = useModelo((s) => s.moverEmpujar);
  const clicEmpujar = useModelo((s) => s.clicEmpujar);
  const confirmarEmpujar = useModelo((s) => s.confirmarEmpujar);
  const empujarZ = useModelo((s) => s.empujarZ);
  const empujarCara = useModelo((s) => s.empujarCara);
  const iniciarEmpujarCara = useModelo((s) => s.iniciarEmpujarCara);
  const moverEmpujarCara = useModelo((s) => s.moverEmpujarCara);
  const confirmarEmpujarCara = useModelo((s) => s.confirmarEmpujarCara);
  const opcionesNivel = useModelo((s) => s.opcionesNivel);
  const cotasNivel = useModelo((s) => s.cotasNivel);
  const dobleClicEnPlanta = useModelo((s) => s.dobleClicEnPlanta);
  const notas = useModelo((s) => s.notas);
  const notaSeleccionada = useModelo((s) => s.notaSeleccionada);
  const seleccionarNota = useModelo((s) => s.seleccionarNota);
  const crearNota = useModelo((s) => s.crearNota);
  const editarNota = useModelo((s) => s.editarNota);
  const moverNota = useModelo((s) => s.moverNota);
  const actualizarVista = useModelo((s) => s.actualizarVista);
  // O038: el árbol pide «Ajustar» (doble clic) subiendo este contador.
  const ajustarToken = useModelo((s) => s.ajustarToken);
  const espacio = useRef(false);
  const ultimaZ = useRef(0);
  const ultimoMedio = useRef(0);
  const [oscuro, setOscuro] = useState(() =>
    typeof document !== "undefined" ? document.documentElement.classList.contains("dark") : false,
  );
  const [dimensiones, setDimensiones] = useState({ ancho: 1, alto: 1 });
  // O030: el zoom obliga a recalcular la anotación en modo «Pantalla».
  const [zoomTick, setZoomTick] = useState(0);  // O006a: textos de cota dibujados y edición en el sitio.
  const cotasInteraccion = useRef<CotaInteractiva[]>([]);
  // O011b: etiquetas de nivel y cotas del alzado, con su rectángulo, para las E2E.
  const anotacionesAlzado = useRef<AnotacionAlzado[]>([]);
  // O055: grupo propio de las anotaciones 3D y notas proyectadas a pantalla.
  const grupoAnotaciones3d = useRef<THREE.Group | null>(null);
  const orientablesAnot3d = useRef<THREE.Object3D[]>([]);
  const [notasPx, setNotasPx] = useState<Array<{ nota: Nota; x: number; y: number }>>([]);
  const [notaEditando, setNotaEditando] = useState<{
    globalid: string | null;
    texto: string;
    posicion: Punto3;
    izquierda: number;
    arriba: number;
  } | null>(null);
  const [textoNota, setTextoNota] = useState("");
  const [panelAnotaciones, setPanelAnotaciones] = useState(false);
  const [arrastreNota, setArrastreNota] = useState<{
    globalid: string;
    x0: number;
    y0: number;
    dx: number;
    dy: number;
    posicion: Punto3;
  } | null>(null);
  const [cotaEditando, setCotaEditando] = useState<CotaEnEdicion | null>(null);
  const [textoCotaEditando, setTextoCotaEditando] = useState("");
  // O010: el error de una cota se muestra junto a la caja, no en la barra de estado.
  const [errorCota, setErrorCota] = useState<string | null>(null);
  // O011: eje seleccionado, codos y extremos libres de la vista.
  const [ejeSeleccionado, setEjeSeleccionado] = useState<string | null>(null);
  // O021: `true` = candado abierto (solo este eje); `false` = cerrado (alineación común).
  const [candados, setCandados] = useState<{ inicio: boolean; fin: boolean }>({
    inicio: false,
    fin: false,
  });
  const [ajusteEnCurso, setAjusteEnCurso] = useState<Record<string, AjusteEjeVista> | null>(
    null,
  );
  const [menuEje, setMenuEje] = useState<{
    x: number;
    y: number;
    globalid: string;
    lado: LadoEje;
    indice: number | null;
  } | null>(null);
  // O021: diálogo para copiar el acomodo de un eje a vistas del mismo tipo.
  const [dialogoCopiarEje, setDialogoCopiarEje] = useState<{
    globalid: string;
    seleccion: string[];
  } | null>(null);
  const arrastreEje = useRef<{
    globalid: string;
    etiqueta: string;
    lado: LadoEje;
    indice: number | null;
    candado: boolean;
    familia: "vertical" | "horizontal" | "alzado";
    inicio: Punto2;
    /** Posición del asa al pulsar (el destino parte de aquí, no del puntero). */
    asaInicio: Punto2;
    originales: Record<string, AjusteEjeVista>;
    movido: boolean;
    tipo: "globo" | "codo" | "codo-nuevo" | "base";
    pantallaInicio: { x: number; y: number };
    codoCreado: boolean;
    /** O044: dirección elegida para el arrastre de V2 (eje, X o Y), fija hasta soltar. */
    modoCodo: "eje" | "x" | "y" | null;
  } | null>(null);
  // O034: asas de los bordes de la losa seleccionada y su arrastre en planta.
  const propiedades = useModelo((s) => s.propiedades);
  const asasLosa = useRef<
    Array<
      AsaLosa & {
        punto: [number, number, number];
      }
    >
  >([]);
  const arrastreLosa = useRef<{
    globalid: string;
    indice: number;
    desfaseInicial: number;
    desfase: number;
    normal: Punto2;
    medio: Punto2;
    inicio: Punto2;
    poligono: Punto2[] | null;
    movido: boolean;
    pantallaInicio: { x: number; y: number };
  } | null>(null);
  // O034: Escape cancela el arrastre; el pointerup que llega después no debe
  // reinterpretarse como un clic de selección (descartaría la losa).
  const soltarLosaCancelado = useRef(false);
  const [previewLosaPx, setPreviewLosaPx] = useState<
    Array<{ x: number; y: number }> | null
  >(null);
  const [editorDesfaseLosa, setEditorDesfaseLosa] = useState<{
    globalid: string;
    indice: number;
    izquierda: number;
    arriba: number;
    valor: string;
  } | null>(null);
  // O027: píxeles de mundo del último dibujo y diámetro de globo de la vista, para
  // imanes y cotas temporales sin recalcular la cámara en cada movimiento.
  const mundoPorPxRef = useRef(1e-3);
  const altoBurbujaRef = useRef(0.8);
  const ejeSeleccionadoRef = useRef<string | null>(null);
  // O041: candidato bajo el cursor que Tab convertiría en selección.
  const [resaltado, setResaltado] = useState<string | null>(null);
  const ultimoPuntero = useRef<{ x: number; y: number } | null>(null);
  const resaltadoRef = useRef<string | null>(null);
  // O027: guía y cota temporal que se dibujan sobre el visor mientras se arrastra.
  const [guiaArrastre, setGuiaArrastre] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    texto: string;
    enganchado: boolean;
  } | null>(null);
  // O044: guía de flecha sobre el pinzamiento de un codo. V1 solo en el sentido del
  // eje; V2 en X y en Y (las dos direcciones que admite su arrastre).
  const [guiaCodo, setGuiaCodo] = useState<{
    x: number;
    y: number;
    vertical: boolean;
    ambos: boolean;
  } | null>(null);
  const ejesInteraccion = useRef<
    Array<{
      globalid: string;
      etiqueta: string;
      lado: LadoEje;
      tipo: "globo" | "codo" | "codo-nuevo" | "base";
      indice: number | null;
      punto: [number, number, number];
    }>
  >([]);
  const lineasEje = useRef<Array<{ globalid: string; etiqueta: string; puntos: Array<[number, number, number]> }>>([]);
  // O021b: líneas de nivel y de extensión para comprobar que ningún texto las cruza.
  const lineasNivelRef = useRef<Array<{ tipo: string; elev?: number; puntos: Array<[number, number, number]> }>>([]);
  // O021: globos dibujados, para medir en pantalla el centrado real de su texto.
  const burbujasEje = useRef<Array<{ etiqueta: string; grupo: THREE.Group }>>([]);
  // O014b: asas de las cabezas de nivel para arrastrarlas y devolverlas a automático.
  const asasNivel = useRef<
    Array<{
      globalid: string;
      nombre: string;
      elev: number;
      desplazamiento: number;
      punto: [number, number, number];
    }>
  >([]);
  const arrastreNivel = useRef<{
    globalid: string;
    elev: number;
    desplazamiento: number;
    /** Desplazamiento de la cabeza al pulsar; el arrastre suma lo que se mueve el puntero. */
    desplazamientoInicial: number;
    inicio: Punto2;
    pantallaInicio: { x: number; y: number };
    movido: boolean;
  } | null>(null);
  const [ajustesNivelEnCurso, setAjustesNivelEnCurso] = useState<
    Record<string, { desplazamiento: number }>
  >({});
  const ajusteEnCursoRef = useRef<Record<string, AjusteEjeVista> | null>(null);
  // O021: la selección del eje también vive en el estado para que el panel de
  // propiedades pueda editarla; el visor conserva su copia local para los gestos.
  const ejeSeleccionadoStore = useModelo((s) => s.ejeSeleccionado);
  const nivelSeleccionado = useModelo((s) => s.nivelSeleccionado);
  const fijarNivelSeleccionado = useModelo((s) => s.fijarNivelSeleccionado);
  const fijarPistaTab = useModelo((s) => s.fijarPistaTab);
  const fijarEjeSeleccionadoStore = useModelo((s) => s.fijarEjeSeleccionado);
  const ejeStorePrevio = useRef(ejeSeleccionadoStore);
  useEffect(() => {
    // Solo reacciona a cambios venidos del panel; si no, el primer clic se borraría
    // porque el estado global todavía conserva el valor anterior.
    if (ejeSeleccionadoStore !== ejeStorePrevio.current) {
      ejeStorePrevio.current = ejeSeleccionadoStore;
      setEjeSeleccionado(ejeSeleccionadoStore);
    }
  }, [ejeSeleccionadoStore]);
  useEffect(() => {
    ejeStorePrevio.current = ejeSeleccionado;
    fijarEjeSeleccionadoStore(ejeSeleccionado);
  }, [ejeSeleccionado, fijarEjeSeleccionadoStore]);
  const contextoEje = useRef<{
    tipo: "planta" | "alzado" | "corte";
    d: [number, number];
    h: [number, number];
    profundidad: number;
    z: number;
    bases: Record<string, { inicio: Punto2; fin: Punto2 }>;
  } | null>(null);
  const moverSiguientes = useModelo((s) => s.cotasMoverSiguientes);
  const fijarMoverSiguientes = useModelo((s) => s.fijarCotasMoverSiguientes);
  const separarEjes = useModelo((s) => s.separarEjes);
  const editarRebase = useModelo((s) => s.editarRebase);
  const separarNiveles = useModelo((s) => s.separarNiveles);
  const fijarAjustesEjes = useModelo((s) => s.fijarAjustesEjes);
  const fijarAjustesNiveles = useModelo((s) => s.fijarAjustesNiveles);
  const editarNivel = useModelo((s) => s.editarNivel);
  const fijarAviso = useModelo((s) => s.fijarAviso);
  const preferenciaRueda = useRueda((s) => s.preferencia);
  const fijarDetectado = useRueda((s) => s.fijarDetectado);
  const ayudaVisible = useRueda((s) => s.ayudaVisible);
  const cerrarAyuda = useRueda((s) => s.cerrarAyuda);
  // O020: conmutador «Orbitar», recordado entre sesiones.
  const [modoOrbitar, setModoOrbitar] = useState(leerModoOrbitar);
  const alternarOrbitar = useCallback(() => {
    setModoOrbitar((activo) => {
      guardarModoOrbitar(!activo);
      return !activo;
    });
  }, []);
  const [diagnosticoRueda, setDiagnosticoRueda] = useState(false);
  const [grabando, setGrabando] = useState(false);
  const [eventosGrabados, setEventosGrabados] = useState<EventoGrabado[]>([]);
  const [resumenGrabacion, setResumenGrabacion] = useState<ResumenGrabacion | null>(null);
  const grabacionRef = useRef<{ inicio: number; eventos: EventoGrabado[] } | null>(null);
  const temporizadorGrabacion = useRef<number | null>(null);
  // O018: estado del gesto nativo y del anti doble zoom con Ctrl + rueda.
  const actualizarGrosoresRef = useRef<() => void>(() => {});
  const ultimoWheelCtrlRef = useRef<number | null>(null);
  const distanciaGestoRef = useRef<number | null>(null);
  const toquesNativosRef = useRef(new Map<number, { x: number; y: number }>());

  return {
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
    contenedor,
    escena,
    renderer,
    camara,
    grupo,
    grupoHerramienta,
    meshes,
    mallas3d,
    cacheCandidatos,
    bloqueoFlechas,
    bloqueoShift,
    ultimaInferenciaEmpujar,
    marcadorEmpujar,
    setMarcadorEmpujar,
    guiaEmpujar,
    setGuiaEmpujar,
    caraEmpujarHover,
    setCaraEmpujarHover,
    grosores,
    navegacion,
    camarasGuardadas,
    vistaDeCamara,
    arrastre,
    ventanaSeleccion,
    setVentanaSeleccion,
    herramienta,
    referenciaAlinear,
    alineando,
    elegirReferenciaAlinear,
    aplicarAlinear,
    alternarCandadoAlinear,
    puntosHerramienta,
    ratonHerramienta,
    engancheHerramienta,
    referencias,
    voltearSiguiente,
    longitudTecleada,
    ejeLibre,
    fijarRaton,
    clicEnPlanta,
    clicNivel,
    vistaPreviaRecorte,
    clicRecorte,
    empujarRect,
    empujarAltura,
    empujarClasificacion,
    fijarAlturaEmpujar,
    moverEmpujar,
    clicEmpujar,
    confirmarEmpujar,
    empujarZ,
    empujarCara,
    iniciarEmpujarCara,
    moverEmpujarCara,
    confirmarEmpujarCara,
    opcionesNivel,
    cotasNivel,
    dobleClicEnPlanta,
    notas,
    notaSeleccionada,
    seleccionarNota,
    crearNota,
    editarNota,
    moverNota,
    actualizarVista,
    ajustarToken,
    espacio,
    ultimaZ,
    ultimoMedio,
    oscuro,
    setOscuro,
    dimensiones,
    setDimensiones,
    zoomTick,
    setZoomTick,
    cotasInteraccion,
    anotacionesAlzado,
    grupoAnotaciones3d,
    orientablesAnot3d,
    notasPx,
    setNotasPx,
    notaEditando,
    setNotaEditando,
    textoNota,
    setTextoNota,
    panelAnotaciones,
    setPanelAnotaciones,
    arrastreNota,
    setArrastreNota,
    cotaEditando,
    setCotaEditando,
    textoCotaEditando,
    setTextoCotaEditando,
    errorCota,
    setErrorCota,
    ejeSeleccionado,
    setEjeSeleccionado,
    candados,
    setCandados,
    ajusteEnCurso,
    setAjusteEnCurso,
    menuEje,
    setMenuEje,
    dialogoCopiarEje,
    setDialogoCopiarEje,
    arrastreEje,
    propiedades,
    asasLosa,
    arrastreLosa,
    soltarLosaCancelado,
    previewLosaPx,
    setPreviewLosaPx,
    editorDesfaseLosa,
    setEditorDesfaseLosa,
    mundoPorPxRef,
    altoBurbujaRef,
    ejeSeleccionadoRef,
    resaltado,
    setResaltado,
    ultimoPuntero,
    resaltadoRef,
    guiaArrastre,
    setGuiaArrastre,
    guiaCodo,
    setGuiaCodo,
    ejesInteraccion,
    lineasEje,
    lineasNivelRef,
    burbujasEje,
    asasNivel,
    arrastreNivel,
    ajustesNivelEnCurso,
    setAjustesNivelEnCurso,
    ajusteEnCursoRef,
    ejeSeleccionadoStore,
    nivelSeleccionado,
    fijarNivelSeleccionado,
    fijarPistaTab,
    fijarEjeSeleccionadoStore,
    ejeStorePrevio,
    contextoEje,
    moverSiguientes,
    fijarMoverSiguientes,
    separarEjes,
    editarRebase,
    separarNiveles,
    fijarAjustesEjes,
    fijarAjustesNiveles,
    editarNivel,
    fijarAviso,
    preferenciaRueda,
    fijarDetectado,
    ayudaVisible,
    cerrarAyuda,
    modoOrbitar,
    setModoOrbitar,
    alternarOrbitar,
    diagnosticoRueda,
    setDiagnosticoRueda,
    grabando,
    setGrabando,
    eventosGrabados,
    setEventosGrabados,
    resumenGrabacion,
    setResumenGrabacion,
    grabacionRef,
    temporizadorGrabacion,
    actualizarGrosoresRef,
    ultimoWheelCtrlRef,
    distanciaGestoRef,
    toquesNativosRef,
  };
}
