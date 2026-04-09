# Skill / Tool / Technology System

## Goal
Separate internal capability, external affordance, and civilization knowledge.

## Definitions

### Attributes
Innate or slowly changing qualities.
Current base attributes:
- intelligence
- body
- faith

### Needs
Pressures that drive action.
Current base needs:
- hunger
- thirst
- safety
- belonging
- faith-expression

### Skill
An internalized capability that an entity can apply.
Stored as `entity.skills[skillId] = proficiency` (0–1).

Current skills:
- **fire_making** — ability to create and maintain fire
  - learnMethod: observation
  - learnTicks: 5 (ticks of observation near teacher + active structure)
  - initialProficiency: 0.5

### Tool
An external object, station, or affordance used to enhance action.
Currently implemented:
- **fire_pit** — buildable structure, requires `fire_making` skill
  - requiredItems: berry × 3
  - durability: 30 ticks
  - effect: warming (radius 2)

### Technology
A transmissible body of knowledge available to a group or culture.
Stored as `tribe.technologies[]`.

Current technologies:
- **controlled_fire** — tribe-level fire knowledge
  - requiredSkill: fire_making
  - minSkilledMembers: 2 (tribe members with skill)
  - unlocksStructures: [fire_pit]

## Acquisition Mechanics

### Invention (first discovery)
- First entity to build a fire pit (when no one in the world has fire_making) automatically receives the skill
- Emits `SKILL_LEARNED` with method: "invention"

### Observation Learning
- Requires: nearby entity WITH skill (within radius 5) AND active structure nearby
- Progress tracked as `entity.attributes[obs_<skillId>]`
- After `learnTicks` observations → skill granted at `initialProficiency`
- Emits `SKILL_OBSERVED` during progress, `SKILL_LEARNED` on completion (method: "observation")

### Technology Unlock
- Checked each tick in `tickSkillLearning()`
- When `minSkilledMembers` tribe members have the required skill → technology added to `tribe.technologies`
- Emits `TECHNOLOGY_UNLOCKED`

## Design rules
- Skills belong to agents.
- Tools belong to inventory/world.
- Technology belongs to tribe/culture/progression.
- A technology may unlock tools, skills, recipes, or rituals.
- A tool should not imply mastery without the relevant skill or training rule.
- Building a structure with a skill requirement is rejected unless: entity has the skill OR no one in the world has it (first invention).
