// OPEN-RVT: visor three.js del módulo Modelo. Dibuja mallas en coordenadas de mundo,
// cámaras ortográficas para plantas/alzados/cortes y órbita libre en 3D, con recorte y
// relleno de sección por stencil (técnica del ejemplo webgl_clipping_stencil).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { Text, configureTextBuilder } from "troika-three-text";
import type { Abertura, AjusteEjeVista, Caja, ElementoMalla, Nivel, Vista } from "./tipos";
import { categoriaVisible, dibujaSiluetaSobreCorte } from "./vistas";
import { useModelo } from "./estado";
import { calcularPlantaMuros, type MuroPlanta } from "./planta";
import {
  detectorRueda,
  factorZoomRueda,
  resumirGrabacion,
  textoResumenGrabacion,
  useRueda,
  type EventoGrabado,
  type ResumenGrabacion,
  type TipoEventoGrabado,
} from "@/lib/rueda";
import { listen } from "@tauri-apps/api/event";
import { copiarTexto } from "@/lib/portapapeles";
import { debeIgnorarGestoNativo, factorGestoZoom } from "@/lib/gestos";
import { elegirDestinoDiagnostico } from "@/lib/dialogos";
import { commands } from "@/lib/bindings";
import {
  colocarAbertura,
  describirEnganche,
  distanciaAEjeParalelo,
  restringirEje,
  type Punto2,
} from "./herramientas";
import {
  caraEnPunto,
  rectaDeEje,
  rectaDeMalla,
} from "./alinear";
import {
  calcularFamiliasCotas,
  parsearCota,
  parsearElevacion,
  posicionTextoEntreMarcas,
} from "./cotas";
import { altoTextoBurbuja, desplazamientoCentrado } from "./centrado";
import { ControlesZoom } from "./ControlesZoom";
import {
  accionArrastre,
  accionRuedaConShift,
  guardarModoOrbitar,
  leerModoOrbitar,
  type AccionArrastre,
} from "./orbita";
import { DESFASE_NOMBRE_CABEZA, elevacionDesdeCota, normalizarAjusteNivel } from "./niveles";
import { baseTextoAnotacion } from "./anotacion";
import { calcularLayoutAlzado, enlazarTramosCota, formatearNumero, segmentosTrazoPunto } from "./anotacionVista";
import {
  categoriaOculta,
  factorEscala,
  grosorMm,
  materialPorCapa,
  altoAnotacionMundo,
  mmAMundo,
  mmAMundoConMinimoPx,
  mmAPx,
  PATRONES_LINEA_DASH,
  rellenoDeElemento,
  type Estilos,
  type MaterialNombre,
  type PatronLinea,
  type PatronRelleno,
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
  ajustarAspecto,
  ARRIBA_PLANTA,
  cajaConEjes,
  camaraOrtografica,
  camaraPerspectiva,
  centroCaja,
  diagonalCaja,
  direccionAlzado,
  vectorIso,
} from "./vistas";
import {
  aristasInternasUniones,
  aristasParaElemento,
  mallaConNormalesPlanas,
} from "./geometria";
import { crearMallasCapas } from "./capas3d";
import {
  MAXIMO_CODOS,
  agregarCodoEje,
  asasCodoVista,
  arrastrarExtremoEje,
  copiarAjusteEje,
  extremoEje,
  fijarExtremoEje,
  geometriaEje,
  globoVisibleEje,
  imanAlineacion,
  imanMultiplo,
  mmPapelAMetros,
  normalizarAjusteEje,
  quitarCodoEje,
  restablecerExtremoEje,
  candadoArrastreAsa,
  desplazamientoArrastreNivel,
  destinoArrastreAsa,
  puntoAsaEje,
  type DireccionEjeArrastre,
  type LadoEje,
  type TipoAsaArrastre,
} from "./ejesVista";

interface Props {
  vista: Vista;
  vistas: Vista[];
  niveles: Nivel[];
  mallas: ElementoMalla[];
  estilos: Estilos;
  aberturas: Abertura[];
  caja: Caja;
  seleccion: string | null;
  seleccionados: string[];
  modoCorte: boolean;
  puntoCorte: [number, number] | null;
  onSeleccionar: (globalid: string | null, agregar?: boolean) => void;
  onSeleccionarVarios: (globalids: string[]) => void;
  onPuntoCorte: (punto: [number, number]) => void;
  onEscape: () => void;
  /** O030: cambia el modo de anotación de la vista. */
  onCambiarAnotacion?: (modo: "papel" | "pantalla") => void;
  /** O031: identifica el archivo abierto para no heredar cámaras de otro modelo. */
  claveModelo?: string;
}

interface Navegacion {
  tipo: "orto" | "perspectiva";
  objetivo: THREE.Vector3;
  direccion: THREE.Vector3;
  distancia: number;
  arriba: THREE.Vector3;
  inicial: {
    objetivo: THREE.Vector3;
    direccion: THREE.Vector3;
    distancia: number;
  };
}

/**
 * O010: estado de cámara que se conserva por vista. Guarda lo que el usuario dejó
 * (paneo, zoom, órbita) para restaurarlo al volver a la vista; los cambios del modelo
 * solo actualizan el recorte de profundidad.
 */
interface CamaraGuardada {
  tipo: "orto" | "perspectiva";
  objetivo: [number, number, number];
  direccion: [number, number, number];
  arriba: [number, number, number];
  distancia: number;
  izquierda?: number;
  derecha?: number;
  arribaPlano?: number;
  abajo?: number;
  fov?: number;
}

// O031: el encuadre de cada vista se guarda fuera del componente para que viaje
// entre módulos (al volver de «Niveles» el visor se vuelve a montar). Se vacía al
// cambiar de modelo para no heredar el encuadre de otro archivo.
const camarasPorVista = new Map<string, CamaraGuardada>();
let claveCamaras = "";

/** Dirección y arriba con los que se encuadra una vista (sin tocar el modelo). */
function direccionDeVista(vista: Vista): {
  direccion: [number, number, number];
  arriba: [number, number, number];
} {
  if (vista.tipo === "planta") {
    return { direccion: [0, 0, 1], arriba: [...ARRIBA_PLANTA] };
  }
  if (vista.tipo === "alzado") {
    return { direccion: direccionAlzado(vista.orientacion ?? "sur"), arriba: [0, 0, 1] };
  }
  if (vista.tipo === "corte") {
    const [nx, ny] = normalCorte(vista);
    return { direccion: [-nx, -ny, 0], arriba: [0, 0, 1] };
  }
  return { direccion: vectorIso(), arriba: [0, 0, 1] };
}

/** Crea la cámara de una vista con la navegación indicada (o la inicial de la caja). */
function crearCamaraDeVista(
  vista: Vista,
  caja: Caja,
  aspecto: number,
  nav: Navegacion,
): THREE.Camera {
  if (nav.tipo === "perspectiva") {
    const perspectiva = camaraPerspectiva(caja, { aspecto });
    const camera = new THREE.PerspectiveCamera(
      perspectiva.fov,
      aspecto,
      perspectiva.cerca,
      perspectiva.lejos,
    );
    return camera;
  }
  const { direccion, arriba } = direccionDeVista(vista);
  const inicial = camaraOrtografica(caja, direccion, {
    arriba,
    centro: [nav.objetivo.x, nav.objetivo.y, nav.objetivo.z],
  });
  const limites = ajustarAspecto(inicial, aspecto);
  return new THREE.OrthographicCamera(
    limites.izquierda,
    limites.derecha,
    limites.arriba,
    limites.abajo,
    inicial.cerca,
    inicial.lejos,
  );
}

/** O006a: texto de cota que se puede editar con doble clic. */
interface CotaInteractiva {
  tipo: "parcial" | "total" | "rebase" | "nivel" | "elevacion";
  texto: string;
  valor: number;
  punto: [number, number, number];
  referencia?: string;
  mover?: string;
  nivel?: string;
  nombre?: string;
}

/** O011b: rectángulo de una etiqueta de nivel o cota, en mundo, para las E2E. */
interface AnotacionAlzado {
  tipo: "nivel" | "parcial" | "total";
  texto: string;
  centro: [number, number, number];
  ancho: number;
  alto: number;
  /** Dirección horizontal del plano de la anotación. */
  h: [number, number, number];
}

interface CotaEnEdicion {
  tipo: CotaInteractiva["tipo"];
  referencia?: string;
  mover?: string;
  nivel?: string;
  nombre?: string;
  valor: number;
  izquierda: number;
  arriba: number;
}

const ARRIBA = new THREE.Vector3(0, 0, 1);

function colorDeFondo(oscuro: boolean): THREE.Color {
  if (typeof document === "undefined") return new THREE.Color(oscuro ? 0x141416 : 0xffffff);
  const valor = getComputedStyle(document.documentElement)
    .getPropertyValue("--background")
    .trim();
  const partes = valor.replace(/%/g, "").split(/\s+/).map(Number);
  if (partes.length >= 3 && partes.every((n) => Number.isFinite(n))) {
    return new THREE.Color().setHSL(partes[0] / 360, partes[1] / 100, partes[2] / 100);
  }
  return new THREE.Color(oscuro ? 0x141416 : 0xffffff);
}

function normalCorte(vista: Vista): [number, number] {
  if (vista.direccion) return vista.direccion;
  if (vista.puntoA && vista.puntoB) {
    const dx = vista.puntoB[0] - vista.puntoA[0];
    const dy = vista.puntoB[1] - vista.puntoA[1];
    const largo = Math.hypot(dx, dy) || 1;
    return [-dy / largo, dx / largo];
  }
  return [0, 1];
}

function centroCorte(vista: Vista, caja: Caja): THREE.Vector3 {
  const centro = centroCaja(caja);
  if (vista.puntoA && vista.puntoB) {
    return new THREE.Vector3(
      (vista.puntoA[0] + vista.puntoB[0]) / 2,
      (vista.puntoA[1] + vista.puntoB[1]) / 2,
      vista.alturaPlano ?? centro[2],
    );
  }
  return new THREE.Vector3(centro[0], centro[1], vista.alturaPlano ?? centro[2]);
}

function crearNavegacion(vista: Vista, caja: Caja, aspecto: number): Navegacion {
  const centro = centroCaja(caja);
  if (vista.tipo === "perspectiva") {
    const camara = camaraPerspectiva(caja, { aspecto, fov: 50 });
    const objetivo = new THREE.Vector3(...camara.objetivo);
    const direccion = new THREE.Vector3(...camara.posicion).sub(objetivo).normalize();
    return {
      tipo: "perspectiva",
      objetivo,
      direccion,
      distancia: camara.distancia,
      arriba: ARRIBA.clone(),
      inicial: {
        objetivo: objetivo.clone(),
        direccion: direccion.clone(),
        distancia: camara.distancia,
      },
    };
  }
  let direccion: [number, number, number];
  let arriba: [number, number, number] = [0, 0, 1];
  let centroVista = new THREE.Vector3(centro[0], centro[1], centro[2]);
  if (vista.tipo === "planta") {
    direccion = [0, 0, 1];
    arriba = [...ARRIBA_PLANTA];
    centroVista = new THREE.Vector3(centro[0], centro[1], vista.alturaPlano ?? centro[2]);
  } else if (vista.tipo === "alzado") {
    direccion = direccionAlzado(vista.orientacion ?? "sur");
  } else if (vista.tipo === "corte") {
    const [nx, ny] = normalCorte(vista);
    direccion = [-nx, -ny, 0];
    centroVista = centroCorte(vista, caja);
  } else {
    direccion = vectorIso();
  }
  const camara = camaraOrtografica(caja, direccion, {
    arriba,
    centro: [centroVista.x, centroVista.y, centroVista.z],
  });
  const objetivo = new THREE.Vector3(...camara.objetivo);
  const dir = new THREE.Vector3(...direccion).normalize();
  return {
    tipo: "orto",
    objetivo,
    direccion: dir,
    distancia: new THREE.Vector3(...camara.posicion).distanceTo(objetivo),
    arriba: new THREE.Vector3(...camara.arriba),
    inicial: {
      objetivo: objetivo.clone(),
      direccion: dir.clone(),
      distancia: new THREE.Vector3(...camara.posicion).distanceTo(objetivo),
    },
  };
}

interface EntradaGrosor {
  material: LineMaterial;
  mm: number;
  escala: Vista["escala"];
}

interface OpcionesLinea {
  mm: number;
  escala: Vista["escala"];
  color: string;
  patron?: PatronLinea;
  profundidad?: boolean;
  registro?: EntradaGrosor[];
  mundoPorPx: number;
}

/** Crea un LineMaterial con grosor en mm de papel, patrón y registro para el zoom. */
function crearMaterialLinea(opciones: OpcionesLinea): LineMaterial {
  const grosor = Math.max(mmAPx(opciones.mm, opciones.escala, opciones.mundoPorPx), 0.8);
  const material = new LineMaterial({
    color: new THREE.Color(opciones.color),
    linewidth: grosor,
    worldUnits: false,
    depthTest: opciones.profundidad !== false,
    transparent: true,
  });
  const patron = opciones.patron ?? "continua";
  if (patron !== "continua") {
    const dash = PATRONES_LINEA_DASH[patron];
    material.dashed = true;
    material.dashSize = dash.dash;
    material.gapSize = dash.gap;
  }
  const resolucion = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  material.resolution.set(window.innerWidth * resolucion, window.innerHeight * resolucion);
  opciones.registro?.push({ material, mm: opciones.mm, escala: opciones.escala });
  return material;
}

/** Contorno cerrado con Line2 (grosor real en WebGL). */
function lineaCerrada(
  puntos: Array<[number, number, number]>,
  material: LineMaterial,
  orden: number,
  grupo: THREE.Group,
): Line2 {
  const geometria = new LineGeometry();
  geometria.setPositions(puntos.flat());
  const linea = new Line2(geometria, material);
  linea.computeLineDistances();
  linea.renderOrder = orden;
  grupo.add(linea);
  return linea;
}

/** O007b: esquinas de un rectángulo en planta, girado alrededor de su centro. */
function esquinasRectangulo(
  cx: number,
  cy: number,
  angulo: number,
  ancho: number,
  fondo: number,
): Array<[number, number]> {
  const coseno = Math.cos(angulo);
  const seno = Math.sin(angulo);
  const hx = ancho / 2;
  const hy = fondo / 2;
  return [
    [-hx, -hy],
    [hx, -hy],
    [hx, hy],
    [-hx, hy],
  ].map(([x, y]) => [cx + x * coseno - y * seno, cy + x * seno + y * coseno]);
}

/** Rayado diagonal (45°) de una sección rectangular, en coordenadas locales. */
function rayadoRectangulo(
  ancho: number,
  fondo: number,
  paso = 0.08,
): Array<[[number, number], [number, number]]> {
  const w = ancho / 2;
  const h = fondo / 2;
  const lineas: Array<[[number, number], [number, number]]> = [];
  for (let d = -w - h; d <= w + h; d += paso) {
    const puntos: Array<[number, number]> = [];
    const agregar = (x: number, y: number) => {
      if (Math.abs(x) <= w + 1e-9 && Math.abs(y) <= h + 1e-9) {
        if (!puntos.some(([px, py]) => Math.hypot(px - x, py - y) < 1e-9)) {
          puntos.push([x, y]);
        }
      }
    };
    agregar(-w, -w - d);
    agregar(w, w - d);
    agregar(-h + d, -h);
    agregar(h + d, h);
    if (puntos.length >= 2) lineas.push([puntos[0], puntos[1]]);
  }
  return lineas;
}

// Las texturas se reutilizan entre elementos y vistas.
const CACHE_TEXTURAS = new Map<string, THREE.Texture>();

// O011: la anotación se dibuja con vectores (anillo y texto SDF), no con sprites de
// mapa de bits. Así el globo y los números siguen nítidos con cualquier zoom.
// El tiposet se hace en el hilo principal: el WebView de Tauri no permite workers
// creados desde un blob con la CSP de la aplicación.
configureTextBuilder({ useWorker: false });
const FUENTE_ANOTACION = "/fonts/DejaVuSans-Bold.ttf";

function orientarAnotacion(grupo: THREE.Object3D, haciaCamara: [number, number, number]): void {
  // O014b: la base pura garantiza que +X del texto sea la derecha de la pantalla
  // (y +Y su arriba), sin espejos en cortes con cualquier dirección.
  const base = baseTextoAnotacion(haciaCamara);
  const matriz = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(...base.derecha),
    new THREE.Vector3(...base.arriba),
    new THREE.Vector3(...base.normal),
  );
  grupo.quaternion.setFromRotationMatrix(matriz);
}

function crearTextoAnotacion(
  texto: string,
  color: string,
  fondo: string,
  altoMundo: number,
  alineacion: "centro" | "izquierda" = "centro",
): Text {
  const texto3d = new Text();
  texto3d.text = texto;
  texto3d.font = FUENTE_ANOTACION;
  texto3d.fontSize = altoMundo;
  texto3d.color = color;
  texto3d.anchorX = alineacion === "izquierda" ? "left" : "center";
  texto3d.anchorY = "middle";
  const materialTexto = texto3d.material as THREE.Material;
  materialTexto.depthTest = false;
  materialTexto.depthWrite = false;
  materialTexto.transparent = true;
  // Halo del color del fondo para que se lea sobre una línea, sin rasterizar.
  texto3d.outlineWidth = altoMundo * 0.08;
  texto3d.outlineColor = fondo;
  texto3d.frustumCulled = false;
  texto3d.renderOrder = 22;
  // O014a: centrar el glifo visible (no la caja del renglón) en el origen del grupo.
  // `sync` es asíncrono, por eso el ajuste se aplica en su callback.
  texto3d.sync(() => {
    const info = texto3d as unknown as {
      textRenderInfo?: { visibleBounds?: [number, number, number, number] };
    };
    const limites = info.textRenderInfo?.visibleBounds;
    // O021: centrar con la caja real de los glifos ya triangulados. La geometría
    // puede no estar lista dentro de `sync`; en ese caso se reintenta en los dos
    // cuadros siguientes hasta que exista.
    const centrar = (): boolean => {
      const geometria = texto3d.geometry;
      if (!geometria) return false;
      geometria.computeBoundingBox();
      const caja = geometria.boundingBox;
      if (!caja || caja.max.x - caja.min.x < 1e-9 || caja.max.y - caja.min.y < 1e-9) {
        return false;
      }
      if (alineacion === "izquierda") {
        texto3d.position.set(-caja.min.x, -(caja.min.y + caja.max.y) / 2, 0);
      } else {
        texto3d.position.set(
          -(caja.min.x + caja.max.x) / 2,
          -(caja.min.y + caja.max.y) / 2,
          0,
        );
      }
      return true;
    };
    if (centrar()) return;
    // Mientras la geometría se construye, se usa la caja del renglón como respaldo.
    if (limites) {
      if (alineacion === "izquierda") {
        texto3d.position.set(-limites[0], -(limites[1] + limites[3]) / 2, 0);
      } else {
        const [dx, dy] = desplazamientoCentrado(limites);
        texto3d.position.set(dx, dy, 0);
      }
    }
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        if (!centrar()) requestAnimationFrame(centrar);
      });
    }
  });
  return texto3d;
}

/** O011: ancho aproximado del texto para colocarlo entre marcas (sin medir píxeles). */
function anchoTextoAprox(texto: string, altoMundo: number): number {
  return Math.max(0.1, texto.length * altoMundo * 0.62);
}

/**
 * O011: globo de eje vectorial: relleno circular, anillo de 64 segmentos y texto SDF.
 * Se construye con diámetro 1 para que el llamador lo escale a 8 mm de papel.
 */
function burbujaEje(
  texto: string,
  color: string,
  fondo: string,
  normal: [number, number, number] = [0, 0, 1],
): THREE.Group | null {
  if (typeof document === "undefined") return null;
  const grupo = new THREE.Group();
  const relleno = new THREE.Mesh(
    new THREE.CircleGeometry(0.43, 64),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(fondo),
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  relleno.renderOrder = 20;
  grupo.add(relleno);
  const anillo = new THREE.Mesh(
    new THREE.RingGeometry(0.43, 0.5, 64),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  anillo.renderOrder = 21;
  grupo.add(anillo);
  // O014a: el alto de fuente se achica con la cantidad de caracteres para que el
  // texto quepa en el 80 % del diámetro interior del globo («A.1» se salía).
  const texto3d = crearTextoAnotacion(texto, color, fondo, altoTextoBurbuja(texto));
  texto3d.position.z = 0.01;
  grupo.add(texto3d);
  orientarAnotacion(grupo, normal);
  return grupo;
}

/** O005c: cota temporal de la herramienta (p. ej. «4.50 m»). */
function etiquetaCota(
  texto: string,
  color: string,
  fondo: string,
  altoMundo: number,
  normal: [number, number, number] = [0, 0, 1],
): THREE.Group | null {
  if (typeof document === "undefined") return null;
  const grupo = new THREE.Group();
  const texto3d = crearTextoAnotacion(texto, color, fondo, altoMundo);
  grupo.add(texto3d);
  orientarAnotacion(grupo, normal);
  return grupo;
}

/**
 * O006a: texto de cota sin recuadro, con un halo del color del fondo para que se lea
 * sobre la línea. La altura se da en unidades de mundo (mm de papel ya convertidos).
 */
function textoCota(
  texto: string,
  color: string,
  fondo: string,
  altoMundo: number,
  normal: [number, number, number] = [0, 0, 1],
  alineacion: "centro" | "izquierda" = "centro",
): THREE.Group | null {
  if (typeof document === "undefined") return null;
  const grupo = new THREE.Group();
  grupo.add(crearTextoAnotacion(texto, color, fondo, altoMundo, alineacion));
  orientarAnotacion(grupo, normal);
  return grupo;
}

// O027: asas de eje/nivel de tamaño constante en pantalla (3 px de umbral, 12 px de
// diámetro). Se dibujan con `THREE.Points`, cuyo tamaño va en píxeles cuando
// `sizeAttenuation` es falso.
let TEXTURA_ASA: THREE.CanvasTexture | null = null;
function texturaAsa(): THREE.CanvasTexture | null {
  if (TEXTURA_ASA) return TEXTURA_ASA;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, 64, 64);
  ctx.beginPath();
  ctx.arc(32, 32, 28, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#1f2328";
  ctx.stroke();
  TEXTURA_ASA = new THREE.CanvasTexture(canvas);
  TEXTURA_ASA.needsUpdate = true;
  return TEXTURA_ASA;
}

function crearAsaPunto(color: string): THREE.Points {
  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3));
  const material = new THREE.PointsMaterial({
    size: 12,
    sizeAttenuation: false,
    map: texturaAsa() ?? undefined,
    color: new THREE.Color(color),
    transparent: true,
    alphaTest: 0.15,
    depthTest: false,
    depthWrite: false,
  });
  const punto = new THREE.Points(geometria, material);
  punto.renderOrder = 30;
  punto.frustumCulled = false;
  return punto;
}

/** Genera la textura de un patrón de relleno (un período de escala en mm de papel). */
function texturaPatron(
  patron: PatronRelleno,
  escalaMm: number,
  color: string,
): THREE.CanvasTexture | null {
  if (patron === "tierra" || patron === "vidrio") return null;
  const clave = `${patron}-${escalaMm}-${color}`;
  const existente = CACHE_TEXTURAS.get(clave);
  if (existente) return existente as THREE.CanvasTexture;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, 64, 64);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.4;
  const linea = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  switch (patron) {
    case "diagonal":
      for (const d of [-64, 0, 64]) linea(d, 64, d + 64, 0);
      break;
    case "diagonal-doble":
      for (const d of [-64, 0, 64]) {
        linea(d, 64, d + 64, 0);
        linea(d, 0, d + 64, 64);
      }
      break;
    case "concreto":
      for (const [x, y] of [[8, 12], [26, 40], [46, 10], [58, 34], [18, 58], [52, 58]]) {
        ctx.beginPath();
        ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const [x, y] of [[14, 30], [38, 22], [30, 52]]) {
        ctx.beginPath();
        ctx.moveTo(x, y - 3);
        ctx.lineTo(x + 3, y + 2);
        ctx.lineTo(x - 3, y + 2);
        ctx.closePath();
        ctx.fill();
      }
      break;
    case "ondas":
      for (let fila = 0; fila < 2; fila += 1) {
        ctx.beginPath();
        for (let x = 0; x <= 64; x += 2) {
          const y = 16 + fila * 32 + Math.sin((x / 64) * Math.PI * 4) * 5;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      break;
    case "madera":
      for (let x = 8; x < 64; x += 12) {
        ctx.beginPath();
        for (let y = 0; y <= 64; y += 4) {
          const xx = x + Math.sin((y / 64) * Math.PI * 3 + x) * 2.5;
          if (y === 0) ctx.moveTo(xx, y);
          else ctx.lineTo(xx, y);
        }
        ctx.stroke();
      }
      break;
    default:
      return null;
  }
  const textura = new THREE.CanvasTexture(canvas);
  textura.wrapS = THREE.RepeatWrapping;
  textura.wrapT = THREE.RepeatWrapping;
  // Un período del patrón ocupa `escalaMm` de papel = escalaMm × 0,1 m a 1:100.
  const periodo = Math.max(escalaMm * 0.1, 0.02);
  textura.repeat.set(1 / periodo, 1 / periodo);
  textura.colorSpace = THREE.SRGBColorSpace;
  CACHE_TEXTURAS.set(clave, textura);
  return textura;
}

/**
 * O015: huella de una losa proyectada sobre el plano de planta. Se toman los
 * triángulos horizontales de su cara superior (su z más alta); si la malla no
 * trae ninguno, se usan todos los horizontales. Así una losa debajo del corte se
 * ve con relleno tenue sin inventar un rectángulo que no corresponde a su forma.
 */
function geometriaProyeccionLosa(
  elemento: ElementoMalla,
  z: number,
): THREE.BufferGeometry | null {
  const v = elemento.vertices;
  const indices = elemento.indices;
  let maxZ = -Infinity;
  for (let i = 2; i < v.length; i += 3) maxZ = Math.max(maxZ, v[i]);
  const horizontales: number[] = [];
  const superiores: number[] = [];
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const ia = indices[t] * 3;
    const ib = indices[t + 1] * 3;
    const ic = indices[t + 2] * 3;
    const ax = v[ia];
    const ay = v[ia + 1];
    const az = v[ia + 2];
    const bx = v[ib];
    const by = v[ib + 1];
    const bz = v[ib + 2];
    const cx = v[ic];
    const cy = v[ic + 1];
    const cz = v[ic + 2];
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const wx = cx - ax;
    const wy = cy - ay;
    const wz = cz - az;
    const nx = uy * wz - uz * wy;
    const ny = uz * wx - ux * wz;
    const nz = ux * wy - uy * wx;
    const largo = Math.hypot(nx, ny, nz);
    if (largo < 1e-9) continue;
    if (Math.abs(nz) / largo <= 0.5) continue;
    const triangulo = [ax, ay, z, bx, by, z, cx, cy, z];
    horizontales.push(...triangulo);
    if (az >= maxZ - 0.01 && bz >= maxZ - 0.01 && cz >= maxZ - 0.01) {
      superiores.push(...triangulo);
    }
  }
  const elegidos = superiores.length > 0 ? superiores : horizontales;
  if (elegidos.length === 0) return null;
  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute("position", new THREE.BufferAttribute(new Float32Array(elegidos), 3));
  return geometria;
}

/** Relleno de proyección tenue de una losa en planta (gris claro al 15 %). */
function materialProyeccionTenue(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(0x9aa0a6),
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
}

/** Material de relleno para un material de la tabla. */
function materialRelleno(
  nombre: MaterialNombre,
  estilos: Estilos,
  colorTrazo: string,
): THREE.Material {
  const estilo = estilos.materiales[nombre];
  if (estilo.patron === "generico") {
    return new THREE.MeshBasicMaterial({
      color: new THREE.Color(colorTrazo),
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
  }
  const textura = texturaPatron(estilo.patron, estilo.escala, colorTrazo);
  if (!textura) {
    return new THREE.MeshBasicMaterial({ visible: false });
  }
  return new THREE.MeshBasicMaterial({
    map: textura,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
}

function planosVista(vista: Vista, caja: Caja): {  planos: THREE.Plane[];
  relleno: { plano: THREE.Plane; origen: THREE.Vector3 } | null;
} {
  const centro = centroCaja(caja);
  if (vista.tipo === "planta") {
    const corte = vista.alturaPlano ?? caja.max[2] + 1;
    const fondo = vista.profundidad ?? caja.min[2] - 1;
    return {
      planos: [
        // Se conserva lo que queda por debajo del plano de corte y por encima del fondo.
        new THREE.Plane(new THREE.Vector3(0, 0, -1), corte),
        new THREE.Plane(new THREE.Vector3(0, 0, 1), -fondo),
      ],
      relleno: {
        plano: new THREE.Plane(new THREE.Vector3(0, 0, 1), -corte),
        origen: new THREE.Vector3(centro[0], centro[1], corte),
      },
    };
  }
  if (vista.tipo === "corte") {
    const [nx, ny] = normalCorte(vista);
    const n = new THREE.Vector3(nx, ny, 0).normalize();
    const origen = centroCorte(vista, caja);
    const profundidad = Math.max(vista.profundidad ?? 10, 0.01);
    return {
      planos: [
        new THREE.Plane(n.clone(), -n.dot(origen)),
        new THREE.Plane(n.clone().negate(), n.dot(origen) + profundidad),
      ],
      relleno: { plano: new THREE.Plane(n.clone(), -n.dot(origen)), origen },
    };
  }
  return { planos: [], relleno: null };
}

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
}: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const escena = useRef<THREE.Scene | null>(null);
  const renderer = useRef<THREE.WebGLRenderer | null>(null);
  const camara = useRef<THREE.Camera | null>(null);
  const grupo = useRef<THREE.Group | null>(null);
  const grupoHerramienta = useRef<THREE.Group | null>(null);
  const meshes = useRef<THREE.Mesh[]>([]);
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
  const opcionesNivel = useModelo((s) => s.opcionesNivel);
  const cotasNivel = useModelo((s) => s.cotasNivel);
  const dobleClicEnPlanta = useModelo((s) => s.dobleClicEnPlanta);
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
  } | null>(null);
  // O027: píxeles de mundo del último dibujo y diámetro de globo de la vista, para
  // imanes y cotas temporales sin recalcular la cámara en cada movimiento.
  const mundoPorPxRef = useRef(1e-3);
  const altoBurbujaRef = useRef(0.8);
  const ejeSeleccionadoRef = useRef<string | null>(null);
  // O027: guía y cota temporal que se dibujan sobre el visor mientras se arrastra.
  const [guiaArrastre, setGuiaArrastre] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    texto: string;
    enganchado: boolean;
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

  const agregarCodoVista = (globalid: string, lado: LadoEje) => {
    const eje = ejesVisiblesDeVista().find((e) => e.globalid === globalid);
    const bases = contextoEje.current?.bases[globalid];
    if (!eje || !bases) return;
    const ajuste = ajusteActualEje(globalid);
    // O011b: el globo vigente sale de la geometría (último codo si no hay extremo).
    const g = geometriaEje(ajuste, bases.inicio, bases.fin, { globoInicio: true });
    const globo = lado === "inicio" ? (g.globoInicio ?? bases.inicio) : g.globoFin;
    const dx = bases.fin[0] - bases.inicio[0];
    const dy = bases.fin[1] - bases.inicio[1];
    const largo = Math.hypot(dx, dy);
    if (largo < 1e-9) return;
    // Sentido hacia afuera del eje: del interior al extremo que se anota.
    const direccion: Punto2 =
      lado === "inicio" ? [-dx / largo, -dy / largo] : [dx / largo, dy / largo];
    // O011b: 3 mm de avance y un diámetro de globo (8 mm) de desplazamiento.
    const nuevo = agregarCodoEje(
      ajuste,
      lado,
      globo,
      direccion,
      mmPapelAMetros(3, vista.escala),
      mmPapelAMetros(8, vista.escala),
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
            ratonHerramienta,
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
    const rendererLocal = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      stencil: true,
      preserveDrawingBuffer: true,
    });
    rendererLocal.localClippingEnabled = true;
    rendererLocal.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    rendererLocal.setClearColor(colorDeFondo(oscuro), 1);
    nodo.appendChild(rendererLocal.domElement);
    rendererLocal.domElement.style.display = "block";
    rendererLocal.domElement.style.width = "100%";
    rendererLocal.domElement.style.height = "100%";
    rendererLocal.domElement.dataset.testid = "visor-canvas";

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

  // Los cambios del modelo solo ajustan el recorte de profundidad.
  useEffect(() => {
    aplicarCamara();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cajaVista]);

  // Vista activa y geometría: filtros de categorías/niveles, recorte y relleno.
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
    const visibles = mallas.filter((malla) => {
      if (!categoriaVisible(vista, malla.categoria)) return false;
      if (categoriaOculta(vista, malla.categoria)) return false;
      // O005c: en planta puertas y ventanas se dibujan solo con su simbología 2D;
      // su marco y su hoja en 3D no deben asomar como un rectángulo fuera del muro.
      if (
        vista.tipo === "planta" &&
        (malla.clase === "IfcDoor" || malla.clase === "IfcWindow")
      ) {
        return false;
      }
      const gid = nivelGlobalidPorNombre.get(malla.nivel);
      if (nivelesVisibles.size > 0 && gid && !nivelesVisibles.has(gid)) return false;
      return true;
    });

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
        elemento.globalid === seleccion || seleccionados.includes(elemento.globalid);
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

      const material =
        diseno
          ? new THREE.MeshBasicMaterial({
              color: seleccionado ? color : fondo,
              side: THREE.DoubleSide,
              clippingPlanes: planos,
            })
          : new THREE.MeshLambertMaterial({
              color,
              side: THREE.DoubleSide,
              transparent: !opaco,
              opacity: elemento.opacidad,
              clippingPlanes: planos,
              emissive: seleccionado ? 0x123a66 : 0x000000,
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
      if (diseno) {
        if (siluetaArriba) {
          const mm = grosorDe("arriba-corte", "proyeccion");
          const siluetas =
            mm === null ? [] : siluetaProyectada(elemento.vertices, elemento.indices);
          if (mm !== null && siluetas.length > 0) {
            const materialLinea = crearMaterialLinea({
              mm,
              escala: vista.escala,
              color: seleccionado ? "#ff8a00" : estilos.categorias["arriba-corte"].color,
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
              color: seleccionado ? "#ff8a00" : estilos.categorias[categoriaEstilo].color,
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
        const color = seleccion === elemento.globalid || seleccionados.includes(elemento.globalid)
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
        } else if (alias === "trabe" || alias === "cerramiento" || alias === "dala") {
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
          });
          const puntos = g.puntos.map(([x, y]) => [x, y, zEje] as [number, number, number]);
          lineaCerrada(puntos, materialEje, 1.6, grupoLocal);
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
            ejesInteraccion.current.push({
              globalid: eje.globalid,
              etiqueta: eje.etiqueta,
              lado,
              tipo: "globo",
              indice: null,
              punto: [punto[0], punto[1], zEje],
            });
          }
          // Asas de los codos (se dibujan como cuadraditos para poder arrastrarlas).
          for (const [lado, clave] of [
            ["inicio", "codosInicio"],
            ["fin", "codosFin"],
          ] as const) {
            const codos = ajuste?.[clave] ?? [];
            codos.forEach((codo, indice) => {
              const ladoMundo = Math.max(altoBurbuja * 0.09, 0.04);
              lineaCerrada(
                [
                  [codo[0] - ladoMundo, codo[1] - ladoMundo, zEje],
                  [codo[0] + ladoMundo, codo[1] - ladoMundo, zEje],
                  [codo[0] + ladoMundo, codo[1] + ladoMundo, zEje],
                  [codo[0] - ladoMundo, codo[1] + ladoMundo, zEje],
                  [codo[0] - ladoMundo, codo[1] - ladoMundo, zEje],
                ],
                materialEje,
                1.6,
                grupoLocal,
              );
              ejesInteraccion.current.push({
                globalid: eje.globalid,
                etiqueta: eje.etiqueta,
                lado,
                tipo: "codo",
                indice,
                punto: [codo[0], codo[1], zEje],
              });
            });
          }
          // O021: asa de codo junto a cada globo (arrastrarla crea el codo) y asas
          // circulares en los extremos reales de la línea para no perderlos de vista.
          for (const { punto, lado } of globos) {
            const haciaAdentro: Punto2 = lado === "fin"
              ? [eje.x1 - eje.x2, eje.y1 - eje.y2]
              : [eje.x2 - eje.x1, eje.y2 - eje.y1];
            const largoHacia = Math.hypot(haciaAdentro[0], haciaAdentro[1]) || 1;
            const separacionCodo = altoBurbuja * 0.9;
            const asaCodo: Punto2 = [
              punto[0] + (haciaAdentro[0] / largoHacia) * separacionCodo,
              punto[1] + (haciaAdentro[1] / largoHacia) * separacionCodo,
            ];
            const ladoMundo = Math.max(altoBurbuja * 0.09, 0.04);
            lineaCerrada(
              [
                [asaCodo[0] - ladoMundo, asaCodo[1] - ladoMundo, zEje],
                [asaCodo[0] + ladoMundo, asaCodo[1] - ladoMundo, zEje],
                [asaCodo[0] + ladoMundo, asaCodo[1] + ladoMundo, zEje],
                [asaCodo[0] - ladoMundo, asaCodo[1] + ladoMundo, zEje],
                [asaCodo[0] - ladoMundo, asaCodo[1] - ladoMundo, zEje],
              ],
              materialEje,
              1.6,
              grupoLocal,
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
          ejesInteraccion.current.push({
            globalid: eje.globalid,
            etiqueta: eje.etiqueta,
            lado: "inicio",
            tipo: "base",
            indice: null,
            punto: [g.baseInicio[0], g.baseInicio[1], zEje],
          });
          ejesInteraccion.current.push({
            globalid: eje.globalid,
            etiqueta: eje.etiqueta,
            lado: "fin",
            tipo: "base",
            indice: null,
            punto: [g.baseFin[0], g.baseFin[1], zEje],
          });
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
            for (const [a, b] of segmentosTrazoPunto(linea.puntos, vista.escala)) {
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
        for (const { eje, s } of cruces) {
          ejesInteraccion.current.push({
            globalid: eje.globalid,
            etiqueta: eje.etiqueta,
            lado: "inicio",
            tipo: "base",
            indice: null,
            punto: puntoHZ(s, zBajoEje),
          });
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

  // O003b: marcadores de la herramienta de dibujo (puntos, snap y vista previa).
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
            ratonHerramienta,
            referencias.ejes,
            ejeLibre,
          )
        : null;
    if (restriccionEje) {
      polilinea([restriccionEje.inicio, restriccionEje.fin]);
      const cercano = distanciaAEjeParalelo(
        ratonHerramienta ?? restriccionEje.fin,
        referencias.ejes,
        restriccionEje.vertical,
      );
      if (cercano && cercano.distancia > 0.02) {
        const medio: Punto2 = restriccionEje.vertical
          ? [restriccionEje.inicio[0], (restriccionEje.inicio[1] + restriccionEje.fin[1]) / 2]
          : [(restriccionEje.inicio[0] + restriccionEje.fin[0]) / 2, restriccionEje.inicio[1]];
        const enEje: Punto2 = restriccionEje.vertical
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
    if (herramienta === "losa" && puntosHerramienta.length >= 2) {
      polilinea(puntosHerramienta, puntosHerramienta.length >= 3);
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
    metrosPorPixelActual,
  ]);

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

  // Rueda: zoom hacia el cursor en ortográficas y acercamiento en 3D.
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

  // Paneo, órbita, selección, toques y puntos del corte.
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

    const hacerClic = (
      clientX: number,
      clientY: number,
      shift: boolean,
      agregar: boolean,
    ) => {
      const camera = camara.current;
      if (!camera) return;
      const falso = { clientX, clientY } as PointerEvent;
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
      if (herramienta === "nivel" && (vista.tipo === "alzado" || vista.tipo === "corte")) {
        const punto = puntoVistaDesdeEvento(clientX, clientY);
        if (punto) void clicNivel(punto);
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
      onSeleccionar(impacto?.object.userData.globalid ?? null, agregar);
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
      const g = geometriaEje(ajuste, bases.inicio, bases.fin, { globoInicio: true });
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
        mmPapelAMetros(3, vista.escala),
        mmPapelAMetros(8, vista.escala),
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
            };
            ajusteEnCursoRef.current = inicialConCambios;
            setAjusteEnCurso(inicialConCambios);
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
            // El codo desplazó el globo: el arrastre sigue desde su lugar nuevo.
            const basesCodo = ctx.bases[arrEje.globalid];
            if (basesCodo) {
              arrEje.asaInicio = puntoAsaEje(
                inicial[arrEje.globalid],
                basesCodo,
                arrEje.lado,
                "globo",
              );
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

        // El destino parte del asa, no del puntero: pulsar fuera del centro ya no
        // hace saltar el punto ni lo saca de su línea de restricción.
        const destino = destinoArrastreAsa(
          arrEje.asaInicio,
          arrEje.inicio,
          punto,
          tipoAsa,
          direccion,
          evento.shiftKey,
        );

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
          tipoAsa === "globo" ? direccion === "vertical" : direccion === "horizontal";
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
          const claveExtremo = arrEje.lado === "inicio" ? "extremoInicio" : "extremoFin";
          const codos = [...(actual[clave] ?? [])];
          const anterior = codos[arrEje.indice];
          const deltaCodo: Punto2 = anterior
            ? [destino[0] - anterior[0], destino[1] - anterior[1]]
            : [0, 0];
          codos[arrEje.indice] = [destino[0], destino[1]];
          // O011b: al arrastrar un codo, el resto del tramo y el globo lo siguen.
          for (let i = arrEje.indice + 1; i < codos.length; i += 1) {
            codos[i] = [codos[i][0] + deltaCodo[0], codos[i][1] + deltaCodo[1]];
          }
          const siguiente: AjusteEjeVista = { ...actual, [clave]: codos };
          if (actual[claveExtremo]) {
            siguiente[claveExtremo] = [
              actual[claveExtremo]![0] + deltaCodo[0],
              actual[claveExtremo]![1] + deltaCodo[1],
            ];
          }
          cambios[arrEje.globalid] = siguiente;
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
      if (!arrastre.current?.paneable) {
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
          material.size = activa ? 16 : 12;
        }
        if (asaHover) {
          const ctxHover = contextoEje.current;
          const ejeHover = referencias.ejes.find((e) => e.globalid === asaHover.globalid);
          const vertical = ctxHover?.tipo === "planta" ? !!ejeHover?.vertical : true;
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
        hacerClic(
          evento.clientX,
          evento.clientY,
          evento.shiftKey,
          evento.ctrlKey || evento.metaKey || evento.altKey,
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
        (arrastreEje.current || arrastreNivel.current)
      ) {
        arrastreEje.current = null;
        arrastreNivel.current = null;
        ajusteEnCursoRef.current = null;
        setAjusteEnCurso(null);
        setAjustesNivelEnCurso({});
        setGuiaArrastre(null);
        evento.preventDefault();
        evento.stopPropagation();
        return;
      }
      if (evento.key === "Escape" && (menuEje || ejeSeleccionado)) {
        setMenuEje(null);
        setEjeSeleccionado(null);
        evento.preventDefault();
        return;
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
    window.addEventListener("keydown", alTecla);
    window.addEventListener("keyup", alSoltarTecla);
    return () => {
      nodo.removeEventListener("pointerdown", alBajar);
      nodo.removeEventListener("dblclick", alDobleClic);
      nodo.removeEventListener("contextmenu", alMenuContextual);
      window.removeEventListener("pointermove", alMover);
      window.removeEventListener("pointerup", alSoltar);
      window.removeEventListener("keydown", alTecla);
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
    dobleClicEnPlanta,
    ventanaSeleccion,
    fijarAviso,
    metrosPorPixelActual,
    asaEjeEn,
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
  ]);

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
    // O014b: asa en pantalla de la cabeza de un nivel (para arrastrarla en E2E).
    (nodo as unknown as Record<string, unknown>).__openrvtNivelAPantalla = (
      globalid: string,
    ) => {
      const asa = asasNivel.current.find((a) => a.globalid === globalid);
      if (!asa) return null;
      return pantallaDePunto(asa.punto);
    };
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
        if (indiceCodo !== undefined) {
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
      const asa = ejesInteraccion.current.find(
        (a) => a.etiqueta === etiqueta && a.tipo === "globo",
      );
      if (!asa) return null;
      camera.updateMatrixWorld();
      const centro = new THREE.Vector3(...asa.punto);
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

  const ejeSeleccionadoDatos = referencias.ejes.find((e) => e.globalid === ejeSeleccionado);
  const ajusteSeleccionado = ejeSeleccionado ? ajusteActualEje(ejeSeleccionado) : undefined;
  const codosInicioSel = ajusteSeleccionado?.codosInicio?.length ?? 0;
  const codosFinSel = ajusteSeleccionado?.codosFin?.length ?? 0;
  const puedeAnotarEje =
    !!ejeSeleccionadoDatos &&
    (vista.tipo === "planta" || vista.tipo === "alzado" || vista.tipo === "corte");

  // O026: guía azul punteada de la referencia y candado de la alineación.
  // Se proyecta en un efecto: durante el render no se leen refs de cámara.
  const [guiaAlinear, setGuiaAlinear] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    candado: { x: number; y: number } | null;
    bloqueada: boolean;
  } | null>(null);
  useEffect(() => {
    if (!referenciaAlinear) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- la guía depende de la cámara y de la selección
      setGuiaAlinear(null);
      return;
    }
    const z = vista.tipo === "planta" ? 0.05 : (vista.alturaPlano ?? 1.2);
    let a: [number, number, number] | null = null;
    let b: [number, number, number] | null = null;
    if (referenciaAlinear.tipo === "eje") {
      const eje = referencias.ejes.find((e) => e.globalid === referenciaAlinear.globalid);
      if (eje) {
        a = [eje.x1, eje.y1, z];
        b = [eje.x2, eje.y2, z];
      }
    } else if (referenciaAlinear.tipo === "elemento") {
      const malla = mallas.find((m) => m.globalid === referenciaAlinear.globalid);
      const recta = malla ? rectaDeMalla(malla) : null;
      if (malla?.eje) {
        a = [malla.eje[0], malla.eje[1], z];
        b = [malla.eje[2], malla.eje[3], z];
      } else if (recta) {
        a = [recta.x - recta.ux * 1.5, recta.y - recta.uy * 1.5, z];
        b = [recta.x + recta.ux * 1.5, recta.y + recta.uy * 1.5, z];
      }
    }
    const rectNodo = contenedor.current?.getBoundingClientRect();
    if (!a || !b || !rectNodo) {
      setGuiaAlinear(null);
      return;
    }
    const pa = pantallaDePunto(a);
    const pb = pantallaDePunto(b);
    if (!pa || !pb) {
      setGuiaAlinear(null);
      return;
    }
    const candado = alineando
      ? pantallaDePunto([alineando.punto[0], alineando.punto[1], z])
      : null;
    setGuiaAlinear({
      x1: pa.x - rectNodo.left,
      y1: pa.y - rectNodo.top,
      x2: pb.x - rectNodo.left,
      y2: pb.y - rectNodo.top,
      candado: candado
        ? { x: candado.x - rectNodo.left, y: candado.y - rectNodo.top }
        : null,
      bloqueada: !!alineando?.bloqueada,
    });
  }, [referenciaAlinear, alineando, vista, mallas, referencias.ejes, pantallaDePunto]);

  // O029: alzado con la herramienta Nivel. La elevación objetivo es la tecleada
  // (si la hay); con ella se dibujan la línea fantasma y las dos cotas temporales.
  const esAlzadoOCorte = vista.tipo === "alzado" || vista.tipo === "corte";
  const zNivelHerramienta =
    herramienta === "nivel" && ratonHerramienta
      ? (() => {
          const texto = (opcionesNivel.elevacionTexto || "").trim();
          if (texto !== "") {
            const z = elevacionDesdeCota(cotasNivel?.inferior ?? null, texto);
            if (z !== null) return z;
          }
          return ratonHerramienta[1];
        })()
      : null;
  const [lineaFantasmaNivel, setLineaFantasmaNivel] = useState<{
    y: number;
    x1: number;
    x2: number;
  } | null>(null);
  const [cotasFantasma, setCotasFantasma] = useState<
    Array<{ y1: number; y2: number; texto: string }>
  >([]);
  useEffect(() => {
    if (herramienta !== "nivel" || zNivelHerramienta === null || !esAlzadoOCorte) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- la vista fantasma depende de la cámara, que vive en un ref
      setLineaFantasmaNivel(null);
      setCotasFantasma([]);
      return;
    }
    const rect = contenedor.current?.getBoundingClientRect();
    const centro = centroCaja(caja);
    const enPantalla = (z: number) => pantallaDePunto([centro[0], centro[1], z]);
    const cursor = enPantalla(zNivelHerramienta);
    if (!rect || !cursor) {
      setLineaFantasmaNivel(null);
      setCotasFantasma([]);
      return;
    }
    setLineaFantasmaNivel({
      y: cursor.y - rect.top,
      x1: 8,
      x2: Math.max(8, rect.width - 8),
    });
    const filas: Array<{ y1: number; y2: number; texto: string }> = [];
    for (const [lado, cota] of [
      ["inferior", cotasNivel?.inferior],
      ["superior", cotasNivel?.superior],
    ] as const) {
      if (!cota) continue;
      const yNivel = enPantalla(cota.elevacion);
      if (!yNivel) continue;
      const desfase =
        lado === "inferior"
          ? zNivelHerramienta - cota.elevacion
          : cota.elevacion - zNivelHerramienta;
      filas.push({
        y1: yNivel.y - rect.top,
        y2: cursor.y - rect.top,
        texto: `${cota.nombre} ${lado === "inferior" ? "+" : "−"} ${desfase.toFixed(2)}`,
      });
    }
    setCotasFantasma(filas);
  }, [
    herramienta,
    zNivelHerramienta,
    esAlzadoOCorte,
    cotasNivel,
    caja,
    pantallaDePunto,
  ]);

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
      data-eje-seleccionado={ejeSeleccionado ?? undefined}
      data-ejes-ajustes={JSON.stringify(vista.ejes ?? {})}
      className="relative min-h-0 flex-1 overflow-hidden bg-background"
    >
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
      </div>
      {puedeAnotarEje && (
        <div
          data-testid="eje-acciones"
          className="absolute left-2 top-11 z-20 flex max-w-[min(640px,80vw)] flex-wrap items-center gap-1 rounded border bg-background/95 p-1.5 text-[11px] shadow-md"
        >
          <span className="px-1 font-semibold">Eje {ejeSeleccionadoDatos.etiqueta}</span>
          <button
            type="button"
            data-testid="eje-candado-inicio"
            aria-pressed={candados.inicio}
            title="Candado del extremo de inicio: cerrado mueve los ejes alineados; abierto mueve solo este eje"
            onClick={() => alternarCandadoVista(ejeSeleccionadoDatos.globalid, "inicio")}
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
            onClick={() => alternarCandadoVista(ejeSeleccionadoDatos.globalid, "fin")}
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
                fijarGlobos(ejeSeleccionadoDatos.globalid, { globoInicio: e.target.checked })
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
                fijarGlobos(ejeSeleccionadoDatos.globalid, { globoFin: e.target.checked })
              }
            />
            Globo fin
          </label>
          <button
            type="button"
            data-testid="eje-codo-inicio-agregar"
            disabled={codosInicioSel >= MAXIMO_CODOS}
            onClick={() => agregarCodoVista(ejeSeleccionadoDatos.globalid, "inicio")}
            className="rounded border px-1.5 py-0.5 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
          >
            Agregar codo (inicio) {codosInicioSel}/{MAXIMO_CODOS}
          </button>
          <button
            type="button"
            data-testid="eje-codo-fin-agregar"
            disabled={codosFinSel >= MAXIMO_CODOS}
            onClick={() => agregarCodoVista(ejeSeleccionadoDatos.globalid, "fin")}
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
            <span data-testid="pista-eje-libre">Ctrl/Alt: eje libre</span>
          )}
          {herramienta === "eje" && distanciaParalelo && (
            <span data-testid="pista-distancia-eje" className="font-semibold text-sky-600">
              distancia {distanciaParalelo.distancia.toFixed(2)} m
            </span>
          )}
          {puntosHerramienta.length > 0 && ratonHerramienta && herramienta !== "losa" && (
            <span data-testid="pista-longitud">
              {herramienta === "eje" && restriccionPrevia
                ? Math.hypot(
                    restriccionPrevia.fin[0] - restriccionPrevia.inicio[0],
                    restriccionPrevia.fin[1] - restriccionPrevia.inicio[1],
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
