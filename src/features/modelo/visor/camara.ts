import * as THREE from "three";
import type { Caja, Vista } from "../tipos";
import {
  ajustarAspecto,
  ARRIBA_PLANTA,
  camaraOrtografica,
  camaraPerspectiva,
  centroCaja,
  direccionAlzado,
  vectorIso,
} from "../vistas";

export interface Navegacion {
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
export interface CamaraGuardada {
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
export const camarasPorVista = new Map<string, CamaraGuardada>();
export let claveCamaras = "";
const ARRIBA = new THREE.Vector3(0, 0, 1);

/** Dirección y arriba con los que se encuadra una vista (sin tocar el modelo). */
export function direccionDeVista(vista: Vista): {
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
export function crearCamaraDeVista(
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
export function colorDeFondo(oscuro: boolean): THREE.Color {
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

export function normalCorte(vista: Vista): [number, number] {
  if (vista.direccion) return vista.direccion;
  if (vista.puntoA && vista.puntoB) {
    const dx = vista.puntoB[0] - vista.puntoA[0];
    const dy = vista.puntoB[1] - vista.puntoA[1];
    const largo = Math.hypot(dx, dy) || 1;
    return [-dy / largo, dx / largo];
  }
  return [0, 1];
}

export function centroCorte(vista: Vista, caja: Caja): THREE.Vector3 {
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
export function crearNavegacion(vista: Vista, caja: Caja, aspecto: number): Navegacion {
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
export function planosVista(vista: Vista, caja: Caja): {  planos: THREE.Plane[];
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
