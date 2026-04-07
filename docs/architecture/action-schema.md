# Action Schema

## 动作契约模型

Agent 只能产生想要做某事的“意图（Intent）”。
**绝对严禁 Agent 侧代码去 mutate 世界状态。**所有的意图必须抛给 `core-sim` 去执行 Validate。只有 Validate 通过后才有实际发生的 mutation。

## 基础接口

```ts
type ActionIntent = {
  actorId: string;
  type: "move" | "gather" | "eat" | "drink" | "rest" | "pray" | "build" | "research";
  targetId?: string;
  position?: { x: number; y: number };
  itemId?: string;
  duration?: number;
  confidence?: number;
  reason?: string;
};
```
