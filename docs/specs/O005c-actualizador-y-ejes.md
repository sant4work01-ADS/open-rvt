# O005c — Actualizador automático y fallo de la herramienta Eje

Dos pedidos del usuario tras probar la 0.2.0 instalada.

## 1. Bug: la herramienta Eje no termina el trazo
**Reporte del usuario:** «al dibujar ejes no podía finalizar el trazo del eje». Fue en Windows, con la 0.2.0 instalada.

**Lo que ya revisó el supervisor:** el núcleo sí crea el eje. `ejes.crear` responde bien, y `modelo.referencias` y `geometria.teselar` con el id `<grid>/<etiqueta>` no fallan. El fallo está en la interfaz: `estado.ts` (clic de la herramienta `eje`, ~línea 722), `Visor3D.tsx` y `herramientas.ts`.

**Pasos:**
1. **Reproduce** con la app real (E2E, xvfb) con estos casos:
   - clic, mover y clic en un proyecto nuevo;
   - el mismo caso en la casa de O003b;
   - segundo clic con snap al primer punto o a otro eje;
   - longitud tecleada y Enter;
   - doble clic.

   Anota qué pasa en cada uno: el aviso, el error en la barra de estado y si el eje queda dibujado.
2. **Comportamiento esperado (como Revit):**
   - primer clic: inicio;
   - segundo clic: fin; el eje se crea **y se ve en la planta** (línea trazo-punto con su burbuja y etiqueta en un extremo);
   - la herramienta sigue activa para el siguiente eje, con la etiqueta siguiente (1, 2, 3… o A, B, C…);
   - **Esc** cancela el trazo en curso y, con un segundo Esc, sale de la herramienta;
   - **longitud tecleada y Enter** funciona igual que en Muro;
   - **mientras se traza**, se ve la vista previa de la línea y de la cota temporal.
3. **Si el eje se crea pero no se ve:** dibújalo. Hoy `geometria.teselar` no devuelve mallas para ejes. Los ejes se dibujan en el frontend a partir de `modelo.referencias.ejes`, en **todas** las plantas, con la plumilla «Ejes» de O005.
4. **Revisa las demás herramientas** por el mismo patrón: Nivel, Losa (doble clic para cerrar) y Mover o Copiar (punto base y destino). Cada una debe poder terminarse con clics, Enter o doble clic, y cancelarse con Esc.
5. **Nueva prueba E2E `e2e/herramientas.test.js`:**
   - crea dos ejes perpendiculares y comprueba que existen 2 ejes con burbuja en la planta;
   - crea una losa con 4 clics y doble clic.
6. Agrega pruebas vitest de la máquina de estados de las herramientas (clic, Enter, doble clic y Esc).

## 2. Actualizador automático (como PresupuestosPro)
PresupuestosPro ya se actualiza solo. Su código está en la rama **`actualizaciones`** de PP, en el worktree `/home/sant4/pp-trabajo/actualizaciones` (no está en `master`; por eso O002 no lo encontró):
- `src/features/actualizaciones/` (`servicio.ts` y su prueba);
- `src-tauri/src/lib.rs` (plugin);
- `src-tauri/capabilities/default.json`;
- `tauri.conf.json` (`plugins.updater`).

**Copia ese módulo lo más intacto posible**, con comentarios `// OPEN-RVT:` donde cambie, y actualiza `docs/origen-pp.md` (incluye la rama de origen).

### Configuración
- **pubkey:** el contenido de `~/.tauri/openrvt-updater.key.pub`. El supervisor ya generó la llave; **no** generes otra.
- **endpoint:** `https://gitea.spm.lat/sant4/openrvt-actualizaciones/raw/branch/main/latest.json`
- **Windows:** `installMode: "passive"`, igual que PP.
- **Linux (.deb):** el updater de Tauri no actualiza .deb. Ahí solo avisa que hay versión nueva, con un enlace a la descarga. Ve cómo lo resuelve PP; si PP no lo resuelve, implementa el aviso.

### Script de publicación
- Crea `herramientas/publicar-actualizacion.sh "<notas>"` a partir de `/home/sant4/pp-trabajo/publicar-actualizacion.sh`. Cambia:
  - el repo a `sant4/openrvt-actualizaciones`;
  - la llave a `~/.tauri/openrvt-updater.key`;
  - el nombre a `OPEN-RVT_${V}_x64-setup.exe`;
  - `CARGO_TARGET_DIR` a `~/.cache/pp-target/openrvt-win`;
  - añade antes el paso `herramientas/preparar_python.sh windows`.
- El token es el mismo (`~/.gitea-pp-token`).
- **No lo ejecutes:** la primera publicación la hace el supervisor.

### Versión y pruebas
- Versión **0.3.1** en los cuatro archivos.
- Instaladores en `instaladores/`.
- Prueba que la firma se genera: el build con `TAURI_SIGNING_PRIVATE_KEY` debe producir el `.sig`.

## Entrega
- `docs/progreso/O005c.md` con la etiqueta «LISTA PARA REVISIÓN»: la causa del bug de ejes, qué casos fallaban, las pruebas y la captura `o005c_ejes.png` (planta con 3 ejes verticales y 2 horizontales, burbujas y etiquetas).
- Todo en verde: build, vitest, cargo test, clippy y pytest.
- Commits en español. No hagas push.
