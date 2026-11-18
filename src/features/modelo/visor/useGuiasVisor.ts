/* eslint-disable react-hooks/immutability -- los refs del visor son mutables por diseño. */
import * as THREE from "three";
import { centroCaja } from "../vistas";
import { elevacionDesdeCota } from "../niveles";
import { rectaDeMalla } from "../alinear";
import { type Nota } from "../anotaciones3d";
import { type Punto3 } from "../seccion";
import { colocarAbertura } from "../herramientas";
import { useEffect, useState } from "react";

import { useOverlaysVisor } from "./useOverlaysVisor";
export function useGuiasVisor(c: ReturnType<typeof useOverlaysVisor>) {
  const {
    contenedor,
    camara,
    herramienta,
    puntosHerramienta,
    opcionesAbertura,
    referenciaAlinear,
    alineando,
    ratonHerramienta,
    referencias,
    opcionesNivel,
    cotasNivel,
    seleccionarNota,
    crearNota,
    editarNota,
    notaEditando,
    setNotaEditando,
    textoNota,
    setTextoNota,
    ejeSeleccionado,
    mundoPorPxRef,
    vista,
    mallas,
    caja,
    ajusteActualEje,
    pantallaDePunto,
    puntoNotaEn,
  } = c;

  const ejeSeleccionadoDatos = referencias.ejes.find((e) => e.globalid === ejeSeleccionado);
  const ajusteSeleccionado = ejeSeleccionado ? ajusteActualEje(ejeSeleccionado) : undefined;
  const codosInicioSel = ajusteSeleccionado?.codosInicio?.length ?? 0;
  const codosFinSel = ajusteSeleccionado?.codosFin?.length ?? 0;
  const puedeAnotarEje =
    !!ejeSeleccionadoDatos &&
    (vista.tipo === "planta" || vista.tipo === "alzado" || vista.tipo === "corte");

  // O026: guía azul punteada de la referencia y candado de la alineación.
  // Se proyecta en un efecto: durante el render no se leen refs de cámara.
  const [guiaAlinear, setGuiaAlinear] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    candado: { x: number; y: number } | null;
    bloqueada: boolean;
  } | null>(null);
  useEffect(() => {
    if (!referenciaAlinear) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- la guía depende de la cámara y de la selección
      setGuiaAlinear(null);
      return;
    }
    const z = vista.tipo === "planta" ? 0.05 : (vista.alturaPlano ?? 1.2);
    let a: [number, number, number] | null = null;
    let b: [number, number, number] | null = null;
    if (referenciaAlinear.tipo === "eje") {
      const eje = referencias.ejes.find((e) => e.globalid === referenciaAlinear.globalid);
      if (eje) {
        a = [eje.x1, eje.y1, z];
        b = [eje.x2, eje.y2, z];
      }
    } else if (referenciaAlinear.tipo === "elemento") {
      const malla = mallas.find((m) => m.globalid === referenciaAlinear.globalid);
      const recta = malla ? rectaDeMalla(malla) : null;
      if (malla?.eje) {
        a = [malla.eje[0], malla.eje[1], z];
        b = [malla.eje[2], malla.eje[3], z];
      } else if (recta) {
        a = [recta.x - recta.ux * 1.5, recta.y - recta.uy * 1.5, z];
        b = [recta.x + recta.ux * 1.5, recta.y + recta.uy * 1.5, z];
      }
    }
    const rectNodo = contenedor.current?.getBoundingClientRect();
    if (!a || !b || !rectNodo) {
      setGuiaAlinear(null);
      return;
    }
    const pa = pantallaDePunto(a);
    const pb = pantallaDePunto(b);
    if (!pa || !pb) {
      setGuiaAlinear(null);
      return;
    }
    const candado = alineando
      ? pantallaDePunto([alineando.punto[0], alineando.punto[1], z])
      : null;
    setGuiaAlinear({
      x1: pa.x - rectNodo.left,
      y1: pa.y - rectNodo.top,
      x2: pb.x - rectNodo.left,
      y2: pb.y - rectNodo.top,
      candado: candado
        ? { x: candado.x - rectNodo.left, y: candado.y - rectNodo.top }
        : null,
      bloqueada: !!alineando?.bloqueada,
    });
  }, [referenciaAlinear, alineando, vista, mallas, referencias.ejes, pantallaDePunto]);

  // O068: línea base→cursor con la distancia mientras se mueve o copia.
  const [guiaMover, setGuiaMover] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    texto: string;
  } | null>(null);
  useEffect(() => {
    if (
      (herramienta !== "mover" && herramienta !== "copiar") ||
      puntosHerramienta.length !== 1 ||
      !ratonHerramienta
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- la guía depende de la herramienta y la cámara
      setGuiaMover(null);
      return;
    }
    const rect = contenedor.current?.getBoundingClientRect();
    const z = vista.tipo === "planta" ? 0.05 : (vista.alturaPlano ?? 1.2);
    const base = puntosHerramienta[0];
    const a = pantallaDePunto([base[0], base[1], z]);
    const b = pantallaDePunto([ratonHerramienta[0], ratonHerramienta[1], z]);
    if (!rect || !a || !b) {
      setGuiaMover(null);
      return;
    }
    const metros = Math.hypot(
      ratonHerramienta[0] - base[0],
      ratonHerramienta[1] - base[1],
    );
    setGuiaMover({
      x1: a.x - rect.left,
      y1: a.y - rect.top,
      x2: b.x - rect.left,
      y2: b.y - rect.top,
      texto: `${metros.toFixed(2)} m`,
    });
  }, [herramienta, puntosHerramienta, ratonHerramienta, vista, pantallaDePunto, contenedor]);

  // O068: vista previa de la abertura centrada en el cursor, con las cotas a los
  // dos extremos del muro.
  const [guiaAbertura, setGuiaAbertura] = useState<{
    puntos: string;
    desde: { x: number; y: number; texto: string } | null;
    hasta: { x: number; y: number; texto: string } | null;
  } | null>(null);
  useEffect(() => {
    if (
      (herramienta !== "puerta" && herramienta !== "ventana") ||
      !ratonHerramienta
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- la vista previa depende del cursor
      setGuiaAbertura(null);
      return;
    }
    const colocada = colocarAbertura(
      referencias,
      ratonHerramienta,
      opcionesAbertura.ancho,
    );
    const rect = contenedor.current?.getBoundingClientRect();
    if (!colocada || !rect) {
      setGuiaAbertura(null);
      return;
    }
    const { muro } = colocada;
    const largo = Math.hypot(muro.x2 - muro.x1, muro.y2 - muro.y1) || 1;
    const ux = (muro.x2 - muro.x1) / largo;
    const uy = (muro.y2 - muro.y1) / largo;
    const nx = -uy;
    const ny = ux;
    const z = vista.tipo === "planta" ? 0.05 : (vista.alturaPlano ?? 1.2);
    const mitad = (muro.espesor || 0.15) / 2;
    const d0 = colocada.distancia;
    const d1 = d0 + opcionesAbertura.ancho;
    const esquina = (d: number, lado: number): [number, number, number] => [
      muro.x1 + ux * d + nx * mitad * lado,
      muro.y1 + uy * d + ny * mitad * lado,
      z,
    ];
    const pantallas = [
      pantallaDePunto(esquina(d0, -1)),
      pantallaDePunto(esquina(d0, 1)),
      pantallaDePunto(esquina(d1, 1)),
      pantallaDePunto(esquina(d1, -1)),
    ];
    if (pantallas.some((p) => !p)) {
      setGuiaAbertura(null);
      return;
    }
    const puntos = pantallas
      .map((p) => `${p!.x - rect.left},${p!.y - rect.top}`)
      .join(" ");
    const etiqueta = (
      d: number,
      texto: string,
    ): { x: number; y: number; texto: string } | null => {
      const p = pantallaDePunto([
        muro.x1 + ux * d + nx * (mitad + 0.25),
        muro.y1 + uy * d + ny * (mitad + 0.25),
        z,
      ]);
      return p ? { x: p.x - rect.left, y: p.y - rect.top, texto } : null;
    };
    setGuiaAbertura({
      puntos,
      desde: etiqueta(d0 / 2, `${d0.toFixed(2)} m`),
      hasta: etiqueta((d1 + largo) / 2, `${colocada.hastaFin.toFixed(2)} m`),
    });
  }, [
    herramienta,
    ratonHerramienta,
    referencias,
    opcionesAbertura.ancho,
    vista,
    pantallaDePunto,
    contenedor,
  ]);

  // O029: alzado con la herramienta Nivel. La elevación objetivo es la tecleada
  // (si la hay); con ella se dibujan la línea fantasma y las dos cotas temporales.
  const esAlzadoOCorte = vista.tipo === "alzado" || vista.tipo === "corte";
  const zNivelHerramienta =
    herramienta === "nivel" && ratonHerramienta
      ? (() => {
          const texto = (opcionesNivel.elevacionTexto || "").trim();
          if (texto !== "") {
            const z = elevacionDesdeCota(cotasNivel?.inferior ?? null, texto);
            if (z !== null) return z;
          }
          return ratonHerramienta[1];
        })()
      : null;
  const [lineaFantasmaNivel, setLineaFantasmaNivel] = useState<{
    y: number;
    x1: number;
    x2: number;
  } | null>(null);
  const [cotasFantasma, setCotasFantasma] = useState<
    Array<{ y1: number; y2: number; texto: string }>
  >([]);
  useEffect(() => {
    if (herramienta !== "nivel" || zNivelHerramienta === null || !esAlzadoOCorte) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- la vista fantasma depende de la cámara, que vive en un ref
      setLineaFantasmaNivel(null);
      setCotasFantasma([]);
      return;
    }
    const rect = contenedor.current?.getBoundingClientRect();
    const centro = centroCaja(caja);
    const enPantalla = (z: number) => pantallaDePunto([centro[0], centro[1], z]);
    const cursor = enPantalla(zNivelHerramienta);
    if (!rect || !cursor) {
      setLineaFantasmaNivel(null);
      setCotasFantasma([]);
      return;
    }
    setLineaFantasmaNivel({
      y: cursor.y - rect.top,
      x1: 8,
      x2: Math.max(8, rect.width - 8),
    });
    const filas: Array<{ y1: number; y2: number; texto: string }> = [];
    for (const [lado, cota] of [
      ["inferior", cotasNivel?.inferior],
      ["superior", cotasNivel?.superior],
    ] as const) {
      if (!cota) continue;
      const yNivel = enPantalla(cota.elevacion);
      if (!yNivel) continue;
      const desfase =
        lado === "inferior"
          ? zNivelHerramienta - cota.elevacion
          : cota.elevacion - zNivelHerramienta;
      filas.push({
        y1: yNivel.y - rect.top,
        y2: cursor.y - rect.top,
        texto: `${cota.nombre} ${lado === "inferior" ? "+" : "−"} ${desfase.toFixed(2)}`,
      });
    }
    setCotasFantasma(filas);
  }, [
    herramienta,
    zNivelHerramienta,
    esAlzadoOCorte,
    cotasNivel,
    caja,
    pantallaDePunto,
  ]);

  // O055: herramienta Nota. El clic abre el editor en el punto 3D; Enter confirma
  // (crear o editar) y Esc cancela.
  const abrirEditorNotaNueva = (clientX: number, clientY: number) => {
    const punto = puntoNotaEn(clientX, clientY);
    const nodo = contenedor.current;
    if (!punto || !nodo) return;
    const rect = nodo.getBoundingClientRect();
    setNotaEditando({
      globalid: null,
      texto: "",
      posicion: punto,
      izquierda: Math.max(90, Math.min(rect.width - 90, clientX - rect.left)),
      arriba: Math.max(8, Math.min(rect.height - 90, clientY - rect.top - 60)),
    });
    setTextoNota("");
  };

  const abrirEditorNotaExistente = (nota: Nota, x: number, y: number) => {
    setNotaEditando({
      globalid: nota.globalid,
      texto: nota.texto,
      posicion: nota.posicion,
      izquierda: Math.max(90, Math.min((contenedor.current?.clientWidth ?? 400) - 90, x)),
      arriba: Math.max(8, Math.min((contenedor.current?.clientHeight ?? 400) - 90, y - 60)),
    });
    setTextoNota(nota.texto);
    seleccionarNota(nota.globalid);
  };

  const confirmarNota = async () => {
    const texto = textoNota.trim();
    const edicion = notaEditando;
    if (!edicion || !texto) {
      setNotaEditando(null);
      return;
    }
    setNotaEditando(null);
    if (edicion.globalid) {
      await editarNota(edicion.globalid, texto);
    } else {
      const gid = await crearNota(texto, edicion.posicion);
      if (gid) seleccionarNota(gid);
    }
  };

  /** Desplazamiento en pantalla → nueva posición de mundo de la nota. */
  const posicionNotaArrastrada = (
    posicion: Punto3,
    dx: number,
    dy: number,
  ): Punto3 => {
    const camera = camara.current;
    if (!camera) return posicion;
    const derecha = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const arriba = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const wpp = Math.max(mundoPorPxRef.current, 1e-6);
    return [
      posicion[0] + derecha.x * dx * wpp + arriba.x * dy * wpp,
      posicion[1] + derecha.y * dx * wpp + arriba.y * dy * wpp,
      posicion[2] + derecha.z * dx * wpp + arriba.z * dy * wpp,
    ];
  };

  const alHacerClicVisor = (evento: React.MouseEvent<HTMLDivElement>) => {
    if (herramienta !== "nota") return;
    const objetivo = evento.target as HTMLElement;
    if (objetivo.closest("button, input, select, textarea, [role='menu']")) return;
    abrirEditorNotaNueva(evento.clientX, evento.clientY);
  };

  return {
    ...c,
    ejeSeleccionadoDatos,
    ajusteSeleccionado,
    codosInicioSel,
    codosFinSel,
    puedeAnotarEje,
    guiaAlinear,
    setGuiaAlinear,
    guiaMover,
    guiaAbertura,
    esAlzadoOCorte,
    zNivelHerramienta,
    lineaFantasmaNivel,
    setLineaFantasmaNivel,
    cotasFantasma,
    setCotasFantasma,
    abrirEditorNotaNueva,
    abrirEditorNotaExistente,
    confirmarNota,
    posicionNotaArrastrada,
    alHacerClicVisor,
  };
}
