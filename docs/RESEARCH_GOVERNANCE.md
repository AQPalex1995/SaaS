# Gobernanza de la Investigación (Research Governance)

> **Estado**: DEFINIDO (2026‑09‑19). Reglas conceptuales de cómo se produce,
> clasifica, almacena y presenta la investigación. Complementa
> `docs/PRODUCT.md`, `docs/RESEARCH_ENGINE.md` y `docs/DATA_GOVERNANCE.md`.

---

## 1. Entidades de investigación: separación estricta

**No asumir `Listing = Property = ResearchCase`.**

| Entidad | Significado | Estado |
|---|---|---|
| `Listing` | Publicación/anuncio de una fuente (Scout Legacy) | Implementado (`listings`) |
| `Property` | Inmueble físico unificado (dedup) | Implementado (`properties`) |
| `ResearchCase` | Investigación sobre un Property (1 Property → N casos) | Implementado (`research_cases`) |
| `ResearchRun` | Ejecución concreta/versión de una investigación | **PLANNED** (aún sin tabla; el modelo actual usa `research_cases` + `research_tasks`) |

Un mismo `Property` puede tener **múltiples** `ResearchCases`/`ResearchRuns`.

### 1.1 Consecuencias de diseño

- Se puede crear un `ResearchCase` sin `Listing` (entrada B del producto).
- Para "historial" y "comparar investigaciones" se necesita distinguir:
  - el predio (`Property`),
  - el caso de investigación (`ResearchCase`),
  - cada ejecución/run (`ResearchRun`).
- La decisión de crear una tabla `research_runs` (vs. remodelar `research_cases`)
  se documenta como **DECISION REQUIRED** y requiere un **Decision Gate** (cambio
  del modelo de dominio/núcleo, AGENTS.md §2.3).

---

## 2. Regla fundamental: hechos vs. señales vs. interpretaciones

El sistema **NUNCA** convierte automáticamente una señal en una conclusión
profesional. Nunca presentar una inferencia automática como **certificación
profesional**.

### 2.1 Ejemplo

- ❌ *"El terreno es riesgoso porque antiguamente pasaba una torrentera."*
- ✅ *"Se detectó un posible antecedente territorial compatible con un antiguo
  cauce/torrentera. La evidencia consultada requiere verificación
  técnica/oficial."*

### 2.2 Clasificación obligatoria de hallazgos

Cada hallazgo presentado al usuario debe poder clasificarse como:

| Clase | Significado |
|---|---|
| HECHO | Dato directamente soportado por la fuente consultada |
| SEÑAL | Indicio/posibilidad derivada de un dato, sin confirmar |
| INTERPRETACIÓN | Lectura del sistema sobre una señal (con limitaciones) |
| REQUIERE VERIFICACIÓN | Requiere revisión técnica/oficial (nunca una conclusión) |
| OPINIÓN PROFESIONAL | Solo aportada por un profesional, nunca automática |

Reglas:
- Una **SEÑAL** no se presenta como **HECHO**.
- Una **INTERPRETACIÓN** automática nunca se presenta como **OPINIÓN
  PROFESIONAL**.
- Toda señal importante debe exponer qué **verificación** necesita y con qué
  clase de fuente/confianza cuenta (`docs/DATA_GOVERNANCE.md` §2).

---

## 3. Provenance / evidencia de cada hallazgo

Todo hallazgo importante debe poder responder:

- qué fuente lo originó
- URL/origen
- fecha de consulta
- fecha del dato si está disponible
- tipo de fuente
- evidencia (raw/adjunto)
- geometría si corresponde (PostGIS)
- nivel de confianza (`confidence`: high/medium/low/unknown)
- estado de verificación (`verification`: reported/inferred/verified/
  conflicting)

La plataforma mantiene **trazabilidad completa**. Base técnica existente:
`research_results` (provenance garantizado por `result-provenance.ts`, T3.5) y
las tablas `registry_*` (source/confidence/verification/retrievedAt/rawData).

---

## 4. Historial de predios (no es un historial de búsquedas)

No implementar "historial" como simple lista de búsquedas. Deben distinguirse:

- **PROPERTY** — el predio.
- **RESEARCH_CASE** — una investigación sobre el predio.
- **RESEARCH_RUN** — ejecución de una investigación (PLANNED).

Requisitos:
- volver a investigar el mismo predio;
- comparar investigaciones;
- detectar cambios;
- conservar investigaciones anteriores;
- visualizar **cuándo** cambió información;
- mantener auditoría.

**Futuro**: alertas de cambios en predios monitoreados (PLANNED, no implementado).

---

## 5. Posturas de fuentes y honestidad

- Fuentes con auth/acción manual → estado honesto (`requires_auth`,
  `requires_manual_action`, `unavailable`), **nunca** datos simulados.
- No bypass de CAPTCHA (Ley 29733, minimización de datos).
- Acceso comercial a fuentes externas → Decision Gate (AGENTS.md §2.3).
- Las reglas de investigación internas (prompts, source policies, heurísticas)
  son **activo crítico** protegido (ver `docs/SECURITY.md` §8).

---

## 6. Responsabilidades del agente (resumen)

- No eliminar reglas para hacer pasar tests.
- No borrar auditoría ni desactivar controles de seguridad.
- No inventar datos ni convertir señales en conclusiones.
- Ante un cambio de modelo de investigación (ResearchRun, comparar,
  alertas): **detenerse y pedir aprobación** (Decision Gate).