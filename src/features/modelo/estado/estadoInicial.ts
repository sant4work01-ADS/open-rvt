// O065B: valores iniciales del store (movidos tal cual desde estado.ts).
import type { ArbolObra } from "../arbol";
import { REFERENCIAS_VACIAS } from "../herramientas";
import { estilosPorDefecto } from "../estilos";
import { CAJA_VACIA } from "./utilidades";
import { rpc } from "./ipc";
import type { EstadoModelo, GetEstado, SetEstado } from "./tipos";

export function crearEstadoInicial(
  set: SetEstado,
  get: GetEstado,
): Pick<EstadoModelo, "ruta" | "nombreArchivo" | "esquema" | "conCambios" | "totalElementos" | "conteos" | "niveles" | "elementos" | "mallas" | "caja" | "vistas" | "estilos" | "aberturas" | "arbol" | "arbolObra" | "notas" | "notaSeleccionada" | "arbolObraActivo" | "fijarArbolObraActivo" | "ajustarToken" | "vistaActivaId" | "ejeSeleccionado" | "nivelSeleccionado" | "seleccion" | "seleccionados" | "propiedades" | "cargando" | "error" | "aviso" | "nucleoCaido" | "avisoNucleo" | "pistaTab" | "modoCorte" | "puntoCorte" | "preguntaGuardar" | "ajeno" | "preguntaAjeno" | "tiempoCargaMs" | "vistasPersistidas" | "dialogoEstilos" | "dialogoCotas" | "dialogoAnotacion" | "editorTipos" | "editorTipoInicial" | "herramienta" | "referenciaAlinear" | "alineando" | "modoRecorte" | "referenciaRecorte" | "recorteInicial" | "vistaPreviaRecorte" | "opcionesMuro" | "opcionesLosa" | "opcionesCerramiento" | "opcionesNivel" | "opcionesEspejo" | "opcionesMatriz" | "cotasNivel" | "tiposMuro" | "tiposHerramienta" | "tipoHerramienta" | "rotacionSiguiente" | "columnaConZapata" | "tipoZapata" | "dialogoCastillos" | "preguntaZapata" | "referencias" | "puntosHerramienta" | "ratonHerramienta" | "engancheHerramienta" | "longitudTecleada" | "empujarClasificacion" | "empujarRect" | "empujarAltura" | "empujarZ" | "empujarCara" | "ejeLibre" | "voltearSiguiente" | "etiquetaEje" | "cotasMoverSiguientes"> {
  return {
    ruta: null,
    nombreArchivo: "",
    esquema: "",
    conCambios: false,
    totalElementos: 0,
    conteos: {},
    niveles: [],
    elementos: [],
    mallas: [],
    caja: CAJA_VACIA,
    vistas: [],
    estilos: estilosPorDefecto(),
    aberturas: [],
    arbol: null,
    arbolObra: null,
    notas: [],
    notaSeleccionada: null,
    arbolObraActivo: false,
    fijarArbolObraActivo: (activo) => {
      if (get().arbolObraActivo === activo) return;
      set({ arbolObraActivo: activo, ...(activo ? {} : { arbolObra: null }) });
      if (activo) {
        void rpc<ArbolObra>("modelo.arbol_obra")
          .then((arbolObra) => {
            if (get().arbolObraActivo) set({ arbolObra });
          })
          .catch(() => undefined);
      }
    },
    ajustarToken: 0,
    vistaActivaId: null,
    ejeSeleccionado: null,
    nivelSeleccionado: null,
    seleccion: null,
    seleccionados: [],
    propiedades: null,
    cargando: false,
    error: null,
    aviso: null,
    nucleoCaido: false,
    avisoNucleo: null,
    pistaTab: null,
    modoCorte: false,
    puntoCorte: null,
    preguntaGuardar: null,
    ajeno: false,
    preguntaAjeno: null,
    tiempoCargaMs: null,
    vistasPersistidas: false,
    dialogoEstilos: false,
    dialogoCotas: false,
    dialogoAnotacion: false,
  editorTipos: false,
  editorTipoInicial: null,
    herramienta: null,
    referenciaAlinear: null,
    alineando: null,
    modoRecorte: "esquina",
    referenciaRecorte: null,
    recorteInicial: null,
    vistaPreviaRecorte: null,
    opcionesMuro: {
      tipo: "",
      altura: 2.6,
      alineacion: "centro",
      lineaUbicacion: "eje_nucleo",
      desfaseUbicacion: 0,
    },
    opcionesLosa: { lado: "exterior", desfase: 0, uso: "entrepiso" },
    opcionesCerramiento: { nivel: "", desfase: "" },
    opcionesNivel: { nombre: "", nombreAutomatico: true, crearPlanta: true, elevacionTexto: "" },
    opcionesEspejo: { copiar: true },
    opcionesMatriz: { modo: "lineal", numero: 3, alUltimo: false, angulo: 360 },
    cotasNivel: null,
    tiposMuro: [],
    tiposHerramienta: [],
    tipoHerramienta: {},
    rotacionSiguiente: 0,
    columnaConZapata: false,
    tipoZapata: "",
    dialogoCastillos: false,
    preguntaZapata: null,
    referencias: REFERENCIAS_VACIAS,
    puntosHerramienta: [],
    ratonHerramienta: null,
    engancheHerramienta: null,
    longitudTecleada: "",
    empujarClasificacion: "auto",
    empujarRect: null,
    empujarAltura: null,
    empujarZ: null,
    empujarCara: null,
    ejeLibre: false,
    voltearSiguiente: false,
    etiquetaEje: "",
    cotasMoverSiguientes: true,

  };
}
