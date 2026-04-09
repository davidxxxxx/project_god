# Narrative System (MVP-06A)

## Overview

The Narrative System (`packages/narrative-runtime`) converts raw, technical simulation events (`SimEvent`) into human-readable narrative fragments (`NarrativeEntry`). 

It provides an interpretation layer over the hardcore deterministic simulation without mutating any world state.

## Architecture

```
core-sim (emits SimEvents)
      │
      ▼
NarrativeEngine (narrative-runtime)
 ├─ Checks NARRATIVE_EVENT_TYPES filter
 ├─ Builds NarrativeContext
 ├─ Matches event to Template (e.g., birthTemplate)
 ├─ Stores in Chronicle (list of NarrativeEntry)
 ├─ Distributes to AgentLifeEvents
 └─ (Optional) Sends async polish request to LLMAdapter
      │
      ▼
game-client
 ├─ Renders Chronicle Panel
 ├─ Renders Agent Life Events in details panel
 └─ Pops up Narrative Toast for major events
```

## Supported Events (MVP-06A)

The engine currently translates the following key milestones:
- `ENTITY_BORN`: "A child is born"
- `ENTITY_DIED`: "Death in the tribe"
- `SKILL_LEARNED`: "Invention breakthrough"
- `TECHNOLOGY_UNLOCKED`: "Civilization milestone"
- `PRAYER_STARTED`: "A prayer to the heavens"
- `PRAYER_UNANSWERED`: "Silence from above"
- `MIRACLE_PERFORMED`: "Divine intervention"
- `PAIR_BONDED`: "A pair bond formed"

## Data Structures

### NarrativeEntry

This is the primary output consumed by the client:
```typescript
{
  id: string;               // Unique ID
  tick: number;             // World tick
  year: number;             // In-game year
  eventType: SimEventType;
  importance: "minor" | "major" | "legendary"; 
  title: string;            // Headline
  body: string;             // Template-generated body
  llmBody?: string;         // Async LLM rewording (if enabled)
  focusEntityId?: string;   // Agent to auto-focus when clicked
  focusTribeId?: string;
  tags: string[];           // For filtering (e.g., ["family", "birth"])
}
```

### AgentLifeEvent

Persisted for individual agents to form their biography:
```typescript
{
  tick: number;
  year: number;
  age: number;
  type: string;
  description: string;
}
```

## LLM Adapter (MiniMax)

The LLM integration is intentionally **fire-and-forget** and **optional**.
1. The template system always executes instantly and synchronously, guaranteeing the `NarrativeEntry` exists.
2. The `LLMAdapter` makes a background API call to MiniMax (`MiniMax-M2.7`) with the template text plus rich contextual data.
3. If successful, it mutates `entry.llmBody = polished`. 
4. The React/DOM UI gracefully falls back to `body` if `llmBody` isn't there yet or if the request fails.

It uses a strict 1-2 sentence prompt, ensuring consistent game tone (solemn, poetic) and never hallucinates simulated mechanics.

## Future Phases

- **MVP-06B:** Periodic aggregation (Tribe Summaries over 1-year spans, World Chronicle epochs).
- **MVP-06C:** Natural-language Oracle (God inputs text -> parses to DivineIntent -> executes Miracles).
