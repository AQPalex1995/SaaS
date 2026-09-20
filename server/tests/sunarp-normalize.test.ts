import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  SUNARP_PARSER_VERSION,
  SUNARP_ZONA_XII_AREA_CODE,
  SUNARP_ZONA_XII_AREA_NAME,
  normalizeRegistryPartida,
  registryLookupKey,
  parseFechaISO,
  normalizeOwnerName,
  normalizeDocumentType,
  normalizeOwnerType,
  parseOwnershipPercentage,
  normalizePropietarios,
  normalizeChargeType,
  normalizeIsActive,
  normalizeCargas,
  normalizeTitulos,
  normalizeAreaM2,
  parseAmount,
  normalizeCurrency,
  normalizeRegistryCapture,
} from '../src/connectors/implementations/sunarp-normalize.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, 'fixtures', 'registry-capture.json'), 'utf8'),
) as Record<string, unknown>;

/**
 * Fase 5 / T5.4 — Normalización registral SUNARP (offline).
 *
 * Convierte la captura manual de una partida (Conoce Aquí / Consulta de
 * Propiedad / SPRL) a un shape canónico tipado, alineado con las tablas
 * `registry_properties` / `registry_owners` / `registry_charges`. La clave
 * canónica `P-XXXXXXXX` (Zona Registral XII — Arequipa) es la que permite
 * deduplicar el cache de pagos de SPRL. Módulo puro: sin red, sin efectos.
 */

describe('T5.4 — normalizeRegistryPartida (clave canónica P-XXXXXXXX)', () => {
  it('acepta el formato canónico P-12345678', () => {
    const r = normalizeRegistryPartida('P-12345678');
    expect(r.ok).toBe(true);
    expect(r.partida).toBe('P-12345678');
    expect(r.digits).toBe('12345678');
    expect(r.areaCode).toBeNull();
    expect(r.warnings).toHaveLength(0);
  });

  it('tolera minúsculas, guiones y espacios: p12345678 / P 1234 5678', () => {
    expect(normalizeRegistryPartida('p12345678').partida).toBe('P-12345678');
    const spaced = normalizeRegistryPartida('P 1234 5678');
    expect(spaced.ok).toBe(true);
    expect(spaced.partida).toBe('P-12345678');
    expect(spaced.warnings).toHaveLength(0);
  });

  it('acepta la partida desnuda de 8 dígitos (12345678)', () => {
    const r = normalizeRegistryPartida('12345678');
    expect(r.ok).toBe(true);
    expect(r.partida).toBe('P-12345678');
    expect(r.areaCode).toBeNull();
  });

  it('detecta el prefijo de la Zona XII (Arequipa, 110): 11012345678 / P 110 0123 4567', () => {
    const full = normalizeRegistryPartida('11012345678');
    expect(full.ok).toBe(true);
    expect(full.areaCode).toBe(SUNARP_ZONA_XII_AREA_CODE);
    expect(full.partida).toBe('P-12345678');
    expect(full.warnings.some((w) => w.includes('Prefijo de oficina'))).toBe(true);

    const spaced = normalizeRegistryPartida('P 110 0123 4567');
    expect(spaced.partida).toBe('P-01234567');
    expect(spaced.areaCode).toBe('110');
  });

  it('rellena partidas cortas a 8 dígitos con advertencia', () => {
    const r = normalizeRegistryPartida('P1');
    expect(r.ok).toBe(true);
    expect(r.partida).toBe('P-00000001');
    expect(r.warnings.some((w) => w.includes('rellenó a 8'))).toBe(true);
  });

  it('rechaza partidas inválidas/inexistentes con error honesto', () => {
    expect(normalizeRegistryPartida('').ok).toBe(false);
    expect(normalizeRegistryPartida('').error).toBe('Partida vacía');
    expect(normalizeRegistryPartida(null).ok).toBe(false);
    expect(normalizeRegistryPartida(undefined).ok).toBe(false);
    const letters = normalizeRegistryPartida('ABCD');
    expect(letters.ok).toBe(false);
    expect(letters.error).toBe('Partida sin dígitos');
    const tooLong = normalizeRegistryPartida('P-123456789');
    expect(tooLong.ok).toBe(false);
    expect(tooLong.error).toContain('máx. 8');
  });

  it('registryLookupKey devuelve la clave canónica o null', () => {
    expect(registryLookupKey(' p-1234-5678 ')).toBe('P-12345678');
    expect(registryLookupKey('11012345678')).toBe('P-12345678');
    expect(registryLookupKey('')).toBeNull();
    expect(registryLookupKey('ABC')).toBeNull();
    expect(registryLookupKey(undefined)).toBeNull();
  });
});

describe('T5.4 — parseFechaISO (fechas dd/MM/yyyy e ISO)', () => {
  it('convierte dd/MM/yyyy a ISO y mantiene ISO', () => {
    expect(parseFechaISO('10/05/2020')).toBe('2020-05-10');
    expect(parseFechaISO('2020-05-10')).toBe('2020-05-10');
  });
  it('rechaza fechas inválidas o vacías', () => {
    expect(parseFechaISO('31/13/2021')).toBeNull();
    expect(parseFechaISO('2020/05/10')).toBeNull();
    expect(parseFechaISO('')).toBeNull();
    expect(parseFechaISO(undefined)).toBeNull();
  });
});

describe('T5.4 — Titulares (owners)', () => {
  it('normalizeOwnerName: Title Case con acentos', () => {
    expect(normalizeOwnerName(' JOSE  LUIS  TORRES ')).toBe('Jose Luis Torres');
    expect(normalizeOwnerName('MARÍA JOSÉ DE LOS ÁNGELES')).toBe('María José De Los Ángeles');
    expect(normalizeOwnerName('')).toBeNull();
    expect(normalizeOwnerName(undefined)).toBeNull();
  });

  it('normalizeDocumentType: DNI/RUC/CE/PASAPORTE y otros', () => {
    expect(normalizeDocumentType('DNI')).toBe('DNI');
    expect(normalizeDocumentType('dni')).toBe('DNI');
    expect(normalizeDocumentType('RUC')).toBe('RUC');
    expect(normalizeDocumentType('Carnet de Extranjería')).toBe('CE');
    expect(normalizeDocumentType('PASAPORTE')).toBe('PASAPORTE');
    expect(normalizeDocumentType('X')).toBe('other');
    expect(normalizeDocumentType('')).toBe('other');
  });

  it('normalizeOwnerType: persona_natural / persona_juridica / desconocido', () => {
    expect(normalizeOwnerType('NATURAL')).toBe('persona_natural');
    expect(normalizeOwnerType('PERSONA JURIDICA')).toBe('persona_juridica');
    expect(normalizeOwnerType('S.A.C.')).toBe('persona_juridica');
    expect(normalizeOwnerType('BANCO')).toBe('persona_juridica');
    expect(normalizeOwnerType('X')).toBe('desconocido');
    expect(normalizeOwnerType('')).toBe('desconocido');
  });

  it('parseOwnershipPercentage: %, decimal y rango 0–100', () => {
    expect(parseOwnershipPercentage('50%')).toBe(50);
    expect(parseOwnershipPercentage('50')).toBe(50);
    expect(parseOwnershipPercentage(0.5)).toBe(50);
    expect(parseOwnershipPercentage('200%')).toBeNull();
    expect(parseOwnershipPercentage('-5')).toBeNull();
    expect(parseOwnershipPercentage('')).toBeNull();
    expect(parseOwnershipPercentage(null)).toBeNull();
  });

  it('normalizePropietarios: array o un único objeto → lista normalizada (T5.5)', () => {
    const list = normalizePropietarios([
      { titular: 'JOSE LUIS TORRES GOMEZ', tipoDocumento: 'DNI', numeroDocumento: '29384756', porcentaje: '50%' },
      { titular: 'INVERSIONES ANDINAS S.A.C.', tipoDocumento: 'RUC', numeroDocumento: '20452687123' },
    ]);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ ownerName: 'Jose Luis Torres Gomez', documentType: 'DNI', ownershipPercentage: 50 });

    const single = normalizePropietarios({ titular: 'MARÍA LUZ QUISPE' });
    expect(single).toHaveLength(1);
    expect(single[0].ownerName).toBe('María Luz Quispe');

    expect(normalizePropietarios(null)).toHaveLength(0);
    expect(normalizePropietarios(undefined)).toHaveLength(0);
    expect(normalizePropietarios(['not-an-object'])).toHaveLength(0);
  });
});

describe('T5.4 — Cargas (charges)', () => {
  it('normalizeChargeType: categorías canónicas', () => {
    expect(normalizeChargeType('HIPOTECA')).toBe('hipoteca');
    expect(normalizeChargeType('EMBARGO PREVENTIVO')).toBe('embargo');
    expect(normalizeChargeType('MEDIDA CAUTELAR')).toBe('medida_cautelar');
    expect(normalizeChargeType('ANOTACIÓN DE DEMANDA')).toBe('anotacion_demanda');
    expect(normalizeChargeType('PROHIBICION DE DISPONER')).toBe('prohibicion');
    expect(normalizeChargeType('SERVIDUMBRE DE PASO')).toBe('servidumbre');
    expect(normalizeChargeType('USUFRUCTO')).toBe('usufructo');
    expect(normalizeChargeType('X')).toBe('other');
  });

  it('normalizeIsActive: si/no/unknown', () => {
    expect(normalizeIsActive('VIGENTE')).toBe('si');
    expect(normalizeIsActive('SI')).toBe('si');
    expect(normalizeIsActive('ACTIVO')).toBe('si');
    expect(normalizeIsActive('CANCELADO')).toBe('no');
    expect(normalizeIsActive('NO')).toBe('no');
    expect(normalizeIsActive('EXTINGUIDO')).toBe('no');
    expect(normalizeIsActive('')).toBe('unknown');
  });

  it('parseAmount: montos con moneda y separadores de miles', () => {
    expect(parseAmount('S/ 1,234.56')).toBe(1234.56);
    expect(parseAmount('US$ 45,000.00')).toBe(45000);
    expect(parseAmount('1 234,56')).toBe(1234.56);
    expect(parseAmount(500)).toBe(500);
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('')).toBeNull();
  });

  it('normalizeCurrency: PEN/USD con default PEN', () => {
    expect(normalizeCurrency('S/')).toBe('PEN');
    expect(normalizeCurrency('')).toBe('PEN');
    expect(normalizeCurrency(undefined)).toBe('PEN');
    expect(normalizeCurrency('USD')).toBe('USD');
    expect(normalizeCurrency('US$')).toBe('USD');
    expect(normalizeCurrency('DÓLARES')).toBe('USD');
  });

  it('normalizeCargas: array o un único objeto → lista normalizada (T5.6)', () => {
    const list = normalizeCargas([
      { tipo: 'HIPOTECA', monto: 'S/ 1,234,567.89', moneda: 'S/', acreedor: 'BANCO DE CREDITO DEL PERU S.A.', fechaInscripcion: '20/05/2020', estado: 'VIGENTE' },
      { tipo: 'EMBARGO', monto: 'US$ 45,000.00', moneda: 'US$', estado: 'Cancelado' },
    ]);
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual({
      chargeType: 'hipoteca',
      description: null,
      amount: 1234567.89,
      currency: 'PEN',
      creditor: 'Banco De Credito Del Peru S.A.',
      registeredDate: '2020-05-20',
      isActive: 'si',
    });
    expect(list[1]).toMatchObject({ chargeType: 'embargo', currency: 'USD', isActive: 'no' });

    const single = normalizeCargas({ tipo: 'USUFRUCTO' });
    expect(single).toHaveLength(1);
    expect(single[0].chargeType).toBe('usufructo');

    expect(normalizeCargas(null)).toHaveLength(0);
    expect(normalizeCargas(undefined)).toHaveLength(0);
    expect(normalizeCargas(['not-an-object'])).toHaveLength(0);
  });

  it('normalizeTitulos: array o un único objeto → lista normalizada (T5.7)', () => {
    const list = normalizeTitulos([
      {
        numeroTitulo: '2019-00012345',
        fecha: '10/01/2019',
        tipo: 'COMPRAVENTA',
        notario: 'LUIS GARCIA VARGAS',
        descripcion: 'Título de propiedad del terreno',
      },
      { titulo: '006-2020', fechaTitulo: '15/03/2020', tipoTitulo: 'INDEPENDIZACION' },
    ]);
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual({
      titleNumber: '2019-00012345',
      titleDate: '2019-01-10',
      titleType: 'COMPRAVENTA',
      notary: 'Luis Garcia Vargas',
      description: 'Título de propiedad del terreno',
    });
    expect(list[1]).toMatchObject({
      titleNumber: '006-2020',
      titleDate: '2020-03-15',
      titleType: 'INDEPENDIZACION',
    });

    const single = normalizeTitulos({ numeroTitulo: 'A-1' });
    expect(single).toHaveLength(1);
    expect(single[0].titleNumber).toBe('A-1');

    expect(normalizeTitulos(null)).toHaveLength(0);
    expect(normalizeTitulos(undefined)).toHaveLength(0);
    expect(normalizeTitulos(['not-an-object'])).toHaveLength(0);
  });
});

describe('T5.4 — normalizeAreaM2', () => {
  it('parsa m² con unidades, miles y números', () => {
    expect(normalizeAreaM2('380 m2')).toBe(380);
    expect(normalizeAreaM2('1,234.56')).toBe(1234.56);
    expect(normalizeAreaM2(550)).toBe(550);
    expect(normalizeAreaM2('0')).toBeNull();
    expect(normalizeAreaM2('')).toBeNull();
    expect(normalizeAreaM2(null)).toBeNull();
  });
});

describe('T5.4 — normalizeRegistryCapture (integración)', () => {
  it('normaliza la captura completa (fixture ofline) a un shape canónico', () => {
    const cap = normalizeRegistryCapture(fixture);

    expect(cap.parserVersion).toBe(SUNARP_PARSER_VERSION);
    // Prefijo 110 (Zona XII) detectado: la clave canónica dedup el cache SPRL.
    expect(cap.partida).toBe('P-01234567');
    expect(cap.areaCode).toBe(SUNARP_ZONA_XII_AREA_CODE);
    expect(cap.warnings.some((w) => w.includes(SUNARP_ZONA_XII_AREA_NAME))).toBe(true);

    expect(cap.registeredAreaM2).toBe(550.75);
    expect(cap.registeredAddress).toBe('Av. Los Geranios 240, Urb. La Florida');
    expect(cap.registeredDistrict).toBe('Arequipa');
    expect(cap.registryOffice).toBe('Zona Registral N° Xii - Sede Arequipa');
    expect(cap.registryZone).toBe('Oficina Registral Arequipa');

    expect(cap.propietarios).toHaveLength(2);
    expect(cap.propietarios[0]).toEqual({
      ownerName: 'Jose Luis Torres Gomez',
      ownerType: 'persona_natural',
      documentType: 'DNI',
      documentNumber: '29384756',
      ownershipPercentage: 50,
      registeredDate: '2020-05-10',
    });
    expect(cap.propietarios[1]).toEqual({
      ownerName: 'Inversiones Andinas S.A.C.',
      ownerType: 'persona_juridica',
      documentType: 'RUC',
      documentNumber: '20452687123',
      ownershipPercentage: 50,
      registeredDate: '2021-06-15',
    });

    expect(cap.cargas).toHaveLength(2);
    expect(cap.cargas[0]).toEqual({
      chargeType: 'hipoteca',
      description: 'Hipoteca a favor del Banco de Crédito',
      amount: 1234567.89,
      currency: 'PEN',
      creditor: 'Banco De Credito Del Peru S.A.',
      registeredDate: '2020-05-20',
      isActive: 'si',
    });
    expect(cap.cargas[1]).toEqual({
      chargeType: 'embargo',
      description: 'Embargo preventivo',
      amount: 45000,
      currency: 'USD',
      creditor: 'Superintendencia Nacional De Aduanas',
      registeredDate: '2022-01-15',
      isActive: 'no',
    });
  });

  it('nunca inventa valores: campos ausentes quedan null/desconocido con warnings', () => {
    const cap = normalizeRegistryCapture({ partida: 'ABC', propietarios: [], cargas: [] });
    expect(cap.partida).toBeNull();
    expect(cap.areaCode).toBeNull();
    expect(cap.registeredAreaM2).toBeNull();
    expect(cap.registeredAddress).toBeNull();
    expect(cap.registeredDistrict).toBeNull();
    expect(cap.propietarios).toHaveLength(0);
    expect(cap.cargas).toHaveLength(0);
    expect(cap.warnings.some((w) => w.includes('Partida no válida'))).toBe(true);
    expect(cap.warnings.some((w) => w.includes('sin propietarios'))).toBe(true);
    expect(cap.warnings.some((w) => w.includes('sin cargas'))).toBe(true);
  });
});