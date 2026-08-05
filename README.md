# World War III 2100

A turn-based grand strategy game (Axis & Allies-inspired) built with Angular 20.
Two modern alliances fight over the world map: command your faction's economy,
armies, navies, missiles and cyber warfare capability across a full turn
cycle, and win by capturing enough white-star victory regions.

## Getting started

```bash
npm install
npm start
```

Then open http://localhost:4200.

## The game

- **Setting**: a near-future (2100) world split into two alliances —
  the **Western Allies** (EUTO, United States, SEATO) and the
  **Eurasian Pact** (Russian Federation, China, Arabia League). Each of the
  6 factions has its own capital, treasury, Reserve of purchasable units,
  Citizen Satisfaction level and Hack Level.
- **Victory**: capture regions marked with a white star. A single faction
  wins solo by capturing 7 white-star regions on its own; a whole alliance
  wins together by jointly capturing 15.
- **Turn cycle**: every player's turn cycles through Buy Units → Cyber
  Attack → Attack Moves → Attack → Tactical Moves → Place New Units →
  Collect Income, before play passes to the next non-eliminated faction.
- **Economy**: treasury funds unit purchases and Public Spending (raising
  Citizen Satisfaction, which decays every turn and swings income bonuses,
  victory points, or open rebellion depending on which band it's in).
- **Units**: a 12-entry catalog across land, air, naval, support and missile
  categories (Infantry, Tank, Helicopter, Fighter, Submarine, Stealth Boat,
  Destroyer, Aircraft Carrier, Rocket System, Land Transport, Missile A/B),
  each with its own cost/attack/defense/movement and special rules (naval
  transport & amphibious assault, submerge, missile strikes declared without
  moving, etc.).
- **Combat**: contested regions and sea zones open a round-by-round combat
  board (dice rolls, casualty selection, missile interception) until one
  side is destroyed or the attack fails.
- **Cyber warfare**: Hacking (steal treasury from a rival), Political
  Influence (peacefully flip a neutral region), and Hack Level upgrades —
  one Cyber Attack Phase action per turn. Teammates can never be hacked,
  sabotaged, or attacked — alliances are a real non-aggression pact, not
  just a shared victory count.

## Game modes

- **Hotseat (local pass-and-play)**: every one of the 6 factions is
  human-controlled, taking turns on the same machine. This is the default —
  just skip the AI setup screen when starting a game.
- **Solo Command Mode**: pick which alliance you play (Western Allies or
  Eurasian Pact); the other alliance's 3 factions are driven entirely by an
  AI opponent. Before the game starts, choose:
  - an **AI Doctrine** for the opposing alliance — Aggressor (attacks,
    tanks, frontline pressure), Fortress (defense, rockets, reinforced
    borders), or Cyber State (hacking, sabotage, neutral influence);
  - an **AI Difficulty** — Easy (AI starts with -5 money), Normal (standard
    rules), Hard (+3 money/turn), or Nightmare (+5 money/turn plus a free
    bonus cyber attack every other turn).

  The AI plays through its factions' full turns automatically (buying units,
  rolling its Cyber/Political action, attacking, resolving combat, moving,
  deploying reinforcements) and hands control back to the human with a
  single dismissable summary of everything it just did, rather than
  interrupting with individual toasts for each action.

## Architecture

- Pure TypeScript Game Engine (`src/app/engine`), zero Angular/DOM
  dependencies: one Command class per gameplay action, a `RulesEngine` for
  shared read-only queries (legal moves, income, contested regions, ...),
  and a deterministic mulberry32 RNG seeded from `GameState.randomSeed`.
- Signal Store layer (`src/app/state`, built on `@ngrx/signals`) split into
  one small feature store per gameplay concern — core state/dispatch, map
  UI, combat, movement, economy, cyber attacks, and Solo Command Mode AI —
  the only bridge between UI and Engine.
- All gameplay numbers live in `src/app/data/*.json` (countries, factions,
  units, economy, straits, sea zones, starting deployment) — never
  hardcoded in TypeScript.
- HTML5 Canvas world map renderer with region/sea-zone selection, drag-drop
  unit movement, animated combat/missile/capture effects, and per-faction
  unit iconography.

## Project documents

- `PROJECT_RULES.txt` — gameplay rules (the ultimate source of truth)
- `CODING_STANDARTS.txt` — TypeScript/Angular conventions
- `PROJECT_STRUCTURE.md` — folder/module architecture
- `IMPLEMENTATION_PLAN.txt` — phased build order, what's intentionally not built yet
- `CLAUDE.md` — architecture guide for AI coding assistants working in this repo
