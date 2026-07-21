# WORLD WAR III
# PROJECT STRUCTURE
Version 1.0

---

## 1. TOP-LEVEL LAYOUT

```
src/app/
  config/       Technical rendering config (map size, zoom, hotspot/sea-zone
                sizing). Never gameplay balance values — see CODING_STANDARDS.md §12.
  core/         Cross-cutting building blocks with no gameplay logic of their own:
                constants/  turn phase order, data file paths
                di/         injection tokens
                events/     the GameEngineEvent union (everything the engine can emit)
                utils/      small pure helpers (id generation, etc.)
  data/         All gameplay data as JSON — countries, factions, units, economy,
                straits, sea zones, starting deployment. Never hardcode this
                elsewhere (PROJECT_RULES.md §41).
  engine/       Pure TypeScript game engine. No Angular imports, no DOM access
                (CODING_STANDARDS.md §5).
                commands/   one Command per gameplay action (CODING_STANDARDS.md §6)
                game-engine.ts   dispatches a Command against a GameState
                rules-engine.ts  read-only gameplay queries (income, legal
                                 moves, neighbors, ...)
  models/       One TypeScript interface/type per file, matching the domain
                noun (Region, Faction, UnitInstance, SeaZone, ...).
  screens/      Top-level routed screens (currently just game-screen).
  services/     Angular services that talk to the outside world (HTTP data
                loading, the deterministic RNG). Never gameplay rules.
  state/        The Signal Store layer — GameStateSignal (raw state),
                MapUiState (selection/hover), GameStore (the only facade
                components are allowed to inject) — see CODING_STANDARDS.md §11.
  ui/           Angular components. See section 3 below for the required
                per-component file layout.
```

---

## 2. WHERE TO LOOK FOR SOMETHING SPECIFIC

- **Change a unit icon's size/spacing on the map** → `ui/map/rendering/unit-icon-config.ts`.
  Nothing else in `ui/map` hardcodes these numbers.
- **Change what a unit icon looks like** → the source artwork itself,
  `assets/units/{unitId}.png` (solid silhouette, transparent background —
  never bake in a color, it's tinted per faction at render time). On the
  canvas map that tinting is `ui/map/rendering/unit-icon-images.ts`; in
  ordinary DOM/HTML panels it's the reusable `ui/shared/unit-icon.component.ts`
  (a CSS `mask-image` over the same PNG).
- **Change map click/hover/drag hit-testing** → `ui/map/interaction/map-geometry.ts`.
- **Change how the map is painted (flags, sea zone circles, highlight colors)** →
  `ui/map/rendering/map-renderer.ts`.
- **Change a gameplay rule** → `engine/rules-engine.ts` (queries) or the
  relevant `engine/commands/*.command.ts` (state transitions), and update
  `PROJECT_RULES.md` to match.
- **Change a balance number (cost, attack, income, ...)** → the relevant file
  under `data/*.json`, never in TypeScript.
- **Change a panel's layout/copy** → that panel's `.html` file under
  `ui/panels/`. Its logic stays in the sibling `.ts`.

---

## 3. COMPONENT FILE LAYOUT (MANDATORY)

Every Angular component gets three sibling files, never an inline
`template`/`styles` in the `@Component` decorator:

```
foo.component.ts     Logic only: @Component({ templateUrl, styleUrl }), class body.
foo.component.html   Template.
foo.component.scss   Styles.
```

Rationale: a component whose template/styles are inlined in the decorator
turns into an unreadable wall of text as it grows (this is why
`world-map.component.ts` reached 1000+ lines before this file existed).
Splitting the three concerns means each file has exactly one job, matching
CODING_STANDARDS.md §9 ("one responsibility per file").

---

## 4. BREAKING UP A LARGE COMPONENT

If a component's **logic** file itself grows large (not just template/styles),
that's a sign it's doing more than one job. `ui/map/` is the reference
example of how to split it:

```
ui/map/
  world-map.component.ts    Canvas element + pointer/pan/zoom/drag state
                             machine only. Delegates everything else.
  world-map.component.html
  world-map.component.scss
  map-types.ts               Shared small types (ViewTransform, MapPoint,
                              UnitDragState) used across the files below.
  interaction/
    map-geometry.ts          MapGeometry class: screen<->world conversion,
                              hit-testing (region/sea-zone/unit-icon).
                              Pure — no canvas drawing, no state mutation.
  rendering/
    map-renderer.ts          MapRenderer class: paints one frame (background,
                              hotspots, sea zone markers, drag ghost).
    unit-icon-renderer.ts    Lays out and draws a cluster of unit icons at
                              one map location (the backing plate + count
                              badges + per-icon dispatch).
    unit-icon-images.ts      Loads assets/units/*.png once and produces
                              faction-tinted offscreen-canvas variants,
                              cached by "unitId:color" — the canvas
                              equivalent of ui/shared/unit-icon.component.ts.
    unit-icon-config.ts      Every size/spacing constant for unit icons.
    canvas-shapes.ts         Generic canvas helpers (rounded rect) with no
                              game-specific knowledge.
```

`ui/shared/` holds small presentational components reused across multiple
panels/screens (currently just `unit-icon.component.ts`) — as opposed to
`ui/panels/`, which is one component per sidebar section.

Each file answers exactly one question. When in doubt about where new
canvas code belongs, ask "is this geometry/hit-testing, or is this pixels
being painted?" — the former goes in `interaction/`, the latter in
`rendering/`.

---

## 5. NAMING AND FOLDER RULES

Same as CODING_STANDARDS.md §8-9: kebab-case files, PascalCase classes,
one responsibility per file, no circular dependencies, engine never depends
on ui/. Constants that only make sense to one module (e.g. unit icon sizing)
live next to that module, not in the global `core/constants/`.

---

END OF DOCUMENT
