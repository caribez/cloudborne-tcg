/**
 * Browser smoke check for hotseat mode: the political turn loop, a hidden
 * Scheme, an investigation with a priority handoff to the Scheme owner, the
 * Planted Scandal trap, a marriage, handoff privacy, and a full game to the
 * results screen.
 *
 * Uses `?e2e&seed=137`: Ada opens with Merchant King, Convenient Betrothal,
 * Planted Scandal, Corruption and Vanish in the Crowd (and Faeoa as a Child);
 * Bo draws into a Senate Intervention.
 *
 * Usage: npm run build && npm start   (in another terminal)
 *        node scripts/e2e-hotseat.mjs [http://localhost:3000]
 */
import { BASE, check, clickHandCard, clickTableCard, done, launchArgs, loadPlaywright, logText, plateText, playCard, screenInfo, SEED, toastText, viewInfo } from './e2e-common.mjs';

const { chromium } = await loadPlaywright();
const browser = await chromium.launch(launchArgs);
const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const socketRequests = [];
page.on('request', (r) => r.url().includes('/socket.io') && socketRequests.push(r.url()));
const shots = process.env.E2E_SHOTS;
const shot = async (name) => shots && page.screenshot({ path: `${shots}/hotseat-${name}.png` });

console.log('Setup and first handoff');
await page.goto(`${BASE}/?e2e&seed=${SEED}`);
await page.click('[data-mode=hotseat]');
await page.click('[data-count="2"]');
for (const [i, n] of ['Ada', 'Bo'].entries()) await page.fill(`input[data-seat="${i}"]`, n);
await page.click('button[type=submit]');
check((await page.textContent('.privacy h1')) === 'Pass to Ada', 'opens on an opaque "Pass to Ada" screen');
check((await screenInfo(page)).hand.length === 0, 'no hand cards exist behind the first privacy screen');
await page.click('[data-ready]');
let info = await screenInfo(page);
check(info.hand.length === 8, 'Ada sees 7 dealt cards + 1 automatic draw');
check((await plateText(page, 'Ada')).includes('6 Gold') && (await plateText(page, 'Bo')).includes('3 Gold'), 'Gold shown on nameplates (Ada 3 + income 3, Bo 3)');
check((await plateText(page, 'Bo')).includes('A 2') && (await plateText(page, 'Bo')).includes('= 6'), 'standings and score shown for every family');
check(info.table.filter((c) => c.zone === 'child').length === 4, 'both families show two public Children');

console.log('Recruit, marry and place a Scheme');
await playCard(page, 'merchant-king');
await page.waitForTimeout(150);
info = await screenInfo(page);
check(info.table.some((c) => c.zone === 'character' && c.defId === 'merchant-king' && c.owner === 0), 'Merchant King moves to Ada’s Character area');
check((await plateText(page, 'Ada')).includes('5 Gold'), 'recruiting costs 1 Gold');
await clickHandCard(page, 'convenient-betrothal');
await page.waitForSelector('.selection .target');
const pairs = await page.$$eval('.selection .target', (bs) => bs.map((b) => b.textContent));
check(pairs.length === 1 && pairs[0].includes('Faeoa of the Moon ⚭ Merchant King'), `legal marriage listed (${pairs.join(' | ')})`);
check(await page.isEnabled('.selection [data-confirm]'), 'the only legal pair is preselected');
await page.click('.selection [data-confirm]');
await page.waitForTimeout(150);
check((await logText(page)).includes('Faeoa of the Moon ⚭ Merchant King'), 'marriage logged');
check((await plateText(page, 'Ada')).includes('A 3'), 'marriage bonus +1 A applied');
const schemeId = await playCard(page, 'planted-scandal');
await page.waitForTimeout(150);
info = await screenInfo(page);
check(info.table.some((c) => c.id === schemeId && c.zone === 'scheme' && c.defId === 'planted-scandal'), 'Ada sees her own hidden Scheme face up');
check((await logText(page)).includes('Ada placed a hidden Scheme') && !(await logText(page)).includes('Planted Scandal'), 'log does not name the Scheme');
await clickHandCard(page, 'corruption');
check((await page.textContent('.selection .why')).includes('only while one of your Schemes is being investigated'), 'unplayable card explains why');
await shot('1-ada-turn');
await page.keyboard.press('Escape');
check(await page.isHidden('.selection'), 'Escape cancels the selection');

console.log('Handoff privacy at end of turn');
await clickHandCard(page, 'vanish-in-the-crowd'); // a lingering selection
await page.click('.end-turn');
info = await screenInfo(page);
check((await page.textContent('.privacy h1')) === 'Pass to Bo', 'End turn shows "Pass to Bo" immediately');
check(info.hand.length === 0 && info.tweens === 0, 'outgoing hand removed and animations stopped');
check(info.table.find((c) => c.id === schemeId)?.defId === 'hidden', 'the Scheme face is concealed behind the privacy screen');
check(await page.isHidden('.inspector'), 'private preview dismissed');
const covers = await page.$eval('.privacy', (el) => {
  const r = el.getBoundingClientRect();
  return r.width >= innerWidth && r.height >= innerHeight && !getComputedStyle(el).backgroundColor.includes('rgba');
});
check(covers, 'privacy screen is opaque and covers the window');
const logBefore = await logText(page);
await page.keyboard.press('Escape');
await page.mouse.click(700, 760);
check((await logText(page)) === logBefore, 'keys and clicks do nothing behind the privacy screen');
await page.click('[data-ready]');
info = await screenInfo(page);
check(info.hand.length === 8 && !info.hand.some((c) => c.id === schemeId), "Bo's hand revealed only after confirmation");
check(info.table.find((c) => c.id === schemeId)?.defId === 'hidden', 'Bo sees only a card back for Ada’s Scheme');

console.log('Investigation: priority handoff to the Scheme owner');
await clickHandCard(page, 'senate-intervention');
await page.waitForSelector('.selection .target');
check(!(await page.isEnabled('.selection [data-confirm]')) || (await page.$$('.selection .target')).length === 1, 'Senate Intervention asks for a target');
await clickTableCard(page, schemeId); // pick the target on the table
await page.waitForTimeout(100);
check((await page.textContent('.selection .target.on')).includes("Ada's hidden Scheme"), 'clicking the highlighted Scheme selects it as the target');
await shot('2-bo-targets');
await page.click('.selection [data-confirm]');
check((await page.textContent('.privacy h1')) === 'Pass to Ada', 'priority moves to Ada: "Pass to Ada" handoff');
check((await page.textContent('.privacy p')).includes('investigating'), 'handoff explains the investigation');
check((await screenInfo(page)).hand.length === 0, "Bo's hand is hidden at the reaction handoff");
check(!(await logText(page)).includes('Planted Scandal'), 'Scheme still unnamed before the reveal');
await page.click('[data-ready]');
check(await page.isVisible('.decision'), 'Ada sees the reaction decision panel');
check((await page.textContent('.decision')).includes('Planted Scandal'), 'Ada sees which of her Schemes is investigated');
const buttons = await page.$$eval('.decision button', (bs) => bs.map((b) => b.textContent.trim()));
check(buttons.some((b) => b.includes('Corruption')) && buttons.some((b) => b.includes('Vanish')) && buttons.some((b) => b.includes('Allow')), `responses offered (${buttons.join(' | ')})`);
check(await page.isDisabled('.end-turn'), 'Ada cannot end the turn or act normally');
await shot('3-ada-decides');
await page.click('.decision [data-pass]');
check((await page.textContent('.privacy h1')) === 'Pass back to Bo', 'priority returns to Bo with another handoff');
await page.click('[data-ready]');
const log = await logText(page);
check(log.includes("Exposed: Ada's Scheme was Planted Scandal"), 'the reveal names the Scheme');
check((await plateText(page, 'Bo')).includes('P 0'), 'Planted Scandal cost the investigating family 2 Popularity');
check((await screenInfo(page)).table.some((c) => c.id === schemeId && c.zone === 'discard'), 'revealed Scheme moved to the discard pile');
check(await page.isEnabled('.end-turn'), 'Bo can continue his turn');
await shot('4-trap-sprung');

console.log('Hide hand');
await page.getByRole('button', { name: 'Hide hand' }).click();
check((await page.textContent('.privacy h1')) === 'Hand hidden' && (await screenInfo(page)).hand.length === 0, 'Hide hand returns to a privacy screen');
await page.click('[data-ready]');
check((await page.textContent('.status')).includes('Your turn'), 'same player resumes after Hide hand');

console.log('Play to the end');
let turns = 0;
while (turns < 40) {
  const v = await viewInfo(page);
  if (!v || v.phase === 'finished') break;
  await page.click('.end-turn');
  turns++;
  if (await page.isVisible('[data-ready]')) await page.click('[data-ready]');
}
const final = await viewInfo(page);
check(final?.phase === 'finished' && turns === 15, `game ends after round 8: Bo's turn + 7 rounds × 2 (${turns} more turns)`);
check(await page.isVisible('.results-card'), 'results screen shown');
const results = await page.textContent('.results-card');
check(/Ada wins|Bo wins|Shared victory/.test(results) && results.includes('Score'), 'results show the winner and scores');
check((await screenInfo(page)).hand.length === 0, 'no hand is shown at the end');
await shot('5-results');
await page.click('.results-card [data-close-results]');
check(await page.isVisible('.results.collapsed'), 'results can be hidden to view the table');
await page.click('.results [data-reopen]');
await page.click('.results-card button:has-text("Play again")');
check((await page.textContent('.privacy h1')) === 'Pass to Ada', 'Play again starts a fresh game');

console.log('Resize');
await page.click('[data-ready]');
await page.setViewportSize({ width: 1024, height: 700 });
await page.waitForTimeout(200);
info = await screenInfo(page);
check(info.hand.every((c) => c.x > 0 && c.x < 1024 && c.y > 0 && c.y < 700), 'hand stays on screen after resizing');
check(info.table.every((c) => c.x > 0 && c.x < 1024 && c.y > 52 && c.y < 700), 'table cards stay on screen after resizing');

check(!(await toastText(page)).includes('undefined'), 'no broken messages');
check(socketRequests.length === 0, 'hotseat makes no multiplayer connection');
check(errors.length === 0, `no page errors ${errors.join(' | ')}`);
await browser.close();
done();
