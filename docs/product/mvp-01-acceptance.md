# MVP-01 验收标准 (Acceptance Criteria)

本文档写死 MVP-01 Survival Loop 的完成边界。
任何超出此列表的功能，归入 MVP-02+ 规划。

---

## ✅ 必须满足

### 世界底座
- [x] Deterministic tick loop 基于固定 seed 可完全复现
- [x] WorldState 包含 tiles / entities / resourceNodes 基础结构
- [x] Shared 协议层打通（types, events, actions, debug）
- [x] Content-data JSON 可加载，Zod schema 校验通过
- [x] 正式 world bootstrap：从 seed + entityCount 程序化生成可玩开局
- [x] 开局合法性校验：entity 不出生在非法 tile，资源可达性检查

### 生存闭环
- [x] hunger / thirst 按 decayPerTick 衰减，到达 deathThreshold 触发死亡
- [x] move / gather / eat / drink 四件套：validate + execute 完整
- [x] Rule-based survival policy 驱动 agent 自主求生
- [x] Event 全链路联动（TIME_TICKED → NEED_DECAYED → ENTITY_MOVED → RESOURCE_GATHERED → FOOD_EATEN / WATER_DRUNK → ENTITY_DIED）

### 可观测性
- [x] ScenarioRunner 支持 step / runN / reset / runUntilDone
- [x] DebugProjection 输出 agent view + resource view + recent events + counters
- [x] Metrics 系统收集 per-tick 数据并有 aggregate
- [x] Debug Panel：地图网格 + Agent 列表（需求条） + Event Log（可过滤） + 指标面板
- [x] Step / Run / Pause / Reset 控件可用

### 终止与稳定性
- [x] Run termination：全员死亡 → 停止；达到 maxTick → 停止
- [x] RunSummary 包含完整统计输出
- [x] Golden scenario 回归测试通过（50 tick，>=4/5 存活，0 无效消耗）
- [x] 多 seed smoke test 通过（10 seed × 100 tick，无系统性死局）

---

## ❌ 明确不含（归入 MVP-02+）

| 功能 | 归属阶段 |
|------|----------|
| Inventory 容量限制、堆叠、丢弃 | MVP-02 |
| Shelter / Fire / 建造 | MVP-02 |
| Tool / Crafting 系统 | MVP-02 |
| Skill 成长 | MVP-02 |
| Memory / Social 系统 | MVP-03 |
| Tribe / Faction | MVP-03 |
| Faith / Miracle | MVP-04 |
| LLM 接入（narration / reflection） | MVP-05 |
| PixiJS 渲染替换 DOM Debug Panel | MVP-02 |
| Save / Load | MVP-02 |

---

## 验证方法

1. **自动化测试**
   ```bash
   cd packages/core-sim && npx vitest run
   ```
   - `tick.test.ts`：8 个单元测试（衰减、移动、采集、吃、喝、死亡、确定性）
   - `survival.test.ts`：2 个集成测试（决策方向、50 tick 闭环）
   - `smoke.test.ts`：多 seed 稳定性测试

2. **手动验证**
   - 启动 Debug Panel（`cd packages/game-client && npm run dev`）
   - 点击 Step 逐 tick 观察 agent 行为
   - 点击 Run 观察连续运行直到全员死亡或达到上限
   - 点击 Reset 重置后行为一致

---

## 封板声明

当上述所有 ✅ 项目通过测试验证后，MVP-01 正式封板。
后续 commit 如果涉及以上已封板的功能，应当以 bugfix 形式提交，不扩展新功能。
