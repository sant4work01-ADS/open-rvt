// O017: botones flotantes de zoom del visor. Respaldo para cualquier touchpad:
// acercar, alejar y ajustar, siempre centrados en la vista.
interface Props {
  onAcercar: () => void;
  onAlejar: () => void;
  onAjustar: () => void;
}

export function ControlesZoom({ onAcercar, onAlejar, onAjustar }: Props) {
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
    </div>
  );
}
