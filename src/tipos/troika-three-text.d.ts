// O011: troika-three-text no publica tipos en su paquete; se declara lo que usa el visor.
declare module "troika-three-text" {
  import type * as THREE from "three";

  export function configureTextBuilder(config: {
    useWorker?: boolean;
    defaultFontURL?: string | null;
  }): void;

  export class Text extends THREE.Mesh {
    text: string;
    font: string | null;
    fontSize: number;
    color: THREE.ColorRepresentation;
    anchorX: "left" | "center" | "right" | number;
    anchorY: "top" | "top-baseline" | "middle" | "bottom-baseline" | "bottom" | number;
    outlineWidth: number | string;
    outlineColor: THREE.ColorRepresentation;
    sync(callback?: () => void): void;
  }
}
