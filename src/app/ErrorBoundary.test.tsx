import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary, CLAVE_SIN_RECUPERAR } from "./ErrorBoundary";

let fallar = true;
function Bomba() {
  if (fallar) throw new Error("fallo de prueba");
  return <p>contenido sano</p>;
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    fallar = true;
    sessionStorage.clear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("muestra el detalle del error en lugar de dejar la pantalla en blanco", () => {
    render(
      <ErrorBoundary>
        <Bomba />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Algo salió mal");
    expect(screen.getByRole("alert")).toHaveTextContent("fallo de prueba");
  });

  it("«Volver a Inicio» restablece y marca no recuperar la sesión", () => {
    render(
      <ErrorBoundary>
        <Bomba />
      </ErrorBoundary>,
    );
    fallar = false;
    fireEvent.click(screen.getByRole("button", { name: "Volver a Inicio" }));
    expect(screen.getByText("contenido sano")).toBeInTheDocument();
    expect(sessionStorage.getItem(CLAVE_SIN_RECUPERAR)).toBe("1");
  });

  it("ofrece recargar la ventana", () => {
    render(
      <ErrorBoundary>
        <Bomba />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("button", { name: "Recargar" })).toBeInTheDocument();
  });
});
