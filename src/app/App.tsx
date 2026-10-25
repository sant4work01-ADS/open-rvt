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
import { useModelo } from "@/features/modelo/estado";
import { Ribbon } from "@/features/ribbon/Ribbon";
import { construirComandosRibbon } from "@/features/ribbon/comandos";
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
  const tituloDocumento = nombreArchivo
    ? `${tr("comun.app", "OPEN-RVT")} — ${nombreArchivo}${conCambios ? " *" : ""}`
    : tr("comun.app", "OPEN-RVT");
  const permitirCierre = useRef(false);
  const modulo = MODULOS().find((m) => m.id === activo) ?? MODULOS()[0];
  const nombreModulo = t(`modulos.${modulo.id}`, modulo.nombre);

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
          const modelo = useModelo.getState();
          if (!modelo.conCambios) return;
          evento.preventDefault();
          if (await modelo.asegurarSinCambios()) {
            permitirCierre.current = true;
            await ventana.close();
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
        temaSistema: () => fijar("sistema"),
        temaClaro: () => fijar("claro"),
        temaOscuro: () => fijar("oscuro"),
        temaActivo: pref,
      }),
    [fijar, pref],
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
            ) : activo === "niveles" ? (
              <div data-testid="vista-niveles" className="min-h-0 flex-1" />
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
