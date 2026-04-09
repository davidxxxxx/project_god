# MVP-02: Survival+ — Acceptance Report

## 封板日期
2026-04-08

## 完成标准验收

| # | 验收条件 | 状态 | 证据 |
|---|---------|------|------|
| 1 | 个体能携带和管理资源，而不是即时消耗 | ✅ | inventory capacity (10), drop action, gather clamp |
| 2 | 个体会利用记忆改善行为 | ✅ | episodic memory → resource recall → navigation |
| 3 | 世界中出现至少一种人工建造物 | ✅ | fire_pit (StructureState, 30 tick durability) |
| 4 | 至少存在一条 skill → tool → technology 的最小链路 | ✅ | fire_making → fire_pit → controlled_fire |
| 5 | 小人开始形成部落雏形 | ✅ | TribeState, gatherPoint, social memory, clustering |
| 6 | 世界中出现人为留下的长期痕迹 | ✅ | fire pits, skill accumulation, tribe knowledge |
| 7 | Save/Load v1 可用 | ✅ | JSON round-trip with version check, MVP-02 data preserved |

## 开发阶段完成情况

| Phase | 名称 | 状态 | 核心成果 |
|-------|------|------|---------|
| 前置 | EntityState 扩展 + Save/Load | ✅ | 类型系统扩展, save-load.ts v1 |
| A | 资源与库存升级 | ✅ | inventory capacity, drop, clamp |
| B | 记忆与更聪明的求生决策 | ✅ | working memory, episodic memory, memory-aware-policy |
| C | Fire Pit — 第一个人工物 | ✅ | StructureState, build action, warming, durability |
| D | Skill / Tool / Technology | ✅ | fire_making skill, observation learning, tech unlock |
| E | 部落雏形与最小社会关系 | ✅ | TribeState, gatherPoint, social memory, shared resources |

## 测试覆盖

- **测试文件**: 12
- **测试总数**: 81 (80 existing + 1 new save/load v2 test)
- **通过率**: 100%
- **多 seed 稳定性**: 10 seeds × 100 ticks, 8/10 至少有 1 名存活者
- **回归**: MVP-01 所有测试未受影响

## 关键指标

| 指标 | Phase D 后 | Phase E 后 |
|------|-----------|-----------|
| 存活率 (5 seeds, 100 ticks) | ~7 alive | 24 alive (3.4x) |
| 技能传播 (500 ticks) | 4 entities | 5 entities |
| 聚集度 (avg dist to gatherPoint) | N/A | 5.0→2.3 |
| 社交记忆 | 0 | 所有存活 agent |

## 架构包分布

| 包 | 文件数 | 职责 |
|---|--------|------|
| shared | ~10 | 类型、事件、ID、几何、actions、debug contracts |
| core-sim | ~20 | 世界创建、tick、validate/execute、systems、save/load |
| agent-runtime | ~6 | perception、memory、policies、decide |
| content-data | ~6 | needs、resources、actions、terrain、skills、technologies |
| game-client | 3 | index.html、main.ts、styles.css |

## 事件系统覆盖

共 17 种事件类型：
- 基础: TIME_TICKED, NEED_DECAYED, ENTITY_MOVED, ENTITY_DIED
- 资源: RESOURCE_SPOTTED, RESOURCE_GATHERED, FOOD_EATEN, WATER_DRUNK
- 库存: FIRST_DISCOVERY_MADE, INVENTORY_FULL, ITEM_DROPPED
- 动作: ACTION_REJECTED
- 建造: STRUCTURE_BUILT, STRUCTURE_EXPIRED, WARMING_APPLIED
- 技能: SKILL_LEARNED, SKILL_OBSERVED, TECHNOLOGY_UNLOCKED
- 部落: TRIBE_GATHER_POINT_UPDATED, SOCIAL_MEMORY_UPDATED

## 已知限制 / 留给 MVP-03+

| 项目 | 说明 |
|------|------|
| 单部落 | 只有 1 个 tribe，多部落分裂/合并需要 MVP-03 |
| trust 无行为后果 | trust 值积累但不影响 agent 决策 |
| 无角色分化 | body/intelligence 属性未接入偏好 |
| 无天气/温度 | warming 只是 buff，无真正温度系统 |
| 无 LLM 集成 | 所有决策均为规则驱动 |
| DOM 渲染 | 未迁移 PixiJS |

## 封板确认

MVP-02 所有功能子阶段和完成标准均已达成。代码库稳定，测试全绿，可安全进入 MVP-03 规划。
