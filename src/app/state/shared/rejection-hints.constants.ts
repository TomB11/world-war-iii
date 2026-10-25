/** One "how to avoid this" suggestion, shown under a rejection notification when the engine's reason text matches `pattern`. First match wins. */
export interface RejectionHintRule {
  readonly pattern: RegExp;
  readonly hint: string;
}

export const REJECTION_HINT_RULES: readonly RejectionHintRule[] = [
  { pattern: /not your turn/i, hint: 'Wait until the active faction finishes its turn.' },
  { pattern: /Resolve all pending battles/i, hint: 'Click the highlighted contested regions on the map and fight each battle to the end before advancing.' },
  { pattern: /Resolve the current step before rolling again/i, hint: 'Finish the current step first — remove the pending casualties by clicking a unit.' },
  { pattern: /no pending battle|No casualties are pending|not part of the side taking losses|never fought/i, hint: 'Click one of the units of the side that is taking losses, shown with the red prompt.' },
  { pattern: /no missiles in Reserve|no ".*" in Reserve/i, hint: 'Buy a missile in the Buy Units phase first — it is kept in your Missile Arsenal until fired.' },
  { pattern: /Missile|missile|Rocket System/, hint: 'A Rocket System can only support a battle your own units already opened. Move an attacker in first, then declare the strike (Missile A reaches 1 region, Missile B 2).' },
  { pattern: /not a legal attack target/i, hint: 'Pick a region highlighted in red while the unit is selected — those are the only targets in its range.' },
  { pattern: /not a legal destination/i, hint: 'Select the unit first and drop it on one of the highlighted regions.' },
  { pattern: /no movement remaining|already attacked|already fought|cannot move again/i, hint: 'This unit has used up its move this turn. Choose another unit, or advance to the next phase.' },
  { pattern: /only allowed during|can only be|may only/i, hint: 'This action belongs to a different phase — check the Turn sequence bar at the top.' },
  { pattern: /Insufficient treasury|Not enough treasury/i, hint: 'Lower the quantity or pick a cheaper option — your treasury is shown in the Turn panel.' },
  { pattern: /already used your Cyber Attack/i, hint: 'Only one Cyber Attack action is allowed per turn. Advance to the next phase.' },
  { pattern: /teammate|yourself/i, hint: 'Choose an opposing faction as the target — allies can never be targeted.' },
  { pattern: /not neutral/i, hint: 'Political Influence only works on neutral (unowned) regions.' },
  { pattern: /factory|production capacity|just captured/i, hint: 'Deploy at a factory region you control that still has free capacity, or wait a turn after capturing.' },
  { pattern: /no free .* slots|cannot carry|Transport|transport|embarked|Embarked/, hint: 'Check the transport has a free slot of the right type and sits in a sea zone bordering the unit.' },
  { pattern: /Hack Level is already|Satisfaction is already/i, hint: 'It is already at the maximum — spend your money elsewhere.' },
  { pattern: /positive whole number/i, hint: 'Enter a whole number greater than zero.' },
  { pattern: /cannot capture/i, hint: 'This unit cannot take a region alone — send an infantry or tank to capture it.' },
  { pattern: /no attack capability/i, hint: 'Units with no attack value cannot attack. Use them to support or defend.' },
];

/** How long (ms) a rejection toast stays up — longer when it carries a hint to read. */
export const REJECTION_TOAST_MS = 7000;
export const REJECTION_TOAST_WITH_HINT_MS = 10000;
