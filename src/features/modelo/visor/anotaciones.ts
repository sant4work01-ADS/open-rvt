import * as THREE from "three";
import { Text, configureTextBuilder } from "troika-three-text";
import { baseTextoAnotacion } from "../anotacion";
import { altoTextoBurbuja, desplazamientoCentrado } from "../centrado";

// O011: la anotación se dibuja con vectores (anillo y texto SDF), no con sprites de
// mapa de bits. Así el globo y los números siguen nítidos con cualquier zoom.
// El tiposet se hace en el hilo principal: el WebView de Tauri no permite workers
// creados desde un blob con la CSP de la aplicación.
configureTextBuilder({ useWorker: false });
export const FUENTE_ANOTACION = "/fonts/DejaVuSans-Bold.ttf";

export function orientarAnotacion(grupo: THREE.Object3D, haciaCamara: [number, number, number]): void {
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

export function crearTextoAnotacion(
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
export function anchoTextoAprox(texto: string, altoMundo: number): number {
  return Math.max(0.1, texto.length * altoMundo * 0.62);
}

/**
 * O011: globo de eje vectorial: relleno circular, anillo de 64 segmentos y texto SDF.
 * Se construye con diámetro 1 para que el llamador lo escale a 8 mm de papel.
 */
export function burbujaEje(
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
export function etiquetaCota(
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
export function textoCota(
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
export let TEXTURA_ASA: THREE.CanvasTexture | null = null;
export function texturaAsa(): THREE.CanvasTexture | null {
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

export function crearAsaPunto(color: string): THREE.Points {
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
