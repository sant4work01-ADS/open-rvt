"""Interacciones de Cuantificación de la estructura por prioridad (O007c).

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


class CantidadesMixin:
    """Cuantificación de la estructura por prioridad (O007c)."""


    def cantidades_estructura(self, nivel: str | None = None) -> dict[str, Any]:
        self._exigir_modelo()
        from shapely.geometry import Polygon
        from shapely.ops import unary_union

        elementos: list[dict[str, Any]] = []
        piezas: list[dict[str, Any]] = []
        # O063: cada cálculo empieza sin avisos de losas ilegibles.
        self._avisos_losa = []
        for elemento in self.modelo.by_type("IfcElement"):
            if not self._es_elemento(elemento):
                continue
            if elemento.is_a("IfcDoor") or elemento.is_a("IfcWindow"):
                continue
            if nivel and _gid(self._nivel_de_elemento(elemento)) != nivel:
                continue
            info = self._piezas_de_elemento(elemento)
            if info is None or not info["piezas"]:
                continue
            for pieza in info["piezas"]:
                piezas.append({**pieza, "indice": len(elementos)})
            elementos.append(info)
        if not piezas:
            return {
                "elementos": [], "totales_por_tipo": {}, "total": {
                    "volumen_bruto_m3": 0.0, "volumen_neto_m3": 0.0, "acero_kg": 0.0,
                },
            }
        # Rebanadas en z por todas las elevaciones de inicio y fin.
        zetas = sorted({
            round(z, 6)
            for pieza in piezas
            for z in (pieza["z0"], pieza["z1"])
        })
        union_total = 0.0
        neto_por_indice: dict[int, float] = {i: 0.0 for i in range(len(elementos))}
        for z0, z1 in zip(zetas, zetas[1:]):
            dz = z1 - z0
            if dz <= TOLERANCIA_CALCULO:
                continue
            z = (z0 + z1) / 2.0
            activas = [p for p in piezas if p["z0"] <= z < p["z1"]]
            if not activas:
                continue
            agrupadas: dict[int, dict[str, Any]] = {}
            for pieza in activas:
                poligono = pieza["poligono"]()
                if poligono is None or poligono.is_empty:
                    continue
                grupo = agrupadas.setdefault(
                    pieza["indice"],
                    {"prioridad": pieza["prioridad"], "poligonos": []},
                )
                grupo["poligonos"].append(poligono)
            if not agrupadas:
                continue
            # Se asigna cada punto al elemento de mayor prioridad. Dentro de la misma
            # prioridad el orden por GlobalId es estable, de modo que la suma de netos
            # es exactamente el volumen de la unión (sin contar dos veces traslapes).
            ordenadas = sorted(
                agrupadas.items(),
                key=lambda par: (par[1]["prioridad"], elementos[par[0]]["globalid"]),
            )
            acumulado = None
            for indice, grupo in ordenadas:
                propio = unary_union(grupo["poligonos"])
                neto = propio if acumulado is None else propio.difference(acumulado)
                neto_por_indice[indice] += neto.area * dz
                acumulado = propio if acumulado is None else unary_union([acumulado, propio])
            if acumulado is not None:
                union_total += acumulado.area * dz
        for indice, info in enumerate(elementos):
            bruto = info.get("volumen_bruto_m3", 0.0)
            neto = neto_por_indice[indice]
            if info["alias"] == "zapata_corrida":
                # El bruto es el área real de la sección; el neto usa el prisma completo.
                neto = info.get("volumen_neto_aproximado", neto)
            info["volumen_bruto_m3"] = round(bruto, 6)
            info["volumen_neto_m3"] = round(neto, 6)
            info["acero_kg"] = round(info.get("acero_kg", 0.0), 3)
            info.pop("piezas", None)
            info.pop("volumen_neto_aproximado", None)
        totales: dict[str, dict[str, float]] = {}
        for info in elementos:
            tipo = info["tipo"] or info["clase"]
            acumulado = totales.setdefault(
                tipo, {"volumen_bruto_m3": 0.0, "volumen_neto_m3": 0.0, "acero_kg": 0.0}
            )
            acumulado["volumen_bruto_m3"] += info["volumen_bruto_m3"]
            acumulado["volumen_neto_m3"] += info["volumen_neto_m3"]
            acumulado["acero_kg"] += info["acero_kg"]
        for acumulado in totales.values():
            for clave in acumulado:
                acumulado[clave] = round(acumulado[clave], 6)
        return {
            "elementos": elementos,
            "totales_por_tipo": totales,
            "total": {
                "volumen_bruto_m3": round(
                    sum(i["volumen_bruto_m3"] for i in elementos), 6
                ),
                "volumen_neto_m3": round(
                    sum(i["volumen_neto_m3"] for i in elementos), 6
                ),
                "acero_kg": round(sum(i["acero_kg"] for i in elementos), 3),
            },
            "union_m3": round(union_total, 6),
            "avisos": list(getattr(self, "_avisos_losa", [])),
        }

    def _partir_base_muro_por_bajadas(
        self,
        base: Any,
        z0: float,
        bajadas: list[tuple[float, float, float]],
        datos: dict[str, Any],
    ) -> list[tuple[Any, float]]:
        """O035: parte la huella del muro en tramos con su cota de base."""
        if not bajadas:
            return [(base, z0)]
        from shapely.geometry import LineString
        from shapely.ops import split

        ux, uy = float(datos["dx"]), float(datos["dy"])
        nx, ny = -uy, ux
        x1, y1 = float(datos["x1"]), float(datos["y1"])
        piezas = [base]
        for u in sorted({u for a, b, _z in bajadas for u in (a, b)}):
            if u <= TOLERANCIA_CALCULO:
                continue
            px, py = x1 + ux * u, y1 + uy * u
            corte = LineString(
                [
                    (px - nx * 1e5, py - ny * 1e5),
                    (px + nx * 1e5, py + ny * 1e5),
                ]
            )
            nuevas: list[Any] = []
            for pieza in piezas:
                if pieza.is_empty or not corte.intersects(pieza):
                    nuevas.append(pieza)
                    continue
                try:
                    nuevas.extend(list(split(pieza, corte).geoms))
                except Exception:
                    nuevas.append(pieza)
            piezas = nuevas
        salida: list[tuple[Any, float]] = []
        for pieza in piezas:
            if pieza.is_empty or pieza.area <= TOLERANCIA_CALCULO:
                continue
            punto = pieza.representative_point()
            u, _v = self._punto_en_local(datos, punto.x, punto.y)
            z = z0
            for u0, u1, cara in bajadas:
                if u0 < u < u1:
                    z = cara
                    break
            salida.append((pieza, z))
        return salida or [(base, z0)]

    def _area_embebida_muro(
        self, muro: Any, datos: dict[str, Any], nucleo: float
    ) -> float:
        """O045: área del muro ocupada por cerramientos y castillos embebidos.

        Se mide en el plano del muro (largo × alto) y se limita al espesor del
        núcleo. La huella de los castillos ya viene recortada en la base del muro;
        por eso se suma su unión y luego se le resta la de los propios castillos,
        para no descontarla dos veces.
        """
        if nucleo <= TOLERANCIA_CALCULO:
            return 0.0
        from shapely.geometry import box
        from shapely.ops import unary_union

        def area_de(cajas: list[Any]) -> float:
            if not cajas:
                return 0.0
            return float(unary_union(cajas).area)

        cerramientos: list[Any] = []
        castillos: list[Any] = []
        for dependiente in self._dependientes_de(muro):
            alias = self._estructura_de_tipo(self._tipo_entidad(dependiente))
            if alias not in ("cerramiento", "castillo"):
                continue
            pset = self._leer_pset(dependiente, "OPENRVT_Estructura")
            if not pset:
                continue
            alto = float(pset.get("H") or self._peralte_de(dependiente) or 0.20)
            if alias == "cerramiento":
                x1 = float(pset.get("X1") or 0.0)
                y1 = float(pset.get("Y1") or 0.0)
                x2 = float(pset.get("X2") or 0.0)
                y2 = float(pset.get("Y2") or 0.0)
                u1 = (x1 - datos["x1"]) * datos["dx"] + (
                    y1 - datos["y1"]
                ) * datos["dy"]
                u2 = (x2 - datos["x1"]) * datos["dx"] + (
                    y2 - datos["y1"]
                ) * datos["dy"]
                z = float(pset.get("Z") or 0.0)
                z0 = max(float(datos["z"]), z - alto / 2.0)
                z1 = min(float(datos["z"]) + float(datos["altura"]), z + alto / 2.0)
            else:
                liga = self._leer_liga(dependiente)
                distancia = float(liga.get("Distancia") or 0.0)
                ancho = float(
                    pset.get("B")
                    or self._seccion_y_armado(self._tipo_entidad(dependiente))[1].get(
                        "B"
                    )
                    or 0.15
                )
                u1 = distancia - ancho / 2.0
                u2 = distancia + ancho / 2.0
                # O050: el castillo ya no atraviesa el cerramiento, pero la huella
                # del muro lo excluye en todo su alto; para descontar bien el
                # cerramiento se proyecta el castillo a la altura completa.
                z0 = float(datos["z"])
                z1 = float(datos["z"]) + float(datos["altura"])
            u1, u2 = max(0.0, min(u1, u2)), min(datos["longitud"], max(u1, u2))
            if u2 - u1 <= TOLERANCIA_CALCULO or z1 - z0 <= TOLERANCIA_CALCULO:
                continue
            (cerramientos if alias == "cerramiento" else castillos).append(
                box(u1, z0, u2, z1)
            )
        if not cerramientos:
            return 0.0
        if not castillos:
            return area_de(cerramientos)
        return max(area_de(cerramientos + castillos) - area_de(castillos), 0.0)

    def _piezas_de_elemento(self, elemento: Any) -> dict[str, Any] | None:
        from shapely.geometry import Polygon

        clase = elemento.is_a()
        tipo_entidad = self._tipo_entidad(elemento)
        alias = self._estructura_de_tipo(tipo_entidad)
        if elemento.is_a("IfcWall"):
            alias = "muro"
        elif elemento.is_a("IfcSlab"):
            alias = "losa"
        if alias is None:
            return None
        pset = self._leer_pset(elemento, "OPENRVT_Estructura")
        tipo_nombre = _nombre(tipo_entidad)
        acero = 0.0
        try:
            if alias not in ("muro", "losa"):
                acero = float(self.acero_estimar(_gid(elemento)).get("total_kg") or 0.0)
        except Exception:
            acero = 0.0
        piezas: list[dict[str, Any]] = []
        bruto = 0.0
        detalle: dict[str, Any] = {}
        area_neta = None

        def caja(cx: float, cy: float, rot: float, largo: float, ancho: float,
                 z0: float, z1: float, volumen: float | None = None) -> None:
            coseno, seno = math.cos(rot), math.sin(rot)
            puntos = []
            for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                lx, ly = sx * largo / 2.0, sy * ancho / 2.0
                puntos.append((cx + lx * coseno - ly * seno, cy + lx * seno + ly * coseno))
            poligono = Polygon(puntos)
            piezas.append(
                {
                    "poligono": (lambda p=poligono: p),
                    "z0": z0, "z1": z1,
                    "prioridad": PRIORIDAD.get(alias, 9),
                    "volumen": volumen,
                }
            )
            return poligono.area * (z1 - z0) if volumen is None else volumen

        if alias in ("columna", "castillo"):
            _, seccion, _ = self._seccion_y_armado(tipo_entidad)
            b = float(pset.get("B") or seccion.get("B") or 0.30)
            h = float(pset.get("H") or seccion.get("H") or 0.30)
            if _texto(seccion.get("Forma")) == "circular" and not pset.get("B"):
                b = h = float(seccion.get("D") or 0.30)
            base = float(pset.get("Base") or 0.0)
            alto = float(pset.get("Altura") or 0.0)
            bruto = caja(
                float(pset.get("X") or 0.0), float(pset.get("Y") or 0.0),
                float(pset.get("Rotacion") or 0.0), b, h, base, base + alto,
            )
        elif alias in ("trabe", "cerramiento", "dala", "contratrabe"):
            _, seccion, _ = self._seccion_y_armado(tipo_entidad)
            b = float(pset.get("B") or seccion.get("B") or 0.20)
            h = float(pset.get("H") or seccion.get("H") or 0.40)
            x1, y1 = float(pset.get("X1") or 0.0), float(pset.get("Y1") or 0.0)
            x2, y2 = float(pset.get("X2") or 0.0), float(pset.get("Y2") or 0.0)
            largo = math.hypot(x2 - x1, y2 - y1)
            if largo <= TOLERANCIA_CALCULO:
                return None
            ux, uy = (x2 - x1) / largo, (y2 - y1) / largo
            rot = math.atan2(uy, ux)
            z = float(pset.get("Z") or 0.0)
            bruto = b * h * largo
            # O012: el neto sale de los tramos ya recortados por las uniones.
            tramos = self._tramos_de_viga(elemento)
            for s0, s1 in tramos:
                if s1 - s0 <= TOLERANCIA_CALCULO:
                    continue
                cx = x1 + ux * (s0 + s1) / 2.0
                cy = y1 + uy * (s0 + s1) / 2.0
                caja(cx, cy, rot, s1 - s0, b, z - h / 2.0, z + h / 2.0)
        elif alias == "zapata":
            _, seccion, _ = self._seccion_y_armado(tipo_entidad)
            largo = float(seccion.get("Largo") or 1.20)
            ancho = float(seccion.get("Ancho") or 1.20)
            peralte = float(seccion.get("Peralte") or 0.25)
            plantilla = float(seccion.get("Plantilla") or 0.05)
            dado_b = float(seccion.get("DadoB") or 0.0)
            dado_h = float(seccion.get("DadoH") or 0.0)
            dado_alto = float(seccion.get("DadoAlto") or 0.0)
            z = float(pset.get("Z") or 0.0)
            cx, cy = float(pset.get("X") or 0.0), float(pset.get("Y") or 0.0)
            rot = float(pset.get("Rotacion") or 0.0)
            if plantilla > 0:
                bruto += caja(cx, cy, rot, largo, ancho, z - plantilla, z)
            bruto += caja(cx, cy, rot, largo, ancho, z, z + peralte)
            if dado_b > 0 and dado_h > 0 and dado_alto > 0:
                bruto += caja(cx, cy, rot, dado_b, dado_h, z + peralte, z + peralte + dado_alto)
        elif alias == "zapata_corrida":
            _, seccion, _ = self._seccion_y_armado(tipo_entidad)
            ancho = float(seccion.get("Ancho") or 0.60)
            peralte = float(seccion.get("Peralte") or 0.20)
            corona = float(seccion.get("Corona") or 0.0)
            plantilla = float(seccion.get("Plantilla") or 0.05)
            x1, y1 = float(pset.get("X1") or 0.0), float(pset.get("Y1") or 0.0)
            x2, y2 = float(pset.get("X2") or 0.0), float(pset.get("Y2") or 0.0)
            largo = math.hypot(x2 - x1, y2 - y1)
            if largo <= TOLERANCIA_CALCULO:
                return None
            ux, uy = (x2 - x1) / largo, (y2 - y1) / largo
            rot = math.atan2(uy, ux)
            z = float(pset.get("Z") or 0.0)
            area_seccion = (ancho + (corona if corona > 0 else ancho)) / 2.0 * peralte
            bruto = area_seccion * largo
            if plantilla > 0:
                bruto += ancho * plantilla * largo
            caja((x1 + x2) / 2.0, (y1 + y2) / 2.0, rot, largo, ancho,
                 z - peralte / 2.0 - plantilla, z + peralte / 2.0)
            detalle["seccion_trapecial"] = True
        elif alias == "muro":
            datos = self._datos_muro(elemento)
            nucleo, centro = self._capas_nucleo(elemento)
            x1, y1 = datos["x1"], datos["y1"]
            x2, y2 = datos["x2"], datos["y2"]
            largo = datos["longitud"]
            if largo <= TOLERANCIA_CALCULO:
                return None
            ux, uy = (x2 - x1) / largo, (y2 - y1) / largo
            rot = math.atan2(uy, ux)
            nx, ny = -uy * centro, ux * centro
            cx, cy = (x1 + x2) / 2.0 + nx, (y1 + y2) / 2.0 + ny
            z0, z1 = self._limites_verticales_muro_nivel(elemento, datos)
            from shapely.geometry import Polygon as _Polygon

            coseno, seno = math.cos(rot), math.sin(rot)
            puntos = []
            for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                lx, ly = sx * largo / 2.0, sy * nucleo / 2.0
                puntos.append((cx + lx * coseno - ly * seno, cy + lx * seno + ly * coseno))
            base = _Polygon(puntos)
            # O012b: el muro (y sus capas) termina en las caras de castillos y columnas.
            for columna in self.modelo.by_type("IfcColumn"):
                barra = self._barra_de_elemento(columna)
                if barra is None:
                    continue
                if min(z1, barra.z1) - max(z0, barra.z0) <= TOLERANCIA_CALCULO:
                    continue
                recorte = _Polygon(uniones.huella(barra))
                if not recorte.is_valid:
                    recorte = recorte.buffer(0)
                if not base.intersects(recorte):
                    continue
                base = base.difference(recorte)
                if base.is_empty:
                    break
            if base.is_empty:
                base = _Polygon(puntos)
            vanos = self._aberturas_del_muro(elemento)
            # O035: por tramos, la base puede bajar hasta la cimentación.
            bajadas = self._tramos_bajada_muro(elemento, datos)
            if z0 > float(datos["z"]) + TOLERANCIA_CALCULO:
                bajadas = []
            subtramos = self._partir_base_muro_por_bajadas(base, z0, bajadas, datos)
            bruto = sum(b.area * (z1 - z) for b, z in subtramos)
            # Los vanos se descuentan del cuerpo y también del volumen bruto.
            for _vano, info in vanos:
                bruto -= info["ancho"] * info["alto"] * nucleo
            for sub, z_base in subtramos:
                for _vano, info in vanos:
                    vz0 = float(datos["z"]) + info["antepecho"]
                    vz1 = vz0 + info["alto"]
                    a, b = max(z_base, vz0), min(z1, vz1)
                    if b - a <= TOLERANCIA_CALCULO:
                        continue
                    vx = x1 + ux * (info["distancia"] + info["ancho"] / 2.0)
                    vy = y1 + uy * (info["distancia"] + info["ancho"] / 2.0)
                    vcos, vsen = math.cos(rot), math.sin(rot)
                    vp = []
                    for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                        lx, ly = sx * info["ancho"] / 2.0, sy * (nucleo + 0.02) / 2.0
                        vp.append((vx + lx * vcos - ly * vsen, vy + lx * vsen + ly * vcos))
                    hueco = _Polygon(vp)
                    piezas.append(
                        {
                            "poligono": (lambda p=sub, h=hueco: p.difference(h)),
                            "z0": a, "z1": b,
                            "prioridad": PRIORIDAD["muro"],
                            "volumen": None,
                        }
                    )
                # Rebanadas fuera de los vanos: el polígono completo.
                fronteras = sorted({
                    z_base, z1,
                    *[
                        max(z_base, min(z1, float(datos["z"]) + info["antepecho"]))
                        for _v, info in vanos
                    ],
                    *[
                        max(
                            z_base,
                            min(
                                z1,
                                float(datos["z"])
                                + info["antepecho"]
                                + info["alto"],
                            ),
                        )
                        for _v, info in vanos
                    ],
                })
                for a, b in zip(fronteras, fronteras[1:]):
                    if b - a <= TOLERANCIA_CALCULO:
                        continue
                    medio = (a + b) / 2.0
                    cubierto = any(
                        float(datos["z"]) + info["antepecho"]
                        < medio
                        < float(datos["z"]) + info["antepecho"] + info["alto"]
                        for _v, info in vanos
                    )
                    if cubierto:
                        continue
                    piezas.append(
                        {
                            "poligono": (lambda p=sub: p),
                            "z0": a, "z1": b,
                            "prioridad": PRIORIDAD["muro"],
                            "volumen": None,
                        }
                    )
            # Área neta del núcleo: largo efectivo del sólido recortado por la altura
            # también recortada, menos los vanos.
            area_neta = (
                sum(b.area * (z1 - z) for b, z in subtramos) / nucleo
                if nucleo > TOLERANCIA_CALCULO
                else sum(b.area * (z1 - z) for b, z in subtramos)
            )
            for _vano, info in vanos:
                area_neta -= info["ancho"] * info["alto"]
            # O045: el cerramiento va embebido; su sección dentro del espesor se
            # descuenta del área de block (los castillos ya vienen recortados de la
            # huella por ser IfcColumn). Los recubrimientos miden la cara completa.
            area_neta -= self._area_embebida_muro(elemento, datos, nucleo)
            detalle["area_neta_m2"] = round(max(area_neta, 0.0), 6)
            detalle["base_m"] = round(min(z for _b, z in subtramos), 6)
            detalle["cima_m"] = round(z1, 6)
        elif alias == "losa":
            datos = self._leer_pset(elemento, "OPENRVT_Losa")
            espesor = float(datos.get("Espesor") or 0.12)
            nivel_e = self._nivel_de_elemento(elemento)
            z1 = float(nivel_e.Elevation or 0.0) + float(datos.get("Desfase") or 0.0)
            # O012b: la huella ya viene recortada contra trabes y columnas.
            poligono = self._geometria_losa(elemento)
            piezas.append(
                {
                    "poligono": (lambda p=poligono: p),
                    "z0": z1 - espesor, "z1": z1,
                    "prioridad": PRIORIDAD["losa"], "volumen": None,
                }
            )
            bruto = poligono.area * espesor
        else:
            return None
        if bruto <= 0:
            return None
        return {
            "globalid": _gid(elemento),
            "clase": clase,
            "nombre": _texto(getattr(elemento, "Name", "")),
            "tipo": tipo_nombre,
            "alias": alias,
            "volumen_bruto_m3": round(bruto, 6),
            "volumen_neto_m3": 0.0,
            "acero_kg": acero,
            "detalle": detalle,
            "piezas": piezas,
            "area_neta_m2": round(area_neta, 6) if area_neta is not None else None,
        }
