/**
 * theme.ts — Unified color palette and layout constants for PixiJS renderer.
 *
 * Colors mirror the CSS variables from styles.css so the canvas
 * world blends seamlessly with the surrounding DOM HUD.
 */

// ── Tile Grid ────────────────────────────────────────────────

/** Pixel size of a single tile (square). */
export const TILE_SIZE = 32;

/** Pixel gap between tiles. */
export const TILE_GAP = 1;

/** Effective pitch = tile + gap between tile origins. */
export const TILE_PITCH = TILE_SIZE + TILE_GAP;

// ── Colors (0xRRGGBB) ───────────────────────────────────────

/** Background grid color (matches --bg-0: #0b0d13). */
export const COLOR_BG = 0x0b0d13;

/** Default tile fill (matches --bg-2: #1a1e2e). */
export const COLOR_TILE = 0x1a1e2e;

/** Terrain-specific tile colors. MVP-02Y. */
export const COLOR_TERRAIN: Record<string, number> = {
  grass:     0x1a2e1a,  // dark green
  forest:    0x0d1f0d,  // darker green
  rock:      0x2a2a2f,  // dark gray
  swamp:     0x1a1f15,  // murky dark
  river:     0x0a1530,  // deep blue
  riverbank: 0x1a2530,  // blue-gray
};

/** Agent – alive (matches --accent-green). */
export const COLOR_AGENT_ALIVE = 0x00e88f;

/** Agent – dead (matches --accent-red). */
export const COLOR_AGENT_DEAD = 0xff4466;

/** Agent – has skill (matches golden). */
export const COLOR_AGENT_SKILLED = 0xffb400;

/** Selected agent highlight ring. */
export const COLOR_SELECTED = 0x4488ff;

/** Berry resource. */
export const COLOR_BERRY = 0x88cc44;

/** Water resource. */
export const COLOR_WATER = 0x44aaff;

/** Wood resource. */
export const COLOR_WOOD = 0x8b6914;

/** Stone resource. */
export const COLOR_STONE = 0x9e9e9e;

/** Grass resource. */
export const COLOR_GRASS = 0x7ec850;

/** Fiber resource. */
export const COLOR_FIBER = 0xbfa76a;

/** Fire pit – active. */
export const COLOR_FIRE_PIT = 0xff8c00;

/** Lean-to shelter – active. */
export const COLOR_LEAN_TO = 0x4ecdc4;

/** Expired structure. */
export const COLOR_STRUCTURE_DEAD = 0x505050;

/** Gather point (matches yellow tint). */
export const COLOR_GATHER_POINT = 0xffff64;

/** Night mask overlay color. */
export const COLOR_NIGHT_MASK = 0x060a1e;

/** Night mask opacity (0 = transparent, 1 = opaque). */
export const NIGHT_MASK_ALPHA = 0.45;

/** Shrine structure – active (MVP-07A). */
export const COLOR_SHRINE = 0xa78bfa;

/** Hut structure – active (MVP-02X). */
export const COLOR_HUT = 0xd9a64e;

/** Agent with priest role (MVP-07A). */
export const COLOR_AGENT_PRIEST = 0xa78bfa;

// ── Agent Visual Sizes ───────────────────────────────────────

/** Radius of the agent circle (pixels). */
export const AGENT_RADIUS = 10;

/** Font size for tile-level labels (emoji stand-ins). */
export const LABEL_FONT_SIZE = 14;
