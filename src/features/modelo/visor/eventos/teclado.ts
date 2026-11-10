import { useModelo } from "../../estado";
import { siguienteCandidato, textoPistaTab } from "../../seleccionCiclica";
import type { EntornoVisor } from "./contexto";
import type { crearAyudas } from "./ayudas";

export function crearAccionesTeclado(
  entorno: EntornoVisor,
  nodo: HTMLElement,
  ayudas: ReturnType<typeof crearAyudas>,
) {
  const {
    ajusteEnCursoRef,
    arrastreEje,
    arrastreLosa,
    arrastreNivel,
    bloqueoFlechas,
    bloqueoShift,
    ejeSeleccionado,
    espacio,
    fijarPistaTab,
    herramienta,
    menuEje,
    resaltadoRef,
    setAjusteEnCurso,
    setAjustesNivelEnCurso,
    setDiagnosticoRueda,
    setEjeSeleccionado,
    setGuiaArrastre,
    setMenuEje,
    setPreviewLosaPx,
    setResaltado,
    soltarLosaCancelado,
    ultimaZ,
    ultimoPuntero,
    ajustar,
    zoomEnCentro,
    onSeleccionar,
  } = entorno;
  const { candidatosEn } = ayudas;
  const alTecla = (evento: KeyboardEvent) => {
    const objetivo = evento.target as HTMLElement | null;
    if (objetivo && ["INPUT", "TEXTAREA", "SELECT"].includes(objetivo.tagName))
      return;
    // O027: Escape cancela el arrastre y devuelve todo a como estaba.
    if (
      evento.key === "Escape" &&
      (arrastreEje.current || arrastreNivel.current || arrastreLosa.current)
    ) {
      if (arrastreLosa.current) soltarLosaCancelado.current = true;
      arrastreEje.current = null;
      arrastreNivel.current = null;
      arrastreLosa.current = null;
      ajusteEnCursoRef.current = null;
      setAjusteEnCurso(null);
      setAjustesNivelEnCurso({});
      setPreviewLosaPx(null);
      setGuiaArrastre(null);
      evento.preventDefault();
      // El atajo global de App (mismo `window`) deseleccionaría la losa con Esc:
      // hay que cortar también los demás oyentes del mismo nodo.
      evento.stopImmediatePropagation();
      return;
    }
    if (evento.key === "Escape" && (menuEje || ejeSeleccionado)) {
      setMenuEje(null);
      setEjeSeleccionado(null);
      evento.preventDefault();
      return;
    }
    // O049: flechas fijan el eje de la inferencia mientras dura el trazo.
    if (herramienta === "empujar") {
      const ejes: Record<string, "x" | "y" | "z"> = {
        ArrowRight: "x",
        ArrowLeft: "y",
        ArrowUp: "z",
      };
      const eje = ejes[evento.key];
      if (eje) {
        evento.preventDefault();
        evento.stopPropagation();
        const actual = bloqueoFlechas.current;
        bloqueoFlechas.current =
          actual?.tipo === "eje" && actual.eje === eje
            ? null
            : { tipo: "eje", eje };
        nodo.dataset.bloqueoEmpujar =
          bloqueoFlechas.current?.tipo === "eje"
            ? bloqueoFlechas.current.eje
            : "";
        return;
      }
    }
    // O041: Tab recorre muro → cerramiento → castillo → muro bajo el cursor.
    if (
      evento.key === "Tab" &&
      !evento.ctrlKey &&
      !evento.metaKey &&
      !evento.altKey
    ) {
      const posicion = ultimoPuntero.current;
      if (!posicion) return;
      const candidatos = candidatosEn(posicion.x, posicion.y);
      const siguiente = siguienteCandidato(
        candidatos,
        useModelo.getState().seleccion,
      );
      if (!siguiente) return;
      evento.preventDefault();
      evento.stopPropagation();
      resaltadoRef.current = siguiente.globalid;
      setResaltado(siguiente.globalid);
      fijarPistaTab(textoPistaTab(siguiente));
      onSeleccionar(siguiente.globalid);
      return;
    }
    // O050: Espacio cierra la losa en curso (mínimo tres vértices).
    if (evento.code === "Space" && herramienta === "losa") {
      const estadoLosa = useModelo.getState();
      if (estadoLosa.puntosHerramienta.length > 0) {
        evento.preventDefault();
        evento.stopPropagation();
        void estadoLosa.dobleClicEnPlanta();
        return;
      }
    }
    if (evento.code === "Space") {
      espacio.current = true;
      evento.preventDefault();
      return;
    }
    const tecla = evento.key.toLowerCase();
    // O006e: diagnóstico de la rueda y el touchpad.
    if (evento.ctrlKey && evento.shiftKey && tecla === "d") {
      evento.preventDefault();
      setDiagnosticoRueda((visible) => !visible);
      return;
    }
    if (evento.ctrlKey || evento.metaKey || evento.altKey) return;
    // O006d: + y − acercan y alejan; F ajusta la vista.
    if (tecla === "+" || tecla === "=") {
      evento.preventDefault();
      zoomEnCentro(0.8);
      return;
    }
    if (tecla === "-" || tecla === "_") {
      evento.preventDefault();
      zoomEnCentro(1.25);
      return;
    }
    if (tecla === "f") {
      evento.preventDefault();
      ajustar();
      return;
    }
    if (tecla === "z") ultimaZ.current = performance.now();
    if (tecla === "a" && performance.now() - ultimaZ.current < 1200) {
      ultimaZ.current = 0;
      ajustar();
    }
  };
  const alSoltarTecla = (evento: KeyboardEvent) => {
    if (evento.code === "Space") espacio.current = false;
    if (evento.key === "Shift" && herramienta === "empujar") {
      bloqueoShift.current = null;
    }
  };
  return { alTecla, alSoltarTecla };
}
