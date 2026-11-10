import { useModelo } from "../../estado";
import { normalizarAjusteNivel } from "../../niveles";
import { restablecerExtremoEje } from "../../ejesVista";
import type { EntornoVisor } from "./contexto";
import type { EstadoGesto } from "./contexto";
import type { crearAccionesClic } from "./clic";

export function crearAccionesSoltar(
  entorno: EntornoVisor,
  nodo: HTMLElement,
  base: ReturnType<typeof crearAccionesClic>,
  gesto: EstadoGesto,
) {
  const {
    abrirEditorCota,
    ajusteActualEje,
    ajusteEnCursoRef,
    arrastre,
    arrastreEje,
    arrastreLosa,
    arrastreNivel,
    asaEjeEn,
    asaNivelEn,
    camara,
    cotaEn,
    dobleClicEnPlanta,
    espacio,
    fijarAjustesEjes,
    fijarAjustesNiveles,
    herramienta,
    meshes,
    modoOrbitar,
    persistirAjusteEje,
    setAjusteEnCurso,
    setAjustesNivelEnCurso,
    setEditorDesfaseLosa,
    setEjeSeleccionado,
    setGuiaArrastre,
    setMenuEje,
    setPreviewLosaPx,
    setVentanaSeleccion,
    soltarLosaCancelado,
    ventanaSeleccion,
    ajustar,
    vista,
    modoCorte,
    onSeleccionarVarios,
  } = entorno;
  const { hacerClic } = base;
  const alSoltar = (evento: PointerEvent) => {
    if (evento.pointerType === "touch") {
      const estaba = gesto.toques.get(evento.pointerId);
      gesto.toques.delete(evento.pointerId);
      if (gesto.toques.size === 0) {
        const toque = gesto.toqueInicial;
        gesto.toqueInicial = null;
        gesto.pinza = null;
        if (
          toque &&
          !toque.movido &&
          estaba &&
          performance.now() - toque.ms < 350
        ) {
          hacerClic(
            evento.clientX,
            evento.clientY,
            evento.shiftKey,
            evento.ctrlKey || evento.metaKey || evento.altKey,
          );
        }
      } else if (gesto.toques.size === 1) {
        gesto.pinza = null;
        if (gesto.toqueInicial) gesto.toqueInicial.movido = true;
      }
      return;
    }
    if (soltarLosaCancelado.current) {
      soltarLosaCancelado.current = false;
      setPreviewLosaPx(null);
      setGuiaArrastre(null);
      return;
    }
    const arrLosa = arrastreLosa.current;
    if (arrLosa) {
      arrastreLosa.current = null;
      setPreviewLosaPx(null);
      setGuiaArrastre(null);
      if (arrLosa.movido) {
        if (arrLosa.globalid) {
          // Mismo comando que la tabla de Propiedades: un solo paso de deshacer.
          void useModelo.getState().editarElemento(arrLosa.globalid, {
            cambio_borde: { indice: arrLosa.indice, desfase: arrLosa.desfase },
          });
        }
      } else {
        const rect = nodo.getBoundingClientRect();
        setEditorDesfaseLosa({
          globalid: arrLosa.globalid,
          indice: arrLosa.indice,
          izquierda: Math.max(
            70,
            Math.min(rect.width - 70, evento.clientX - rect.left),
          ),
          arriba: Math.max(
            8,
            Math.min(rect.height - 48, evento.clientY - rect.top - 38),
          ),
          valor: String(arrLosa.desfase),
        });
      }
      return;
    }
    const arrNivel = arrastreNivel.current;
    if (arrNivel) {
      arrastreNivel.current = null;
      if (arrNivel.movido) {
        void fijarAjustesNiveles(vista.id, {
          [arrNivel.globalid]:
            normalizarAjusteNivel({
              desplazamiento: arrNivel.desplazamiento,
            }) ?? null,
        });
      }
      setAjustesNivelEnCurso({});
      setGuiaArrastre(null);
      return;
    }
    const arrEje = arrastreEje.current;
    if (arrEje) {
      arrastreEje.current = null;
      const cambios = ajusteEnCursoRef.current;
      if (arrEje.movido && cambios) {
        // Una sola escritura al soltar = una sola entrada de deshacer.
        void fijarAjustesEjes(vista.id, cambios);
      }
      ajusteEnCursoRef.current = null;
      setAjusteEnCurso(null);
      setGuiaArrastre(null);
      return;
    }
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
      const es3dClic = vista.tipo === "iso" || vista.tipo === "perspectiva";
      hacerClic(
        evento.clientX,
        evento.clientY,
        evento.shiftKey,
        evento.ctrlKey || evento.metaKey || evento.altKey,
        modoOrbitar && es3dClic && arr.boton === 0,
      );
    }
  };
  const alDobleClic = (evento: MouseEvent) => {
    // O006d: doble clic con el botón medio = Ajustar.
    if (evento.button === 1) {
      evento.preventDefault();
      ajustar();
      return;
    }
    // O021: doble clic en un asa de eje = devolver ese extremo a automático.
    const asaEje = asaEjeEn(evento.clientX, evento.clientY);
    if (asaEje) {
      evento.preventDefault();
      persistirAjusteEje(
        asaEje.globalid,
        restablecerExtremoEje(ajusteActualEje(asaEje.globalid), asaEje.lado),
      );
      return;
    }
    // O014b: doble clic en el asa de una cabeza nivel = volver al acomodo automático.
    const asaNivel = asaNivelEn(evento.clientX, evento.clientY);
    if (asaNivel) {
      evento.preventDefault();
      void fijarAjustesNiveles(vista.id, { [asaNivel.globalid]: null });
      return;
    }
    const cotaDoble = cotaEn(evento.clientX, evento.clientY);
    if (cotaDoble) {
      evento.preventDefault();
      abrirEditorCota(cotaDoble, evento.clientX, evento.clientY);
      return;
    }
    // O007a: sin herramienta, el doble clic puede abrir «Editar tipo» del muro
    // seleccionado; la decisión final vive en el estado del modelo.
    evento.preventDefault();
    void dobleClicEnPlanta();
  };
  const alMenuContextual = (evento: MouseEvent) => {
    // O020: en 3D el botón derecho orbita y no debe abrir el menú del navegador.
    if (vista.tipo === "iso" || vista.tipo === "perspectiva") {
      evento.preventDefault();
      return;
    }
    const asa = asaEjeEn(evento.clientX, evento.clientY);
    if (!asa) return;
    evento.preventDefault();
    const rect = nodo.getBoundingClientRect();
    setEjeSeleccionado(asa.globalid);
    setMenuEje({
      x: evento.clientX - rect.left,
      y: evento.clientY - rect.top,
      globalid: asa.globalid,
      lado: asa.lado,
      indice: asa.tipo === "codo" ? asa.indice : null,
    });
  };
  return { alSoltar, alDobleClic, alMenuContextual };
}
