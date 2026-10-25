#!/usr/bin/env node
/**
 * Motor B de la evaluación O001: web-ifc (WASM).
 *
 * Uso:
 *   node evaluacion/b_webifc.mjs muestras/AC20-FZK-Haus.ifc
 *
 * Corre el pipeline 3 veces en procesos hijos y reporta la mediana. Escribe:
 *   resultados/<muestra>_b.csv    columnas pedidas por la especificación
 *   resultados/<muestra>_b.json   métricas + filas con datos extra
 */

import { IfcAPI, IFCRELDEFINESBYPROPERTIES, IFCRELCONTAINEDINSPATIALSTRUCTURE, IFCRELFILLSELEMENT, IFCPROJECT } from "web-ifc";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.dirname(AQUI);
const TOL = 1e-5;

const SUBTIPOS = {
  IfcWall: "IfcWall",
  IfcWallStandardCase: "IfcWall",
  IfcWallElementedCase: "IfcWall",
  IfcSlab: "IfcSlab",
  IfcSlabStandardCase: "IfcSlab",
  IfcSlabElementedCase: "IfcSlab",
  IfcColumn: "IfcColumn",
  IfcColumnStandardCase: "IfcColumn",
  IfcBeam: "IfcBeam",
  IfcBeamStandardCase: "IfcBeam",
  IfcDoor: "IfcDoor",
  IfcDoorStandardCase: "IfcDoor",
  IfcWindow: "IfcWindow",
  IfcWindowStandardCase: "IfcWindow",
  IfcRoof: "IfcRoof",
  IfcStair: "IfcStair",
};

const COLUMNAS = [
  "globalid",
  "clase",
  "nombre",
  "nivel",
  "volumen_malla",
  "area_planta",
  "qto_volumen",
  "qto_area",
  "largo",
  "alto",
  "cerrada",
];

const PREFIJOS = {
  EXA: 1e18,
  PETA: 1e15,
  TERA: 1e12,
  GIGA: 1e9,
  MEGA: 1e6,
  KILO: 1e3,
  HECTO: 1e2,
  DECA: 1e1,
  DECI: 1e-1,
  CENTI: 1e-2,
  MILLI: 1e-3,
  MICRO: 1e-6,
  NANO: 1e-9,
};

const VOL_NET = new Set(["netvolume", "netto-volumen", "netto volumen", "net volume", "neto volumen", "volumen neto"]);
const VOL_GROSS = new Set(["grossvolume", "bruttovolumen", "gross volume", "volumen bruto"]);
const VOL_GENERIC = new Set(["volume", "volumen"]);
const VOL_PROHIBIDO = ["offnung", "oeffnung", "öffnung", "opening", "konditional", "conditional", "kern", "core", "ummantelung", "casing", "loch", "hueco"];
const AREA_PROHIBIDO = [
  ...VOL_PROHIBIDO,
  "side", "seite", "lateral", "surface", "oberflaeche", "oberflächenbereich",
  "unterseite", "oberseite", "kante", "edge", "perimeter", "umfang",
];

const valor = (x) => (x && typeof x === "object" && "value" in x ? x.value : x);
const num = (x) => {
  const v = valor(x);
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function norm(texto) {
  let t = String(texto ?? "").toLowerCase().trim();
  t = t.replaceAll("ä", "ae").replaceAll("ö", "oe").replaceAll("ü", "ue").replaceAll("ß", "ss");
  t = t.replaceAll("á", "a").replaceAll("é", "e").replaceAll("í", "i").replaceAll("ó", "o").replaceAll("ú", "u");
  return t.split(/\s+/).filter(Boolean).join(" ");
}

function mejorVolumen(candidatos) {
  let mejor = null;
  let puntMejor = -1;
  for (const [nombre, val] of candidatos) {
    if (val === null) continue;
    const n = norm(nombre);
    if (VOL_PROHIBIDO.some((p) => n.includes(p))) continue;
    let punt;
    if (VOL_NET.has(n)) punt = 100;
    else if (VOL_GROSS.has(n)) punt = 90;
    else if (VOL_GENERIC.has(n)) punt = 70;
    else if (n.includes("net") && (n.includes("volume") || n.includes("volumen"))) punt = 65;
    else if ((n.includes("gross") || n.includes("brutto")) && (n.includes("volume") || n.includes("volumen"))) punt = 60;
    else if (n.includes("volume") || n.includes("volumen")) punt = 50;
    else continue;
    if (punt > puntMejor) {
      puntMejor = punt;
      mejor = val;
    }
  }
  return mejor;
}

function mejorArea(candidatos, clase) {
  let mejor = null;
  let puntMejor = -1;
  for (const [nombre, val] of candidatos) {
    if (val === null) continue;
    const n = norm(nombre);
    if (AREA_PROHIBIDO.some((p) => n.includes(p))) continue;
    let punt;
    if (["netfootprintarea", "net footprint area", "area neta en planta"].includes(n)) punt = 100;
    else if (["grossfootprintarea", "gross footprint area", "area bruta en planta"].includes(n)) punt = 95;
    else if (["footprintarea", "area en planta"].includes(n)) punt = 90;
    else if (clase === "IfcSlab" && ["netarea", "net area"].includes(n)) punt = 85;
    else if (clase === "IfcSlab" && ["grossarea", "gross area"].includes(n)) punt = 80;
    else if (clase === "IfcSlab" && ["area", "flaeche"].includes(n)) punt = 75;
    else if (clase === "IfcColumn" && ["flaeche"].includes(n)) punt = 85;
    else continue;
    if (punt > puntMejor) {
      puntMejor = punt;
      mejor = val;
    }
  }
  return mejor;
}

// --- geometría (réplica exacta de evaluacion/geometria.py) -----------------

function triangulos(verts, idx, stride) {
  const n = Math.floor(verts.length / stride);
  const salida = [];
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    if (a >= n || b >= n || c >= n) continue;
    salida.push(
      [verts[a * stride], verts[a * stride + 1], verts[a * stride + 2]],
      [verts[b * stride], verts[b * stride + 1], verts[b * stride + 2]],
      [verts[c * stride], verts[c * stride + 1], verts[c * stride + 2]],
    );
  }
  return salida;
}

function volumenMalla(verts, idx, stride) {
  let total = 0;
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    const ax = verts[a * stride], ay = verts[a * stride + 1], az = verts[a * stride + 2];
    const bx = verts[b * stride], by = verts[b * stride + 1], bz = verts[b * stride + 2];
    const cx = verts[c * stride], cy = verts[c * stride + 1], cz = verts[c * stride + 2];
    total += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return Math.abs(total) / 6;
}

function areaPlanta(verts, idx, stride, resolucion = 512, minCeldas = 16, maxCeldas = 4_000_000) {
  const tris = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    const ax = verts[a * stride], ay = verts[a * stride + 1];
    const bx = verts[b * stride], by = verts[b * stride + 1];
    const cx = verts[c * stride], cy = verts[c * stride + 1];
    const area2 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area2) < 1e-14) continue;
    tris.push([ax, ay, bx, by, cx, cy]);
    x0 = Math.min(x0, ax, bx, cx); x1 = Math.max(x1, ax, bx, cx);
    y0 = Math.min(y0, ay, by, cy); y1 = Math.max(y1, ay, by, cy);
  }
  if (!tris.length) return 0;
  const dx = x1 - x0, dy = y1 - y0, mayor = Math.max(dx, dy);
  if (mayor <= 0) return 0;
  let celda = mayor / resolucion;
  let nx, ny;
  while (true) {
    nx = Math.max(1, Math.ceil(dx / celda));
    ny = Math.max(1, Math.ceil(dy / celda));
    if (Math.min(nx, ny) >= minCeldas || nx * ny >= maxCeldas) break;
    celda /= 2;
  }
  nx = Math.max(1, Math.min(nx, maxCeldas));
  ny = Math.max(1, Math.min(ny, maxCeldas));
  const ocupado = new Uint8Array(nx * ny);
  for (const [ax, ay, bx, by, cx, cy] of tris) {
    const miny = Math.min(ay, by, cy), maxy = Math.max(ay, by, cy);
    const j0 = Math.max(0, Math.floor((miny - y0) / celda));
    const j1 = Math.min(ny - 1, Math.floor((maxy - y0) / celda));
    const lados = [[ax, ay, bx, by], [bx, by, cx, cy], [cx, cy, ax, ay]];
    for (let j = j0; j <= j1; j++) {
      const py = y0 + (j + 0.5) * celda;
      const xs = [];
      for (const [px, py0, qx, qy0] of lados) {
        if ((py0 <= py && py <= qy0) || (qy0 <= py && py <= py0)) {
          if (Math.abs(qy0 - py0) < 1e-15) {
            xs.push(px, qx);
          } else {
            xs.push(px + ((py - py0) * (qx - px)) / (qy0 - py0));
          }
        }
      }
      if (xs.length < 2) continue;
      const xmin = Math.min(...xs), xmax = Math.max(...xs);
      const i0 = Math.max(0, Math.ceil((xmin - x0) / celda - 0.5 - 1e-12));
      const i1 = Math.min(nx - 1, Math.floor((xmax - x0) / celda - 0.5 + 1e-12));
      if (i1 >= i0) ocupado.fill(1, j * nx + i0, j * nx + i1 + 1);
    }
  }
  let cuenta = 0;
  for (let i = 0; i < ocupado.length; i++) cuenta += ocupado[i];
  return cuenta * celda * celda;
}

const claveVertice = (x, y, z) =>
  `${Math.round(x / TOL)},${Math.round(y / TOL)},${Math.round(z / TOL)}`;

function estadoMalla(verts, idx, stride) {
  const mapa = new Map();
  const caras = [];
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    const ka = claveVertice(verts[a * stride], verts[a * stride + 1], verts[a * stride + 2]);
    const kb = claveVertice(verts[b * stride], verts[b * stride + 1], verts[b * stride + 2]);
    const kc = claveVertice(verts[c * stride], verts[c * stride + 1], verts[c * stride + 2]);
    if (ka === kb || kb === kc || ka === kc) continue;
    for (const k of [ka, kb, kc]) if (!mapa.has(k)) mapa.set(k, mapa.size);
    caras.push([mapa.get(ka), mapa.get(kb), mapa.get(kc)]);
  }
  if (!caras.length) return [false, false];
  const aristas = new Map();
  for (const [a, b, c] of caras) {
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const k = u < v ? `${u},${v}` : `${v},${u}`;
      aristas.set(k, (aristas.get(k) || 0) + 1);
    }
  }
  let cerrada = true, manifold = true, hay = false;
  for (const n of aristas.values()) {
    hay = true;
    if (!(n >= 2 && n % 2 === 0)) cerrada = false;
    if (n !== 2) manifold = false;
  }
  return hay ? [cerrada, manifold] : [false, false];
}

function ejesHorizontales(verts, idx, stride) {
  let cx = 0, cy = 0, n = 0;
  const pts = [];
  for (let i = 0; i + 2 < idx.length; i += 3) {
    for (const k of [idx[i], idx[i + 1], idx[i + 2]]) {
      const x = verts[k * stride], y = verts[k * stride + 1];
      pts.push(x, y);
      cx += x; cy += y; n++;
    }
  }
  if (!n) return [[0, 0], [1, 0]];
  cx /= n; cy /= n;
  let sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i] - cx, y = pts[i + 1] - cy;
    sxx += x * x; syy += y * y; sxy += x * y;
  }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return [[cx, cy], [Math.cos(ang), Math.sin(ang)]];
}

function dimensiones(verts, idx, stride) {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  const vistos = new Set();
  for (let i = 0; i + 2 < idx.length; i += 3) {
    for (const k of [idx[i], idx[i + 1], idx[i + 2]]) {
      if (vistos.has(k)) continue;
      vistos.add(k);
      const x = verts[k * stride], y = verts[k * stride + 1], z = verts[k * stride + 2];
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
  }
  if (!vistos.size) return { largo: 0, alto: 0, dx: 0, dy: 0, dz: 0 };
  const [[cx, cy], eje] = ejesHorizontales(verts, idx, stride);
  let pmin = Infinity, pmax = -Infinity;
  for (const k of vistos) {
    const p = (verts[k * stride] - cx) * eje[0] + (verts[k * stride + 1] - cy) * eje[1];
    pmin = Math.min(pmin, p); pmax = Math.max(pmax, p);
  }
  return { largo: pmax - pmin, alto: z1 - z0, dx: x1 - x0, dy: y1 - y0, dz: z1 - z0 };
}

function areaLateral(verts, idx, stride) {
  const [, eje] = ejesHorizontales(verts, idx, stride);
  let total = 0;
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    const ax = verts[a * stride], ay = verts[a * stride + 1], az = verts[a * stride + 2];
    const bx = verts[b * stride], by = verts[b * stride + 1], bz = verts[b * stride + 2];
    const cx = verts[c * stride], cy = verts[c * stride + 1], cz = verts[c * stride + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const wx = cx - ax, wy = cy - ay, wz = cz - az;
    const nx = uy * wz - uz * wy;
    const ny = uz * wx - ux * wz;
    const nz = ux * wy - uy * wx;
    const norma = Math.hypot(nx, ny, nz);
    if (norma < 1e-12) continue;
    if (Math.abs(nz) / norma < 0.5 && Math.abs(nx * eje[0] + ny * eje[1]) / norma < 0.5) total += 0.5 * norma;
  }
  // Promedio por cara (las dos caras grandes), comparable con NetSideArea.
  return total / 2;
}

// --- lectura del modelo -----------------------------------------------------

function factoresUnidad(api, modelID) {
  let largo = null, area = null, volumen = null;
  const proyectos = api.GetLineIDsWithType(modelID, IFCPROJECT);
  if (proyectos.size() > 0) {
    const proj = api.GetLine(modelID, proyectos.get(0));
    if (proj.UnitsInContext) {
      const ua = api.GetLine(modelID, valor(proj.UnitsInContext));
      for (const u of ua.Units) {
        const unidad = api.GetLine(modelID, valor(u));
        const tipo = api.GetNameFromTypeCode(unidad.type);
        if (tipo === "IfcSIUnit") {
          const f = PREFIJOS[valor(unidad.Prefix)] || 1;
          const ut = valor(unidad.UnitType);
          if (ut === "LENGTHUNIT") largo = f;
          else if (ut === "AREAUNIT") area = f * f;
          else if (ut === "VOLUMEUNIT") volumen = f * f * f;
        }
      }
    }
  }
  largo = largo || 1;
  area = area || largo * largo;
  volumen = volumen || largo ** 3;
  return { length: largo, area, volume: volumen };
}

function construirObjetivos(api, modelID) {
  const objetivos = new Map(); // expressID -> clase real
  const tipos = api.GetAllTypesOfModel(modelID);
  for (const { typeID, typeName } of tipos) {
    if (!SUBTIPOS[typeName]) continue;
    const ids = api.GetLineIDsWithType(modelID, typeID);
    for (let i = 0; i < ids.size(); i++) objetivos.set(ids.get(i), typeName);
  }
  return objetivos;
}

function construirNiveles(api, modelID) {
  const niveles = new Map();
  const rels = api.GetLineIDsWithType(modelID, IFCRELCONTAINEDINSPATIALSTRUCTURE);
  for (let i = 0; i < rels.size(); i++) {
    const r = api.GetLine(modelID, rels.get(i));
    const nivel = api.GetLine(modelID, valor(r.RelatingStructure));
    const nombre = valor(nivel.Name) || "";
    for (const e of r.RelatedElements) niveles.set(valor(e), nombre);
  }
  const rell = api.GetLineIDsWithType(modelID, IFCRELFILLSELEMENT);
  for (let i = 0; i < rell.size(); i++) {
    const r = api.GetLine(modelID, rell.get(i));
    const hueco = valor(r.RelatingOpeningElement);
    const elemento = valor(r.RelatedBuildingElement);
    if (niveles.has(hueco)) niveles.set(elemento, niveles.get(hueco));
  }
  return niveles;
}

function construirCantidades(api, modelID, objetivos, factores) {
  const vols = new Map();
  const areas = new Map();
  const rels = api.GetLineIDsWithType(modelID, IFCRELDEFINESBYPROPERTIES);
  for (let i = 0; i < rels.size(); i++) {
    const r = api.GetLine(modelID, rels.get(i));
    if (!r.RelatingPropertyDefinition) continue;
    const pd = api.GetLine(modelID, valor(r.RelatingPropertyDefinition));
    if (api.GetNameFromTypeCode(pd.type) !== "IfcElementQuantity") continue;
    const quants = pd.Quantities || [];
    for (const o of r.RelatedObjects || []) {
      const id = valor(o);
      if (!objetivos.has(id)) continue;
      const clase = SUBTIPOS[objetivos.get(id)] || objetivos.get(id);
      if (!vols.has(id)) vols.set(id, []);
      if (!areas.has(id)) areas.set(id, []);
      for (const qh of quants) {
        const q = api.GetLine(modelID, valor(qh));
        const tipo = api.GetNameFromTypeCode(q.type);
        const nombre = valor(q.Name) || "";
        if (tipo === "IfcQuantityVolume") {
          const v = num(q.VolumeValue);
          vols.get(id).push([nombre, v === null ? null : v * factores.volume]);
        } else if (tipo === "IfcQuantityArea") {
          const v = num(q.AreaValue);
          areas.get(id).push([nombre, v === null ? null : v * factores.area]);
        }
      }
    }
  }
  const salida = new Map();
  for (const id of objetivos.keys()) {
    const clase = SUBTIPOS[objetivos.get(id)] || objetivos.get(id);
    salida.set(id, {
      volumen: mejorVolumen(vols.get(id) || []),
      area: mejorArea(areas.get(id) || [], clase),
    });
  }
  return salida;
}

function picoRssMb() {
  try {
    const txt = fs.readFileSync("/proc/self/status", "utf8");
    const m = txt.match(/VmHWM:\s+(\d+)\s+kB/);
    if (m) return Number(m[1]) / 1024;
  } catch {
    // fuera de Linux
  }
  return process.memoryUsage().rss / (1024 * 1024);
}

async function medirUna(ruta) {
  const api = new IfcAPI();
  await api.Init();
  const datos = fs.readFileSync(ruta);

  let t0 = performance.now();
  const modelID = api.OpenModel(datos);
  const apertura = (performance.now() - t0) / 1000;

  const objetivos = construirObjetivos(api, modelID);
  const mallas = new Map(); // id -> {verts:[], idx:[]}
  let triangulos = 0;
  let formas = 0;

  t0 = performance.now();
  api.StreamAllMeshes(modelID, (mesh) => {
    formas++;
    const id = mesh.expressID;
    const esObjetivo = objetivos.has(id);
    const gs = mesh.geometries;
    for (let i = 0; i < gs.size(); i++) {
      const pg = gs.get(i);
      const geo = api.GetGeometry(modelID, pg.geometryExpressID);
      const vptr = geo.GetVertexData();
      const vsize = geo.GetVertexDataSize();
      const iptr = geo.GetIndexData();
      const isize = geo.GetIndexDataSize();
      if (isize <= 0) continue;
      const idx = api.GetIndexArray(iptr, isize);
      triangulos += idx.length / 3;
      if (!esObjetivo) continue;
      const verts = api.GetVertexArray(vptr, vsize);
      if (!verts.length) continue;
      let maxIdx = 0;
      for (let k = 0; k < idx.length; k++) if (idx[k] > maxIdx) maxIdx = idx[k];
      const nVert = maxIdx + 1;
      const stride = Math.floor(verts.length / nVert);
      if (stride < 3) continue;
      const tr = pg.flatTransformation;
      let destino = mallas.get(id);
      if (!destino) {
        destino = { verts: [], idx: [] };
        mallas.set(id, destino);
      }
      const base = destino.verts.length / 3;
      for (let k = 0; k < nVert; k++) {
        const x = verts[k * stride], y = verts[k * stride + 1], z = verts[k * stride + 2];
        // web-ifc entrega el mundo en Y-arriba (x, z, -y). Se devuelve a las
        // coordenadas IFC Z-arriba para medir igual que IfcOpenShell.
        const xw = tr[0] * x + tr[4] * y + tr[8] * z + tr[12];
        const yw = tr[1] * x + tr[5] * y + tr[9] * z + tr[13];
        const zw = tr[2] * x + tr[6] * y + tr[10] * z + tr[14];
        destino.verts.push(xw, -zw, yw);
      }
      for (let k = 0; k < idx.length; k++) destino.idx.push(idx[k] + base);
    }
  });
  const teselado = (performance.now() - t0) / 1000;

  t0 = performance.now();
  const factores = factoresUnidad(api, modelID);
  const niveles = construirNiveles(api, modelID);
  const cantidades = construirCantidades(api, modelID, objetivos, factores);

  const filas = [];
  let sinMalla = 0;
  let abiertas = 0;
  const ids = [...objetivos.keys()].sort((a, b) => {
    const ca = objetivos.get(a), cb = objetivos.get(b);
    return ca < cb ? -1 : ca > cb ? 1 : a - b;
  });
  for (const id of ids) {
    const line = api.GetLine(modelID, id);
    const clase = objetivos.get(id);
    const fila = {
      globalid: valor(line.GlobalId) || "",
      clase,
      nombre: valor(line.Name) || "",
      nivel: niveles.get(id) || "",
      volumen_malla: null,
      area_planta: null,
      qto_volumen: cantidades.get(id)?.volumen ?? null,
      qto_area: cantidades.get(id)?.area ?? null,
      largo: null,
      alto: null,
      cerrada: false,
      manifold: false,
      area_lateral: null,
      sin_malla: true,
    };
    const m = mallas.get(id);
    if (m && m.idx.length) {
      const stride = 3;
      fila.sin_malla = false;
      fila.volumen_malla = volumenMalla(m.verts, m.idx, stride);
      fila.area_planta = areaPlanta(m.verts, m.idx, stride);
      [fila.cerrada, fila.manifold] = estadoMalla(m.verts, m.idx, stride);
      const dim = dimensiones(m.verts, m.idx, stride);
      fila.largo = dim.largo;
      fila.alto = dim.alto;
      if (SUBTIPOS[clase] === "IfcWall") fila.area_lateral = areaLateral(m.verts, m.idx, stride);
      if (!fila.cerrada) abiertas++;
    } else {
      sinMalla++;
    }
    filas.push(fila);
  }
  const extraccion = (performance.now() - t0) / 1000;
  const esquema = String(api.GetModelSchema(modelID));
  api.CloseModel(modelID);

  return {
    muestra: path.basename(ruta, path.extname(ruta)),
    motor: "b",
    esquema,
    apertura_s: apertura,
    teselado_s: teselado,
    extraccion_s: extraccion,
    total_s: apertura + teselado + extraccion,
    triangulos,
    formas,
    pico_rss_mb: picoRssMb(),
    n_objetivo: objetivos.size,
    n_sin_malla: sinMalla,
    n_abiertas: abiertas,
    filas,
  };
}

function escribirCsv(ruta, filas) {
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  const esc = (v) => {
    if (v === null || v === undefined) return "";
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "number") return v.toFixed(9);
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const lineas = [COLUMNAS.join(",")];
  for (const f of filas) lineas.push(COLUMNAS.map((c) => esc(f[c])).join(","));
  fs.writeFileSync(ruta, lineas.join("\n") + "\n", "utf8");
}

function mediana(valores) {
  const s = [...valores].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--una-corrida")) {
    const ifc = args[0];
    const destino = args[args.indexOf("--json-temporal") + 1];
    const datos = await medirUna(ifc);
    fs.writeFileSync(destino, JSON.stringify(datos));
    const { filas, ...resumen } = datos;
    console.log(JSON.stringify(resumen));
    return;
  }

  const ifc = args[0];
  if (!ifc) {
    console.error("uso: node b_webifc.mjs <archivo.ifc> [--salida resultados] [--repeticiones 3]");
    process.exit(2);
  }
  const iSalida = args.indexOf("--salida");
  const salida = iSalida >= 0 ? args[iSalida + 1] : path.join(RAIZ, "resultados");
  const iRep = args.indexOf("--repeticiones");
  const repeticiones = iRep >= 0 ? Number(args[iRep + 1]) : 3;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "o001b_"));
  const corridas = [];
  try {
    for (let i = 0; i < repeticiones; i++) {
      const destino = path.join(tmp, `corrida_${i}.json`);
      const r = spawnSync(
        process.execPath,
        [fileURLToPath(import.meta.url), ifc, "--una-corrida", "--json-temporal", destino],
        { stdio: "ignore" },
      );
      if (r.status !== 0) throw new Error(`corrida ${i} falló con código ${r.status}`);
      corridas.push(JSON.parse(fs.readFileSync(destino, "utf8")));
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  const med = (k) => mediana(corridas.map((c) => c[k]));
  const ordenadas = [...corridas].sort((a, b) => a.total_s - b.total_s);
  const rep = ordenadas[Math.floor(ordenadas.length / 2)];
  const resumen = {
    muestra: rep.muestra,
    motor: "b",
    esquema: rep.esquema,
    repeticiones,
    apertura_s: med("apertura_s"),
    teselado_s: med("teselado_s"),
    extraccion_s: med("extraccion_s"),
    total_s: med("total_s"),
    triangulos: Math.round(med("triangulos")),
    formas: Math.round(med("formas")),
    pico_rss_mb: med("pico_rss_mb"),
    n_objetivo: rep.n_objetivo,
    n_sin_malla: rep.n_sin_malla,
    n_abiertas: rep.n_abiertas,
    filas: rep.filas,
    corridas: corridas.map((c) => ({
      apertura_s: c.apertura_s,
      teselado_s: c.teselado_s,
      extraccion_s: c.extraccion_s,
      total_s: c.total_s,
      pico_rss_mb: c.pico_rss_mb,
    })),
  };
  fs.mkdirSync(salida, { recursive: true });
  escribirCsv(path.join(salida, `${rep.muestra}_b.csv`), rep.filas);
  fs.writeFileSync(path.join(salida, `${rep.muestra}_b.json`), JSON.stringify(resumen), "utf8");
  const { filas, corridas: _, ...resto } = resumen;
  console.log(JSON.stringify(resto));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
