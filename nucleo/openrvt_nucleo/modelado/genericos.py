"""Elementos genéricos."""

from __future__ import annotations

from .comun import *  # noqa: F401,F403

from ..siembra import crea_openrvt


class GenericosMixin:
    @crea_openrvt
    def generico_crear(
        self,
        nivel: str,
        puntos: Any,
        altura: float,
        nombre: str = "Genérico",
        desfase: float = 0.0,
    ) -> dict[str, Any]:
        """O046: sólido genérico del prototipo Empujar/Tirar.

        Crea un IfcBuildingElementProxy con un IfcExtrudedAreaSolid del contorno
        (en el plano del nivel) y una cantidad BaseQuantities con NetVolume y
        NetArea de la base. La altura negativa extruye hacia abajo del nivel.
        """
        self._exigir_modelo()
        nivel_entidad = self._nivel_por_gid(nivel)
        try:
            poligono = [(float(p[0]), float(p[1])) for p in puntos]
            altura = float(altura)
            desfase = float(desfase)
        except (TypeError, ValueError, IndexError) as exc:
            raise self._error("El contorno del genérico no es válido.", -32602) from exc
        if not math.isfinite(desfase):
            raise self._error("El desfase del genérico no es un número.", -32602)
        if len(poligono) < 3:
            raise self._error("El genérico necesita al menos tres vértices.", -32602)
        area = abs(_poligono_area(poligono))
        if area <= TOLERANCIA_CALCULO:
            raise self._error("El genérico tiene área cero.", -32602)
        if abs(altura) <= TOLERANCIA_CALCULO:
            raise self._error("La altura del genérico debe ser distinta de cero.", -32602)
        nombre = str(nombre or "").strip() or "Genérico"

        self._instantanea()
        proxy = root.create_entity(self.modelo, ifc_class="IfcBuildingElementProxy")
        proxy.Name = nombre
        proxy.PredefinedType = "ELEMENT"
        elevacion = float(nivel_entidad.Elevation or 0.0) + desfase
        matriz = np.identity(4)
        matriz[2][3] = elevacion
        geometry_api.edit_object_placement(self.modelo, product=proxy, matrix=matriz)

        # Perfil cerrado con el contorno en coordenadas locales del elemento.
        perfil = self.modelo.create_entity(
            "IfcArbitraryClosedProfileDef", ProfileType="AREA"
        )
        perfil.ProfileName = nombre
        puntos_curva = [
            self.modelo.create_entity("IfcCartesianPoint", Coordinates=(x, y))
            for x, y in poligono
        ]
        # El perfil cerrado repite el primer punto al final.
        puntos_curva.append(
            self.modelo.create_entity(
                "IfcCartesianPoint", Coordinates=(poligono[0][0], poligono[0][1])
            )
        )
        curva = self.modelo.create_entity("IfcPolyline", Points=puntos_curva)
        perfil.OuterCurve = curva

        colocacion = self.modelo.create_entity(
            "IfcAxis2Placement3D",
            Location=self.modelo.create_entity(
                "IfcCartesianPoint", Coordinates=(0.0, 0.0, 0.0)
            ),
        )
        sentido = 1.0 if altura > 0 else -1.0
        solido = self.modelo.create_entity(
            "IfcExtrudedAreaSolid",
            SweptArea=perfil,
            Position=colocacion,
            ExtrudedDirection=self.modelo.create_entity(
                "IfcDirection", DirectionRatios=(0.0, 0.0, sentido)
            ),
            Depth=abs(altura),
        )
        cuerpo = self.modelo.create_entity(
            "IfcShapeRepresentation",
            ContextOfItems=self._contexto(),
            RepresentationIdentifier="Body",
            RepresentationType="SweptSolid",
            Items=[solido],
        )
        forma = self.modelo.create_entity(
            "IfcProductDefinitionShape", Representations=[cuerpo]
        )
        proxy.Representation = forma

        volumen = area * abs(altura)
        cantidades = self.modelo.create_entity(
            "IfcElementQuantity",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=None,
            Name="BaseQuantities",
            Description="Cantidades netas de OPEN-RVT",
            MethodOfMeasurement=None,
            Quantities=[
                self.modelo.create_entity(
                    "IfcQuantityVolume",
                    Name="NetVolume",
                    Description=None,
                    Unit=None,
                    VolumeValue=volumen,
                    Formula=None,
                ),
                self.modelo.create_entity(
                    "IfcQuantityArea",
                    Name="NetArea",
                    Description=None,
                    Unit=None,
                    AreaValue=area,
                    Formula=None,
                ),
            ],
        )
        self.modelo.create_entity(
            "IfcRelDefinesByProperties",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=None,
            Name=None,
            Description=None,
            RelatedObjects=[proxy],
            RelatingPropertyDefinition=cantidades,
        )
        self._guardar_pset(
            proxy,
            "OPENRVT_Generico",
            {
                "Altura": altura,
                "AreaBase": area,
                "Volumen": volumen,
                "Nombre": nombre,
                "Desfase": desfase,
            },
        )
        spatial_api.assign_container(
            self.modelo, products=[proxy], relating_structure=nivel_entidad
        )
        self.con_cambios = True
        return self._resultado(
            [proxy],
            mensaje=f"Genérico creado ({area * abs(altura):.3f} m³).",
            area_base=area,
            volumen=volumen,
        )

