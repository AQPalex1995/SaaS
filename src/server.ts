import http from 'node:http';
import fs from 'node:fs';
import { exec } from 'node:child_process';
import { config } from './config';
import { log } from './logs';
import { logBus, logEntries } from './logs';
import path from 'node:path';
import {
  pause,
  resume,
  runNow,
  status,
  stopCurrentCycle,
  stopEverything,
  restartScheduler,
  loginFromPanel,
  isLoginInProgress,
  submitVerificationCode,
  type RuntimeStatus,
} from './scheduler';
import { store } from './store';
import { CSV_PATH, DATA_DIR } from './paths';
import { getCredentials, credentialsPath, type FbCredentials } from './auth';
import { loadGroups, addGroup, removeGroup } from './groupsManager';

const sseClients = new Set<http.ServerResponse>();

function sendSSE(res: http.ServerResponse, data: unknown): void {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function startServer(): Promise<number> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = req.url || '/';
      const method = req.method || 'GET';

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(htmlPage());
        return;
      }

      if (url === '/api/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(status));
        return;
      }

      if (url === '/api/log' && method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        for (const line of logEntries) sendSSE(res, line);
        sseClients.add(res);
        req.on('close', () => sseClients.delete(res));
        return;
      }

      if (url === '/api/csv' && method === 'GET') {
        if (!fs.existsSync(CSV_PATH)) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Todavia no hay CSV.');
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="Arequipa_terrenos.csv"',
        });
        fs.createReadStream(CSV_PATH).pipe(res);
        return;
      }

      if (url.startsWith('/api/listings') && method === 'GET') {
        const params = new URLSearchParams(url.split('?')[1] || '');
        const pageNum = Math.max(1, parseInt(params.get('page') || '1', 10));
        const perPage = Math.min(100, Math.max(1, parseInt(params.get('per_page') || '20', 10)));
        const search = (params.get('q') || '').toLowerCase().trim();
        const districtRaw = (params.get('distrito') || '').toLowerCase().trim();
        const tipoRaw = (params.get('tipo') || '').toLowerCase().trim();
        const favorito = (params.get('favorito') || '').toLowerCase().trim();
        const fuente = (params.get('fuente') || '').toLowerCase().trim();
        const dias = parseInt(params.get('dias') || '0', 10);
        const sdayRaw = (params.get('sday') || '').trim();

        const pad2 = (n: number): string => String(n).padStart(2, '0');
        const localIso = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

        const districts = districtRaw ? districtRaw.split(',').map((d) => d.trim()).filter(Boolean) : [];
        const tipos = tipoRaw ? tipoRaw.split(',').map((t) => t.trim()).filter(Boolean) : [];

        let all = store.all();

        if (districts.length > 0) {
          all = all.filter((r) => districts.includes((r.distrito || '').toLowerCase()));
        }
        if (tipos.length > 0) {
          all = all.filter((r) => tipos.includes((r.tipo || '').toLowerCase()));
        }
        if (favorito === 'true' || favorito === '1') {
          all = all.filter((r) => r.favorito === 'true' || r.favorito === '1');
        }
        if (fuente) {
          all = all.filter((r) => {
            const url = (r.url_publicacion || r.url || r.href || '').toLowerCase();
            const id = (r.id_publicacion || r.id || '').toLowerCase();
            let src = (r.fuente || '').toLowerCase();
            if (!src) {
              if (url.includes('adondevivir') || id.startsWith('av-')) src = 'adondevivir';
              else if (url.includes('urbania') || id.startsWith('urb-')) src = 'urbania';
              else if (url.includes('/groups/') || id.includes('_')) src = 'grupo';
              else src = 'marketplace';
            }
            return src.includes(fuente);
          });
        }
        if (dias > 0) {
          const now = new Date().getTime();
          all = all.filter((r) => {
            const fStr = r.fecha_busqueda || r.fecha_publicacion || '';
            if (!fStr) return true;
            const fTime = new Date(fStr).getTime();
            if (isNaN(fTime)) return true;
            const diffDays = (now - fTime) / (1000 * 60 * 60 * 24);
            return diffDays <= dias;
          });
        }
        if (sdayRaw) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(sdayRaw)) {
            // Día exacto de búsqueda (ej. "2026-09-11")
            all = all.filter((r) => (r.fecha_busqueda || '') === sdayRaw);
          } else if (parseInt(sdayRaw, 10) > 0) {
            // Ventana de días hacia atrás (ej. "7" = los últimos 7 días)
            const days = parseInt(sdayRaw, 10);
            const limit = new Date();
            limit.setDate(limit.getDate() - (days - 1));
            const limStr = localIso(limit);
            all = all.filter((r) => {
              const fb = r.fecha_busqueda || '';
              return !!fb && fb >= limStr;
            });
          }
        }
        if (search) {
          all = all.filter((r) => Object.values(r).join(' ').toLowerCase().includes(search));
        }

        all.sort((a, b) => {
          const da = `${a.fecha_busqueda || ''} ${a.hora_busqueda || ''}`;
          const db = `${b.fecha_busqueda || ''} ${b.hora_busqueda || ''}`;
          return db.localeCompare(da);
        });

        const total = all.length;
        const items = all.slice((pageNum - 1) * perPage, pageNum * perPage);
        const allRows = store.all();
        const distritos = Array.from(new Set(allRows.map((r) => r.distrito).filter(Boolean))).sort();
        const availableTipos = Array.from(new Set(allRows.map((r) => r.tipo).filter(Boolean))).sort();

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ total, page: pageNum, perPage, items, distritos, tipos: availableTipos }));
        return;
      }

      if (url === '/api/credentials' && method === 'GET') {
        const creds = getCredentials();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(
          JSON.stringify({
            hasCredentials: !!creds,
            identifier: creds?.identifier ?? '',
            passwordHint: creds?.password ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' : '',
          })
        );
        return;
      }

      if (url === '/api/credentials' && method === 'POST') {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            const data = JSON.parse(body) as Partial<FbCredentials>;
            const prevCreds = getCredentials();
            const rawPass = data.password || '';
            const passwordToSave =
              rawPass.startsWith('\u2022') || rawPass.startsWith('*')
                ? prevCreds?.password || ''
                : rawPass;
            if (!data.identifier || !passwordToSave) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, msg: 'Ingresa tu contrasena real.' }));
              return;
            }
            const creds: FbCredentials = { identifier: data.identifier.trim(), password: passwordToSave };
            fs.writeFileSync(credentialsPath(), JSON.stringify(creds, null, 2), 'utf8');
            log('ok', `Credenciales guardadas para: ${creds.identifier}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, msg: `Credenciales guardadas para ${creds.identifier}.` }));
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, msg: 'JSON invalido.' }));
          }
        });
        return;
      }

      if (url === '/api/login-preview' && method === 'GET') {
        const imgPath = path.join(DATA_DIR, 'fb-login-preview.png');
        if (fs.existsSync(imgPath)) {
          res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache, no-store, must-revalidate' });
          fs.createReadStream(imgPath).pipe(res);
          return;
        }
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Sin captura');
        return;
      }

      if (url === '/api/submit-code' && method === 'POST') {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', async () => {
          try {
            const data = JSON.parse(body) as { code: string };
            if (!data.code) {
              res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ ok: false, msg: 'Codigo invalido.' }));
              return;
            }
            const r = await submitVerificationCode(data.code);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(r));
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: false, msg: 'Error al enviar codigo.' }));
          }
        });
        return;
      }

      if (url === '/api/action' && method === 'POST') {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          let action = '';
          try {
            action = (JSON.parse(body) as { action: string }).action || '';
          } catch {
            action = '';
          }
          const send = (r: { ok: boolean; msg: string }): void => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(r));
          };
          switch (action) {
            case 'login':
              if (isLoginInProgress()) {
                send({ ok: true, msg: 'Ya hay una ventana de Facebook abierta.' });
              } else {
                void loginFromPanel().then((r) => {
                  if (r.ok) log('ok', 'Sesion de Facebook guardada exitosamente.');
                });
                send({ ok: true, msg: 'Abriendo ventana de Chromium...' });
              }
              return;
            case 'runNow':
              void runNow().then(send);
              return;
            case 'stopAll':
              stopEverything();
              send({ ok: true, msg: 'Todo detenido' });
              break;
            case 'restart':
              restartScheduler();
              send({ ok: true, msg: 'Reiniciado' });
              break;
            case 'exit':
              send({ ok: true, msg: 'Cerrando proceso' });
              setTimeout(() => process.exit(0), 300);
              return;
            case 'pause':
              pause();
              send({ ok: true, msg: 'En pausa' });
              break;
            case 'resume':
              resume();
              send({ ok: true, msg: 'Reanudado' });
              break;
            case 'stop':
              stopCurrentCycle();
              send({ ok: true, msg: 'Deteniendo ciclo...' });
              break;
            default:
              send({ ok: false, msg: 'Accion desconocida' });
          }
        });
        return;
      }

      if (url === '/api/groups' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ groups: loadGroups() }));
        return;
      }

      if (url === '/api/groups' && method === 'POST') {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            const data = JSON.parse(body) as { url: string; name?: string };
            const result = addGroup(data.url || '', data.name);
            res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(result));
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, msg: 'JSON invalido.' }));
          }
        });
        return;
      }

      if (url === '/api/groups' && method === 'DELETE') {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            const data = JSON.parse(body) as { identifier: string };
            const result = removeGroup(data.identifier || '');
            res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(result));
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, msg: 'JSON invalido.' }));
          }
        });
        return;
      }

      const patchMatch = url.match(/^\/api\/listings\/([^/?]+)$/);
      if (patchMatch && method === 'PATCH') {
        const id = decodeURIComponent(patchMatch[1]);
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            const updates = JSON.parse(body) as Record<string, string>;
            const updated = store.patch(id, updates);
            if (updated) {
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ ok: true, row: updated }));
            } else {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, msg: 'Publicacion no encontrada.' }));
            }
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, msg: 'JSON invalido.' }));
          }
        });
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404');
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        log('error', `El puerto ${config.panelPort} ya esta en uso.`);
      } else {
        log('error', `Error del servidor web: ${err.message}`);
      }
      process.exit(1);
    });

    server.listen(config.panelPort, '127.0.0.1', () => {
      log('ok', `Panel web en http://127.0.0.1:${config.panelPort}`);
      logBus.on('log', (line) => {
        for (const c of sseClients) {
          try {
            sendSSE(c, line);
          } catch {
            sseClients.delete(c);
          }
        }
      });
      openBrowserOnWindows(`http://127.0.0.1:${config.panelPort}`);
      resolve(config.panelPort);
    });
  });
}

function openBrowserOnWindows(url: string): void {
  if (process.platform === 'win32') {
    setTimeout(() => exec(`start "" "${url}"`, { windowsHide: true }).unref(), 800);
  }
}

/* ─────────────────────────────────────────────
   HTML PANEL
───────────────────────────────────────────── */
function htmlPage(): string {
  // Read the HTML panel from the separate file for manageability
  const dir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
  const candidates = [
    path.join(process.cwd(), 'src', 'panel.html'),
    path.join(process.cwd(), 'panel.html'),
    path.join(dir, 'panel.html'),
    path.join(dir, 'src', 'panel.html')
  ];
  const htmlPath = candidates.find((p) => fs.existsSync(p)) || '';
  if (htmlPath && fs.existsSync(htmlPath)) {
    let html = fs.readFileSync(htmlPath, 'utf8');
    // Inject dynamic data
    const groupsHtml = config.groups
      .map(
        (g) =>
          `<div class="group-item" data-url="${escapeHtml(g.url)}"><span class="group-dot"></span><span class="group-name">${escapeHtml(g.name)}</span><button class="group-del" onclick='delGroup(${JSON.stringify(g.url)})'>&#x2715;</button></div>`
      )
      .join('');
    html = html.replace('{{GROUPS_HTML}}', groupsHtml);
    html = html.replace('{{GROUPS_COUNT}}', String(config.groups.length));
    // Override the panel's API_URL default with the runtime value
    // (server/.env -> API_URL). Fallback keeps local dev working.
    const apiUrl = process.env.API_URL || 'http://localhost:3001';
    html = html.replace(
      "window.LAND_API_URL = window.LAND_API_URL || 'http://localhost:3001';",
      `window.LAND_API_URL = '${escapeHtml(apiUrl)}';`
    );
    return html;
  }
  return '<h1>Error: panel.html not found</h1>';
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
