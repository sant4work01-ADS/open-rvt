import { describe, expect, it } from "vitest";
import type { Caja, ElementoMalla, Nivel } from "./tipos";
import {
  ARRIBA_PLANTA,
  camaraOrtografica,
  camaraPerspectiva,
  cajaConEjes,
  cajaDeMallas,
  crearVistaCorte,
  crearVistas,
  dibujaSiluetaSobreCorte,
  direccionAlzado,
  leerVistas,
  migrarNivelesVisibles,
  normalizarVista,
  serializarVistas,
  vectorIso,
  vectorPerspectiva,
} from "./vistas";
import { areaPoligono2D, siluetaProyectada } from "./seccion";

const CAJA: Caja = { min: [-5, -3, 0], max: [5, 3, 6] };

const NIVELES: Nivel[] = [
  { globalid: "nivel-0", nombre: "Nivel 0", elevacion: 0 },
  { globalid: "nivel-1", nombre: "Nivel 1", elevacion: 3 },
];

describe("cámaras de las vistas", () => {
  it("cada alzado mira desde su lado con el norte del IFC en +Y", () => {
    expect(direccionAlzado("norte")).toEqual([0, 1, 0]);
    expect(direccionAlzado("sur")).toEqual([0, -1, 0]);
    expect(direccionAlzado("este")).toEqual([1, 0, 0]);
    expect(direccionAlzado("oeste")).toEqual([-1, 0, 0]);

    const norte = camaraOrtografica(CAJA, direccionAlzado("norte"));
    // El observador está al norte (+Y) y mira hacia −Y: +X queda a la izquierda.
    expect(norte.posicion[1]).toBeGreaterThan(CAJA.max[1]);
    expect(norte.objetivo).toEqual([0, 0, 3]);
    expect(norte.arriba[0]).toBeCloseTo(0, 9);
    expect(norte.arriba[1]).toBeCloseTo(0, 9);
    expect(norte.arriba[2]).toBeCloseTo(1, 9);
    expect(norte.ejeDerecha[0]).toBeCloseTo(-1, 9);
    expect(norte.ejeDerecha[1]).toBeCloseTo(0, 9);
    // De frente, el ancho es el eje X (10 m) y el alto el Z (6 m).
    expect(norte.ancho).toBeCloseTo(10, 6);
    expect(norte.alto).toBeCloseTo(6, 6);
    expect(norte.derecha - norte.izquierda).toBeGreaterThanOrEqual(10);
    expect(norte.arribaPlano - norte.abajo).toBeGreaterThanOrEqual(6);

    const sur = camaraOrtografica(CAJA, direccionAlzado("sur"));
    expect(sur.posicion[1]).toBeLessThan(CAJA.min[1]);
    // Desde el sur, +X queda a la derecha.
    expect(sur.ejeDerecha[0]).toBeCloseTo(1, 9);
    expect(sur.ejeDerecha[1]).toBeCloseTo(0, 9);
  });

  it("la isométrica queda a 35.26° de elevación y 45° de azimut", () => {
    const iso = vectorIso();
    const elevacion = (Math.asin(iso[2]) * 180) / Math.PI;
    const azimut = (Math.atan2(iso[1], iso[0]) * 180) / Math.PI;
    expect(elevacion).toBeCloseTo(35.264, 3);
    expect(azimut).toBeCloseTo(45, 6);

    const camara = camaraOrtografica(CAJA, iso);
    expect(camara.posicion[0]).toBeGreaterThan(CAJA.max[0]);
    expect(camara.posicion[1]).toBeGreaterThan(CAJA.max[1]);
    expect(camara.posicion[2]).toBeGreaterThan(CAJA.max[2]);
    expect(camara.lejos).toBeGreaterThan(camara.cerca);
  });

  it("la planta mira hacia abajo con +Y arriba y +X a la derecha", () => {
    const planta = camaraOrtografica(CAJA, [0, 0, 1], { arriba: ARRIBA_PLANTA });
    expect(planta.posicion[2]).toBeGreaterThan(CAJA.max[2]);
    expect(planta.arriba).toEqual([0, 1, 0]);
    expect(planta.ejeDerecha[0]).toBeCloseTo(1, 9);
    expect(planta.ejeDerecha[1]).toBeCloseTo(0, 9);
    expect(planta.ancho).toBeCloseTo(10, 6);
    expect(planta.alto).toBeCloseTo(6, 6);

    // Proyección sobre la pantalla: (1,0,0) a la derecha y (0,1,0) arriba de (0,0,0).
    const proyectar = (p: [number, number, number]) => ({
      x: p[0] * planta.ejeDerecha[0] + p[1] * planta.ejeDerecha[1],
      y: p[0] * planta.arriba[0] + p[1] * planta.arriba[1],
    });
    expect(proyectar([1, 0, 0]).x).toBeCloseTo(1, 9);
    expect(proyectar([1, 0, 0]).y).toBeCloseTo(0, 9);
    expect(proyectar([0, 0, 0]).x).toBeCloseTo(0, 9);
    expect(proyectar([0, 1, 0]).y).toBeCloseTo(1, 9);
    expect(proyectar([0, 1, 0]).x).toBeCloseTo(0, 9);
  });

  it("la perspectiva usa 50° de campo de visión", () => {
    const camara = camaraPerspectiva(CAJA, { aspecto: 16 / 9 });
    expect(camara.fov).toBe(50);
    expect(camara.distancia).toBeGreaterThan(0);
    expect(vectorPerspectiva()[2]).toBeGreaterThan(0);
    expect(Math.hypot(...vectorPerspectiva())).toBeCloseTo(1, 6);
  });
});

describe("creación automática de vistas", () => {
  it("crea una planta por nivel, cuatro alzados, iso y perspectiva", () => {
    const vistas = crearVistas(NIVELES);
    expect(vistas.map((v) => v.tipo)).toEqual([
      "planta",
      "planta",
      "alzado",
      "alzado",
      "alzado",
      "alzado",
      "iso",
      "perspectiva",
    ]);
    const plantas = vistas.filter((v) => v.tipo === "planta");
    expect(plantas[0].nombre).toBe("Planta Nivel 0");
    expect(plantas[0].alturaPlano).toBe(1.2);
    expect(plantas[0].profundidad).toBe(-1);
    expect(plantas[1].alturaPlano).toBe(4.2);
    expect(plantas[1].profundidad).toBe(0);
    expect(plantas[0].nivelesVisibles).toEqual(["nivel-0"]);
    expect(plantas[1].nivelesVisibles).toEqual(["nivel-1"]);
    for (const planta of plantas) {
      expect(Object.values(planta.categorias).every(Boolean)).toBe(true);
    }
    expect(vistas.filter((v) => v.tipo === "alzado").map((v) => v.orientacion)).toEqual([
      "norte",
      "sur",
      "este",
      "oeste",
    ]);
    expect(vistas.find((v) => v.tipo === "iso")?.nombre).toBe("3D Isométrica");
    expect(vistas.find((v) => v.tipo === "perspectiva")?.nombre).toBe("3D Perspectiva");
  });

  it("el corte es perpendicular a la línea y conserva la altura de la planta", () => {
    const corte = crearVistaCorte({
      puntoA: [0, 0],
      puntoB: [0, 10],
      alturaPlano: 1.2,
      nivelesVisibles: ["nivel-0"],
      indice: 1,
    });
    expect(corte.nombre).toBe("Corte 1");
    expect(corte.direccion).toEqual([-1, 0]);
    expect(corte.profundidad).toBe(10);
    expect(corte.alturaPlano).toBe(1.2);
    // Producto punto con la traza = 0.
    expect(corte.direccion![0] * 0 + corte.direccion![1] * 10).toBe(0);
    expect(corte.puntoA).toEqual([0, 0]);
    expect(corte.puntoB).toEqual([0, 10]);
  });
});

describe("OPENRVT_Vistas", () => {
  it("serializa y vuelve a leer las vistas sin perder la altura del corte", () => {
    const corte = crearVistaCorte({
      puntoA: [1.25, -3.5],
      puntoB: [8.75, 4.25],
      alturaPlano: 1.75,
      nivelesVisibles: ["nivel-0", "nivel-1"],
      indice: 1,
    });
    const vistas = [...crearVistas(NIVELES), corte];
    const texto = serializarVistas(vistas);
    expect(texto).not.toContain("Float32Array");
    const leidas = leerVistas(texto);
    expect(leidas).toHaveLength(vistas.length);
    expect(leidas[0].nombre).toBe("Planta Nivel 0");
    expect(leidas[0].alturaPlano).toBe(1.2);
    const corteLeido = leidas.find((v) => v.tipo === "corte");
    expect(corteLeido?.alturaPlano).toBe(1.75);
    expect(corteLeido?.profundidad).toBe(10);
    expect(corteLeido?.puntoA).toEqual([1.25, -3.5]);
    expect(corteLeido?.direccion![0]).toBeCloseTo(corte.direccion![0], 12);
    expect(corteLeido?.direccion![1]).toBeCloseTo(corte.direccion![1], 12);
  });

  it("un JSON roto o una vista inválida no rompen la lectura", () => {
    expect(leerVistas("{no es json")).toEqual([]);
    expect(leerVistas('"texto"')).toEqual([]);
    expect(normalizarVista(null)).toBeNull();
    expect(normalizarVista({ tipo: "inventado" })).toBeNull();
    const completada = normalizarVista({ tipo: "planta", nombre: "P", escala: 300 });
    expect(completada?.escala).toBe(100);
    expect(completada?.estilo).toBe("sombreado");
    expect(completada?.categorias.muros).toBe(true);
    expect(completada?.nivelesVisibles).toEqual([]);
  });
});

describe("O011: ajustes de eje en la vista", () => {
  it("una vista de la 0.5.7 (sin `ejes`) se conserva tal cual y sin ajustes", () => {
    // JSON de una vista guardada por la versión anterior: no tiene la clave `ejes`.
    const vieja = leerVistas(
      JSON.stringify([
        {
          id: "planta-nivel-0",
          nombre: "Planta Nivel 0",
          tipo: "planta",
          nivel: "nivel-0",
          nivelesVisibles: ["nivel-0"],
          escala: 100,
          estilo: "aristas",
        },
      ]),
    );
    expect(vieja).toHaveLength(1);
    expect(vieja[0].ejes).toBeUndefined();
    expect(vieja[0].nombre).toBe("Planta Nivel 0");
    expect(vieja[0].escala).toBe(100);
  });

  it("conserva extremos y codos válidos, recorta a dos y descarta puntos rotos", () => {
    const vista = normalizarVista({
      tipo: "planta",
      nombre: "P",
      ejes: {
        "eje-1": {
          extremoFin: [1.5, 8],
          codosFin: [
            [0.5, 7.5],
            [-0.5, 7.5],
            [9, 9],
          ],
        },
        "eje-2": { extremoInicio: ["x", 2] },
        "eje-3": {},
      },
    })!;
    expect(vista.ejes).toEqual({
      "eje-1": {
        extremoFin: [1.5, 8],
        codosFin: [
          [0.5, 7.5],
          [-0.5, 7.5],
        ],
      },
    });
  });

  it("ida y vuelta por el pset conserva los ajustes", () => {
    const vistas = crearVistas(NIVELES);
    vistas[0] = {
      ...vistas[0],
      ejes: { "eje-1": { extremoFin: [0, 9], codosInicio: [[0.5, 0.5]] } },
    };
    const otraVez = leerVistas(serializarVistas(vistas));
    expect(otraVez[0].ejes).toEqual(vistas[0].ejes);
  });
});

describe("caja de las mallas", () => {
  it("calcula los límites de todos los vértices decodificados", () => {
    const malla = (vertices: number[]): ElementoMalla => ({
      globalid: "g",
      clase: "IfcWall",
      nombre: "Muro",
      nivel: "Nivel 0",
      color: "#cccccc",
      opacidad: 1,
      categoria: "muros",
      tipo: "Block 15",
      capas: [],
      vertices: new Float32Array(vertices),
      indices: new Uint32Array([0, 1, 2]),
    });
    const caja = cajaDeMallas([
      malla([-2, 1, 0, 3, -4, 5]),
      malla([0, 0, 0, 1, 1, 1]),
    ]);
    expect(caja.min).toEqual([-2, -4, 0]);
    expect(caja.max).toEqual([3, 1, 5]);
  });

  it("sin mallas devuelve una caja unitaria para no romper la cámara", () => {
    expect(cajaDeMallas([])).toEqual({ min: [-1, -1, -1], max: [1, 1, 1] });
  });
});

describe("sobre el corte en planta (O005b)", () => {
  /** Caja con caras hacia fuera, como las mallas del núcleo. */
  const caja3 = (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
  ) => {
    const vertices = [
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y1, z0],
      [x0, y1, z0],
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z1],
    ].flat();
    const indices = [
      [0, 1, 2],
      [0, 2, 3],
      [4, 6, 5],
      [4, 7, 6],
      [0, 4, 5],
      [0, 5, 1],
      [1, 5, 6],
      [1, 6, 2],
      [2, 6, 7],
      [2, 7, 3],
      [3, 7, 4],
      [3, 4, 0],
    ].flat();
    return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
  };

  it("dibuja el contorno del volado y ninguna vigueta del piso de arriba", () => {
    const planta = crearVistas(NIVELES)[0];
    // Aunque el usuario vuelva a marcar el nivel de arriba, la planta solo debe
    // dibujar la silueta del mismo nivel.
    planta.nivelesVisibles = ["nivel-0", "nivel-1"];
    const mapaNiveles = new Map([
      ["Nivel 0", "nivel-0"],
      ["Nivel 1", "nivel-1"],
    ]);
    const volado = {
      categoria: "losas" as const,
      nivel: "Nivel 0",
      caja: caja3(-1, -1, 2.5, 4, 2, 2.7),
    };
    const viguetas = {
      categoria: "vigas" as const,
      nivel: "Nivel 1",
      caja: caja3(-1, -1, 3, 4, 2, 3.2),
    };
    const losaDeArriba = {
      categoria: "losas" as const,
      nivel: "Nivel 1",
      caja: caja3(-1, -1, 2.9, 4, 2, 3.1),
    };
    const cota = (m: { caja: { vertices: Float32Array } }) => {
      let min = Infinity;
      for (let i = 2; i < m.caja.vertices.length; i += 3) min = Math.min(min, m.caja.vertices[i]);
      return min;
    };
    const sobreCorte = [volado, viguetas, losaDeArriba].filter((m) =>
      dibujaSiluetaSobreCorte(planta, m.categoria, mapaNiveles.get(m.nivel), cota(m)),
    );
    expect(sobreCorte).toEqual([volado]);

    const siluetas = siluetaProyectada(volado.caja.vertices, volado.caja.indices);
    // Un solo contorno exterior (sin la retícula de triángulos) de 5 × 3 m.
    expect(siluetas).toHaveLength(1);
    expect(siluetas[0]).toHaveLength(5);
    expect(areaPoligono2D(siluetas[0])).toBeCloseTo(5 * 3, 6);
    // Las viguetas del nivel superior no llegan a generar silueta.
    expect(
      dibujaSiluetaSobreCorte(
        planta,
        viguetas.categoria,
        mapaNiveles.get(viguetas.nivel),
        cota(viguetas),
      ),
    ).toBe(false);
  });

  it("migra solo las plantas que conservan todos los niveles por omisión", () => {
    const conTodos = normalizarVista({
      tipo: "planta",
      nombre: "Planta vieja",
      nivel: "nivel-0",
      nivelesVisibles: ["nivel-0", "nivel-1"],
    })!;
    const editada = normalizarVista({
      tipo: "planta",
      nombre: "Planta editada",
      nivel: "nivel-0",
      nivelesVisibles: ["nivel-1"],
    })!;
    const migracion = migrarNivelesVisibles([conTodos, editada], NIVELES);
    expect(migracion.cambiadas).toBe(true);
    expect(migracion.vistas[0].nivelesVisibles).toEqual(["nivel-0"]);
    expect(migracion.vistas[1].nivelesVisibles).toEqual(["nivel-1"]);
  });
});

describe("sobrescritura de estilos por vista (O005)", () => {
  it("conserva ocultar y grosores al guardar y leer las vistas", () => {
    const vistas = crearVistas(NIVELES);
    const planta = { ...vistas[0] };
    planta.estilos = {
      muros: { corte: 0.7 },
      puertas: { oculta: true },
      losas: { proyeccion: 0.2 },
    };
    planta.alturaArriba = 4.5;
    const leidas = leerVistas(serializarVistas([planta]));
    expect(leidas[0].estilos).toEqual(planta.estilos);
    expect(leidas[0].alturaArriba).toBe(4.5);
  });
});

describe("O005c: encuadre con ejes", () => {
  it("amplía la caja vacía para que quepan los ejes y sus burbujas", () => {
    const caja = cajaConEjes(
      { min: [-1, -1, -1], max: [1, 1, 1] },
      [
        { globalid: "1", etiqueta: "1", x1: 0, y1: 0, x2: 0, y2: 6, vertical: true },
        { globalid: "A", etiqueta: "A", x1: 0, y1: 3, x2: 6, y2: 3, vertical: false },
      ],
    );
    expect(caja.min[0]).toBeLessThanOrEqual(-0.6);
    expect(caja.min[1]).toBeLessThanOrEqual(-0.6);
    expect(caja.max[0]).toBeGreaterThanOrEqual(6.6);
    expect(caja.max[1]).toBeGreaterThanOrEqual(6.6);
    // El eje Z (altura del modelo) no cambia.
    expect(caja.min[2]).toBe(-1);
    expect(caja.max[2]).toBe(1);
  });

  it("sin ejes devuelve la misma caja", () => {
    const caja = { min: [-1, -2, -3] as [number, number, number], max: [4, 5, 6] as [number, number, number] };
    expect(cajaConEjes(caja, [])).toBe(caja);
  });
});

describe("O006a: cotas de ejes en la vista", () => {
  it("vienen activadas por omisión y se conservan al guardar y reabrir", () => {
    const porDefecto = normalizarVista({ tipo: "planta", nombre: "P" });
    expect(porDefecto?.cotasEjes).toBe(true);
    const apagada = normalizarVista({ tipo: "planta", nombre: "P", cotasEjes: false });
    expect(apagada?.cotasEjes).toBe(false);
    const leidas = leerVistas(serializarVistas([apagada!]));
    expect(leidas[0].cotasEjes).toBe(false);
  });
});
