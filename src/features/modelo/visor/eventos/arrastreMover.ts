import { ARRIBA } from "../camara";
import * as THREE from "three";
import { type AjusteEjeVista } from "../../tipos";
import { useModelo } from "../../estado";
import { siguienteCandidato, textoPistaTab } from "../../seleccionCiclica";
import { buscarEnganche, type Punto2 } from "../../herramientas";
import { alturaEnEjeVertical } from "../../empujar";
import { distanciaSobreNormal } from "../../empujarCaras";
import { inferir } from "../../inferencias3d";
import { contornoPrevio, desfaseConArrastre } from "../../asasLosa";
import {
  arrastrarExtremoEje,
  desplazamientoArrastreNivel,
  destinoArrastreAsa,
  destinoArrastreCodo,
  extremoEje,
  imanAlineacion,
  imanMultiplo,
  mmPapelAMetros,
  normalizarAjusteEje,
  type DireccionEjeArrastre,
  type LadoEje,
  type TipoAsaArrastre,
} from "../../ejesVista";
import type { EntornoVisor } from "./contexto";
import type { EstadoGesto } from "./contexto";
import type { crearAyudas } from "./ayudas";
import type { crearAccionesClic } from "./clic";

export function crearAlMover(
  entorno: EntornoVisor,
  nodo: HTMLElement,
  ayudas: ReturnType<typeof crearAyudas>,
  base: ReturnType<typeof crearAccionesClic>,
  gesto: EstadoGesto,
) {
  const {
    ajusteActualEje,
    ajusteEnCursoRef,
    altoBurbujaRef,
    aplicarCamara,
    arrastre,
    arrastreEje,
    arrastreLosa,
    arrastreNivel,
    asaEjeEn,
    camara,
    contextoEje,
    ejeSeleccionadoRef,
    empujarCara,
    empujarRect,
    empujarZ,
    fijarAlturaEmpujar,
    fijarPistaTab,
    fijarRaton,
    grupo,
    herramienta,
    meshes,
    metrosPorPixelActual,
    moverEmpujar,
    moverEmpujarCara,
    mundoPorPxRef,
    navegacion,
    pantallaDePunto,
    puntoVistaDesdeEvento,
    referencias,
    resaltadoRef,
    setAjusteEnCurso,
    setAjustesNivelEnCurso,
    setCaraEmpujarHover,
    setGuiaArrastre,
    setGuiaCodo,
    setGuiaEmpujar,
    setMarcadorEmpujar,
    setPreviewLosaPx,
    setResaltado,
    setVentanaSeleccion,
    ultimaInferenciaEmpujar,
    ultimoPuntero,
    zEmpujar,
    vista,
    niveles,
    caja,
    modoCorte,
  } = entorno;
  const {
    zoomEnPantalla,
    panearPixeles,
    puntoPlanta,
    rayoPantalla,
    proyectarLienzo,
    anotarInferenciaEmpujar,
    inferenciaEmpujarEn,
    caraBajoCursor,
    candidatosSin,
    candidatosEn,
  } = ayudas;
  const { prepararCodoArrastre } = base;
  const alMover = (evento: PointerEvent) => {
    const nav = navegacion.current;
    const camera = camara.current;
    if (!nav || !camera) return;
    if (evento.pointerType !== "touch") {
      ultimoPuntero.current = { x: evento.clientX, y: evento.clientY };
    }
    // O041: al pasar el cursor se resalta lo que Tab seleccionaría a continuación.
    if (
      evento.buttons === 0 &&
      evento.pointerType !== "touch" &&
      !arrastre.current &&
      !arrastreLosa.current &&
      !arrastreNivel.current &&
      !arrastreEje.current &&
      !herramienta &&
      !modoCorte
    ) {
      const candidatos = candidatosEn(evento.clientX, evento.clientY);
      const siguiente = siguienteCandidato(
        candidatos,
        useModelo.getState().seleccion,
      );
      const gid = siguiente?.globalid ?? null;
      if (gid !== resaltadoRef.current) {
        resaltadoRef.current = gid;
        setResaltado(gid);
        fijarPistaTab(textoPistaTab(siguiente));
      }
    }
    if (
      herramienta === "recortar_extender" &&
      vista.tipo === "planta" &&
      evento.buttons === 0
    ) {
      const estado = useModelo.getState();
      const hayReferencia =
        estado.modoRecorte === "esquina"
          ? !!estado.recorteInicial
          : !!estado.referenciaRecorte;
      if (hayReferencia) {
        const punto = puntoPlanta(evento);
        const rect = nodo.getBoundingClientRect();
        const raton = new THREE.Vector2(
          ((evento.clientX - rect.left) / rect.width) * 2 - 1,
          -((evento.clientY - rect.top) / rect.height) * 2 + 1,
        );
        const rayo = new THREE.Raycaster();
        rayo.setFromCamera(raton, camera);
        const impacto = rayo.intersectObjects(meshes.current, false)[0];
        const gid = impacto?.object.userData.globalid as string | undefined;
        if (punto && gid) estado.previsualizarRecorte(gid, punto);
        else if (estado.vistaPreviaRecorte)
          estado.previsualizarRecorte("", [0, 0]);
      }
    }
    // O034: el borde de la losa sigue al puntero en su normal exterior.
    const arrLosa = arrastreLosa.current;
    if (arrLosa) {
      if (!arrLosa.movido) {
        const recorrido = Math.hypot(
          evento.clientX - arrLosa.pantallaInicio.x,
          evento.clientY - arrLosa.pantallaInicio.y,
        );
        if (recorrido < 3) return;
        arrLosa.movido = true;
      }
      const crudo = puntoPlanta(evento);
      if (!crudo) return;
      // O034: primero los imanes de la planta (extremos, medios, cruces e
      // intersecciones); si no hay ninguno, se usa el punto y el redondeo de
      // 0.005 m de `desfaseConArrastre`.
      const enganche = buscarEnganche(
        crudo,
        useModelo.getState().referencias,
        null,
        mundoPorPxRef.current,
      );
      const punto = enganche.tipo === "cuadricula" ? crudo : enganche.punto;
      const delta: Punto2 = [
        punto[0] - arrLosa.inicio[0],
        punto[1] - arrLosa.inicio[1],
      ];
      const nuevo = desfaseConArrastre(
        arrLosa.desfaseInicial,
        arrLosa.normal,
        delta,
      );
      arrLosa.desfase = nuevo;
      const rect = nodo.getBoundingClientRect();
      const z = (vista.alturaPlano ?? caja.max[2]) + 0.02;
      if (arrLosa.poligono) {
        const contorno = contornoPrevio(
          arrLosa.poligono,
          arrLosa.indice,
          arrLosa.normal,
          nuevo - arrLosa.desfaseInicial,
        );
        const puntos = contorno
          ? contorno.map((punto) => {
              const pantalla = pantallaDePunto([punto[0], punto[1], z]);
              return pantalla
                ? { x: pantalla.x - rect.left, y: pantalla.y - rect.top }
                : null;
            })
          : null;
        setPreviewLosaPx(
          puntos && puntos.every((punto) => punto !== null)
            ? (puntos as Array<{ x: number; y: number }>)
            : null,
        );
      } else {
        setPreviewLosaPx(null);
      }
      const desplazamiento = nuevo - arrLosa.desfaseInicial;
      const medioNuevo: Punto2 = [
        arrLosa.medio[0] + arrLosa.normal[0] * desplazamiento,
        arrLosa.medio[1] + arrLosa.normal[1] * desplazamiento,
      ];
      const antes = pantallaDePunto([arrLosa.medio[0], arrLosa.medio[1], z]);
      const despues = pantallaDePunto([medioNuevo[0], medioNuevo[1], z]);
      if (antes && despues) {
        const signo = nuevo > 0 ? "+" : "";
        // Dos decimales como en la cota de Revit («+0.20»); solo se añade el
        // tercero cuando el paso de 0.005 m lo necesita.
        const decimales =
          Math.abs(Math.round(nuevo * 1000) % 10) < 1e-9 ? 2 : 3;
        setGuiaArrastre({
          x1: antes.x - rect.left,
          y1: antes.y - rect.top,
          x2: despues.x - rect.left,
          y2: despues.y - rect.top,
          texto: `${signo}${nuevo.toFixed(decimales)} m`,
          enganchado: true,
        });
      }
      evento.preventDefault();
      return;
    }
    // O014b: la cabeza de nivel sigue al puntero en vertical.
    const arrNivel = arrastreNivel.current;
    if (arrNivel) {
      // Umbral de 3 px: un clic sobre la cabeza no la mueve ni le crea codo.
      if (!arrNivel.movido) {
        const recorrido = Math.hypot(
          evento.clientX - arrNivel.pantallaInicio.x,
          evento.clientY - arrNivel.pantallaInicio.y,
        );
        if (recorrido < 3) return;
      }
      const punto = puntoVistaDesdeEvento(evento.clientX, evento.clientY);
      if (punto) {
        arrNivel.movido = true;
        // Suma lo que se movió el puntero al desplazamiento que tenía (no salta
        // a donde se pulsó) y se engancha de vuelta sobre su línea.
        const { valor: desplazamiento, enganchado } =
          desplazamientoArrastreNivel(
            arrNivel.desplazamientoInicial,
            arrNivel.inicio[1],
            punto[1],
            8 * mundoPorPxRef.current,
            evento.shiftKey,
          );
        arrNivel.desplazamiento = desplazamiento;
        setAjustesNivelEnCurso({
          [arrNivel.globalid]: { desplazamiento },
        });
        const rect = nodo.getBoundingClientRect();
        const py = evento.clientY - rect.top;
        setGuiaArrastre({
          x1: 0,
          y1: py,
          x2: rect.width,
          y2: py,
          texto: `${desplazamiento.toFixed(3)} m`,
          enganchado,
        });
        evento.preventDefault();
        return;
      }
    }
    // O027: movimiento restringido de un extremo, globo o codo de eje.
    const arrEje = arrastreEje.current;
    if (arrEje) {
      const ctx = contextoEje.current;
      if (!ctx) return;
      // Umbral de 3 px: un clic no inicia el arrastre ni crea codos.
      if (!arrEje.movido) {
        const recorrido = Math.hypot(
          evento.clientX - arrEje.pantallaInicio.x,
          evento.clientY - arrEje.pantallaInicio.y,
        );
        if (recorrido < 3) return;
        arrEje.movido = true;
        if (arrEje.tipo === "codo-nuevo" && !arrEje.codoCreado) {
          const inicial: Record<string, AjusteEjeVista> = JSON.parse(
            JSON.stringify(arrEje.originales),
          );
          prepararCodoArrastre(
            {
              globalid: arrEje.globalid,
              etiqueta: arrEje.etiqueta,
              lado: arrEje.lado,
              tipo: "codo-nuevo",
              indice: null,
              punto: [0, 0, 0],
            },
            ctx,
            inicial,
          );
          arrEje.originales = inicial;
          arrEje.codoCreado = true;
          // O042: el codo ya tiene sus dos nodos; el arrastre sigue sobre V2.
          const creado = inicial[arrEje.globalid];
          const codosCreados =
            (arrEje.lado === "inicio"
              ? creado?.codosInicio
              : creado?.codosFin) ?? [];
          if (codosCreados.length >= 2) {
            arrEje.tipo = "codo";
            arrEje.indice = 1;
            arrEje.asaInicio = [codosCreados[1][0], codosCreados[1][1]];
            arrEje.modoCodo = null;
          }
          const conCodo = { ...(ajusteEnCursoRef.current ?? {}), ...inicial };
          ajusteEnCursoRef.current = conCodo;
          setAjusteEnCurso(conCodo);
        }
      }
      const punto = puntoVistaDesdeEvento(evento.clientX, evento.clientY);
      if (!punto) return;
      const direccion: DireccionEjeArrastre =
        arrEje.familia === "horizontal" ? "horizontal" : "vertical";
      const ajusteEje =
        normalizarAjusteEje(
          (ajusteEnCursoRef.current ?? arrEje.originales)[arrEje.globalid] ??
            arrEje.originales[arrEje.globalid],
        ) ?? {};
      const codosLado =
        (arrEje.lado === "inicio"
          ? ajusteEje.codosInicio
          : ajusteEje.codosFin) ?? [];
      let tipoAsa: TipoAsaArrastre;
      if (arrEje.tipo === "base") tipoAsa = "extremo";
      else if (arrEje.tipo === "codo") tipoAsa = "codo";
      else tipoAsa = codosLado.length > 0 ? "globo" : "extremo";

      // O044: V1 solo se mueve a lo largo del eje; V2 en X o en Y. La dirección
      // de V2 se elige con el componente mayor de los primeros 4 px y queda fija
      // hasta soltar; el siguiente arrastre puede usar la otra.
      let modoCodo = arrEje.modoCodo;
      let destino: Punto2;
      if (arrEje.tipo === "codo" && arrEje.indice !== null) {
        const paso = mmPapelAMetros(1, vista.escala);
        const v1 = (codosLado[0] ?? arrEje.asaInicio) as Punto2;
        const v2 = (codosLado[1] ?? arrEje.asaInicio) as Punto2;
        if (arrEje.indice === 0) {
          const r = destinoArrastreCodo(
            v1,
            v2,
            arrEje.inicio,
            punto,
            direccion,
            0,
            "eje",
            paso,
          );
          destino = r.punto;
        } else {
          if (!modoCodo) {
            const recorrido = Math.hypot(
              evento.clientX - arrEje.pantallaInicio.x,
              evento.clientY - arrEje.pantallaInicio.y,
            );
            if (recorrido < 4) return;
            const deltaMundo: Punto2 = [
              punto[0] - arrEje.inicio[0],
              punto[1] - arrEje.inicio[1],
            ];
            modoCodo =
              Math.abs(deltaMundo[0]) >= Math.abs(deltaMundo[1]) ? "x" : "y";
            arrEje.modoCodo = modoCodo;
          }
          const r = destinoArrastreCodo(
            v1,
            v2,
            arrEje.inicio,
            punto,
            direccion,
            1,
            modoCodo,
            paso,
          );
          destino = r.punto;
        }
      } else {
        // El destino parte del asa, no del puntero: pulsar fuera del centro ya no
        // hace saltar el punto ni lo saca de su línea de restricción.
        destino = destinoArrastreAsa(
          arrEje.asaInicio,
          arrEje.inicio,
          punto,
          tipoAsa,
          direccion,
          evento.shiftKey,
        );
      }

      // Imanes: extremos a la alineación de los demás ejes (o a los niveles en
      // alzado); globos desplazados a múltiplos de un diámetro.
      let enganchado = false;
      const tolerancia = 8 * mundoPorPxRef.current;
      if (!evento.shiftKey && tipoAsa === "globo") {
        const perp = direccion === "vertical" ? 0 : 1;
        const iman = imanMultiplo(
          destino[perp],
          arrEje.asaInicio[perp],
          altoBurbujaRef.current,
          tolerancia,
        );
        if (iman.enganchado) {
          destino[perp] = iman.valor;
          enganchado = true;
        }
      } else if (!evento.shiftKey && tipoAsa === "extremo") {
        const along = direccion === "vertical" ? 1 : 0;
        const candidatos: number[] = [];
        if (ctx.tipo === "planta") {
          for (const otro of referencias.ejes) {
            if (otro.globalid === arrEje.globalid) continue;
            if (otro.vertical !== (direccion === "vertical")) continue;
            const b = ctx.bases[otro.globalid];
            if (!b) continue;
            for (const lado of ["inicio", "fin"] as const) {
              candidatos.push(
                extremoEje(
                  arrEje.originales[otro.globalid],
                  lado,
                  b.inicio,
                  b.fin,
                )[along],
              );
            }
          }
        } else {
          for (const nivel of niveles) candidatos.push(nivel.elevacion);
        }
        const iman = imanAlineacion(destino[along], candidatos, tolerancia);
        if (iman.enganchado) {
          destino[along] = iman.valor;
          enganchado = true;
        }
      }

      // Cota temporal y línea guía mientras se arrastra.
      const rect = nodo.getBoundingClientRect();
      const distancia = Math.hypot(
        destino[0] - arrEje.asaInicio[0],
        destino[1] - arrEje.asaInicio[1],
      );
      const guiaVertical =
        arrEje.tipo === "codo" && modoCodo
          ? modoCodo === "eje"
            ? direccion === "vertical"
            : modoCodo === "y"
          : tipoAsa === "globo"
            ? direccion === "vertical"
            : direccion === "horizontal";
      const px = evento.clientX - rect.left;
      const py = evento.clientY - rect.top;
      setGuiaArrastre({
        x1: guiaVertical ? px : 0,
        y1: guiaVertical ? 0 : py,
        x2: guiaVertical ? px : rect.width,
        y2: guiaVertical ? rect.height : py,
        texto: `${distancia.toFixed(3)} m`,
        enganchado,
      });

      const cambios: Record<string, AjusteEjeVista> = {
        ...(ajusteEnCursoRef.current ?? {}),
      };
      if (arrEje.indice !== null) {
        const actual =
          normalizarAjusteEje(
            cambios[arrEje.globalid] ?? arrEje.originales[arrEje.globalid],
          ) ?? {};
        const clave = arrEje.lado === "inicio" ? "codosInicio" : "codosFin";
        const codos = [...(actual[clave] ?? [])];
        codos[arrEje.indice] = [destino[0], destino[1]];
        // O044: los dos nodos son independientes. El globo se deriva de V2, así
        // que arrastrar V1 no mueve el tramo final ni el globo.
        cambios[arrEje.globalid] = { ...actual, [clave]: codos };
      } else {
        // O021: candado cerrado = arrastra la alineación común de los ejes
        // paralelos; abierto = solo este eje. La decisión vive en una función pura.
        const siguientes = arrastrarExtremoEje(
          cambios,
          ctx.bases,
          referencias.ejes,
          arrEje.globalid,
          arrEje.lado,
          [destino[0], destino[1]],
          arrEje.candado,
          arrEje.familia,
        );
        Object.assign(cambios, siguientes);
      }
      ajusteEnCursoRef.current = cambios;
      setAjusteEnCurso(cambios);
      evento.preventDefault();
      return;
    }
    // O027: resaltado y cursor de la dirección permitida al pasar por un asa.
    if (!arrastre.current?.paneable && !arrastreEje.current) {
      const asaHover = asaEjeEn(evento.clientX, evento.clientY);
      for (const objeto of grupo.current?.children ?? []) {
        const datos = objeto.userData?.asaEje as
          | {
              globalid: string;
              lado: LadoEje;
              tipo: string;
              indice: number | null;
            }
          | undefined;
        if (!datos) continue;
        const material = (objeto as unknown as THREE.Points).material as
          THREE.PointsMaterial | undefined;
        if (!material) continue;
        const activa =
          !!asaHover &&
          datos.globalid === asaHover.globalid &&
          datos.lado === asaHover.lado &&
          datos.tipo === asaHover.tipo &&
          datos.indice === asaHover.indice;
        objeto.visible =
          activa ||
          ejeSeleccionadoRef.current === null ||
          datos.globalid === ejeSeleccionadoRef.current;
        material.color.set(
          activa
            ? "#38bdf8"
            : datos.globalid === ejeSeleccionadoRef.current
              ? "#f59e0b"
              : "#94a3b8",
        );
        material.size =
          datos.tipo === "codo" ? (activa ? 6 : 5) : activa ? 16 : 12;
      }
      if (asaHover) {
        const ctxHover = contextoEje.current;
        const ejeHover = referencias.ejes.find(
          (e) => e.globalid === asaHover.globalid,
        );
        const vertical =
          ctxHover?.tipo === "planta" ? !!ejeHover?.vertical : true;
        if (asaHover.tipo === "codo") {
          const pAsa = pantallaDePunto(asaHover.punto);
          if (pAsa) {
            const rectHover = nodo.getBoundingClientRect();
            setGuiaCodo({
              x: pAsa.x - rectHover.left,
              y: pAsa.y - rectHover.top,
              vertical,
              ambos: asaHover.indice === 1,
            });
          }
        } else {
          setGuiaCodo(null);
        }
        const ajusteHover = ajusteActualEje(asaHover.globalid);
        const codosHover =
          (asaHover.lado === "inicio"
            ? ajusteHover?.codosInicio
            : ajusteHover?.codosFin) ?? [];
        const tipoHover =
          asaHover.tipo === "base"
            ? "extremo"
            : asaHover.tipo === "codo"
              ? "codo"
              : codosHover.length > 0
                ? "globo"
                : "extremo";
        const mueveVertical = tipoHover === "globo" ? !vertical : vertical;
        nodo.style.cursor = mueveVertical ? "ns-resize" : "ew-resize";
        nodo.dataset.asaResaltada = `${asaHover.etiqueta}/${asaHover.lado}/${asaHover.tipo}`;
        nodo.dataset.asaCursor = mueveVertical ? "vertical" : "horizontal";
      } else {
        nodo.dataset.asaCursor = "";
        nodo.dataset.asaResaltada = "";
        setGuiaCodo(null);
        if (!herramienta && !modoCorte) nodo.style.cursor = "";
      }
    }
    if (evento.pointerType === "touch" && gesto.toques.has(evento.pointerId)) {
      evento.preventDefault();
      const anterior = gesto.toques.get(evento.pointerId)!;
      gesto.toques.set(evento.pointerId, {
        x: evento.clientX,
        y: evento.clientY,
      });
      if (gesto.toques.size >= 2) {
        const [a, b] = [...gesto.toques.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        if (gesto.pinza && dist > 1) {
          zoomEnPantalla(gesto.pinza.dist / dist, cx, cy);
          panearPixeles(cx - gesto.pinza.cx, cy - gesto.pinza.cy);
        }
        gesto.pinza = { dist, cx, cy };
      } else {
        panearPixeles(evento.clientX - anterior.x, evento.clientY - anterior.y);
        if (
          gesto.toqueInicial &&
          Math.hypot(
            evento.clientX - gesto.toqueInicial.x,
            evento.clientY - gesto.toqueInicial.y,
          ) > 4
        ) {
          gesto.toqueInicial.movido = true;
        }
      }
      aplicarCamara();
      return;
    }
    if (
      herramienta === "empujar" &&
      (vista.tipo === "iso" || vista.tipo === "perspectiva") &&
      evento.buttons === 0 &&
      !arrastre.current?.paneable
    ) {
      if (empujarCara) {
        const rayo = rayoPantalla(evento.clientX, evento.clientY);
        if (!rayo) return;
        const rayo3 = {
          origen: { x: rayo.origen[0], y: rayo.origen[1], z: rayo.origen[2] },
          direccion: {
            x: rayo.direccion[0],
            y: rayo.direccion[1],
            z: rayo.direccion[2],
          },
        };
        const normal = {
          x: empujarCara.normal[0],
          y: empujarCara.normal[1],
          z: empujarCara.normal[2],
        };
        const puntoCara = {
          x: empujarCara.punto[0],
          y: empujarCara.punto[1],
          z: empujarCara.punto[2],
        };
        const inf = inferir({
          rayo: rayo3,
          proyectar: proyectarLienzo,
          candidatos: candidatosSin(
            empujarCara.globalid,
            evento.clientX,
            evento.clientY,
          ),
          planoTrabajo: { punto: puntoCara, normal },
        });
        anotarInferenciaEmpujar(inf);
        let distancia: number | null;
        if (inf.punto && inf.tipo && inf.tipo !== "plano") {
          distancia =
            (inf.punto.x - puntoCara.x) * normal.x +
            (inf.punto.y - puntoCara.y) * normal.y +
            (inf.punto.z - puntoCara.z) * normal.z;
        } else {
          distancia = distanciaSobreNormal(rayo3, puntoCara, normal);
        }
        if (distancia !== null) {
          moverEmpujarCara(Math.round(distancia * 1e6) / 1e6);
        }
        return;
      }
      if (empujarRect) {
        setMarcadorEmpujar(null);
        setGuiaEmpujar(null);
        ultimaInferenciaEmpujar.current = null;
        const centro: [number, number, number] = [
          (empujarRect.x1 + empujarRect.x2) / 2,
          (empujarRect.y1 + empujarRect.y2) / 2,
          empujarZ ?? zEmpujar,
        ];
        const rayo = rayoPantalla(evento.clientX, evento.clientY);
        const altura = rayo ? alturaEnEjeVertical(rayo, centro) : null;
        if (altura !== null) {
          // Cerca del plano se toma como altura cero: evita sólidos de micras.
          fijarAlturaEmpujar(Math.abs(altura) < 0.005 ? 0 : altura);
        }
        return;
      }
      const caraHover = caraBajoCursor(evento.clientX, evento.clientY);
      if (caraHover) {
        const rect = nodo.getBoundingClientRect();
        setCaraEmpujarHover({
          ...caraHover,
          x: evento.clientX - rect.left,
          y: evento.clientY - rect.top,
          tooltipIzquierda: evento.clientX - rect.left > rect.width * 0.7,
        });
      } else {
        setCaraEmpujarHover(null);
      }
      const res = inferenciaEmpujarEn(
        evento.clientX,
        evento.clientY,
        evento.shiftKey,
      );
      // Los enganches (vértice, arista, punto medio, cara) mandan sobre la
      // cara que haya debajo: así O049 sigue enganchando bordes de una losa
      // aunque el rayo roce su cara lateral.
      if (res && res.punto && res.inf.tipo && res.inf.tipo !== "plano") {
        moverEmpujar([res.punto.x, res.punto.y]);
        return;
      }
      if (caraHover) return;
      if (res && res.punto) {
        moverEmpujar([res.punto.x, res.punto.y]);
        return;
      }
    }
    if (
      herramienta === "nivel" &&
      (vista.tipo === "alzado" || vista.tipo === "corte")
    ) {
      const punto = puntoVistaDesdeEvento(evento.clientX, evento.clientY);
      if (punto) fijarRaton(punto, evento.shiftKey, metrosPorPixelActual());
    } else if (herramienta && vista.tipo === "planta") {
      const punto = puntoPlanta(evento);
      if (punto) fijarRaton(punto, evento.shiftKey, metrosPorPixelActual());
    }
    const arr = arrastre.current;
    if (!arr) return;
    const dx = evento.clientX - arr.x;
    const dy = evento.clientY - arr.y;
    if (
      Math.abs(evento.clientX - arr.inicioX) +
        Math.abs(evento.clientY - arr.inicioY) >
      4
    ) {
      arr.movido = true;
    }
    arr.x = evento.clientX;
    arr.y = evento.clientY;
    if (!arr.paneable) {
      if (arr.movido && arr.boton === 0 && !herramienta) {
        const marco = nodo.getBoundingClientRect();
        setVentanaSeleccion({
          x1: arr.inicioX,
          y1: arr.inicioY,
          x2: evento.clientX,
          y2: evento.clientY,
          ox: marco.left,
          oy: marco.top,
        });
      }
      return;
    }
    // O020: la acción se decidió al pulsar (órbita o paneo), no por el botón.
    const panear = arr.accion === "panear";
    const alto = Math.max(nodo.clientHeight, 1);
    if (panear) {
      const derecha = new THREE.Vector3().setFromMatrixColumn(
        camera.matrixWorld,
        0,
      );
      const arriba = new THREE.Vector3().setFromMatrixColumn(
        camera.matrixWorld,
        1,
      );
      let escala = 1;
      if (camera instanceof THREE.OrthographicCamera) {
        escala = (camera.top - camera.bottom) / alto;
      } else if (camera instanceof THREE.PerspectiveCamera) {
        escala =
          (2 * nav.distancia * Math.tan((camera.fov * Math.PI) / 360)) / alto;
      }
      const desplazamiento = derecha
        .multiplyScalar(-dx * escala)
        .add(arriba.multiplyScalar(dy * escala));
      nav.objetivo.add(desplazamiento);
    } else {
      // Órbita: giro alrededor del objetivo.
      const yaw = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, 1),
        -dx * 0.006,
      );
      nav.direccion.applyQuaternion(yaw);
      const derecha = new THREE.Vector3()
        .crossVectors(ARRIBA, nav.direccion)
        .normalize();
      const pitch = new THREE.Quaternion().setFromAxisAngle(
        derecha,
        -dy * 0.006,
      );
      nav.direccion.applyQuaternion(pitch).normalize();
      if (nav.direccion.z < 0.05) {
        nav.direccion.z = 0.05;
        nav.direccion.normalize();
      }
    }
    aplicarCamara();
  };
  return alMover;
}
