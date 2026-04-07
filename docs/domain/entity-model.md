# Entity Model

实体数据的最源头抽象。防止后续代码里随处临时附带神秘变量。

## Entity 基础字段架构
第一版仅锁定核心清单：

- `id`
- `species/type`
- `tribeId`
- `tile/position`
- `attributes` (挂载基于 attribute-model 的静态天赋/基准能力)
- `needs` (挂载随 tick 衰减的需要数值)
- `inventory` (动态持有的物品包裹)
- `statuses` (诸如：中毒、狂暴等临时标签)
- `knownSkills` (已掌握的单体能力树)
- `memoryRefs` (关联对象的记忆 ID 指针数组)
