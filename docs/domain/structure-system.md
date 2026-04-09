# Structure System

## Overview
Structures are human-built world objects that persist across ticks and produce area effects. They are the first sign of "civilization" — agents leaving lasting marks on the world.

## MVP-02-C: Fire Pit
The fire pit is the first and currently only structure type.

### Data
Defined in `content-data/data/structures.json`:
```json
{
  "fire_pit": {
    "requiredItems": { "berry": 3 },
    "initialDurability": 30,
    "fuelPerTick": 1,
    "effectRadius": 2,
    "effects": ["warming"]
  }
}
```

### Lifecycle
1. Agent accumulates ≥3 berries (stockpile behavior)
2. Agent issues `build` intent with `itemId: "fire_pit"`
3. Validation checks materials in inventory
4. Execution deducts materials, creates `StructureState` in `world.structures`
5. Each tick: `durability -= fuelPerTick` (30 → 29 → ... → 0)
6. At durability 0: `active = false`, `STRUCTURE_EXPIRED` event emitted
7. While active: entities within `effectRadius` receive `warming` status

### Agent Decision Logic
The memory-aware policy includes a **stockpile mechanism**:
- If no nearby active fire pit exists, the agent **delays eating berries** (when hunger pressure ≤ 50)
- Once 3 berries accumulated, agent builds immediately
- If hunger becomes critical (pressure > 50), stockpile is abandoned and berries are eaten
- After building nearby, the agent won't build again until that fire pit expires

### Events
| Event | When |
|-------|------|
| `STRUCTURE_BUILT` | Agent completes construction |
| `STRUCTURE_EXPIRED` | Fuel runs out (durability → 0) |
| `WARMING_APPLIED` | Entity enters warming radius of active fire pit |

### Warming Status
Currently `warming` is a **status tag only** — it doesn't change need decay rates. Phase D's temperature system will give it mechanical effects (e.g., reduced fatigue decay when warming).

## Architecture
```
content-data/structures.json
    ↓
core-sim/content-types.ts (StructureDef)
    ↓
core-sim/validate/validate-build.ts → execute/execute-build.ts
    ↓
core-sim/systems/structure-tick.ts (fuel + warming per tick)
    ↓
shared/world.ts (StructureState in world.structures)
```

## Future Extensions (not yet implemented)
- Shelter (reduces weather effects)
- Storage structures (extra inventory outside entities)
- Repair/refuel actions
- Structure discovery by other agents
