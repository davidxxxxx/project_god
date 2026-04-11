# Changelog

All notable changes to this project will be documented in this file.

## [MVP-03] River Crossing & Emergent Innovation — Phase 0+1

### Added
- **`shallow_river` terrain** — passable (moveCost 4.0), placed at 1–2 ford points in the river
- **`wade` action** — probabilistic river crossing attempt with risk/reward
  - Base 40% success rate, up to 95% with skill/fitness bonuses
  - Failure: 10–20 HP damage, 1 inventory item lost, 5 tick cooldown
  - Success: move to target, `water_crossing` skill discovery, 3 tick cooldown
- **`water_crossing` skill** — learned by discovery (first successful wade), +30% max bonus
- **`wet` status** — applied on wade (success or failure), lasts 10 ticks, +50% cold exposure decay
- **Far-bank perception** — agents within 3 tiles of riverbank can see resources across the river (radius+5)
- **`far_bank_resource` / `safe_crossing` / `dangerous_crossing` semantic facts** — memory chain for crossing knowledge
- **Priority 4.6: EXPLORE FAR BANK** policy — pressure-driven river exploration when left-bank food is scarce
- **`WADE_ATTEMPTED` event** — logged on every crossing attempt with success/failure details
- **`FAR_BANK_SPOTTED` event** — logged when agents see resources across the river (throttled 20 ticks)
- **Asymmetric map** — left bank: 3 berry nodes (qty 7), right bank: 3 berry nodes (qty 15) + richer wood/stone

### Changed
- Left-bank berry quantity reduced (10→7, regen 0.12→0.10) to create scarcity pressure
- Ford crossing uses `shallow_river` instead of `riverbank` terrain
- Far-bank forest zone enlarged (radius 3–4 vs 2–3)

### Fixed
- (none — new feature)

---

## [MVP-02Z] Balance & Lifecycle Fixes

_Previous milestone — survival loop stabilization, skill deadlock fixes, infant mechanics._

