/**
 * TileLayer.ts — Renders the background tile grid with terrain colors.
 *
 * MVP-02Y: Colors tiles by terrain type (grass, forest, rock, river, etc.)
 * instead of uniform gray.
 */

import { Container, Graphics } from "pixi.js";
import { TILE_SIZE, TILE_PITCH, COLOR_TILE, COLOR_TERRAIN } from "../theme";

export class TileLayer {
  readonly container = new Container();

  /** Flat array [y * cols + x] of tile Graphics, for per-tile recoloring. */
  private tiles: Graphics[] = [];
  private cols = 0;
  private rows = 0;

  /** Terrain type per tile for coloring. */
  private terrainMap: string[] = [];

  /**
   * Build the grid. Called once on init and on map resize.
   */
  build(cols: number, rows: number): void {
    this.container.removeChildren();
    this.tiles = [];
    this.terrainMap = [];
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
        this.terrainMap.push("grass"); // default
      }
    }
  }

  /**
   * Update terrain data from projection. Called once per render frame.
   * MVP-02Y: Colors tiles based on terrain type.
   */
  updateTerrain(tileData: { x: number; y: number; terrain: string }[]): void {
    for (const t of tileData) {
      if (t.x < 0 || t.x >= this.cols || t.y < 0 || t.y >= this.rows) continue;
      const idx = t.y * this.cols + t.x;
      this.terrainMap[idx] = t.terrain;
    }
  }

  /**
   * Reset all tiles to their terrain color. Called at the start of each render frame.
   */
  resetColors(): void {
    for (let i = 0; i < this.tiles.length; i++) {
      const g = this.tiles[i];
      const terrain = this.terrainMap[i] ?? "grass";
      const color = COLOR_TERRAIN[terrain] ?? COLOR_TILE;
      g.clear();
      g.rect(0, 0, TILE_SIZE, TILE_SIZE).fill({ color });
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
