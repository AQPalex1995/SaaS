import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { RemateIntakeService, type CompleteRemateIntakeInput } from './remate-intake.service.js';

export interface RemateIntakeRoutesDeps {
  /** Injectable for tests; defaults to a real RemateIntakeService. */
  service?: RemateIntakeService;
}

const MAX_BODY_BYTES = 12 * 1024 * 1024; // payload + PDF base64

/**
 * REM@JU manual intake (Fase 4 / T4.5).
 *
 * Expone el flujo humano-en-el-bucle: listar acciones manuales pendientes,
 * completarlas con el payload normalizado (partida, dirección, montos,
 * coordenadas) y el PDF del aviso, y una UI mínima servida por el propio API.
 */
export async function remateIntakeRoutes(
  app: FastifyInstance,
  deps: RemateIntakeRoutesDeps = {},
): Promise<void> {
  const service = deps.service ?? new RemateIntakeService();

  const asError = (reply: FastifyReply, err: unknown) => {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    if (/not found/i.test(message)) return reply.status(404).send({ error: message });
    if (/already/i.test(message)) return reply.status(409).send({ error: message });
    if (/PDF|base64/i.test(message)) return reply.status(400).send({ error: message });
    throw err;
  };

  // GET /api/v1/manual-actions?status=requested|completed|cancelled|all
  app.get('/api/v1/manual-actions', async (request, reply) => {
    const { status } = request.query as { status?: string };
    const filter =
      status === 'requested' || status === 'completed' || status === 'cancelled'
        ? status
        : undefined;
    const data = status === 'all' ? await service.list() : await service.list(filter);
    return reply.send({ data });
  });

  // GET /api/v1/manual-actions/:id
  app.get('/api/v1/manual-actions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const action = await service.getById(id);
    if (!action) return reply.status(404).send({ error: 'Manual action not found' });
    return reply.send({ data: action });
  });

  // POST /api/v1/manual-actions/:id/complete
  app.post(
    '/api/v1/manual-actions/:id/complete',
    { bodyLimit: MAX_BODY_BYTES },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = request.body as CompleteRemateIntakeInput | undefined;
      if (!body || typeof body !== 'object' || !body.payload) {
        return reply.status(400).send({ error: 'payload requerido' });
      }
      try {
        const result = await service.complete(id, body);
        return reply.send({
          data: result.manualAction,
          plan: result.plan,
          registryId: result.registryId,
          pdfKey: result.pdfKey,
          locationApplied: result.locationApplied,
        });
      } catch (err) {
        return asError(reply, err);
      }
    },
  );

  // POST /api/v1/manual-actions/:id/cancel
  app.post('/api/v1/manual-actions/:id/cancel', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { cancelledBy?: string } | undefined;
    try {
      const action = await service.cancel(id, body?.cancelledBy);
      return reply.send({ data: action });
    } catch (err) {
      return asError(reply, err);
    }
  });

  // GET /manual-actions — UI mínima para el operador (sin tocar el Scout Legacy)
  app.get('/manual-actions', async (_request, reply) => {
    return reply.type('text/html; charset=utf-8').send(MANUAL_INTAKE_HTML);
  });

  // GET /manual-actions/status — página de confirmación (opcional)
  app.get('/manual-actions/status', async (_request, reply) => {
    return reply.type('text/html; charset=utf-8').send(MANUAL_INTAKE_HTML);
  });
}

const MANUAL_INTAKE_HTML = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Ingreso manual — REM@JU y captura SUNARP</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, sans-serif; margin: 0; padding: 24px; background:#0f172a; color:#e2e8f0; }
  h1 { font-size: 1.3rem; margin: 0 0 4px; }
  p.sub { margin: 0 0 20px; color:#94a3b8; font-size:.85rem; }
  .wrap { max-width: 860px; margin: 0 auto; }
  .card { background:#1e293b; border:1px solid #334155; border-radius:10px; padding:16px; margin-bottom:16px; }
  label { display:block; font-size:.75rem; color:#94a3b8; margin:8px 0 2px; }
  input, select, textarea { width:100%; box-sizing:border-box; padding:7px 9px; border-radius:6px; border:1px solid #475569; background:#0f172a; color:#e2e8f0; font-size:.9rem; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .grid3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; }
  button { margin-top:14px; background:#2563eb; color:#fff; border:0; padding:10px 16px; border-radius:8px; font-weight:600; cursor:pointer; }
  button:disabled { opacity:.5; cursor:not-allowed; }
  button.ghost { background:#334155; }
  .actions li { list-style:none; padding:10px; border:1px solid #334155; border-radius:8px; margin-bottom:8px; cursor:pointer; }
  .actions li.active { border-color:#2563eb; background:#1d4ed855; }
  .actions ul { padding:0; margin:0; }
  .muted { color:#94a3b8; font-size:.8rem; }
  #msg { margin-top:12px; font-size:.9rem; white-space:pre-wrap; }
  .ok { color:#4ade80; } .err { color:#f87171; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Ingreso manual de acciones — REM@JU y captura SUNARP</h1>
  <p class="sub">REM@JU: partida, dirección, coordenadas y datos públicos del remate. SUNARP: captura del detalle registral (titulares, cargas, títulos). Nunca datos personales del operador.</p>

  <div class="card">
    <strong>Acciones manuales pendientes</strong>
    <button class="ghost" id="reload" style="float:right;margin-top:0">Recargar</button>
    <ul class="actions" id="list"><li class="muted">Cargando…</li></ul>
  </div>

  <form class="card" id="form">
    <strong>Datos del aviso de remate</strong>
    <div class="grid">
      <div><label>Acción manual (id)</label><input name="actionId" required placeholder="UUID" /></div>
      <div><label>Operador (completedBy)</label><input name="completedBy" placeholder="analista" /></div>
    </div>
    <div class="grid">
      <div><label>Partida registral</label><input name="partida" placeholder="P-12345678" /></div>
      <div><label>Distrito</label><input name="distrito" placeholder="Arequipa" /></div>
    </div>
    <div class="grid3">
      <div><label>Urb.</label><input name="urb" /></div>
      <div><label>Avenida / Calle</label><input name="avenida" /></div>
      <div><label>Número</label><input name="numero" /></div>
    </div>
    <div class="grid3">
      <div><label>Lote</label><input name="lote" /></div>
      <div><label>Referencia</label><input name="referencia" /></div>
      <div><label>Origen ubicación</label>
        <select name="origenUbicacion">
          <option value="partida">Partida (visor BGR)</option>
          <option value="maps">Maps (coordenadas)</option>
          <option value="direccion">Dirección (geocodificar)</option>
        </select>
      </div>
    </div>
    <div class="grid">
      <div><label>Latitud (opcional)</label><input name="latitude" placeholder="-16.409" /></div>
      <div><label>Longitud (opcional)</label><input name="longitude" placeholder="-71.537" /></div>
    </div>
    <div class="grid3">
      <div><label>Valor deuda (S/)</label><input name="valorDeuda" /></div>
      <div><label>Tasación (S/)</label><input name="tasacion" /></div>
      <div><label>Precio remate (S/)</label><input name="precioRemate" /></div>
    </div>
    <div class="grid3">
      <div><label>Convocatoria</label>
        <select name="convocatoria">
          <option value="primera">Primera</option>
          <option value="segunda">Segunda</option>
          <option value="tercera">Tercera</option>
          <option value="">No indica</option>
        </select>
      </div>
      <div><label>Fecha remate</label><input name="fechaRemate" type="date" /></div>
      <div><label>PDF del aviso</label><input name="pdf" type="file" accept="application/pdf" /></div>
    </div>
    <div id="sunarpCapture" style="display:none;margin-top:14px;border-top:1px solid #334155;padding-top:10px">
      <strong>Captura registral SUNARP (Conoce Aquí / SPRL)</strong>
      <div class="muted">Pega el detalle que ves en SUNARP. El sistema normaliza y persiste titulares, cargas y títulos en la partida.</div>
      <div><label>URL consultada (Conoce Aquí / SPRL)</label><input name="sourceUrlPdf" placeholder="https://conoce-aqui.sunarp.gob.pe/…" /></div>
      <div><label>Propietarios / titulares — JSON (ej. {"nombre":"JUAN PEREZ","tipoDocumento":"DNI","numDocumento":"12345678"})</label><textarea name="capPropietarios" rows="2" placeholder='[{"nombre":"JUAN PEREZ","tipoDocumento":"DNI","numDocumento":"12345678"}]'></textarea></div>
      <div><label>Cargas / gravámenes — JSON (ej. {"tipo":"HIPOTECA","monto":"S/ 100,000","moneda":"S/","estado":"VIGENTE"})</label><textarea name="capCargas" rows="2" placeholder='[{"tipo":"HIPOTECA","monto":"S/ 100,000","moneda":"S/","estado":"VIGENTE"}]'></textarea></div>
      <div><label>Títulos / asientos — JSON (ej. {"titulo":"006-2020","fechaTitulo":"15/03/2020","tipoTitulo":"INDEPENDIZACION"})</label><textarea name="capTitulos" rows="2" placeholder='[{"titulo":"006-2020","fechaTitulo":"15/03/2020","tipoTitulo":"INDEPENDIZACION"}]'></textarea></div>
    </div>
    <button type="submit" id="submit">Guardar y completar</button>
    <div id="msg"></div>
  </form>
</div>
<script>
const $ = (s, r=document) => r.querySelector(s);
const listEl = $('#list');
const form = $('#form');
const msg = $('#msg');
let selected = null;

function isSunarp(a) { return /^sunarp/.test(a.source || ''); }

function buildItem(a) {
  const li = document.createElement('li');
  const top = document.createElement('div');
  const head = document.createElement('span');
  head.textContent = (a.actionKind ? '[' + a.actionKind + '] ' : '') + (a.source || '');
  top.appendChild(head);
  if (a.url) {
    const link = document.createElement('a');
    link.href = a.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = ' · abrir servicio';
    top.appendChild(link);
  }
  const meta = document.createElement('div');
  meta.className = 'muted';
  meta.textContent = new Date(a.requestedAt).toLocaleString();
  const desc = document.createElement('div');
  desc.textContent = a.instructions || '(sin instrucciones)';
  li.appendChild(top);
  li.appendChild(meta);
  li.appendChild(desc);
  li.onclick = () => {
    selected = a.id;
    form.actionId.value = a.id;
    $('#sunarpCapture').style.display = isSunarp(a) ? 'block' : 'none';
    [...listEl.children].forEach((c) => c.classList.remove('active'));
    li.classList.add('active');
  };
  return li;
}

async function loadList() {
  listEl.innerHTML = '<li class="muted">Cargando…</li>';
  try {
    const res = await fetch('/api/v1/manual-actions?status=requested');
    const body = await res.json();
    const items = body.data || [];
    if (!items.length) { listEl.innerHTML = '<li class="muted">No hay acciones pendientes.</li>'; return; }
    listEl.innerHTML = '';
    for (const a of items) listEl.appendChild(buildItem(a));
  } catch (e) { listEl.innerHTML = '<li class="err">Error: ' + e.message + '</li>'; }
}

function readPdf(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const fr = new FileReader();
    fr.onload = () => {
      const s = String(fr.result);
      resolve({ name: file.name, contentType: file.type || 'application/pdf', base64: s.split(',')[1] || '' });
    };
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

function parseJsonList(raw, label) {
  const v = (raw || '').trim();
  if (!v) return null;
  const parsed = JSON.parse(v);
  if (!Array.isArray(parsed)) throw new Error(label + ': se espera un JSON de lista ([...])');
  return parsed;
}

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = new FormData(form);
  const id = f.get('actionId');
  if (!id) { msg.className = 'err'; msg.textContent = 'Selecciona una acción manual.'; return; }
  const btn = $('#submit'); btn.disabled = true; msg.textContent = 'Guardando…';
  try {
    const propietarios = parseJsonList(f.get('capPropietarios'), 'Propietarios');
    const cargas = parseJsonList(f.get('capCargas'), 'Cargas');
    const titulos = parseJsonList(f.get('capTitulos'), 'Títulos');
    const pdf = await readPdf(f.get('pdf'));
    const payload = {
      partida: f.get('partida'), distrito: f.get('distrito'),
      direccion: { urb: f.get('urb'), avenida: f.get('avenida'), numero: f.get('numero'), lote: f.get('lote'), referencia: f.get('referencia') },
      valorDeuda: f.get('valorDeuda'), tasacion: f.get('tasacion'), precioRemate: f.get('precioRemate'),
      convocatoria: f.get('convocatoria'), fechaRemate: f.get('fechaRemate'),
      origenUbicacion: f.get('origenUbicacion'), latitude: f.get('latitude'), longitude: f.get('longitude'),
      propietarios, cargas, titulos,
      sourceUrlPdf: f.get('sourceUrlPdf'),
    };
    const res = await fetch('/api/v1/manual-actions/' + encodeURIComponent(id) + '/complete', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ payload, completedBy: f.get('completedBy') || undefined, pdf }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || res.statusText);
    const extra = body.ownersPersisted != null ? ' · titular: ' + body.ownersPersisted + ' · cargas: ' + body.chargesPersisted + ' · títulos: ' + body.titlesPersisted : '';
    msg.className = 'ok';
    msg.textContent = 'OK — partida guardada: ' + (body.registryId || 'n/d') + extra + ' · geo: ' + (body.locationApplied ? 'sí' : 'no') + ' · PDF: ' + (body.pdfKey || 'no');
    await loadList();
  } catch (e) {
    msg.className = 'err'; msg.textContent = 'Error: ' + e.message;
  } finally { btn.disabled = false; }
});

$('#reload').onclick = loadList;
loadList();
</script>
</body>
</html>`;
