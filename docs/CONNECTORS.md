# Arquitectura de Conectores — Land Intelligence

## 1. Visión y Principios

Un **Conector** en Land Intelligence es un adaptador tipado que conecta el núcleo del sistema con una fuente externa (portal, base de datos pública, registro oficial o API geoespacial).

### Principios Fundamentales:
1. **Contrato Estricto**: Todo conector implementa la clase abstracta `PropertyDataSource`.
2. **Sin Falsedades**: En Fase 1, las fuentes aún no construidas se declaran como **stubs seguros** que retornan status `'unavailable'`. Nunca se devuelven respuestas simuladas con datos falsos.
3. **Respeto a Términos y Rate Limits**: La arquitectura contempla rate limiting, políticas de reintento con retroceso exponencial (`backoff`) y mecanismos de autenticación gestionados por tokens.
4. **Registro Dinámico**: Los conectores se administran mediante un singleton `ConnectorRegistry`.

---

## 2. Contrato de Conector (`server/src/connectors/base.ts`)

```typescript
export abstract class PropertyDataSource {
  abstract readonly sourceId: SourceType;
  abstract readonly sourceName: string;

  /** Consulta el estado operativo del conector */
  abstract getStatus(): Promise<ConnectorStatus>;

  /** Búsqueda de publicaciones o expedientes */
  abstract search(params: SearchParams): Promise<SearchResult>;

  /** Consulta detallada de una entidad externa por su identificador */
  abstract getDetails(externalId: string): Promise<DetailResult>;

  /** Tasa máxima de solicitudes por minuto recomendada */
  readonly rateLimitPerMinute: number = 30;

  /** Indica si la fuente requiere sesión o credenciales */
  readonly requiresAuth: boolean = false;
}
```

---

## 3. Catálogo de los 14 Conectores Stubs

Los siguientes conectores se encuentran definidos y registrados en el `ConnectorRegistry` (`server/src/connectors/stubs/index.ts`):

| Conector | Nombre Completo | Propósito en el Ecosistema |
|---|---|---|
| `sunarp` | SUNARP Conoce Aquí | Búsqueda por titular, documento o partida registral gratuita |
| `sunarp_bgr` | SUNARP Base Gráfica Registral | Visor cartográfico de polígonos registrales oficiales |
| `sunarp_sprl` | SUNARP Servicio de Publicidad Registral | Copias literales oficiales y certificados de gravamen (de pago) |
| `remaju` | Remates Judiciales Electrónicos (REM@JU) | Oportunidades de terrenos en remate judicial por deuda/ejecución; señal `judicial` de riesgo |

> **Estado real (Fase 4)**: desde T4.2 existe una implementación REAL del
> conector `remaju` en `server/src/connectors/implementations/remaju.ts`
> (parser de la superficie **pública** del home, sin login ni CAPTCHA,
> ver `docs/REMATE_JUDICIAL.md`). El stub de `registry` conserva el slot para
> que el registro del conector real se haga en **T4.6** (research connector)
> manteniendo el contrato de 14 fuentes en `/api/v1/sources`.
| `google_maps` | Google Maps Platform | Geocodificación inversa, vistas satelitales y Street View |
| `openstreetmap` | OpenStreetMap / Nominatim | Georreferenciación de código abierto y cálculo de distancias |
| `impla` | Instituto Municipal de Planeamiento Arequipa | Planos de zonificación, áreas de riesgo y planes específicos |
| `pdm` | Plan de Desarrollo Metropolitano Arequipa | Compatibilidad de usos (residencial, comercial, agrícola, ZRE) |
| `municipality` | Municipalidades Distritales de Arequipa | Certificados de numeración, parámetros y licencias de obra |
| `cadastre` | Catastro Municipal / Nacional | Información de linderos, medidas perimétricas y códigos catastrales |
| `cej` | Consulta de Expedientes Judiciales (Poder Judicial) | Verificación de litigios activos sobre predios o titulares |
| `sbn` | Superintendencia Nacional de Bienes Estatales | Verificación de predios estatales para descartar invasiones |
| `cofopri` | Organismo de Formalización de la Propiedad Informal | Títulos de propiedad informal y asentamientos humanos |
| `seace` | Sistema Electrónico de Contrataciones del Estado | Adjudicaciones, proyectos de infraestructura pública cercanos |

---

## 4. `ConnectorRegistry` (`server/src/connectors/registry.ts`)

El registro central permite consultar y gestionar los conectores en runtime:

```typescript
import { connectorRegistry } from './connectors/registry.js';

// Registrar
connectorRegistry.register(sunarpConnector);

// Consultar conector
const conn = connectorRegistry.get('sunarp');
const status = await conn.getStatus();

// Listar estados de todas las fuentes
const allStatuses = await connectorRegistry.getAllStatuses();
```

Cuando un nuevo scraper o integración oficial se construya en fases posteriores, simplemente se crea una clase que extienda `PropertyDataSource` y se registra en `connectorRegistry`, sin modificar el resto de la aplicación.
