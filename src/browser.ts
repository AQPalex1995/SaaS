import { chromium, type BrowserContext, type Page } from 'playwright';
import { PROFILE_DIR } from './paths';
import { log } from './logs';

export async function openBrowser(headless: boolean): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless,
    viewport: headless ? { width: 1366, height: 900 } : null,
    locale: 'es-PE',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      ...(headless ? [] : ['--start-maximized']),
    ],
  });
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    (window as unknown as Record<string, unknown>).chrome = undefined;
    (window as unknown as Record<string, unknown>).__name = (target: unknown) => target;
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  page.setDefaultTimeout(25000);
  return { ctx, page };
}

export async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(2500);
    const cookies = await page.context().cookies('https://www.facebook.com');
    return cookies.some((c) => c.name === 'c_user');
  } catch (e) {
    log('error', `fallo al verificar sesión de Facebook: ${e}`);
    return false;
  }
}

export async function waitForLogin(page: Page, timeoutMs: number): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const cookies = await page.context().cookies('https://www.facebook.com').catch(() => []);
    if (cookies.some((c) => c.name === 'c_user')) return true;
    await sleep(3000);
  }
  return false;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function randomDelay(minSec: number, maxSec: number): Promise<void> {
  return sleep((minSec + Math.random() * (maxSec - minSec)) * 1000);
}

export async function scrollPage(page: Page, times: number): Promise<void> {
  await page.mouse.move(650, 450).catch(() => {});
  for (let i = 0; i < times; i++) {
    await page.mouse.wheel(0, 1400).catch(() => {});
    await page.evaluate(() => window.scrollBy(0, 800)).catch(() => {});
    await sleep(900 + Math.random() * 1200);
  }
}

export function chromiumExists(): boolean {
  try {
    const p = chromium.executablePath();
    return !!p;
  } catch {
    return false;
  }
}