/**
 * Shared helpers for the optional browser smoke checks.
 * Requires Playwright (`npm i -D playwright && npx playwright install chromium`),
 * which is intentionally not a project dependency.
 */
import { createRequire } from 'node:module';

export async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    /* fall through: a global install is visible to require() via NODE_PATH */
  }
  try {
    return createRequire(import.meta.url)('playwright');
  } catch {
    console.error('These checks need Playwright: npm i -D playwright && npx playwright install chromium');
    process.exit(2);
  }
}

export const BASE = (process.argv[2] ?? process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
/** The seed whose opening the scripts rely on (see the scripts' headers). */
export const SEED = 137;

let failures = 0;
export function check(cond, message) {
  if (cond) console.log(`  ✓ ${message}`);
  else {
    failures++;
    console.log(`  ✗ ${message}`);
  }
}
export function done() {
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

export const launchArgs = { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };

export const screenInfo = (page) => page.evaluate(() => window.__cloudborne?.screen() ?? null);
export const viewInfo = (page) => page.evaluate(() => window.__cloudborne?.view() ?? null);
export const waitFor = (page, fn, arg, timeout = 5000) => page.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);

/** Clicks the first hand card with this definition; returns its instance id (or null). */
export async function clickHandCard(page, defId) {
  const info = await screenInfo(page);
  const c = info.hand.find((h) => h.defId === defId);
  if (!c) return null;
  // Aim low on the card so overlapping neighbours don't catch the click.
  await page.mouse.click(c.x, c.y + 30);
  return c.id;
}

/** Clicks a table card by instance id (logical layout position). */
export async function clickTableCard(page, id) {
  const info = await screenInfo(page);
  const c = info.table.find((t) => t.id === id);
  if (!c) return false;
  await page.mouse.move(c.x, c.y);
  await page.mouse.click(c.x, c.y);
  return true;
}

/** Selects a hand card, optionally picks a target button by visible text, and confirms. */
export async function playCard(page, defId, targetText) {
  const id = await clickHandCard(page, defId);
  if (!id) return null;
  await page.waitForSelector('.selection [data-confirm]');
  if (targetText) await page.click(`.selection .target:has-text("${targetText}")`);
  await page.click('.selection [data-confirm]');
  return id;
}

export async function toastText(page) {
  return (await page.isVisible('.toast')) ? await page.textContent('.toast') : '';
}

export const logText = (page) => page.textContent('.log ol');
export const plateText = (page, name) => page.evaluate((n) => [...document.querySelectorAll('.plate')].find((p) => p.querySelector('.pl-name')?.textContent === n)?.textContent ?? '', name);
