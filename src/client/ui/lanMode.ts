/**
 * LAN mode: join the single lobby hosted by the server that served this page,
 * then play with the server as the authority. The local player's hand is
 * always shown, whoever's turn it is.
 */
import type { ServerSnapshot } from '../../shared/protocol';
import { LanClient, storedLanName, type LanClientState } from '../session/lanClient';
import { el, esc } from './dom';
import { GameScreen } from './gameScreen';

export function startLan(host: HTMLElement, onExit: () => void): () => void {
  const client = new LanClient();
  const root = el('div', 'screen');
  host.appendChild(root);
  let game: GameScreen | null = null;
  let message = '';
  let lastLobbyKey = '';
  let wasSynced = false;

  const exit = () => {
    cleanup();
    onExit();
  };

  function connectionText(s: LanClientState): [string, 'ok' | 'warn' | 'bad'] {
    if (s.connection === 'connected') return s.synced ? ['Connected', 'ok'] : ['Syncing…', 'warn'];
    if (s.connection === 'connecting') return ['Connecting…', 'warn'];
    return ['Disconnected · retrying', 'bad'];
  }

  function blockedReason(s: LanClientState): string | null {
    if (s.notice) return s.notice;
    if (s.connection !== 'connected') return 'Connection to the host lost. Reconnecting… Your seat is kept.';
    if (!s.synced) return 'Resynchronizing with the host…';
    const waiting = s.snapshot?.waitingFor ?? [];
    if (waiting.length) return `Game paused: waiting for ${waiting.join(', ')} to reconnect.`;
    return null;
  }

  function ensureGame(snap: ServerSnapshot): GameScreen {
    if (game) return game;
    root.hidden = true;
    game = new GameScreen(host, {
      modeLabel: 'LAN',
      submit: (action) => client.submit(action),
    });
    if (snap.you.isHost) {
      game.addTool('Restart game', async () => {
        if (!confirm('Restart for everyone with a fresh shuffle?')) return;
        const r = await client.lobby('restart');
        if (!r.ok) game?.flash(r.message ?? 'Could not restart.');
      });
      game.addTool('Back to lobby', async () => {
        if (!confirm('End this game for everyone and return to the lobby?')) return;
        const r = await client.lobby('backToLobby');
        if (!r.ok) game?.flash(r.message ?? 'Could not end the game.');
      });
    }
    game.addTool('Exit', () => {
      if (confirm('Leave this browser tab’s game? Your seat is kept while the game runs; reopen LAN mode in this tab to return.')) exit();
    });
    const g = game;
    g.setResultActions(
      snap.you.isHost
        ? [
            { label: 'Restart game', primary: true, onClick: () => void client.lobby('restart').then((r) => r.ok || g.flash(r.message ?? 'Could not restart.')) },
            { label: 'Back to lobby', onClick: () => void client.lobby('backToLobby').then((r) => r.ok || g.flash(r.message ?? 'Could not end the game.')) },
          ]
        : [{ label: 'Main menu', onClick: exit }],
    );
    return game;
  }

  function dropGame() {
    game?.dispose();
    game = null;
    root.hidden = false;
  }

const unsubscribe = client.subscribe((s) => {
  const playSounds = s.synced && wasSynced;
  wasSynced = s.synced;

  const snap = s.snapshot;
    if (s.joined && snap?.lobby.phase === 'playing' && snap.game) {
      const g = ensureGame(snap);
      const decor = snap.lobby.seats.map((seat) => (seat ? { connected: seat.connected, host: seat.isHost } : {}));
g.showView(snap.game, {
  animate: true,
  decor,
  youLabel: 'you',
  playSounds,
});      const [text, kind] = connectionText(s);
      g.setConnection(text, kind);
      g.setBlocked(blockedReason(s));
      return;
    }
    if (game) dropGame();
    renderLobby(s);
  });

  function renderLobby(s: LanClientState) {
    const [connText, connKind] = connectionText(s);
    const snap = s.snapshot;
    // Avoid re-rendering (and losing focus in the name field) when nothing visible changed.
    const key = JSON.stringify([s.connection, s.synced, s.joined, s.joinError, s.notice, snap?.lobby, snap?.you, message]);
    if (key === lastLobbyKey) return;
    lastLobbyKey = key;

    const status = `<div class="conn-pill" data-kind="${connKind}">${esc(connText)}</div>`;
    if (s.notice) {
      root.innerHTML = `<div class="panel"><h1>LAN game</h1>${status}<p class="lead">${esc(s.notice)}</p>
        <div class="row end"><button class="btn" data-exit>Main menu</button></div></div>`;
      return;
    }
    if (!s.joined || !snap) {
      const name = root.querySelector<HTMLInputElement>('input[name=name]')?.value ?? storedLanName();
      root.innerHTML = `
        <form class="panel" novalidate>
          <h1>Join LAN game</h1>
          ${status}
          <p class="lead">You are connecting to the host at <code>${esc(location.host)}</code>.</p>
          <label class="field">Your name<input name="name" maxlength="20" placeholder="Name" value="${esc(name)}" autocomplete="off" /></label>
          ${s.joinError ? `<p class="error">${esc(s.joinError)}</p>` : ''}
          ${message ? `<p class="error">${esc(message)}</p>` : ''}
          ${s.connection === 'disconnected' ? '<p class="note">Cannot reach the host. Is <code>npm start</code> (or <code>npm run dev</code>) running on the host computer, and are you on the same network?</p>' : ''}
          <div class="row end">
            <button type="button" class="btn" data-exit>Back</button>
            <button type="submit" class="btn primary" ${s.connection === 'connected' ? '' : 'disabled'}>Join lobby</button>
          </div>
        </form>`;
      root.querySelector<HTMLInputElement>('input[name=name]')?.focus();
      return;
    }

    const lobby = snap.lobby;
    const seated = lobby.seats.filter(Boolean);
    const away = seated.filter((p) => p && !p.connected);
    const canStart = snap.you.isHost && seated.length >= lobby.minPlayers && away.length === 0;
    const hostName = seated.find((p) => p?.isHost)?.name ?? 'the host';
    const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    const urls = lobby.shareUrls.length ? lobby.shareUrls : [location.origin + '/'];
    const me = seated.find((p) => p?.playerId === snap.you.playerId);

    root.innerHTML = `
      <div class="panel wide">
        <h1>LAN lobby</h1>
        ${status}
        <div class="share">
          <div>Other players open:</div>
          ${urls.map((u) => `<code class="url">${esc(u)}</code>`).join('')}
          ${isLocal && !lobby.shareUrls.length ? '<div class="note">No LAN address detected. Check the host terminal for its network URL.</div>' : ''}
        </div>
        <ol class="seats">
          ${lobby.seats
            .map((p, i) => {
              if (!p) {
                return `<li class="seat free"><span class="label">Seat ${i + 1}</span><span class="who">Free</span>
                  <button class="btn small" data-seat="${i}">Sit here</button></li>`;
              }
              const you = p.playerId === snap.you.playerId;
              return `<li class="seat ${you ? 'you' : ''} ${p.connected ? '' : 'away'}">
                <span class="label">Seat ${i + 1}</span>
                <span class="who"><span class="dot" title="${p.connected ? 'Connected' : 'Disconnected'}"></span>${esc(p.name)}
                  ${you ? '<em>(you)</em>' : ''} ${p.isHost ? '<span class="host">host</span>' : ''} ${p.connected ? '' : '<small>disconnected</small>'}</span>
              </li>`;
            })
            .join('')}
        </ol>
        <form class="rename row" novalidate>
          <label class="field inline">Name<input name="rename" maxlength="20" value="${esc(me?.name ?? '')}" autocomplete="off" /></label>
          <button class="btn small" type="submit">Rename</button>
        </form>
        ${message ? `<p class="error">${esc(message)}</p>` : ''}
        <div class="row end">
          ${snap.you.isHost ? '' : '<button type="button" class="btn" data-leave>Leave lobby</button>'}
          ${
            snap.you.isHost
              ? `<button type="button" class="btn primary" data-start ${canStart ? '' : 'disabled'}>Start game (${seated.length} players)</button>`
              : `<span class="note">Waiting for ${esc(hostName)} (host) to start.</span>`
          }
        </div>
        ${
          snap.you.isHost && !canStart
            ? `<p class="note">${seated.length < lobby.minPlayers ? `At least ${lobby.minPlayers} players are needed.` : `Waiting for ${esc(away.map((p) => p!.name).join(', '))} to reconnect.`}</p>`
            : ''
        }
      </div>`;
  }

  const setMessage = (m: string) => {
    message = m;
    renderLobby(client.current);
  };

  root.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-exit]')) return exit();
    const seatBtn = t.closest<HTMLElement>('[data-seat]');
    if (seatBtn) {
      const r = await client.takeSeat(Number(seatBtn.dataset.seat));
      setMessage(r.ok ? '' : (r.message ?? 'Could not take that seat.'));
    }
    if (t.closest('[data-start]')) {
      const r = await client.lobby('start');
      setMessage(r.ok ? '' : (r.message ?? 'Could not start.'));
    }
    if (t.closest('[data-leave]')) {
      const r = await client.lobby('leave');
      setMessage(r.ok ? '' : (r.message ?? 'Could not leave.'));
    }
  });
  root.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    if (form.classList.contains('rename')) {
      const r = await client.setName(form.querySelector<HTMLInputElement>('input')!.value);
      setMessage(r.ok ? '' : (r.message ?? 'Could not rename.'));
      return;
    }
    const name = form.querySelector<HTMLInputElement>('input[name=name]')!.value.trim();
    if (!name) return setMessage('Please enter a name.');
    const r = await client.join(name);
    setMessage(r.ok ? '' : (r.message ?? 'Could not join.'));
  });

  function cleanup() {
    unsubscribe();
    client.dispose();
    game?.dispose();
    game = null;
    root.remove();
  }
  return cleanup;
}
