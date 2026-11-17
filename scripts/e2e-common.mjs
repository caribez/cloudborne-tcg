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
export const tablePoint = (page, x, y) => page.evaluate(([x, y]) => window.__cloudborne.tablePoint(x, y), [x, y]);

export async function clickHandCard(page, index) {
  const info = await screenInfo(page);
  const c = info.hand[index];
  // Aim low on the card so overlapping neighbours don't catch the click.
  await page.mouse.click(c.x, c.y + 20);
  return c.id;
}

export async function playAt(page, handIndex, x, y) {
  const id = await clickHandCard(page, handIndex);
  const p = await tablePoint(page, x, y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
  return id;
}

export async function toastText(page) {
  return (await page.isVisible('.toast')) ? await page.textContent('.toast') : '';
}
