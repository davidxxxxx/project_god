# Cross-Tribe Diplomacy System

> **Status**: Implemented (P3)
> **Location**: `core-sim/src/systems/diplomacy-tick.ts`

## Overview

The diplomacy system manages relationships between tribes that have split or formed independently. It creates a gameplay layer where tribes can become allies through trade or enemies through territorial competition.

## Core Concepts

### Diplomatic Relation (`TribeDiplomacy`)

Each tribe maintains a diplomacy record per known tribe:

| Field | Type | Description |
|-------|------|-------------|
| `hostility` | `number` [-1, +1] | -1 = deep ally, 0 = neutral, +1 = bitter enemy |
| `tradeCount` | `number` | Total successful cross-tribe trades |
| `conflictCount` | `number` | Total hostile encounters |
| `status` | `string` | Derived from hostility thresholds |
| `lastInteractionTick` | `number` | Last tick with any interaction |

### Status Levels

| Status | Hostility Range | Meaning |
|--------|:--------------:|---------|
| `unknown` | n/a | Tribes haven't met yet |
| `allied` | ≤ -0.5 | Deep cooperation, minimal tension |
| `friendly` | -0.5 to -0.2 | Positive relations, regular trade |
| `neutral` | -0.2 to +0.2 | Default, no strong feelings |
| `hostile` | +0.2 to +0.5 | Rising tension, wary |
| `war` | ≥ +0.5 | Active hostility (reserved for conflict system) |

## Territory System

Tribes claim territory centered on their structures:

- **Center**: Centroid of all tribe-owned active structures
- **Radius**: `BASE(5) + N_structures × 1`, max 15 tiles
- **Fallback**: If no structures, uses member centroid with base radius

When territories overlap, both tribes experience increasing hostility (+0.03/check).

## Hostility Mechanics

| Event | Hostility Change | Notes |
|-------|:----------------:|-------|
| Peaceful encounter | -0.01 per pair | Proximity within 3 tiles |
| Trade (cross-tribe) | -0.05 | Most effective de-escalation |
| Gift (cross-tribe) | -0.08 | Strongest friendship builder |
| Territory overlap | +0.03 | Continuous while overlapping |
| Starving near other's land | +0.02 | Scarcity breeds resentment |
| Natural decay | ±0.002/tick | Tribes slowly forget |

## Simulation Order

The diplomacy system runs at step 4.9 in the tick loop:

```
4.7  tickTribes (member management)
4.8  socialDynamicsTick (intra-tribe: leader election, tension, split)
4.9  diplomacyTick (inter-tribe: encounters, territory, relations)
5+6  validate & execute actions
```

## First Contact

When entities from two tribes encounter each other for the first time:
- A `SOCIAL_INTERACTION` event with `detail: "first_contact"` is emitted
- Both entities gain social memory of the other (initial trust = 0.1)
- The tribe's diplomacy record is initialized to "unknown" → transitions to "neutral"

## Trade Integration

Cross-tribe trades (handled in `executeTrade`) directly update diplomacy:
- Hostility decreases by 0.05 per trade
- Trade count incremented on both sides
- Event message annotated with "(cross-tribe!)"

## Configuration

Tunable parameters in `content-data/data/diplomacy.json`.

## Future Extensions

- **War system**: When hostility reaches "war", agents can attack members of other tribes
- **Alliance mechanics**: Allied tribes share technology discoveries
- **Tribute**: Weaker tribe can offer resources to reduce hostility
- **Peace negotiation**: Leaders meet to formally end conflicts
