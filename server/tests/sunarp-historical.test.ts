import { describe, it, expect } from 'vitest';
import { deriveHistoricalState } from '../src/connectors/implementations/sunarp-historical.js';
import type { CargaNormalizada, TituloNormalizado } from '../src/connectors/implementations/sunarp-normalize.js';

/**
 * Fase 5 / T5.8 — Historical data (offline).
 *
 * Deriva el estado registral de la partida desde el historial de títulos y
 * cargas ya normalizados (T5.6/T5.7). Función pura: sin DB, sin red.
 */

const hipotecaVigente: CargaNormalizada = {
  chargeType: 'hipoteca',
  description: 'Hipoteca a favor del Banco de Crédito',
  amount: 1234567.89,
  currency: 'PEN',
  creditor: 'Banco De Credito Del Peru S.A.',
  registeredDate: '2020-05-20',
  isActive: 'si',
};

const embargoVigente: CargaNormalizada = {
  chargeType: 'embargo',
  description: null,
  amount: 45000,
  currency: 'USD',
  creditor: null,
  registeredDate: null,
  isActive: 'si',
};

const hipotecaVencida: CargaNormalizada = {
  chargeType: 'hipoteca',
  description: null,
  amount: 50000,
  currency: 'PEN',
  creditor: null,
  registeredDate: null,
  isActive: 'no',
};

const tituloCompraventa: TituloNormalizado = {
  titleNumber: '2019-00012345',
  titleDate: '2019-01-10',
  titleType: 'COMPRAVENTA',
  notary: 'Luis Garcia Vargas',
  description: 'Título de propiedad del terreno',
};

const tituloIndependizacion: TituloNormalizado = {
  titleNumber: '006-2020',
  titleDate: '2020-03-15',
  titleType: 'INDEPENDIZACION',
  notary: null,
  description: null,
};

describe('T5.8 — deriveHistoricalState', () => {
  it('sin cargas ni títulos → desconocido', () => {
    const s = deriveHistoricalState([], []);
    expect(s.registryState).toBe('desconocido');
    expect(s.titleCount).toBe(0);
    expect(s.chargeCount).toBe(0);
    expect(s.totalActiveDebtPen).toBe(0);
    expect(s.totalActiveDebtUsd).toBe(0);
    expect(s.lastTitleDate).toBeNull();
    expect(s.activeCharges).toHaveLength(0);
    expect(s.inactiveCharges).toHaveLength(0);
  });

  it('solo cargas vencidas → sano (sin deuda activa)', () => {
    const s = deriveHistoricalState([], [hipotecaVencida]);
    expect(s.registryState).toBe('sano');
    expect(s.chargeCount).toBe(1);
    expect(s.activeCharges).toHaveLength(0);
    expect(s.inactiveCharges).toHaveLength(1);
    expect(s.totalActiveDebtPen).toBe(0);
    expect(s.totalActiveDebtUsd).toBe(0);
    expect(s.lastTitleDate).toBeNull();
  });

  it('cargas vigentes PEN y USD → cargado con deuda activa por moneda', () => {
    const s = deriveHistoricalState([], [hipotecaVigente, embargoVigente, hipotecaVencida]);
    expect(s.registryState).toBe('cargado');
    expect(s.chargeCount).toBe(3);
    expect(s.activeCharges).toHaveLength(2);
    expect(s.inactiveCharges).toHaveLength(1);
    expect(s.totalActiveDebtPen).toBe(1234567.89);
    expect(s.totalActiveDebtUsd).toBe(45000);
  });

  it('última fecha de asiento = máximo de los títulos (ISO)', () => {
    const s = deriveHistoricalState([tituloCompraventa, tituloIndependizacion], []);
    expect(s.lastTitleDate).toBe('2020-03-15');
    expect(s.titleCount).toBe(2);
    expect(s.registryState).toBe('desconocido');
  });

  it('títulos sin fechas → lastTitleDate null', () => {
    const s = deriveHistoricalState([{ ...tituloCompraventa, titleDate: null }], []);
    expect(s.lastTitleDate).toBeNull();
  });

  it('expone un bloque de provenance en el estado derivado (T5.9)', () => {
    const s = deriveHistoricalState(
      [tituloCompraventa],
      [hipotecaVigente],
      { retrievedAt: '2026-09-19T12:00:00.000Z' },
    );
    // El estado derivado es una derivación del sistema: source sunarp,
    // verification inferred (regla HECHO/SEÑAL de RESEARCH_GOVERNANCE.md §2).
    expect(s.provenance).toEqual({
      source: 'sunarp',
      sourceUrl: null,
      retrievedAt: '2026-09-19T12:00:00.000Z',
      confidence: 'medium',
      verification: 'inferred',
      parserVersion: 'v1',
    });
  });

  it('permite sobrescribir parcialmente el provenance (T5.9)', () => {
    const s = deriveHistoricalState([], [], {
      sourceUrl: 'https://sprl.sunarp.gob.pe/consulta',
      confidence: 'high',
    });
    expect(s.provenance).toMatchObject({
      source: 'sunarp',
      sourceUrl: 'https://sprl.sunarp.gob.pe/consulta',
      confidence: 'high',
      verification: 'inferred',
      parserVersion: 'v1',
    });
  });
});