// O014a: texto de la cabeza de nivel. Formato acordado: prefijo, espacio, signo
// (solo si no es cero), decimales del estilo y unidad. Ej.: `Npt +2.20m`.
import type { EstiloNivel } from "./estilos";

export function textoCabezaNivel(elev: number, estilo: EstiloNivel): string {
  const factor = 10 ** estilo.decimales;
  // Redondear antes de decidir el signo evita el «-0.00» en negativos diminutos.
  const valor = Math.round(Math.abs(elev) * factor) / factor;
  const cuerpo = valor === 0
    ? valor.toFixed(estilo.decimales)
    : `${elev < 0 ? "-" : "+"}${valor.toFixed(estilo.decimales)}`;
  const conUnidad = `${cuerpo}${estilo.unidad}`;
  return estilo.prefijo ? `${estilo.prefijo} ${conUnidad}` : conUnidad;
}
