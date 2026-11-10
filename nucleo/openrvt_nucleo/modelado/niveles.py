"""Niveles: crear, copiar, arreglo, editar, separar y borrar."""

from __future__ import annotations

from .comun import *  # noqa: F401,F403


class NivelesMixin:
    # ------------------------------------------------------------------ niveles
    def _niveles_ordenados(self) -> list[Any]:
        niveles = [n for n in self.modelo.by_type("IfcBuildingStorey") if n.Elevation is not None]
        niveles.sort(key=lambda n: float(n.Elevation or 0.0))
        return niveles

    def _nombre_nivel_automatico(self, elevacion: float) -> str:
        """O029: nombre por posición, p. ej. entre «Nivel 1» y «Nivel 2» a 1.50
        sale «Nivel 1.5»; sobre el nivel más alto, el siguiente número libre."""
        import re

        def numero(nombre: str):
            m = re.match(r"^nivel\s+(-?\d+(?:\.\d+)?)(?![0-9.])", nombre.strip(), re.I)
            return float(m.group(1)) if m else None

        niveles = [
            n for n in self.modelo.by_type("IfcBuildingStorey") if n.Elevation is not None
        ]
        ordenados = sorted(niveles, key=lambda n: float(n.Elevation or 0.0))
        inferiores = [n for n in ordenados if float(n.Elevation or 0.0) < elevacion - 1e-6]
        superiores = [n for n in ordenados if float(n.Elevation or 0.0) > elevacion + 1e-6]
        inferior = inferiores[-1] if inferiores else None
        superior = superiores[0] if superiores else None
        usados = {_nombre(n).strip().lower() for n in niveles}
        if inferior is not None and superior is not None:
            n_inf = numero(_nombre(inferior))
            n_sup = numero(_nombre(superior))
            if n_inf is not None and n_sup is not None and n_sup > n_inf + 1e-9:
                bajo, alto = n_inf, n_sup
                for _ in range(12):
                    medio = round(((bajo + alto) / 2) * 1000) / 1000
                    nombre = f"Nivel {medio:g}"
                    if nombre.strip().lower() not in usados:
                        return nombre
                    bajo = medio
        numeros = [v for v in (numero(_nombre(n)) for n in niveles) if v is not None]
        if numeros:
            return f"Nivel {max(numeros) + 1:g}"
        return f"Nivel {len(niveles)}"

    def _nombre_nivel_unico(self, nombre: str) -> str:
        """O029: dos niveles no comparten nombre; se añade « (2)», « (3)»…"""
        existentes = {_nombre(n) for n in self.modelo.by_type("IfcBuildingStorey")}
        if nombre not in existentes:
            return nombre
        i = 2
        while f"{nombre} ({i})" in existentes:
            i += 1
        return f"{nombre} ({i})"

    def _validar_elevacion_nivel(self, elevacion: float, excluir: str = "") -> None:
        """O029: dos niveles a la misma elevación (±1 mm) no se permiten."""
        for nivel in self.modelo.by_type("IfcBuildingStorey"):
            if _gid(nivel) == excluir or nivel.Elevation is None:
                continue
            if abs(float(nivel.Elevation) - elevacion) <= 0.001:
                raise self._error(
                    f"Ya existe el nivel «{_nombre(nivel)}» a la misma elevación "
                    f"({elevacion:.3f} m).",
                    -32022,
                )

    def _crear_vista_planta(
        self, nivel: Any, vistas_base: Any = None
    ) -> dict[str, Any] | None:
        """O029: la vista de planta del nivel se crea en el mismo paso (y el mismo Deshacer).

        O031: si el cliente manda las vistas de la sesión, se guardan junto con la nueva
        planta en la misma instantánea, para que Deshacer no borre las vistas automáticas.
        """
        gid = _gid(nivel)
        vistas = (
            [v for v in vistas_base if isinstance(v, dict)]
            if isinstance(vistas_base, list)
            else self.leer_vistas()
        )
        if any(v.get("tipo") == "planta" and v.get("nivel") == gid for v in vistas if isinstance(v, dict)):
            return None
        elevacion = float(nivel.Elevation or 0.0)
        inferiores = [
            float(n.Elevation)
            for n in self.modelo.by_type("IfcBuildingStorey")
            if n.Elevation is not None and float(n.Elevation) < elevacion - 1e-9
        ]
        inferior = max(inferiores) if inferiores else elevacion - 1.0
        vista = {
            "id": f"planta-{gid}",
            "nombre": f"Planta {_nombre(nivel)}",
            "tipo": "planta",
            "nivel": gid,
            "alturaPlano": elevacion + 1.2,
            "profundidad": inferior,
            "nivelesVisibles": [gid],
            "categorias": {
                "muros": True,
                "losas": True,
                "columnas": True,
                "vigas": True,
                "puertas": True,
                "ventanas": True,
                "cubiertas": True,
                "escaleras": True,
                "otros": True,
            },
            "estilo": "lineas-ocultas",
            "escala": 100,
            "alturaArriba": 3,
            "cotasEjes": True,
        }
        # O052: el nivel nuevo también entra en los alzados y en las vistas 3D
        # automáticas; si no, los elementos de ese nivel desaparecen de ellas.
        actualizadas: list[dict[str, Any]] = []
        for existente in vistas:
            if existente.get("tipo") in ("alzado", "iso", "perspectiva"):
                visibles = [
                    x for x in (existente.get("nivelesVisibles") or []) if isinstance(x, str)
                ]
                if visibles and gid not in visibles:
                    existente = {**existente, "nivelesVisibles": [*visibles, gid]}
            actualizadas.append(existente)
        self._guardar_datos_pset(
            self._pset_vistas(crear=True),
            [*actualizadas, vista],
            "JSON de las vistas",
        )
        return vista

    def _crear_nivel_sin_instantanea(
        self,
        nombre: str,
        elevacion: float,
        crear_planta: bool = True,
        vistas: Any = None,
    ) -> tuple[Any, dict[str, Any] | None]:
        nombre = (nombre or "").strip()
        if not nombre:
            raise self._error("El nivel necesita un nombre.", -32602)
        try:
            elevacion = float(elevacion)
        except (TypeError, ValueError) as exc:
            raise self._error("La elevación del nivel no es un número.", -32602) from exc
        if not math.isfinite(elevacion):
            raise self._error("La elevación del nivel no es un número.", -32602)
        self._validar_elevacion_nivel(elevacion)
        nombre = self._nombre_nivel_unico(nombre)
        nivel = root.create_entity(self.modelo, ifc_class="IfcBuildingStorey", name=nombre)
        nivel.Elevation = elevacion
        aggregate.assign_object(self.modelo, products=[nivel], relating_object=self._edificio())
        vista = self._crear_vista_planta(nivel, vistas) if crear_planta else None
        return nivel, vista

    def nivel_crear(
        self,
        nombre: str,
        elevacion: float,
        crear_planta: bool = True,
        vistas: Any = None,
    ) -> dict[str, Any]:
        self._exigir_modelo()
        self._instantanea()
        try:
            nivel, vista = self._crear_nivel_sin_instantanea(
                nombre, elevacion, bool(crear_planta), vistas
            )
        except Exception:
            self._revertir_instantanea()
            raise
        self.con_cambios = True
        return self._resultado(
            [nivel],
            mensaje=f"Nivel «{_nombre(nivel)}» creado.",
            nivel={"globalid": _gid(nivel), "nombre": _nombre(nivel), "elevacion": nivel.Elevation},
            vista=vista,
        )

    def nivel_copiar(
        self,
        globalid: str,
        desfase: float,
        crear_planta: bool = True,
        vistas: Any = None,
    ) -> dict[str, Any]:
        """O029: Copiar/Desfasar un nivel con un desfase vertical, en un solo paso."""
        self._exigir_modelo()
        origen = self._nivel_por_gid(globalid)
        try:
            desfase = float(desfase)
        except (TypeError, ValueError) as exc:
            raise self._error("El desfase del nivel no es un número.", -32602) from exc
        if not math.isfinite(desfase) or abs(desfase) <= 0.001:
            raise self._error("El desfase del nivel debe ser distinto de cero.", -32602)
        elevacion = float(origen.Elevation or 0.0) + desfase
        self._instantanea()
        try:
            nivel, vista = self._crear_nivel_sin_instantanea(
                self._nombre_nivel_automatico(elevacion),
                elevacion,
                bool(crear_planta),
                vistas,
            )
        except Exception:
            self._revertir_instantanea()
            raise
        self.con_cambios = True
        return self._resultado(
            [nivel],
            mensaje=f"Nivel «{_nombre(nivel)}» copiado a {elevacion:.3f} m.",
            nivel={"globalid": _gid(nivel), "nombre": _nombre(nivel), "elevacion": nivel.Elevation},
            vista=vista,
        )

    def niveles_arreglo(
        self,
        globalid: str,
        cantidad: int,
        separacion: float,
        crear_planta: bool = True,
        vistas: Any = None,
    ) -> dict[str, Any]:
        """O029: arreglo de N niveles a separación fija sobre un nivel base."""
        self._exigir_modelo()
        origen = self._nivel_por_gid(globalid)
        try:
            cantidad = int(cantidad)
            separacion = float(separacion)
        except (TypeError, ValueError) as exc:
            raise self._error("El arreglo de niveles necesita números.", -32602) from exc
        if cantidad < 1 or cantidad > 50:
            raise self._error("El arreglo debe tener entre 1 y 50 niveles.", -32602)
        if not math.isfinite(separacion) or abs(separacion) <= 0.001:
            raise self._error("La separación del arreglo debe ser distinta de cero.", -32602)
        base = float(origen.Elevation or 0.0)
        self._instantanea()
        creados: list[Any] = []
        vistas: list[dict[str, Any]] = []
        try:
            for i in range(1, cantidad + 1):
                nivel, vista = self._crear_nivel_sin_instantanea(
                    self._nombre_nivel_automatico(base + separacion * i),
                    base + separacion * i,
                    bool(crear_planta),
                    vistas if i == 1 else None,
                )
                creados.append(nivel)
                if vista is not None:
                    vistas.append(vista)
        except Exception:
            self._revertir_instantanea()
            raise
        self.con_cambios = True
        return self._resultado(
            creados,
            mensaje=f"{cantidad} nivel(es) creados cada {separacion:.2f} m.",
            vista=vistas or None,
        )

    def nivel_editar(
        self, globalid: str, nombre: str | None = None, elevacion: float | None = None
    ) -> dict[str, Any]:
        self._exigir_modelo()
        nivel = self._nivel_por_gid(globalid)
        if nombre is None and elevacion is None:
            raise self._error("No hay cambios para el nivel.", -32602)
        delta = 0.0
        if elevacion is not None:
            try:
                elevacion = float(elevacion)
            except (TypeError, ValueError) as exc:
                raise self._error("La elevación del nivel no es un número.", -32602) from exc
            delta = elevacion - float(nivel.Elevation or 0.0)
        self._instantanea()
        try:
            if nombre is not None:
                if not str(nombre).strip():
                    raise self._error("El nivel necesita un nombre.", -32602)
                nivel.Name = str(nombre).strip()
            modificados: list[Any] = [nivel]
            if elevacion is not None:
                nivel.Elevation = elevacion
                # O006a: los elementos contenidos acompañan al nivel. En las muestras y en
                # las casas de O003b las colocaciones son independientes del storey, así que
                # se desplazan una sola vez (nunca se mueve también el ObjectPlacement del
                # nivel, que podría duplicar el movimiento).
                if abs(delta) > TOLERANCIA_CALCULO:
                    modificados.extend(self._mover_elementos_nivel(nivel, delta))
                # O016: además de los contenidos, se recalculan los elementos cuya base o
                # tope apunta a este nivel, en la misma instantánea.
                modificados.extend(self._recalcular_restricciones({_gid(nivel)}))
        except Exception:
            self._revertir_instantanea()
            raise
        self.con_cambios = True
        return self._resultado(modificados=modificados, mensaje="Nivel actualizado.")

    def _mover_elementos_nivel(self, nivel: Any, dz: float) -> list[Any]:
        """Desplaza en Z los elementos del nivel y sus vanos (sin instantánea)."""
        productos: list[Any] = []
        vistos: set[int] = set()
        for elemento in self._elementos_de_nivel(nivel):
            for producto in self._productos_de(_gid(elemento)):
                if id(producto) not in vistos:
                    vistos.add(id(producto))
                    productos.append(producto)
        self._mover_productos(productos, 0.0, 0.0, dz)
        return [p for p in productos if not p.is_a("IfcOpeningElement")]

    def _mover_productos(self, productos: list[Any], dx: float, dy: float, dz: float) -> None:
        """Aplica una traslación en mundo a una lista de productos, sin deshacer."""
        matrices = {
            id(producto): self._matriz_traslado(producto, dx, dy, dz)
            for producto in productos
        }
        for producto in productos:
            geometry_api.edit_object_placement(
                self.modelo,
                product=producto,
                matrix=matrices[id(producto)],
                is_si=True,
                should_transform_children=False,
            )


    def niveles_separacion(
        self, inferior: str, superior: str, altura: float, cadena: bool = True
    ) -> dict[str, Any]:
        """O006a: fija la altura entre dos niveles y, en cadena, arrastra los de arriba."""
        self._exigir_modelo()
        if inferior == superior:
            raise self._error("El nivel inferior y el superior deben ser distintos.", -32602)
        nivel_inferior = self._nivel_por_gid(inferior)
        nivel_superior = self._nivel_por_gid(superior)
        try:
            altura = float(altura)
        except (TypeError, ValueError) as exc:
            raise self._error("La altura entre niveles no es un número.", -32602) from exc
        if altura <= 0:
            raise self._error("La altura entre niveles debe ser mayor que cero.", -32602)
        base = float(nivel_inferior.Elevation or 0.0)
        anterior = float(nivel_superior.Elevation or 0.0)
        destino = base + altura
        delta = destino - anterior
        self._instantanea()
        try:
            modificados: list[Any] = [nivel_superior]
            nivel_superior.Elevation = destino
            cambiados = {_gid(nivel_superior)}
            if abs(delta) > TOLERANCIA_CALCULO:
                modificados.extend(self._mover_elementos_nivel(nivel_superior, delta))
            if cadena:
                arrastrados = [
                    n
                    for n in self.modelo.by_type("IfcBuildingStorey")
                    if n != nivel_superior
                    and float(n.Elevation or 0.0) > anterior + TOLERANCIA_CALCULO
                ]
                arrastrados.sort(key=lambda n: float(n.Elevation or 0.0))
                for nivel in arrastrados:
                    nivel.Elevation = float(nivel.Elevation or 0.0) + delta
                    modificados.append(nivel)
                    cambiados.add(_gid(nivel))
                    if abs(delta) > TOLERANCIA_CALCULO:
                        modificados.extend(self._mover_elementos_nivel(nivel, delta))
            modificados.extend(self._recalcular_restricciones(cambiados))
        except Exception:
            self._revertir_instantanea()
            raise
        self.con_cambios = True
        return self._resultado(
            modificados=modificados,
            mensaje=f"Separación entre niveles fijada en {altura:.2f} m.",
        )

    def nivel_borrar(self, globalid: str) -> dict[str, Any]:
        self._exigir_modelo()
        nivel = self._nivel_por_gid(globalid)
        elementos = [
            e
            for rel in (getattr(nivel, "ContainsElements", ()) or ())
            for e in (getattr(rel, "RelatedElements", ()) or ())
        ]
        if elementos:
            raise self._error(
                f"El nivel «{_nombre(nivel)}» tiene {len(elementos)} elemento(s); "
                "bórrelos antes de borrar el nivel.",
                -32021,
            )
        gid_nivel = _gid(nivel)
        ligados = []
        for elemento in (
            self.modelo.by_type("IfcWall")
            + self.modelo.by_type("IfcColumn")
            + self.modelo.by_type("IfcBeam")
            + self.modelo.by_type("IfcFooting")
        ):
            restriccion = self._restricciones_de(elemento)
            if gid_nivel in (restriccion.get("NivelBase"), restriccion.get("NivelTope")):
                ligados.append(_nombre(elemento) or elemento.is_a())
        if ligados:
            raise self._error(
                f"El nivel «{_nombre(nivel)}» lo usan {len(ligados)} elemento(s) como "
                "base o tope: " + ", ".join(ligados) + ". Cámbielos antes de borrar el nivel.",
                -32021,
            )
        self._instantanea()
        gid = _gid(nivel)
        self.modelo.remove(nivel)
        self.con_cambios = True
        return self._resultado(borrados=[gid], mensaje="Nivel borrado.")

