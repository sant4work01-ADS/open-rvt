// O017: botones flotantes de zoom del visor. Respaldo para cualquier touchpad:
// acercar, alejar y ajustar, siempre centrados en la vista.
// O020: conmutador «Orbitar» para arrastrar con un dedo en las vistas 3D.
interface Props {
  onAcercar: () => void;
  onAlejar: () => void;
  onAjustar: () => void;
  orbitar: boolean;
  onAlternarOrbitar: () => void;
}

export function ControlesZoom({
  onAcercar,
  onAlejar,
  onAjustar,
  orbitar,
  onAlternarOrbitar,
}: Props) {
  return (
    <div
      data-testid="controles-zoom"
      className="absolute bottom-3 right-3 z-10 flex items-center gap-1"
    >
      <button
        type="button"
        data-testid="visor-zoom-mas"
        title="Acercar (+)"
        aria-label="Acercar"
        onClick={onAcercar}
        className="h-7 w-7 rounded border bg-background/90 text-sm shadow-sm hover:bg-muted"
      >
        +
      </button>
      <button
        type="button"
        data-testid="visor-zoom-menos"
        title="Alejar (−)"
        aria-label="Alejar"
        onClick={onAlejar}
        className="h-7 w-7 rounded border bg-background/90 text-sm shadow-sm hover:bg-muted"
      >
        −
      </button>
      <button
        type="button"
        data-testid="visor-zoom-ajustar"
        title="Ajustar la vista (F)"
        onClick={onAjustar}
        className="h-7 rounded border bg-background/90 px-2 text-xs shadow-sm hover:bg-muted"
      >
        Ajustar
      </button>
      <button
        type="button"
        data-testid="visor-orbitar"
        title="Orbitar: arrastra con el botón izquierdo"
        aria-label="Orbitar"
        aria-pressed={orbitar}
        onClick={onAlternarOrbitar}
        className={
          orbitar
            ? "h-7 rounded border bg-accent px-2 text-xs font-medium text-accent-foreground shadow-sm"
            : "h-7 rounded border bg-background/90 px-2 text-xs shadow-sm hover:bg-muted"
        }
      >
        Orbitar
      </button>
    </div>
  );
}
