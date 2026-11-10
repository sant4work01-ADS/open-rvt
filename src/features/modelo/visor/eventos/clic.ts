import * as THREE from "three";
import { type AjusteEjeVista } from "../../tipos";
import { useModelo } from "../../estado";
import { type Punto2 } from "../../herramientas";
import { caraEnPunto, rectaDeEje, rectaDeMalla } from "../../alinear";
import { type AccionEmpujarCara } from "../../empujarCaras";
import { caraSuperiorEn } from "../../candidatos3d";
import { agregarCodoEje, geometriaEje, mmPapelAMetros } from "../../ejesVista";
import type { EntornoVisor } from "./contexto";
import type { crearAyudas } from "./ayudas";

export function crearAccionesClic(
  entorno: EntornoVisor,
  nodo: HTMLElement,
  ayudas: ReturnType<typeof crearAyudas>,
) {
  const {
    abrirEditorCota,
    aplicarAlinear,
    asaEjeEn,
    camara,
    clicEmpujar,
    clicEnPlanta,
    clicNivel,
    clicRecorte,
    confirmarEmpujar,
    confirmarEmpujarCara,
    cotaEn,
    crucesDeEjeVista,
    elegirReferenciaAlinear,
    empujarCara,
    empujarRect,
    fijarNivelSeleccionado,
    herramienta,
    iniciarEmpujarCara,
    lineaEjeEn,
    lineaNivelEn,
    meshes,
    metrosPorPixelActual,
    puntoVistaDesdeEvento,
    referenciaAlinear,
    referencias,
    setCandados,
    setCaraEmpujarHover,
    setEjeSeleccionado,
    setMenuEje,
    vista,
    caja,
    modoCorte,
    onSeleccionar,
    onPuntoCorte,
    elementosBloqueados,
  } = entorno;
  const { puntoPlanta, inferenciaEmpujarEn, caraBajoCursor } = ayudas;
  const hacerClic = (
    clientX: number,
    clientY: number,
    shift: boolean,
    agregar: boolean,
    soloSeleccion = false,
  ) => {
    const camera = camara.current;
    if (!camera) return;
    const falso = { clientX, clientY } as PointerEvent;
    // O051: con «Orbitar» activo, un clic sin arrastre solo selecciona; no debe
    // disparar la herramienta Empujar/Tirar ni ninguna otra.
    if (soloSeleccion) {
      setEjeSeleccionado(null);
      const rect = nodo.getBoundingClientRect();
      const raton = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      const rayo = new THREE.Raycaster();
      rayo.setFromCamera(raton, camera);
      const impacto = rayo.intersectObjects(meshes.current, false)[0];
      const gidTocado = impacto?.object.userData.globalid ?? null;
      if (gidTocado && elementosBloqueados.includes(gidTocado)) {
        onSeleccionar(null, agregar);
        return;
      }
      onSeleccionar(gidTocado, agregar);
      return;
    }
    if (herramienta === "alinear") {
      // O026: primer clic en la referencia; el segundo en la cara a mover.
      const rectAlinear = nodo.getBoundingClientRect();
      const ratonAlinear = new THREE.Vector2(
        ((clientX - rectAlinear.left) / rectAlinear.width) * 2 - 1,
        -((clientY - rectAlinear.top) / rectAlinear.height) * 2 + 1,
      );
      const rayoAlinear = new THREE.Raycaster();
      rayoAlinear.setFromCamera(ratonAlinear, camera);
      const linea = lineaEjeEn(clientX, clientY);
      if (linea) {
        elegirReferenciaAlinear({ tipo: "eje", globalid: linea });
        return;
      }
      const impactoAlinear = rayoAlinear.intersectObjects(
        meshes.current,
        false,
      )[0];
      const gidAlinear = impactoAlinear?.object.userData.globalid as
        string | undefined;
      if (!gidAlinear) return;
      const mallaAlinear = useModelo
        .getState()
        .mallas.find((m) => m.globalid === gidAlinear);
      if (!mallaAlinear) return;
      const puntoAlinear: Punto2 =
        vista.tipo === "planta"
          ? (puntoPlanta(falso) ?? [
              impactoAlinear.point.x,
              impactoAlinear.point.y,
            ])
          : [impactoAlinear.point.x, impactoAlinear.point.y];
      const referencia = referenciaAlinear;
      if (!referencia) {
        const recta = rectaDeMalla(mallaAlinear);
        elegirReferenciaAlinear({
          tipo: "elemento",
          globalid: gidAlinear,
          cara: recta ? caraEnPunto(recta, puntoAlinear) : "centro",
        });
        return;
      }
      if (referencia.tipo === "nivel") {
        let zMin = Infinity;
        let zMax = -Infinity;
        for (let i = 2; i < mallaAlinear.vertices.length; i += 3) {
          const z = mallaAlinear.vertices[i];
          if (z < zMin) zMin = z;
          if (z > zMax) zMax = z;
        }
        const caraNivel =
          impactoAlinear.point.z > (zMin + zMax) / 2 ? "tope" : "base";
        void aplicarAlinear(gidAlinear, caraNivel, puntoAlinear);
        return;
      }
      let direccion: { ux: number; uy: number } | undefined;
      if (referencia.tipo === "eje") {
        const eje = referencias.ejes.find(
          (e) => e.globalid === referencia.globalid,
        );
        if (eje) {
          const recta = rectaDeEje(eje);
          direccion = { ux: recta.ux, uy: recta.uy };
        }
      } else if (referencia.tipo === "elemento") {
        const mallaRef = useModelo
          .getState()
          .mallas.find((m) => m.globalid === referencia.globalid);
        const recta = mallaRef ? rectaDeMalla(mallaRef) : null;
        if (recta) direccion = { ux: recta.ux, uy: recta.uy };
      } else {
        direccion = { ux: 1, uy: 0 };
      }
      const recta = rectaDeMalla(mallaAlinear, direccion);
      // Si se toca la cara del lado positivo, el centro queda del lado negativo
      // de la referencia (y al revés): el núcleo recibe la cara que coincide.
      const cara = recta
        ? caraEnPunto(recta, puntoAlinear) === "cara1"
          ? "cara2"
          : "cara1"
        : "cercana";
      void aplicarAlinear(gidAlinear, cara, puntoAlinear);
      return;
    }
    if (
      herramienta === "empujar" &&
      (vista.tipo === "iso" || vista.tipo === "perspectiva")
    ) {
      if (empujarCara) {
        void confirmarEmpujarCara();
        return;
      }
      if (empujarRect) {
        void confirmarEmpujar();
        return;
      }
      const caraHover = caraBajoCursor(clientX, clientY);
      const res = inferenciaEmpujarEn(clientX, clientY, shift);
      // O056: una cara que se puede empujar manda sobre las inferencias; el
      // enganche se usa después, al mover el ratón, para fijar la distancia.
      // Excepción: en una cara vertical, un enganche a su borde superior
      // (O049: el punto medio del borde de una losa) sigue dibujando sobre
      // la superficie de arriba en vez de empujar el canto.
      if (caraHover && caraHover.clasificacion.accion !== "ninguna") {
        const vertical = Math.abs(caraHover.normal[2]) < 0.5;
        const zMax = Math.max(...caraHover.poligono.map((p) => p.z));
        const engancheArriba =
          vertical &&
          !!res &&
          !!res.punto &&
          !!res.inf.tipo &&
          res.inf.tipo !== "plano" &&
          res.punto.z >= zMax - 1e-6;
        if (!engancheArriba) {
          setCaraEmpujarHover(null);
          iniciarEmpujarCara({
            globalid: caraHover.globalid,
            normal: caraHover.normal,
            punto: caraHover.punto,
            accion: caraHover.clasificacion.accion as Exclude<
              AccionEmpujarCara,
              "ninguna"
            >,
            etiqueta: caraHover.clasificacion.etiqueta,
            poligono: caraHover.poligono,
          });
          return;
        }
      }
      setCaraEmpujarHover(null);
      if (!res || !res.punto) return;
      // O049: si el primer punto cae sobre una cara superior, el contorno se
      // dibuja en su plano y el sólido nace con ese desfase.
      const cara = caraSuperiorEn(res.punto, res.candidatos.caras ?? []);
      // La cota sale del punto ya redondeado (no del vértice float32 de la
      // malla) para que el desfase guardado sea 0.12 y no 0.119999997.
      void clicEmpujar(
        [res.punto.x, res.punto.y],
        cara ? res.punto.z : undefined,
      );
      return;
    }
    if (
      herramienta === "nivel" &&
      (vista.tipo === "alzado" || vista.tipo === "corte")
    ) {
      const punto = puntoVistaDesdeEvento(clientX, clientY);
      if (punto) void clicNivel(punto);
      return;
    }
    if (herramienta === "recortar_extender" && vista.tipo === "planta") {
      const punto = puntoPlanta(falso);
      if (!punto) return;
      const estado = useModelo.getState();
      const pendiente =
        estado.modoRecorte === "esquina"
          ? !estado.recorteInicial
          : !estado.referenciaRecorte;
      let objetivo: { tipo: "eje" | "elemento"; globalid: string } | null =
        null;
      if (pendiente && estado.modoRecorte !== "esquina") {
        const linea = lineaEjeEn(clientX, clientY);
        if (linea) objetivo = { tipo: "eje", globalid: linea };
      }
      if (!objetivo) {
        const rect = nodo.getBoundingClientRect();
        const raton = new THREE.Vector2(
          ((clientX - rect.left) / rect.width) * 2 - 1,
          -((clientY - rect.top) / rect.height) * 2 + 1,
        );
        const rayo = new THREE.Raycaster();
        rayo.setFromCamera(raton, camera);
        const impacto = rayo.intersectObjects(meshes.current, false)[0];
        const gid = impacto?.object.userData.globalid as string | undefined;
        if (gid) objetivo = { tipo: "elemento", globalid: gid };
      }
      if (objetivo) void clicRecorte({ ...objetivo, punto });
      return;
    }
    if (herramienta && vista.tipo === "planta") {
      const punto = puntoPlanta(falso);
      if (punto) {
        void clicEnPlanta(punto, shift, agregar, metrosPorPixelActual());
      }
      return;
    }
    const rect = nodo.getBoundingClientRect();
    const raton = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const rayo = new THREE.Raycaster();
    rayo.setFromCamera(raton, camera);
    if (modoCorte && vista.tipo === "planta") {
      const z = vista.alturaPlano ?? caja.max[2] + 1;
      const plano = new THREE.Plane(new THREE.Vector3(0, 0, 1), -z);
      const punto = new THREE.Vector3();
      if (rayo.ray.intersectPlane(plano, punto)) {
        onPuntoCorte([punto.x, punto.y]);
      }
      return;
    }
    // Un solo clic en el texto de una cota la edita (como en Revit).
    const cotaClic = cotaEn(clientX, clientY);
    if (cotaClic && cotaClic.tipo !== "total") {
      abrirEditorCota(cotaClic, clientX, clientY);
      return;
    }
    // O011: primero las asas y las líneas de eje; después las mallas.
    const asa = asaEjeEn(clientX, clientY);
    if (asa) {
      setEjeSeleccionado(asa.globalid);
      setCandados({ inicio: false, fin: false });
      setMenuEje(null);
      onSeleccionar(null, agregar);
      return;
    }
    const linea = lineaEjeEn(clientX, clientY);
    if (linea) {
      setEjeSeleccionado(linea);
      setCandados({ inicio: false, fin: false });
      setMenuEje(null);
      onSeleccionar(null, agregar);
      return;
    }
    // O029: elegir un nivel en el alzado para Copiar/Mover desde Modificar.
    const nivelTocado = lineaNivelEn(clientX, clientY);
    if (nivelTocado) {
      fijarNivelSeleccionado(nivelTocado);
      setEjeSeleccionado(null);
      setCandados({ inicio: false, fin: false });
      setMenuEje(null);
      onSeleccionar(null, agregar);
      return;
    }
    setEjeSeleccionado(null);
    const impacto = rayo.intersectObjects(meshes.current, false)[0];
    const gidTocado = impacto?.object.userData.globalid ?? null;
    // O038: lo bloqueado en el árbol se ve pero no se puede seleccionar.
    if (gidTocado && elementosBloqueados.includes(gidTocado)) {
      onSeleccionar(null, agregar);
      return;
    }
    onSeleccionar(gidTocado, agregar);
  };

  // O027: el codo se crea cuando el arrastre supera el umbral de 3 px, no al
  // pulsar, para que un clic normal sobre el asa no deje un codo suelto.
  const prepararCodoArrastre = (
    asa: (typeof entorno.ejesInteraccion.current)[number],
    ctx: NonNullable<typeof entorno.contextoEje.current>,
    inicial: Record<string, AjusteEjeVista>,
  ) => {
    const bases = ctx.bases[asa.globalid];
    const ajuste = inicial[asa.globalid];
    if (!bases) return;
    const g = geometriaEje(ajuste, bases.inicio, bases.fin, {
      globoInicio: true,
      diametroGlobo: mmPapelAMetros(8, vista.escala),
    });
    const globo =
      asa.lado === "inicio" ? (g.globoInicio ?? bases.inicio) : g.globoFin;
    const dx = bases.fin[0] - bases.inicio[0];
    const dy = bases.fin[1] - bases.inicio[1];
    const largo = Math.hypot(dx, dy);
    if (largo <= 1e-9) return;
    const direccion: Punto2 =
      asa.lado === "inicio"
        ? [-dx / largo, -dy / largo]
        : [dx / largo, dy / largo];
    inicial[asa.globalid] = agregarCodoEje(
      ajuste,
      asa.lado,
      globo,
      direccion,
      mmPapelAMetros(8, vista.escala),
      crucesDeEjeVista(asa.globalid),
    );
  };

  return { hacerClic, prepararCodoArrastre };
}
