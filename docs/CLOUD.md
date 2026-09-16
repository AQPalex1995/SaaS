# Land Intelligence — Cloud Readiness

> Estrategia de arquitectura **cloud-agnostic**. Hoy la plataforma corre 100%
> en local/Docker; este documento fija las reglas para que migrar a Google
> Cloud (o a cualquier nube) sea una decisión operativa, no un refactor.

## Principios

1. **La aplicación no conoce al proveedor.**
   - Bases de datos: `DATABASE_URL` (PostgreSQL + PostGIS).
   - Colas: `REDIS_URL` (BullMQ).
   - Almacenamiento: `STORAGE_PROVIDER` + `STORAGE_BUCKET` (abstracción).
   - Servidor: `PORT` / `HOST`.
2. **Nada de secretos en el código.** Solo variables de entorno. En producción
   se inyectan desde el orquestador (futuro Secret Manager). Nunca en imágenes.
3. **Sin asumir localhost.** Dentro de Docker la app usa los nombres de los
   servicios (`postgres`, `redis`); en local usa los puertos altos (5433/6380).
   La app **solo ve una URL** — nada más.
4. **Imágenes portables.** Un único `server/Dockerfile` multi-stage, non-root,
   lista para Cloud Run, GKE, ECS o cualquier runner de contenedores.
5. **Extendible por interfaz, no por copy-paste.** Cada integración nueva
   (GCS, Cloud SQL) se implementa detrás de una interfaz ya existente
   (`StorageProvider`, conexión por URL).

## Estado actual de preparación

| Componente | Estado |
|---|---|
| Config por env (`server/src/config.ts`) | Listo — cloud-agnostic |
| Templates `.env.*.example` | Listos — por entorno |
| `db:setup` idempotente (ext+mmig+seed) | Listo — funciona en Cloud SQL |
| API / worker como procesos separados | Listo — `dev:api`, `dev:worker`, `worker` |
| Dockerfile multi-stage + healthcheck | Listo — `server/Dockerfile` |
| Compose full-stack (profile `full`) | Listo — `docker compose --profile full up` |
| StorageProvider (interfaz + `local`) | Listo — provider `gcs` reservado |
| Request-id / CORS configurable | Listo — `x-request-id`, `CORS_ORIGINS` |
| Panel UI con API_URL inyectada | Listo — `window.LAND_API_URL` |
| Despliegue real en GCP | **PENDIENTE — requiere DCI** |

## Decision gates (gobernanza)

Toda visita a la nube es un **major architectural checkpoint** (ver `AGENTS.md` §2.1 y §2.3):

1. **Ningún** recurso de nube se crea sin aprobación explícita del propietario del proyecto.
2. Cualquier propuesta cloud debe adjuntar: estimación de costo, región, tamaño, y plan de reversa.
3. `docs/COST_CONTROL.md` debe reflejar cualquier recurso provisionado (hoy: **$0.00**).
4. La transición sigue `docs/LOCAL_TO_GCP.md` e `infra/gcp/README.md` (plan, sin nada desplegado).

## Qué significa "degradación elegante"

- Si la DB / Redis no están disponibles, el API **arranca igual**, reporta
  `degraded` en `/health` y los endpoints que no dependen de DB siguen
  respondiendo. Esto es lo que mantiene el panel legacy funcionando mientras
  la infra nueva se levanta.

## Próximos pasos (por decisión, no urgente)

1. Decidir proveedor y *proyecto* (GCP, proyecto de facturación) — **requiere aprobación**.
2. Implementar `StorageProvider` para GCS.
3. Configurar Secret Manager y CI/CD (ver `CI-CD.md`).
4. Provisionar Cloud SQL + correr `npm run db:setup` desde CI.
5. Desplegar imagen con steps graduales (Cloud Run API, luego worker, luego GCS).