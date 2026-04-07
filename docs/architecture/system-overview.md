# System Overview

## Goal
Describe the stable architectural boundaries of the game.

## High-level modules

### core-sim
Responsible for deterministic world state, ticking, and rule-based transitions.

### agent-runtime
Responsible for perception, memory, planning, and action selection for agents.

### content-data
Stores content definitions, balancing values, technologies, resources, and progression tables.

### game-client
Responsible for rendering, camera, interaction, overlays, and debug projection.

### ai-adapters
Responsible for optional LLM-powered summarization, reflection, narration, and high-level suggestions.

### shared
Shared schemas, enums, ids, event types, serialization helpers.

## Data flow
1. content-data defines rules and content
2. core-sim advances world state
3. agent-runtime reads local world state and produces action intents
4. core-sim validates and executes actions
5. events are emitted
6. game-client renders derived state and events
7. ai-adapters may summarize or enrich non-authoritative text output

## Out of scope for this document
- detailed progression design
- exact balancing values
- prompt wording
