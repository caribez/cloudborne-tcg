/**
 * Hotseat mode: 2–4 players share one screen. Runs the game core entirely in
 * the browser (no backend needed once the page has loaded).
 *
 * Privacy (casual viewing on a shared screen): the presentation only ever
 * holds the confirmed active player's view. At handoff it is replaced by a
 * public view (no hand at all), animations are finished, previews dropped,
 * input locked, and an opaque screen asks for the next player.
 */
import { PROVISIONAL_RULES } from '../../shared/rules';
import type { GameAction } from '../../shared/types';
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
  let count = Math.min(PROVISIONAL_RULES.maxPlayers, Math.max(PROVISIONAL_RULES.minPlayers, prev.length || 2));
  const root = el('div', 'screen');
  host.appendChild(root);

  const render = () => {
    const inputs = Array.from({ length: count }, (_, i) => {
      const value = (root.querySelector<HTMLInputElement>(`input[data-seat="${i}"]`)?.value ?? prev[i] ?? '').slice(0, 20);
      return `<label class="field">Seat ${i + 1}<input data-seat="${i}" maxlength="20" placeholder="Player ${i + 1}" value="${esc(value)}" autocomplete="off" /></label>`;
    }).join('');
    root.innerHTML = `
      <form class="panel" novalidate>
        <h1>Hotseat game</h1>
        <p class="lead">Everyone plays on this screen. Hands stay hidden between turns: pass the device when asked.</p>
        <fieldset class="segmented" aria-label="Number of players">
          <legend>Players</legend>
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
    const names = Array.from({ length: count }, (_, i) => root.querySelector<HTMLInputElement>(`input[data-seat="${i}"]`)!.value.trim() || `Player ${i + 1}`);
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

function hotseatGame(host: HTMLElement, names: string[], onNewGame: () => void, onExit: () => void): () => void {
  const session = new HotseatSession(names);
  /** The seat whose hand is currently revealed, or null behind the privacy screen. */
  let revealed: number | null = null;

  const submit = (action: GameAction): SubmitResult => {
    if (revealed === null) return { ok: false, message: 'Show your hand first.' };
    const seat = revealed;
    const result = session.submit(seat, action);
    if (!result.ok) return result;
    if (action.type === 'endTurn') {
      handoff('pass');
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
  screen.addTool('Restart', () => {
    if (!confirm('Restart with the same players? The current table will be lost.')) return;
    session.restart();
    handoff('start');
  });
  screen.addTool('New setup', () => {
    if (confirm('Leave this game and change players?')) onNewGame();
  });
  screen.addTool('Main menu', () => {
    if (confirm('Leave this game and return to the main menu?')) onExit();
  });

  const privacy = el('div', 'privacy');
  privacy.setAttribute('role', 'dialog');
  privacy.setAttribute('aria-modal', 'true');
  host.appendChild(privacy);

  function handoff(reason: 'start' | 'pass' | 'hidden') {
    // Order matters: lock and clear before the private view is replaced, so no
    // selection, preview or in-flight animation survives into the handoff.
    revealed = null;
    screen.setPrivacyLock(true);
    screen.showView(session.publicView(), { animate: false });
    const next = session.playerName(session.activeSeat);
    const title = reason === 'hidden' ? 'Hand hidden' : `Pass to ${next}`;
    const sub =
      reason === 'start'
        ? `${esc(next)} takes the first turn.`
        : reason === 'pass'
          ? 'The previous hand is hidden. Hand the device over.'
          : `${esc(next)}'s cards are covered.`;
    privacy.innerHTML = `
      <div class="privacy-card">
        <h1>${esc(title)}</h1>
        <p>${sub}</p>
        <button type="button" class="btn primary big" data-ready>I'm ${esc(next)}: show my hand</button>
      </div>`;
    privacy.hidden = false;
    privacy.querySelector<HTMLButtonElement>('[data-ready]')!.focus();
  }

  privacy.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('[data-ready]')) return;
    privacy.hidden = true;
    privacy.innerHTML = '';
    revealed = session.activeSeat;
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
