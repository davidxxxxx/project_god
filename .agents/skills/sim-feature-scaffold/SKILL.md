---
name: sim-feature-scaffold
description: Use this skill when the user wants to add a new simulation feature to the god game, especially features involving agents, resources, world rules, progression, survival, or event-driven gameplay.
---

# Simulation Feature Scaffold Skill

## Goal
Create a clean, minimal, simulation-first feature slice that fits the existing architecture.

## Instructions
1. First identify the feature category:
   - world rule
   - agent behavior
   - content progression
   - faith/miracle effect
   - UI/debug projection
2. Determine the minimum affected modules:
   - `core-sim`
   - `agent-runtime`
   - `content-data`
   - `game-client`
   - `docs`
3. Propose the smallest vertical slice that can be tested.
4. Define or extend any necessary schemas.
5. Prefer adding content/config to `content-data` over hardcoding.
6. Ensure world mutation happens through validated actions or systems.
7. Emit events for major state changes.
8. Update docs if a concept or architecture boundary changed.
9. End with a patch summary and test steps.

## Mandatory checks
- Does this feature bypass simulation order?
- Does it create hidden side effects?
- Can the feature be debugged or replayed?
- Did it accidentally place game logic inside UI?

## Output format
Return:
- feature summary
- files to create/change
- implementation notes
- test steps
- future extension points

## Constraints
- Do not let free-form text directly modify world state.
- Do not introduce new concepts without naming them consistently with docs.
- Do not overbuild beyond the requested slice.
