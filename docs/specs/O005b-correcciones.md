# O005b — Correcciones a los lineamientos de dibujo

Revisión del supervisor sobre las capturas de O005. Corrige en la rama `o005`.

1. **Planta de FZK saturada de líneas.** En `o005_planta_fzk.png` las viguetas y los elementos de la cubierta del piso de arriba cruzan toda la planta en **línea continua**. Así no se lee.
   - **Niveles por omisión de una planta nueva:** solo su nivel. El resto de los niveles queda desmarcado en «Niveles visibles». Migra las vistas guardadas que traigan todos los niveles marcados por omisión: si la vista no fue editada por el usuario, ajústala.
   - **«Sobre el corte»:** lo que está arriba del plano de corte se dibuja **solo** si su categoría es Losas, Cubiertas o Vigas y pertenece al **mismo nivel** de la planta (volados, aleros, la losa de arriba). Dibuja únicamente su **contorno exterior proyectado** (la silueta en planta, no cada arista), siempre con el patrón discontinuo largo y el grosor de proyección.
   - **Prueba vitest:** con un nivel de prueba que tenga una losa de volado y viguetas en el nivel superior, la planta del nivel inferior dibuja el contorno discontinuo del volado y **ninguna** vigueta.
2. **Símbolo de ventana desplazado.** En `o005_planta_casa.png` el rectángulo de la ventana sale fuera del muro.
   - El símbolo va **centrado en el eje del muro**, con su ancho igual al espesor del muro: dos paños en los bordes del muro y el vidrio al centro. El alféizar sobresale como máximo 0.05 m hacia el exterior.
   - **Prueba vitest:** el símbolo de una ventana en un muro de 0.15 m queda dentro de la franja del muro (± 0.05 m del alféizar).
3. **Vuelve a tomar las capturas** de O005 (`o005_planta_fzk.png`, `o005_planta_casa.png` y `o005_corte_fzk.png`) y revísalas tú. La planta de FZK debe leerse como plano: muros cortados gruesos, puertas abatidas y la escalera, sin la retícula de viguetas.
4. **Reconstruye los instaladores 0.3.0.**

## Entrega
- Agrega a `docs/progreso/O005.md` la sección «Correcciones O005b».
- Todo en verde: build, vitest, cargo test, clippy y pytest.
- Commits en español. No hagas push.
