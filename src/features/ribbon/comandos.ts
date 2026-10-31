// Definición declarativa de los comandos de la cinta (Ribbon).
// La lista es independiente de cómo se pinte: la vista compacta del futuro §19.4 puede
// reutilizar la misma definición con otro renderizador.
//
// Rótulos (§20.7): en el ribbon normal NINGÚN botón queda solo con ícono — los grandes
// llevan ícono de 24 px arriba y texto debajo (hasta 2 líneas) y los chicos ícono de
// 16 px con texto a la derecha. Los tooltips dicen «Nombre (atajo) — qué hace».
import type { LucideIcon } from "lucide-react";
import {
  Box,
  BrickWall,
  ChevronDown,
  Columns2,
  Columns3,
  Copy,
  DoorOpen,
  FolderOpen,
  Frame,
  Grid3X3,
  Layers,
  LibraryBig,
  Monitor,
  Moon,
  Move,
  PanelTop,
  Ruler,
  RectangleHorizontal,
  Redo2,
  Save,
  SaveAll,
  Scissors,
  Square,
  SquarePlus,
  Sun,
  Trash2,
  Undo2,
} from "lucide-react";
import { tr } from "@/i18n";

export type PestanaRibbon = "archivo" | "principal" | "modelar" | "herramientas" | "vista";
/** Tamaño en el ribbon normal: grande (ícono 24 px + texto abajo) o chico (16 px + texto). */
export type TamanoRibbon = "grande" | "chico";

export interface SubitemRibbon {
  id: string;
  texto: string;
  icono?: LucideIcon;
  atajo?: string;
  descripcion?: string;
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
  // OPEN-RVT: comandos de archivo (spec O003a). Nuevo, Abrir, Guardar y Guardar como
  // usan el diálogo nativo y el núcleo Python.
  nuevo: () => void;
  abrir: () => void;
  guardar: () => void;
  guardarComo: () => void;
  temaSistema: () => void;
  temaClaro: () => void;
  temaOscuro: () => void;
  /** Preferencia de tema activa, para marcar el botón correspondiente. */
  temaActivo: "sistema" | "claro" | "oscuro";
  /** Nueva vista de corte (pestaña Vista). */
  nuevaVistaCorte: () => void;
  /** O005: diálogo de estilos de objeto (pestaña Vista). */
  estilosObjeto: () => void;
  /** O024: editor de estilos de anotación (niveles, ejes y cotas). */
  estilosAnotacion: () => void;
  // OPEN-RVT: herramientas de modelado (spec O003b).
  nuevoNivel: () => void;
  nuevoEje: () => void;
  /** O006a: retícula completa por separaciones. */
  nuevosEjesPorSeparaciones: () => void;
  herramientaMuro: () => void;
  herramientaLosa: () => void;
  losaDesdeMuros: () => void;
  herramientaPuerta: () => void;
  herramientaVentana: () => void;
  herramientaMover: () => void;
  herramientaCopiar: () => void;
  /** O007b: herramientas de estructura (un clic o dos, según el elemento). */
  herramientaZapata: () => void;
  herramientaZapataCorrida: () => void;
  herramientaContratrabe: () => void;
  herramientaColumna: () => void;
  herramientaCastillo: () => void;
  herramientaTrabe: () => void;
  herramientaCerramiento: () => void;
  herramientaDala: () => void;
  /** O007c: interacciones de la estructura. */
  castillosAutomaticos: () => void;
  unirZapatas: () => void;
  unirTrabes: () => void;
  /** O007a: abre el editor de tipos y materiales. */
  abrirTipos: () => void;
  borrarSeleccion: () => void;
  deshacer: () => void;
  rehacer: () => void;
  herramientaActiva: string | null;
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
      habilitado: true,
      descripcion: "Crear un modelo IFC vacío",
      accion: a.nuevo,
    },
    {
      id: "abrir",
      texto: "Abrir",
      icono: FolderOpen,
      atajo: "Ctrl+O",
      grupo: "Archivo",
      pestana: "principal",
      tamano: "grande",
      habilitado: true,
      descripcion: "Abrir un modelo IFC",
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
      habilitado: true,
      descripcion: "Guardar el modelo",
      accion: a.guardar,
    },
    {
      id: "guardar-como",
      texto: "Guardar como",
      icono: SaveAll,
      atajo: "Ctrl+Shift+S",
      grupo: "Archivo",
      pestana: "principal",
      tamano: "chico",
      habilitado: true,
      descripcion: "Guardar el modelo en otro archivo",
      accion: a.guardarComo,
    },

    // ---------- Modelo / vistas ----------
    {
      id: "estilos",
      texto: "Estilos de objeto",
      icono: Layers,
      grupo: "Dibujo",
      pestana: "vista",
      tamano: "grande",
      habilitado: true,
      descripcion: "Editar plumillas, rellenos y materiales del dibujo",
      accion: a.estilosObjeto,
    },
    {
      id: "estilos-anotacion",
      texto: "Estilos de anotación",
      icono: Ruler,
      grupo: "Anotación",
      pestana: "vista",
      tamano: "grande",
      habilitado: true,
      descripcion: "Editar niveles, ejes y cotas del dibujo",
      accion: a.estilosAnotacion,
    },
    {
      id: "nuevo-corte",
      texto: "Nueva vista de corte",
      icono: Scissors,
      grupo: "Modelo",
      pestana: "vista",
      tamano: "grande",
      habilitado: true,
      descripcion: "Dibuje una línea con dos clics en una planta",
      accion: a.nuevaVistaCorte,
    },

    // ---------- Modelar (O003b) ----------
    {
      id: "nivel",
      texto: "Nivel",
      icono: Layers,
      atajo: "LL",
      grupo: "Datos",
      pestana: "modelar",
      tamano: "grande",
      habilitado: true,
      descripcion: "Crear un nivel y su vista de planta",
      accion: a.nuevoNivel,
    },
    {
      id: "eje",
      texto: "Eje",
      icono: Grid3X3,
      atajo: "GR",
      grupo: "Datos",
      pestana: "modelar",
      tamano: "grande",
      habilitado: true,
      activo: a.herramientaActiva === "eje",
      descripcion: "Dibujar un eje con dos clics",
      accion: a.nuevoEje,
    },
    {
      id: "ejes-separaciones",
      texto: "Ejes por separaciones",
      icono: Grid3X3,
      grupo: "Datos",
      pestana: "modelar",
      tamano: "grande",
      habilitado: true,
      descripcion: "Crear una retícula completa a partir de las distancias entre ejes",
      accion: a.nuevosEjesPorSeparaciones,
    },
    {
      id: "muro",
      texto: "Muro",
      icono: BrickWall,
      atajo: "WA",
      grupo: "Construir",
      pestana: "modelar",
      tamano: "grande",
      habilitado: true,
      activo: a.herramientaActiva === "muro",
      descripcion: "Dibujar muros encadenados",
      accion: a.herramientaMuro,
    },
    {
      id: "losa",
      texto: "Losa",
      icono: Square,
      atajo: "SB",
      grupo: "Construir",
      pestana: "modelar",
      tamano: "grande",
      habilitado: true,
      activo: a.herramientaActiva === "losa",
      descripcion: "Dibujar una losa por vértices o desde muros",
      accion: a.herramientaLosa,
      subitems: [
        {
          id: "losa-desde-muros",
          texto: "Desde muros",
          icono: Square,
          descripcion: "Crear la losa del circuito de muros seleccionado",
          accion: a.losaDesdeMuros,
        },
      ],
    },
    {
      id: "puerta",
      texto: "Puerta",
      icono: DoorOpen,
      atajo: "DR",
      grupo: "Construir",
      pestana: "modelar",
      tamano: "grande",
      habilitado: true,
      activo: a.herramientaActiva === "puerta",
      descripcion: "Colocar una puerta sobre un muro",
      accion: a.herramientaPuerta,
    },
    {
      id: "ventana",
      texto: "Ventana",
      icono: DoorOpen,
      atajo: "WN",
      grupo: "Construir",
      pestana: "modelar",
      tamano: "grande",
      habilitado: true,
      activo: a.herramientaActiva === "ventana",
      descripcion: "Colocar una ventana sobre un muro",
      accion: a.herramientaVentana,
    },
    // ---------- Estructura (O007b) ----------
    {
      id: "zapata",
      texto: "Zapata",
      icono: Box,
      grupo: "Estructura",
      pestana: "modelar",
      tamano: "chico",
      habilitado: true,
      activo: a.herramientaActiva === "zapata",
      descripcion: "Colocar una zapata aislada en un cruce de ejes",
      accion: a.herramientaZapata,
    },
    {
      id: "zapata-corrida",
      texto: "Zapata corrida",
      icono: RectangleHorizontal,
      grupo: "Estructura",
      pestana: "modelar",
      tamano: "chico",
      habilitado: true,
      activo: a.herramientaActiva === "zapata_corrida",
      descripcion: "Trazar una zapata corrida entre dos puntos",
      accion: a.herramientaZapataCorrida,
    },
    {
      id: "contratrabe",
      texto: "Contratrabe",
      icono: Frame,
      grupo: "Estructura",
      pestana: "modelar",
      tamano: "chico",
      habilitado: true,
      activo: a.herramientaActiva === "contratrabe",
      descripcion: "Trazar un contratrabe entre dos zapatas",
      accion: a.herramientaContratrabe,
    },
    {
      id: "columna",
      texto: "Columna",
      icono: Columns3,
      grupo: "Estructura",
      pestana: "modelar",
      tamano: "chico",
      habilitado: true,
      activo: a.herramientaActiva === "columna",
      descripcion: "Colocar una columna en un cruce de ejes; R gira 90°",
      accion: a.herramientaColumna,
    },
    {
      id: "castillo",
      texto: "Castillo",
      icono: Columns2,
      grupo: "Estructura",
      pestana: "modelar",
      tamano: "chico",
      habilitado: true,
      activo: a.herramientaActiva === "castillo",
      descripcion: "Colocar un castillo en un cruce de ejes; R gira 90°",
      accion: a.herramientaCastillo,
    },
    {
      id: "trabe",
      texto: "Trabe",
      icono: RectangleHorizontal,
      grupo: "Estructura",
      pestana: "modelar",
      tamano: "chico",
      habilitado: true,
      activo: a.herramientaActiva === "trabe",
      descripcion: "Trazar una trabe entre dos columnas",
      accion: a.herramientaTrabe,
    },
    {
      id: "castillos-automaticos",
      texto: "Castillos automáticos",
      icono: Columns2,
      grupo: "Estructura",
      pestana: "modelar",
      tamano: "chico",
      habilitado: true,
      descripcion: "Poner castillos en esquinas, remates e intermedios de los muros",
      accion: a.castillosAutomaticos,
    },
    {
      id: "cerramiento",
      texto: "Cerramiento en muro",
      icono: PanelTop,
      grupo: "Estructura",
      pestana: "modelar",
      tamano: "chico",
      habilitado: true,
      activo: a.herramientaActiva === "cerramiento",
      descripcion: "Clic sobre un muro: el cerramiento se liga a su eje",
      accion: a.herramientaCerramiento,
    },
    {
      id: "dala",
      texto: "Dala en muro",
      icono: Frame,
      grupo: "Estructura",
      pestana: "modelar",
      tamano: "chico",
      habilitado: true,
      activo: a.herramientaActiva === "dala",
      descripcion: "Clic sobre un muro: la dala se liga a su base",
      accion: a.herramientaDala,
    },
    {
      id: "unir-zapatas",
      texto: "Unir zapatas",
      icono: Frame,
      grupo: "Estructura",
      pestana: "modelar",
      tamano: "chico",
      habilitado: true,
      descripcion: "Contratrabes entre zapatas consecutivas sobre cada eje",
      accion: a.unirZapatas,
    },
    {
      id: "unir-trabes",
      texto: "Unir columnas",
      icono: RectangleHorizontal,
      grupo: "Estructura",
      pestana: "modelar",
      tamano: "chico",
      habilitado: true,
      descripcion: "Trabes entre columnas consecutivas sobre cada eje",
      accion: a.unirTrabes,
    },
    {
      id: "mover",
      texto: "Mover",
      icono: Move,
      atajo: "MV",
      grupo: "Modificar",
      pestana: "modelar",
      tamano: "chico",
      habilitado: true,
      activo: a.herramientaActiva === "mover",
      descripcion: "Mover la selección entre dos puntos",
      accion: a.herramientaMover,
    },
    {
      id: "copiar",
      texto: "Copiar",
      icono: Copy,
      atajo: "CO",
      grupo: "Modificar",
      pestana: "modelar",
      tamano: "chico",
      habilitado: true,
      activo: a.herramientaActiva === "copiar",
      descripcion: "Copiar la selección entre dos puntos",
      accion: a.herramientaCopiar,
    },
    {
      id: "borrar",
      texto: "Borrar",
      icono: Trash2,
      atajo: "Supr",
      grupo: "Modificar",
      pestana: "modelar",
      tamano: "chico",
      habilitado: true,
      descripcion: "Borrar los elementos seleccionados",
      accion: a.borrarSeleccion,
    },
    {
      id: "deshacer",
      texto: "Deshacer",
      icono: Undo2,
      atajo: "Ctrl+Z",
      grupo: "Historial",
      pestana: "modelar",
      tamano: "chico",
      habilitado: true,
      descripcion: "Deshacer el último comando",
      accion: a.deshacer,
    },
    {
      id: "rehacer",
      texto: "Rehacer",
      icono: Redo2,
      atajo: "Ctrl+Y",
      grupo: "Historial",
      pestana: "modelar",
      tamano: "chico",
      habilitado: true,
      descripcion: "Rehacer el último comando deshecho",
      accion: a.rehacer,
    },

    // ---------- Editor de tipos (O007a) ----------
    {
      id: "tipos",
      texto: "Tipos",
      icono: LibraryBig,
      grupo: "Editor",
      pestana: "modelar",
      tamano: "grande",
      habilitado: true,
      descripcion: "Editar los tipos de elemento y la biblioteca de materiales",
      accion: a.abrirTipos,
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
