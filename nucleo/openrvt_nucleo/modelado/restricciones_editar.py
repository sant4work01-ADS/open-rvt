"""Edición de restricciones de base y tope."""

from __future__ import annotations

from .comun import *  # noqa: F401,F403


class RestriccionesEditarMixin:
    def restricciones_editar(
        self,
        globalid: str,
        nivel_base: str | None = None,
        desfase_base: float | None = None,
        nivel_tope: str | None = None,
        desfase_tope: float | None = None,
        altura_sin_conexion: float | None = None,
        desplante: float | None = None,
    ) -> dict[str, Any]:
        """O016: cambia base/tope de un muro o columna en una sola instantánea.

        O033: las zapatas aisladas y corridas solo aceptan nivel_base y desplante.
        O040: los cerramientos sueltos aceptan nivel_base y desfase_base; no tienen
        restricción de tope ni altura.
        """
        self._exigir_modelo()
        entidad = self._entidad_por_gid(
            globalid, ("IfcWall", "IfcColumn", "IfcFooting", "IfcBeam")
        )
        predef = _texto(getattr(entidad, "PredefinedType", ""))
        es_zapata = entidad.is_a("IfcFooting") and predef != "FOOTING_BEAM"
        es_cerramiento = (
            entidad.is_a("IfcBeam")
            and self._estructura_de_tipo(self._tipo_entidad(entidad)) == "cerramiento"
        )
        if not (
            entidad.is_a("IfcWall")
            or entidad.is_a("IfcColumn")
            or entidad.is_a("IfcFooting")
            or es_cerramiento
        ):
            raise self._error("Ese elemento no admite restricciones.", -32602)
        if es_zapata:
            for proporcionado, nombre in (
                (desfase_base, "Desfase de base"),
                (nivel_tope, "Restricción de tope"),
                (desfase_tope, "Desfase de tope"),
                (altura_sin_conexion, "Altura"),
            ):
                if proporcionado is not None:
                    raise self._error(
                        f"La zapata no tiene «{nombre}»: use el desplante.", -32602
                    )
        if es_cerramiento:
            for proporcionado, nombre in (
                (nivel_tope, "Restricción de tope"),
                (desfase_tope, "Desfase de tope"),
                (altura_sin_conexion, "Altura"),
            ):
                if proporcionado is not None:
                    raise self._error(
                        f"El cerramiento no tiene «{nombre}»: use el nivel y el "
                        "desfase.",
                        -32602,
                    )
        restriccion = dict(self._restricciones_de(entidad))
        if nivel_base is not None:
            nivel = self._nivel_por_gid(str(nivel_base))
            restriccion["NivelBase"] = _gid(nivel)
        if desplante is not None:
            try:
                desplante = float(desplante)
            except (TypeError, ValueError) as exc:
                raise self._error("El desplante no es un número.", -32602) from exc
            if desplante <= 0:
                raise self._error("El desplante debe ser positivo.", -32602)
            restriccion["Desplante"] = desplante
        if desfase_base is not None:
            try:
                restriccion["DesfaseBase"] = float(desfase_base)
            except (TypeError, ValueError) as exc:
                raise self._error("El desfase de base no es un número.", -32602) from exc
        if nivel_tope is not None:
            if _texto(nivel_tope):
                nivel = self._nivel_por_gid(str(nivel_tope))
                restriccion["NivelTope"] = _gid(nivel)
            else:
                restriccion["NivelTope"] = ""
        if desfase_tope is not None:
            try:
                restriccion["DesfaseTope"] = float(desfase_tope)
            except (TypeError, ValueError) as exc:
                raise self._error("El desfase de tope no es un número.", -32602) from exc
        if altura_sin_conexion is not None:
            try:
                restriccion["AlturaSinConexion"] = float(altura_sin_conexion)
            except (TypeError, ValueError) as exc:
                raise self._error(
                    "La altura sin conexión no es un número.", -32602
                ) from exc
        nivel_base_entidad = self._nivel_por_gid(restriccion["NivelBase"])
        elev_base = float(nivel_base_entidad.Elevation or 0.0)
        if not es_zapata:
            elev_tope = None
            if restriccion.get("NivelTope"):
                elev_tope = float(
                    self._nivel_por_gid(restriccion["NivelTope"]).Elevation or 0.0
                )
            try:
                altura_restringida(
                    elev_base,
                    float(restriccion.get("DesfaseBase") or 0.0),
                    elev_tope,
                    float(restriccion.get("DesfaseTope") or 0.0),
                    float(restriccion.get("AlturaSinConexion") or 0.0),
                )
            except ValueError as exc:
                raise self._error(str(exc), -32602) from exc
        self._instantanea()
        try:
            self._aplicar_restriccion(entidad, restriccion)
            spatial_api.assign_container(
                self.modelo, products=[entidad], relating_structure=nivel_base_entidad
            )
        except Exception:
            self._revertir_instantanea()
            raise
        self.con_cambios = True
        return self._resultado(
            modificados=[entidad], mensaje="Restricciones actualizadas."
        )

    def restricciones_editar_varios(
        self,
        globalids: Any,
        nivel_base: str | None = None,
        desfase_base: float | None = None,
    ) -> dict[str, Any]:
        """O050: mueve varios cerramientos de nivel en un solo paso de Deshacer.

        Se valida cada cerramiento antes de tocar el modelo; si uno no es un
        cerramiento o el nivel no existe, no se cambia ninguno.
        """
        self._exigir_modelo()
        if isinstance(globalids, str):
            globalids = [globalids]
        if not isinstance(globalids, (list, tuple)) or not globalids:
            raise self._error("Seleccione al menos un cerramiento.", -32602)
        nivel = None
        if nivel_base is not None:
            nivel = self._nivel_por_gid(str(nivel_base))
        try:
            desfase = None if desfase_base is None else float(desfase_base)
        except (TypeError, ValueError) as exc:
            raise self._error("El desfase de base no es un número.", -32602) from exc
        cambios: list[tuple[Any, dict[str, Any]]] = []
        vistos: set[str] = set()
        for gid in globalids:
            entidad = self._entidad_por_gid(str(gid), ("IfcBeam",))
            if _gid(entidad) in vistos:
                continue
            vistos.add(_gid(entidad))
            if self._estructura_de_tipo(self._tipo_entidad(entidad)) != "cerramiento":
                raise self._error(
                    f"«{_nombre(entidad)}» no es un cerramiento.", -32602
                )
            restriccion = dict(self._restricciones_de(entidad))
            if nivel is not None:
                restriccion["NivelBase"] = _gid(nivel)
            if desfase is not None:
                restriccion["DesfaseBase"] = desfase
            if not _texto(restriccion.get("NivelBase")):
                raise self._error(
                    f"El cerramiento «{_nombre(entidad)}» no tiene nivel.", -32602
                )
            cambios.append((entidad, restriccion))
        self._instantanea()
        try:
            for entidad, restriccion in cambios:
                self._aplicar_restriccion(entidad, restriccion)
                spatial_api.assign_container(
                    self.modelo,
                    products=[entidad],
                    relating_structure=self._nivel_por_gid(
                        _texto(restriccion.get("NivelBase"))
                    ),
                )
        except Exception:
            self._revertir_instantanea()
            raise
        self.con_cambios = True
        return self._resultado(
            modificados=[entidad for entidad, _ in cambios],
            mensaje=f"{len(cambios)} cerramiento(s) actualizado(s).",
        )

