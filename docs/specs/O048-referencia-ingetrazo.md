# O048: documento de diseño a partir de IngeTrazo (sala limpia, paso 1)

## Para qué
El dueño decidió (6-nov) que de IngeTrazo (ingelibre, GPL-3.0) **no se copia código, ni traducido**: solo ideas
y soluciones. Tú eres el «lado sucio» de la sala limpia: lees IngeTrazo y escribes un documento de diseño con tus
palabras. Otros workers implementarán solo desde tu documento, sin ver IngeTrazo.

El clon de IngeTrazo está en `C:/Users/Sant4/referencias-ext/ingetrazo` (solo lectura; no lo modifiques).

## Qué entregar
`docs/referencias/ingetrazo-modelado.md` en este worktree. Para cada tema: **qué problema resuelve, cómo lo
resuelve (en prosa y pseudocódigo propio), casos difíciles que ellos contemplan, sus valores (tolerancias,
prioridades, atajos de teclado) y qué haríamos distinto en OPEN-RVT**, donde todo es un elemento IFC y no una malla.

Temas, en este orden:
1. Empujar/tirar: sobre qué caras se puede, qué pasa con las caras vecinas y los agujeros, y cómo se teclea la medida.
2. Motor de inferencias: tipos, prioridades, tolerancias, bloqueo de eje (Shift o flechas) y cómo dibuja las guías.
3. Dibujo de líneas y rectángulos sobre caras: cuándo una línea parte una cara y cuándo se unen las caras
   coplanares.
4. Grupos y componentes: aislamiento de la geometría y edición dentro de ellos.
5. La «guarda de hermeticidad»: cómo detectan un sólido roto antes de guardar.
6. La capa BIM: etiquetado de clases IFC, cálculo de cantidades y por qué los muros dieron 19.7 m² en vez de unos
   70 en la prueba del 5-nov (`bim.quantities_csv` para una casa de 8 × 6 × 2.8).
7. El MCP: diseño de pocas herramientas con un «recetario» en la descripción de `run_python`.
8. Lector `.skp`: solo la estrategia general (qué formato y qué partes); NADA de estructuras binarias detalladas.

## Reglas de sala limpia (obligatorias)
- **Prohibido pegar código de IngeTrazo**: ni fragmentos, ni nombres de funciones o variables suyas, más allá
  de citar el archivo de donde sale una idea (ruta y número de línea, para trazabilidad).
- Pseudocódigo propio, en español, a alto nivel.
- No crees ni modifiques código de OPEN-RVT en esta tarea; solo el documento.
- Sin push, merge ni cambio de versión. Resumen corto en `docs/progreso/O048.md`.
