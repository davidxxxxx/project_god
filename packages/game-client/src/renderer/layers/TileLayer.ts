/**
 * TileLayer.ts — Renders the background tile grid.
 *
 * Each tile is a filled rectangle drawn once on init.
 * Night-mode is handled by OverlayLayer, not here.
 */

import { Container, Graphics } from "pixi.js";
import { TILE_SIZE, TILE_PITCH, COLOR_TILE } from "../theme";

export class TileLayer {
  readonly container = new Container();

  /** Flat array [y * cols + x] of tile Graphics, for per-tile recoloring. */
  private tiles: Graphics[] = [];
  private cols = 0;
  private rows = 0;

  /**
   * Build the grid. Called once on init and on map resize.
   */
  build(cols: number, rows: number): void {
    this.container.removeChildren();
    this.tiles = [];
    this.cols = cols;
    this.rows = rows;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const g = new Graphics();
        g.rect(0, 0, TILE_SIZE, TILE_SIZE).fill({ color: COLOR_TILE });
        g.x = x * TILE_PITCH;
        g.y = y * TILE_PITCH;
        this.container.addChild(g);
        this.tiles.push(g);
      }
    }
  }

  /**
   * Reset all tiles to default color. Called at the start of each render frame.
   */
  resetColors(): void {
    for (const g of this.tiles) {
      g.clear();
      g.rect(0, 0, TILE_SIZE, TILE_SIZE).fill({ color: COLOR_TILE });
    }
  }

  /**
   * Tint a specific tile with a given color (e.g. to show resource/structure highlights).
   */
  tintTile(x: number, y: number, color: number, alpha = 1): void {
    if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return;
    const g = this.tiles[y * this.cols + x];
    g.clear();
    g.rect(0, 0, TILE_SIZE, TILE_SIZE).fill({ color, alpha });
  }
}
