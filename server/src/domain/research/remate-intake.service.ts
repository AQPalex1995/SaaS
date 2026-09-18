/**
 * REM@JU — Manual intake service (Fase 4 / T4.5).
 *
 * Orquesta el flujo humano-en-el-bucle:
 *   1. El motor deja una `manual_action` pendiente (captcha/filtros/PDF).
 *   2. El operador la completa con el payload normalizado (y opcionalmente el
 *      PDF descargado de REM@JU).
 *   3. Aquí se persisten los efectos: `registry_properties` (partida),
 *      `properties` (coordenadas), `external_links` (PDF en storage) y el
 *      resultado en `research_results` (vía ManualActionService).
 *
 * Privacidad: solo se almacenan partida, dirección, coordenadas y datos
 * públicos del remate; NUNCA datos personales del operador.
 */

import { eq } from 'drizzle-orm';
import { getDb, type Database } from '../../db/connection.js';
import { externalLinks, properties, registryProperties } from '../../db/schema/index.js';
import type { ManualActionDTO } from '../../dto/index.js';
import { logger } from '../../logger.js';
import { getStorage } from '../../storage/index.js';
import type { StorageProvider } from '../../storage/types.js';
import { ManualActionService } from './manual-action.service.js';
import {
  planRemateIntake,
  type RemateManualInput,
  type RemateManualPlan,
} from './remate-manual.js';

export interface PdfUpload {
  name: string;
  contentType?: string;
  /** Contenido codificado en base64. */
  base64: string;
}

export interface CompleteRemateIntakeInput {
  payload: RemateManualInput;
  completedBy?: string;
  pdf?: PdfUpload | null;
}

export interface RemateIntakeResult {
  manualAction: ManualActionDTO;
  plan: RemateManualPlan;
  registryId: string | null;
  pdfKey: string | null;
  locationApplied: boolean;
}

export interface RemateIntakeDeps {
  db?: Database;
  manualActions?: ManualActionService;
  storage?: StorageProvider;
  /** Geocodificador inyectable (por defecto, OSM/Nominatim). */
  geocode?: (query: string) => Promise<{ latitude: number; longitude: number } | null>;
}

const MAX_PDF_BYTES = 8 * 1024 * 1024;

function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'aviso.pdf';
  return base.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'aviso.pdf';
}

export class RemateIntakeService {
  private dbInstance: Database | null;
  private manualActionsInstance: ManualActionService | null;
  private storageInstance: StorageProvider | null;
  private geocodeFn: RemateIntakeDeps['geocode'];

  constructor(deps: RemateIntakeDeps = {}) {
    this.dbInstance = deps.db ?? null;
    this.manualActionsInstance = deps.manualActions ?? null;
    this.storageInstance = deps.storage ?? null;
    this.geocodeFn = deps.geocode;
  }

  private db(): Database {
    if (!this.dbInstance) this.dbInstance = getDb();
    return this.dbInstance;
  }

  private manualActions(): ManualActionService {
    if (!this.manualActionsInstance) {
      this.manualActionsInstance = new ManualActionService(this.db());
    }
    return this.manualActionsInstance;
  }

  private storage(): StorageProvider {
    if (!this.storageInstance) this.storageInstance = getStorage();
    return this.storageInstance;
  }

  /** Acciones manuales, opcionalmente filtradas por estado. */
  async list(status?: 'requested' | 'completed' | 'cancelled'): Promise<ManualActionDTO[]> {
    return this.manualActions().listManualActions(status ? { status } : {});
  }

  /** Acciones manuales pendientes (solo las `requested`). */
  async listPending(): Promise<ManualActionDTO[]> {
    return this.list('requested');
  }

  async getById(id: string): Promise<ManualActionDTO | null> {
    return this.manualActions().getManualAction(id);
  }

  async complete(id: string, input: CompleteRemateIntakeInput): Promise<RemateIntakeResult> {
    const action = await this.manualActions().getManualAction(id);
    if (!action) throw new Error(`Manual action ${id} not found`);
    if (action.status !== 'requested') throw new Error(`Manual action ${id} already ${action.status}`);

    const plan = planRemateIntake(input.payload);
    const propertyId = action.propertyId;

    const registryId = await this.saveRegistry(propertyId, plan);
    const locationApplied = await this.applyLocation(propertyId, plan);
    const pdfKey = input.pdf ? await this.savePdf(propertyId, id, input.pdf) : null;

    const result: Record<string, unknown> = {
      ...plan.normalized,
      registryId,
      pdfKey,
      warnings: plan.warnings,
    };

    const manualAction = await this.manualActions().completeManualAction(id, {
      result,
      completedBy: input.completedBy,
    });

    logger.info(
      { manualActionId: id, propertyId, registryId, pdfKey, locationApplied },
      'REM@JU manual intake completed',
    );

    return { manualAction, plan, registryId, pdfKey, locationApplied };
  }

  private async saveRegistry(propertyId: string, plan: RemateManualPlan): Promise<string | null> {
    if (!plan.registry) return null;
    const [row] = await this.db()
      .insert(registryProperties)
      .values({
        propertyId,
        registryNumber: plan.registry.registryNumber,
        registeredAddress: plan.registry.registeredAddress,
        registeredDistrict: plan.registry.registeredDistrict,
        source: plan.registry.source,
        confidence: plan.registry.confidence,
        verification: plan.registry.verification,
        retrievedAt: new Date(),
        rawData: plan.registry.rawData as unknown as Record<string, unknown>,
      })
      .returning({ id: registryProperties.id });
    return row?.id ?? null;
  }

  private async applyLocation(propertyId: string, plan: RemateManualPlan): Promise<boolean> {
    let location = plan.location;
    let source = 'manual';
    let confidence = location?.confidence ?? 'low';

    if (!location && plan.needsGeocoding) {
      const geocode = this.geocodeFn ?? defaultGeocoder;
      const coords = await geocode(plan.geocodeQuery ?? '').catch((err) => {
        logger.warn({ err, query: plan.geocodeQuery }, 'REM@JU geocoding fallback failed');
        return null;
      });
      if (coords) {
        location = {
          latitude: coords.latitude,
          longitude: coords.longitude,
          source: 'manual',
          confidence: 'low',
          verification: 'reported',
        };
        source = 'manual-geocoded';
        confidence = 'low';
      }
    }

    if (!location) return false;

    await this.db()
      .update(properties)
      .set({
        latitude: String(location.latitude),
        longitude: String(location.longitude),
        locationSource: source,
        locationConfidence: confidence,
        locationVerification: location.verification,
        updatedAt: new Date(),
      })
      .where(eq(properties.id, propertyId));
    return true;
  }

  private async savePdf(propertyId: string, actionId: string, pdf: PdfUpload): Promise<string> {
    const buffer = Buffer.from(pdf.base64, 'base64');
    if (buffer.length === 0) throw new Error('PDF vacío o base64 inválido');
    if (buffer.length > MAX_PDF_BYTES) throw new Error('PDF excede el límite de 8 MB');

    const key = `remates/${propertyId}/${actionId}-${safeFileName(pdf.name)}`;
    await this.storage().put(key, buffer, { contentType: pdf.contentType ?? 'application/pdf' });

    await this.db().insert(externalLinks).values({
      propertyId,
      url: key,
      title: pdf.name,
      linkType: 'remate_pdf',
      source: 'remaju',
      description: 'Aviso de remate descargado manualmente de REM@JU',
      isAccessible: 'unknown',
      metadata: { storageProvider: 'local', size: buffer.length },
    });

    return key;
  }
}

/**
 * Geocodificador por defecto usando el conector OSM/Nominatim ya existente
 * (público, sin CAPTCHA). Se importa dinámicamente para no cargar red en tests.
 */
async function defaultGeocoder(
  query: string,
): Promise<{ latitude: number; longitude: number } | null> {
  if (!query.trim()) return null;
  const { osmConnector } = await import('../../connectors/implementations/osm.js');
  const result = await osmConnector.search({ query });
  const first = result.items[0];
  if (!first || first.latitude === undefined || first.longitude === undefined) return null;
  return { latitude: first.latitude, longitude: first.longitude };
}
