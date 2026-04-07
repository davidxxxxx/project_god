---
trigger: always_on
---

# Simulation Rule

## Simulation-first policy
- The simulation is the source of truth.
- UI is only a projection.
- LLM is optional and advisory, not authoritative.

## Canonical simulation order
1. world/system update
2. needs decay
3. perception
4. memory update
5. candidate action generation
6. decision / planning
7. action validation
8. action execution
9. event emission
10. UI/log projection

## State mutation policy
- All mutations must be explicit.
- Every major mutation should emit an event.
- Important agent decisions should be inspectable in debug mode.

## Save/load policy
- Save format must be versioned.
- Avoid serializing entire runtime internals if a stable schema can be used instead.
