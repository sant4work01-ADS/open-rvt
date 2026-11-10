// O065B: la partición del store de estado no puede perder ni una acción, ni desconectar
// ninguna puerta de entrada. La lista de claves y de módulos se copió del estado.ts de
// main ANTES de partir (no se generó a partir del resultado).
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipc } from "@/lib/ipc";
import { useModelo } from "./estado";
import type {
  AlineacionActiva,
  AlineacionMuro,
  BloqueEjesReticula,
  Herramienta,
  LineaRecorte,
  ModoRecorte,
  OpcionesCerramiento,
  OpcionesEspejo,
  OpcionesLosa,
  OpcionesMatriz,
  OpcionesMuro,
  OpcionesNivel,
  ReferenciaAlinear,
  ReferenciaRecorte,
  RespuestaComando,
  RespuestaGuardar,
  TipoHerramienta,
  UsoLosa,
} from "./estado";
import type { Vista } from "./tipos";

vi.mock("@/lib/ipc", () => ({
  ipc: { nucleoLlamar: vi.fn() },
}));

vi.mock("@/lib/dialogos", () => ({
  elegirDestinoIfc: vi.fn(async () => null),
  elegirIfcParaAbrir: vi.fn(async () => null),
}));

const nucleo = vi.mocked(ipc.nucleoLlamar);
const raiz = resolve(process.cwd(), "src/features/modelo");
const estadoTs = resolve(raiz, "estado.ts");

// Claves exactas de EstadoModelo en main (1492..3765 de estado.ts, 203 claves).
const CLAVES = [
  "ruta", "nombreArchivo", "esquema", "conCambios", "totalElementos", "conteos",
  "niveles", "elementos", "mallas", "caja", "vistas", "estilos",
  "aberturas", "arbol", "arbolObra", "notas", "notaSeleccionada", "arbolObraActivo",
  "fijarArbolObraActivo", "ajustarToken", "vistaActivaId", "ejeSeleccionado", "nivelSeleccionado", "seleccion",
  "seleccionados", "propiedades", "cargando", "error", "aviso", "nucleoCaido",
  "avisoNucleo", "pistaTab", "modoCorte", "puntoCorte", "preguntaGuardar", "tiempoCargaMs",
  "vistasPersistidas", "dialogoEstilos", "dialogoCotas", "dialogoAnotacion", "editorTipos", "editorTipoInicial",
  "herramienta", "referenciaAlinear", "alineando", "modoRecorte", "referenciaRecorte", "recorteInicial",
  "vistaPreviaRecorte", "opcionesMuro", "opcionesLosa", "opcionesCerramiento", "opcionesNivel", "opcionesEspejo",
  "opcionesMatriz", "cotasNivel", "tiposMuro", "tiposHerramienta", "tipoHerramienta", "rotacionSiguiente",
  "columnaConZapata", "tipoZapata", "dialogoCastillos", "preguntaZapata", "referencias", "puntosHerramienta",
  "ratonHerramienta", "engancheHerramienta", "longitudTecleada", "empujarClasificacion", "empujarRect", "empujarAltura",
  "empujarZ", "empujarCara", "ejeLibre", "voltearSiguiente", "etiquetaEje", "cotasMoverSiguientes",
  "fijarCotasMoverSiguientes", "nuevo", "abrir", "guardar", "guardarComo", "preguntarGuardar",
  "responderGuardar", "asegurarSinCambios", "fijarVista", "fijarEjeSeleccionado", "fijarNivelSeleccionado", "actualizarVista",
  "duplicarVista", "eliminarVista", "fijarAjustesEjes", "fijarAjustesNiveles", "guardarEstilos", "abrirDialogoEstilos",
  "cerrarDialogoEstilos", "abrirDialogoAnotacion", "cerrarDialogoAnotacion", "abrirDialogoCotas", "cerrarDialogoCotas", "abrirEditorTipos",
  "cerrarEditorTipos", "aplicarTipoEdicion", "recargarTipos", "seleccionar", "seleccionarVarios", "alternarNodoArbol",
  "aislarNodoArbol", "mostrarTodoArbol", "moverPartidaObra", "crearCapituloObra", "renombrarCapituloObra", "moverCapituloObra",
  "borrarCapituloObra", "pedirAjustar", "iniciarCorte", "cancelarCorte", "anadirPuntoCorte", "limpiarAviso",
  "fijarAviso", "fijarPistaTab", "marcarNucleoCaido", "cerrarAvisoNucleo", "reactivarEdicion", "activarHerramienta",
  "cancelarHerramienta", "elegirReferenciaAlinear", "aplicarAlinear", "alternarCandadoAlinear", "fijarModoRecorte", "clicRecorte",
  "previsualizarRecorte", "terminarRecorteExtender", "cancelarTrazo", "fijarOpcionesMuro", "fijarOpcionesLosa", "fijarOpcionesEspejo",
  "fijarOpcionesMatriz", "fijarOpcionesCerramiento", "voltearMuro", "fijarTipoHerramienta", "fijarClasificacionEmpujar", "fijarAlturaEmpujar",
  "moverEmpujar", "clicEmpujar", "confirmarEmpujar", "iniciarEmpujarCara", "moverEmpujarCara", "confirmarEmpujarCara",
  "fijarColumnaConZapata", "fijarTipoZapata", "abrirDialogoCastillos", "cerrarDialogoCastillos", "preguntarZapata", "responderZapata",
  "girar90", "fijarEtiquetaEje", "fijarOpcionesNivel", "clicNivel", "fijarRatonHerramienta", "teclearLongitud",
  "confirmarLongitud", "cancelarLongitud", "clicEnPlanta", "dobleClicEnPlanta", "voltearAbertura", "borrarSeleccion",
  "deshacer", "rehacer", "crearNota", "editarNota", "moverNota", "borrarNota",
  "seleccionarNota", "validar", "crearNivel", "copiarNivel", "arregloNiveles", "editarNivel",
  "borrarNivel", "crearEje", "crearEjesPorSeparaciones", "crearReticula", "editarRebase", "separarEjes",
  "separarNiveles", "editarEje", "moverEje", "borrarEje", "losaDesdeMuros", "castillosAutomaticos",
  "columnasEnCruces", "unirZapatas", "zapatasEnCruces", "contratrabesEntreEjes", "murosEntreEjes", "soltarEnlace",
  "soltarDelMuro", "unirTrabes", "editarElemento", "editarRestricciones", "editarRestriccionesVarios", "comprobarNucleo",
];

const MODULOS = [
  "estado/tipos.ts",
  "estado/catalogo.ts",
  "estado/utilidades.ts",
  "estado/ipc.ts",
  "estado/estadoInicial.ts",
  "estado/ayudas/index.ts",
  "estado/ayudas/carga.ts",
  "estado/ayudas/edicion.ts",
  "estado/slices/proyecto.ts",
  "estado/slices/vistas.ts",
  "estado/slices/tipos.ts",
  "estado/slices/seleccion.ts",
  "estado/slices/arbol.ts",
  "estado/slices/corte.ts",
  "estado/slices/avisos.ts",
  "estado/slices/herramientas.ts",
  "estado/slices/opciones.ts",
  "estado/slices/empujar.ts",
  "estado/slices/estructuraHerramientas.ts",
  "estado/slices/trazos.ts",
  "estado/slices/clicPlanta.ts",
  "estado/slices/edicion.ts",
  "estado/slices/notas.ts",
  "estado/slices/niveles.ts",
  "estado/slices/ejes.ts",
  "estado/slices/estructura.ts",
];

function lineas(ruta: string): number {
  return readFileSync(ruta, "utf8").split("\n").length;
}

// El compilador es el que comprueba los tipos; aquí solo se usan para que tsc exija
// que estado.ts siga exportándolos.
export type _TiposReexportados = [
  AlineacionActiva, AlineacionMuro, BloqueEjesReticula, Herramienta, LineaRecorte,
  ModoRecorte, OpcionesCerramiento, OpcionesEspejo, OpcionesLosa, OpcionesMatriz,
  OpcionesMuro, OpcionesNivel, ReferenciaAlinear, ReferenciaRecorte, RespuestaComando,
  RespuestaGuardar, TipoHerramienta, UsoLosa,
];

function vistaPlanta(nivel = "N1"): Vista {
  return {
    id: "planta",
    nombre: "Planta baja",
    tipo: "planta",
    nivel,
    alturaPlano: 0,
    nivelesVisibles: [nivel],
    categorias: {
      muros: true,
      losas: true,
      columnas: true,
      vigas: true,
      puertas: true,
      ventanas: true,
      cubiertas: true,
      escaleras: true,
      otros: true,
    },
    estilo: "lineas-ocultas",
    escala: 100,
  };
}

describe("O065B — partición del store", () => {
  it("estado.ts queda como índice de menos de 600 líneas y cada módulo respeta el tope", () => {
    expect(existsSync(estadoTs)).toBe(true);
    for (const modulo of MODULOS) {
      const ruta = resolve(raiz, modulo);
      expect(existsSync(ruta), `falta ${modulo}`).toBe(true);
      expect(lineas(ruta), `${modulo} pasa de 1000 líneas`).toBeLessThanOrEqual(1000);
    }
    expect(lineas(estadoTs), "estado.ts debe ser el índice, no el store").toBeLessThanOrEqual(600);
  });

  it("el store conserva exactamente las 203 claves de main (ninguna acción se perdió)", () => {
    expect(Object.keys(useModelo.getState()).sort()).toEqual([...CLAVES].sort());
  });

  it("los valores públicos de la partición siguen exportados y equivalen a main", async () => {
    const estado = await import("./estado");
    expect(estado.ALIAS_HERRAMIENTA.columna).toBe("columna");
    expect(estado.HERRAMIENTAS_ESTRUCTURA).toEqual([
      "zapata", "zapata_corrida", "contratrabe", "columna", "castillo",
      "trabe", "cerramiento", "dala",
    ]);
    expect(estado.esHerramientaEstructura("columna")).toBe(true);
    expect(estado.esHerramientaEstructura("muro")).toBe(false);
    expect(estado.esHerramientaLineal("cerramiento")).toBe(true);
    expect(estado.esHerramientaPuntual("castillo")).toBe(true);
    const plantas = [vistaPlanta()];
    expect(estado.plantaUnicaDeNivel(plantas, plantas[0])).toBe(true);
    expect(
      estado.quitarPlantasHuerfanas(plantas, [{ globalid: "N2", nombre: "Nivel 2", elevacion: 3 }]),
    ).toEqual(plantas);
  });
});

describe("O065B — flujo completo a través del índice", () => {
  let niveles = [{ globalid: "N1", nombre: "Nivel 1", elevacion: 0 }];

  beforeEach(() => {
    niveles = [{ globalid: "N1", nombre: "Nivel 1", elevacion: 0 }];
    nucleo.mockReset();
    nucleo.mockImplementation(async (metodo: string, crudo: unknown = {}) => {
      const params = (crudo ?? {}) as Record<string, unknown>;
      if (metodo === "niveles.crear") {
        const globalid = `N${niveles.length + 1}`;
        niveles = [
          ...niveles,
          {
            globalid,
            nombre: String(params.nombre),
            elevacion: Number(params.elevacion),
          },
        ];
        return {
          creados: [globalid],
          modificados: [],
          borrados: [],
          mensaje: `Nivel «${params.nombre}» creado.`,
          nivel: { globalid },
        };
      }
      if (metodo === "niveles.editar") {
        niveles = niveles.map((n) =>
          n.globalid === params.globalid
            ? { ...n, nombre: String(params.nombre), elevacion: Number(params.elevacion) }
            : n,
        );
        return {
          creados: [],
          modificados: [params.globalid],
          borrados: [],
          mensaje: "Nivel editado.",
        };
      }
      if (metodo === "proyecto.info") {
        return {
          ruta: "modelo.ifc",
          nombre: "modelo",
          esquema: "IFC4",
          elementos: 0,
          por_clase: {},
          con_cambios: true,
        };
      }
      if (metodo === "modelo.niveles") return niveles;
      if (metodo === "modelo.elementos") return [];
      if (metodo === "modelo.referencias") {
        return { muros: [], extremos: [], medios: [], ejes: [], intersecciones: [] };
      }
      if (metodo === "modelo.arbol") return null;
      if (metodo === "geometria.teselar") return { elementos: [] };
      if (metodo === "vistas.leer") return [vistaPlanta()];
      return {};
    });

    useModelo.setState({
      ruta: "modelo.ifc",
      nombreArchivo: "modelo.ifc",
      esquema: "IFC4",
      conCambios: false,
      niveles: [{ globalid: "N1", nombre: "Nivel 1", elevacion: 0 }],
      elementos: [],
      mallas: [],
      vistas: [{ ...vistaPlanta(), tipo: "alzado", id: "alzado" }],
      vistaActivaId: "alzado",
      seleccionados: [],
      herramienta: null,
      puntosHerramienta: [],
      ratonHerramienta: null,
      engancheHerramienta: null,
      longitudTecleada: "",
      opcionesNivel: {
        nombre: "",
        nombreAutomatico: true,
        crearPlanta: true,
        elevacionTexto: "",
      },
      referencias: { muros: [], extremos: [], medios: [], ejes: [], intersecciones: [] },
      aviso: null,
      error: null,
    });
  });

  it("herramienta Nivel → clic → acción crearNivel → estado y aviso; luego editar el nivel anterior", async () => {
    const estado = useModelo.getState();
    estado.activarHerramienta("nivel");
    // Primer clic: solo arma el trazo (la cota se imanta a 3.00 m con paso 0.05).
    await useModelo.getState().clicNivel([0, 3]);
    expect(useModelo.getState().puntosHerramienta).toEqual([[0, 3]]);
    expect(useModelo.getState().opcionesNivel.nombre).toBe("Nivel 2");

    // Segundo clic: crea el nivel en el núcleo (nombre automático Nivel 2) y relee.
    await useModelo.getState().clicNivel([0, 3]);
    expect(nucleo).toHaveBeenCalledWith("niveles.crear", {
      nombre: "Nivel 2",
      elevacion: 3,
      crear_planta: true,
      vistas: [expect.objectContaining({ id: "alzado" })],
    });
    expect(useModelo.getState().niveles).toEqual([
      { globalid: "N1", nombre: "Nivel 1", elevacion: 0 },
      { globalid: "N2", nombre: "Nivel 2", elevacion: 3 },
    ]);
    expect(useModelo.getState().aviso).toBe("Nivel a 3.00 m creado.");

    // Secuencia: se edita el nivel anterior y el estado y el reporte lo reflejan.
    await useModelo.getState().editarNivel("N2", "Azotea", 3.5);
    expect(nucleo).toHaveBeenCalledWith("niveles.editar", {
      globalid: "N2",
      nombre: "Azotea",
      elevacion: 3.5,
    });
    expect(useModelo.getState().niveles[1]).toEqual({
      globalid: "N2",
      nombre: "Azotea",
      elevacion: 3.5,
    });
    expect(useModelo.getState().aviso).toBe("Nivel editado.");
  });

  it("borde: la misma puerta rechaza un nivel a la misma cota", async () => {
    useModelo.getState().activarHerramienta("nivel");
    await useModelo.getState().clicNivel([0, 3]);
    await useModelo.getState().clicNivel([0, 3]);
    const llamadasAntes = nucleo.mock.calls.filter(([m]) => m === "niveles.crear").length;

    await useModelo.getState().clicNivel([1, 3]);
    await useModelo.getState().clicNivel([1, 3]);

    expect(useModelo.getState().aviso).toBe(
      "Ya existe «Nivel 2» a 3.00 m; no se crea.",
    );
    expect(
      nucleo.mock.calls.filter(([m]) => m === "niveles.crear").length,
    ).toBe(llamadasAntes);
    expect(useModelo.getState().niveles).toHaveLength(2);
  });
});
