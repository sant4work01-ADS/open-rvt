// Diálogos nativos del sistema (abrir/guardar archivos). Se aísla aquí para poder
// simularlo en las pruebas.
import { open, save } from "@tauri-apps/plugin-dialog";
import { tr } from "@/i18n";

const FILTRO_OBRA = () => [
  { name: tr("comun.obra-de-presupuestospro", "Obra de PresupuestosPro"), extensions: ["obra"] },
];

/** Petición que recibe la costura de pruebas E2E (WebDriver no puede manejar diálogos
 * nativos de GTK; quien automatiza define `window.__PP_DIALOGO_PRUEBAS__` para decidir
 * la ruta sin tocar la interfaz). En uso normal no existe y se usa el diálogo real. */
export interface PeticionDialogo {
  tipo:
    | "abrir-obra"
    | "abrir-respaldo-opus"
    | "guardar-obra"
    | "guardar-excel"
    | "abrir-excel"
    | "guardar-pdf"
    | "carpeta"
    | "guardar-json"
    | "abrir-json"
    | "guardar-zip"
    | "abrir-ifc"
    | "guardar-ifc"
    | "guardar-medicion";
  titulo: string;
  /** Nombre de archivo sugerido (solo en los de guardar). */
  predeterminado: string;
}

/** Respaldo de OPUS (.zip/.bak) o base (.mdf) para importar. */
export async function elegirRespaldoOpus(titulo: string): Promise<string | null> {
  const f = window.__PP_DIALOGO_PRUEBAS__;
  if (f) return f({ tipo: "abrir-respaldo-opus", titulo, predeterminado: "" });
  const r = await open({
    multiple: false,
    directory: false,
    title: titulo,
    filters: [
      { name: tr("comun.respaldo-de-opus", "Respaldo de OPUS"), extensions: ["zip", "bak", "mdf"] },
    ],
  });
  return typeof r === "string" ? r : null;
}

export async function elegirObraParaAbrir(): Promise<string | null> {
  const f = window.__PP_DIALOGO_PRUEBAS__;
  if (f)
    return f({
      tipo: "abrir-obra",
      titulo: tr("comun.abrir-obra", "Abrir obra"),
      predeterminado: "",
    });
  const r = await open({ multiple: false, directory: false, filters: FILTRO_OBRA() });
  return typeof r === "string" ? r : null;
}

export async function elegirDestinoObra(nombreSugerido: string): Promise<string | null> {
  const f = window.__PP_DIALOGO_PRUEBAS__;
  if (f)
    return f({
      tipo: "guardar-obra",
      titulo: tr("comun.guardar-obra", "Guardar obra"),
      predeterminado: `${nombreSugerido}.obra`,
    });
  const r = await save({ defaultPath: `${nombreSugerido}.obra`, filters: FILTRO_OBRA() });
  if (!r) return null;
  return r.toLowerCase().endsWith(".obra") ? r : `${r}.obra`;
}

/** Destino de una copia de una versión guardada. */
export async function elegirDestinoCopia(nombreSugerido: string): Promise<string | null> {
  const f = window.__PP_DIALOGO_PRUEBAS__;
  if (f)
    return f({
      tipo: "guardar-obra",
      titulo: tr("comun.guardar-copia", "Guardar copia"),
      predeterminado: `${nombreSugerido}.obra`,
    });
  const r = await save({ defaultPath: `${nombreSugerido}.obra`, filters: FILTRO_OBRA() });
  if (!r) return null;
  return r.toLowerCase().endsWith(".obra") ? r : `${r}.obra`;
}

/** Carpeta cualquiera (p. ej. la del catálogo universal). */
export async function elegirCarpeta(titulo: string): Promise<string | null> {
  const f = window.__PP_DIALOGO_PRUEBAS__;
  if (f) return f({ tipo: "carpeta", titulo, predeterminado: "" });
  const r = await open({ multiple: false, directory: true, title: titulo });
  return typeof r === "string" ? r : null;
}

/** Archivo de Excel (.xlsx) para leer. */
export async function elegirExcelParaLeer(titulo: string): Promise<string | null> {
  const f = window.__PP_DIALOGO_PRUEBAS__;
  if (f) return f({ tipo: "abrir-excel", titulo, predeterminado: "" });
  const r = await open({
    multiple: false,
    directory: false,
    title: titulo,
    filters: [{ name: tr("comun.libro-de-excel", "Libro de Excel"), extensions: ["xlsx", "xlsm"] }],
  });
  return typeof r === "string" ? r : null;
}

/** Destino de una exportación a Excel (.xlsx). */
export async function elegirDestinoExcel(nombreSugerido: string): Promise<string | null> {
  const f = window.__PP_DIALOGO_PRUEBAS__;
  if (f)
    return f({
      tipo: "guardar-excel",
      titulo: tr("ribbon.comandos.exportar-excel", "Exportar a Excel"),
      predeterminado: `${nombreSugerido}.xlsx`,
    });
  const r = await save({
    defaultPath: `${nombreSugerido}.xlsx`,
    filters: [
      { name: tr("comun.libro-de-excel-2", "Libro de Excel"), extensions: ["xlsx", "xlsm"] },
    ],
  });
  if (!r) return null;
  return r.toLowerCase().endsWith(".xlsx") ? r : `${r}.xlsx`;
}

/** Destino de una exportación a PDF (.pdf). */
export async function elegirDestinoPdf(nombreSugerido: string): Promise<string | null> {
  const f = window.__PP_DIALOGO_PRUEBAS__;
  if (f)
    return f({
      tipo: "guardar-pdf",
      titulo: tr("comun.exportar-a-pdf", "Exportar a PDF"),
      predeterminado: `${nombreSugerido}.pdf`,
    });
  const r = await save({
    defaultPath: `${nombreSugerido}.pdf`,
    filters: [{ name: tr("comun.documento-pdf", "Documento PDF"), extensions: ["pdf"] }],
  });
  if (!r) return null;
  return r.toLowerCase().endsWith(".pdf") ? r : `${r}.pdf`;
}

/** Destino de una exportación a JSON (.obra.json). */
export async function elegirDestinoJson(nombreSugerido: string): Promise<string | null> {
  const f = window.__PP_DIALOGO_PRUEBAS__;
  if (f)
    return f({
      tipo: "guardar-json",
      titulo: tr("comun.exportar-json", "Exportar JSON"),
      predeterminado: `${nombreSugerido}.obra.json`,
    });
  const r = await save({
    defaultPath: `${nombreSugerido}.obra.json`,
    filters: [{ name: tr("comun.obra-en-json", "Obra en JSON"), extensions: ["json"] }],
  });
  if (!r) return null;
  return r.toLowerCase().endsWith(".obra.json") ? r : `${r}.obra.json`;
}

/** Archivo JSON (.obra.json) para leer. */
export async function elegirJsonParaAbrir(titulo: string): Promise<string | null> {
  const f = window.__PP_DIALOGO_PRUEBAS__;
  if (f) return f({ tipo: "abrir-json", titulo, predeterminado: "" });
  const r = await open({
    multiple: false,
    directory: false,
    title: titulo,
    filters: [{ name: tr("comun.obra-en-json-2", "Obra en JSON"), extensions: ["json"] }],
  });
  return typeof r === "string" ? r : null;
}

/** Destino de una exportación del registro del asistente (.zip). */
export async function elegirDestinoZip(nombreSugerido: string): Promise<string | null> {
  const f = window.__PP_DIALOGO_PRUEBAS__;
  if (f)
    return f({
      tipo: "guardar-zip",
      titulo: tr("asistente.exportar-registro", "Exportar registro"),
      predeterminado: `${nombreSugerido}.zip`,
    });
  const r = await save({
    defaultPath: `${nombreSugerido}.zip`,
    filters: [{ name: tr("comun.archivo-zip", "Archivo ZIP"), extensions: ["zip"] }],
  });
  if (!r) return null;
  return r.toLowerCase().endsWith(".zip") ? r : `${r}.zip`;
}

/** Destino de la medición para PresupuestosPro (.openrvt-medicion.json). */
export async function elegirDestinoMedicion(nombreSugerido: string): Promise<string | null> {
  const f = window.__PP_DIALOGO_PRUEBAS__;
  if (f)
    return f({
      tipo: "guardar-medicion",
      titulo: tr("comun.exportar-a-presupuestospro", "Exportar a PresupuestosPro"),
      predeterminado: `${nombreSugerido}.openrvt-medicion.json`,
    });
  const r = await save({
    defaultPath: `${nombreSugerido}.openrvt-medicion.json`,
    filters: [
      {
        name: tr("comun.medicion-openrvt", "Medición de OPEN-RVT"),
        extensions: ["json"],
      },
    ],
  });
  if (!r) return null;
  return r.toLowerCase().endsWith(".openrvt-medicion.json")
    ? r
    : `${r}.openrvt-medicion.json`;
}

/** Archivo IFC para abrir (modelo del núcleo). */
export async function elegirIfcParaAbrir(titulo?: string): Promise<string | null> {
  const f = window.__PP_DIALOGO_PRUEBAS__;
  if (f)
    return f({
      tipo: "abrir-ifc",
      titulo: titulo ?? tr("comun.abrir-modelo", "Abrir modelo IFC"),
      predeterminado: "",
    });
  const r = await open({
    multiple: false,
    directory: false,
    title: titulo ?? tr("comun.abrir-modelo", "Abrir modelo IFC"),
    filters: [{ name: tr("comun.modelo-ifc", "Modelo IFC"), extensions: ["ifc"] }],
  });
  return typeof r === "string" ? r : null;
}

/** Destino de un modelo IFC (.ifc). */
export async function elegirDestinoIfc(nombreSugerido: string): Promise<string | null> {
  const f = window.__PP_DIALOGO_PRUEBAS__;
  if (f)
    return f({
      tipo: "guardar-ifc",
      titulo: tr("comun.guardar-modelo", "Guardar modelo IFC"),
      predeterminado: `${nombreSugerido}.ifc`,
    });
  const r = await save({
    defaultPath: `${nombreSugerido}.ifc`,
    filters: [{ name: tr("comun.modelo-ifc", "Modelo IFC"), extensions: ["ifc"] }],
  });
  if (!r) return null;
  return r.toLowerCase().endsWith(".ifc") ? r : `${r}.ifc`;
}
