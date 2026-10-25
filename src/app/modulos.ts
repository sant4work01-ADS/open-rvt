// OPEN-RVT: módulos de la navegación lateral. Se conserva la forma de PresupuestosPro
// (id, nombre traducido e icono) y se sustituyen los módulos de presupuesto por los de
// modelado. Alt+1…4 selecciona los cuatro primeros.
import { Box, Layers, Settings, CircleHelp, type LucideIcon } from "lucide-react";
import { tr } from "@/i18n";

export interface Modulo {
  id: string;
  nombre: string;
  icono: LucideIcon;
}

/** Módulos de la navegación lateral; Alt+1…9 selecciona los nueve primeros. */
export const MODULOS = (): Modulo[] => [
  { id: "modelo", nombre: tr("modulos.modelo", "Modelo"), icono: Box },
  { id: "niveles", nombre: tr("modulos.niveles", "Niveles y ejes"), icono: Layers },
  { id: "configuracion", nombre: tr("modulos.configuracion", "Configuración"), icono: Settings },
  { id: "ayuda", nombre: tr("modulos.ayuda", "Ayuda"), icono: CircleHelp },
];
