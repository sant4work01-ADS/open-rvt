"""Aberturas y rellenos de vanos."""

from __future__ import annotations

from .comun import *  # noqa: F401,F403

from ..siembra import crea_openrvt


class AberturasMixin:
    # ------------------------------------------------------------------ aberturas
    def _datos_abertura(self, vano: Any) -> dict[str, Any] | None:
        datos = self._leer_pset(vano, "OPENRVT_Abertura")
        if not datos:
            return None
        return {
            "distancia": float(datos.get("Distancia") or 0.0),
            "ancho": float(datos.get("Ancho") or 0.9),
            "alto": float(datos.get("Alto") or 2.1),
            "antepecho": float(datos.get("Antepecho") or 0.0),
            "muro": str(datos.get("Muro") or ""),
            "volteado": bool(datos.get("Volteado") or False),
        }

    def _aberturas_del_muro(self, muro: Any, excluir: Any = None) -> list[tuple[Any, dict[str, Any]]]:
        salida = []
        for rel in getattr(muro, "HasOpenings", ()) or ():
            vano = getattr(rel, "RelatedOpeningElement", None)
            if vano is None or vano == excluir:
                continue
            datos = self._datos_abertura(vano)
            if datos is not None:
                salida.append((vano, datos))
        return salida

    def _matriz_hueco(self, muro: Any, distancia: float, antepecho: float) -> np.ndarray:
        datos = self._datos_muro(muro)
        matriz = np.array(
            [
                [datos["dx"], -datos["dy"], 0.0, datos["x1"] + datos["dx"] * distancia],
                [datos["dy"], datos["dx"], 0.0, datos["y1"] + datos["dy"] * distancia],
                [0.0, 0.0, 1.0, datos["z"] + antepecho],
                [0.0, 0.0, 0.0, 1.0],
            ]
        )
        return matriz

    def _cuerpo_relleno(
        self,
        ancho: float,
        alto: float,
        profundidad: float,
        clase: str,
        volteado: bool,
        desfase: float = 0.0,
    ) -> Any:
        """Marco de cuatro barras y hoja (puerta) o vidrio (ventana).

        O005c: `desfase` centra el marco en el cuerpo del muro. Con alineación
        «interior» o «exterior» el cuerpo no está sobre el eje, y antes el marco se
        quedaba en el eje: en planta asomaba un rectángulo fuera del muro.
        """
        barra = min(0.06, ancho / 6.0, alto / 6.0)
        # Cada caja: (x0, z0, ancho, alto, media profundidad).
        cajas = [
            (0.0, 0.0, ancho, barra, profundidad / 2.0),
            (0.0, alto - barra, ancho, barra, profundidad / 2.0),
            (0.0, barra, barra, alto - 2 * barra, profundidad / 2.0),
            (ancho - barra, barra, barra, alto - 2 * barra, profundidad / 2.0),
        ]
        if clase == "IfcWindow":
            cajas.append((barra, barra, ancho - 2 * barra, alto - 2 * barra, 0.006))
        else:
            cajas.append(
                (
                    barra,
                    barra,
                    ancho - 2 * barra,
                    alto - 2 * barra,
                    min(0.025, profundidad / 3.0),
                )
            )
        vertices: list[list[float]] = []
        caras: list[list[int]] = []
        for indice, (x0, z0, w, h, t) in enumerate(cajas):
            # La hoja de la puerta se desplaza a un lado u otro del marco: así se ve
            # el lado de abatimiento que elige el usuario con Espacio.
            desplazamiento = 0.0
            if indice == 4 and clase == "IfcDoor":
                desplazamiento = 0.03 if volteado else -0.03
            base = len(vertices)
            vertices.extend(
                [
                    [x0, -t + desplazamiento + desfase, z0],
                    [x0 + w, -t + desplazamiento + desfase, z0],
                    [x0 + w, t + desplazamiento + desfase, z0],
                    [x0, t + desplazamiento + desfase, z0],
                    [x0, -t + desplazamiento + desfase, z0 + h],
                    [x0 + w, -t + desplazamiento + desfase, z0 + h],
                    [x0 + w, t + desplazamiento + desfase, z0 + h],
                    [x0, t + desplazamiento + desfase, z0 + h],
                ]
            )
            caras.extend(
                [
                    [base, base + 3, base + 2, base + 1],
                    [base + 4, base + 5, base + 6, base + 7],
                    [base, base + 1, base + 5, base + 4],
                    [base + 1, base + 2, base + 6, base + 5],
                    [base + 2, base + 3, base + 7, base + 6],
                    [base + 3, base, base + 4, base + 7],
                ]
            )
        rep = geometry_api.add_mesh_representation(
            self.modelo, context=self._contexto(), vertices=[vertices], faces=[caras]
        )
        rep.RepresentationIdentifier = "Body"
        return rep

    def _regenerar_relleno(self, relleno: Any, vano: Any) -> None:
        datos = self._datos_abertura(vano)
        if datos is None:
            return
        muro = self._entidad_por_gid(datos["muro"], ("IfcWall",)) if datos["muro"] else None
        espesor = self._datos_muro(muro)["espesor"] if muro is not None else 0.15
        # O005c: centro del cuerpo del muro en el eje local Y, para que el marco no
        # sobresalga cuando la alineación es interior o exterior.
        desfase = (
            self._desfase_de_muro(muro, espesor) + espesor / 2.0
            if muro is not None
            else 0.0
        )
        if relleno.is_a("IfcDoor"):
            cuerpo = self._cuerpo_relleno(
                datos["ancho"],
                datos["alto"],
                espesor,
                "IfcDoor",
                datos["volteado"],
                desfase,
            )
        else:
            cuerpo = self._cuerpo_relleno(
                datos["ancho"],
                datos["alto"],
                espesor,
                "IfcWindow",
                datos["volteado"],
                desfase,
            )
        self._quitar_representaciones(relleno, "Body")
        geometry_api.assign_representation(self.modelo, product=relleno, representation=cuerpo)
        geometry_api.edit_object_placement(
            self.modelo,
            product=relleno,
            matrix=self._matriz_hueco(muro, datos["distancia"], datos["antepecho"]),
        )

    @crea_openrvt
    def abertura_crear(
        self,
        clase: str,
        muro: str,
        distancia: float,
        ancho: float | None = None,
        alto: float | None = None,
        antepecho: float | None = None,
        volteado: bool = False,
    ) -> dict[str, Any]:
        self._exigir_modelo()
        if clase not in ("IfcDoor", "IfcWindow"):
            raise self._error("La clase debe ser IfcDoor o IfcWindow.", -32602)
        muro_entidad = self._entidad_por_gid(muro, ("IfcWall",))
        if ancho is None:
            ancho = 0.90 if clase == "IfcDoor" else 1.20
        if alto is None:
            alto = 2.10 if clase == "IfcDoor" else 1.20
        if antepecho is None:
            antepecho = 0.0 if clase == "IfcDoor" else 0.90
        try:
            distancia, ancho, alto, antepecho = (
                float(distancia),
                float(ancho),
                float(alto),
                float(antepecho),
            )
        except (TypeError, ValueError) as exc:
            raise self._error("Las medidas de la abertura no son números.", -32602) from exc
        datos_muro = self._datos_muro(muro_entidad)
        if distancia < -TOLERANCIA_CALCULO:
            raise self._error("La distancia no puede ser negativa.", -32602)
        if distancia + ancho > datos_muro["longitud"] + TOLERANCIA:
            raise self._error(
                f"La abertura no cabe en el muro: necesita {(distancia + ancho):.2f} m "
                f"y el muro mide {datos_muro['longitud']:.2f} m.",
                -32023,
            )
        if antepecho < -TOLERANCIA_CALCULO or antepecho + alto > datos_muro["altura"] + TOLERANCIA:
            raise self._error(
                f"La abertura no cabe en altura: {antepecho + alto:.2f} m "
                f"para un muro de {datos_muro['altura']:.2f} m.",
                -32023,
            )
        fin = distancia + ancho
        for otro, otros in self._aberturas_del_muro(muro_entidad):
            otro_fin = otros["distancia"] + otros["ancho"]
            if distancia < otro_fin - TOLERANCIA and fin > otros["distancia"] + TOLERANCIA:
                raise self._error(
                    "La abertura se traslapa con otra abertura del mismo muro.", -32024
                )

        # O050: una abertura que invade el cerramiento se crea igual; solo se
        # avisa con la cara inferior del cerramiento (nunca se bloquea por eso).
        aviso_cerramiento = ""
        for dependiente in self._dependientes_de(muro_entidad):
            if (
                self._estructura_de_tipo(self._tipo_entidad(dependiente))
                != "cerramiento"
            ):
                continue
            liga = self._leer_liga(dependiente)
            inicio_cerramiento = float(liga.get("Inicio") or 0.0)
            fin_cerramiento = float(
                liga.get("Fin") or datos_muro["longitud"]
            )
            if (
                min(fin, fin_cerramiento) - max(distancia, inicio_cerramiento)
                <= TOLERANCIA
            ):
                continue
            try:
                restriccion = self._restricciones_de(dependiente)
                nivel = self._nivel_por_gid(_texto(restriccion.get("NivelBase")))
                cara_superior = float(nivel.Elevation or 0.0) + float(
                    restriccion.get("DesfaseBase") or 0.0
                )
                cara_inferior = cara_superior - self._peralte_de(dependiente)
            except Exception:
                continue
            if (
                cara_inferior < antepecho + alto - TOLERANCIA
                and cara_superior > antepecho + TOLERANCIA
            ):
                aviso_cerramiento = (
                    "La abertura invade el cerramiento "
                    f"(cara inferior a {cara_inferior:.2f} m)."
                )
                break

        self._instantanea()
        vano = root.create_entity(self.modelo, ifc_class="IfcOpeningElement")
        vano.Name = "Vano"
        self._guardar_pset(
            vano,
            "OPENRVT_Abertura",
            {
                "Distancia": distancia,
                "Ancho": ancho,
                "Alto": alto,
                "Antepecho": antepecho,
                "Muro": _gid(muro_entidad),
                "Volteado": bool(volteado),
            },
        )
        cuerpo_vano = self._cuerpo_hueco(
            ancho,
            alto,
            datos_muro["espesor"],
            antepecho,
            distancia,
            self._desfase_de_muro(muro_entidad, datos_muro["espesor"]),
        )
        geometry_api.assign_representation(self.modelo, product=vano, representation=cuerpo_vano)
        geometry_api.edit_object_placement(
            self.modelo,
            product=vano,
            matrix=self._matriz_hueco(muro_entidad, distancia, antepecho),
        )
        spatial_api.assign_container(
            self.modelo,
            products=[vano],
            relating_structure=next(
                (
                    rel.RelatingStructure
                    for rel in (getattr(muro_entidad, "ContainedInStructure", ()) or ())
                ),
                None,
            ),
        ) if (getattr(muro_entidad, "ContainedInStructure", ()) or ()) else None
        feature_api.add_feature(self.modelo, feature=vano, element=muro_entidad)

        relleno = root.create_entity(self.modelo, ifc_class=clase)
        relleno.Name = "Puerta" if clase == "IfcDoor" else "Ventana"
        if clase == "IfcDoor":
            relleno.OverallWidth = ancho
            relleno.OverallHeight = alto
            relleno.PredefinedType = "DOOR"
        else:
            relleno.OverallWidth = ancho
            relleno.OverallHeight = alto
            relleno.PredefinedType = "WINDOW"
        self._regenerar_relleno(relleno, vano)
        feature_api.add_filling(self.modelo, opening=vano, element=relleno)
        self._regenerar_muro(muro_entidad)
        self.con_cambios = True
        return self._resultado(
            [vano, relleno],
            modificados=[muro_entidad],
            mensaje=(
                f"{'Puerta' if clase == 'IfcDoor' else 'Ventana'} colocada a "
                f"{distancia:.2f} m."
                + (f" {aviso_cerramiento}" if aviso_cerramiento else "")
            ),
        )

