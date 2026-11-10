// O065B: slice «herramientas» del store (movido tal cual desde estado.ts).
import { bitacoraHerramienta } from "@/lib/bitacora";
import { ejeConDistancia, puntoConLongitud, puntoDibujo } from "../../herramientas";
import type { Punto2 } from "../../herramientas";
import { parsearAltura, parsearDimensiones, rectanguloDesdeDimensiones } from "../../empujar";
import { cotasTemporalesNivel, elevacionDesdeCota, engancheElevacionNivel, nombreNivelAutomatico } from "../../niveles";
import type { Herramienta } from "../tipos";
import { esHerramientaLineal } from "../catalogo";
import type { EstadoModelo, GetEstado, SetEstado } from "../tipos";
import type { Ayudas } from "../ayudas";

export function crearSliceHerramientas(
  set: SetEstado,
  get: GetEstado,
  h: Ayudas,
): Pick<EstadoModelo, "activarHerramienta" | "cancelarHerramienta" | "girar90" | "fijarEtiquetaEje" | "fijarRatonHerramienta" | "teclearLongitud" | "confirmarLongitud" | "cancelarLongitud" | "voltearAbertura"> {
  const { candidatosElevacionNivel, crearNivelDesdeHerramienta, crearMuroEntre, crearCerramientoEntre, crearEstructuralLineal, crearEjeEntre, moverSeleccion } = h;
  return {
    activarHerramienta: (herramienta) => {
      const vista = get().vistas.find((v) => v.id === get().vistaActivaId);
      if (herramienta === "nivel") {
        if (!vista || (vista.tipo !== "alzado" && vista.tipo !== "corte")) {
          set({ aviso: "Abre un alzado o corte" });
          return;
        }
      } else if (herramienta === "empujar") {
        if (!vista || (vista.tipo !== "iso" && vista.tipo !== "perspectiva")) {
          set({ aviso: "Empujar/Tirar: solo en 3D." });
          return;
        }
      } else if (
        !vista ||
        (vista.tipo !== "planta" &&
          herramienta !== "alinear" &&
          herramienta !== "nota" &&
          !(
            (herramienta === "mover" || herramienta === "copiar") &&
            (vista.tipo === "alzado" || vista.tipo === "corte")
          ))
      ) {
        set({ aviso: "Las herramientas de modelado solo trabajan en una vista de planta." });
        return;
      }
      if (get().herramienta === herramienta) {
        get().cancelarHerramienta();
        return;
      }
      const nombres: Record<Herramienta, string> = {
        muro: "Muro: primer punto en la planta.",
        losa: "Losa: clic por vértice. Clic en el primero, Enter o doble clic para cerrar.",
        puerta: "Puerta: clic sobre un muro. Espacio voltea el lado.",
        ventana: "Ventana: clic sobre un muro. Espacio voltea el lado.",
        eje: "Eje: dos clics. La etiqueta se asigna sola.",
        mover: "Mover: punto base y punto destino.",
        copiar: "Copiar: punto base y punto destino.",
        zapata: "Zapata: un clic en un cruce de ejes. R gira 90°.",
        zapata_corrida: "Zapata corrida: dos clics a lo largo del trazo.",
        contratrabe: "Contratrabe: dos clics entre zapatas.",
        columna: "Columna: un clic en un cruce de ejes. R gira 90°.",
        castillo: "Castillo: clic sobre un muro o en un cruce de ejes. R gira 90°.",
        trabe: "Trabe: dos clics entre columnas.",
        cerramiento: "Cerramiento: primer punto en la planta.",
        dala: "Dala de desplante: clic sobre un muro.",
        alinear: "Alinear: clic en la referencia (eje, nivel o cara) y luego en la cara del elemento.",
        nivel: "Nivel: dos clics horizontales; la elevación se engancha o se teclea.",
        recortar_extender: "Recortar/Extender: haga clic en el primer elemento.",
        espejo: "Espejo: clic en un eje o en un elemento lineal; o dos puntos del eje.",
        matriz: "Matriz: lineal con dos puntos o polar con un clic en el centro.",
        empujar: "Empujar/Tirar: clic en una esquina del nivel activo; luego la opuesta.",
        nota: "Nota: clic en el punto donde va el texto; Enter confirma y Esc cancela.",
      };
      const conservarSeleccion =
        herramienta === "mover" ||
        herramienta === "copiar" ||
        herramienta === "losa" ||
        herramienta === "espejo" ||
        herramienta === "matriz";
      set({
        herramienta,
        referenciaAlinear: null,
        alineando: null,
        referenciaRecorte: null,
        recorteInicial: null,
        vistaPreviaRecorte: null,
        puntosHerramienta: [],
        ratonHerramienta: null,
        engancheHerramienta: null,
        longitudTecleada: "",
        empujarRect: null,
        empujarAltura: null,
        empujarZ: null,
        empujarCara: null,
        ejeLibre: false,
        modoCorte: false,
        puntoCorte: null,
        cotasNivel: null,
        ...(conservarSeleccion
          ? {}
          : { seleccion: null, seleccionados: [], propiedades: null }),
        aviso: nombres[herramienta],
      });
      bitacoraHerramienta(herramienta, "activar");
    },

    cancelarHerramienta: () => {
      const herramienta = get().herramienta;
      set({
        herramienta: null,
        nivelSeleccionado: null,
        referenciaAlinear: null,
        alineando: null,
        referenciaRecorte: null,
        recorteInicial: null,
        vistaPreviaRecorte: null,
        puntosHerramienta: [],
        ratonHerramienta: null,
        engancheHerramienta: null,
        longitudTecleada: "",
        empujarRect: null,
        empujarAltura: null,
        empujarZ: null,
        empujarCara: null,
        ejeLibre: false,
        etiquetaEje: "",
        opcionesNivel: { ...get().opcionesNivel, elevacionTexto: "" },
        cotasNivel: null,
        aviso: null,
      });
      if (herramienta) bitacoraHerramienta(herramienta, "cancelar");
    },

    girar90: () =>
      set({ rotacionSiguiente: (get().rotacionSiguiente + 90) % 360 }),

    fijarEtiquetaEje: (etiqueta) => set({ etiquetaEje: etiqueta }),

    fijarRatonHerramienta: (punto, shift = false, metrosPorPixel) => {
      const herramienta = get().herramienta;
      if (!herramienta || !punto) {
        set({ ratonHerramienta: null, engancheHerramienta: null });
        return;
      }
      const puntos = get().puntosHerramienta;
      if (herramienta === "nivel") {
        const z = engancheElevacionNivel(punto[1], candidatosElevacionNivel());
        const p: Punto2 = [punto[0], z];
        const cotas = cotasTemporalesNivel(z, get().niveles);
        const opciones = get().opcionesNivel;
        set({
          ratonHerramienta: p,
          engancheHerramienta: { punto: p, tipo: "cuadricula" },
          cotasNivel: { inferior: cotas.inferior, superior: cotas.superior },
          opcionesNivel: opciones.nombreAutomatico
            ? { ...opciones, nombre: nombreNivelAutomatico(get().niveles, z) }
            : opciones,
        });
        return;
      }
      if (herramienta === "puerta" || herramienta === "ventana") {
        set({ ratonHerramienta: punto, engancheHerramienta: null });
        return;
      }
      const enganche = puntoDibujo(
        punto,
        get().referencias,
        puntos.length > 0 ? puntos[puntos.length - 1] : null,
        // O036b: el eje no se ajusta a 15°; su dirección la decide la dominante.
        herramienta === "eje" ? true : shift,
        metrosPorPixel,
      );
      set({ ratonHerramienta: enganche.punto, engancheHerramienta: enganche });
    },

    teclearLongitud: (tecla) => {
      const herramienta = get().herramienta;
      if (!herramienta || herramienta === "puerta" || herramienta === "ventana") return;
      // O029: con un nivel seleccionado en el alzado, Copiar/Mover acepta el
      // desfase vertical tecleado sin pedir puntos en planta.
      if (
        (herramienta === "copiar" || herramienta === "mover") &&
        get().nivelSeleccionado &&
        get().seleccionados.length === 0
      ) {
        const campo = get().longitudTecleada;
        let siguiente = campo;
        if (tecla === "Backspace") siguiente = campo.slice(0, -1);
        else if ((tecla === "," || tecla === ".") && !campo.includes(".")) {
          siguiente = `${campo || "0"}.`;
        } else if (tecla === "-" && campo === "") siguiente = "-";
        else if (/^\d$/.test(tecla)) {
          siguiente = `${campo}${tecla}`.replace(/^(-?)0(?=\d)/, "$1");
        }
        set({ longitudTecleada: siguiente });
        return;
      }
      if (herramienta === "empujar") {
        const campo = get().longitudTecleada;
        if (get().puntosHerramienta.length === 0 && !get().empujarCara) return;
        let siguiente = campo;
        if (tecla === "Backspace") siguiente = campo.slice(0, -1);
        else if (tecla === "-" && campo === "") siguiente = "-";
        else if (tecla === "," || tecla === ";") {
          if (!campo.includes(",") && !campo.includes(";")) siguiente = `${campo}${tecla}`;
        } else if (tecla === ".") {
          const ultimo = campo.split(/[,;]/).pop() ?? "";
          if (!ultimo.includes(".")) siguiente = `${campo}.`;
        } else if (tecla === " ") {
          if (campo !== "" && !campo.endsWith(" ")) siguiente = `${campo} `;
        } else if (/^\d$/.test(tecla)) {
          siguiente = `${campo}${tecla}`;
        }
        set({ longitudTecleada: siguiente });
        return;
      }
      if (get().puntosHerramienta.length === 0) return;
      if (herramienta === "nivel") {
        // O029: la cota temporal se teclea relativa al nivel inferior.
        const campo = get().opcionesNivel.elevacionTexto;
        let siguiente = campo;
        if (tecla === "Backspace") siguiente = campo.slice(0, -1);
        else if (tecla === "," || tecla === ".") {
          if (!campo.includes(".")) siguiente = `${campo || "0"}.`;
        } else if (/^\d$/.test(tecla)) {
          siguiente = `${campo}${tecla}`.replace(/^0(?=\d)/, "");
        }
        set({
          opcionesNivel: { ...get().opcionesNivel, elevacionTexto: siguiente },
          longitudTecleada: siguiente,
        });
        return;
      }
      if (tecla === "Backspace") {
        set({ longitudTecleada: get().longitudTecleada.slice(0, -1) });
        return;
      }
      if (tecla === "," || tecla === ".") {
        if (!get().longitudTecleada.includes(".")) {
          set({ longitudTecleada: `${get().longitudTecleada || "0"}.` });
        }
        return;
      }
      if (/^\d$/.test(tecla)) {
        set({ longitudTecleada: `${get().longitudTecleada}${tecla}`.replace(/^0(?=\d)/, "") });
      }
    },

    confirmarLongitud: async (shift = false) => {
      const herramienta = get().herramienta;
      const puntos = get().puntosHerramienta;
      // O046: Enter con «ancho,largo» cierra el contorno; con la altura tecleada
      // confirma el sólido. Sin texto, Enter usa la altura que sigue al ratón.
      if (herramienta === "empujar") {
        const texto = get().longitudTecleada.trim();
        const cara = get().empujarCara;
        if (cara) {
          const distancia = texto === "" ? cara.distancia : parsearAltura(texto);
          if (distancia === null || Math.abs(distancia) < 1e-9) {
            set({
              aviso:
                texto === ""
                  ? "Empujar/Tirar: falta la distancia."
                  : "Distancia no válida: escriba un número distinto de cero.",
            });
            return;
          }
          set({
            empujarCara: { ...cara, distancia },
            longitudTecleada: "",
          });
          await get().confirmarEmpujarCara();
          return;
        }
        if (!get().empujarRect) {
          const primero = puntos[0];
          if (!primero) return;
          const dimensiones = parsearDimensiones(texto);
          if (!dimensiones) {
            set({ aviso: "Escriba ancho,largo en metros, por ejemplo 4,0.15." });
            return;
          }
          const rect = rectanguloDesdeDimensiones(
            primero,
            dimensiones,
            get().ratonHerramienta ?? primero,
          );
          set({
            empujarRect: rect,
            longitudTecleada: "",
            aviso: "Empujar/Tirar: mueva el ratón para la altura o téclela y Enter.",
          });
          return;
        }
        const altura = texto === "" ? get().empujarAltura : parsearAltura(texto);
        if (altura === null) {
          set({
            aviso:
              texto === ""
                ? "Empujar/Tirar: falta la altura."
                : "Altura no válida: escriba un número distinto de cero.",
          });
          return;
        }
        set({ empujarAltura: altura, longitudTecleada: "" });
        await get().confirmarEmpujar();
        return;
      }
      // O029: nivel seleccionado en el alzado + Copiar/Mover + desfase tecleado.
      if (
        (herramienta === "copiar" || herramienta === "mover") &&
        get().nivelSeleccionado &&
        get().seleccionados.length === 0
      ) {
        const texto = get().longitudTecleada.replace(",", ".");
        const desfase = Number(texto);
        const nivel = get().niveles.find((n) => n.globalid === get().nivelSeleccionado);
        if (!nivel) {
          set({ aviso: "Elija el nivel que se copia." });
          return;
        }
        if (texto === "" || !Number.isFinite(desfase) || Math.abs(desfase) <= 0.001) {
          set({ aviso: "Escriba un desfase distinto de cero y Enter." });
          return;
        }
        const ok =
          herramienta === "copiar"
            ? await get().copiarNivel(nivel.globalid, desfase)
            : await get().editarNivel(nivel.globalid, nivel.nombre, nivel.elevacion + desfase);
        if (ok) {
          set({
            longitudTecleada: "",
            aviso: `Nivel «${nivel.nombre}» ${herramienta === "copiar" ? "copiado" : "movido"} ${desfase.toFixed(2)} m.`,
          });
        }
        return;
      }
      if (!herramienta || puntos.length === 0) return;
      if (herramienta === "nivel") {
        const cotas = cotasTemporalesNivel(
          get().ratonHerramienta?.[1] ?? puntos[puntos.length - 1][1],
          get().niveles,
        );
        const texto = get().opcionesNivel.elevacionTexto || get().longitudTecleada;
        let z: number | null;
        if (texto.trim() === "") {
          z = get().ratonHerramienta?.[1] ?? puntos[puntos.length - 1][1];
        } else {
          z = elevacionDesdeCota(cotas.inferior, texto);
          if (z === null) {
            set({ aviso: "Cota no válida: escriba un número, por ejemplo 0.50." });
            return;
          }
        }
        const x = get().ratonHerramienta?.[0] ?? puntos[puntos.length - 1][0];
        await crearNivelDesdeHerramienta([x, z]);
        return;
      }
      if (herramienta === "losa") {
        // O050: con longitud tecleada, Enter agrega el vértice a esa distancia;
        // con el campo vacío, cierra el polígono.
        const texto = get().longitudTecleada.replace(",", ".");
        const longitud = Number(texto);
        if (texto !== "" && Number.isFinite(longitud) && longitud > 0) {
          const origen = puntos[puntos.length - 1];
          const raton = get().ratonHerramienta ?? origen;
          const destino = puntoConLongitud(origen, raton, longitud, shift);
          if (Math.hypot(destino[0] - origen[0], destino[1] - origen[1]) > 0.001) {
            set({
              puntosHerramienta: [...puntos, destino],
              longitudTecleada: "",
              aviso: `Losa: ${puntos.length + 1} vértices. Clic en el primero, Enter o doble clic para cerrar.`,
            });
          }
          return;
        }
        await get().dobleClicEnPlanta();
        return;
      }
      const texto = get().longitudTecleada.replace(",", ".");
      const longitud = Number(texto);
      const tieneLongitud = texto !== "" && Number.isFinite(longitud) && longitud > 0;
      // Enter sin longitud termina en el punto del cursor; en Muro se conserva el
      // comportamiento de O003b (solo la longitud tecleada cierra el tramo).
      if (!tieneLongitud && (herramienta === "muro" || esHerramientaLineal(herramienta))) {
        return;
      }
      const origen = puntos[puntos.length - 1];
      const raton = get().ratonHerramienta ?? (puntos.length > 1 ? puntos[puntos.length - 1] : null);
      if (!tieneLongitud && !raton) return;
      const destino = tieneLongitud
        ? puntoConLongitud(origen, raton ?? origen, longitud, shift)
        : (raton as Punto2);
      if (herramienta === "muro") {
        await crearMuroEntre(origen, destino);
        return;
      }
      if (herramienta === "cerramiento") {
        await crearCerramientoEntre(origen, destino);
        return;
      }
      if (esHerramientaLineal(herramienta)) {
        await crearEstructuralLineal(herramienta, origen, destino);
        return;
      }
      if (herramienta === "eje") {
        const libre = get().ejeLibre || shift;
        if (tieneLongitud) {
          // O006d: la distancia tecleada manda respecto del paralelo más cercano.
          const restriccion = ejeConDistancia(
            origen,
            raton ?? origen,
            get().referencias.ejes,
            longitud,
            libre,
          );
          if (restriccion) {
            await crearEjeEntre(restriccion.inicio, restriccion.fin, true);
            return;
          }
        }
        await crearEjeEntre(puntos[0], destino, libre);
        return;
      }
      if (herramienta === "mover" || herramienta === "copiar") {
        await moverSeleccion(puntos[0], destino);
      }
    },

    cancelarLongitud: () => set({ longitudTecleada: "" }),

    voltearAbertura: () => set({ voltearSiguiente: !get().voltearSiguiente }),

  };
}
