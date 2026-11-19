/**
 * Hotseat mode: 2–4 players share one screen. Runs the game core entirely in
 * the browser (no backend needed once the page has loaded).
 *
 * Privacy (casual viewing on a shared screen): the presentation only ever
 * holds the view of the player who currently has decision priority and has
 * confirmed they are at the screen. Whenever priority moves to another player
 * (end of turn, a reaction window opening, priority returning after a
 * response) the view is replaced by a public one (no hand at all),
 * animations are finished, previews dropped, input locked, and an opaque
 * screen asks for the next player. It does not protect against someone
 * inspecting browser memory.
 */
import { seededRng } from '../../shared/random';
import { DEMO_RULES } from '../../shared/rules';
import type { GameAction, Seat } from '../../shared/types';
import { HotseatSession } from '../session/hotseatSession';
import type { SubmitResult } from '../session/types';
import { el, esc } from './dom';
import { GameScreen } from './gameScreen';

const NAMES_KEY = 'cloudborne.hotseat.names';

function savedNames(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(NAMES_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((n): n is string => typeof n === 'string') : [];
  } catch {
    return [];
  }
}

export function startHotseat(host: HTMLElement, onExit: () => void): () => void {
  let cleanup: () => void = () => {};
  const showSetup = () => {
    cleanup();
    cleanup = hotseatSetup(host, onExit, (names) => {
      cleanup();
      cleanup = hotseatGame(host, names, () => showSetup(), onExit);
    });
  };
  showSetup();
  return () => cleanup();
}

function hotseatSetup(host: HTMLElement, onBack: () => void, onStart: (names: string[]) => void): () => void {
  const prev = savedNames();
  let count = Math.min(DEMO_RULES.maxPlayers, Math.max(DEMO_RULES.minPlayers, prev.length || 2));
  const root = el('div', 'screen');
  host.appendChild(root);

  const render = () => {
    const inputs = Array.from({ length: count }, (_, i) => {
      const value = (root.querySelector<HTMLInputElement>(`input[data-seat="${i}"]`)?.value ?? prev[i] ?? '').slice(0, 20);
      return `<label class="field">Family ${i + 1}<input data-seat="${i}" maxlength="20" placeholder="House ${i + 1}" value="${esc(value)}" autocomplete="off" /></label>`;
    }).join('');
    root.innerHTML = `
      <form class="panel" novalidate>
        <h1>Hotseat game</h1>
        <p class="lead">Everyone plays on this screen. Hands stay hidden: pass the device whenever the screen asks, including when someone must respond to an investigation.</p>
        <fieldset class="segmented" aria-label="Number of families">
          <legend>Families</legend>
          ${[2, 3, 4].map((n) => `<button type="button" data-count="${n}" class="${n === count ? 'on' : ''}" aria-pressed="${n === count}">${n}</button>`).join('')}
        </fieldset>
        <div class="names">${inputs}</div>
        <div class="row end">
          <button type="button" class="btn" data-back>Back</button>
          <button type="submit" class="btn primary">Start game</button>
        </div>
      </form>`;
  };
  render();
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const c = t.closest<HTMLElement>('[data-count]');
    if (c) {
      count = Number(c.dataset.count);
      render();
    }
    if (t.closest('[data-back]')) onBack();
  });
  root.addEventListener('submit', (e) => {
    e.preventDefault();
    const names = Array.from({ length: count }, (_, i) => root.querySelector<HTMLInputElement>(`input[data-seat="${i}"]`)!.value.trim() || `House ${i + 1}`);
    try {
      localStorage.setItem(NAMES_KEY, JSON.stringify(names));
    } catch {
      /* storage unavailable: fine */
    }
    onStart(names);
  });
  root.querySelector<HTMLInputElement>('input')?.focus();
  return () => root.remove();
}

type HandoffReason = 'start' | 'turn' | 'reaction' | 'return' | 'hidden';

/**
 * Browser smoke checks may fix the hotseat shuffle with `?e2e&seed=N` so a
 * scripted opening is reproducible. Hotseat state lives in this browser anyway;
 * the LAN server never takes randomness from clients.
 */
function e2eSeed(): number | null {
  const params = new URLSearchParams(location.search);
  const seed = Number(params.get('seed'));
  return params.has('e2e') && Number.isInteger(seed) && seed > 0 ? seed : null;
}

function hotseatGame(host: HTMLElement, names: string[], onNewGame: () => void, onExit: () => void): () => void {
  const seed = e2eSeed();
  const session = new HotseatSession(names, seed === null ? {} : { rngFactory: () => seededRng(seed) });
  /** The seat whose hand is currently revealed, or null behind the privacy screen / at game end. */
  let revealed: Seat | null = null;

  const submit = (action: GameAction): SubmitResult => {
    if (revealed === null) return { ok: false, message: 'Show your hand first.' };
    const seat = revealed;
    const result = session.submit(seat, action);
    if (!result.ok) return result;
    if (session.finished) {
      showFinished();
      return result;
    }
    const next = session.prioritySeat!;
    if (next !== seat) {
      // Priority moved to someone else: hide this hand before anything else is shown.
      // A reaction window gives priority to someone other than the active player.
      handoff(action.type === 'endTurn' ? 'turn' : next !== session.activeSeat ? 'reaction' : 'return');
    } else {
      screen.showView(session.viewFor(seat), { animate: true, youLabel: 'you' });
    }
    return result;
  };

  const screen = new GameScreen(host, { modeLabel: 'Hotseat', submit });
  screen.setConnection('Offline · one screen', 'ok');
  screen.addTool('Hide hand', () => {
    if (revealed !== null) handoff('hidden');
  }, 'Cover your hand with the privacy screen');
  const restart = () => {
    session.restart();
    handoff('start');
  };
  screen.addTool('Restart', () => {
    if (confirm('Restart with the same families? The current game will be lost.')) restart();
  });
  screen.addTool('New setup', () => {
    if (confirm('Leave this game and change families?')) onNewGame();
  });
  screen.addTool('Main menu', () => {
    if (confirm('Leave this game and return to the main menu?')) onExit();
  });
  screen.setResultActions([
    { label: 'Play again', onClick: restart, primary: true },
    { label: 'New setup', onClick: onNewGame },
    { label: 'Main menu', onClick: onExit },
  ]);

  const privacy = el('div', 'privacy');
  privacy.setAttribute('role', 'dialog');
  privacy.setAttribute('aria-modal', 'true');
  host.appendChild(privacy);

  function handoff(reason: HandoffReason) {
    // Order matters: lock and clear before the private view is replaced, so no
    // selection, preview or in-flight animation survives into the handoff.
    const previous = revealed;
    revealed = null;
    screen.setPrivacyLock(true);
    screen.showView(session.publicView(), { animate: false });
    const seat = session.prioritySeat ?? session.activeSeat;
    const next = session.playerName(seat);
    const prevName = previous !== null ? session.playerName(previous) : '';
    const titles: Record<HandoffReason, string> = {
      start: `Pass to ${next}`,
      turn: `Pass to ${next}`,
      reaction: `Pass to ${next}`,
      return: `Pass back to ${next}`,
      hidden: 'Hand hidden',
    };
    const subs: Record<HandoffReason, string> = {
      start: `${esc(next)} takes the first turn.`,
      turn: `${esc(prevName)}'s turn is over and their hand is hidden. Hand the device to ${esc(next)}.`,
      reaction: `${esc(prevName)} is investigating one of ${esc(next)}'s hidden Schemes. ${esc(next)} must decide how to respond.`,
      return: `${esc(prevName)} has responded. ${esc(next)} continues their turn.`,
      hidden: `${esc(next)}'s cards are covered.`,
    };
    privacy.dataset.reason = reason;
    privacy.innerHTML = `
      <div class="privacy-card">
        <h1>${esc(titles[reason])}</h1>
        <p>${subs[reason]}</p>
        <button type="button" class="btn primary big" data-ready>I'm ${esc(next)}: show my hand</button>
      </div>`;
    privacy.hidden = false;
    privacy.querySelector<HTMLButtonElement>('[data-ready]')!.focus();
  }

  function showFinished() {
    // Game over: no hand is shown; the results overlay sits over the public table.
    revealed = null;
    privacy.hidden = true;
    privacy.innerHTML = '';
    screen.setPrivacyLock(true);
    screen.showView(session.publicView(), { animate: false });
    screen.setPrivacyLock(false);
  }

  privacy.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('[data-ready]')) return;
    privacy.hidden = true;
    privacy.innerHTML = '';
    revealed = session.prioritySeat ?? session.activeSeat;
    screen.showView(session.viewFor(revealed), { animate: false, youLabel: 'you' });
    screen.setPrivacyLock(false);
  });
  // Swallow keys while the privacy screen is up (except activating its own button).
  const keyGuard = (e: KeyboardEvent) => {
    if (privacy.hidden) return;
    if ((e.key === 'Enter' || e.key === ' ') && (e.target as HTMLElement).closest?.('[data-ready]')) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      privacy.querySelector<HTMLButtonElement>('[data-ready]')?.focus();
      return;
    }
    e.stopImmediatePropagation();
  };
  window.addEventListener('keydown', keyGuard, true);

  handoff('start');
  return () => {
    window.removeEventListener('keydown', keyGuard, true);
    screen.dispose();
    privacy.remove();
  };
}
