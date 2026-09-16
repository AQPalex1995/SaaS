# Land Intelligence — Infraestructura

> Todo en `infra/` es **planificación y convención de código**.
> **No se ha desplegado ni provisionado nada en ningún proveedor de nube.**

## Contenido

| Ruta | Propósito |
|---|---|
| `infra/gcp/README.md` | Plan de migración a Google Cloud (para cuando se decida ir) |
| `docker-compose.yml` (raíz) | Infra local: PostgreSQL 5433 + Redis 6380 + (profile `full`) API/worker |
| `server/Dockerfile` | Imagen multi-stage del API/worker, non-root, healthcheck |

## Cómo se relaciona código ↔ infraestructura

- **La aplicación es cloud-agnostic**: solo conoce `DATABASE_URL`, `REDIS_URL`,
  `PORT`/`HOST` y `STORAGE_*` vía variables de entorno. No asume localhost,
  Docker, Cloud SQL ni ningún proveedor.
- **El contenedor solo contiene código**: las configuraciones runtime se
  inyectan como environment variables. Nunca se buildean secretos en la imagen.
- **`docker compose up -d`** levanta solo infraestructura (no rompe el flujo
  actual de desarrollo).
- **`docker compose --profile full up -d --build`** levanta además API y worker
  como contenedores (pila completa local).

## Comandos útiles

```bash
docker compose up -d                        # infra local (postgres + redis)
docker compose --profile full up -d --build # pila completa en contenedores
docker compose --profile full ps            # estado de todos los servicios
docker compose logs -f api worker           # logs de los contenedores app
```

Ver [CLOUD.md](../docs/CLOUD.md) y [LOCAL_TO_GCP.md](../docs/LOCAL_TO_GCP.md) para
la estrategia completa.