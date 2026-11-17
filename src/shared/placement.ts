/**
 * TABLE GEOMETRY AND PLACEMENT POLICY.
 *
 * The shared playing area uses logical units (roughly centimetres), centred
 * on (0, 0). +x is to the right, +y is towards the far side of the table as
 * seen by every player. These coordinates are independent of the camera and
 * screen size; the renderer maps them to world space.
 *
 * Snapping/clamping lives here so placement restrictions can change without
 * touching rules, networking or rendering.
 */

export const TABLE_BOUNDS = { minX: -50, maxX: 50, minY: -30, maxY: 30 } as const;

export const CARD_SIZE = { width: 6.3, height: 8.8 } as const;

/** Grid used to gently snap placements. Set to 0 to disable snapping. */
export const PLACEMENT_SNAP = 0.5;
/** Rotation step in degrees. */
export const ROTATION_STEP_DEG = 15;

export interface Placement {
  x: number;
  y: number;
  /** Degrees, normalised to [0, 360). */
  rotation: number;
}

export function normaliseRotation(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}

/** Half extents of a card's axis-aligned bounding box at a given rotation. */
function rotatedHalfExtents(rotationDeg: number): { hx: number; hy: number } {
  const rad = (rotationDeg * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  return {
    hx: (CARD_SIZE.width * c + CARD_SIZE.height * s) / 2,
    hy: (CARD_SIZE.width * s + CARD_SIZE.height * c) / 2,
  };
}

/** True if the point lies inside the playing area (the card centre must). */
export function isInsideTable(x: number, y: number): boolean {
  return x >= TABLE_BOUNDS.minX && x <= TABLE_BOUNDS.maxX && y >= TABLE_BOUNDS.minY && y <= TABLE_BOUNDS.maxY;
}

function snap(v: number, step: number): number {
  return step > 0 ? Math.round(v / step) * step : v;
}

/**
 * Turns a requested placement into the placement actually used: snaps
 * rotation and position, then keeps the whole card inside the bounds.
 * Used by both the client (for the ghost preview) and the authority.
 */
export function resolvePlacement(requested: Placement): Placement {
  const rotation = normaliseRotation(snap(requested.rotation, ROTATION_STEP_DEG));
  const { hx, hy } = rotatedHalfExtents(rotation);
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const x = clamp(snap(requested.x, PLACEMENT_SNAP), TABLE_BOUNDS.minX + hx, TABLE_BOUNDS.maxX - hx);
  const y = clamp(snap(requested.y, PLACEMENT_SNAP), TABLE_BOUNDS.minY + hy, TABLE_BOUNDS.maxY - hy);
  // Round to avoid floating-point noise in serialized state.
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return { x: r2(x), y: r2(y), rotation: r2(rotation) };
}
