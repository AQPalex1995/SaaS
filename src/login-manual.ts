import { openBrowser, waitForLogin } from './browser';
import { autoLogin, getCredentials } from './auth';
import { log } from './logs';

async function main() {
  console.log('====================================================');
  console.log('  FB Terreno Scout - Inicio de Sesion Interactivo');
  console.log('====================================================\n');
  console.log('Abriendo ventana de Chromium en tu pantalla...');
  
  const { ctx, page } = await openBrowser(false);
  try {
    const creds = getCredentials();
    if (creds) {
      console.log(`Intentando acceso automatico con: ${creds.identifier}...`);
      const res = await autoLogin(page);
      if (res === 'ok') {
        console.log('\n[EXITO] Sesion de Facebook detectada e iniciada.');
        return;
      }
      if (res === 'needs_manual') {
        console.log('\n[AVISO] Facebook solicito verificacion (codigo SMS, WhatsApp o 2FA).');
        console.log('Por favor completa el codigo en la ventana de Chromium abierta.');
      } else {
        console.log('\nCompleta el login manualmente en la ventana de Chromium.');
      }
    } else {
      console.log('No hay credenciales guardadas. Inicia sesion en la ventana abierta.');
      await page.goto('https://www.facebook.com/login').catch(() => {});
    }

    console.log('\nEsperando a que completes el inicio de sesion (tienes hasta 15 minutos)...');
    const ok = await waitForLogin(page, 15 * 60 * 1000);
    if (ok) {
      console.log('\n====================================================');
      console.log('  [EXITO] Sesion de Facebook guardada permanentemente!');
      console.log('  Ya puedes cerrar esta ventana y volver al panel web.');
      console.log('====================================================');
    } else {
      console.log('\n[AVISO] Tiempo agotado sin detectar sesion activa.');
    }
  } finally {
    await ctx.close().catch(() => {});
  }
}

main().catch(console.error);
