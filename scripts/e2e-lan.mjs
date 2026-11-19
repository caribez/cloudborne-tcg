/**
 * Browser smoke check for LAN mode using separate browser contexts (separate
 * "devices" on one machine): lobby, synchronized political play, a hidden
 * Scheme that never reaches the opponent's browser, an investigation where
 * the Scheme owner reloads the page mid-decision, and a late joiner.
 *
 * The server must run with the test seed so the opening is known (Ada holds
 * Planted Scandal and Vanish in the Crowd; Bo draws a Senate Intervention),
 * and must be freshly started so the lobby is empty:
 *   npm run build && CLOUDBORNE_TEST_SEED=137 npm start   (in another terminal)
 *   node scripts/e2e-lan.mjs [http://localhost:3000]
 */
import { BASE, check, clickHandCard, clickTableCard, done, launchArgs, loadPlaywright, logText, plateText, playCard, screenInfo, waitFor } from './e2e-common.mjs';

const { chromium } = await loadPlaywright();
const browser = await chromium.launch(launchArgs);
const errors = [];
const shots = process.env.E2E_SHOTS;

async function player(name) {
  const context = await browser.newContext({ viewport: { width: 1360, height: 840 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e}`));
  const frames = [];
  page.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
  await page.goto(`${BASE}/?e2e`);
  await page.click('[data-mode=lan]');
  await page.fill('input[name=name]', name);
  await page.click('button[type=submit]');
  await page.waitForSelector('.seats');
  return { page, context, frames, name };
}

/** Every snapshot payload a browser received over the WebSocket. */
function snapshots(frames) {
  const out = [];
  for (const f of frames) {
    const m = /^\d+(\[.*)$/s.exec(f);
    if (!m) continue;
    try {
      const msg = JSON.parse(m[1]);
      if (msg[0] === 'snapshot') out.push(msg[1]);
    } catch {
      /* not JSON */
    }
  }
  return out;
}
/** All objects in a payload that refer to an instance id. */
function mentions(node, id, out = []) {
  if (Array.isArray(node)) node.forEach((n) => mentions(n, id, out));
  else if (node && typeof node === 'object') {
    if (node.instanceId === id || node.schemeId === id) out.push(node);
    Object.values(node).forEach((v) => mentions(v, id, out));
  }
  return out;
}

console.log('Lobby');
const ada = await player('Ada');
const bo = await player('Bo');
check((await ada.page.textContent('.seats')).includes('Bo'), 'host sees the second player in the lobby');
check(!(await bo.page.isVisible('[data-start]')) && (await bo.page.textContent('.panel')).includes('Waiting for Ada'), 'non-host has no Start control');
await ada.page.click('[data-start]');
check(await waitFor(bo.page, () => window.__cloudborne?.screen().hand.length === 7), 'both enter the game; Bo sees his 7 cards');
check(await waitFor(ada.page, () => window.__cloudborne?.screen().hand.length === 8), 'Ada (first player) has drawn her turn card: 8 cards');
check((await ada.page.textContent('.status')).includes('Your turn') && (await bo.page.textContent('.status')).includes("Ada's turn"), 'turn indicator agrees on both screens');
check(await bo.page.isDisabled('.end-turn'), "Bo cannot end Ada's turn");

console.log('Synchronized political play');
await playCard(ada.page, 'merchant-king');
check(
  await waitFor(bo.page, () => window.__cloudborne.screen().table.some((c) => c.zone === 'character' && c.defId === 'merchant-king' && c.owner === 0)),
  "Ada's recruited Character appears in her area on Bo's screen",
);
check(await waitFor(bo.page, () => [...document.querySelectorAll('.plate')].some((p) => p.textContent.includes('Ada') && p.textContent.includes('5 Gold'))), 'Bo sees Ada’s Gold drop to 5');
const schemeId = await playCard(ada.page, 'planted-scandal');
check(await waitFor(bo.page, (id) => window.__cloudborne.screen().table.some((c) => c.id === id && c.defId === 'hidden'), schemeId), 'Bo sees a face-down Scheme');
check(!(await logText(bo.page)).includes('Planted Scandal'), 'Bo’s log does not name it');
await ada.page.click('.end-turn');
check(await waitFor(bo.page, () => document.querySelector('.status').textContent.includes('Your turn')), 'turn passes to Bo');
check(await waitFor(bo.page, () => window.__cloudborne.screen().hand.length === 8), 'Bo drew his turn card automatically');

console.log('Investigation with a reload mid-decision');
await clickHandCard(bo.page, 'senate-intervention');
await bo.page.waitForSelector('.selection .target');
await clickTableCard(bo.page, schemeId);
await bo.page.click('.selection [data-confirm]');
check(await waitFor(ada.page, () => !document.querySelector('.decision')?.hidden), 'Ada gets the reaction decision');
check(await waitFor(bo.page, () => document.querySelector('.status').textContent.includes('Ada is responding')), 'Bo waits while Ada decides');
check(await bo.page.isDisabled('.end-turn'), 'Bo cannot end his turn during the reaction');
if (shots) await ada.page.screenshot({ path: `${shots}/lan-ada-decides.png` });
await ada.page.reload();
check(await waitFor(bo.page, () => document.querySelector('.banner')?.textContent.includes('paused') ?? false), 'Bo sees the game paused while Ada is away');
check(await waitFor(ada.page, () => !document.querySelector('.decision')?.hidden && document.querySelector('.decision')?.textContent.includes('Planted Scandal'), undefined, 8000), 'after reloading, Ada still has the decision');
check(await waitFor(bo.page, () => document.querySelector('.banner')?.hidden === true), 'game resumes for Bo');
await ada.page.click('.decision button:has-text("Vanish")');
check(await waitFor(bo.page, () => document.querySelector('.log ol').textContent.includes('Vanish in the Crowd')), 'Bo sees Vanish in the Crowd played');
check(await waitFor(bo.page, (id) => window.__cloudborne.screen().table.some((c) => c.id === id && c.zone === 'scheme' && c.defId === 'hidden'), schemeId), 'the Scheme stays hidden on Bo’s table');
check(await waitFor(bo.page, () => !document.querySelector('.end-turn').disabled), 'priority returns to Bo');
check((await plateText(bo.page, 'Bo')).includes('P 2'), 'Bo was not punished (the reveal was cancelled)');

console.log('Hidden information in Bo’s traffic');
const boSnaps = snapshots(bo.frames);
const refs = boSnaps.flatMap((s) => mentions(s, schemeId));
check(boSnaps.length > 5 && refs.length > 0, `Bo received ${boSnaps.length} snapshots mentioning the Scheme ${refs.length} times`);
check(refs.every((r) => (r.defId === undefined || r.defId === 'hidden') && (r.target === undefined || r.target === null)), 'never with its definition or target');
const boFrames = bo.frames.join('\n');
check(!boFrames.includes('"incomeRolls"') && !boFrames.includes('"drawPile"') && !boFrames.includes('"instances"'), 'no deck order, income rolls or canonical state in Bo’s traffic');
const adaHand = (await screenInfo(ada.page)).hand.map((c) => c.id);
check(adaHand.length > 3 && adaHand.every((id) => !boFrames.includes(`"${id}"`)), `none of Ada's ${adaHand.length} hand card ids reached Bo`);

console.log('Late joiner');
const eve = await browser.newContext().then((c) => c.newPage());
await eve.goto(`${BASE}/`);
await eve.click('[data-mode=lan]');
await eve.fill('input[name=name]', 'Eve');
await eve.click('button[type=submit]');
check(await waitFor(eve, () => document.querySelector('.error')?.textContent.includes('in progress') ?? false), 'a new player cannot take a seat during a game');

check(bo.frames.length > 0, 'Socket.IO traffic upgraded to WebSocket through this origin');
check(errors.length === 0, `no page errors ${errors.join(' | ')}`);
await browser.close();
done();
