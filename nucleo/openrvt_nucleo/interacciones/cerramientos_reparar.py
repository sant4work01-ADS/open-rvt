"""Interacciones de Validación, reparación y desligado de cerramientos.

Parte de O065: módulo temático del paquete ``interacciones``. El código se movió
tal cual desde ``interacciones.py``; no cambia la lógica ni los nombres.
"""

from __future__ import annotations

import math
from typing import Any

import ifcopenshell
import ifcopenshell.api.root as root
import ifcopenshell.api.spatial as spatial_api
import ifcopenshell.api.type as type_api

from ..modelado import (
    PSET_RESTRICCIONES,
    TOLERANCIA,
    TOLERANCIA_CALCULO,
    _gid,
    _nombre,
    _texto,
)
from .. import uniones
from .comun import LARGOS_REFERENCIA, LIGA, PRIORIDAD


class CerramientosRepararMixin:
    """Validación, reparación y desligado de cerramientos."""


    def _reparar_ancho_del_muro(self) -> int:
        """O061 regla 3: AnchoDelMuro = True recupera el espesor real del muro."""
        reparados = 0
        for viga in list(self.modelo.by_type("IfcBeam")):
            if not self._es_cerramiento(viga):
                continue
            pset = dict(self._leer_pset(viga, "OPENRVT_Estructura"))
            if not pset:
                continue
            if not self._del_nucleo(pset.get("AnchoDelMuro", True)):
                continue
            muros = self._muros_de_cerramiento(viga)
            if not muros:
                continue
            ancho = max(self._capas_nucleo(muro)[0] for muro in muros)
            if abs(float(pset.get("B") or 0.0) - ancho) <= TOLERANCIA_CALCULO:
                continue
            pset["B"] = ancho
            self._guardar_pset(viga, "OPENRVT_Estructura", pset)
            self._regenerar_estructura(viga)
            reparados += 1
        # O061 regla 3: los castillos con AnchoDelMuro también recuperan su
        # sección real al abrir (B/H del tipo y del núcleo del muro).
        for castillo in list(self.modelo.by_type("IfcColumn")):
            if self._estructura_de_tipo(self._tipo_entidad(castillo)) != "castillo":
                continue
            pset = self._leer_pset(castillo, "OPENRVT_Estructura")
            if not pset or not self._del_nucleo(pset.get("AnchoDelMuro", True)):
                continue
            gid = _texto(self._leer_liga(castillo).get("Muro"))
            if not gid:
                continue
            try:
                muro = self._entidad_por_gid(gid, ("IfcWall",))
            except Exception:
                continue
            self._ajustar_castillo(castillo, muro)
            reparados += 1
        return reparados

    def validar_cerramientos(self) -> list[dict[str, Any]]:
        """O057: reporta cerramientos mal ligados o fuera del storey de su base."""
        self._exigir_modelo()
        problemas: list[dict[str, Any]] = []
        for viga in self.modelo.by_type("IfcBeam"):
            if not self._es_cerramiento(viga):
                continue
            motivos: list[str] = []
            restriccion = self._restricciones_de(viga)
            gid_nivel = _texto(restriccion.get("NivelBase"))
            nivel = None
            if not gid_nivel:
                motivos.append("sin_nivel")
            else:
                nivel = self._nivel_por_gid(gid_nivel)
                contenedor = self._nivel_de_elemento(viga)
                if _gid(contenedor) != gid_nivel:
                    motivos.append("storey_incorrecto")
            liga = self._leer_liga(viga)
            muro_gid = _texto(liga.get("Muro"))
            if muro_gid and nivel is not None:
                tramos, _nivel = self._muros_validos_cerramiento(viga)
                correctos = {_gid(tramo["muro"]) for tramo in tramos}
                if muro_gid not in correctos:
                    motivos.append("muro_incorrecto")
            if motivos:
                problemas.append(
                    {"globalid": _gid(viga), "motivos": motivos}
                )
        return problemas

    def reparar_cerramientos(self) -> dict[str, Any]:
        """O057: recoloca los cerramientos mal ligados y respeta el tope del usuario."""
        self._exigir_modelo()
        self._instantanea()
        reparados: list[Any] = []
        borrados: list[str] = []
        for viga in list(self.modelo.by_type("IfcBeam")):
            if not self._es_cerramiento(viga):
                continue
            restriccion = self._restricciones_de(viga)
            gid_nivel = _texto(restriccion.get("NivelBase"))
            if not gid_nivel:
                continue
            nivel = self._nivel_por_gid(gid_nivel)
            if _gid(self._nivel_de_elemento(viga)) != gid_nivel:
                spatial_api.assign_container(
                    self.modelo, products=[viga], relating_structure=nivel
                )
            liga = self._leer_liga(viga)
            muro_gid = _texto(liga.get("Muro"))
            if not muro_gid:
                continue
            tramos, _nivel = self._muros_validos_cerramiento(viga)
            correctos = {_gid(tramo["muro"]) for tramo in tramos}
            if muro_gid in correctos:
                continue
            # El muro ligado no es el que sostiene el cerramiento. Si ya hay un
            # cerramiento válido en el muro correcto y el mismo nivel, este es el
            # duplicado que dejó el error del paso 5: se borra. Si no, se re-liga.
            duplicado = False
            destino: dict[str, Any] | None = None
            for tramo in tramos:
                for dependiente in self._dependientes_de(tramo["muro"]):
                    if dependiente == viga or not self._es_cerramiento(dependiente):
                        continue
                    if _texto(
                        self._restricciones_de(dependiente).get("NivelBase")
                    ) != gid_nivel:
                        continue
                    otra = self._leer_liga(dependiente)
                    if otra.get("Inicio") is None:
                        a, b = 0.0, self._datos_muro(tramo["muro"])["longitud"]
                    else:
                        a = float(otra.get("Inicio") or 0.0)
                        b = float(otra.get("Fin") or a)
                    if (
                        min(b, tramo["fin"]) - max(a, tramo["inicio"])
                        > TOLERANCIA
                    ):
                        duplicado = True
                        break
                if duplicado:
                    break
                if destino is None:
                    destino = tramo
            if duplicado:
                self._quitar_conexiones(viga)
                borrados.append(_gid(viga))
                self.modelo.remove(viga)
                continue
            if destino is not None:
                self._guardar_liga(
                    viga,
                    {
                        **liga,
                        "Muro": _gid(destino["muro"]),
                        "Inicio": float(destino["inicio"]),
                        "Fin": float(destino["fin"]),
                        "Completo": False,
                    },
                )
                self._conectar(viga, destino["muro"])
            else:
                self._quitar_claves_pset(viga, LIGA, ("Muro", "Inicio", "Fin", "Completo"))
                self._quitar_conexiones(viga)
            reparados.append(viga)
        # Los castillos con NivelTope del usuario recuperan su altura real (regla 2).
        muros: dict[int, Any] = {}
        for castillo in self.modelo.by_type("IfcColumn"):
            if self._estructura_de_tipo(self._tipo_entidad(castillo)) != "castillo":
                continue
            liga = self._leer_liga(castillo)
            if not liga.get("Muro"):
                continue
            try:
                muro = self._entidad_por_gid(_texto(liga["Muro"]), ("IfcWall",))
            except Exception:
                continue
            muros[id(muro)] = muro
        for muro in muros.values():
            self._actualizar_castillos(muro)
        self.con_cambios = True
        return self._resultado(
            reparados,
            borrados=borrados,
            mensaje=f"{len(reparados)} cerramiento(s) reparado(s); {len(borrados)} borrado(s).",
        )

    def _cerramiento_tramo(
        self,
        tipo_entidad: Any,
        muro: Any | None,
        x1: float,
        y1: float,
        x2: float,
        y2: float,
        restriccion: dict[str, Any],
        inicio: float | None = None,
        fin: float | None = None,
    ) -> Any:
        """Crea un cerramiento embebido en un tramo; sin muro queda libre.

        O057: el cerramiento se contiene siempre en el storey de su NivelBase,
        aunque cuelgue de un muro de otro nivel.
        """
        nivel_restriccion = self._nivel_por_gid(
            _texto(restriccion.get("NivelBase"))
        )
        nucleo = (
            self._capas_nucleo(muro)[0]
            if muro is not None
            else float(self._seccion_y_armado(tipo_entidad)[1].get("B") or 0.15)
        )
        elevacion = float(nivel_restriccion.Elevation or 0.0)
        desfase = float(restriccion.get("DesfaseBase") or 0.0)
        tope = elevacion + desfase
        alto = float(self._seccion_y_armado(tipo_entidad)[1].get("H") or 0.20)
        viga = self._viga_nueva(
            tipo_entidad,
            nivel_restriccion,
            x1, y1, x2, y2,
            desfase,
        )
        self._guardar_pset(
            viga,
            "OPENRVT_Estructura",
            {
                **self._leer_pset(viga, "OPENRVT_Estructura"),
                "B": nucleo, "AnchoDelMuro": True,
                "Z": tope - alto / 2.0,
                "Nivel": restriccion["NivelBase"],
                "Desfase": restriccion["DesfaseBase"],
            },
        )
        self._regenerar_estructura(viga)
        self._guardar_pset(viga, PSET_RESTRICCIONES, restriccion)
        if muro is not None:
            datos_muro = self._datos_muro(muro)
            completo = float(inicio or 0.0) <= TOLERANCIA and float(
                fin or 0.0
            ) >= datos_muro["longitud"] - TOLERANCIA
            self._guardar_liga(
                viga,
                {
                    "Muro": _gid(muro),
                    "Inicio": float(inicio or 0.0),
                    "Fin": float(fin or 0.0),
                    "Completo": completo,
                },
            )
            self._conectar(viga, muro)
        return viga

    def _lineal_en_muro(
        self,
        tipo: str,
        muro: str,
        esperado: str,
        nivel_elegido: str | None = None,
        desfase_elegido: float | None = None,
        desde_planta: bool = False,
    ) -> dict[str, Any]:
        self._exigir_modelo()
        tipo_entidad = self._tipo_estructura(tipo, ("IfcBeamType",))
        if self._estructura_de_tipo(tipo_entidad) != esperado:
            raise self._error(f"El tipo no es un {esperado}.", -32602)
        muro_entidad = self._entidad_por_gid(muro, ("IfcWall",))
        datos = self._datos_muro(muro_entidad)
        nivel = self._nivel_de_elemento(muro_entidad)
        _, seccion, _ = self._seccion_y_armado(tipo_entidad)
        alto = float(seccion.get("H") or 0.20)
        nucleo, _centro = self._capas_nucleo(muro_entidad)
        restriccion_cerramiento: dict[str, Any] | None = None
        explicito = False
        if esperado == "cerramiento":
            # O043: el nivel del cerramiento sale del elegido o del tope del muro,
            # y nunca se crea otro cerramiento en el mismo nivel del mismo muro.
            restriccion_cerramiento = self._restricciones_cerramiento_ligado(
                muro_entidad
            )
            explicito = bool(nivel_elegido) or desfase_elegido is not None
            if explicito:
                if nivel_elegido:
                    restriccion_cerramiento["NivelBase"] = _gid(
                        self._nivel_por_gid(str(nivel_elegido))
                    )
                if desfase_elegido is not None:
                    try:
                        restriccion_cerramiento["DesfaseBase"] = float(desfase_elegido)
                    except (TypeError, ValueError) as exc:
                        raise self._error("El desfase no es un número.", -32602) from exc
            nivel_destino = _texto(restriccion_cerramiento.get("NivelBase"))
            if nivel_destino:
                for dependiente in self._dependientes_de(muro_entidad):
                    if (
                        self._estructura_de_tipo(self._tipo_entidad(dependiente))
                        != "cerramiento"
                    ):
                        continue
                    existente = _texto(
                        self._restricciones_de(dependiente).get("NivelBase")
                    )
                    if existente == nivel_destino:
                        nivel_entidad = self._nivel_por_gid(nivel_destino)
                        raise self._error(
                            f"Ese muro ya tiene cerramiento en {_nombre(nivel_entidad)}.",
                            -32602,
                        )
        self._instantanea()
        if esperado == "cerramiento":
            desfase = datos["z"] + datos["altura"]
        else:
            desfase = datos["z"] + alto
        viga = self._viga_nueva(
            tipo_entidad, nivel, datos["x1"], datos["y1"], datos["x2"], datos["y2"], desfase
        )
        centro = (
            datos["z"] + datos["altura"] - alto / 2.0
            if esperado == "cerramiento"
            else datos["z"] + alto / 2.0
        )
        self._guardar_pset(
            viga,
            "OPENRVT_Estructura",
            {
                **self._leer_pset(viga, "OPENRVT_Estructura"),
                "B": nucleo, "AnchoDelMuro": True,
                "Z": centro,
            },
        )
        self._regenerar_estructura(viga)
        self._guardar_liga(
            viga,
            {"Muro": _gid(muro_entidad), "Completo": esperado == "cerramiento"},
        )
        if esperado == "cerramiento":
            restriccion = restriccion_cerramiento or self._restricciones_cerramiento_ligado(
                muro_entidad
            )
            # O041: la barra de opciones deja elegir nivel y desfase antes del
            # clic; el desfase se mide del nivel a la cara superior.
            self._guardar_pset(viga, PSET_RESTRICCIONES, restriccion)
            # O057: el cerramiento vive en el storey de su NivelBase, no en el
            # del muro del que cuelga (regla 3).
            nivel_base_cerramiento = self._nivel_por_gid(
                _texto(restriccion.get("NivelBase"))
            )
            if nivel_base_cerramiento is not None:
                spatial_api.assign_container(
                    self.modelo,
                    products=[viga],
                    relating_structure=nivel_base_cerramiento,
                )
            self._guardar_pset(
                viga,
                "OPENRVT_Estructura",
                {
                    **self._leer_pset(viga, "OPENRVT_Estructura"),
                    "Nivel": restriccion["NivelBase"],
                    "Desfase": restriccion["DesfaseBase"],
                },
            )
            if explicito:
                # Recalcula Z en la misma instantánea (un solo paso de Deshacer).
                # O045: el cerramiento va embebido; el muro conserva su altura.
                self._aplicar_restriccion(viga, restriccion)
        self._conectar(viga, muro_entidad)
        if esperado == "cerramiento":
            self._actualizar_castillos(muro_entidad)
        self._actualizar_dependientes_muro(muro_entidad)
        self.con_cambios = True
        return self._resultado(
            [viga],
            modificados=[muro_entidad],
            mensaje=f"{esperado.capitalize()} ligado al muro ({datos['longitud']:.2f} m).",
        )

    def soltar_del_muro(self, globalid: str) -> dict[str, Any]:
        """O040: suelta un cerramiento o dala de su muro, dejándolo donde está."""
        self._exigir_modelo()
        entidad = self._entidad_por_gid(str(globalid), ("IfcBeam",))
        liga = dict(self._leer_liga(entidad))
        if not liga.get("Muro"):
            raise self._error("El elemento no está ligado a un muro.", -32602)
        self._instantanea()
        self._quitar_claves_pset(
            entidad, LIGA, ("Muro", "Distancia", "Inicio", "Fin", "Completo")
        )
        self._quitar_conexiones(entidad)
        self.con_cambios = True
        return self._resultado([entidad], mensaje="Soltado del muro.")
