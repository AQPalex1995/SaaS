import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { documentTypeEnum } from './enums.js';
import { properties } from './properties.js';

/**
 * DOCUMENTS — Files associated with properties (images, PDFs, screenshots).
 */
export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: uuid('property_id')
      .references(() => properties.id, { onDelete: 'cascade' }),

    documentType: documentTypeEnum('document_type').default('other'),
    fileName: varchar('file_name', { length: 300 }),
    mimeType: varchar('mime_type', { length: 100 }),
    sizeBytes: integer('size_bytes'),
    storagePath: text('storage_path'),
    storageUrl: text('storage_url'),
    checksum: varchar('checksum', { length: 64 }),

    source: varchar('source', { length: 100 }),
    description: text('description'),
    metadata: jsonb('metadata'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxDocumentsProperty: index('idx_documents_property').on(table.propertyId),
    idxDocumentsType: index('idx_documents_type').on(table.documentType),
  })
);

/**
 * EXTERNAL_LINKS — URLs and references from external sources.
 */
export const externalLinks = pgTable(
  'external_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),

    url: text('url').notNull(),
    title: varchar('title', { length: 500 }),
    linkType: varchar('link_type', { length: 100 }),
    source: varchar('source', { length: 100 }),
    description: text('description'),

    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    isAccessible: varchar('is_accessible', { length: 10 }).default('unknown'),

    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxExtLinksProperty: index('idx_ext_links_property').on(table.propertyId),
  })
);
