/**
 * ResourceLayer.ts — Renders resource nodes (berry bushes, water sources).
 *
 * Uses Graphics shapes with text labels.
 */

import { Container, Graphics, Text, TextStyle } from "pixi.js";
import {
  TILE_SIZE, TILE_PITCH, COLOR_BERRY, COLOR_WATER, COLOR_WOOD, COLOR_STONE, COLOR_GRASS, COLOR_FIBER, LABEL_FONT_SIZE,
} from "../theme";
import type { DebugResourceView } from "@project-god/shared";

const LABEL_STYLE = new TextStyle({
  fontSize: LABEL_FONT_SIZE,
  fill: 0xffffff,
  align: "center",
});

const RESOURCE_ICONS: Record<string, string> = {
  berry: "🫐",
  water: "💧",
  wood: "🪵",
  stone: "🪨",
  grass: "🌿",
  fiber: "🧵",
};

const RESOURCE_COLORS: Record<string, number> = {
  berry: COLOR_BERRY,
  water: COLOR_WATER,
  wood: COLOR_WOOD,
  stone: COLOR_STONE,
  grass: COLOR_GRASS,
  fiber: COLOR_FIBER,
};

export class ResourceLayer {
  readonly container = new Container();

  update(resources: DebugResourceView[], mapW: number, mapH: number): void {
    this.container.removeChildren();

    for (const res of resources) {
      if (res.position.x >= mapW || res.position.y >= mapH) continue;

      const color = RESOURCE_COLORS[res.resourceType] ?? 0xaaaaaa;
      const icon = RESOURCE_ICONS[res.resourceType] ?? "?";

      // Background tint
      const bg = new Graphics();
      bg.rect(0, 0, TILE_SIZE, TILE_SIZE).fill({ color, alpha: 0.25 });
      bg.x = res.position.x * TILE_PITCH;
      bg.y = res.position.y * TILE_PITCH;
      this.container.addChild(bg);

      // Emoji label
      const label = new Text({ text: icon, style: LABEL_STYLE });
      label.anchor.set(0.5);
      label.x = res.position.x * TILE_PITCH + TILE_SIZE / 2;
      label.y = res.position.y * TILE_PITCH + TILE_SIZE / 2;
      this.container.addChild(label);
    }
  }
}
