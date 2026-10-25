#!/usr/bin/env node
/**
 * Motor B de la evaluación O001b: web-ifc (WASM), edición.
 *
 * Uso:
 *   node evaluacion/b_editar.mjs
 *   node evaluacion/b_editar.mjs --medir archivo.ifc --json salida.json
 *
 * El guion crea un IFC4 desde cero con web-ifc (sin API de alto nivel), lo
 * edita, lo guarda y lo vuelve a abrir con IfcOpenShell para medir los muros.
 * Escribe:
 *   resultados/edicion_b.ifc
 *   resultados/edicion_b.json
 */

import {
  IfcAPI,
  IFC4,
  Handle,
} from "web-ifc";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.dirname(AQUI);
const SALIDA = path.join(RAIZ, "resultados");
const PYTHON = process.env.OPENRVT_PYTHON || path.join(os.homedir(), ".venvs/openrvt/bin/python");
const E = IFC4;
const H = (id) => new Handle(id);
const lbl = (v) => (v === null || v === undefined ? null : new E.IfcLabel(v));
const txt = (v) => (v === null || v === undefined ? null : new E.IfcText(v));

const MURO_SUR = 0;
const MURO_ESTE = 1;
const MURO_NORTE = 2;
const MURO_OESTE = 3;

// --------------------------------------------------------------------------
// Construcción del modelo con entidades IFC escritas a mano
// --------------------------------------------------------------------------

class Modelo {
  constructor(api, mid) {
    this.api = api;
    this.mid = mid;
    this.siguiente = 1;
    this.guias = new Map();
  }

  put(objeto) {
    objeto.expressID = this.siguiente++;
    this.api.WriteLine(this.mid, objeto);
    return objeto.expressID;
  }

  guid() {
    return new E.IfcGloballyUniqueId(this.api.CreateIFCGloballyUniqueId(this.mid).value);
  }

  punto(x, y, z = 0) {
    return this.put(new E.IfcCartesianPoint([x, y, z]));
  }

  direccion(x, y, z = 0) {
    return this.put(new E.IfcDirection([x, y, z]));
  }

  punto2d(x, y) {
    return this.put(new E.IfcCartesianPoint([x, y]));
  }

  direccion2d(x, y) {
    return this.put(new E.IfcDirection([x, y]));
  }

  eje3d(x = 0, y = 0, z = 0, ejeX = [1, 0, 0]) {
    const loc = this.punto(x, y, z);
    const zdir = this.direccion(0, 0, 1);
    const xdir = this.direccion(...ejeX);
    return this.put(new E.IfcAxis2Placement3D(H(loc), H(zdir), H(xdir)));
  }

  eje2d(x, y, ejeX = [1, 0]) {
    const loc = this.punto2d(x, y);
    const xdir = this.direccion2d(...ejeX);
    return this.put(new E.IfcAxis2Placement2D(H(loc), H(xdir)));
  }

  perfilRectangulo(ancho, alto, centroX, centroY) {
    const pos = this.eje2d(centroX, centroY);
    return this.put(new E.IfcRectangleProfileDef(E.IfcProfileTypeEnum.AREA, null, H(pos), ancho, alto));
  }

  extruir(perfil, altura) {
    const pos = this.eje3d();
    const dir = this.direccion(0, 0, 1);
    return this.put(new E.IfcExtrudedAreaSolid(H(perfil), H(pos), H(dir), altura));
  }

  representacionCuerpo(item) {
    return this.put(new E.IfcShapeRepresentation(H(this.bodyCtx), lbl("Body"), lbl("SweptSolid"), [H(item)]));
  }

  representacionEje(largo) {
    const puntos = this.put(new E.IfcCartesianPointList2D([[0, 0], [largo, 0]]));
    const curva = this.put(new E.IfcIndexedPolyCurve(H(puntos), null, new E.IfcBoolean(false)));
    return this.put(new E.IfcShapeRepresentation(H(this.axisCtx), lbl("Axis"), lbl("Curve2D"), [H(curva)]));
  }

  producto(repCuerpo, repEje = null, placement = null) {
    const reps = [H(repCuerpo)];
    if (repEje !== null) reps.push(H(repEje));
    return this.put(new E.IfcProductDefinitionShape(null, null, reps));
  }

  placement(x, y, z, ejeX = [1, 0, 0], relativo = null) {
    const eje = this.eje3d(x, y, z, ejeX);
    return this.put(new E.IfcLocalPlacement(relativo === null ? null : H(relativo), H(eje)));
  }
}

async function crearModelo() {
  const api = new IfcAPI();
  await api.Init();
  const mid = api.CreateModel({
    schema: "IFC4",
    name: "O001b edicion B",
    description: ["Edicion O001b con web-ifc"],
    authors: ["OPEN-RVT"],
    organizations: ["OPEN-RVT"],
    authorization: "CC0-1.0",
  });
  const m = new Modelo(api, mid);

  // Proyecto y unidades métricas (metro, metro², metro³).
  const proyecto = m.put(
    new E.IfcProject(m.guid(), null, lbl("Edición O001b"), txt("Modelo creado por el motor B"), null, null, null, null, null),
  );
  const uLargo = m.put(new E.IfcSIUnit(E.IfcUnitEnum.LENGTHUNIT, null, E.IfcSIUnitName.METRE));
  const uArea = m.put(new E.IfcSIUnit(E.IfcUnitEnum.AREAUNIT, null, E.IfcSIUnitName.SQUARE_METRE));
  const uVolumen = m.put(new E.IfcSIUnit(E.IfcUnitEnum.VOLUMEUNIT, null, E.IfcSIUnitName.CUBIC_METRE));
  const unidades = m.put(new E.IfcUnitAssignment([H(uLargo), H(uArea), H(uVolumen)]));
  const p = api.GetLine(mid, proyecto);
  p.UnitsInContext = H(unidades);
  api.WriteLine(mid, p);

  // Contextos de representación.
  const origen = m.punto(0, 0, 0);
  const zdir = m.direccion(0, 0, 1);
  const xdir = m.direccion(1, 0, 0);
  const mundo = m.put(new E.IfcAxis2Placement3D(H(origen), H(zdir), H(xdir)));
  m.modelCtx = m.put(
    new E.IfcGeometricRepresentationContext(
      null,
      lbl("Model"),
      new E.IfcDimensionCount(3),
      1e-5,
      H(mundo),
      null,
    ),
  );
  m.bodyCtx = m.put(
    new E.IfcGeometricRepresentationSubContext(
      lbl("Body"),
      lbl("Model"),
      H(m.modelCtx),
      null,
      E.IfcGeometricProjectionEnum.MODEL_VIEW,
      null,
    ),
  );
  m.planCtx = m.put(
    new E.IfcGeometricRepresentationContext(
      lbl("Plan"),
      lbl("Plan"),
      new E.IfcDimensionCount(2),
      1e-5,
      H(mundo),
      null,
    ),
  );
  m.axisCtx = m.put(
    new E.IfcGeometricRepresentationSubContext(
      lbl("Axis"),
      lbl("Plan"),
      H(m.planCtx),
      null,
      E.IfcGeometricProjectionEnum.GRAPH_VIEW,
      null,
    ),
  );

  // Árbol espacial.
  const sitio = m.put(
    new E.IfcSite(m.guid(), null, lbl("Sitio"), null, null, null, null, null, null, null, null, null, null, null),
  );
  const edificio = m.put(
    new E.IfcBuilding(m.guid(), null, lbl("Edificio"), null, null, null, null, null, null, null, null, null),
  );
  const nivel1 = m.put(
    new E.IfcBuildingStorey(m.guid(), null, lbl("Nivel 1"), null, null, null, null, null, null, 0.0),
  );
  const nivel2 = m.put(
    new E.IfcBuildingStorey(m.guid(), null, lbl("Nivel 2"), null, null, null, null, null, null, 3.0),
  );
  m.put(new E.IfcRelAggregates(m.guid(), null, null, null, H(proyecto), [H(sitio)]));
  m.put(new E.IfcRelAggregates(m.guid(), null, null, null, H(sitio), [H(edificio)]));
  m.put(new E.IfcRelAggregates(m.guid(), null, null, null, H(edificio), [H(nivel1), H(nivel2)]));

  // Tipo de muro «Block 15» y su capa de material de 0.15 m.
  const tipo = m.put(
    new E.IfcWallType(
      m.guid(),
      null,
      lbl("Block 15"),
      null,
      null,
      null,
      null,
      null,
      null,
      E.IfcWallTypeEnum.STANDARD,
    ),
  );
  const material = m.put(new E.IfcMaterial(lbl("Bloque"), null, lbl("masonry")));
  const capa = m.put(
    new E.IfcMaterialLayer(H(material), 0.15, null, lbl("Bloque"), null, null, null),
  );
  const conjuntoCapas = m.put(new E.IfcMaterialLayerSet([H(capa)], lbl("Block 15"), null));
  m.put(
    new E.IfcRelAssociatesMaterial(m.guid(), null, null, null, [H(tipo)], H(conjuntoCapas)),
  );
  const usoCapas = m.put(
    new E.IfcMaterialLayerSetUsage(
      H(conjuntoCapas),
      E.IfcLayerSetDirectionEnum.AXIS2,
      E.IfcDirectionSenseEnum.POSITIVE,
      0.0,
      null,
    ),
  );

  // Cuatro muros de 0.15 × 3.00 m sobre ejes 8 × 6.
  // Los ejes van de esquina a esquina (uniones a eje): cada muro conserva su
  // largo nominal y se solapa con los perpendiculares en las esquinas.
  const muros = [
    { nombre: "Muro Sur", p1: [0, 0], p2: [8, 0] },
    { nombre: "Muro Este", p1: [8, 0], p2: [8, 6] },
    { nombre: "Muro Norte", p1: [8, 6], p2: [0, 6] },
    { nombre: "Muro Oeste", p1: [0, 6], p2: [0, 0] },
  ];
  const idsMuros = [];
  const idsPlacement = [];
  const idsPerfil = [];
  const idsEje = [];
  for (const datos of muros) {
    const [x1, y1] = datos.p1;
    const [x2, y2] = datos.p2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const largo = Math.hypot(dx, dy);
    const ux = dx / largo;
    const uy = dy / largo;
    const placement = m.placement(x1, y1, 0.0, [ux, uy, 0.0]);
    const perfil = m.perfilRectangulo(largo, 0.15, largo / 2, 0.075);
    const cuerpo = m.extruir(perfil, 3.0);
    const repCuerpo = m.representacionCuerpo(cuerpo);
    const repEje = m.representacionEje(largo);
    const pds = m.producto(repCuerpo, repEje);
    const muro = m.put(
      new E.IfcWall(m.guid(), null, lbl(datos.nombre), null, null, H(placement), H(pds), null, null),
    );
    idsMuros.push(muro);
    idsPlacement.push(placement);
    idsPerfil.push(perfil);
    idsEje.push(repEje);
  }
  m.put(new E.IfcRelDefinesByType(m.guid(), null, null, null, idsMuros.map(H), H(tipo)));
  m.put(new E.IfcRelAssociatesMaterial(m.guid(), null, null, null, idsMuros.map(H), H(usoCapas)));
  m.put(
    new E.IfcRelContainedInSpatialStructure(m.guid(), null, null, null, idsMuros.map(H), H(nivel1)),
  );

  // Losa de 0.12 m sobre el nivel 1, con el contorno exterior de los muros.
  const perfilLosa = m.perfilRectangulo(8, 6, 4, 3);
  const cuerpoLosa = m.extruir(perfilLosa, 0.12);
  const repLosa = m.representacionCuerpo(cuerpoLosa);
  const pdsLosa = m.producto(repLosa);
  // Losa de piso del nivel 2: cara superior en 3.00 m (sobre el nivel 1).
  const placementLosa = m.placement(0, 0, 3.0 - 0.12);
  const losa = m.put(
    new E.IfcSlab(m.guid(), null, lbl("Losa"), null, null, H(placementLosa), H(pdsLosa), null, E.IfcSlabTypeEnum.FLOOR),
  );
  m.put(
    new E.IfcRelContainedInSpatialStructure(m.guid(), null, null, null, [H(losa)], H(nivel2)),
  );

  // Vano de 0.90 × 2.10 m en el muro sur y puerta que lo rellena.
  const perfilVano = m.perfilRectangulo(0.90, 0.40, 0.45, 0.20);
  const cuerpoVano = m.extruir(perfilVano, 2.10);
  const repVano = m.representacionCuerpo(cuerpoVano);
  const pdsVano = m.producto(repVano);
  const placementVano = m.placement(4.05, -0.125, 0.0);
  const vano = m.put(
    new E.IfcOpeningElement(
      m.guid(),
      null,
      lbl("Vano Puerta"),
      null,
      null,
      H(placementVano),
      H(pdsVano),
      null,
      E.IfcOpeningElementTypeEnum.OPENING,
    ),
  );
  m.put(
    new E.IfcRelVoidsElement(m.guid(), null, null, null, H(idsMuros[MURO_SUR]), H(vano)),
  );

  const perfilPuerta = m.perfilRectangulo(0.90, 0.05, 0.45, 0.025);
  const cuerpoPuerta = m.extruir(perfilPuerta, 2.10);
  const repPuerta = m.representacionCuerpo(cuerpoPuerta);
  const pdsPuerta = m.producto(repPuerta);
  const placementPuerta = m.placement(4.05, 0.05, 0.0);
  const puerta = m.put(
    new E.IfcDoor(
      m.guid(),
      null,
      lbl("Puerta"),
      null,
      null,
      H(placementPuerta),
      H(pdsPuerta),
      null,
      2.10,
      0.90,
      E.IfcDoorTypeEnum.DOOR,
      E.IfcDoorTypeOperationEnum.SINGLE_SWING_LEFT,
      null,
    ),
  );
  m.put(new E.IfcRelFillsElement(m.guid(), null, null, null, H(vano), H(puerta)));
  m.put(
    new E.IfcRelContainedInSpatialStructure(m.guid(), null, null, null, [H(vano), H(puerta)], H(nivel1)),
  );

  return {
    api,
    mid,
    m,
    ids: {
      proyecto,
      tipo,
      capa,
      conjuntoCapas,
      nivel1,
      nivel2,
      muros: idsMuros,
      placementMuros: idsPlacement,
      perfiles: idsPerfil,
      ejes: idsEje,
      perfilLosa: perfilLosa,
      losa,
      vano,
      puerta,
    },
  };
}

// --------------------------------------------------------------------------
// Edición
// --------------------------------------------------------------------------

function leer(api, mid, id) {
  return api.GetLine(mid, id);
}

function escribir(api, mid, linea) {
  api.WriteLine(mid, linea);
}

function moverMuro(api, mid, placementId, x, y, ejeX) {
  const placement = leer(api, mid, placementId);
  const eje = leer(api, mid, placement.RelativePlacement.value);
  const punto = leer(api, mid, eje.Location.value);
  punto.Coordinates = [x, y, 0];
  escribir(api, mid, punto);
  if (ejeX) {
    const dir = leer(api, mid, eje.RefDirection.value);
    dir.DirectionRatios = [ejeX[0], ejeX[1], 0];
    escribir(api, mid, dir);
  }
  escribir(api, mid, eje);
  escribir(api, mid, placement);
}

function estirarMuro(api, mid, perfilId, ejeId, largo, grosor) {
  const perfil = leer(api, mid, perfilId);
  perfil.XDim = largo;
  perfil.YDim = grosor;
  const pos = leer(api, mid, perfil.Position.value);
  const punto = leer(api, mid, pos.Location.value);
  punto.Coordinates = [largo / 2, grosor / 2];
  escribir(api, mid, punto);
  escribir(api, mid, pos);
  escribir(api, mid, perfil);
  const rep = leer(api, mid, ejeId);
  const curva = leer(api, mid, rep.Items[0].value);
  const lista = leer(api, mid, curva.Points.value);
  lista.CoordList = [[0, 0], [largo, 0]];
  escribir(api, mid, lista);
  escribir(api, mid, curva);
  escribir(api, mid, rep);
}

function aplicarGrosor(api, mid, ids) {
  // Primero se cambia el tipo; el grosor se vuelve a leer de la capa del tipo
  // y con ese valor se regeneran los cuatro perfiles (paso manual en web-ifc).
  const capa = leer(api, mid, ids.capa);
  capa.LayerThickness = 0.20;
  escribir(api, mid, capa);
  const grosor = Number(capa.LayerThickness.value ?? capa.LayerThickness);
  for (let i = 0; i < 4; i++) {
    const perfil = leer(api, mid, ids.perfiles[i]);
    perfil.YDim = grosor;
    const pos = leer(api, mid, perfil.Position.value);
    const punto = leer(api, mid, pos.Location.value);
    punto.Coordinates = [(perfil.XDim.value ?? perfil.XDim) / 2, grosor / 2];
    escribir(api, mid, punto);
    escribir(api, mid, pos);
    escribir(api, mid, perfil);
  }
}

function estirarLosa(api, mid, perfilId, largo) {
  const perfil = leer(api, mid, perfilId);
  perfil.XDim = largo;
  const pos = leer(api, mid, perfil.Position.value);
  const punto = leer(api, mid, pos.Location.value);
  punto.Coordinates = [largo / 2, 3];
  escribir(api, mid, punto);
  escribir(api, mid, pos);
  escribir(api, mid, perfil);
}

function comprobarGrosor(api, mid, ids, grosor) {
  const valores = ids.perfiles.map((id) => {
    const p = leer(api, mid, id);
    return Number(p.YDim.value ?? p.YDim);
  });
  const capa = leer(api, mid, ids.capa);
  return {
    capa: Number(capa.LayerThickness.value ?? capa.LayerThickness),
    perfiles: valores,
    ok: valores.every((v) => Math.abs(v - grosor) < 1e-9) && Math.abs(Number(capa.LayerThickness.value ?? capa.LayerThickness) - grosor) < 1e-9,
  };
}

// --------------------------------------------------------------------------
// Medición con web-ifc (para reabrir el IFC propio)
// --------------------------------------------------------------------------

function volumenMalla(verts, idx) {
  let total = 0;
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    const ax = verts[a * 3], ay = verts[a * 3 + 1], az = verts[a * 3 + 2];
    const bx = verts[b * 3], by = verts[b * 3 + 1], bz = verts[b * 3 + 2];
    const cx = verts[c * 3], cy = verts[c * 3 + 1], cz = verts[c * 3 + 2];
    total += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return Math.abs(total) / 6;
}

async function medirConWebIfc(ruta) {
  const api = new IfcAPI();
  await api.Init();
  const mid = api.OpenModel(fs.readFileSync(ruta));
  const mallas = new Map();
  api.StreamAllMeshes(mid, (mesh) => {
    const gs = mesh.geometries;
    let destino = mallas.get(mesh.expressID);
    if (!destino) {
      destino = { verts: [], idx: [] };
      mallas.set(mesh.expressID, destino);
    }
    for (let i = 0; i < gs.size(); i++) {
      const pg = gs.get(i);
      const geo = api.GetGeometry(mid, pg.geometryExpressID);
      const idx = api.GetIndexArray(geo.GetIndexData(), geo.GetIndexDataSize());
      if (!idx.length) continue;
      const verts = api.GetVertexArray(geo.GetVertexData(), geo.GetVertexDataSize());
      let maxIdx = 0;
      for (let k = 0; k < idx.length; k++) if (idx[k] > maxIdx) maxIdx = idx[k];
      const nVert = maxIdx + 1;
      const stride = Math.floor(verts.length / nVert);
      if (stride < 3) continue;
      const tr = pg.flatTransformation;
      const base = destino.verts.length / 3;
      for (let k = 0; k < nVert; k++) {
        const x = verts[k * stride], y = verts[k * stride + 1], z = verts[k * stride + 2];
        const xw = tr[0] * x + tr[4] * y + tr[8] * z + tr[12];
        const yw = tr[1] * x + tr[5] * y + tr[9] * z + tr[13];
        const zw = tr[2] * x + tr[6] * y + tr[10] * z + tr[14];
        destino.verts.push(xw, -zw, yw);
      }
      for (let k = 0; k < idx.length; k++) destino.idx.push(idx[k] + base);
    }
  });
  const muros = [];
  for (const id of api.GetLineIDsWithType(mid, api.GetTypeCodeFromName("IFCWALL"))) {
    const linea = api.GetLine(mid, id);
    const malla = mallas.get(id);
    muros.push({
      globalid: linea.GlobalId?.value ?? String(linea.GlobalId),
      nombre: linea.Name?.value ?? String(linea.Name ?? ""),
      volumen_malla: malla && malla.idx.length ? volumenMalla(malla.verts, malla.idx) : null,
    });
  }
  api.CloseModel(mid);
  return { motor: "b", muros };
}

// --------------------------------------------------------------------------
// Orquestación
// --------------------------------------------------------------------------

function correrPython(argumentos) {
  const r = spawnSync(PYTHON, [path.join(AQUI, "a_editar.py"), ...argumentos], {
    encoding: "utf8",
  });
  if (r.status !== 0) {
    throw new Error(`IfcOpenShell falló (${r.status}): ${r.stderr || r.stdout}`);
  }
  return JSON.parse(fs.readFileSync(argumentos[argumentos.indexOf("--json") + 1], "utf8"));
}

function medirConIfcOpenShell(ruta, tmp) {
  const json = path.join(tmp, "medido_a.json");
  return correrPython(["--medir", ruta, "--json", json]);
}

function validarConIfcOpenShell(ruta, tmp) {
  const json = path.join(tmp, "validado_a.json");
  return correrPython(["--validar", ruta, "--json", json]);
}

async function principal() {
  const args = process.argv.slice(2);
  if (args[0] === "--medir") {
    const ruta = args[1];
    const destino = args[args.indexOf("--json") + 1];
    const datos = await medirConWebIfc(ruta);
    fs.writeFileSync(destino, JSON.stringify(datos), "utf8");
    console.log(JSON.stringify(datos));
    return;
  }

  const tiempos = {};
  let t0 = performance.now();
  const { api, mid, ids } = await crearModelo();
  tiempos.crear_modelo_s = (performance.now() - t0) / 1000;

  // Edición 1: el muro este se desplaza 1 m al este y el sur y el norte lo
  // siguen (rectángulo 9 × 6). Las uniones son a eje.
  t0 = performance.now();
  moverMuro(api, mid, ids.placementMuros[MURO_ESTE], 9, 0, [0, 1, 0]);
  moverMuro(api, mid, ids.placementMuros[MURO_NORTE], 9, 6, [-1, 0, 0]);
  estirarMuro(api, mid, ids.perfiles[MURO_SUR], ids.ejes[MURO_SUR], 9, 0.15);
  estirarMuro(api, mid, ids.perfiles[MURO_NORTE], ids.ejes[MURO_NORTE], 9, 0.15);
  estirarLosa(api, mid, ids.perfilLosa, 9);
  tiempos.editar_muro_s = (performance.now() - t0) / 1000;

  // Edición 2: espesor del tipo «Block 15» a 0.20 m y regeneración manual de
  // los cuatro perfiles (web-ifc no propaga el cambio por sí solo).
  t0 = performance.now();
  aplicarGrosor(api, mid, ids);
  tiempos.cambiar_tipo_s = (performance.now() - t0) / 1000;
  const propagacion = comprobarGrosor(api, mid, ids, 0.20);

  t0 = performance.now();
  const datos = api.SaveModel(mid);
  fs.mkdirSync(SALIDA, { recursive: true });
  const rutaIfc = path.join(SALIDA, "edicion_b.ifc");
  fs.writeFileSync(rutaIfc, datos);
  tiempos.guardar_s = (performance.now() - t0) / 1000;

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "o001b_b_"));
  try {
    t0 = performance.now();
    const propio = await medirConWebIfc(rutaIfc);
    tiempos.medir_propio_s = (performance.now() - t0) / 1000;

    t0 = performance.now();
    const otro = medirConIfcOpenShell(rutaIfc, tmp);
    tiempos.medir_otro_s = (performance.now() - t0) / 1000;

    t0 = performance.now();
    const validacion = validarConIfcOpenShell(rutaIfc, tmp);
    tiempos.validar_s = (performance.now() - t0) / 1000;

    const resultado = {
      motor: "b",
      ifc: path.relative(RAIZ, rutaIfc),
      esquema: "IFC4",
      operaciones_s: tiempos,
      total_s: Object.values(tiempos).reduce((a, b) => a + b, 0),
      propagacion_tipo: propagacion,
      medido_propio: propio,
      medido_por_a: otro,
      validacion,
    };
    fs.writeFileSync(path.join(SALIDA, "edicion_b.json"), JSON.stringify(resultado, null, 2), "utf8");
    const { medido_propio, medido_por_a, ...resumen } = resultado;
    console.log(JSON.stringify(resumen, null, 2));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
