"""Cotas, separaciones y retícula de ejes (O006a)."""

from __future__ import annotations

from .comun import *  # noqa: F401,F403


class EjesCotasMixin:
    def _eje_por_gid(self, globalid: str) -> tuple[Any, Any]:
        for grid in self.modelo.by_type("IfcGrid"):
            for eje in self._ejes(grid):
                if self._id_eje(grid, eje) == globalid:
                    return grid, eje
        raise self._error(f"No existe el eje {globalid}.", -32005)

    def _puntos_curva_eje(self, eje: Any) -> list[Any]:
        curva = getattr(eje, "AxisCurve", None)
        puntos = list(getattr(curva, "Points", ()) or ())
        if len(puntos) < 2:
            raise self._error("El eje no tiene una curva de dos puntos editable.", -32028)
        return puntos

    def _direccion_eje(self, eje: Any) -> tuple[float, float, float, float, float, float, float]:
        """Devuelve (x1, y1, x2, y2, ux, uy, largo) de un IfcGridAxis."""
        puntos = self._puntos_curva_eje(eje)
        c1 = list(getattr(puntos[0], "Coordinates", ()) or ())
        c2 = list(getattr(puntos[-1], "Coordinates", ()) or ())
        x1, y1 = float(c1[0]), float(c1[1])
        x2, y2 = float(c2[0]), float(c2[1])
        largo = math.hypot(x2 - x1, y2 - y1)
        if largo <= TOLERANCIA_CALCULO:
            raise self._error("El eje no tiene longitud.", -32028)
        return x1, y1, x2, y2, (x2 - x1) / largo, (y2 - y1) / largo, largo

    def _desplazar_eje(self, eje: Any, nx: float, ny: float, distancia: float) -> None:
        for punto in self._puntos_curva_eje(eje):
            coords = list(getattr(punto, "Coordinates", ()) or ())
            coords[0] = float(coords[0]) + nx * distancia
            coords[1] = float(coords[1]) + ny * distancia
            punto.Coordinates = tuple(coords)

    def ejes_mover(self, globalid: str, desplazamiento: float) -> dict[str, Any]:
        """O006a: desplaza un eje en perpendicular a su dirección (signo incluido)."""
        self._exigir_modelo()
        try:
            desplazamiento = float(desplazamiento)
        except (TypeError, ValueError) as exc:
            raise self._error("El desplazamiento del eje no es un número.", -32602) from exc
        grid, eje = self._eje_por_gid(globalid)
        _x1, _y1, _x2, _y2, ux, uy, _largo = self._direccion_eje(eje)
        # Normal derecha de la dirección: positiva hacia la derecha del eje dibujado.
        nx, ny = uy, -ux
        self._instantanea()
        self._desplazar_eje(eje, nx, ny, desplazamiento)
        # O006d: los extremos de la familia opuesta siguen rebasando la misma distancia.
        self._recalcular_reticula(grid)
        # O007c: las columnas ligadas al eje se mueven con él (y sus zapatas).
        modificados = [globalid]
        columnas = self._mover_columnas_de_eje(globalid, nx, ny, desplazamiento)
        modificados.extend(_gid(e) for e in columnas)
        # O026: los elementos con candado cerrado siguen a su eje de referencia.
        modificados.extend(
            _gid(e)
            for e in self._mover_alineados_de_referencia(
                globalid,
                nx * desplazamiento,
                ny * desplazamiento,
                {_gid(e) for e in columnas},
            )
        )
        # O028: los enlaces a cruces y tramos se recalculan con la posición nueva.
        propagados = self._propagar_enlaces_de_eje(globalid)
        modificados.extend(_gid(e) for e in propagados)
        # O032: los bordes de losa que citan este eje o los muros movidos se regeneran.
        self._regenerar_losas_de_bordes(
            {globalid} | {_gid(e) for e in propagados if e.is_a("IfcWall")}
        )
        self.con_cambios = True
        return self._resultado(
            modificados=modificados,
            mensaje=f"Eje desplazado {desplazamiento:.2f} m.",
        )

    def ejes_separacion(
        self,
        referencia: str,
        mover: str,
        distancia: float,
        cadena: bool = True,
    ) -> dict[str, Any]:
        """O006a: deja `mover` a `distancia` de `referencia`; el resto conserva sus huecos."""
        self._exigir_modelo()
        if referencia == mover:
            raise self._error("El eje de referencia y el que se mueve deben ser distintos.", -32602)
        try:
            distancia = float(distancia)
        except (TypeError, ValueError) as exc:
            raise self._error("La distancia entre ejes no es un número.", -32602) from exc
        if distancia <= 0:
            raise self._error("La distancia entre ejes debe ser mayor que cero.", -32602)
        grid, eje_ref = self._eje_por_gid(referencia)
        _g, eje_mover = self._eje_por_gid(mover)
        xr, yr, _xr2, _yr2, ux, uy, _lr = self._direccion_eje(eje_ref)
        xm, ym, _xm2, _ym2, umx, umy, _lm = self._direccion_eje(eje_mover)
        if abs(ux * umy - uy * umx) > 1e-6:
            raise self._error(
                "Los ejes deben ser paralelos para acotar la separación entre ellos.",
                -32027,
            )
        nx, ny = uy, -ux
        s_ref = xr * nx + yr * ny
        s_mover = xm * nx + ym * ny
        lado = 1.0 if s_mover - s_ref >= 0 else -1.0
        objetivo = s_ref + distancia * lado
        delta = objetivo - s_mover
        self._instantanea()
        modificados = [mover]
        self._desplazar_eje(eje_mover, nx, ny, delta)
        modificados.extend(
            _gid(e) for e in self._mover_columnas_de_eje(mover, nx, ny, delta)
        )
        if cadena:
            for candidato in self._ejes(grid):
                if candidato == eje_mover:
                    continue
                try:
                    cx1, cy1, _cx2, _cy2, cux, cuy, _cl = self._direccion_eje(candidato)
                except Exception:
                    continue
                if abs(ux * cuy - uy * cux) > 1e-6:
                    continue
                s_c = cx1 * nx + cy1 * ny
                # «Más allá» de mover: del lado contrario a la referencia.
                if (s_c - s_mover) * lado > 1e-6:
                    self._desplazar_eje(candidato, nx, ny, delta)
                    gid_candidato = self._id_eje(grid, candidato)
                    modificados.append(gid_candidato)
                    modificados.extend(
                        _gid(e) for e in self._mover_columnas_de_eje(
                            gid_candidato, nx, ny, delta
                        )
                    )
        # O006d: al cambiar una separación se recalculan los extremos de la otra familia.
        self._recalcular_reticula(grid)
        # O026: los elementos con candado siguen a cada eje desplazado.
        movidos = set()
        for gid_eje in list(dict.fromkeys(modificados)):
            if gid_eje in movidos:
                continue
            movidos.add(gid_eje)
            modificados.extend(
                _gid(e)
                for e in self._mover_alineados_de_referencia(
                    gid_eje, nx * delta, ny * delta
                )
            )
            modificados.extend(
                _gid(e) for e in self._propagar_enlaces_de_eje(gid_eje)
            )
            self._regenerar_losas_de_bordes({gid_eje})
        # O032: también las losas cuyos bordes citan los muros movidos.
        self._regenerar_losas_de_bordes({g for g in modificados if g})
        self.con_cambios = True
        return self._resultado(
            modificados=modificados,
            mensaje=f"Separación entre ejes fijada en {distancia:.2f} m.",
        )

    def _etiqueta_siguiente(self, primera: str, indice: int) -> str:
        if primera.isdigit():
            return str(int(primera) + indice)
        if len(primera) == 1 and primera.isalpha():
            return chr(ord(primera.upper()) + indice)
        raise self._error(
            "La primera etiqueta debe ser un número (1) o una letra (A).", -32602
        )

    def _distancias_ejes(self, separaciones: Any) -> list[float]:
        if isinstance(separaciones, str):
            crudas = [s for s in separaciones.replace(";", ",").split(",")]
        elif isinstance(separaciones, (list, tuple)):
            crudas = list(separaciones)
        else:
            raise self._error("Las separaciones deben ser una lista de números.", -32602)
        distancias: list[float] = []
        for cruda in crudas:
            texto = str(cruda).strip()
            if not texto:
                continue
            try:
                valor = float(texto.replace(",", "."))
            except ValueError as exc:
                raise self._error(
                    f"La separación «{texto}» no es un número.", -32602
                ) from exc
            if valor <= 0:
                raise self._error("Las separaciones deben ser mayores que cero.", -32602)
            distancias.append(valor)
        return distancias

    def _etiquetas_ejes(
        self, direccion: str, primera_etiqueta: str, cantidad: int
    ) -> list[str]:
        primera = (primera_etiqueta or "").strip()
        if not primera:
            primera = "1" if direccion == "vertical" else "A"
        return [self._etiqueta_siguiente(primera, i) for i in range(cantidad + 1)]

    def _crear_familia_ejes(
        self,
        grid: Any,
        direccion: str,
        origen: float,
        distancias: list[float],
        longitud: float,
        etiquetas: list[str],
    ) -> list[str]:
        creados: list[str] = []
        posicion = origen
        for indice, etiqueta in enumerate(etiquetas):
            if indice > 0:
                posicion += distancias[indice - 1]
            eje = grid_api.create_grid_axis(
                self.modelo,
                grid=grid,
                axis_tag=etiqueta,
                uvw_axes="UAxes" if direccion == "vertical" else "VAxes",
            )
            if direccion == "vertical":
                p1 = (posicion, 0.0, 0.0)
                p2 = (posicion, longitud, 0.0)
            else:
                p1 = (0.0, posicion, 0.0)
                p2 = (longitud, posicion, 0.0)
            grid_api.create_axis_curve(
                self.modelo, p1=p1, p2=p2, grid_axis=eje, is_si=True
            )
            creados.append(self._id_eje(grid, eje))
        return creados

    def _guardar_reticula(self, grid: Any, modo: str, rebase: float) -> None:
        self._guardar_pset(
            grid, "OPENRVT_Reticula", {"Modo": modo, "Rebase": float(rebase)}
        )

    def _leer_reticula(self, grid: Any) -> tuple[str, float]:
        datos = self._leer_pset(grid, "OPENRVT_Reticula")
        modo = str(datos.get("Modo") or "origen")
        try:
            rebase = float(datos.get("Rebase") or 1.5)
        except (TypeError, ValueError):
            rebase = 1.5
        return modo, rebase

    @staticmethod
    def _familia_eje(eje: Any) -> str:
        """«vertical» si el eje corre en Y; «horizontal» si corre en X."""
        try:
            puntos = list(getattr(getattr(eje, "AxisCurve", None), "Points", ()) or ())
            c1 = list(getattr(puntos[0], "Coordinates", ()) or ())
            c2 = list(getattr(puntos[-1], "Coordinates", ()) or ())
            return "vertical" if abs(float(c2[0]) - float(c1[0])) < abs(
                float(c2[1]) - float(c1[1])
            ) else "horizontal"
        except (IndexError, TypeError, ValueError):
            return "vertical"

    def _recalcular_reticula(self, grid: Any) -> list[str]:
        """O006d: extiende cada familia hasta rebasar la perpendicular."""
        modo, rebase = self._leer_reticula(grid)
        if modo != "rebase":
            return []
        verticales = [e for e in self._ejes(grid) if self._familia_eje(e) == "vertical"]
        horizontales = [
            e for e in self._ejes(grid) if self._familia_eje(e) == "horizontal"
        ]
        if not verticales or not horizontales:
            return []
        xs = [self._direccion_eje(e)[0] for e in verticales]
        ys = [self._direccion_eje(e)[1] for e in horizontales]
        y1, y2 = min(ys) - rebase, max(ys) + rebase
        x1, x2 = min(xs) - rebase, max(xs) + rebase
        modificados: list[str] = []
        for eje in verticales:
            x = self._direccion_eje(eje)[0]
            puntos = self._puntos_curva_eje(eje)
            for punto, (px, py) in zip(puntos, ((x, y1), (x, y2))):
                coords = list(getattr(punto, "Coordinates", ()) or ())
                coords[0], coords[1] = px, py
                punto.Coordinates = tuple(coords)
            modificados.append(self._id_eje(grid, eje))
        for eje in horizontales:
            y = self._direccion_eje(eje)[1]
            puntos = self._puntos_curva_eje(eje)
            for punto, (px, py) in zip(puntos, ((x1, y), (x2, y))):
                coords = list(getattr(punto, "Coordinates", ()) or ())
                coords[0], coords[1] = px, py
                punto.Coordinates = tuple(coords)
            modificados.append(self._id_eje(grid, eje))
        return modificados

    def ejes_reticula(self) -> dict[str, Any]:
        """O006d: modo y rebase guardados en el pset OPENRVT_Reticula del IfcGrid."""
        self._exigir_modelo()
        grids = self.modelo.by_type("IfcGrid")
        modo, rebase = self._leer_reticula(grids[0]) if grids else ("origen", 1.5)
        return {"modo": modo, "rebase": rebase}

    def ejes_rebase(self, rebase: Any) -> dict[str, Any]:
        """O006d: cambia el rebase de la retícula y recalcula los extremos."""
        self._exigir_modelo()
        try:
            valor = float(rebase)
        except (TypeError, ValueError) as exc:
            raise self._error("El rebase debe ser un número.", -32602) from exc
        if valor <= 0:
            raise self._error("El rebase debe ser mayor que cero.", -32602)
        grid = self._grid()
        modo, _ = self._leer_reticula(grid)
        self._instantanea()
        self._guardar_reticula(grid, modo, valor)
        modificados = self._recalcular_reticula(grid)
        self.con_cambios = True
        return self._resultado(
            modificados=modificados,
            mensaje=f"Rebase de la retícula fijado en {valor:.2f} m.",
        )

    def ejes_crear_por_separaciones(
        self,
        direccion: str,
        origen: float,
        separaciones: Any,
        longitud: float,
        primera_etiqueta: str,
        modo: str = "origen",
        rebase: float = 1.5,
    ) -> dict[str, Any]:
        """O006a/O006d: crea una familia de ejes a partir de las separaciones."""
        self._exigir_modelo()
        direccion = (direccion or "").strip().casefold()
        if direccion not in ("vertical", "horizontal"):
            raise self._error("La dirección debe ser «vertical» u «horizontal».", -32602)
        try:
            origen = float(origen)
            longitud = float(longitud)
            rebase = float(rebase)
        except (TypeError, ValueError) as exc:
            raise self._error("El origen y la longitud deben ser números.", -32602) from exc
        if longitud <= 0:
            raise self._error("La longitud de los ejes debe ser mayor que cero.", -32602)
        distancias = self._distancias_ejes(separaciones)
        if not distancias:
            raise self._error("Indique al menos una separación entre ejes.", -32602)
        etiquetas = self._etiquetas_ejes(direccion, primera_etiqueta, len(distancias))
        grid = self._grid()
        usadas = {_etiqueta_eje(a).casefold() for a in self._ejes(grid)}
        repetidas = [e for e in etiquetas if e.casefold() in usadas]
        if repetidas:
            raise self._error(
                f"Ya existe un eje con la etiqueta «{repetidas[0]}».", -32026
            )
        self._instantanea()
        creados = self._crear_familia_ejes(
            grid, direccion, origen, distancias, longitud, etiquetas
        )
        self._guardar_reticula(grid, modo, rebase)
        if modo == "rebase":
            self._recalcular_reticula(grid)
        self.con_cambios = True
        return self._resultado(
            creados=creados,
            etiquetas=etiquetas,
            mensaje=f"{len(creados)} eje(s) creado(s) por separaciones.",
        )

    def ejes_crear_reticula(
        self,
        vertical: dict[str, Any] | None,
        horizontal: dict[str, Any] | None,
        modo: str = "rebase",
        rebase: float = 1.5,
    ) -> dict[str, Any]:
        """O006d: retícula en ambos sentidos, desde el origen o rebasando la opuesta."""
        self._exigir_modelo()
        modo = (modo or "rebase").strip().casefold()
        if modo not in ("origen", "rebase"):
            raise self._error("El modo debe ser «origen» o «rebase».", -32602)
        try:
            rebase = float(rebase)
        except (TypeError, ValueError) as exc:
            raise self._error("El rebase debe ser un número.", -32602) from exc
        if rebase <= 0:
            raise self._error("El rebase debe ser mayor que cero.", -32602)
        bloques: list[tuple[str, dict[str, Any]]] = []
        for direccion, bloque in (("vertical", vertical), ("horizontal", horizontal)):
            if bloque is None:
                continue
            separaciones = bloque.get("separaciones")
            distancias = self._distancias_ejes(separaciones if separaciones is not None else [])
            if not distancias:
                continue
            try:
                origen = float(bloque.get("origen", 0.0))
                longitud = float(bloque.get("longitud", 20.0))
            except (TypeError, ValueError) as exc:
                raise self._error(
                    "El origen y la longitud deben ser números.", -32602
                ) from exc
            if longitud <= 0:
                raise self._error(
                    "La longitud de los ejes debe ser mayor que cero.", -32602
                )
            etiquetas = self._etiquetas_ejes(
                direccion, str(bloque.get("primera_etiqueta") or ""), len(distancias)
            )
            bloques.append(
                (direccion, {
                    "origen": origen,
                    "longitud": longitud,
                    "distancias": distancias,
                    "etiquetas": etiquetas,
                })
            )
        if not bloques:
            raise self._error("Indique al menos una familia de ejes.", -32602)
        # Con una sola familia se usa el modo origen (regla de O006d).
        modo_efectivo = "origen" if len(bloques) == 1 else modo
        grid = self._grid()
        usadas = {_etiqueta_eje(a).casefold() for a in self._ejes(grid)}
        for _direccion, bloque in bloques:
            repetidas = [e for e in bloque["etiquetas"] if e.casefold() in usadas]
            if repetidas:
                raise self._error(
                    f"Ya existe un eje con la etiqueta «{repetidas[0]}».", -32026
                )
            usadas.update(e.casefold() for e in bloque["etiquetas"])
        self._instantanea()
        creados: list[str] = []
        etiquetas: list[str] = []
        for direccion, bloque in bloques:
            creados.extend(
                self._crear_familia_ejes(
                    grid,
                    direccion,
                    bloque["origen"],
                    bloque["distancias"],
                    bloque["longitud"],
                    bloque["etiquetas"],
                )
            )
            etiquetas.extend(bloque["etiquetas"])
        self._guardar_reticula(grid, modo_efectivo, rebase)
        if modo_efectivo == "rebase":
            self._recalcular_reticula(grid)
        self.con_cambios = True
        return self._resultado(
            creados=creados,
            etiquetas=etiquetas,
            modo=modo_efectivo,
            rebase=rebase,
            mensaje=f"{len(creados)} eje(s) creado(s) para la retícula.",
        )

