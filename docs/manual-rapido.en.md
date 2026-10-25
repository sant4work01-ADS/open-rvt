# OPEN-RVT quick manual

OPEN-RVT is a free building information modeling (BIM) program.

## Welcome

This first version is the **skeleton** of the application: the title bar, the command
ribbon, the side navigation, the work area and the status bar already look the same as in
PresupuestosPro.

- **Model**: the plan and 3D editor will live here. For now the work area is empty.
- **Levels and axes**: a module reserved for the next task.
- **Settings**: theme (light, dark or system), interface size and language.
- **Help**: this manual and the keyboard shortcut list.

The **New**, **Open** and **Save** commands on the Home tab are disabled with the
description "Available soon": there is no file to open yet.

### Viewer navigation

- **Mouse wheel**: zoom towards the cursor. On a touchpad, **pinch** (Ctrl + wheel)
  also zooms.
- **Two fingers on the touchpad**: pan. Use `Shift` + wheel to pan horizontally.
- **Middle button** or **Space + drag**: move the view.
- **F**, middle-button double click or the **Fit** button: frame the view.
- **+** and **−**: zoom in and out.
- The discreet help at the bottom right of the viewer can be closed and will not come
  back. **Settings → Appearance** offers "Wheel/touchpad: zoom or pan": Automatic
  detects mouse or touchpad; Zoom and Pan force it.

### Types and materials

Every element comes from a **type**: editing the type changes all of its instances.
Open the editor with **Model → Types**, the **Types and materials** sidebar entry or by
double-clicking an element in the model.

- **Type tree:** search, create, duplicate and delete types. Walls already includes the
  base types and three multilayer examples; Structure and MEP show "Coming soon".
- **Wall layers:** ordered from exterior to interior. Each layer has a function (core,
  finish, insulation or membrane), a library material and a thickness in centimetres.
  There must be exactly one core, although it may span several contiguous layers. The
  buttons move, insert and remove layers.
- **Location line:** core axis (default), exterior face, interior face or wall centre.
  Changing the thickness or layers keeps the wall axis fixed.
- **Preview:** shows the section to scale with each layer's colour and hatch, every
  thickness dimension and the total, and labels Exterior and Interior.
- **Instances:** the footer shows how many there are and selects them in the model.
  **Apply** saves the type and regenerates every instance's geometry; it can be undone
  in one step.
- **Materials:** editable library with category, colour, hatch, unit and typical
  thickness. A material in use cannot be deleted.

In plan at **1:50** or larger the layer lines and the thick, hatched core outline are
drawn; at **1:100** or smaller only the outer outline remains.

### Shortcuts

| Shortcut | Action |
| --- | --- |
| F1 or Ctrl+/ | Keyboard shortcuts |
| Ctrl+K | Command palette |
| Ctrl+F1 | Minimize or restore the ribbon |
| Alt+1 … Alt+9 | Switch module |
| Ctrl+= / Ctrl+− / Ctrl+0 | Interface size |
