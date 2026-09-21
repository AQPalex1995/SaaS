import { eq } from 'drizzle-orm';
import { getDb, type Database } from '../../db/connection.js';
import {
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
} from '../../db/schema/index.js';
import { PropertyService } from '../properties/service.js';
import { ResearchHistoryService } from '../research/history.js';
import {
  type PropertyDossierDTO,
  type ResearchRunDTO,
  type DossierRegistryEntryDTO,
  type DossierRegistryOwnerDTO,
  type DossierRegistryChargeDTO,
  type DossierRegistryTitleDTO,
  type DossierUrbanZoneDTO,
  type DossierUrbanParamDTO,
  type DossierGisLocationDTO,
  type DossierGisGeometryDTO,
  type DossierJudicialCaseDTO,
  type DossierJudicialEventDTO,
  type DossierMarketComparableDTO,
  type DossierMarketPriceDTO,
  type DossierEvidenceResultDTO,
  type DossierDocumentDTO,
  type DossierExternalLinkDTO,
  type DossierReportEntryDTO,
  type PropertyScoreDTO,
  type PropertyAlertDTO,
} from '../../dto/index.js';

/**
 * RP.4 — Property Dossier Service.
 *
 * Ensambla el expediente completo de un predio (`/investigaciones/:id`), que
 * sustituye al drawer del dashboard como vista del RESULTADO. Agrega las
 * secciones conceptuales de docs/UX_ARCHITECTURE.md §3 a partir de datos ya
 * persistidos; ninguna sección inventa datos (política anti-stub): las que no
 * tienen fuentes se devuelven vacías o como `unavailable` en el informe.
 */

type CaseRow = typeof researchCases.$inferSelect;
type TaskRow = typeof researchTasks.$inferSelect;
type ResultRow = typeof researchResults.$inferSelect;
type RegistryRow = typeof registryProperties.$inferSelect;
type OwnerRow = typeof registryOwners.$inferSelect;
type ChargeRow = typeof registryCharges.$inferSelect;
type TitleRow = typeof registryTitles.$inferSelect;
type ZoneRow = typeof urbanZones.$inferSelect;
type ParamRow = typeof urbanParameters.$inferSelect;
type LocationRow = typeof propertyLocations.$inferSelect;
type GeometryRow = typeof propertyGeometries.$inferSelect;
type JudicialRow = typeof judicialCases.$inferSelect;
type JudicialEventRow = typeof judicialEvents.$inferSelect;
type ComparableRow = typeof marketComparables.$inferSelect;
type PriceRow = typeof marketPrices.$inferSelect;
type ScoreRow = typeof propertyScores.$inferSelect;
type AlertRow = typeof propertyAlerts.$inferSelect;
type DocumentRow = typeof documents.$inferSelect;
type LinkRow = typeof externalLinks.$inferSelect;

export class DossierService {
  private db: Database;
  private properties: PropertyService;
  private history: ResearchHistoryService;

  constructor(db?: Database) {
    this.db = db ?? getDb();
    this.properties = new PropertyService(this.db);
    this.history = new ResearchHistoryService(this.db);
  }

  /**
   * Expediente completo del predio. `null` si el predio no existe.
   */
  async getPropertyDossier(propertyId: string): Promise<PropertyDossierDTO | null> {
    const property = await this.properties.getById(propertyId);
    if (!property) return null;

    const [
      caseRows,
      resultRows,
      registryRows,
      zoneRows,
      paramRows,
      locationRows,
      geometryRows,
      judicialRows,
      comparableRows,
      priceRows,
      scoreRows,
      alertRows,
      documentRows,
      linkRows,
      history,
    ] = await Promise.all([
      this.db.select().from(researchCases).where(eq(researchCases.propertyId, propertyId)),
      this.db.select().from(researchResults).where(eq(researchResults.propertyId, propertyId)),
      this.db.select().from(registryProperties).where(eq(registryProperties.propertyId, propertyId)),
      this.db.select().from(urbanZones).where(eq(urbanZones.propertyId, propertyId)),
      this.db.select().from(urbanParameters).where(eq(urbanParameters.propertyId, propertyId)),
      this.db.select().from(propertyLocations).where(eq(propertyLocations.propertyId, propertyId)),
      this.db.select().from(propertyGeometries).where(eq(propertyGeometries.propertyId, propertyId)),
      this.db.select().from(judicialCases).where(eq(judicialCases.propertyId, propertyId)),
      this.db.select().from(marketComparables).where(eq(marketComparables.propertyId, propertyId)),
      this.db.select().from(marketPrices).where(eq(marketPrices.propertyId, propertyId)),
      this.db.select().from(propertyScores).where(eq(propertyScores.propertyId, propertyId)),
      this.db.select().from(propertyAlerts).where(eq(propertyAlerts.propertyId, propertyId)),
      this.db.select().from(documents).where(eq(documents.propertyId, propertyId)),
      this.db.select().from(externalLinks).where(eq(externalLinks.propertyId, propertyId)),
      this.history.getPropertyHistory(propertyId),
    ]);

    // Ejecuciones ordenadas cronológicamente (resumen del expediente).
    caseRows.sort((a, b) => (a.runNumber ?? 0) - (b.runNumber ?? 0));
    const runs: ResearchRunDTO[] = caseRows.map((c) => this.toRun(c));
    const latestRun = runs.length > 0 ? runs[runs.length - 1] : null;

    // Registral — entrada de partida + titulares/cargas/títulos.
    const registry: DossierRegistryEntryDTO[] = await Promise.all(
      registryRows.map(async (r) => {
        const [owners, charges, titles] = await Promise.all([
          this.db.select().from(registryOwners).where(eq(registryOwners.registryPropertyId, r.id)),
          this.db.select().from(registryCharges).where(eq(registryCharges.registryPropertyId, r.id)),
          this.db.select().from(registryTitles).where(eq(registryTitles.registryPropertyId, r.id)),
        ]);
        return this.toRegistryEntry(r, owners, charges, titles);
      })
    );

    // Judicial — expedientes con sus eventos.
    const judicial: DossierJudicialCaseDTO[] = await Promise.all(
      judicialRows.map(async (j) => {
        const events = await this.db
          .select()
          .from(judicialEvents)
          .where(eq(judicialEvents.judicialCaseId, j.id));
        return this.toJudicial(j, events);
      })
    );

    // Evidencias — resultados de investigación con contexto de tarea/ejecución.
    const evidenceResults = await this.buildEvidence(caseRows, resultRows);

    const scores: PropertyScoreDTO[] = scoreRows.map((s) => ({
      id: s.id,
      propertyId: s.propertyId,
      scoreType: s.scoreType,
      scoreValue: s.scoreValue,
      maxValue: s.maxValue,
      label: s.label,
      description: s.description,
      confidence: s.confidence ?? 'unknown',
      calculatedAt: s.calculatedAt?.toISOString() ?? null,
    }));
    const alerts: PropertyAlertDTO[] = alertRows.map((a) => ({
      id: a.id,
      propertyId: a.propertyId,
      alertType: a.alertType,
      severity: a.severity ?? 'info',
      status: a.status ?? 'active',
      title: a.title,
      description: a.description,
      source: a.source,
      createdAt: a.createdAt.toISOString(),
    }));

    return {
      property,
      runs,
      risks: { scores, alerts },
      registry,
      urbanism: {
        zones: zoneRows.map((z) => this.toZone(z)),
        parameters: paramRows.map((p) => this.toParam(p)),
      },
      gis: {
        locations: locationRows.map((l) => this.toLocation(l)),
        geometries: geometryRows.map((g) => this.toGeometry(g)),
        mapLink: this.mapLink(property.latitude, property.longitude),
      },
      infrastructure: {},
      history,
      judicial,
      market: {
        comparables: comparableRows.map((c) => this.toComparable(c)),
        prices: priceRows.map((p) => this.toPrice(p)),
      },
      evidence: {
        results: evidenceResults,
        documents: documentRows.map((d) => this.toDocument(d)),
        links: linkRows.map((l) => this.toLink(l)),
      },
      report: this.buildReport({
        property,
        runs,
        latestRun,
        registry,
        alerts,
        comparableCount: comparableRows.length,
        priceCount: priceRows.length,
        resultCount: evidenceResults.length,
        zoneCount: zoneRows.length,
        judicialCount: judicialRows.length,
      }),
      generatedAt: new Date().toISOString(),
    };
  }

  // ── Evidencias: resultados con contexto de tarea/ejecución ──────────────
  private async buildEvidence(
    caseRows: CaseRow[],
    resultRows: ResultRow[]
  ): Promise<DossierEvidenceResultDTO[]> {
    interface TaskCtx {
      taskType: string;
      status: string;
      caseId: string;
      runNumber: number;
    }
    const taskCtx = new Map<string, TaskCtx>();

    for (const c of caseRows) {
      const tasks = await this.db
        .select()
        .from(researchTasks)
        .where(eq(researchTasks.researchCaseId, c.id));
      for (const t of tasks) {
        taskCtx.set(t.id, {
          taskType: t.taskType ?? '',
          status: t.status ?? 'pending',
          caseId: c.id,
          runNumber: c.runNumber ?? 0,
        });
      }
    }

    return resultRows
      .filter((r) => taskCtx.has(r.researchTaskId))
      .map((r): DossierEvidenceResultDTO => {
        const ctx = taskCtx.get(r.researchTaskId)!;
        return {
          id: r.id,
          researchTaskId: r.researchTaskId,
          researchCaseId: ctx.caseId,
          runNumber: ctx.runNumber,
          taskType: ctx.taskType,
          taskStatus: ctx.status,
          source: r.source,
          sourceUrl: r.sourceUrl,
          retrievedAt: r.retrievedAt?.toISOString() ?? null,
          dataType: r.dataType,
          data: r.data as Record<string, unknown> | null,
          confidence: r.confidence ?? 'unknown',
          verification: r.verification ?? 'reported',
          parserVersion: r.parserVersion,
        };
      });
  }

  // ── Informe: hallazgos derivados de datos reales (regla hecho/señal) ────
  private buildReport(input: {
    property: PropertyDossierDTO['property'];
    runs: ResearchRunDTO[];
    latestRun: ResearchRunDTO | null;
    registry: DossierRegistryEntryDTO[];
    alerts: PropertyAlertDTO[];
    comparableCount: number;
    priceCount: number;
    resultCount: number;
    zoneCount: number;
    judicialCount: number;
  }): DossierReportEntryDTO[] {
    const entries: DossierReportEntryDTO[] = [];

    // HECHO — ejecuciones y progreso.
    entries.push({
      label: 'Investigaciones',
      value:
        input.runs.length === 0
          ? 'Sin ejecuciones aún'
          : `${input.runs.length} ejecución(es) · última ${input.latestRun?.runNumber ?? 0} (${input.latestRun?.status ?? ''})`,
      kind: 'fact',
      source: 'research_cases',
    });

    // HECHO — coordenadas / localización.
    if (input.property.latitude && input.property.longitude) {
      entries.push({
        label: 'Coordenadas',
        value: `${input.property.latitude}, ${input.property.longitude}`,
        kind: 'fact',
        source: 'properties',
      });
    }

    // HECHO/SEÑAL — registro registral.
    const activeCharges = input.registry.reduce(
      (n, e) => n + e.charges.filter((c) => c.isActive === 'si').length,
      0
    );
    if (input.registry.length > 0) {
      entries.push({
        label: 'Registro (SUNARP)',
        value: `${input.registry.length} partida(s) capturada(s)${
          activeCharges > 0 ? ` · ${activeCharges} carga(s) activa(s)` : ''
        }`,
        kind: activeCharges > 0 ? 'requiere_verificacion' : 'fact',
        source: 'registry_properties',
      });
    } else {
      entries.push({
        label: 'Registro (SUNARP)',
        value: 'Sin datos registrales capturados',
        kind: 'unavailable',
        source: 'registry_properties',
      });
    }

    // HECHO/SEÑAL — alertas de riesgo.
    const activeAlerts = input.alerts.filter((a) => a.status === 'active');
    if (activeAlerts.length > 0) {
      entries.push({
        label: 'Alertas',
        value: `${activeAlerts.length} alerta(s) activa(s): ${activeAlerts
          .map((a) => `${a.severity} ${a.alertType}`)
          .join(', ')}`,
        kind: activeAlerts.some((a) => a.severity === 'critical' || a.severity === 'high')
          ? 'requiere_verificacion'
          : 'signal',
        source: 'property_alerts',
      });
    }

    // HECHO — evidencia de investigación.
    entries.push({
      label: 'Evidencias',
      value: `${input.resultCount} resultado(s) de investigación capturado(s)`,
      kind: 'fact',
      source: 'research_results',
    });

    // HECHO — mercado.
    if (input.comparableCount > 0 || input.priceCount > 0) {
      entries.push({
        label: 'Mercado',
        value: `${input.comparableCount} comparable(s) · ${input.priceCount} precio(s) estimado(s)`,
        kind: 'fact',
        source: 'market_comparables/market_prices',
      });
    }

    // NO DISPONIBLE — secciones sin fuentes todavía (nunca inventadas).
    if (input.zoneCount === 0) {
      entries.push({
        label: 'Urbanismo',
        value: 'Sin zonificación/parámetros aún',
        kind: 'unavailable',
        source: 'urban_zones',
      });
    }
    if (input.judicialCount === 0) {
      entries.push({
        label: 'Judicial',
        value: 'Sin expedientes coincidentes aún',
        kind: 'unavailable',
        source: 'judicial_cases',
      });
    }
    entries.push({
      label: 'Infraestructura',
      value: 'Sección PLANNED (sin fuentes conectadas)',
      kind: 'unavailable',
      source: 'infrastructure (planned)',
    });

    return entries;
  }

  // ── Mappers ─────────────────────────────────────────────────────────────
  private toRun(row: CaseRow): ResearchRunDTO {
    return {
      runNumber: row.runNumber ?? 0,
      caseId: row.id,
      status: row.status ?? 'pending',
      summary: row.summary,
      errorCount: row.errorCount ?? 0,
      warningCount: row.warningCount ?? 0,
      completedTaskCount: row.completedTaskCount ?? 0,
      totalTaskCount: row.totalTaskCount ?? 0,
      startedAt: row.startedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toRegistryEntry(
    row: RegistryRow,
    owners: OwnerRow[],
    charges: ChargeRow[],
    titles: TitleRow[]
  ): DossierRegistryEntryDTO {
    const ownerDTOs: DossierRegistryOwnerDTO[] = owners.map((o) => ({
      id: o.id,
      ownerName: o.ownerName,
      ownerType: o.ownerType,
      documentType: o.documentType,
      documentNumber: o.documentNumber,
      ownershipPercentage: o.ownershipPercentage,
      registeredDate: o.registeredDate ?? null,
    }));
    const chargeDTOs: DossierRegistryChargeDTO[] = charges.map((c) => ({
      id: c.id,
      chargeType: c.chargeType,
      description: c.description,
      amount: c.amount,
      currency: c.currency,
      creditor: c.creditor,
      registeredDate: c.registeredDate ?? null,
      isActive: c.isActive ?? 'unknown',
    }));
    const titleDTOs: DossierRegistryTitleDTO[] = titles.map((t) => ({
      id: t.id,
      titleNumber: t.titleNumber,
      titleDate: t.titleDate ?? null,
      titleType: t.titleType,
      notary: t.notary,
      description: t.description,
    }));
    return {
      id: row.id,
      registryNumber: row.registryNumber,
      registryOffice: row.registryOffice,
      registryZone: row.registryZone,
      registeredArea: row.registeredArea,
      registeredAddress: row.registeredAddress,
      registeredDistrict: row.registeredDistrict,
      source: row.source,
      confidence: row.confidence ?? 'unknown',
      verification: row.verification ?? 'reported',
      retrievedAt: row.retrievedAt?.toISOString() ?? null,
      owners: ownerDTOs,
      charges: chargeDTOs,
      titles: titleDTOs,
    };
  }

  private toZone(row: ZoneRow): DossierUrbanZoneDTO {
    return {
      id: row.id,
      zoneName: row.zoneName,
      zoneCode: row.zoneCode,
      zoneType: row.zoneType,
      landUse: row.landUse,
      description: row.description,
      source: row.source,
      confidence: row.confidence ?? 'unknown',
      verification: row.verification ?? 'reported',
    };
  }

  private toParam(row: ParamRow): DossierUrbanParamDTO {
    return {
      id: row.id,
      maxHeight: row.maxHeight,
      maxFloors: row.maxFloors,
      maxBuildableArea: row.maxBuildableArea,
      minFreeArea: row.minFreeArea,
      setbackFront: row.setbackFront,
      setbackSide: row.setbackSide,
      setbackRear: row.setbackRear,
      density: row.density,
      compatibleUses: row.compatibleUses,
      observations: row.observations,
      source: row.source,
      confidence: row.confidence ?? 'unknown',
      verification: row.verification ?? 'reported',
    };
  }

  private toLocation(row: LocationRow): DossierGisLocationDTO {
    return {
      id: row.id,
      address: row.address,
      district: row.district,
      province: row.province,
      department: row.department,
      postalCode: row.postalCode,
      latitude: row.latitude,
      longitude: row.longitude,
      source: row.source,
      confidence: row.confidence ?? 'unknown',
      verification: row.verification ?? 'reported',
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
    };
  }

  private toGeometry(row: GeometryRow): DossierGisGeometryDTO {
    return {
      id: row.id,
      geomType: row.geomType,
      source: row.source,
      confidence: row.confidence ?? 'unknown',
      verification: row.verification ?? 'reported',
    };
  }

  private toJudicial(row: JudicialRow, events: JudicialEventRow[]): DossierJudicialCaseDTO {
    const eventDTOs: DossierJudicialEventDTO[] = events.map((e) => ({
      id: e.id,
      eventDate: e.eventDate ?? null,
      eventType: e.eventType,
      description: e.description,
      resolution: e.resolution,
    }));
    return {
      id: row.id,
      caseNumber: row.caseNumber,
      court: row.court,
      caseType: row.caseType,
      subject: row.subject,
      status: row.status,
      filingDate: row.filingDate ?? null,
      parties: row.parties,
      source: row.source,
      sourceUrl: row.sourceUrl,
      retrievedAt: row.retrievedAt?.toISOString() ?? null,
      events: eventDTOs,
    };
  }

  private toComparable(row: ComparableRow): DossierMarketComparableDTO {
    return {
      id: row.id,
      comparableTitle: row.comparableTitle,
      comparableUrl: row.comparableUrl,
      comparablePrice: row.comparablePrice,
      comparableCurrency: row.comparableCurrency ?? 'unknown',
      comparableAreaM2: row.comparableAreaM2,
      comparableDistrict: row.comparableDistrict,
      distanceMeters: row.distanceMeters,
      pricePerM2: row.pricePerM2,
      similarity: row.similarity,
      source: row.source,
      retrievedAt: row.retrievedAt?.toISOString() ?? null,
    };
  }

  private toPrice(row: PriceRow): DossierMarketPriceDTO {
    return {
      id: row.id,
      estimatedPrice: row.estimatedPrice,
      currency: row.currency ?? 'unknown',
      pricePerM2: row.pricePerM2,
      estimationType: row.estimationType,
      confidence: row.confidence ?? 'unknown',
      source: row.source,
      retrievedAt: row.retrievedAt?.toISOString() ?? null,
    };
  }

  private toDocument(row: DocumentRow): DossierDocumentDTO {
    return {
      id: row.id,
      documentType: row.documentType ?? 'other',
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      storageUrl: row.storageUrl,
      checksum: row.checksum,
      source: row.source,
      description: row.description,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toLink(row: LinkRow): DossierExternalLinkDTO {
    return {
      id: row.id,
      url: row.url,
      title: row.title,
      linkType: row.linkType,
      source: row.source,
      isAccessible: row.isAccessible ?? 'unknown',
      lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
    };
  }

  private mapLink(
    latitude: string | null,
    longitude: string | null
  ): string | null {
    if (!latitude || !longitude) return null;
    return `https://www.google.com/maps?q=${encodeURIComponent(longitude)},${encodeURIComponent(latitude)}`;
  }
}