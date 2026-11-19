/**
 * The in-game screen shared by hotseat and LAN: HTML HUD + the Three.js table.
 * It holds presentation-only state (selection, chosen target, inspection) and
 * submits typed intentions through the adapter. It never edits game state and
 * encodes no rules: playability, reasons and legal targets come from the view.
 */
import { getCardDefinition, type CardDefinition } from '../../shared/cards';
import { marriageOptionText, rulesLines, STANDING_ABBR, typeLine } from '../../shared/cardText';
import { describeLogEntry } from '../../shared/logText';
import type { GameAction, LogEntry, PlayTarget, Seat } from '../../shared/types';
import { HIDDEN, type PlayerView, type ViewHandCard, type ViewScheme } from '../../shared/views';
import { cardColor, cardImageUrl } from '../render/cardArt';
import { SEAT_COLORS, TableScene } from '../render/tableScene';
import type { SubmitResult } from '../session/types';
import { el, esc } from './dom';
import { audioManager } from '../audio/audioManager';

export interface GameScreenOptions {
  readonly modeLabel: string;
  readonly submit: (action: GameAction) => Promise<SubmitResult> | SubmitResult;
}

/** Per-seat decorations supplied by the mode (LAN: connection, host). */
export interface SeatDecor {
  readonly connected?: boolean;
  readonly host?: boolean;
}

export interface ResultAction {
  readonly label: string;
  readonly onClick: () => void;
  readonly primary?: boolean;
}

type Inspect = { readonly kind: 'hand' | 'table'; readonly instanceId: string };

/** Log kinds worth a brief on-screen notice when they are new to this viewer. */
const NOTABLE = new Set<LogEntry['kind']>(['challenge', 'response', 'allow', 'schemeRevealed', 'schemeSucceeded', 'marriage', 'gameOver']);

const CARD_PLAY_EVENTS = new Set<LogEntry['kind']>([
  'recruit',
  'schemePlaced',
  'challenge',
  'response',
  'marriage',
]);

const sameTarget = (a: PlayTarget | null, b: PlayTarget | null) => JSON.stringify(a) === JSON.stringify(b);

export class GameScreen {
  readonly root: HTMLElement;
  private readonly scene: TableScene;
private readonly audio = audioManager;
  private readonly els: {
    status: HTMLElement;
    conn: HTMLElement;
    tools: HTMLElement;
    banner: HTMLElement;
    inspector: HTMLElement;
    log: HTMLOListElement;
    turn: HTMLElement;
    hint: HTMLElement;
    decision: HTMLElement;
    selection: HTMLElement;
    end: HTMLButtonElement;
    toast: HTMLElement;
    plates: HTMLElement;
    deckLabel: HTMLElement;
    discardLabel: HTMLElement;
    results: HTMLElement;
  };
  private view: PlayerView | null = null;
  private decor: readonly SeatDecor[] = [];
  private anchor: Seat = 0;
  private selected: string | null = null;
  private target: PlayTarget | null = null;
  private marriagePick: { childId?: string; characterId?: string } = {};
  private hovered: Inspect | null = null;
  private pinned: string | null = null;
  private busy = false;
  private blockedReason: string | null = null;
  private locked = false;
  private toastTimer = 0;
  private youLabel = 'you';
  private lastSeenSeq = -1;
  private resultActions: readonly ResultAction[] = [];
  private resultsHidden = false;
  private plateEls = new Map<Seat, HTMLElement>();

  constructor(
    host: HTMLElement,
    private readonly options: GameScreenOptions,
  ) {
    this.root = el('div', 'game');
    this.root.innerHTML = `
      <div class="scene-host"></div>
      <div class="plates" aria-label="Families"></div>
      <div class="pile-label deck-label" aria-hidden="true"></div>
      <div class="pile-label discard-label" aria-hidden="true"></div>
      <header class="topbar">
        <div class="brand">Cloudborne <span class="mode-tag">${esc(options.modeLabel)}</span></div>
        <div class="status" aria-live="polite"></div>
        <div class="conn" aria-live="polite"></div>
        <div class="tools"></div>
      </header>
      <div class="banner" role="status" hidden></div>
      <aside class="inspector" aria-live="polite" hidden></aside>
      <aside class="log"><details open><summary>Event log</summary><ol></ol></details></aside>
      <section class="actionbar" aria-label="Turn actions">
        <div class="turn-status"></div>
        <div class="hint"></div>
        <div class="decision" hidden></div>
        <div class="selection" hidden></div>
        <button class="btn primary end-turn" type="button">End turn</button>
        <div class="keys">Click a hand card to select it · Esc cancels · scroll to zoom</div>
      </section>
      <div class="results" hidden></div>
      <div class="toast" role="alert" hidden></div>
    `;
    host.appendChild(this.root);
    const q = <T extends HTMLElement>(sel: string) => this.root.querySelector(sel) as T;
    this.els = {
      status: q('.status'),
      conn: q('.conn'),
      tools: q('.tools'),
      banner: q('.banner'),
      inspector: q('.inspector'),
      log: q('.log ol'),
      turn: q('.turn-status'),
      hint: q('.hint'),
      decision: q('.decision'),
      selection: q('.selection'),
      end: q('.end-turn'),
      toast: q('.toast'),
      plates: q('.plates'),
      deckLabel: q('.deck-label'),
      discardLabel: q('.discard-label'),
      results: q('.results'),
    };

    this.scene = new TableScene(q('.scene-host'), {
      onHandHover: (id) => this.setHovered(id ? { kind: 'hand', instanceId: id } : null),
      onHandClick: (id) => this.onHandClick(id),
      onTableHover: (id) => this.setHovered(id ? { kind: 'table', instanceId: id } : null),
      onTableClick: (id) => this.onTableClick(id),
    });
    this.scene.setLabel('deck', this.els.deckLabel);
    this.scene.setLabel('discard', this.els.discardLabel);
    this.updateHandInset();
    window.addEventListener('resize', this.updateHandInset);

    this.els.end.addEventListener('click', () => void this.act({ type: 'endTurn' }));
    this.els.selection.addEventListener('click', (e) => this.onPanelClick(e));
    this.els.decision.addEventListener('click', (e) => this.onPanelClick(e));
    this.els.selection.addEventListener('mouseover', (e) => this.onPanelHover(e));
    this.els.selection.addEventListener('mouseout', () => this.scene.setTableHighlight(null));
    this.els.plates.addEventListener('click', (e) => {
      const plate = (e.target as HTMLElement).closest<HTMLElement>('[data-seat]');
      if (plate && plate.classList.contains('targetable')) this.chooseTarget({ kind: 'seat', seat: Number(plate.dataset.seat) });
    });
    this.els.inspector.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-unpin]')) this.unpin();
    });
    this.els.results.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const b = t.closest<HTMLElement>('[data-result-action]');
      if (b) this.resultActions[Number(b.dataset.resultAction)]?.onClick();
      if (t.closest('[data-close-results]')) {
        this.resultsHidden = true;
        this.renderResults();
      }
    });
    window.addEventListener('keydown', this.onKey);
    // Opt-in hook for automated browser checks (scripts/e2e-*.mjs). Only what the view already shows.
    if (new URLSearchParams(location.search).has('e2e')) {
      (window as unknown as { __cloudborne?: unknown }).__cloudborne = {
        screen: () => this.scene.debugScreenInfo(),
        view: () => (this.view ? { viewer: this.view.viewer, revision: this.view.revision, phase: this.view.phase, decisionSeat: this.view.decisionSeat, round: this.view.round } : null),
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

showView(
  view: PlayerView,
  opts: {
    animate: boolean;
    decor?: readonly SeatDecor[];
    youLabel?: string;
    playSounds?: boolean;
  },
): void {
  const previousSeq = this.view?.log.at(-1)?.seq;

  if (previousSeq !== undefined && opts.playSounds !== false) {
    const newEvents = view.log.filter(
      (event) => event.seq > previousSeq
    );

    for (const event of newEvents) {
      if (CARD_PLAY_EVENTS.has(event.kind)) {
        this.audio.playCard();
      }
    }
  }

  this.view = view;
    this.decor = opts.decor ?? this.decor;
    if (opts.youLabel) this.youLabel = opts.youLabel;
    if (view.viewer !== null) this.anchor = view.viewer;
    // Drop presentation state that no longer matches the view.
    const sel = this.selectedCard();
    if (this.selected && (!sel || (this.target && !sel.targets?.some((t) => sameTarget(t, this.target))))) this.cancelSelection(false);
    if (this.pinned && !this.tableCardExists(this.pinned)) this.pinned = null;
    if (this.hovered && !this.cardExists(this.hovered)) this.hovered = null;
    if (!view.result) this.resultsHidden = false;
    this.scene.setView(view, { animate: opts.animate, anchor: this.anchor });
    this.scene.setSelected(this.selected);
    this.announceNew();
    this.render();
  }

  /** Disconnected / paused: input disabled with an explanation. */
  setBlocked(reason: string | null): void {
    if (reason === this.blockedReason) return;
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
    this.render();
  }

  clearPrivate(): void {
    this.selected = null;
    this.target = null;
    this.marriagePick = {};
    this.hovered = null;
    this.pinned = null;
    this.scene.clearTransient();
    this.hideToast();
    this.els.decision.hidden = true;
    this.els.decision.innerHTML = '';
    this.renderInspector();
    this.renderSelection();
  }

  setConnection(text: string, kind: 'ok' | 'warn' | 'bad'): void {
    this.els.conn.textContent = text;
    this.els.conn.dataset.kind = kind;
  }

  /** Buttons on the final results screen (restart, menu, ...), supplied by the mode. */
  setResultActions(actions: readonly ResultAction[]): void {
    this.resultActions = actions;
    this.renderResults();
  }

  flash(message: string, kind: 'error' | 'info' = 'error', ms?: number): void {
    const t = this.els.toast;
    t.innerHTML = message
      .split('\n')
      .map((line) => `<div>${esc(line)}</div>`)
      .join('');
    t.dataset.kind = kind;
    t.hidden = false;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (t.hidden = true), ms ?? (kind === 'error' ? 4500 : 3000));
  }

  private hideToast(): void {
    window.clearTimeout(this.toastTimer);
    this.els.toast.hidden = true;
  }

  dispose(): void {
    delete (window as unknown as { __cloudborne?: unknown }).__cloudborne;
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.updateHandInset);
    window.clearTimeout(this.toastTimer);
    this.scene.dispose();
    this.root.remove();
  }

  // ---------------------------------------------------------------- interaction

  private get inputAllowed(): boolean {
    return !this.locked && !this.blockedReason;
  }

  private readonly updateHandInset = () => this.scene.setHandLeftInset(window.innerWidth > 900 ? 282 : 24);

  private applyInputState(): void {
    this.scene.setInputEnabled(this.inputAllowed);
    this.renderButtons();
  }

  private selectedCard(): ViewHandCard | null {
    return (this.selected && this.view?.hand.find((c) => c.instanceId === this.selected)) || null;
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
      if (action.type === 'play' && action.cardId === this.selected) this.cancelSelection();
      return true;
    } finally {
      this.busy = false;
      this.renderButtons();
      this.renderSelection();
    }
  }

private onHandClick(id: string): void {
  if (!this.inputAllowed) return;
  this.unpin();
  if (this.selected === id) {
    this.cancelSelection();
    return;
  }

  if (
    this.view &&
    this.view.viewer !== null &&
    this.view.viewer === this.view.activeSeat &&
    this.view.phase === 'action'
  ) {
    this.audio.playCardSelect();
  }

  this.selected = id;
    this.target = null;
    this.marriagePick = {};
    const card = this.selectedCard();
    // Auto-pick the only possible target (e.g. Street Slander with one opponent).
    if (card?.playable && card.targets?.length === 1) this.target = card.targets[0]!;
    this.scene.setSelected(id);
    this.renderSelection();
    this.renderInspector();
    this.renderPlates();
  }

  private onTableClick(id: string | null): void {
    if (!this.inputAllowed) return;
    const card = this.selectedCard();
    if (id && card?.targets?.length) {
      const scheme = card.targets.find((t) => t.kind === 'scheme' && t.schemeId === id);
      if (scheme) return this.chooseTarget(scheme);
      const marriages = card.targets.filter((t) => t.kind === 'marriage');
      const asChild = marriages.some((t) => t.kind === 'marriage' && t.childId === id);
      const asCharacter = marriages.some((t) => t.kind === 'marriage' && t.characterId === id);
      if (asChild || asCharacter) {
        this.marriagePick = asChild ? { ...this.marriagePick, childId: id } : { ...this.marriagePick, characterId: id };
        const matching = this.filteredTargets(card);
        if (!matching.some((t) => sameTarget(t, this.target))) this.target = matching.length === 1 ? matching[0]! : null;
        this.renderSelection();
        this.updateMarks();
        return;
      }
    }
    if (id && id === this.pinned) this.unpin();
    else if (id) {
      this.pinned = id;
      this.renderInspector();
    } else this.unpin();
  }

  private chooseTarget(t: PlayTarget): void {
    const card = this.selectedCard();
    if (!card?.targets?.some((x) => sameTarget(x, t))) return;
    this.target = t;
    if (t.kind === 'marriage') this.marriagePick = { childId: t.childId, characterId: t.characterId };
    this.renderSelection();
    this.updateMarks();
    this.renderPlates();
  }

  private filteredTargets(card: ViewHandCard): PlayTarget[] {
    const p = this.marriagePick;
    return (card.targets ?? []).filter((t) => t.kind !== 'marriage' || ((!p.childId || t.childId === p.childId) && (!p.characterId || t.characterId === p.characterId)));
  }

  private onPanelClick(e: Event): void {
    const t = e.target as HTMLElement;
    if (t.closest('[data-cancel]')) return this.cancelSelection();
    if (t.closest('[data-clear-pick]')) {
      this.marriagePick = {};
      this.target = null;
      this.renderSelection();
      this.updateMarks();
      return;
    }
    const targetBtn = t.closest<HTMLElement>('[data-target]');
    if (targetBtn) return this.chooseTarget(JSON.parse(targetBtn.dataset.target!) as PlayTarget);
    if (t.closest('[data-confirm]')) {
      const card = this.selectedCard();
      if (!card) return;
      void this.act(this.target ? { type: 'play', cardId: card.instanceId, target: this.target } : { type: 'play', cardId: card.instanceId });
      return;
    }
    const respond = t.closest<HTMLElement>('[data-respond]');
    if (respond) void this.act({ type: 'play', cardId: respond.dataset.respond! });
    if (t.closest('[data-pass]')) void this.act({ type: 'pass' });
  }

  private onPanelHover(e: Event): void {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-target]');
    if (!b) return;
    const t = JSON.parse(b.dataset.target!) as PlayTarget;
    this.scene.setTableHighlight(t.kind === 'scheme' ? t.schemeId : t.kind === 'marriage' ? t.characterId : null);
  }

  private setHovered(target: Inspect | null): void {
    this.hovered = target;
    this.renderInspector();
  }

  private unpin(): void {
    if (!this.pinned) return;
    this.pinned = null;
    this.renderInspector();
  }

  private cancelSelection(render = true): void {
    if (!this.selected && !this.target) return;
    this.selected = null;
    this.target = null;
    this.marriagePick = {};
    this.scene.setSelected(null);
    if (!render) return;
    this.renderSelection();
    this.renderInspector();
    this.renderPlates();
  }

  private readonly onKey = (e: KeyboardEvent) => {
    if (this.locked) return; // nothing may reach the table behind a privacy screen
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if (e.key === 'Escape') {
      if (this.selected) this.cancelSelection();
      else this.unpin();
    }
  };

  /** Briefly shows important public events that are new to this (private) viewer. */
  private announceNew(): void {
    const v = this.view!;
    if (v.viewer === null) return; // public (privacy) views do not consume events
    const fresh = v.log.filter((e) => e.seq > this.lastSeenSeq && NOTABLE.has(e.kind));
    const first = this.lastSeenSeq < 0;
    this.lastSeenSeq = v.log.at(-1)?.seq ?? this.lastSeenSeq;
    if (first || !fresh.length) return;
    this.flash(
      fresh
        .slice(-3)
        .map((e) => describeLogEntry(e, v.families))
        .join('\n'),
      'info',
      5500,
    );
  }

  // ---------------------------------------------------------------- rendering helpers

  private name(seat: Seat): string {
    return this.view?.families[seat]?.name ?? `Seat ${seat + 1}`;
  }

  private findScheme(id: string): ViewScheme | null {
    for (const f of this.view?.families ?? []) {
      const s = f.schemes.find((x) => x.instanceId === id);
      if (s) return s;
    }
    return null;
  }

  private targetLabel(t: PlayTarget): string {
    const v = this.view!;
    switch (t.kind) {
      case 'seat':
        return `Target ${this.name(t.seat)}`;
      case 'scheme': {
        const s = this.findScheme(t.schemeId);
        if (!s) return 'A hidden Scheme';
        const list = v.families[s.owner]!.schemes;
        const n = list.length > 1 ? ` #${list.indexOf(s) + 1}` : '';
        return `${this.name(s.owner)}'s hidden Scheme${n} (placed in round ${s.placedRound})`;
      }
      case 'marriage': {
        const child = getCardDefinition(this.defIdOf(t.childId) ?? '');
        const ch = this.defIdOf(t.characterId) ?? '';
        return `${child.name} ⚭ ${getCardDefinition(ch).name} (${marriageOptionText(ch, t.option)})`;
      }
    }
  }

  private defIdOf(instanceId: string): string | null {
    for (const f of this.view?.families ?? []) {
      const c = [...f.characters, ...f.children].find((x) => x.instanceId === instanceId);
      if (c) return c.defId;
    }
    return null;
  }

  private cardExists(t: Inspect): boolean {
    if (!this.view) return false;
    return t.kind === 'hand' ? this.view.hand.some((c) => c.instanceId === t.instanceId) : this.tableCardExists(t.instanceId);
  }

  private tableCardExists(id: string): boolean {
    const v = this.view;
    if (!v) return false;
    return v.discard.some((c) => c.instanceId === id) || v.families.some((f) => [...f.characters, ...f.children, ...f.schemes].some((c) => c.instanceId === id));
  }

  private rulesHtml(def: CardDefinition): string {
    return rulesLines(def)
      .map((l) => `<div class="rule">${l.label ? `<b>${esc(l.label)}:</b> ` : ''}${esc(l.text)}</div>`)
      .join('');
  }

  private updateMarks(): void {
    const card = this.selectedCard();
    const targets = new Set<string>();
    const chosen = new Set<string>();
    if (card?.playable && card.targets) {
      for (const t of this.filteredTargets(card)) {
        if (t.kind === 'scheme') targets.add(t.schemeId);
        if (t.kind === 'marriage') {
          targets.add(t.childId);
          targets.add(t.characterId);
        }
      }
      const p = this.marriagePick;
      if (p.childId) chosen.add(p.childId);
      if (p.characterId) chosen.add(p.characterId);
      if (this.target?.kind === 'scheme') chosen.add(this.target.schemeId);
    }
    this.scene.setMarks({ targets, chosen });
  }

  // ---------------------------------------------------------------- rendering

  private render(): void {
    const v = this.view;
    if (!v) return;
    const status: string[] = [`<span class="round">Round ${Math.min(v.round, v.maxRounds)} / ${v.maxRounds}</span>`];
    if (v.finalRound && v.phase !== 'finished') status.push('<span class="badge warn">Final round: no new Schemes</span>');
    if (v.phase === 'finished') status.push('<strong>Game over</strong>');
    else {
      const yours = v.viewer !== null && v.viewer === v.activeSeat;
      status.push(yours ? '<strong>Your turn</strong>' : `${esc(this.name(v.activeSeat))}'s turn`);
      if (v.reaction) {
        const me = v.viewer === v.reaction.reactor;
        status.push(`<span class="badge alert">${me ? 'You must respond' : `${esc(this.name(v.reaction.reactor))} is responding`}</span>`);
      }
    }
    this.els.status.innerHTML = status.join(' · ');
    this.els.turn.innerHTML = this.turnText(v);
    this.els.hint.textContent = this.blockedReason ?? v.hint;
    this.els.banner.hidden = !this.blockedReason;
    this.els.banner.textContent = this.blockedReason ?? '';
    this.els.deckLabel.innerHTML = `<b>${v.drawPileCount}</b><small>deck</small>`;
    this.els.deckLabel.classList.toggle('empty', v.drawPileCount === 0);
    this.els.discardLabel.innerHTML = `<b>${v.discard.length}</b><small>discard</small>`;

    this.els.log.innerHTML = v.log
      .slice(-40)
      .map((e) => `<li class="k-${e.kind}">${esc(describeLogEntry(e, v.families))}</li>`)
      .join('');
    this.els.log.scrollTop = this.els.log.scrollHeight;
    this.renderPlates();
    this.renderButtons();
    this.renderDecision();
    this.renderSelection();
    this.renderInspector();
    this.renderResults();
  }

  private turnText(v: PlayerView): string {
    if (v.viewer === null) return '';
    const f = v.families[v.viewer]!;
    return `<span class="me-res">${esc(f.name)}: <b>${f.gold}</b> Gold · ${f.handCount} in hand · score <b>${f.score}</b></span>`;
  }

  private renderPlates(): void {
    const v = this.view;
    if (!v) return;
    const card = this.selectedCard();
    const seatTargets = new Set(card?.playable ? (card.targets ?? []).filter((t) => t.kind === 'seat').map((t) => (t.kind === 'seat' ? t.seat : -1)) : []);
    const chosenSeat = this.target?.kind === 'seat' ? this.target.seat : null;
    for (const f of v.families) {
      let plate = this.plateEls.get(f.seat);
      if (!plate) {
        plate = el('div', 'plate');
        plate.dataset.seat = String(f.seat);
        plate.style.setProperty('--seat', SEAT_COLORS[f.seat % SEAT_COLORS.length]!);
        this.els.plates.appendChild(plate);
        this.plateEls.set(f.seat, plate);
        this.scene.setLabel(`band:${f.seat}`, plate);
      }
      const d = this.decor[f.seat] ?? {};
      const deciding = v.decisionSeat === f.seat && v.reaction !== null;
      plate.className = [
        'plate',
        f.seat === v.activeSeat && v.phase !== 'finished' ? 'active' : '',
        f.seat === v.viewer ? 'me' : '',
        d.connected === false ? 'away' : '',
        deciding ? 'deciding' : '',
        seatTargets.has(f.seat) ? 'targetable' : '',
        chosenSeat === f.seat ? 'chosen' : '',
        v.result?.winners.includes(f.seat) ? 'winner' : '',
      ]
        .filter(Boolean)
        .join(' ');
      const tag = deciding ? '<span class="tag deciding">deciding</span>' : f.seat === v.activeSeat && v.phase !== 'finished' ? '<span class="tag">turn</span>' : '';
      plate.innerHTML = `
        <div class="pl-top">
          ${d.connected === undefined ? '' : `<span class="dot" title="${d.connected ? 'Connected' : 'Disconnected'}"></span>`}
          <span class="pl-name">${esc(f.name)}</span>${f.seat === v.viewer ? ` <em>(${esc(this.youLabel)})</em>` : ''}
          ${d.host ? '<span class="host" title="Lobby host">host</span>' : ''} ${tag}
        </div>
        <div class="pl-stand" title="Aristocracy · Religion · Popularity = score">
          <span class="st a">${STANDING_ABBR.aristocracy} ${f.standings.aristocracy}</span>
          <span class="st r">${STANDING_ABBR.religion} ${f.standings.religion}</span>
          <span class="st p">${STANDING_ABBR.popularity} ${f.standings.popularity}</span>
          <span class="score">= ${f.score}</span>
        </div>
        <div class="pl-res"><span class="gold">${f.gold} Gold</span> · ${f.handCount} in hand${f.schemes.length ? ` · ${f.schemes.length} Scheme${f.schemes.length > 1 ? 's' : ''}` : ''}</div>`;
    }
  }

  private renderButtons(): void {
    const v = this.view;
    const ok = this.inputAllowed && !this.busy && v !== null;
    this.els.end.disabled = !(ok && v!.can.endTurn);
    this.els.end.hidden = v?.phase === 'finished';
    for (const b of this.root.querySelectorAll<HTMLButtonElement>('[data-confirm],[data-respond],[data-pass]')) {
      if (!ok) b.disabled = true;
    }
  }

  private renderDecision(): void {
    const v = this.view;
    const box = this.els.decision;
    const r = v?.reaction;
    if (!v || !r || v.viewer !== r.reactor || this.locked) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    const scheme = this.findScheme(r.schemeId);
    const def = scheme && scheme.defId !== HIDDEN ? getCardDefinition(scheme.defId) : null;
    const responses = v.hand.filter((c) => {
      const d = getCardDefinition(c.defId);
      return d.type === 'instant' && d.timing === 'reaction';
    });
    const disabled = !this.inputAllowed || this.busy ? 'disabled' : '';
    box.hidden = false;
    box.innerHTML = `
      <h4>Your Scheme is being investigated</h4>
      <p>${esc(this.name(r.initiator))} played Senate Intervention against your hidden Scheme${def ? ` <strong>${esc(def.name)}</strong>` : ''}.</p>
      ${def && def.type === 'scheme' ? `<p class="if-revealed"><b>If revealed:</b> ${esc(rulesLines(def)[1]?.text ?? '')}</p>` : ''}
      <div class="responses">
        ${responses
          .map((c) => {
            const d = getCardDefinition(c.defId);
            return `<button type="button" class="btn" data-respond="${esc(c.instanceId)}" ${c.playable ? disabled : 'disabled'} title="${esc(c.reason ?? (d.type === 'instant' ? d.text : ''))}">Play ${esc(d.name)} (${d.cost} Gold)</button>`;
          })
          .join('')}
        ${responses.length ? '' : '<div class="note">You hold no Corruption or Vanish in the Crowd.</div>'}
        <button type="button" class="btn primary" data-pass ${disabled}>Allow the investigation</button>
      </div>`;
  }

  private renderSelection(): void {
    const s = this.els.selection;
    const card = this.selectedCard();
    const v = this.view;
    if (!card || !v) {
      s.hidden = true;
      s.innerHTML = '';
      this.updateMarks();
      return;
    }
    const def = getCardDefinition(card.defId);
    const verb = def.type === 'character' ? 'Recruit' : def.type === 'scheme' ? 'Place Scheme' : 'Play';
    const targets = card.targets ? this.filteredTargets(card) : null;
    const needsTarget = card.targets !== null;
    const prompt =
      !needsTarget || !card.playable
        ? ''
        : card.targets!.some((t) => t.kind === 'seat')
          ? 'Choose an opponent (or click their nameplate):'
          : card.targets!.some((t) => t.kind === 'scheme')
            ? 'Choose a hidden Scheme to investigate (highlighted green):'
            : 'Choose a Child and a Character (highlighted green):';
    const canConfirm = card.playable && (!needsTarget || this.target !== null) && this.inputAllowed && !this.busy;
    const pick = this.marriagePick.childId || this.marriagePick.characterId;
    s.hidden = false;
    s.innerHTML = `
      <div class="sel-head" style="--card:${cardColor(def)}"><strong>${esc(def.name)}</strong> <span class="cost">${def.cost} Gold</span></div>
      <div class="sel-type">${esc(typeLine(def))}</div>
      <div class="sel-rules">${this.rulesHtml(def)}</div>
      ${card.playable ? '' : `<div class="why">Not playable now: ${esc(card.reason ?? '')}</div>`}
      ${prompt ? `<div class="prompt">${esc(prompt)}</div>` : ''}
      ${
        targets && card.playable
          ? `<div class="targets">${targets
              .map((t) => `<button type="button" class="btn small target ${sameTarget(t, this.target) ? 'on' : ''}" data-target='${esc(JSON.stringify(t))}'>${esc(this.targetLabel(t))}</button>`)
              .join('')}${pick ? '<button type="button" class="linkish" data-clear-pick>Show all combinations</button>' : ''}</div>`
          : ''
      }
      <div class="row">
        <button type="button" class="btn primary" data-confirm ${canConfirm ? '' : 'disabled'}>${esc(verb)} (${def.cost} Gold)</button>
        <button type="button" class="btn small danger" data-cancel>Cancel (Esc)</button>
      </div>`;
    this.updateMarks();
  }

  private renderInspector(): void {
    const box = this.els.inspector;
    const v = this.view;
    // Priority: hovering a hand card > a pinned table card > hovering the table.
    // (The selected card's details are already in the action panel.)
    const handHover = this.hovered?.kind === 'hand' && this.hovered.instanceId !== this.selected ? this.hovered : null;
    const target: Inspect | null = handHover ?? (this.pinned ? { kind: 'table', instanceId: this.pinned } : null) ?? (this.hovered?.kind === 'table' ? this.hovered : null);
    if (!v || this.locked || !target || !this.cardExists(target)) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    const info = target.kind === 'hand' ? this.handInfo(target.instanceId) : this.tableInfo(target.instanceId);
    if (!info) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    box.innerHTML = `
      <img class="card-image" alt="${esc(info.title)}" src="${info.image}" />
      <div class="meta">
        <h3>${esc(info.title)}</h3>
        ${info.sub ? `<div class="sub" style="--card:${info.color}">${esc(info.sub)}</div>` : ''}
        ${info.body}
        <div class="where">${info.where}</div>
        ${this.pinned === target.instanceId ? '<button type="button" class="btn small" data-unpin>Close (Esc)</button>' : ''}
      </div>`;
  }

  private handInfo(id: string) {
    const c = this.view!.hand.find((x) => x.instanceId === id)!;
    const def = getCardDefinition(c.defId);
    return {
      title: def.name,
      sub: `${typeLine(def)} · ${def.cost} Gold`,
      color: cardColor(def),
      image: cardImageUrl(def.id),
      body: `${this.rulesHtml(def)}${def.flavor ? `<p class="flavor">${esc(def.flavor)}</p>` : ''}`,
      where: `In your hand · ${c.playable ? '<span class="ok">playable now</span>' : `not playable: ${esc(c.reason ?? '')}`}`,
    };
  }

  private tableInfo(id: string) {
    const v = this.view!;
    const scheme = this.findScheme(id);
    if (scheme && scheme.defId === HIDDEN) {
      // Never derive anything from a hidden card's identity: only public facts.
      return {
        title: 'Hidden Scheme',
        sub: `Scheme of ${this.name(scheme.owner)}`,
        color: '#5d3c7e',
        image: cardImageUrl(HIDDEN),
        body: `<p>Its identity and target are secret. It resolves at the start of ${esc(this.name(scheme.owner))}'s turn in round ${scheme.resolvesInRound} unless it is exposed first.</p>
          ${scheme.challenged ? '<p class="alert">Under investigation right now.</p>' : ''}`,
        where: `Placed in round ${scheme.placedRound}`,
      };
    }
    let defId: string | null = scheme?.defId ?? null;
    let where = '';
    const family = v.families.find((f) => [...f.characters, ...f.children].some((c) => c.instanceId === id));
    if (scheme) {
      where = `Your hidden Scheme: opponents see only the card back. Resolves at the start of your turn in round ${scheme.resolvesInRound}.${
        scheme.target !== null ? ` Aimed at ${esc(this.name(scheme.target))}.` : ''
      }${scheme.challenged ? ' <span class="alert">Under investigation!</span>' : ''}`;
    } else if (family) {
      const isChild = family.children.some((c) => c.instanceId === id);
      defId = [...family.characters, ...family.children].find((c) => c.instanceId === id)!.defId;
      const m = v.marriages.find((x) => x.childId === id || x.characterId === id);
      const spouse = m ? (isChild ? m.characterId : m.childId) : null;
      const spouseName = spouse ? getCardDefinition(this.defIdOf(spouse) ?? '').name : null;
      where = `${isChild ? 'Child' : 'Character'} of ${esc(family.name)}${spouseName ? ` · married to ${esc(spouseName)}` : isChild ? ' · unmarried' : ''}`;
    } else {
      const c = v.discard.find((x) => x.instanceId === id);
      if (!c) return null;
      defId = c.defId;
      where = 'In the discard pile';
    }
    const def = getCardDefinition(defId!);
    return {
      title: def.name,
      sub: `${typeLine(def)}${def.type === 'child' ? '' : ` · ${def.cost} Gold`}`,
      color: cardColor(def),
      image: cardImageUrl(def.id, !!scheme),
      body: `${this.rulesHtml(def)}${def.flavor ? `<p class="flavor">${esc(def.flavor)}</p>` : ''}`,
      where,
    };
  }

  private renderResults(): void {
    const v = this.view;
    const box = this.els.results;
    if (!v?.result || this.locked) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    if (this.resultsHidden) {
      box.hidden = false;
      box.className = 'results collapsed';
      box.innerHTML = `<button type="button" class="btn primary" data-reopen>Show final results</button>`;
      box.querySelector('[data-reopen]')!.addEventListener('click', () => {
        this.resultsHidden = false;
        this.renderResults();
      });
      return;
    }
    const r = v.result;
    const winners = r.winners.map((s) => this.name(s));
    const headline = winners.length > 1 ? `Shared victory: ${winners.join(' & ')}` : `${winners[0]} wins!`;
    box.className = 'results';
    box.hidden = false;
    box.innerHTML = `
      <div class="results-card" role="dialog" aria-label="Final results">
        <div class="eyebrow">Game over after ${v.maxRounds} rounds</div>
        <h2>${esc(headline)}</h2>
        <table>
          <thead><tr><th>Rank</th><th>Family</th><th title="Aristocracy">A</th><th title="Religion">R</th><th title="Popularity">P</th><th>Score</th></tr></thead>
          <tbody>${r.scores
            .map(
              (s) => `<tr class="${r.winners.includes(s.seat) ? 'win' : ''}"><td>${s.rank}</td><td>${esc(this.name(s.seat))}${s.seat === v.viewer ? ' <em>(you)</em>' : ''}</td>
              <td>${s.standings.aristocracy}</td><td>${s.standings.religion}</td><td>${s.standings.popularity}</td><td><b>${s.total}</b></td></tr>`,
            )
            .join('')}</tbody>
        </table>
        <p class="note">Provisional demo scoring: Aristocracy + Religion + Popularity. Gold does not count. Equal scores share the victory.</p>
        <div class="row end">
          <button type="button" class="btn" data-close-results>View table</button>
          ${this.resultActions.map((a, i) => `<button type="button" class="btn ${a.primary ? 'primary' : ''}" data-result-action="${i}">${esc(a.label)}</button>`).join('')}
        </div>
      </div>`;
  }
}
