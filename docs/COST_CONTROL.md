# Land Intelligence — Cost Control

> Guía para que la futura presencia en la nube no genere costos inesperados.
> Hoy el proyecto **no consume nada de nube**: todo corre local.

## Regla de oro

**No existe configuración que incremente el presupuesto por defecto.**
Cada recurso de nube será explícito, revisado y opcional.

## Decision gates (gobernanza)

- Introducir un **servicio de pago o recurso de nube** es un *major architectural checkpoint*
  (ver `AGENTS.md` §2.1 / §2.3): **requiere aprobación explícita del propietario**.
- Toda propuesta que toque Cloud Run / Cloud SQL / Redis / GCS / Secret Manager debe adjuntar
  estimación de costo en la sesión (`CHANGELOG_AGENTS.md`) antes de cualquier provisión.
- Sin aprobación, **$0.00** de gasto de nube (estado actual).

## Inventario de presupuesto objetivo (cuando se migre)

| Recurso | Estimación mínima | Controles |
|---|---|---|
| Cloud Run (api + worker) | Pay-per-request, mínimos con escala-a-cero | `min-instances: 0`, limitar `max-instances` |
| Cloud SQL (PostgreSQL) | Costo fijo por instancia | mínima `db-f1-micro`/`db-g1-small`, pause fuera de horas si es factible |
| Redis (Memorystore) | Costo fijo | la mínima disponible; alternativas serverless |
| Cloud Storage (GCS) | Casi gratis en pruebas | borrar objetos de prueba; `lifecycle` rules |
| Artifact Registry | Casi gratis en pruebas | borrar tags de imágenes antiguas, retención |

## Gatillos de costo que EVITAR

- **NUNCA** `POSTGRES_HOST_AUTH_METHOD` en la nube (nada expuesto a internet).
- **NUNCA** instancias grandes "por si acaso"; escalar solo con métricas.
- **NUNCA** workers con `min-instances` > 6 sincronizados por defecto.
- **NUNCA** subir objetos binarios grandes a Cloud SQL (eso es GCS).

## Monitoreo mínimo de costo

1. **Presupuesto + alertas** (60 / 80 / 100%) desde el primer día.
2. **Logs de auditoría** y `gcloud billing` monthly review.
3. `governance.md` futuro: PR que toque Cloud Run/Cloud SQL debe adjuntar
   estimación de costo.

## Estado del proyecto

- Gastos en nube: **$0.00** (nada desplegado).
- Gastos local: solo hardware existente.