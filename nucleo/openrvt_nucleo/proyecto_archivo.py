"""Abrir, crear y guardar el archivo IFC (O066: extraído de modelo.py).

Se mezcla en :class:`openrvt_nucleo.modelo.ModeloNucleo`; usa ``self.modelo`` y
el resto de utilidades del núcleo.
"""

from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import Any

import ifcopenshell
import ifcopenshell.api.aggregate as aggregate
import ifcopenshell.api.context as context
import ifcopenshell.api.project as project
import ifcopenshell.api.root as root
import ifcopenshell.api.unit as unit
import ifcopenshell.util.unit as unit_util

from .modelado.comun import LOG, _texto
from .siembra import SiembraMixin


class ProyectoArchivoMixin(SiembraMixin):
    """Comandos de proyecto: nuevo, abrir y guardar."""

    def nuevo(self, nombre: str = "Modelo sin título") -> dict[str, Any]:
        modelo = project.create_file(version="IFC4")
        proyecto = root.create_entity(modelo, ifc_class="IfcProject", name=nombre)
        unit.assign_unit(
            modelo,
            length={"is_metric": True, "raw": "METERS"},
            area={"is_metric": True, "raw": "METERS"},
            volume={"is_metric": True, "raw": "METERS"},
        )
        sitio = root.create_entity(modelo, ifc_class="IfcSite", name="Sitio")
        edificio = root.create_entity(modelo, ifc_class="IfcBuilding", name="Edificio")
        nivel = root.create_entity(modelo, ifc_class="IfcBuildingStorey", name="Nivel 0")
        nivel.Elevation = 0.0
        aggregate.assign_object(modelo, products=[sitio], relating_object=proyecto)
        aggregate.assign_object(modelo, products=[edificio], relating_object=sitio)
        aggregate.assign_object(modelo, products=[nivel], relating_object=edificio)
        context.add_context(
            modelo,
            context_type="Model",
            context_identifier="Body",
            target_view="MODEL_VIEW",
        )
        self.modelo = modelo
        self.ruta = None
        self.con_cambios = True
        self._deshacer.clear()
        self._rehacer.clear()
        # O007a: biblioteca de materiales y tipos de muro multicapa.
        self._crear_materiales_semilla()
        self.crear_tipos_muro()
        self.crear_tipos_ejemplo()
        self.crear_tipos_estructura()
        self._asegurar_capitulos_obra()
        self.ajeno = False
        self._siembra_pendiente = False
        self._comando_crea_openrvt = False
        return self.info()

    def abrir(self, ruta: str) -> dict[str, Any]:
        from .modelo import ErrorNucleo

        if not ruta or not str(ruta).strip():
            raise ErrorNucleo("Falta la ruta del archivo IFC.", -32602)
        archivo = Path(ruta).expanduser()
        if not archivo.is_file():
            raise ErrorNucleo(f"No existe el archivo: {archivo}", -32002)
        try:
            modelo = ifcopenshell.open(str(archivo))
        except Exception as exc:
            raise ErrorNucleo(f"No se pudo abrir el IFC: {exc}", -32003) from exc
        # O063: todavía no se convierten unidades; se rechaza lo que no esté en metros.
        try:
            escala = float(unit_util.calculate_unit_scale(modelo))
        except Exception:
            escala = 1.0
        if abs(escala - 1.0) > 1e-9:
            raise ErrorNucleo(
                "El archivo está en "
                f"{self._nombre_unidad_longitud(modelo)}; "
                "OPEN-RVT solo abre IFC en metros por ahora.",
                -32030,
            )
        self.modelo = modelo
        self.ruta = str(archivo.resolve())
        self.con_cambios = False
        self._deshacer.clear()
        self._rehacer.clear()
        # O066: un IFC ajeno se abre intacto; la siembra y las reparaciones se
        # aplazan hasta el primer comando que crea un elemento OPEN-RVT.
        self._preparar_abierto(modelo)
        migracion = ""
        if not self.ajeno:
            # O007a: si el archivo no trae biblioteca, se siembra al abrirlo.
            self._asegurar_biblioteca()
            self.crear_tipos_estructura()
            # O054: los castillos de esquina viejos se reparan al abrir el archivo.
            self._reparar_castillos_esquina()
            # O061: los cerramientos con AnchoDelMuro recuperan el espesor del muro.
            self._reparar_ancho_del_muro()
            # O012: los archivos anteriores pueden traer vigas encimadas; se recortan
            # al abrir sin perder elementos.
            self._recalcular_uniones_estructura()
            # O050: las losas con el punto de cierre repetido se reparan sin aviso.
            self._reparar_losas_antiguas()
            # O045: los archivos con la regla vieja (muro cortado por su cerramiento)
            # recuperan la altura de sus propias restricciones, en un solo paso.
            migracion = self._restaurar_altura_muros_embebidos()
            self._asegurar_capitulos_obra()
        info = self.info()
        info["ajeno"] = self.ajeno
        if migracion:
            info["migracion"] = migracion
        return info

    @staticmethod
    def _nombre_unidad_longitud(modelo: Any) -> str:
        """O063: nombre legible de la unidad de longitud del proyecto."""
        nombres = {
            "METRE": "metros",
            "MILLIMETRE": "milímetros",
            "CENTIMETRE": "centímetros",
            "KILOMETRE": "kilómetros",
            "INCH": "pulgadas",
            "FOOT": "pies",
        }
        try:
            unidad = unit_util.get_project_unit(modelo, "LENGTHUNIT")
            completo = unit_util.get_full_unit_name(unidad) if unidad else ""
        except Exception:
            completo = ""
        return nombres.get(completo or "", (completo or "una unidad distinta").lower())

    def _restaurar_altura_muros_embebidos(self) -> str:
        """O045: restaura en una sola pasada la altura de los muros cortados."""
        restaurados = 0
        instantanea = False
        for muro in self.modelo.by_type("IfcWall"):
            datos = self._datos_muro(muro)
            tope_muro = float(datos["z"]) + float(datos["altura"])
            cortado = False
            for dependiente in self._dependientes_de(muro):
                if (
                    self._estructura_de_tipo(self._tipo_entidad(dependiente))
                    != "cerramiento"
                ):
                    continue
                peralte = self._peralte_de(dependiente)
                z = float(
                    self._leer_pset(dependiente, "OPENRVT_Estructura").get("Z") or 0.0
                )
                if abs(tope_muro - (z - peralte / 2.0)) <= 0.005:
                    cortado = True
                    break
            if not cortado:
                continue
            try:
                restriccion = self._restricciones_de(muro)
                if not _texto(restriccion.get("NivelTope")) and restriccion.get(
                    "AlturaSinConexion"
                ) is not None:
                    continue
                if not instantanea:
                    self._instantanea()
                    instantanea = True
                self._aplicar_restriccion(muro, restriccion)
                restaurados += 1
            except Exception:
                LOG.debug("no se pudo restaurar la altura del muro", exc_info=True)
        if not restaurados:
            return ""
        self.con_cambios = True
        return (
            f"O045: se restauró la altura de {restaurados} muro(s) que estaban "
            "cortados por su cerramiento; ahora el cerramiento va embebido."
        )

    def guardar(self, ruta: str | None = None) -> dict[str, Any]:
        from .modelo import ErrorNucleo

        modelo = self._exigir_modelo()
        destino = ruta or self.ruta
        if not destino:
            raise ErrorNucleo("El modelo no tiene ruta; use «Guardar como».", -32602)
        archivo = Path(destino).expanduser()
        temporal = archivo.with_name(archivo.name + ".tmp")
        try:
            archivo.parent.mkdir(parents=True, exist_ok=True)
            modelo.write(str(temporal))
            # El write de IfcOpenShell cierra el archivo; se reabre para asegurar que
            # el contenido llegó al disco antes de reemplazar el destino.
            with open(temporal, "rb+") as manejador:
                manejador.flush()
                os.fsync(manejador.fileno())
            if archivo.exists():
                shutil.copy2(archivo, archivo.with_name(archivo.name + ".bak"))
            os.replace(temporal, archivo)
        except Exception as exc:
            try:
                temporal.unlink(missing_ok=True)
            except OSError:
                pass
            raise ErrorNucleo(f"No se pudo guardar el IFC: {exc}", -32004) from exc
        self.ruta = str(archivo.resolve())
        self.con_cambios = False
        return self.info()
