# Tribe System

## Goal
Let agents naturally form groups — transitioning from "individuals surviving alone" to "proto-society with shared knowledge and spatial cohesion."

## Definitions

### TribeState
A group-level data structure stored in `world.tribes[tribeId]`.

| Field | Type | Description |
|-------|------|-------------|
| id | TribeId | Unique tribe identifier |
| name | string | Display name (e.g. "First Tribe") |
| memberIds | EntityId[] | Alive members (auto-pruned each tick) |
| technologies | string[] | Unlocked tribe-level technologies |
| gatherPoint | Vec2? | Centroid of alive member positions |

### Initialization
- `createWorld()` automatically creates `tribe_0` with all entities as members.
- MVP only supports 1 tribe. Multi-tribe split/merge is MVP-03.

## Systems

### Tribe Tick (`tickTribes`)
Runs each tick after skill learning (step 4.7). For each tribe:
1. Remove dead members from `memberIds`
2. Calculate `gatherPoint` as centroid: `avg(member.position)`
3. Emit `TRIBE_GATHER_POINT_UPDATED` when point shifts ≥ 1 unit

### Social Memory
Stored as `entity.socialMemory[targetEntityId] = SocialImpression`.

| Field | Type | Description |
|-------|------|-------------|
| entityId | string | The observed entity |
| trust | number | -1 (hostile) to 1 (trusted). Initial: 0.3 same-tribe, 0 other |
| lastSeenTick | number | Last tick this entity was seen |
| lastSeenPosition | Vec2? | Where they were last seen |

- **Same-tribe**: trust increases by 0.05 per encounter, capped at 0.8
- **Other-tribe**: trust stays at 0 (no mechanic yet)
- Updated in `updateSocialMemory()` called via `defaultPostTickMemoryHook()`

### Social Decision (Priority 4.5)
When no resources are visible or memorized, agents:
1. **Gather point return**: Move toward `tribeGatherPoint` if distance > 5
2. **Follow**: Move toward nearest same-tribe member if distance > 2
3. **Wander**: Idle as fallback

### Shared Resource Memory
When an agent has no resource memory of its own, it checks nearby same-tribe members' episodic memory for `found_resource` entries. This enables knowledge sharing through proximity.

## Key Behaviors Observed
- Agents cluster: avg distance to gather point drops from ~5.0 to ~2.3 over 200 ticks
- All alive agents develop social memory of each other
- Survival rate improved by ~3x due to shared resource knowledge
- Combined with Phase D skill system: 4-5 agents learn fire_making through proximity

## Design Rules
- Tribe data is in `WorldState.tribes`, not `TickContext`
- Social memory belongs to individual agents, not the tribe
- Shared resource knowledge requires face-to-face proximity (perception radius)
- Tribe behavior is lower priority than survival (P4.5 < P4 resource seeking)
