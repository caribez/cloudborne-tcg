/**
 * TABLE LAYOUT in logical coordinates (independent of camera and screen).
 *
 * Card positions are derived deterministically from a PlayerView: each family
 * has a horizontal band (nearest band = the anchor family, usually the viewer),
 * split into zones for Children, Characters and pending Schemes. The shared
 * piles (main deck and discard) sit in a column on the right. Positions carry
 * no rules meaning; the renderer maps them to world space.
 *
 * Units are roughly centimetres. +x is right, +y is the far side of the table.
 */
import type { Seat } from './types';
import { HIDDEN, type PlayerView } from './views';

export const CARD_SIZE = { width: 6.3, height: 8.8 } as const;

const BAND_H = 12.5;
const BAND_GAP = 1.2;
/** Space between card centres in a zone before cards start to overlap. */
const SPACING = 7;
/** Married Children peek out above their spouse. */
const SPOUSE_OFFSET_Y = 2.9;
const DISCARD_SHOWN = 6;

export const ZONES = {
  /** No cards: the family's HTML nameplate is anchored here. */
  plate: { minX: -62, maxX: -48 },
  children: { minX: -46, maxX: -33 },
  characters: { minX: -30, maxX: 22 },
  schemes: { minX: 25, maxX: 45 },
} as const;
export const PILES = { x: 52.5, deckY: 5.5, discardY: -5.5 } as const;

export type LaidZone = 'character' | 'scheme' | 'child' | 'discard';

export interface LaidCard {
  readonly instanceId: string;
  /** HIDDEN when the viewer may not know the card. */
  readonly defId: string;
  readonly x: number;
  readonly y: number;
  /** Degrees, clockwise seen from above. */
  readonly rotation: number;
  /** Stacking level: higher lies on top. */
  readonly elevation: number;
  readonly zone: LaidZone;
  readonly owner: Seat | null;
  /** The viewer's own pending Scheme: face visible to them, hidden from others. */
  readonly secret: boolean;
  readonly challenged: boolean;
  readonly married: boolean;
}

export interface Band {
  readonly seat: Seat;
  readonly centerY: number;
  readonly minY: number;
  readonly maxY: number;
}

export interface TableLayout {
  readonly anchor: Seat;
  readonly cards: readonly LaidCard[];
  readonly bands: readonly Band[];
  readonly deck: { readonly x: number; readonly y: number };
  readonly discard: { readonly x: number; readonly y: number };
  readonly bounds: { readonly minX: number; readonly maxX: number; readonly minY: number; readonly maxY: number };
}

/** Seats from nearest to farthest: the anchor, then the following seats in turn order. */
export function bandOrder(count: number, anchor: Seat): Seat[] {
  const a = anchor >= 0 && anchor < count ? anchor : 0;
  return Array.from({ length: count }, (_, i) => (a + i) % count);
}

/** Left-aligned x positions for `count` cards in a zone, compressing (overlapping) when needed. */
export function spread(count: number, minX: number, maxX: number): number[] {
  if (count <= 0) return [];
  const half = CARD_SIZE.width / 2;
  const room = maxX - minX - CARD_SIZE.width;
  const step = count > 1 ? Math.min(SPACING, room / (count - 1)) : 0;
  return Array.from({ length: count }, (_, i) => round2(minX + half + i * step));
}

const round2 = (v: number) => Math.round(v * 100) / 100;

export function computeLayout(view: PlayerView, anchor: Seat): TableLayout {
  const n = view.families.length;
  const order = bandOrder(n, anchor);
  const total = n * BAND_H + (n - 1) * BAND_GAP;
  const bands: Band[] = order.map((seat, i) => {
    const centerY = round2(-total / 2 + BAND_H / 2 + i * (BAND_H + BAND_GAP));
    return { seat, centerY, minY: round2(centerY - BAND_H / 2), maxY: round2(centerY + BAND_H / 2) };
  });

  const cards: LaidCard[] = [];
  const spouseOf = new Map<string, string>(); // characterId -> childId
  for (const m of view.marriages) spouseOf.set(m.characterId, m.childId);
  const marriedIds = new Set(view.marriages.flatMap((m) => [m.childId, m.characterId]));

  for (const band of bands) {
    const family = view.families[band.seat]!;
    const rowY = round2(band.centerY - 1);
    const base = { owner: band.seat, rotation: 0, secret: false, challenged: false };

    const chars = spread(family.characters.length, ZONES.characters.minX, ZONES.characters.maxX);
    family.characters.forEach((c, i) => {
      const x = chars[i]!;
      cards.push({ ...base, instanceId: c.instanceId, defId: c.defId, x, y: rowY, elevation: 2 + i, zone: 'character', married: marriedIds.has(c.instanceId) });
      const childId = spouseOf.get(c.instanceId);
      const childCard = childId ? family.children.find((k) => k.instanceId === childId) : undefined;
      if (childCard) {
        cards.push({ ...base, instanceId: childCard.instanceId, defId: childCard.defId, x, y: round2(rowY + SPOUSE_OFFSET_Y), elevation: 1 + i, zone: 'child', married: true });
      }
    });

    const single = family.children.filter((k) => !marriedIds.has(k.instanceId));
    const kids = spread(single.length, ZONES.children.minX, ZONES.children.maxX);
    single.forEach((k, i) => cards.push({ ...base, instanceId: k.instanceId, defId: k.defId, x: kids[i]!, y: rowY, elevation: i, zone: 'child', married: false }));

    const schemes = spread(family.schemes.length, ZONES.schemes.minX, ZONES.schemes.maxX);
    family.schemes.forEach((s, i) =>
      cards.push({
        ...base,
        instanceId: s.instanceId,
        defId: s.defId,
        x: schemes[i]!,
        y: rowY,
        elevation: s.challenged ? 20 : i,
        zone: 'scheme',
        secret: s.defId !== HIDDEN,
        challenged: s.challenged,
        married: false,
      }),
    );
  }

  const shown = view.discard.slice(-DISCARD_SHOWN);
  shown.forEach((c, i) =>
    cards.push({
      instanceId: c.instanceId,
      defId: c.defId,
      x: PILES.x,
      y: PILES.discardY,
      rotation: ((i * 37) % 11) - 5,
      elevation: i,
      zone: 'discard',
      owner: null,
      secret: false,
      challenged: false,
      married: false,
    }),
  );

  return {
    anchor: order[0] ?? 0,
    cards,
    bands,
    deck: { x: PILES.x, y: PILES.deckY },
    discard: { x: PILES.x, y: PILES.discardY },
    bounds: { minX: ZONES.plate.minX, maxX: PILES.x + CARD_SIZE.width / 2 + 2, minY: round2(-total / 2 - 0.5), maxY: round2(total / 2 + 0.5) },
  };
}
