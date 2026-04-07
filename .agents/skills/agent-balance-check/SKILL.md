---
name: agent-balance-check
description: Use this skill when the user asks to analyze agent balance, survival behavior, action distribution, progression speed, invention rate, or whether a system feels too weak, too strong, too fast, or too random.
---

# Agent Balance Check Skill

## Goal
Evaluate whether the current simulation parameters produce stable, interesting, and believable agent behavior.

## Instructions
1. Identify the subsystem under evaluation:
   - survival
   - movement
   - gathering
   - invention
   - social interaction
   - faith behavior
   - combat/conflict
2. State the target gameplay feeling.
3. Inspect relevant parameters and interaction loops.
4. Check for:
   - runaway loops
   - dead loops
   - idle loops
   - over-randomness
   - dominant strategies
5. Summarize likely root causes.
6. Recommend the smallest set of parameter or rule changes.
7. Separate:
   - high-confidence changes
   - experimental changes

## Metrics checklist
Read `references/metrics-template.md` if available.

## Output format
- issue summary
- likely causes
- recommended parameter changes
- expected effect
- what to monitor next

## Constraints
- Do not recommend huge rewrites unless the issue is structural.
- Do not change multiple systems at once without saying why.
