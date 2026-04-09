# Build Order

任何人（包括AI）不得违规跳步或跨层开发。顺序锁死：

## MVP-01: Survival Loop ✅ 已封板

1. ✅ 搭建基础地图 + 放置 Entity + 实现 Tick Engine 流转
2. ✅ 加入 hunger / thirst 数值衰竭模型
3. ✅ 完成行动四件套：move / gather / eat / drink 及验证
4. ✅ 将产生的流水接到 event log / debug overlay 实现可观测
5. ✅ 正式 world bootstrap + 开局合法性校验 + run termination
6. ✅ 多 seed smoke test + MVP-01 验收封板

## MVP-02: Survival+ — 从"活下去"到"文明前兆" ✅ 已封板

前置. ✅ EntityState 类型扩展 + Save/Load v1
7. ✅ inventory 容量、堆叠、掉落规则增强
8. ✅ working memory + episodic memory v1
9. ✅ fire pit — 第一个人工物（build action 链路）
10. ✅ skill(fire-making) / tool(fire pit) / technology(controlled-fire) 第一层闭环
11. ✅ 部落雏形 TribeState + 最小社会关系 + 聚集倾向

## MVP-03+ 路线图（方向性，不锁步）

12. ✅ shelter / 更完整的环境交互 (MVP-03-A)
13. ✅ semantic memory + cultural memory (MVP-03-B)
14. ✅ PixiJS 渲染迁移
15. ✅ 完整家族/婚配/继承系统 (MVP-04: lifecycle + pairing + birth)
16. ✅ 信仰系统 faith / prayer / miracle (MVP-05: divine intervention)
17. LLM reflection / narration 接入
