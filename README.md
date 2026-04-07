# Project God

Welcome to **Project God** — a simulation-first god game with evolving AI-driven agents, built around deep systemic interactions, faith systems, and multi-agent progression.

## 🌟 Working Rules

这些是最核心的底线，任何人或 AI 修改代码时必须绝对遵从：

1. **Simulation is the source of truth.**
2. **LLM may suggest, but only validated actions may mutate world state.**
3. **Skills belong to agents, tools belong to world/inventory, technology belongs to tribe/culture.**
4. **Every important state change should emit an event.**
5. **New concepts must be added to `docs/domain` before widespread coding.**
6. **Prefer small playable slices over giant unfinished systems.**

---

## 🎯 当前阶段目标
实现第一个可以闭环运转的纯生存系统（MVP-01）。

## 🚫 当前阶段【不做】什么
不做社交、信仰、科技，初期完全不接入 LLM API。所有的 Agent 必须靠纯函数与优先级逻辑存活。

## 🎮 First Playable Loop
在没有任何神明干涉的情况下，3–10 个小人能基于自己的属性寻找资源并吃喝，直到老死或饿死，期间 UI 会完整投射。

## 🔄 新 Patch 提交流程
1. 改代码前必须优先寻找 `content-data` 下可调整的配置参数
2. 遵守 `.agent/workflows/bugfix.md` 或新功能规范进行实现
3. 每个核心提交应当满足固定 seed 测试能够跑通

---

## 📁 Repository Structure

```text
project_God/
├─ .agent/             # Rules, workflows, and skills for AI agents
│  ├─ rules/           # Core AI constraints (Project, Coding, Docs, Sim)
│  ├─ workflows/       # SOPs for new features, bugfixes, balancing
│  └─ skills/          # AI Skills (e.g. sim-feature-scaffold, agent-balance-check)
│
├─ docs/               # System source of truth
│  ├─ product/         # Vison, Minimum viable loops, Build Orders
│  ├─ architecture/    # Runtime loop, save format, system boundaries 
│  ├─ domain/          # World model, entities, tech trees, event dict
│  ├─ adr/             # Architectural Decision Records
│  └─ changelog/
│
├─ packages/           # Code boundaries
│  ├─ core-sim/        # Deterministic world state and transitions
│  ├─ agent-runtime/   # Perception, memory, planning, actions
│  ├─ content-data/    # Tunable JSON/YAML/Configs
│  ├─ game-client/     # UI, Rendering, Debug projections
│  ├─ ai-adapters/     # Integrations for LLM narration and prompts
│  └─ shared/          # Types, Schemas, Events
│
└─ tests/
```
