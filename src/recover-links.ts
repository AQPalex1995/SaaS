import { config, isPlaceholderGroup } from './config';
import { openBrowser, isLoggedIn } from './browser';
import { recoverGroupLinks } from './searchers';
import { store } from './store';
import { writeListingsCsv } from './exportCsv';
import { log } from './logs';

/**
 * Backfill en vivo de enlaces de grupos (opción 2 del fix).
 *
 * Re-visita cada grupo con la sesión de Facebook existente y actualiza las
 * filas ya guardadas que no tienen permalink real. Requiere sesión iniciada
 * (usa el perfil persistente del Scout). No inserta publicaciones nuevas.
 *
 * Uso: npm.cmd run recover:links
 */
async function main(): Promise<void> {
  const { ctx, page } = await openBrowser(false);
  try {
    if (!(await isLoggedIn(page))) {
      log('warn', 'Sesión de Facebook inactiva. Inicia sesión en el Scout y vuelve a ejecutar recover:links.');
      return;
    }

    let scanned = 0;
    let fixed = 0;
    for (const g of config.groups) {
      if (isPlaceholderGroup(g)) continue;
      const res = await recoverGroupLinks(page, g.name, g.url);
      scanned += res.scanned;
      fixed += res.fixed;
      log('info', `  [recover] ${g.name}: ${res.fixed}/${res.scanned} enlaces recuperados`);
    }

    if (fixed > 0) writeListingsCsv(store.all());
    log('ok', `Recuperación completa: ${fixed} enlaces actualizados (${scanned} publicaciones revisadas).`);
  } finally {
    await ctx.close().catch(() => {});
  }
}

main().catch((e) => {
  log('error', `recover-links falló: ${e}`);
  process.exit(1);
});
