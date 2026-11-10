// O062: en un empate de profundidad contra una cara del muro, las losas y la
// estructura se empujan hacia atrás (offset positivo) y el muro gana.

import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { crearMaterialElemento } from "./materialElemento";

function material(categoria: string, diseno = false): THREE.Material {
  return crearMaterialElemento({
    diseno,
    seleccionado: false,
    color: new THREE.Color(0x112233),
    fondo: new THREE.Color(0xffffff),
    opaco: true,
    opacidad: 1,
    planos: [new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)],
    categoria,
  });
}

describe("material de cara con offset de polígono (O062)", () => {
  it("empuja losas, cerramientos, castillos, vigas y columnas", () => {
    for (const categoria of ["losas", "vigas", "columnas"]) {
      for (const diseno of [false, true]) {
        const m = material(categoria, diseno);
        expect(m.polygonOffset).toBe(true);
        expect(m.polygonOffsetFactor).toBe(1);
        expect(m.polygonOffsetUnits).toBe(1);
      }
    }
  });

  it("deja el muro y las aberturas sin offset", () => {
    for (const categoria of ["muros", "puertas", "ventanas", "cubiertas"]) {
      for (const diseno of [false, true]) {
        const m = material(categoria, diseno);
        expect(m.polygonOffset).toBe(false);
        expect(m.polygonOffsetFactor).toBe(0);
        expect(m.polygonOffsetUnits).toBe(0);
      }
    }
  });

  it("conserva el color, la opacidad y el resaltado de selección", () => {
    const normal = new THREE.MeshLambertMaterial({ color: 0x112233 });
    const creado = material("losas") as THREE.MeshLambertMaterial;
    expect(creado.color.getHex()).toBe(normal.color.getHex());
    expect(creado.transparent).toBe(false);
    expect(creado.opacity).toBe(1);
    const elegido = crearMaterialElemento({
      diseno: false,
      seleccionado: true,
      color: new THREE.Color(0x2f7dd1),
      fondo: new THREE.Color(0xffffff),
      opaco: true,
      opacidad: 1,
      planos: [],
      categoria: "vigas",
    }) as THREE.MeshLambertMaterial;
    expect(elegido.emissive.getHex()).toBe(0x123a66);
    normal.dispose();
    creado.dispose();
    elegido.dispose();
  });
});
