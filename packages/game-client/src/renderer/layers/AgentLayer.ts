/**
 * AgentLayer.ts — Renders agents as colored circles with status indicators.
 *
 * Each agent is a Container with:
 *   - A filled circle (body)
 *   - A small status dot (skill indicator)
 *   - An emoji text label
 *
 * Supports click-to-select via PixiJS eventMode.
 */

import { Container, Graphics, Text, TextStyle, FederatedPointerEvent } from "pixi.js";
import {
  TILE_SIZE, TILE_PITCH, AGENT_RADIUS,
  COLOR_AGENT_ALIVE, COLOR_AGENT_DEAD, COLOR_AGENT_SKILLED,
  COLOR_SELECTED, COLOR_AGENT_PRIEST,
} from "../theme";
import type { DebugAgentView } from "@project-god/shared";

/** MVP-04: Lifecycle-specific rendering constants. */
const COLOR_AGENT_CHILD = 0x67e8f9;  // cyan
const COLOR_AGENT_ELDER = 0x9ca3af;  // gray
const CHILD_RADIUS_RATIO = 0.65;

const LABEL_STYLE = new TextStyle({
  fontSize: 14,
  fill: 0xffffff,
  align: "center",
});

/** Previous-tick positions for lerp animation. */
const prevPositions = new Map<string, { x: number; y: number }>();

export class AgentLayer {
  readonly container = new Container();

  /** Callback when an agent is clicked. Set by PixiWorldRenderer. */
  onAgentClick: ((agentId: string) => void) | null = null;

  /** Current lerp progress (0..1). Driven externally by renderer's ticker. */
  lerpT = 1;

  update(agents: DebugAgentView[], selectedAgentId: string | null, mapW: number, mapH: number): void {
    this.container.removeChildren();

    for (const agent of agents) {
      if (agent.position.x >= mapW || agent.position.y >= mapH) continue;

      const targetPx = agent.position.x * TILE_PITCH + TILE_SIZE / 2;
      const targetPy = agent.position.y * TILE_PITCH + TILE_SIZE / 2;

      // Lerp from previous to current position
      const prev = prevPositions.get(agent.id);
      let px: number, py: number;
      if (prev && this.lerpT < 1) {
        px = prev.x + (targetPx - prev.x) * this.lerpT;
        py = prev.y + (targetPy - prev.y) * this.lerpT;
      } else {
        px = targetPx;
        py = targetPy;
      }

      const group = new Container();
      group.x = px;
      group.y = py;

      // Body circle — size & color vary by life stage (MVP-04)
      const hasSkill = Object.keys(agent.skills).length > 0;
      const isChild = agent.lifeStage === "child";
      const isElder = agent.lifeStage === "elder";
      const radius = isChild ? AGENT_RADIUS * CHILD_RADIUS_RATIO : AGENT_RADIUS;

      const bodyColor = !agent.alive
        ? COLOR_AGENT_DEAD
        : agent.role === "priest"
        ? COLOR_AGENT_PRIEST
        : isChild
        ? COLOR_AGENT_CHILD
        : isElder
        ? COLOR_AGENT_ELDER
        : hasSkill
        ? COLOR_AGENT_SKILLED
        : COLOR_AGENT_ALIVE;

      const body = new Graphics();
      body.circle(0, 0, radius).fill({ color: bodyColor, alpha: agent.alive ? 1 : 0.4 });
      group.addChild(body);

      // Selection ring
      if (agent.id === selectedAgentId) {
        const ring = new Graphics();
        ring.circle(0, 0, radius + 3)
          .stroke({ color: COLOR_SELECTED, width: 2, alpha: 0.9 });
        group.addChild(ring);
      }

      // Spouse indicator ring (MVP-04)
      if (agent.spouseId && agent.alive) {
        const spouseRing = new Graphics();
        spouseRing.circle(0, 0, radius + 1)
          .stroke({ color: 0xfb7185, width: 1.5, alpha: 0.6 }); // pink tint
        group.addChild(spouseRing);
      }

      // Prayer halo (MVP-05) — golden glow ring above praying agent
      if (agent.isPraying && agent.alive) {
        const halo = new Graphics();
        halo.circle(0, -radius * 0.6, radius * 0.7)
          .stroke({ color: 0xfbbf24, width: 1.5, alpha: 0.7 });
        group.addChild(halo);
      }

      // Status indicators (small dots)
      const statuses = agent.statuses ?? [];
      if (statuses.includes("warming")) {
        const dot = new Graphics();
        dot.circle(radius - 2, -radius + 2, 3).fill({ color: 0xff8c00 });
        group.addChild(dot);
      }
      if (statuses.includes("sheltered")) {
        const dot = new Graphics();
        dot.circle(-radius + 2, -radius + 2, 3).fill({ color: 0x4ecdc4 });
        group.addChild(dot);
      }

      // Icon — lifecycle-aware (MVP-04)
      const icon = !agent.alive ? "💀" : isChild ? "👶" : isElder ? "👴" : hasSkill ? "🧙" : "🧑";
      const label = new Text({ text: icon, style: LABEL_STYLE });
      label.anchor.set(0.5);
      label.y = -1;
      group.addChild(label);

      // Click interaction — use tile-sized hit area for easy clicking
      const halfTile = TILE_SIZE / 2;
      group.eventMode = "static";
      group.cursor = "pointer";
      group.hitArea = { contains: (lx: number, ly: number) => Math.abs(lx) <= halfTile && Math.abs(ly) <= halfTile };
      group.on("pointertap", (_e: FederatedPointerEvent) => {
        this.onAgentClick?.(agent.id);
      });

      this.container.addChild(group);

      // Store for next-frame lerp
      prevPositions.set(agent.id, { x: targetPx, y: targetPy });
    }
  }
}
