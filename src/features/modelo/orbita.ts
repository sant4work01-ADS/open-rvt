// O020: decisiones de órbita del visor 3D separadas de la interfaz.
//
// El touchpad de un portátil no tiene botón medio: además del arrastre con el
// botón medio de siempre, se puede orbitar con el botón derecho, con Shift +
// arrastre izquierdo o activando el conmutador «Orbitar» para usar un dedo.

export type AccionArrastre = "seleccionar" | "panear" | "orbitar";

export interface DatosArrastre {
  /** 0 = izquierdo, 1 = medio, 2 = derecho. */
  boton: number;
  shift: boolean;
  /** Barra espaciadora mantenida: el arrastre izquierdo panea. */
  espacio: boolean;
  modoOrbitar: boolean;
  es3d: boolean;
}

/**
 * Decide qué hace un arrastre en el visor. En planta, alzado y corte solo el
 * botón medio panea; ninguna puerta orbita fuera de las vistas 3D. En 3D el
 * botón derecho siempre orbita, Shift + izquierdo también y el conmutador
 * «Orbitar» convierte el arrastre izquierdo en órbita; el botón medio conserva
 * su comportamiento (orbita, y con Shift panea).
 */
export function accionArrastre({
  boton,
  shift,
  espacio,
  modoOrbitar,
  es3d,
}: DatosArrastre): AccionArrastre {
  if (!es3d) return boton === 1 ? "panear" : "seleccionar";
  if (boton === 2) return "orbitar";
  if (boton === 0) {
    if (shift) return "orbitar";
    if (espacio) return "panear";
    if (modoOrbitar) return "orbitar";
    return "seleccionar";
  }
  if (boton === 1) return shift ? "panear" : "orbitar";
  return "seleccionar";
}

/** O020: Shift + dos dedos / rueda horizontal orbita en 3D y panea en el resto. */
export function accionRuedaConShift(es3d: boolean): "orbitar" | "paneo-horizontal" {
  return es3d ? "orbitar" : "paneo-horizontal";
}

const CLAVE_MODO_ORBITAR = "openrvt.orbitar";

/** O020: el conmutador se recuerda entre sesiones; sin localStorage queda apagado. */
export function leerModoOrbitar(): boolean {
  try {
    return localStorage.getItem(CLAVE_MODO_ORBITAR) === "1";
  } catch {
    return false;
  }
}

export function guardarModoOrbitar(activo: boolean): void {
  try {
    localStorage.setItem(CLAVE_MODO_ORBITAR, activo ? "1" : "0");
  } catch {
    /* almacenamiento no disponible: el conmutador sigue funcionando en memoria */
  }
}
