"""Herramientas de modelado de O003b, repartidas por tema (O064).

Todas las operaciones usan la API de IfcOpenShell. ``ModeladoMixin`` es un *mixin* de
:class:`openrvt_nucleo.modelo.ModeloNucleo`: usa ``self.modelo``, ``self._instantanea``
y el resto de utilidades del núcleo O003a.
"""

from __future__ import annotations

from ..muro_piel import MuroPielMixin
from .comun import *  # noqa: F401,F403

from .utilidades import UtilidadesMixin
from .restricciones import RestriccionesMixin
from .tipos import TiposMixin
from .niveles import NivelesMixin
from .alinear import AlinearMixin
from .restricciones_editar import RestriccionesEditarMixin
from .enlaces import EnlacesMixin
from .ejes import EjesMixin
from .ejes_cotas import EjesCotasMixin
from .muros import MurosMixin
from .muros_cimentacion import MurosCimentacionMixin
from .muros_geometria import MurosGeometriaMixin
from .muros_esquinas import MurosEsquinasMixin
from .estructura_cuerpos import EstructuraCuerposMixin
from .estructura_uniones import EstructuraUnionesMixin
from .estructura_crear import EstructuraCrearMixin
from .uniones_muros import UnionesMurosMixin
from .losas import LosasMixin
from .genericos import GenericosMixin
from .notas import NotasMixin
from .losas_muros import LosasMurosMixin
from .aberturas import AberturasMixin
from .edicion import EdicionMixin
from .recortar import RecortarMixin
from .borrar import BorrarMixin
from .transformar import TransformarMixin
from .copiar import CopiarMixin
from .empujar import EmpujarMixin
from .editar import EditarMixin
from .referencias import ReferenciasMixin


class ModeladoMixin(MuroPielMixin, UtilidadesMixin, RestriccionesMixin, TiposMixin, NivelesMixin, AlinearMixin, RestriccionesEditarMixin, EnlacesMixin, EjesMixin, EjesCotasMixin, MurosMixin, MurosCimentacionMixin, MurosGeometriaMixin, MurosEsquinasMixin, EstructuraCuerposMixin, EstructuraUnionesMixin, EstructuraCrearMixin, UnionesMurosMixin, LosasMixin, GenericosMixin, NotasMixin, LosasMurosMixin, AberturasMixin, EdicionMixin, RecortarMixin, BorrarMixin, TransformarMixin, CopiarMixin, EmpujarMixin, EditarMixin, ReferenciasMixin):
    """Métodos de modelado; se mezclan en ``ModeloNucleo``."""
