/**
 * StructureLayer.ts — Renders structures (fire_pit, lean_to).
 *
 * Active structures get a warm/cool glow; expired structures are dim.
 */

import { Container, Graphics, Text, TextStyle } from "pixi.js";
import {
  TILE_SIZE, TILE_PITCH,
  COLOR_FIRE_PIT, COLOR_LEAN_TO, COLOR_STRUCTURE_DEAD, COLOR_SHRINE, COLOR_HUT,
  LABEL_FONT_SIZE,
} from "../theme";
import type { DebugStructureView } from "@project-god/shared";

const LABEL_STYLE = new TextStyle({
  fontSize: LABEL_FONT_SIZE,
  fill: 0xffffff,
  align: "center",
});

const STRUCTURE_ICONS: Record<string, string> = {
  fire_pit: "🔥",
  lean_to: "🛖",
  hut: "🏠",
  shrine: "⛩️",
};

export class StructureLayer {
  readonly container = new Container();

  update(structures: DebugStructureView[], mapW: number, mapH: number): void {
    this.container.removeChildren();

    for (const s of structures) {
      if (s.position.x >= mapW || s.position.y >= mapH) continue;

      const px = s.position.x * TILE_PITCH;
      const py = s.position.y * TILE_PITCH;

      let color: number;
      if (!s.active) {
        color = COLOR_STRUCTURE_DEAD;
      } else if (s.type === "lean_to") {
        color = COLOR_LEAN_TO;
      } else if (s.type === "shrine") {
        color = COLOR_SHRINE;
      } else if (s.type === "hut") {
        color = COLOR_HUT;
      } else {
        color = COLOR_FIRE_PIT;
      }

      // Background fill
      const bg = new Graphics();
      bg.rect(0, 0, TILE_SIZE, TILE_SIZE).fill({ color, alpha: s.active ? 0.4 : 0.2 });
      bg.x = px;
      bg.y = py;
      this.container.addChild(bg);

      // Glow ring for active structures
      if (s.active) {
        const glow = new Graphics();
        glow.rect(-2, -2, TILE_SIZE + 4, TILE_SIZE + 4)
          .stroke({ color, width: 1.5, alpha: 0.6 });
        glow.x = px;
        glow.y = py;
        this.container.addChild(glow);
      }

      // Icon
      const icon = STRUCTURE_ICONS[s.type] ?? (s.active ? "🏗️" : "⬛");
      const label = new Text({ text: icon, style: LABEL_STYLE });
      label.anchor.set(0.5);
      label.x = px + TILE_SIZE / 2;
      label.y = py + TILE_SIZE / 2;
      this.container.addChild(label);
    }
  }
}
