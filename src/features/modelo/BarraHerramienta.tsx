// OPEN-RVT (O003b): barra de opciones de la herramienta activa. El selector de tipo
// de muro aparece aquí, junto con altura y alineación, como en Revit.
import {
  ALIAS_HERRAMIENTA,
  esHerramientaEstructura,
  esHerramientaLineal,
  esHerramientaPuntual,
  useModelo,
  type ModoRecorte,
} from "./estado";
import { plantaTomaNivelPropio } from "./herramientas";
import { textoDimensiones, type ClasificacionEmpujar } from "./empujar";
import type { LineaUbicacion } from "./tipos";

export function BarraHerramienta() {
  const herramienta = useModelo((s) => s.herramienta);
  const opciones = useModelo((s) => s.opcionesMuro);
  const tipos = useModelo((s) => s.tiposMuro);
  const fijar = useModelo((s) => s.fijarOpcionesMuro);
  const tiposEstructura = useModelo((s) => s.tiposHerramienta);
  const elegidos = useModelo((s) => s.tipoHerramienta);
  const fijarTipo = useModelo((s) => s.fijarTipoHerramienta);
  const girar = useModelo((s) => s.girar90);
  const rotacion = useModelo((s) => s.rotacionSiguiente);
  const puntos = useModelo((s) => s.puntosHerramienta);
  const longitud = useModelo((s) => s.longitudTecleada);
  const seleccionados = useModelo((s) => s.seleccionados);
  const voltear = useModelo((s) => s.voltearSiguiente);
  const cancelar = useModelo((s) => s.cancelarHerramienta);
  const doble = useModelo((s) => s.dobleClicEnPlanta);
  const losaDesdeMuros = useModelo((s) => s.losaDesdeMuros);
  const opcionesLosa = useModelo((s) => s.opcionesLosa);
  const fijarOpcionesLosa = useModelo((s) => s.fijarOpcionesLosa);
  const opcionesEspejo = useModelo((s) => s.opcionesEspejo);
  const fijarOpcionesEspejo = useModelo((s) => s.fijarOpcionesEspejo);
  const opcionesMatriz = useModelo((s) => s.opcionesMatriz);
  const fijarOpcionesMatriz = useModelo((s) => s.fijarOpcionesMatriz);
  const etiquetaEje = useModelo((s) => s.etiquetaEje);
  const opcionesNivel = useModelo((s) => s.opcionesNivel);
  const fijarOpcionesNivel = useModelo((s) => s.fijarOpcionesNivel);
  const cotasNivel = useModelo((s) => s.cotasNivel);
  const crearNivel = useModelo((s) => s.crearNivel);
  const conZapata = useModelo((s) => s.columnaConZapata);
  const fijarConZapata = useModelo((s) => s.fijarColumnaConZapata);
  const tipoZapata = useModelo((s) => s.tipoZapata);
  const fijarTipoZapata = useModelo((s) => s.fijarTipoZapata);
  const columnasEnCruces = useModelo((s) => s.columnasEnCruces);
  const opcionesCerramiento = useModelo((s) => s.opcionesCerramiento);
  const fijarOpcionesCerramiento = useModelo((s) => s.fijarOpcionesCerramiento);
  const niveles = useModelo((s) => s.niveles);
  const vistaActivaId = useModelo((s) => s.vistaActivaId);
  const vistas = useModelo((s) => s.vistas);
  const modoRecorte = useModelo((s) => s.modoRecorte);
  const fijarModoRecorte = useModelo((s) => s.fijarModoRecorte);
  const referenciaRecorte = useModelo((s) => s.referenciaRecorte);
  const recorteInicial = useModelo((s) => s.recorteInicial);
  const empujarClasificacion = useModelo((s) => s.empujarClasificacion);
  const fijarClasificacion = useModelo((s) => s.fijarClasificacionEmpujar);
  const empujarRect = useModelo((s) => s.empujarRect);
  const empujarAltura = useModelo((s) => s.empujarAltura);
  const empujarCara = useModelo((s) => s.empujarCara);
  if (!herramienta) return null;
  const vistaActiva = vistas.find((v) => v.id === vistaActivaId);
  const esAlzadoOCorte =
    vistaActiva?.tipo === "alzado" || vistaActiva?.tipo === "corte";
  const estructura = esHerramientaEstructura(herramienta);
  const opcionesTipo = estructura
    ? tiposEstructura.filter((t) => t.alias === ALIAS_HERRAMIENTA[herramienta])
    : [];
  const tiposZapata = tiposEstructura.filter((t) => t.alias === "zapata");
  const tipoElegido =
    (estructura ? elegidos[herramienta] : undefined) ?? opcionesTipo[0]?.nombre ?? "";
  return (
    <div
      data-testid="barra-herramienta"
      data-herramienta={herramienta}
      className="flex h-9 shrink-0 items-center gap-3 overflow-hidden whitespace-nowrap border-b bg-muted/30 px-3 text-xs"
    >
      <span className="font-semibold capitalize">
        {herramienta === "recortar_extender" ? "Recortar/Extender" : herramienta}
      </span>
      {herramienta === "empujar" && (
        <>
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">Clasificación</span>
            <select
              data-testid="empujar-clasificacion"
              value={empujarClasificacion}
              onChange={(e) =>
                fijarClasificacion(e.target.value as ClasificacionEmpujar)
              }
              className="rounded border bg-background px-1 py-0.5"
            >
              <option value="auto">Auto</option>
              <option value="losa">Losa</option>
              <option value="muro">Muro</option>
              <option value="columna">Columna</option>
              <option value="generico">Genérico</option>
            </select>
          </label>
          <span className="text-muted-foreground" data-testid="empujar-paso">
            {empujarCara
              ? `${empujarCara.etiqueta}: mueva el ratón o teclee la distancia`
              : empujarRect
                ? "Altura: clic, Enter o teclee la medida"
                : "Contorno: dos esquinas del nivel activo (o teclee ancho,largo)"}
          </span>
          {empujarCara && (
            <span data-testid="empujar-cara-medida">
              {empujarCara.distancia >= 0 ? "+" : ""}
              {empujarCara.distancia.toFixed(2)} m
            </span>
          )}
          {empujarRect && (
            <span data-testid="empujar-medidas">
              {textoDimensiones(empujarRect)}
              {empujarAltura !== null ? ` · h ${empujarAltura.toFixed(2)} m` : ""}
            </span>
          )}
        </>
      )}
      {herramienta === "recortar_extender" && (
        <>
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">Modo</span>
            <select
              data-testid="recorte-modo"
              value={modoRecorte}
              onChange={(e) => fijarModoRecorte(e.target.value as ModoRecorte)}
              className="rounded border bg-background px-1 py-0.5"
            >
              <option value="esquina">A esquina</option>
              <option value="elemento">Un elemento</option>
              <option value="varios">Varios elementos</option>
            </select>
          </label>
          <span className="text-muted-foreground" data-testid="recorte-paso">
            {modoRecorte === "esquina"
              ? recorteInicial
                ? "Clic en el segundo elemento"
                : "Clic en el primer elemento"
              : referenciaRecorte
                ? "Clic en el elemento a ajustar"
                : "Clic en la referencia (elemento o eje)"}
          </span>
        </>
      )}
      {herramienta === "muro" && (
        <>
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">Tipo</span>
            <select
              data-testid="muro-tipo"
              value={opciones.tipo}
              onChange={(e) => fijar({ tipo: e.target.value })}
              className="rounded border bg-background px-1 py-0.5"
            >
              {tipos.map((tipo) => (
                <option key={tipo.globalid} value={tipo.nombre}>
                  {tipo.nombre} ({tipo.espesor.toFixed(2)} m)
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">Altura</span>
            <input
              data-testid="muro-altura"
              type="number"
              step={0.05}
              value={opciones.altura}
              onChange={(e) => {
                const valor = Number(e.target.value);
                if (Number.isFinite(valor) && valor > 0) fijar({ altura: valor });
              }}
              className="w-16 rounded border bg-background px-1 py-0.5 text-right"
            />
            <span>m</span>
          </label>
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">Línea de ubicación</span>
            <select
              data-testid="muro-linea-ubicacion"
              value={opciones.lineaUbicacion}
              onChange={(e) =>
                fijar({ lineaUbicacion: e.target.value as LineaUbicacion })
              }
              className="rounded border bg-background px-1 py-0.5"
            >
              <option value="eje_nucleo">Eje del muro</option>
              <option value="cara_exterior">Paño exterior</option>
              <option value="cara_interior">Paño interior</option>
              <option value="centro">Eje del núcleo</option>
            </select>
          </label>
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">Desfase</span>
            <input
              data-testid="muro-desfase-ubicacion"
              type="number"
              step={0.005}
              value={opciones.desfaseUbicacion}
              onChange={(e) => {
                const valor = Number(e.target.value);
                if (Number.isFinite(valor)) fijar({ desfaseUbicacion: valor });
              }}
              className="w-16 rounded border bg-background px-1 py-0.5 text-right"
            />
            <span>m</span>
          </label>
        </>
      )}
      {estructura && (
        <>
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">Tipo</span>
            <select
              data-testid="estructura-tipo"
              value={tipoElegido}
              onChange={(e) => fijarTipo(herramienta, e.target.value)}
              className="rounded border bg-background px-1 py-0.5"
            >
              {opcionesTipo.map((tipo) => (
                <option key={tipo.globalid} value={tipo.nombre}>
                  {tipo.nombre}
                </option>
              ))}
            </select>
          </label>
          {esHerramientaPuntual(herramienta) && (
            <>
              <span className="text-muted-foreground">
                {herramienta === "castillo"
                  ? "Clic sobre un muro o en un cruce de ejes"
                  : "Clic en un cruce de ejes"}
              </span>
              <button
                type="button"
                data-testid="estructura-girar"
                onClick={girar}
                className="rounded border px-2 py-0.5 hover:bg-muted"
              >
                R · Girar 90° ({rotacion}°)
              </button>
              {herramienta === "columna" && (
                <>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      data-testid="columna-con-zapata"
                      checked={conZapata}
                      onChange={(e) => fijarConZapata(e.target.checked)}
                    />
                    <span>Con zapata</span>
                  </label>
                  <select
                    data-testid="columna-tipo-zapata"
                    value={tipoZapata || tiposZapata[0]?.nombre || ""}
                    onChange={(e) => fijarTipoZapata(e.target.value)}
                    disabled={!conZapata}
                    className="rounded border bg-background px-1 py-0.5 disabled:opacity-50"
                  >
                    {tiposZapata.map((tipo) => (
                      <option key={tipo.globalid} value={tipo.nombre}>
                        {tipo.nombre}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    data-testid="columna-en-cruces"
                    onClick={() => void columnasEnCruces()}
                    className="rounded border px-2 py-0.5 hover:bg-muted"
                  >
                    En todos los cruces
                  </button>
                </>
              )}
            </>
          )}
          {herramienta === "cerramiento" && (
            <>
              <label className="flex items-center gap-1">
                <span className="text-muted-foreground">Nivel</span>
                <select
                  data-testid="cerramiento-nivel"
                  value={
                    plantaTomaNivelPropio(vistaActiva, niveles)
                      ? opcionesCerramiento.nivel || vistaActiva?.nivel || ""
                      : opcionesCerramiento.nivel
                  }
                  onChange={(e) =>
                    fijarOpcionesCerramiento({ nivel: e.target.value })
                  }
                  className="rounded border bg-background px-1 py-0.5"
                >
                  <option value="">Corona del muro</option>
                  {niveles.map((nivel) => (
                    <option key={nivel.globalid} value={nivel.globalid}>
                      {nivel.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1">
                <span className="text-muted-foreground">Desfase</span>
                <input
                  data-testid="cerramiento-desfase"
                  type="text"
                  inputMode="decimal"
                  value={opcionesCerramiento.desfase}
                  onChange={(e) =>
                    fijarOpcionesCerramiento({ desfase: e.target.value })
                  }
                  placeholder="Del muro"
                  className="w-16 rounded border bg-background px-1 py-0.5 text-right"
                />
                <span>m</span>
              </label>
            </>
          )}
          {herramienta === "dala" && (
            <span className="text-muted-foreground">
              Clic sobre un muro · se liga a su eje
            </span>
          )}
          {esHerramientaLineal(herramienta) && (
            <span className="text-muted-foreground">
              {puntos.length === 0
                ? "Primer punto"
                : longitud
                  ? `Longitud: ${longitud} m · Enter`
                  : "Segundo punto o escriba la longitud"}
            </span>
          )}
        </>
      )}
      {herramienta === "losa" && (
        <>
          <span className="text-muted-foreground" data-testid="losa-vertices">
            {puntos.length} vértice(s)
          </span>
          <button
            type="button"
            data-testid="losa-cerrar"
            onClick={() => void doble()}
            className="rounded border px-2 py-0.5 hover:bg-muted"
          >
            Cerrar losa
          </button>
          <button
            type="button"
            data-testid="losa-desde-muros"
            onClick={() => void losaDesdeMuros()}
            className="rounded border px-2 py-0.5 hover:bg-muted"
          >
            Desde muros ({seleccionados.length})
          </button>
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">Borde a</span>
            <select
              data-testid="losa-borde-a"
              value={opcionesLosa.lado}
              onChange={(e) =>
                fijarOpcionesLosa({
                  lado: e.target.value as "exterior" | "eje" | "interior",
                })
              }
              className="rounded border bg-background px-1 py-0.5"
            >
              <option value="exterior">Paño exterior</option>
              <option value="eje">Eje</option>
              <option value="interior">Paño interior</option>
            </select>
          </label>
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">Desfase</span>
            <input
              data-testid="losa-desfase"
              type="number"
              step={0.005}
              value={opcionesLosa.desfase}
              onChange={(e) => {
                const valor = Number(e.target.value);
                if (Number.isFinite(valor)) fijarOpcionesLosa({ desfase: valor });
              }}
              className="w-16 rounded border bg-background px-1 py-0.5 text-right"
            />
            <span>m</span>
          </label>
        </>
      )}
      {(herramienta === "puerta" || herramienta === "ventana") && (
        <span className="text-muted-foreground" data-testid="abertura-volteo">
          Clic sobre un muro · Espacio {voltear ? "restaura" : "voltea"} el lado
        </span>
      )}
      {(herramienta === "mover" || herramienta === "copiar") && (
        <span className="text-muted-foreground">
          Selección: {seleccionados.length} · {puntos.length === 0 ? "punto base" : "punto destino"}
        </span>
      )}
      {herramienta === "espejo" && (
        <>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              data-testid="espejo-copiar"
              checked={opcionesEspejo.copiar}
              onChange={(e) => fijarOpcionesEspejo({ copiar: e.target.checked })}
            />
            <span>Copiar</span>
          </label>
          <span className="text-muted-foreground">
            Selección: {seleccionados.length} ·{" "}
            {puntos.length === 0
              ? "clic en un eje/arista o primer punto del eje"
              : "segundo punto del eje"}
          </span>
        </>
      )}
      {herramienta === "matriz" && (
        <>
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">Tipo</span>
            <select
              data-testid="matriz-modo"
              value={opcionesMatriz.modo}
              onChange={(e) =>
                fijarOpcionesMatriz({
                  modo: e.target.value === "polar" ? "polar" : "lineal",
                })
              }
              className="rounded border bg-background px-1 py-0.5"
            >
              <option value="lineal">Lineal</option>
              <option value="polar">Polar</option>
            </select>
          </label>
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">Número</span>
            <input
              data-testid="matriz-numero"
              type="number"
              min={2}
              step={1}
              value={opcionesMatriz.numero}
              onChange={(e) =>
                fijarOpcionesMatriz({
                  numero: Math.max(2, Number(e.target.value) || 2),
                })
              }
              className="w-16 rounded border bg-background px-1 py-0.5"
            />
          </label>
          {opcionesMatriz.modo === "lineal" ? (
            <label className="flex items-center gap-1">
              <span className="text-muted-foreground">Reparto</span>
              <select
                data-testid="matriz-reparto"
                value={opcionesMatriz.alUltimo ? "al_ultimo" : "al_segundo"}
                onChange={(e) =>
                  fijarOpcionesMatriz({ alUltimo: e.target.value === "al_ultimo" })
                }
                className="rounded border bg-background px-1 py-0.5"
              >
                <option value="al_segundo">Al segundo</option>
                <option value="al_ultimo">Al último</option>
              </select>
            </label>
          ) : (
            <label className="flex items-center gap-1">
              <span className="text-muted-foreground">Ángulo total</span>
              <input
                data-testid="matriz-angulo"
                type="number"
                step="any"
                value={opcionesMatriz.angulo}
                onChange={(e) =>
                  fijarOpcionesMatriz({ angulo: Number(e.target.value) || 0 })
                }
                className="w-20 rounded border bg-background px-1 py-0.5"
              />
            </label>
          )}
          <span className="text-muted-foreground">
            Selección: {seleccionados.length} ·{" "}
            {opcionesMatriz.modo === "polar"
              ? "clic en el centro"
              : puntos.length === 0
                ? "primer punto del vector"
                : "segundo punto del vector"}
          </span>
        </>
      )}
      {herramienta === "muro" && (
        <span className="text-muted-foreground">
          {puntos.length === 0
            ? "Primer punto"
            : longitud
              ? `Longitud: ${longitud} m · Enter`
              : "Segundo punto o escriba la longitud"}
        </span>
      )}
      {herramienta === "nivel" && !esAlzadoOCorte && (
        <span className="text-muted-foreground" data-testid="nivel-solo-alzado">
          Abre un alzado o corte
        </span>
      )}
      {herramienta === "nivel" && esAlzadoOCorte && (
        <>
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">Nombre</span>
            <input
              data-testid="nivel-herramienta-nombre"
              value={opcionesNivel.nombre}
              onChange={(e) => fijarOpcionesNivel({ nombre: e.target.value })}
              className="w-28 rounded border bg-background px-1 py-0.5"
            />
            <button
              type="button"
              data-testid="nivel-herramienta-auto"
              data-automatico={opcionesNivel.nombreAutomatico ? "si" : "no"}
              title="Volver al nombre automático"
              onClick={() =>
                fijarOpcionesNivel({ nombre: "", nombreAutomatico: true })
              }
              className="rounded border px-1 py-0.5 text-muted-foreground hover:bg-muted"
            >
              Auto
            </button>
          </label>
          <label className="flex items-center gap-1">
            <input
              data-testid="nivel-herramienta-crear-planta"
              type="checkbox"
              checked={opcionesNivel.crearPlanta}
              onChange={(e) => fijarOpcionesNivel({ crearPlanta: e.target.checked })}
            />
            <span className="text-muted-foreground">Crear vista de planta</span>
          </label>
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">Elevación</span>
            <input
              data-testid="nivel-herramienta-elevacion"
              type="text"
              inputMode="decimal"
              value={opcionesNivel.elevacionTexto}
              onChange={(e) => fijarOpcionesNivel({ elevacionTexto: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
              placeholder="1.50"
              className="w-16 rounded border bg-background px-1 py-0.5 text-right"
            />
            <span>m</span>
            <button
              type="button"
              data-testid="nivel-herramienta-crear"
              onClick={() => {
                const valor = Number(
                  (opcionesNivel.elevacionTexto || "").replace(",", "."),
                );
                if (!Number.isFinite(valor)) return;
                void crearNivel(
                  opcionesNivel.nombre || "Nivel",
                  valor,
                  { crearPlanta: opcionesNivel.crearPlanta },
                );
              }}
              className="rounded border px-2 py-0.5 hover:bg-muted"
            >
              Crear
            </button>
          </label>
          {cotasNivel?.inferior && (
            <span className="text-muted-foreground" data-testid="nivel-herramienta-cotas">
              {`${(puntos[puntos.length - 1]?.[1] ?? cotasNivel.inferior.elevacion).toFixed(2)} m = ${cotasNivel.inferior.nombre} + ...`}
            </span>
          )}
        </>
      )}
      {herramienta === "eje" && (
        <span className="text-muted-foreground" data-testid="eje-etiqueta">
          {puntos.length === 0
            ? `Siguiente etiqueta: ${etiquetaEje || "1 / A"}`
            : longitud
              ? `Longitud: ${longitud} m · Enter`
              : "Segundo punto, longitud y Enter, o doble clic"}
        </span>
      )}
      {herramienta === "losa" && puntos.length > 0 && (
        <span className="text-muted-foreground">
          {longitud ? `Longitud: ${longitud} m · Enter agrega el vértice` : "Clic en el primero, Enter o doble clic para cerrar"}
        </span>
      )}
      <button
        type="button"
        data-testid="herramienta-cancelar"
        onClick={cancelar}
        className="ml-auto rounded border px-2 py-0.5 text-muted-foreground hover:bg-muted"
      >
        Esc · Cancelar
      </button>
    </div>
  );
}
