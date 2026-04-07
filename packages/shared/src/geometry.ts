/**
 * Coordinate system: origin (0,0) at top-left.
 * x increases rightward, y increases downward.
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/** Manhattan distance — used for interaction range checks. */
export function manhattan(a: Vec2, b: Vec2): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** Chebyshev (king-move) distance — used for adjacency. */
export function chebyshev(a: Vec2, b: Vec2): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** Check whether two positions are the same tile. */
export function samePos(a: Vec2, b: Vec2): boolean {
  return a.x === b.x && a.y === b.y;
}
