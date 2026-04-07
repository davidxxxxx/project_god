# Test Strategy

我们是严肃的世界模拟器，最怕“看起来能跑，实际上世界已经歪了”。此文件约束所有测试思路。

## A. Sim 单测基础逻辑
- 确认 hunger 和 thirst 会随 tick 稳定下降。
- 执行 gather 后，大地图该处资源扣尽、实体背包物品绝对增加，总量必须守恒。
- Entity 不在 interact 范围内如果提出 gather 应该抛弃请求（Action Rejected）。

## B. Agent 行为回归
- 模拟高度饥饿时，Agent在生成 candidate 列表打分时，找食物（berry）的优先级显著大于乱跑。
- 面临口渴极点而且周边有水，系统必须无障碍选择 drink。

## C. 死死咬住 固定 Seed 场景
- seed=123，运行 300 ticks，整个系统重现的轨迹必须卡死在一个确定性区间。
- 不论电脑性能和环境怎么变化，这个系统最值钱的就是“同一个 seed 能绝对复现世界推演历史”。
