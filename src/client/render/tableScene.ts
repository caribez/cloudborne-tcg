/**
 * Three.js presentation of the table. Consumes PlayerViews and reports pointer
 * intentions through callbacks; it never changes game state. Animations are
 * cosmetic: every tween can be finished instantly (`clearTransient`) and input
 * handling never waits for them.
 *
 * World mapping: logical table (x, y) -> world (x, 0, -y). +y is the far side.
 * Two layers are rendered: the perspective table and an orthographic,
 * pixel-space hand layer along the bottom of the screen.
 */
import * as THREE from 'three';
import { CARD_SIZE, isInsideTable, resolvePlacement, TABLE_BOUNDS } from '../../shared/placement';
import type { PlayerView, ViewTableCard } from '../../shared/views';
import { cardBackCanvas, cardFrontCanvas } from './cardArt';

export interface TablePointer {
  /** Logical table point under the pointer, or null if off the table surface. */
  readonly point: { x: number; y: number } | null;
  /** Instance ids of table cards under the pointer, topmost first. */
  readonly cardsUnder: readonly string[];
}

export interface SceneCallbacks {
  onHandHover(instanceId: string | null): void;
  onHandClick(instanceId: string): void;
  onTableHover(info: TablePointer): void;
  onTableClick(info: TablePointer): void;
  onDeckHover(over: boolean): void;
  onDeckClick(): void;
}

const CARD_T = 0.04; // thickness
const STACK_STEP = 0.05; // vertical gap per table order
const DECK_POS = new THREE.Vector3(TABLE_BOUNDS.minX - 8.5, 0, 0);
const DECK_CARD_T = 0.07;
const HAND_FRACTION = 0.27; // share of the screen height reserved for the hand
const ANIM_MS = 380;

interface CardObj {
  readonly mesh: THREE.Mesh;
  readonly outline: THREE.Mesh;
  readonly defId: string;
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
  readonly onDone?: () => void;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const tableYaw = (deg: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (-deg * Math.PI) / 180);
const HAND_QUAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
const HAND_BACK_QUAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI).multiply(HAND_QUAT);

export class TableScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 1, 600);
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
    hover: new THREE.MeshBasicMaterial({ color: '#ffd54a', transparent: true, opacity: 0.95, depthWrite: false }),
    selected: new THREE.MeshBasicMaterial({ color: '#4fc3f7', transparent: true, opacity: 0.95, depthWrite: false }),
  };

  private readonly tableCards = new Map<string, CardObj>();
  private readonly handCards = new Map<string, CardObj>();
  private handOrder: string[] = [];
  private readonly deck: THREE.Mesh;
  private readonly deckOutline: THREE.Mesh;
  private readonly ghost: THREE.Mesh;
  private readonly ghostMaterial = new THREE.MeshBasicMaterial({ color: '#7cf29a', transparent: true, opacity: 0.45, depthWrite: false });
  private tweens: Tween[] = [];
  private transients: THREE.Object3D[] = [];

  private view: PlayerView | null = null;
  private width = 1;
  private height = 1;
  private zoom = 1;
  private hoverHand: string | null = null;
  private hoverTable: string | null = null;
  private hoverDeck = false;
  private selected: string | null = null;
  private ghostRotation = 0;
  private inputEnabled = true;
  private pointerNdc: THREE.Vector2 | null = null;
  private downAt: { x: number; y: number } | null = null;
  private readonly resizeObserver: ResizeObserver;

  constructor(
    private readonly container: HTMLElement,
    private readonly callbacks: SceneCallbacks,
    private readonly deckLabel?: HTMLElement,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.autoClear = false;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.classList.add('table-canvas');

    const backTex = this.texture(cardBackCanvas());
    this.backMaterial = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.85 });

    this.buildTable();
    this.deck = new THREE.Mesh(new THREE.BoxGeometry(CARD_SIZE.width, 1, CARD_SIZE.height), [
      this.edgeMaterial,
      this.edgeMaterial,
      this.backMaterial,
      this.edgeMaterial,
      this.edgeMaterial,
      this.edgeMaterial,
    ]);
    this.deck.castShadow = true;
    this.deck.position.copy(DECK_POS);
    this.scene.add(this.deck);
    this.deckOutline = new THREE.Mesh(this.outlineGeometry, this.outlineMaterials.hover);
    this.deckOutline.position.set(DECK_POS.x, 0.03, DECK_POS.z);
    this.deckOutline.visible = false;
    this.scene.add(this.deckOutline);

    this.ghost = new THREE.Mesh(new THREE.PlaneGeometry(CARD_SIZE.width, CARD_SIZE.height).rotateX(-Math.PI / 2), this.ghostMaterial);
    this.ghost.visible = false;
    this.ghost.renderOrder = 10;
    this.scene.add(this.ghost);

    this.scene.add(new THREE.HemisphereLight('#fff8ec', '#3a3a48', 1.6));
    const sun = new THREE.DirectionalLight('#ffffff', 1.6);
    sun.position.set(-25, 80, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -80;
    sc.right = 80;
    sc.top = 60;
    sc.bottom = -60;
    sc.near = 10;
    sc.far = 200;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);
    this.handCamera.position.set(0, 0, 2000); // hand cards sit at z ≈ 0–600, in front of the ray origin
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

  /** Shows a new view. Animates only when it plausibly follows the previous view for the same viewer. */
  setView(view: PlayerView, options: { animate: boolean }): void {
    const prev = this.view;
    const animate =
      options.animate && prev !== null && prev.viewer === view.viewer && view.revision > prev.revision && view.table.length >= prev.table.length;
    this.view = view;
    if (!animate) this.finishTweens();

    // Table cards
    const seen = new Set<string>();
    for (const card of view.table) {
      seen.add(card.instanceId);
      const existing = this.tableCards.get(card.instanceId);
      const target = this.tableTransform(card);
      if (existing) {
        existing.mesh.position.copy(target.pos);
        existing.mesh.quaternion.copy(target.quat);
        continue;
      }
      const obj = this.makeCard(card.faceUp ? card.defId : null, true);
      this.tableCards.set(card.instanceId, obj);
      this.scene.add(obj.mesh);
      const fromHand = this.handCards.get(card.instanceId);
      if (animate && fromHand) {
        const start = this.handToWorld(fromHand.mesh.position, fromHand.mesh.scale.x);
        this.tween(obj.mesh, start.pos, target.pos, start.quat, target.quat, 1, 1);
      } else if (animate) {
        const from = target.pos.clone().add(new THREE.Vector3(0, 14, -6));
        this.tween(obj.mesh, from, target.pos, target.quat, target.quat, 1.1, 1);
      } else {
        obj.mesh.position.copy(target.pos);
        obj.mesh.quaternion.copy(target.quat);
      }
    }
    for (const [id, obj] of this.tableCards) {
      if (!seen.has(id)) {
        this.scene.remove(obj.mesh);
        this.tableCards.delete(id);
      }
    }

    // Hand cards
    const handIds = view.hand.map((c) => c.instanceId);
    const drewOwn = animate && prev !== null && view.drawPileCount < prev.drawPileCount;
    for (const c of view.hand) {
      if (this.handCards.has(c.instanceId)) continue;
      const obj = this.makeCard(c.defId, false);
      this.handCards.set(c.instanceId, obj);
      this.handScene.add(obj.mesh);
      obj.mesh.userData.fresh = drewOwn;
    }
    for (const [id, obj] of this.handCards) {
      if (!handIds.includes(id)) {
        this.handScene.remove(obj.mesh);
        this.handCards.delete(id);
      }
    }
    this.handOrder = handIds;
    if (this.selected && !handIds.includes(this.selected)) this.selected = null;
    if (this.hoverHand && !handIds.includes(this.hoverHand)) this.hoverHand = null;
    if (this.hoverTable && !this.tableCards.has(this.hoverTable)) this.hoverTable = null;

    // Opponent draw: a card back flies from the deck to the far side.
    if (animate && prev && view.drawPileCount < prev.drawPileCount && !this.anyFresh()) {
      this.animateOpponentDraw();
    }
    this.layoutHand(animate);
    this.updateDeck(view.drawPileCount);
    this.updateHighlights();
  }

  /** Hides everything private and stops all animations immediately (hotseat handoff). */
  clearTransient(): void {
    this.finishTweens();
    this.selected = null;
    this.hoverHand = null;
    this.hoverTable = null;
    this.hoverDeck = false;
    this.ghost.visible = false;
    this.pointerNdc = null;
    this.downAt = null;
    this.updateHighlights();
  }

  setSelected(instanceId: string | null): void {
    this.selected = instanceId;
    this.layoutHand(true);
    this.updateHighlights();
    this.refreshPointer();
  }

  setGhostRotation(deg: number): void {
    this.ghostRotation = deg;
    this.refreshPointer();
  }

  setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled;
    this.renderer.domElement.style.pointerEvents = enabled ? 'auto' : 'none';
    if (!enabled) {
      this.hoverHand = null;
      this.hoverTable = null;
      this.hoverDeck = false;
      this.ghost.visible = false;
      this.downAt = null;
      this.layoutHand(false);
      this.updateHighlights();
      this.renderer.domElement.style.cursor = 'default';
    }
  }

  /** Highlights a table card chosen from the inspector's stack list. */
  setTableHighlight(instanceId: string | null): void {
    this.hoverTable = instanceId;
    this.updateHighlights();
  }

  /** Screen positions (CSS px) of interactive objects, for automated browser checks (`?e2e`). */
  debugScreenInfo(): { hand: { id: string; x: number; y: number }[]; table: { id: string; x: number; y: number }[]; deck: { x: number; y: number }; tweens: number } {
    const toCss = (ndc: THREE.Vector3) => ({ x: ((ndc.x + 1) / 2) * this.width, y: ((1 - ndc.y) / 2) * this.height });
    const hand = this.handOrder.map((id, i) => {
      const slot = this.handSlot(i, this.handOrder.length);
      return { id, x: slot.x + this.width / 2, y: this.height / 2 - slot.y };
    });
    const table = (this.view?.table ?? []).map((c) => ({ id: c.instanceId, ...toCss(new THREE.Vector3(c.x, 0, -c.y).project(this.camera)) }));
    const deck = toCss(new THREE.Vector3(DECK_POS.x, this.deck.position.y * 2, DECK_POS.z).project(this.camera));
    return { hand, table, deck, tweens: this.tweens.length };
  }

  /** Converts a logical table point to CSS pixels (for automated browser checks). */
  debugTablePointToScreen(x: number, y: number): { x: number; y: number } {
    const p = new THREE.Vector3(x, 0, -y).project(this.camera);
    return { x: ((p.x + 1) / 2) * this.width, y: ((1 - p.y) / 2) * this.height };
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

  private texture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    return tex;
  }

  private frontMaterial(defId: string): THREE.MeshStandardMaterial {
    let m = this.frontMaterials.get(defId);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ map: this.texture(cardFrontCanvas(defId)), roughness: 0.85 });
      this.frontMaterials.set(defId, m);
    }
    return m;
  }

  /** Box faces: +x, -x, +y (front), -y (back), +z, -z. */
  private makeCard(defId: string | null, onTable: boolean): CardObj {
    const front = defId && defId !== 'hidden' ? this.frontMaterial(defId) : this.backMaterial;
    const e = this.edgeMaterial;
    const mesh = new THREE.Mesh(this.cardGeometry, [e, e, front, this.backMaterial, e, e]);
    mesh.castShadow = onTable;
    mesh.receiveShadow = onTable;
    const outline = new THREE.Mesh(this.outlineGeometry, this.outlineMaterials.hover);
    outline.position.y = -CARD_T / 2 + 0.002;
    outline.visible = false;
    outline.renderOrder = -1;
    mesh.add(outline);
    return { mesh, outline, defId: defId ?? 'hidden' };
  }

  private buildTable(): void {
    const b = TABLE_BOUNDS;
    const w = b.maxX - b.minX;
    const h = b.maxY - b.minY;
    const wood = new THREE.Mesh(
      new THREE.BoxGeometry(w + 30, 2, h + 12),
      new THREE.MeshStandardMaterial({ color: '#5a4030', roughness: 0.8 }),
    );
    wood.position.set(-5, -1.02, 0);
    wood.receiveShadow = true;
    this.scene.add(wood);

    const felt = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#2f5b4b', roughness: 1 }));
    felt.position.set((b.minX + b.maxX) / 2, 0.001, -(b.minY + b.maxY) / 2);
    felt.receiveShadow = true;
    this.scene.add(felt);

    // Faint 8-unit grid and a crisp border so the bounded area is obvious.
    const grid: number[] = [];
    for (let x = b.minX + 8; x < b.maxX; x += 8) grid.push(x, 0.01, -b.minY, x, 0.01, -b.maxY);
    for (let y = b.minY + 8; y < b.maxY - 1; y += 8) grid.push(b.minX, 0.01, -y, b.maxX, 0.01, -y);
    const gridGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(grid, 3));
    this.scene.add(new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: '#4a7d69', transparent: true, opacity: 0.5 })));
    const border = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(b.minX, 0.012, -b.minY),
      new THREE.Vector3(b.maxX, 0.012, -b.minY),
      new THREE.Vector3(b.maxX, 0.012, -b.maxY),
      new THREE.Vector3(b.minX, 0.012, -b.maxY),
    ]);
    this.scene.add(new THREE.LineLoop(border, new THREE.LineBasicMaterial({ color: '#cfe8d8' })));

    // Draw pile mat
    const mat = new THREE.Mesh(
      new THREE.PlaneGeometry(CARD_SIZE.width + 2, CARD_SIZE.height + 2).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#3b2b20', roughness: 1 }),
    );
    mat.position.set(DECK_POS.x, 0.005, DECK_POS.z);
    mat.receiveShadow = true;
    this.scene.add(mat);
    this.scene.background = new THREE.Color('#1d2128');
  }

  private updateDeck(count: number): void {
    const height = Math.max(count, 0) * DECK_CARD_T;
    this.deck.visible = count > 0;
    this.deck.scale.y = Math.max(height, 0.001);
    this.deck.position.y = height / 2;
    this.deckOutline.position.y = 0.02;
  }

  // ---------------------------------------------------------------- layout

  private tableTransform(card: ViewTableCard): { pos: THREE.Vector3; quat: THREE.Quaternion } {
    return {
      pos: new THREE.Vector3(card.x, 0.06 + card.order * STACK_STEP + CARD_T / 2, -card.y),
      quat: tableYaw(card.rotation),
    };
  }

  private handMetrics() {
    const cardH = Math.max(110, Math.min(230, this.height * 0.21));
    const scale = cardH / CARD_SIZE.height;
    const cardW = CARD_SIZE.width * scale;
    const left = -this.width / 2 + 24;
    const right = this.width / 2 - Math.min(320, this.width * 0.28);
    const baseY = -this.height / 2 + cardH / 2 + 16;
    return { cardH, cardW, scale, left, right, baseY };
  }

  private handSlot(index: number, count: number) {
    const m = this.handMetrics();
    const avail = Math.max(m.cardW, m.right - m.left);
    const spacing = count > 1 ? Math.min(m.cardW + 14, (avail - m.cardW) / (count - 1)) : 0;
    const total = m.cardW + spacing * (count - 1);
    const startX = m.left + (avail - total) / 2 + m.cardW / 2;
    return { x: startX + spacing * index, y: m.baseY, z: index * 2, scale: m.scale, m };
  }

  /** Target placement of a hand card (pixels in the hand layer), including hover/selection lift. */
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
      const scale = t.scale;
      const target = new THREE.Vector3(t.x, t.y, t.z);
      if (obj.mesh.userData.fresh && animate) {
        obj.mesh.userData.fresh = false;
        const deckPx = this.worldToHand(new THREE.Vector3(DECK_POS.x, this.deck.position.y * 2, DECK_POS.z));
        this.tween(obj.mesh, deckPx, target, HAND_BACK_QUAT, HAND_QUAT, scale * 0.35, scale, ANIM_MS * 1.3);
      } else if (animate && obj.mesh.userData.placed) {
        this.tween(obj.mesh, obj.mesh.position.clone(), target, obj.mesh.quaternion.clone(), HAND_QUAT, obj.mesh.scale.x, scale, 140);
      } else {
        obj.mesh.userData.fresh = false;
        this.cancelTweens(obj.mesh);
        obj.mesh.position.copy(target);
        obj.mesh.quaternion.copy(HAND_QUAT);
        obj.mesh.scale.setScalar(scale);
      }
      obj.mesh.userData.placed = true;
    });
  }

  private updateHighlights(): void {
    for (const [id, obj] of this.handCards) {
      obj.outline.visible = id === this.selected || (id === this.hoverHand && this.inputEnabled);
      obj.outline.material = id === this.selected ? this.outlineMaterials.selected : this.outlineMaterials.hover;
    }
    for (const [id, obj] of this.tableCards) obj.outline.visible = id === this.hoverTable;
    this.deckOutline.visible = this.hoverDeck && this.inputEnabled && (this.view?.drawPileCount ?? 0) > 0;
  }

  private anyFresh(): boolean {
    for (const obj of this.handCards.values()) if (obj.mesh.userData.fresh) return true;
    return false;
  }

  private animateOpponentDraw(): void {
    const mesh = new THREE.Mesh(this.cardGeometry, [
      this.edgeMaterial,
      this.edgeMaterial,
      this.backMaterial,
      this.edgeMaterial,
      this.edgeMaterial,
      this.edgeMaterial,
    ]);
    this.scene.add(mesh);
    this.transients.push(mesh);
    const from = new THREE.Vector3(DECK_POS.x, this.deck.position.y * 2 + 0.5, DECK_POS.z);
    const to = new THREE.Vector3(DECK_POS.x + 20, 8, -TABLE_BOUNDS.maxY - 25);
    this.tween(mesh, from, to, new THREE.Quaternion(), tableYaw(25), 1, 0.6, ANIM_MS * 1.4, () => {
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

  /** Places the fixed tabletop camera so the table (and deck) fit in the band above the hand area. */
  private fitCamera(): void {
    const b = TABLE_BOUNDS;
    const corners = [
      new THREE.Vector3(DECK_POS.x - CARD_SIZE.width / 2 - 1, 0, -b.minY + 1),
      new THREE.Vector3(b.maxX + 1, 0, -b.minY + 1),
      new THREE.Vector3(DECK_POS.x - CARD_SIZE.width / 2 - 1, 0, -b.maxY - 1),
      new THREE.Vector3(b.maxX + 1, 0, -b.maxY - 1),
    ];
    const dir = new THREE.Vector3(0, 1.3, 0.9).normalize(); // camera ~55° above the table, on the near side
    const lookAt = new THREE.Vector3((DECK_POS.x - CARD_SIZE.width / 2 + b.maxX) / 2, 0, 0);
    const bottom = -1 + HAND_FRACTION * 2;
    const top = 1 - (52 / this.height) * 2; // keep clear of the top bar
    // Shift the projected image up so the table centres in [bottom, top].
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
        return Math.abs(p.x) <= 0.97 && p.y >= bottom && p.y <= top;
      });
    let d = 40;
    for (; d < 400; d += 2) {
      place(d);
      if (fits()) break;
    }
    place(d / this.zoom);
  }

  private worldToHand(world: THREE.Vector3): THREE.Vector3 {
    const p = world.clone().project(this.camera);
    return new THREE.Vector3((p.x * this.width) / 2, (p.y * this.height) / 2, 300);
  }

  /** A point in front of the table camera matching a hand-layer card's on-screen position and size. */
  private handToWorld(handPos: THREE.Vector3, handScale: number): { pos: THREE.Vector3; quat: THREE.Quaternion } {
    const ndc = new THREE.Vector3((handPos.x / this.width) * 2, (handPos.y / this.height) * 2, 0.5);
    const pxH = CARD_SIZE.height * handScale;
    const fov = (this.camera.fov * Math.PI) / 180;
    const dist = CARD_SIZE.height / (2 * Math.tan(fov / 2) * (pxH / this.height));
    const ray = ndc.unproject(this.camera).sub(this.camera.position).normalize();
    const pos = this.camera.position.clone().addScaledVector(ray, dist);
    // Face the camera: card +y towards camera, card "top" towards screen up.
    const quat = this.camera.quaternion.clone().multiply(HAND_QUAT);
    return { pos, quat };
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

  private pickTable(ndc: THREE.Vector2): { info: TablePointer; deck: boolean } {
    this.raycaster.setFromCamera(ndc, this.camera);
    const deckHit = this.deck.visible && this.raycaster.intersectObject(this.deck, false).length > 0;
    const point3 = new THREE.Vector3();
    const onPlane = this.raycaster.ray.intersectPlane(this.tablePlane, point3);
    const under: { id: string; order: number }[] = [];
    if (this.view) {
      // Use logical geometry (not mesh positions mid-animation) to decide what's under the pointer.
      if (onPlane) {
        for (const c of this.view.table) {
          const rad = (c.rotation * Math.PI) / 180;
          const dx = point3.x - c.x;
          const dy = -point3.z - c.y;
          // rotate into card space (rotation is clockwise seen from above)
          const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
          const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
          if (Math.abs(lx) <= CARD_SIZE.width / 2 && Math.abs(ly) <= CARD_SIZE.height / 2) under.push({ id: c.instanceId, order: c.order });
        }
      }
    }
    under.sort((a, b) => b.order - a.order);
    const point = onPlane && Math.abs(point3.x) < 70 && Math.abs(point3.z) < 45 ? { x: point3.x, y: -point3.z } : null;
    return { info: { point, cardsUnder: under.map((u) => u.id) }, deck: deckHit };
  }

  private refreshPointer(): void {
    if (this.pointerNdc) this.handlePointer(this.pointerNdc, false);
    else this.ghost.visible = false;
  }

  private handlePointer(ndc: THREE.Vector2, click: boolean): void {
    if (!this.inputEnabled) return;
    const handId = this.pickHand(ndc);
    if (handId) {
      this.setHover(handId, null, false);
      this.ghost.visible = false;
      this.renderer.domElement.style.cursor = 'pointer';
      if (click) this.callbacks.onHandClick(handId);
      return;
    }
    const { info, deck } = this.pickTable(ndc);
    if (deck && !this.selected) {
      this.setHover(null, null, true);
      this.ghost.visible = false;
      this.renderer.domElement.style.cursor = 'pointer';
      if (click) this.callbacks.onDeckClick();
      return;
    }
    this.setHover(null, this.selected ? null : (info.cardsUnder[0] ?? null), false);
    this.updateGhost(info);
    this.renderer.domElement.style.cursor = this.selected && info.point ? 'crosshair' : info.cardsUnder.length ? 'zoom-in' : 'default';
    this.callbacks.onTableHover(info);
    if (click) this.callbacks.onTableClick(info);
  }

  private setHover(hand: string | null, table: string | null, deck: boolean): void {
    const handChanged = hand !== this.hoverHand;
    if (handChanged) {
      this.hoverHand = hand;
      this.layoutHand(true);
      this.callbacks.onHandHover(hand);
    }
    if (deck !== this.hoverDeck) {
      this.hoverDeck = deck;
      this.callbacks.onDeckHover(deck);
    }
    this.hoverTable = table;
    this.updateHighlights();
  }

  private updateGhost(info: TablePointer): void {
    if (!this.selected || !info.point) {
      this.ghost.visible = false;
      return;
    }
    const inside = isInsideTable(info.point.x, info.point.y);
    const p = resolvePlacement({ x: info.point.x, y: info.point.y, rotation: this.ghostRotation });
    this.ghost.visible = true;
    this.ghost.position.set(p.x, 0.05 + ((this.view?.table.length ?? 0) + 1) * STACK_STEP + CARD_T + 0.02, -p.y);
    this.ghost.quaternion.copy(tableYaw(p.rotation));
    this.ghostMaterial.color.set(inside ? '#7cf29a' : '#ff7a7a');
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
    this.ghost.visible = false;
    this.setHover(null, null, false);
    this.callbacks.onTableHover({ point: null, cardsUnder: [] });
  };

  private readonly onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoom = Math.min(1.6, Math.max(0.8, this.zoom * (e.deltaY > 0 ? 0.94 : 1.06)));
    this.fitCamera();
    this.refreshPointer();
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
    const t: Tween = { obj, fromPos: fromPos.clone(), toPos: toPos.clone(), fromQuat: fromQuat.clone(), toQuat: toQuat.clone(), fromScale, toScale, start: performance.now(), duration };
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
        if (t.fromPos.distanceTo(t.toPos) > 1 && t.obj.parent === this.scene) t.obj.position.y += Math.sin(e * Math.PI) * 3; // small arc
        t.obj.quaternion.slerpQuaternions(t.fromQuat, t.toQuat, e);
        t.obj.scale.setScalar(t.fromScale + (t.toScale - t.fromScale) * e);
        if (k >= 1) done.push(t);
      }
      if (done.length) {
        this.tweens = this.tweens.filter((t) => !done.includes(t));
        for (const t of done) t.onDone?.();
      }
    }
    if (this.deckLabel) {
      const p = new THREE.Vector3(DECK_POS.x, 0, DECK_POS.z + CARD_SIZE.height / 2 + 1.5).project(this.camera);
      this.deckLabel.style.transform = `translate(${((p.x + 1) / 2) * this.width}px, ${((1 - p.y) / 2) * this.height}px) translate(-50%, 0)`;
    }
    this.renderer.setViewport(0, 0, this.width, this.height);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.handScene, this.handCamera);
  };
}
