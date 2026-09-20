import { describe, it, expect, vi } from 'vitest';
import { RemateIntakeService } from '../src/domain/research/remate-intake.service';
import { registryCharges, registryOwners, registryProperties, registryTitles } from '../src/db/schema/registry';

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

  it('persiste cargas SUNARP normalizadas en registry_charges (T5.6)', async () => {
    const { db, inserted, updated } = makeDb();
    const manual = makeManualActions();
    const service = new RemateIntakeService({
      db: db as never,
      manualActions: manual as never,
      storage: makeStorage().storage as never,
    });

    const result = await service.complete('ma-7', {
      payload: {
        partida: 'P9',
        cargas: [
          { tipo: 'HIPOTECA', monto: 'S/ 1,234,567.89', moneda: 'S/', acreedor: 'BANCO DE CREDITO DEL PERU S.A.', fechaInscripcion: '20/05/2020', estado: 'VIGENTE' },
          { tipo: 'EMBARGO', monto: 'US$ 45,000.00', moneda: 'US$', estado: 'Cancelado' },
        ],
      },
      completedBy: 'analista',
    });

    // registry_properties + registry_owners (vacío, no inserta) + registry_charges.
    expect(inserted).toHaveLength(2);
    expect(inserted[0].table).toBe(registryProperties);
    expect(inserted[1].table).toBe(registryCharges);

    const cargas = inserted[1].values as unknown as Array<Record<string, unknown>>;
    expect(cargas).toHaveLength(2);
    expect(cargas[0]).toMatchObject({
      registryPropertyId: 'reg-1',
      chargeType: 'hipoteca',
      amount: '1234567.89',
      currency: 'PEN',
      creditor: 'Banco De Credito Del Peru S.A.',
      registeredDate: '2020-05-20',
      isActive: 'si',
      source: 'sunarp',
    });
    expect(cargas[1]).toMatchObject({
      chargeType: 'embargo',
      amount: '45000',
      currency: 'USD',
      isActive: 'no',
    });

    expect(result.registryId).toBe('reg-1');
    expect(result.chargesPersisted).toBe(2);
    expect(updated).toHaveLength(0);
  });

  it('persiste títulos SUNARP normalizados en registry_titles (T5.7)', async () => {
    const { db, inserted, updated } = makeDb();
    const manual = makeManualActions();
    const service = new RemateIntakeService({
      db: db as never,
      manualActions: manual as never,
      storage: makeStorage().storage as never,
    });

    const result = await service.complete('ma-8', {
      payload: {
        partida: 'P9',
        titulos: [
          { numeroTitulo: '2019-00012345', fecha: '10/01/2019', tipo: 'COMPRAVENTA', notario: 'LUIS GARCIA VARGAS', descripcion: 'Título de propiedad del terreno' },
          { titulo: '006-2020', fechaTitulo: '15/03/2020', tipoTitulo: 'INDEPENDIZACION' },
        ],
      },
      completedBy: 'analista',
    });

    // registry_properties + registry_owners (vacío, no inserta) + registry_titles.
    expect(inserted).toHaveLength(2);
    expect(inserted[0].table).toBe(registryProperties);
    expect(inserted[1].table).toBe(registryTitles);

    const titulos = inserted[1].values as unknown as Array<Record<string, unknown>>;
    expect(titulos).toHaveLength(2);
    expect(titulos[0]).toMatchObject({
      registryPropertyId: 'reg-1',
      titleNumber: '2019-00012345',
      titleDate: '2019-01-10',
      titleType: 'COMPRAVENTA',
      notary: 'Luis Garcia Vargas',
      description: 'Título de propiedad del terreno',
      source: 'sunarp',
    });
    expect(titulos[1]).toMatchObject({
      titleNumber: '006-2020',
      titleDate: '2020-03-15',
      titleType: 'INDEPENDIZACION',
      notary: null,
      description: null,
    });

    expect(result.registryId).toBe('reg-1');
    expect(result.titlesPersisted).toBe(2);
    expect(updated).toHaveLength(0);
  });

  it('excluye provenance en la superficie del resultado del intake (T5.9)', async () => {
    const { db, inserted } = makeDb();
    const storage = makeStorage();
    const manual = makeManualActions();
    const service = new RemateIntakeService({
      db: db as never,
      manualActions: manual as never,
      storage: storage.storage as never,
    });

    const result = await service.complete('ma-9', {
      payload: {
        partida: 'P9',
        sourceUrlPdf: 'https://remaju.pj.gob.pe/aviso-40451.pdf',
        cargas: [{ tipo: 'HIPOTECA', monto: 'S/ 1,000', moneda: 'S/', estado: 'VIGENTE' }],
        titulos: [{ titulo: '006-2020', fechaTitulo: '15/03/2020', tipoTitulo: 'INDEPENDIZACION' }],
      },
      completedBy: 'analista',
    });

    // El result que recibe la acción manual (y que persiste en research_results)
    // lleva el bloque de provenance del intake en su superficie.
    expect(result.plan.normalized.provenance).toMatchObject({
      source: 'manual',
      sourceUrl: 'https://remaju.pj.gob.pe/aviso-40451.pdf',
      confidence: 'medium',
      verification: 'reported',
      parserVersion: 'manual-v1',
    });
    expect(result.plan.registry?.provenance).toMatchObject({
      source: 'remaju',
      parserVersion: 'v1',
    });
    expect(result.plan.registry?.historical.provenance).toMatchObject({
      source: 'sunarp',
      verification: 'inferred',
    });

    // El payload pasado a completeManualAction expone el mismo provenance
    // (fluye a manual_actions.result y a research_results.data).
    const call = manual.completeManualAction.mock.calls[0][1] as {
      result: Record<string, unknown>;
    };
    expect(call.result).toMatchObject({
      provenance: { source: 'manual', parserVersion: 'manual-v1' },
      historical: expect.objectContaining({
        provenance: expect.objectContaining({ source: 'sunarp', verification: 'inferred' }),
      }),
    });
    // registry_properties.raw_data incluye el provenance del intake.
    const regValues = inserted[0].values as Record<string, unknown>;
    expect((regValues.rawData as Record<string, unknown>).provenance).toMatchObject({
      source: 'manual',
      parserVersion: 'manual-v1',
    });
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
