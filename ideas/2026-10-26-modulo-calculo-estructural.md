# Módulo de cálculo estructural (usuario, 2026-10-26)

## Pedido del usuario
- Un módulo de **cálculo estructural** en OPEN-RVT.
- Analizar las **NTC** (CDMX) y algunos manuales para definir la **metodología** y los
  **resultados**, y cómo se representarán.
- Un **sistema de propuesta** que, según los elementos y las definiciones, proponga secciones y
  armados.

## Notas del supervisor (para cuando se diseñe)
- **Normas base:** NTC-2023 de la CDMX:
  - Criterios y Acciones;
  - Concreto;
  - Acero;
  - Mampostería;
  - Cimentaciones;
  - Sismo y Viento.

  Las fórmulas se escriben con referencia al artículo de la norma, para que todo resultado sea
  trazable.
- **Modelo analítico derivado del BIM:**
  - el modelo físico (muros, columnas, vigas, losas) genera un modelo analítico con nodos,
    barras, placas, apoyos y cargas;
  - el usuario lo revisa antes de calcular.
- **Motor:**
  - un análisis matricial libre (rigideces 3D) en Rust, para empezar reciclando algo existente,
    por ejemplo un núcleo FEM libre;
  - combinaciones de carga según las NTC;
  - análisis sísmico estático y modal espectral, con el espectro según la zona.
- **Diseño por elemento:** revisa la resistencia y propone sección y armado, según los criterios
  que defina el usuario: concreto f'c, acero fy, recubrimientos y diámetros preferidos.
- **Representación:**
  - diagramas de M, V y N sobre el modelo;
  - colores por relación demanda/capacidad;
  - tablas por elemento;
  - memoria de cálculo en PDF;
  - planos de armado.
- **Vínculo con PresupuestosPro:** el acero y el concreto calculados pasan a cuantificación y
  costo.
- **Advertencia:** la herramienta da apoyo a un ingeniero responsable (DRO o corresponsable) y no
  sustituye su firma. Hay que validarla contra ejemplos resueltos de los manuales antes de
  usarla.
- **Pruebas:** casos resueltos de las NTC y de los manuales como evals, con su resultado esperado
  y una tolerancia.
