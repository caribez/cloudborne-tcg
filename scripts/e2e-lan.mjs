/**
 * Browser smoke check for LAN mode using separate browser contexts (separate
 * "devices" on one machine). Restart the server first so the lobby is empty.
 * Usage: npm run build && npm start   (in another terminal)
 *        node scripts/e2e-lan.mjs [http://localhost:3000]
 */
import { BASE, check, done, launchArgs, loadPlaywright, playAt, screenInfo, toastText } from './e2e-common.mjs';

const { chromium } = await loadPlaywright();
const browser = await chromium.launch(launchArgs);
const errors = [];

async function player(name) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
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
const waitFor = (page, fn, arg) => page.waitForFunction(fn, arg, { timeout: 5000 }).then(() => true, () => false);

console.log('Lobby');
const ada = await player('Ada');
const bo = await player('Bo');
check((await ada.page.textContent('.seats')).includes('Bo'), 'host sees the second player in the lobby');
check((await ada.page.textContent('.seats')).includes('host'), 'first player is marked host');
check(!(await bo.page.isVisible('[data-start]')) && (await bo.page.textContent('.panel')).includes('Waiting for Ada'), 'non-host has no Start control');
await ada.page.click('[data-start]');
check(await waitFor(bo.page, () => !!window.__cloudborne && window.__cloudborne.screen().hand.length === 5), 'both players enter the game; Bo sees his 5 cards');
check((await ada.page.textContent('.turn-status')).includes('Your turn') && (await bo.page.textContent('.turn-status')).includes("Ada's turn"), 'turn indicator agrees on both screens');
check(await bo.page.isDisabled('.draw'), "Bo cannot draw on Ada's turn");

console.log('Synchronization');
const adaHandStart = (await screenInfo(ada.page)).hand.map((c) => c.id);
const played = await playAt(ada.page, 0, -5, 3);
check(
  await waitFor(bo.page, (id) => window.__cloudborne.screen().table.some((c) => c.id === id), played),
  "Ada's played card appears on Bo's table",
);
await ada.page.click('.draw');
check(await waitFor(bo.page, () => document.querySelector('.deck-count')?.textContent === '29'), 'draw-pile count updates for Bo (30 → 29)');
check(await waitFor(bo.page, () => [...document.querySelectorAll('.player')].find((p) => p.textContent.includes('Ada'))?.textContent.includes('5 cards')), 'Bo sees Ada with 5 cards (count only)');
await ada.page.click('.end-turn');
check(await waitFor(bo.page, () => document.querySelector('.turn-status').textContent.includes('Your turn')), 'turn passes to Bo');
await playAt(bo.page, 0, 0, 0);
await bo.page.waitForTimeout(200);
await playAt(bo.page, 0, 5, 5);
await bo.page.waitForTimeout(300);
check((await toastText(bo.page)).includes('already played'), 'server rejection explained to Bo');

console.log('Refresh / reconnect');
const boHand = (await screenInfo(bo.page)).hand.map((c) => c.id).sort().join();
await bo.page.reload();
check(await waitFor(ada.page, () => document.querySelector('.banner')?.textContent.includes('paused') ?? false), 'Ada sees the game paused while Bo is away');
check(await ada.page.isDisabled('.end-turn'), "Ada's input is disabled during the pause");
check(await waitFor(bo.page, () => window.__cloudborne?.screen().hand.length > 0), 'Bo returns to the game after refreshing');
check((await screenInfo(bo.page)).hand.map((c) => c.id).sort().join() === boHand, 'Bo gets the same seat and hand back');
check(await waitFor(ada.page, () => document.querySelector('.banner')?.hidden === true), 'game resumes for Ada');

console.log('Hidden information');
const adaHandNow = (await screenInfo(ada.page)).hand.map((c) => c.id);
const tableIds = new Set((await screenInfo(bo.page)).table.map((c) => c.id));
const neverPublic = [...new Set([...adaHandStart, ...adaHandNow])].filter((id) => !tableIds.has(id));
const boFrames = bo.frames.join('\n');
check(neverPublic.length >= 4 && neverPublic.every((id) => !boFrames.includes(`"${id}"`)), `none of Ada's ${neverPublic.length} private card ids ever reached Bo`);
check(!boFrames.includes('drawPile"') && !boFrames.includes('"instances"'), 'no deck order or canonical state in Bo’s traffic');

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
