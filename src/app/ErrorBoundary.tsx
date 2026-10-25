import { tr } from "@/i18n";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { bitacoraErrorUi } from "@/lib/bitacora";

// OPEN-RVT: sin sesión de obra; solo se limpia el error y la pantalla vuelve a dibujarse.
export const CLAVE_SIN_RECUPERAR = "openrvt.sinRecuperar";

interface Props {
  children: ReactNode;
}
interface Estado {
  error: Error | null;
  pila: string | null;
}

/** Evita la pantalla en blanco ante un fallo de render: muestra el detalle y permite recuperarse. */
export class ErrorBoundary extends Component<Props, Estado> {
  state: Estado = { error: null, pila: null };

  static getDerivedStateFromError(error: Error): Estado {
    return { error, pila: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Error de interfaz", error, info.componentStack);
    bitacoraErrorUi(error.message, `${error.stack ?? ""}\n${info.componentStack ?? ""}`);
    this.setState({ pila: info.componentStack ?? null });
  }

  volverAInicio = () => {
    try {
      sessionStorage.setItem(CLAVE_SIN_RECUPERAR, "1");
    } catch {
      /* sin sessionStorage: se recupera la sesión normalmente */
    }
    this.setState({ error: null, pila: null });
  };

  render() {
    const { error, pila } = this.state;
    if (!error) return this.props.children;
    return (
      <div
        role="alert"
        className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"
      >
        <h1 className="text-lg font-semibold">{tr("app.algo-salio-mal", "Algo salió mal")}</h1>
        <p className="text-muted-foreground">
          {tr(
            "app.la-pantalla-fallo-al-dibujarse-sus-datos-guardad",
            "La pantalla falló al dibujarse. Sus datos guardados no se han perdido.",
          )}
        </p>
        <pre className="max-h-64 w-full max-w-3xl overflow-auto rounded-md border bg-muted p-3 text-left text-xs">
          {error.message}
          {pila ? `\n${pila}` : ""}
        </pre>
        <div className="flex gap-2">
          <Button variant="outline" onClick={this.volverAInicio}>
            {tr("app.volver-a-inicio", "Volver a Inicio")}
          </Button>
          <Button onClick={() => window.location.reload()}>{tr("app.recargar", "Recargar")}</Button>
        </div>
      </div>
    );
  }
}
