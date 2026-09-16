import { customType } from 'drizzle-orm/pg-core';

/**
 * PostGIS geometry column type for Drizzle ORM.
 * Stores geometries in Well-Known Binary (WKB) format.
 * Use ST_GeomFromText / ST_AsGeoJSON for input/output.
 */
export const geometry = customType<{
  data: string;
  driverData: string;
  config: { srid?: number; type?: string };
}>({
  dataType(config) {
    const srid = config?.srid ?? 4326;
    const type = config?.type ?? 'Geometry';
    return `geometry(${type}, ${srid})`;
  },
  toDriver(value: string): string {
    return value;
  },
  fromDriver(value: string): string {
    return value;
  },
});

/**
 * PostGIS Point column.
 */
export const point = (name: string) =>
  geometry(name, { srid: 4326, type: 'Point' });

/**
 * PostGIS Polygon column.
 */
export const polygon = (name: string) =>
  geometry(name, { srid: 4326, type: 'Polygon' });

/**
 * PostGIS MultiPolygon column.
 */
export const multiPolygon = (name: string) =>
  geometry(name, { srid: 4326, type: 'MultiPolygon' });
