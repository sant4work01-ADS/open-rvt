/* eslint-disable react-hooks/immutability -- los refs del visor son mutables por diseño. */
import { useEffect } from "react";

import {} from "./visor/anotaciones";
import { useEstadoVisor } from "./visor/useEstadoVisor";
import { usePunteroVisor } from "./visor/usePunteroVisor";
import { useAnotacionesVisor } from "./visor/useAnotacionesVisor";
import { useHerramientaVisor } from "./visor/useHerramientaVisor";
import { useControlesVisor } from "./visor/useControlesVisor";
import { useRuedaVisor } from "./visor/useRuedaVisor";
import { useOverlaysVisor } from "./visor/useOverlaysVisor";
import { useGuiasVisor } from "./visor/useGuiasVisor";
import { type CtxEscena } from "./visor/escena/contexto";
import { construirBaseEscena } from "./visor/escena/base";
import { construirMurosPlanta } from "./visor/escena/murosPlanta";
import { construirEstructuraPlanta } from "./visor/escena/estructuraPlanta";
import { construirEjesPlanta } from "./visor/escena/ejesPlanta";
import { construirCotasPlanta } from "./visor/escena/cotasPlanta";
import { construirNivelesAlzado } from "./visor/escena/nivelesAlzado";
import { construirAsasYDatasets } from "./visor/escena/asasYDatasets";
import { crearEstadoGesto, type EntornoVisor } from "./visor/eventos/contexto";
import { crearAyudas } from "./visor/eventos/ayudas";
import { crearAccionesClic } from "./visor/eventos/clic";
import { crearAlBajar } from "./visor/eventos/arrastreBajar";
import { crearAlMover } from "./visor/eventos/arrastreMover";
import { crearAccionesSoltar } from "./visor/eventos/soltar";
import { crearAccionesTeclado } from "./visor/eventos/teclado";
import { instalarUtilidadesE2E } from "./visor/eventos/e2e";
import { OverlaysEdicion } from "./visor/OverlaysEdicion";
import { OverlaysPaneles } from "./visor/OverlaysPaneles";
import { type Props } from "./visor/tipos";

/** Distancia de un punto a un segmento (para saber si un cerramiento tiene muro debajo). */

export function Visor3D({
  vista,
  vistas,
  niveles,
  mallas,
  estilos,
  aberturas,
  caja,
  seleccion,
  seleccionados,
  modoCorte,
  puntoCorte,
  onSeleccionar,
  onSeleccionarVarios,
  onPuntoCorte,
  onEscape,
  onCambiarAnotacion,
  claveModelo = "",
  elementosOcultos = [],
  elementosBloqueados = [],
}: Props) {
  const c1 = useEstadoVisor({
    vista,
    vistas,
    niveles,
    mallas,
    estilos,
    aberturas,
    caja,
    seleccion,
    seleccionados,
    modoCorte,
    puntoCorte,
    onSeleccionar,
    onSeleccionarVarios,
    onPuntoCorte,
    onEscape,
    onCambiarAnotacion,
    claveModelo,
    elementosOcultos,
    elementosBloqueados,
  });
  const c2 = usePunteroVisor(c1);

  // Vista activa y geometría: filtros de categorías/niveles, recorte y relleno.
  const {
    ajusteEnCurso,

    ajustesNivelEnCurso,

    aplicarAlinear,
    aplicarCamara,

    asaEjeEn,
    asaLosaEn,
    asaNivelEn,

    cajaVista,

    candados,

    clicEmpujar,
    clicEnPlanta,
    clicNivel,
    clicRecorte,
    confirmarEmpujar,
    confirmarEmpujarCara,
    contenedor,

    dimensiones,

    dobleClicEnPlanta,

    ejeSeleccionado,

    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- solo se usa en un tipo

    elegirReferenciaAlinear,

    empujarCara,

    empujarRect,
    empujarZ,
    engancheHerramienta,

    fijarAjustesEjes,
    fijarAjustesNiveles,
    fijarAlturaEmpujar,
    fijarAviso,

    fijarNivelSeleccionado,
    fijarPistaTab,
    fijarRaton,

    grupo,

    herramienta,
    iniciarEmpujarCara,

    lineaEjeEn,
    lineaNivelEn,
    longitudTecleada,

    menuEje,
    meshes,
    metrosPorPixelActual,
    modoOrbitar,
    moverEmpujar,
    moverEmpujarCara,

    nivelGlobalidPorNombre,
    nivelSeleccionado,

    oscuro,

    pantallaDePunto,

    propiedades,
    puntoVistaDeMundo,
    puntoVistaDesdeEvento,
    puntosHerramienta,

    referenciaAlinear,
    referencias,
    resaltado,

    ventanaSeleccion,
    vistaPreviaRecorte,
    zEmpujar,
    zoomTick,
  } = c2;
  useEffect(() => {
    const ctx: CtxEscena = {
      ...c2,
      visibles: [],
      murosCapas: [],
      datosCotas: [],
      datosNiveles: [],
    };
    ctx.grupoLocal = grupo.current;
    if (!ctx.grupoLocal) return;
    Object.assign(ctx, construirBaseEscena(ctx));

    // O006e: planta de muros limpia. El contorno es la unión de las huellas; las
    // capas se recortan contra el núcleo vecino y el rayado no duplica traslapes.
    Object.assign(ctx, construirMurosPlanta(ctx));

    // O007b: simbología de los elementos estructurales en planta. Las columnas y
    // castillos se rellenan con el rayado de concreto; trabes, cerramientos, dalas,
    // zapatas y contratrabes se dibujan con líneas discontinuas.
    Object.assign(ctx, construirEstructuraPlanta(ctx));

    // O005c: ejes en todas las plantas, con la plumilla «Ejes» de O005. Se dibujan a
    // partir de modelo.referencias porque geometria.teselar no devuelve mallas de ejes.
    Object.assign(ctx, construirEjesPlanta(ctx));

    // O006a: cotas de ejes automáticas en planta. Se derivan de los ejes; no son
    // IfcAnnotation y no se guardan en el IFC.
    Object.assign(ctx, construirCotasPlanta(ctx));

    // O006a: niveles y ejes en alzados y cortes. La línea de nivel va de extremo a
    // extremo del modelo más 1 m por lado; la cabeza y las cotas quedan en el extremo.
    Object.assign(ctx, construirNivelesAlzado(ctx));

    // O027: un punto de asa por cada zona interactiva, de tamaño constante en
    // pantalla. Se resaltan al pasar el cursor y se ocultan las de ejes no activos.
    Object.assign(ctx, construirAsasYDatasets(ctx));

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
    propiedades,
    resaltado,
    puntoCorte,
    nivelGlobalidPorNombre,
    estilos,
    aberturas,
    referencias,
    cajaVista,
    dimensiones.alto,
    niveles,
    ajusteEnCurso,
    ajustesNivelEnCurso,
    zoomTick,
    elementosOcultos,
    elementosBloqueados,
  ]);

  // O055: ejes, niveles, cotas y notas de las vistas 3D. Se dibujan aparte del
  // modelo para que ninguna de las tres formas de sombreado las tape y para no
  // engordar el efecto principal del visor.
  const c4 = useAnotacionesVisor(c2);

  // O003b: marcadores de la herramienta de dibujo (puntos, snap y vista previa).
  const c5 = useHerramientaVisor(c4);

  // O049: al terminar o cambiar de herramienta se apaga el marcador. La
  // limpieza se aplaza para no encadenar renders dentro del efecto.
  const c6 = useControlesVisor(c5);

  // Rueda: zoom hacia el cursor en ortográficas y acercamiento en 3D.
  const c7 = useRuedaVisor(c6);

  // Paneo, órbita, selección, toques y puntos del corte.
  const {
    ajustar,

    zoomEnCentro,
  } = c7;
  useEffect(() => {
    const nodo = contenedor.current;
    if (!nodo) return;
    nodo.style.touchAction = "none";
    const gesto = crearEstadoGesto();
    const entorno: EntornoVisor = {
      ...c7,
      vista,
      vistas,
      niveles,
      mallas,
      estilos,
      aberturas,
      caja,
      seleccion,
      seleccionados,
      modoCorte,
      puntoCorte,
      onSeleccionar,
      onSeleccionarVarios,
      onPuntoCorte,
      onEscape,
      onCambiarAnotacion,
      claveModelo,
      elementosOcultos,
      elementosBloqueados,
    };
    const ayudas = crearAyudas(entorno, nodo);
    const base = crearAccionesClic(entorno, nodo, ayudas);
    const alBajar = crearAlBajar(entorno, nodo, ayudas, gesto);
    const alMover = crearAlMover(entorno, nodo, ayudas, base, gesto);
    const { alSoltar, alDobleClic, alMenuContextual } = crearAccionesSoltar(
      entorno,
      nodo,
      base,
      gesto,
    );
    const { alTecla, alSoltarTecla } = crearAccionesTeclado(
      entorno,
      nodo,
      ayudas,
    );
    instalarUtilidadesE2E(entorno, nodo, ayudas);
    nodo.addEventListener("pointerdown", alBajar);
    nodo.addEventListener("dblclick", alDobleClic);
    nodo.addEventListener("contextmenu", alMenuContextual);
    window.addEventListener("pointermove", alMover);
    window.addEventListener("pointerup", alSoltar);
    // O034: en captura para que Escape cancele el arrastre antes de que el atajo
    // global de App (burbuja en el mismo `window`) deseleccione la losa.
    window.addEventListener("keydown", alTecla, true);
    window.addEventListener("keyup", alSoltarTecla);
    return () => {
      nodo.removeEventListener("pointerdown", alBajar);
      nodo.removeEventListener("dblclick", alDobleClic);
      nodo.removeEventListener("contextmenu", alMenuContextual);
      window.removeEventListener("pointermove", alMover);
      window.removeEventListener("pointerup", alSoltar);
      window.removeEventListener("keydown", alTecla, true);
      window.removeEventListener("keyup", alSoltarTecla);
    };
  }, [
    aplicarCamara,
    ajustar,
    zoomEnCentro,
    caja,
    modoCorte,
    onPuntoCorte,
    onSeleccionar,
    onSeleccionarVarios,
    onEscape,
    vista,
    modoOrbitar,
    herramienta,
    referenciaAlinear,
    elegirReferenciaAlinear,
    aplicarAlinear,
    fijarRaton,
    clicEnPlanta,
    clicNivel,
    clicRecorte,
    dobleClicEnPlanta,
    ventanaSeleccion,
    fijarAviso,
    fijarPistaTab,
    pantallaDePunto,
    metrosPorPixelActual,
    asaEjeEn,
    asaLosaEn,
    asaNivelEn,
    lineaEjeEn,
    lineaNivelEn,
    fijarNivelSeleccionado,
    puntoVistaDeMundo,
    puntoVistaDesdeEvento,
    candados,
    ejeSeleccionado,
    menuEje,
    fijarAjustesEjes,
    fijarAjustesNiveles,
    referencias.ejes,
    vista.ejes,
    elementosBloqueados,
    mallas,
    empujarRect,
    zEmpujar,
    empujarZ,
    fijarAlturaEmpujar,
    moverEmpujar,
    clicEmpujar,
    confirmarEmpujar,
    empujarCara,
    iniciarEmpujarCara,
    moverEmpujarCara,
    confirmarEmpujarCara,
  ]);

  const c9 = useOverlaysVisor(c7);

  const c10 = useGuiasVisor(c9);

  const { alHacerClicVisor } = c10;
  return (
    <div
      ref={contenedor}
      data-testid="visor"
      data-vista={vista.id}
      data-tipo={vista.tipo}
      data-mallas={mallas.length}
      data-herramienta={herramienta ?? undefined}
      data-nivel-seleccionado={nivelSeleccionado ?? undefined}
      data-enganche={engancheHerramienta?.tipo}
      data-largo-tecleado={longitudTecleada || undefined}
      data-puntos-herramienta={puntosHerramienta.length}
      data-eje-seleccionado={ejeSeleccionado ?? undefined}
      data-seleccion={seleccion ?? undefined}
      data-recorte-preview={vistaPreviaRecorte ? "si" : "no"}
      data-ejes-ajustes={JSON.stringify(vista.ejes ?? {})}
      onClick={alHacerClicVisor}
      className="relative min-h-0 flex-1 overflow-hidden bg-background"
    >
      <OverlaysEdicion v={c10} vista={vista} niveles={niveles} />
      <OverlaysPaneles
        v={c10}
        vista={vista}
        vistas={vistas}
        modoCorte={modoCorte}
        puntoCorte={puntoCorte}
        onCambiarAnotacion={onCambiarAnotacion}
      />
    </div>
  );
}
