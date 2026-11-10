import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import type { ElementoMalla, Vista } from "../tipos";
import {
  mmAPx,
  PATRONES_LINEA_DASH,
  type Estilos,
  type MaterialNombre,
  type PatronLinea,
  type PatronRelleno,
} from "../estilos";

export interface EntradaGrosor {
  material: LineMaterial;
  mm: number;
  escala: Vista["escala"];
}

export interface OpcionesLinea {
  mm: number;
  escala: Vista["escala"];
  color: string;
  patron?: PatronLinea;
  profundidad?: boolean;
  registro?: EntradaGrosor[];
  mundoPorPx: number;
}

/** Crea un LineMaterial con grosor en mm de papel, patrón y registro para el zoom. */
export function crearMaterialLinea(opciones: OpcionesLinea): LineMaterial {
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
export function lineaCerrada(
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
export function esquinasRectangulo(
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
export function rayadoRectangulo(
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

export const CACHE_TEXTURAS = new Map<string, THREE.Texture>();
export function texturaPatron(
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

export function geometriaProyeccionLosa(
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
export function materialProyeccionTenue(): THREE.MeshBasicMaterial {
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
export function materialRelleno(
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
