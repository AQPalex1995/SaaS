# Seguridad (Security Architecture)

> **Estado**: DEFINIDO/PARCIALMENTE IMPLEMENTADO (2026‑09‑19). Se documenta el
> **objetivo arquitectónico**; las piezas marcadas `IMPLEMENTADO` son las que ya
> existen en el repo. Todo lo demás es `PLANNED` (reto de seguridad) con
> **Decision Gate** en los puntos críticos. Referencia: **OWASP ASVS**; objetivo
> inicial recomendado: **ASVS Level 2**.

---

## 1. Cuentas y autenticación (PLANNED salvo indicación)

Requisito arquitectónico:
- usuarios registrados;
- autenticación;
- verificación de email;
- recuperación de contraseña;
- sesiones seguras;
- logout;
- revocación de sesiones;
- rate limiting;
- protección contra brute force;
- bloqueo temporal/progresivo ante abuso;
- **MFA obligatorio para administradores**;
- auditoría de autenticación.

Reglas duras:
- **No guardar passwords en texto plano** (hash con algoritmos modernos).
- **No almacenar tokens de sesión en logs.**
- **No exponer credenciales de proveedores en frontend.**

Estado actual: existe la tabla `users`
(`server/src/db/schema/system.ts`) para **auditoría/identificación básica**
(username/displayName/email/role/isActive), **no es un sistema de autenticación**
completo todavía. Proveedor de autenticación ⇒ **Decision Gate**.

---

## 2. Roles y autorización (RBAC)

Roles objetivo (preparar arquitectura; no necesariamente implementar todos de
inmediato):

- `USER`
- `CUSTOMER`
- `PROFESSIONAL`
- `STAFF`
- `ADMIN`
- `SUPER_ADMIN`

Reglas:
- Toda autorización es **server-side**. Nunca confiar en: flags del frontend,
  plan enviado por el cliente, rol enviado por el cliente, IDs manipulables.
- El backend debe verificar: **identidad → rol → ownership → organización (si
  aplica) → entitlement/plan → permiso sobre el recurso**.
- Prevenir **IDOR/BOLA** (object reference authorization).

---

## 3. Autorización server-side (principio)

```text
request → identity → role → ownership → organization → entitlement → resource permission
```

Nunca:

```text
request → "confío en lo que el cliente dice ser"
```

---

## 4. Protección de investigaciones

- Una investigación pertenece a un **usuario/organización**.
- Un usuario **no puede** consultar otra investigación simplemente cambiando el
  id (`/investigaciones/123` → `/investigaciones/124`).
- Toda lectura verifica autorización y se audita la lectura sensible
  (`RESEARCH_ACCESSED`).
- **Documentos privados** protegidos. Si se usa almacenamiento de objetos
  (hoy `storage/` local):
  - no exponer buckets privados;
  - URLs firmadas de corta duración (cuando aplique);
  - control de permisos;
  - auditoría de descargas (`DOCUMENT_ACCESSED`).

---

## 5. Planes y entitlements (no hardcodear)

**No hardcodear** `if (plan === "pro")` en múltiples lugares.

Crear una capa conceptual de **entitlement/permisos**:

| Entidad | Permiso ejemplo |
|---|---|
| FREE | screening limitado, búsquedas gratuitas limitadas, historial básico |
| BASIC | investigación documental ampliada |
| PRO | due diligence integral (`docs/PRODUCT.md` §5) |
| PROFESSIONAL | capacidades profesionales/volumen |

Los **precios concretos NO** son reglas arquitectónicas: son
configuración/product/business data (`DECISION REQUIRED`, no pagos todavía).

---

## 6. Seguridad de infraestructura

Mantener y reforzar:
- PostgreSQL no público (local: puerto `5433`; OWASP ASVS L2);
- Redis no público (local: puerto `6380`);
- secrets fuera de Git (`.env` no commiteado);
- variables por ambiente (dev/staging/prod separados);
- mínimo privilegio;
- backups y recuperación ante desastre (gestión en `docs/CLOUD.md`,
  `docs/COST_CONTROL.md`);
- auditoría;
- logs estructurados con request IDs (`x-request-id` ya correlacionado);
- redacción de secretos (logger existente en `server/src/logger.ts`);
- TLS en producción;
- CORS controlado (ya configurado en `app.ts`);
- rate limiting;
- validación de input;
- límites de payload;
- protección API;
- dependencias actualizadas y análisis de vulnerabilidades.

Estado actual (IMPLEMENTADO parcialmente): dual-port local aislado, secrets en
.env, logger con censura, request IDs, CORS controlado, validación de inputs en
los endpoints Fastify, límite de PDF (8 MB) en el intake, guardas en migraciones
(`drizzle/`).

---

## 7. Auditoría

Registrar **al menos** estos eventos (hoy el enum `audit_action` cubre un
subconjunto; el resto es **PLANNED**: ver `server/src/db/schema/enums.ts`):

| Evento | Actual |
|---|---|
| `LOGIN`, `LOGIN_FAILED`, `LOGOUT` | PLANNED |
| `PASSWORD_CHANGED`, `PASSWORD_RESET`, `MFA_CHANGED` | PLANNED |
| `RESEARCH_CREATED`, `RESEARCH_STARTED`, `RESEARCH_COMPLETED` | parcial: `research_started`/`research_completed`/`research_failed` |
| `RESEARCH_ACCESSED`, `RESEARCH_EXPORTED` | PLANNED |
| `DOCUMENT_ACCESSED` | PLANNED |
| `AUTHORIZATION_DENIED` | PLANNED (debe abarcar los IDOR/BOLA denegados) |
| `ADMIN_ACTION` | PLANNED |
| `SECURITY_EVENT` | PLANNED |

**No registrar**: passwords, secretos, tokens, credenciales de proveedores,
información sensible innecesaria.

Base técnica existente: `audit_logs` (`server/src/db/schema/system.ts`) y
`AuditService` (`server/src/domain/audit/`) con acciones actuales:
property_*, listing_*, research_*, task_*, manual_result_entered, score_changed,
alert_*.

---

## 8. Protección del know-how (activos críticos)

Activos críticos:
- código;
- schemas y migrations;
- conectores;
- reglas de investigación y source policies;
- prompts internos;
- arquitectura;
- `AGENTS.md`, `PROJECT_EXECUTION_PLAN.md`, `PROJECT_STATUS.md`;
- documentación (`docs/`);
- datos de investigación.

Los agentes **NO** pueden:
- eliminar reglas para hacer pasar tests;
- eliminar auditoría o desactivar controles de seguridad;
- publicar el repositorio;
- introducir secretos;
- copiar credenciales al frontend;
- cambiar arquitectura crítica sin **Decision Gate**.

---

## 9. Decision Gates de seguridad/producto (resumen)

Se detiene y documenta cuando aparezca:
- proveedor de autenticación;
- sistema de pagos;
- acceso comercial a fuentes externas;
- automatización de SUNARP/SPRL/BGR;
- almacenamiento de documentos (buckets, firmas);
- tratamiento de datos personales;
- cambio de arquitectura de identidad (usuarios/sesiones);
- exposición pública de APIs;
- infraestructura cloud;
- cambios de costos significativos.

Detalle de la regla operativa en `AGENTS.md` §2.3.