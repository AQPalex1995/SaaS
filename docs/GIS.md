# Inteligencia Geoespacial (GIS) — PostGIS & PDM Arequipa

## 1. Fundamentos Espaciales

La geolocalización precisa de terrenos es uno de los mayores desafíos en el mercado inmobiliario peruano debido a direcciones informales ("a 5 minutos del óvalo", "frente a la loza deportiva", "Mz. B Lote 4").

Land Intelligence resuelve esto integrando **PostGIS 3.4** directamente en la base de datos PostgreSQL.

### Sistema de Referencia Espacial:
- **SRID 4326 (WGS 84)**: Estándar global de coordenadas GPS (longitud, latitud) en grados decimales.
- Se proyecta internamente a **SRID 32719 (UTM Zona 19S)** cuando se requieren cálculos métricos de alta precisión (distancias en metros, áreas exactas en m²).

---

## 2. Modelado de Geometrías (`server/src/db/schema/locations.ts`)

La tabla `property_geometries` almacena dos tipos de primitivas espaciales:
1. **`geom_point` (`geometry(Point, 4326)`)**:
   - Representa el centroide o punto de acceso al terreno.
   - Usado para búsquedas por radio: `"Encontrar todos los terrenos a menos de 1 km de este punto"`.
2. **`geom_polygon` (`geometry(Polygon, 4326)`)**:
   - Representa el polígono perimétrico del lote con sus vértices georreferenciados.
   - Usado para verificar intersección con capas urbanas: `"¿Este polígono invade una faja marginal o torrentera?"`.

---

## 3. Integración con el PDM Arequipa (IMPLA)

El Plan de Desarrollo Metropolitano (PDM 2016-2025 / actualización IMPLA) define el ordenamiento territorial de la provincia de Arequipa. Las capas vectoriales que se integran en el sistema incluyen:

| Capa | Código / Descripción | Riesgo / Relevancia Inmobiliaria |
|---|---|---|
| **Residencial** | RDM-1, RDM-2, RDA-1, RDA-2 | Determina densidad neta y altura máxima de construcción |
| **Comercial** | CZ (Comercio Zonal), CE (Especializado) | Alta plusvalía, usos comerciales permitidos |
| **Agrícola / Campiña** | ZA (Zona Agrícola), PA (Protección Agroecológica) | **ALERTA CRÍTICA**: No se puede urbanizar formalmente sin cambio de uso |
| **Riesgo Volcánico / Torrenteras** | ZRE-R (Riesgo No Mitigable) | **ALERTA CRÍTICA**: Inmueble no apto para edificación, peligro de huaycos |
| **Patrimonio Histórico** | ZMH (Zona Monumental Histórica) | Restricciones severas de conservación y licencias complejas |

---

## 4. Consultas Espaciales Típicas (PostGIS Queries)

### Intersección con Zonificación Urbana:
```sql
SELECT 
  p.public_id,
  uz.zone_code,
  uz.zone_name,
  uz.risk_level
FROM properties p
JOIN property_geometries pg ON pg.property_id = p.id
JOIN urban_zones uz ON ST_Intersects(pg.geom_point, uz.geom_polygon)
WHERE p.id = $1;
```

### Cálculo de Comparables por Radio Geográfico:
```sql
SELECT 
  comp.id,
  comp.price_per_m2_usd,
  ST_Distance(
    ST_Transform(target_geo.geom_point, 32719),
    ST_Transform(comp_geo.geom_point, 32719)
  ) AS distance_meters
FROM properties comp
JOIN property_geometries comp_geo ON comp_geo.property_id = comp.id
CROSS JOIN (
  SELECT geom_point FROM property_geometries WHERE property_id = $1
) AS target_geo
WHERE comp.id != $1
  AND ST_DWithin(
    ST_Transform(target_geo.geom_point, 32719),
    ST_Transform(comp_geo.geom_point, 32719),
    1500 -- radio de 1.5 km
  )
ORDER BY distance_meters ASC
LIMIT 10;
```
