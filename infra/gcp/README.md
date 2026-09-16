# Google Cloud — Plan de Migración (PLANIFICACIÓN)

> **ESTADO: SOLO PLANIFICACIÓN. No se ha creado, modificado ni desplegado
> ningún recurso en Google Cloud.** Este directorio documenta la estrategia
> para cuando el proyecto decida migrar. Hasta entonces, el stack funciona
> igual en local y en contenedores (cloud-agnostic).

## Objetivo de la preparación actual

Que el código, las imágenes y la configuración **no bloqueen** una futura
migración a GCP. Hoy garantizamos:

1. Configuración por variables de entorno (sin secretos en el repo).
2. `db:setup` idempotente (extensiones PostGIS + migraciones + seed) que
   funciona contra **cualquier** PostgreSQL, incluido Cloud SQL.
3. API y worker como **procesos/containers separados** (escalables por separado).
4. Almacenamiento detrás de una abstracción (`StorageProvider`); hoy solo el
   provider `local` está implementado, el provider `gcs` está reservado.
5. `PORT`/`HOST` compatibles con Cloud Run (injecta `PORT`; requiere `0.0.0.0`).

## Arquitectura objetivo (cuando se decida)

```
[Cloud Run: api]  -- Cloud SQL (PostgreSQL + PostGIS)
                |-- Redis (Memorystore / Upstash / Cloud Run + Redis)
                |-- Cloud Storage (GCS)  <- solo tras implementar provider gcs
[Cloud Run: worker]  -- mismas colas BullMQ (Redis compartido)
```

## Tareas PENDIENTES antes de desplegar nada (futuras)

- [ ] Implementar `StorageProvider` para GCS (`@google-cloud/storage`).
- [ ] Crear instancia/proyecto de Cloud SQL y correr `npm run db:setup` desde CI.
- [ ] Configurar Secret Manager para `DATABASE_URL`, `REDIS_URL`, API keys.
- [ ] Definir VPC connector, IAM y Service Accounts mínimos.
- [ ] CI/CD real (ver `docs/CI-CD.md`).

## Decisiones ya tomadas aquí

- **No hay archivos YAML de GCP** (`cloudbuild.yaml`, `service.yaml`, etc.)
  a propósito: se escribirán cuando exista el proyecto. Mientras tanto
  `server/Dockerfile` es la imagen canónica para cualquier plataforma.
- **DATABASE_URL y REDIS_URL** viajan como variables, jamás hardcodeadas.
- Los puertos host locales (5433/6380) son **solo un mapeo local**; dentro de
  la red de Docker y en GCP se usan los puertos estándar de los servicios.