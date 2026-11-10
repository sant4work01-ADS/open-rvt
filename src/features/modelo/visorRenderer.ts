import * as THREE from "three";

/**
 * Crea y prepara el renderer WebGL del visor 3D.
 *
 * O062: con la piel de muro de 0.015 m las aristas del bolsillo interno quedan
 * a 15 mm de la cara exterior; el buffer de profundidad logarítmico mantiene la
 * precisión suficiente de cerca y de lejos para que el LineBasicMaterial no las
 * dibuje a través de la cara.
 */
export function crearRendererVisor(
  nodo: HTMLElement,
  fondo: THREE.Color,
): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    stencil: true,
    preserveDrawingBuffer: true,
    logarithmicDepthBuffer: true,
  });
  renderer.localClippingEnabled = true;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(fondo, 1);
  nodo.appendChild(renderer.domElement);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.dataset.testid = "visor-canvas";
  return renderer;
}
