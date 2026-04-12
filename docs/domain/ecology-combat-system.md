# Ecology & Combat System (P2)

## Overview

A unified ecology and combat system with 4 species forming a food chain,
seasonal behavior modulation, and a deterministic combat resolver.

## Ecosystem Tiers

### 🐰 Rabbit (Prey)
- **Behavior**: Flee from humans; forage berries and grass
- **Combat**: HP=15, Attack=0, Defense=0, Speed=2
- **Drops**: 1× meat
- **Seasonal**: Spring ×1.5, Winter ×0.3

### 🦌 Deer (Herd)
- **Behavior**: Graze peacefully; if any herd member is attacked, the whole
  herd retaliates (Don't Starve beefalo mechanic)
- **Combat**: HP=40, Attack=5, Defense=2, Speed=1
- **Drops**: 2× meat, 1× hide
- **Seasonal**: Spring ×1.2, Winter ×0.5

### 🐺 Wolf (Predator)
- **Behavior**: Hunts rabbits, deer, and weak humans (HP < 50%).
  Becomes active when hungry.
- **Combat**: HP=60, Attack=10, Defense=3, Speed=2
- **Drops**: 2× meat, 1× hide, 1× fang
- **Seasonal**: Winter ×2.0 (spawn), ×1.5 (detection), ×1.2 (attack)

### 🐻 Bear (Apex / Territorial)
- **Behavior**: Attacks anything within its territory radius.
  Does not chase far.
- **Combat**: HP=120, Attack=20, Defense=8, Speed=1
- **Drops**: 4× meat, 2× hide, 1× fang
- **Seasonal**: Winter ×1.5

## Combat System

### Damage Resolution
```
finalDamage = max(1, attackPower + weaponBonus - defense - armorBonus)
```

### Weapons & Armor
| Item | Type | Bonus | Recipe |
|------|------|:-----:|--------|
| Spear | Weapon | +8 | fang×1, wood×2, stone×1 |
| Club | Weapon | +5 | wood×3 |
| Hide Armor | Armor | +5 | hide×3 |

### Dodge
- Faster entity has 15% base dodge chance.
- Hunting skill adds up to 10% more.
- All rolls are deterministic (seeded by tick + position).

## Ecological Safety Net

When a species reaches 0 global population:
1. A timer starts (EXTINCTION_RESPAWN_DELAY = 200 ticks = 5 days).
2. After the delay, a minimum-size herd is force-spawned at a map edge.
3. An `EXTINCTION_RESPAWN` event is emitted.
4. This simulates migration from outside the map boundary.

If the population recovers naturally before the timer expires,
the countdown is reset.

## Events

| Event | Trigger |
|-------|---------|
| `ANIMAL_SPAWNED` | New fauna herd spawned or animal born |
| `COMBAT_HIT` | One combat round resolved |
| `ANIMAL_KILLED` | Fauna or human killed in combat |
| `HUNT_SUCCESS` | Player hunted fauna successfully, loot transferred |
| `EXTINCTION_RESPAWN` | Ecological safety net triggered |

## Tick Integration

Fauna tick runs at **step 4.10** in the canonical simulation order:
```
4.8  Social dynamics
4.9  Diplomacy
4.10 Fauna tick  ← spawning, AI, combat, foraging, breeding
5+6  Validate + Execute player actions (including "hunt")
```
