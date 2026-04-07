---
trigger: always_on
---

# Project Rule

This repository is a simulation-first god game with evolving AI-driven agents.

## Project identity
- The player is a god-like influence, not a direct RTS controller.
- The world should evolve through systems, not scripted cutscenes.
- Agents are bounded actors with limited perception, memory, and capability.
- Civilization progress emerges from survival, invention, transmission, belief, and conflict.

## Core principles
- Prefer deterministic simulation boundaries over free-form generation.
- Prefer data-driven content over hardcoded behavior.
- Prefer event emission over hidden side effects.
- Prefer vertical slices over broad unfinished scaffolding.
- Keep future replay/debugging possible.
- **Tech Stack Lock**: Simulation and Agent Runtime must be strictly **TypeScript**. Python is exclusively restricted to offline data analysis and tuning tools. Rendering strictly waits for **PixiJS** (No ad-hoc canvas rendering).

## Architectural boundaries
- `core-sim`: deterministic world state and state transitions
- `agent-runtime`: perception, memory, planning, decision, action selection
- `content-data`: tunable game content, tables, configs, technology definitions
- `game-client`: rendering, presentation, input, debug overlays
- `ai-adapters`: model prompts, summaries, reflection, optional high-level reasoning
- `shared`: schemas, types, utility primitives

## Hard constraints
- Do not place domain logic inside UI components.
- Do not let LLM output directly mutate world state.
- All world mutations must go through validated actions or simulation systems.
- Do not change save schema casually.
- Do not merge new concepts without updating domain docs.

## Required reading before editing
- `docs/architecture/system-overview.md`
- `docs/architecture/runtime-loop.md`
- relevant file under `docs/domain/`

## Required deliverable at the end of each task
Provide:
1. changed files
2. what changed
3. why it changed
4. risks / follow-up
5. how to test
