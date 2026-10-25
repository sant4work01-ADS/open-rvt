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
import type { Abertura, Caja, ElementoMalla, Nivel, Vista } from "./tipos";
import { categoriaVisible, dibujaSiluetaSobreCorte } from "./vistas";
import { useModelo } from "./estado";
import { colocarAbertura, type Punto2 } from "./herramientas";
import {
  categoriaOculta,
  factorEscala,
  grosorMm,
  materialPorCapa,
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
  cajaConEjes,
  camaraOrtografica,
  camaraPerspectiva,
  centroCaja,
  diagonalCaja,
  direccionAlzado,
  vectorIso,
} from "./vistas";

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
    arriba = [0, -1, 0];
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

// Las texturas se reutilizan entre elementos y vistas.
const CACHE_TEXTURAS = new Map<string, THREE.Texture>();

/** O005c: burbuja de eje con su etiqueta, dibujada como sprite para que siempre se lea. */
function burbujaEje(texto: string, color: string, fondo: string): THREE.Sprite | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, 128, 128);
  ctx.beginPath();
  ctx.arc(64, 64, 54, 0, Math.PI * 2);
  ctx.fillStyle = fondo;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = "bold 58px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(texto, 64, 66);
  const textura = new THREE.CanvasTexture(canvas);
  textura.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: textura,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  return new THREE.Sprite(material);
}

/** O005c: cota temporal de la herramienta (p. ej. «4.50 m»). */
function etiquetaCota(
  texto: string,
  color: string,
  fondo: string,
  altoMundo: number,
): THREE.Sprite | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = fondo;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.rect(2, 8, 252, 48);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = "bold 30px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(texto, 128, 33);
  const textura = new THREE.CanvasTexture(canvas);
  textura.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: textura,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(altoMundo * 4, altoMundo, 1);
  return sprite;
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
  const fijarRaton = useModelo((s) => s.fijarRatonHerramienta);
  const clicEnPlanta = useModelo((s) => s.clicEnPlanta);
  const dobleClicEnPlanta = useModelo((s) => s.dobleClicEnPlanta);
  const espacio = useRef(false);
  const ultimaZ = useRef(0);
  const [oscuro, setOscuro] = useState(() =>
    typeof document !== "undefined" ? document.documentElement.classList.contains("dark") : false,
  );
  const [dimensiones, setDimensiones] = useState({ ancho: 1, alto: 1 });

  const nivelGlobalidPorNombre = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const nivel of niveles) mapa.set(nivel.nombre, nivel.globalid);
    return mapa;
  }, [niveles]);

  // O005c: los ejes también encuadran la planta (burbujas incluidas).
  const cajaVista = useMemo(() => cajaConEjes(caja, referencias.ejes), [caja, referencias]);

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
      camera.far = nav.distancia + diagonalCaja(cajaVista) * 4 + 10;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
  }, [cajaVista]);

  // Cámara de la vista activa (solo se reencuadra al cambiar de vista o de modelo).
  useEffect(() => {
    const nodo = contenedor.current;
    if (!nodo || !renderer.current) return;
    const aspecto = Math.max(nodo.clientWidth, 1) / Math.max(nodo.clientHeight, 1);
    const nav = crearNavegacion(vista, cajaVista, aspecto);
    navegacion.current = nav;
    const centro = nav.objetivo;
    if (nav.tipo === "perspectiva") {
      const perspectiva = camaraPerspectiva(cajaVista, { aspecto });
      const camera = new THREE.PerspectiveCamera(50, aspecto, perspectiva.cerca, perspectiva.lejos);
      camara.current = camera;
    } else {
      const direccion: [number, number, number] =
        vista.tipo === "planta"
          ? [0, 0, 1]
          : vista.tipo === "alzado"
            ? direccionAlzado(vista.orientacion ?? "sur")
            : vista.tipo === "corte"
              ? [-normalCorte(vista)[0], -normalCorte(vista)[1], 0]
              : vectorIso();
      const arriba: [number, number, number] =
        vista.tipo === "planta" ? [0, -1, 0] : [0, 0, 1];
      const inicial = camaraOrtografica(cajaVista, direccion, {
        arriba,
        centro: [centro.x, centro.y, centro.z],
      });
      const limites = ajustarAspecto(inicial, aspecto);
      const camera = new THREE.OrthographicCamera(
        limites.izquierda,
        limites.derecha,
        limites.arriba,
        limites.abajo,
        inicial.cerca,
        inicial.lejos,
      );
      camara.current = camera;
    }
    aplicarCamara();
    // `aplicarCamara` es estable por referencia del componente; se usa a través de refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista.id, vista.tipo, vista.orientacion, cajaVista, dimensiones.ancho, dimensiones.alto]);

  // Vista activa y geometría: filtros de categorías/niveles, recorte y relleno.
  useEffect(() => {
    const inicioEfecto = performance.now();
    const grupoLocal = grupo.current;
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
      geometria.computeVertexNormals();

      const seleccionado =
        elemento.globalid === seleccion || seleccionados.includes(elemento.globalid);
      const opaco = elemento.opacidad >= 1;
      const color = seleccionado
        ? new THREE.Color(0x2f7dd1)
        : new THREE.Color(elemento.color);

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
      if (!encimaDelCorte) {
        const malla = new THREE.Mesh(geometria, material);
        malla.userData.globalid = elemento.globalid;
        malla.renderOrder = 0;
        grupoLocal.add(malla);
        meshes.current.push(malla);
      } else {
        material.dispose();
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
          if (mm !== null) {
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
      } else if (vista.estilo !== "sombreado" && !encimaDelCorte) {
        const aristas = new THREE.LineSegments(
          new THREE.EdgesGeometry(geometria, 30),
          new THREE.LineBasicMaterial({
            color: seleccionado ? new THREE.Color(0xff8a00) : colorArista,
            clippingPlanes: planos,
          }),
        );
        aristas.userData.globalid = elemento.globalid;
        aristas.renderOrder = 0.5;
        grupoLocal.add(aristas);
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
              if (mmCorte !== null) {
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
                agregarRelleno(
                  puntos3,
                  materialPorCapa(banda.material),
                  grupoLocal,
                );
              }
              if (capas.length > 1) {
                // Línea fina entre capas: contorno de cada banda con trazo de 0,1 mm.
                for (const banda of bandas) {
                  const mm = 0.1 * factorEscala(vista.escala);
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
                  lineaCerrada([...puntosBanda, puntosBanda[0]], materialBanda, 1.2, grupoLocal);
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
        const altoBurbuja = Math.max(tamano * 0.035, 0.35);
        for (const eje of referencias.ejes) {
          const dx = eje.x2 - eje.x1;
          const dy = eje.y2 - eje.y1;
          const largo = Math.hypot(dx, dy);
          if (largo < 1e-6) continue;
          const ux = dx / largo;
          const uy = dy / largo;
          const radio = altoBurbuja / 2;
          const fin: [number, number, number] = [
            eje.x2 - ux * Math.min(radio, largo * 0.45),
            eje.y2 - uy * Math.min(radio, largo * 0.45),
            zEje,
          ];
          lineaCerrada(
            [[eje.x1, eje.y1, zEje], fin],
            materialEje,
            1.6,
            grupoLocal,
          );
          const burbuja = burbujaEje(
            eje.etiqueta,
            colorEje,
            oscuro ? "#1f2328" : "#ffffff",
          );
          if (burbuja) {
            burbuja.position.set(eje.x2, eje.y2, zEje + 0.01);
            burbuja.scale.set(altoBurbuja, altoBurbuja, 1);
            burbuja.renderOrder = 20;
            grupoLocal.add(burbuja);
          }
        }
      }
    }

    // Datos para las pruebas y las capturas: lo que realmente se está dibujando.
    const nodoVisor = contenedor.current;
    if (nodoVisor) {
      nodoVisor.dataset.ejes = String(referencias.ejes.length);
      nodoVisor.dataset.ejesEtiquetas = referencias.ejes.map((eje) => eje.etiqueta).join(",");
      nodoVisor.dataset.mallasDibujadas = String(visibles.length);
      nodoVisor.dataset.seccionPolilineas = String(polilineasSeccion);
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
    if (puntosHerramienta.length > 0 && ratonHerramienta) {
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
      const r = tamano * 0.75;
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
        cuadricula: [
          new THREE.Vector3(x - r, y, z),
          new THREE.Vector3(x + r, y, z),
          new THREE.Vector3(x, y - r, z),
          new THREE.Vector3(x, y + r, z),
        ],
        perpendicular: [
          new THREE.Vector3(x, y, z),
          new THREE.Vector3(x, y + r, z),
          new THREE.Vector3(x + r * 0.8, y + r * 0.8, z),
          new THREE.Vector3(x - r * 0.8, y + r * 0.8, z),
          new THREE.Vector3(x, y, z),
        ],
      };
      const geometria = new THREE.BufferGeometry().setFromPoints(
        puntosForma[engancheHerramienta.tipo] ?? puntosForma.cuadricula,
      );
      const marcador = new THREE.Line(
        geometria,
        new THREE.LineBasicMaterial({ color: colorSnap, depthTest: false }),
      );
      marcador.renderOrder = 15;
      grupoLocal.add(marcador);
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
  ]);

  // Ajustar la cámara a la vista (botón y Z luego A).
  const ajustar = useCallback(() => {
    const nodo = contenedor.current;
    if (!nodo) return;
    const aspecto = Math.max(nodo.clientWidth, 1) / Math.max(nodo.clientHeight, 1);
    navegacion.current = crearNavegacion(vista, cajaVista, aspecto);
    aplicarCamara();
  }, [aplicarCamara, vista, caja]);

  const restablecerIso = useCallback(() => {
    const nav = navegacion.current;
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
      const factor = Math.pow(1.0018, evento.deltaY);
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
        aplicarCamara();
      } else if (camera instanceof THREE.PerspectiveCamera) {
        nav.distancia = Math.max(0.5, nav.distancia * factor);
        aplicarCamara();
      }
      actualizarGrosores();
    };
    nodo.addEventListener("wheel", alRodar, { passive: false });
    return () => nodo.removeEventListener("wheel", alRodar);
  }, [aplicarCamara, cajaVista]);

  // Paneo, órbita, selección y puntos del corte.
  useEffect(() => {
    const nodo = contenedor.current;
    if (!nodo) return;
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
    const alBajar = (evento: PointerEvent) => {
      const botonMedio = evento.button === 1;
      const izquierdo = evento.button === 0;
      if (!botonMedio && !izquierdo) return;
      const paneable = botonMedio || (izquierdo && espacio.current);
      if (paneable) {
        evento.preventDefault();
        nodo.style.cursor = "grabbing";
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
      if (herramienta && vista.tipo === "planta") {
        const punto = puntoPlanta(evento);
        if (punto) fijarRaton(punto, evento.shiftKey);
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
        const camera = camara.current;
        if (!camera) return;
        if (herramienta && vista.tipo === "planta") {
          const punto = puntoPlanta(evento);
          if (punto) void clicEnPlanta(punto, evento.shiftKey, evento.ctrlKey || evento.metaKey);
          return;
        }
        // Clic limpio: punto del corte o selección de elemento.
        const rect = nodo.getBoundingClientRect();
        const raton = new THREE.Vector2(
          ((evento.clientX - rect.left) / rect.width) * 2 - 1,
          -((evento.clientY - rect.top) / rect.height) * 2 + 1,
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
        const impacto = rayo.intersectObjects(meshes.current, false)[0];
        onSeleccionar(
          impacto?.object.userData.globalid ?? null,
          evento.ctrlKey || evento.metaKey,
        );
      }
    };
    const alDobleClic = (evento: MouseEvent) => {
      if (!herramienta) return;
      evento.preventDefault();
      void dobleClicEnPlanta();
    };
    const alTecla = (evento: KeyboardEvent) => {
      const objetivo = evento.target as HTMLElement | null;
      if (objetivo && ["INPUT", "TEXTAREA", "SELECT"].includes(objetivo.tagName)) return;
      if (evento.code === "Space") {
        espacio.current = true;
        evento.preventDefault();
        return;
      }
      const tecla = evento.key.toLowerCase();
      if (tecla === "z") ultimaZ.current = performance.now();
      if (tecla === "a" && performance.now() - ultimaZ.current < 1200) {
        ultimaZ.current = 0;
        ajustar();
      }
    };
    const alSoltarTecla = (evento: KeyboardEvent) => {
      if (evento.code === "Space") espacio.current = false;
    };
    nodo.addEventListener("pointerdown", alBajar);
    nodo.addEventListener("dblclick", alDobleClic);
    window.addEventListener("pointermove", alMover);
    window.addEventListener("pointerup", alSoltar);
    window.addEventListener("keydown", alTecla);
    window.addEventListener("keyup", alSoltarTecla);
    return () => {
      nodo.removeEventListener("pointerdown", alBajar);
      nodo.removeEventListener("dblclick", alDobleClic);
      window.removeEventListener("pointermove", alMover);
      window.removeEventListener("pointerup", alSoltar);
      window.removeEventListener("keydown", alTecla);
      window.removeEventListener("keyup", alSoltarTecla);
    };
  }, [
    aplicarCamara,
    ajustar,
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
  });

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
          title="Ajustar la vista (Z, A)"
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
          {puntosHerramienta.length > 0 && ratonHerramienta && herramienta !== "losa" && (
            <span data-testid="pista-longitud">
              {Math.hypot(
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
