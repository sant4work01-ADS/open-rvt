// OPEN-RVT: panel derecho. Sin selección muestra las propiedades de la vista (todas
// editables y persistidas en OPENRVT_Vistas); con selección, las del elemento IFC.
import { useEffect, useState } from "react";
import { llamarConBitacora } from "@/lib/bitacora";
import { useModelo } from "./estado";
import {
  CATEGORIAS,
  ESCALAS,
  ESTILOS,
  nombreTipo,
  type Vista,
} from "./tipos";

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
    <label className="flex items-center justify-between gap-2 text-xs" title={ayuda}>
      <span className="cursor-help text-muted-foreground">{etiqueta}</span>
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

export function PropiedadesVista({ vista }: { vista: Vista }) {
  const actualizar = useModelo((s) => s.actualizarVista);
  const niveles = useModelo((s) => s.niveles);
  const estilos = useModelo((s) => s.estilos);
  const cambiar = (cambios: Partial<Vista>) => {
    void actualizar(vista.id, cambios);
  };
  const cambiarEstilo = (
    categoria: (typeof CATEGORIAS)[number]["id"],
    cambio: { oculta?: boolean; corte?: number | null; proyeccion?: number },
  ) => {
    const previo = vista.estilos ?? {};
    cambiar({ estilos: { ...previo, [categoria]: { ...previo[categoria], ...cambio } } });
  };
  const visibles = vista.nivelesVisibles.length === 0
    ? niveles.map((n) => n.globalid)
    : vista.nivelesVisibles;
  const alternarNivel = (globalid: string) => {
    const siguiente = new Set(visibles);
    if (siguiente.has(globalid)) siguiente.delete(globalid);
    else siguiente.add(globalid);
    cambiar({ nivelesVisibles: niveles.map((n) => n.globalid).filter((g) => siguiente.has(g)) });
  };
  return (
    <div data-testid="propiedades-vista" className="flex flex-col gap-3 p-3 text-xs">
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground">Nombre</span>
        <input
          data-testid="vista-nombre"
          value={vista.nombre}
          onChange={(e) => cambiar({ nombre: e.target.value })}
          className="rounded border bg-background px-2 py-1"
        />
      </label>
      <label className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Tipo</span>
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
          className="rounded border bg-background px-2 py-1"
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
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Orientación</span>
          <span data-testid="vista-orientacion">{vista.orientacion}</span>
        </div>
      )}
      {vista.tipo === "corte" && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Dirección</span>
          <span data-testid="vista-direccion">
            {vista.direccion ? vista.direccion.map((n) => n.toFixed(2)).join(", ") : "—"}
          </span>
        </div>
      )}

      <fieldset className="flex flex-col gap-1 border-t pt-2">
        <legend className="mb-1 font-semibold">Niveles visibles</legend>
        {niveles.map((nivel) => (
          <label key={nivel.globalid} className="flex items-center gap-2">
            <input
              type="checkbox"
              data-testid={`nivel-visible-${nivel.globalid}`}
              checked={visibles.includes(nivel.globalid)}
              onChange={() => alternarNivel(nivel.globalid)}
            />
            <span>{nivel.nombre}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-1 border-t pt-2">
        <legend className="mb-1 font-semibold">Categorías visibles</legend>
        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
          {CATEGORIAS.map((categoria) => (
            <label key={categoria.id} className="flex items-center gap-2">
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
              <span>{categoria.nombre}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {vista.tipo === "planta" && (
        <label className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Cotas de ejes</span>
          <input
            type="checkbox"
            data-testid="vista-cotas-ejes"
            checked={vista.cotasEjes !== false}
            onChange={(e) => cambiar({ cotasEjes: e.target.checked })}
          />
        </label>
      )}

      <fieldset
        data-testid="vista-estilos-categorias"
        className="flex flex-col gap-1 border-t pt-2"
      >
        <legend className="mb-1 font-semibold">Estilos de objeto (esta vista)</legend>
        {CATEGORIAS.map((categoria) => {
          const cambio = vista.estilos?.[categoria.id];
          const defecto = estilos.categorias[categoria.id];
          return (
            <div key={categoria.id} className="flex items-center gap-1">
              <label className="flex w-20 items-center gap-1" title={`Ocultar ${categoria.nombre}`}>
                <input
                  type="checkbox"
                  data-testid={`vista-estilo-${categoria.id}-oculta`}
                  checked={cambio?.oculta === true}
                  onChange={(e) => cambiarEstilo(categoria.id, { oculta: e.target.checked })}
                />
                <span className="truncate">{categoria.nombre}</span>
              </label>
              <input
                type="number"
                step="0.05"
                min="0"
                aria-label={`Grosor de corte de ${categoria.nombre}`}
                data-testid={`vista-estilo-${categoria.id}-corte`}
                value={cambio?.corte ?? defecto.corte ?? ""}
                placeholder={defecto.corte === null ? "—" : String(defecto.corte)}
                onChange={(e) => {
                  const valor = Number(e.target.value);
                  if (Number.isFinite(valor)) cambiarEstilo(categoria.id, { corte: valor });
                }}
                className="w-16 rounded border bg-background px-1 py-0.5 text-right"
              />
              <input
                type="number"
                step="0.02"
                min="0"
                aria-label={`Grosor de proyección de ${categoria.nombre}`}
                data-testid={`vista-estilo-${categoria.id}-proyeccion`}
                value={cambio?.proyeccion ?? defecto.proyeccion}
                onChange={(e) => {
                  const valor = Number(e.target.value);
                  if (Number.isFinite(valor)) cambiarEstilo(categoria.id, { proyeccion: valor });
                }}
                className="w-16 rounded border bg-background px-1 py-0.5 text-right"
              />
            </div>
          );
        })}
      </fieldset>

      <label className="flex items-center justify-between gap-2 border-t pt-2">
        <span className="text-muted-foreground">Estilo</span>
        <select
          data-testid="vista-estilo"
          value={vista.estilo}
          onChange={(e) => cambiar({ estilo: e.target.value as Vista["estilo"] })}
          className="rounded border bg-background px-2 py-1"
        >
          {ESTILOS.map((estilo) => (
            <option key={estilo.id} value={estilo.id}>
              {estilo.nombre}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Escala de referencia</span>
        <select
          data-testid="vista-escala"
          value={vista.escala}
          onChange={(e) => cambiar({ escala: Number(e.target.value) as Vista["escala"] })}
          className="rounded border bg-background px-2 py-1"
        >
          {ESCALAS.map((escala) => (
            <option key={escala} value={escala}>
              1:{escala}
            </option>
          ))}
        </select>
      </label>
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
  onGuardar,
}: {
  etiqueta: string;
  valor: string | number | undefined;
  testid: string;
  numerico?: boolean;
  paso?: number;
  onGuardar: (valor: string | number) => void;
}) {
  const guardar = (texto: string) => {
    if (numerico) {
      const numero = Number(texto);
      if (Number.isFinite(numero)) onGuardar(numero);
    } else if (texto.trim()) {
      onGuardar(texto.trim());
    }
  };
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{etiqueta}</span>
      <input
        key={String(valor)}
        data-testid={testid}
        type={numerico ? "number" : "text"}
        step={paso}
        defaultValue={valor ?? ""}
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

function PropiedadesElemento() {
  const propiedades = useModelo((s) => s.propiedades);
  const editar = useModelo((s) => s.editarElemento);
  const tipos = useModelo((s) => s.tiposMuro);
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
            <CampoEditable
              etiqueta="Altura (m)"
              testid="elemento-altura"
              numerico
              paso={0.05}
              valor={Number((propiedades.psets?.OPENRVT_Muro as Record<string, unknown>)?.Altura ?? 2.6)}
              onGuardar={(altura) => void editar(gid, { altura })}
            />
          </>
        )}
        {esLosa && (
          <CampoEditable
            etiqueta="Espesor (m)"
            testid="elemento-espesor"
            numerico
            paso={0.01}
            valor={Number((propiedades.psets?.OPENRVT_Losa as Record<string, unknown>)?.Espesor ?? 0.12)}
            onGuardar={(espesor) => void editar(gid, { espesor })}
          />
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
        {esEstructural && (
          <>
            {estructura?.Desplante !== undefined && (
              <CampoEditable
                etiqueta="Desplante (m)"
                testid="elemento-desplante"
                numerico
                paso={0.05}
                valor={Number(estructura.Desplante)}
                onGuardar={(valor) => void editar(gid, { Desplante: valor })}
              />
            )}
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
            {estructura?.Altura !== undefined && (
              <CampoEditable
                etiqueta="Altura (m)"
                testid="elemento-altura-estructura"
                numerico
                paso={0.05}
                valor={Number(estructura.Altura)}
                onGuardar={(valor) => void editar(gid, { Altura: valor })}
              />
            )}
            {estructura?.NivelSuperior !== undefined && (
              <CampoEditable
                etiqueta="Nivel superior (GlobalId)"
                testid="elemento-nivel-superior"
                valor={String(estructura.NivelSuperior ?? "")}
                onGuardar={(valor) => void editar(gid, { NivelSuperior: valor })}
              />
            )}
          </>
        )}
      </fieldset>
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
              <dt className="truncate text-muted-foreground" title={clave}>
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
                <dt className="truncate text-muted-foreground" title={clave}>
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

export function PanelPropiedades({ onPlegar }: { onPlegar?: () => void }) {
  const seleccion = useModelo((s) => s.seleccion);
  const vistas = useModelo((s) => s.vistas);
  const vistaActivaId = useModelo((s) => s.vistaActivaId);
  const vista = vistas.find((v) => v.id === vistaActivaId);
  return (
    <aside
      data-testid="panel-propiedades"
      aria-label="Propiedades"
      className="flex min-h-0 w-full flex-col overflow-y-auto border-l bg-background"
    >
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {seleccion ? "Propiedades del elemento" : "Propiedades de la vista"}
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
      ) : vista ? (
        <PropiedadesVista vista={vista} />
      ) : (
        <div className="p-3 text-xs text-muted-foreground">No hay ninguna vista activa.</div>
      )}
    </aside>
  );
}
