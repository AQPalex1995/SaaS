# Registros de Decisiones de Arquitectura (ADRs) — Land Intelligence

Este documento registra las decisiones arquitectónicas clave tomadas durante el diseño del sistema, junto con su contexto, justificación y consecuencias.

---

## ADR-001: Adopción del Patrón Monolito Modular sobre Microservicios

- **Estado**: Aceptado
- **Contexto**: El proyecto requiere crecer desde un scraper hacia una plataforma compleja de due diligence con 27 tablas relacionales y múltiples integraciones.
- **Decisión**: Implementar un **Modular Monolith** en TypeScript (Node.js ESM) en lugar de una arquitectura de microservicios distribuidos.
- **Justificación**:
  - Los microservicios introducen una sobrecarga masiva innecesaria (despliegues múltiples, latencia de red, consistencia eventual, orquestación de transacciones).
  - Un monolito modular mantiene límites de dominio claros mediante carpetas (`server/src/domain/`), pero comparte memoria, base de datos y transacciones ACID.
  - Si en el futuro un componente específico (ej. el worker de Playwright) requiere escalado independiente, puede extraerse como servicio secundario sin reescribir el dominio.

---

## ADR-002: Fastify como Framework HTTP para el Núcleo

- **Estado**: Aceptado
- **Contexto**: El servidor anterior utilizaba `node:http` nativo sin validación de esquemas ni middlewares estándar.
- **Decisión**: Utilizar **Fastify 5** para la API de Land Intelligence (`server/`).
- **Justificación**:
  - Rendimiento significativamente superior a Express (~2x en benchmarks de I/O).
  - Soporte nativo para TypeScript moderno y ESM.
  - Arquitectura de plugins limpia y encapsulada.
  - Validación de esquemas integrada y serialización rápida con `fast-json-stringify`.

---

## ADR-003: Drizzle ORM como Capa de Persistencia

- **Estado**: Aceptado
- **Contexto**: Se requería un ORM para PostgreSQL 16 con soporte para tipos espaciales PostGIS, migraciones SQL reales y tipado estricto en TypeScript.
- **Decisión**: Seleccionar **Drizzle ORM** sobre Prisma y TypeORM.
- **Justificación**:
  - **Cero sobrecarga de runtime**: Drizzle compila directamente a consultas SQL nativas sin engines pesados binarios en Rust (a diferencia de Prisma).
  - **Soporte PostGIS real**: Permite definir tipos espaciales nativos (`geometry(Point, 4326)`, `geometry(Polygon, 4326)`).
  - **Migraciones SQL legibles**: Drizzle Kit genera archivos `.sql` estándar y versionables.
  - **Compatibilidad TypeScript pura**: El esquema es código TypeScript estándar (`server/src/db/schema/`).

---

## ADR-004: Estrategia de Puertos No Estándar (Protección de CAST ERP)

- **Estado**: Aceptado
- **Contexto**: El usuario corre diariamente en su máquina un ERP de producción denominado CAST ERP, el cual utiliza los puertos por defecto de PostgreSQL (`5432`) y Redis (`6379`).
- **Decisión**: Reasignar los puertos locales de Land Intelligence a:
  - PostgreSQL: **`5433`**
  - Redis: **`6380`**
  - API Fastify: **`3001`**
  - Scout Legacy: **`8787`**
- **Justificación**: Garantiza aislamiento total. Levantar o detener Docker Compose de Land Intelligence jamás interfiere ni corrompe los servicios del ERP en producción.

---

## ADR-005: Coexistencia No Destructiva de SQLite y PostgreSQL

- **Estado**: Aceptado
- **Contexto**: El scraper previo guardaba anuncios en SQLite (`data/terrenos.db`).
- **Decisión**: Mantener SQLite operativo para el Scout existente y utilizar PostgreSQL + PostGIS como repositorio central de inteligencia.
- **Justificación**:
  - El usuario puede seguir ejecutando `iniciar-scout.bat` de inmediato sin cambios en su flujo de trabajo habitual.
  - La sincronización hacia PostgreSQL se realiza aguas abajo de manera no bloqueante.
  - No se arriesga la pérdida de los datos históricos recolectados en SQLite.

---

## ADR-006: Stubs Explícitos para Conectores Externos en Fase 1

- **Estado**: Aceptado
- **Contexto**: Fase 1 se enfoca en la base de arquitectura y modelo de dominio, sin construir los scrapers finales de 14 fuentes externas peruanas.
- **Decisión**: Implementar conectores stubs que implementan la interfaz `PropertyDataSource` y devuelven explícitamente el estado `'unavailable'` con mensajes descriptivos.
- **Justificación**:
  - Elimina el riesgo de "simulaciones falsas" o datos inventados.
  - Define con precisión las firmas de entrada y salida de cada fuente.
  - Permite probar el registro y la API de fuentes de inmediato (`GET /api/v1/sources`).

---

## ADR-007: Separación Case/Run — un_number como identidad de ejecución

- **Estado**: Aceptado (RP.1 — Fase 5.5)
- **Contexto**: Un ResearchCase agrupa tareas de investigación sobre un predio, pero la plataforma necesita distinguir entre el **expediente** (el objeto que persiste) y cada **ejecución** (investigación disparada por el usuario). Sin esa distinción, el histórico de un predio queda ambiguo: no se puede responder "¿cuál fue la 1ª investigación y cuál la 2ª?" de forma ordenada ni garantizar unicidad de (property_id, run_number).
- **Decisión explícita del Stakeholder (2026‑09‑19)**: **NO crear tabla esearch_runs en RP.1**. esearch_cases sigue siendo el contenedor de tareas/resultados **y** la ejecución; se añade la columna aditiva un_number (entero, NOT NULL default 0) sobre esearch_cases con un **índice único (property_id, run_number)**. La tabla esearch_runs queda **PLANNED** para una fase posterior cuando el modelo de ejecución lo exija (ver PROJECT_EXECUTION_PLAN.md RP.x). No se refactorizan los stubs/workers ni el core engine.
- **Justificación**:
  - Estrategia A (case=run + un_number): cero cambios destructivos, migración aditiva y 218/218 tests en verde. Separación Case/Run documentada (ver docs/DOMAIN_MODEL.md §Research + docs/RESEARCH_GOVERNANCE.md §3).
  - El un_number expone el orden de ejecución en el histórico del predio (1ª, 2ª, 3ª…), permitiendo deduplicar consultas duplicadas y auditar la línea temporal.
- **Consecuencias**:
  - ResearchCaseDTO gana el campo unNumber.
  - La creación de un case computa un_number = max(run_number previo por property) + 1 dentro de una misma transacción/servicio, garantizando unicidad por predio.
  - Cualquier consulta duplicada (createResearch repetido) genera un case independiente — **no hay dedup implícito** (aserciones de test 2→ independent cases, esearch-flows.test.ts:400-404).

---

## ADR-008: Migración aditiva y única indexación por ejecución

- **Estado**: Aceptado (RP.1 — Fase 5.5)
- **Contexto**: Añadir un_number a esearch_cases sin romper datos existentes.
- **Decisión**: Migración 0004 (drizzle) que (1) añade columna un_number INTEGER DEFAULT 0 NOT NULL, (2) **backfill**: UPDATE research_cases SET run_number = ROW_NUMBER() OVER (PARTITION BY property_id ORDER BY created_at, id) para numerar el histórico existente por predio, y (3) crea **índice único idx_research_property_run** sobre (property_id, run_number).
- **Justificación**: El backfill con ROW_NUMBER garantiza que la indexación única no falle por datos históricos duplicados (mismo predio con N casos previos todos en un_number=0).
- **Consecuencias**: Aplica a DB viva land_intel (puerto 5433) vía 
pm run db:migrate; sin cambios en el DTO público más allá de unNumber.
