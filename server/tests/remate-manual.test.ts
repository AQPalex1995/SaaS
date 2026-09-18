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
    expect(plan.normalized.partida).toBe('P12345678');
    expect(plan.normalized.valorDeuda).toBe(150000.5);
    expect(plan.normalized.tasacion).toBe(200000);
    expect(plan.normalized.precioRemate).toBe(180000);
    expect(plan.registry).toMatchObject({
      registryNumber: 'P12345678',
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
});
