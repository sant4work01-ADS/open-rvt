// OPEN-RVT: panel derecho. Sin selección muestra las propiedades de la vista (todas
// editables y persistidas en OPENRVT_Vistas); con selección, las del elemento IFC.
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
}: {
  etiqueta: string;
  valor: number | undefined;
  testid: string;
  onCambio: (valor: number) => void;
  paso?: number;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{etiqueta}</span>
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

function PropiedadesVista({ vista }: { vista: Vista }) {
  const actualizar = useModelo((s) => s.actualizarVista);
  const niveles = useModelo((s) => s.niveles);
  const cambiar = (cambios: Partial<Vista>) => {
    void actualizar(vista.id, cambios);
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
        <>
          <CampoNumero
            etiqueta="Altura del plano de corte (m)"
            testid="vista-altura"
            valor={vista.alturaPlano}
            onCambio={(alturaPlano) => cambiar({ alturaPlano })}
          />
          <CampoNumero
            etiqueta="Profundidad (m)"
            testid="vista-profundidad"
            valor={vista.profundidad}
            onCambio={(profundidad) => cambiar({ profundidad })}
          />
        </>
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
      </fieldset>
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

export function PanelPropiedades() {
  const seleccion = useModelo((s) => s.seleccion);
  const vistas = useModelo((s) => s.vistas);
  const vistaActivaId = useModelo((s) => s.vistaActivaId);
  const vista = vistas.find((v) => v.id === vistaActivaId);
  return (
    <aside
      data-testid="panel-propiedades"
      aria-label="Propiedades"
      className="flex w-[275px] shrink-0 flex-col overflow-y-auto border-l bg-background"
    >
      <div className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {seleccion ? "Propiedades del elemento" : "Propiedades de la vista"}
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
