# Agent Cognition System (LLM-Driven)

## Overview

Agents are autonomous cognitive entities with **names**, **emotions**, **inner thoughts**,
and **personal goals**. A hybrid architecture combines fast rule-based policies with
periodic LLM cognitive cycles for richer decision-making.

## Architecture

```
┌─────────────────────────────────────────────────┐
│           Hybrid Decision Loop                   │
│                                                 │
│  Has active plan? ──YES──> Execute next step    │
│       │ NO                                      │
│       ▼                                         │
│  Should trigger LLM? ──YES──> Call LLM (async)  │
│       │ NO                    (non-blocking)    │
│       ▼                                         │
│  Rule-based policy           On LLM return:     │
│  (memoryAwarePolicy)         set plan + thought │
│                              + emotion + goal   │
└─────────────────────────────────────────────────┘
```

## Agent Identity

| Field | Source | Example |
|-------|--------|---------|
| `name` | Pool of 100 stone-age names | "Aela", "Kala", "Arak" |
| `emotion` | Rule system + LLM override | "content", "afraid", "curious" |
| `innerThought` | LLM output | "The berry bushes are empty. I should look east." |
| `personalGoal` | LLM output or default | "survive and thrive" |
| `actionPlan` | LLM output, executed one step per tick | [{type: "move", ...}, {type: "gather", ...}] |
| `personality` | MBTI axes (Phase 1) | {ei: -0.5, sn: 0.8, tf: 0.3, jp: -0.7} |

## Emotion System

Rule-based, runs **every tick** (no LLM needed):

| Priority | Condition | Emotion |
|----------|-----------|---------|
| 1 | HP ≤ 30 | 😨 afraid |
| 2 | Nearby death | 😢 grieving |
| 3 | Hunger/Thirst ≤ 15 | 😰 anxious |
| 4 | Action rejected | 😡 angry |
| 5 | Sees unknown terrain | 🤔 curious |
| 6 | Recent build success | 🫡 hopeful |
| 7 | Moderate stress | 😰 anxious |
| 8 | Well-fed + healthy | 😊 content |
| 9 | Active task | 💪 determined |
| 10 | Default | 😐 calm |

LLM can override emotion on cognitive ticks.

## LLM Cognitive Cycle

### Trigger Conditions

| Trigger | Min Ticks Since Last | Purpose |
|---------|---------------------|---------|
| Regular period (every 30 ticks) | 30 | Periodic reflection |
| HP ≤ 25 | 10 | Emergency re-planning |
| Nearby death | 10 | Grief response |
| New terrain/resource | 15 | Discovery exploration |

### Pre-Plan Mode

LLM outputs a **3-5 step plan** instead of a single action:
- Each tick, one step is consumed from the plan
- If agent enters crisis (HP ≤ 20 or starvation), plan is abandoned
- When plan is exhausted or interrupted, next cognitive tick triggers new LLM call

### LLM Response Format

```json
{
  "thought": "I'm running low on berries. Maybe I should explore south.",
  "emotion": "anxious",
  "plan": [
    { "type": "move", "position": {"x": 5, "y": 8}, "reason": "heading south for food" },
    { "type": "gather", "targetId": "res_5", "reason": "picking berries" },
    { "type": "eat", "reason": "satisfying hunger" }
  ],
  "goal": "find reliable food source"
}
```

## Files

| File | Purpose |
|------|---------|
| `content-data/data/names.json` | 100 stone-age names (50M + 50F) |
| `shared/src/world.ts` | EmotionType, ActionPlanStep, identity fields on EntityState |
| `agent-runtime/src/cognitive-adapter.ts` | Prompt builder, LLM caller, response parser |
| `agent-runtime/src/cognitive-loop.ts` | Trigger detection, plan execution, emotional update |
| `agent-runtime/src/emotions.ts` | Rule-based emotion derivation (no LLM) |
| `agent-runtime/src/decide.ts` | `decideActionV3()` — hybrid LLM + rules |
| `core-sim/src/scenario-runner.ts` | `defaultCognitiveDecision()` factory |

## Configuration

Set `VITE_MINIMAX_API_KEY` in `.env` to enable LLM cognition.
Without API key, system works in pure rule-based mode (emotions still work, no thoughts/plans).

### Tunable Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `cognitivePeriod` | 30 | Ticks between LLM cycles per agent |
| `maxTokens` | 1024 | Max response tokens |
| `temperature` | 0.7 | LLM creativity (lower = more deterministic) |
| `MAX_CONCURRENT` | 3 | Max simultaneous LLM calls |
