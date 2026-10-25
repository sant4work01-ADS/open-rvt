// OPEN-RVT: adaptado de src/app/App.tsx de PresupuestosPro. Se conserva la disposición
// (barra de título, ribbon, sidebar, área de trabajo y barra de estado) y se quitan las
// vistas, consultas y acciones de presupuesto que todavía no existen.
import { useTranslation } from "react-i18next";
import { tr } from "@/i18n";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAtajosGlobales } from "@/lib/atajosGlobales";
import { ipc } from "@/lib/ipc";
import { useTema, aplicarTema, ESCALA_DEFECTO, bajarEscala, subirEscala } from "@/lib/tema";
import { ConfiguracionView } from "@/features/configuracion/ConfiguracionView";
import { AyudaView } from "@/features/ayuda/AyudaView";
import { ModeloView } from "@/features/modelo/ModeloView";
import { Ribbon } from "@/features/ribbon/Ribbon";
import { construirComandosRibbon } from "@/features/ribbon/comandos";
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

  // Con la preferencia «sistema», seguir los cambios de tema del equipo.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const alCambiar = () => pref === "sistema" && aplicarTema("sistema");
    mq.addEventListener("change", alCambiar);
    return () => mq.removeEventListener("change", alCambiar);
  }, [pref]);

  // Nombre del producto en la barra de título nativa.
  useEffect(() => {
    ipc.fijarTituloVentana(tr("comun.app", "OPEN-RVT")).catch(() => {
      /* sin backend: se ignora */
    });
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
    },
    false,
  );

  const comandosRibbon = useMemo(
    () =>
      construirComandosRibbon({
        nuevo: () => undefined,
        abrir: () => undefined,
        guardar: () => undefined,
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
    </div>
  );
}
