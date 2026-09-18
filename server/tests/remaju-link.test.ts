import { describe, it, expect } from 'vitest';
import {
  addressTokens,
  linkRemateToProperties,
  normalizePartida,
  pickHardLink,
  type PropertyLinkCandidate,
} from '../src/connectors/implementations/remaju-link';

describe('REM@JU property linking (T4.5a)', () => {
  it('normaliza la partida (mayúsculas, sin espacios/guiones)', () => {
    expect(normalizePartida(' p-1234-5678 ')).toBe('P12345678');
    expect(normalizePartida(null)).toBeNull();
    expect(normalizePartida('   ')).toBeNull();
  });

  it('tokeniza direcciones sin acentos ni stopwords', () => {
    const tokens = addressTokens('Av. José Luis Bustamante y Rivero 400, Urb. Los Álamos');
    expect(tokens.has('400')).toBe(true);
    expect(tokens.has('bustamante')).toBe(true);
    expect(tokens.has('alamos')).toBe(true);
    expect(tokens.has('av')).toBe(false);
    expect(tokens.has('los')).toBe(false);
  });

  it('enlaza fuerte por partida registral exacta', () => {
    const candidates: PropertyLinkCandidate[] = [
      { propertyId: 'p1', registryNumber: 'P-1234-5678' },
      { propertyId: 'p2', registryNumber: 'P-9999-0000' },
    ];
    const links = linkRemateToProperties({ partida: 'p 1234 5678' }, candidates);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      propertyId: 'p1',
      matchType: 'partida',
      confidence: 'high',
      score: 1,
    });
    expect(pickHardLink(links)?.propertyId).toBe('p1');
  });

  it('match débil por distrito+dirección queda como candidato (nunca hard)', () => {
    const candidates: PropertyLinkCandidate[] = [
      {
        propertyId: 'p1',
        district: 'Arequipa',
        address: 'Av. Ejercito 400, Yanahuara referencia parque',
      },
      { propertyId: 'p2', district: 'Arequipa', address: 'Calle Misti 100' },
    ];
    const links = linkRemateToProperties(
      { ubicacionKey: 'AREQUIPA', direccion: 'Avenida Ejercito 400' },
      candidates,
    );
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0].propertyId).toBe('p1');
    expect(links[0].matchType).toBe('address');
    expect(['medium', 'low']).toContain(links[0].confidence);
    expect(pickHardLink(links)).toBeNull();
  });

  it('solo distrito produce señal low', () => {
    const links = linkRemateToProperties(
      { ubicacionKey: 'MIRAFLORES' },
      [{ propertyId: 'p1', district: 'Miraflores', address: 'Calle X 1' }],
    );
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ matchType: 'district', confidence: 'low', score: 0.3 });
    expect(pickHardLink(links)).toBeNull();
  });

  it('ordena por score y descarta candidatos sin relación', () => {
    const links = linkRemateToProperties(
      { partida: 'P1', ubicacionKey: 'AREQUIPA', direccion: 'Los Alamos 400' },
      [
        { propertyId: 'weak', district: 'Cusco', address: 'av. sol 10' },
        { propertyId: 'strong', registryNumber: 'P1' },
        { propertyId: 'none', district: 'Lima', address: 'av. brasil 1' },
      ],
    );
    expect(links.map((l) => l.propertyId)).toEqual(['strong']);
  });
});
