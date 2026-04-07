---
trigger: always_on
---

# Coding Rule

## General
- Prefer small pure functions for simulation logic.
- Prefer explicit types and schemas.
- Prefer composition over inheritance.
- Avoid hidden mutable global state.
- Keep files focused and bounded.

## Naming
- Use domain names that match docs.
- Avoid vague names like `manager`, `helper`, `misc`, `thing`, `temp`.
- Events must use clear domain verbs, e.g.:
  - `ENTITY_MOVED`
  - `RESOURCE_GATHERED`
  - `TECH_UNLOCKED`
  - `FAITH_RITUAL_COMPLETED`

## Simulation code
- Tick/update functions must be deterministic for the same input state.
- Any randomness must be centralized and seedable.
- State transitions must be traceable.

## Agent code
- Separate:
  - perception
  - memory update
  - candidate generation
  - scoring / planning
  - execution
- Agent outputs should be structured intent objects, not arbitrary prose.

## Data/config
- Put tunable numbers into `content-data` where possible.
- Avoid magic numbers in logic.
- New balance parameters must have default values and comments.

## Testing
- Add or update tests when changing:
  - state transitions
  - event generation
  - action validation
  - memory update rules
