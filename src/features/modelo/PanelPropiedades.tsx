// OPEN-RVT: panel derecho. Sin selección muestra las propiedades de la vista (todas
// editables y persistidas en OPENRVT_Vistas); con selección, las del elemento IFC.
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { llamarConBitacora } from "@/lib/bitacora";
import { useModelo } from "./estado";
import {
  CATEGORIAS,
  ESCALAS,
  ESTILOS,
  nombreTipo,
  type AjusteEjeVista,
  type Vista,
} from "./tipos";
import { globoVisibleEje } from "./ejesVista";
import { describirEnlace } from "./enlaces";
import {
  bordesDePset,
  desfaseConSigno,
  etiquetaBorde,
  valorComunDesfase,
} from "./bordesLosa";

function formatear(valor: unknown): string {
  if (valor === null || valor === undefined) return "—";
  if (typeof valor === "string" || typeof valor === "number" || typeof valor === "boolean") {
    return String(valor);
  }
  if (Array.isArray(valor)) return valor.map(formatear).join(", ");
  if (typeof valor === "object") {
    const objeto = valor as Record<string, unknown>;
    if ("clase" in objeto) {
      const nombre = objeto.nombre ? ` «${String(objeto.nombre)}»` : "";
      return `${String(objeto.clase)}${nombre}`;
    }
    try {
      return JSON.stringify(valor);
    } catch {
      return String(valor);
    }
  }
  return String(valor);
}

function CampoNumero({
  etiqueta,
  valor,
  testid,
  onCambio,
  paso = 0.01,
  ayuda,
}: {
  etiqueta: string;
  valor: number | undefined;
  testid: string;
  onCambio: (valor: number) => void;
  paso?: number;
  ayuda?: string;
}) {
  return (
    <label className="prop-fila text-xs" title={ayuda}>
      <span className="prop-etiqueta cursor-help text-muted-foreground">{etiqueta}</span>
      <input
        data-testid={testid}
        type="number"
        step={paso}
        value={valor ?? ""}
        onChange={(e) => {
          const numero = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(numero)) onCambio(numero);
        }}
        className="w-24 rounded border bg-background px-2 py-1 text-right"
      />
    </label>
  );
}

/** Clave de localStorage con las secciones plegadas del panel derecho. */
export const CLAVE_SECCIONES_PLEGADAS = "openrvt.propiedades.secciones-plegadas";

export function leerSeccionesPlegadas(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const crudo = localStorage.getItem(CLAVE_SECCIONES_PLEGADAS);
    if (!crudo) return [];
    const valor: unknown = JSON.parse(crudo);
    return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function guardarSeccionesPlegadas(ids: string[]): void {
  try {
    localStorage.setItem(CLAVE_SECCIONES_PLEGADAS, JSON.stringify(ids));
  } catch {
    /* sin almacenamiento: el plegado sigue funcionando en la sesión */
  }
}

function Seccion({
  id,
  titulo,
  plegada,
  onAlternar,
  acciones,
  children,
}: {
  id: string;
  titulo: string;
  plegada: boolean;
  onAlternar: (id: string) => void;
  acciones?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section data-testid={`seccion-${id}`} className="border-t pt-1 first:border-t-0 first:pt-0">
      <div className="prop-seccion-cabecera">
        <button
          type="button"
          data-testid={`seccion-${id}-plegar`}
          aria-expanded={!plegada}
          onClick={() => onAlternar(id)}
          className="flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-0.5 text-left font-semibold hover:bg-muted"
        >
          {plegada ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          <span className="prop-seccion-titulo">{titulo}</span>
        </button>
        {acciones}
      </div>
      {!plegada && <div className="flex flex-col gap-1 pb-2 pt-1">{children}</div>}
    </section>
  );
}

function BotonesTodos({
  prefijo,
  onTodos,
  onNinguno,
}: {
  prefijo: string;
  onTodos: () => void;
  onNinguno: () => void;
}) {
  return (
    <span className="prop-seccion-acciones flex shrink-0 items-center gap-0.5 text-[10px]">
      <button
        type="button"
        data-testid={`${prefijo}-todos`}
        onClick={onTodos}
        className="rounded px-1 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        Todos
      </button>
      <span className="text-muted-foreground/50">/</span>
      <button
        type="button"
        data-testid={`${prefijo}-ninguno`}
        onClick={onNinguno}
        className="rounded px-1 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        ninguno
      </button>
    </span>
  );
}

export function PropiedadesVista({ vista }: { vista: Vista }) {
  const actualizar = useModelo((s) => s.actualizarVista);
  const niveles = useModelo((s) => s.niveles);
  const estilos = useModelo((s) => s.estilos);
  const [plegadas, setPlegadas] = useState<string[]>(() => leerSeccionesPlegadas());
  const cambiar = (cambios: Partial<Vista>) => {
    void actualizar(vista.id, cambios);
  };
  const alternarSeccion = (id: string) => {
    const siguiente = plegadas.includes(id)
      ? plegadas.filter((p) => p !== id)
      : [...plegadas, id];
    setPlegadas(siguiente);
    guardarSeccionesPlegadas(siguiente);
  };
  const plegada = (id: string) => plegadas.includes(id);
  const cambiarEstilo = (
    categoria: (typeof CATEGORIAS)[number]["id"],
    cambio: { oculta?: boolean; corte?: number | null; proyeccion?: number },
  ) => {
    const previo = vista.estilos ?? {};
    cambiar({ estilos: { ...previo, [categoria]: { ...previo[categoria], ...cambio } } });
  };
  const visibles = vista.nivelesVisibles;
  const alternarNivel = (globalid: string) => {
    const siguiente = new Set(visibles);
    if (siguiente.has(globalid)) siguiente.delete(globalid);
    else siguiente.add(globalid);
    cambiar({ nivelesVisibles: niveles.map((n) => n.globalid).filter((g) => siguiente.has(g)) });
  };
  const todosNiveles = () => cambiar({ nivelesVisibles: niveles.map((n) => n.globalid) });
  const ningunNivel = () => cambiar({ nivelesVisibles: [] });
  const todasCategorias = () => {
    const categorias = { ...vista.categorias };
    for (const categoria of CATEGORIAS) categorias[categoria.id] = true;
    cambiar({ categorias });
  };
  const ningunaCategoria = () => {
    const categorias = { ...vista.categorias };
    for (const categoria of CATEGORIAS) categorias[categoria.id] = false;
    cambiar({ categorias });
  };

  return (
    <div
      data-testid="propiedades-vista"
      className="propiedades-adaptable flex min-w-0 flex-col gap-2 overflow-x-hidden p-3 text-xs"
    >
      <Seccion
        id="identidad"
        titulo="Identidad"
        plegada={plegada("identidad")}
        onAlternar={alternarSeccion}
      >
        <label className="prop-fila">
          <span
            className="prop-etiqueta cursor-help text-muted-foreground"
            title="Nombre de la vista"
          >
            Nombre
          </span>
          <input
            data-testid="vista-nombre"
            value={vista.nombre}
            onChange={(e) => cambiar({ nombre: e.target.value })}
            className="h-7 min-w-0 flex-1 rounded border bg-background px-2"
          />
        </label>
        <label className="prop-fila">
          <span className="prop-etiqueta cursor-help text-muted-foreground" title="Tipo de vista">
            Tipo
          </span>
          <select
            data-testid="vista-tipo"
            value={vista.tipo}
            onChange={(e) => {
              const tipo = e.target.value as Vista["tipo"];
              const cambios: Partial<Vista> = { tipo };
              if (tipo === "alzado" && !vista.orientacion) cambios.orientacion = "sur";
              if (tipo === "corte") {
                cambios.profundidad = vista.profundidad ?? 10;
                cambios.alturaPlano = vista.alturaPlano ?? 1.2;
                cambios.puntoA = vista.puntoA ?? [0, 0];
                cambios.puntoB = vista.puntoB ?? [10, 0];
                cambios.direccion = vista.direccion ?? [0, 1];
              }
              if (tipo === "planta") cambios.alturaPlano = vista.alturaPlano ?? 1.2;
              cambiar(cambios);
            }}
            className="h-7 min-w-0 flex-1 rounded border bg-background px-2"
          >
            {(["planta", "alzado", "corte", "iso", "perspectiva"] as const).map((tipo) => (
              <option key={tipo} value={tipo}>
                {nombreTipo(tipo)}
              </option>
            ))}
          </select>
        </label>
        {(vista.tipo === "planta" || vista.tipo === "corte") && (
          <details data-testid="vista-rango-avanzado" className="rounded border bg-muted/20 px-2 py-1">
            <summary
              className="cursor-help text-xs font-semibold"
              title="Cuánto del modelo se ve por encima y por debajo del plano de corte. No cambia la altura del nivel."
            >
              Rango de vista (avanzado)
            </summary>
            <div className="mt-2 flex flex-col gap-1">
              <CampoNumero
                etiqueta="Altura del plano de corte (m)"
                testid="vista-altura"
                valor={vista.alturaPlano}
                onCambio={(alturaPlano) => cambiar({ alturaPlano })}
                ayuda="Altura a la que se cortan los muros y demás elementos en esta vista. Es independiente de la elevación del nivel."
              />
              <CampoNumero
                etiqueta="Profundidad (m)"
                testid="vista-profundidad"
                valor={vista.profundidad}
                onCambio={(profundidad) => cambiar({ profundidad })}
                ayuda="Qué tan abajo se sigue viendo el modelo desde el plano de corte."
              />
              {vista.tipo === "planta" && (
                <CampoNumero
                  etiqueta="Sobre el corte, hasta (m)"
                  testid="vista-altura-arriba"
                  valor={vista.alturaArriba ?? 3}
                  onCambio={(alturaArriba) => cambiar({ alturaArriba })}
                  ayuda="Distancia por encima del corte hasta la que se dibujan siluetas de losas, cubiertas y vigas."
                />
              )}
            </div>
          </details>
        )}
        {vista.tipo === "alzado" && (
          <div className="prop-fila">
            <span
              className="prop-etiqueta cursor-help text-muted-foreground"
              title="Punto cardinal hacia el que mira el alzado"
            >
              Orientación
            </span>
            <span data-testid="vista-orientacion" className="flex-1 text-right">
              {vista.orientacion}
            </span>
          </div>
        )}
        {vista.tipo === "corte" && (
          <div className="prop-fila">
            <span
              className="prop-etiqueta cursor-help text-muted-foreground"
              title="Dirección de la mirada del corte (x, y)"
            >
              Dirección
            </span>
            <span data-testid="vista-direccion" className="flex-1 text-right">
              {vista.direccion ? vista.direccion.map((n) => n.toFixed(2)).join(", ") : "—"}
            </span>
          </div>
        )}
      </Seccion>

      {(vista.tipo === "alzado" || vista.tipo === "corte") && (
        <Seccion
          id="anotacion"
          titulo="Anotación"
          plegada={plegada("anotacion")}
          onAlternar={alternarSeccion}
        >
          <label className="prop-fila text-xs" title="Separación del globo sobre el último nivel visible (mm de papel)">
            <span className="prop-etiqueta cursor-help text-muted-foreground">
              Separación de globos (mm)
            </span>
            <input
              data-testid="vista-separacion-globos"
              type="number"
              min="0"
              max="200"
              step="1"
              value={vista.separacionGlobos ?? ""}
              placeholder={String(estilos.ejes.separacionGlobos)}
              onChange={(e) => {
                if (e.target.value === "") {
                  cambiar({ separacionGlobos: undefined });
                  return;
                }
                const numero = Number(e.target.value);
                if (Number.isFinite(numero)) {
                  cambiar({ separacionGlobos: Math.min(Math.max(numero, 0), 200) });
                }
              }}
              className="w-24 rounded border bg-background px-2 py-1 text-right"
            />
          </label>
          <label className="prop-fila text-xs" title="A escala: los textos miden sus mm de papel y crecen con el zoom; Pantalla: tamaño legible fijo">
            <span className="prop-etiqueta text-muted-foreground">Escala de anotación</span>
            <select
              data-testid="vista-anotacion-escala"
              value={
                vista.anotacionEscala ??
                (vista.tipo === "alzado" || vista.tipo === "corte" ? "papel" : "pantalla")
              }
              onChange={(e) =>
                cambiar({ anotacionEscala: e.target.value === "papel" ? "papel" : "pantalla" })
              }
              className="rounded border bg-background px-2 py-1"
            >
              <option value="papel">A escala</option>
              <option value="pantalla">Pantalla</option>
            </select>
          </label>
          <label className="prop-fila text-xs">
            <span className="prop-etiqueta text-muted-foreground">Estilo de cota</span>
            <select
              data-testid="vista-estilo-cota"
              value={vista.estiloCota ?? estilos.cotas.porDefecto}
              onChange={(e) => cambiar({ estiloCota: e.target.value })}
              className="rounded border bg-background px-2 py-1"
            >
              {estilos.cotas.lista.map((c) => (
                <option key={c.nombre} value={c.nombre}>{c.nombre}</option>
              ))}
            </select>
          </label>
        </Seccion>
      )}

      <Seccion
        id="niveles"
        titulo="Niveles visibles"
        plegada={plegada("niveles")}
        onAlternar={alternarSeccion}
        acciones={<BotonesTodos prefijo="niveles" onTodos={todosNiveles} onNinguno={ningunNivel} />}
      >
        {niveles.map((nivel) => (
          <label key={nivel.globalid} className="flex h-7 items-center gap-2">
            <input
              type="checkbox"
              data-testid={`nivel-visible-${nivel.globalid}`}
              checked={visibles.includes(nivel.globalid)}
              onChange={() => alternarNivel(nivel.globalid)}
            />
            <span className="prop-truncar truncate">{nivel.nombre}</span>
          </label>
        ))}
      </Seccion>

      <Seccion
        id="categorias"
        titulo="Categorías visibles"
        plegada={plegada("categorias")}
        onAlternar={alternarSeccion}
        acciones={
          <BotonesTodos prefijo="categorias" onTodos={todasCategorias} onNinguno={ningunaCategoria} />
        }
      >
        <div className="prop-categorias">
          {CATEGORIAS.map((categoria) => (
            <label key={categoria.id} className="flex h-7 min-w-0 items-center gap-2">
              <input
                type="checkbox"
                data-testid={`categoria-${categoria.id}`}
                checked={vista.categorias[categoria.id] !== false}
                onChange={(e) =>
                  cambiar({
                    categorias: { ...vista.categorias, [categoria.id]: e.target.checked },
                  })
                }
              />
              <span className="prop-truncar truncate">{categoria.nombre}</span>
            </label>
          ))}
        </div>
      </Seccion>

      <Seccion
        id="estilos"
        titulo="Estilos de objeto"
        plegada={plegada("estilos")}
        onAlternar={alternarSeccion}
      >
        <div
          data-testid="vista-estilos-categorias"
          className="prop-estilos"
        >
          <span className="prop-estilos-encabezado text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Objeto
          </span>
          <span
            className="prop-estilos-encabezado text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
            title="Grosor de las líneas de proyección (mm de papel a 1:100)"
          >
            Proyección
          </span>
          <span
            className="prop-estilos-encabezado text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
            title="Grosor de la línea de corte (mm de papel a 1:100)"
          >
            Corte
          </span>
          {CATEGORIAS.map((categoria) => {
            const cambio = vista.estilos?.[categoria.id];
            const defecto = estilos.categorias[categoria.id];
            return (
              <div key={categoria.id} className="prop-estilo-fila">
                <label
                  className="prop-estilo-nombre flex h-7 min-w-0 items-center gap-1"
                  title={`Ocultar ${categoria.nombre} en esta vista`}
                >
                  <input
                    type="checkbox"
                    data-testid={`vista-estilo-${categoria.id}-oculta`}
                    checked={cambio?.oculta === true}
                    onChange={(e) => cambiarEstilo(categoria.id, { oculta: e.target.checked })}
                  />
                  <span className="prop-truncar truncate">{categoria.nombre}</span>
                </label>
                <span className="prop-estilo-campo">
                  <span className="prop-estilo-campo-etiqueta text-[10px] uppercase tracking-wide text-muted-foreground">
                    Proyección
                  </span>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    aria-label={`Grosor de proyección de ${categoria.nombre} en mm`}
                    title="Proyección (mm)"
                    data-testid={`vista-estilo-${categoria.id}-proyeccion`}
                    value={cambio?.proyeccion ?? defecto.proyeccion}
                    onChange={(e) => {
                      const valor = Number(e.target.value);
                      if (Number.isFinite(valor)) cambiarEstilo(categoria.id, { proyeccion: valor });
                    }}
                    className="h-6 w-full min-w-0 rounded border bg-background px-1 text-right tabular-nums"
                  />
                </span>
                <span className="prop-estilo-campo">
                  <span className="prop-estilo-campo-etiqueta text-[10px] uppercase tracking-wide text-muted-foreground">
                    Corte
                  </span>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    aria-label={`Grosor de corte de ${categoria.nombre} en mm`}
                    title="Corte (mm); vacío si la categoría no se corta"
                    data-testid={`vista-estilo-${categoria.id}-corte`}
                    value={cambio?.corte ?? defecto.corte ?? ""}
                    placeholder={defecto.corte === null ? "—" : String(defecto.corte)}
                    onChange={(e) => {
                      const valor = Number(e.target.value);
                      if (Number.isFinite(valor)) cambiarEstilo(categoria.id, { corte: valor });
                    }}
                    className="h-6 w-full min-w-0 rounded border bg-background px-1 text-right tabular-nums"
                  />
                </span>
              </div>
            );
          })}
        </div>
      </Seccion>

      <Seccion
        id="graficos"
        titulo="Gráficos"
        plegada={plegada("graficos")}
        onAlternar={alternarSeccion}
      >
        {vista.tipo === "planta" && (
          <label className="prop-fila">
            <span
              className="prop-etiqueta cursor-help text-muted-foreground"
              title="Dibuja las cotas de los ejes en la planta"
            >
              Cotas de ejes
            </span>
            <input
              type="checkbox"
              data-testid="vista-cotas-ejes"
              checked={vista.cotasEjes !== false}
              onChange={(e) => cambiar({ cotasEjes: e.target.checked })}
            />
          </label>
        )}
        <label className="prop-fila">
          <span
            className="prop-etiqueta cursor-help text-muted-foreground"
            title="Forma de dibujar las aristas de los objetos"
          >
            Estilo
          </span>
          <select
            data-testid="vista-estilo"
            value={vista.estilo}
            onChange={(e) => cambiar({ estilo: e.target.value as Vista["estilo"] })}
            className="h-7 min-w-0 flex-1 rounded border bg-background px-2"
          >
            {ESTILOS.map((estilo) => (
              <option key={estilo.id} value={estilo.id}>
                {estilo.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="prop-fila">
          <span
            className="prop-etiqueta cursor-help text-muted-foreground"
            title="Escala de referencia de la vista"
          >
            Escala
          </span>
          <select
            data-testid="vista-escala"
            value={vista.escala}
            onChange={(e) => cambiar({ escala: Number(e.target.value) as Vista["escala"] })}
            className="h-7 min-w-0 flex-1 rounded border bg-background px-2"
          >
            {ESCALAS.map((escala) => (
              <option key={escala} value={escala}>
                1:{escala}
              </option>
            ))}
          </select>
        </label>
      </Seccion>
    </div>
  );
}

/** Campo editable que guarda con Enter o al perder el foco (spec O003b). */
function CampoEditable({
  etiqueta,
  valor,
  testid,
  numerico,
  paso,
  title,
  onGuardar,
}: {
  etiqueta: string;
  valor: string | number | undefined;
  testid: string;
  numerico?: boolean;
  paso?: number;
  title?: string;
  onGuardar: (valor: string | number) => void;
}) {
  const [texto, setTexto] = useState(String(valor ?? ""));
  const guardar = (entrada: string) => {
    if (numerico) {
      const numero = Number(entrada);
      if (Number.isFinite(numero)) onGuardar(numero);
    } else if (entrada.trim()) {
      onGuardar(entrada.trim());
    }
    // O033: si el núcleo rechaza el valor, el campo vuelve al valor guardado.
    setTexto(String(valor ?? ""));
  };
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground" title={title}>{etiqueta}</span>
      <input
        key={String(valor)}
        data-testid={testid}
        type={numerico ? "number" : "text"}
        step={paso}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={(e) => guardar(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            guardar((e.target as HTMLInputElement).value);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="w-28 rounded border bg-background px-2 py-1 text-right"
      />
    </label>
  );
}

function AceroElemento({ globalid }: { globalid: string }) {
  const [datos, setDatos] = useState<{
    total_kg: number;
    longitudinal_kg: number;
    estribos_kg: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    llamarConBitacora<{
      total_kg: number;
      longitudinal_kg: number;
      estribos_kg: number;
    }>("acero.estimar", { globalid })
      .then((valor) => {
        if (vivo) setDatos(valor);
      })
      .catch((e) => {
        if (vivo) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      vivo = false;
    };
  }, [globalid]);
  if (error) return <div className="text-xs text-red-600">{error}</div>;
  if (!datos) return <div className="text-xs text-muted-foreground">Calculando acero…</div>;
  return (
    <div data-testid="acero-elemento" className="text-xs">
      <div>
        Acero estimado: <span className="font-semibold">{datos.total_kg.toFixed(3)} kg</span>
      </div>
      <div className="text-muted-foreground">
        Longitudinal {datos.longitudinal_kg.toFixed(3)} kg · estribos{" "}
        {datos.estribos_kg.toFixed(3)} kg
      </div>
    </div>
  );
}

function RestriccionesNivel({
  globalid,
  alturaActual,
  testidAltura,
}: {
  globalid: string;
  alturaActual: number;
  testidAltura: string;
}) {
  const niveles = useModelo((s) => s.niveles);
  const restricciones = useModelo((s) => s.propiedades?.restricciones);
  const editarRestricciones = useModelo((s) => s.editarRestricciones);
  if (!restricciones) return null;
  const sinConexion = !restricciones.NivelTope;
  const cambiar = (cambios: Parameters<typeof editarRestricciones>[1]) =>
    void editarRestricciones(globalid, cambios);
  return (
    <>
      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">Restricción de base</span>
        <select
          key={restricciones.NivelBase}
          data-testid="restriccion-base"
          defaultValue={restricciones.NivelBase}
          onChange={(e) => cambiar({ nivel_base: e.target.value })}
          className="w-32 rounded border bg-background px-2 py-1"
        >
          {niveles.map((nivel) => (
            <option key={nivel.globalid} value={nivel.globalid}>
              {nivel.nombre}
            </option>
          ))}
          {!niveles.some((n) => n.globalid === restricciones.NivelBase) && (
            <option value={restricciones.NivelBase}>(nivel actual)</option>
          )}
        </select>
      </label>
      <CampoEditable
        etiqueta="Desfase de base (m)"
        testid="desfase-base"
        numerico
        paso={0.05}
        valor={restricciones.DesfaseBase}
        onGuardar={(desfase_base) => cambiar({ desfase_base: Number(desfase_base) })}
      />
      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">Restricción de tope</span>
        <select
          key={restricciones.NivelTope}
          data-testid="restriccion-tope"
          defaultValue={restricciones.NivelTope}
          onChange={(e) => cambiar({ nivel_tope: e.target.value })}
          className="w-32 rounded border bg-background px-2 py-1"
        >
          <option value="">Sin conexión</option>
          {niveles.map((nivel) => (
            <option key={nivel.globalid} value={nivel.globalid}>
              {nivel.nombre}
            </option>
          ))}
        </select>
      </label>
      {!sinConexion && (
        <CampoEditable
          etiqueta="Desfase de tope (m)"
          testid="desfase-tope"
          numerico
          paso={0.05}
          valor={restricciones.DesfaseTope}
          onGuardar={(desfase_tope) => cambiar({ desfase_tope: Number(desfase_tope) })}
        />
      )}
      {sinConexion ? (
        <CampoEditable
          etiqueta="Altura (m)"
          testid={testidAltura}
          numerico
          paso={0.05}
          valor={restricciones.AlturaSinConexion}
          onGuardar={(altura) => cambiar({ altura_sin_conexion: Number(altura) })}
        />
      ) : (
        <label className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">Altura (m)</span>
          <span data-testid={testidAltura} className="w-28 text-right">
            {alturaActual.toFixed(2)}
          </span>
        </label>
      )}
    </>
  );
}

/** O033: las zapatas solo cuelgan de un nivel con su desplante. */
function RestriccionesZapata({
  globalid,
  desplante,
  esCorrida,
  prolongacionInicio,
  prolongacionFin,
}: {
  globalid: string;
  desplante: number;
  esCorrida: boolean;
  prolongacionInicio: number;
  prolongacionFin: number;
}) {
  const niveles = useModelo((s) => s.niveles);
  const restricciones = useModelo((s) => s.propiedades?.restricciones);
  const editarRestricciones = useModelo((s) => s.editarRestricciones);
  const editar = useModelo((s) => s.editarElemento);
  if (!restricciones) return null;
  const nivelBase = restricciones.NivelBase;
  const valorDesplante = "Desplante" in restricciones ? restricciones.Desplante : desplante;
  return (
    <>
      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">Nivel de base</span>
        <select
          key={nivelBase}
          data-testid="restriccion-base"
          defaultValue={nivelBase}
          onChange={(e) =>
            void editarRestricciones(globalid, { nivel_base: e.target.value })
          }
          className="w-32 rounded border bg-background px-2 py-1"
        >
          {niveles.map((nivel) => (
            <option key={nivel.globalid} value={nivel.globalid}>
              {nivel.nombre}
            </option>
          ))}
          {!niveles.some((n) => n.globalid === nivelBase) && (
            <option value={nivelBase}>(nivel actual)</option>
          )}
        </select>
      </label>
      <CampoEditable
        etiqueta="Desplante (m)"
        testid="elemento-desplante"
        numerico
        paso={0.05}
        title="Profundidad del fondo de la zapata bajo el nivel de base"
        valor={valorDesplante}
        onGuardar={(valor) => void editarRestricciones(globalid, { desplante: Number(valor) })}
      />
      {esCorrida && (
        <>
          <CampoEditable
            etiqueta="Prolongación inicio (m)"
            testid="elemento-prolongacion-inicio"
            numerico
            paso={0.05}
            valor={prolongacionInicio}
            onGuardar={(valor) => void editar(globalid, { ProlongacionInicio: valor })}
          />
          <CampoEditable
            etiqueta="Prolongación fin (m)"
            testid="elemento-prolongacion-fin"
            numerico
            paso={0.05}
            valor={prolongacionFin}
            onGuardar={(valor) => void editar(globalid, { ProlongacionFin: valor })}
          />
        </>
      )}
    </>
  );
}

/** O041: el cerramiento cuelga de un nivel (o de la corona de su muro), sin
 * restricción de tope ni altura. El nivel y el desfase se pueden editar siempre,
 * también si está ligado al muro; la liga es solo en planta. */
function RestriccionesCerramiento({ globalid }: { globalid: string }) {
  const niveles = useModelo((s) => s.niveles);
  const restricciones = useModelo((s) => s.propiedades?.restricciones);
  const muroLiga = useModelo((s) => s.propiedades?.muro_liga);
  const editarRestricciones = useModelo((s) => s.editarRestricciones);
  const soltarDelMuro = useModelo((s) => s.soltarDelMuro);
  if (!restricciones) return null;
  const cambiar = (cambios: Parameters<typeof editarRestricciones>[1]) =>
    void editarRestricciones(globalid, cambios);
  return (
    <div data-testid={muroLiga ? "cerramiento-ligado" : "cerramiento-suelto"} className="flex flex-col gap-1 text-xs">
      {muroLiga && (
        <div className="text-muted-foreground" data-testid="cerramiento-leyenda">
          Sigue el eje del muro {muroLiga.nombre}; la altura la manda el cerramiento.
        </div>
      )}
      <label className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Nivel de referencia</span>
        <select
          key={restricciones.NivelBase}
          data-testid="restriccion-base"
          defaultValue={restricciones.NivelBase}
          onChange={(e) => cambiar({ nivel_base: e.target.value })}
          className="w-32 rounded border bg-background px-2 py-1"
        >
          {niveles.map((nivel) => (
            <option key={nivel.globalid} value={nivel.globalid}>
              {nivel.nombre}
            </option>
          ))}
          {!niveles.some((n) => n.globalid === restricciones.NivelBase) && (
            <option value={restricciones.NivelBase}>(nivel actual)</option>
          )}
        </select>
      </label>
      <CampoEditable
        etiqueta="Desfase (m)"
        testid="desfase-base"
        numerico
        paso={0.05}
        valor={restricciones.DesfaseBase}
        onGuardar={(desfase_base) => cambiar({ desfase_base: Number(desfase_base) })}
      />
      {muroLiga && (
        <button
          type="button"
          data-testid="soltar-del-muro"
          className="mt-1 self-start rounded border px-2 py-1 hover:bg-muted"
          onClick={() => void soltarDelMuro(globalid)}
        >
          Soltar del muro
        </button>
      )}
    </div>
  );
}

function BordesLosaElemento({
  globalid,
  pset,
  editar,
}: {
  globalid: string;
  pset: Record<string, unknown> | undefined;
  editar: (globalid: string, cambios: Record<string, unknown>) => Promise<void>;
}) {
  const bordes = bordesDePset(pset);
  if (bordes.length === 0) {
    return (
      <div className="text-muted-foreground" data-testid="elemento-sin-bordes">
        Losa sin bordes referenciados.
      </div>
    );
  }
  const comun = valorComunDesfase(bordes);
  return (
    <div className="flex flex-col gap-2" data-testid="elemento-bordes-losa">
      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">Desfase de bordes (m)</span>
        <input
          key={String(comun)}
          data-testid="elemento-desfase-bordes"
          type={comun === "Varios" ? "text" : "number"}
          step={0.005}
          defaultValue={comun === "Varios" ? "Varios" : comun}
          onBlur={(e) => {
            const valor = Number(e.target.value);
            if (Number.isFinite(valor)) {
              void editar(globalid, { desfase_bordes: valor });
            }
          }}
          className="w-28 rounded border bg-background px-2 py-1 text-right"
        />
      </label>
      <table className="w-full text-left text-[11px]" data-testid="tabla-bordes-losa">
        <thead>
          <tr className="text-muted-foreground">
            <th className="font-normal">Borde</th>
            <th className="font-normal">Desfase</th>
          </tr>
        </thead>
        <tbody>
          {bordes.map((borde, indice) => (
            <tr key={indice} data-testid={`elemento-borde-${indice}`}>
              <td>{etiquetaBorde(indice, borde)}</td>
              <td>
                <input
                  key={`${indice}-${borde.desfase}`}
                  data-testid={`elemento-borde-${indice}-desfase`}
                  type="number"
                  step={0.005}
                  defaultValue={Number(borde.desfase) || 0}
                  onBlur={(e) => {
                    const valor = Number(e.target.value);
                    if (Number.isFinite(valor)) {
                      void editar(globalid, {
                        cambio_borde: { indice, desfase: valor },
                      });
                    }
                  }}
                  className="w-20 rounded border bg-background px-1 py-0.5 text-right"
                />
                <span className="ml-1 text-muted-foreground">
                  {desfaseConSigno(borde)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PropiedadesElemento() {
  const propiedades = useModelo((s) => s.propiedades);
  const editar = useModelo((s) => s.editarElemento);
  const tipos = useModelo((s) => s.tiposMuro);
  const error = useModelo((s) => s.error);
  const soltarEnlace = useModelo((s) => s.soltarEnlace);
  const voltearMuro = useModelo((s) => s.voltearMuro);
  const ejes = useModelo((s) => s.referencias.ejes);
  if (!propiedades) {
    return <div className="p-3 text-xs text-muted-foreground">Cargando propiedades…</div>;
  }
  const gid = propiedades.globalid;
  const esMuro = propiedades.clase === "IfcWall" || propiedades.clase === "IfcWallStandardCase";
  const esLosa = propiedades.clase === "IfcSlab";
  const esAbertura = propiedades.clase === "IfcDoor" || propiedades.clase === "IfcWindow";
  const estructura = propiedades.psets?.OPENRVT_Estructura as
    | Record<string, unknown>
    | undefined;
  const esEstructural = !!estructura;
  const predefinido = String(propiedades.atributos.PredefinedType ?? "");
  // O033: zapata aislada o corrida (el contratrabe es una viga de cimentación).
  const esZapata = propiedades.clase === "IfcFooting" && predefinido !== "FOOTING_BEAM";
  const esZapataCorrida = esZapata && predefinido === "STRIP_FOOTING";
  // O040: el cerramiento cuelga del muro o de un nivel; sin tope ni altura.
  const esCerramiento = propiedades.alias === "cerramiento";
  const atributos = propiedades.atributos;
  const ancho = Number(atributos.OverallWidth ?? 0);
  const alto = Number(atributos.OverallHeight ?? 0);
  return (
    <div data-testid="propiedades-elemento" className="flex flex-col gap-3 p-3 text-xs">
      <div>
        <div className="text-sm font-semibold">{propiedades.nombre || "(sin nombre)"}</div>
        <div className="text-muted-foreground" data-testid="elemento-clase">
          {propiedades.clase}
        </div>
        <div className="text-muted-foreground">
          {propiedades.nivel || "Sin nivel"}
          {propiedades.tipo ? ` · ${propiedades.tipo}` : ""}
        </div>
        {error && (
          <div data-testid="elemento-error" className="mt-1 text-red-600">
            {error}
          </div>
        )}
      </div>
      <fieldset className="flex flex-col gap-2 border-y py-2">
        <legend className="font-semibold">Propiedades editables</legend>
        <CampoEditable
          etiqueta="Nombre"
          testid="elemento-nombre"
          valor={propiedades.nombre}
          onGuardar={(nombre) => void editar(gid, { nombre })}
        />
        {esMuro && (
          <>
            <label className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Tipo</span>
              <select
                key={propiedades.tipo}
                data-testid="elemento-tipo"
                defaultValue={propiedades.tipo}
                onChange={(e) => void editar(gid, { tipo: e.target.value })}
                className="w-28 rounded border bg-background px-2 py-1"
              >
                {tipos.map((tipo) => (
                  <option key={tipo.globalid} value={tipo.nombre}>
                    {tipo.nombre}
                  </option>
                ))}
                {!tipos.some((t) => t.nombre === propiedades.tipo) && (
                  <option value={propiedades.tipo}>{propiedades.tipo || "(sin tipo)"}</option>
                )}
              </select>
            </label>
            <label className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Línea de ubicación</span>
              <select
                data-testid="elemento-linea-ubicacion"
                value={String(
                  (propiedades.psets?.OPENRVT_Muro as Record<string, unknown>)
                    ?.LineaUbicacion ?? "eje_nucleo",
                )}
                onChange={(e) =>
                  void editar(gid, { linea_ubicacion: e.target.value })
                }
                className="w-36 rounded border bg-background px-2 py-1"
              >
                <option value="eje_nucleo">Eje del muro</option>
                <option value="cara_exterior">Paño exterior</option>
                <option value="cara_interior">Paño interior</option>
                <option value="centro">Eje del núcleo</option>
              </select>
            </label>
            <CampoEditable
              etiqueta="Desfase de ubicación (m)"
              testid="elemento-desfase-ubicacion"
              numerico
              paso={0.005}
              valor={Number(
                (propiedades.psets?.OPENRVT_Muro as Record<string, unknown>)
                  ?.DesfaseUbicacion ?? 0,
              )}
              onGuardar={(valor) =>
                void editar(gid, { desfase_ubicacion: Number(valor) })
              }
            />
            <button
              type="button"
              data-testid="elemento-voltear-muro"
              onClick={() => void voltearMuro(gid)}
              className="self-start rounded border px-2 py-0.5 hover:bg-muted"
              title="Voltea los lados exterior e interior sin mover la línea de ubicación"
            >
              ⇄ Voltear lados
            </button>
            <RestriccionesNivel
              globalid={gid}
              testidAltura="elemento-altura"
              alturaActual={Number(
                (propiedades.psets?.OPENRVT_Muro as Record<string, unknown>)?.Altura ?? 2.6,
              )}
            />
          </>
        )}
        {esLosa && (
          <>
            <CampoEditable
              etiqueta="Espesor (m)"
              testid="elemento-espesor"
              numerico
              paso={0.01}
              valor={Number((propiedades.psets?.OPENRVT_Losa as Record<string, unknown>)?.Espesor ?? 0.12)}
              onGuardar={(espesor) => void editar(gid, { espesor })}
            />
            <BordesLosaElemento
              globalid={gid}
              pset={propiedades.psets?.OPENRVT_Losa as Record<string, unknown> | undefined}
              editar={editar}
            />
          </>
        )}
        {esAbertura && (
          <>
            <CampoEditable
              etiqueta="Ancho (m)"
              testid="elemento-ancho"
              numerico
              paso={0.05}
              valor={ancho || (propiedades.clase === "IfcDoor" ? 0.9 : 1.2)}
              onGuardar={(valor) => void editar(gid, { ancho: valor })}
            />
            <CampoEditable
              etiqueta="Alto (m)"
              testid="elemento-alto"
              numerico
              paso={0.05}
              valor={alto || (propiedades.clase === "IfcDoor" ? 2.1 : 1.2)}
              onGuardar={(valor) => void editar(gid, { alto: valor })}
            />
          </>
        )}
        {esEstructural && esZapata && (
          <>
            <RestriccionesZapata
              globalid={gid}
              desplante={Number(estructura?.Desplante ?? 0.8)}
              esCorrida={esZapataCorrida}
              prolongacionInicio={Number(estructura?.ProlongacionInicio ?? 0)}
              prolongacionFin={Number(estructura?.ProlongacionFin ?? 0)}
            />
          </>
        )}
        {esEstructural && !esZapata && (
          <>
            {esCerramiento ? (
              <RestriccionesCerramiento globalid={gid} />
            ) : (
              <>
                {estructura?.Desfase !== undefined && (
                  <CampoEditable
                    etiqueta="Desfase (m)"
                    testid="elemento-desfase"
                    numerico
                    paso={0.05}
                    valor={Number(estructura.Desfase)}
                    onGuardar={(valor) => void editar(gid, { Desfase: valor })}
                  />
                )}
                {!esMuro && (
                  <RestriccionesNivel
                    globalid={gid}
                    testidAltura="elemento-altura-estructura"
                    alturaActual={Number(estructura?.Altura ?? estructura?.H ?? 0)}
                  />
                )}
              </>
            )}
          </>
        )}
      </fieldset>
      {propiedades.enlace && (
        <div
          data-testid="elemento-enlace"
          className="flex items-center justify-between gap-2 border-b pb-2 text-xs"
        >
          <span>
            Enlazado a: {describirEnlace(propiedades.enlace, ejes)}
          </span>
          <button
            type="button"
            data-testid="soltar-enlace"
            className="rounded border px-2 py-1"
            onClick={() => void soltarEnlace(gid)}
          >
            Soltar enlace
          </button>
        </div>
      )}
      {esEstructural && (
        <div className="border-b pb-2">
          <AceroElemento globalid={gid} />
        </div>
      )}
      <details open>
        <summary className="cursor-pointer font-semibold">Atributos</summary>
        <dl className="mt-1 grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-x-2 gap-y-1">
          {Object.entries(propiedades.atributos).map(([clave, valor]) => (
            <div key={clave} className="contents">
              <dt className="prop-truncar truncate text-muted-foreground" title={clave}>
                {clave}
              </dt>
              <dd className="break-words">{formatear(valor)}</dd>
            </div>
          ))}
        </dl>
      </details>
      {propiedades.materiales.length > 0 && (
        <details open>
          <summary className="cursor-pointer font-semibold">Materiales y capas</summary>
          <ul className="mt-1 flex flex-col gap-1">
            {propiedades.materiales.map((material, i) => (
              <li key={`${material.nombre}-${i}`}>
                <div>{material.nombre || "(sin nombre)"}</div>
                {material.capas.length > 0 && (
                  <ul className="ml-3 list-disc text-muted-foreground">
                    {material.capas.map((capa, j) => (
                      <li key={j}>
                        {formatear(capa.nombre || capa.material)}
                        {capa.espesor !== undefined ? ` · ${formatear(capa.espesor)} m` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
      {Object.entries(propiedades.psets).map(([nombre, valores]) => (
        <details key={nombre} open>
          <summary className="cursor-pointer font-semibold">{nombre}</summary>
          <dl className="mt-1 grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-x-2 gap-y-1">
            {Object.entries(valores).map(([clave, valor]) => (
              <div key={clave} className="contents">
                <dt className="prop-truncar truncate text-muted-foreground" title={clave}>
                  {clave}
                </dt>
                <dd className="break-words">{formatear(valor)}</dd>
              </div>
            ))}
          </dl>
        </details>
      ))}
    </div>
  );
}

/** O021: propiedades del eje seleccionado (globos por extremo y extremos en automático). */
function PropiedadesEje({ vista }: { vista: Vista }) {
  const ejeSeleccionado = useModelo((s) => s.ejeSeleccionado);
  const referencias = useModelo((s) => s.referencias);
  const fijarAjustesEjes = useModelo((s) => s.fijarAjustesEjes);
  const eje = referencias.ejes.find((e) => e.globalid === ejeSeleccionado);
  if (!eje) return null;
  const ajuste: AjusteEjeVista | undefined = vista.ejes?.[eje.globalid];
  const guardar = (cambios: Partial<AjusteEjeVista>, limpiar = false) => {
    if (limpiar) {
      void fijarAjustesEjes(vista.id, { [eje.globalid]: null });
      return;
    }
    const siguiente: AjusteEjeVista = { ...(ajuste ?? {}), ...cambios };
    void fijarAjustesEjes(vista.id, { [eje.globalid]: siguiente });
  };
  const automaticos = !ajuste?.extremoInicio && !ajuste?.extremoFin;
  return (
    <div data-testid="propiedades-eje" className="flex flex-col gap-2 p-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-semibold">Eje {eje.etiqueta}</span>
        <span className="text-muted-foreground">{vista.nombre}</span>
      </div>
      <label className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Globo inicio</span>
        <input
          type="checkbox"
          data-testid="eje-prop-globo-inicio"
          checked={globoVisibleEje(ajuste, "inicio")}
          onChange={(e) => guardar({ globoInicio: e.target.checked })}
        />
      </label>
      <label className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Globo fin</span>
        <input
          type="checkbox"
          data-testid="eje-prop-globo-fin"
          checked={globoVisibleEje(ajuste, "fin")}
          onChange={(e) => guardar({ globoFin: e.target.checked })}
        />
      </label>
      <label
        className="flex items-center justify-between gap-2"
        title="Con los extremos en automático, el eje sigue la alineación común de la retícula."
      >
        <span className="text-muted-foreground">Extremos en automático</span>
        <input
          type="checkbox"
          data-testid="eje-prop-automatico"
          checked={automaticos}
          onChange={(e) => {
            if (!e.target.checked) return;
            const siguiente: AjusteEjeVista = { ...(ajuste ?? {}) };
            delete siguiente.extremoInicio;
            delete siguiente.extremoFin;
            void fijarAjustesEjes(vista.id, { [eje.globalid]: siguiente });
          }}
        />
      </label>
      <button
        type="button"
        data-testid="eje-prop-restablecer"
        className="rounded border px-2 py-1 hover:bg-muted"
        onClick={() => guardar({}, true)}
      >
        Restablecer acomodo de este eje
      </button>
    </div>
  );
}

export function PanelPropiedades({ onPlegar }: { onPlegar?: () => void }) {
  const seleccion = useModelo((s) => s.seleccion);
  const ejeSeleccionado = useModelo((s) => s.ejeSeleccionado);
  const vistas = useModelo((s) => s.vistas);
  const vistaActivaId = useModelo((s) => s.vistaActivaId);
  const vista = vistas.find((v) => v.id === vistaActivaId);
  const hayEje = !!ejeSeleccionado && !!vista;
  return (
    <aside
      data-testid="panel-propiedades"
      aria-label="Propiedades"
      className="flex min-h-0 w-full flex-col overflow-y-auto border-l bg-background"
    >
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {seleccion
            ? "Propiedades del elemento"
            : hayEje
              ? "Propiedades del eje"
              : "Propiedades de la vista"}
        </span>
        {onPlegar && (
          <button
            type="button"
            data-testid="panel-derecho-plegar"
            aria-label="Plegar panel derecho"
            title="Plegar el panel de Propiedades (Ctrl+Alt+→)"
            onClick={onPlegar}
            className="rounded px-1 text-sm text-muted-foreground hover:bg-muted"
          >
            ›
          </button>
        )}
      </div>
      {seleccion ? (
        <PropiedadesElemento />
      ) : hayEje && vista ? (
        <PropiedadesEje vista={vista} />
      ) : vista ? (
        <PropiedadesVista vista={vista} />
      ) : (
        <div className="p-3 text-xs text-muted-foreground">No hay ninguna vista activa.</div>
      )}
    </aside>
  );
}
