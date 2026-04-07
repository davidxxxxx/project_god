# Runtime Loop

## Canonical Tick Order
1. advance time
2. update environment systems
3. decay needs and statuses
4. build local perception for each agent
5. update memory
6. generate candidate actions
7. score/select plan
8. validate selected action
9. execute action
10. emit events
11. update debug projections and UI-facing derived state

## Why this order
- needs must affect decision pressure
- perception must precede planning
- action validation must precede mutation
- event emission must follow mutation

## Debug requirements
For any agent tick, it should be possible to inspect:
- perceived entities/resources
- current needs
- top candidate actions
- chosen action
- reason or score
- resulting events
