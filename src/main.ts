import { config } from './config';
import { ensureDataDirs } from './paths';
import { chromiumExists } from './browser';
import { startScheduler } from './scheduler';
import { startServer } from './server';
import { log } from './logs';
import { isRealEstateItem } from './detect';
import { store } from './store';

ensureDataDirs();
const purged = store.purgeIrrelevant(isRealEstateItem);
if (purged > 0) {
  log('info', `Filtro de inmobiliarias: Se eliminaron ${purged} publicaciones no inmobiliarias (ropa, botellas, etc.).`);
}

if (!chromiumExists()) {
  log('warn', 'No se encontró el navegador Chromium de Playwright.');
  log('info', 'Ejecuta: npx playwright install chromium');
}

log('info', `FB Terreno Scout iniciado - Arequipa (ciclo cada ${config.searchIntervalMinutes} min).`);
log('info', `Búsquedas por ciclo: ${config.marketplaceQueries.length} en Marketplace + ${config.groups.filter((g) => !/REEMPLAZAR/.test(g.url)).length * config.groupQueries.length} en grupos (completa config.ts con IDs de grupos reales).`);

startServer().then((port) => {
  log('info', `Servidor listo en http://127.0.0.1:${port} - usa Ctrl+C para detener, y cierra cuando quieras terminar.`);
});

startScheduler();