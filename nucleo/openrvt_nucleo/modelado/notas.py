"""Notas de texto en planta (O055)."""

from __future__ import annotations

from .comun import *  # noqa: F401,F403


class NotasMixin:
    # ------------------------------------------------------------------ notas (O055)
    def _nota_por_gid(self, globalid: str) -> Any:
        entidad = self._entidad_por_gid(globalid, ("IfcAnnotation",))
        if _texto(getattr(entidad, "ObjectType", "")) != "OPENRVT_Nota":
            raise self._error(f"{globalid} no es una nota de OPEN-RVT.", -32022)
        return entidad

    def _datos_nota(self, nota: Any) -> dict[str, Any]:
        import ifcopenshell.util.placement as placement

        matriz = placement.get_local_placement(nota.ObjectPlacement)
        x = float(matriz[0][3])
        y = float(matriz[1][3])
        z = float(matriz[2][3])
        niveles = [
            n
            for n in self.modelo.by_type("IfcBuildingStorey")
            if n.Elevation is not None
        ]
        nivel = ""
        nivel_gid = ""
        if niveles:
            inferior = max(
                (n for n in niveles if float(n.Elevation) <= z + 1e-4),
                key=lambda n: float(n.Elevation),
                default=None,
            )
            if inferior is not None:
                nivel = _texto(inferior.Name)
                nivel_gid = _texto(inferior.GlobalId)
        return {
            "globalid": _texto(nota.GlobalId),
            "texto": _texto(getattr(nota, "Description", "")),
            "posicion": [x, y, z],
            "nivel": nivel,
            "nivelGlobalid": nivel_gid,
        }

    def notas_listar(self) -> list[dict[str, Any]]:
        """O055: notas guardadas como IfcAnnotation con ObjectType OPENRVT_Nota."""
        self._exigir_modelo()
        notas = [
            self._datos_nota(nota)
            for nota in self.modelo.by_type("IfcAnnotation")
            if _texto(getattr(nota, "ObjectType", "")) == "OPENRVT_Nota"
        ]
        notas.sort(key=lambda n: (n["texto"], n["globalid"]))
        return notas

    def _nivel_para_nota(self, nivel: str, z: float) -> Any:
        if nivel:
            return self._nivel_por_gid(nivel)
        niveles = [
            n
            for n in self.modelo.by_type("IfcBuildingStorey")
            if n.Elevation is not None
        ]
        if not niveles:
            raise self._error("El modelo no tiene niveles.", -32022)
        inferiores = [n for n in niveles if float(n.Elevation) <= z + 1e-4]
        if inferiores:
            return max(inferiores, key=lambda n: float(n.Elevation))
        return min(niveles, key=lambda n: float(n.Elevation))

    def _colocar_nota(self, nota: Any, x: float, y: float, z: float) -> None:
        matriz = np.identity(4)
        matriz[0][3] = x
        matriz[1][3] = y
        matriz[2][3] = z
        geometry_api.edit_object_placement(self.modelo, product=nota, matrix=matriz)

    def nota_crear(
        self,
        texto: str,
        x: float,
        y: float,
        z: float,
        nivel: str = "",
    ) -> dict[str, Any]:
        """O055: crea una nota de texto en un punto 3D.

        Se guarda como IfcAnnotation con ObjectType «OPENRVT_Nota»; la posición va en
        su colocación y el texto en Description. La contención es el nivel donde cae.
        """
        self._exigir_modelo()
        texto = str(texto or "").strip()
        if not texto:
            raise self._error("La nota necesita un texto.", -32602)
        try:
            x, y, z = float(x), float(y), float(z)
        except (TypeError, ValueError) as exc:
            raise self._error("La posición de la nota no es válida.", -32602) from exc
        if not all(math.isfinite(v) for v in (x, y, z)):
            raise self._error("La posición de la nota no es un número.", -32602)
        nivel_entidad = self._nivel_para_nota(nivel, z)
        self._instantanea()
        nota = root.create_entity(self.modelo, ifc_class="IfcAnnotation")
        nota.Name = "Nota"
        nota.ObjectType = "OPENRVT_Nota"
        nota.Description = texto
        self._colocar_nota(nota, x, y, z)
        spatial_api.assign_container(
            self.modelo, products=[nota], relating_structure=nivel_entidad
        )
        self.con_cambios = True
        return self._resultado([nota], mensaje="Nota creada.", nota=self._datos_nota(nota))

    def nota_editar(self, globalid: str, texto: str) -> dict[str, Any]:
        self._exigir_modelo()
        nota = self._nota_por_gid(globalid)
        texto = str(texto or "").strip()
        if not texto:
            raise self._error("La nota necesita un texto.", -32602)
        self._instantanea()
        nota.Description = texto
        self.con_cambios = True
        return self._resultado(
            [], modificados=[nota], mensaje="Nota editada.", nota=self._datos_nota(nota)
        )

    def nota_mover(self, globalid: str, x: float, y: float, z: float) -> dict[str, Any]:
        self._exigir_modelo()
        nota = self._nota_por_gid(globalid)
        try:
            x, y, z = float(x), float(y), float(z)
        except (TypeError, ValueError) as exc:
            raise self._error("La posición de la nota no es válida.", -32602) from exc
        if not all(math.isfinite(v) for v in (x, y, z)):
            raise self._error("La posición de la nota no es un número.", -32602)
        self._instantanea()
        self._colocar_nota(nota, x, y, z)
        # Al moverla puede cambiar de nivel: se vuelve a contener.
        try:
            spatial_api.unassign_container(self.modelo, products=[nota])
        except Exception:
            LOG.debug("la nota no tenía contenedor", exc_info=True)
        spatial_api.assign_container(
            self.modelo,
            products=[nota],
            relating_structure=self._nivel_para_nota("", z),
        )
        self.con_cambios = True
        return self._resultado(
            [], modificados=[nota], mensaje="Nota movida.", nota=self._datos_nota(nota)
        )

    def nota_borrar(self, globalid: str) -> dict[str, Any]:
        self._exigir_modelo()
        nota = self._nota_por_gid(globalid)
        self._instantanea()
        self.modelo.remove(nota)
        self.con_cambios = True
        return self._resultado([], borrados=[globalid], mensaje="Nota borrada.")

