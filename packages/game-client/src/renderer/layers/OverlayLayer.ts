/**
 * OverlayLayer.ts — Dota-style fog of war + ambient lighting.
 *
 * Three visibility states per tile:
 *   1. Visible    — inside any alive agent's vision circle → no overlay
 *   2. Explored   — was visible before, not now → dark semi-transparent
 *   3. Unexplored — never seen → near-opaque black
 *
 * Also renders:
 *   - Ambient lighting tint (dawn gold, dusk orange, night blue)
 *   - Gather point markers
 */

import { Container, Graphics } from "pixi.js";
import {
  TILE_SIZE, TILE_PITCH,
  COLOR_GATHER_POINT,
  COLOR_FOG_UNEXPLORED, FOG_UNEXPLORED_ALPHA,
  COLOR_FOG_EXPLORED, FOG_EXPLORED_ALPHA,
  COLOR_DAWN_TINT, COLOR_DUSK_TINT, COLOR_NIGHT_TINT,
} from "../theme";
import type { DebugTribeView, DebugEnvironmentView } from "@project-god/shared";

/** Data passed from the game loop for fog rendering. */
export interface FogRenderData {
  /** Set of tile keys currently visible by any alive agent. */
  visibleTiles: Set<string>;
  /** Map of tile keys that have ever been explored. */
  exploredTiles: Record<string, boolean>;
}

export class OverlayLayer {
  readonly container = new Container();

  private totalW = 0;
  private totalH = 0;

  /** Reusable Graphics for fog — avoid allocating new ones each frame. */
  private fogGraphics: Graphics | null = null;
  /** Reusable Graphics for ambient tint. */
  private ambientGraphics: Graphics | null = null;

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
    fogData?: FogRenderData,
  ): void {
    this.container.removeChildren();

    // ── Per-tile fog of war ────────────────────────────────
    if (fogData) {
      // Use single Graphics object for performance (batched draw calls)
      const fog = new Graphics();

      for (let y = 0; y < mapH; y++) {
        for (let x = 0; x < mapW; x++) {
          const key = `${x},${y}`;
          const isVisible = fogData.visibleTiles.has(key);

          if (isVisible) continue; // No overlay needed

          const isExplored = fogData.exploredTiles[key] === true;
          const px = x * TILE_PITCH;
          const py = y * TILE_PITCH;

          if (isExplored) {
            // Explored but not currently visible — dim overlay
            fog.rect(px, py, TILE_SIZE, TILE_SIZE)
              .fill({ color: COLOR_FOG_EXPLORED, alpha: FOG_EXPLORED_ALPHA });
          } else {
            // Never explored — near-black overlay
            fog.rect(px, py, TILE_SIZE, TILE_SIZE)
              .fill({ color: COLOR_FOG_UNEXPLORED, alpha: FOG_UNEXPLORED_ALPHA });
          }
        }
      }

      this.container.addChild(fog);
    }

    // ── Ambient lighting tint ──────────────────────────────
    if (environment && environment.lightLevel < 0.9) {
      const tint = environment.timeOfDay === "dawn" ? COLOR_DAWN_TINT
                 : environment.timeOfDay === "dusk" ? COLOR_DUSK_TINT
                 : COLOR_NIGHT_TINT; // night
      // Alpha scales inversely with light level, capped at 0.45
      const alpha = Math.min((1.0 - environment.lightLevel) * 0.5, 0.45);
      const ambient = new Graphics();
      ambient.rect(0, 0, this.totalW, this.totalH)
        .fill({ color: tint, alpha });
      this.container.addChild(ambient);
    }

    // ── Gather point markers ──────────────────────────────
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
  }
}
