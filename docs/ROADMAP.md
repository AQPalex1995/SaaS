# Hoja de Ruta Técnica (Roadmap) — Land Intelligence

> **Nota (2026-09-19)**: la fuente de verdad del plan de ejecución es
> `PROJECT_EXECUTION_PLAN.md` (16 fases + etapa transversal). Este documento
> resume la evolución técnica. La **Fase 5 (SUNARP)** está **COMPLETED**
> (T5.1–T5.11 DONE, 2026‑09‑19); sigue la etapa transversal **PHASE 5.5** del
> producto, **registrada como PLANNED** (nada implementado).

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

---

## Etapa transversal: Research Platform UX + Identity (PLANNED — registrada 2026-09-19)

Etapa de producto definida en `docs/PRODUCT.md` (Land Intelligence, predios no
publicados, expediente `/investigaciones/:id`). **Ninguna subfase está
implementada**; requiere aprobación explícita y los Decision Gates de
AGENTS.md §2.3-bis.

- [ ] RP.1 Domain model — separar Listing / Property / ResearchCase / ResearchRun (tabla `research_runs`: DECISION REQUIRED).
- [ ] RP.2 Search Property flow — módulo Buscar Predio (entrada B, ResearchCase sin Listing).
- [ ] RP.3 Research history — historial PROPERTY / RESEARCH_CASE / RESEARCH_RUN.
- [ ] RP.4 Property dossier — expediente `/investigaciones/:id` (11 secciones).
- [ ] RP.5 Authentication — cuentas, sesiones, email (Decision Gate).
- [ ] RP.6 Authorization / RBAC — roles y autorización server-side anti-IDOR/BOLA.
- [ ] RP.7 Entitlements — permisos por plan sin hardcodear (`docs/SECURITY.md` §5).
- [ ] RP.8 Security hardening — objetivo OWASP ASVS Level 2.
- [ ] RP.9 Audit — eventos de identidad/exports/documentos/denegados.
- [ ] RP.10 Frontend redesign — navegación Dashboard / Buscar predio / Mis investigaciones / Predios guardados / Mercado / Cuenta / Administración.
- [ ] RP.11 End-to-end testing — validación integral.
