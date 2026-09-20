import { describe, it, expect } from 'vitest';
import {
  composeDireccion,
  planRemateIntake,
} from '../src/domain/research/remate-manual';

describe('REM@JU manual intake planner (T4.5b)', () => {
  it('compone la dirección con urb/av/número/lote/referencia/distrito', () => {
    const dir = composeDireccion(
      { urb: 'Los Álamos', avenida: 'Ejército', numero: '400', lote: '12', referencia: 'frente al parque' },
      'Yanahuara',
    );
    expect(dir).toBe('Los Álamos, Ejército, 400, Lote 12, frente al parque, Yanahuara');
    expect(composeDireccion(null)).toBeNull();
  });

  it('normaliza partida y montos, y arma la fila de registry', () => {
    const plan = planRemateIntake({
      partida: ' p-1234-5678 ',
      distrito: 'Arequipa',
      direccion: { avenida: 'Ejército', numero: '400' },
      valorDeuda: 'S/ 150,000.50',
      tasacion: 200000,
      precioRemate: '180000.00',
      convocatoria: 'primera',
      fechaRemate: '2026-10-01',
    });
    expect(plan.normalized.partida).toBe('P-12345678');
    expect(plan.normalized.valorDeuda).toBe(150000.5);
    expect(plan.normalized.tasacion).toBe(200000);
    expect(plan.normalized.precioRemate).toBe(180000);
    expect(plan.registry).toMatchObject({
      registryNumber: 'P-12345678',
      source: 'remaju',
      confidence: 'medium',
      verification: 'reported',
    });
    expect(plan.registry?.registeredDistrict).toBe('Arequipa');
  });

  it('ubicación con coordenadas + origen partida → confidence high', () => {
    const plan = planRemateIntake({
      partida: 'P1',
      origenUbicacion: 'partida',
      latitude: '-16.409',
      longitude: '-71.537',
    });
    expect(plan.location).toMatchObject({
      latitude: -16.409,
      longitude: -71.537,
      confidence: 'high',
      source: 'manual',
      verification: 'reported',
    });
    expect(plan.needsGeocoding).toBe(false);
    expect(plan.geocodeQuery).toBeNull();
  });

  it('sin coordenadas pero con dirección → pide geocodificación (fallback)', () => {
    const plan = planRemateIntake({
      distrito: 'Yanahuara',
      direccion: { avenida: 'Ejército', numero: '400' },
    });
    expect(plan.location).toBeNull();
    expect(plan.needsGeocoding).toBe(true);
    expect(plan.geocodeQuery).toContain('Ejército');
    expect(plan.geocodeQuery).toContain('Yanahuara');
  });

  it('advierte si faltan partida/distrito y si las coordenadas están incompletas', () => {
    const plan = planRemateIntake({ latitude: '-16.4' });
    expect(plan.warnings.some((w) => w.includes('sin partida'))).toBe(true);
    expect(plan.location).toBeNull();
    expect(plan.warnings.some((w) => w.includes('incompletas'))).toBe(true);
  });

  it('ignora coordenadas fuera de rango', () => {
    const plan = planRemateIntake({ latitude: '999', longitude: '-71.5' });
    expect(plan.normalized.latitude).toBeNull();
    expect(plan.location).toBeNull();
  });

  it('no arma registry sin partida/distrito/dirección', () => {
    const plan = planRemateIntake({ valorDeuda: 10 });
    expect(plan.registry).toBeNull();
  });

  it('normaliza propietarios SUNARP de la captura manual para registry_owners (T5.5)', () => {
    const plan = planRemateIntake({
      partida: 'P9',
      propietarios: [
        { titular: 'JOSE LUIS TORRES GOMEZ', tipo: 'NATURAL', tipoDocumento: 'DNI', numeroDocumento: '29384756', porcentaje: '50%', fechaInscripcion: '2020-05-10' },
        { titular: 'INVERSIONES ANDINAS S.A.C.', tipo: 'JURIDICA', tipoDocumento: 'RUC', numeroDocumento: '20452687123', porcentaje: 0.5, fechaInscripcion: '15/06/2021' },
      ],
    });
    expect(plan.registry?.owners).toHaveLength(2);
    expect(plan.registry?.owners[0]).toEqual({
      ownerName: 'Jose Luis Torres Gomez',
      ownerType: 'persona_natural',
      documentType: 'DNI',
      documentNumber: '29384756',
      ownershipPercentage: 50,
      registeredDate: '2020-05-10',
    });
    expect(plan.registry?.owners[1]).toEqual({
      ownerName: 'Inversiones Andinas S.A.C.',
      ownerType: 'persona_juridica',
      documentType: 'RUC',
      documentNumber: '20452687123',
      ownershipPercentage: 50,
      registeredDate: '2021-06-15',
    });
    expect(plan.normalized.propietarios).toHaveLength(2);
  });

  it('advierte si la captura SUNARP no deja propietarios normalizables (T5.5)', () => {
    const plan = planRemateIntake({ partida: 'P9', propietarios: [{ tipoDocumento: 'XXX' }] });
    expect(plan.registry?.owners).toHaveLength(0);
    expect(plan.normalized.propietarios).toHaveLength(0);
    expect(plan.warnings.some((w) => w.includes('propietarios normalizables'))).toBe(true);
  });

  it('normaliza cargas SUNARP de la captura manual para registry_charges (T5.6)', () => {
    const plan = planRemateIntake({
      partida: 'P9',
      cargas: [
        { tipo: 'HIPOTECA', descripcion: 'Hipoteca a favor del Banco de Crédito', monto: 'S/ 1,234,567.89', moneda: 'S/', acreedor: 'BANCO DE CREDITO DEL PERU S.A.', fechaInscripcion: '20/05/2020', estado: 'VIGENTE' },
        { tipo: 'EMBARGO', monto: 'US$ 45,000.00', moneda: 'US$', estado: 'Cancelado' },
      ],
    });
    expect(plan.registry?.charges).toHaveLength(2);
    expect(plan.registry?.charges[0]).toEqual({
      chargeType: 'hipoteca',
      description: 'Hipoteca a favor del Banco de Crédito',
      amount: 1234567.89,
      currency: 'PEN',
      creditor: 'Banco De Credito Del Peru S.A.',
      registeredDate: '2020-05-20',
      isActive: 'si',
    });
    expect(plan.registry?.charges[1]).toMatchObject({
      chargeType: 'embargo',
      amount: 45000,
      currency: 'USD',
      isActive: 'no',
    });
    expect(plan.normalized.cargas).toHaveLength(2);
  });

  it('advierte si la captura SUNARP no deja cargas normalizables (T5.6)', () => {
    const plan = planRemateIntake({ partida: 'P9', cargas: [{ tipo: 'SIN VALOR' }] });
    expect(plan.registry?.charges).toHaveLength(0);
    expect(plan.normalized.cargas).toHaveLength(0);
    expect(plan.warnings.some((w) => w.includes('cargas normalizables'))).toBe(true);
  });

  it('normaliza títulos SUNARP de la captura manual para registry_titles (T5.7)', () => {
    const plan = planRemateIntake({
      partida: 'P9',
      titulos: [
        { numeroTitulo: '2019-00012345', fecha: '10/01/2019', tipo: 'COMPRAVENTA', notario: 'LUIS GARCIA VARGAS', descripcion: 'Título de propiedad del terreno' },
        { titulo: '006-2020', fechaTitulo: '15/03/2020', tipoTitulo: 'INDEPENDIZACION' },
      ],
    });
    expect(plan.registry?.titles).toHaveLength(2);
    expect(plan.registry?.titles[0]).toEqual({
      titleNumber: '2019-00012345',
      titleDate: '2019-01-10',
      titleType: 'COMPRAVENTA',
      notary: 'Luis Garcia Vargas',
      description: 'Título de propiedad del terreno',
    });
    expect(plan.registry?.titles[1]).toMatchObject({
      titleNumber: '006-2020',
      titleDate: '2020-03-15',
      titleType: 'INDEPENDIZACION',
      notary: null,
      description: null,
    });
    expect(plan.normalized.titulos).toHaveLength(2);
  });

  it('advierte si la captura SUNARP no deja títulos normalizables (T5.7)', () => {
    const plan = planRemateIntake({ partida: 'P9', titulos: [{ foo: 'SIN VALOR' }] });
    expect(plan.registry?.titles).toHaveLength(0);
    expect(plan.normalized.titulos).toHaveLength(0);
    expect(plan.warnings.some((w) => w.includes('títulos normalizables'))).toBe(true);
  });

  it('deriva el estado registral histórico del plan (T5.8)', () => {
    const plan = planRemateIntake({
      partida: 'P9',
      cargas: [
        { tipo: 'HIPOTECA', monto: 'S/ 1,234,567.89', moneda: 'S/', estado: 'VIGENTE' },
        { tipo: 'EMBARGO', monto: 'US$ 45,000.00', moneda: 'US$', estado: 'Cancelado' },
      ],
      titulos: [{ titulo: '006-2020', fechaTitulo: '15/03/2020', tipoTitulo: 'INDEPENDIZACION' }],
    });
    expect(plan.normalized.historical).toEqual({
      titleCount: 1,
      chargeCount: 2,
      activeCharges: [
        expect.objectContaining({ chargeType: 'hipoteca', amount: 1234567.89, currency: 'PEN' }),
      ],
      inactiveCharges: [expect.objectContaining({ chargeType: 'embargo', currency: 'USD' })],
      totalActiveDebtPen: 1234567.89,
      totalActiveDebtUsd: 0,
      lastTitleDate: '2020-03-15',
      registryState: 'cargado',
      provenance: expect.objectContaining({
        source: 'sunarp',
        verification: 'inferred',
        parserVersion: 'v1',
      }),
    });
    expect(plan.registry?.historical.registryState).toBe('cargado');
  });

  it('expone un bloque de provenance en la superficie del intake (T5.9)', () => {
    const plan = planRemateIntake(
      {
        partida: 'P9',
        sourceUrlPdf: 'https://remaju.pj.gob.pe/aviso-40451.pdf',
        cargas: [{ tipo: 'HIPOTECA', monto: 'S/ 1,000', moneda: 'S/', estado: 'VIGENTE' }],
        titulos: [{ titulo: '006-2020', fechaTitulo: '15/03/2020', tipoTitulo: 'INDEPENDIZACION' }],
      },
      new Date('2026-09-19T12:00:00.000Z'),
    );

    // Provenance del intake (dato humano).
    expect(plan.normalized.provenance).toEqual({
      source: 'manual',
      sourceUrl: 'https://remaju.pj.gob.pe/aviso-40451.pdf',
      retrievedAt: '2026-09-19T12:00:00.000Z',
      confidence: 'medium',
      verification: 'reported',
      parserVersion: 'manual-v1',
    });
    // La fila registral a persistir tiene su propio bloque (normalización SUNARP).
    expect(plan.registry?.provenance).toEqual({
      source: 'remaju',
      sourceUrl: 'https://remaju.pj.gob.pe/aviso-40451.pdf',
      retrievedAt: '2026-09-19T12:00:00.000Z',
      confidence: 'medium',
      verification: 'reported',
      parserVersion: 'v1',
    });
    // El estado derivado hereda el retrievedAt y marca verification inferred.
    expect(plan.normalized.historical.provenance).toMatchObject({
      source: 'sunarp',
      retrievedAt: '2026-09-19T12:00:00.000Z',
      verification: 'inferred',
      parserVersion: 'v1',
    });
    // El provenance viaja en el rawData del registry (surface de persistencia).
    expect(plan.registry?.rawData.provenance).toEqual(plan.normalized.provenance);
  });

  it('provenance sin sourceUrlPdf → sourceUrl null (T5.9)', () => {
    const plan = planRemateIntake({ partida: 'P9' });
    expect(plan.normalized.provenance.sourceUrl).toBeNull();
    expect(plan.registry?.provenance.sourceUrl).toBeNull();
    expect(plan.normalized.historical.provenance.sourceUrl).toBeNull();
  });

  it('contexto SUNARP atribuye la captura a la fuente real, no a transcripción manual (T5.10)', () => {
    const plan = planRemateIntake(
      { partida: 'P9', cargas: [{ tipo: 'HIPOTECA', monto: 'S/ 1,000', estado: 'VIGENTE' }] },
      new Date('2026-09-19T13:00:00.000Z'),
      { source: 'sunarp', url: 'https://conoce-aqui.sunarp.gob.pe/…' },
    );

    expect(plan.normalized.provenance).toEqual({
      source: 'sunarp',
      sourceUrl: 'https://conoce-aqui.sunarp.gob.pe/…',
      retrievedAt: '2026-09-19T13:00:00.000Z',
      confidence: 'medium',
      verification: 'reported',
      parserVersion: 'v1',
    });
    expect(plan.normalized.provenance.source).not.toBe('manual');
    expect(plan.registry?.source).toBe('sunarp');
    expect(plan.registry?.provenance.source).toBe('sunarp');
    expect(plan.registry?.provenance.parserVersion).toBe('v1');
  });

  it('la URL del operador (sourceUrlPdf) tiene precedencia sobre la del contexto (T5.10)', () => {
    const plan = planRemateIntake(
      { partida: 'P9', sourceUrlPdf: 'https://sprl.sunarp.gob.pe/partida/9' },
      undefined,
      { source: 'sunarp', url: 'https://sprl.sunarp.gob.pe' },
    );
    expect(plan.normalized.provenance.sourceUrl).toBe('https://sprl.sunarp.gob.pe/partida/9');
    expect(plan.normalized.provenance.parserVersion).toBe('v1');
  });
});
