/* eslint-disable react-hooks/immutability -- la escena es mutable por diseño. */
import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { agregarAristasOcultasSobreMuro } from "../../aristasSobreMuro";
import { aristasInternasUniones, aristasParaElemento, mallaConNormalesPlanas } from "../../geometria";
import { basePlano, dividirEnCapas, interseccionPlanoMalla, siluetaProyectada, type Punto2 as PuntoSeccion, type Punto3 } from "../../seccion";
import { categoriaOculta, factorEscala, grosorMm, materialPorCapa, mmAMundo, rellenoDeElemento, type MaterialNombre, type RelacionCorte } from "../../estilos";
import { categoriaVisible, dibujaSiluetaSobreCorte, elementoVisibleEnPlanta, diagonalCaja } from "../../vistas";
import { centroCorte, colorDeFondo, normalCorte, planosVista } from "../camara";
import { crearMallasCapas } from "../../capas3d";
import { crearMaterialElemento } from "../../materialElemento";
import { crearMaterialLinea, geometriaProyeccionLosa, lineaCerrada, materialProyeccionTenue, materialRelleno } from "../lineas";
import { envolventeDeMalla } from "../../candidatos3d";
import { type MuroPlanta } from "../../planta";
import type { CtxEscena } from "./contexto";

export function construirBaseEscena(ctx: CtxEscena) {
  const {
    aberturas,
    altoBurbujaRef,
    asasNivel,
    burbujasEje,
    cajaVista,
    camara,
    contenedor,
    dimensiones,
    ejesInteraccion,
    grosores,
    grupo,
    lineasEje,
    mallas,
    mallas3d,
    meshes,
    mundoPorPxRef,
    navegacion,
    nivelGlobalidPorNombre,
    oscuro,
    resaltado,
    caja,
    seleccionados,
    estilos,
    seleccion,
    vista,
    elementosOcultos,
  } = ctx;

    const inicioEfecto = performance.now();
    const grupoLocal = grupo.current;
    if (!grupoLocal) return;
    ejesInteraccion.current = [];
    lineasEje.current = [];
    asasNivel.current = [];
    burbujasEje.current = [];
    if (contenedor.current) contenedor.current.dataset.candadosAlineados = "[]";
    while (grupoLocal.children.length) {
      const hijo = grupoLocal.children.pop()!;
      hijo.traverse((objeto) => {
        const malla = objeto as THREE.Mesh;
        if (malla.geometry) malla.geometry.dispose();
        const material = malla.material;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else if (material) material.dispose();
      });
    }
    meshes.current = [];

    const { planos, relleno } = planosVista(vista, caja);
    const diseno = vista.estilo === "lineas-ocultas";
    const fondo = colorDeFondo(oscuro);
    const colorTrazo = oscuro ? "#e8eaed" : "#1f2328";
    const colorArista = new THREE.Color(colorTrazo);
    const tamano = Math.max(diagonalCaja(cajaVista), 2);
    const nivelesVisibles = new Set(vista.nivelesVisibles);
    const ocultosArbol = new Set(elementosOcultos);
    const visibles = mallas.filter((malla) => {
      if (!categoriaVisible(vista, malla.categoria)) return false;
      if (categoriaOculta(vista, malla.categoria)) return false;
      // O038: el ojo del árbol del proyecto oculta el elemento en todas las vistas.
      if (ocultosArbol.has(malla.globalid)) return false;
      // O005c: en planta puertas y ventanas se dibujan solo con su simbología 2D;
      // su marco y su hoja en 3D no deben asomar como un rectángulo fuera del muro.
      if (
        vista.tipo === "planta" &&
        (malla.clase === "IfcDoor" || malla.clase === "IfcWindow")
      ) {
        return false;
      }
      const gid = nivelGlobalidPorNombre.get(malla.nivel);
      if (vista.tipo === "planta") {
        // O043: la planta es un corte horizontal; se ve lo que cruza el plano o
        // queda dentro de la profundidad de vista, venga del nivel que venga.
        let minZ = Infinity;
        let maxZ = -Infinity;
        for (let i = 2; i < malla.vertices.length; i += 3) {
          const z = malla.vertices[i];
          if (z < minZ) minZ = z;
          if (z > maxZ) maxZ = z;
        }
        if (!elementoVisibleEnPlanta(vista, gid, minZ, maxZ)) return false;
      } else if (nivelesVisibles.size > 0 && gid && !nivelesVisibles.has(gid)) {
        return false;
      }
      return true;
    });

    // O049: la inferencia usa las mismas mallas visibles que el dibujo. La caja
    // se calcula una vez por redibujo; los candidatos se arman al acercarse.
    mallas3d.current = visibles.map((elemento) => ({
      globalid: elemento.globalid,
      malla: elemento,
      envolvente: envolventeDeMalla(elemento),
    }));

    // O012: en 3D no se dibujan las aristas que caen sobre la cara de otro
    // elemento unido del mismo material (extremos de viga contra columnas).
    const internasAristas =
      vista.tipo === "iso" || vista.tipo === "perspectiva"
        ? aristasInternasUniones(
            visibles
              .filter((elemento) =>
                ["vigas", "columnas", "muros", "otros"].includes(elemento.categoria),
              )
              .map((elemento) => ({
                globalid: elemento.globalid,
                categoria: elemento.categoria,
                vertices: elemento.vertices,
                indices: elemento.indices,
              })),
          )
        : new Set<string>();
    // O062: las aristas coplanares de losas y estructura sobre una cara del muro
    // se ocultan; si no, se cuelan por delante de la piel con el LineBasicMaterial.
    if (vista.tipo === "iso" || vista.tipo === "perspectiva") {
      agregarAristasOcultasSobreMuro(internasAristas, visibles);
    }

    // O012: en 3D las capas de acabado se dibujan como franjas con el mismo
    // contorno ingleteado/recortado que la planta.
    const murosCapas: MuroPlanta[] =
      vista.tipo === "iso" || vista.tipo === "perspectiva"
        ? visibles
            .filter(
              (elemento) => elemento.categoria === "muros" && elemento.eje,
            )
            .map((elemento) => ({
              globalid: elemento.globalid,
              eje: elemento.eje as [number, number, number, number],
              capas: elemento.capas,
            }))
        : [];

    // Grosor en píxeles: mm de papel de la tabla × escala de la vista × zoom actual.
    const camaraActual = camara.current;
    let mundoPorPx = Math.max(tamano / 900, 1e-4);
    if (camaraActual instanceof THREE.OrthographicCamera) {
      mundoPorPx = Math.max((camaraActual.top - camaraActual.bottom) / Math.max(dimensiones.alto, 1), 1e-6);
    } else if (camaraActual instanceof THREE.PerspectiveCamera) {
      const nav = navegacion.current;
      mundoPorPx = Math.max(
        (2 * (nav?.distancia ?? 10) * Math.tan((camaraActual.fov * Math.PI) / 360)) /
          Math.max(dimensiones.alto, 1),
        1e-6,
      );
    }
    mundoPorPxRef.current = mundoPorPx;
    altoBurbujaRef.current = mmAMundo(8, vista.escala);
    grosores.current = [];
    const registro = grosores.current;
    const grosorDe = (categoria: Parameters<typeof grosorMm>[2], tipo: "corte" | "proyeccion") =>
      grosorMm(estilos, vista, categoria, tipo);

    // Plano de sección exacto y origen para colocar rellenos y contornos.
    const corteZ = vista.alturaPlano ?? caja.max[2];
    let planoSeccion: { normal: Punto3; constante: number } | null = null;
    let origenSeccion: THREE.Vector3 | null = null;
    if (vista.tipo === "planta") {
      planoSeccion = { normal: [0, 0, 1], constante: -corteZ };
      origenSeccion = new THREE.Vector3(0, 0, corteZ);
    } else if (vista.tipo === "corte") {
      const [nx, ny] = normalCorte(vista);
      const origen = centroCorte(vista, caja);
      planoSeccion = {
        normal: [nx, ny, 0],
        constante: -(nx * origen.x + ny * origen.y),
      };
      origenSeccion = origen;
    }
    const desplazamientoSeccion = planoSeccion
      ? new THREE.Vector3(
          planoSeccion.normal[0] * -0.004,
          planoSeccion.normal[1] * -0.004,
          planoSeccion.normal[2] * -0.004,
        )
      : new THREE.Vector3();
    const base = planoSeccion ? basePlano(planoSeccion.normal) : null;
    const normalSeccion = planoSeccion
      ? new THREE.Vector3(...planoSeccion.normal).normalize()
      : new THREE.Vector3(0, 0, 1);

    let polilineasSeccion = 0;
    const lineasCapasPlanta = 0;
    let mallasCapas3D = 0;
    // O015: cuántos rellenos de losa se generaron (patrón de corte y proyección).
    let rellenosLosaPatron = 0;
    let rellenosLosaProyeccion = 0;

    /** Coloca un polígono de relleno en el plano de sección. */
    const agregarRelleno = (
      puntos: Punto3[],
      material: MaterialNombre,
      group: THREE.Group,
    ): void => {
      if (!base || puntos.length < 3) return;
      const origen = origenSeccion ?? new THREE.Vector3();
      const local = puntos.map(
        ([x, y, z]) =>
          new THREE.Vector2(
            (x - origen.x) * base.u[0] + (y - origen.y) * base.u[1] + (z - origen.z) * base.u[2],
            (x - origen.x) * base.v[0] + (y - origen.y) * base.v[1] + (z - origen.z) * base.v[2],
          ),
      );
      const forma = new THREE.Shape(local);
      const geometria = new THREE.ShapeGeometry(forma);
      const material2d = materialRelleno(material, estilos, colorTrazo);
      const malla = new THREE.Mesh(geometria, material2d);
      malla.matrixAutoUpdate = false;
      malla.matrix.makeBasis(
        new THREE.Vector3(...base.u),
        new THREE.Vector3(...base.v),
        normalSeccion,
      );
      malla.matrix.setPosition(origen);
      // O015: por encima de la tapa gris del stencil (1.1) para que el patrón del
      // material se vea también en «Sombreado».
      malla.renderOrder = 1.2;
      group.add(malla);
    };

    const stencilBase =
      relleno && vista.estilo === "sombreado"
        ? new THREE.MeshBasicMaterial({
            depthWrite: false,
            depthTest: false,
            colorWrite: false,
            stencilWrite: true,
            stencilFunc: THREE.AlwaysStencilFunc,
            clippingPlanes: planos,
          })
        : null;

    for (const elemento of visibles) {
      // O040: la dala de desplante queda abajo del corte y cubierta por el muro; en
      // planta no se dibuja (ni cuerpo, ni aristas, ni simbología).
      if (vista.tipo === "planta" && elemento.estructura?.alias === "dala") {
        continue;
      }
      const geometria = new THREE.BufferGeometry();
      geometria.setAttribute("position", new THREE.BufferAttribute(elemento.vertices, 3));
      geometria.setIndex(new THREE.BufferAttribute(elemento.indices, 1));
      // O010: normales planas por cara (vértices no compartidos) para que las caras
      // de un muro se vean de un tono uniforme en isométrico y en perspectiva.
      const plana = mallaConNormalesPlanas(elemento.vertices, elemento.indices);
      const geometriaSolido = new THREE.BufferGeometry();
      geometriaSolido.setAttribute("position", new THREE.BufferAttribute(plana.posiciones, 3));
      geometriaSolido.setAttribute("normal", new THREE.BufferAttribute(plana.normales, 3));

      const seleccionado =
        elemento.globalid === seleccion ||
        seleccionados.includes(elemento.globalid) ||
        elemento.globalid === resaltado;
      const opaco = elemento.opacidad >= 1;
      // O007a: en 3D el sólido lleva el color de la capa exterior del muro; si la
      // capa no trae color de biblioteca, se conserva el color de la categoría.
      const colorExterior =
        elemento.categoria === "muros" && elemento.capas.length > 0
          ? elemento.capas[0].color
          : undefined;
      const color = seleccionado
        ? new THREE.Color(0x2f7dd1)
        : new THREE.Color(colorExterior || elemento.color);

      // Cota inferior/superior del elemento para separar lo que queda arriba del corte.
      let minZ = Infinity;
      let maxZ = -Infinity;
      let minD = Infinity;
      let maxD = -Infinity;
      for (let i = 0; i < elemento.vertices.length; i += 3) {
        const x = elemento.vertices[i];
        const y = elemento.vertices[i + 1];
        const z = elemento.vertices[i + 2];
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
        if (planoSeccion) {
          const d =
            x * planoSeccion.normal[0] +
            y * planoSeccion.normal[1] +
            z * planoSeccion.normal[2];
          minD = Math.min(minD, d);
          maxD = Math.max(maxD, d);
        }
      }
      // O005b: por encima del corte solo se dibuja la silueta de losas, cubiertas y
      // vigas del mismo nivel. El resto (viguetas y elementos del piso de arriba) no
      // aparece en la planta.
      const encimaDelCorte =
        vista.tipo === "planta" && planoSeccion !== null && minZ > corteZ + 1e-4;
      const nivelDelElemento = nivelGlobalidPorNombre.get(elemento.nivel);
      const siluetaArriba =
        encimaDelCorte &&
        dibujaSiluetaSobreCorte(vista, elemento.categoria, nivelDelElemento, minZ);

      // O015: la relación con el plano de corte y el relleno salen de una regla
      // única (`rellenoDeElemento`), no de casos sueltos por categoría.
      const atraviesa =
        planoSeccion !== null &&
        minD <= -planoSeccion.constante + 1e-4 &&
        maxD >= -planoSeccion.constante - 1e-4;
      const relacion: RelacionCorte =
        vista.tipo === "planta"
          ? encimaDelCorte
            ? "arriba"
            : maxZ < corteZ - 1e-4
              ? "debajo"
              : "cortado"
          : atraviesa
            ? "cortado"
            : "arriba";
      const rellenoElemento = rellenoDeElemento(
        elemento.categoria,
        relacion,
        vista.estilo,
      );

      const material = crearMaterialElemento({
        diseno,
        seleccionado,
        color,
        fondo,
        opaco,
        opacidad: elemento.opacidad,
        planos,
        categoria: elemento.categoria,
      });
      // Lo que queda por encima del corte no se dibuja como cara: solo su silueta
      // discontinua, para que no tape la planta.
      const capas3d =
        !encimaDelCorte && murosCapas.length > 0
          ? crearMallasCapas(elemento, murosCapas, minZ, maxZ, {
              seleccionado,
              planos,
              opacidad: elemento.opacidad,
              aberturas,
            })
          : [];
      if (capas3d.length > 0) {
        // Las franjas cubren toda la sección: se sustituye el cuerpo de un solo
        // color para que no haya caras coplanares en competencia.
        for (const malla of capas3d) {
          malla.renderOrder = 0;
          grupoLocal.add(malla);
          meshes.current.push(malla);
          mallasCapas3D += 1;
        }
        material.dispose();
        geometriaSolido.dispose();
      } else if (!encimaDelCorte) {
        const malla = new THREE.Mesh(geometriaSolido, material);
        malla.userData.globalid = elemento.globalid;
        malla.renderOrder = 0;
        grupoLocal.add(malla);
        meshes.current.push(malla);
      } else {
        material.dispose();
        geometriaSolido.dispose();
      }

      const categoriaEstilo = elemento.categoria;
      // O040: el cerramiento y la dala no se dibujan como silueta genérica: el
      // cerramiento se traza con dos líneas discontinuas en la simbología y la dala
      // (abajo del corte, cubierta) no se dibuja.
      const esCerramientoODala =
        elemento.estructura?.alias === "cerramiento" ||
        elemento.estructura?.alias === "dala";
      if (diseno) {
        if (siluetaArriba && !esCerramientoODala) {
          const mm = grosorDe("arriba-corte", "proyeccion");
          const siluetas =
            mm === null ? [] : siluetaProyectada(elemento.vertices, elemento.indices);
          if (mm !== null && siluetas.length > 0) {
            const materialLinea = crearMaterialLinea({
              mm,
              escala: vista.escala,
              color: seleccionado ? "#ff8a00" : "#444",
              // Siempre trazo discontinuo largo, como pide la spec.
              patron: "discontinua-larga",
              registro,
              mundoPorPx,
              profundidad: true,
            });
            const zSilueta = corteZ + 0.04;
            for (const polilinea of siluetas) {
              const puntos = polilinea.map(([x, y]) => [x, y, zSilueta] as [number, number, number]);
              if (puntos.length < 2) continue;
              const primero = puntos[0];
              const ultimo = puntos[puntos.length - 1];
              if (Math.hypot(primero[0] - ultimo[0], primero[1] - ultimo[1]) > 1e-4) {
                puntos.push(primero);
              }
              lineaCerrada(puntos, materialLinea, 0.6, grupoLocal);
            }
          }
        } else if (!encimaDelCorte) {
          const bordes = new THREE.EdgesGeometry(geometria, 30);
          const mm = grosorDe(categoriaEstilo, "proyeccion");
          // O006e: en planta los muros se dibujan con la huella unida, no con las
          // aristas de cada cuerpo (que dejarían líneas dentro de la esquina).
          if (mm !== null && !(vista.tipo === "planta" && categoriaEstilo === "muros")) {
            const materialLinea = crearMaterialLinea({
              mm,
              escala: vista.escala,
              color: seleccionado ? "#ff8a00" : "#444",
              patron: "continua",
              registro,
              mundoPorPx,
              profundidad: true,
            });
            materialLinea.clippingPlanes = planos;
            const segmentos = new LineSegmentsGeometry().fromEdgesGeometry(bordes);
            const lineas = new LineSegments2(segmentos, materialLinea);
            lineas.computeLineDistances();
            lineas.renderOrder = 0.5;
            grupoLocal.add(lineas);
          }
          bordes.dispose();
        }
      } else if (
        // O010: en 3D (iso y perspectiva) las aristas se dibujan siempre, también en
        // «Sombreado»; antes la perspectiva se quedaba sin bordes.
        (vista.estilo !== "sombreado" ||
          vista.tipo === "iso" ||
          vista.tipo === "perspectiva") &&
        !encimaDelCorte &&
        !(vista.tipo === "planta" && categoriaEstilo === "muros")
      ) {
        const segmentos = aristasParaElemento(
          elemento.vertices,
          elemento.indices,
          internasAristas,
        );
        if (segmentos.length > 0) {
          const geometriaAristas = new THREE.BufferGeometry();
          geometriaAristas.setAttribute(
            "position",
            new THREE.BufferAttribute(segmentos, 3),
          );
          const aristas = new THREE.LineSegments(
            geometriaAristas,
            new THREE.LineBasicMaterial({
              color: seleccionado ? new THREE.Color(0xff8a00) : colorArista,
              clippingPlanes: planos,
            }),
          );
          aristas.userData.globalid = elemento.globalid;
          aristas.renderOrder = 0.5;
          grupoLocal.add(aristas);
        }
      }

      // O015: la losa que queda debajo del corte se rellena con una proyección
      // tenue sobre el plano de planta, además de su contorno de proyección.
      if (rellenoElemento === "proyeccion-tenue" && vista.tipo === "planta") {
        const geometriaProyeccion = geometriaProyeccionLosa(elemento, corteZ - 0.01);
        if (geometriaProyeccion) {
          const proyeccion = new THREE.Mesh(geometriaProyeccion, materialProyeccionTenue());
          proyeccion.userData.globalid = elemento.globalid;
          proyeccion.renderOrder = 1.05;
          grupoLocal.add(proyeccion);
          meshes.current.push(proyeccion);
          rellenosLosaProyeccion += 1;
        }
      }

      // Sección real del plano de corte con esta malla (solo si lo atraviesa).
      if (
        planoSeccion &&
        origenSeccion &&
        !encimaDelCorte &&
        atraviesa &&
        (rellenoElemento === "patron" || rellenoElemento === "patron-sombreado")
      ) {
        const polilineas = interseccionPlanoMalla(
          elemento.vertices,
          elemento.indices,
          planoSeccion,
        );
        if (polilineas.length > 0) {
          const mmCorte = grosorDe(categoriaEstilo, "corte");
          const colorCorte = seleccionado
            ? "#ff8a00"
            : estilos.categorias[categoriaEstilo].color;
          for (const polilinea of polilineas) {
            polilineasSeccion += 1;
            const puntos = polilinea.puntos.map((p) => [
              p[0] + desplazamientoSeccion.x,
              p[1] + desplazamientoSeccion.y,
              p[2] + desplazamientoSeccion.z,
            ] as [number, number, number]);
            if (puntos.length >= 2) {
              const esMuroEnPlanta = vista.tipo === "planta" && categoriaEstilo === "muros";
              if (mmCorte !== null && !esMuroEnPlanta) {
                const materialCorte = crearMaterialLinea({
                  mm: mmCorte,
                  escala: vista.escala,
                  color: colorCorte,
                  registro,
                  mundoPorPx,
                  profundidad: false,
                });
                lineaCerrada([...puntos, puntos[0]], materialCorte, 1.3, grupoLocal);
              }
              // Relleno por material: una banda por capa del IfcMaterialLayerSet.
              if (!base) continue;
              const mapa2d = polilinea.puntos.map(([x, y, z]) => {
                const dx = x - origenSeccion.x;
                const dy = y - origenSeccion.y;
                const dz = z - origenSeccion.z;
                return [
                  dx * base.u[0] + dy * base.u[1] + dz * base.u[2],
                  dx * base.v[0] + dy * base.v[1] + dz * base.v[2],
                ] as PuntoSeccion;
              });
              const capas = elemento.capas ?? [];
              const bandas =
                capas.length > 1
                  ? dividirEnCapas(mapa2d, capas)
                  : [{ puntos: mapa2d, material: elemento.tipo }];
              for (const banda of bandas) {
                const puntos3 = banda.puntos.map(([u, v]) => {
                  const dx = origenSeccion.x + base.u[0] * u + base.v[0] * v;
                  const dy = origenSeccion.y + base.u[1] * u + base.v[1] * v;
                  const dz = origenSeccion.z + base.u[2] * u + base.v[2] * v;
                  return [dx, dy, dz] as Punto3;
                });
                // O006e: en planta el relleno y el rayado del muro salen de la
                // huella unida, no de cada banda de la sección 3D.
                if (!(vista.tipo === "planta" && categoriaEstilo === "muros")) {
                  agregarRelleno(
                    puntos3,
                    materialPorCapa(banda.material),
                    grupoLocal,
                  );
                  if (categoriaEstilo === "losas") rellenosLosaPatron += 1;
                }
              }
              if (capas.length > 1 && !esMuroEnPlanta) {
                // Línea fina entre capas: contorno de cada banda con trazo de 0,1 mm.
                for (const banda of bandas) {
                  const esNucleo = elemento.capas.some(
                    (capa) => capa.funcion === "núcleo" && capa.material === banda.material,
                  );
                  const mm = (esNucleo ? 0.35 : 0.1) * factorEscala(vista.escala);
                  const materialBanda = crearMaterialLinea({
                    mm,
                    escala: vista.escala,
                    color: colorCorte,
                    registro,
                    mundoPorPx,
                    profundidad: false,
                  });
                  const puntosBanda = banda.puntos.map(([u, v]) => [
                    origenSeccion!.x + base.u[0] * u + base.v[0] * v + desplazamientoSeccion.x,
                    origenSeccion!.y + base.u[1] * u + base.v[1] * v + desplazamientoSeccion.y,
                    origenSeccion!.z + base.u[2] * u + base.v[2] * v + desplazamientoSeccion.z,
                  ] as [number, number, number]);
                  lineaCerrada(
                    [...puntosBanda, puntosBanda[0]],
                    materialBanda,
                    esNucleo ? 1.8 : 1.2,
                    grupoLocal,
                  );
                }
              }
            }
          }
        }
      }

      if (stencilBase && relleno) {
        const materialAtras = stencilBase.clone();
        materialAtras.side = THREE.BackSide;
        materialAtras.stencilFail = THREE.IncrementWrapStencilOp;
        materialAtras.stencilZFail = THREE.IncrementWrapStencilOp;
        materialAtras.stencilZPass = THREE.IncrementWrapStencilOp;
        const atras = new THREE.Mesh(geometria, materialAtras);
        atras.renderOrder = 1;
        grupoLocal.add(atras);
        const materialFrente = stencilBase.clone();
        materialFrente.side = THREE.FrontSide;
        materialFrente.stencilFail = THREE.DecrementWrapStencilOp;
        materialFrente.stencilZFail = THREE.DecrementWrapStencilOp;
        materialFrente.stencilZPass = THREE.DecrementWrapStencilOp;
        const frente = new THREE.Mesh(geometria, materialFrente);
        frente.renderOrder = 1;
        grupoLocal.add(frente);
      }
    }

    // Relleno de la sección por stencil solo en «Sombreado».
    if (relleno && vista.estilo === "sombreado" && visibles.length > 0) {
      const materialStencil = new THREE.MeshBasicMaterial({
        color: new THREE.Color(0x4a4a4a),
        side: THREE.DoubleSide,
        depthWrite: false,
        stencilWrite: true,
        stencilRef: 0,
        stencilFunc: THREE.NotEqualStencilFunc,
        stencilFail: THREE.ReplaceStencilOp,
        stencilZFail: THREE.ReplaceStencilOp,
        stencilZPass: THREE.ReplaceStencilOp,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      });
      const tapa = new THREE.Mesh(new THREE.PlaneGeometry(tamano * 2, tamano * 2), materialStencil);
      const normal = relleno.plano.normal.clone().normalize();
      tapa.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      tapa.position.copy(relleno.origen);
      tapa.renderOrder = 1.1;
      tapa.onAfterRender = (rendererLocal) => rendererLocal.clearStencil();
      grupoLocal.add(tapa);
    }

  return {
    inicioEfecto,
    grupoLocal,
    planos,
    relleno,
    diseno,
    fondo,
    colorTrazo,
    colorArista,
    tamano,
    nivelesVisibles,
    ocultosArbol,
    visibles,
    internasAristas,
    murosCapas,
    camaraActual,
    mundoPorPx,
    registro,
    grosorDe,
    corteZ,
    planoSeccion,
    origenSeccion,
    desplazamientoSeccion,
    base,
    normalSeccion,
    polilineasSeccion,
    lineasCapasPlanta,
    mallasCapas3D,
    rellenosLosaPatron,
    rellenosLosaProyeccion,
    agregarRelleno,
    stencilBase,
  };
}
