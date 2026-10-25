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
  base types and three multilayer examples; Structure brings footings, grade beams,
  columns, tie columns, beams, lintel beams and sill beams; MEP shows "Coming soon".
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

### Structure

Every structural element comes from a type with a **section** and **reinforcement**.
The **Model → Structure** ribbon group has Footing, Strip footing, Grade beam, Column,
Tie column, Beam, Lintel beam and Sill beam.

- **Footing, column and tie column:** one click. The cursor snaps to the **intersection
  of two grids**, with priority over the grid step; **R** rotates 90°.
- **Strip footing, grade beam, beam, lintel and sill:** two clicks like a wall. You can
  type the length and press Enter.
- **Footings:** the embedment is the depth below the storey level. The lean-concrete
  blinding sits below the pad and the pedestal is centred on top.
- **Sill beam:** its bottom face rests on the storey elevation; the other beams leave
  their top face at the storey elevation plus the offset.
- **Type editor:** for structural classes it shows the section in centimetres (stored
  in metres by the core) and the reinforcement: longitudinal bars, stirrups, footing
  grids, cover and armex. The preview draws the section with its stirrup, bars and B
  and H dimensions; footings show the grid and a section through the depth.
- **Estimated steel:** the editor footer gives kg/m for a linear piece or kg per
  footing. Selecting an element shows "Estimated steel" in the properties panel and
  lets you edit embedment, offset, height and upper level.
- **Plan:** columns and tie columns are filled with the concrete hatch; beams, lintel
  beams, sill beams, footings and grade beams are drawn with dashed lines.

### What's new in version 0.5.3

- New structural elements: isolated and strip footings, grade beam, column, tie column,
  beam, lintel beam and sill beam, with seed types.
- Editable section and reinforcement per type, regenerating every instance in a single
  undo step.
- Estimated steel per piece with the #2 to #8 bar table and the armex table.
- Placement tools with grid-intersection snapping and R rotation.
- Reinforced-section preview in the type editor and estimated steel in the properties
  panel.

### Shortcuts

| Shortcut | Action |
| --- | --- |
| F1 or Ctrl+/ | Keyboard shortcuts |
| Ctrl+K | Command palette |
| Ctrl+F1 | Minimize or restore the ribbon |
| Alt+1 … Alt+9 | Switch module |
| Ctrl+= / Ctrl+− / Ctrl+0 | Interface size |
