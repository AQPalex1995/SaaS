# LAND INTELLIGENCE
# PROJECT EXECUTION PLAN

VERSION: 1.0
STATUS: ACTIVE

Este documento es la fuente principal para determinar qué debe
implementarse después.

Un agente debe:

1. leer este documento
2. localizar CURRENT PHASE
3. encontrar la primera tarea TODO/BLOCKED
4. verificar dependencias
5. implementar únicamente esa tarea
6. marcarla como DONE
7. documentar el resultado
8. continuar con la siguiente tarea solamente si está permitido

============================================================
PROJECT STATE
============================================================

Current Phase:
PHASE 3 — RESEARCH ENGINE HARDENING

Previous Completed:
PHASE 0 — LOCAL INFRASTRUCTURE
PHASE 1 — FOUNDATION / ARCHITECTURE
PHASE 2 — PROPERTY IDENTITY / INGESTION
PHASE 2.5 — END-TO-END VALIDATION

Current Objective:

Construir un motor de investigación inmobiliaria sólido,
idempotente, observable y preparado para incorporar fuentes
externas progresivamente.

============================================================
GLOBAL ARCHITECTURE
============================================================

Frontend
    ↓
Fastify API
    ↓
Domain Services
    ↓
Research Engine
    ↓
BullMQ
    ↓
Workers
    ↓
Connectors
    ↓
PostgreSQL + PostGIS
    ↓
Storage

============================================================
PHASE 0 — LOCAL INFRASTRUCTURE
============================================================

STATUS: DONE

Docker:
DONE

PostgreSQL + PostGIS:
DONE

Redis:
DONE

Isolation from CAST ERP:
DONE

Tests:
DONE


============================================================
PHASE 1 — FOUNDATION
============================================================

STATUS: DONE

Architecture:
DONE

Database:
DONE

PostGIS:
DONE

Connector architecture:
DONE

Research architecture:
DONE

Documentation:
DONE


============================================================
PHASE 2 — PROPERTY IDENTITY
============================================================

STATUS: DONE

SQLite ingestion:
DONE

Deduplication:
DONE

Property unification:
DONE

OSM connector:
DONE

Geocoding worker:
DONE

Research worker:
DONE

Property Intelligence Drawer:
DONE


============================================================
PHASE 2.5 — END-TO-END VALIDATION
============================================================

STATUS: DONE

Docker validation:
DONE

PostgreSQL validation:
DONE

Redis validation:
DONE

SQLite ingestion:
DONE

4,152 listings processed

4,025 properties

Idempotency:
VERIFIED

Geocoding:
VERIFIED

PostGIS:
VERIFIED

Error handling:
VERIFIED

Observability:
VERIFIED

Tests:
40/40

============================================================
PHASE 3 — RESEARCH ENGINE
============================================================

STATUS: CURRENT

OBJECTIVE:

Crear un motor de investigación estable que pueda ejecutar
múltiples tareas sobre una PROPERTY sin duplicaciones,
manteniendo estado, provenance, errores y resultados.

------------------------------------------------------------
T3.1 — ResearchCase lifecycle
------------------------------------------------------------

STATUS: TODO

Objetivo:

Verificar y endurecer el lifecycle:

created
queued
running
completed
partial
failed

Criterios:

- transiciones válidas
- timestamps
- errores
- warnings
- retry
- idempotencia

------------------------------------------------------------
T3.2 — ResearchTask lifecycle
------------------------------------------------------------

STATUS: TODO

Verificar:

pending
running
completed
failed
requires_manual_action
unavailable
blocked

Agregar constraints si son necesarios.

------------------------------------------------------------
T3.3 — Research orchestration
------------------------------------------------------------

STATUS: TODO

Crear flujo:

PROPERTY
↓
ResearchCase
↓
ResearchTasks
↓
BullMQ
↓
Workers
↓
ResearchResults

Debe soportar ejecución parcial.

Una fuente caída NO debe detener toda la investigación.

------------------------------------------------------------
T3.4 — Manual Action
------------------------------------------------------------

STATUS: TODO

Crear mecanismo genérico para fuentes que requieren:

CAPTCHA
LOGIN
PAYMENT
USER ACTION

Debe existir:

requires_manual_action

y datos como:

instructions
url
requested_at
completed_at
completed_by
result

------------------------------------------------------------
T3.5 — Research Result provenance
------------------------------------------------------------

STATUS: TODO

Asegurar:

source
source_url
retrieved_at
confidence
verification_status
raw_data
normalized_data
parser_version

------------------------------------------------------------
T3.6 — Research API
------------------------------------------------------------

STATUS: TODO

Verificar:

POST /properties/:id/research
GET /properties/:id/research
GET /research/:id
GET /research/:id/tasks
GET /research/:id/results

------------------------------------------------------------
T3.7 — Research Drawer
------------------------------------------------------------

STATUS: TODO

Mostrar:

ResearchCase
Tasks
Progress
Errors
Warnings
Sources
Manual actions
Results

------------------------------------------------------------
T3.8 — Research tests
------------------------------------------------------------

STATUS: TODO

Tests:

- full research
- partial research
- failed task
- unavailable source
- retry
- duplicate research
- manual action
- timeout

------------------------------------------------------------
T3.9 — Research documentation
------------------------------------------------------------

STATUS: TODO

Actualizar:

docs/RESEARCH_ENGINE.md
docs/API.md
docs/NEXT_STEPS.md

============================================================
PHASE 4 — REM@JU
============================================================

STATUS: PLANNED

OBJECTIVE:

Conectar información pública de remates judiciales de manera
legal y respetando mecanismos de acceso.

Tasks:

T4.1 discovery
T4.2 parser
T4.3 normalization
T4.4 deduplication
T4.5 Property linking
T4.6 research connector
T4.7 manual action handling
T4.8 tests
T4.9 monitoring

No bypass CAPTCHA.

============================================================
PHASE 5 — SUNARP
============================================================

STATUS: PLANNED

Dividir:

T5.1 Conoce Aquí
T5.2 Consulta de Propiedad
T5.3 SPRL
T5.4 Registry normalization
T5.5 Owners
T5.6 Charges
T5.7 Titles
T5.8 Historical data
T5.9 Provenance
T5.10 Manual actions
T5.11 Tests

============================================================
PHASE 6 — BGR + GIS
============================================================

STATUS: PLANNED

T6.1 coordinates
T6.2 property point
T6.3 BGR integration
T6.4 polygon
T6.5 geometry validation
T6.6 spatial queries
T6.7 map UI
T6.8 tests

============================================================
PHASE 7 — PDM / IMPLA / PAT
============================================================

STATUS: PLANNED

T7.1 zoning datasets
T7.2 versioning
T7.3 geometry
T7.4 spatial intersection
T7.5 zoning normalization
T7.6 urban parameters
T7.7 UI

============================================================
PHASE 8 — JUDICIAL
============================================================

STATUS: PLANNED

T8.1 case model
T8.2 property association
T8.3 person association
T8.4 manual actions
T8.5 source provenance
T8.6 risk signals

IMPORTANT:

No assumption that a case involving a person affects a property.

============================================================
PHASE 9 — MUNICIPALITY / CATASTRO
============================================================

STATUS: PLANNED

T9.1 cadastral
T9.2 licenses
T9.3 urban parameters
T9.4 tax information where legally available
T9.5 normalization

============================================================
PHASE 10 — MARKET INTELLIGENCE
============================================================

STATUS: PLANNED

T10.1 comparables
T10.2 price/m2
T10.3 temporal history
T10.4 price changes
T10.5 listing age
T10.6 duplicate listings
T10.7 market statistics

============================================================
PHASE 11 — RISK ENGINE
============================================================

STATUS: PLANNED

Rule-based initially.

Categories:

registry
judicial
urban
geographic
market
data-quality

============================================================
PHASE 12 — OPPORTUNITY ENGINE
============================================================

STATUS: PLANNED

Metrics:

market gap
location
urban potential
registry status
data confidence
risk

Avoid opaque scoring initially.

============================================================
PHASE 13 — AI ANALYSIS
============================================================

STATUS: PLANNED

AI reads structured information.

AI does NOT become source of truth.

Possible providers:

Gemini
Claude
OpenAI
Ollama

Use provider abstraction.

============================================================
PHASE 14 — ALERTING
============================================================

STATUS: PLANNED

Alerts:

new listing
price reduction
new remate
registry change
new infrastructure
research complete
risk detected

============================================================
PHASE 15 — GOOGLE CLOUD
============================================================

STATUS: PLANNED

LOCAL
↓
GCP STAGING
↓
GCP PRODUCTION

Target:

Cloud Run
Cloud SQL PostgreSQL + PostGIS
Redis
Cloud Storage
Secret Manager
Cloudflare
CI/CD

============================================================
PHASE 16 — AI AGENT PLATFORM
============================================================

STATUS: FUTURE

Engineering Agent

Research Agent

DevOps Agent

AI Gateway

Permissions

Audit

Human approval

============================================================
PHASE RULES
============================================================

NEVER:

- skip acceptance criteria
- silently change architecture
- introduce future functionality early
- bypass security
- bypass CAPTCHA
- expose credentials
- destroy production data

ALWAYS:

- test
- document
- preserve provenance
- maintain idempotency
- maintain legacy functionality
- update this document
- create a checkpoint/commit