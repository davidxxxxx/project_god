# MBTI Personality System (Phase 1)

## Overview

Every agent has a unique **MBTI personality** composed of 4 continuous axes from -1.0 to +1.0.
The 4-letter MBTI code (e.g., "INTJ", "ENFP") is derived from the sign of each axis.

## Axes

| Axis | -1 | +1 | Governs |
|------|----|----|---------|
| `ei` | **I**ntroversion | **E**xtraversion | Social behavior, group-seeking, trust gain |
| `sn` | **S**ensing | i**N**tuition | Exploration, invention chance, curiosity, wander radius |
| `tf` | **T**hinking | **F**eeling | Empathy, faith affinity, resource sharing |
| `jp` | **J**udging | **P**erceiving | Planning, stockpiling, build priority |

## Gameplay Modifiers

Personality axes map to concrete gameplay thresholds via `computeModifiers()`:

| Modifier | Default | J-type | P-type | Effect |
|---------|---------|--------|--------|--------|
| `foodSafetyStock` | 4 | 7 | 2 | Min food before non-survival activities |
| `hungerAbortThreshold` | 35 | 45 | 25 | Hunger level to abort building |
| `exploreWeight` | 1.0 | 0.5 | 2.0 | Multiplier on exploration tendency |
| `socialSeekWeight` | 1.0 | 0.3 (I) | 1.8 (E) | How eagerly agent seeks group |
| `buildPriorityBonus` | 0 | +15 | -10 | Bonus to build threshold |
| `innovationChance` | 1.0 | 0.7 (S) | 1.6 (N) | Skill discovery multiplier |
| `trustGainRate` | 1.0 | varies | varies | Combined E+F |
| `resourceShareChance` | 0.3 | 0.1 (T) | 0.6 (F) | Probability of sharing |
| `riskHpThreshold` | 60 | 85 (S) | 50 (N) | Min HP for risky actions |
| `faithAffinity` | 1.0 | 0.5 (T) | 1.8 (F) | Prayer frequency multiplier |
| `wanderRadius` | 5 | 3 (S+J) | 8 (N+P) | Idle wander distance |

## Inheritance

### Gen0 (world creation)
- All 4 axes randomly sampled from U(-1, +1) using seeded RNG.

### Birth
- Each axis: `0.7 * avg(mother, father) + 0.3 * random_mutation`
- Creates personality family traditions while maintaining variation.

## Examples

| MBTI | Behavioral Signature |
|------|---------------------|
| **INTJ** | Solo builder. Stockpiles food. Builds early. Rarely prays. Doesn't seek group. |
| **ENFP** | Explore-everything agent. Wide wander radius. High faith. Shares resources. |
| **ISTJ** | Stays near camp. Practical gatherer. Builds methodically. High food reserve. |
| **ESFP** | Social butterfly. Follows tribe. Lives loose. Low stockpile. Brave explorer. |

## Files

| File | Purpose |
|------|---------|
| `content-data/data/personality.json` | Axis definitions + modifier ranges + inheritance config |
| `shared/src/world.ts` | `Personality` interface + `getMBTICode()` |
| `agent-runtime/src/personality.ts` | `computeModifiers()`, `randomPersonality()`, `inheritPersonality()` |
| `agent-runtime/src/policies/memory-aware-policy.ts` | Uses modifiers for decision thresholds |
| `core-sim/src/create-world.ts` | Assigns random personality to Gen0 |
| `core-sim/src/systems/lifecycle-tick.ts` | Inherits personality from parents at birth |
| `core-sim/src/snapshot.ts` | Populates `mbtiCode` in debug projection |
| `game-client/src/main.ts` | Displays MBTI badge on agent cards + detail panel |

## Current Implementation (Phase 1)

- ✅ Personality assigned at birth and world creation
- ✅ 11 gameplay modifiers computed from 4 axes
- ✅ Policy decisions modulated by personality
- ✅ N types actively explore unvisited terrain
- ✅ MBTI code displayed in UI

## Future Extension (Phase 2+)

- Personality-driven social dialogue (LLM uses MBTI as context)
- Emergent specialization (J types become builders, N types become explorers)
- Trait evolution across generations
- Display personality influence in action reasons
