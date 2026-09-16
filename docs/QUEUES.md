# Infraestructura de Colas Asíncronas — BullMQ & Redis

## 1. Visión y Propósito

El scraping inmobiliario, las consultas registrales lentas y el análisis geoespacial requieren procesamiento asíncrono para evitar bloquear las respuestas HTTP de la API REST.

Land Intelligence utiliza **BullMQ 5** respaldado por **Redis 7** en el puerto **`6380`** (evitando el puerto estándar 6379 para no colisionar con el ERP de la empresa).

---

## 2. Catálogo de Colas Preparadas (`server/src/workers/queue.ts`)

Se encuentran definidas 6 colas temáticas:

| Nombre de Cola | Propósito Operativo | Tipo de Carga | Concurrencia Prevista |
|---|---|---|---|
| **`scraping`** | Ejecución programada de scrapers externos (Marketplace, portales) | Pesada (Chromium headless) | 2 workers |
| **`research`** | Orquestación de casos de investigación (`ResearchCase`) | Ligera/Media (I/O, llamadas API) | 5 workers |
| **`geocoding`** | Transformación de textos de dirección en coordenadas lat/lng | Media (Rate limits de mapas) | 3 workers |
| **`gis`** | Intersecciones geométricas y cálculos espaciales pesados | CPU Intensiva (PostGIS queries) | 4 workers |
| **`market`** | Cálculo de promedios de mercado y algoritmos de comparables | CPU Media | 2 workers |
| **`notifications`**| Envío de alertas de oportunidad o riesgo crítico (Webhooks, emails) | I/O Rápido | 5 workers |

---

## 3. Degradación Elegante ante Ausencia de Redis

Una característica clave implementada en `server/src/workers/queue.ts`:

- La conexión a Redis utiliza `lazyConnect: true`.
- Si Redis no está en ejecución (por ejemplo, si Docker no ha sido iniciado localmente), la aplicación **no se detiene ni arroja excepciones no controladas**.
- La función `testRedis()` captura el error y devuelve `false`.
- La función `getQueue(name)` devuelve `null` con una advertencia en el log estructurado.
- Esto garantiza que el servidor API de Fastify pueda levantarse en modo degradado y que la suite de pruebas unitarias pueda ejecutarse en cualquier entorno sin dependencias forzadas.

---

## 4. Activación de Workers en Fases Posteriores

En Fase 1, **los workers no están activados para no consumir recursos innecesarios**. En Fase 2 y Fase 3, los workers se implementarán en `server/src/workers/consumers/` siguiendo el patrón:

```typescript
import { Worker } from 'bullmq';
import { getRedisConnection } from '../queue.js';

export const researchWorker = new Worker(
  'research',
  async (job) => {
    const { researchCaseId, taskType } = job.data;
    // Lógica de ejecución de la tarea
  },
  { connection: getRedisConnection() }
);
```
