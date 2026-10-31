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
  factorRueda,
  useRueda,
  type RegistroRueda,
} from "@/lib/rueda";
import {
  colocarAbertura,
  describirEnganche,
  distanciaAEjeParalelo,
  restringirEje,
  type Punto2,
} from "./herramientas";
import {
  calcularFamiliasCotas,
  formatearCota,
  parsearCota,
  parsearElevacion,
  posicionTextoEntreMarcas,
} from "./cotas";
import { altoTextoBurbuja, desplazamientoCentrado } from "./centrado";
import { textoCabezaNivel } from "./niveles";
import {
  categoriaOculta,
  factorEscala,
  grosorMm,
  materialPorCapa,
  mmAMundo,
  mmAMundoConMinimoPx,
  mmAPx,
  PATRONES_LINEA_DASH,
  type Estilos,
  type MaterialNombre,
  type PatronLinea,
  type PatronRelleno,
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
  extremoEje,
  fijarExtremoEje,
  geometriaEje,
  mmPapelAMetros,
  normalizarAjusteEje,
  quitarCodoEje,
  type LadoEje,
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

function orientarAnotacion(grupo: THREE.Object3D, normal: [number, number, number]): void {
  const n = new THREE.Vector3(normal[0], normal[1], normal[2]).normalize();
  // Base derecha: el «arriba» del papel es +Y en planta y +Z en alzados. Así el
  // texto no sale espejado al mirar desde el norte o el sur.
  const arribaBase = Math.abs(n.z) > 0.9
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(0, 0, 1);
  const derecha = new THREE.Vector3().crossVectors(arribaBase, n).normalize();
  const arriba = new THREE.Vector3().crossVectors(n, derecha).normalize();
  const matriz = new THREE.Matrix4().makeBasis(derecha, arriba, n);
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
    if (!limites) return;
    if (alineacion === "izquierda") {
      // El origen del grupo queda en el borde izquierdo visible del glifo.
      texto3d.position.set(-limites[0], -(limites[1] + limites[3]) / 2, 0);
      return;
    }
    const [dx, dy] = desplazamientoCentrado(limites);
    texto3d.position.set(dx, dy, 0);
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
  // O010: la cámara de cada vista se conserva al cambiar de vista y entre redibujos.
  const camarasGuardadas = useRef(new Map<string, CamaraGuardada>());
  const vistaDeCamara = useRef<string | null>(null);
  const arrastre = useRef<{
    x: number;
    y: number;
    inicioX: number;
    inicioY: number;
    boton: number;
    movido: boolean;
    paneable: boolean;
  } | null>(null);
  const [ventanaSeleccion, setVentanaSeleccion] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
  // O003b: estado de la herramienta activa.
  const herramienta = useModelo((s) => s.herramienta);
  const puntosHerramienta = useModelo((s) => s.puntosHerramienta);
  const ratonHerramienta = useModelo((s) => s.ratonHerramienta);
  const engancheHerramienta = useModelo((s) => s.engancheHerramienta);
  const referencias = useModelo((s) => s.referencias);
  const voltearSiguiente = useModelo((s) => s.voltearSiguiente);
  const longitudTecleada = useModelo((s) => s.longitudTecleada);
  const ejeLibre = useModelo((s) => s.ejeLibre);
  const fijarRaton = useModelo((s) => s.fijarRatonHerramienta);
  const clicEnPlanta = useModelo((s) => s.clicEnPlanta);
  const dobleClicEnPlanta = useModelo((s) => s.dobleClicEnPlanta);
  const espacio = useRef(false);
  const ultimaZ = useRef(0);
  const ultimoMedio = useRef(0);
  const [oscuro, setOscuro] = useState(() =>
    typeof document !== "undefined" ? document.documentElement.classList.contains("dark") : false,
  );
  const [dimensiones, setDimensiones] = useState({ ancho: 1, alto: 1 });  // O006a: textos de cota dibujados y edición en el sitio.
  const cotasInteraccion = useRef<CotaInteractiva[]>([]);
  // O011b: etiquetas de nivel y cotas del alzado, con su rectángulo, para las E2E.
  const anotacionesAlzado = useRef<AnotacionAlzado[]>([]);
  const [cotaEditando, setCotaEditando] = useState<CotaEnEdicion | null>(null);
  const [textoCotaEditando, setTextoCotaEditando] = useState("");
  // O010: el error de una cota se muestra junto a la caja, no en la barra de estado.
  const [errorCota, setErrorCota] = useState<string | null>(null);
  // O011: eje seleccionado, codos y extremos libres de la vista.
  const [ejeSeleccionado, setEjeSeleccionado] = useState<string | null>(null);
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
  const arrastreEje = useRef<{
    globalid: string;
    etiqueta: string;
    lado: LadoEje;
    indice: number | null;
    candado: boolean;
    familia: "vertical" | "horizontal" | "alzado";
    inicio: Punto2;
    originales: Record<string, AjusteEjeVista>;
    movido: boolean;
  } | null>(null);
  const ejesInteraccion = useRef<
    Array<{
      globalid: string;
      etiqueta: string;
      lado: LadoEje;
      tipo: "globo" | "codo" | "base";
      indice: number | null;
      punto: [number, number, number];
    }>
  >([]);
  const lineasEje = useRef<Array<{ globalid: string; etiqueta: string; puntos: Array<[number, number, number]> }>>([]);
  const ajusteEnCursoRef = useRef<Record<string, AjusteEjeVista> | null>(null);
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
  const editarNivel = useModelo((s) => s.editarNivel);
  const fijarAviso = useModelo((s) => s.fijarAviso);
  const preferenciaRueda = useRueda((s) => s.preferencia);
  const fijarDetectado = useRueda((s) => s.fijarDetectado);
  const ayudaVisible = useRueda((s) => s.ayudaVisible);
  const cerrarAyuda = useRueda((s) => s.cerrarAyuda);
  const [diagnosticoRueda, setDiagnosticoRueda] = useState(false);
  const [registrosRueda, setRegistrosRueda] = useState<RegistroRueda[]>([]);

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
      const ajuste = fijarExtremoEje(ajusteActualEje(globalid), lado, null);
      persistirAjusteEje(globalid, ajuste);
    }
    setCandados((c) => ({ ...c, [lado]: !abierto }));
  };

  const quitarCodoVista = (globalid: string, lado: LadoEje, indice: number) => {
    persistirAjusteEje(globalid, quitarCodoEje(ajusteActualEje(globalid), lado, indice));
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
      malla.renderOrder = 1.05;
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

      // Sección real del plano de corte con esta malla (solo si lo atraviesa).
      const atraviesa =
        planoSeccion !== null &&
        minD <= -planoSeccion.constante + 1e-4 &&
        maxD >= -planoSeccion.constante - 1e-4;
      if (diseno && planoSeccion && origenSeccion && !encimaDelCorte && atraviesa) {
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
          const globos: Array<{ punto: Punto2; lado: LadoEje }> = [
            { punto: g.globoFin, lado: "fin" },
          ];
          if (g.globoInicio) globos.push({ punto: g.globoInicio, lado: "inicio" });
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
        const colorCota = oscuro ? "#e8eaed" : estilos.categorias.cotas.color;
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
        const marca = mmAMundoConMinimoPx(2, vista.escala, mundoPorPx, 6);
        const altoTexto = mmAMundoConMinimoPx(2.5, vista.escala, mundoPorPx, 11);
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
            const etiqueta = formatearCota(familia.rebase.valor);
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
          const marcar = (s: number, t: number) => {
            const bx = nx * s + ux * t;
            const by = ny * s + uy * t;
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
            marcar(cota.desde, t);
            marcar(cota.hasta, t);
            const etiqueta = formatearCota(cota.valor);
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
          marcar(familia.total.desde, tTotal);
          marcar(familia.total.hasta, tTotal);
          const etiquetaTotal = formatearCota(familia.total.valor);
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
        const centro = centroCaja(caja);
        const profundidad = centro[0] * d[0] + centro[1] * d[1];
        const planoPunto = vista.puntoA
          ? new THREE.Vector2(vista.puntoA[0], vista.puntoA[1])
          : new THREE.Vector2(centro[0], centro[1]);
        // O014a: el color del nivel sale de su propio estilo (por omisión, el de la categoría).
        const colorNivel = oscuro ? "#e8eaed" : estilos.niveles.color;
        const colorEje = oscuro ? "#e0b07a" : estilos.categorias.ejes.color;
        const materialNivel = crearMaterialLinea({
          mm: mmNiveles,
          escala: vista.escala,
          color: colorNivel,
          patron: "trazo-punto",
          registro,
          mundoPorPx,
          profundidad: false,
        });
        const materialEjeNivel = crearMaterialLinea({
          mm: grosorDe("ejes", "proyeccion") ?? mmNiveles,
          escala: vista.escala,
          color: colorEje,
          patron: "trazo-punto",
          registro,
          mundoPorPx,
          profundidad: false,
        });
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
        // O011: los ejes visibles se calculan antes de las líneas de nivel, porque
        // estas deben cubrirlos de lado a lado (y no quedarse en la caja del modelo).
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
        const margenEtiqueta = mmAMundo(3, vista.escala);
        const separacionTexto = mmAMundo(1.5, vista.escala);
        const sMin = cruces.length > 0 ? cruces[0].s : tMin;
        const sMax = cruces.length > 0 ? cruces[cruces.length - 1].s : tMax;
        // O011b: la línea de nivel pasa el último eje 3 mm y ahí empieza la etiqueta.
        const tInicioNivel = Math.min(tMin, sMin - margenEtiqueta);
        const tFinNivel = cruces.length > 0 ? sMax + margenEtiqueta : tMax;
        const nivelMin = ordenados[0]?.elevacion ?? caja.min[2];
        const nivelMax = ordenados[ordenados.length - 1]?.elevacion ?? caja.max[2];
        const zInferiorEje = nivelMin - Math.max(margenEtiqueta, 0.3);
        // Borde inferior del globo 3 mm arriba de la línea del nivel más alto.
        const zGlobo = nivelMax + margenEtiqueta + mmAMundo(8, vista.escala) / 2;
        const marca = mmAMundoConMinimoPx(2, vista.escala, mundoPorPx, 6);
        const altoTexto = mmAMundoConMinimoPx(2.5, vista.escala, mundoPorPx, 11);
        // O014a: cabeza de nivel configurable (triángulo relleno, círculo o ninguna).
        const estiloNivel = estilos.niveles;
        const anchoCabeza = mmAMundo(3, vista.escala);
        const altoCabeza = mmAMundo(2.6, vista.escala);
        const altoNombre = mmAMundoConMinimoPx(2, vista.escala, mundoPorPx, 8);
        // O011b: etiqueta de nivel fuera del último eje; las cotas van más afuera.
        const anchoNivel = Math.max(
          ...ordenados.map((nivel) =>
            anchoTextoAprox(textoCabezaNivel(nivel.elevacion, estiloNivel), altoTexto),
          ),
          mmAMundo(4, vista.escala),
        );
        const tParcial =
          tFinNivel + separacionTexto + anchoNivel + separacionTexto;
        const anchoParcial = Math.max(
          ...ordenados.slice(0, -1).map((nivel, i) =>
            anchoTextoAprox(
              formatearCota(ordenados[i + 1].elevacion - nivel.elevacion),
              altoTexto,
            ),
          ),
          mmAMundo(4, vista.escala),
        );
        const xEtiquetaParcial = tParcial + separacionTexto + anchoParcial / 2;
        const tTotal =
          tParcial + separacionTexto + anchoParcial + separacionTexto;
        const anchoTotal =
          ordenados.length >= 3
            ? anchoTextoAprox(
                `Total ${formatearCota(
                  ordenados[ordenados.length - 1].elevacion - ordenados[0].elevacion,
                )}`,
                altoTexto,
              )
            : mmAMundo(4, vista.escala);
        const xEtiquetaTotal = tTotal + separacionTexto + anchoTotal / 2;
        anotacionesAlzado.current = [];
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
                inicio: [s, zInferiorEje] as Punto2,
                fin: [s, zGlobo] as Punto2,
              },
            ]),
          ),
        };
        const fondo = oscuro ? "#1f2328" : "#ffffff";
        const marcarHZ = (t: number, z: number) => {
          const base = puntoHZ(t, z);
          const dx = h[0] / Math.SQRT2;
          const dy = h[1] / Math.SQRT2;
          const dz = 1 / Math.SQRT2;
          lineaCerrada(
            [
              [base[0] - (dx * marca) / 2, base[1] - (dy * marca) / 2, z - (dz * marca) / 2],
              [base[0] + (dx * marca) / 2, base[1] + (dy * marca) / 2, z + (dz * marca) / 2],
            ],
            materialNivel,
            3.1,
            grupoLocal,
          );
        };

        const cabezas: string[] = [];
        for (const nivel of ordenados) {
          const z = nivel.elevacion;
          lineaCerrada(
            [puntoHZ(tInicioNivel, z), puntoHZ(tFinNivel, z)],
            materialNivel,
            3,
            grupoLocal,
          );
          // O014a: cabeza rellena en el extremo, con el vértice tocando la línea.
          const cabeza = new THREE.Group();
          if (estiloNivel.cabeza === "triangulo") {
            const forma = new THREE.Shape();
            forma.moveTo(0, 0);
            forma.lineTo(anchoCabeza / 2, altoCabeza);
            forma.lineTo(-anchoCabeza / 2, altoCabeza);
            forma.closePath();
            const malla = new THREE.Mesh(
              new THREE.ShapeGeometry(forma),
              new THREE.MeshBasicMaterial({
                color: new THREE.Color(colorNivel),
                side: THREE.DoubleSide,
                transparent: true,
                depthTest: false,
                depthWrite: false,
              }),
            );
            malla.renderOrder = 21;
            cabeza.add(malla);
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
            malla.position.y = altoCabeza / 2;
            malla.renderOrder = 21;
            cabeza.add(malla);
          }
          if (cabeza.children.length > 0) {
            const base = puntoHZ(tFinNivel, z);
            cabeza.position.set(base[0], base[1], base[2]);
            orientarAnotacion(cabeza, [d[0], d[1], 0]);
            grupoLocal.add(cabeza);
          }
          const inicioTexto =
            estiloNivel.cabeza === "triangulo"
              ? anchoCabeza / 2
              : estiloNivel.cabeza === "circulo"
                ? altoCabeza / 2
                : 0;
          const zTexto =
            estiloNivel.cabeza === "ninguna" ? z + altoTexto / 2 : z + altoCabeza / 2;
          const texto = textoCabezaNivel(z, estiloNivel);
          // O014a: el texto se alinea por su borde izquierdo 1 mm a la derecha de la
          // cabeza, nunca centrado sobre el eje ni sobre el triángulo.
          const bordeTexto = tFinNivel + inicioTexto + mmAMundo(1, vista.escala);
          const anchoTextoCabeza = anchoTextoAprox(texto, altoTexto);
          const xTexto = bordeTexto + anchoTextoCabeza / 2;
          cabezas.push(texto);
          const sprite = textoCota(
            texto,
            colorNivel,
            fondo,
            altoTexto,
            [d[0], d[1], 0],
            "izquierda",
          );
          if (sprite) {
            const pos = puntoHZ(xTexto, zTexto);
            const posBorde = puntoHZ(bordeTexto, zTexto);
            sprite.position.set(posBorde[0], posBorde[1], posBorde[2]);
            sprite.renderOrder = 20;
            grupoLocal.add(sprite);
            cotasInteraccion.current.push({
              tipo: "elevacion",
              texto,
              valor: z,
              punto: pos,
              nivel: nivel.globalid,
              nombre: nivel.nombre,
            });
            anotacionesAlzado.current.push({
              tipo: "nivel",
              texto,
              centro: pos,
              ancho: anchoTextoCabeza,
              alto: altoTexto,
              h: [h[0], h[1], 0],
            });
          }
          // O014a: el nombre del nivel, más chico y debajo de la cabeza.
          if (estiloNivel.mostrarNombre) {
            const nombre = textoCota(
              nivel.nombre,
              colorNivel,
              fondo,
              altoNombre,
              [d[0], d[1], 0],
            );
            if (nombre) {
              const posNombre = puntoHZ(xTexto, z - altoNombre * 1.4);
              nombre.position.set(posNombre[0], posNombre[1], posNombre[2]);
              nombre.renderOrder = 20;
              grupoLocal.add(nombre);
            }
          }
        }

        const textos = {
          nombre: "Niveles",
          elevacion: "",
          cabezas,
          parciales: [] as string[],
          total: null as string | null,
        };
        // O014a: `cotas: false` oculta la cadena y el total, no las líneas ni las cabezas.
        if (estiloNivel.cotas && ordenados.length >= 2) {
          for (const nivel of ordenados) {
            lineaCerrada(
              [puntoHZ(tFinNivel, nivel.elevacion), puntoHZ(tParcial + 0.15, nivel.elevacion)],
              materialNivel,
              3,
              grupoLocal,
            );
            marcarHZ(tParcial, nivel.elevacion);
          }
          for (let i = 0; i + 1 < ordenados.length; i += 1) {
            const inferior = ordenados[i];
            const superior = ordenados[i + 1];
            const valor = superior.elevacion - inferior.elevacion;
            lineaCerrada(
              [puntoHZ(tParcial, inferior.elevacion), puntoHZ(tParcial, superior.elevacion)],
              materialNivel,
              3,
              grupoLocal,
            );
            const etiqueta = formatearCota(valor);
            const sprite = textoCota(etiqueta, colorNivel, fondo, altoTexto, [d[0], d[1], 0]);
            if (sprite) {
              const pos = puntoHZ(
                xEtiquetaParcial,
                (inferior.elevacion + superior.elevacion) / 2,
              );
              sprite.position.set(pos[0], pos[1], pos[2]);
              sprite.renderOrder = 20;
              grupoLocal.add(sprite);
              cotasInteraccion.current.push({
                tipo: "nivel",
                texto: etiqueta,
                valor,
                punto: pos,
                referencia: inferior.globalid,
                mover: superior.globalid,
              });
              anotacionesAlzado.current.push({
                tipo: "parcial",
                texto: etiqueta,
                centro: pos,
                ancho: anchoTextoAprox(etiqueta, altoTexto),
                alto: altoTexto,
                h: [h[0], h[1], 0],
              });
            }
            textos.parciales.push(etiqueta);
          }
          // O006b: la total solo con dos o más entrepisos; con uno repetiría la
          // misma medida de la parcial.
          if (ordenados.length >= 3) {
            for (const nivel of ordenados) {
              lineaCerrada(
                [puntoHZ(tParcial + 0.15, nivel.elevacion), puntoHZ(tTotal + 0.15, nivel.elevacion)],
                materialNivel,
                3,
                grupoLocal,
              );
              marcarHZ(tTotal, nivel.elevacion);
            }
            const primero = ordenados[0];
            const ultimo = ordenados[ordenados.length - 1];
            const total = ultimo.elevacion - primero.elevacion;
            lineaCerrada(
              [puntoHZ(tTotal, primero.elevacion), puntoHZ(tTotal, ultimo.elevacion)],
              materialNivel,
              3,
              grupoLocal,
            );
            // O010: la cota total lleva su rótulo para no confundirse con una parcial.
            const etiquetaTotal = `Total ${formatearCota(total)}`;
            const spriteTotal = textoCota(etiquetaTotal, colorNivel, fondo, altoTexto, [d[0], d[1], 0]);
            if (spriteTotal) {
              const pos = puntoHZ(
                xEtiquetaTotal,
                (primero.elevacion + ultimo.elevacion) / 2,
              );
              spriteTotal.position.set(pos[0], pos[1], pos[2]);
              spriteTotal.renderOrder = 20;
              grupoLocal.add(spriteTotal);
              cotasInteraccion.current.push({
                tipo: "total",
                texto: etiquetaTotal,
                valor: total,
                punto: pos,
              });
              anotacionesAlzado.current.push({
                tipo: "total",
                texto: etiquetaTotal,
                centro: pos,
                ancho: anchoTextoAprox(etiquetaTotal, altoTexto),
                alto: altoTexto,
                h: [h[0], h[1], 0],
              });
            }
            textos.total = etiquetaTotal;
          }
        }
        datosNiveles.push(textos);

        // O011: en alzados y cortes el globo va arriba, sobre el nivel más alto más
        // 3 mm de papel; la línea del eje baja hasta debajo del nivel más bajo.
        const altoBurbuja = mmAMundo(8, vista.escala);
        for (const { eje, s } of cruces) {
          const ajuste = ajusteEnCurso?.[eje.globalid] ?? vista.ejes?.[eje.globalid];
          const g = geometriaEje(ajuste, [s, zInferiorEje], [s, zGlobo]);
          const puntos = g.puntos.map(([ts, z]) => puntoHZ(ts, z));
          lineaCerrada(puntos, materialEjeNivel, 2.9, grupoLocal);
          lineasEje.current.push({ globalid: eje.globalid, etiqueta: eje.etiqueta, puntos });
          const burbuja = burbujaEje(
            eje.etiqueta,
            colorEje,
            oscuro ? "#1f2328" : "#ffffff",
            [d[0], d[1], 0],
          );
          if (burbuja) {
            const pos = puntoHZ(g.globoFin[0], g.globoFin[1]);
            burbuja.position.set(pos[0], pos[1], pos[2]);
            burbuja.scale.set(altoBurbuja, altoBurbuja, 1);
            burbuja.renderOrder = 20;
            grupoLocal.add(burbuja);
          }
          ejesInteraccion.current.push({
            globalid: eje.globalid,
            etiqueta: eje.etiqueta,
            lado: "fin",
            tipo: "globo",
            indice: null,
            punto: puntoHZ(g.globoFin[0], g.globoFin[1]),
          });
          // El extremo de abajo no lleva globo, pero sí candado y asa.
          ejesInteraccion.current.push({
            globalid: eje.globalid,
            etiqueta: eje.etiqueta,
            lado: "inicio",
            tipo: "base",
            indice: null,
            punto: puntoHZ(ajuste?.extremoInicio?.[0] ?? s, ajuste?.extremoInicio?.[1] ?? zInferiorEje),
          });
          for (const [lado, clave] of [
            ["inicio", "codosInicio"],
            ["fin", "codosFin"],
          ] as const) {
            const codos = ajuste?.[clave] ?? [];
            codos.forEach((codo, indice) => {
              const ladoMundo = Math.max(altoBurbuja * 0.09, 0.04);
              lineaCerrada(
                [
                  puntoHZ(codo[0] - ladoMundo, codo[1] - ladoMundo),
                  puntoHZ(codo[0] + ladoMundo, codo[1] - ladoMundo),
                  puntoHZ(codo[0] + ladoMundo, codo[1] + ladoMundo),
                  puntoHZ(codo[0] - ladoMundo, codo[1] + ladoMundo),
                  puntoHZ(codo[0] - ladoMundo, codo[1] - ladoMundo),
                ],
                materialEjeNivel,
                2.9,
                grupoLocal,
              );
              ejesInteraccion.current.push({
                globalid: eje.globalid,
                etiqueta: eje.etiqueta,
                lado,
                tipo: "codo",
                indice,
                punto: puntoHZ(codo[0], codo[1]),
              });
            });
          }
        }
        if (contenedor.current) {
          contenedor.current.dataset.ejesAlzadoOrden = cruces
            .map(({ eje }) => eje.etiqueta)
            .join(",");
          contenedor.current.dataset.ejesNivelMin = String(nivelMin);
          contenedor.current.dataset.ejesNivelMax = String(nivelMax);
          contenedor.current.dataset.ejesGloboZ = String(zGlobo);
          contenedor.current.dataset.nivelesX = JSON.stringify({
            desde: tInicioNivel,
            hasta: tFinNivel,
            ejes: cruces.map(({ s }) => s),
            etiquetaX: tFinNivel + separacionTexto,
            parcialX: tParcial,
            totalX: tTotal,
          });
          contenedor.current.dataset.nivelesZ = JSON.stringify(
            ordenados.map((nivel) => nivel.elevacion),
          );
          // O014a: geometría de la cabeza para comprobar en pantalla que el texto no
          // toca el triángulo ni la línea de ningún eje (prueba E2E geométrica).
          const inicioTextoNivel =
            estiloNivel.cabeza === "triangulo"
              ? anchoCabeza / 2
              : estiloNivel.cabeza === "circulo"
                ? altoCabeza / 2
                : 0;
          contenedor.current.dataset.nivelesCabezas = JSON.stringify({
            h: [h[0], h[1]],
            d: [d[0], d[1]],
            profundidad,
            ancho: anchoCabeza,
            alto: altoCabeza,
            bordeTexto: tFinNivel + inicioTextoNivel + mmAMundo(1, vista.escala),
            cabezas: ordenados.map((nivel) => ({
              z: nivel.elevacion,
              t: tFinNivel,
              tipo: estiloNivel.cabeza,
            })),
          });
        }
      }
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
  ]);

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
    },
    [aplicarCamara],
  );

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
    const alRodar = (evento: WheelEvent) => {
      evento.preventDefault();
      const camera = camara.current;
      const nav = navegacion.current;
      if (!camera || !nav) return;
      const accion = detectorRueda.clasificar(evento, preferenciaRueda);
      const dispositivo = detectorRueda.ultimoDispositivo();
      if (dispositivo) fijarDetectado(dispositivo);
      if (diagnosticoRueda) setRegistrosRueda(detectorRueda.ultimos());
      if (accion === "zoom") {
        const factor = factorRueda(evento.deltaY);
        if (camera instanceof THREE.OrthographicCamera) {
          const rect = nodo.getBoundingClientRect();
          const raton = new THREE.Vector2(
            ((evento.clientX - rect.left) / rect.width) * 2 - 1,
            -((evento.clientY - rect.top) / rect.height) * 2 + 1,
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
      } else {
        // O006e: en 3D, Shift + dos dedos orbita; en planta panea en horizontal.
        const es3d = vista.tipo === "iso" || vista.tipo === "perspectiva";
        if (dispositivo === "touchpad" && evento.shiftKey && es3d) {
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
    };
    nodo.addEventListener("wheel", alRodar, { passive: false });
    return () => nodo.removeEventListener("wheel", alRodar);
  }, [
    aplicarCamara,
    cajaVista,
    preferenciaRueda,
    fijarDetectado,
    diagnosticoRueda,
    vista.tipo,
  ]);

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
      setEjeSeleccionado(null);
      const impacto = rayo.intersectObjects(meshes.current, false)[0];
      onSeleccionar(impacto?.object.userData.globalid ?? null, agregar);
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
      if (!botonMedio && !izquierdo) return;
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
      const paneable = botonMedio || (izquierdo && espacio.current);
      if (paneable) {
        evento.preventDefault();
        nodo.style.cursor = "grabbing";
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
            arrastreEje.current = {
              globalid: asa.globalid,
              etiqueta: asa.etiqueta,
              lado: asa.lado,
              indice: asa.tipo === "codo" ? asa.indice : null,
              candado: asa.tipo === "codo" || candados[asa.lado],
              familia:
                ctx.tipo === "planta"
                  ? eje.vertical
                    ? "vertical"
                    : "horizontal"
                  : "alzado",
              inicio: punto,
              originales: JSON.parse(JSON.stringify(vista.ejes ?? {})),
              movido: false,
            };
            const inicial = JSON.parse(JSON.stringify(vista.ejes ?? {}));
            ajusteEnCursoRef.current = inicial;
            setAjusteEnCurso(inicial);
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
      };
      if (!paneable) setVentanaSeleccion(null);
      if (paneable) nodo.setPointerCapture(evento.pointerId);
    };
    const alMover = (evento: PointerEvent) => {
      const nav = navegacion.current;
      const camera = camara.current;
      if (!nav || !camera) return;
      // O011: movimiento de un extremo, candado o codo de eje.
      const arrEje = arrastreEje.current;
      if (arrEje) {
        const punto = puntoVistaDesdeEvento(evento.clientX, evento.clientY);
        const ctx = contextoEje.current;
        if (!punto || !ctx) return;
        arrEje.movido = true;
        const cambios: Record<string, AjusteEjeVista> = {
          ...(ajusteEnCursoRef.current ?? {}),
        };
        if (arrEje.indice !== null) {
          const actual = normalizarAjusteEje(cambios[arrEje.globalid] ?? arrEje.originales[arrEje.globalid]) ?? {};
          const clave = arrEje.lado === "inicio" ? "codosInicio" : "codosFin";
          const claveExtremo = arrEje.lado === "inicio" ? "extremoInicio" : "extremoFin";
          const codos = [...(actual[clave] ?? [])];
          const anterior = codos[arrEje.indice];
          const delta: Punto2 = anterior
            ? [punto[0] - anterior[0], punto[1] - anterior[1]]
            : [0, 0];
          codos[arrEje.indice] = [punto[0], punto[1]];
          // O011b: al arrastrar un codo, el resto del tramo y el globo lo siguen.
          for (let i = arrEje.indice + 1; i < codos.length; i += 1) {
            codos[i] = [codos[i][0] + delta[0], codos[i][1] + delta[1]];
          }
          const siguiente: AjusteEjeVista = { ...actual, [clave]: codos };
          if (actual[claveExtremo]) {
            siguiente[claveExtremo] = [
              actual[claveExtremo]![0] + delta[0],
              actual[claveExtremo]![1] + delta[1],
            ];
          }
          cambios[arrEje.globalid] = siguiente;
        } else if (arrEje.candado) {
          const actual = cambios[arrEje.globalid] ?? arrEje.originales[arrEje.globalid];
          cambios[arrEje.globalid] = fijarExtremoEje(actual, arrEje.lado, punto) ?? {};
        } else {
          // Candado cerrado: el extremo sigue la alineación común y se mueven todos
          // los ejes de la misma familia.
          const delta: Punto2 = [
            punto[0] - arrEje.inicio[0],
            punto[1] - arrEje.inicio[1],
          ];
          for (const eje of referencias.ejes) {
            const mismaFamilia =
              arrEje.familia === "alzado" ||
              (eje.vertical ? "vertical" : "horizontal") === arrEje.familia;
            if (!mismaFamilia) continue;
            const bases = ctx.bases[eje.globalid];
            if (!bases) continue;
            const original = arrEje.originales[eje.globalid];
            const actual = extremoEje(original, arrEje.lado, bases.inicio, bases.fin);
            const nuevo: Punto2 =
              arrEje.familia === "horizontal"
                ? [actual[0] + delta[0], actual[1]]
                : [actual[0], actual[1] + delta[1]];
            cambios[eje.globalid] = fijarExtremoEje(
              cambios[eje.globalid] ?? original,
              arrEje.lado,
              nuevo,
            ) ?? {};
          }
        }
        ajusteEnCursoRef.current = cambios;
        setAjusteEnCurso(cambios);
        evento.preventDefault();
        return;
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
      if (herramienta && vista.tipo === "planta") {
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
          setVentanaSeleccion({
            x1: arr.inicioX,
            y1: arr.inicioY,
            x2: evento.clientX,
            y2: evento.clientY,
          });
        }
        return;
      }
      const es3d = nav.tipo === "perspectiva" || vista.tipo === "iso";
      const panear = !es3d || evento.shiftKey || arr.boton === 0;
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
      const camera = camara.current;
      if (camera && cotasInteraccion.current.length > 0) {
        const rect = nodo.getBoundingClientRect();
        let mejor: CotaInteractiva | null = null;
        let mejorDistancia = Infinity;
        for (const cota of cotasInteraccion.current) {
          const proyectado = new THREE.Vector3(...cota.punto).project(camera);
          const x = rect.left + ((proyectado.x + 1) / 2) * rect.width;
          const y = rect.top + ((1 - proyectado.y) / 2) * rect.height;
          const medioAncho = Math.max(18, cota.texto.length * 7);
          if (
            Math.abs(evento.clientX - x) <= medioAncho &&
            Math.abs(evento.clientY - y) <= 18
          ) {
            const distancia = Math.hypot(evento.clientX - x, evento.clientY - y);
            if (distancia < mejorDistancia) {
              mejorDistancia = distancia;
              mejor = cota;
            }
          }
        }
        if (mejor) {
          evento.preventDefault();
          if (mejor.tipo === "total") {
            fijarAviso("La cota total es de lectura; edite una cota parcial.");
            return;
          }
          setCotaEditando({
            tipo: mejor.tipo,
            referencia: mejor.referencia,
            mover: mejor.mover,
            nivel: mejor.nivel,
            nombre: mejor.nombre,
            valor: mejor.valor,
            izquierda: Math.max(90, Math.min(rect.width - 90, evento.clientX - rect.left)),
            arriba: Math.max(8, Math.min(rect.height - 90, evento.clientY - rect.top - 70)),
          });
          setTextoCotaEditando(mejor.valor.toFixed(2));
          setErrorCota(null);
          return;
        }
      }
      // O007a: sin herramienta, el doble clic puede abrir «Editar tipo» del muro
      // seleccionado; la decisión final vive en el estado del modelo.
      evento.preventDefault();
      void dobleClicEnPlanta();
    };
    const alMenuContextual = (evento: MouseEvent) => {
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
        setRegistrosRueda(detectorRueda.ultimos());
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
    herramienta,
    fijarRaton,
    clicEnPlanta,
    dobleClicEnPlanta,
    ventanaSeleccion,
    fijarAviso,
    metrosPorPixelActual,
    asaEjeEn,
    lineaEjeEn,
    puntoVistaDesdeEvento,
    candados,
    ejeSeleccionado,
    menuEje,
    fijarAjustesEjes,
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
    // O011: posición en pantalla de un globo o extremo de eje (para las E2E).
    (nodo as unknown as Record<string, unknown>).__openrvtEjeAPantalla = (
      etiqueta: string,
      lado: LadoEje = "fin",
      indiceCodo?: number,
    ) => {
      const camera = camara.current;
      if (!camera) return null;
      const asa = ejesInteraccion.current.find((a) =>
        indiceCodo === undefined
          ? a.etiqueta === etiqueta && a.lado === lado && a.tipo !== "codo"
          : a.etiqueta === etiqueta &&
            a.lado === lado &&
            a.tipo === "codo" &&
            a.indice === indiceCodo,
      );
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
      return { etiquetas, globos, lineas };
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

  return (
    <div
      ref={contenedor}
      data-testid="visor"
      data-vista={vista.id}
      data-tipo={vista.tipo}
      data-mallas={mallas.length}
      data-herramienta={herramienta ?? undefined}
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
            left: Math.min(ventanaSeleccion.x1, ventanaSeleccion.x2),
            top: Math.min(ventanaSeleccion.y1, ventanaSeleccion.y2),
            width: Math.abs(ventanaSeleccion.x2 - ventanaSeleccion.x1),
            height: Math.abs(ventanaSeleccion.y2 - ventanaSeleccion.y1),
          }}
        />
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
            title="Candado del extremo de inicio: abierto se mueve solo"
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
            title="Candado del extremo final: abierto se mueve solo"
            onClick={() => alternarCandadoVista(ejeSeleccionadoDatos.globalid, "fin")}
            className={`rounded border px-1.5 py-0.5 ${
              candados.fin ? "bg-amber-200 text-amber-950" : "hover:bg-muted"
            }`}
          >
            {candados.fin ? "🔓" : "🔒"} Fin
          </button>
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
      {ayudaVisible && (
        <div
          data-testid="ayuda-navegacion"
          className="absolute bottom-3 right-3 z-10 flex max-w-[min(520px,60vw)] items-center gap-2 rounded border bg-background/90 px-2 py-1 text-[11px] text-muted-foreground shadow-sm"
        >
          <span>Rueda: zoom · Botón medio/Espacio+arrastrar: mover · F: ajustar</span>
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
          className="absolute right-2 top-12 z-30 max-h-[60vh] w-[min(680px,92vw)] overflow-auto rounded border bg-background/95 p-2 text-[10px] shadow-lg"
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <strong>Diagnóstico de rueda/touchpad</strong>
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
          <p className="mb-1 text-muted-foreground">
            Últimos 20 eventos «wheel» · detectado: {detectorRueda.ultimoDispositivo() ?? "—"}
          </p>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b">
                <th className="px-1">#</th>
                <th className="px-1">ΔX</th>
                <th className="px-1">ΔY</th>
                <th className="px-1">modo</th>
                <th className="px-1">ctrl</th>
                <th className="px-1">ms</th>
                <th className="px-1">dispositivo</th>
                <th className="px-1">acción</th>
              </tr>
            </thead>
            <tbody>
              {registrosRueda.map((registro, indice) => (
                <tr key={`${registro.ms}-${indice}`} className="border-b border-border/40">
                  <td className="px-1">{indice + 1}</td>
                  <td className="px-1">{registro.deltaX.toFixed(2)}</td>
                  <td className="px-1">{registro.deltaY.toFixed(2)}</td>
                  <td className="px-1">{registro.deltaMode}</td>
                  <td className="px-1">{registro.ctrlKey ? "sí" : "no"}</td>
                  <td className="px-1">{registro.intervaloMs ?? "—"}</td>
                  <td className="px-1">{registro.dispositivo}</td>
                  <td className="px-1">{registro.accion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {cotaEditando && (
        <div
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
