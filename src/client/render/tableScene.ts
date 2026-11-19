/**
 * Three.js presentation of the table. Consumes PlayerViews and reports pointer
 * intentions through callbacks; it never changes game state. Card positions
 * come from the shared logical layout (shared/layout.ts). Animations are
 * cosmetic: every tween can be finished instantly (`clearTransient`), and
 * hit-testing uses the logical layout, never animating meshes.
 *
 * Reconciliation is by instance id AND appearance: a card whose definition
 * becomes known (a revealed Scheme) or unknown (viewer changed) gets its face
 * replaced even though its id stayed the same.
 *
 * World mapping: logical table (x, y) -> world (x, 0, -y). +y is the far side.
 * Two layers are rendered: the perspective table and an orthographic,
 * pixel-space hand layer along the bottom of the screen.
 */
import * as THREE from 'three';
import { CARD_SIZE, computeLayout, ZONES, type LaidCard, type TableLayout } from '../../shared/layout';
import type { Seat } from '../../shared/types';
import { HIDDEN, type PlayerView } from '../../shared/views';
import { cardBackCanvas, cardFrontCanvas } from './cardArt';

export interface SceneCallbacks {
  onHandHover(instanceId: string | null): void;
  onHandClick(instanceId: string): void;
  onTableHover(instanceId: string | null): void;
  onTableClick(instanceId: string | null): void;
}

/** Visual emphasis for table cards, decided by the screen (targets, selection). */
export interface TableMarks {
  readonly targets: ReadonlySet<string>;
  readonly chosen: ReadonlySet<string>;
}

export const SEAT_COLORS = ['#e0b45a', '#6fb7e8', '#d483cf', '#7fd48a'];

const CARD_T = 0.04;
const STACK_STEP = 0.05;
const DECK_CARD_T = 0.07;
const HAND_FRACTION = 0.27;
const ANIM_MS = 380;
const NO_MARKS: TableMarks = { targets: new Set(), chosen: new Set() };

interface CardObj {
  readonly mesh: THREE.Mesh;
  readonly outline: THREE.Mesh;
  /** `${defId}|${secret}`: when this changes, the face is replaced. */
  look: string;
}

interface Tween {
  readonly obj: THREE.Object3D;
  readonly fromPos: THREE.Vector3;
  readonly toPos: THREE.Vector3;
  readonly fromQuat: THREE.Quaternion;
  readonly toQuat: THREE.Quaternion;
  readonly fromScale: number;
  readonly toScale: number;
  readonly start: number;
  readonly duration: number;
  readonly arc: boolean;
  readonly onDone?: () => void;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const tableYaw = (deg: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (-deg * Math.PI) / 180);
const HAND_QUAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
const HAND_BACK_QUAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI).multiply(HAND_QUAT);

export class TableScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(36, 1, 1, 800);
  private readonly handScene = new THREE.Scene();
  private readonly handCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4000);
  private readonly raycaster = new THREE.Raycaster();
  private readonly tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  private readonly cardGeometry = new THREE.BoxGeometry(CARD_SIZE.width, CARD_T, CARD_SIZE.height);
  private readonly outlineGeometry = new THREE.PlaneGeometry(CARD_SIZE.width + 0.9, CARD_SIZE.height + 0.9).rotateX(-Math.PI / 2);
  private readonly edgeMaterial = new THREE.MeshStandardMaterial({ color: '#e9e2d0', roughness: 0.9 });
  private readonly backMaterial: THREE.MeshStandardMaterial;
  private readonly frontMaterials = new Map<string, THREE.MeshStandardMaterial>();
  private readonly outlineMaterials = {
    hover: this.outlineMat('#ffd54a'),
    selected: this.outlineMat('#4fc3f7'),
    target: this.outlineMat('#7cf29a'),
    chosen: this.outlineMat('#4fc3f7'),
    challenged: this.outlineMat('#ff6b6b'),
    married: this.outlineMat('#e7c86e', 0.7),
  };

  private readonly tableCards = new Map<string, CardObj>();
  private readonly handCards = new Map<string, CardObj>();
  private handOrder: string[] = [];
  private readonly deck: THREE.Mesh;
  private readonly tableGroup = new THREE.Group();
  private tableKey = '';
  private tweens: Tween[] = [];
  private transients: THREE.Object3D[] = [];
  private readonly labels = new Map<string, HTMLElement>();

  private view: PlayerView | null = null;
  private layout: TableLayout | null = null;
  private laidById = new Map<string, LaidCard>();
  private marks: TableMarks = NO_MARKS;
  private width = 1;
  private height = 1;
  private zoom = 1;
  private hoverHand: string | null = null;
  private hoverTable: string | null = null;
  private selected: string | null = null;
  private inputEnabled = true;
  private pointerNdc: THREE.Vector2 | null = null;
  private downAt: { x: number; y: number } | null = null;
  private handLeftInset = 24;
  private readonly resizeObserver: ResizeObserver;

  constructor(
    private readonly container: HTMLElement,
    private readonly callbacks: SceneCallbacks,
  ) {
this.renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true
});

this.renderer.setClearColor(0x000000, 0);    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.autoClear = false;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.classList.add('table-canvas');

    this.backMaterial = new THREE.MeshStandardMaterial({ map: this.texture(cardBackCanvas()), roughness: 0.85 });
    this.scene.add(this.tableGroup);
    this.deck = new THREE.Mesh(new THREE.BoxGeometry(CARD_SIZE.width, 1, CARD_SIZE.height), [
      this.edgeMaterial,
      this.edgeMaterial,
      this.backMaterial,
      this.edgeMaterial,
      this.edgeMaterial,
      this.edgeMaterial,
    ]);
    this.deck.castShadow = true;
    this.scene.add(this.deck);
this.scene.background = null;

this.scene.add(
  new THREE.HemisphereLight('#eef1f3', '#526779', 1.6)
);
const sun = new THREE.DirectionalLight('#fff0db', 1.5);

    sun.position.set(-25, 90, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -90;
    sc.right = 90;
    sc.top = 60;
    sc.bottom = -60;
    sc.near = 10;
    sc.far = 220;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);
    this.handCamera.position.set(0, 0, 2000);
    this.handScene.add(new THREE.AmbientLight('#ffffff', 2.2));
    const handLight = new THREE.DirectionalLight('#ffffff', 1.0);
    handLight.position.set(0, 0, 1);
    this.handScene.add(handLight);

    const el = this.renderer.domElement;
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointerleave', this.onPointerLeave);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.renderer.setAnimationLoop(this.frame);
  }

  // ---------------------------------------------------------------- public API

  /**
   * Shows a new view, laid out with `anchor`'s family nearest. Animates only
   * when it plausibly follows the previous view for the same viewer.
   */
  setView(view: PlayerView, options: { animate: boolean; anchor: Seat }): void {
    const prev = this.view;
    const animate = options.animate && prev !== null && prev.viewer === view.viewer && view.revision > prev.revision;
    this.view = view;
    if (!animate) this.finishTweens();
    const layout = computeLayout(view, options.anchor);
    this.layout = layout;
    this.laidById = new Map(layout.cards.map((c) => [c.instanceId, c]));
    const key = `${view.families.length}:${layout.anchor}`;
    if (key !== this.tableKey) {
      this.tableKey = key;
      this.buildTable(layout);
      this.fitCamera();
    }

    // Table cards
    for (const card of layout.cards) {
      const target = this.tableTransform(card);
      const look = `${card.defId}|${card.secret}`;
      const existing = this.tableCards.get(card.instanceId);
      if (existing) {
        if (existing.look !== look) this.setFace(existing, card.defId, card.secret);
        const moved = existing.mesh.position.distanceTo(target.pos) > 0.01 || existing.mesh.quaternion.angleTo(target.quat) > 0.01;
        if (moved && animate) this.tween(existing.mesh, existing.mesh.position.clone(), target.pos, existing.mesh.quaternion.clone(), target.quat, 1, 1);
        else if (moved) this.place(existing.mesh, target);
        continue;
      }
      const obj = this.makeCard(card.defId, card.secret, true);
      this.tableCards.set(card.instanceId, obj);
      this.scene.add(obj.mesh);
      const fromHand = this.handCards.get(card.instanceId);
      if (animate && fromHand) {
        const start = this.handToWorld(fromHand.mesh.position, fromHand.mesh.scale.x);
        this.tween(obj.mesh, start.pos, target.pos, start.quat, target.quat, 1, 1);
      } else if (animate) {
        this.tween(obj.mesh, target.pos.clone().add(new THREE.Vector3(0, 14, -4)), target.pos, target.quat, target.quat, 1.1, 1);
      } else this.place(obj.mesh, target);
    }
    for (const [id, obj] of this.tableCards) {
      if (!this.laidById.has(id)) {
        this.cancelTweens(obj.mesh);
        this.scene.remove(obj.mesh);
        this.tableCards.delete(id);
      }
    }

    // Hand cards (the viewer always knows its own cards, but refresh faces anyway).
    const handIds = view.hand.map((c) => c.instanceId);
    const drewOwn = animate && prev !== null && view.drawPileCount < prev.drawPileCount;
    for (const c of view.hand) {
      const existing = this.handCards.get(c.instanceId);
      if (existing) {
        if (existing.look !== `${c.defId}|false`) this.setFace(existing, c.defId, false);
        continue;
      }
      const obj = this.makeCard(c.defId, false, false);
      this.handCards.set(c.instanceId, obj);
      this.handScene.add(obj.mesh);
      obj.mesh.userData.fresh = drewOwn;
    }
    for (const [id, obj] of this.handCards) {
      if (!handIds.includes(id)) {
        this.cancelTweens(obj.mesh);
        this.handScene.remove(obj.mesh);
        this.handCards.delete(id);
      }
    }
    this.handOrder = handIds;
    if (this.selected && !handIds.includes(this.selected)) this.selected = null;
    if (this.hoverHand && !handIds.includes(this.hoverHand)) this.hoverHand = null;
    if (this.hoverTable && !this.tableCards.has(this.hoverTable)) this.hoverTable = null;

    // Opponent draws: card backs fly from the deck towards that family's nameplate.
    if (animate && prev) {
      for (const f of view.families) {
        const before = prev.families[f.seat]?.handCount ?? f.handCount;
        if (f.seat !== view.viewer && f.handCount > before && view.drawPileCount < prev.drawPileCount) this.animateOpponentDraw(f.seat);
      }
    }
    this.layoutHand(animate);
    this.updateDeck(view.drawPileCount);
    this.updateHighlights();
  }

  /** Target/selection emphasis for table cards. */
  setMarks(marks: TableMarks | null): void {
    this.marks = marks ?? NO_MARKS;
    this.updateHighlights();
  }

  /** Registers an HTML element positioned over a logical point each frame: 'deck', 'discard' or `band:<seat>`. */
  setLabel(key: string, el: HTMLElement | null): void {
    if (el) this.labels.set(key, el);
    else this.labels.delete(key);
  }

  /** Space reserved on the left of the hand area (for the log panel), in CSS px. */
  setHandLeftInset(px: number): void {
    this.handLeftInset = px;
    this.layoutHand(false);
  }

  /** Hides everything private and stops all animations immediately (hotseat handoff). */
  clearTransient(): void {
    this.finishTweens();
    this.selected = null;
    this.hoverHand = null;
    this.hoverTable = null;
    this.marks = NO_MARKS;
    this.pointerNdc = null;
    this.downAt = null;
    this.layoutHand(false);
    this.updateHighlights();
  }

  setSelected(instanceId: string | null): void {
    this.selected = instanceId;
    this.layoutHand(true);
    this.updateHighlights();
  }

  setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled;
    this.renderer.domElement.style.pointerEvents = enabled ? 'auto' : 'none';
    if (!enabled) {
      this.hoverHand = null;
      this.hoverTable = null;
      this.downAt = null;
      this.layoutHand(false);
      this.updateHighlights();
      this.renderer.domElement.style.cursor = 'default';
    }
  }

  /** Highlights a table card chosen from an HTML list (hover feedback). */
  setTableHighlight(instanceId: string | null): void {
    this.hoverTable = instanceId;
    this.updateHighlights();
  }

  /** Screen positions (CSS px) and visible identities, for automated browser checks (`?e2e`). Never more than the view shows. */
  debugScreenInfo() {
    const toCss = (v: THREE.Vector3) => {
      const p = v.clone().project(this.camera);
      return { x: ((p.x + 1) / 2) * this.width, y: ((1 - p.y) / 2) * this.height };
    };
    const hand = this.handOrder.map((id, i) => {
      const slot = this.handSlot(i, this.handOrder.length);
      return { id, defId: this.view?.hand.find((c) => c.instanceId === id)?.defId ?? '', x: slot.x + this.width / 2, y: this.height / 2 - slot.y };
    });
    const table = (this.layout?.cards ?? []).map((c) => ({ id: c.instanceId, defId: c.defId, zone: c.zone, owner: c.owner, ...toCss(new THREE.Vector3(c.x, 0, -c.y)) }));
    const d = this.layout?.deck ?? { x: 0, y: 0 };
    return { hand, table, deck: toCss(new THREE.Vector3(d.x, 0, -d.y)), tweens: this.tweens.length, anchor: this.layout?.anchor ?? null };
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointerup', this.onPointerUp);
    el.removeEventListener('pointerleave', this.onPointerLeave);
    el.removeEventListener('wheel', this.onWheel);
    for (const m of this.frontMaterials.values()) {
      m.map?.dispose();
      m.dispose();
    }
    this.renderer.dispose();
    el.remove();
  }

  // ---------------------------------------------------------------- building

  private outlineMat(color: string, opacity = 0.95): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  }

  private texture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    return tex;
  }

  /** Face material for a known definition; concealed cards always share the back. */
  private faceMaterial(defId: string, secret: boolean): THREE.MeshStandardMaterial {
    if (defId === HIDDEN) return this.backMaterial;
    const key = `${defId}|${secret}`;
    let m = this.frontMaterials.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ map: this.texture(cardFrontCanvas(defId, secret)), roughness: 0.85 });
      this.frontMaterials.set(key, m);
    }
    return m;
  }

  /** Box faces: +x, -x, +y (front), -y (back), +z, -z. */
  private makeCard(defId: string, secret: boolean, onTable: boolean): CardObj {
    const e = this.edgeMaterial;
    const mesh = new THREE.Mesh(this.cardGeometry, [e, e, this.faceMaterial(defId, secret), this.backMaterial, e, e]);
    mesh.castShadow = onTable;
    mesh.receiveShadow = onTable;
    const outline = new THREE.Mesh(this.outlineGeometry, this.outlineMaterials.hover);
    outline.position.y = -CARD_T / 2 + 0.002;
    outline.visible = false;
    outline.renderOrder = -1;
    mesh.add(outline);
    return { mesh, outline, look: `${defId}|${secret}` };
  }

  private setFace(obj: CardObj, defId: string, secret: boolean): void {
    (obj.mesh.material as THREE.Material[])[2] = this.faceMaterial(defId, secret);
    obj.look = `${defId}|${secret}`;
  }

  private place(mesh: THREE.Object3D, t: { pos: THREE.Vector3; quat: THREE.Quaternion }): void {
    this.cancelTweens(mesh);
    mesh.position.copy(t.pos);
    mesh.quaternion.copy(t.quat);
    mesh.scale.setScalar(1);
  }

  private labelTexture(text: string): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 64;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = 'rgba(220, 236, 226, 0.55)';
    ctx.font = '700 40px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 6, 34);
    return this.texture(c);
  }

  /** Felt, per-family bands with zone mats, and the pile column. Rebuilt when the seating changes. */
  private buildTable(layout: TableLayout): void {
    for (const child of [...this.tableGroup.children]) {
      this.tableGroup.remove(child);
      child.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
    }
    const b = layout.bounds;
    const w = b.maxX - b.minX;
    const h = b.maxY - b.minY;
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const wood = new THREE.Mesh(new THREE.BoxGeometry(w + 8, 2, h + 8), new THREE.MeshStandardMaterial({color: '#82939f',roughness: 0.65}));
    wood.position.set(cx, -1.02, -cy);
    wood.receiveShadow = true;
    this.tableGroup.add(wood);
    const felt = new THREE.Mesh(new THREE.PlaneGeometry(w + 2, h + 2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({color: '#b8c4ca', roughness: 0.8}));
    felt.position.set(cx, 0.001, -cy);
    felt.receiveShadow = true;
    this.tableGroup.add(felt);

const matMaterial = new THREE.MeshStandardMaterial({
  color: '#d2d9db',
  roughness: 0.85
});

    const labelMats = new Map<string, THREE.MeshBasicMaterial>();
    const labelMat = (text: string) => {
      let m = labelMats.get(text);
      if (!m) {
        m = new THREE.MeshBasicMaterial({ map: this.labelTexture(text), transparent: true, depthWrite: false });
        labelMats.set(text, m);
      }
      return m;
    };
    for (const band of layout.bands) {
      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(0.8, band.maxY - band.minY).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: SEAT_COLORS[band.seat % SEAT_COLORS.length] }),
      );
      stripe.position.set(ZONES.plate.minX + 0.6, 0.004, -band.centerY);
      this.tableGroup.add(stripe);
      for (const [zone, text] of [
        [ZONES.children, 'CHILDREN'],
        [ZONES.characters, 'CHARACTERS'],
        [ZONES.schemes, 'SCHEMES'],
      ] as const) {
        const zw = zone.maxX - zone.minX + 1;
        const mat = new THREE.Mesh(new THREE.PlaneGeometry(zw, band.maxY - band.minY - 0.2).rotateX(-Math.PI / 2), matMaterial);
        mat.position.set((zone.minX + zone.maxX) / 2, 0.003, -band.centerY);
        mat.receiveShadow = true;
        this.tableGroup.add(mat);
        // Vertical zone label along the mat's left edge.
        const label = new THREE.Mesh(new THREE.PlaneGeometry(8, 1).rotateX(-Math.PI / 2), labelMat(text));
        label.rotation.y = Math.PI / 2;
        label.position.set(zone.minX - 0.05, 0.006, -(band.minY + 4.1));
        this.tableGroup.add(label);
      }
    }
const pileMat = new THREE.MeshStandardMaterial({
  color: '#93a5b2',
  roughness: 0.8
});
    for (const p of [layout.deck, layout.discard]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(CARD_SIZE.width + 1.6, CARD_SIZE.height + 1.6).rotateX(-Math.PI / 2), pileMat);
      m.position.set(p.x, 0.005, -p.y);
      m.receiveShadow = true;
      this.tableGroup.add(m);
    }
    this.deck.position.set(layout.deck.x, 0, -layout.deck.y);
  }

  private updateDeck(count: number): void {
    const height = Math.max(count, 0) * DECK_CARD_T;
    this.deck.visible = count > 0;
    this.deck.scale.y = Math.max(height, 0.001);
    this.deck.position.y = height / 2;
  }

  // ---------------------------------------------------------------- layout

  private tableTransform(card: LaidCard): { pos: THREE.Vector3; quat: THREE.Quaternion } {
    const lift = card.challenged ? 0.8 : 0;
    return {
      pos: new THREE.Vector3(card.x, 0.06 + card.elevation * STACK_STEP + CARD_T / 2 + lift, -card.y),
      quat: tableYaw(card.rotation),
    };
  }


private handMetrics() {
  const compact = this.width <= 900;
  const narrow = this.width <= 600;

  const cardH = Math.max(
    110,
    Math.min(
      compact ? 220 : 280,
      this.height * (compact ? 0.2 : 0.23)
    )
  );

  const scale = cardH / CARD_SIZE.height;
  const cardW = CARD_SIZE.width * scale;

  const rightInset = narrow
    ? 24
    : Math.max(240, Math.min(420, this.width * 0.3)) + 24;

  const left = -this.width / 2 + this.handLeftInset;
  const right = this.width / 2 - rightInset;
  const baseY = -this.height / 2 + cardH / 2 + 14;

  return { cardH, cardW, scale, left, right, baseY };
}


  private handSlot(index: number, count: number) {
    const m = this.handMetrics();
    const avail = Math.max(m.cardW, m.right - m.left);
    const spacing = count > 1 ? Math.min(m.cardW + 12, (avail - m.cardW) / (count - 1)) : 0;
    const total = m.cardW + spacing * (count - 1);
    const startX = m.left + (avail - total) / 2 + m.cardW / 2;
    return { x: startX + spacing * index, y: m.baseY, z: index * 2, scale: m.scale, m };
  }

  private handTarget(id: string, index: number, count: number) {
    const slot = this.handSlot(index, count);
    let y = slot.y;
    let scale = slot.scale;
    let z = slot.z;
    if (id === this.selected) {
      y += slot.m.cardH * 0.22;
      z += 200;
    } else if (id === this.hoverHand && this.inputEnabled) {
      y += slot.m.cardH * 0.12;
      scale *= 1.06;
      z += 100;
    }
    return { x: slot.x, y, z, scale };
  }

  private layoutHand(animate: boolean): void {
    const n = this.handOrder.length;
    this.handOrder.forEach((id, i) => {
      const obj = this.handCards.get(id);
      if (!obj) return;
      const t = this.handTarget(id, i, n);
      const target = new THREE.Vector3(t.x, t.y, t.z);
      if (obj.mesh.userData.fresh && animate && this.layout) {
        obj.mesh.userData.fresh = false;
        const d = this.layout.deck;
        const deckPx = this.worldToHand(new THREE.Vector3(d.x, this.deck.position.y * 2, -d.y));
        this.tween(obj.mesh, deckPx, target, HAND_BACK_QUAT, HAND_QUAT, t.scale * 0.35, t.scale, ANIM_MS * 1.3);
      } else if (animate && obj.mesh.userData.placed) {
        this.tween(obj.mesh, obj.mesh.position.clone(), target, obj.mesh.quaternion.clone(), HAND_QUAT, obj.mesh.scale.x, t.scale, 140);
      } else {
        obj.mesh.userData.fresh = false;
        this.cancelTweens(obj.mesh);
        obj.mesh.position.copy(target);
        obj.mesh.quaternion.copy(HAND_QUAT);
        obj.mesh.scale.setScalar(t.scale);
      }
      obj.mesh.userData.placed = true;
    });
  }

  private updateHighlights(): void {
    for (const [id, obj] of this.handCards) {
      obj.outline.visible = id === this.selected || (id === this.hoverHand && this.inputEnabled);
      obj.outline.material = id === this.selected ? this.outlineMaterials.selected : this.outlineMaterials.hover;
    }
    const m = this.outlineMaterials;
    for (const [id, obj] of this.tableCards) {
      const laid = this.laidById.get(id);
      const material = this.marks.chosen.has(id)
        ? m.chosen
        : id === this.hoverTable
          ? m.hover
          : this.marks.targets.has(id)
            ? m.target
            : laid?.challenged
              ? m.challenged
              : laid?.married
                ? m.married
                : null;
      obj.outline.visible = material !== null;
      if (material) obj.outline.material = material;
    }
  }

  private animateOpponentDraw(seat: Seat): void {
    const band = this.layout?.bands.find((b) => b.seat === seat);
    const d = this.layout?.deck;
    if (!band || !d) return;
    const mesh = new THREE.Mesh(this.cardGeometry, [this.edgeMaterial, this.edgeMaterial, this.backMaterial, this.edgeMaterial, this.edgeMaterial, this.edgeMaterial]);
    this.scene.add(mesh);
    this.transients.push(mesh);
    const from = new THREE.Vector3(d.x, this.deck.position.y * 2 + 0.5, -d.y);
    const to = new THREE.Vector3((ZONES.plate.minX + ZONES.plate.maxX) / 2, 4, -band.centerY);
    this.tween(mesh, from, to, new THREE.Quaternion(), tableYaw(20), 1, 0.5, ANIM_MS * 1.6, () => {
      this.scene.remove(mesh);
      this.transients = this.transients.filter((t) => t !== mesh);
    });
  }

  // ---------------------------------------------------------------- coordinate helpers

  private resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.camera.aspect = w / h;
    this.fitCamera();
    this.handCamera.left = -w / 2;
    this.handCamera.right = w / 2;
    this.handCamera.top = h / 2;
    this.handCamera.bottom = -h / 2;
    this.handCamera.updateProjectionMatrix();
    this.layoutHand(false);
  }

  /** Places the fixed tabletop camera so the whole table fits in the band above the hand area. */
  private fitCamera(): void {
    const b = this.layout?.bounds ?? { minX: -62, maxX: 58, minY: -14, maxY: 14 };
    const corners = [
      new THREE.Vector3(b.minX, 0, -b.minY),
      new THREE.Vector3(b.maxX, 0, -b.minY),
      new THREE.Vector3(b.minX, 0, -b.maxY),
      new THREE.Vector3(b.maxX, 0, -b.maxY),
    ];
    const dir = new THREE.Vector3(0, 1.6, 0.75).normalize(); // ~65° above the table, from the near side
    const lookAt = new THREE.Vector3((b.minX + b.maxX) / 2, 0, -(b.minY + b.maxY) / 2);
    const bottom = -1 + HAND_FRACTION * 2;
    const top = 1 - (56 / this.height) * 2;
    const shiftPx = ((top + bottom) / 2) * (this.height / 2);
    this.camera.setViewOffset(this.width, this.height, 0, shiftPx, this.width, this.height);
    const place = (d: number) => {
      this.camera.position.copy(lookAt).addScaledVector(dir, d);
      this.camera.lookAt(lookAt);
      this.camera.updateMatrixWorld();
      this.camera.updateProjectionMatrix();
    };
    const fits = () =>
      corners.every((c) => {
        const p = c.clone().project(this.camera);
        return Math.abs(p.x) <= 0.985 && p.y >= bottom && p.y <= top;
      });
    let d = 40;
    for (; d < 600; d += 2) {
      place(d);
      if (fits()) break;
    }
    place(d / this.zoom);
  }

  private worldToHand(world: THREE.Vector3): THREE.Vector3 {
    const p = world.clone().project(this.camera);
    return new THREE.Vector3((p.x * this.width) / 2, (p.y * this.height) / 2, 300);
  }

  private handToWorld(handPos: THREE.Vector3, handScale: number): { pos: THREE.Vector3; quat: THREE.Quaternion } {
    const ndc = new THREE.Vector3((handPos.x / this.width) * 2, (handPos.y / this.height) * 2, 0.5);
    const pxH = CARD_SIZE.height * handScale;
    const fov = (this.camera.fov * Math.PI) / 180;
    const dist = CARD_SIZE.height / (2 * Math.tan(fov / 2) * (pxH / this.height));
    const ray = ndc.unproject(this.camera).sub(this.camera.position).normalize();
    const pos = this.camera.position.clone().addScaledVector(ray, dist);
    const quat = this.camera.quaternion.clone().multiply(HAND_QUAT);
    return { pos, quat };
  }

  private projectLabels(): void {
    const layout = this.layout;
    if (!layout) return;
    const put = (el: HTMLElement, x: number, y: number) => {
      const p = new THREE.Vector3(x, 0, -y).project(this.camera);
      el.style.transform = `translate(${((p.x + 1) / 2) * this.width}px, ${((1 - p.y) / 2) * this.height}px) translate(-50%, -50%)`;
    };
    for (const [key, el] of this.labels) {
      if (key === 'deck') put(el, layout.deck.x, layout.deck.y - CARD_SIZE.height / 2 - 1.6);
      else if (key === 'discard') put(el, layout.discard.x, layout.discard.y - CARD_SIZE.height / 2 - 1.6);
      else if (key.startsWith('band:')) {
        const band = layout.bands.find((b) => b.seat === Number(key.slice(5)));
        if (band) put(el, (ZONES.plate.minX + ZONES.plate.maxX) / 2 + 0.5, band.centerY);
      }
    }
  }

  // ---------------------------------------------------------------- pointer input

  private ndcFromEvent(e: PointerEvent | WheelEvent): THREE.Vector2 {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  }

  /** Hit-tests hand cards against their layout rectangles, not their (possibly animating) meshes. */
  private pickHand(ndc: THREE.Vector2): string | null {
    const px = (ndc.x * this.width) / 2;
    const py = (ndc.y * this.height) / 2;
    const n = this.handOrder.length;
    let best: { id: string; z: number } | null = null;
    this.handOrder.forEach((id, i) => {
      const t = this.handTarget(id, i, n);
      const hw = (CARD_SIZE.width * t.scale) / 2;
      const hh = (CARD_SIZE.height * t.scale) / 2;
      if (Math.abs(px - t.x) <= hw && Math.abs(py - t.y) <= hh && (!best || t.z > best.z)) best = { id, z: t.z };
    });
    return (best as { id: string } | null)?.id ?? null;
  }

  /** Topmost laid-out table card under the pointer (logical geometry). */
  private pickTable(ndc: THREE.Vector2): string | null {
    if (!this.layout) return null;
    this.raycaster.setFromCamera(ndc, this.camera);
    const p = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.tablePlane, p)) return null;
    let best: LaidCard | null = null;
    for (const c of this.layout.cards) {
      const rad = (c.rotation * Math.PI) / 180;
      const dx = p.x - c.x;
      const dy = -p.z - c.y;
      const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
      const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
      if (Math.abs(lx) <= CARD_SIZE.width / 2 && Math.abs(ly) <= CARD_SIZE.height / 2 && (!best || c.elevation >= best.elevation)) best = c;
    }
    return best?.instanceId ?? null;
  }

  private handlePointer(ndc: THREE.Vector2, click: boolean): void {
    if (!this.inputEnabled) return;
    const handId = this.pickHand(ndc);
    if (handId) {
      this.setHover(handId, null);
      this.renderer.domElement.style.cursor = 'pointer';
      if (click) this.callbacks.onHandClick(handId);
      return;
    }
    const tableId = this.pickTable(ndc);
    this.setHover(null, tableId);
    this.renderer.domElement.style.cursor = tableId ? (this.marks.targets.has(tableId) ? 'crosshair' : 'zoom-in') : 'default';
    this.callbacks.onTableHover(tableId);
    if (click) this.callbacks.onTableClick(tableId);
  }

  private setHover(hand: string | null, table: string | null): void {
    if (hand !== this.hoverHand) {
      this.hoverHand = hand;
      this.layoutHand(true);
      this.callbacks.onHandHover(hand);
    }
    this.hoverTable = table;
    this.updateHighlights();
  }

  private readonly onPointerMove = (e: PointerEvent) => {
    this.pointerNdc = this.ndcFromEvent(e);
    this.handlePointer(this.pointerNdc, false);
  };

  private readonly onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    this.downAt = { x: e.clientX, y: e.clientY };
  };

  private readonly onPointerUp = (e: PointerEvent) => {
    if (e.button !== 0 || !this.downAt) return;
    const moved = Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y);
    this.downAt = null;
    if (moved > 6) return;
    this.pointerNdc = this.ndcFromEvent(e);
    this.handlePointer(this.pointerNdc, true);
  };

  private readonly onPointerLeave = () => {
    this.pointerNdc = null;
    this.setHover(null, null);
    this.callbacks.onTableHover(null);
  };

  private readonly onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoom = Math.min(1.8, Math.max(0.85, this.zoom * (e.deltaY > 0 ? 0.94 : 1.06)));
    this.fitCamera();
  };

  // ---------------------------------------------------------------- animation

  private tween(
    obj: THREE.Object3D,
    fromPos: THREE.Vector3,
    toPos: THREE.Vector3,
    fromQuat: THREE.Quaternion,
    toQuat: THREE.Quaternion,
    fromScale: number,
    toScale: number,
    duration = ANIM_MS,
    onDone?: () => void,
  ): void {
    this.cancelTweens(obj);
    obj.position.copy(fromPos);
    obj.quaternion.copy(fromQuat);
    obj.scale.setScalar(fromScale);
    const t: Tween = {
      obj,
      fromPos: fromPos.clone(),
      toPos: toPos.clone(),
      fromQuat: fromQuat.clone(),
      toQuat: toQuat.clone(),
      fromScale,
      toScale,
      start: performance.now(),
      duration,
      arc: obj.parent === this.scene && fromPos.distanceTo(toPos) > 1,
    };
    this.tweens.push(onDone ? { ...t, onDone } : t);
  }

  private cancelTweens(obj: THREE.Object3D): void {
    this.tweens = this.tweens.filter((t) => t.obj !== obj);
  }

  private finishTweens(): void {
    const tweens = this.tweens;
    this.tweens = [];
    for (const t of tweens) {
      t.obj.position.copy(t.toPos);
      t.obj.quaternion.copy(t.toQuat);
      t.obj.scale.setScalar(t.toScale);
      t.onDone?.();
    }
    for (const m of this.transients) this.scene.remove(m);
    this.transients = [];
  }

  private readonly frame = () => {
    const now = performance.now();
    if (this.tweens.length) {
      const done: Tween[] = [];
      for (const t of this.tweens) {
        const k = Math.min(1, (now - t.start) / t.duration);
        const e = easeInOut(k);
        t.obj.position.lerpVectors(t.fromPos, t.toPos, e);
        if (t.arc) t.obj.position.y += Math.sin(e * Math.PI) * 3;
        t.obj.quaternion.slerpQuaternions(t.fromQuat, t.toQuat, e);
        t.obj.scale.setScalar(t.fromScale + (t.toScale - t.fromScale) * e);
        if (k >= 1) done.push(t);
      }
      if (done.length) {
        this.tweens = this.tweens.filter((t) => !done.includes(t));
        for (const t of done) t.onDone?.();
      }
    }
    this.projectLabels();
    this.renderer.setViewport(0, 0, this.width, this.height);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.handScene, this.handCamera);
  };
}
