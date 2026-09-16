import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { DATA_DIR } from './paths';
import { sleep } from './browser';
import { log } from './logs';

const CRED_FILENAME = 'fb-credentials.json';

export interface FbCredentials {
  identifier: string;
  password: string;
}

export type AutoLoginResult = 'ok' | 'needs_manual' | 'no_credentials' | 'gave_up' | 'error';

export function credentialsPath(): string {
  return path.join(DATA_DIR, CRED_FILENAME);
}

export function getCredentials(): FbCredentials | null {
  try {
    const raw = fs.readFileSync(credentialsPath(), 'utf8');
    const parsed = JSON.parse(raw) as FbCredentials;
    if (!parsed.identifier || !parsed.password) return null;
    return parsed;
  } catch {
    return null;
  }
}

function hasSession(page: Page): Promise<boolean> {
  return page
    .context()
    .cookies('https://www.facebook.com')
    .then((cookies) => cookies.some((c) => c.name === 'c_user'))
    .catch(() => false);
}

function isChallengeUrl(url: string): boolean {
  return /checkpoint|challenge|login_attempt|two_step/i.test(url);
}

export async function autoLogin(page: Page): Promise<AutoLoginResult> {
  const creds = getCredentials();
  if (!creds) return 'no_credentials';
  if (await hasSession(page)) return 'ok';
  try {
    await page.goto('https://www.facebook.com/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(1500);

    if (await hasSession(page)) return 'ok';
    if (isChallengeUrl(page.url())) return 'needs_manual';

    // Cerrar/aceptar banner de cookies si existe
    const cookieBtns = [
      'button[data-cookiebanner="accept_button"]',
      'button[data-cookiebanner="accept_only_essential_button"]',
      'button:has-text("Permitir todas las cookies")',
      'button:has-text("Aceptar todas")',
      'button:has-text("Allow all cookies")',
      'button:has-text("Solo cookies esenciales")',
    ];
    for (const sel of cookieBtns) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 1500 })) {
          await btn.click();
          await sleep(1000);
          break;
        }
      } catch {}
    }

    const identifier = page.locator('#email, input[name="email"], input[type="email"], #m_login_email, input[autocomplete="username"]').first();
    await identifier.waitFor({ state: 'visible', timeout: 25000 });
    await identifier.fill(creds.identifier);

    const password = page.locator('#pass, input[name="pass"], input[type="password"], #m_login_password').first();
    await password.waitFor({ state: 'visible', timeout: 10000 });
    await password.fill(creds.password);

    await page.locator('input[name="persist"], input[type="checkbox"]').first().check().catch(() => {});

    const submit = page.locator('button[name="login"], #loginbutton, button[type="submit"], input[type="submit"]').first();
    await submit.click().catch(async () => {
      await password.press('Enter');
    });

    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      if (isChallengeUrl(page.url())) return 'needs_manual';
      if (await hasSession(page)) {
        log('ok', 'Login automático de Facebook completado.');
        return 'ok';
      }
      await sleep(3000);
    }
    if (isChallengeUrl(page.url())) return 'needs_manual';
    log('warn', 'Login automático sin confirmar; revisa el navegador abierto.');
    return 'gave_up';
  } catch (e) {
    log('error', `Login automático falló: ${e}`);
    return 'error';
  }
}