// Panel derecho sin selección: propiedades de la vista (O003b).
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useModelo } from "./estado";
import {
  CATEGORIAS,
  ESCALAS,
  ESTILOS,
  nombreTipo,
  type Vista,
} from "./tipos";

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

      {(vista.tipo === "iso" || vista.tipo === "perspectiva") && (
        <Seccion
          id="anotaciones3d"
          titulo="Anotaciones en 3D"
          plegada={plegada("anotaciones3d")}
          onAlternar={alternarSeccion}
        >
          {(
            [
              ["ejes3d", "Ejes", "Líneas de eje con globo en ambos extremos"],
              ["niveles3d", "Niveles", "Rectángulo discontinuo en cada nivel"],
              ["cotas3d", "Cotas", "Cotas automáticas entre ejes en la base"],
              ["notas3d", "Notas", "Notas de texto visibles en la vista"],
            ] as const
          ).map(([clave, nombre, ayuda]) => (
            <label key={clave} className="flex h-7 items-center gap-2" title={ayuda}>
              <input
                type="checkbox"
                data-testid={`vista-${clave}`}
                checked={clave === "notas3d" ? vista.notas3d !== false : vista[clave] === true}
                onChange={(e) => cambiar({ [clave]: e.target.checked })}
              />
              <span>{nombre}</span>
            </label>
          ))}
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

