import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildApp } from '../src/app';

const manualAction = {
  id: 'ma-1',
  status: 'requested',
  propertyId: 'prop-1',
  taskId: 'task-1',
  source: 'remaju',
  instructions: 'captcha',
  requestedAt: new Date().toISOString(),
};

const fakeService = {
  list: vi.fn(async () => [manualAction]),
  listPending: vi.fn(async () => [manualAction]),
  getById: vi.fn(async (id: string) => (id === 'ma-1' ? manualAction : null)),
  complete: vi.fn(async () => ({
    manualAction: { ...manualAction, status: 'completed' },
    plan: { warnings: [] },
    registryId: 'reg-1',
    pdfKey: null,
    locationApplied: true,
  })),
  cancel: vi.fn(async () => ({ ...manualAction, status: 'cancelled' })),
};

describe('REM@JU manual intake routes (T4.5b)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ enableLogging: false, remateIntakeService: fakeService as never });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('GET /manual-actions sirve la UI mínima', async () => {
    const res = await app.inject({ method: 'GET', url: '/manual-actions' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Ingreso manual de acciones');
    expect(res.body).toContain('/api/v1/manual-actions');
  });

  it('GET /api/v1/manual-actions lista pendientes', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/manual-actions?status=requested' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data).toHaveLength(1);
  });

  it('GET /api/v1/manual-actions/:id responde 404 si no existe', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/manual-actions/nope' });
    expect(res.statusCode).toBe(404);
  });

  it('POST complete requiere payload y delega en el servicio', async () => {
    const bad = await app.inject({
      method: 'POST',
      url: '/api/v1/manual-actions/ma-1/complete',
      payload: {},
    });
    expect(bad.statusCode).toBe(400);

    const ok = await app.inject({
      method: 'POST',
      url: '/api/v1/manual-actions/ma-1/complete',
      payload: { payload: { partida: 'P1' }, completedBy: 'analista' },
    });
    expect(ok.statusCode).toBe(200);
    const body = JSON.parse(ok.body);
    expect(body.registryId).toBe('reg-1');
    expect(fakeService.complete).toHaveBeenCalled();
  });

  it('POST cancel delega y devuelve la acción cancelada', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/manual-actions/ma-1/cancel',
      payload: { cancelledBy: 'analista' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.status).toBe('cancelled');
    expect(fakeService.cancel).toHaveBeenCalledWith('ma-1', 'analista');
  });
});
