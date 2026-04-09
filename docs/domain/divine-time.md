# Divine Time System

## Overview

The Divine Time system gives the player (God) control over how time flows in the simulation. The core sim remains deterministic — Divine Time only controls **how many ticks advance per render frame**.

```
Player sees:  1x · 2x · 4x · 8x · 16x  │  ⏩ Skip to Event  │  Auto⏸
Under hood:   requestAnimationFrame → N × step() per frame
```

## Architecture

```
TimeController (game-client)
  ├─ speed: TimeSpeed ("1x" | "2x" | ... | "16x")
  ├─ mode:  TimeMode  ("paused" | "playing" | "fastForward")
  ├─ AutoTimePolicy → checks events → triggers slow/pause
  └─ drives: requestAnimationFrame loop
        └─ calls ScenarioRunner.step() N times per frame
```

**Key principle**: `core-sim` is never aware of time control. It just runs `step()` when asked.

## Speed Presets

| Preset | Ticks/Frame | Effective Rate (~12.5 fps) |
|--------|-------------|---------------------------|
| 1×     | 1           | ~12.5 tick/sec             |
| 2×     | 2           | ~25 tick/sec               |
| 4×     | 4           | ~50 tick/sec               |
| 8×     | 8           | ~100 tick/sec              |
| 16×    | 16          | ~200 tick/sec              |

## Auto-Interruption

When certain events occur, the time controller automatically reacts:

| Event | Action | Rationale |
|-------|--------|-----------|
| `PRAYER_STARTED` | **Pause** | Player decides whether to miracle |
| `ENTITY_BORN` | **Slow → 1×** | Witness new life |
| `ENTITY_DIED` | **Slow → 1×** | Notice loss |
| `SKILL_LEARNED` | **Pause** | Major invention moment |
| `TECHNOLOGY_UNLOCKED` | **Pause** | Civilization milestone |
| `MIRACLE_PERFORMED` | **Pause** | Observe miracle effects |
| `PAIR_BONDED` | **Slow → 1×** | Social event |

Auto-interruption can be toggled on/off via the `Auto⏸` checkbox.

## Fast-Forward

Skip to the next occurrence of a specific event type:

| Target | Button | Monitored Events |
|--------|--------|------------------|
| Next Prayer | ⏩🙏 | `PRAYER_STARTED` |
| Next Birth | ⏩👶 | `ENTITY_BORN` |
| Next Death | ⏩☠️ | `ENTITY_DIED` |
| Next Invention | ⏩🧠 | `SKILL_LEARNED`, `TECHNOLOGY_UNLOCKED` |

Implementation: calls `ScenarioRunner.stepUntil()` which loops `step()` up to 2000 ticks, checking events each tick. No intermediate frames are rendered.

## Game Date

Ticks map to in-game dates:
- `TICKS_PER_YEAR = 40`
- `day = tick % 40`
- `year = floor(tick / 40)`

Displayed as "Day X · Year Y" in the HUD.

## Time Interruption Record

When auto-pause triggers, a `TimeInterruption` is stored:

```typescript
interface TimeInterruption {
  reason: SimEventType;   // which event caused it
  tick: number;           // when
  entityId?: string;      // who (for auto-focus)
  action: "slow" | "pause";
}
```

Displayed as a flashing badge in the HUD (clears after 5 seconds).

## File Map

| File | Role |
|------|------|
| `shared/src/time.ts` | Shared types, speed presets, FF targets, auto-rules |
| `game-client/src/TimeController.ts` | Core rAF loop + speed + pause + FF |
| `game-client/src/AutoTimePolicy.ts` | Event → slow/pause mapping |
| `game-client/src/main.ts` | Wiring + render |
| `game-client/index.html` | Time HUD buttons |
| `game-client/src/styles.css` | Speed/FF button styles |
| `core-sim/src/scenario-runner.ts` | stepUntil() method |

## Not Included (Future)

- Time bubbles (local speed zones)
- Multi-region different flow rates
- History timeline scrubber
- Event-triggered camera zoom
- Narrative-driven time pacing (MVP-06A)
