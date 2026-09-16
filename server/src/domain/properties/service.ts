import { eq, desc, sql, count } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb, type Database } from '../../db/connection.js';
import { properties, propertyListings } from '../../db/schema/index.js';
import type { PropertySummary, PropertyDetail, PaginatedResponse } from '../../dto/index.js';
import { logger } from '../../logger.js';

/**
 * Property Service — Core domain logic for properties.
 */
export class PropertyService {
  private db: Database;

  constructor(db?: Database) {
    this.db = db ?? getDb();
  }

  /**
   * List properties with pagination.
   */
  async list(page = 1, perPage = 20): Promise<PaginatedResponse<PropertySummary>> {
    const offset = (page - 1) * perPage;

    const [rows, totalResult] = await Promise.all([
      this.db
        .select()
        .from(properties)
        .orderBy(desc(properties.createdAt))
        .limit(perPage)
        .offset(offset),
      this.db.select({ total: count() }).from(properties),
    ]);

    const total = totalResult[0]?.total ?? 0;

    return {
      data: rows.map(this.toSummary),
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
    };
  }

  /**
   * Get a single property by ID.
   */
  async getById(id: string): Promise<PropertyDetail | null> {
    const rows = await this.db
      .select()
      .from(properties)
      .where(eq(properties.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    return this.toDetail(rows[0]);
  }

  /**
   * Create a new property.
   */
  async create(data: {
    title?: string;
    description?: string;
    propertyType?: string;
    price?: string;
    currency?: string;
    areaM2?: string;
    district?: string;
    address?: string;
    latitude?: string;
    longitude?: string;
  }): Promise<PropertyDetail> {
    const publicId = `LI-${nanoid(8)}`;

    const result = await this.db
      .insert(properties)
      .values({
        publicId,
        title: data.title,
        description: data.description,
        propertyType: (data.propertyType as any) ?? 'otro',
        price: data.price,
        currency: (data.currency as any) ?? 'unknown',
        priceVerification: 'reported',
        areaM2: data.areaM2,
        areaVerification: 'reported',
        district: data.district,
        address: data.address,
        locationVerification: 'reported',
        latitude: data.latitude,
        longitude: data.longitude,
      })
      .returning();

    logger.info({ propertyId: result[0].id, publicId }, 'Property created');
    return this.toDetail(result[0]);
  }

  /**
   * Get listings linked to a property.
   */
  async getListings(propertyId: string) {
    return this.db
      .select()
      .from(propertyListings)
      .where(eq(propertyListings.propertyId, propertyId))
      .orderBy(desc(propertyListings.scrapedAt));
  }

  private toSummary(row: typeof properties.$inferSelect): PropertySummary {
    return {
      id: row.id,
      publicId: row.publicId,
      title: row.title,
      propertyType: row.propertyType ?? 'otro',
      status: row.status ?? 'active',
      price: row.price,
      currency: row.currency ?? 'unknown',
      areaM2: row.areaM2,
      district: row.district,
      province: row.province,
      department: row.department,
      latitude: row.latitude,
      longitude: row.longitude,
      listingCount: row.listingCount ?? 0,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toDetail(row: typeof properties.$inferSelect): PropertyDetail {
    return {
      ...this.toSummary(row),
      description: row.description,
      address: row.address,
      priceSource: row.priceSource,
      priceConfidence: row.priceConfidence ?? 'unknown',
      priceVerification: row.priceVerification ?? 'reported',
      areaSource: row.areaSource,
      areaConfidence: row.areaConfidence ?? 'unknown',
      areaVerification: row.areaVerification ?? 'reported',
      locationSource: row.locationSource,
      locationConfidence: row.locationConfidence ?? 'unknown',
      locationVerification: row.locationVerification ?? 'reported',
      metadata: row.metadata as Record<string, unknown> | null,
    };
  }
}
