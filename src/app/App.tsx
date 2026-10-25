// OPEN-RVT: adaptado de src/app/App.tsx de PresupuestosPro. Se conserva la disposición
// (barra de título, ribbon, sidebar, área de trabajo y barra de estado). En O003a se
// conectan los comandos de archivo con el núcleo IFC y se añaden los atajos Ctrl+N/O/S.
import { useTranslation } from "react-i18next";
import { tr } from "@/i18n";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAtajosGlobales } from "@/lib/atajosGlobales";
import { ipc } from "@/lib/ipc";
import { useTema, aplicarTema, ESCALA_DEFECTO, bajarEscala, subirEscala } from "@/lib/tema";
import { ConfiguracionView } from "@/features/configuracion/ConfiguracionView";
import { AyudaView } from "@/features/ayuda/AyudaView";
import { ModeloView } from "@/features/modelo/ModeloView";
import { EditorTipos } from "@/features/tipos/EditorTipos";
import { NivelesView } from "@/features/modelo/NivelesView";
import { useModelo } from "@/features/modelo/estado";
import { bitacoraAviso, bitacoraVista, vaciarBitacora } from "@/lib/bitacora";
import { Ribbon } from "@/features/ribbon/Ribbon";
import { construirComandosRibbon } from "@/features/ribbon/comandos";
import {
  DialogoActualizacion,
  useComprobacionAutomatica,
} from "@/features/actualizaciones/Actualizaciones";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { PaletaComandos, type Comando } from "./PaletaComandos";
import { DialogoAtajos } from "./DialogoAtajos";
import { BarraEstado } from "./BarraEstado";
import { BarraTitulo } from "./BarraTitulo";
import { SidebarModulos } from "./SidebarModulos";
import { MODULOS } from "./modulos";

const CLAVE_RIBBON_MINIMIZADO = "openrvt.ribbon.minimizado";

function ribbonMinimizadoInicial(): boolean {
  try {
    return localStorage.getItem(CLAVE_RIBBON_MINIMIZADO) === "true";
  } catch {
    return false;
  }
}

export function App() {
  const { t } = useTranslation();
  const [activo, setActivo] = useState("modelo");
  const [paleta, setPaleta] = useState(false);
  const [atajos, setAtajos] = useState(false);
  const [ribbonMinimizado, setRibbonMinimizado] = useState(ribbonMinimizadoInicial);
  const { pref, fijar, iniciar } = useTema();
  const nombreArchivo = useModelo((s) => s.nombreArchivo);
  const conCambios = useModelo((s) => s.conCambios);
  const herramientaActiva = useModelo((s) => s.herramienta);
  const tituloDocumento = nombreArchivo
    ? `${tr("comun.app", "OPEN-RVT")} — ${nombreArchivo}${conCambios ? " *" : ""}`
    : tr("comun.app", "OPEN-RVT");
  const permitirCierre = useRef(false);
  const modulo = MODULOS().find((m) => m.id === activo) ?? MODULOS()[0];
  const nombreModulo = t(`modulos.${modulo.id}`, modulo.nombre);
  // O005c: comprobación automática no intrusiva de actualizaciones.
  useComprobacionAutomatica();

  // La cinta minimizada se recuerda entre sesiones (preferencia local del equipo).
  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_RIBBON_MINIMIZADO, String(ribbonMinimizado));
    } catch {
      /* sin localStorage */
    }
  }, [ribbonMinimizado]);

  // Tema desde config.json (migrando el de localStorage la primera vez).
  useEffect(() => {
    void iniciar();
  }, [iniciar]);

  // Comprobar al arrancar que el núcleo IFC responde (IfcOpenShell instalado).
  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    void useModelo.getState().comprobarNucleo();
  }, []);

  // O006c: avisos, errores y cambios de vista/archivo van a la bitácora.
  useEffect(() => {
    const desuscribir = useModelo.subscribe((estado, anterior) => {
      if (estado.aviso !== anterior.aviso && estado.aviso) {
        bitacoraAviso(estado.aviso, "info");
      }
      if (estado.error !== anterior.error && estado.error) {
        bitacoraAviso(estado.error, "error");
      }
      if (estado.vistaActivaId !== anterior.vistaActivaId || estado.ruta !== anterior.ruta) {
        const vista = estado.vistas.find((v) => v.id === estado.vistaActivaId);
        bitacoraVista(vista?.nombre ?? "Sin vista", estado.ruta);
      }
    });
    return desuscribir;
  }, []);

  // Con la preferencia «sistema», seguir los cambios de tema del equipo.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const alCambiar = () => pref === "sistema" && aplicarTema("sistema");
    mq.addEventListener("change", alCambiar);
    return () => mq.removeEventListener("change", alCambiar);
  }, [pref]);

  // Nombre del producto y del archivo en la barra de título nativa.
  useEffect(() => {
    ipc.fijarTituloVentana(tituloDocumento).catch(() => {
      /* sin backend: se ignora */
    });
  }, [tituloDocumento]);

  // Avisos del núcleo IFC (proceso relanzado o no disponible) en la barra de estado.
  useEffect(() => {
    let vivo = true;
    let quitar: (() => void) | undefined;
    void (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const desuscribir = await listen<string>("nucleo-aviso", (evento) => {
          useModelo.getState().fijarAviso(evento.payload);
        });
        if (vivo) quitar = desuscribir;
        else desuscribir();
      } catch {
        /* fuera de Tauri (pruebas en navegador) */
      }
    })();
    return () => {
      vivo = false;
      quitar?.();
    };
  }, []);

  // Cerrar con cambios sin guardar: pregunta antes de destruir la ventana.
  useEffect(() => {
    let vivo = true;
    let quitar: (() => void) | undefined;
    void (async () => {
      try {
        const ventana = getCurrentWindow();
        const desuscribir = await ventana.onCloseRequested(async (evento) => {
          if (permitirCierre.current) return;
          // O006c: al cerrar se vacía el lote pendiente de la bitácora.
          void vaciarBitacora();
          const modelo = useModelo.getState();
          if (!modelo.conCambios) return;
          evento.preventDefault();
          if (await modelo.asegurarSinCambios()) {
            permitirCierre.current = true;
            await ventana.destroy();
          }
        });
        if (vivo) quitar = desuscribir;
        else desuscribir();
      } catch {
        /* fuera de Tauri: la ventana la cierra el sistema */
      }
    })();
    return () => {
      vivo = false;
      quitar?.();
    };
  }, []);

  // Cambiar de módulo.
  const irAModulo = useCallback((id: string) => {
    setActivo(id);
    bitacoraVista(id, useModelo.getState().ruta);
  }, []);

  // Alt+1…9: cambiar de módulo.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (!e.altKey || e.key < "1" || e.key > "9") return;
      const destino = MODULOS()[Number(e.key) - 1];
      if (destino) irAModulo(destino.id);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [irAModulo]);

  // Atajos de modelado (spec O003b): letras al estilo Revit, Supr, Ctrl+Z/Y y Esc.
  const bufferTeclas = useRef({ texto: "", instante: 0 });
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      const objetivo = e.target as HTMLElement | null;
      const enTexto =
        !!objetivo &&
        (objetivo.isContentEditable ||
          objetivo.tagName === "TEXTAREA" ||
          (objetivo.tagName === "INPUT" &&
            !["checkbox", "radio", "button", "range"].includes(
              (objetivo as HTMLInputElement).type,
            )));
      const estado = useModelo.getState();
      if (e.key === "Escape") {
        if (estado.modoCorte) {
          estado.cancelarCorte();
          e.preventDefault();
        } else if (estado.herramienta) {
          // O005c: el primer Esc cancela el trazo en curso; el segundo sale de la herramienta.
          if (!estado.cancelarTrazo()) estado.cancelarHerramienta();
          e.preventDefault();
        } else if (estado.seleccionados.length > 0) {
          void estado.seleccionar(null);
        }
        return;
      }
      if (enTexto) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        void estado.deshacer();
        return;
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))
      ) {
        e.preventDefault();
        void estado.rehacer();
        return;
      }
      if (e.key === "Delete") {
        e.preventDefault();
        void estado.borrarSeleccion();
        return;
      }
      if (e.code === "Space" && (estado.herramienta === "puerta" || estado.herramienta === "ventana")) {
        e.preventDefault();
        estado.voltearAbertura();
        return;
      }
      if (
        estado.herramienta &&
        estado.herramienta !== "puerta" &&
        estado.herramienta !== "ventana" &&
        estado.puntosHerramienta.length > 0
      ) {
        if (e.key === "Enter") {
          e.preventDefault();
          void estado.confirmarLongitud(e.shiftKey);
          return;
        }
        if (e.key === "Backspace" || e.key === "," || e.key === "." || /^\d$/.test(e.key)) {
          e.preventDefault();
          estado.teclearLongitud(e.key);
          return;
        }
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const ahora = performance.now();
      const buffer = bufferTeclas.current;
      if (ahora - buffer.instante > 900) buffer.texto = "";
      buffer.instante = ahora;
      buffer.texto = (buffer.texto + e.key.toLowerCase()).slice(-2);
      const acciones: Record<string, () => void> = {
        wa: () => estado.activarHerramienta("muro"),
        sb: () => estado.activarHerramienta("losa"),
        dr: () => estado.activarHerramienta("puerta"),
        wn: () => estado.activarHerramienta("ventana"),
        gr: () => estado.activarHerramienta("eje"),
        ll: () => {
          const niveles = estado.niveles;
          const siguiente =
            niveles.length > 0 ? Math.max(...niveles.map((n) => n.elevacion)) + 3 : 0;
          void estado.crearNivel(`Nivel ${niveles.length}`, siguiente);
        },
        mv: () => estado.activarHerramienta("mover"),
        co: () => estado.activarHerramienta("copiar"),
      };
      const accion = acciones[buffer.texto];
      if (accion) {
        buffer.texto = "";
        e.preventDefault();
        accion();
      }
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, []);

  // Atajos globales; sin modelo abierto solo actúan las preferencias de la app.
  useAtajosGlobales(
    {
      paleta: () => setPaleta(true),
      atajos: () => setAtajos(true),
      minimizarRibbon: () => setRibbonMinimizado((v) => !v),
      escalaMas: () => useTema.getState().fijarEscala(subirEscala(useTema.getState().escala)),
      escalaMenos: () => useTema.getState().fijarEscala(bajarEscala(useTema.getState().escala)),
      escalaNormal: () => useTema.getState().fijarEscala(ESCALA_DEFECTO),
      nuevoArchivo: () => void useModelo.getState().nuevo(),
      abrirArchivo: () => void useModelo.getState().abrir(),
      guardarArchivo: () => void useModelo.getState().guardar(),
      guardarComo: () => void useModelo.getState().guardarComo(),
    },
  );

  const comandosRibbon = useMemo(
    () =>
      construirComandosRibbon({
        nuevo: () => void useModelo.getState().nuevo(),
        abrir: () => void useModelo.getState().abrir(),
        guardar: () => void useModelo.getState().guardar(),
        guardarComo: () => void useModelo.getState().guardarComo(),
        nuevaVistaCorte: () => useModelo.getState().iniciarCorte(),
        estilosObjeto: () => useModelo.getState().abrirDialogoEstilos(),
        // OPEN-RVT: herramientas de modelado (spec O003b).
        nuevoNivel: () => {
          const estado = useModelo.getState();
          const siguiente =
            estado.niveles.length > 0
              ? Math.max(...estado.niveles.map((n) => n.elevacion)) + 3
              : 0;
          void estado.crearNivel(`Nivel ${estado.niveles.length}`, siguiente);
        },
        nuevoEje: () => useModelo.getState().activarHerramienta("eje"),
        nuevosEjesPorSeparaciones: () => useModelo.getState().abrirDialogoCotas(),
        herramientaMuro: () => useModelo.getState().activarHerramienta("muro"),
        herramientaLosa: () => useModelo.getState().activarHerramienta("losa"),
        losaDesdeMuros: () => void useModelo.getState().losaDesdeMuros(),
        herramientaPuerta: () => useModelo.getState().activarHerramienta("puerta"),
        herramientaVentana: () => useModelo.getState().activarHerramienta("ventana"),
        herramientaMover: () => useModelo.getState().activarHerramienta("mover"),
        herramientaCopiar: () => useModelo.getState().activarHerramienta("copiar"),
        // O007a: el editor vive en el módulo Modelo; la cinta cambia de módulo.
        abrirTipos: () => {
          irAModulo("modelo");
          useModelo.getState().abrirEditorTipos();
        },
        borrarSeleccion: () => void useModelo.getState().borrarSeleccion(),
        deshacer: () => void useModelo.getState().deshacer(),
        rehacer: () => void useModelo.getState().rehacer(),
        herramientaActiva,
        temaSistema: () => fijar("sistema"),
        temaClaro: () => fijar("claro"),
        temaOscuro: () => fijar("oscuro"),
        temaActivo: pref,
      }),
    [fijar, pref, herramientaActiva, irAModulo],
  );

  const comandos = useMemo<Comando[]>(() => {
    const lista: Comando[] = [];
    MODULOS().forEach((m, i) =>
      lista.push({
        id: `ir-${m.id}`,
        titulo: t("app.irA", "Ir a {{nombre}}", { nombre: t(`modulos.${m.id}`, m.nombre) }),
        atajo: i < 9 ? `Alt+${i + 1}` : undefined,
        accion: () => irAModulo(m.id),
      }),
    );
    for (const [p, nombre] of [
      ["sistema", "del sistema"],
      ["claro", "claro"],
      ["oscuro", "oscuro"],
    ] as const) {
      lista.push({
        id: `tema-${p}`,
        titulo: tr("app.tema", "Tema {{nombre}}", {
          nombre: tr(`app.tema${p[0].toUpperCase()}${p.slice(1)}`, nombre),
        }),
        accion: () => fijar(p),
      });
    }
    lista.push({
      id: "atajos",
      titulo: tr("ayuda.atajos", "Atajos de teclado"),
      atajo: "F1",
      accion: () => setAtajos(true),
    });
    lista.push({
      id: "minimizar-ribbon",
      titulo: ribbonMinimizado
        ? tr("ribbon.expandir", "Expandir la cinta")
        : tr("ribbon.minimizar", "Minimizar la cinta"),
      atajo: "Ctrl+F1",
      accion: () => setRibbonMinimizado((v) => !v),
    });
    return lista;
  }, [fijar, irAModulo, ribbonMinimizado, t]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <BarraTitulo />
      <div className="shrink-0 border-b bg-background">
        <Ribbon
          comandos={comandosRibbon}
          minimizado={ribbonMinimizado}
          onToggleMinimizado={() => setRibbonMinimizado((v) => !v)}
        />
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* OPEN-RVT: la barra lateral va en una columna propia, como en PP, para que su
            `flex-1` sea vertical y no se estire a lo ancho. */}
        <div className="flex min-h-0 shrink-0 flex-col">
          <SidebarModulos activo={activo} onElegir={irAModulo} />
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
            {activo === "modelo" ? (
              <ModeloView />
            ) : activo === "tipos" ? (
              <EditorTipos onCerrar={() => irAModulo("modelo")} />
            ) : activo === "niveles" ? (
              <NivelesView />
            ) : activo === "configuracion" ? (
              <>
                <div className="flex h-9 shrink-0 items-center border-b px-3 font-medium">
                  {nombreModulo}
                </div>
                <ConfiguracionView />
              </>
            ) : (
              <>
                <div className="flex h-9 shrink-0 items-center border-b px-3 font-medium">
                  {nombreModulo}
                </div>
                <AyudaView />
              </>
            )}
          </main>
        </div>
      </div>

      <BarraEstado />

      {paleta && <PaletaComandos comandos={comandos} onCerrar={() => setPaleta(false)} />}
      {atajos && <DialogoAtajos onCerrar={() => setAtajos(false)} />}
      <DialogoActualizacion />
      <DialogoGuardarCambios />
    </div>
  );
}

/** Pregunta de tres opciones al cerrar o abrir otro archivo con cambios sin guardar. */
function DialogoGuardarCambios() {
  const pregunta = useModelo((s) => s.preguntaGuardar);
  const responder = useModelo((s) => s.responderGuardar);
  if (!pregunta) return null;
  return (
    <Modal
      titulo="Cambios sin guardar"
      onCerrar={() => responder("cancelar")}
      className="w-[min(480px,92vw)]"
    >
      <div className="flex flex-col gap-3 p-4" data-testid="dialogo-guardar-cambios">
        <h2 className="font-semibold">¿Guardar cambios?</h2>
        <p className="text-muted-foreground">
          El modelo «{pregunta.nombre || "sin título"}» tiene cambios sin guardar.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => responder("cancelar")}>
            Cancelar
          </Button>
          <Button variant="ghost" onClick={() => responder("descartar")}>
            No guardar
          </Button>
          <Button autoFocus onClick={() => responder("guardar")}>
            Guardar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
