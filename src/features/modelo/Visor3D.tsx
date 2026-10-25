// OPEN-RVT: visor three.js del módulo Modelo. Dibuja mallas en coordenadas de mundo,
// cámaras ortográficas para plantas/alzados/cortes y órbita libre en 3D, con recorte y
// relleno de sección por stencil (técnica del ejemplo webgl_clipping_stencil).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Caja, ElementoMalla, Nivel, Vista } from "./tipos";
import { categoriaVisible } from "./vistas";
import { useModelo } from "./estado";
import { colocarAbertura, type Punto2 } from "./herramientas";
import {
  ajustarAspecto,
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

function planosVista(vista: Vista, caja: Caja): {
  planos: THREE.Plane[];
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

  // Cámara de la vista activa (solo se reencuadra al cambiar de vista o de modelo).
  useEffect(() => {
    const nodo = contenedor.current;
    if (!nodo || !renderer.current) return;
    const aspecto = Math.max(nodo.clientWidth, 1) / Math.max(nodo.clientHeight, 1);
    const nav = crearNavegacion(vista, caja, aspecto);
    navegacion.current = nav;
    const centro = nav.objetivo;
    if (nav.tipo === "perspectiva") {
      const perspectiva = camaraPerspectiva(caja, { aspecto });
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
      const inicial = camaraOrtografica(caja, direccion, {
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
  }, [vista.id, vista.tipo, vista.orientacion, caja, dimensiones.ancho, dimensiones.alto]);

  const aplicarCamara = useCallback(() => {
    const nav = navegacion.current;
    const camera = camara.current;
    if (!nav || !camera) return;
    camera.up.copy(nav.arriba);
    camera.position.copy(nav.objetivo).addScaledVector(nav.direccion, nav.distancia);
    camera.lookAt(nav.objetivo);
    if (camera instanceof THREE.OrthographicCamera) {
      camera.near = 0.01;
      camera.far = nav.distancia + diagonalCaja(caja) * 3 + 10;
      camera.updateProjectionMatrix();
    } else if (camera instanceof THREE.PerspectiveCamera) {
      camera.far = nav.distancia + diagonalCaja(caja) * 4 + 10;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
  }, [caja]);

  // Vista activa y geometría: filtros de categorías/niveles, recorte y relleno.
  useEffect(() => {
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
    const fondo = colorDeFondo(oscuro);
    const colorArista = new THREE.Color(0x000000);
    const tamano = Math.max(diagonalCaja(caja), 2);
    const nivelesVisibles = new Set(vista.nivelesVisibles);
    const visibles = mallas.filter((malla) => {
      if (!categoriaVisible(vista, malla.categoria)) return false;
      const gid = nivelGlobalidPorNombre.get(malla.nivel);
      if (nivelesVisibles.size > 0 && gid && !nivelesVisibles.has(gid)) return false;
      return true;
    });

    const stencilBase = relleno
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
      const material =
        vista.estilo === "lineas-ocultas"
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
      const malla = new THREE.Mesh(geometria, material);
      malla.userData.globalid = elemento.globalid;
      malla.renderOrder = 0;
      grupoLocal.add(malla);
      meshes.current.push(malla);

      if (vista.estilo !== "sombreado") {
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

    // Relleno de la sección donde el stencil no queda a cero.
    if (relleno && visibles.length > 0) {
      const materialRelleno = new THREE.MeshBasicMaterial({
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
      const tapa = new THREE.Mesh(new THREE.PlaneGeometry(tamano * 2, tamano * 2), materialRelleno);
      const normal = relleno.plano.normal.clone().normalize();
      tapa.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      tapa.position.copy(relleno.origen);
      tapa.renderOrder = 1.1;
      tapa.onAfterRender = (rendererLocal) => rendererLocal.clearStencil();
      grupoLocal.add(tapa);
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
    const escala = Math.max(diagonalCaja(caja), 2);
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
    caja,
  ]);

  // Ajustar la cámara a la vista (botón y Z luego A).
  const ajustar = useCallback(() => {
    const nodo = contenedor.current;
    if (!nodo) return;
    const aspecto = Math.max(nodo.clientWidth, 1) / Math.max(nodo.clientHeight, 1);
    navegacion.current = crearNavegacion(vista, caja, aspecto);
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
      const inicial = crearNavegacion(vista, caja, aspecto);
      const limites = ajustarAspecto(
        camaraOrtografica(caja, [nav.direccion.x, nav.direccion.y, nav.direccion.z]),
        aspecto,
      );
      camera.left = limites.izquierda;
      camera.right = limites.derecha;
      camera.top = limites.arriba;
      camera.bottom = limites.abajo;
      nav.distancia = inicial.distancia;
    }
    aplicarCamara();
  }, [aplicarCamara, caja, vista]);

  // Rueda: zoom hacia el cursor en ortográficas y acercamiento en 3D.
  useEffect(() => {
    const nodo = contenedor.current;
    if (!nodo) return;
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
    };
    nodo.addEventListener("wheel", alRodar, { passive: false });
    return () => nodo.removeEventListener("wheel", alRodar);
  }, [aplicarCamara]);

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
      if (evento.key === "Escape") onEscape();
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
