// OPEN-RVT (O003b): módulo «Niveles y ejes». Tabla editable de niveles y, debajo,
// la lista de ejes del IfcGrid.
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useModelo } from "./estado";

export function NivelesView() {
  const niveles = useModelo((s) => s.niveles);
  const referencias = useModelo((s) => s.referencias);
  const crearNivel = useModelo((s) => s.crearNivel);
  const editarNivel = useModelo((s) => s.editarNivel);
  const borrarNivel = useModelo((s) => s.borrarNivel);
  const borrarEje = useModelo((s) => s.borrarEje);
  const editarEje = useModelo((s) => s.editarEje);
  const error = useModelo((s) => s.error);
  const [nombre, setNombre] = useState("");
  const [elevacion, setElevacion] = useState("");

  const agregar = async () => {
    const siguiente =
      niveles.length > 0 ? Math.max(...niveles.map((n) => n.elevacion)) + 3 : 0;
    const elev = elevacion.trim() === "" ? siguiente : Number(elevacion);
    const nombreFinal = nombre.trim() || `Nivel ${niveles.length}`;
    if (!Number.isFinite(elev)) return;
    if (await crearNivel(nombreFinal, elev)) {
      setNombre("");
      setElevacion("");
    }
  };

  return (
    <div data-testid="vista-niveles" className="flex min-h-0 flex-1 flex-col overflow-auto p-4">
      <h2 className="mb-2 text-sm font-semibold">Niveles</h2>
      <table className="w-full max-w-2xl border-collapse text-xs" data-testid="tabla-niveles">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-1 pr-2 font-medium">Nombre</th>
            <th className="py-1 pr-2 font-medium">Elevación (m)</th>
            <th className="w-10 py-1" />
          </tr>
        </thead>
        <tbody>
          {niveles.map((nivel) => (
            <tr key={nivel.globalid} className="border-b">
              <td className="py-1 pr-2">
                <input
                  key={`${nivel.globalid}-${nivel.nombre}`}
                  data-testid={`nivel-nombre-${nivel.globalid}`}
                  defaultValue={nivel.nombre}
                  onBlur={(e) => {
                    const valor = e.target.value.trim();
                    if (valor && valor !== nivel.nombre) {
                      void editarNivel(nivel.globalid, valor, nivel.elevacion);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  className="w-full rounded border bg-background px-2 py-1"
                />
              </td>
              <td className="py-1 pr-2">
                <input
                  key={`${nivel.globalid}-${nivel.elevacion}`}
                  data-testid={`nivel-elevacion-${nivel.globalid}`}
                  type="number"
                  step={0.05}
                  defaultValue={nivel.elevacion}
                  onBlur={(e) => {
                    const valor = Number(e.target.value);
                    if (Number.isFinite(valor) && valor !== nivel.elevacion) {
                      void editarNivel(nivel.globalid, nivel.nombre, valor);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  className="w-28 rounded border bg-background px-2 py-1 text-right"
                />
              </td>
              <td className="py-1 text-right">
                <button
                  type="button"
                  data-testid={`nivel-borrar-${nivel.globalid}`}
                  title="Borrar nivel"
                  onClick={() => void borrarNivel(nivel.globalid)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted"
                >
                  <Trash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex max-w-2xl items-end gap-2 text-xs">
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Nombre del nivel</span>
          <input
            data-testid="nivel-nuevo-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder={`Nivel ${niveles.length}`}
            className="w-48 rounded border bg-background px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Elevación</span>
          <input
            data-testid="nivel-nuevo-elevacion"
            type="number"
            step={0.05}
            value={elevacion}
            onChange={(e) => setElevacion(e.target.value)}
            placeholder="0.00"
            className="w-28 rounded border bg-background px-2 py-1 text-right"
          />
        </label>
        <button
          type="button"
          data-testid="nivel-agregar"
          onClick={() => void agregar()}
          className="flex items-center gap-1 rounded border px-2 py-1 hover:bg-muted"
        >
          <Plus size={14} /> Agregar
        </button>
      </div>

      <h2 className="mb-2 mt-6 text-sm font-semibold">Ejes</h2>
      {referencias.ejes.length === 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="sin-ejes">
          Todavía no hay ejes. Use la herramienta Eje en la pestaña Modelar.
        </p>
      ) : (
        <table className="w-full max-w-2xl border-collapse text-xs" data-testid="tabla-ejes">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-1 pr-2 font-medium">Etiqueta</th>
              <th className="py-1 pr-2 font-medium">Inicio</th>
              <th className="py-1 pr-2 font-medium">Fin</th>
              <th className="w-10 py-1" />
            </tr>
          </thead>
          <tbody>
            {referencias.ejes.map((eje) => (
              <tr key={eje.globalid} className="border-b">
                <td className="py-1 pr-2 font-medium">
                  <input
                    key={`${eje.globalid}-${eje.etiqueta}`}
                    data-testid={`eje-etiqueta-${eje.etiqueta}`}
                    defaultValue={eje.etiqueta}
                    onBlur={(e) => {
                      const valor = e.target.value.trim();
                      if (valor && valor !== eje.etiqueta) {
                        void editarEje(eje.globalid, valor);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    className="w-20 rounded border bg-background px-2 py-1"
                  />
                </td>
                <td className="py-1 pr-2">
                  {eje.x1.toFixed(2)}, {eje.y1.toFixed(2)}
                </td>
                <td className="py-1 pr-2">
                  {eje.x2.toFixed(2)}, {eje.y2.toFixed(2)}
                </td>
                <td className="py-1 text-right">
                  <button
                    type="button"
                    title="Borrar eje"
                    onClick={() => void borrarEje(eje.globalid)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {error && (
        <p data-testid="niveles-error" className="mt-2 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
