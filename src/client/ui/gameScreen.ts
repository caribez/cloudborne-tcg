/**
 * The in-game screen shared by hotseat and LAN: HTML HUD + the Three.js table.
 * It holds presentation-only state (selection, rotation, inspection) and
 * submits intentions through the adapter. It never edits game state.
 */
import { getCardDefinition, SUITS } from '../../shared/cards';
import { describeLogEntry } from '../../shared/logText';
import { normaliseRotation, ROTATION_STEP_DEG } from '../../shared/placement';
import type { GameAction } from '../../shared/types';
import type { PlayerView } from '../../shared/views';
import { cardFrontDataUrl } from '../render/cardArt';
import { TableScene, type TablePointer } from '../render/tableScene';
import type { SubmitResult } from '../session/types';
import { el, esc } from './dom';

export interface GameScreenOptions {
  readonly modeLabel: string;
  readonly submit: (action: GameAction) => Promise<SubmitResult> | SubmitResult;
}

/** Per-seat decorations supplied by the mode (LAN: connection, host). */
export interface SeatDecor {
  readonly connected?: boolean;
  readonly host?: boolean;
}

type Inspect = { kind: 'hand' | 'table'; instanceId: string };

export class GameScreen {
  readonly root: HTMLElement;
  private readonly scene: TableScene;
  private readonly els: {
    players: HTMLElement;
    conn: HTMLElement;
    tools: HTMLElement;
    banner: HTMLElement;
    inspector: HTMLElement;
    log: HTMLOListElement;
    status: HTMLElement;
    hint: HTMLElement;
    draw: HTMLButtonElement;
    end: HTMLButtonElement;
    selection: HTMLElement;
    toast: HTMLElement;
    deckLabel: HTMLElement;
    handNote: HTMLElement;
  };
  private view: PlayerView | null = null;
  private decor: readonly SeatDecor[] = [];
  private selected: string | null = null;
  private rotation = 0;
  private hovered: Inspect | null = null;
  private pinned: Inspect | null = null;
  private stack: readonly string[] = [];
  private stackIndex = 0;
  private busy = false;
  private blockedReason: string | null = null;
  private locked = false;
  private toastTimer = 0;
  private youLabel = 'you';

  constructor(
    host: HTMLElement,
    private readonly options: GameScreenOptions,
  ) {
    this.root = el('div', 'game');
    this.root.innerHTML = `
      <div class="scene-host"></div>
      <div class="deck-label" aria-hidden="true"><span class="deck-count">0</span><small>draw pile</small></div>
      <header class="topbar">
        <div class="brand">Cloudborne <span class="mode-tag">${esc(options.modeLabel)}</span></div>
        <div class="players" aria-label="Players"></div>
        <div class="conn" aria-live="polite"></div>
        <div class="tools"></div>
      </header>
      <div class="banner" role="status" hidden></div>
      <aside class="inspector" aria-live="polite" hidden></aside>
      <aside class="log"><details open><summary>Log</summary><ol></ol></details></aside>
      <div class="hand-note" hidden></div>
      <section class="actionbar" aria-label="Turn actions">
        <div class="turn-status"></div>
        <div class="hint"></div>
        <div class="buttons">
          <button class="btn draw" type="button" title="Draw the top card (D)">Draw card</button>
          <button class="btn primary end" type="button">End turn</button>
        </div>
        <div class="selection" hidden></div>
        <div class="keys">Click a hand card, then the table to play it · Q/E rotate · Esc cancel · scroll to zoom</div>
      </section>
      <div class="toast" role="alert" hidden></div>
    `;
    host.appendChild(this.root);
    const q = <T extends HTMLElement>(sel: string) => this.root.querySelector(sel) as T;
    this.els = {
      players: q('.players'),
      conn: q('.conn'),
      tools: q('.tools'),
      banner: q('.banner'),
      inspector: q('.inspector'),
      log: q('.log ol'),
      status: q('.turn-status'),
      hint: q('.hint'),
      draw: q('.draw'),
      end: q('.end'),
      selection: q('.selection'),
      toast: q('.toast'),
      deckLabel: q('.deck-label'),
      handNote: q('.hand-note'),
    };

    this.scene = new TableScene(
      q('.scene-host'),
      {
        onHandHover: (id) => this.setHovered(id ? { kind: 'hand', instanceId: id } : null),
        onHandClick: (id) => this.onHandClick(id),
        onTableHover: (info) => this.onTableHover(info),
        onTableClick: (info) => this.onTableClick(info),
        onDeckHover: () => {},
        onDeckClick: () => void this.act({ type: 'draw' }),
      },
      this.els.deckLabel,
    );

    this.els.draw.addEventListener('click', () => void this.act({ type: 'draw' }));
    this.els.end.addEventListener('click', () => void this.act({ type: 'endTurn' }));
    this.els.selection.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-cancel]')) this.cancelSelection();
      if (t.closest('[data-rot="-1"]')) this.rotate(-1);
      if (t.closest('[data-rot="1"]')) this.rotate(1);
    });
    this.els.inspector.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-stack-index]');
      if (t) {
        this.stackIndex = Number(t.dataset.stackIndex);
        const id = this.stack[this.stackIndex];
        if (id) this.pin({ kind: 'table', instanceId: id });
      }
      if ((e.target as HTMLElement).closest('[data-unpin]')) this.unpin();
    });
    window.addEventListener('keydown', this.onKey);
    // Opt-in hook for automated browser checks (scripts/e2e-*.mjs). Positions only.
    if (new URLSearchParams(location.search).has('e2e')) {
      (window as unknown as { __cloudborne?: unknown }).__cloudborne = {
        screen: () => this.scene.debugScreenInfo(),
        tablePoint: (x: number, y: number) => this.scene.debugTablePointToScreen(x, y),
      };
    }
  }

  // ---------------------------------------------------------------- mode-facing API

  addTool(label: string, onClick: () => void, title = ''): HTMLButtonElement {
    const b = el('button', 'btn small') as HTMLButtonElement;
    b.type = 'button';
    b.textContent = label;
    if (title) b.title = title;
    b.addEventListener('click', onClick);
    this.els.tools.appendChild(b);
    return b;
  }

  showView(view: PlayerView, opts: { animate: boolean; decor?: readonly SeatDecor[]; youLabel?: string }): void {
    this.view = view;
    this.decor = opts.decor ?? [];
    if (opts.youLabel) this.youLabel = opts.youLabel;
    if (this.selected && !view.hand.some((c) => c.instanceId === this.selected)) this.selected = null;
    if (this.pinned && !this.cardExists(this.pinned)) this.pinned = null;
    if (this.hovered && !this.cardExists(this.hovered)) this.hovered = null;
    this.scene.setView(view, { animate: opts.animate });
    this.scene.setSelected(this.selected);
    this.render();
  }

  /** Disconnected / paused: input disabled with an explanation. */
  setBlocked(reason: string | null): void {
    this.blockedReason = reason;
    if (reason) this.cancelSelection();
    this.applyInputState();
    this.render();
  }

  /** Hotseat privacy: drop everything private immediately and stop all input. */
  setPrivacyLock(locked: boolean): void {
    this.locked = locked;
    if (locked) this.clearPrivate();
    this.applyInputState();
  }

  clearPrivate(): void {
    this.selected = null;
    this.rotation = 0;
    this.hovered = null;
    this.pinned = null;
    this.stack = [];
    this.scene.clearTransient();
    this.scene.setGhostRotation(0);
    this.hideToast();
    this.renderInspector();
    this.renderSelection();
  }

  setConnection(text: string, kind: 'ok' | 'warn' | 'bad'): void {
    this.els.conn.textContent = text;
    this.els.conn.dataset.kind = kind;
  }

  flash(message: string, kind: 'error' | 'info' = 'error'): void {
    const t = this.els.toast;
    t.textContent = message;
    t.dataset.kind = kind;
    t.hidden = false;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (t.hidden = true), kind === 'error' ? 4500 : 2500);
  }

  private hideToast(): void {
    window.clearTimeout(this.toastTimer);
    this.els.toast.hidden = true;
  }

  setHandNote(text: string | null): void {
    this.els.handNote.hidden = !text;
    this.els.handNote.textContent = text ?? '';
  }

  dispose(): void {
    delete (window as unknown as { __cloudborne?: unknown }).__cloudborne;
    window.removeEventListener('keydown', this.onKey);
    window.clearTimeout(this.toastTimer);
    this.scene.dispose();
    this.root.remove();
  }

  // ---------------------------------------------------------------- interaction

  private get inputAllowed(): boolean {
    return !this.locked && !this.blockedReason;
  }

  private applyInputState(): void {
    this.scene.setInputEnabled(this.inputAllowed);
    this.renderButtons();
  }

  private async act(action: GameAction): Promise<boolean> {
    if (!this.inputAllowed || this.busy) return false;
    this.busy = true;
    this.renderButtons();
    try {
      const result = await this.options.submit(action);
      if (!result.ok) {
        this.flash(result.message);
        return false;
      }
      if (action.type === 'play') this.cancelSelection();
      return true;
    } finally {
      this.busy = false;
      this.renderButtons();
    }
  }

  private onHandClick(id: string): void {
    if (!this.inputAllowed) return;
    this.unpin();
    if (this.selected === id) {
      this.cancelSelection();
      return;
    }
    this.selected = id;
    this.rotation = 0;
    this.scene.setGhostRotation(0);
    this.scene.setSelected(id);
    if (this.view && !this.view.can.play) {
      this.flash(
        this.view.activeSeat !== this.view.viewer
          ? `You can look at this card, but it's ${this.view.players[this.view.activeSeat]?.name}'s turn.`
          : 'You have already played a card this turn.',
        'info',
      );
    }
    this.renderSelection();
    this.renderInspector();
  }

  private onTableHover(info: TablePointer): void {
    const top = info.cardsUnder[0];
    if (!this.selected && top) {
      this.setHovered({ kind: 'table', instanceId: top }, info.cardsUnder);
    } else if (this.hovered?.kind === 'table') {
      this.setHovered(null);
    }
  }

  private onTableClick(info: TablePointer): void {
    if (!this.inputAllowed) return;
    if (this.selected) {
      if (!info.point) return;
      void this.act({ type: 'play', cardId: this.selected, x: info.point.x, y: info.point.y, rotation: this.rotation });
      return;
    }
    if (info.cardsUnder.length) {
      // Repeated clicks on the same overlapping pile cycle through it.
      const same = this.stack.length === info.cardsUnder.length && this.stack.every((id, i) => id === info.cardsUnder[i]);
      this.stackIndex = same && this.pinned ? (this.stackIndex + 1) % info.cardsUnder.length : 0;
      this.stack = info.cardsUnder;
      this.pin({ kind: 'table', instanceId: this.stack[this.stackIndex]! });
    } else {
      this.unpin();
    }
  }

  private setHovered(target: Inspect | null, stack?: readonly string[]): void {
    this.hovered = target;
    if (stack && !this.pinned) this.stack = stack;
    this.renderInspector();
  }

  private pin(target: Inspect): void {
    this.pinned = target;
    if (target.kind === 'table') this.scene.setTableHighlight(target.instanceId);
    this.renderInspector();
  }

  private unpin(): void {
    if (!this.pinned) return;
    this.pinned = null;
    this.scene.setTableHighlight(null);
    this.renderInspector();
  }

  private cancelSelection(): void {
    if (!this.selected) return;
    this.selected = null;
    this.rotation = 0;
    this.scene.setGhostRotation(0);
    this.scene.setSelected(null);
    this.renderSelection();
    this.renderInspector();
  }

  private rotate(dir: 1 | -1): void {
    if (!this.selected) return;
    this.rotation = normaliseRotation(this.rotation + dir * ROTATION_STEP_DEG);
    this.scene.setGhostRotation(this.rotation);
    this.renderSelection();
  }

  private readonly onKey = (e: KeyboardEvent) => {
    if (this.locked) return; // nothing may reach the table behind a privacy screen
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if (e.key === 'Escape') {
      if (this.selected) this.cancelSelection();
      else this.unpin();
      return;
    }
    if (!this.inputAllowed || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'q') this.rotate(-1);
    else if (k === 'e') this.rotate(1);
    else if (k === 'd') void this.act({ type: 'draw' });
  };

  // ---------------------------------------------------------------- rendering

  private cardExists(t: Inspect): boolean {
    if (!this.view) return false;
    return t.kind === 'hand'
      ? this.view.hand.some((c) => c.instanceId === t.instanceId)
      : this.view.table.some((c) => c.instanceId === t.instanceId);
  }

  private render(): void {
    const v = this.view;
    if (!v) return;
    const active = v.players[v.activeSeat];
    this.els.players.innerHTML = v.players
      .map((p) => {
        const d = this.decor[p.seat] ?? {};
        const classes = ['player', p.seat === v.activeSeat ? 'active' : '', p.seat === v.viewer ? 'me' : '', d.connected === false ? 'away' : '']
          .filter(Boolean)
          .join(' ');
        return `<div class="${classes}">
          ${d.connected === undefined ? '' : `<span class="dot" title="${d.connected ? 'Connected' : 'Disconnected'}"></span>`}
          <span class="pname">${esc(p.name)}${p.seat === v.viewer ? ` <em>(${esc(this.youLabel)})</em>` : ''}${d.host ? ' <span class="host" title="Lobby host">host</span>' : ''}</span>
          <span class="count" title="Cards in hand">${p.handCount} ${p.handCount === 1 ? 'card' : 'cards'}</span>
          ${p.seat === v.activeSeat ? '<span class="turn-tag">turn</span>' : ''}
        </div>`;
      })
      .join('');
    (this.els.deckLabel.querySelector('.deck-count') as HTMLElement).textContent = String(v.drawPileCount);
    this.els.deckLabel.classList.toggle('empty', v.drawPileCount === 0);

    const yours = v.viewer !== null && v.viewer === v.activeSeat;
    this.els.status.innerHTML = `Turn ${v.turnNumber} · ${yours ? '<strong>Your turn</strong>' : `${esc(active?.name ?? '')}'s turn`}`;
    this.els.hint.textContent = this.blockedReason ?? (yours ? v.hint : v.viewer !== null ? 'Waiting for your turn. You can inspect cards meanwhile.' : '');
    this.els.banner.hidden = !this.blockedReason;
    this.els.banner.textContent = this.blockedReason ?? '';

    this.els.log.innerHTML = v.log
      .slice(-12)
      .map((e) => `<li>${esc(describeLogEntry(e, v.players))}</li>`)
      .join('');
    this.els.log.scrollTop = this.els.log.scrollHeight;
    this.renderButtons();
    this.renderSelection();
    this.renderInspector();
  }

  private renderButtons(): void {
    const v = this.view;
    const ok = this.inputAllowed && !this.busy && v !== null;
    this.els.draw.disabled = !(ok && v!.can.draw);
    this.els.end.disabled = !(ok && v!.can.endTurn);
    this.els.draw.title = v && v.drawPileCount === 0 ? 'The draw pile is empty' : 'Draw the top card (D)';
  }

  private renderSelection(): void {
    const s = this.els.selection;
    if (!this.selected || !this.view) {
      s.hidden = true;
      return;
    }
    const card = this.view.hand.find((c) => c.instanceId === this.selected);
    if (!card) {
      s.hidden = true;
      return;
    }
    s.hidden = false;
    s.innerHTML = `
      <div>Placing <strong>${esc(getCardDefinition(card.defId).name)}</strong> · click the table</div>
      <div class="row">
        <button class="btn small" data-rot="-1" type="button" title="Rotate left (Q)">⟲ Q</button>
        <span class="rot">${this.rotation}°</span>
        <button class="btn small" data-rot="1" type="button" title="Rotate right (E)">E ⟳</button>
        <button class="btn small danger" data-cancel type="button">Cancel (Esc)</button>
      </div>`;
  }

  private renderInspector(): void {
    const box = this.els.inspector;
    const v = this.view;
    // Priority: hovering a hand card > a pinned (clicked) table card > hovering the table > the selection.
    const handHover = this.hovered?.kind === 'hand' ? this.hovered : null;
    const target = handHover ?? this.pinned ?? this.hovered ?? (this.selected ? { kind: 'hand' as const, instanceId: this.selected } : null);
    if (!v || !target || !this.cardExists(target)) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    const defId =
      target.kind === 'hand'
        ? v.hand.find((c) => c.instanceId === target.instanceId)!.defId
        : v.table.find((c) => c.instanceId === target.instanceId)!.defId;
    if (defId === 'hidden') {
      box.hidden = true;
      return;
    }
    const def = getCardDefinition(defId);
    let where = 'In your hand';
    if (target.kind === 'table') {
      const t = v.table.find((c) => c.instanceId === target.instanceId)!;
      where = `On the table · played by ${esc(v.players[t.playedBy]?.name ?? '?')} · ${t.rotation}°`;
    }
    const showStack = target.kind === 'table' && this.stack.length > 1 && this.stack.includes(target.instanceId);
    box.hidden = false;
    box.innerHTML = `
      <img class="card-image" alt="${esc(def.name)}" src="${cardFrontDataUrl(defId)}" />
      <div class="meta">
        <h3>${esc(def.name)}</h3>
        <div class="sub" style="--suit:${SUITS[def.suit].color}">${esc(SUITS[def.suit].name)} · value ${def.value}</div>
        <p>${esc(def.text)}</p>
        <div class="where">${where}</div>
        ${
          showStack
            ? `<div class="stack"><div>${this.stack.length} overlapping cards here (top first). Click the pile again to cycle, or pick:</div>
               <ol>${this.stack
                 .map((id, i) => {
                   const c = v.table.find((t) => t.instanceId === id);
                   const name = c && c.defId !== 'hidden' ? getCardDefinition(c.defId).name : 'Face-down card';
                   return `<li><button type="button" class="linkish ${id === target.instanceId ? 'current' : ''}" data-stack-index="${i}">${esc(name)}</button></li>`;
                 })
                 .join('')}</ol></div>`
            : ''
        }
        ${this.pinned && target === this.pinned ? '<button type="button" class="btn small" data-unpin>Close (Esc)</button>' : ''}
      </div>`;
  }
}
