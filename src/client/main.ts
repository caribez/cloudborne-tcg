/**
 * App shell: main menu and mode switching. Hotseat and LAN are separate modes
 * that share the game core and the GameScreen presentation.
 */
import './styles.css';
import { hasStoredLanSession } from './session/lanClient';
import { el } from './ui/dom';
import { startHotseat } from './ui/hotseatMode';
import { startLan } from './ui/lanMode';

const MODE_KEY = 'cloudborne.mode';
const app = document.getElementById('app')!;
let stop: (() => void) | null = null;

function setMode(mode: 'menu' | 'hotseat' | 'lan') {
  stop?.();
  stop = null;
  app.innerHTML = '';
  try {
    sessionStorage.setItem(MODE_KEY, mode);
  } catch {
    /* ignore */
  }
  if (mode === 'hotseat') stop = startHotseat(app, () => setMode('menu'));
  else if (mode === 'lan') stop = startLan(app, () => setMode('menu'));
  else showMenu();
}

function showMenu() {
  const root = el('div', 'screen');
  root.innerHTML = `
    <div class="panel menu">
      <h1>Cloudborne <span class="tag">playable demo</span></h1>
      <p class="lead">A political card game for 2–4 families. Build influence with Aristocracy, Religion and the people; recruit Characters, plot hidden Schemes, expose your rivals and marry into power. Highest standing after 8 rounds wins. Rules are provisional demo rules.</p>
      <div class="choices">
        <button class="choice" data-mode="hotseat" type="button">
          <strong>Hotseat</strong>
          <span>2–4 players take turns on this screen. Works offline.</span>
        </button>
        <button class="choice" data-mode="lan" type="button">
          <strong>LAN game</strong>
          <span>Each player uses their own browser on the same network. Joins the game hosted at <code>${location.host}</code>.</span>
        </button>
      </div>
    </div>`;
  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-mode]');
    if (b) setMode(b.dataset.mode as 'hotseat' | 'lan');
  });
  app.appendChild(root);
}

// After a refresh in LAN mode, go straight back to the stored seat.
let initial: 'menu' | 'lan' = 'menu';
try {
  if (sessionStorage.getItem(MODE_KEY) === 'lan' && hasStoredLanSession()) initial = 'lan';
} catch {
  /* ignore */
}
setMode(initial);
