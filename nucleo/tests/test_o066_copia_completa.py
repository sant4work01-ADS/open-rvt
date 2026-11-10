"""O066 punto 1: la copia genérica conserva nivel, tipo, psets y qtos.

Valores a mano: el pset de prueba guarda Marca «ORIGINAL» y Largo 2.50; el qto
guarda Longitud 2.50.  Al copiar 5 m en X, la copia debe conservar esos mismos
valores y quedar en el mismo nivel y con el mismo tipo; editar el pset de la
copia a «COPIA» deja el original en «ORIGINAL».
"""

from __future__ import annotations

import sys
from pathlib import Path

import ifcopenshell.api.pset as pset_api
import ifcopenshell.api.spatial as spatial_api
import ifcopenshell.api.type as type_api
import ifcopenshell.guid as guid
import ifcopenshell.util.element as util_elemento
import pytest

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ModeloNucleo  # noqa: E402


def _colocacion(nucleo: ModeloNucleo, x: float, y: float, z: float = 0.0):
    modelo = nucleo.modelo
    punto = modelo.create_entity(
        "IfcCartesianPoint", Coordinates=(float(x), float(y), float(z))
    )
    eje = modelo.create_entity(
        "IfcAxis2Placement3D", Location=punto, Axis=None, RefDirection=None
    )
    return modelo.create_entity(
        "IfcLocalPlacement", PlacementRelTo=None, RelativePlacement=eje
    )


def _tipo(nucleo: ModeloNucleo, clase: str, nombre: str):
    return nucleo.modelo.create_entity(
        clase,
        GlobalId=guid.new(),
        OwnerHistory=None,
        Name=nombre,
        Description=None,
        ApplicableOccurrence=None,
        HasPropertySets=None,
        RepresentationMaps=None,
        Tag=None,
        ElementType=None,
    )


def _elemento(nucleo: ModeloNucleo, clase: str, tipo_clase: str, nombre: str, nivel):
    modelo = nucleo.modelo
    elemento = modelo.create_entity(
        clase,
        GlobalId=guid.new(),
        OwnerHistory=None,
        Name=nombre,
        Description=None,
        ObjectType=None,
        ObjectPlacement=_colocacion(nucleo, 1.0, 2.0),
        Representation=None,
        Tag=None,
    )
    tipo = _tipo(nucleo, tipo_clase, f"Tipo {nombre}")
    type_api.assign_type(modelo, related_objects=[elemento], relating_type=tipo)
    spatial_api.assign_container(
        modelo, products=[elemento], relating_structure=nivel
    )
    nucleo._guardar_pset(
        elemento, "OPENRVT_Prueba", {"Marca": "ORIGINAL", "Largo": 2.5}
    )
    nucleo._guardar_pset(elemento, "Pset_Prueba", {"Codigo": "A-1", "Entero": 7})
    qto = pset_api.add_qto(modelo, product=elemento, name="Qto_Prueba")
    pset_api.edit_qto(
        modelo, qto=qto, properties={"Longitud": 2.5, "Area": 1.25}
    )
    return elemento


def _propios(elemento) -> dict[str, dict[str, object]]:
    """Psets y qtos del propio elemento, sin heredados y sin el id interno."""
    salida: dict[str, dict[str, object]] = {}
    for nombre, valores in util_elemento.get_psets(
        elemento, should_inherit=False
    ).items():
        salida[nombre] = {k: v for k, v in valores.items() if k != "id"}
    return salida


def _nivel(nucleo: ModeloNucleo):
    return nucleo._nivel_por_gid(nucleo.niveles()[0]["globalid"])


def test_copia_generica_conserva_nivel_tipo_psets_y_qtos(tmp_path: Path) -> None:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O066 copia")
    nivel = _nivel(nucleo)
    originales = [
        _elemento(nucleo, "IfcDoor", "IfcDoorType", "Puerta suelta", nivel),
        _elemento(nucleo, "IfcRailing", "IfcRailingType", "Barandilla", nivel),
        _elemento(nucleo, "IfcMember", "IfcMemberType", "Montante", nivel),
    ]

    resultado = nucleo.elementos_copiar(
        [e.GlobalId for e in originales], 5.0, 0.0, 0.0
    )
    assert len(resultado["creados"]) == 3

    for original, gid_copia in zip(originales, resultado["creados"]):
        copia = nucleo._entidad_por_gid(gid_copia)
        assert copia.is_a() == original.is_a()
        # Mismo contenedor espacial (nivel) y mismo tipo.
        assert copia.ContainedInStructure
        assert (
            copia.ContainedInStructure[0].RelatingStructure
            == original.ContainedInStructure[0].RelatingStructure
            == nivel
        )
        assert nucleo._tipo_entidad(copia) == nucleo._tipo_entidad(original)
        # Todos los psets y qtos, con los mismos valores.
        assert _propios(copia) == _propios(original)
        assert _propios(copia)["OPENRVT_Prueba"]["Marca"] == "ORIGINAL"
        assert _propios(copia)["OPENRVT_Prueba"]["Largo"] == pytest.approx(2.5)
        assert _propios(copia)["Pset_Prueba"] == {"Codigo": "A-1", "Entero": 7}
        assert _propios(copia)["Qto_Prueba"] == {
            "Longitud": pytest.approx(2.5),
            "Area": pytest.approx(1.25),
        }

    # La copia tiene psets nuevos: editar la copia no toca al original.
    copia = nucleo._entidad_por_gid(resultado["creados"][1])
    original = originales[1]
    nucleo._guardar_pset(copia, "OPENRVT_Prueba", {"Marca": "COPIA", "Largo": 9.0})
    assert nucleo._leer_pset(original, "OPENRVT_Prueba")["Marca"] == "ORIGINAL"
    assert nucleo._leer_pset(original, "OPENRVT_Prueba")["Largo"] == pytest.approx(2.5)
    assert nucleo._leer_pset(copia, "OPENRVT_Prueba")["Marca"] == "COPIA"
    assert nucleo._leer_pset(copia, "OPENRVT_Prueba")["Largo"] == pytest.approx(9.0)

    # Flujo completo: guardar, reabrir y comprobar que los psets viajaron al IFC.
    from openrvt_nucleo.modelo import ModeloNucleo as NucleoReabierto

    ruta = tmp_path / "copia.ifc"
    nucleo.guardar(str(ruta))
    otro = NucleoReabierto()
    otro.abrir(str(ruta))
    reabierta = otro._entidad_por_gid(copia.GlobalId)
    original_reabierto = otro._entidad_por_gid(original.GlobalId)
    assert _propios(reabierta)["OPENRVT_Prueba"] == {
        "Marca": "COPIA",
        "Largo": pytest.approx(9.0),
    }
    assert _propios(original_reabierto)["OPENRVT_Prueba"] == {
        "Marca": "ORIGINAL",
        "Largo": pytest.approx(2.5),
    }
    assert _propios(reabierta)["Qto_Prueba"] == {
        "Longitud": pytest.approx(2.5),
        "Area": pytest.approx(1.25),
    }


def test_copia_generica_sin_tipo_ni_psets_no_inventa_datos() -> None:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O066 copia mínima")
    nivel = _nivel(nucleo)
    modelo = nucleo.modelo
    suelto = modelo.create_entity(
        "IfcRailing",
        GlobalId=guid.new(),
        OwnerHistory=None,
        Name="Barandilla libre",
        Description=None,
        ObjectType=None,
        ObjectPlacement=_colocacion(nucleo, 0.0, 0.0),
        Representation=None,
        Tag=None,
    )
    spatial_api.assign_container(modelo, products=[suelto], relating_structure=nivel)

    copia = nucleo._entidad_por_gid(
        nucleo.elementos_copiar([suelto.GlobalId], 0.0, 3.0, 0.0)["creados"][0]
    )
    assert copia.ContainedInStructure[0].RelatingStructure == nivel
    assert nucleo._tipo_entidad(copia) is None
    assert _propios(copia) == {}
