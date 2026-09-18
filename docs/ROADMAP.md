# Hoja de Ruta Técnica (Roadmap) — Land Intelligence

```text
[FASE 1: Base & Arquitectura] ──► [FASE 2: Pipeline de Ingesta] ──► [FASE 3: Inteligencia Territorial]
          (COMPLETADA)                     (SIGUIENTE)
                                                    │
                                                    ▼
[FASE 5: Inteligencia Autónoma] ◄── [FASE 4: Valuación & Scoring]
```

---

## Fase 1: Cimientos de Arquitectura & Modelo de Dominio (COMPLETADA ✅)

- [x] Docker Compose con PostgreSQL 16 + PostGIS 3.4 (`5433`) y Redis 7 (`6380`).
- [x] Modelo relacional completo: 27 tablas y 17 enums en Drizzle ORM.
- [x] Servidor API REST con Fastify 5 en puerto `3001` con endpoints de diagnóstico y salud.
- [x] Arquitectura de conectores con contrato base e implementación de 14 stubs seguros.
- [x] Definición de 6 colas asíncronas BullMQ.
- [x] Migración SQL reversible generada con Drizzle Kit (`0000_military_salo.sql`).
- [x] Botón `[INVESTIGAR]` y `Property Intelligence Drawer` integrados en la UI del Scout sin romper la funcionalidad existente.
- [x] Suite de 18 pruebas automatizadas pasando con 100% de éxito en Vitest.
- [x] Documentación exhaustiva (AGENTS.md + 14 guías técnicas en `docs/`).

---

## Fase 2: Pipeline de Ingesta & Sincronización (Próxima Fase)

- [ ] Worker de sincronización entre la base SQLite legacy (`data/terrenos.db`) y PostgreSQL.
- [ ] Pipeline de normalización de direcciones arequipeñas con fuzzy matching.
- [ ] Conector real de OpenStreetMap / Nominatim para geocodificación automática.
- [ ] Integración del extractor OCR con almacenamiento de evidencias fotográficas en MinIO/S3.
- [ ] Activación de workers BullMQ para la cola `geocoding` y `scraping`.

---

## Fase 3: Inteligencia Territorial & Registral

- [x] Conector para consulta pública de SUNARP (Conoce Aquí). **Estado (T5.1)**: SUNARP no permite consulta sin identidad + CAPTCHA → sin automatización; conector real de postura `requires_auth` (`server/src/connectors/implementations/sunarp.ts`) + operación manual. Ver `docs/SUNARP.md`.
- [ ] Ingesta de shapefiles / GeoJSON del PDM Arequipa (capas de zonificación IMPLA).
- [ ] Algoritmo de intersección espacial para clasificar predios según zonificación y riesgo no mitigable.
- [ ] Conector para la plataforma de Remates Judiciales (REM@JU).
- [ ] Activación de la cola `gis` para cálculos de superposiciones geométricas.

---

## Fase 4: Valuación de Mercado & Scoring de Riesgo

- [ ] Motor de comparables inmobiliarios por vecindario y radio de búsqueda.
- [ ] Cálculo de precio estimado por m² (PEN y USD) con intervalos de confianza estadística.
- [ ] Implementación de los endpoints `/api/v1/properties/:id/scores`.
- [ ] Implementación de la matriz de alertas automáticas `/api/v1/properties/:id/alerts`.
- [ ] Visualización gráfica de métricas de oportunidad en el Drawer de la interfaz web.

---

## Fase 5: Inteligencia Autónoma & Reportes Ejecutivos

- [ ] Generación automática de dosieres ejecutivos en PDF para inversionistas con mapas y partida registral.
- [ ] Alertas en tiempo real vía Telegram o WhatsApp ante terrenos subvaluados ("gangas").
- [ ] Interfaz web completa independiente en React / Next.js o enriquecimiento total del panel actual.
- [ ] Análisis predictivo de plusvalía y expansión urbana en Arequipa (La Joya, Yura, Cerro Colorado).
