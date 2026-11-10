// O063 punto 2: puerta única para saber si el núcleo perdió el modelo y si un
// método puede ejecutarse. La usan todas las entradas (pantalla, asistente,
// importación y pegar) porque el guardia vive en `rpc`.

export const MENSAJE_NUCLEO_CAIDO =
  "El núcleo se reinició; los cambios sin guardar de este modelo se perdieron. " +
  "Abre de nuevo el archivo.";

/** Consultas, lecturas, teselado y medición: no cambian el modelo. */
const METODOS_LECTURA = new Set([
  "nucleo.ping",
  "proyecto.info",
  "proyecto.validar",
  "modelo.niveles",
  "modelo.elementos",
  "modelo.arbol",
  "modelo.arbol_obra",
  "modelo.propiedades",
  "modelo.referencias",
  "geometria.teselar",
  "vistas.leer",
  "estilos.leer",
  "ejes.listar",
  "ejes.reticula",
  "ejes.separacion",
  "tipos.listar",
  "tipos.obtener",
  "tipos.instancias",
  "materiales.listar",
  "acero.varillas",
  "acero.estimar",
  "medicion.calcular",
  "medicion.exportar",
  "notas.listar",
]);

/** Abrir o crear un modelo es la única forma de recuperar la edición. */
const METODOS_RECUPERACION = new Set(["proyecto.nuevo", "proyecto.abrir"]);

export function esMetodoMutador(metodo: string): boolean {
  return !METODOS_LECTURA.has(metodo);
}

export function permitidoConNucleoCaido(metodo: string): boolean {
  return !esMetodoMutador(metodo) || METODOS_RECUPERACION.has(metodo);
}

let caido = false;

export function fijarEstadoNucleoCaido(valor: boolean): void {
  caido = valor;
}

export function nucleoEstaCaido(): boolean {
  return caido;
}

export class ErrorNucleoCaido extends Error {
  constructor() {
    super(MENSAJE_NUCLEO_CAIDO);
    this.name = "ErrorNucleoCaido";
  }
}

/** Lanza si el núcleo perdió el modelo y el método intenta editarlo. */
export function verificarPuertaNucleo(metodo: string): void {
  if (caido && !permitidoConNucleoCaido(metodo)) throw new ErrorNucleoCaido();
}

/** IDs de la cinta que siguen disponibles con el núcleo caído. */
export const COMANDOS_SIN_EDICION = new Set([
  "nuevo",
  "abrir",
  "tema-sistema",
  "tema-claro",
  "tema-oscuro",
]);

/** Aplica el bloqueo de edición a la lista de comandos de la cinta. */
export function bloquearComandosDeEdicion<
  T extends { id: string; habilitado: boolean },
>(comandos: T[]): T[] {
  return comandos.map((comando) =>
    COMANDOS_SIN_EDICION.has(comando.id)
      ? comando
      : { ...comando, habilitado: false },
  );
}
