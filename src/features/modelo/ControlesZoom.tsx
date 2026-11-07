// O017: botones flotantes de zoom del visor. Respaldo para cualquier touchpad:
// acercar, alejar y ajustar, siempre centrados en la vista.
// O020: conmutador «Orbitar» para arrastrar con un dedo en las vistas 3D.
interface Props {
  onAcercar: () => void;
  onAlejar: () => void;
  onAjustar: () => void;
  orbitar: boolean;
  onAlternarOrbitar: () => void;
  /** O051: el conmutador solo existe en las vistas 3D. */
  mostrarOrbitar?: boolean;
  /** O030: modo «A escala» de la anotación (mm de papel). */
  aEscala?: boolean;
  onAlternarAEscala?: () => void;
  onZoom100?: () => void;
}

export function ControlesZoom({
  onAcercar,
  onAlejar,
  onAjustar,
  orbitar,
  onAlternarOrbitar,
  mostrarOrbitar = true,
  aEscala,
  onAlternarAEscala,
  onZoom100,
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
      {onZoom100 && (
        <button
          type="button"
          data-testid="visor-zoom-100"
          title="100 % de papel: 1 mm de papel = 1 mm en pantalla"
          onClick={onZoom100}
          className="h-7 rounded border bg-background/90 px-2 text-xs shadow-sm hover:bg-muted"
        >
          100 %
        </button>
      )}
      {onAlternarAEscala && (
        <button
          type="button"
          data-testid="visor-a-escala"
          title="Anotación a escala de papel: crece y mengua con el zoom"
          aria-pressed={Boolean(aEscala)}
          onClick={onAlternarAEscala}
          className={
            aEscala
              ? "h-7 rounded border bg-accent px-2 text-xs font-medium text-accent-foreground shadow-sm"
              : "h-7 rounded border bg-background/90 px-2 text-xs shadow-sm hover:bg-muted"
          }
        >
          A escala
        </button>
      )}
      {mostrarOrbitar && (
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
      )}
    </div>
  );
}
