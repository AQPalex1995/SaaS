import { describe, it, expect, vi } from 'vitest';
import { RemateIntakeService } from '../src/domain/research/remate-intake.service';
import { registryOwners, registryProperties } from '../src/db/schema/registry';

function makeManualActions(overrides: Record<string, unknown> = {}) {
  return {
    getManualAction: vi.fn(async (id: string) =>
      id === 'missing'
        ? null
        : {
            id,
            status: 'requested',
            propertyId: 'prop-1',
            taskId: 'task-1',
            source: 'remaju',
            instructions: 'captcha',
            requestedAt: new Date(),
            ...overrides,
          },
    ),
    completeManualAction: vi.fn(async (id: string, input: unknown) => ({
      id,
      status: 'completed',
      ...(input as object),
    })),
    listManualActions: vi.fn(async () => []),
  };
}

function makeDb() {
  const inserted: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const updated: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const db = {
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        inserted.push({ table, values });
        const chain = Promise.resolve([{ id: 'reg-1' }]) as Promise<Array<{ id: string }>> & {
          returning: () => Promise<Array<{ id: string }>>;
        };
        chain.returning = async () => [{ id: 'reg-1' }];
        return chain;
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          updated.push({ table, values });
        },
      }),
    }),
  };
  return { db, inserted, updated };
}

function makeStorage() {
  const puts: Array<{ key: string; size: number; opts: unknown }> = [];
  return {
    puts,
    storage: {
      put: vi.fn(async (key: string, buf: Buffer, opts: unknown) => {
        puts.push({ key, size: buf.length, opts });
        return { key };
      }),
    },
  };
}

describe('RemateIntakeService.complete (T4.5b)', () => {
  it('persiste partida + coordenadas y completa la acción manual', async () => {
    const { db, inserted, updated } = makeDb();
    const storage = makeStorage();
    const manual = makeManualActions();
    const geocode = vi.fn();
    const service = new RemateIntakeService({
      db: db as never,
      manualActions: manual as never,
      storage: storage.storage as never,
      geocode,
    });

    const result = await service.complete('ma-1', {
      payload: {
        partida: 'P-1234-5678',
        distrito: 'Arequipa',
        origenUbicacion: 'partida',
        latitude: -16.409,
        longitude: -71.537,
      },
      completedBy: 'analista',
    });

    expect(inserted).toHaveLength(1);
    expect(updated).toHaveLength(1);
    expect(result.registryId).toBe('reg-1');
    expect(result.locationApplied).toBe(true);
    expect(result.pdfKey).toBeNull();
    expect(geocode).not.toHaveBeenCalled();
    expect(manual.completeManualAction).toHaveBeenCalledWith(
      'ma-1',
      expect.objectContaining({ completedBy: 'analista' }),
    );
  });

  it('usa el geocoder cuando no hay coordenadas y hay dirección', async () => {
    const { db, updated } = makeDb();
    const storage = makeStorage();
    const manual = makeManualActions();
    const geocode = vi.fn(async () => ({ latitude: -16.4, longitude: -71.5 }));
    const service = new RemateIntakeService({
      db: db as never,
      manualActions: manual as never,
      storage: storage.storage as never,
      geocode,
    });

    const result = await service.complete('ma-2', {
      payload: { distrito: 'Yanahuara', direccion: { avenida: 'Ejército', numero: '400' } },
    });

    expect(geocode).toHaveBeenCalledOnce();
    expect(result.locationApplied).toBe(true);
    expect(updated[0].values).toMatchObject({
      locationSource: 'manual-geocoded',
      locationConfidence: 'low',
      locationVerification: 'reported',
    });
  });

  it('guarda el PDF en storage y registra el external_link', async () => {
    const { db, inserted } = makeDb();
    const storage = makeStorage();
    const manual = makeManualActions();
    const service = new RemateIntakeService({
      db: db as never,
      manualActions: manual as never,
      storage: storage.storage as never,
    });

    const pdfBase64 = Buffer.from('%PDF-1.4 fake').toString('base64');
    const result = await service.complete('ma-3', {
      payload: { partida: 'P9' },
      pdf: { name: '..\\aviso.pdf', contentType: 'application/pdf', base64: pdfBase64 },
    });

    expect(storage.puts).toHaveLength(1);
    expect(storage.puts[0].key).toContain('remates/prop-1/ma-3-aviso.pdf');
    expect(result.pdfKey).toBe(storage.puts[0].key);
    // registry + external_links
    expect(inserted).toHaveLength(2);
  });

  it('persiste titulares SUNARP normalizados en registry_owners (T5.5)', async () => {
    const { db, inserted, updated } = makeDb();
    const manual = makeManualActions();
    const service = new RemateIntakeService({
      db: db as never,
      manualActions: manual as never,
      storage: makeStorage().storage as never,
    });

    const result = await service.complete('ma-6', {
      payload: {
        partida: 'P9',
        propietarios: [
          { titular: 'JOSE LUIS TORRES GOMEZ', tipo: 'NATURAL', tipoDocumento: 'DNI', numeroDocumento: '29384756', porcentaje: '100%' },
          { titular: 'INVERSIONES ANDINAS S.A.C.', tipo: 'JURIDICA', tipoDocumento: 'RUC', numeroDocumento: '20452687123', porcentaje: 0 },
        ],
      },
      completedBy: 'analista',
    });

    // registry_properties + registry_owners (un único insert con el array de titulares).
    expect(inserted).toHaveLength(2);
    expect(inserted[0].table).toBe(registryProperties);
    expect(inserted[1].table).toBe(registryOwners);

    const owners = inserted[1].values as unknown as Array<Record<string, unknown>>;
    expect(owners).toHaveLength(2);
    expect(owners[0]).toMatchObject({
      registryPropertyId: 'reg-1',
      ownerName: 'Jose Luis Torres Gomez',
      ownerType: 'persona_natural',
      documentType: 'DNI',
      documentNumber: '29384756',
      ownershipPercentage: '100',
      source: 'sunarp',
    });
    expect(owners[1]).toMatchObject({
      ownerName: 'Inversiones Andinas S.A.C.',
      ownerType: 'persona_juridica',
      documentType: 'RUC',
      ownershipPercentage: '0',
    });

    expect(result.registryId).toBe('reg-1');
    expect(result.ownersPersisted).toBe(2);
    expect(updated).toHaveLength(0);
  });

  it('rechaza acciones inexistentes o ya completadas', async () => {
    const { db } = makeDb();
    const service = new RemateIntakeService({
      db: db as never,
      manualActions: makeManualActions() as never,
      storage: makeStorage().storage as never,
    });
    await expect(service.complete('missing', { payload: {} })).rejects.toThrow(/not found/i);

    const done = new RemateIntakeService({
      db: db as never,
      manualActions: makeManualActions({ status: 'completed' }) as never,
      storage: makeStorage().storage as never,
    });
    await expect(done.complete('ma-4', { payload: {} })).rejects.toThrow(/already/i);
  });

  it('rechaza PDFs vacíos o base64 inválidos', async () => {
    const { db } = makeDb();
    const service = new RemateIntakeService({
      db: db as never,
      manualActions: makeManualActions() as never,
      storage: makeStorage().storage as never,
    });
    await expect(
      service.complete('ma-5', { payload: {}, pdf: { name: 'x.pdf', base64: '' } }),
    ).rejects.toThrow(/PDF|base64/i);
  });

  it('listPending consulta las acciones en estado requested', async () => {
    const manual = makeManualActions();
    const service = new RemateIntakeService({ manualActions: manual as never });
    await service.listPending();
    expect(manual.listManualActions).toHaveBeenCalledWith({ status: 'requested' });
  });
});
