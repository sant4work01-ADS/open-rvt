/* eslint-disable react-hooks/immutability -- la escena es mutable por diseño. */
import { categoriaOculta, type PatronLinea } from "../../estilos";
import { categoriaVisible } from "../../vistas";
import { colocarSimbolo, geometriaPuerta, geometriaVentana, type Punto3 } from "../../seccion";
import { contornoCerramientoPlanta, lineaEjeCerramientoPlanta } from "../../planta";
import { crearMaterialLinea, esquinasRectangulo, lineaCerrada, rayadoRectangulo } from "../lineas";
import { muroBajoCerramiento } from "../utilidades";
import { type Punto2 } from "../../herramientas";
import type { CtxEscena } from "./contexto";

export function construirEstructuraPlanta(ctx: CtxEscena) {
  const {
    agregarRelleno,
    corteZ,
    grosorDe,
    grupoLocal,
    mundoPorPx,
    registro,
    resaltado,
    visibles,
    seleccionados,
    estilos,
    aberturas,
    seleccion,
    vista,
    mallas,
  } = ctx;

    if (vista.tipo === "planta") {
      const zEstructura = corteZ + 0.045;
      const p3 = (p: [number, number]): [number, number, number] => [p[0], p[1], zEstructura];
      for (const elemento of visibles) {
        const estructura = elemento.estructura;
        if (!estructura) continue;
        const seccion = estructura.seccion ?? {};
        const datos = estructura.datos ?? {};
        const numero = (valor: unknown, respaldo = 0) =>
          Number(valor) || respaldo;
        const alias = estructura.alias;
        const color =
          seleccion === elemento.globalid ||
          seleccionados.includes(elemento.globalid) ||
          resaltado === elemento.globalid
            ? "#ff8a00"
            : estilos.categorias[elemento.categoria].color;
        const mm = grosorDe(elemento.categoria, "corte") ?? 0.35;
        const trazado = (
          puntos: Array<[number, number]>,
          patron: PatronLinea,
          grosor = mm,
          cerrada = true,
        ) => {
          if (puntos.length < 2) return;
          const material = crearMaterialLinea({
            mm: grosor,
            escala: vista.escala,
            color,
            patron,
            registro,
            mundoPorPx,
            profundidad: false,
          });
          const lista = puntos.map(p3);
          if (cerrada) lista.push(p3(puntos[0]));
          lineaCerrada(lista, material, 1.35, grupoLocal);
        };
        if (alias === "columna" || alias === "castillo") {
          const ancho = numero(datos.B, numero(seccion.B, 0.30));
          const fondo = numero(datos.H, numero(seccion.H, 0.30));
          const cx = numero(datos.X);
          const cy = numero(datos.Y);
          const rotacion = numero(datos.Rotacion);
          const esquinas = esquinasRectangulo(cx, cy, rotacion, ancho, fondo);
          agregarRelleno(
            esquinas.map(([x, y]) => [x, y, zEstructura] as Punto3),
            "concreto",
            grupoLocal,
          );
          if (String(seccion.Forma ?? "rectangular") === "circular") {
            const radio = numero(seccion.D, ancho) / 2;
            const circulo: Array<[number, number]> = [];
            for (let i = 0; i < 24; i += 1) {
              const angulo = (i / 24) * Math.PI * 2;
              circulo.push([cx + radio * Math.cos(angulo), cy + radio * Math.sin(angulo)]);
            }
            trazado(circulo, "continua");
          } else {
            trazado(esquinas, "continua");
            const materialRaya = crearMaterialLinea({
              mm: 0.08,
              escala: vista.escala,
              color,
              registro,
              mundoPorPx,
              profundidad: false,
            });
            const coseno = Math.cos(rotacion);
            const seno = Math.sin(rotacion);
            for (const [[x1, y1], [x2, y2]] of rayadoRectangulo(ancho, fondo)) {
              const punto = (x: number, y: number): [number, number, number] => [
                cx + x * coseno - y * seno,
                cy + x * seno + y * coseno,
                zEstructura,
              ];
              lineaCerrada([punto(x1, y1), punto(x2, y2)], materialRaya, 1.2, grupoLocal);
            }
          }
        } else if (alias === "cerramiento") {
          // O041: en planta el cerramiento es UNA línea discontinua sobre su eje,
          // fina y encima del achurado del muro. Al seleccionarlo se resalta su
          // huella completa; suelto (sin muro debajo) se dibuja el contorno completo.
          const ancho = numero(seccion.B, 0.20);
          const eje: [number, number, number, number] = [
            numero(datos.X1),
            numero(datos.Y1),
            numero(datos.X2),
            numero(datos.Y2),
          ];
          const resaltadoAqui = seleccion === elemento.globalid || seleccionados.includes(elemento.globalid) || resaltado === elemento.globalid;
          const material = crearMaterialLinea({
            mm,
            escala: vista.escala,
            color: resaltadoAqui ? "#ff8a00" : color,
            patron: "discontinua",
            registro,
            mundoPorPx,
            profundidad: false,
          });
          if (resaltadoAqui || !muroBajoCerramiento(eje, mallas)) {
            const contorno = contornoCerramientoPlanta(eje, ancho);
            if (contorno.length > 0) {
              lineaCerrada(contorno.map((p) => p3(p)), material, 1.35, grupoLocal);
            }
          } else {
            const linea = lineaEjeCerramientoPlanta(eje);
            if (linea) {
              lineaCerrada([p3(linea[0]), p3(linea[1])], material, 1.35, grupoLocal);
            }
          }
        } else if (alias === "trabe") {
          const ancho = numero(seccion.B, 0.20);
          const x1 = numero(datos.X1);
          const y1 = numero(datos.Y1);
          const x2 = numero(datos.X2);
          const y2 = numero(datos.Y2);
          const largo = Math.hypot(x2 - x1, y2 - y1);
          if (largo <= 1e-6) continue;
          const ux = (x2 - x1) / largo;
          const uy = (y2 - y1) / largo;
          const nx = -uy * ancho / 2;
          const ny = ux * ancho / 2;
          trazado(
            [
              [x1 + nx, y1 + ny], [x2 + nx, y2 + ny],
              [x2 - nx, y2 - ny], [x1 - nx, y1 - ny],
            ],
            "discontinua",
          );
        } else if (alias === "zapata") {
          const largo = numero(seccion.Largo, 1.20);
          const ancho = numero(seccion.Ancho, 1.20);
          const esquinas = esquinasRectangulo(
            numero(datos.X), numero(datos.Y), numero(datos.Rotacion), largo, ancho,
          );
          trazado(esquinas, "discontinua-larga");
          const dadoB = numero(seccion.DadoB);
          const dadoH = numero(seccion.DadoH);
          if (dadoB > 0 && dadoH > 0) {
            trazado(
              esquinasRectangulo(
                numero(datos.X), numero(datos.Y), numero(datos.Rotacion), dadoB, dadoH,
              ),
              "discontinua",
            );
          }
        } else if (alias === "zapata_corrida" || alias === "contratrabe") {
          const ancho = alias === "zapata_corrida"
            ? numero(seccion.Ancho, 0.60)
            : numero(seccion.B, 0.20);
          const x1 = numero(datos.X1);
          const y1 = numero(datos.Y1);
          const x2 = numero(datos.X2);
          const y2 = numero(datos.Y2);
          const largo = Math.hypot(x2 - x1, y2 - y1);
          if (largo <= 1e-6) continue;
          const ux = (x2 - x1) / largo;
          const uy = (y2 - y1) / largo;
          const nx = -uy * ancho / 2;
          const ny = ux * ancho / 2;
          trazado(
            [
              [x1 + nx, y1 + ny], [x2 + nx, y2 + ny],
              [x2 - nx, y2 - ny], [x1 - nx, y1 - ny],
            ],
            "discontinua-larga",
          );
        }
      }
    }

    // O005: simbología 2D de puertas y ventanas, solo en plantas.
    if (vista.tipo === "planta") {
      const z = corteZ + 0.02;
      for (const abertura of aberturas) {
        const esPuerta = abertura.clase === "IfcDoor";
        if (!categoriaVisible(vista, abertura.categoria)) continue;
        if (categoriaOculta(vista, abertura.categoria)) continue;
        const mm = grosorDe(abertura.categoria, "corte") ?? 0.25;
        const mmFino = grosorDe(abertura.categoria, "proyeccion") ?? 0.13;
        const colorSimbolo = estilos.categorias[abertura.categoria].color;
        const a3 = (p: Punto2): [number, number, number] => [p[0], p[1], z];
        if (esPuerta) {
          const { hoja, arco } = geometriaPuerta({
            ancho: abertura.ancho,
            volteado: abertura.volteado,
          });
          const hojaMundo = colocarSimbolo(hoja, abertura.centro, abertura.angulo);
          const arcoMundo = colocarSimbolo(arco, abertura.centro, abertura.angulo);
          const materialHoja = crearMaterialLinea({
            mm,
            escala: vista.escala,
            color: colorSimbolo,
            registro,
            mundoPorPx,
            profundidad: false,
          });
          lineaCerrada(hojaMundo.map(a3), materialHoja, 2, grupoLocal);
          const materialArco = crearMaterialLinea({
            mm: Math.min(mmFino, 0.18),
            escala: vista.escala,
            color: colorSimbolo,
            registro,
            mundoPorPx,
            profundidad: false,
          });
          lineaCerrada(arcoMundo.map(a3), materialArco, 2, grupoLocal);
        } else {
          const { lineas, alfeizar } = geometriaVentana({
            ancho: abertura.ancho,
            espesor: abertura.espesor,
          });
          const materialVentana = crearMaterialLinea({
            mm: mmFino,
            escala: vista.escala,
            color: colorSimbolo,
            registro,
            mundoPorPx,
            profundidad: false,
          });
          for (const linea of lineas) {
            lineaCerrada(
              colocarSimbolo(linea, abertura.centro, abertura.angulo).map(a3),
              materialVentana,
              2,
              grupoLocal,
            );
          }
          const materialAlfeizar = crearMaterialLinea({
            mm: 0.1,
            escala: vista.escala,
            color: colorSimbolo,
            registro,
            mundoPorPx,
            profundidad: false,
          });
          lineaCerrada(
            colocarSimbolo(alfeizar, abertura.centro, abertura.angulo).map(a3),
            materialAlfeizar,
            1.9,
            grupoLocal,
          );
        }
      }
    }

  return {

  };
}
