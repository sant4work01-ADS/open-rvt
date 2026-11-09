// O056: clasificación cara → acción y distancia sobre la normal.
// Los valores de la distancia se calcularon a mano (ver comentario del caso).
import { describe, expect, it } from "vitest";
import {
  caraEnPunto,
  clasificarCaraEmpujar,
  distanciaSobreNormal,
  type ElementoCara,
} from "./empujarCaras";
import type { CaraPlana, Vec3 } from "./inferencias3d";

const muro: ElementoCara = {
  clase: "IfcWall",
  eje: [0, 0, 4, 0],
};

describe("clasificación de caras (tabla O056)", () => {
  it("muro superior cambia la altura", () => {
    const r = clasificarCaraEmpujar(muro, {
      normal: { x: 0, y: 0, z: 1 },
      centro: { x: 2, y: 0, z: 2.6 },
    });
    expect(r.accion).toBe("altura");
    expect(r.etiqueta).toBe("Altura del muro");
  });

  it("muro en su extremo alarga o acorta el eje", () => {
    const r = clasificarCaraEmpujar(muro, {
      normal: { x: 1, y: 0, z: 0 },
      centro: { x: 4, y: 0, z: 1.3 },
    });
    expect(r.accion).toBe("extremo");
    expect(r.etiqueta).toBe("Extremo del muro");
  });

  it("muro lateral no hace nada: el espesor lo da el tipo", () => {
    const r = clasificarCaraEmpujar(muro, {
      normal: { x: 0, y: 1, z: 0 },
      centro: { x: 2, y: 0.075, z: 1.3 },
    });
    expect(r.accion).toBe("ninguna");
    expect(r.motivo).toBe("El espesor lo da el tipo");
  });

  it("muro inferior no hace nada: el espesor lo da el tipo", () => {
    const r = clasificarCaraEmpujar(muro, {
      normal: { x: 0, y: 0, z: -1 },
      centro: { x: 2, y: 0, z: 0 },
    });
    expect(r.accion).toBe("ninguna");
    expect(r.motivo).toBe("El espesor lo da el tipo");
  });

  it("losa lateral mueve el borde del contorno", () => {
    const r = clasificarCaraEmpujar(
      { clase: "IfcSlab" },
      { normal: { x: 1, y: 0, z: 0 }, centro: { x: 4, y: 1.5, z: 0.06 } },
    );
    expect(r.accion).toBe("borde");
    expect(r.etiqueta).toBe("Borde de losa");
  });

  it.each([
    { x: 0, y: 0, z: 1 },
    { x: 0, y: 0, z: -1 },
  ])("losa superior/inferior no hace nada: el espesor lo da el tipo (%o)", (normal) => {
    const r = clasificarCaraEmpujar(
      { clase: "IfcSlab" },
      { normal, centro: { x: 2, y: 1.5, z: 0.12 } },
    );
    expect(r.accion).toBe("ninguna");
    expect(r.motivo).toBe("El espesor lo da el tipo");
  });

  it("columna superior cambia la altura", () => {
    const r = clasificarCaraEmpujar(
      { clase: "IfcColumn", alias: "columna" },
      { normal: { x: 0, y: 0, z: 1 }, centro: { x: 0, y: 0, z: 2.6 } },
    );
    expect(r.accion).toBe("altura");
    expect(r.etiqueta).toBe("Altura de la columna");
  });

  it("castillo superior cambia la altura", () => {
    const r = clasificarCaraEmpujar(
      { clase: "IfcColumn", alias: "castillo" },
      { normal: { x: 0, y: 0, z: 1 }, centro: { x: 0, y: 0, z: 2.6 } },
    );
    expect(r.accion).toBe("altura");
    expect(r.etiqueta).toBe("Altura del castillo");
  });

  it("viga en su extremo alarga o acorta ese extremo", () => {
    const r = clasificarCaraEmpujar(
      { clase: "IfcBeam", alias: "trabe", datos: { X1: 0, Y1: 0, X2: 3, Y2: 0 } },
      { normal: { x: 1, y: 0, z: 0 }, centro: { x: 3, y: 0, z: 2.4 } },
    );
    expect(r.accion).toBe("extremo");
    expect(r.etiqueta).toBe("Extremo de la viga");
  });

  it("cerramiento en su extremo usa su nombre", () => {
    const r = clasificarCaraEmpujar(
      {
        clase: "IfcBeam",
        alias: "cerramiento",
        datos: { X1: 0, Y1: 0, X2: 3, Y2: 0 },
      },
      { normal: { x: 1, y: 0, z: 0 }, centro: { x: 3, y: 0, z: 2.4 } },
    );
    expect(r.accion).toBe("extremo");
    expect(r.etiqueta).toBe("Extremo del cerramiento");
  });

  it("genérico mueve la cara de la caja en cualquier eje", () => {
    for (const normal of [
      { x: 1, y: 0, z: 0 },
      { x: 0, y: -1, z: 0 },
      { x: 0, y: 0, z: 1 },
    ]) {
      const r = clasificarCaraEmpujar(
        { clase: "IfcBuildingElementProxy" },
        { normal, centro: { x: 1, y: 0.5, z: 0.5 } },
      );
      expect(r.accion).toBe("medida");
      expect(r.etiqueta).toBe("Medida del genérico");
    }
  });

  it.each(["IfcFooting", "IfcDoor", "IfcWindow", "IfcOpeningElement"])(
    "otros elementos no se pueden empujar (%s)",
    (clase) => {
      const r = clasificarCaraEmpujar(
        { clase },
        { normal: { x: 1, y: 0, z: 0 }, centro: { x: 0, y: 0, z: 0 } },
      );
      expect(r.accion).toBe("ninguna");
      expect(r.motivo).toBe("No se puede empujar este elemento");
    },
  );
});

describe("distancia sobre la normal", () => {
  it("caso calculado a mano: rayo desde (0,2,5) hacia (0,-1,-1)/√2 y cara z=2 da 1.00 m", () => {
    // Recta de la cara: C + s·N = (0,0,2) + s·(0,0,1).
    // Rayo: O + t·D = (0,2,5) + t·(0,-1,-1)/√2.
    // Puntos más cercanos: t = 2√2 y s = 3 - 2 = 1.000.
    const s = distanciaSobreNormal(
      {
        origen: { x: 0, y: 2, z: 5 },
        direccion: { x: 0, y: -1 / Math.SQRT2, z: -1 / Math.SQRT2 },
      },
      { x: 0, y: 0, z: 2 },
      { x: 0, y: 0, z: 1 },
    );
    expect(s).toBeCloseTo(1.0, 9);
  });

  it("el signo cambia al cruzar el plano de la cara", () => {
    const arriba = distanciaSobreNormal(
      {
        origen: { x: 0, y: 2, z: 5 },
        direccion: { x: 0, y: -1 / Math.SQRT2, z: -1 / Math.SQRT2 },
      },
      { x: 0, y: 0, z: 2 },
      { x: 0, y: 0, z: 1 },
    );
    // El mismo rayo visto desde abajo: los puntos más cercanos quedan al otro
    // lado de la cara y la distancia es negativa.
    const abajo = distanciaSobreNormal(
      {
        origen: { x: 0, y: 2, z: 5 },
        direccion: { x: 0, y: -1 / Math.SQRT2, z: -1 / Math.SQRT2 },
      },
      { x: 0, y: 0, z: 4 },
      { x: 0, y: 0, z: 1 },
    );
    expect(arriba).toBeCloseTo(1.0, 9);
    expect(abajo).toBeCloseTo(-1.0, 9);
  });

  it("rayo paralelo a la normal no tiene distancia definida", () => {
    expect(
      distanciaSobreNormal(
        {
          origen: { x: 0, y: 0, z: 5 },
          direccion: { x: 0, y: 0, z: -1 },
        },
        { x: 0, y: 0, z: 2 },
        { x: 0, y: 0, z: 1 },
      ),
    ).toBeNull();
  });
});

describe("cara completa bajo el punto", () => {
  const cara: CaraPlana = {
    normal: { x: 0, y: 0, z: 1 },
    poligono: [
      { x: 0, y: 0, z: 2.6 },
      { x: 4, y: 0, z: 2.6 },
      { x: 4, y: 0.15, z: 2.6 },
      { x: 0, y: 0.15, z: 2.6 },
    ],
  };
  const fuera: Vec3 = { x: 2, y: 0.3, z: 2.6 };

  it("encuentra la cara de la tapa", () => {
    expect(caraEnPunto({ x: 2, y: 0.075, z: 2.6 }, [cara])).toBe(cara);
  });

  it("no confunde un punto fuera del polígono", () => {
    expect(caraEnPunto(fuera, [cara])).toBeNull();
  });

  it("con margen no activa la cara en una esquina: los contornos de O046 siguen naciendo ahí", () => {
    // La esquina (0,0) y un punto a 2 cm del borde no cuentan como cara; el
    // centro de la tapa sí. Así un clic en la esquina sigue creando un sólido.
    expect(caraEnPunto({ x: 0, y: 0, z: 2.6 }, [cara], 1e-4, 0.03)).toBeNull();
    expect(caraEnPunto({ x: 0.02, y: 0.02, z: 2.6 }, [cara], 1e-4, 0.03)).toBeNull();
    expect(caraEnPunto({ x: 0.5, y: 0.075, z: 2.6 }, [cara], 1e-4, 0.03)).toBe(cara);
  });
});
