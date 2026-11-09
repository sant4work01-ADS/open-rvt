# Losas por uso: firme/cimentación, entrepiso y azotea (dueño, 9-nov)

El dueño propone separar elementos para que «las cosas no se revuelvan».
Decisión del supervisor: UNA herramienta Losa con selector «Uso», mapeado al PredefinedType de IFC:
- Firme / losa de cimentación → BASESLAB (sobre terreno; defaults: firme 10 cm sin armado o malla, losa de cimentación armada).
- Entrepiso → FLOOR. Azotea → ROOF (pendiente/relleno e impermeabilizante a futuro).
Cada uso trae sus tipos y defaults (espesor, armado, acabados) y su plantilla de concepto para PresupuestosPro.
Reglas de muros: un BASESLAB solo apoya; FLOOR/ROOF a media altura los atraviesa el muro (O058), en la corona lo cubren.
Spec después de O058. Las losas existentes sin uso se leen por nivel: N0 → BASESLAB, resto → FLOOR.
