// O065B: ayudas de edicion, trazos y refresco tras comandos.
import { bitacoraHerramienta } from "@/lib/bitacora";
import type { Elemento, Nivel, PropiedadesElemento, RespuestaInfo, RespuestaTeselado } from "../../tipos";
import type { ArbolObra, NodoArbol } from "../../arbol";
import { cajaDeMallas } from "../../vistas";
import { ejeOrtogonal, opcionesCerramientoEnVista, proyectarSobreSegmento, referenciasAlDia, restringirEje, siguienteEtiquetaEje, tramosDeCerramiento } from "../../herramientas";
import type { Punto2, Referencias } from "../../herramientas";
import type { Nota } from "../../anotaciones3d";
import { alturaPermitida, clasificarEmpujar, ladosRectangulo, puntosRectangulo } from "../../empujar";
import type { ClaseEmpujar, RectanguloEmpujar } from "../../empujar";
import type { Herramienta, LineaRecorte, TipoHerramienta, RespuestaComando } from "../tipos";
import { decodificarMalla, quitarPlantasHuerfanas } from "../utilidades";
import { rpc } from "../ipc";
import type { GetEstado, SetEstado } from "../tipos";
import type { AyudasCarga } from "./carga";

export function crearAyudasEdicion(
  set: SetEstado,
  get: GetEstado,
  carga: AyudasCarga,
) {
  const { cargarAberturas, cargarTiposEstructura, tipoDeHerramienta, persistirVistas } = carga;
  const refrescarDeComando = async (resultado: RespuestaComando) => {
    const tocados = [...new Set([...(resultado.creados ?? []), ...(resultado.modificados ?? [])])];
    const borrados = new Set(resultado.borrados ?? []);
    const [info, niveles, elementos, referenciasCrudas, teselado, arbol, arbolObra, notas] =
      await Promise.all([
      rpc<RespuestaInfo>("proyecto.info"),
      rpc<Nivel[]>("modelo.niveles"),
      rpc<Elemento[]>("modelo.elementos"),
      rpc<Referencias>("modelo.referencias"),
      tocados.length > 0
        ? rpc<RespuestaTeselado>("geometria.teselar", { globalids: tocados })
        : Promise.resolve(null),
      rpc<NodoArbol>("modelo.arbol").catch(() => get().arbol),
      get().arbolObraActivo
        ? rpc<ArbolObra>("modelo.arbol_obra").catch(() => get().arbolObra)
        : Promise.resolve(null),
      rpc<Nota[]>("notas.listar").catch(() => get().notas),
      ]);
    let mallas = get().mallas.filter(
      (m) => !borrados.has(m.globalid) && !tocados.includes(m.globalid),
    );
    if (teselado) mallas = [...mallas, ...teselado.elementos.map(decodificarMalla)];
    const referencias = referenciasAlDia(referenciasCrudas);
    const aberturas = await cargarAberturas(elementos, mallas, referencias);
    const seleccionados = get().seleccionados.filter((g) => !borrados.has(g));
    const seleccion = seleccionados[0] ?? null;
    set({
      totalElementos: info.elementos,
      conteos: info.por_clase,
      conCambios: info.con_cambios,
      niveles,
      elementos,
      referencias,
      mallas,
      caja: cajaDeMallas(mallas),
      aberturas,
      arbol,
      arbolObra,
      notas,
      seleccion,
      seleccionados,
      propiedades: seleccion ? get().propiedades : null,
      error: null,
      aviso: resultado.mensaje || get().aviso,
    });
    if (borrados.size > 0) {
      const antes = get().vistas;
      const vistas = quitarPlantasHuerfanas(antes, niveles);
      if (vistas.length !== antes.length) {
        const activa = get().vistaActivaId;
        set({
          vistas,
          vistaActivaId:
            vistas.find((v) => v.id === activa)?.id ??
            vistas.find((v) => v.tipo === "planta")?.id ??
            null,
        });
        await persistirVistas(vistas);
      }
    }
    if (seleccion && get().propiedades?.globalid !== seleccion) {
      await get().seleccionar(seleccion);
    }
    if (!seleccion) set({ propiedades: null });
  };

  const ejecutarResultado = async (
    metodo: string,
    params: Record<string, unknown> = {},
  ): Promise<RespuestaComando | null> => {
    try {
      const resultado = await rpc<RespuestaComando>(metodo, params);
      await refrescarDeComando(resultado);
      return resultado;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return null;
    }
  };

  const ejecutar = async (metodo: string, params: Record<string, unknown> = {}) => {
    return (await ejecutarResultado(metodo, params)) !== null;
  };

  /** ED1: línea de ubicación de un elemento lineal ya teselado. */
  const lineaDeElemento = (globalid: string): LineaRecorte | null => {
    const malla = get().mallas.find((m) => m.globalid === globalid);
    if (!malla) return null;
    if (malla.eje) {
      const [x1, y1, x2, y2] = malla.eje;
      return { x1, y1, x2, y2 };
    }
    const datos = malla.estructura?.datos as Record<string, unknown> | undefined;
    if (!datos || datos.X2 === undefined || datos.Y2 === undefined) return null;
    const x1 = Number(datos.X1 ?? datos.X);
    const y1 = Number(datos.Y1 ?? datos.Y);
    const x2 = Number(datos.X2);
    const y2 = Number(datos.Y2);
    if (![x1, y1, x2, y2].every((v) => Number.isFinite(v))) return null;
    return { x1, y1, x2, y2 };
  };

  const lineaDeEje = (globalid: string): LineaRecorte | null => {
    const eje = get().referencias.ejes.find((e) => e.globalid === globalid);
    return eje ? { x1: eje.x1, y1: eje.y1, x2: eje.x2, y2: eje.y2 } : null;
  };

  /** O033: tras un rechazo, recarga las propiedades sin borrar el aviso. */
  const refrescarPropiedades = async (globalid: string) => {
    const error = get().error;
    try {
      const propiedades = await rpc<PropiedadesElemento>("modelo.propiedades", {
        globalid,
      });
      set({ propiedades, error });
    } catch {
      /* si falla la recarga, se conserva el aviso original */
    }
  };

  const nivelActivo = () => {
    const vista = get().vistas.find((v) => v.id === get().vistaActivaId);
    return vista?.nivel ?? get().niveles[0]?.globalid;
  };

  /** O046: las medidas se escriben como en el diálogo (sin ceros sobrantes). */
  const medidaCorta = (valor: number): string =>
    valor
      .toFixed(3)
      .replace(/0+$/, "")
      .replace(/\.$/, "") || "0";

  /** O046: crea el sólido ya clasificado desde el rectángulo y la altura. */
  const crearSolidoEmpujar = async (
    rect: RectanguloEmpujar,
    altura: number,
  ): Promise<boolean> => {
    const nivel = nivelActivo();
    if (!nivel) {
      set({ aviso: "Cree antes un nivel." });
      return false;
    }
    const { menor, mayor } = ladosRectangulo(rect);
    if (menor < 0.01) {
      set({ aviso: "El rectángulo necesita ancho y largo mayores que cero." });
      return false;
    }
    // O049: el contorno puede vivir en la cara superior de otro elemento. El
    // sólido se liga al nivel activo con ese desfase vertical.
    const nivelEntidad = get().niveles.find((n) => n.globalid === nivel);
    const cotaEmpujar = get().empujarZ;
    const desfasePlano = cotaEmpujar === null
      ? 0
      : cotaEmpujar - (nivelEntidad?.elevacion ?? 0);
    const elegida = get().empujarClasificacion;
    const clase: ClaseEmpujar =
      elegida === "auto" ? clasificarEmpujar(rect, altura).clase : elegida;
    if (!alturaPermitida(clase, altura)) {
      set({
        aviso:
          altura < 0
            ? "La altura negativa solo se permite en Genérico."
            : "La altura debe ser distinta de cero.",
      });
      return false;
    }
    const h = Math.abs(altura);
    const ancho = Math.abs(rect.x2 - rect.x1);
    const largo = Math.abs(rect.y2 - rect.y1);
    const centroX = (rect.x1 + rect.x2) / 2;
    const centroY = (rect.y1 + rect.y2) / 2;

    if (clase === "losa") {
      // O049: el contorno es la base del sólido. La losa crece hacia arriba
      // desde el plano (igual que muro y columna), así que su cara superior
      // queda en el plano + espesor. Dibujar sobre una losa de 0.12 deja el
      // contorno a 0.12 y el sólido nuevo nace ahí.
      const ok = await ejecutar("losas.crear", {
        nivel,
        puntos: puntosRectangulo(rect),
        espesor: h,
        desfase: desfasePlano + h,
      });
      if (ok) set({ aviso: `Losa de ${h.toFixed(2)} m de espesor.` });
      return ok;
    }

    if (clase === "muro") {
      // El eje del muro va por el centro del rectángulo y a lo largo del lado mayor.
      const largoEnY = largo >= ancho;
      const x1 = largoEnY ? centroX : Math.min(rect.x1, rect.x2);
      const y1 = largoEnY ? Math.min(rect.y1, rect.y2) : centroY;
      const x2 = largoEnY ? centroX : Math.max(rect.x1, rect.x2);
      const y2 = largoEnY ? Math.max(rect.y1, rect.y2) : centroY;
      const tipos = get().tiposMuro;
      if (tipos.length === 0) {
        set({ aviso: "No hay tipos de muro en la biblioteca." });
        return false;
      }
      const tipo = tipos.reduce((mejor, candidato) =>
        Math.abs(Number(candidato.espesor) - menor) <
        Math.abs(Number(mejor.espesor) - menor)
          ? candidato
          : mejor,
      );
      const ok = await ejecutar("muros.crear", {
        tipo: tipo.nombre,
        nivel,
        x1,
        y1,
        x2,
        y2,
        altura: h,
        alineacion: "centro",
        desfase_base: desfasePlano,
      });
      if (ok) {
        const diferencia = Math.abs(Number(tipo.espesor) - menor);
        set({
          aviso:
            diferencia > 0.02
              ? `Se usó el tipo ${tipo.nombre} de ${Math.round(Number(tipo.espesor) * 100)} cm.`
              : `Muro de ${h.toFixed(2)} m de alto.`,
        });
      }
      return ok;
    }

    if (clase === "columna") {
      // R va en X con rotación 0; con el lado mayor en Y se gira π/2.
      const rotacion = ancho >= largo ? 0 : Math.PI / 2;
      // El perfil local es B × H; B corresponde al lado mayor y H al menor.
      const candidatos = get().tiposHerramienta.filter((t) => t.alias === "columna");
      let tipo = candidatos.find((t) => {
        const B = Number(t.seccion?.B ?? NaN);
        const H = Number(t.seccion?.H ?? NaN);
        return (
          Number.isFinite(B) &&
          Number.isFinite(H) &&
          Math.abs(B - mayor) <= 0.01 &&
          Math.abs(H - menor) <= 0.01
        );
      });
      if (!tipo) {
        const nombre = `Columna ${medidaCorta(menor)}×${medidaCorta(mayor)}`;
        const creado = await ejecutarResultado("tipos.crear", {
          clase: "columna",
          nombre,
          datos: {
            seccion: { Forma: "rectangular", B: mayor, H: menor, D: 0 },
          },
        });
        const datosTipo = creado?.tipo as { nombre?: string } | undefined;
        const nombreUsado = datosTipo?.nombre ?? nombre;
        const recargados = await cargarTiposEstructura();
        set({ tiposHerramienta: recargados });
        tipo = recargados.find((t) => t.nombre === nombreUsado && t.alias === "columna");
        if (!tipo) {
          set({ aviso: "No se pudo preparar el tipo de columna." });
          return false;
        }
      }
      const ok = await ejecutar("columnas.crear", {
        tipo: tipo.nombre,
        nivel,
        x: centroX,
        y: centroY,
        rotacion,
        altura: h,
        desfase: desfasePlano,
      });
      if (ok) set({ aviso: `Columna de ${h.toFixed(2)} m de alto.` });
      return ok;
    }

    const ok = await ejecutar("genericos.crear", {
      nivel,
      puntos: puntosRectangulo(rect),
      altura,
      nombre: "Genérico",
      desfase: desfasePlano,
    });
    if (ok) set({ aviso: `Genérico de ${h.toFixed(2)} m.` });
    return ok;
  };

  const crearMuroEntre = async (origen: Punto2, destino: Punto2): Promise<boolean> => {
    if (Math.hypot(destino[0] - origen[0], destino[1] - origen[1]) < 0.01) return false;
    const nivel = nivelActivo();
    if (!nivel) {
      set({ aviso: "Cree antes un nivel." });
      return false;
    }
    const opciones = get().opcionesMuro;
    const ok = await ejecutar("muros.crear", {
      tipo: opciones.tipo,
      nivel,
      x1: origen[0],
      y1: origen[1],
      x2: destino[0],
      y2: destino[1],
      altura: opciones.altura,
      alineacion: opciones.alineacion,
    linea_ubicacion: opciones.lineaUbicacion,
    desfase_ubicacion: opciones.desfaseUbicacion,
    });
    if (ok) {
      set({ puntosHerramienta: [destino], ...limpiarTrazoExtra() });
      bitacoraHerramienta("muro", "terminar", { x: destino[0], y: destino[1] });
    }
    return ok;
  };

  /** O045: cerramiento dibujado como un muro (inicio y fin, en cadena). */
  const crearCerramientoEntre = async (
    origen: Punto2,
    destino: Punto2,
  ): Promise<boolean> => {
    if (Math.hypot(destino[0] - origen[0], destino[1] - origen[1]) < 0.01) {
      return false;
    }
    const tipo = tipoEstructural("cerramiento");
    if (!tipo) return false;
    const vistaActiva = get().vistas.find((v) => v.id === get().vistaActivaId);
    const extras = opcionesCerramientoEnVista(
      vistaActiva,
      get().opcionesCerramiento,
      get().niveles,
    );
    // O045: se parte igual que en el núcleo: un cerramiento por muro colineal
    // (cortado en las juntas) y libres los tramos que no caen sobre un muro.
    const tramos = tramosDeCerramiento(
      get().referencias,
      origen[0],
      origen[1],
      destino[0],
      destino[1],
    );
    if (tramos.length === 0) return false;
    let creados = 0;
    for (const tramo of tramos) {
      const resultado = await ejecutarResultado("cerramientos.crear", {
        tipo: tipo.nombre,
        x1: tramo.x1,
        y1: tramo.y1,
        x2: tramo.x2,
        y2: tramo.y2,
        ...extras,
      });
      if (!resultado) {
        // O043/O045: el rechazo del núcleo (tramo ya ocupado) se muestra como aviso.
        // O057: tras el error se reinicia el trazo, sin conservar el primer punto
        // (si no, el clic siguiente dibujaría un tramo diagonal).
        set({
          puntosHerramienta: [],
          ...limpiarTrazoExtra(),
          aviso: get().error ?? "No se pudo crear el cerramiento.",
        });
        return false;
      }
      creados += resultado.creados.length;
    }
    if (creados === 0) {
      set({ puntosHerramienta: [], ...limpiarTrazoExtra() });
      return false;
    }
    set({ puntosHerramienta: [destino], ...limpiarTrazoExtra() });
    bitacoraHerramienta("cerramiento", "terminar", {
      x: destino[0], y: destino[1],
    });
    return true;
  };

  const tipoEstructural = (herramienta: Herramienta): TipoHerramienta | null => {
    const tipo = tipoDeHerramienta(
      herramienta,
      get().tiposHerramienta,
      get().tipoHerramienta,
    );
    if (!tipo) {
      set({ aviso: `No hay tipos de ${herramienta.replace(/_/g, " ")} en la biblioteca.` });
      return null;
    }
    return tipo;
  };

  const tipoZapataElegida = (): TipoHerramienta | null => {
    const zapatas = get().tiposHerramienta.filter((t) => t.alias === "zapata");
    const elegido = get().tipoZapata;
    return zapatas.find((t) => t.nombre === elegido) ?? zapatas[0] ?? null;
  };

  /** O007c: ejes que pasan por el punto de enganche (para guardar EjeA y EjeB). */
  const ejesEnPunto = (punto: Punto2): string[] => {
    const dentro = get().referencias.ejes.filter((eje) => {
      const proyeccion = proyectarSobreSegmento(
        punto,
        [eje.x1, eje.y1],
        [eje.x2, eje.y2],
      );
      return proyeccion.distancia <= 0.01 && proyeccion.t >= -1e-6 && proyeccion.t <= 1 + 1e-6;
    });
    return dentro.slice(0, 2).map((eje) => eje.globalid);
  };

  /** O007b: columna, castillo o zapata en un cruce de ejes. */
  const crearEstructuralPunto = async (
    herramienta: Herramienta,
    punto: Punto2,
  ): Promise<boolean> => {
    const tipo = tipoEstructural(herramienta);
    const nivel = nivelActivo();
    if (!tipo || !nivel) return false;
    const rotacion = (get().rotacionSiguiente * Math.PI) / 180;
    const metodo = herramienta === "zapata" ? "zapatas.crear" : "columnas.crear";
    const cruce =
      herramienta === "columna" || herramienta === "zapata"
        ? ejesEnPunto(punto)
        : [];
    const resultado = await ejecutarResultado(metodo, {
      tipo: tipo.nombre,
      nivel,
      x: punto[0],
      y: punto[1],
      rotacion,
      ...(cruce.length >= 2 ? { ejeA: cruce[0], ejeB: cruce[1] } : {}),
    });
    if (!resultado) return false;
    if (herramienta === "columna" && get().columnaConZapata) {
      const zapata = tipoZapataElegida();
      const columna = resultado.creados[0];
      if (zapata && columna) {
        const hecha = await ejecutarResultado("zapatas.bajo_columna", {
          tipo: zapata.nombre,
          columna,
        });
        if (!hecha) return false;
      }
    }
    set({
      aviso: `${tipo.nombre} colocado${herramienta === "columna" && get().columnaConZapata ? " con zapata" : ""}. R gira 90°.`,
    });
    bitacoraHerramienta(herramienta, "terminar", { x: punto[0], y: punto[1] });
    return true;
  };

  /** O007b: trabe, cerramiento, dala, contratrabe o zapata corrida entre dos puntos. */
  const crearEstructuralLineal = async (
    herramienta: Herramienta,
    origen: Punto2,
    destino: Punto2,
  ): Promise<boolean> => {
    if (Math.hypot(destino[0] - origen[0], destino[1] - origen[1]) < 0.01) return false;
    const tipo = tipoEstructural(herramienta);
    const nivel = nivelActivo();
    if (!tipo || !nivel) return false;
    const metodo = herramienta === "zapata_corrida"
      ? "zapatas_corridas.crear"
      : "vigas.crear";
    const ok = await ejecutar(metodo, {
      tipo: tipo.nombre,
      nivel,
      x1: origen[0],
      y1: origen[1],
      x2: destino[0],
      y2: destino[1],
    });
    if (ok) {
      set({ puntosHerramienta: [], ...limpiarTrazoExtra() });
      bitacoraHerramienta(herramienta, "terminar", {
        x: destino[0], y: destino[1],
      });
    }
    return ok;
  };

  const limpiarTrazoExtra = () => ({
    longitudTecleada: "",
    ratonHerramienta: null,
    engancheHerramienta: null,
  });

  const crearEjeEntre = async (
    origen: Punto2,
    destino: Punto2,
    libre = false,
  ): Promise<boolean> => {
    // O006d: con ejes previos y sin Ctrl/Alt, el eje se fuerza paralelo a la familia
    // más cercana y toma sus extremos; el segundo punto solo fija la distancia.
    // O036b: el eje pasa por el primer punto y va horizontal o vertical; el segundo
    // punto solo da la dirección dominante y el largo (también dentro de una familia).
    const ortogonal = ejeOrtogonal(origen, destino);
    const restriccion = restringirEje(origen, ortogonal.fin, get().referencias.ejes, libre);
    const forzado = restriccion ? null : ortogonal;
    const inicio = restriccion?.inicio ?? origen;
    const fin = restriccion?.fin ?? forzado!.fin;
    if (Math.hypot(fin[0] - inicio[0], fin[1] - inicio[1]) < 0.01) {
      set({ aviso: "El eje necesita dos puntos distintos." });
      return false;
    }
    const vertical = restriccion?.vertical ?? forzado!.vertical;
    // La etiqueta depende de la orientación del eje (números o letras), no de la
    // etiqueta que se mostrara para el eje anterior.
    const etiqueta = siguienteEtiquetaEje(get().referencias.ejes, vertical);
    const ok = await ejecutar("ejes.crear", {
      etiqueta,
      x1: inicio[0],
      y1: inicio[1],
      x2: fin[0],
      y2: fin[1],
    });
    if (ok) {
      const siguiente = siguienteEtiquetaEje(get().referencias.ejes, vertical);
      set({
        puntosHerramienta: [],
        etiquetaEje: siguiente,
        ejeLibre: false,
        ...limpiarTrazoExtra(),
        aviso: `Eje «${etiqueta}» creado. Siguiente: ${siguiente}.`,
      });
      bitacoraHerramienta("eje", "terminar", { x: fin[0], y: fin[1] });
    }
    return ok;
  };

  const moverSeleccion = async (origen: Punto2, destino: Punto2): Promise<boolean> => {
    const herramienta = get().herramienta;
    if (herramienta !== "mover" && herramienta !== "copiar") return false;
    if (get().seleccionados.length === 0) {
      set({ aviso: "Seleccione uno o varios elementos antes de mover o copiar." });
      return false;
    }
    const metodo = herramienta === "mover" ? "elementos.mover" : "elementos.copiar";
    const ok = await ejecutar(metodo, {
      globalids: get().seleccionados,
      dx: destino[0] - origen[0],
      dy: destino[1] - origen[1],
      dz: 0,
    });
    if (ok) {
      set({ puntosHerramienta: [], ...limpiarTrazoExtra() });
      bitacoraHerramienta(herramienta, "terminar", { x: destino[0], y: destino[1] });
    }
    return ok;
  };

  return {
    refrescarDeComando,
    ejecutarResultado,
    ejecutar,
    lineaDeElemento,
    lineaDeEje,
    refrescarPropiedades,
    nivelActivo,
    medidaCorta,
    crearSolidoEmpujar,
    crearMuroEntre,
    crearCerramientoEntre,
    tipoEstructural,
    tipoZapataElegida,
    ejesEnPunto,
    crearEstructuralPunto,
    crearEstructuralLineal,
    limpiarTrazoExtra,
    crearEjeEntre,
    moverSeleccion,
  };
}

export type AyudasEdicion = ReturnType<typeof crearAyudasEdicion>;
