# O010 — Pulir lo que hay (sin funciones nuevas)

Directriz del usuario (2026-10-26): «En OPEN-RVT hace falta no adicionar más, sino que funcione
bien lo que hay».

Fuente completa: `ideas/2026-10-26-pulir-lo-que-hay.md`, con capturas en `ideas/capturas/`. Léela
primero; esta spec fija el orden y la prueba de cada punto.

**Regla:** nada de funciones nuevas. Cada punto lleva:
- una prueba (vitest, pytest o E2E);
- una captura de antes y otra de después en `resultados/O010/`.

## Parte 1 — La cámara no se mueve sola (lo que más le molesta)
- El zoom y el encuadre que deja el usuario se conservan siempre, por vista: planta, alzado,
  corte, 3D iso y 3D perspectiva.
- Hoy, el efecto «Cámara de la vista activa» de `src/features/modelo/Visor3D.tsx` recrea la
  cámara cuando cambia `cajaVista`, y eso pasa con cada elemento creado o editado. Separa las
  dos cosas:
  - la cámara se crea y se ajusta solo al abrir una vista por primera vez o con «Ajustar» (F);
  - los cambios del modelo solo actualizan near/far.
- Guarda la navegación por id de vista (objetivo, dirección, distancia y zoom), para que al
  volver a una vista quede donde estaba.
- Prueba:
  1. hacer zoom y paneo;
  2. crear un nivel, un eje y un muro, editar una cota y cambiar una propiedad;
  3. comprobar que la cámara es idéntica en las 5 vistas.

## Parte 2 — 3D en perspectiva (queja nueva)
- En isométrico se dibujan los bordes y se lee bien. En perspectiva NO hay bordes y las caras
  se oscurecen de forma rara, como si la geometría estuviera mal, aunque no parpadean.
- Diagnóstico y arreglo:
  - Revisa por qué la perspectiva no dibuja aristas: estilo «sombreado», otra rama del código o
    planos de recorte. Haz que use las mismas aristas que el isométrico.
  - Revisa las normales: hace falta `computeVertexNormals` con vértices no compartidos entre
    caras planas, o `flatShading`. También `side: DoubleSide` en sólidos, triángulos invertidos
    y el `near` de la cámara de perspectiva (precisión de profundidad).
  - Las caras planas de un muro deben verse con un tono uniforme, sin degradados ni manchas.
- Prueba:
  - capturas iso contra perspectiva del mismo modelo (muros en L y T, losa, puerta y ventana);
  - una prueba unitaria de que la geometría de un muro produce normales planas, una por cara.

## Parte 3 — Esquinas de muros
- En L, en T, en los entrantes y con muros de distinto espesor, la esquina queda limpia, sin
  picos ni muescas, en planta y en 3D.
- Captura de referencia: `ideas/capturas/2026-10-26-esquinas-muros.jpg`.
- Reutiliza las reglas de esquina de `planta.ts` (O006e) y extiéndelas al sólido 3D si este no
  las usa.
- Pruebas de geometría: área de huella exacta, sin solapes, para L, T, cruz y espesores
  distintos.

## Parte 4 — Niveles
- **Cotas:** aceptar `.1`, `0.1`, `0,1`, `10cm`, `100mm` y negativos. El error sale junto a la
  caja, no en la barra de estado.
- **Funciones:** crear, renombrar, mover y borrar. «Mover los de arriba» debe ser claro: casilla
  con texto explicativo. La elevación se edita directo en la etiqueta del nivel, en alzado.
- **Cota total «9.00»:** rotularla «Total 9.00».
- **Flechas verdes y roja:** averigua qué son. Si son ayudas de arrastre, que tengan tooltip y
  solo aparezcan con el nivel seleccionado; si sobran, quítalas.
- **Ejes en alzado:** ordenarlos según la orientación del alzado, de izquierda a derecha como se
  ven desde ese lado. Hoy salen como 4 3 5 2 1.

## Parte 5 — Paneles y propiedades de vista
- Los paneles «Vistas» (izquierda) y «Propiedades» (derecha) se redimensionan arrastrando su
  borde, con ancho mínimo y máximo. El ancho se recuerda.
- Altura del plano de corte, Profundidad y «Sobre el corte, hasta» van en un grupo plegado
  «Rango de vista (avanzado)», cerrado por omisión, con un tooltip corto que explique cada uno.

## Parte 6 — Residuos y repaso
- Las cotas azules sueltas «2.00» en planta (arriba a la izquierda y abajo a la derecha):
  encuentra de dónde salen y elimínalas si no pertenecen a nada.
- Repaso final de muro, losa, puerta, ventana, estructura, ejes y vistas, buscando fallas del
  mismo tipo:
  - redibujos que mueven la cámara;
  - errores lejos de la caja;
  - geometría con aristas o normales mal.

  Anota lo que encuentres y corrígelo.

## Entrega
- Versión **0.5.7**, y en el manual, «Novedades de la versión 0.5.7» (solo correcciones).
- Al final, todo en verde: pruebas de Rust, pytest, vitest, tsc y eslint.
