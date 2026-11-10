// O065B: slice «clicPlanta» del store (movido tal cual desde estado.ts).
import { bitacoraHerramienta } from "@/lib/bitacora";
import { areaPoligono, colocarAbertura, ejeBajoPunto, esCierreLosa, muroBajoPunto, proyectarSobreSegmento, puntoDibujo } from "../../herramientas";
import type { Punto2 } from "../../herramientas";
import { cotasTemporalesNivel, engancheElevacionNivel, nombreNivelAutomatico } from "../../niveles";
import { esHerramientaLineal, esHerramientaPuntual } from "../catalogo";
import type { EstadoModelo, GetEstado, SetEstado } from "../tipos";
import type { Ayudas } from "../ayudas";

export function crearSliceClicPlanta(
  set: SetEstado,
  get: GetEstado,
  h: Ayudas,
): Pick<EstadoModelo, "clicNivel" | "clicEnPlanta" | "dobleClicEnPlanta"> {
  const { candidatosElevacionNivel, crearNivelDesdeHerramienta, ejecutarResultado, ejecutar, crearMuroEntre, crearCerramientoEntre, tipoEstructural, crearEstructuralPunto, crearEstructuralLineal, limpiarTrazoExtra, crearEjeEntre, moverSeleccion } = h;
  return {
    clicNivel: async (punto) => {
      const herramienta = get().herramienta;
      if (herramienta !== "nivel") return;
      const vista = get().vistas.find((v) => v.id === get().vistaActivaId);
      if (!vista || (vista.tipo !== "alzado" && vista.tipo !== "corte")) {
        set({ aviso: "Abre un alzado o corte" });
        return;
      }
      const z = engancheElevacionNivel(punto[1], candidatosElevacionNivel());
      const p: Punto2 = [punto[0], z];
      bitacoraHerramienta("nivel", "punto", { x: p[0], y: p[1] });
      const puntos = get().puntosHerramienta;
      if (puntos.length === 0) {
        const cotas = cotasTemporalesNivel(z, get().niveles);
        const nombre = get().opcionesNivel.nombreAutomatico
          ? nombreNivelAutomatico(get().niveles, z)
          : get().opcionesNivel.nombre;
        set({
          puntosHerramienta: [p],
          ratonHerramienta: p,
          engancheHerramienta: { punto: p, tipo: "cuadricula" },
          cotasNivel: { inferior: cotas.inferior, superior: cotas.superior },
          opcionesNivel: { ...get().opcionesNivel, nombre },
          aviso: "Nivel: segundo clic, o escriba la cota y Enter.",
        });
        return;
      }
      await crearNivelDesdeHerramienta(p);
    },

    clicEnPlanta: async (punto, shift = false, agregar = false, metrosPorPixel) => {
      const herramienta = get().herramienta;
      const vista = get().vistas.find((v) => v.id === get().vistaActivaId);
      if (!herramienta) {
        await get().seleccionar(null);
        return;
      }
      const nivel = vista?.nivel ?? get().niveles[0]?.globalid;
      if (!nivel) {
        set({ aviso: "Cree antes un nivel." });
        return;
      }
      const puntos = get().puntosHerramienta;
      const enganche = puntoDibujo(
        punto,
        get().referencias,
        puntos.length > 0 ? puntos[puntos.length - 1] : null,
        // O036b: el eje no se ajusta a 15°; su dirección la decide la dominante.
        herramienta === "eje" ? true : shift,
        metrosPorPixel,
      );
      const p = enganche.punto;
      bitacoraHerramienta(herramienta, "punto", { x: p[0], y: p[1] });
      if (herramienta === "espejo") {
        if (get().seleccionados.length === 0) {
          set({ aviso: "Seleccione uno o varios elementos antes de reflejarlos." });
          return;
        }
        const elegido = puntos.length === 0 ? ejeBajoPunto(get().referencias, p) : null;
        const origen = elegido ? elegido.p1 : puntos[0];
        const fin = elegido ? elegido.p2 : p;
        if (!elegido && puntos.length === 0) {
          set({
            puntosHerramienta: [p],
            aviso: "Espejo: segundo punto del eje o clic sobre un eje/arista.",
          });
          return;
        }
        const ok = await ejecutar("elementos.espejo", {
          globalids: get().seleccionados,
          p1: origen,
          p2: fin,
          copiar: get().opcionesEspejo.copiar,
        });
        if (ok) {
          set({ puntosHerramienta: [], ...limpiarTrazoExtra() });
          bitacoraHerramienta("espejo", "terminar", { x: p[0], y: p[1] });
        }
        return;
      }
      if (herramienta === "matriz") {
        if (get().seleccionados.length === 0) {
          set({ aviso: "Seleccione uno o varios elementos antes de crear la matriz." });
          return;
        }
        const opciones = get().opcionesMatriz;
        if (opciones.modo === "polar") {
          const ok = await ejecutar("elementos.matriz_polar", {
            globalids: get().seleccionados,
            centro: p,
            angulo_total: opciones.angulo,
            numero: opciones.numero,
          });
          if (ok) {
            set({ puntosHerramienta: [], ...limpiarTrazoExtra() });
            bitacoraHerramienta("matriz", "terminar", { x: p[0], y: p[1] });
          }
          return;
        }
        if (puntos.length === 0) {
          set({
            puntosHerramienta: [p],
            aviso: "Matriz lineal: segundo punto del vector.",
          });
          return;
        }
        const ok = await ejecutar("elementos.matriz_lineal", {
          globalids: get().seleccionados,
          vector: [p[0] - puntos[0][0], p[1] - puntos[0][1]],
          numero: opciones.numero,
          modo: opciones.alUltimo ? "al_ultimo" : "al_segundo",
        });
        if (ok) {
          set({ puntosHerramienta: [], ...limpiarTrazoExtra() });
          bitacoraHerramienta("matriz", "terminar", { x: p[0], y: p[1] });
        }
        return;
      }
      if (herramienta === "castillo") {
        const bajo = muroBajoPunto(get().referencias, p, 0.35);
        if (bajo) {
          const largo = Math.hypot(
            bajo.muro.x2 - bajo.muro.x1,
            bajo.muro.y2 - bajo.muro.y1,
          );
          const t = proyectarSobreSegmento(
            p,
            [bajo.muro.x1, bajo.muro.y1],
            [bajo.muro.x2, bajo.muro.y2],
          ).t;
          const tipo = tipoEstructural("castillo");
          if (!tipo) return;
          await ejecutar("castillos.crear_en_muro", {
            tipo: tipo.nombre,
            muro: bajo.muro.globalid,
            distancia: Number((t * largo).toFixed(6)),
          });
          return;
        }
      }
      if (herramienta === "cerramiento") {
        if (puntos.length === 0) {
          set({
            puntosHerramienta: [p],
            aviso: "Cerramiento: segundo punto o longitud y Enter.",
          });
          return;
        }
        await crearCerramientoEntre(puntos[puntos.length - 1], p);
        return;
      }
      if (herramienta === "dala") {
        const bajo = muroBajoPunto(get().referencias, p, 0.35);
        if (bajo) {
          const tipo = tipoEstructural(herramienta);
          if (!tipo) return;
          await ejecutarResultado("dalas.crear_en_muro", {
            tipo: tipo.nombre,
            muro: bajo.muro.globalid,
          });
          return;
        }
      }
      if (esHerramientaPuntual(herramienta)) {
        await crearEstructuralPunto(herramienta, p);
        return;
      }
      if (esHerramientaLineal(herramienta)) {
        if (puntos.length === 0) {
          set({
            puntosHerramienta: [p],
            aviso: `${herramienta.replace(/_/g, " ")}: segundo punto o longitud y Enter.`,
          });
          return;
        }
        await crearEstructuralLineal(herramienta, puntos[puntos.length - 1], p);
        return;
      }
      if (herramienta === "muro") {
        if (puntos.length === 0) {
          set({ puntosHerramienta: [p], aviso: "Muro: segundo punto o longitud y Enter." });
          return;
        }
        await crearMuroEntre(puntos[puntos.length - 1], p);
        return;
      }
      if (herramienta === "losa") {
        // O050: clic sobre el primer vértice (12 px) cierra; nunca se agrega el
        // vértice de cierre al contorno.
        if (esCierreLosa(puntos, p, metrosPorPixel ?? 0)) {
          await get().dobleClicEnPlanta();
          return;
        }
        const repetido =
          puntos.length > 0 &&
          Math.hypot(p[0] - puntos[puntos.length - 1][0], p[1] - puntos[puntos.length - 1][1]) <
            0.01;
        if (!repetido) {
          set({
            puntosHerramienta: [...puntos, p],
            aviso: `Losa: ${puntos.length + 1} vértices. Clic en el primero, Enter o doble clic para cerrar.`,
          });
        }
        return;
      }
      if (herramienta === "eje") {
        if (puntos.length === 0) {
          set({
            puntosHerramienta: [p],
            ejeLibre: agregar,
            aviso: agregar
              ? "Eje sin familia: segundo punto (seguirá siendo horizontal o vertical)."
              : "Eje: segundo punto, longitud y Enter, o doble clic.",
          });
          return;
        }
        await crearEjeEntre(puntos[0], p, agregar || get().ejeLibre);
        return;
      }
      if (herramienta === "puerta" || herramienta === "ventana") {
        const ancho = herramienta === "puerta" ? 0.9 : 1.2;
        const alto = herramienta === "puerta" ? 2.1 : 1.2;
        const antepecho = herramienta === "puerta" ? 0 : 0.9;
        const colocada = colocarAbertura(get().referencias, p, ancho);
        if (!colocada) {
          set({ aviso: "Coloque la abertura sobre un muro." });
          return;
        }
        const ok = await ejecutar("aberturas.crear", {
          clase: herramienta === "puerta" ? "IfcDoor" : "IfcWindow",
          muro: colocada.muro.globalid,
          distancia: colocada.distancia,
          ancho,
          alto,
          antepecho,
          volteado: get().voltearSiguiente,
        });
        if (ok) bitacoraHerramienta(herramienta, "terminar", { x: p[0], y: p[1] });
        return;
      }
      if (herramienta === "mover" || herramienta === "copiar") {
        if (get().seleccionados.length === 0) {
          set({ aviso: "Seleccione uno o varios elementos antes de mover o copiar." });
          return;
        }
        if (puntos.length === 0) {
          set({ puntosHerramienta: [p], aviso: "Indique el punto destino." });
          return;
        }
        await moverSeleccion(puntos[0], p);
        return;
      }
      void agregar;
    },

    dobleClicEnPlanta: async () => {
      const herramienta = get().herramienta;
      // O007a: doble clic sobre un muro seleccionado abre «Editar tipo».
      const elegido = get().elementos.find((e) => e.globalid === get().seleccion);
      if (!herramienta && elegido?.clase === "IfcWall") {
        const tipo = get().tiposMuro.find((t) => t.nombre === elegido.tipo);
        get().abrirEditorTipos(tipo?.globalid ?? null);
        return;
      }
      if (
        !herramienta &&
        elegido &&
        ["IfcColumn", "IfcBeam", "IfcFooting"].includes(elegido.clase)
      ) {
        const tipo = get().tiposHerramienta.find((t) => t.nombre === elegido.tipo);
        if (tipo) {
          get().abrirEditorTipos(tipo.globalid);
          return;
        }
      }
      if (herramienta === "cerramiento") {
        set({
          puntosHerramienta: [],
          longitudTecleada: "",
          ratonHerramienta: null,
          engancheHerramienta: null,
          aviso: "Cadena de cerramientos terminada.",
        });
        return;
      }
      if (esHerramientaLineal(herramienta) && get().puntosHerramienta.length > 0) {
        const destino = get().ratonHerramienta;
        if (destino) {
          await crearEstructuralLineal(
            herramienta!, get().puntosHerramienta[0], destino,
          );
        }
        return;
      }
      if (herramienta === "muro") {
        set({
          puntosHerramienta: [],
          longitudTecleada: "",
          ratonHerramienta: null,
          engancheHerramienta: null,
          aviso: "Cadena de muros terminada.",
        });
        return;
      }
      if (herramienta === "eje") {
        const puntos = get().puntosHerramienta;
        if (puntos.length === 0) return;
        const destino = get().ratonHerramienta;
        if (!destino) return;
        await crearEjeEntre(puntos[0], destino, get().ejeLibre);
        return;
      }
      if (herramienta === "mover" || herramienta === "copiar") {
        const puntos = get().puntosHerramienta;
        const destino = get().ratonHerramienta;
        if (puntos.length === 0 || !destino) return;
        await moverSeleccion(puntos[0], destino);
        return;
      }
      if (herramienta !== "losa") return;
      const puntos = get().puntosHerramienta;
      if (puntos.length < 3) {
        set({ aviso: "La losa necesita al menos tres vértices." });
        return;
      }
      if (Math.abs(areaPoligono(puntos)) < 1e-6) {
        set({ aviso: "La losa tiene área cero." });
        return;
      }
      const vista = get().vistas.find((v) => v.id === get().vistaActivaId);
      const nivel = vista?.nivel ?? get().niveles[0]?.globalid;
      const ok = await ejecutar("losas.crear", {
        nivel,
        puntos,
        uso: get().opcionesLosa.uso,
        desfase: 0,
      });
      if (ok) {
        set({
          puntosHerramienta: [],
          ratonHerramienta: null,
          engancheHerramienta: null,
        });
        bitacoraHerramienta("losa", "terminar");
      }
    },

  };
}
