# Family & Lifecycle System (MVP-04)

## Overview

The family system introduces a **dual time-scale lifecycle** where agents are born, age, pair bond, reproduce, and die of old age. This creates generational dynamics, enabling knowledge and genetic inheritance across multiple agent lifetimes.

## Dual Time Scale

The simulation runs on two time layers:

| Layer | Unit | Purpose |
|-------|------|---------|
| **Action Ticks** | 1 tick = 1 action | Movement, gathering, eating, drinking |
| **Life Years** | `TICKS_PER_YEAR` ticks = 1 year | Aging, pairing, reproduction |

Default: `TICKS_PER_YEAR = 40` (= 1 day/night cycle = 1 life year)

## Life Stages

Derived from `age` and `maxAge`, not stored:

```
LifeStage = "child" | "adult" | "elder"

child:  age < ADULTHOOD_AGE (15)
adult:  ADULTHOOD_AGE <= age < maxAge * ELDER_AGE_RATIO (0.75)
elder:  age >= maxAge * ELDER_AGE_RATIO
death:  age >= maxAge
```

### Stage Behavior

| Stage | Actions | Hunger/Thirst | Pairing | Icon |
|-------|---------|---------------|---------|------|
| child | Follow parent only | Half-rate decay | ❌ | 👶 |
| adult | Full autonomy | Normal decay | ✅ | 🧑/🧙 |
| elder | Full autonomy (slower) | Normal decay | ❌ | 👴 |

## Entity Fields (MVP-04 additions)

All optional for backward compatibility:

```typescript
age?: number;           // Current age in life-years
sex?: Sex;              // "male" | "female"
maxAge?: number;        // Natural lifespan in years
bornAtTick?: number;    // World tick at birth (negative for Gen0)
parentIds?: [EntityId, EntityId];  // [mother, father]
childIds?: EntityId[];  // Children born to this entity
spouseId?: EntityId;    // Current partner
lastBirthTick?: number; // Tick of most recent child
```

## Pair Bonding

Two entities form a pair bond when ALL conditions are met:

| Condition | Value |
|-----------|-------|
| Both alive | ✅ |
| Opposite sex | Required |
| Both adult | age ≥ PAIRING_MIN_AGE (16) |
| Same tribe | tribeId matches |
| Adjacent | manhattan distance ≤ 1 |
| Mutual trust | socialMemory trust ≥ 0.5 |
| Both unpaired | no existing spouseId |

Event emitted: `PAIR_BONDED`

Spouse reference is cleared if partner dies.

## Reproduction (Birth)

A child is born when paired adults meet these conditions:

| Condition | Value |
|-----------|-------|
| Both alive + adult | Not elder |
| Same position | x,y exact match |
| Both fed | hunger > MIN_BIRTH_HUNGER (40) |
| Cooldown elapsed | tick - lastBirthTick ≥ BIRTH_COOLDOWN_YEARS × TICKS_PER_YEAR |

### Child Attributes

| Attribute | Source |
|-----------|--------|
| position | Mother's position |
| sex | 50/50 random |
| tribeId | Parents' tribeId |
| intelligence | avg(parents) ± ATTRIBUTE_MUTATION_RANGE |
| body | avg(parents) ± ATTRIBUTE_MUTATION_RANGE |
| maxAge | avg(parents) ± 5 |
| skills | None (must learn from cultural memory) |
| needs | hunger=80, thirst=80, exposure=100 |

Event emitted: `ENTITY_BORN`

## Natural Death

When `age >= maxAge`, the entity dies and `ENTITY_DIED { cause: "old_age" }` is emitted.

Gen0 entities start with random age 20–30 and maxAge 60–80, ensuring they don't all die simultaneously.

## Events

| Event | Trigger | Key Data |
|-------|---------|----------|
| `ENTITY_BORN` | Child created | entityId, parentIds, sex, position |
| `PAIR_BONDED` | Pair bond formed | entity1Id, entity2Id, tribeId |
| `ENTITY_AGED` | Life stage transition | entityId, newStage, age |

## Configuration (lifecycle.json)

All lifecycle constants are tunable in `content-data/data/lifecycle.json`:

```json
{
  "TICKS_PER_YEAR": 40,
  "ADULTHOOD_AGE": 15,
  "ELDER_AGE_RATIO": 0.75,
  "DEFAULT_MAX_AGE": 70,
  "MAX_AGE_VARIANCE": 10,
  "BIRTH_COOLDOWN_YEARS": 4,
  "MIN_BIRTH_HUNGER": 40,
  "CHILD_FOLLOW_RADIUS": 2,
  "PAIRING_MIN_TRUST": 0.5,
  "PAIRING_MIN_AGE": 16,
  "ATTRIBUTE_MUTATION_RANGE": 2
}
```

## Tick Loop Position

Lifecycle tick runs at **Step 1.6** — after environment tick, before needs decay:

```
1.   World tick++
1.5  Environment tick (temperature, day/night)
1.6  Lifecycle tick (aging, pairing, birth)   ← NEW
2.   Decay needs
3.   Perception → Decision → Validation → Execution
...
```

## File Map

| File | Role |
|------|------|
| `shared/world.ts` | EntityState lifecycle fields + LifeStage/Sex types |
| `shared/events.ts` | ENTITY_BORN, PAIR_BONDED, ENTITY_AGED events |
| `core-sim/systems/lifecycle-tick.ts` | Core lifecycle system |
| `core-sim/systems/decay-needs.ts` | Child half-decay logic |
| `core-sim/content-types.ts` | LifecycleDef interface |
| `content-data/data/lifecycle.json` | Tunable constants |
| `agent-runtime/policies/memory-aware-policy.ts` | Child follow-parent behavior |
| `game-client/src/renderer/layers/AgentLayer.ts` | PixiJS lifecycle rendering |
