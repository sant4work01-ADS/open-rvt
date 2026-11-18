// Restricciones y acero del panel de un elemento estructural.
import { useEffect, useState } from "react";
import { llamarConBitacora } from "@/lib/bitacora";
import { useModelo } from "./estado";
import { CampoEditable } from "./campoEditable";

export function AceroElemento({ globalid }: { globalid: string }) {
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

export function RestriccionesNivel({
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
export function RestriccionesZapata({
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
export function RestriccionesCerramiento({ globalid }: { globalid: string }) {
  const niveles = useModelo((s) => s.niveles);
  const restricciones = useModelo((s) => s.propiedades?.restricciones);
  const muroLiga = useModelo((s) => s.propiedades?.muro_liga);
  const seleccionados = useModelo((s) => s.seleccionados);
  const mallas = useModelo((s) => s.mallas);
  const editarRestricciones = useModelo((s) => s.editarRestricciones);
  const editarRestriccionesVarios = useModelo(
    (s) => s.editarRestriccionesVarios,
  );
  const soltarDelMuro = useModelo((s) => s.soltarDelMuro);
  if (!restricciones) return null;
  // O050: con varios cerramientos seleccionados, Nivel y Desfase se aplican a
  // todos en un solo paso de Deshacer.
  const varios =
    seleccionados.length > 1 &&
    seleccionados.every(
      (gid) =>
        mallas.find((malla) => malla.globalid === gid)?.estructura?.alias ===
        "cerramiento",
    );
  const cambiar = (cambios: Parameters<typeof editarRestricciones>[1]) =>
    void (varios
      ? editarRestriccionesVarios(seleccionados, {
          nivel_base: cambios.nivel_base,
          desfase_base: cambios.desfase_base,
        })
      : editarRestricciones(globalid, cambios));
  return (
    <div data-testid={muroLiga ? "cerramiento-ligado" : "cerramiento-suelto"} className="flex flex-col gap-1 text-xs">
      {varios && (
        <div className="text-muted-foreground" data-testid="cerramientos-varios">
          Nivel y desfase se aplican a {seleccionados.length} cerramientos.
        </div>
      )}
      {muroLiga && (
        <div className="text-muted-foreground" data-testid="cerramiento-leyenda">
          Sigue el eje del muro {muroLiga.nombre}.
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

