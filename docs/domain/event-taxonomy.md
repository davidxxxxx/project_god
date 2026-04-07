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
