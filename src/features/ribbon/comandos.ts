// Definición declarativa de los comandos de la cinta (Ribbon).
// La lista es independiente de cómo se pinte: la vista compacta del futuro §19.4 puede
// reutilizar la misma definición con otro renderizador.
//
// Rótulos (§20.7): en el ribbon normal NINGÚN botón queda solo con ícono — los grandes
// llevan ícono de 24 px arriba y texto debajo (hasta 2 líneas) y los chicos ícono de
// 16 px con texto a la derecha. Los tooltips dicen «Nombre (atajo) — qué hace».
import type { LucideIcon } from "lucide-react";
import { ChevronDown, FolderPlus, Monitor, Moon, Save, SquarePlus, Sun } from "lucide-react";
import { tr } from "@/i18n";

export type PestanaRibbon = "archivo" | "principal" | "herramientas" | "vista";
/** Tamaño en el ribbon normal: grande (ícono 24 px + texto abajo) o chico (16 px + texto). */
export type TamanoRibbon = "grande" | "chico";

export interface SubitemRibbon {
  id: string;
  texto: string;
  icono?: LucideIcon;
  atajo?: string;
  desactivado?: boolean;
  accion: () => void;
}

export interface ComandoRibbon {
  id: string;
  texto: string;
  icono: LucideIcon;
  /** Texto del atajo tal como lo muestra src/lib/atajos.ts. */
  atajo?: string;
  grupo: string;
  pestana: PestanaRibbon;
  tamano: TamanoRibbon;
  habilitado: boolean;
  /**
   * Columna fija dentro del grupo (0 = la primera). Sirve para acomodar los botones
   * como en el diseño (p. ej. los de nivel en dos columnas de dos); si no se indica,
   * los comandos se reparten de tres en tres.
   */
  columna?: number;
  /** Qué hace el comando: segunda parte del tooltip («Nombre (atajo) — qué hace»). */
  descripcion?: string;
  /** Acción principal; si hay subitems, el botón principal la ejecuta. */
  accion?: () => void;
  /** Menú desplegable; se abre con la flecha del botón. */
  subitems?: SubitemRibbon[];
  /** Estado de un botón conmutador (p. ej. la base del P.U.); `undefined` si no lo es. */
  activo?: boolean;
}

export interface AccionesRibbon {
  // OPEN-RVT: los comandos de archivo todavía no hacen nada; existen para que la cinta
  // tenga la misma forma que la de PresupuestosPro desde el primer día.
  nuevo: () => void;
  abrir: () => void;
  guardar: () => void;
  temaSistema: () => void;
  temaClaro: () => void;
  temaOscuro: () => void;
  /** Preferencia de tema activa, para marcar el botón correspondiente. */
  temaActivo: "sistema" | "claro" | "oscuro";
}

/**
 * Construye la lista única de comandos del ribbon de OPEN-RVT.
 * Solo hay dos pestañas: Inicio (Archivo) y Vista (Tema).
 */
export function construirComandosRibbon(a: AccionesRibbon): ComandoRibbon[] {
  return [
    // ---------- Archivo ----------
    {
      id: "nuevo",
      texto: "Nuevo",
      icono: SquarePlus,
      atajo: "Ctrl+N",
      grupo: "Archivo",
      pestana: "principal",
      tamano: "grande",
      habilitado: false,
      descripcion: "Disponible pronto",
      accion: a.nuevo,
    },
    {
      id: "abrir",
      texto: "Abrir",
      icono: FolderPlus,
      atajo: "Ctrl+O",
      grupo: "Archivo",
      pestana: "principal",
      tamano: "grande",
      habilitado: false,
      descripcion: "Disponible pronto",
      accion: a.abrir,
    },
    {
      id: "guardar",
      texto: "Guardar",
      icono: Save,
      atajo: "Ctrl+S",
      grupo: "Archivo",
      pestana: "principal",
      tamano: "grande",
      habilitado: false,
      descripcion: "Disponible pronto",
      accion: a.guardar,
    },

    // ---------- Tema ----------
    {
      id: "tema-sistema",
      texto: "Sistema",
      icono: Monitor,
      grupo: "Tema",
      pestana: "vista",
      tamano: "chico",
      habilitado: true,
      activo: a.temaActivo === "sistema",
      descripcion: "Seguir el tema del sistema",
      accion: a.temaSistema,
    },
    {
      id: "tema-claro",
      texto: "Claro",
      icono: Sun,
      grupo: "Tema",
      pestana: "vista",
      tamano: "chico",
      habilitado: true,
      activo: a.temaActivo === "claro",
      descripcion: "Tema claro",
      accion: a.temaClaro,
    },
    {
      id: "tema-oscuro",
      texto: "Oscuro",
      icono: Moon,
      grupo: "Tema",
      pestana: "vista",
      tamano: "chico",
      habilitado: true,
      activo: a.temaActivo === "oscuro",
      descripcion: "Tema oscuro",
      accion: a.temaOscuro,
    },
  ];
}

// Icono compartido con el renderizador del ribbon.
export { ChevronDown };

/**
 * Texto del tooltip y `aria-label` de un comando: «Nombre (atajo) — qué hace» (§20.7).
 * Sin atajo queda «Nombre — qué hace»; sin descripción, «Nombre (atajo)». Los rótulos
 * salen del diccionario del idioma activo (spec 056) y caen al español si falta la clave.
 */
export function textoComando(c: { id: string; texto: string }): string {
  return tr(`ribbon.comandos.${c.id}`, c.texto);
}

export function descripcionComando(c: { id: string; descripcion?: string }): string | undefined {
  return c.descripcion ? tr(`ribbon.descripciones.${c.id}`, c.descripcion) : undefined;
}

export function textoGrupo(grupo: string): string {
  return tr(`ribbon.grupos.${grupo}`, grupo);
}

export function labelComando(c: {
  id: string;
  texto: string;
  atajo?: string;
  descripcion?: string;
}): string {
  const texto = textoComando(c);
  const conAtajo = c.atajo ? `${texto} (${c.atajo})` : texto;
  const descripcion = descripcionComando(c);
  return descripcion ? `${conAtajo} — ${descripcion}` : conAtajo;
}
