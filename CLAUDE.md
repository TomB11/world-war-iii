# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install                # first-time setup
npm start                  # dev server at http://localhost:4200 (ng serve)
npm run build               # production build
npm test                    # ng test — Karma+Jasmine, opens a real Chrome window and watches
```

Non-interactive single-shot test run (CI-style, no watch/no visible browser):
```bash
CHROME_BIN="/c/Program Files/Google/Chrome/Application/chrome.exe" npx ng test --watch=false --browsers=ChromeHeadless
```
`CHROME_BIN` is only needed if Karma can't auto-detect a Chrome install. There is no built-in CLI flag to run a single spec file — narrow a run with Jasmine's `fdescribe`/`fit` instead, or scope with `--include` (e.g. `--include='**/rules-engine.spec.ts'`).

Type-check only (no test run, faster feedback):
```bash
npx tsc --noEmit -p tsconfig.json         # app code
npx tsc --noEmit -p tsconfig.spec.json    # spec code
```

## Architecture

This is a from-scratch (not `ng new`) Angular 20 standalone app, strict TypeScript, Signals-only state. The project treats itself as **a deterministic game engine with Angular as a rendering layer** — see `CODING_STANDARTS.txt` §1 (yes, missing the "D" — that's the file's actual name, not a typo).

**Data flow is one-directional and always the same shape:**
`UI component → GameStore method → Command → GameEngine.execute(state, command) → new GameState + GameEngineEvent[] → GameStore interprets events into UI-only signals (rejections, toasts, modal state, map selection) → components re-render off signals.`

- `engine/` is pure TypeScript with zero Angular/DOM imports. One `*.command.ts` class per gameplay action (`engine/commands/`), each validating input and returning `{ state, events }`. `engine/rules-engine.ts` holds read-only queries (legal moves, neighbors, income, contested regions, missile-strike checks) shared by both commands and the UI, so legality checks can never drift from what the UI displays as legal. `engine/game-engine.ts` is just the dispatch point.
- `state/` has exactly three files: `GameStateSignal` (the raw `GameState` signal), `MapUiState` (UI-only selection/hover), and `GameStore` — the **only** facade any component is allowed to inject. `GameStore.dispatch()` runs a command through the engine, then its `applyEvents()` switch translates each returned event into whatever UI signal it affects (e.g. `MovementRejected` → `movementRejectionReason`, `RegionContested` → opens the map selection). Adding a new event type almost always means adding a case here.
- All gameplay numbers live in `data/*.json` (countries, factions, units, economy, straits, sea-zones, starting-deployment) and are loaded once by `services/data-loader.service.ts` into the very first `GameState`. Never hardcode a balance number in TypeScript.
- RNG is deterministic: `engine/random.ts` and `services/random.service.ts` implement the *same* mulberry32 algorithm; the seed lives in `GameState.randomSeed` and advances with each roll. Keep both in sync if either changes.
- `ui/map/` (the canvas world map) is split by concern: `interaction/map-geometry.ts` is pure screen↔world hit-testing math (no drawing, no state), `rendering/` does the actual pixel painting (`map-renderer.ts` for the frame, `unit-icon-renderer.ts` for icon clusters/badges, `unit-icon-images.ts` for the image cache, `unit-icon-config.ts` for every size/spacing constant). `world-map.component.ts` itself only owns the canvas element and the pointer/pan/zoom/drag state machine, delegating everything else.
- **Unit icon artwork** has two parallel render paths that must stay in sync: the canvas cache (`ui/map/rendering/unit-icon-images.ts`) and the DOM component (`ui/shared/unit-icon/unit-icon.component.ts`, via CSS `mask-image`). Both consult the same catalog, `ui/shared/unit-faction-icons.ts` (`getFactionIconPath(unitId, ownerId)`): if a dedicated, already-colored image exists for that unit+faction pair it's used as-is; otherwise both paths fall back to tinting the shared grayscale silhouette (`assets/units/{unitId}.png`) with the faction's color. Adding new per-faction art means adding one entry to that one catalog file — nothing else needs touching.
- Region combat is stateful: a contested region gets a `RegionCombat` entry in `state.combats`, advanced turn-by-turn via `RollCombatCommand` / `FireMissileCommand` / `RemoveCasualtyCommand` and rendered in `ui/overlays/combat-board/`. Missile strikes (`GameState.missileDeclarations`) are declared without the launching unit moving — see `AttackCommand` and `RulesEngine.hasPendingMissileStrike`.
- `ui/overlays/toast-host/` mirrors the store's various `*RejectionReason` / `*ResultMessage` signals as global transient toasts. This exists because several panels only render their own inline copy of a rejection conditionally (e.g. only during a specific phase), which can silently swallow a rejection the player needs to see.
- The color theme is CSS custom properties in `src/styles.scss` (`--wwiii-accent`, `--wwiii-bg`, `--wwiii-border`, ...). Several older components still hardcode literal hex values instead of referencing a variable — check for stray hex literals when making a theme-wide color change.
- Tests today are engine-only (`engine/**/*.spec.ts`), built on shared fixtures in `engine/test-fixtures.ts` (`testState()`, `player()`, `region()`, `unitInstance()`, etc.) — no component/UI tests exist yet.

## Project documents

These are the source of truth — read the actual file rather than relying on a summary, since they're actively maintained:

- `PROJECT_RULES.txt` — gameplay rules (the ultimate authority on how a mechanic should behave)
- `CODING_STANDARTS.txt` — TypeScript/Angular conventions (strict mode, no `any`/non-null assertions, Command pattern, immutability)
- `PROJECT_STRUCTURE.md` — folder layout conventions and "where to look for X"
- `IMPLEMENTATION_PLAN.txt` — phased build order, what's intentionally not built yet
- `README.md` — current snapshot of what's implemented vs not
