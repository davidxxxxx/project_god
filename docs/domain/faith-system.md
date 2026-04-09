# Faith / Prayer / Divine Intervention System (MVP-05)

## Overview

The faith system introduces the **core god-game mechanic**: players act as a deity who can respond to agent prayers with divine miracles. This creates a bidirectional feedback loop between player and agents:

```
Agent in crisis → Pray → Player responds with miracle → Faith rises → More prayers
                       → No response → Faith falls → Fewer prayers
```

## Faith (信仰值)

Entity attribute stored at `attributes.faith` (0–100).

### Sources of Change

| Trigger | ΔFaith | Direction |
|---------|--------|-----------|
| Direct miracle target | +FAITH_GAIN_ON_MIRACLE (15) | ↑ |
| Witness miracle nearby | +FAITH_GAIN_WITNESS (5) | ↑ |
| Global miracle (rain/bounty) | +FAITH_GAIN_WITNESS (5) | ↑ |
| Prayer unanswered (timeout) | -FAITH_DECAY_UNANSWERED (8) | ↓ |
| Natural yearly decay | -FAITH_DECAY_PER_YEAR (1) | ↓ |
| Born (inherited) | 50% of avg(parents' faith) | Initial |
| Gen0 initial | 10 | Initial |

## Prayer

Agents autonomously choose to pray when in crisis.

### Conditions

| Condition | Value |
|-----------|-------|
| Life stage | Adult or Elder (not child) |
| Faith | ≥ MIN_PRAYER_FAITH (5) |
| Crisis | Any need ≤ criticalThreshold |
| Cooldown | ≥ PRAYER_COOLDOWN (20) ticks since last prayer |
| Not already praying | isPraying === false |

### Flow

```
1. Agent decision → type: "pray"
2. Validation (cooldown, faith, adult)
3. Execution → PRAYER_STARTED + PRAYER_COMPLETED events
4. Response window: PRAYER_RESPONSE_WINDOW (10) ticks
5a. Player responds with miracle → faith ↑, prayer cleared
5b. No response → PRAYER_UNANSWERED → faith ↓
```

## Divine Points (神力值)

Player resource for performing miracles.

| Property | Value |
|----------|-------|
| Initial | 5 |
| Maximum | 20 |
| Regeneration | +DIVINE_REGEN_PER_PRAYER (0.5) per tick, per praying entity |

## Miracles

Player-triggered divine interventions via GUI buttons.

| Miracle | Effect | Cost | Scope |
|---------|--------|------|-------|
| **Bless** | +30 hunger, +30 thirst | 1 DP | Single entity |
| **Heal** | Exposure → 100, clear negative statuses | 1 DP | Single entity |
| **Rain** | All water nodes +50 quantity | 3 DP | Global |
| **Bounty** | All berry nodes +20 quantity | 3 DP | Global |

Individual miracles (Bless/Heal) also trigger witness faith gain for nearby entities.

## Agent Decision Priority

Prayer occupies **Priority 2.8** in the memory-aware-policy:

```
P0:   Child follow parent
P1:   Critical consume (thirst/hunger ≤ criticalThreshold + has item)
P2:   Inventory full management
P2.5: Exposure crisis (seek shelter/warmth)
P2.8: Prayer (crisis + faith ≥ 5 + cooldown elapsed)  ← NEW
P3:   Consume (moderate need pressure)
P4:   Build (fire pit, shelter)
...
```

## Events

| Event | Trigger | Key Data |
|-------|---------|----------|
| `PRAYER_STARTED` | Agent begins prayer | entityId, position, faith |
| `PRAYER_COMPLETED` | Prayer duration ends | entityId, position |
| `PRAYER_UNANSWERED` | Response window expired | entityId, faithLost |
| `MIRACLE_PERFORMED` | Player performs miracle | miracleType, targetId?, cost |
| `FAITH_CHANGED` | Faith value changes | entityId, oldFaith, newFaith, reason |

## Configuration (faith.json)

All constants are in `content-data/data/faith.json`, fully tunable without code changes.

## Tick Loop Position

Faith tick runs at **Step 1.7** — after lifecycle, before needs decay:

```
1.0  World tick++
1.5  Environment tick
1.6  Lifecycle tick
1.7  Faith tick (prayer timeout + divine regen + yearly decay)  ← NEW
2.0  Decay needs
3.0  Check deaths
...
5+6  Validate + Execute actions (including pray)
```

## GUI

- **Divine Panel**: Golden gradient bar below header with DP display + 4 miracle buttons
- **Agent Cards**: `✨` faith badge + `🙏` prayer badge (animated glow)
- **Agent Detail**: Faith value + praying state
- **Bottom Bar**: Praying count + total miracles
- **Event Log**: 5 new event type filters
- **PixiJS**: Golden halo ring on praying agents

## File Map

| File | Role |
|------|------|
| `shared/world.ts` | MiracleType, prayer/divine fields |
| `shared/events.ts` | 5 faith event types |
| `core-sim/content-types.ts` | FaithDef interface |
| `core-sim/systems/faith-tick.ts` | Core faith system |
| `core-sim/validate/validate-pray.ts` | Prayer validation |
| `core-sim/execute/execute-pray.ts` | Prayer execution |
| `core-sim/scenario-runner.ts` | performMiracle() method |
| `core-sim/tick.ts` | Step 1.7 faith tick |
| `content-data/data/faith.json` | Tunable constants |
| `agent-runtime/policies/memory-aware-policy.ts` | Priority 2.8 prayer |
| `game-client/src/main.ts` | Miracle buttons + rendering |
| `game-client/index.html` | Divine panel DOM |
| `game-client/src/styles.css` | Divine panel + prayer badge CSS |
| `game-client/src/renderer/layers/AgentLayer.ts` | Prayer halo PixiJS |

## Not Included (Future)

- Priest role (specialized prayer leader)
- Temple building (prayer location bonus)
- Multiple gods / competing faiths
- Divine punishment / wrath mechanics
- Miracle animations (PixiJS particle effects)
