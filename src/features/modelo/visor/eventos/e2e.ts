import * as THREE from "three";
import { filtrarPorCercania, unirCandidatos } from "../../candidatos3d";
import type { EntornoVisor } from "./contexto";
import type { crearAyudas } from "./ayudas";

export function instalarUtilidadesE2E(
  entorno: EntornoVisor,
  nodo: HTMLElement,
  ayudas: ReturnType<typeof crearAyudas>,
) {
  const {
    cacheCandidatos,
    camara,
    mallas3d,
    meshes,
    ultimaInferenciaEmpujar,
    mallas,
  } = entorno;
  const { zoomEnPantalla, proyectarLienzo, candidatosEn } = ayudas;
  // O049: último punto inferido para las pruebas E2E.
  (nodo as unknown as Record<string, unknown>).__openrvtEmpujarInferencia =
    () => ultimaInferenciaEmpujar.current;
  // O049: diagnóstico de candidatos de Empujar/Tirar para las pruebas E2E.
  (nodo as unknown as Record<string, unknown>).__openrvtEmpujarCandidatos = (
    clientX: number,
    clientY: number,
  ) => {
    const cercanas = filtrarPorCercania(
      mallas3d.current,
      proyectarLienzo,
      { x: clientX, y: clientY },
      60,
    );
    const candidatos = unirCandidatos(
      cercanas.map((m) => cacheCandidatos.current.obtener(m.malla, mallas)),
    );
    return {
      mallas: mallas3d.current.length,
      cercanas: cercanas.map((m) => m.globalid),
      vertices: candidatos.vertices?.length ?? 0,
      aristas: candidatos.aristas?.length ?? 0,
      caras: candidatos.caras?.length ?? 0,
    };
  };
  // Utilidad de las pruebas E2E: candidatos de Tab bajo un punto de la pantalla.
  (nodo as unknown as Record<string, unknown>).__openrvtCandidatosTab = (
    clientX: number,
    clientY: number,
  ) => candidatosEn(clientX, clientY);
  // Utilidad de las pruebas E2E: GlobalId de la primera malla bajo un píxel.
  (nodo as unknown as Record<string, unknown>).__openrvtImpactoEn = (
    clientX: number,
    clientY: number,
  ) => {
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
    return impacto?.object.userData.globalid ?? null;
  };
  (nodo as unknown as Record<string, unknown>).__openrvtZoomEn = (
    factor: number,
    clientX: number,
    clientY: number,
  ) => {
    zoomEnPantalla(factor, clientX, clientY);
  };
}
