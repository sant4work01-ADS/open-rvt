// O065B: slice «empujar» del store (movido tal cual desde estado.ts).
import { bitacoraHerramienta } from "@/lib/bitacora";
import { crearRectangulo, ladosRectangulo } from "../../empujar";
import type { EstadoModelo, GetEstado, SetEstado } from "../tipos";
import type { Ayudas } from "../ayudas";

export function crearSliceEmpujar(
  set: SetEstado,
  get: GetEstado,
  h: Ayudas,
): Pick<EstadoModelo, "fijarClasificacionEmpujar" | "fijarAlturaEmpujar" | "moverEmpujar" | "clicEmpujar" | "confirmarEmpujar" | "iniciarEmpujarCara" | "moverEmpujarCara" | "confirmarEmpujarCara"> {
  const { ejecutarResultado, nivelActivo, crearSolidoEmpujar } = h;
  return {
    fijarClasificacionEmpujar: (clasificacion) =>
      set({ empujarClasificacion: clasificacion }),

    fijarAlturaEmpujar: (altura) => set({ empujarAltura: altura }),

    moverEmpujar: (punto) => set({ ratonHerramienta: punto }),

    clicEmpujar: async (punto, z) => {
      const estado = get();
      if (!estado.empujarRect) {
        const primero = estado.puntosHerramienta[0];
        if (!primero) {
          const nivel = estado.niveles.find((n) => n.globalid === nivelActivo());
          const zPlano = z ?? estado.empujarZ ?? nivel?.elevacion ?? 0;
          set({
            puntosHerramienta: [punto],
            ratonHerramienta: punto,
            empujarZ: zPlano,
            longitudTecleada: "",
            aviso: "Empujar/Tirar: clic en la esquina opuesta o teclee ancho,largo.",
          });
          return false;
        }
        const rect = crearRectangulo(primero, punto);
        const { menor } = ladosRectangulo(rect);
        if (menor < 0.01) {
          set({ aviso: "El rectángulo necesita ancho y largo mayores que cero." });
          return false;
        }
        set({
          empujarRect: rect,
          ratonHerramienta: punto,
          longitudTecleada: "",
          aviso: "Empujar/Tirar: mueva el ratón para la altura o téclela y Enter.",
        });
        return false;
      }
      return get().confirmarEmpujar();
    },

    confirmarEmpujar: async () => {
      const estado = get();
      const rect = estado.empujarRect;
      if (!rect) return false;
      const altura = estado.empujarAltura;
      if (altura === null || Math.abs(altura) < 1e-9) {
        set({ aviso: "Empujar/Tirar: falta la altura." });
        return false;
      }
      const ok = await crearSolidoEmpujar(rect, altura);
      if (ok) {
        set({
          puntosHerramienta: [],
          ratonHerramienta: null,
          engancheHerramienta: null,
          longitudTecleada: "",
          empujarRect: null,
          empujarAltura: null,
          empujarZ: null,
          empujarCara: null,
        });
        bitacoraHerramienta("empujar", "terminar");
      }
      return ok;
    },

    iniciarEmpujarCara: (cara) => {
      set({
        empujarCara: { ...cara, distancia: 0 },
        empujarRect: null,
        empujarAltura: null,
        empujarZ: null,
        puntosHerramienta: [],
        ratonHerramienta: null,
        engancheHerramienta: null,
        longitudTecleada: "",
        aviso: `Empujar/Tirar: ${cara.etiqueta}. Mueva el ratón o teclee la distancia y Enter.`,
      });
      bitacoraHerramienta("empujar", "cara", {
        x: cara.punto[0],
        y: cara.punto[1],
      });
    },

    moverEmpujarCara: (distancia) => {
      const cara = get().empujarCara;
      if (!cara || !Number.isFinite(distancia)) return;
      set({ empujarCara: { ...cara, distancia } });
    },

    confirmarEmpujarCara: async () => {
      const cara = get().empujarCara;
      if (!cara) return false;
      if (Math.abs(cara.distancia) < 1e-9) {
        set({ aviso: "Empujar/Tirar: falta la distancia." });
        return false;
      }
      const resultado = await ejecutarResultado("elementos.empujar_cara", {
        globalid: cara.globalid,
        normal: cara.normal,
        punto: cara.punto,
        distancia: cara.distancia,
      });
      if (!resultado) return false;
      const aviso = typeof resultado.aviso === "string" ? resultado.aviso : "";
      set({
        empujarCara: null,
        puntosHerramienta: [],
        ratonHerramienta: null,
        engancheHerramienta: null,
        longitudTecleada: "",
        empujarRect: null,
        empujarAltura: null,
        empujarZ: null,
        aviso:
          aviso ||
          `${cara.etiqueta}: ${cara.distancia >= 0 ? "+" : ""}${cara.distancia.toFixed(2)} m.`,
      });
      bitacoraHerramienta("empujar", "terminar");
      return true;
    },

  };
}
