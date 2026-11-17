// Panel derecho con un elemento seleccionado.
import { useModelo } from "./estado";
import { CampoEditable } from "./campoEditable";
import { PropiedadesLosa } from "./panelLosa";
import { formatear } from "./panelFormato";
import { describirEnlace } from "./enlaces";
import {
  AceroElemento,
  RestriccionesCerramiento,
  RestriccionesNivel,
  RestriccionesZapata,
} from "./propiedadesEstructura";

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
  // O054: «del núcleo» es lo normal; «del tipo» usa B × H del tipo.
  const anchoDelNucleo = !(
    estructura?.AnchoDelMuro === false ||
    estructura?.AnchoDelMuro === "False" ||
    estructura?.AnchoDelMuro === "false" ||
    estructura?.AnchoDelMuro === 0 ||
    estructura?.AnchoDelMuro === "0"
  );
  const predefinido = String(propiedades.atributos.PredefinedType ?? "");
  // O033: zapata aislada o corrida (el contratrabe es una viga de cimentación).
  const esZapata = propiedades.clase === "IfcFooting" && predefinido !== "FOOTING_BEAM";
  const esZapataCorrida = esZapata && predefinido === "STRIP_FOOTING";
  // O040: el cerramiento cuelga del muro o de un nivel; sin tope ni altura.
  const esCerramiento = propiedades.alias === "cerramiento";
  const atributos = propiedades.atributos;
  const ancho = Number(atributos.OverallWidth ?? 0);
  const alto = Number(atributos.OverallHeight ?? 0);
  // O035: la casilla viene activada por omisión en los muros.
  const psetMuro = propiedades.psets?.OPENRVT_Muro as
    | Record<string, unknown>
    | undefined;
  const bajarCimentacion = !(
    psetMuro?.BajarACimentacion === false ||
    psetMuro?.BajarACimentacion === "False" ||
    psetMuro?.BajarACimentacion === "false" ||
    psetMuro?.BajarACimentacion === 0 ||
    psetMuro?.BajarACimentacion === "0"
  );
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
            <label
              className="flex items-center gap-2 text-xs"
              title="Baja la base del muro hasta la cara superior de la zapata corrida o contratrabe que quede debajo; un desfase de base distinto de cero manda."
            >
              <input
                type="checkbox"
                data-testid="elemento-bajar-cimentacion"
                checked={bajarCimentacion}
                onChange={(e) =>
                  void editar(gid, { bajar_a_cimentacion: e.target.checked })
                }
              />
              <span>Bajar hasta la cimentación</span>
            </label>
            <RestriccionesNivel
              globalid={gid}
              testidAltura="elemento-altura"
              alturaActual={Number(
                (propiedades.psets?.OPENRVT_Muro as Record<string, unknown>)?.Altura ?? 2.6,
              )}
            />
          </>
        )}
        {esLosa && <PropiedadesLosa propiedades={propiedades} editar={editar} />}
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
            {["castillo", "trabe", "dala", "cerramiento"].includes(
              String(propiedades.alias ?? ""),
            ) && (
              <label className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">Ancho</span>
                <select
                  data-testid="elemento-ancho-muro"
                  value={anchoDelNucleo ? "nucleo" : "tipo"}
                  onChange={(e) =>
                    void editar(gid, {
                      AnchoDelMuro: e.target.value === "nucleo",
                    })
                  }
                  className="w-32 rounded border bg-background px-2 py-1"
                >
                  <option value="nucleo">del núcleo</option>
                  <option value="tipo">del tipo</option>
                </select>
              </label>
            )}
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
