import { describe, it, expect } from 'vitest';
import * as schema from '../src/db/schema/index';

describe('Database Schema Definitions', () => {
  it('should export all 27 core tables', () => {
    const expectedTables = [
      'properties',
      'propertyListings',
      'propertySources',
      'propertyLocations',
      'propertyGeometries',
      'registryProperties',
      'registryOwners',
      'registryCharges',
      'registryTitles',
      'urbanZones',
      'urbanParameters',
      'judicialCases',
      'judicialEvents',
      'marketComparables',
      'marketPrices',
      'researchCases',
      'researchTasks',
      'researchResults',
      'documents',
      'externalLinks',
      'propertyScores',
      'propertyAlerts',
      'scrapingJobs',
      'scrapingRuns',
      'scrapingErrors',
      'users',
      'auditLogs',
    ];

    for (const table of expectedTables) {
      expect((schema as any)[table], `Table ${table} should be exported`).toBeDefined();
    }
  });

  it('should export all essential enums with valid values', () => {
    expect(schema.propertyTypeEnum.enumValues).toContain('terreno');
    expect(schema.propertyTypeEnum.enumValues).toContain('lote');
    expect(schema.propertyTypeEnum.enumValues).toContain('agricola');
    expect(schema.propertyTypeEnum.enumValues).toContain('comercial');

    expect(schema.taskTypeEnum.enumValues).toContain('identity');
    expect(schema.taskTypeEnum.enumValues).toContain('geolocation');
    expect(schema.taskTypeEnum.enumValues).toContain('registry');
    expect(schema.taskTypeEnum.enumValues).toContain('bgr');
    expect(schema.taskTypeEnum.enumValues).toContain('urbanism');
    expect(schema.taskTypeEnum.enumValues).toContain('judicial');
    expect(schema.taskTypeEnum.enumValues).toContain('market');
    expect(schema.taskTypeEnum.enumValues).toContain('risk');

    expect(schema.taskStatusEnum.enumValues).toContain('pending');
    expect(schema.taskStatusEnum.enumValues).toContain('running');
    expect(schema.taskStatusEnum.enumValues).toContain('completed');
    expect(schema.taskStatusEnum.enumValues).toContain('requires_manual_action');

    expect(schema.sourceTypeEnum.enumValues).toContain('facebook_marketplace');
    expect(schema.sourceTypeEnum.enumValues).toContain('facebook_group');
    expect(schema.sourceTypeEnum.enumValues).toContain('adondevivir');
    expect(schema.sourceTypeEnum.enumValues).toContain('urbania');
    expect(schema.sourceTypeEnum.enumValues).toContain('sunarp');
    expect(schema.sourceTypeEnum.enumValues).toContain('impla');
  });

  it('should have primary keys and required columns on properties table', () => {
    const table = schema.properties;
    expect(table.id).toBeDefined();
    expect(table.publicId).toBeDefined();
    expect(table.propertyType).toBeDefined();
    expect(table.status).toBeDefined();
    expect(table.createdAt).toBeDefined();
  });

  it('should have provenance tracking on research_results table', () => {
    const table = schema.researchResults;
    expect(table.source).toBeDefined();
    expect(table.confidence).toBeDefined();
    expect(table.verification).toBeDefined();
    expect(table.rawData).toBeDefined();
    expect(table.data).toBeDefined();
  });
});
