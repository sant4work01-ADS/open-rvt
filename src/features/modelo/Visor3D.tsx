// OPEN-RVT: visor three.js del módulo Modelo. Dibuja mallas en coordenadas de mundo,
// cámaras ortográficas para plantas/alzados/cortes y órbita libre en 3D, con recorte y
// relleno de sección por stencil (técnica del ejemplo webgl_clipping_stencil).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Caja, ElementoMalla, Nivel, Vista } from "./tipos";
import { categoriaVisible } from "./vistas";
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
  modoCorte: boolean;
  puntoCorte: [number, number] | null;
  onSeleccionar: (globalid: string | null) => void;
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
  modoCorte,
  puntoCorte,
  onSeleccionar,
  onPuntoCorte,
  onEscape,
}: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const escena = useRef<THREE.Scene | null>(null);
  const renderer = useRef<THREE.WebGLRenderer | null>(null);
  const camara = useRef<THREE.Camera | null>(null);
  const grupo = useRef<THREE.Group | null>(null);
  const meshes = useRef<THREE.Mesh[]>([]);
  const navegacion = useRef<Navegacion | null>(null);
  const arrastre = useRef<{ x: number; y: number; boton: number; movido: boolean; paneable: boolean } | null>(null);
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
    escenaLocal.add(new THREE.HemisphereLight(0xffffff, 0x6b7280, 1.5));
    const luz = new THREE.DirectionalLight(0xffffff, 1.7);
    luz.position.set(5, -8, 12);
    escenaLocal.add(luz);

    escena.current = escenaLocal;
    renderer.current = rendererLocal;
    grupo.current = grupoLocal;

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

      const seleccionado = elemento.globalid === seleccion;
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
    puntoCorte,
    nivelGlobalidPorNombre,
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
        boton: evento.button,
        movido: false,
        paneable,
      };
      if (paneable) nodo.setPointerCapture(evento.pointerId);
    };
    const alMover = (evento: PointerEvent) => {
      const arr = arrastre.current;
      const nav = navegacion.current;
      const camera = camara.current;
      if (!arr || !nav || !camera || !arr.paneable) return;
      const dx = evento.clientX - arr.x;
      const dy = evento.clientY - arr.y;
      if (Math.abs(dx) + Math.abs(dy) > 1) arr.movido = true;
      arr.x = evento.clientX;
      arr.y = evento.clientY;
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
      nodo.style.cursor = modoCorte ? "crosshair" : "";
      if (!arr || arr.movido) return;
      if (evento.button === 0 && !espacio.current) {
        // Clic limpio: punto del corte o selección de elemento.
        const rect = nodo.getBoundingClientRect();
        const raton = new THREE.Vector2(
          ((evento.clientX - rect.left) / rect.width) * 2 - 1,
          -((evento.clientY - rect.top) / rect.height) * 2 + 1,
        );
        const camera = camara.current;
        if (!camera) return;
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
        onSeleccionar(impacto?.object.userData.globalid ?? null);
      }
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
    window.addEventListener("pointermove", alMover);
    window.addEventListener("pointerup", alSoltar);
    window.addEventListener("keydown", alTecla);
    window.addEventListener("keyup", alSoltarTecla);
    return () => {
      nodo.removeEventListener("pointerdown", alBajar);
      window.removeEventListener("pointermove", alMover);
      window.removeEventListener("pointerup", alSoltar);
      window.removeEventListener("keydown", alTecla);
      window.removeEventListener("keyup", alSoltarTecla);
    };
  }, [aplicarCamara, ajustar, caja, modoCorte, onPuntoCorte, onSeleccionar, onEscape, vista]);

  useEffect(() => {
    const nodo = contenedor.current;
    if (nodo) nodo.style.cursor = modoCorte ? "crosshair" : "";
  }, [modoCorte]);

  return (
    <div
      ref={contenedor}
      data-testid="visor"
      data-vista={vista.id}
      data-tipo={vista.tipo}
      data-mallas={mallas.length}
      className="relative min-h-0 flex-1 overflow-hidden bg-background"
    >
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
    </div>
  );
}
