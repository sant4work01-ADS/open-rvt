// O047: casos calculados a mano (no copiados del código).
//
// Cámara ortográfica: proyecta (x, y) tal cual y multiplica por `escala`; mirando
// hacia -Z desde z = 10. Así una distancia de 1 m vale `escala` px.
// Cámara de perspectiva: ojo en (0,0,d) mirando a -Z, foco f = 1000; un punto p
// se ve en (f·x / (d−z), f·y / (d−z)). Para poner el cursor a k px del origen en
// el plano z = 0 se elige x = k·d/f, de modo que al alejar la cámara (d ×10) el
// mismo objeto sigue a los mismos k px.
import { describe, expect, it } from "vitest";
import { inferir } from "./inferencias3d";
import type { CandidatosInferencia, EntradaInferencia, Inferencia, Rayo3, Vec3 } from "./inferencias3d";

const v = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });

function normalizar(a: Vec3): Vec3 {
  const l = Math.hypot(a.x, a.y, a.z);
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}

function ortografica(escala = 1) {
  const proyectar = (p: Vec3) => ({ x: p.x * escala, y: p.y * escala });
  const rayo = (x: number, y: number, z = 10): Rayo3 => ({
    origen: { x, y, z },
    direccion: { x: 0, y: 0, z: -1 },
  });
  return { proyectar, rayo };
}

function perspectiva(d = 10, foco = 1000) {
  const proyectar = (p: Vec3) => ({
    x: (foco * p.x) / (d - p.z),
    y: (foco * p.y) / (d - p.z),
  });
  /** Rayo que pasa por el píxel (px, py) a la profundidad z = zObjetivo. */
  const rayoPx = (px: number, py: number, zObjetivo = 0): Rayo3 => {
    const prof = d - zObjetivo;
    return {
      origen: { x: 0, y: 0, z: d },
      direccion: normalizar({ x: (px * prof) / foco, y: (py * prof) / foco, z: zObjetivo - d }),
    };
  };
  return { proyectar, rayoPx };
}

const planoSuelo = { punto: v(0, 0, 0), normal: v(0, 0, 1) };

function entrada(
  rayo: Rayo3,
  proyectar: (p: Vec3) => { x: number; y: number },
  candidatos: CandidatosInferencia = {},
  extra: Partial<EntradaInferencia> = {},
): EntradaInferencia {
  return { rayo, proyectar, candidatos, planoTrabajo: planoSuelo, ...extra };
}

const puntoCerca = (p: Vec3 | null, esperado: Vec3, eps = 1e-6): void => {
  expect(p).not.toBeNull();
  const q = p as Vec3;
  expect(Math.abs(q.x - esperado.x)).toBeLessThan(eps);
  expect(Math.abs(q.y - esperado.y)).toBeLessThan(eps);
  expect(Math.abs(q.z - esperado.z)).toBeLessThan(eps);
};

describe("O047 inferencias 3D", () => {
  it("a 5 px de un vértice da extremo; a 12 px ya no", () => {
    const { proyectar, rayoPx } = perspectiva(10);
    const lejos = inferir(entrada(rayoPx(12, 0), proyectar, { vertices: [v(0, 0, 0)] }));
    expect(lejos.tipo).toBe("plano");
    const cercaRes: Inferencia = inferir(
      entrada(rayoPx(5, 0), proyectar, { vertices: [v(0, 0, 0)] }),
    );
    expect(cercaRes.tipo).toBe("extremo");
    expect(cercaRes.referencia).toBe(0);
    puntoCerca(cercaRes.punto, v(0, 0, 0));
  });

  it("el mismo caso con la cámara 10 veces más lejos da lo mismo (tolerancia en px)", () => {
    // A d=100 el punto del plano z=0 se elige en x = 5·100/1000 = 0.5 m, que en
    // pantalla vuelve a ser exactamente 5 px: la cámara está 10 veces más lejos
    // pero el vértice sigue dentro de la tolerancia de 10 px.
    const { proyectar, rayoPx } = perspectiva(100);
    const res = inferir(entrada(rayoPx(5, 0), proyectar, { vertices: [v(0, 0, 0)] }));
    expect(res.tipo).toBe("extremo");
    puntoCerca(res.punto, v(0, 0, 0));
  });

  it("el punto medio de (0,0,0)-(4,0,0) es (2,0,0)", () => {
    // Escala 10: los extremos quedan a 20 px y el medio a 0 px.
    const { proyectar, rayo } = ortografica(10);
    const res = inferir(
      entrada(rayo(2, 0), proyectar, { aristas: [{ inicio: v(0, 0, 0), fin: v(4, 0, 0) }] }),
    );
    expect(res.tipo).toBe("medio");
    expect(res.referencia).toBe(0);
    puntoCerca(res.punto, v(2, 0, 0));
  });

  it("dos aristas que se cruzan dan la intersección exacta", () => {
    // a: (0,0,0)-(10,0,0); b: (3,-6,0)-(3,2,0). Se cortan en (3,0,0).
    // Extremos y puntos medios quedan a ≥ 20 px con escala 10, fuera de la
    // tolerancia de 10 px, así que solo puede ganar la intersección.
    const { proyectar, rayo } = ortografica(10);
    const res = inferir(
      entrada(rayo(3, 0), proyectar, {
        aristas: [
          { inicio: v(0, 0, 0), fin: v(10, 0, 0) },
          { inicio: v(3, -6, 0), fin: v(3, 2, 0) },
        ],
      }),
    );
    expect(res.tipo).toBe("interseccion");
    puntoCerca(res.punto, v(3, 0, 0));
  });

  it("sobre una arista devuelve el punto de la arista más cercano al cursor", () => {
    // Arista (0,0,0)-(20,0,0), escala 10, cursor en (3, 0.3): el pie cae en
    // (3,0,0) a 3 px; extremos a 30 px y 170 px, medio a 100 px.
    const { proyectar, rayo } = ortografica(10);
    const res = inferir(
      entrada(rayo(3, 0.3), proyectar, {
        aristas: [{ inicio: v(0, 0, 0), fin: v(20, 0, 0) }],
      }),
    );
    expect(res.tipo).toBe("sobre_arista");
    puntoCerca(res.punto, v(3, 0, 0));
  });

  it("desde (1,1,0) cerca del eje X da y = 1 y z = 0", () => {
    const { proyectar, rayo } = ortografica(10);
    const res = inferir(entrada(rayo(2, 1), proyectar, {}, { puntoPrevio: v(1, 1, 0) }));
    expect(res.tipo).toBe("eje_x");
    expect(res.referencia).toBe(0);
    puntoCerca(res.punto, v(2, 1, 0));
    expect(res.guia).toBeDefined();
    puntoCerca(res.guia!.inicio, v(1, 1, 0));
    puntoCerca(res.guia!.fin, v(2, 1, 0));
  });

  it("con bloqueo Z el punto cae en x=1, y=1 y z según el rayo aunque el cursor esté lejos", () => {
    // Rayo desde (40,40,10) en dirección (-1,-1,-1)/√3. Corta la vertical
    // x=1,y=1 cuando han pasado 39 m en cada eje: z = 10 − 39 = −29.
    const { proyectar } = ortografica(1);
    const rayo: Rayo3 = {
      origen: { x: 40, y: 40, z: 10 },
      direccion: normalizar({ x: -1, y: -1, z: -1 }),
    };
    const res = inferir(
      entrada(rayo, proyectar, {}, { puntoPrevio: v(1, 1, 0), bloqueo: { tipo: "eje", eje: "z" } }),
    );
    expect(res.tipo).toBe("eje_z");
    puntoCerca(res.punto, v(1, 1, -29));
  });

  it("bloqueo por dirección de arista: el punto cae en la recta, aunque el cursor esté lejos", () => {
    // Recta por (1,1,0) con dirección (1,1,0)/√2. El rayo desde (40,40,10) con
    // dirección (-1,-1,-1)/√3 baja 10/√3 m por eje hasta z = 0, justo en (30,30,0).
    const { proyectar } = ortografica(1);
    const rayo: Rayo3 = {
      origen: { x: 40, y: 40, z: 10 },
      direccion: normalizar({ x: -1, y: -1, z: -1 }),
    };
    const res = inferir(
      entrada(
        rayo,
        proyectar,
        {},
        {
          puntoPrevio: v(1, 1, 0),
          bloqueo: { tipo: "arista", inicio: v(1, 1, 0), fin: v(2, 2, 0), referencia: 7 },
        },
      ),
    );
    expect(res.tipo).toBe("paralelo");
    expect(res.referencia).toBe(7);
    puntoCerca(res.punto, v(30, 30, 0));
    puntoCerca(res.guia!.inicio, v(1, 1, 0));
    puntoCerca(res.guia!.fin, v(30, 30, 0));
  });

  it("secuencia de cursor: extremo, luego medio y después plano (sin estado pegado)", () => {
    // Arista (0,0,0)-(4,0,0) con escala 10. Los tres pasos usan la misma entrada
    // salvo el rayo: no debe quedar memoria de la inferencia anterior.
    const { proyectar, rayo } = ortografica(10);
    const aristas = [{ inicio: v(0, 0, 0), fin: v(4, 0, 0) }];
    const candidatos = { vertices: [v(0, 0, 0)], aristas };

    const paso1 = inferir(entrada(rayo(0.1, 0.1), proyectar, candidatos));
    expect(paso1.tipo).toBe("extremo");
    puntoCerca(paso1.punto, v(0, 0, 0));

    const paso2 = inferir(entrada(rayo(2, 0), proyectar, { aristas }));
    expect(paso2.tipo).toBe("medio");
    puntoCerca(paso2.punto, v(2, 0, 0));

    const paso3 = inferir(entrada(rayo(2, 2), proyectar, { aristas }));
    expect(paso3.tipo).toBe("plano");
    puntoCerca(paso3.punto, v(2, 2, 0));
  });

  it("paralelo a una arista oblicua de 30°", () => {
    // Dirección de la arista (cos30, sen30) = (0.8660254, 0.5). Desde el origen,
    // el cursor en (2, 2·tan30) = (2, 1.1547005) está sobre la paralela.
    const { proyectar, rayo } = ortografica(10);
    const dir = v(Math.cos(Math.PI / 6), Math.sin(Math.PI / 6));
    const res = inferir(
      entrada(
        rayo(2, 1.1547005),
        proyectar,
        { aristas: [{ inicio: v(1, -0.5), fin: v(1 + dir.x, -0.5 + dir.y) }] },
        { puntoPrevio: v(0, 0, 0) },
      ),
    );
    expect(res.tipo).toBe("paralelo");
    expect(res.referencia).toBe(0);
    puntoCerca(res.punto, v(2, 1.1547005383792517, 0));
  });

  it("perpendicular a la misma arista", () => {
    // Perpendicular en el plano XY: (-sen30, cos30)·2 = (-1, 1.7320508).
    const { proyectar, rayo } = ortografica(10);
    const dir = v(Math.cos(Math.PI / 6), Math.sin(Math.PI / 6));
    const res = inferir(
      entrada(
        rayo(-1, 1.7320508),
        proyectar,
        { aristas: [{ inicio: v(1, -0.5), fin: v(1 + dir.x, -0.5 + dir.y) }] },
        { puntoPrevio: v(0, 0, 0) },
      ),
    );
    expect(res.tipo).toBe("perpendicular");
    puntoCerca(res.punto, v(-1, 1.7320508075688772, 0));
  });

  it("prioridad: un eje a 2 px gana a un extremo a 6 px, pero no a uno a 4 px", () => {
    const { proyectar, rayo } = ortografica(1);
    // Ancla en (10,2). El eje X pasa a 2 px del cursor en (0,0): su punto más
    // cercano es (0,2,0). El eje Y queda a 10 px, así que no empata. Un vértice
    // en (0,6) está a 6 px: 2 + 3 < 6, gana el eje X. Con el vértice en (0,4)
    // (4 px) ya no se supera el margen de 3 px y gana el extremo.
    const lejos = inferir(
      entrada(rayo(0, 0), proyectar, { vertices: [v(0, 6)] }, { puntoPrevio: v(10, 2) }),
    );
    expect(lejos.tipo).toBe("eje_x");
    expect(lejos.referencia).toBe(0);
    puntoCerca(lejos.punto, v(0, 2, 0));

    const cercaRes = inferir(
      entrada(rayo(0, 0), proyectar, { vertices: [v(0, 4)] }, { puntoPrevio: v(10, 2) }),
    );
    expect(cercaRes.tipo).toBe("extremo");
    puntoCerca(cercaRes.punto, v(0, 4));
  });

  it("un vértice tapado por una cara no cuenta", () => {
    // Vértice en (0,0,0) y cara opaca en z=5: el rayo desde z=10 corta primero
    // la cara (t=5) que el vértice (t=10).
    const { proyectar, rayo } = ortografica(1);
    const res = inferir(
      entrada(rayo(0, 0), proyectar, {
        vertices: [v(0, 0, 0)],
        caras: [
          {
            poligono: [v(-1, -1, 5), v(1, -1, 5), v(1, 1, 5), v(-1, 1, 5)],
            normal: v(0, 0, 1),
          },
        ],
      }),
    );
    expect(res.tipo).toBe("sobre_cara");
    puntoCerca(res.punto, v(0, 0, 5));
  });

  it("un candidato detrás de la cámara no cuenta", () => {
    // Con proyección ortográfica el vértice de z=20 se ve en el mismo píxel que
    // el cursor, pero está detrás del ojo (z=10 mirando a -Z).
    const { proyectar, rayo } = ortografica(1);
    const res = inferir(entrada(rayo(0, 0), proyectar, { vertices: [v(0, 0, 20)] }));
    expect(res.tipo).toBe("plano");
    puntoCerca(res.punto, v(0, 0, 0));
  });

  it("sin candidatos devuelve el corte con el plano de trabajo", () => {
    const { proyectar, rayo } = ortografica(1);
    const res = inferir(entrada(rayo(0.5, 0.5), proyectar));
    expect(res.tipo).toBe("plano");
    expect(res.referencia).toBeNull();
    puntoCerca(res.punto, v(0.5, 0.5, 0));
  });

  it("rayo paralelo al plano de trabajo: resultado nulo", () => {
    const { proyectar } = ortografica(1);
    const rayo: Rayo3 = { origen: v(0, 0, 10), direccion: { x: 1, y: 0, z: 0 } };
    const res = inferir(entrada(rayo, proyectar));
    expect(res.punto).toBeNull();
    expect(res.tipo).toBeNull();
    expect(res.referencia).toBeNull();
  });
});
