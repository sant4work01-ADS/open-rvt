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
- **Two fingers on the touchpad**: pan. With `Shift` + two fingers you orbit in 3D and
  pan horizontally in plan.
- **Touch screen**: one finger drags the view, two fingers pinch and pan, and a tap is
  a click.
- **Middle button** or **Space + drag**: move the view.
- **F**, middle-button double click or the **Fit** button: frame the view.
- **+** and **−**: zoom in and out. **Ctrl+Shift+D** shows the wheel diagnostics.
- The discreet help at the bottom right of the viewer can be closed and will not come
  back. **Settings → Navigation** chooses the device: Automatic, Mouse or Touchpad.
  The detected device appears in brackets.

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

### Structural interactions

Elements are linked as they are on site and edited in a chain. The link is stored in
the dependent element's `OPENRVT_Liga` property set and also as an
`IfcRelConnectsElements` relation, so it survives saving and reopening.

- **Automatic tie columns** (Model → Structure): asks for the maximum centre spacing
  (3.00 m by default). Places one at every L, T or X corner, one at every free end
  (face flush with the end) and intermediate ones so no gap exceeds the spacing,
  skipping any existing column within 5 cm. It works on the selected walls or, with no
  selection, on every wall of the active storey. One undo step.
- **Tie column on a wall:** clicking inside a wall with the Tie column tool takes the
  core thickness, rotation and base from the wall; its height reaches the lintel's
  bottom face or the top of the wall. Moving, stretching, re-typing or changing the
  wall height relocates it; deleting the wall also deletes its tie columns, lintels and
  sill beams.
- **Lintel and sill on a wall:** one click on the wall creates the piece along its axis
  with the core width. The lintel leaves its top face at the top of the wall and the
  sill its bottom face at the base. Creating a lintel lowers that wall's tie columns to
  its bottom face.
- **Columns at every crossing:** the "At every crossing" button in the Column tool bar
  places a column at every grid crossing and stores `EjeA` and `EjeB`. The "With
  footing" box also creates a footing under each column. Moving an axis moves its
  columns and footings in the same step.
- **Footing under a column:** centred under the column or, with an N, S, E or W
  boundary, shifted so its edge is flush with that column face. The column base drops
  to the top of the pedestal (or of the pad when there is no pedestal). Deleting the
  column asks whether to delete its footing too; the default is yes.
- **Join footings and join columns:** create grade beams between consecutive footings
  and beams between consecutive columns on each axis, centre to centre. Beams leave
  their top face at the upper storey minus the slab thickness and the column tops reach
  that face; the joint belongs to the column.
- **Priority cuts:** quantification never counts the same volume twice. Priority is
  footing > grade beam > column > beam > slab > tie column > lintel/sill > wall core >
  finishes. `cantidades.estructura` returns each piece's gross and net volume and its
  steel, totals by type and the grand total; the sum of net volumes equals the union
  volume.
- **Steel per type piece:** kg/m uses a reference length (3.00 m for columns and tie
  columns; 4.00 m for beams, lintels, sills, grade beams and strip footings) so end
  confinement and stirrups are not overcounted. The editor shows "X kg/m (over L_ref
  m)".

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

## Touchpad navigation

The viewer tells the mouse wheel from the touchpad by the **event burst**, not by a
single event. A Windows touchpad can send whole steps of 100 or 120, so more than
three very close events and fractional deltas are also recognised as a touchpad. The
detection lasts 60 seconds after the last gesture.

- Two fingers: pan.
- Pinch or **Ctrl + wheel**: zoom towards the cursor.
- **Shift + two fingers**: orbit in 3D views and pan horizontally in plan.
- Settings → Navigation: **Automatic / Mouse / Touchpad**. A manual choice always wins;
  "Automatic" uses the last detected device.
- **Ctrl+Shift+D** opens a panel with the last 20 `wheel` events (deltaX, deltaY,
  deltaMode, Ctrl and milliseconds between events) and each one's classification. If
  the touchpad still misbehaves, that panel is what to report.

## What's new in version 0.5.5

- **Automatic tie columns** at corners, free ends and intermediate positions, with
  configurable spacing (3.00 m by default) and no duplicates.
- **Element links** in `OPENRVT_Liga` and `IfcRelConnectsElements`: tie column, lintel
  and sill follow their wall; the footing follows its column.
- **Lintel and sill on a wall** with one click, and tie columns lowering to the
  lintel's bottom face.
- **Columns at every crossing**, with an optional footing; moving an axis moves its
  columns and footings.
- **Footing under a column**, centred or eccentric at a boundary, with the column base
  on top of the pedestal.
- **Automatic grade beams and beams** between consecutive pieces on each axis.
- **Priority cuts** and `cantidades.estructura` with net volumes, steel and totals; the
  sum of nets equals the union.
- **Plan corners** with the core cut by tie columns and columns and the finishes
  running over the tie column.
- **Steel per type piece** with a reference length: C-1 = 10.912 kg/m.

## What's new in version 0.5.4

- **Reliable snaps:** the tolerance is 12 screen pixels at any zoom, the nearest snap
  wins and the 15° angle no longer pulls the point off an axis crossing. Crossings are
  recalculated when axes are created, moved or deleted.
- **Touchpad:** burst detection, two-finger pan, pinch zoom, Shift orbit in 3D, touch
  gestures and a diagnostics panel.
- **Clean corners:** walls are trimmed or extended when joined and plans draw the
  merged outline, trimmed layers and core hatch without lines inside the corner. An
  endpoint within 25 cm of another wall's axis is snapped onto that axis to form the
  joint.
