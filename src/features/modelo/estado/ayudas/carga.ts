// O065B: ayudas de carga y guardado del modelo.
import { bitacoraHerramienta } from "@/lib/bitacora";
import { elegirDestinoIfc } from "@/lib/dialogos";
import { fijarEstadoNucleoCaido } from "../../nucleoCaido";
import type { Abertura, Elemento, ElementoMalla, Nivel, PropiedadesElemento, RespuestaInfo, RespuestaTeselado, Vista } from "../../tipos";
import type { ArbolObra, NodoArbol } from "../../arbol";
import { cajaDeMallas, completarVistasEstandar, crearVistas, migrarNivelesVisibles, normalizarVistas } from "../../vistas";
import { referenciasAlDia } from "../../herramientas";
import type { Punto2, Referencias } from "../../herramientas";
import { normalizarEstilos } from "../../estilos";
import type { Estilos } from "../../estilos";
import type { Nota } from "../../anotaciones3d";
import { construirAberturas } from "../../aberturas";
import { nivelEnElevacion, nombreNivelAutomatico } from "../../niveles";
import type { Herramienta, TipoHerramienta } from "../tipos";
import { ALIAS_HERRAMIENTA } from "../catalogo";
import { decodificarMalla, nombreDeRuta } from "../utilidades";
import { rpc } from "../ipc";
import type { GetEstado, SetEstado } from "../tipos";

export function crearAyudasCarga(set: SetEstado, get: GetEstado) {
  const cargarAberturas = async (
    elementos: Elemento[],
    mallas: ElementoMalla[],
    referencias: Referencias,
  ): Promise<Abertura[]> => {
    const ids = elementos
      .filter((e) => e.clase === "IfcDoor" || e.clase === "IfcWindow")
      .map((e) => e.globalid);
    if (ids.length === 0) return [];
    const propiedades = await Promise.all(
      ids.map((globalid) =>
        rpc<PropiedadesElemento>("modelo.propiedades", { globalid }).catch(() => null),
      ),
    );
    return construirAberturas(
      propiedades.filter((p): p is PropiedadesElemento => p !== null),
      mallas,
      referencias,
    );
  };

  const cargarTiposEstructura = async (): Promise<TipoHerramienta[]> => {
    const clases = ["IfcFootingType", "IfcColumnType", "IfcBeamType"];
    const listas = await Promise.all(
      clases.map((clase) =>
        rpc<TipoHerramienta[]>("tipos.listar", { clase }).catch(() => []),
      ),
    );
    return listas.flat().sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  };

  /** Tipo elegido por herramienta; si no hay, el primero de su alias. */
  const tipoDeHerramienta = (
    herramienta: Herramienta,
    tipos: TipoHerramienta[],
    elegidos: Partial<Record<Herramienta, string>>,
  ): TipoHerramienta | undefined => {
    const alias = ALIAS_HERRAMIENTA[herramienta];
    const candidatos = tipos.filter((t) => t.alias === alias);
    return candidatos.find((t) => t.nombre === elegidos[herramienta]) ?? candidatos[0];
  };

  /** O029: niveles y caras horizontales de losas/vigas como candidatos del imán. */
  const candidatosElevacionNivel = (): number[] => {
    const valores = get().niveles.map((n) => n.elevacion);
    for (const malla of get().mallas) {
      let zMin = Infinity;
      let zMax = -Infinity;
      for (let i = 2; i < malla.vertices.length; i += 3) {
        const z = malla.vertices[i];
        if (z < zMin) zMin = z;
        if (z > zMax) zMax = z;
      }
      if (Number.isFinite(zMin)) valores.push(zMin);
      if (Number.isFinite(zMax)) valores.push(zMax);
    }
    return valores;
  };

  const crearNivelDesdeHerramienta = async (punto: Punto2): Promise<boolean> => {
    const estado = get();
    const elevacion = punto[1];
    const opciones = estado.opcionesNivel;
    const nombre =
      opciones.nombreAutomatico || !opciones.nombre.trim()
        ? nombreNivelAutomatico(estado.niveles, elevacion)
        : opciones.nombre.trim();
    const repetido = nivelEnElevacion(estado.niveles, elevacion);
    if (repetido) {
      set({
        aviso: `Ya existe «${repetido.nombre}» a ${elevacion.toFixed(2)} m; no se crea.`,
      });
      return false;
    }
    const ok = await get().crearNivel(nombre, elevacion, {
      crearPlanta: opciones.crearPlanta,
    });
    if (!ok) return false;
    set({
      puntosHerramienta: [],
      ratonHerramienta: null,
      engancheHerramienta: null,
      longitudTecleada: "",
      cotasNivel: null,
      opcionesNivel: {
        ...opciones,
        // O029: se conserva el nombre del nivel recién creado; al mover el cursor
        // o teclear otra elevación, el automático se recalcula desde la posición.
        nombre: opciones.nombreAutomatico ? nombre : opciones.nombre,
        elevacionTexto: "",
      },
      aviso: `Nivel a ${elevacion.toFixed(2)} m creado.`,
    });
    bitacoraHerramienta("nivel", "terminar", { x: punto[0], y: elevacion });
    return true;
  };

  const cargar = async (info: RespuestaInfo) => {
    const inicio = performance.now();
    const [niveles, elementos, teselado, vistasCrudas, tipos, referenciasCrudas, estilosCrudos,
      tiposEstructura, arbol, arbolObra, notas] = await Promise.all([
        rpc<Nivel[]>("modelo.niveles"),
        rpc<Elemento[]>("modelo.elementos"),
        rpc<RespuestaTeselado>("geometria.teselar", { globalids: null }),
        rpc<unknown>("vistas.leer"),
        rpc<Array<{ globalid: string; nombre: string; espesor: number }>>("tipos.listar", {
          clase: "IfcWallType",
        }),
        rpc<Referencias>("modelo.referencias"),
        rpc<unknown>("estilos.leer").catch(() => null),
        cargarTiposEstructura(),
        rpc<NodoArbol>("modelo.arbol").catch(() => null),
        get().arbolObraActivo
          ? rpc<ArbolObra>("modelo.arbol_obra").catch(() => null)
          : Promise.resolve(null),
        rpc<Nota[]>("notas.listar").catch(() => []),
      ]);
    const mallas = teselado.elementos.map(decodificarMalla);
    const caja = cajaDeMallas(mallas);
    const referencias = referenciasAlDia(referenciasCrudas);
    const aberturas = await cargarAberturas(elementos, mallas, referencias);
    let vistas = normalizarVistas(vistasCrudas);
    let persistidas = vistas.length > 0;
    let migradas = false;
    if (vistas.length === 0) {
      vistas = crearVistas(niveles);
      persistidas = false;
    } else {
      // O005b: las vistas guardadas con todos los niveles marcados por omisión pasan a
      // mostrar solo el nivel de su planta.
      const migracion = migrarNivelesVisibles(vistas, niveles);
      vistas = migracion.vistas;
      migradas = migracion.cambiadas;
      // O031: completar los alzados y el 3D que falten en archivos guardados solo
      // con plantas; no marca la obra como modificada.
      vistas = completarVistasEstandar(vistas, niveles).vistas;
    }
    const activa =
      vistas.find((v) => v.tipo === "planta") ?? vistas[0] ?? null;
    // O063: abrir o crear un modelo devuelve la edición.
    fijarEstadoNucleoCaido(false);
    set({
      ruta: info.ruta,
      ajeno: info.ajeno === true,
      nombreArchivo: nombreDeRuta(info.ruta, info.nombre),
      esquema: info.esquema,
      conCambios: info.con_cambios || migradas,
      totalElementos: info.elementos,
      conteos: info.por_clase,
      niveles,
      elementos,
      mallas,
      caja,
      vistas,
      estilos: normalizarEstilos(estilosCrudos),
      aberturas,
      arbol,
      arbolObra,
      notas,
      vistasPersistidas: persistidas,
      vistaActivaId: activa?.id ?? null,
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
      tiposMuro: tipos,
      tiposHerramienta: tiposEstructura,
      tipoHerramienta: {},
      rotacionSiguiente: 0,
      referencias,
      herramienta: null,
      referenciaAlinear: null,
      alineando: null,
      puntosHerramienta: [],
      ratonHerramienta: null,
      engancheHerramienta: null,
      longitudTecleada: "",
      empujarRect: null,
      empujarAltura: null,
      empujarZ: null,
      empujarCara: null,
      opcionesMuro: {
        tipo: tipos.find((t) => t.nombre === "Block 15")?.nombre ?? tipos[0]?.nombre ?? "",
        altura: 2.6,
        alineacion: "centro",
        lineaUbicacion: "eje_nucleo",
        desfaseUbicacion: 0,
      },
      tiempoCargaMs: Math.round(performance.now() - inicio),
    });
    // La migración queda en memoria y se persiste en el siguiente guardado; no se
    // bloquea la apertura con una escritura extra del pset.
  };

  const persistirVistas = async (vistas: Vista[]) => {
    try {
      await rpc("vistas.guardar", { lista: vistas });
      set({ vistasPersistidas: true, error: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  };

  const persistirEstilos = async (estilos: Estilos) => {
    await rpc("estilos.guardar", { estilos });
    set({ estilos, conCambios: true, error: null });
  };

  const guardarEn = async (ruta: string | null, como: boolean): Promise<boolean> => {
    const estado = get();
    if (!ruta && !estado.ruta) {
      const elegida = await elegirDestinoIfc(estado.nombreArchivo.replace(/\.ifc$/i, ""));
      if (!elegida) return false;
      ruta = elegida;
    }
    try {
      set({ cargando: true, error: null });
      // Las vistas automáticas también se escriben en el pset al guardar.
      await rpc("vistas.guardar", { lista: estado.vistas });
      await rpc("estilos.guardar", { estilos: estado.estilos });
      const info = await rpc<RespuestaInfo>("proyecto.guardar", {
        ruta: como || !estado.ruta ? ruta : null,
      });
      set({
        ruta: info.ruta,
        nombreArchivo: nombreDeRuta(info.ruta, info.nombre),
        esquema: info.esquema,
        conCambios: info.con_cambios,
        totalElementos: info.elementos,
        conteos: info.por_clase,
        vistasPersistidas: true,
        cargando: false,
        error: null,
      });
      return true;
    } catch (e) {
      set({ cargando: false, error: e instanceof Error ? e.message : String(e) });
      return false;
    }
  };

  return {
    cargarAberturas,
    cargarTiposEstructura,
    tipoDeHerramienta,
    candidatosElevacionNivel,
    crearNivelDesdeHerramienta,
    cargar,
    persistirVistas,
    persistirEstilos,
    guardarEn,
  };
}

export type AyudasCarga = ReturnType<typeof crearAyudasCarga>;
