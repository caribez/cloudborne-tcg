/**
 * Locally generated placeholder card art (2D canvas). No external images or
 * fonts. The same canvases feed both the 3D textures and the HTML inspector.
 */
import { getCardDefinition, SUITS } from '../../shared/cards';

export const ART_W = 360;
export const ART_H = Math.round((ART_W * 88) / 63);

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, sans-serif';
const cache = new Map<string, HTMLCanvasElement>();

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = ART_W;
  c.height = ART_H;
  return [c, c.getContext('2d')!];
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function cardFrontCanvas(defId: string): HTMLCanvasElement {
  const key = `front:${defId}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const def = getCardDefinition(defId);
  const suit = SUITS[def.suit];
  const [c, ctx] = canvas();
  const W = ART_W;
  const H = ART_H;

  ctx.fillStyle = '#f6f1e7';
  ctx.fillRect(0, 0, W, H);
  // Coloured frame
  ctx.lineWidth = 14;
  ctx.strokeStyle = suit.color;
  roundRect(ctx, 10, 10, W - 20, H - 20, 22);
  ctx.stroke();

  // Header band
  ctx.fillStyle = suit.color;
  roundRect(ctx, 26, 26, W - 52, 74, 12);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 40px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(def.name, 44, 64);

  // Value badge (large, for readability at table distance)
  ctx.textAlign = 'center';
  ctx.fillStyle = suit.color;
  ctx.font = `800 150px ${FONT}`;
  ctx.fillText(String(def.value), W / 2, H * 0.43);
  ctx.globalAlpha = 0.9;
  ctx.font = `90px ${FONT}`;
  ctx.fillText(suit.glyph, W / 2, H * 0.64);
  ctx.globalAlpha = 1;

  // Corner indices
  ctx.font = `800 44px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(String(def.value), 32, H - 52);
  ctx.textAlign = 'right';
  ctx.fillText(suit.glyph, W - 32, H - 52);

  // Rules text
  ctx.fillStyle = '#4a4438';
  ctx.font = `italic 22px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(def.text, W / 2, H * 0.78);

  cache.set(key, c);
  return c;
}

export function cardBackCanvas(): HTMLCanvasElement {
  const hit = cache.get('back');
  if (hit) return hit;
  const [c, ctx] = canvas();
  const W = ART_W;
  const H = ART_H;
  ctx.fillStyle = '#2b3a55';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#d8c79a';
  ctx.lineWidth = 8;
  roundRect(ctx, 18, 18, W - 36, H - 36, 20);
  ctx.stroke();
  // Diamond lattice
  ctx.save();
  roundRect(ctx, 30, 30, W - 60, H - 60, 14);
  ctx.clip();
  ctx.strokeStyle = 'rgba(216, 199, 154, 0.25)';
  ctx.lineWidth = 2;
  for (let i = -H; i < W + H; i += 28) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + H, H);
    ctx.moveTo(i, H);
    ctx.lineTo(i + H, 0);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = '#d8c79a';
  ctx.font = `110px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('☁', W / 2, H / 2);
  cache.set('back', c);
  return c;
}

const urlCache = new Map<string, string>();
/** Data URL of a card face for the HTML inspector. */
export function cardFrontDataUrl(defId: string): string {
  let url = urlCache.get(defId);
  if (!url) {
    url = cardFrontCanvas(defId).toDataURL('image/png');
    urlCache.set(defId, url);
  }
  return url;
}
