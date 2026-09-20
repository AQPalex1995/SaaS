import { describe, it, expect } from 'vitest';
import {
  SunarpSprlConnector,
  sunarpSprlConnector,
  sunarpSprlManualActionDescription,
  SUNARP_SPRL_URL,
} from '../src/connectors/implementations/sunarp-sprl.js';

/**
 * Fase 5 / T5.3 — SUNARP "SPRL" (offline).
 *
 * Para Verdad: SPRL (publicidad registral en línea) es el servicio con VALOR
 * LEGAL de SUNARP: suscripción gratuita pero consultas DE PAGO. No se automatiza
 * la compra ni se guardan credenciales; el conector reporta postura honesta
 * (requires_auth + requiresManualAction) sin peticiones de red ni datos
 * simulados.
 */
describe('Fase 5 / T5.3 — SUNARP SPRL (postura honesta)', () => {
  it('getStatus reporta requires_auth y la naturaleza de pago', async () => {
    const connector = new SunarpSprlConnector();
    const status = await connector.getStatus();

    expect(status.sourceId).toBe('sunarp_sprl');
    expect(status.status).toBe('requires_auth');
    expect(status.requiresManualAction).toBe(true);
    expect(status.message).toContain('pago');
    expect(status.url).toBe(SUNARP_SPRL_URL);
    expect(status.manualActionDescription).toContain(SUNARP_SPRL_URL);
  });

  it('search devuelve vacío + requiere acción manual (nunca datos simulados)', async () => {
    const connector = new SunarpSprlConnector();
    const result = await connector.search({ query: 'P12345678' });

    expect(result.items).toHaveLength(0);
    expect(result.totalFound).toBe(0);
    expect(result.source).toBe('sunarp_sprl');
    expect(result.requiresManualAction).toBe(true);
    expect(result.manualActionDescription).toContain(SUNARP_SPRL_URL);
  });

  it('getDetails devuelve found=false + instrucción de copia legal', async () => {
    const connector = new SunarpSprlConnector();
    const detail = await connector.getDetails('P12345678');

    expect(detail.found).toBe(false);
    expect(detail.requiresManualAction).toBe(true);
    expect(detail.manualActionDescription).toContain('copia literal');
  });

  it('la guía del operador documenta suscripción gratuita + pago por servicio', () => {
    const description = sunarpSprlManualActionDescription();
    expect(description).toContain(SUNARP_SPRL_URL);
    expect(description).toMatch(/suscripci\u00f3n gratuita|suscripcion gratuita/i);
    expect(description).toMatch(/\u0053\/ ?14|S\/ 14|S\/14/);
    expect(description).toMatch(/No automatizable/);
  });

  it('la instancia singleton comparte la postura', async () => {
    const status = await sunarpSprlConnector.getStatus();
    expect(status.status).toBe('requires_auth');
    expect(status.sourceId).toBe('sunarp_sprl');
  });
});