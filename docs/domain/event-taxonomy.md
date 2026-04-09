# Event Taxonomy

所有的世界状态变化、系统的重大运转时刻，必须发射标准事件。严禁各层模块乱自定义日志打印。

## MVP 级基础事件清单

- `TIME_TICKED`: 时间流逝单位触发
- `NEED_DECAYED`: 饥饿渴求等参数自然衰减
- `ENTITY_MOVED`: 存在位移成功
- `RESOURCE_SPOTTED`: 感知范围观测到相关必须资源
- `RESOURCE_GATHERED`: 从节点提取物品到 Inventory
- `FOOD_EATEN`: 进食
- `WATER_DRUNK`: 饮水
- `ACTION_REJECTED`: Agent提出校验失败的动作被驳回
- `ENTITY_DIED`: 生命体消亡（饿死/触发物理死亡）
- `FIRST_DISCOVERY_MADE`: 首次里程碑发现

## MVP-02 资源/库存事件

- `INVENTORY_FULL`: 库存容量已满，采集被阻止
- `ITEM_DROPPED`: 物品从 Inventory 丢弃到地面

## MVP-02 建筑事件

- `STRUCTURE_BUILT`: Agent 完成建造（fire pit 等）
- `STRUCTURE_EXPIRED`: 建筑耗尽燃料/耐久归零自然熄灭
- `WARMING_APPLIED`: Entity 进入 fire pit warming 范围

## MVP-02 技能/技术事件

- `SKILL_LEARNED`: Entity 习得新技能（method: invention | observation）
- `SKILL_OBSERVED`: Entity 正在观察学习技能（进度 N/M）
- `TECHNOLOGY_UNLOCKED`: 部落解锁新技术（成员达到 minSkilledMembers 阈值）

## MVP-02 部落事件

- `TRIBE_GATHER_POINT_UPDATED`: 部落聚集点更新（每 tick 质心计算后）
- `SOCIAL_MEMORY_UPDATED`: Agent 更新对他人的社交印象（trust 变化）

## MVP-03A 环境事件

- `ENVIRONMENT_CHANGED`: 温度或日夜切换
- `EXPOSURE_WARNING`: Entity 暴露度低于临界值
- `SHELTERED_APPLIED`: Entity 进入庇护结构范围

## MVP-03B 知识事件

- `SEMANTIC_FORMED`: Agent 从经验中提炼出语义事实
- `KNOWLEDGE_TAUGHT`: Agent 向部落传授高置信度事实
- `KNOWLEDGE_INHERITED`: Agent 从部落文化记忆继承知识

## MVP-04 生命周期事件

- `ENTITY_BORN`: 新生命诞生
- `PAIR_BONDED`: 两个 Entity 结为配偶
- `ENTITY_AGED`: Entity 进入新生命阶段

## MVP-05 信仰/祈祷/神迹事件

- `PRAYER_STARTED`: Entity 开始祈祷
- `PRAYER_COMPLETED`: Entity 祈祷完成，等待神明回应
- `PRAYER_UNANSWERED`: 祈祷未被回应，信仰值下降
- `MIRACLE_PERFORMED`: 玩家（神明）施展神迹
- `FAITH_CHANGED`: Entity 信仰值变化

## MVP-07A 祭司/祭坛/仪式事件

- `ROLE_ASSIGNED`: Entity 被指派角色（如 priest）
- `RITUAL_STARTED`: 祭司在祭坛发起仪式
- `RITUAL_COMPLETED`: 仪式完成，给予信仰/DP 奖励
- `MIRACLE_INTERPRETED`: 祭司对已发生的神迹进行"解读"

## MVP-07B 教义与禁忌事件

- `DOCTRINE_FORMED`: 部落形成新教义（由特定事件触发）
- `DOCTRINE_VIOLATED`: 教义被违反（如火灭导致 fire_sacred 违反）
- `DOCTRINE_REINFORCED`: 教义被强化（触发事件再次发生）
