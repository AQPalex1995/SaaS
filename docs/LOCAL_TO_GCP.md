# Land Intelligence — Guía Local → Google Cloud

Mapa de navegación para entender qué se necesita para ir de la pila local a
una futura pila en GCP, **sin que nada de esto esté hecho hoy**.

## 1. Stack actual (local)

```
┌─ Docker Compose ─────────────────────────────┐
│ postgres:5433 (PostGIS)  │  redis:6380      │
└──────────────────────────────────────────────┘
        │ DATABASE_URL             │ REDIS_URL
┌───────▼──────────────────────────▼────────────────────────┐
│  server/  API (Fastify, :3001)        worker (BullMQ)      │
└────────────────────────────────────────────────────────────┘
        │ LAND_API_URL
┌───────▼──────────────────┐
│  src/ Scout legacy :8787 │  Panel con Drawer de investigación
└──────────────────────────┘
```

## 2. Lo que NO cambia

| Aspecto | Local | GCP (futuro) |
|---|---|---|
| Comando de arranque | `npm run dev` | mismas apps en contenedores |
| Migraciones | `npm run db:migrate` / `db:setup` | `npm run db:setup` contra Cloud SQL |
| Colas | `npm run dev:worker` | imagen worker en Cloud Run |
| Config | `.env` local | env vars del servicio (Secret Manager) |
| Almacenamiento | provider `local` | provider futuro `gcs` (interfaz ya existe) |

## 3. Lo que cambia en cada componente

### 3.1 PostgreSQL → Cloud SQL
- `DATABASE_URL` apunta a la IP/vía privada de Cloud SQL.
- PostGIS: **Cloud SQL no ejecuta `init.sql`** → por eso existe `db:setup`
  (extiende `CREATE EXTENSION IF NOT EXISTS postgis/uuid-ossp`, luego migra).
- Los puertos 5433/5432 dejan de importar: la app solo ve la URL.

### 3.2 Redis → Memorystore (u otro)
- `REDIS_URL` cambia. BullMQ (queue y workers) no se entera.

### 3.3 API → Cloud Run
- Cloud Run inyecta `PORT` (variable) → la app debe escuchar en él
  (por eso `PORT`/`HOST=0.0.0.0` son parte de la config).
- Healthcheck de la imagen = `/health`.

### 3.4 Worker → Cloud Run (otro servicio)
- Misma imagen, otro comando: `node dist/worker.js`.
- `WORKER_QUEUES` controla qué colas consume.

### 3.5 Panel legacy (Scout :8787) → NO SE DESPLIEGA
- Es una herramienta local (login de Facebook/Playwright). Nunca va a la nube.
- Cuando el producto madure, la UI pasa al API (SPA) — mientras tanto el panel
  usa `API_URL` inyectada para hablar con el API.

## 4. Checklist de migración (futuro)

- [ ] Proyecto GCP + facturación.
- [ ] `StorageProvider` GCS implementado y testeado.
- [ ] Cloud SQL + `npm run db:setup` desde CI.
- [ ] Secret Manager con `DATABASE_URL`, `REDIS_URL`, `API_URL`.
- [ ] Imagen en Artifact Registry; despliegue API y worker.
- [ ] Presupuesto + alertas activos (ver `COST_CONTROL.md`).
- [ ] Smoke test: `/health` healthy, `/api/v1/sources` responde.

## 5. Riesgos controlados

| Antes | Ahora |
|---|---|
| `migrationsFolder './drizzle'` dependía del CWD | resolver por `import.meta.url` |
| PostGIS solo vía `init.sql` de Docker | `db:setup` idempotente |
| API y workers en el mismo proceso | procesos/containers separados |
| CORS abierto (`origin:true`) | `CORS_ORIGINS` configurable |
| Storage acoplado hacia futuro | interfaz `StorageProvider` |