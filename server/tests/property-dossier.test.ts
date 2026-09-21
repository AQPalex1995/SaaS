import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { dossierRoutes } from '../src/domain/dossier/routes.js';
import { DossierService } from '../src/domain/dossier/service.js';
import {
  properties,
  researchCases,
  researchTasks,
  researchResults,
  registryProperties,
  registryOwners,
  registryCharges,
  registryTitles,
  urbanZones,
  urbanParameters,
  propertyLocations,
  propertyGeometries,
  judicialCases,
  judicialEvents,
  marketComparables,
  marketPrices,
  propertyScores,
  propertyAlerts,
  documents,
  externalLinks,
} from '../src/db/schema/index.js';

/**
 * RP.4 - Property Dossier (expediente propio /investigaciones/:id).
 *
 * Replaces the drawer as the RESULT view. A single aggregated endpoint exposes
 * the 11 conceptual sections of docs/UX_ARCHITECTURE.md: Resumen (property +
 * informe), Registral, Urbanismo, GIS, Riesgos, Historico, Judicial, Mercado,
 * Evidencias, Infraestructura (PLANNED) e Informe (hecho/senial). All data
 * comes from persisted rows; empty sections stay honest (never invented).
 */

const PROP_ID = '11111111-1111-1111-1111-111111111111';
const PROP_MISSING = '99999999-9999-9999-9999-999999999999';
const CASE_ID = '22222222-2222-2222-2222-222222222222';
const TASK_IDENTITY = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TASK_REGISTRY = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const REG_ENTRY = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

// ── Drizzle WHERE predicate evaluation over in-memory rows ────────────────
function isColumn(node: any): boolean {
  return (
    !!node &&
    typeof node === 'object' &&
    typeof node.name === 'string' &&
    node.table !== undefined
  );
}

function isParam(node: any): boolean {
  return (
    !!node &&
    (node.constructor?.name === 'Param' ||
      (typeof node === 'object' && 'value' in node && 'column' in node))
  );
}

function columnKey(col: any): string | null {
  const table = col?.table;
  if (table && typeof table === 'object') {
    for (const key of Object.keys(table)) {
      if ((table as any)[key] === col) return key;
    }
  }
  return typeof col?.name === 'string' ? col.name : null;
}

function evalWhere(pred: any, row: Record<string, any>): boolean {
  if (!pred || typeof pred !== 'object') return true;
  const chunks = Array.isArray(pred.queryChunks) ? pred.queryChunks : null;
  if (!chunks) return true;

  const innerSq = chunks.filter((c: any) => c?.constructor?.name === 'SQL');
  if (innerSq.length > 0) return innerSq.every((c: any) => evalWhere(c, row));

  const colChunk = chunks.find((c: any) => isColumn(c));
  const paramChunk = chunks.find((c: any) => isParam(c));
  if (colChunk && paramChunk) {
    const key = columnKey(colChunk);
    if (key) return row[key] === paramChunk.value;
  }
  return true;
}

// ── In-memory database (all dossier tables) ───────────────────────────────
function createInMemoryDb(options: { withProperty?: boolean } = {}) {
  const now = new Date('2026-09-21T12:00:00.000Z');
  const state: Record<string, any[]> = {
    cases: [],
    tasks: [],
    results: [],
    properties: options.withProperty
      ? [
          {
            id: PROP_ID,
            publicId: 'PRP-DOSSIER-001',
            title: 'Predio de prueba (expediente)',
            description: null,
            propertyType: 'terreno',
            status: 'active',
            price: '120000',
            currency: 'PEN',
            priceSource: 'listing',
            priceConfidence: 'medium',
            priceVerification: 'reported',
            areaM2: '1000',
            areaSource: 'listing',
            areaConfidence: 'medium',
            areaVerification: 'reported',
            address: 'Av. Ejercito 123',
            district: 'Yanahuara',
            province: 'Arequipa',
            department: 'Arequipa',
            locationSource: 'listing',
            locationConfidence: 'medium',
            locationVerification: 'reported',
            latitude: '-16.40000000',
            longitude: '-71.53000000',
            listingCount: 1,
            metadata: null,
            createdAt: now,
            updatedAt: now,
          },
        ]
      : [],
    registry: [],
    owners: [],
    charges: [],
    titles: [],
    zones: [],
    params: [],
    locations: [],
    geometries: [],
    judicial: [],
    judicialEvents: [],
    comparables: [],
    prices: [],
    scores: [],
    alerts: [],
    documents: [],
    links: [],
  };

  const tableData = (table: any): any[] => {
    if (table === properties) return state.properties;
    if (table === researchCases) return state.cases;
    if (table === researchTasks) return state.tasks;
    if (table === researchResults) return state.results;
    if (table === registryProperties) return state.registry;
    if (table === registryOwners) return state.owners;
    if (table === registryCharges) return state.charges;
    if (table === registryTitles) return state.titles;
    if (table === urbanZones) return state.zones;
    if (table === urbanParameters) return state.params;
    if (table === propertyLocations) return state.locations;
    if (table === propertyGeometries) return state.geometries;
    if (table === judicialCases) return state.judicial;
    if (table === judicialEvents) return state.judicialEvents;
    if (table === marketComparables) return state.comparables;
    if (table === marketPrices) return state.prices;
    if (table === propertyScores) return state.scores;
    if (table === propertyAlerts) return state.alerts;
    if (table === documents) return state.documents;
    if (table === externalLinks) return state.links;
    return [];
  };

  function queryable(data: any[]) {
    const promise = Promise.resolve(data);
    const q: any = {
      where: (pred: any) => queryable(data.filter((r) => evalWhere(pred, r))),
      limit: (n: number) => Promise.resolve(data.slice(0, n)),
      orderBy: () => Promise.resolve(data),
      then: (onf: any, onr: any) => promise.then(onf, onr),
      catch: (onc: any) => promise.catch(onc),
      finally: (onf: any) => promise.finally(onf),
    };
    return q;
  }

  const mockDb: any = {
    select: () => ({
      from: (table: any) => queryable(tableData(table)),
    }),
    _state: state,
  };
  return mockDb;
}

// ── Seed: 1 run/execucion + datos de todas las secciones ──────────────────
function seedFullData(db: any) {
  const now = new Date('2026-09-21T12:00:00.000Z');

  db._state.cases.push({
    id: CASE_ID,
    propertyId: PROP_ID,
    runNumber: 1,
    status: 'completed',
    summary: 'Ejecucion 1',
    errorCount: 0,
    warningCount: 0,
    completedTaskCount: 2,
    totalTaskCount: 8,
    startedAt: new Date('2026-09-20T09:00:00.000Z'),
    completedAt: new Date('2026-09-21T09:15:00.000Z'),
    createdBy: 'user-altamira',
    createdAt: new Date('2026-09-20T09:00:00.000Z'),
    updatedAt: new Date('2026-09-21T09:15:00.000Z'),
  });

  db._state.tasks.push(
    {
      id: TASK_IDENTITY,
      researchCaseId: CASE_ID,
      taskType: 'identity',
      status: 'completed',
      requiresManualAction: false,
    },
    {
      id: TASK_REGISTRY,
      researchCaseId: CASE_ID,
      taskType: 'registry',
      status: 'completed',
      requiresManualAction: false,
    }
  );

  db._state.results.push(
    {
      id: 'r-1',
      researchTaskId: TASK_IDENTITY,
      propertyId: PROP_ID,
      source: 'admin_intake',
      sourceUrl: null,
      retrievedAt: new Date('2026-09-20T10:00:00.000Z'),
      dataType: 'identity',
      data: { codigo: 'INTAKE-001' },
      confidence: 'high',
      verification: 'reported',
      parserVersion: 'intake-v1',
    },
    {
      id: 'r-2',
      researchTaskId: TASK_REGISTRY,
      propertyId: PROP_ID,
      source: 'sunarp_intake',
      sourceUrl: null,
      retrievedAt: new Date('2026-09-20T10:05:00.000Z'),
      dataType: 'registry',
      data: { partida: 'P01012345' },
      confidence: 'high',
      verification: 'reported',
      parserVersion: 'sunarp-v1',
    }
  );

  db._state.registry.push({
    id: REG_ENTRY,
    propertyId: PROP_ID,
    registryNumber: 'P01012345',
    registryOffice: 'Zona Registral XII',
    registryZone: 'Arequipa',
    registeredArea: '1000.00',
    registeredAddress: 'Av. Ejercito 123',
    registeredDistrict: 'Yanahuara',
    source: 'sunarp',
    confidence: 'high',
    verification: 'reported',
    retrievedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  db._state.owners.push({
    id: 'o-1',
    registryPropertyId: REG_ENTRY,
    ownerName: 'JUAN PEREZ GARCIA',
    ownerType: 'persona natural',
    documentType: 'DNI',
    documentNumber: '12345678',
    ownershipPercentage: '50.00',
    registeredDate: new Date('2020-01-15'),
    source: 'sunarp',
  });

  db._state.charges.push(
    {
      id: 'c-1',
      registryPropertyId: REG_ENTRY,
      chargeType: 'hipoteca',
      description: 'Hipoteca bancaria',
      amount: '80000.00',
      currency: 'PEN',
      creditor: 'Banco XYZ',
      registeredDate: new Date('2021-06-01'),
      isActive: 'si',
      source: 'sunarp',
    },
    {
      id: 'c-2',
      registryPropertyId: REG_ENTRY,
      chargeType: 'embargo',
      description: 'Embargo cancelado',
      amount: null,
      currency: null,
      creditor: null,
      registeredDate: new Date('2019-03-10'),
      isActive: 'no',
      source: 'sunarp',
    }
  );

  db._state.titles.push({
    id: 't-1',
    registryPropertyId: REG_ENTRY,
    titleNumber: 'T-0001',
    titleDate: new Date('2010-05-20'),
    titleType: 'compraventa',
    notary: 'Notaria Sanchez',
    description: 'Primer titulo',
    source: 'sunarp',
  });

  db._state.zones.push({
    id: 'z-1',
    propertyId: PROP_ID,
    zoneName: 'Zona Residencial',
    zoneCode: 'RDA',
    zoneType: 'residencial',
    landUse: 'DV - Densificacion Vertical',
    description: 'Zona del Plan de Desarrollo Metropolitano',
    source: 'impla',
    confidence: 'medium',
    verification: 'reported',
    createdAt: now,
  });

  db._state.params.push({
    id: 'p-1',
    propertyId: PROP_ID,
    maxHeight: '11.50',
    maxFloors: '4',
    maxBuildableArea: '0.80',
    minFreeArea: '0.40',
    setbackFront: '3.00',
    setbackSide: '1.50',
    setbackRear: '3.00',
    density: 'Alta',
    compatibleUses: 'Vivienda, comercio local',
    observations: null,
    source: 'impla',
    confidence: 'medium',
    verification: 'reported',
    createdAt: now,
  });

  db._state.locations.push({
    id: 'l-1',
    propertyId: PROP_ID,
    address: 'Av. Ejercito 123',
    district: 'Yanahuara',
    province: 'Arequipa',
    department: 'Arequipa',
    postalCode: null,
    latitude: '-16.40000000',
    longitude: '-71.53000000',
    source: 'listing',
    confidence: 'medium',
    verification: 'reported',
    retrievedAt: now,
    verifiedAt: now,
    createdAt: now,
  });

  db._state.geometries.push({
    id: 'g-1',
    propertyId: PROP_ID,
    geomType: 'polygon',
    source: 'osm',
    confidence: 'medium',
    verification: 'reported',
    createdAt: now,
  });

  db._state.judicial.push({
    id: 'j-1',
    propertyId: PROP_ID,
    caseNumber: '00012-2021-0-0401-JR-CI-01',
    court: 'Juzgado Civil de Arequipa',
    caseType: 'civil',
    subject: 'Cobro de deuda',
    status: 'en tramite',
    filingDate: new Date('2021-08-10'),
    parties: 'Banco XYZ vs Juan Perez',
    source: 'cej',
    sourceUrl: 'https://cej.pj.gob.pe/expediente/00012',
    retrievedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  db._state.judicialEvents.push({
    id: 'je-1',
    judicialCaseId: 'j-1',
    eventDate: new Date('2022-01-20'),
    eventType: 'sentencia',
    description: 'Se emitio sentencia de primera instancia',
    resolution: null,
    createdAt: now,
  });

  db._state.comparables.push({
    id: 'm-1',
    propertyId: PROP_ID,
    comparableTitle: 'Terreno similar en Yanahuara',
    comparableUrl: 'https://example.com/comparable/1',
    comparablePrice: '150000.00',
    comparableCurrency: 'PEN',
    comparableAreaM2: '1200.00',
    comparableDistrict: 'Yanahuara',
    distanceMeters: '800.00',
    pricePerM2: '125.00',
    similarity: '0.8500',
    source: 'market_watch',
    retrievedAt: now,
    createdAt: now,
  });

  db._state.prices.push({
    id: 'mp-1',
    propertyId: PROP_ID,
    estimatedPrice: '130000.00',
    currency: 'PEN',
    pricePerM2: '130.00',
    estimationType: 'comparables',
    confidence: 'medium',
    source: 'market_watch',
    retrievedAt: now,
    createdAt: now,
  });

  db._state.scores.push({
    id: 's-1',
    propertyId: PROP_ID,
    scoreType: 'opportunity',
    scoreValue: '72.0000',
    maxValue: '100',
    label: 'Oportunidad',
    description: 'Indice de oportunidad',
    confidence: 'medium',
    calculatedAt: now,
    createdAt: now,
  });

  db._state.alerts.push({
    id: 'a-1',
    propertyId: PROP_ID,
    alertType: 'carga_activa',
    severity: 'high',
    status: 'active',
    title: 'Hipoteca activa detectada',
    description: 'Existe una hipoteca vigente sobre la partida',
    source: 'sunarp',
    createdAt: now,
    updatedAt: now,
  });

  db._state.documents.push({
    id: 'd-1',
    propertyId: PROP_ID,
    documentType: 'intake',
    fileName: 'denuncia.png',
    mimeType: 'image/png',
    sizeBytes: 102400,
    storagePath: null,
    storageUrl: 'https://cdn.example.com/denuncia.png',
    checksum: 'abc123',
    source: 'admin_intake',
    description: 'Captura de denuncia',
    createdAt: now,
  });

  db._state.links.push({
    id: 'e-1',
    propertyId: PROP_ID,
    url: 'https://example.com/partida/P01012345',
    title: 'Partida SUNARP',
    linkType: 'registry',
    source: 'sunarp',
    isAccessible: 'unknown',
    createdAt: now,
  });
}

describe('RP.4 - Property Dossier', () => {
  // ── Domain: DossierService ─────────────────────────────────────────────
  it('dossier: returns null for a property that does not exist', async () => {
    const db = createInMemoryDb();
    const service = new DossierService(db);
    expect(await service.getPropertyDossier(PROP_MISSING)).toBeNull();
  });

  it('dossier: aggregates all 11 sections from persisted rows', async () => {
    const db = createInMemoryDb({ withProperty: true });
    seedFullData(db);
    const service = new DossierService(db);
    const d = await service.getPropertyDossier(PROP_ID);
    if (!d) throw new Error('expected dossier for existing property');

    expect(d.property.publicId).toBe('PRP-DOSSIER-001');
    expect(typeof d.generatedAt).toBe('string');

    // Resumen.
    expect(d.runs.map((r) => r.runNumber)).toEqual([1]);

    // Infraestructura: PLANNED, nunca inventada.
    expect(d.infrastructure).toEqual({});

    // Riesgos: scores + alertas con datos reales.
    expect(d.risks.scores.length).toBe(1);
    expect(d.risks.scores[0].scoreType).toBe('opportunity');
    expect(d.risks.alerts.length).toBe(1);
    expect(d.risks.alerts[0].severity).toBe('high');

    // Registral: entrada + titulares/cargas/titulos.
    expect(d.registry.length).toBe(1);
    expect(d.registry[0].registryNumber).toBe('P01012345');
    expect(d.registry[0].owners).toHaveLength(1);
    expect(d.registry[0].owners[0].ownerName).toBe('JUAN PEREZ GARCIA');
    expect(d.registry[0].charges).toHaveLength(2);
    expect(d.registry[0].charges.filter((c: any) => c.isActive === 'si')).toHaveLength(1);
    expect(d.registry[0].titles).toHaveLength(1);

    // Urbanismo.
    expect(d.urbanism.zones[0].landUse).toBe('DV - Densificacion Vertical');
    expect(d.urbanism.parameters[0].maxFloors).toBe('4');

    // GIS.
    expect(d.gis.locations[0].district).toBe('Yanahuara');
    expect(d.gis.geometries[0].geomType).toBe('polygon');
    expect(d.gis.mapLink).toContain('google.com/maps');

    // Judicial.
    expect(d.judicial.length).toBe(1);
    expect(d.judicial[0].events[0].eventType).toBe('sentencia');

    // Mercado.
    expect(d.market.comparables[0].comparablePrice).toBe('150000.00');
    expect(d.market.prices[0].estimatedPrice).toBe('130000.00');

    // Evidencias: resultados con taskType + exposure via run.
    expect(d.evidence.results).toHaveLength(2);
    const byTask = Object.fromEntries(
      d.evidence.results.map((r: any) => [r.taskType, r])
    );
    expect(byTask.identity.source).toBe('admin_intake');
    expect(byTask.registry.runNumber).toBe(1);
    expect(byTask.registry.taskStatus).toBe('completed');
    expect(d.evidence.documents).toHaveLength(1);
    expect(d.evidence.links).toHaveLength(1);

    // Historico (RP.3) reutilizado.
    expect(d.history).not.toBeNull();
    expect(d.history!.runs.map((r: any) => r.runNumber)).toEqual([1]);

    // Informe: derivado de datos reales (regla hecho/senial).
    const labels = d.report.map((r) => r.label);
    expect(labels).toContain('Investigaciones');
    expect(labels).toContain('Coordenadas');
    expect(labels).toContain('Registro (SUNARP)');
    expect(labels).toContain('Alertas');
    expect(labels).toContain('Evidencias');
    expect(labels).toContain('Mercado');
    const registro = d.report.find((r) => r.label === 'Registro (SUNARP)')!;
    expect(registro.kind).toBe('requiere_verificacion'); // 1 carga activa.
    expect(registro.value).toContain('1 carga(s) activa(s)');
    const infra = d.report.find((r) => r.label === 'Infraestructura')!;
    expect(infra.kind).toBe('unavailable');
  });

  it('dossier: a fresh property shows honest empty sections (never invented)', async () => {
    const db = createInMemoryDb({ withProperty: true });
    const service = new DossierService(db);
    const d = await service.getPropertyDossier(PROP_ID);
    if (!d) throw new Error('expected dossier for existing property');

    expect(d.runs).toEqual([]);
    expect(d.registry).toEqual([]);
    expect(d.urbanism.zones).toEqual([]);
    expect(d.urbanism.parameters).toEqual([]);
    expect(d.gis.locations).toEqual([]);
    expect(d.gis.geometries).toEqual([]);
    // mapLink se deriva de las coordenadas del predio (propiedad), no del GIS.
    expect(d.gis.mapLink).toContain('google.com/maps');
    expect(d.judicial).toEqual([]);
    expect(d.market.comparables).toEqual([]);
    expect(d.market.prices).toEqual([]);
    expect(d.evidence.results).toEqual([]);
    expect(d.risks.scores).toEqual([]);
    expect(d.risks.alerts).toEqual([]);

    expect(d.history).not.toBeNull();
    expect(d.history!.runs).toEqual([]);

    const unavailable = d.report.filter((r) => r.kind === 'unavailable').map((r) => r.label);
    expect(unavailable).toEqual(
      expect.arrayContaining(['Registro (SUNARP)', 'Urbanismo', 'Judicial', 'Infraestructura'])
    );
    const investigations = d.report.find((r) => r.label === 'Investigaciones')!;
    expect(investigations.value).toBe('Sin ejecuciones aún');
  });

  // ── API ────────────────────────────────────────────────────────────────
  async function buildTestApp(db: any) {
    const app = Fastify();
    await app.register((instance) =>
      dossierRoutes(instance, { service: new DossierService(db), db }),
    );
    await app.ready();
    return app;
  }

  it('api: GET /api/v1/properties/:id/dossier returns the full dossier', async () => {
    const db = createInMemoryDb({ withProperty: true });
    seedFullData(db);
    const app = await buildTestApp(db);
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/properties/${PROP_ID}/dossier`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.property.publicId).toBe('PRP-DOSSIER-001');
    expect(body.data.registry.length).toBe(1);
    expect(body.data.judicial.length).toBe(1);
    expect(body.data.report.some((r: any) => r.kind === 'requiere_verificacion')).toBe(true);
    await app.close();
  });

  it('api: GET /api/v1/properties/:id/dossier returns 404 for a nonexistent property', async () => {
    const db = createInMemoryDb();
    const app = await buildTestApp(db);
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/properties/${PROP_MISSING}/dossier`,
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('page: GET /investigaciones/:id serves the expediente HTML', async () => {
    const db = createInMemoryDb({ withProperty: true });
    const app = await buildTestApp(db);
    const res = await app.inject({
      method: 'GET',
      url: '/investigaciones/' + PROP_ID,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Expediente');
    expect(res.body).toContain('/api/v1/properties/');
    await app.close();
  });
});