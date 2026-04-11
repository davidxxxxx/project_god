/**
 * PixiWorldRenderer.ts — Main PixiJS world renderer.
 *
 * Orchestrates all render layers and connects them to DebugProjection.
 * Replaces the old DOM-based renderMap function.
 *
 * Usage:
 *   const renderer = new PixiWorldRenderer();
 *   await renderer.init(containerEl, cols, rows);
 *   // Each tick:
 *   renderer.update(projection, selectedAgentId);
 */

import { Application } from "pixi.js";
import { TileLayer } from "./layers/TileLayer";
import { ResourceLayer } from "./layers/ResourceLayer";
import { StructureLayer } from "./layers/StructureLayer";
import { AgentLayer } from "./layers/AgentLayer";
import { OverlayLayer, type FogRenderData } from "./layers/OverlayLayer";
import { TILE_PITCH, COLOR_BG } from "./theme";
import type { DebugProjection } from "@project-god/shared";

export class PixiWorldRenderer {
  private app: Application | null = null;

  private tileLayer = new TileLayer();
  private resourceLayer = new ResourceLayer();
  private structureLayer = new StructureLayer();
  private agentLayer = new AgentLayer();
  private overlayLayer = new OverlayLayer();

  private cols = 0;
  private rows = 0;

  /** Set the click handler for agents. */
  set onAgentClick(fn: ((agentId: string) => void) | null) {
    this.agentLayer.onAgentClick = fn;
  }

  /**
   * Initialize the PixiJS Application and mount it into the given DOM element.
   * Must be called once before any update().
   */
  async init(container: HTMLElement, cols: number, rows: number): Promise<void> {
    this.cols = cols;
    this.rows = rows;

    const canvasW = cols * TILE_PITCH;
    const canvasH = rows * TILE_PITCH;

    this.app = new Application();
    await this.app.init({
      width: canvasW,
      height: canvasH,
      backgroundColor: COLOR_BG,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    // Mount canvas into DOM
    container.innerHTML = "";
    container.appendChild(this.app.canvas as HTMLCanvasElement);

    // Style the canvas
    const canvas = this.app.canvas as HTMLCanvasElement;
    canvas.style.borderRadius = "6px";
    canvas.style.border = "1px solid #2a2e40";

    // Build layers in z-order (bottom → top)
    this.tileLayer.build(cols, rows);
    this.overlayLayer.init(cols, rows);

    this.app.stage.addChild(this.tileLayer.container);
    this.app.stage.addChild(this.resourceLayer.container);
    this.app.stage.addChild(this.structureLayer.container);
    this.app.stage.addChild(this.agentLayer.container);
    this.app.stage.addChild(this.overlayLayer.container);

    // Enable interaction on the stage
    this.app.stage.eventMode = "static";
    this.app.stage.hitArea = this.app.screen;
  }

  /**
   * Update all layers from a fresh DebugProjection snapshot.
   * Called once per simulation tick (or per render frame during animation).
   */
  update(proj: DebugProjection, selectedAgentId: string | null, fogData?: FogRenderData): void {
    if (!this.app) return;

    // 1. Update tile terrain data + reset colors
    if (proj.tiles) {
      this.tileLayer.updateTerrain(proj.tiles);
    }
    this.tileLayer.resetColors();

    // 2. Update entity layers
    this.resourceLayer.update(proj.resources, this.cols, this.rows);
    this.structureLayer.update(proj.structures, this.cols, this.rows);
    this.agentLayer.update(proj.agents, selectedAgentId, this.cols, this.rows);
    this.overlayLayer.update(proj.environment, proj.tribes, this.cols, this.rows, fogData);
  }

  /**
   * Destroy the renderer and release GPU resources.
   */
  destroy(): void {
    if (this.app) {
      this.app.destroy(true, { children: true, texture: true });
      this.app = null;
    }
  }
}
