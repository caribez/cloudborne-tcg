/**
 * Locally generated placeholder card art (2D canvas). No external images or
 * fonts. The same canvases feed both the 3D textures and the HTML inspector.
 *
 * Faces are generated only from a definition id the viewer is allowed to know.
 * Concealed cards (HIDDEN) always use the one shared card back.
 */
import { getCardDefinition, type CardDefinition } from '../../shared/cards';
import { rulesLines, typeLine } from '../../shared/cardText';
import type { Standing } from '../../shared/types';
import { HIDDEN } from '../../shared/views';

export const ART_W = 360;
export const ART_H = Math.round((ART_W * 88) / 63);

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, sans-serif';
const cache = new Map<string, HTMLCanvasElement>();

export const AFFILIATION_COLORS: Readonly<Record<Standing, string>> = {
  aristocracy: '#b8862a',
  religion: '#4a74b4',
  popularity: '#c2563a',
};
const TYPE_COLORS = { scheme: '#5d3c7e', instant: '#2c7a76', child: '#b15f7c' } as const;

/** Main colour of a card (frame, header). */
export function cardColor(def: CardDefinition): string {
  return def.type === 'character' ? AFFILIATION_COLORS[def.affiliation] : TYPE_COLORS[def.type];
}

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

/** Largest font size (down to `min`) at which `text` fits in `width`. */
function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: string, max: number, min: number, width: number): number {
  for (let size = max; size > min; size--) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    if (ctx.measureText(text).width <= width) return size;
  }
  ctx.font = `${weight} ${min}px ${FONT}`;
  return min;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Simple geometric emblems instead of illustrations. */
function emblem(ctx: CanvasRenderingContext2D, def: CardDefinition, cx: number, cy: number, r: number) {
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.strokeStyle = 'rgba(255,255,255,0.88)';
  ctx.lineWidth = 6;
  ctx.lineJoin = 'round';
  const kind = def.type === 'character' ? def.affiliation : def.type;
  ctx.beginPath();
  switch (kind) {
    case 'aristocracy': // crown
      ctx.moveTo(cx - r, cy + r * 0.55);
      ctx.lineTo(cx - r, cy - r * 0.35);
      ctx.lineTo(cx - r * 0.5, cy + r * 0.1);
      ctx.lineTo(cx, cy - r * 0.6);
      ctx.lineTo(cx + r * 0.5, cy + r * 0.1);
      ctx.lineTo(cx + r, cy - r * 0.35);
      ctx.lineTo(cx + r, cy + r * 0.55);
      ctx.closePath();
      ctx.fill();
      break;
    case 'religion': // radiant star
      for (let i = 0; i < 16; i++) {
        const a = (i * Math.PI) / 8 - Math.PI / 2;
        const rr = i % 2 ? r * 0.42 : r;
        ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      break;
    case 'popularity': // crowd of heads
      for (const [dx, dy, s] of [
        [-0.62, 0.15, 0.3],
        [0.62, 0.15, 0.3],
        [0, -0.05, 0.38],
      ] as const) {
        ctx.moveTo(cx + dx * r + s * r, cy + dy * r - s * r * 0.6);
        ctx.arc(cx + dx * r, cy + dy * r - s * r * 0.6, s * r * 0.6, 0, Math.PI * 2);
        ctx.moveTo(cx + dx * r + s * r, cy + dy * r + s * r * 1.3);
        ctx.ellipse(cx + dx * r, cy + dy * r + s * r * 1.3, s * r, s * r * 0.75, 0, Math.PI, 0);
      }
      ctx.fill();
      break;
    case 'scheme': // masquerade mask
      ctx.ellipse(cx, cy, r, r * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3a2452';
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.42, cy - r * 0.04, r * 0.24, r * 0.15, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + r * 0.42, cy - r * 0.04, r * 0.24, r * 0.15, 0.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'instant': // lightning
      ctx.moveTo(cx + r * 0.2, cy - r);
      ctx.lineTo(cx - r * 0.55, cy + r * 0.12);
      ctx.lineTo(cx - r * 0.02, cy + r * 0.12);
      ctx.lineTo(cx - r * 0.25, cy + r);
      ctx.lineTo(cx + r * 0.6, cy - r * 0.2);
      ctx.lineTo(cx + r * 0.05, cy - r * 0.2);
      ctx.closePath();
      ctx.fill();
      break;
    case 'child': // two linked rings
      ctx.arc(cx - r * 0.35, cy, r * 0.5, 0, Math.PI * 2);
      ctx.moveTo(cx + r * 0.85, cy);
      ctx.arc(cx + r * 0.35, cy, r * 0.5, 0, Math.PI * 2);
      ctx.stroke();
      break;
  }
  ctx.restore();
}

/** Front of a card. `secret` marks the viewer's own face-down Scheme. */
export function cardFrontCanvas(defId: string, secret = false): HTMLCanvasElement {
  if (defId === HIDDEN) return cardBackCanvas();
  const key = `front:${defId}:${secret ? 's' : ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const def = getCardDefinition(defId);
  const color = cardColor(def);
  const [c, ctx] = canvas();
  const W = ART_W;
  const H = ART_H;

  ctx.fillStyle = '#f5efe2';
  ctx.fillRect(0, 0, W, H);
  ctx.lineWidth = 14;
  ctx.strokeStyle = color;
  roundRect(ctx, 9, 9, W - 18, H - 18, 22);
  ctx.stroke();

  // Header with name (large for table distance).
  ctx.fillStyle = color;
  roundRect(ctx, 24, 24, W - 48, 70, 12);
  ctx.fill();
  const hasCost = def.type !== 'child';
  const nameLeft = hasCost ? 92 : 40;
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  fitFont(ctx, def.name, '750', 38, 20, W - 40 - nameLeft);
  ctx.fillText(def.name, nameLeft, 60);

  // Gold cost coin.
  if (hasCost) {
    ctx.beginPath();
    ctx.arc(58, 59, 30, 0, Math.PI * 2);
    ctx.fillStyle = '#f2c94c';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#8a6412';
    ctx.stroke();
    ctx.fillStyle = '#4a3305';
    ctx.textAlign = 'center';
    ctx.font = `800 36px ${FONT}`;
    ctx.fillText(String(def.cost), 58, 61);
  }

  // Placeholder art panel with emblem.
  const artY = 106;
  const artH = 150;
  const grad = ctx.createLinearGradient(0, artY, 0, artY + artH);
  grad.addColorStop(0, color);
  grad.addColorStop(1, '#2a2f3a');
  ctx.fillStyle = grad;
  roundRect(ctx, 30, artY, W - 60, artH, 10);
  ctx.fill();
  emblem(ctx, def, W / 2, artY + artH / 2, 52);

  // Type line.
  ctx.fillStyle = '#3a342a';
  ctx.textAlign = 'center';
  fitFont(ctx, typeLine(def), '650', 20, 13, W - 60);
  ctx.fillText(typeLine(def), W / 2, artY + artH + 22);

  // Rules text.
  let y = artY + artH + 52;
  ctx.textAlign = 'left';
  for (const line of rulesLines(def)) {
    const label = line.label ? `${line.label}: ` : '';
    ctx.font = `500 19px ${FONT}`;
    const words = wrap(ctx, `${label}${line.text}`, W - 76);
    words.forEach((w, i) => {
      if (i === 0 && label) {
        ctx.font = `750 19px ${FONT}`;
        ctx.fillStyle = color;
        ctx.fillText(label, 38, y);
        const lw = ctx.measureText(label).width;
        ctx.font = `500 19px ${FONT}`;
        ctx.fillStyle = '#2b2620';
        ctx.fillText(w.slice(label.length), 38 + lw, y);
      } else {
        ctx.fillStyle = '#2b2620';
        ctx.fillText(w, 38, y);
      }
      y += 23;
    });
    y += 6;
  }
  if (def.flavor && y < H - 50) {
    ctx.font = `italic 16px ${FONT}`;
    ctx.fillStyle = '#6a604f';
    for (const w of wrap(ctx, def.flavor, W - 76)) {
      if (y > H - 34) break;
      ctx.fillText(w, 38, y);
      y += 19;
    }
  }

  if (secret) {
    // Ribbon reminding the owner that opponents only see the card back.
    ctx.save();
    ctx.translate(W - 74, 128);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#1d1430e6';
    ctx.fillRect(-120, -18, 240, 36);
    ctx.fillStyle = '#e9dcff';
    ctx.font = `800 17px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('HIDDEN · YOURS', 0, 1);
    ctx.restore();
  }
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
  ctx.fillText('☁', W / 2, H / 2 - 10);
  ctx.font = `700 28px ${FONT}`;
  ctx.fillText('CLOUDBORNE', W / 2, H / 2 + 80);
  cache.set('back', c);
  return c;
}

const urlCache = new Map<string, string>();
/** Data URL of a card image for the HTML inspector (the shared back for HIDDEN). */
export function cardImageUrl(defId: string, secret = false): string {
  const key = `${defId}:${secret}`;
  let url = urlCache.get(key);
  if (!url) {
    url = cardFrontCanvas(defId, secret).toDataURL('image/png');
    urlCache.set(key, url);
  }
  return url;
}
