import path from 'node:path';
import type { Page } from 'playwright';
import { openBrowser, isLoggedIn, sleep, randomDelay, waitForLogin } from './browser';
import { autoLogin, getCredentials } from './auth';
import { searchGroup, searchMarketplace, isoDate, isoTime } from './searchers';
import { scrapeAdondeVivir, scrapeUrbania } from './portals';
import { config, isPlaceholderGroup, totalSearches } from './config';
import { appendBitacora, writeListingsCsv } from './exportCsv';
import { store } from './store';
import { CSV_PATH, DATA_DIR } from './paths';
import { log } from './logs';
import { loadGroups } from './groupsManager';

export interface RuntimeStatus {
  state: 'idle' | 'running' | 'paused' | 'require_login' | 'error' | 'stopped';
  step: string;
  cycle: number;
  lastRun: string | null;
  nextRun: string | null;
  lastBusquedas: number;
  lastNuevos: number;
  totalEnCsv: number;
  loggedIn: boolean;
  intervalMin: number;
  csvPath: string;
}

export const status: RuntimeStatus = {
  state: 'idle',
  step: 'esperando primer ciclo',
  cycle: 0,
  lastRun: null,
  nextRun: null,
  lastBusquedas: 0,
  lastNuevos: 0,
  totalEnCsv: 0,
  loggedIn: false,
  intervalMin: config.searchIntervalMinutes,
  csvPath: CSV_PATH,
};

let nextRunAt = Date.now() + config.firstRunDelaySec * 1000;
let cycleActive = false;
let stopRequested = false;
let stopped = false;
let loopRunning = false;

function fmtISO(d: Date): string {
  return `${isoDate(d)} ${isoTime(d)}`;
}

function recomputeTotals(): void {
  status.totalEnCsv = store.count();
}

export function startScheduler(): void {
  if (loopRunning) return;
  loopRunning = true;
  status.nextRun = fmtISO(new Date(nextRunAt));
  void (async () => {
    while (!stopped) {
      if (status.state !== 'paused' && !cycleActive && Date.now() >= nextRunAt) {
        await runCycle();
        if (stopped) break;
        nextRunAt = Date.now() + config.searchIntervalMinutes * 60_000;
        status.nextRun = fmtISO(new Date(nextRunAt));
      }
      await sleep(10_000);
    }
    loopRunning = false;
  })();
}

export function stopEverything(): void {
  stopped = true;
  stopRequested = true;
  status.state = 'stopped';
  status.step = 'todo detenido';
  status.nextRun = null;
  log('warn', 'Todo detenido por el usuario. Reinicia con el botón Reiniciar o vuelve a abrir iniciar-scout.bat.');
}

export function restartScheduler(): void {
  stopped = false;
  stopRequested = false;
  if (status.state === 'paused') status.state = 'idle';
  nextRunAt = Date.now() + 10_000;
  status.nextRun = fmtISO(new Date(nextRunAt));
  status.state = 'idle';
  status.step = 'reenciado';
  startScheduler();
  log('ok', 'Scheduler reiniciado.');
}

export async function runNow(): Promise<{ ok: boolean; msg: string }> {
  if (stopped) return { ok: false, msg: 'Todo está detenido. Pulsa Reiniciar primero.' };
  if (cycleActive) return { ok: false, msg: 'Ya hay un ciclo en curso.' };
  if (status.state === 'paused') return { ok: false, msg: 'Scheduler en pausa. Reanúdalo primero.' };
  nextRunAt = Date.now();
  status.nextRun = 'ahora';
  return { ok: true, msg: 'Ciclo encolado.' };
}

export function pause(): void {
  if (stopped) return;
  if (status.state === 'paused') return;
  status.state = 'paused';
  status.step = 'en pausa';
  log('warn', 'Scheduler en pausa.');
}

export function resume(): void {
  if (stopped) return;
  if (status.state !== 'paused') return;
  status.state = 'idle';
  status.step = 'reanudado';
  nextRunAt = Date.now() + 10_000;
  status.nextRun = fmtISO(new Date(nextRunAt));
  log('ok', 'Scheduler reanudado.');
}

export function stopCurrentCycle(): void {
  stopRequested = true;
  log('warn', 'Detención solicitada; el ciclo se cortará al terminar la búsqueda actual.');
}

let loginInProgress = false;
let activeLoginPage: Page | null = null;

export function isLoginInProgress(): boolean {
  return loginInProgress;
}

export function getActiveLoginPage(): Page | null {
  return activeLoginPage;
}

export async function takeLoginScreenshot(page: Page): Promise<string | null> {
  try {
    const p = path.join(DATA_DIR, 'fb-login-preview.png');
    await page.screenshot({ path: p });
    return p;
  } catch {
    return null;
  }
}

export async function submitVerificationCode(code: string): Promise<{ ok: boolean; msg: string }> {
  if (!activeLoginPage) {
    return { ok: false, msg: 'No hay un proceso de verificación activo en este momento. Pulsa "Iniciar sesión FB" primero.' };
  }
  try {
    const page = activeLoginPage;
    const input = page.locator(
      'input[name="approvals_code"], input[id="approvals_code"], input[autocomplete="one-time-code"], input[type="number"], input[type="text"]'
    ).first();

    if (await input.isVisible({ timeout: 5000 })) {
      await input.fill(code.trim());
      log('info', `Código de verificación [${code.trim()}] ingresado en Facebook. Enviando...`);
      const submit = page.locator(
        'button[type="submit"], #checkpointSubmitButton, button:has-text("Continuar"), button:has-text("Enviar"), button:has-text("Confirmar"), button:has-text("Continue")'
      ).first();
      await submit.click().catch(async () => {
        await input.press('Enter');
      });
      await sleep(3500);
      await takeLoginScreenshot(page);
      return { ok: true, msg: 'Código enviado a Facebook. Esperando confirmación...' };
    } else {
      return { ok: false, msg: 'No se encontró el campo de código en la pantalla de Facebook.' };
    }
  } catch (e) {
    return { ok: false, msg: `Error al enviar código: ${e}` };
  }
}

export async function loginFromPanel(): Promise<{ ok: boolean; msg: string }> {
  if (stopped) return { ok: false, msg: 'Todo está detenido. Pulsa Reiniciar primero.' };
  if (cycleActive) return { ok: false, msg: 'Hay un ciclo en curso; espera a que termine.' };
  if (loginInProgress) return { ok: false, msg: 'Ya hay un inicio de sesión en curso.' };

  loginInProgress = true;
  log('info', 'Iniciando navegador para verificar cuenta de Facebook...');
  status.state = 'running';
  status.step = 'conectando con Facebook';
  let browserCtx = null;
  try {
    const { ctx, page } = await openBrowser(false);
    browserCtx = ctx;
    activeLoginPage = page;
    await page.bringToFront().catch(() => {});

    if (getCredentials()) {
      status.step = 'probando login automático con tus credenciales';
      log('info', 'Intentando login automático con tus credenciales...');
      const res = await autoLogin(page);
      if (res === 'ok') {
        status.loggedIn = true;
        log('ok', '¡Sesión de Facebook iniciada y activa!');
        status.state = 'idle';
        status.step = 'sesión activa';
        recomputeTotals();
        return { ok: true, msg: 'Sesión iniciada correctamente.' };
      }
      if (res === 'needs_manual') {
        await takeLoginScreenshot(page);
        log('warn', 'Facebook solicitó verificación (código SMS, WhatsApp o 2FA). Puedes ingresar el código directamente aquí en el panel web.');
        status.step = 'esperando código de verificación';
      } else {
        await takeLoginScreenshot(page);
        log('warn', 'Completa el acceso en la ventana de Chromium o ingresa el código aquí en el panel.');
        status.step = 'esperando ingreso en Chromium';
        await page.goto('https://www.facebook.com/login', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
      }
    } else {
      log('info', 'No hay credenciales guardadas. Inicia sesión en Facebook.');
      status.step = 'esperando credenciales';
      await page.goto('https://www.facebook.com/login', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
    }

    const ok = await waitForLogin(page, 15 * 60 * 1000);
    status.loggedIn = ok;
    if (ok) {
      log('ok', '¡Sesión de Facebook guardada con éxito en el perfil permanente!');
    } else {
      log('warn', 'Tiempo de espera agotado sin detectar sesión. Puedes volver a intentar.');
    }
    status.state = ok ? 'idle' : 'require_login';
    status.step = ok ? 'sesión activa' : 'requiere login';
    recomputeTotals();
    return { ok, msg: ok ? 'Sesión de Facebook activa.' : 'No se completó el login.' };
  } catch (e) {
    log('error', `Error durante el inicio de sesión: ${e}`);
    status.state = 'require_login';
    status.step = 'error en login';
    return { ok: false, msg: String(e) };
  } finally {
    loginInProgress = false;
    activeLoginPage = null;
    if (browserCtx) {
      await browserCtx.close().catch(() => {});
    }
  }
}

async function runCycle(): Promise<void> {
  cycleActive = true;
  stopRequested = false;
  status.cycle += 1;
  status.state = 'running';
  status.step = 'iniciando navegador';
  const started = new Date();
  let busquedas = 0;
  let nuevos = 0;
  let estado = 'ok';
  log('info', `=== CICLO #${status.cycle} inicio (${fmtISO(started)}) ===`);
  const { ctx, page } = await openBrowser(config.headless);
  try {
    status.step = 'verificando sesión de Facebook';
    let logged = await isLoggedIn(page);
    if (!logged && getCredentials()) {
      status.step = 'intentando re-login automático';
      log('warn', 'Sesión de Facebook expirada: intentando login automático...');
      const res = await autoLogin(page);
      if (res === 'ok') {
        logged = true;
        log('ok', 'Re-login automático exitoso.');
      } else if (res === 'needs_manual') {
        estado = 'sin_sesion';
        status.state = 'require_login';
        status.step = 'requiere login manual (checkpoint)';
        log('warn', 'Facebook pidió verificación: completa el login desde el panel.');
        return;
      }
    }
    status.loggedIn = logged;
    if (!logged) {
      estado = 'sin_sesion';
      status.state = 'require_login';
      status.step = 'requiere login (botón Iniciar sesión)';
      log('warn', 'Sesión de Facebook inactiva: ciclo #' + status.cycle + ' saltado.');
      return;
    }

    for (const query of config.marketplaceQueries) {
      if (!query.trim()) continue;
      if (stopRequested) { estado = 'detenido'; break; }
      status.step = `marketplace: "${query}"`;
      const out = await searchMarketplace(page, query, started);
      busquedas += 1;
      nuevos += out.inserted;
      await randomDelay(config.delayMinSec, config.delayMaxSec);
    }

    for (const group of config.groups) {
      if (isPlaceholderGroup(group)) continue;
      if (stopRequested) { estado = 'detenido'; break; }
      status.step = `grupo: ${group.name}`;
      const out = await searchGroup(page, group.name, group.url, started);
      busquedas += 1;
      nuevos += out.inserted;
      await randomDelay(config.delayMinSec, config.delayMaxSec);
    }

    if (!stopRequested) {
      status.step = 'portales: AdondeVivir';
      const outAv = await scrapeAdondeVivir(started);
      busquedas += 1;
      nuevos += outAv.inserted;
      await randomDelay(2, 4);

      status.step = 'portales: Urbania';
      const outUrb = await scrapeUrbania(started);
      busquedas += 1;
      nuevos += outUrb.inserted;
      await randomDelay(2, 4);
    }

    recomputeTotals();
    writeListingsCsv(store.all());
    status.lastRun = fmtISO(new Date());
    status.lastBusquedas = busquedas;
    status.lastNuevos = nuevos;
    appendBitacora({
      inicio: fmtISO(started),
      fin: fmtISO(new Date()),
      busquedas,
      nuevos,
      estado,
    });
    status.step = `listo: ${busquedas} búsquedas, ${nuevos} nuevos, total ${status.totalEnCsv}`;
    log('ok', `=== CICLO #${status.cycle} fin: ${busquedas} búsquedas, ${nuevos} nuevos, ${status.totalEnCsv} en CSV ===`);
  } catch (e) {
    estado = 'error';
    log('error', `Ciclo #${status.cycle} falló: ${e}`);
    status.step = 'error del ciclo';
  } finally {
    await ctx.close().catch(() => {});
    if (stopped) {
      status.state = 'stopped';
      status.step = 'todo detenido';
    } else if (status.state === 'require_login') {
      recomputeTotals();
    } else {
      status.state = 'idle';
      if (!status.loggedIn) status.state = 'require_login';
    }
    cycleActive = false;
  }
}