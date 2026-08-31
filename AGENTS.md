# AGENTS.md

This repository is a deterministic turn-based strategy game built on Angular 20, with the game engine treated as the source of truth and Angular as a rendering layer.

## Read these first

- README.md
- CLAUDE.md
- PROJECT_RULES.txt
- CODING_STANDARTS.txt
- PROJECT_STRUCTURE.md
- IMPLEMENTATION_PLAN.txt

## Project rules for AI coding agents

- Keep gameplay logic in the engine and state layers, not in Angular components.
- Prefer the command pattern: UI action -> command -> GameEngine.execute() -> state update -> store reacts to returned events.
- Use @ngrx/signals feature stores for UI/gameplay concern state; keep stores small and focused.
- Do not hardcode gameplay balance values in TypeScript; update the relevant JSON under src/app/data instead.
- Keep the engine pure TypeScript: no Angular imports, no DOM access, no UI assumptions.
- Follow the repo's file conventions: kebab-case files, PascalCase classes, one responsibility per file, per-component .ts/.html/.scss trio.
- Preserve deterministic behavior: RNG, turn order, and event flow must remain stable.

## Useful commands

- npm install
- npm start
- npm run build
- npm test
- npx tsc --noEmit -p tsconfig.json
- npx tsc --noEmit -p tsconfig.spec.json

For a CI-style headless test run, use:

- CHROME_BIN="/c/Program Files/Google/Chrome/Application/chrome.exe" npx ng test --watch=false --browsers=ChromeHeadless

## Working style

- Prefer small, focused edits over broad refactors.
- Match the existing architecture and naming patterns already used in the repo.
- When fixing gameplay behavior, update the relevant engine command/rules file and confirm whether the rules docs also need to be aligned.
- If you are touching UI behavior, trace the state-store event flow before changing render logic.

## Avoid

- Putting business logic into component classes.
- Replacing the engine/state pattern with ad hoc UI logic.
- Duplicating rules or balance numbers in multiple places.
- Adding Angular dependencies to the engine layer.

This file is intentionally brief; the project documents above are the source of truth for details.
