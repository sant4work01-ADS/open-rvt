# Pulir lo que hay, no agregar más (usuario, 2026-10-26, versión 0.5.5)

**Directriz del usuario:** «En OPEN-RVT hace falta no adicionar más, sino que funcione bien lo que
hay». La siguiente tanda de trabajo es solo de corrección y pulido. Nada de funciones nuevas.

## Errores y quejas reportados
1. **Esquinas de muros mal resueltas** (`capturas/2026-10-26-esquinas-muros.jpg`): en las
   uniones, los muros dejan picos o muescas que sobresalen en las 6 esquinas, en ángulos de 90°
   y en el entrante. El inglete o la unión de muros no recorta bien las caras. Debe quedar una
   esquina limpia, sin traslapes ni huecos, en L, en T y con muros de distinto espesor.
2. **Paneles laterales redimensionables** (`capturas/2026-10-26-paneles-planta.jpg`): el panel
   «Vistas» (izquierda) y el de «Propiedades» (derecha) deben poder cambiar de ancho arrastrando
   su borde. El ancho se recuerda.
3. **Propiedades de la vista confusas:** «Altura del plano de corte», «Profundidad» y «Sobre el
   corte, hasta» no se entienden. El usuario espera que el nivel tenga solo su altura.
   - Nota del supervisor: son el rango de vista de la planta, no del nivel, y el concepto es
     válido, como en Revit.
   - Hay que esconderlas en un grupo plegado «Rango de vista (avanzado)», con valores por
     omisión sensatos y una explicación corta en tooltip o con un dibujo.
   - La vista normal no debe pedir nada de eso.
4. **Edición de niveles torpe** (`capturas/2026-10-26-niveles-alzado.jpg`):
   - Escribir `.1` o `.100` da «Cota no válida…». Debe aceptar `.1`, `0.1`, `0,1`, `10cm` y
     negativos para sótanos.
   - El mensaje de error sale en la barra de estado, lejos de la caja: debe salir junto a la
     caja.
   - En general, el sistema de niveles requiere revisión completa:
     - crear, renombrar, mover y borrar;
     - «Mover los de arriba» claro;
     - editar la elevación directo en la etiqueta del nivel.
   - La cota total «9.00» junto a las parciales no se entiende. Etiquetarla («Total 9.00») o
     quitarla.
   - Las flechas verdes hacia la izquierda y la flecha roja vertical no se explican solas.
     Revisar qué son y si sobran.
   - Ejes en alzado: los círculos abajo, en orden 4 3 5 2 1, confunden al usuario. Revisar el
     orden según la orientación del alzado y la posición del encabezado.
5. **Planta:** cotas sueltas en azul («2.00») arriba a la izquierda y abajo a la derecha que no
   pertenecen a nada visible. Revisar si son residuos.

6. **El zoom se reinicia solo (lo odia):** cada acción que redibuja la vista (crear un nivel, un
   eje, un muro, editar una cota, cambiar una propiedad) vuelve al zoom y el encuadre por
   omisión.
   - El zoom y el encuadre que deja el usuario se mantienen siempre, en todas las vistas
     (planta, alzado y 3D) y por vista.
   - Solo cambian con «Ajustar» (F) o cuando el usuario mueve la vista.
   - Una vista recién abierta puede ajustarse una vez. Después, nunca automáticamente.
   - Prueba: hacer zoom, crear y editar 5 elementos, y comprobar que la cámara no se movió.

## Cómo se trabaja
- Una spec de correcciones con todo lo anterior, y cada punto con su prueba y su captura de
  antes y después.
- Verificar también todo lo que ya existe (muro, losa, puerta, ventana, estructura, ejes y
  vistas) buscando fallas del mismo tipo antes de dar por cerrada la tanda.
