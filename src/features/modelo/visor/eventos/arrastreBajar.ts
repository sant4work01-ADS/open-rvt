import { type AjusteEjeVista } from "../../tipos";
import { useModelo } from "../../estado";
import { leerPoligonoWkt } from "../../asasLosa";
import { accionArrastre } from "../../orbita";
import { candadoArrastreAsa, puntoAsaEje } from "../../ejesVista";
import type { EntornoVisor } from "./contexto";
import type { EstadoGesto } from "./contexto";
import type { crearAyudas } from "./ayudas";

export function crearAlBajar(
  entorno: EntornoVisor,
  nodo: HTMLElement,
  ayudas: ReturnType<typeof crearAyudas>,
  gesto: EstadoGesto,
) {
  const {
    ajusteEnCurso,
    ajusteEnCursoRef,
    arrastre,
    arrastreEje,
    arrastreLosa,
    arrastreNivel,
    asaEjeEn,
    asaLosaEn,
    asaNivelEn,
    candados,
    contextoEje,
    espacio,
    herramienta,
    modoOrbitar,
    puntoVistaDeMundo,
    puntoVistaDesdeEvento,
    referencias,
    setAjusteEnCurso,
    setAjustesNivelEnCurso,
    setEditorDesfaseLosa,
    setEjeSeleccionado,
    setGuiaCodo,
    setMenuEje,
    setPreviewLosaPx,
    setVentanaSeleccion,
    soltarLosaCancelado,
    ultimoMedio,
    ajustar,
    vista,
    modoCorte,
  } = entorno;
  const { puntoPlanta } = ayudas;
  const alBajar = (evento: PointerEvent) => {
    // O011: los botones y menús flotantes sobre el visor no deben iniciar
    // selección ni desmontarse al soltar (el evento burbujea hasta el contenedor).
    if (
      evento.target instanceof Element &&
      evento.target.closest("button, [role='menu'], input, select, textarea")
    ) {
      return;
    }
    if (evento.pointerType === "touch") {
      evento.preventDefault();
      gesto.toques.set(evento.pointerId, {
        x: evento.clientX,
        y: evento.clientY,
      });
      try {
        nodo.setPointerCapture(evento.pointerId);
      } catch {
        /* el puntero pudo terminar antes */
      }
      if (gesto.toques.size === 1) {
        gesto.toqueInicial = {
          x: evento.clientX,
          y: evento.clientY,
          ms: performance.now(),
          movido: false,
        };
        gesto.pinza = null;
      } else if (gesto.toques.size === 2) {
        const [a, b] = [...gesto.toques.values()];
        gesto.pinza = {
          dist: Math.hypot(a.x - b.x, a.y - b.y),
          cx: (a.x + b.x) / 2,
          cy: (a.y + b.y) / 2,
        };
        if (gesto.toqueInicial) gesto.toqueInicial.movido = true;
      }
      return;
    }
    const botonMedio = evento.button === 1;
    const izquierdo = evento.button === 0;
    const es3dVista = vista.tipo === "iso" || vista.tipo === "perspectiva";
    // O020: el botón derecho orbita en 3D; en 2D no hace nada aquí.
    if (evento.button === 2 && !es3dVista) return;
    if (!botonMedio && !izquierdo && evento.button !== 2) return;
    // O006d: doble clic con el botón medio = Ajustar (el `dblclick` del navegador
    // no siempre conserva `button = 1` en WebKitGTK).
    if (botonMedio) {
      const ahora = performance.now();
      if (ahora - ultimoMedio.current < 400) {
        ultimoMedio.current = 0;
        evento.preventDefault();
        ajustar();
        return;
      }
      ultimoMedio.current = ahora;
    }
    const accion = accionArrastre({
      boton: evento.button,
      shift: evento.shiftKey,
      espacio: espacio.current,
      modoOrbitar,
      es3d: es3dVista,
    });
    const paneable = accion !== "seleccionar";
    if (paneable) {
      evento.preventDefault();
      nodo.style.cursor = "grabbing";
    }
    // O034: arrastrar el asa del borde de una losa en planta.
    if (
      izquierdo &&
      !paneable &&
      !herramienta &&
      !modoCorte &&
      vista.tipo === "planta"
    ) {
      const asaLosa = asaLosaEn(evento.clientX, evento.clientY);
      if (asaLosa) {
        soltarLosaCancelado.current = false;
        const punto = puntoPlanta(evento);
        if (punto) {
          const props = useModelo.getState().propiedades;
          const pset = props?.psets?.OPENRVT_Losa as
            Record<string, unknown> | undefined;
          const crudo = pset?.Contorno;
          arrastreLosa.current = {
            globalid: props?.globalid ?? "",
            indice: asaLosa.indice,
            desfaseInicial: asaLosa.desfase,
            desfase: asaLosa.desfase,
            normal: asaLosa.normal,
            medio: asaLosa.medio,
            inicio: punto,
            poligono: leerPoligonoWkt(typeof crudo === "string" ? crudo : null),
            movido: false,
            pantallaInicio: { x: evento.clientX, y: evento.clientY },
          };
          setPreviewLosaPx(null);
          setEditorDesfaseLosa(null);
          try {
            nodo.setPointerCapture(evento.pointerId);
          } catch {
            /* eventos sintéticos de las pruebas */
          }
          evento.preventDefault();
          return;
        }
      }
    }
    // O014b: arrastrar una cabeza de nivel para colocarla a mano.
    if (izquierdo && !paneable && !herramienta && !modoCorte) {
      const asaNivel = asaNivelEn(evento.clientX, evento.clientY);
      const puntoNivel = asaNivel
        ? puntoVistaDesdeEvento(evento.clientX, evento.clientY)
        : null;
      if (asaNivel && puntoNivel) {
        arrastreNivel.current = {
          globalid: asaNivel.globalid,
          elev: asaNivel.elev,
          desplazamiento: asaNivel.desplazamiento,
          desplazamientoInicial: asaNivel.desplazamiento,
          inicio: puntoNivel,
          pantallaInicio: { x: evento.clientX, y: evento.clientY },
          movido: false,
        };
        setAjustesNivelEnCurso({});
        evento.preventDefault();
        return;
      }
    }
    // O011: arrastrar un globo, un extremo libre o un codo de eje.
    if (izquierdo && !paneable && !herramienta && !modoCorte) {
      const asa = asaEjeEn(evento.clientX, evento.clientY);
      const ctx = contextoEje.current;
      if (asa && ctx) {
        const eje = referencias.ejes.find((e) => e.globalid === asa.globalid);
        const punto = puntoVistaDesdeEvento(evento.clientX, evento.clientY);
        if (eje && punto) {
          setEjeSeleccionado(asa.globalid);
          setMenuEje(null);
          const inicial: Record<string, AjusteEjeVista> = JSON.parse(
            JSON.stringify(vista.ejes ?? {}),
          );
          const inicialConCambios = ajusteEnCurso
            ? JSON.parse(JSON.stringify(ajusteEnCurso))
            : inicial;
          arrastreEje.current = {
            globalid: asa.globalid,
            etiqueta: asa.etiqueta,
            lado: asa.lado,
            indice: asa.tipo === "codo" ? asa.indice : null,
            candado: candadoArrastreAsa(
              asa.tipo,
              !candados[asa.lado],
              !!(
                asa.lado === "inicio"
                  ? vista.ejes?.[asa.globalid]?.codosInicio
                  : vista.ejes?.[asa.globalid]?.codosFin
              )?.length,
            ),
            familia:
              ctx.tipo === "planta"
                ? eje.vertical
                  ? "vertical"
                  : "horizontal"
                : "alzado",
            inicio: punto,
            // El asa del extremo de la línea se dibuja justo en su punto; la del
            // globo y la del codo nuevo no (el globo va un radio arriba).
            asaInicio:
              asa.tipo !== "base" && ctx.bases[asa.globalid]
                ? puntoAsaEje(
                    inicialConCambios[asa.globalid],
                    ctx.bases[asa.globalid],
                    asa.lado,
                    asa.tipo,
                    asa.tipo === "codo" ? asa.indice : null,
                  )
                : (puntoVistaDeMundo(asa.punto) ?? punto),
            originales: inicial,
            movido: false,
            tipo: asa.tipo,
            pantallaInicio: { x: evento.clientX, y: evento.clientY },
            codoCreado: false,
            modoCodo: null,
          };
          ajusteEnCursoRef.current = inicialConCambios;
          setAjusteEnCurso(inicialConCambios);
          setGuiaCodo(null);
        }
        evento.preventDefault();
        return;
      }
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
      accion,
    };
    if (!paneable) setVentanaSeleccion(null);
    if (paneable) {
      try {
        nodo.setPointerCapture(evento.pointerId);
      } catch {
        /* los eventos sintéticos de las pruebas no tienen puntero activo */
      }
    }
  };
  return alBajar;
}
