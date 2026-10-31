// O024: editor de estilos de anotación (niveles, ejes y cotas) con vista previa
// en vivo. La previa usa `calcularLayoutAlzado`, las mismas funciones que el visor.
import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { useModelo } from "./estado";
import {
  estiloCotaPorDefecto,
  type EstiloCota,
  type Estilos,
  type PatronAnotacion,
  type RemateCota,
} from "./estilos";
import { calcularLayoutAlzado } from "./anotacionVista";

type Pestana = "niveles" | "ejes" | "cotas";

const PATRONES: ReadonlyArray<{ id: PatronAnotacion; nombre: string }> = [
  { id: "continua", nombre: "Continua" },
  { id: "trazo", nombre: "Trazo" },
  { id: "trazo-punto", nombre: "Trazo y punto" },
];

const REMATES: ReadonlyArray<{ id: RemateCota; nombre: string }> = [
  { id: "flecha-rellena", nombre: "Flecha rellena" },
  { id: "flecha-abierta", nombre: "Flecha abierta" },
  { id: "tick-arquitectonico", nombre: "Tick arquitectónico" },
  { id: "punto", nombre: "Punto" },
];

function Numero({
  id,
  valor,
  min,
  max,
  paso = 0.1,
  alCambiar,
}: {
  id: string;
  valor: number;
  min: number;
  max: number;
  paso?: number;
  alCambiar: (valor: number) => void;
}) {
  return (
    <input
      id={id}
      data-testid={id}
      type="number"
      min={min}
      max={max}
      step={paso}
      value={valor}
      onChange={(e) => {
        const numero = Number(e.target.value);
        if (Number.isFinite(numero)) alCambiar(Math.min(Math.max(numero, min), max));
      }}
      className="w-24 rounded border bg-background px-2 py-1 text-right"
    />
  );
}

/** Vista previa: cinco niveles y cuatro ejes, como la referencia de O025. */
function PreviaAnotacion({ estilos }: { estilos: Estilos }) {
  const estiloCota =
    estilos.cotas.lista.find((c) => c.nombre === estilos.cotas.porDefecto) ??
    estilos.cotas.lista[0] ??
    estiloCotaPorDefecto();
  const niveles = useMemo(
    () => [
      { globalid: "n0", nombre: "Nivel 0", elevacion: 0 },
      { globalid: "n1", nombre: "Nivel 1", elevacion: 0.5 },
      { globalid: "n2", nombre: "Nivel 2", elevacion: 1.5 },
      { globalid: "n3", nombre: "Nivel 3", elevacion: 2 },
      { globalid: "n4", nombre: "Nivel 4", elevacion: 2.2 },
    ],
    [],
  );
  const ejes = useMemo(
    () => [
      { globalid: "e1", etiqueta: "1", s: 0 },
      { globalid: "e2", etiqueta: "2", s: 4 },
      { globalid: "e3", etiqueta: "3", s: 8 },
      { globalid: "e4", etiqueta: "4", s: 12 },
    ],
    [],
  );
  const layout = useMemo(
    () =>
      calcularLayoutAlzado({
        niveles,
        ejes,
        estiloNivel: estilos.niveles,
        estiloEje: estilos.ejes,
        estiloCota,
        escala: 100,
        tMinCaja: -2,
        tMaxCaja: 14,
      }),
    [niveles, ejes, estilos.niveles, estilos.ejes, estiloCota],
  );
  const t0 = layout.tInicio;
  const t1 = layout.tFinAnotacion + 0.8;
  const z0 = Math.min(-0.6, ...layout.cabezas.map((c) => c.z - 0.4));
  const z1 = layout.zGlobo + layout.globos[0]?.radio + 0.6;
  const ancho = 620;
  const alto = 300;
  const escala = Math.min(ancho / (t1 - t0), alto / (z1 - z0));
  const x = (t: number) => (t - t0) * escala + 20;
  const y = (z: number) => alto - ((z - z0) * escala + 20);
  const colorNivel = estilos.niveles.color;
  const colorEje = estilos.ejes.color;
  const colorCota = estiloCota.color;
  const tO = (p: [number, number]) => `${x(p[0])},${y(p[1])}`;
  const altoTexto = Math.max(6, estilos.niveles.altoTexto * 0.1 * escala);
  const altoTextoCota = Math.max(6, estiloCota.altoTexto * 0.1 * escala);
  return (
    <svg
      data-testid="vista-previa-anotacion"
      viewBox={`0 0 ${ancho} ${alto}`}
      role="img"
      aria-label="Vista previa de niveles, ejes y cotas"
      className="h-[300px] w-full rounded border bg-background"
    >
      {layout.ejesLineas.map((linea, i) => (
        <polyline
          key={`eje-${i}`}
          points={linea.puntos.map(tO).join(" ")}
          fill="none"
          stroke={colorEje}
          strokeWidth="1"
          strokeDasharray="6 2 1 2"
        />
      ))}
      {layout.lineas.map((linea, i) =>
        linea.tipo === "guia-nivel" ? (
          <g key={`guia-${i}`}>
            <polyline
              points={linea.puntos.map(tO).join(" ")}
              fill="none"
              stroke={colorNivel}
              strokeWidth="1"
            />
            {linea.punto && (
              <circle
                cx={x(linea.punto[0])}
                cy={y(linea.punto[1])}
                r={2}
                fill={colorNivel}
              />
            )}
          </g>
        ) : null,
      )}
      {layout.lineas
        .filter((l) => l.tipo === "nivel")
        .map((linea, i) => (
          <line
            key={`nivel-${i}`}
            x1={x(linea.puntos[0][0])}
            y1={y(linea.puntos[0][1])}
            x2={x(linea.puntos[1][0])}
            y2={y(linea.puntos[1][1])}
            stroke={colorNivel}
            strokeWidth="1"
            strokeDasharray="6 2 1 2"
          />
        ))}
      {layout.lineas
        .filter((l) => l.tipo === "cota" || l.tipo === "cota-total" || l.tipo === "extension")
        .map((linea, i) => (
          <polyline
            key={`cota-${i}`}
            points={linea.puntos.map(tO).join(" ")}
            fill="none"
            stroke={colorCota}
            strokeWidth={linea.tipo === "extension" ? 0.5 : 1}
          />
        ))}
      {layout.parciales.concat(layout.total ? [layout.total] : []).flatMap((tramo, i) =>
        tramo.remates.map((remate, j) => {
          const largo = Math.max(3, estiloCota.tamanoRemate * 0.1 * escala);
          const signo = remate.hacia === "arriba" ? -1 : 1;
          const px = x(remate.t);
          const py = y(remate.z);
          return (
            <polygon
              key={`remate-${i}-${j}`}
              points={`${px},${py} ${px - largo / 2},${py + signo * largo} ${px + largo / 2},${py + signo * largo}`}
              fill={colorCota}
            />
          );
        }),
      )}
      {layout.cabezas.map((cabeza) => (
        <g key={cabeza.globalid}>
          {cabeza.poligono.length > 0 && (
            <polygon points={cabeza.poligono.map(tO).join(" ")} fill={colorNivel} />
          )}
          <text
            x={x(cabeza.cajaTexto.centro[0])}
            y={y(cabeza.cajaTexto.centro[1]) + altoTexto / 3}
            fontSize={altoTexto}
            textAnchor="middle"
            fill={colorNivel}
          >
            {cabeza.texto}
          </text>
        </g>
      ))}
      {layout.parciales.concat(layout.total ? [layout.total] : []).map((tramo, i) => (
        <text
          key={`texto-cota-${i}`}
          x={x(tramo.cajaTexto.centro[0])}
          y={y(tramo.cajaTexto.centro[1]) + altoTextoCota / 3}
          fontSize={altoTextoCota}
          textAnchor="middle"
          fill={colorCota}
        >
          {tramo.texto}
        </text>
      ))}
      {layout.globos.map((globo) => (
        <g key={globo.globalid}>
          <circle
            cx={x(globo.t)}
            cy={y(globo.z)}
            r={globo.radio * escala}
            fill="var(--background)"
            stroke={colorEje}
            strokeWidth="1"
          />
          <text
            x={x(globo.t)}
            y={y(globo.z) + estilos.ejes.altoTexto * 0.05 * escala}
            fontSize={Math.max(6, estilos.ejes.altoTexto * 0.1 * escala)}
            textAnchor="middle"
            fill={colorEje}
          >
            {globo.etiqueta}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function DialogoAnotacion() {
  const estilos = useModelo((s) => s.estilos);
  const guardar = useModelo((s) => s.guardarEstilos);
  const cerrar = useModelo((s) => s.cerrarDialogoAnotacion);
  const [pestana, setPestana] = useState<Pestana>("niveles");
  const [borrador, setBorrador] = useState<Estilos>(estilos);
  const [cotaSeleccionada, setCotaSeleccionada] = useState(
    estilos.cotas.porDefecto,
  );

  const cota =
    borrador.cotas.lista.find((c) => c.nombre === cotaSeleccionada) ??
    borrador.cotas.lista[0];
  const cambiarNivel = (cambio: Partial<Estilos["niveles"]>) =>
    setBorrador((previo) => ({ ...previo, niveles: { ...previo.niveles, ...cambio } }));
  const cambiarEje = (cambio: Partial<Estilos["ejes"]>) =>
    setBorrador((previo) => ({ ...previo, ejes: { ...previo.ejes, ...cambio } }));
  const cambiarCota = (cambio: Partial<EstiloCota>) =>
    setBorrador((previo) => ({
      ...previo,
      cotas: {
        ...previo.cotas,
        lista: previo.cotas.lista.map((c) =>
          c.nombre === cotaSeleccionada ? { ...c, ...cambio, nombre: c.nombre } : c,
        ),
      },
    }));

  const renombrar = (nuevo: string) => {
    const nombre = nuevo.trim();
    if (!nombre || borrador.cotas.lista.some((c) => c.nombre === nombre)) return;
    setBorrador((previo) => ({
      ...previo,
      cotas: {
        lista: previo.cotas.lista.map((c) =>
          c.nombre === cotaSeleccionada ? { ...c, nombre } : c,
        ),
        porDefecto:
          previo.cotas.porDefecto === cotaSeleccionada ? nombre : previo.cotas.porDefecto,
      },
    }));
    setCotaSeleccionada(nombre);
  };

  const nuevo = () => {
    const base = estiloCotaPorDefecto(`Cota ${borrador.cotas.lista.length + 1}`);
    let nombre = base.nombre;
    let i = borrador.cotas.lista.length + 1;
    while (borrador.cotas.lista.some((c) => c.nombre === nombre)) {
      i += 1;
      nombre = `Cota ${i}`;
    }
    base.nombre = nombre;
    setBorrador((previo) => ({
      ...previo,
      cotas: { ...previo.cotas, lista: [...previo.cotas.lista, base] },
    }));
    setCotaSeleccionada(nombre);
  };

  const duplicar = () => {
    if (!cota) return;
    let nombre = `${cota.nombre} (2)`;
    let i = 2;
    while (borrador.cotas.lista.some((c) => c.nombre === nombre)) {
      i += 1;
      nombre = `${cota.nombre} (${i})`;
    }
    const copia = { ...cota, nombre };
    setBorrador((previo) => ({
      ...previo,
      cotas: { ...previo.cotas, lista: [...previo.cotas.lista, copia] },
    }));
    setCotaSeleccionada(nombre);
  };

  const eliminar = () => {
    if (!cota || borrador.cotas.lista.length <= 1) return;
    const lista = borrador.cotas.lista.filter((c) => c.nombre !== cota.nombre);
    const porDefecto =
      borrador.cotas.porDefecto === cota.nombre ? lista[0].nombre : borrador.cotas.porDefecto;
    setBorrador((previo) => ({ ...previo, cotas: { lista, porDefecto } }));
    setCotaSeleccionada(porDefecto);
  };

  const campo = (etiqueta: string, hijo: React.ReactNode) => (
    <label className="grid grid-cols-[1fr_auto] items-center gap-2">
      <span className="text-muted-foreground">{etiqueta}</span>
      {hijo}
    </label>
  );

  return (
    <Modal
      titulo="Estilos de anotación"
      onCerrar={cerrar}
      conCabecera
      className="w-[min(1180px,96vw)]"
    >
      <div data-testid="dialogo-anotacion" className="flex max-h-[80vh] flex-col">
        <div role="tablist" className="flex gap-1 border-b px-3 pt-2">
          {(["niveles", "ejes", "cotas"] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={pestana === id}
              data-testid={`pestana-anotacion-${id}`}
              onClick={() => setPestana(id)}
              className={`rounded-t border px-3 py-1 text-xs ${
                pestana === id ? "border-b-background bg-background font-semibold" : "bg-muted/40"
              }`}
            >
              {id === "niveles" ? "Niveles" : id === "ejes" ? "Ejes" : "Cotas"}
            </button>
          ))}
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(320px,1fr)_1.5fr] gap-3 overflow-auto p-3 text-xs">
          <div className="space-y-2">
            {pestana === "niveles" && (
              <section data-testid="estilos-anotacion-niveles" className="space-y-2">
                {campo(
                  "Patrón de línea",
                  <select
                    data-testid="nivel-patron"
                    value={borrador.niveles.patron}
                    onChange={(e) => cambiarNivel({ patron: e.target.value as PatronAnotacion })}
                    className="rounded border bg-background px-2 py-1"
                  >
                    {PATRONES.map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre}</option>
                    ))}
                  </select>,
                )}
                {campo(
                  "Color",
                  <input
                    type="color"
                    data-testid="nivel-color"
                    value={borrador.niveles.color}
                    onChange={(e) => cambiarNivel({ color: e.target.value })}
                    className="h-6 w-12 rounded border bg-background"
                  />,
                )}
                {campo(
                  "Grosor (mm)",
                  <Numero id="nivel-grosor" valor={borrador.niveles.grosor} min={0.05} max={5} alCambiar={(grosor) => cambiarNivel({ grosor })} />,
                )}
                {campo(
                  "Cabeza",
                  <select
                    data-testid="nivel-cabeza"
                    value={borrador.niveles.cabeza}
                    onChange={(e) => cambiarNivel({ cabeza: e.target.value as Estilos["niveles"]["cabeza"] })}
                    className="rounded border bg-background px-2 py-1"
                  >
                    <option value="triangulo-relleno">Triángulo relleno</option>
                    <option value="triangulo">Triángulo hueco</option>
                    <option value="circulo">Círculo</option>
                    <option value="ninguna">Ninguna</option>
                  </select>,
                )}
                {campo(
                  "Tamaño de cabeza (mm)",
                  <Numero id="nivel-tamano-cabeza" valor={borrador.niveles.tamanoCabeza} min={0.5} max={20} alCambiar={(tamanoCabeza) => cambiarNivel({ tamanoCabeza })} />,
                )}
                {campo(
                  "Lado de la cabeza",
                  <select
                    data-testid="nivel-lado-cabeza"
                    value={borrador.niveles.ladoCabeza}
                    onChange={(e) => cambiarNivel({ ladoCabeza: e.target.value as Estilos["niveles"]["ladoCabeza"] })}
                    className="rounded border bg-background px-2 py-1"
                  >
                    <option value="derecha">Derecha</option>
                    <option value="izquierda">Izquierda</option>
                    <option value="ambos">Ambos</option>
                  </select>,
                )}
                {campo(
                  "Prefijo",
                  <input
                    data-testid="nivel-prefijo"
                    value={borrador.niveles.prefijo}
                    onChange={(e) => cambiarNivel({ prefijo: e.target.value })}
                    className="w-40 rounded border bg-background px-2 py-1"
                  />,
                )}
                {campo(
                  "Decimales",
                  <select
                    data-testid="nivel-decimales"
                    value={borrador.niveles.decimales}
                    onChange={(e) => cambiarNivel({ decimales: Number(e.target.value) as 0 | 1 | 2 | 3 })}
                    className="w-20 rounded border bg-background px-2 py-1"
                  >
                    {[0, 1, 2, 3].map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>,
                )}
                {campo(
                  "Unidad",
                  <input
                    data-testid="nivel-unidad"
                    value={borrador.niveles.unidad}
                    onChange={(e) => cambiarNivel({ unidad: e.target.value })}
                    className="w-20 rounded border bg-background px-2 py-1"
                  />,
                )}
                {campo(
                  "Signo +",
                  <input
                    type="checkbox"
                    data-testid="nivel-signo"
                    checked={borrador.niveles.signo}
                    onChange={(e) => cambiarNivel({ signo: e.target.checked })}
                    className="h-4 w-4"
                  />,
                )}
                {campo(
                  "Alto de texto (mm)",
                  <Numero id="nivel-alto-texto" valor={borrador.niveles.altoTexto} min={0.5} max={20} alCambiar={(altoTexto) => cambiarNivel({ altoTexto })} />,
                )}
                {campo(
                  "Mostrar nombre",
                  <input
                    type="checkbox"
                    data-testid="nivel-mostrar-nombre"
                    checked={borrador.niveles.mostrarNombre}
                    onChange={(e) => cambiarNivel({ mostrarNombre: e.target.checked })}
                    className="h-4 w-4"
                  />,
                )}
                {campo(
                  "Extensión de línea (mm)",
                  <Numero id="nivel-extension" valor={borrador.niveles.extension} min={0} max={200} alCambiar={(extension) => cambiarNivel({ extension })} />,
                )}
                {campo(
                  "Cotas de nivel",
                  <input
                    type="checkbox"
                    data-testid="nivel-cotas"
                    checked={borrador.niveles.cotas}
                    onChange={(e) => cambiarNivel({ cotas: e.target.checked })}
                    className="h-4 w-4"
                  />,
                )}
              </section>
            )}

            {pestana === "ejes" && (
              <section data-testid="estilos-anotacion-ejes" className="space-y-2">
                {campo(
                  "Patrón de línea",
                  <select
                    data-testid="eje-patron"
                    value={borrador.ejes.patron}
                    onChange={(e) => cambiarEje({ patron: e.target.value as PatronAnotacion })}
                    className="rounded border bg-background px-2 py-1"
                  >
                    {PATRONES.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>,
                )}
                {campo(
                  "Color",
                  <input
                    type="color"
                    data-testid="eje-color"
                    value={borrador.ejes.color}
                    onChange={(e) => cambiarEje({ color: e.target.value })}
                    className="h-6 w-12 rounded border bg-background"
                  />,
                )}
                {campo(
                  "Grosor (mm)",
                  <Numero id="eje-grosor" valor={borrador.ejes.grosor} min={0.05} max={5} alCambiar={(grosor) => cambiarEje({ grosor })} />,
                )}
                {campo(
                  "Diámetro del globo (mm)",
                  <Numero id="eje-diametro" valor={borrador.ejes.diametroGlobo} min={1} max={50} alCambiar={(diametroGlobo) => cambiarEje({ diametroGlobo })} />,
                )}
                {campo(
                  "Alto de texto (mm)",
                  <Numero id="eje-alto-texto" valor={borrador.ejes.altoTexto} min={0.5} max={20} alCambiar={(altoTexto) => cambiarEje({ altoTexto })} />,
                )}
                {campo(
                  "Globos en",
                  <select
                    data-testid="eje-globos"
                    value={borrador.ejes.globos}
                    onChange={(e) => cambiarEje({ globos: e.target.value as Estilos["ejes"]["globos"] })}
                    className="rounded border bg-background px-2 py-1"
                  >
                    <option value="inicio">Inicio</option>
                    <option value="fin">Fin</option>
                    <option value="ambos">Ambos</option>
                  </select>,
                )}
                {campo(
                  "Separación sobre el último nivel (mm)",
                  <Numero id="eje-separacion-globos" valor={borrador.ejes.separacionGlobos} min={0} max={200} alCambiar={(separacionGlobos) => cambiarEje({ separacionGlobos })} />,
                )}
                {campo(
                  "Extensión bajo el primer nivel (mm)",
                  <Numero id="eje-extension-bajo" valor={borrador.ejes.extensionBajoPrimerNivel} min={0} max={200} alCambiar={(extensionBajoPrimerNivel) => cambiarEje({ extensionBajoPrimerNivel })} />,
                )}
              </section>
            )}

            {pestana === "cotas" && cota && (
              <section data-testid="estilos-anotacion-cotas" className="space-y-2">
                <div className="flex flex-wrap items-end gap-1">
                  <label className="flex flex-col gap-1">
                    <span className="text-muted-foreground">Estilo</span>
                    <select
                      data-testid="cota-lista"
                      value={cotaSeleccionada}
                      onChange={(e) => setCotaSeleccionada(e.target.value)}
                      className="w-44 rounded border bg-background px-2 py-1"
                    >
                      {borrador.cotas.lista.map((c) => (
                        <option key={c.nombre} value={c.nombre}>{c.nombre}</option>
                      ))}
                    </select>
                  </label>
                  <button type="button" data-testid="cota-nuevo" onClick={nuevo} className="rounded border px-2 py-1 hover:bg-muted">Nuevo</button>
                  <button type="button" data-testid="cota-duplicar" onClick={duplicar} className="rounded border px-2 py-1 hover:bg-muted">Duplicar</button>
                  <button type="button" data-testid="cota-eliminar" onClick={eliminar} className="rounded border px-2 py-1 hover:bg-muted">Eliminar</button>
                </div>
                {campo(
                  "Nombre",
                  <input
                    data-testid="cota-nombre"
                    defaultValue={cota.nombre}
                    key={`${cota.nombre}-nombre`}
                    onBlur={(e) => renombrar(e.target.value)}
                    className="w-44 rounded border bg-background px-2 py-1"
                  />,
                )}
                {campo(
                  "Remate",
                  <select
                    data-testid="cota-remate"
                    value={cota.remate}
                    onChange={(e) => cambiarCota({ remate: e.target.value as RemateCota })}
                    className="rounded border bg-background px-2 py-1"
                  >
                    {REMATES.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                  </select>,
                )}
                {campo(
                  "Tamaño del remate (mm)",
                  <Numero id="cota-tamano-remate" valor={cota.tamanoRemate} min={0.2} max={20} alCambiar={(tamanoRemate) => cambiarCota({ tamanoRemate })} />,
                )}
                {campo(
                  "Alto de texto (mm)",
                  <Numero id="cota-alto-texto" valor={cota.altoTexto} min={0.5} max={20} alCambiar={(altoTexto) => cambiarCota({ altoTexto })} />,
                )}
                {campo(
                  "Posición del texto",
                  <select
                    data-testid="cota-posicion-texto"
                    value={cota.posicionTexto}
                    onChange={(e) => cambiarCota({ posicionTexto: e.target.value as EstiloCota["posicionTexto"] })}
                    className="rounded border bg-background px-2 py-1"
                  >
                    <option value="sobre-la-linea">Sobre la línea</option>
                    <option value="centrado-cortando-la-linea">Centrado cortando la línea</option>
                  </select>,
                )}
                {campo(
                  "Separación texto–línea (mm)",
                  <Numero id="cota-separacion-texto" valor={cota.separacionTexto} min={0} max={50} alCambiar={(separacionTexto) => cambiarCota({ separacionTexto })} />,
                )}
                {campo(
                  "Separación de extensión (mm)",
                  <Numero id="cota-separacion-extension" valor={cota.separacionExtension} min={0} max={50} alCambiar={(separacionExtension) => cambiarCota({ separacionExtension })} />,
                )}
                {campo(
                  "Prolongación (mm)",
                  <Numero id="cota-prolongacion" valor={cota.prolongacion} min={0} max={50} alCambiar={(prolongacion) => cambiarCota({ prolongacion })} />,
                )}
                {campo(
                  "Distancia entre filas (mm)",
                  <Numero id="cota-distancia-filas" valor={cota.distanciaFilas} min={0} max={100} alCambiar={(distanciaFilas) => cambiarCota({ distanciaFilas })} />,
                )}
                {campo(
                  "Decimales",
                  <select
                    data-testid="cota-decimales"
                    value={cota.decimales}
                    onChange={(e) => cambiarCota({ decimales: Number(e.target.value) as 0 | 1 | 2 | 3 })}
                    className="w-20 rounded border bg-background px-2 py-1"
                  >
                    {[0, 1, 2, 3].map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>,
                )}
                {campo(
                  "Unidad",
                  <input
                    data-testid="cota-unidad"
                    value={cota.unidad}
                    onChange={(e) => cambiarCota({ unidad: e.target.value })}
                    className="w-20 rounded border bg-background px-2 py-1"
                  />,
                )}
                {campo(
                  "Color",
                  <input
                    type="color"
                    data-testid="cota-color"
                    value={cota.color}
                    onChange={(e) => cambiarCota({ color: e.target.value })}
                    className="h-6 w-12 rounded border bg-background"
                  />,
                )}
                {campo(
                  "Texto chico",
                  <select
                    data-testid="cota-texto-chico"
                    value={cota.textoChico}
                    onChange={(e) => cambiarCota({ textoChico: e.target.value as EstiloCota["textoChico"] })}
                    className="rounded border bg-background px-2 py-1"
                  >
                    <option value="fuera-con-flechas-hacia-adentro">Fuera con flechas</option>
                    <option value="con-linea-de-referencia">Con línea de referencia</option>
                  </select>,
                )}
                {campo(
                  "Patrón de línea",
                  <select
                    data-testid="cota-patron"
                    value={cota.patron}
                    onChange={(e) => cambiarCota({ patron: e.target.value as PatronAnotacion })}
                    className="rounded border bg-background px-2 py-1"
                  >
                    {PATRONES.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>,
                )}
                {campo(
                  "Grosor (mm)",
                  <Numero id="cota-grosor" valor={cota.grosor} min={0.05} max={5} alCambiar={(grosor) => cambiarCota({ grosor })} />,
                )}
              </section>
            )}
          </div>

          <div className="min-w-0">
            <div className="mb-1 text-muted-foreground">Vista previa en vivo</div>
            <PreviaAnotacion estilos={borrador} />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t p-3">
          <button
            type="button"
            data-testid="boton-cancelar-anotacion"
            onClick={cerrar}
            className="rounded border px-3 py-1 text-xs hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            type="button"
            data-testid="boton-guardar-anotacion"
            onClick={() => {
              void guardar(borrador).then(cerrar);
            }}
            className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground hover:opacity-90"
          >
            Aceptar
          </button>
        </div>
      </div>
    </Modal>
  );
}
