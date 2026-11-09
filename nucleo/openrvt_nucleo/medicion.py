"""O009: medición de los tipos y cantidades para PresupuestosPro.

Cada tipo guarda sus partidas en el pset ``OPENRVT_Medicion`` como un JSON en la
propiedad ``Partidas``. El cálculo reutiliza ``cantidades.estructura`` para los
volúmenes netos y ``area_neta_m2`` de los muros; no vuelve a medir por otro camino.
"""

from __future__ import annotations

import json
import math
import os
from datetime import datetime
from typing import Any

from .modelado import TOLERANCIA_CALCULO, _gid, _nombre, _poligono_area, _texto

PSET = "OPENRVT_Medicion"
PROPIEDAD = "Partidas"

# Unidad de cada criterio y las clases a las que se puede aplicar.
UNIDADES: dict[str, str] = {
    "area_nucleo": "m2",
    "area_capa": "m2",
    "largo": "m",
    "area": "m2",
    "volumen": "m3",
    "cimbra_borde": "m2",
    "acero": "kg",
    "cimbra": "m2",
    "plantilla": "m2",
    "excavacion": "m3",
    "piezas": "pza",
}

CRITERIOS_MURO = ("area_nucleo", "area_capa", "largo")
CRITERIOS_LOSA = ("area", "volumen", "cimbra_borde")
CRITERIOS_ESTRUCTURA = ("volumen", "acero", "cimbra")
CRITERIOS_ZAPATA = ("volumen", "acero", "plantilla", "excavacion")
CRITERIOS_PIEZAS = ("piezas",)

# Nombres de las partidas por omisión. El nombre solo separa partidas sin clave.
NOMBRES = {
    "area_nucleo": "Muro (núcleo)",
    "largo": "Longitud del muro",
    "area": "Área de la losa",
    "volumen": "Volumen de concreto",
    "cimbra_borde": "Cimbra de borde",
    "acero": "Acero de refuerzo",
    "cimbra": "Cimbra",
    "plantilla": "Plantilla de concreto pobre",
    "excavacion": "Excavación",
    "piezas": "Piezas",
}

# O039: capítulos del modo Obra. La identificación es el orden (01, 02, …) y el
# nombre es el que se ve en el árbol. Se guardan en el IFC como IfcClassification
# «OPEN-RVT Obra» con una IfcClassificationReference por capítulo.
CAPITULOS_OBRA: tuple[tuple[str, str], ...] = (
    ("01", "Preliminares"),
    ("02", "Cimentación"),
    ("03", "Estructura"),
    ("04", "Albañilería"),
    ("05", "Acabados"),
    ("06", "Cancelería"),
    ("07", "Instalaciones"),
)
CLASIFICACION_OBRA = "OPEN-RVT Obra"


def _crit_orden(criterio: str) -> int:
    orden = {
        "area_nucleo": 0,
        "area_capa": 1,
        "largo": 2,
        "area": 0,
        "volumen": 1,
        "cimbra_borde": 2,
        "acero": 2,
        "cimbra": 3,
        "plantilla": 3,
        "excavacion": 4,
        "piezas": 0,
    }
    return orden.get(criterio, 9)


def _nombre_capa(material: str, lado: str) -> str:
    base = _texto(material).strip()
    if not base:
        return "Acabado " + lado
    # «Aplanado de mortero (repellado)» → «Aplanado»; «Aplanado fino» conserva el fino.
    if base.lower().startswith("aplanado de mortero"):
        base = "Aplanado"
    else:
        base = base.split("(")[0].strip()
    return f"{base} {lado}"


def _llave_partida(partida: dict[str, Any]) -> tuple[str, str, str]:
    """Llave de agrupación de una partida: clave PP o nombre, y unidad."""
    clave = _texto(partida.get("ClavePP", partida.get("clave"))).strip()
    unidad = _texto(partida.get("Unidad", partida.get("unidad")))
    nombre = _texto(partida.get("Nombre", partida.get("nombre")))
    return ("clave", clave, unidad) if clave else ("nombre", nombre, unidad)


class MedicionMixin:
    """Partidas del tipo (pset OPENRVT_Medicion), cálculo y exportación a PP."""

    # ------------------------------------------------------------------ utilidades
    def _clase_medicion(self, tipo: Any = None, elemento: Any = None) -> str:
        if tipo is not None:
            if tipo.is_a("IfcWallType"):
                return "muro"
            if tipo.is_a("IfcSlabType"):
                return "losa"
            alias = self._estructura_de_tipo(tipo)
            if alias is not None:
                if alias == "zapata":
                    return "zapata"
                return "estructura"
            if tipo.is_a("IfcDoorType"):
                return "puerta"
            if tipo.is_a("IfcWindowType"):
                return "ventana"
            if tipo.is_a("IfcFootingType"):
                return "estructura"
            if tipo.is_a("IfcColumnType"):
                return "estructura"
            if tipo.is_a("IfcBeamType"):
                return "estructura"
            return "generico"
        if elemento is not None:
            if elemento.is_a("IfcWall"):
                return "muro"
            if elemento.is_a("IfcSlab"):
                return "losa"
            if elemento.is_a("IfcDoor"):
                return "puerta"
            if elemento.is_a("IfcWindow"):
                return "ventana"
            if elemento.is_a("IfcFooting"):
                return "zapata"
            if elemento.is_a("IfcColumn"):
                return "estructura"
            if elemento.is_a("IfcBeam"):
                return "estructura"
        return "generico"

    def _criterios_de_tipo(self, tipo: Any = None, elemento: Any = None) -> list[str]:
        clase = self._clase_medicion(tipo, elemento)
        if clase == "muro":
            return list(CRITERIOS_MURO)
        if clase == "losa":
            return list(CRITERIOS_LOSA)
        if clase == "zapata":
            return list(CRITERIOS_ZAPATA)
        if clase in ("puerta", "ventana"):
            return list(CRITERIOS_PIEZAS)
        if clase == "estructura":
            if tipo is not None:
                alias = self._estructura_de_tipo(tipo)
                if alias in ("cerramiento", "dala", "contratrabe", "zapata_corrida"):
                    return ["volumen", "acero"]
            return list(CRITERIOS_ESTRUCTURA)
        return []

    # ------------------------------------------------------------------ partidas
    def _partidas_omision(self, tipo: Any = None, elemento: Any = None) -> list[dict[str, Any]]:
        clase = self._clase_medicion(tipo, elemento)
        salida: list[dict[str, Any]] = []

        def agregar(nombre: str, criterio: str, capa: int | None = None) -> None:
            salida.append(
                {
                    "Nombre": nombre,
                    "ClavePP": "",
                    "Unidad": UNIDADES[criterio],
                    "Criterio": criterio,
                    "Capa": capa,
                }
            )

        if clase == "muro":
            capas = self.capas_de_tipo(tipo) if tipo is not None else []
            if capas:
                nucleos = [i for i, c in enumerate(capas) if c["funcion"] == "núcleo"]
                primero = nucleos[0] if nucleos else 0
                ultimo = nucleos[-1] if nucleos else 0
                material_nucleo = next(
                    (_texto(c["material"]) for c in capas if c["funcion"] == "núcleo"),
                    "",
                )
                nombre_nucleo = (
                    f"Muro de {material_nucleo}" if material_nucleo else NOMBRES["area_nucleo"]
                )
                agregar(nombre_nucleo, "area_nucleo")
                for indice, capa in enumerate(capas):
                    if capa["funcion"] == "núcleo":
                        continue
                    lado = "exterior" if indice < primero else "interior"
                    agregar(_nombre_capa(capa["material"], lado), "area_capa", indice)
                return salida
            agregar("Muro", "area_nucleo")
            return salida
        if clase == "losa":
            if elemento is not None and elemento.is_a("IfcSlab"):
                # O059: el uso va en el nombre para que las partidas no se sumen
                # entre firmes, entrepisos y azoteas.
                sufijo = {
                    "firme": "firme",
                    "entrepiso": "losa de entrepiso",
                    "azotea": "losa de azotea",
                }.get(self.uso_de_losa(elemento), "losa de entrepiso")
                agregar(f"Área de {sufijo}", "area")
                agregar(f"Volumen de {sufijo}", "volumen")
                agregar(f"Cimbra de borde de {sufijo}", "cimbra_borde")
                return salida
            agregar(NOMBRES["area"], "area")
            agregar(NOMBRES["volumen"], "volumen")
            agregar(NOMBRES["cimbra_borde"], "cimbra_borde")
            return salida
        if clase == "zapata":
            agregar(NOMBRES["volumen"], "volumen")
            agregar(NOMBRES["acero"], "acero")
            agregar(NOMBRES["plantilla"], "plantilla")
            agregar(NOMBRES["excavacion"], "excavacion")
            return salida
        if clase in ("puerta", "ventana"):
            nombre = "Puerta" if clase == "puerta" else "Ventana"
            agregar(nombre, "piezas")
            return salida
        if clase == "estructura":
            agregar(NOMBRES["volumen"], "volumen")
            agregar(NOMBRES["acero"], "acero")
            criterios = self._criterios_de_tipo(tipo, elemento)
            if "cimbra" in criterios:
                agregar(NOMBRES["cimbra"], "cimbra")
            return salida
        return salida

    def _guardar_partidas_omision(self, tipo: Any) -> None:
        """Deja escritas las partidas por omisión al crear un tipo semilla."""
        partidas = self._partidas_omision(tipo=tipo)
        self._guardar_pset(
            tipo, PSET, {PROPIEDAD: json.dumps(partidas, ensure_ascii=False)}
        )

    def _partidas_leidas(self, tipo: Any) -> list[dict[str, Any]] | None:
        datos = self._leer_pset(tipo, PSET)
        if PROPIEDAD not in datos:
            return None
        crudo = datos.get(PROPIEDAD)
        if isinstance(crudo, (list, tuple)):
            lista = list(crudo)
        else:
            try:
                lista = json.loads(_texto(crudo) or "[]")
            except (TypeError, ValueError):
                return []
        if not isinstance(lista, list):
            return []
        return self._normalizar_partidas(tipo, lista, estricto=False)

    def _partidas_de_tipo(self, tipo: Any) -> list[dict[str, Any]]:
        guardadas = self._partidas_leidas(tipo)
        if guardadas is not None:
            return guardadas
        return self._partidas_omision(tipo=tipo)

    def _partidas_de_elemento(self, elemento: Any) -> tuple[list[dict[str, Any]], Any]:
        tipo = self._tipo_entidad(elemento)
        if tipo is not None:
            return self._partidas_de_tipo(tipo), tipo
        return self._partidas_omision(elemento=elemento), None

    def _normalizar_partidas(
        self, tipo: Any, partidas: Any, estricto: bool = True
    ) -> list[dict[str, Any]]:
        if not isinstance(partidas, (list, tuple)):
            raise self._error("Las partidas deben ser una lista.", -32602)
        validos = set(self._criterios_de_tipo(tipo))
        salida: list[dict[str, Any]] = []
        for entrada in partidas:
            if not isinstance(entrada, dict):
                raise self._error("Cada partida debe ser un objeto.", -32602)
            criterio = _texto(entrada.get("Criterio") or entrada.get("criterio")).strip()
            if criterio not in UNIDADES or criterio not in validos:
                if estricto:
                    permitidos = ", ".join(sorted(validos)) or "ninguno"
                    raise self._error(
                        f"El criterio «{criterio}» no es válido para este tipo "
                        f"(válidos: {permitidos}).",
                        -32602,
                    )
                continue
            nombre = _texto(entrada.get("Nombre", entrada.get("nombre"))).strip()
            if not nombre:
                nombre = NOMBRES.get(criterio, criterio)
            clave = _texto(entrada.get("ClavePP", entrada.get("clave"))).strip()
            capa: int | None = None
            if criterio == "area_capa":
                try:
                    capa = int(entrada.get("Capa", entrada.get("capa")))
                except (TypeError, ValueError):
                    if estricto:
                        raise self._error(
                            "La partida de área de capa necesita el índice de la capa.",
                            -32602,
                        )
                    continue
                capas = self.capas_de_tipo(tipo) if tipo is not None else []
                if capa < 0 or capa >= len(capas):
                    if estricto:
                        raise self._error(
                            f"La capa {capa} no existe en el tipo «{_nombre(tipo)}».",
                            -32602,
                        )
                    continue
            if estricto and criterio == "area_capa":
                capas = self.capas_de_tipo(tipo) if tipo is not None else []
                if not capas:
                    raise self._error("El tipo no tiene capas para medir.", -32602)
            capitulo = _texto(
                entrada.get("Capitulo") or entrada.get("capitulo")
            ).strip()
            fila = {
                "Nombre": nombre,
                "ClavePP": clave,
                "Unidad": UNIDADES[criterio],
                "Criterio": criterio,
                "Capa": capa,
            }
            if capitulo:
                fila["Capitulo"] = capitulo
            salida.append(fila)
        return salida

    # ------------------------------------------------------------------ obra O039
    def _clasificacion_obra(self) -> Any:
        for clasificacion in self.modelo.by_type("IfcClassification"):
            if _texto(getattr(clasificacion, "Name", "")) == CLASIFICACION_OBRA:
                return clasificacion
        return None

    def _referencias_obra(self) -> list[Any]:
        clasificacion = self._clasificacion_obra()
        if clasificacion is None:
            return []
        referencias = [
            ref
            for ref in self.modelo.by_type("IfcClassificationReference")
            if getattr(ref, "ReferencedSource", None) == clasificacion
        ]

        def orden(ref: Any) -> tuple[int, str]:
            texto = _texto(getattr(ref, "Identification", "")).strip()
            try:
                return (int(texto), texto)
            except ValueError:
                return (10**9, texto)

        return sorted(referencias, key=orden)

    def _asegurar_capitulos_obra(self) -> None:
        """Crea la clasificación y los siete capítulos por omisión si faltan."""
        modelo = self._exigir_modelo()
        clasificacion = self._clasificacion_obra()
        if clasificacion is None:
            clasificacion = modelo.create_entity(
                "IfcClassification", Name=CLASIFICACION_OBRA
            )
        existentes = {
            _texto(getattr(ref, "Identification", "")).strip()
            for ref in self._referencias_obra()
        }
        for identificacion, nombre in CAPITULOS_OBRA:
            if identificacion in existentes:
                continue
            modelo.create_entity(
                "IfcClassificationReference",
                Identification=identificacion,
                Name=nombre,
                ReferencedSource=clasificacion,
            )

    def _capitulos_obra(self) -> list[dict[str, Any]]:
        self._exigir_modelo()
        referencias = self._referencias_obra()
        if not referencias:
            # Modelo antiguo sin clasificación: se muestran los de omisión sin
            # escribir en el IFC (la escritura ocurre al abrir o al editar).
            return [
                {
                    "globalid": "",
                    "identificacion": identificacion,
                    "nombre": nombre,
                    "orden": indice + 1,
                }
                for indice, (identificacion, nombre) in enumerate(CAPITULOS_OBRA)
            ]
        salida: list[dict[str, Any]] = []
        for indice, ref in enumerate(referencias):
            salida.append(
                {
                    "globalid": _texto(getattr(ref, "GlobalId", "")),
                    "identificacion": _texto(getattr(ref, "Identification", "")).strip(),
                    "nombre": _texto(getattr(ref, "Name", "")),
                    "orden": indice + 1,
                }
            )
        return salida

    def _guardar_partidas_tipo(self, tipo: Any, partidas: list[dict[str, Any]]) -> None:
        self._guardar_pset(
            tipo, PSET, {PROPIEDAD: json.dumps(partidas, ensure_ascii=False)}
        )

    def _tipos_con_partidas(self) -> list[Any]:
        return list(self.modelo.by_type("IfcTypeObject"))

    def _renumerar_capitulos(self, referencias: list[Any]) -> None:
        """Asigna 01…N en orden y remapea el capítulo guardado en cada partida."""
        anteriores = [
            _texto(getattr(ref, "Identification", "")).strip() for ref in referencias
        ]
        nuevos = [f"{i:02d}" for i in range(1, len(referencias) + 1)]
        mapa = {viejo: nuevo for viejo, nuevo in zip(anteriores, nuevos)}
        for ref, nuevo in zip(referencias, nuevos):
            ref.Identification = nuevo
        if not mapa:
            return
        for tipo in self._tipos_con_partidas():
            partidas = self._partidas_leidas(tipo)
            if partidas is None:
                continue
            cambio = False
            for partida in partidas:
                capitulo = _texto(partida.get("Capitulo")).strip()
                if capitulo and capitulo in mapa and mapa[capitulo] != capitulo:
                    partida["Capitulo"] = mapa[capitulo]
                    cambio = True
            if cambio:
                self._guardar_partidas_tipo(tipo, partidas)

    def _capitulo_omision(
        self, tipo: Any, partida: dict[str, Any], elemento: Any = None
    ) -> str:
        clase = self._clase_medicion(tipo=tipo, elemento=elemento)
        alias = self._estructura_de_tipo(tipo) if tipo is not None else None
        criterio = _texto(partida.get("Criterio"))
        if clase == "zapata" or alias == "contratrabe":
            return "02"
        if clase == "losa" or clase == "estructura":
            return "03"
        if clase == "muro":
            return "05" if criterio == "area_capa" else "04"
        if clase in ("puerta", "ventana"):
            return "06"
        return "01"

    def _mapa_capitulos_partidas(self) -> dict[tuple[str, str, str], str]:
        """Capítulo efectivo por partida: el guardado o, si falta, el de omisión."""
        capitulos = {c["identificacion"] for c in self._capitulos_obra()}
        primero = next(iter(sorted(capitulos)), "01")
        explicitos: dict[tuple[str, str, str], str] = {}
        omision: dict[tuple[str, str, str], str] = {}
        for tipo in self._tipos_con_partidas():
            for partida in self._partidas_de_tipo(tipo):
                llave = _llave_partida(partida)
                capitulo = _texto(partida.get("Capitulo")).strip()
                if capitulo in capitulos:
                    explicitos.setdefault(llave, capitulo)
                omision.setdefault(llave, self._capitulo_omision(tipo, partida))
        # Elementos sin tipo (por ejemplo una losa suelta) también aportan partidas.
        for elemento in self._elementos_ordenados():
            partidas, tipo = self._partidas_de_elemento(elemento)
            for partida in partidas:
                llave = _llave_partida(partida)
                omision.setdefault(
                    llave, self._capitulo_omision(tipo, partida, elemento=elemento)
                )
        salida: dict[tuple[str, str, str], str] = {}
        for llave in set(explicitos) | set(omision):
            capitulo = explicitos.get(llave) or omision.get(llave) or primero
            if capitulo not in capitulos:
                capitulo = primero
            salida[llave] = capitulo
        return salida

    def arbol_obra(self) -> dict[str, Any]:
        """Árbol del presupuesto: capítulo → partida → renglón.

        Las partidas y sus totales salen de ``medicion_calcular`` sin volver a medir.
        Un elemento puede aparecer en varias partidas (block, aplanado, pintura…).
        """
        self._exigir_modelo()
        capitulos = self._capitulos_obra()
        mapa = self._mapa_capitulos_partidas()
        por_capitulo: dict[str, list[dict[str, Any]]] = {
            c["identificacion"]: [] for c in capitulos
        }
        for partida in self.medicion_calcular()["partidas"]:
            llave = _llave_partida(partida)
            identificacion = mapa.get(llave) or (
                capitulos[0]["identificacion"] if capitulos else "01"
            )
            renglones: list[dict[str, Any]] = []
            for renglon in partida["renglones"]:
                gid = _texto(renglon.get("globalid"))
                elemento = ""
                if gid:
                    try:
                        entidad = self.modelo.by_guid(gid)
                        elemento = _nombre(entidad) or entidad.is_a()
                    except Exception:
                        elemento = ""
                renglones.append(
                    {
                        "clave": f"renglon:{gid}:{renglon.get('descripcion', '')}",
                        "globalid": gid,
                        "elemento": elemento or _texto(renglon.get("descripcion")),
                        "descripcion": _texto(renglon.get("descripcion")),
                        "resultado": renglon.get("resultado"),
                    }
                )
            por_capitulo.setdefault(identificacion, []).append(
                {
                    "clave": "partida:" + "|".join(llave),
                    "clave_pp": _texto(partida.get("clave")),
                    "nombre": _texto(partida.get("nombre")),
                    "unidad": _texto(partida.get("unidad")),
                    "total": partida.get("total"),
                    "conteo": len(renglones),
                    "renglones": renglones,
                }
            )
        salida = []
        for indice, capitulo in enumerate(capitulos):
            partidas = por_capitulo.get(capitulo["identificacion"], [])
            salida.append(
                {
                    "clave": "capitulo:"
                    + (capitulo["globalid"] or capitulo["identificacion"]),
                    "globalid": capitulo["globalid"],
                    "identificacion": capitulo["identificacion"],
                    "nombre": capitulo["nombre"],
                    "orden": indice + 1,
                    "conteo": len(partidas),
                    "partidas": partidas,
                }
            )
        return {
            "tipo": "obra",
            "clave": "obra",
            "nombre": "Obra",
            "conteo": len(salida),
            "capitulos": salida,
        }

    def obra_capitulo_crear(self, nombre: str) -> dict[str, Any]:
        self._exigir_modelo()
        nombre = _texto(nombre).strip()
        if not nombre:
            raise self._error("El capítulo necesita un nombre.", -32602)
        self._instantanea()
        self._asegurar_capitulos_obra()
        referencias = self._referencias_obra()
        numeros = []
        for ref in referencias:
            try:
                numeros.append(int(_texto(ref.Identification)))
            except (TypeError, ValueError):
                continue
        identificacion = f"{(max(numeros) if numeros else 0) + 1:02d}"
        ref = self.modelo.create_entity(
            "IfcClassificationReference",
            Identification=identificacion,
            Name=nombre,
            ReferencedSource=self._clasificacion_obra(),
        )
        self.con_cambios = True
        return self._resultado(
            creados=[ref],
            mensaje=f"Capítulo «{nombre}» creado.",
            capitulos=self._capitulos_obra(),
        )

    def _referencia_capitulo(self, identificacion: str) -> Any:
        buscado = _texto(identificacion).strip()
        if self._clasificacion_obra() is None:
            self._asegurar_capitulos_obra()
        for ref in self._referencias_obra():
            if _texto(ref.Identification).strip() == buscado:
                return ref
        raise self._error(f"No existe el capítulo {buscado}.", -32005)

    def obra_capitulo_renombrar(
        self, identificacion: str, nombre: str
    ) -> dict[str, Any]:
        self._exigir_modelo()
        ref = self._referencia_capitulo(identificacion)
        nombre = _texto(nombre).strip()
        if not nombre:
            raise self._error("El capítulo necesita un nombre.", -32602)
        self._instantanea()
        ref.Name = nombre
        self.con_cambios = True
        return self._resultado(
            modificados=[ref],
            mensaje=f"Capítulo renombrado a «{nombre}».",
            capitulos=self._capitulos_obra(),
        )

    def obra_capitulo_mover(
        self, identificacion: str, direccion: str
    ) -> dict[str, Any]:
        self._exigir_modelo()
        ref = self._referencia_capitulo(identificacion)
        direccion = _texto(direccion).strip().lower()
        if direccion not in ("subir", "bajar"):
            raise self._error("La dirección debe ser «subir» o «bajar».", -32602)
        referencias = self._referencias_obra()
        indice = referencias.index(ref)
        destino = indice - 1 if direccion == "subir" else indice + 1
        if destino < 0 or destino >= len(referencias):
            return self._resultado(
                mensaje="El capítulo ya está en el extremo.",
                capitulos=self._capitulos_obra(),
            )
        self._instantanea()
        referencias[indice], referencias[destino] = (
            referencias[destino],
            referencias[indice],
        )
        self._renumerar_capitulos(referencias)
        self.con_cambios = True
        return self._resultado(
            modificados=[ref],
            mensaje=f"Capítulo «{_texto(ref.Name)}» movido.",
            capitulos=self._capitulos_obra(),
        )

    def obra_capitulo_borrar(self, identificacion: str) -> dict[str, Any]:
        self._exigir_modelo()
        ref = self._referencia_capitulo(identificacion)
        referencias = self._referencias_obra()
        if len(referencias) <= 1:
            raise self._error("No se puede borrar el único capítulo.", -32024)
        self._instantanea()
        borrado = _texto(ref.Identification).strip()
        nombre = _texto(ref.Name)
        self.modelo.remove(ref)
        for tipo in self._tipos_con_partidas():
            partidas = self._partidas_leidas(tipo)
            if partidas is None:
                continue
            cambio = False
            for partida in partidas:
                if _texto(partida.get("Capitulo")).strip() == borrado:
                    partida.pop("Capitulo", None)
                    cambio = True
            if cambio:
                self._guardar_partidas_tipo(tipo, partidas)
        self._renumerar_capitulos(self._referencias_obra())
        self.con_cambios = True
        return self._resultado(
            borrados=[ref],
            mensaje=(
                f"Capítulo «{nombre}» borrado; sus partidas vuelven a su capítulo "
                "por omisión."
            ),
            capitulos=self._capitulos_obra(),
        )

    def obra_partida_mover(
        self, clave: str, nombre: str, unidad: str, capitulo: str
    ) -> dict[str, Any]:
        self._exigir_modelo()
        ref = self._referencia_capitulo(capitulo)
        destino = _texto(ref.Identification).strip()
        objetivo = _llave_partida(
            {"ClavePP": clave, "Nombre": nombre, "Unidad": unidad}
        )
        self._instantanea()
        tocados = 0
        for tipo in self._tipos_con_partidas():
            partidas = self._partidas_de_tipo(tipo)
            cambio = False
            for partida in partidas:
                if _llave_partida(partida) != objetivo:
                    continue
                partida["Capitulo"] = destino
                cambio = True
                tocados += 1
            if cambio:
                self._guardar_partidas_tipo(tipo, partidas)
        if tocados == 0:
            raise self._error("No se encontró la partida que se quiere mover.", -32005)
        self.con_cambios = True
        return self._resultado(
            mensaje=f"Partida movida a «{_texto(ref.Name)}».",
            capitulos=self._capitulos_obra(),
        )

    def medicion_partidas_omision(self, globalid: str) -> list[dict[str, Any]]:
        """Partidas por omisión del tipo, sin tocar el modelo."""
        self._exigir_modelo()
        tipo = self._tipo_por_gid(globalid)
        return self._partidas_omision(tipo=tipo)

    def medicion_guardar_partidas(
        self, globalid: str, partidas: Any
    ) -> dict[str, Any]:
        """Guarda las partidas del tipo sin regenerar su geometría."""
        self._exigir_modelo()
        tipo = self._tipo_por_gid(globalid)
        normalizadas = self._normalizar_partidas(tipo, partidas)
        self._instantanea()
        self._guardar_pset(
            tipo,
            PSET,
            {PROPIEDAD: json.dumps(normalizadas, ensure_ascii=False)},
        )
        self.con_cambios = True
        return self._resultado(
            modificados=[tipo],
            mensaje=f"Partidas de «{_nombre(tipo)}» actualizadas.",
            partidas=normalizadas,
        )

    # ------------------------------------------------------------------ cálculo
    def _eje_etiqueta(self, gid: str) -> str:
        texto = _texto(gid)
        if "/" in texto:
            texto = texto.split("/")[-1]
        if texto:
            return texto
        for grid in self.modelo.by_type("IfcGrid"):
            for eje in self._ejes(grid):
                if self._id_eje(grid, eje) == gid:
                    return _texto(getattr(eje, "AxisTag", ""))
        return ""

    def _ejes_en_punto(self, x: float, y: float) -> list[dict[str, Any]]:
        salida = []
        for eje in self.ejes_listar():
            x1, y1 = float(eje["x1"]), float(eje["y1"])
            x2, y2 = float(eje["x2"]), float(eje["y2"])
            dx, dy = x2 - x1, y2 - y1
            largo2 = dx * dx + dy * dy
            if largo2 <= TOLERANCIA_CALCULO:
                continue
            t = ((x - x1) * dx + (y - y1) * dy) / largo2
            if t < -1e-6 or t > 1 + 1e-6:
                continue
            px, py = x1 + t * dx, y1 + t * dy
            if math.hypot(x - px, y - py) <= 0.02:
                salida.append(eje)
        return salida

    def _eje_de_muro(self, muro: Any) -> str:
        datos = self._datos_muro(muro)
        inicio = self._ejes_en_punto(datos["x1"], datos["y1"])
        fin = self._ejes_en_punto(datos["x2"], datos["y2"])
        horizontales = sorted({
            e["etiqueta"] for e in inicio + fin if not e.get("vertical")
        })
        verticales = sorted({
            e["etiqueta"] for e in inicio + fin if e.get("vertical")
        })
        if horizontales and verticales:
            if len(horizontales) == 1:
                return f"{horizontales[0]} / {'-'.join(verticales)}"
            if len(verticales) == 1:
                return f"{verticales[0]} / {'-'.join(horizontales)}"
            return "-".join(horizontales + verticales)
        if horizontales:
            return horizontales[0]
        if verticales:
            return verticales[0]
        return ""

    def _eje_de_elemento(self, elemento: Any) -> str:
        if elemento.is_a("IfcWall"):
            return self._eje_de_muro(elemento)
        liga = self._leer_liga(elemento)
        a = self._eje_etiqueta(liga.get("EjeA"))
        b = self._eje_etiqueta(liga.get("EjeB"))
        etiquetas = [t for t in (a, b) if t]
        pset = self._leer_pset(elemento, "OPENRVT_Estructura")
        if not etiquetas:
            if pset.get("X") is not None and pset.get("Y") is not None:
                hitos = self._ejes_en_punto(
                    float(pset.get("X") or 0.0), float(pset.get("Y") or 0.0)
                )
                horizontales = [e["etiqueta"] for e in hitos if not e.get("vertical")]
                verticales = [e["etiqueta"] for e in hitos if e.get("vertical")]
                if horizontales and verticales:
                    return f"{sorted(horizontales)[0]}-{sorted(verticales)[0]}"
        if not etiquetas:
            return ""
        if len(etiquetas) == 2 and a != b:
            # Las columnas ligadas a un cruce muestran «A-1» (horizontal-vertical).
            horizontales = [
                e["etiqueta"] for e in self.ejes_listar()
                if e["etiqueta"] in (a, b) and not e.get("vertical")
            ]
            verticales = [
                e["etiqueta"] for e in self.ejes_listar()
                if e["etiqueta"] in (a, b) and e.get("vertical")
            ]
            if horizontales and verticales:
                return f"{horizontales[0]}-{verticales[0]}"
            return f"{a}-{b}"
        return etiquetas[0]

    def _largo_cara_capa(self, muro: Any, indice: int) -> float:
        """Largo de la cara de una capa con las reglas de esquina de O006e.

        En L el muro se alarga media capa; en T el que llega termina en el núcleo
        pasante. El largo se obtiene del área de la banda en planta dividida entre
        su espesor.
        """
        datos = self._datos_muro(muro)
        tipo = self._tipo_entidad(muro)
        capas = self.capas_de_tipo(tipo) if tipo is not None else []
        if indice < 0 or indice >= len(capas):
            return 0.0
        posicionadas = self.capas_con_posicion(muro, datos["espesor"])
        capa = posicionadas[indice]
        centros = [float(c.get("centro") or 0.0) for c in posicionadas]
        nucleos = [i for i, c in enumerate(capas) if c["funcion"] == "núcleo"]
        primero = nucleos[0] if nucleos else 0
        ultimo = nucleos[-1] if nucleos else len(capas) - 1
        # Signo: exterior (antes del núcleo) alarga la cara; interior la acorta.
        if indice < primero:
            lado = 1.0
        elif indice > ultimo:
            lado = -1.0
        else:
            lado = 0.0
        desplazamiento = abs(float(capa.get("centro") or 0.0))
        if not centros:
            desplazamiento = 0.0
        # Correcciones en los extremos: L (inglete) suma el desplazamiento de la
        # cara; T (el que llega) termina en la cara del núcleo pasante.
        inicio = 0.0
        fin = 0.0
        x1, y1, x2, y2 = datos["x1"], datos["y1"], datos["x2"], datos["y2"]
        largo = datos["longitud"]
        ux, uy = (x2 - x1) / largo, (y2 - y1) / largo
        for extremo, (px, py) in enumerate(((x1, y1), (x2, y2))):
            en_l = False
            en_t = False
            for otro in self.modelo.by_type("IfcWall"):
                if otro == muro:
                    continue
                od = self._datos_muro(otro)
                if od["longitud"] <= TOLERANCIA_CALCULO:
                    continue
                # Extremo compartido (L/T/X): los dos muros terminan en el mismo punto.
                if (
                    math.hypot(od["x1"] - px, od["y1"] - py) <= 0.01
                    or math.hypot(od["x2"] - px, od["y2"] - py) <= 0.01
                ):
                    en_l = True
                    continue
                # El extremo cae dentro del eje del otro muro (T).
                ox1, oy1, ox2, oy2 = od["x1"], od["y1"], od["x2"], od["y2"]
                dx, dy = ox2 - ox1, oy2 - oy1
                l2 = dx * dx + dy * dy
                if l2 <= TOLERANCIA_CALCULO:
                    continue
                t = ((px - ox1) * dx + (py - oy1) * dy) / l2
                if 0.02 < t < 0.98:
                    qx, qy = ox1 + t * dx, oy1 + t * dy
                    if math.hypot(px - qx, py - qy) <= od["espesor"] / 2.0 + 0.01:
                        en_t = True
            correccion = 0.0
            if en_t:
                # Hasta la cara del núcleo pasante: se descuenta media núcleo del otro.
                correccion = -self._media_nucleo_otro(muro, px, py, ux, uy, extremo)
            elif en_l:
                correccion = lado * desplazamiento
            if extremo == 0:
                inicio = correccion
            else:
                fin = correccion
        return max(largo + inicio + fin, 0.0)

    def _media_nucleo_otro(
        self, muro: Any, px: float, py: float, ux: float, uy: float, extremo: int
    ) -> float:
        for otro in self.modelo.by_type("IfcWall"):
            if otro == muro:
                continue
            od = self._datos_muro(otro)
            if od["longitud"] <= TOLERANCIA_CALCULO:
                continue
            ox1, oy1, ox2, oy2 = od["x1"], od["y1"], od["x2"], od["y2"]
            dx, dy = ox2 - ox1, oy2 - oy1
            l2 = dx * dx + dy * dy
            if l2 <= TOLERANCIA_CALCULO:
                continue
            t = ((px - ox1) * dx + (py - oy1) * dy) / l2
            if not (0.02 < t < 0.98):
                continue
            qx, qy = ox1 + t * dx, oy1 + t * dy
            if math.hypot(px - qx, py - qy) > od["espesor"] / 2.0 + 0.01:
                continue
            nucleo, _ = self._capas_nucleo(otro)
            return nucleo / 2.0
        return 0.0

    def _vano_area(self, muro: Any) -> float:
        return sum(
            info["ancho"] * info["alto"]
            for _vano, info in self._aberturas_del_muro(muro)
        )

    def _area_capa_muro(self, muro: Any, indice: int) -> float:
        datos = self._datos_muro(muro)
        largo = self._largo_cara_capa(muro, indice)
        return max(largo * datos["altura"] - self._vano_area(muro), 0.0)

    def _cimbra_estructura(self, elemento: Any, alias: str | None, pset: dict[str, Any]) -> float:
        tipo = self._tipo_entidad(elemento)
        if tipo is None:
            return 0.0
        _, seccion, _ = self._seccion_y_armado(tipo)
        forma = _texto(seccion.get("Forma") or "rectangular")
        if alias in ("columna", "castillo"):
            if alias == "castillo" and _texto(self._leer_liga(elemento).get("Muro")):
                # Alojado: solo las dos caras que dan a los paños del muro.
                b = float(pset.get("B") or seccion.get("B") or 0.15)
                alto = float(pset.get("Altura") or 0.0)
                return 2.0 * b * alto
            alto = float(pset.get("Altura") or 0.0)
            if forma == "circular":
                diametro = float(seccion.get("D") or 0.30)
                return math.pi * diametro * alto
            b = float(pset.get("B") or seccion.get("B") or 0.30)
            h = float(pset.get("H") or seccion.get("H") or 0.30)
            return 2.0 * (b + h) * alto
        if alias == "trabe":
            b = float(pset.get("B") or seccion.get("B") or 0.20)
            h = float(pset.get("H") or seccion.get("H") or 0.40)
            # Largo neto: el que resulta del volumen neto (ya cortado por columnas).
            bruto = float(pset.get("Longitud") or 0.0)
            if bruto <= 0:
                x1, y1 = float(pset.get("X1") or 0.0), float(pset.get("Y1") or 0.0)
                x2, y2 = float(pset.get("X2") or 0.0), float(pset.get("Y2") or 0.0)
                bruto = math.hypot(x2 - x1, y2 - y1)
            area = b * h
            neto = self._volumen_neto(elemento)
            largo = neto / area if area > 0 and neto > 0 else bruto
            return (2.0 * h + b) * largo
        return 0.0

    def _volumen_neto(self, elemento: Any) -> float:
        info = self._cantidades_por_gid().get(_gid(elemento))
        return float(info.get("volumen_neto_m3") or 0.0) if info else 0.0

    def _cantidades_por_gid(self) -> dict[str, dict[str, Any]]:
        cache = getattr(self, "_cache_cantidades_medicion", None)
        if cache is None:
            datos = self.cantidades_estructura()
            cache = {e["globalid"]: e for e in datos.get("elementos", [])}
            self._cache_cantidades_medicion = cache
        return cache

    def _resultado_partida(
        self, elemento: Any, tipo: Any, partida: dict[str, Any]
    ) -> tuple[float, dict[str, Any]] | None:
        criterio = partida["Criterio"]
        pset = self._leer_pset(elemento, "OPENRVT_Estructura")
        alias = self._estructura_de_tipo(tipo) if tipo is not None else None
        factores: dict[str, Any] = {
            "piezas": None, "largo": None, "ancho": None, "alto": None,
        }
        if elemento.is_a("IfcWall"):
            if criterio == "area_nucleo":
                info = self._cantidades_por_gid().get(_gid(elemento))
                if not info or info.get("area_neta_m2") is None:
                    return None
                return float(info["area_neta_m2"]), factores
            if criterio == "area_capa":
                indice = partida.get("Capa")
                if indice is None:
                    return None
                return self._area_capa_muro(elemento, int(indice)), factores
            if criterio == "largo":
                datos = self._datos_muro(elemento)
                factores["largo"] = round(datos["longitud"], 4)
                factores["alto"] = round(datos["altura"], 4)
                return datos["longitud"], factores
            return None
        if elemento.is_a("IfcSlab"):
            datos = self._leer_pset(elemento, "OPENRVT_Losa")
            espesor = float(datos.get("Espesor") or 0.12)
            if criterio == "area":
                if datos.get("Area") is not None:
                    return float(datos["Area"]), factores
                puntos = self._poligono_de_losa(elemento)
                if len(puntos) < 3:
                    return None
                return abs(_poligono_area(puntos)), factores
            if criterio == "volumen":
                info = self._cantidades_por_gid().get(_gid(elemento))
                if not info:
                    return None
                return float(info["volumen_neto_m3"]), factores
            if criterio == "cimbra_borde":
                if datos.get("Perimetro") is not None:
                    return float(datos["Perimetro"]) * espesor, factores
                puntos = self._poligono_de_losa(elemento)
                if len(puntos) < 3:
                    return None
                perimetro = sum(
                    math.hypot(
                        puntos[(i + 1) % len(puntos)][0] - puntos[i][0],
                        puntos[(i + 1) % len(puntos)][1] - puntos[i][1],
                    )
                    for i in range(len(puntos))
                )
                return perimetro * espesor, factores
            return None
        if elemento.is_a("IfcDoor") or elemento.is_a("IfcWindow"):
            if criterio == "piezas":
                factores["piezas"] = 1
                return 1.0, factores
            return None
        if not elemento.is_a("IfcElement"):
            return None
        if criterio == "volumen":
            info = self._cantidades_por_gid().get(_gid(elemento))
            if not info:
                return None
            return float(info["volumen_neto_m3"]), factores
        if criterio == "acero":
            info = self._cantidades_por_gid().get(_gid(elemento))
            if not info:
                return None
            return float(info["acero_kg"]), factores
        if criterio == "cimbra":
            return self._cimbra_estructura(elemento, alias, pset), factores
        if criterio == "plantilla" and alias == "zapata":
            _, seccion, _ = self._seccion_y_armado(tipo)
            largo = float(seccion.get("Largo") or 1.20)
            ancho = float(seccion.get("Ancho") or 1.20)
            factores["largo"] = largo
            factores["ancho"] = ancho
            return largo * ancho, factores
        if criterio == "excavacion" and alias == "zapata":
            _, seccion, _ = self._seccion_y_armado(tipo)
            largo = float(seccion.get("Largo") or 1.20)
            ancho = float(seccion.get("Ancho") or 1.20)
            desplante = float(pset.get("Desplante") or 0.0)
            return (largo + 0.40) * (ancho + 0.40) * desplante, factores
        return None

    def _descripcion(self, elemento: Any, tipo: Any, partida: dict[str, Any]) -> str:
        nombre_tipo = _nombre(tipo) if tipo is not None else elemento.is_a()
        nombre = _nombre(elemento)
        base = f"{nombre_tipo} · {nombre}" if nombre else nombre_tipo
        if partida["Criterio"] == "area_capa":
            base += f" · capa: {partida['Nombre']}"
        return base

    def medicion_calcular(self, nivel: str | None = None) -> dict[str, Any]:
        self._exigir_modelo()
        if hasattr(self, "_cache_cantidades_medicion"):
            del self._cache_cantidades_medicion
        filtro = _texto(nivel).strip()
        grupos: dict[tuple[str, str, str], dict[str, Any]] = {}
        for elemento in self.modelo.by_type("IfcElement"):
            if not self._es_elemento(elemento):
                continue
            nivel_elemento = self._nivel_de_elemento(elemento)
            if filtro:
                if filtro not in (_gid(nivel_elemento), _nombre(nivel_elemento)):
                    continue
            partidas, tipo = self._partidas_de_elemento(elemento)
            if not partidas:
                continue
            for partida in partidas:
                calculado = self._resultado_partida(elemento, tipo, partida)
                if calculado is None:
                    continue
                resultado, factores = calculado
                resultado = round(float(resultado), 4)
                clave = _texto(partida.get("ClavePP")).strip()
                unidad = _texto(partida.get("Unidad"))
                nombre = _texto(partida.get("Nombre"))
                llave = _llave_partida(partida)
                grupo = grupos.setdefault(
                    llave,
                    {
                        "clave": clave,
                        "nombre": nombre,
                        "unidad": unidad,
                        "total": 0.0,
                        "renglones": [],
                    },
                )
                grupo["renglones"].append(
                    {
                        "eje": self._eje_de_elemento(elemento),
                        "tramo": _nombre(nivel_elemento),
                        "descripcion": self._descripcion(elemento, tipo, partida),
                        "piezas": factores["piezas"],
                        "largo": factores["largo"],
                        "ancho": factores["ancho"],
                        "alto": factores["alto"],
                        "resultado": resultado,
                        "globalid": _gid(elemento),
                    }
                )
        partidas = list(grupos.values())
        for partida in partidas:
            # El contrato exige que el total sea exactamente la suma de los resultados.
            partida["total"] = sum(
                float(r["resultado"]) for r in partida["renglones"]
            )
        return {"partidas": partidas}

    # ------------------------------------------------------------------ exportación
    def medicion_exportar(self, ruta: str) -> dict[str, Any]:
        self._exigir_modelo()
        destino = _texto(ruta).strip()
        if not destino:
            raise self._error("Falta la ruta del archivo de medición.", -32602)
        calculo = self.medicion_calcular()
        proyecto = ""
        if self.modelo.by_type("IfcProject"):
            proyecto = _nombre(self.modelo.by_type("IfcProject")[0])
        archivo_ifc = os.path.basename(self.ruta) if self.ruta else ""
        datos = {
            "formato": "openrvt-medicion",
            "version": 1,
            "proyecto": proyecto,
            "archivo_ifc": archivo_ifc,
            "fecha": datetime.now().isoformat(timespec="seconds"),
            "partidas": calculo["partidas"],
        }
        from pathlib import Path

        archivo = Path(destino).expanduser()
        try:
            archivo.parent.mkdir(parents=True, exist_ok=True)
            archivo.write_text(
                json.dumps(datos, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
        except OSError as exc:
            raise self._error(f"No se pudo escribir la medición: {exc}", -32004) from exc
        return {"ruta": str(archivo), "partidas": len(datos["partidas"]), **datos}
