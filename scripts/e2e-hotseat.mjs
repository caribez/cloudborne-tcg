/**
 * Browser smoke check for hotseat mode and its handoff privacy.
 * Usage: npm run build && npm start   (in another terminal)
 *        node scripts/e2e-hotseat.mjs [http://localhost:3000]
 */
import { BASE, check, clickHandCard, done, launchArgs, loadPlaywright, playAt, screenInfo, tablePoint, toastText } from './e2e-common.mjs';

const { chromium } = await loadPlaywright();
const browser = await chromium.launch(launchArgs);
const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const socketRequests = [];
page.on('request', (r) => r.url().includes('/socket.io') && socketRequests.push(r.url()));

console.log('Hotseat setup');
await page.goto(`${BASE}/?e2e`);
await page.click('[data-mode=hotseat]');
await page.click('[data-count="3"]');
for (const [i, n] of ['Ada', 'Bo', 'Cy'].entries()) await page.fill(`input[data-seat="${i}"]`, n);
await page.click('button[type=submit]');
check((await page.textContent('.privacy h1')) === 'Pass to Ada', 'opens on an opaque "Pass to Ada" screen');
check((await screenInfo(page)).hand.length === 0, 'no hand cards exist behind the first privacy screen');

await page.click('[data-ready]');
let info = await screenInfo(page);
check(info.hand.length === 5, 'Ada sees 5 hand cards after confirming');
check((await page.textContent('.players')).includes('Bo') && (await page.textContent('.players')).includes('5 cards'), 'other players shown with hand counts');

console.log('Play, limits and rejections');
const played = await playAt(page, 0, 0, 0);
info = await screenInfo(page);
check(info.tweens > 0, 'play starts a brief animation');
check(info.table.length === 1 && info.table[0].id === played, 'card placed on the table');
await playAt(page, 0, 10, 5);
check((await toastText(page)).includes('already played'), 'second play rejected in plain language');
await page.keyboard.press('Escape');
check(await page.isHidden('.selection'), 'Escape cancels the selection');

const deck = (await screenInfo(page)).deck;
await page.mouse.click(deck.x, deck.y);
info = await screenInfo(page);
check(info.hand.length === 5 && info.tweens > 0, 'clicking the draw pile draws with an animation');
check(await page.isDisabled('.draw'), 'Draw button disabled after drawing once');
await page.keyboard.press('d');
await page.waitForTimeout(50);
check((await page.textContent('.log ol')).match(/Ada drew a card/g)?.length === 1, 'pressing D again does not draw twice');

console.log('Handoff privacy');
await clickHandCard(page, 1); // a lingering selection + inspector preview
check(await page.isVisible('.inspector'), 'inspector open before ending the turn');
await page.click('.end');
info = await screenInfo(page);
check((await page.textContent('.privacy h1')) === 'Pass to Bo', 'End turn shows "Pass to Bo" immediately');
check(info.hand.length === 0 && info.tweens === 0, 'outgoing hand removed and animations stopped at handoff');
check(await page.isHidden('.inspector'), 'private preview dismissed');
const covers = await page.$eval('.privacy', (el) => {
  const r = el.getBoundingClientRect();
  const bg = getComputedStyle(el).backgroundColor;
  return r.width >= innerWidth && r.height >= innerHeight && !bg.includes('rgba');
});
check(covers, 'privacy screen is opaque and covers the window');
const logBefore = await page.textContent('.log ol');
await page.keyboard.press('d');
await page.keyboard.press('e');
await page.mouse.move(700, 760);
await page.mouse.click(700, 760);
check((await page.textContent('.log ol')) === logBefore, 'keys and clicks do nothing behind the privacy screen');

await page.click('[data-ready]');
info = await screenInfo(page);
check(info.hand.length === 5 && !info.hand.some((c) => c.id === played), "Bo's hand revealed only after confirmation");

console.log('Hide hand');
await page.getByRole('button', { name: 'Hide hand' }).click();
check((await page.textContent('.privacy h1')) === 'Hand hidden' && (await screenInfo(page)).hand.length === 0, 'Hide hand returns to a privacy screen');
await page.click('[data-ready]');
check((await page.textContent('.turn-status')).includes('Your turn'), 'same player resumes after Hide hand');

console.log('Overlapping cards stay inspectable');
await playAt(page, 0, 0.5, 0.5);
await page.waitForTimeout(500);
const p = await tablePoint(page, 0.3, 0.3);
await page.mouse.move(p.x, p.y);
await page.mouse.click(p.x, p.y);
check((await page.textContent('.inspector')).includes('2 overlapping cards'), 'inspector lists the overlapping pile');
const firstName = await page.textContent('.inspector h3');
await page.mouse.click(p.x, p.y);
const secondName = await page.textContent('.inspector h3');
check(firstName !== secondName, `clicking again cycles to the card underneath (${firstName} → ${secondName})`);

console.log('Resize');
await page.setViewportSize({ width: 1024, height: 700 });
await page.waitForTimeout(200);
info = await screenInfo(page);
check(info.hand.every((c) => c.x > 0 && c.x < 1024 && c.y > 0 && c.y < 700), 'hand stays on screen after resizing');
check(info.table.every((c) => c.x > 0 && c.x < 1024 && c.y > 52 && c.y < 700), 'table cards stay on screen after resizing');

check(socketRequests.length === 0, 'hotseat makes no multiplayer connection');
check(errors.length === 0, `no page errors ${errors.join(' | ')}`);
await browser.close();
done();
