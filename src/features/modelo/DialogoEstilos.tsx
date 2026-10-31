// OPEN-RVT: diálogo «Estilos de objeto» de O005. Edita la tabla de plumillas y los
// patrones de relleno por material; se guarda en el pset OPENRVT_Estilos.
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { useModelo } from "./estado";
import {
  CATEGORIAS_ESTILO,
  MATERIALES,
  nombreCategoriaEstilo,
  type EstiloCategoria,
  type Estilos,
  type MaterialNombre,
  type PatronLinea,
  type PatronRelleno,
} from "./estilos";

const MATERIALES_UI: ReadonlyArray<{ id: MaterialNombre; nombre: string }> = [
  { id: "block", nombre: "Block" },
  { id: "tabique", nombre: "Tabique" },
  { id: "concreto", nombre: "Concreto" },
  { id: "tierra", nombre: "Tierra" },
  { id: "aislante", nombre: "Aislante" },
  { id: "madera", nombre: "Madera" },
  { id: "vidrio", nombre: "Vidrio" },
  { id: "generico", nombre: "Genérico" },
];

const PATRONES: ReadonlyArray<{ id: PatronRelleno; nombre: string }> = [
  { id: "diagonal", nombre: "Diagonal a 45°" },
  { id: "diagonal-doble", nombre: "Diagonal doble" },
  { id: "concreto", nombre: "Concreto (puntos y triángulos)" },
  { id: "tierra", nombre: "Sin relleno" },
  { id: "ondas", nombre: "Ondas (aislante)" },
  { id: "madera", nombre: "Veta de madera" },
  { id: "vidrio", nombre: "Sin relleno (vidrio)" },
  { id: "generico", nombre: "Gris sólido al 30 %" },
];

const LINEAS: ReadonlyArray<{ id: PatronLinea; nombre: string }> = [
  { id: "continua", nombre: "Continua" },
  { id: "discontinua", nombre: "Discontinua" },
  { id: "trazo-punto", nombre: "Trazo y punto" },
  { id: "discontinua-larga", nombre: "Discontinua larga" },
];

export function DialogoEstilos() {
  const estilos = useModelo((s) => s.estilos);
  const guardar = useModelo((s) => s.guardarEstilos);
  const cerrar = useModelo((s) => s.cerrarDialogoEstilos);
  const [pestana, setPestana] = useState<"categorias" | "materiales" | "niveles">("categorias");
  const [borrador, setBorrador] = useState<Estilos>(estilos);

  const cambiarCategoria = (id: (typeof CATEGORIAS_ESTILO)[number], cambio: Partial<EstiloCategoria>) => {
    setBorrador((previo) => ({
      ...previo,
      categorias: {
        ...previo.categorias,
        [id]: { ...previo.categorias[id], ...cambio },
      },
    }));
  };

  return (
    <Modal titulo="Estilos de objeto" onCerrar={cerrar} conCabecera className="w-[min(900px,94vw)]">
      <div data-testid="dialogo-estilos" className="flex max-h-[75vh] flex-col">
        <div role="tablist" className="flex gap-1 border-b px-3 pt-2">
          {(["categorias", "materiales", "niveles"] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={pestana === id}
              data-testid={`pestana-${id}`}
              onClick={() => setPestana(id)}
              className={`rounded-t border px-3 py-1 text-xs ${
                pestana === id ? "border-b-background bg-background font-semibold" : "bg-muted/40"
              }`}
            >
              {id === "categorias" ? "Categorías" : id === "materiales" ? "Materiales" : "Niveles"}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-3">
          {pestana === "categorias" ? (
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-2 py-1">Categoría</th>
                  <th className="px-2 py-1">Corte (mm)</th>
                  <th className="px-2 py-1">Proyección (mm)</th>
                  <th className="px-2 py-1">Color</th>
                  <th className="px-2 py-1">Patrón</th>
                </tr>
              </thead>
              <tbody>
                {CATEGORIAS_ESTILO.map((id) => {
                  const fila = borrador.categorias[id];
                  const sinCorte = fila.corte === null;
                  return (
                    <tr key={id} data-testid={`fila-estilo-${id}`} className="border-b last:border-0">
                      <td className="px-2 py-1">{nombreCategoriaEstilo(id)}</td>
                      <td className="px-2 py-1">
                        {sinCorte ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            data-testid={`estilo-corte-${id}`}
                            value={fila.corte ?? 0}
                            onChange={(e) => {
                              const valor = Number(e.target.value);
                              if (Number.isFinite(valor)) cambiarCategoria(id, { corte: valor });
                            }}
                            className="w-20 rounded border bg-background px-2 py-1 text-right"
                          />
                        )}
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          data-testid={`estilo-proyeccion-${id}`}
                          value={fila.proyeccion}
                          onChange={(e) => {
                            const valor = Number(e.target.value);
                            if (Number.isFinite(valor)) cambiarCategoria(id, { proyeccion: valor });
                          }}
                          className="w-20 rounded border bg-background px-2 py-1 text-right"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="color"
                          data-testid={`estilo-color-${id}`}
                          value={fila.color}
                          onChange={(e) => cambiarCategoria(id, { color: e.target.value })}
                          className="h-6 w-10 rounded border bg-background"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <select
                          data-testid={`estilo-patron-${id}`}
                          value={fila.patron}
                          onChange={(e) =>
                            cambiarCategoria(id, { patron: e.target.value as PatronLinea })
                          }
                          className="rounded border bg-background px-2 py-1"
                        >
                          {LINEAS.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nombre}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : pestana === "materiales" ? (
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-2 py-1">Material</th>
                  <th className="px-2 py-1">Patrón de relleno</th>
                  <th className="px-2 py-1">Escala (mm)</th>
                </tr>
              </thead>
              <tbody>
                {MATERIALES.map((material) => (
                  <tr
                    key={material}
                    data-testid={`fila-material-${material}`}
                    className="border-b last:border-0"
                  >
                    <td className="px-2 py-1">{MATERIALES_UI.find((m) => m.id === material)?.nombre}</td>
                    <td className="px-2 py-1">
                      <select
                        data-testid={`material-patron-${material}`}
                        value={borrador.materiales[material].patron}
                        onChange={(e) =>
                          setBorrador((previo) => ({
                            ...previo,
                            materiales: {
                              ...previo.materiales,
                              [material]: {
                                ...previo.materiales[material],
                                patron: e.target.value as PatronRelleno,
                              },
                            },
                          }))
                        }
                        className="rounded border bg-background px-2 py-1"
                      >
                        {PATRONES.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        step="0.5"
                        min="0.5"
                        data-testid={`material-escala-${material}`}
                        value={borrador.materiales[material].escala}
                        onChange={(e) => {
                          const valor = Number(e.target.value);
                          if (Number.isFinite(valor)) {
                            setBorrador((previo) => ({
                              ...previo,
                              materiales: {
                                ...previo.materiales,
                                [material]: {
                                  ...previo.materiales[material],
                                  escala: valor,
                                },
                              },
                            }));
                          }
                        }}
                        className="w-20 rounded border bg-background px-2 py-1 text-right"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <section data-testid="estilos-niveles" className="space-y-3 text-xs">
              <h3 className="font-semibold">Niveles</h3>
              <div className="grid grid-cols-[160px_1fr] items-center gap-2">
                <label htmlFor="nivel-prefijo">Prefijo</label>
                <input
                  id="nivel-prefijo"
                  data-testid="nivel-prefijo"
                  value={borrador.niveles.prefijo}
                  onChange={(e) =>
                    setBorrador((previo) => ({
                      ...previo,
                      niveles: { ...previo.niveles, prefijo: e.target.value },
                    }))
                  }
                  className="w-40 rounded border bg-background px-2 py-1"
                />
                <label htmlFor="nivel-decimales">Decimales</label>
                <select
                  id="nivel-decimales"
                  data-testid="nivel-decimales"
                  value={borrador.niveles.decimales}
                  onChange={(e) =>
                    setBorrador((previo) => ({
                      ...previo,
                      niveles: {
                        ...previo.niveles,
                        decimales: Number(e.target.value) as 0 | 1 | 2 | 3,
                      },
                    }))
                  }
                  className="w-20 rounded border bg-background px-2 py-1"
                >
                  {[0, 1, 2, 3].map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <label htmlFor="nivel-unidad">Unidad</label>
                <input
                  id="nivel-unidad"
                  data-testid="nivel-unidad"
                  value={borrador.niveles.unidad}
                  onChange={(e) =>
                    setBorrador((previo) => ({
                      ...previo,
                      niveles: { ...previo.niveles, unidad: e.target.value },
                    }))
                  }
                  className="w-20 rounded border bg-background px-2 py-1"
                />
                <label htmlFor="nivel-cabeza">Cabeza</label>
                <select
                  id="nivel-cabeza"
                  data-testid="nivel-cabeza"
                  value={borrador.niveles.cabeza}
                  onChange={(e) =>
                    setBorrador((previo) => ({
                      ...previo,
                      niveles: {
                        ...previo.niveles,
                        cabeza: e.target.value as "triangulo" | "circulo" | "ninguna",
                      },
                    }))
                  }
                  className="w-40 rounded border bg-background px-2 py-1"
                >
                  <option value="triangulo">Triángulo</option>
                  <option value="circulo">Círculo</option>
                  <option value="ninguna">Ninguna</option>
                </select>
                <label htmlFor="nivel-color">Color</label>
                <input
                  id="nivel-color"
                  type="color"
                  data-testid="nivel-color"
                  value={borrador.niveles.color}
                  onChange={(e) =>
                    setBorrador((previo) => ({
                      ...previo,
                      niveles: { ...previo.niveles, color: e.target.value },
                    }))
                  }
                  className="h-6 w-10 rounded border bg-background"
                />
                <label htmlFor="nivel-cotas">Cotas de nivel</label>
                <input
                  id="nivel-cotas"
                  type="checkbox"
                  data-testid="nivel-cotas"
                  checked={borrador.niveles.cotas}
                  onChange={(e) =>
                    setBorrador((previo) => ({
                      ...previo,
                      niveles: { ...previo.niveles, cotas: e.target.checked },
                    }))
                  }
                  className="h-4 w-4"
                />
                <label htmlFor="nivel-mostrar-nombre">Mostrar nombre</label>
                <input
                  id="nivel-mostrar-nombre"
                  type="checkbox"
                  data-testid="nivel-mostrar-nombre"
                  checked={borrador.niveles.mostrarNombre}
                  onChange={(e) =>
                    setBorrador((previo) => ({
                      ...previo,
                      niveles: { ...previo.niveles, mostrarNombre: e.target.checked },
                    }))
                  }
                  className="h-4 w-4"
                />
              </div>
            </section>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t p-3">
          <button
            type="button"
            data-testid="boton-cancelar-estilos"
            onClick={cerrar}
            className="rounded border px-3 py-1 text-xs hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            type="button"
            data-testid="boton-guardar-estilos"
            onClick={() => {
              void guardar(borrador).then(cerrar);
            }}
            className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground hover:opacity-90"
          >
            Guardar
          </button>
        </div>
      </div>
    </Modal>
  );
}
