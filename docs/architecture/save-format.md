# Save Format

## 存储边界原则
第一版的联机/存档基建。

- **必须存**：`worldState` / `entities` / `tribes` / `techState` / `seed` / `gameTime`
- **绝对不存**: 调试缓存区数据、Agent大脑内部的临时打分板、瞬时候选动作列表
- **生命线**: schema 对象必须具有版本号 `version`。任何字段扩展必须基于新版本迁移（Migration）走。

## JSON Scaffold
```json
{
  "version": "1.0.0",
  "seed": 1234567,
  "gameTime": 250,
  "worldState": { },
  "entities": [ ],
  "tribes": [ ],
  "techState": { }
}
```
