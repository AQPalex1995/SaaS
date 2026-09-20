# Gobernanza de Datos (Data Governance)

> **Estado**: DEFINIDO (2026‑09‑19). Reglas conceptuales sobre el ciclo de vida,
> trazabilidad y cumplimiento de los datos de investigación. Complementa
> `docs/RESEARCH_GOVERNANCE.md` y `docs/PRODUCT.md`. Rige la **Fase 5** y toda
> evolución futura de la plataforma.

---

## 1. Principios

1. **No inventar datos**: los conectores externos son stubs honestos o reales
   con postura (`unavailable`/`requires_auth`/`requires_manual_action`). Un dato
   inexistente se marca `null`/`unknown` con warning, nunca se fabrica.
2. **Minimización**: solo se almacenan datos necesarios y legalmente utilizables
   (Ley 29733; no bypass de CAPTCHA; SPRL es un servicio de pago con valor
   legal, no se automatiza la compra ni se guardan credenciales).
3. **Trazabilidad completa** (ver §2).
4. **Separación de entidades**: `Listing`/`Property`/`ResearchCase`/
   `ResearchRun` son independientes (`docs/RESEARCH_GOVERNANCE.md` §1).
5. **Protección del dato como activo crítico** (ver `docs/SECURITY.md` §8).

---

## 2. Provenance / evidencia (campos obligatorios)

Todo hallazgo importante debe poder responder:

| Campo | Descripción |
|---|---|
| fuente (`source`) | qué fuente lo originó |
| URL/origen (`source_url`) | dónde se obtuvo |
| fecha de consulta (`retrieved_at`) | cuándo se consultó |
| fecha del dato | si la fuente la proporciona |
| tipo de fuente | registral/municipal/judicial/mercadotecnia/… |
| evidencia | raw_data/adjunto (storage) |
| geometría | PostGIS si corresponde |
| confianza (`confidence`) | high / medium / low / unknown |
| verificación (`verification`) | reported / inferred / verified / conflicting |

Base técnica existente: `research_results` con provenance garantizado por
`server/src/domain/research/result-provenance.ts` (T3.5); tablas `registry_*`
con `source`/`confidence`/`verification`/`retrieved_at`/`raw_data`.

Trazabilidad en el tiempo: `audit_logs` (+ distancia citada en
`docs/RESEARCH_GOVERNANCE.md` §4) para saber **cuándo** cambió información.

---

## 3. Ciclo de vida del dato

- **Adquisición**: conector/postura o captura manual de un operador
  (por ej., intake REM@JU/SUNARP) con provenance.
- **Persistencia**: registro normalizado + raw preservado (nunca sobrescribir
  resultados en conflicto; se guardan lado a lado).
- **Derivación**: las derivaciones del sistema (ej. `deriveHistoricalState`,
  T5.8) son explícitamente derivaciones y conservan la referencia a su fuente.
- **Presentación**: hechos/señales/interpretaciones diferenciados
  (`docs/RESEARCH_GOVERNANCE.md` §2).
- **Retención y borrado**: `DECISION REQUIRED` (política de retención de
  investigaciones/cuentas aún no definida).

---

## 4. Confidencialidad y protección

- Las investigaciones pertenecen a un usuario/organización; toda lectura
  verifica autorización (previene IDOR) — ver `docs/SECURITY.md` §4.
- Datos personales (identidad de operadores/usuarios) no se almacenan
  innecesariamente; los datos del remate son públicos.
- Documentos privados y sus descargas quedan auditados.

---

## 5. Cumplimiento y fuentes oficiales

- Solo fuentes **legalmente utilizables**. Cuando la normatividad requiera
  identidad/CAPTCHA/pago (SUNARP, SPRL, BGR, CEJ), postura honesta y acción
  manual documentada (ver `docs/SUNARP.md`, `docs/REMATE_JUDICIAL.md`).
- Acceso comercial a fuentes externas ⇒ **Decision Gate** (AGENTS.md §2.3).