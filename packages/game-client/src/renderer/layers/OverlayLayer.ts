/**
 * OverlayLayer.ts — Renders overlays on top of the world.
 *
 * Includes:
 *   - Night mask (dark translucent cover during nighttime)
 *   - Gather point markers
 */

import { Container, Graphics } from "pixi.js";
import {
  TILE_SIZE, TILE_PITCH,
  COLOR_NIGHT_MASK, NIGHT_MASK_ALPHA,
  COLOR_GATHER_POINT,
} from "../theme";
import type { DebugTribeView, DebugEnvironmentView } from "@project-god/shared";

export class OverlayLayer {
  readonly container = new Container();

  private nightMask: Graphics | null = null;
  private totalW = 0;
  private totalH = 0;

  /** Must call after TileLayer.build so we know the canvas size. */
  init(cols: number, rows: number): void {
    this.totalW = cols * TILE_PITCH;
    this.totalH = rows * TILE_PITCH;
  }

  update(
    environment: DebugEnvironmentView | undefined,
    tribes: DebugTribeView[],
    mapW: number,
    mapH: number,
  ): void {
    this.container.removeChildren();

    // ── Gather point markers ───────────────────────────────
    for (const tribe of tribes) {
      if (!tribe.gatherPoint) continue;
      const gp = tribe.gatherPoint;
      if (gp.x >= mapW || gp.y >= mapH) continue;

      const px = gp.x * TILE_PITCH;
      const py = gp.y * TILE_PITCH;

      const marker = new Graphics();
      marker.rect(0, 0, TILE_SIZE, TILE_SIZE)
        .stroke({ color: COLOR_GATHER_POINT, width: 2, alpha: 0.6 });
      // Add a small diamond in the center
      const cx = TILE_SIZE / 2;
      const cy = TILE_SIZE / 2;
      const ds = 5;
      marker.moveTo(cx, cy - ds).lineTo(cx + ds, cy).lineTo(cx, cy + ds).lineTo(cx - ds, cy).closePath()
        .fill({ color: COLOR_GATHER_POINT, alpha: 0.4 });
      marker.x = px;
      marker.y = py;
      this.container.addChild(marker);
    }

    // ── Night mask ─────────────────────────────────────────
    if (environment && environment.timeOfDay === "night") {
      const mask = new Graphics();
      mask.rect(0, 0, this.totalW, this.totalH).fill({ color: COLOR_NIGHT_MASK, alpha: NIGHT_MASK_ALPHA });
      this.container.addChild(mask);
    }
  }
}
