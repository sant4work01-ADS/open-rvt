import * as THREE from "three";
import { type ElementoMalla } from "../../tipos";
import {
  ORDEN_CICLO,
  aliasCiclico,
  candidatosBajoPunto,
  type CandidatoTab,
} from "../../seleccionCiclica";
import { type Punto2 } from "../../herramientas";
import {
  caraEnPunto as caraPlanaEnPunto,
  clasificarCaraEmpujar,
  type ElementoCara,
  type ResultadoCara,
} from "../../empujarCaras";
import {
  inferir,
  type CandidatosInferencia,
  type Inferencia,
  type Vec3,
} from "../../inferencias3d";
import { filtrarPorCercania, unirCandidatos } from "../../candidatos3d";
import {
  bloqueoDeInferencia,
  colorDeGuia,
  etiquetaInferencia,
  redondearVec,
} from "../utilidades";
import type { EntornoVisor } from "./contexto";

export function crearAyudas(entorno: EntornoVisor, nodo: HTMLElement) {
  const {
    aplicarCamara,
    bloqueoFlechas,
    bloqueoShift,
    cacheCandidatos,
    camara,
    empujarZ,
    mallas3d,
    meshes,
    navegacion,
    pantallaDePunto,
    puntosHerramienta,
    setGuiaEmpujar,
    setMarcadorEmpujar,
    ultimaInferenciaEmpujar,
    zEmpujar,
    vista,
    mallas,
    caja,
  } = entorno;
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
      escala =
        (2 * nav.distancia * Math.tan((camera.fov * Math.PI) / 360)) / alto;
    }
    const derecha = new THREE.Vector3().setFromMatrixColumn(
      camera.matrixWorld,
      0,
    );
    const arriba = new THREE.Vector3().setFromMatrixColumn(
      camera.matrixWorld,
      1,
    );
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
  ): {
    inf: Inferencia;
    candidatos: CandidatosInferencia;
    punto: Vec3 | null;
  } | null => {
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
    const cercanas = filtrarPorCercania(
      mallas3d.current,
      proyectarLienzo,
      cursor,
      60,
    );
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
  const candidatosSin = (
    globalid: string,
    clientX: number,
    clientY: number,
  ) => {
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
        if (aliasCiclico(malla) !== "cerramiento" || !malla.estructura?.datos)
          continue;
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
        if (
          Math.hypot(clientX - (a.x + t * dx), clientY - (a.y + t * dy)) <= 10
        ) {
          agregar(malla.globalid);
        }
      }
    }
    return [...encontrados.values()].sort(
      (a, b) => ORDEN_CICLO.indexOf(a.alias) - ORDEN_CICLO.indexOf(b.alias),
    );
  };

  return {
    zoomEnPantalla,
    panearPixeles,
    puntoPlanta,
    rayoPantalla,
    proyectarLienzo,
    anotarInferenciaEmpujar,
    inferenciaEmpujarEn,
    elementoDeMalla,
    caraBajoCursor,
    candidatosSin,
    candidatosEn,
  };
}
