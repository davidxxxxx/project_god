# MVP-02: Survival+ — 从"活下去"到"文明前兆"

## 阶段定位

MVP-02 不是马上做社会、信仰或接 LLM。
而是让小人从"单体生存"迈向"可积累、可传承、可分化"。

**一句话使命：让这个世界从"会活"进化到"会留下文明前兆"。**

---

## MVP-01 已解决

- ✅ Deterministic tick loop
- ✅ hunger / thirst 衰减与死亡
- ✅ move / gather / eat / drink 四件套
- ✅ Rule-based survival policy
- ✅ Event 全链路可观测
- ✅ Debug Panel (Step/Run/Pause/Reset)
- ✅ 正式 world bootstrap + 开局合法性校验
- ✅ 多 seed smoke test 通过
- ✅ MVP-01 验收封板

---

## MVP-02 完成标准

当以下所有条件满足时，MVP-02 封板：

- 个体能携带和管理资源，而不是即时消耗
- 个体会利用记忆改善行为
- 世界中出现至少一种人工建造物（fire pit）
- 至少存在一条 skill → tool → technology 的最小链路
- 小人开始形成部落雏形，而不是完全散点生存
- 世界中出现"人为留下的长期痕迹"
- Save/Load v1 可用

---

## 开发阶段与顺序

### 前置：EntityState 类型扩展 + Save/Load v1

在正式子阶段开工前完成：
- EntityState 加入 optional 的 skills / memory / statuses 字段
- Save/Load v1 实现（基于 save-format.md 的 schema v1.0.0）

---

### MVP 02-A：资源与库存升级

**目标**：把"吃完就完"的即时闭环升级为有持续性的资源系统。

**做什么**：
- inventory 容量上限
- 资源堆叠规则
- 资源耗尽导致 agent 自然迁移
- 掉落与拾取
- 可选：新增 1-2 个基础资源类型

**完成效果**：小人会携带资源、因容量限制做取舍、受资源枯竭影响而移动。

**不做**：复杂经济系统、交易、生产链。

---

### MVP 02-B：记忆与更聪明的求生决策

**目标**：让小人开始"记住并利用过去"。

**做什么**：
- working memory（当前任务上下文）
- episodic memory v1（位置记忆："在哪找到了什么"）
- 记住哪里有水/浆果
- 对危险地点形成简单规避
- 避免重复无效动作

**完成效果**：小人表现出"去过哪里"、"知道哪里有资源"的行为模式。

**不做**：semantic memory、cultural memory、社交记忆完整版。

---

### MVP 02-C：Fire Pit — 第一个人工物

**目标**：世界中出现第一批"不是天然的"实体。

**做什么**：
- fire pit 作为可建造的世界实体
- build action 的 validate + execute 链路
- fire pit 的世界效果（例：附近 entity 获得 warmth buff）
- 使用与熄灭规则

**完成效果**：世界中第一次出现人工改造的长期痕迹。

**不做**：shelter、多种建筑、复杂建造菜单。

---

### MVP 02-D：Skill / Tool / Technology 第一层闭环

**目标**：把"个体会做"与"群体知道怎么做"区分开。

**做什么**：
- 1 个 skill：fire-making
- 1 个 tool：fire pit（复用 02-C）
- 1 个 technology：controlled-fire
- 传播规则：相邻 + 观察 N tick → 学会
- 个体掌握 → 使用工具 → 传播给他人 → 部落层技术

**完成效果**：世界中出现发明者、学习者、传播、文化累积雏形。

**不做**：大型技术树、复杂学习曲线、多条技术链。

---

### MVP 02-E：部落雏形与最小社会关系

**目标**：让个体从"各自活着"升级到"开始形成群体"。

**做什么**：
- TribeState 数据结构（成员、共享知识、聚集点）
- 跟随/聚集倾向
- 最小 social memory（对个体的简单印象）
- 共享资源点或活动地点
- 基础角色差异雏形

**完成效果**：小人出现聚集、跟随、共享地点、初步分工倾向。

**不做**：完整家族婚配、战争、复杂对话、制度。

---

## MVP-02 明确不做

| 不做 | 归属阶段 |
|------|----------|
| 复杂对话系统 | MVP-04+ |
| 完整宗教教义树 | MVP-04 |
| 完整战争系统 | MVP-04+ |
| 复杂经济系统 | MVP-03+ |
| 完整家族婚配系统 | MVP-03+ |
| 大型科技树 | MVP-03 |
| LLM 接管高频决策 | MVP-05 |
| PixiJS 渲染迁移 | MVP-03 或独立支线 |

---

## 验证策略

每个子阶段结束后必须有：
1. 新增/升级的 golden scenario 覆盖新能力
2. 独立 smoke test 证明多 seed 稳定性
3. acceptance 文档定义"什么算完"
4. 不破坏 MVP-01 的全部回归测试
