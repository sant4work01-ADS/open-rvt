"""O063 punto 4: una losa sin contorno legible no inventa área ni volumen."""

from __future__ import annotations

import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

import ifcopenshell.api.aggregate as aggregate  # noqa: E402
import ifcopenshell.api.root as root  # noqa: E402

from openrvt_nucleo.modelo import ModeloNucleo  # noqa: E402


def _losa_brep_sin_pset(nucleo: ModeloNucleo):
    modelo = nucleo.modelo
    nivel = modelo.by_type("IfcBuildingStorey")[0]
    losa = root.create_entity(modelo, ifc_class="IfcSlab", name="Losa ilegible")
    aggregate.assign_object(modelo, products=[losa], relating_object=nivel)
    puntos = [
        modelo.create_entity(
            "IfcCartesianPoint", Coordinates=(float(x), float(y), 0.0)
        )
        for x, y in ((0.0, 0.0), (3.0, 0.0), (3.0, 2.0), (0.0, 2.0))
    ]
    poligono = modelo.create_entity("IfcPolyLoop", Polygon=puntos)
    limite = modelo.create_entity(
        "IfcFaceOuterBound", Bound=poligono, Orientation=True
    )
    cara = modelo.create_entity("IfcFace", Bounds=[limite])
    concha = modelo.create_entity("IfcClosedShell", CfsFaces=[cara])
    brep = modelo.create_entity("IfcFacetedBrep", Outer=concha)
    representacion = modelo.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=nucleo._contexto(),
        RepresentationIdentifier="Body",
        RepresentationType="Brep",
        Items=[brep],
    )
    losa.Representation = modelo.create_entity(
        "IfcProductDefinitionShape", Representations=[representacion]
    )
    return losa


def test_losa_brep_sin_pset_aparece_como_error_y_no_suma():
    nucleo = ModeloNucleo()
    nucleo.nuevo("Losa sin contorno O063")
    losa = _losa_brep_sin_pset(nucleo)

    resultado = nucleo.medicion_calcular()

    assert resultado["errores"] == [
        {"globalid": losa.GlobalId, "mensaje": "sin contorno legible"}
    ]
    # Ninguna partida (área, volumen o cimbra) puede traer un renglón de esa losa.
    for partida in resultado["partidas"]:
        assert all(r["globalid"] != losa.GlobalId for r in partida["renglones"])
    # Y por tanto no hay ningún total de área o volumen atribuible a la losa.
    areas = [p for p in resultado["partidas"] if p["unidad"] in ("m2", "m3")]
    assert all(p["total"] == 0 for p in areas)
