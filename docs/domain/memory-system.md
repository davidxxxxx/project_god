# Agent Memory System

## Overview
Agents have a hierarchical memory architecture with five layers, from transient to persistent:

```
┌─────────────────── Individual ──────────────────┐    ┌── Tribe ──┐
│ Working → Episodic → Semantic → Social          │    │ Cultural  │
│ (instant)  (20 FIFO)  (10 cap)   (per-entity)  │    │ (20 cap)  │
└──────────────────────────────────────────────────┘    └───────────┘
```

## Working Memory (`currentTask`)
- Tracks the agent's current goal (e.g. `seek_water`, `recall_berry`, `semantic_berry`)
- Includes: `goal`, `startedAtTick`, `targetPosition?`, `targetId?`
- Automatically cleared when goal is achieved or abandoned
- **Stale detection**: tasks older than 15 ticks are considered stale and abandoned

## Episodic Memory (`episodicMemory`)
An array of `EpisodicEntry` objects, capped at `MAX_EPISODIC_MEMORY = 20` (FIFO eviction).

### Entry Types
| Type | Trigger | Stored Data |
|------|---------|-------------|
| `found_resource` | Successful `RESOURCE_GATHERED` event | position, resourceType, quantity |
| `resource_depleted` | Gather rejected with "depleted" reason | position, nodeId |

### Memory Recall
- `recallResourcePositions(entity, type)`: returns known positions for a resource type, newest first, deduplicated
- `isRememberedDepleted(entity, position)`: checks if the most recent memory at a position is "depleted"

## Semantic Memory (`semanticMemory`) — MVP-03-B

Distilled, generalized knowledge formed from repeated episodic experiences. Unlike raw episodic entries, semantic facts represent **knowledge** rather than events.

### SemanticEntry
| Field | Type | Description |
|-------|------|-------------|
| fact | SemanticFactType | Category of knowledge |
| position | Vec2? | Spatial anchor |
| subject | string? | What the fact is about (e.g. "berry", "fire_pit") |
| confidence | 0–1 | Reliability. Decays without reinforcement |
| formedAtTick | number | When first distilled |
| lastReinforcedTick | number | When last reinforced |

### Fact Types
| Fact | Meaning | Source |
|------|---------|--------|
| `resource_location` | "Berries reliably appear at (x,y)" | ≥3 `found_resource` at same position |
| `water_location` | "Water source at (x,y)" | ≥3 water `found_resource` at same position |
| `shelter_location` | "Lean-to at (x,y)" | Observed structure |
| `fire_location` | "Fire pit at (x,y)" | Observed structure |
| `warming_benefit` | "Fire pits provide warmth" | Entity has `warming` status |
| `shelter_benefit` | "Lean-to shelters from cold" | Entity has `sheltered` status |
| `far_bank_resource` | "Rich berries across river at (x,y)" | ≥3 `spotted_far_resource` episodes (MVP-03) |
| `safe_crossing` | "Shallow crossing at (x,y) — succeeded" | Successful `wade` action (MVP-03) |
| `dangerous_crossing` | "Crossing at (x,y) — failed/injured" | Failed `wade` action (MVP-03) |

### Distillation Rules
- **Resource locations**: ≥ `DISTILL_THRESHOLD` (3) same-position `found_resource` entries → semantic fact with confidence 0.8
- **Status-based**: Having `warming` or `sheltered` status → benefit fact with confidence 0.9
- **Reinforcement**: Each supporting event → confidence += 0.1 (capped at 1.0)
- **Decay**: Every `SEMANTIC_DECAY_INTERVAL` (50) ticks without reinforcement → confidence -= 0.1
- **Forgetting**: Confidence ≤ 0 → entry removed
- **Capacity**: `MAX_SEMANTIC_MEMORY = 10` per entity

### Decision Priority
Semantic memory slots in between visible resources and episodic recall:
```
1. Visible resources (perception radius)
2. Semantic memory positions (confidence > 0.3)
3. Episodic memory recall (raw positions)
4. Shared episodic memory (from nearby tribe members)
5. Cultural memory (tribe-level knowledge)
6. Social behavior (gather point, follow)
6.5. **Far-bank exploration** (MVP-03): scarcity + far-bank awareness → wade attempt
7. Wander / idle
```

## Social Memory (`socialMemory`) — MVP-02-E

A map of `SocialImpression` keyed by target entity ID.

| Field | Type | Description |
|-------|------|-------------|
| entityId | string | Target entity |
| trust | -1 to 1 | Trust level. Initial: 0.3 same-tribe |
| lastSeenTick | number | Tick of last encounter |
| lastSeenPosition | Vec2? | Position where last seen |

### Update Rules
- Same-tribe: trust += 0.05 per encounter, capped at 0.8
- Other-tribe: trust = 0 (no increment)
- Updated each tick via `updateSocialMemory()` in post-tick hook

### Shared Resource Knowledge
- When entity has no memory of a resource type, perception checks nearby same-tribe members' episodic memory
- Only active during face-to-face encounters (within perception radius)
- Exposed via `AgentSnapshot.sharedResourcePositions`

## Cultural Memory (`culturalMemory`) — MVP-03-B

Tribe-level persistent knowledge stored in `TribeState.culturalMemory`. **Survives individual agent death.**

### CulturalEntry
| Field | Type | Description |
|-------|------|-------------|
| fact | SemanticFactType | Same taxonomy as SemanticEntry |
| position | Vec2? | Spatial anchor |
| subject | string? | Subject of knowledge |
| confidence | 0–1 | Collective confidence |
| contributorIds | string[] | Entities who contributed |
| addedAtTick | number | When first taught |
| lastReinforcedTick | number | When last reinforced |

### Teaching (Individual → Tribe)
- **Eligibility**: Individual semantic fact with confidence ≥ `TEACH_CONFIDENCE_THRESHOLD` (0.7)
- **Proximity required**: At least 1 same-tribe member within perception radius
- **Result**: Cultural entry created at `confidence = individual × 0.8`
- **Reinforcement**: Multiple contributors → confidence = max(existing, new × 0.8)
- Emits `KNOWLEDGE_TAUGHT` event

### Inheritance (Tribe → Individual)
- **Eligibility**: Individual doesn't already have this fact
- **Proximity required**: At least 1 same-tribe member within perception radius
- **Result**: Semantic entry created at `confidence = cultural × 0.7`
- Skips if inherited confidence would be < 0.1
- Emits `KNOWLEDGE_INHERITED` event

### Decay
- Every `CULTURAL_DECAY_INTERVAL` (100) ticks without reinforcement → confidence -= 0.05
- Much slower than individual semantic decay (cultural knowledge is more persistent)
- **Capacity**: `MAX_CULTURAL_MEMORY = 20` per tribe

## Events
| Event | Trigger | Key Data |
|-------|---------|----------|
| `SEMANTIC_FORMED` | Distillation creates/reinforces semantic fact | entityId, fact, confidence |
| `KNOWLEDGE_TAUGHT` | Individual teaches to tribe | entityId, tribeId, fact |
| `KNOWLEDGE_INHERITED` | Individual learns from tribe | entityId, tribeId, fact |

## Post-Tick Hook Pipeline
```
Tick Events
  → enrichEventsWithPositions()
  → updateMemoryFromEvents()         → entity.episodicMemory
  → updateSocialMemory()             → entity.socialMemory
  → distillSemanticMemory()          → entity.semanticMemory  (MVP-03-B)
  → decaySemanticMemory()            → prune low-confidence   (MVP-03-B)
  → teachToCulturalMemory()          → tribe.culturalMemory   (MVP-03-B)
  → inheritFromCulturalMemory()      → entity.semanticMemory  (MVP-03-B)
  → recordFarBankSighting()          → entity.episodic/semantic (MVP-03)
  → recordCrossingExperience()       → entity.semanticMemory  (MVP-03)
  → decayCulturalMemory()            → prune tribe knowledge  (MVP-03-B)
```

## Future Extensions (not yet implemented)
- `danger_zone` entries from nearby deaths
- Spatial memory decay (location-based confidence erosion)
- Multi-tribe knowledge competition/trade
- LLM-assisted semantic reasoning
