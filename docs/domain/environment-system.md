# Environment System

## Overview
The environment system (MVP-03-A) introduces a persistent world-level state that drives **temperature**, **day/night cycles**, and **exposure pressure** on agents. It is the first "ambient threat" — agents must now manage not only hunger and thirst, but also their body temperature.

## Day/Night Cycle

Temperature follows a sinusoidal curve over a fixed cycle:

```
temperature(tick) = 42.5 + 17.5 × sin(2π × tick / dayLength)
```

| Phase | Temperature | Range |
|-------|------------|-------|
| Day peak (tick T/4) | ~60° | Comfortable |
| Neutral (tick 0, T/2) | ~42° | Borderline |
| Night low (tick 3T/4) | ~25° | Cold |

- **Default `dayLength`**: 40 ticks (20 day + 20 night)
- **Cold threshold**: `temperature < 40`
- When temperature crosses the threshold, `exposure` need begins decaying

## Exposure Need

`exposure` (init 100, max 100, deathThreshold 0) is a new survival dimension:

| Condition | Rate |
|-----------|------|
| Cold + no protection | -2/tick |
| Cold + `warming` status (near fire pit) | -1/tick |
| Cold + `sheltered` status (in lean_to) | 0/tick (fully protected) |
| Warm (temperature ≥ 40) | +1/tick (recovery) |

- **criticalThreshold**: 30
- Below critical: `EXPOSURE_WARNING` event emitted, agents begin seeking shelter
- At 0: entity dies (3rd death axis after hunger and thirst)

**Design note**: With `exposure = 100` and cold decay of `-2/tick`, agents can survive a full 50-tick cold stretch before death. Since nights are only 20 ticks, agents get 1.5× safety margin before shelter is critical.

## Shelter: Lean-To

The lean_to is the first shelter structure, buildable by any agent (no skill required).

```json
"lean_to": {
  "requiredItems": { "berry": 2 },
  "initialDurability": 60,
  "fuelPerTick": 0.5,
  "effectRadius": 1,
  "effects": ["sheltered"]
}
```

| Property | Value |
|---------|-------|
| Cost | 2 berries |
| Duration | 120 ticks (at 0.5 fuel/tick) |
| Radius | 1 tile |
| Effect | `sheltered` status → full exposure protection |

Compared to fire_pit (warming, 30 ticks, radius 2, 3 berries): lean_to is cheaper, longer-lasting, but smaller-radius. Agents who stockpile berries near a lean_to are protected for ~3 day/night cycles.

## Architecture

```
environment-tick.ts (calculateTemperature, calculateTimeOfDay, tickEnvironment)
    ↓ updates world.environment each tick (step 1.5)
decay-needs.ts (exposure special case)
    ↓ reads world.environment.temperature + entity.statuses
structure-tick.ts (sheltered effect apply/remove)
    ↓ identical pattern to warming
memory-aware-policy.ts (Priority 2.5: exposure crisis)
    ↓ reads snapshot.isCold + snapshot.selfExposure
```

## Events

| Event | When |
|-------|------|
| `ENVIRONMENT_CHANGED` | Day/night phase transition |
| `EXPOSURE_WARNING` | Agent exposure crosses criticalThreshold (30) |
| `SHELTERED_APPLIED` | Agent enters lean_to radius |

## WorldState Addition

```typescript
interface EnvironmentState {
  temperature: number;   // 25–60 sinusoidal
  timeOfDay: "day" | "night";
  readonly dayLength: number;  // ticks per full cycle
}
```

The field is `optional` (`world.environment?`) for backward compatibility. If absent, `decayNeeds` defaults to `temperature = 60` (warm) and exposure never decays.

## Agent Behavior

**Priority 2.5: Exposure Crisis** (in `memory-aware-policy.ts`):

1. If `isCold && exposure <= 30 && !sheltered`:
   - If nearby active shelter (lean_to or fire_pit): move toward it
   - Elif has ≥2 berries: build lean_to immediately
   - Else: fall through to resource-seeking (to gather berries)

This runs above normal resource-seeking (Priority 4) but below critical hunger/thirst (Priority 1).

## GUI Indicators

| Element | Shows |
|---------|-------|
| Bottom bar `metric-environment` | 🌞/🌙 Day/Night + 🥶/☀️ temperature |
| Bottom bar `metric-shelters` | 🛖 count of active shelters |
| Agent card | Exposure need bar (cyan) |
| Agent card status badges | 🔥 warming, 🛖 sheltered |
| Map cell `has-lean-to` | Teal-highlighted cells with 🛖 |
| Map night-mode | Dimmed cells during night |
| Agent detail panel | Exposure `E:` value |

## Balance Parameters

| Parameter | Value | Location |
|-----------|-------|---------|
| `COLD_THRESHOLD` | 40 | `environment-tick.ts` |
| `EXPOSURE_COLD_DECAY` | 2 | `decay-needs.ts` |
| `EXPOSURE_WARMING_DECAY` | 1 | `decay-needs.ts` |
| `EXPOSURE_REGEN` | 1 | `decay-needs.ts` |
| `lean_to.initialDurability` | 60 | `structures.json` |
| `lean_to.fuelPerTick` | 0.5 | `structures.json` |
| `DEFAULT_DAY_LENGTH` | 40 | `environment-tick.ts` |

## Future Extensions

- Seasonal temperature variation (on top of daily cycle)
- Terrain modifiers (forest provides +5° warmth)
- More structure effects (cave, earthworks)
- Rainy season (increased exposure decay)
- `safetyPressure` need integration with cold
