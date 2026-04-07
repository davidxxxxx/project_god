# World Model

最小世界模型表约束。

## Tile (地格设定)
第一版严防膨胀，只允许存在以下属性：

- `terrain` (地形种类)
- `biome` (生态群落)
- `moveCost` (移动所消耗的体力/成本基础乘子)
- `waterAccess` (是否贴近水源)
- `fertility` (肥沃度，影响食物刷新)
- `visibleResources` (在此地块刷新的表层资源合集)
