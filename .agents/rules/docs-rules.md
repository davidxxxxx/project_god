---
trigger: always_on
---

# Documentation Rule

## When docs must be updated
Update docs when:
- a new domain concept is introduced
- a core gameplay loop changes
- an action schema changes
- a save schema changes
- a key balance assumption changes
- an architectural boundary changes

## Required doc sync rules
- Domain concept changes -> update `docs/domain/*`
- Architecture/interface changes -> add/update `docs/adr/*`
- Save/load changes -> update `docs/architecture/save-format.md`
- New visible feature or milestone -> update `docs/changelog/CHANGELOG.md`

## Documentation style
- Write for future contributors and future agents.
- Prefer stable definitions over long prose.
- Include examples where ambiguity is possible.
- Distinguish clearly between:
  - current implementation
  - intended target design
