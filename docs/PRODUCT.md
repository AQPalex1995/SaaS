# Producto — Land Intelligence (Due Diligence Inmobiliario de Predios)

> **Estado**: DEFINICIÓN DE PRODUCTO (2026‑09‑19). Nada de esta página implica
> implementación: los flujos, módulos y planes descritos aquí son el **producto
> objetivo** y se marcan `PLANNED` / `PENDING` / `DECISION REQUIRED` cuando
> todavía no están decididos o construidos. Ver `PROJECT_EXECUTION_PLAN.md` para
> lo que está realmente implementado.

---

## 1. Definición del Producto

El producto **evoluciona** de:

> "monitor de publicaciones de terrenos"

a:

> **Land Intelligence — plataforma de investigación y due diligence inmobiliario
> de predios.**

Las publicaciones de Facebook/Marketplace (Scout Legacy) son **solamente una
fuente de descubrimiento**, no el núcleo del producto.

### 1.1 Dos entradas principales de un predio

El sistema debe permitir **dos entradas** para crear/registrar un predio:

- **A) Predios encontrados automáticamente** por scraping/monitorización
  (Scout Legacy → `listings` → `properties`).
- **B) Predios solicitados directamente por un usuario** aunque **NO** aparezcan
  en la lista de publicaciones (búsqueda manual → property → investigación).

### 1.2 Regla de independencia de entidades

**No asumir que `Listing = Property = ResearchCase`.**

Estas entidades son conceptualmente independientes y deben mantenerse separadas:

| Entidad | Qué es | Implementación actual |
|---|---|---|
| `Listing` | Anuncio/publicación de una fuente (FB, portal) | `server/src/db/schema/listings.ts` |
| `Property` | Immueble físico unificado (dedup en la realidad) | `server/src/db/schema/properties.ts` |
| `ResearchCase` | Investigación sobre un Property (1:N con Property) | `server/src/db/schema/research.ts` (`research_cases`) |
| `ResearchRun` | Ejecución concreta de una investigación (PLANNED) | Sin tabla propia todavía (ver `docs/RESEARCH_GOVERNANCE.md` §4) |

Debe ser posible crear un `ResearchCase` **incluso cuando no exista un `Listing`**
(entrada B).

---

## 2. Flujos Principales del Producto (oficiales)

1. **Dashboard de publicaciones** — la vista actual del Scout sigue siendo
   relevante, pero deja de ser la única puerta de entrada.
2. **Buscar predio** — módulo propio, independiente de las publicaciones (ver §3).
3. **Crear investigación** — desde un predio buscado o guardado.
4. **Ejecutar investigación** — lanzar el Research Engine (motor real existente,
   `server/src/domain/research/`).
5. **Ver expediente del predio** — vista/página propia del resultado (ver §4).
6. **Consultar historial** — investigaciones previas del predio.
7. **Reinvestigar predio** — nueva ejecución sobre el mismo predio.
8. **Comparar investigaciones** — detectar cambios entre ejecuciones.
9. **Generar informe** — documento consolidado del expediente.
10. **Gestionar cuenta/seguridad** — identidad, sesiones, MFA (PLANNED).

---

## 3. Módulo "Buscar Predio"

Módulo conceptual **independiente de las publicaciones**. La búsqueda puede
iniciar por (todos `PLANNED` salvo indicación):

- partida SUNARP
- dirección
- distrito
- coordenadas
- ubicación en mapa
- enlace Google Maps
- propietario
- referencia textual
- datos parciales
- archivo/documento
- predio previamente guardado

Debe existir la posibilidad de crear un `ResearchCase` **aunque no exista un
`Listing`** (entrada B del producto).

Estado actual: el intake manual de REM@JU/SUNARP (`planRemateIntake`,
`RemateIntakeService`) ya permite registrar una partida capturada manualmente y
crear/persistir datos registrales — es el cimiento técnico sobre el que se
construirá este módulo de búsqueda.

---

## 4. Expediente de Predio

El detalle completo de una investigación **no debe quedar limitado al drawer**
del dashboard. El drawer sirve para:

- iniciar investigación
- mostrar progreso
- mostrar resumen
- mostrar estado de tareas

El **resultado completo** debe tener una vista/página propia del expediente, p. ej.:

```
/investigaciones/:id
```

### 4.1 Estructura del expediente (arquitectura UX conceptual)

Ocho/once secciones conceptuales:

1. Resumen
2. Registral
3. Urbanismo
4. GIS / Territorio
5. Infraestructura
6. Riesgos
7. Histórico
8. Judicial
9. Mercado
10. Evidencias
11. Informe

> **No asumir que todas las pestañas estarán disponibles en Free.** La
> disponibilidad dependerá del plan/entitlement (ver `docs/SECURITY.md` §6).

---

## 5. Due Diligence PRO

Producto **PRO** = investigación integral y multidimensional. Debe contemplar,
**cuando existan fuentes disponibles y legalmente utilizables** (todas `PLANNED`):

### A. REGISTRAL
partida, titularidad, área, linderos, cargas, gravámenes, antecedentes, títulos,
independizaciones, acumulaciones, historia registral.
→ Base técnica existente: normalización registral SUNARP
(`sunarp-normalize.ts`, `registry_*`) y estado derivado (`sunarp-historical.ts`).

### B. URBANISMO
zonificación, uso, parámetros, altura, retiros, área libre, densidad,
compatibilidad, PDM, IMPLA, normativa aplicable.

### C. INFRAESTRUCTURA
vías existentes, vías proyectadas, proyectos GORE, proyectos MPA, proyectos
municipales, Invierte.pe, puentes, colegios, hospitales, infraestructura
relevante.

### D. LOCATION INTELLIGENCE
colegios, universidades, hospitales, centros comerciales, supermercados,
mercados, transporte, servicios, accesibilidad, distancias, tiempos cuando sea
posible.

### E. RIESGO HÍDRICO
torrenteras, quebradas, canales, cauces, fajas marginales, inundaciones,
drenajes, cuencas, antecedentes de eventos.

### F. RIESGO GEOLÓGICO/TERRITORIAL
pendiente, elevación, geología, geomorfología, movimientos en masa,
susceptibilidad, licuefacción, peligros geológicos, información
INGEMMET/SIGRID u otras fuentes oficiales.

### G. HISTÓRICO
imágenes históricas, cambio de uso del suelo, agricultura, urbanización, canales
históricos, caminos, rellenos, cambios territoriales, evolución del entorno.

### H. JUDICIAL
CEJ, coincidencias, expedientes, partes, estado, resoluciones disponibles.
→ Base técnica existente: conector REM@JU (`remaju.ts`) y mapeo judicial.

### I. MERCADO
comparables, precio/m², publicaciones, oferta, evolución, señales de mercado.

---

## 6. Planes y Entitlements (conceptual)

**Los precios concretos NO son reglas arquitectónicas.** Son
configuración/product/business data. Nunca hardcodear `if (plan === "pro")` en
múltiples lugares: ver capa de entitlement en `docs/SECURITY.md` §6.

| Plan | Contenido conceptual |
|---|---|
| FREE | screening limitado, búsquedas gratuitas limitadas, historial básico |
| BASIC | investigación documental ampliada |
| PRO | due diligence integral (ver §5) |
| PROFESSIONAL | capacidades profesionales/volumen |

Estado: `PLANNED` / `DECISION REQUIRED` (no hay pagos ni pricing definidos).

---

## 7. Regla Fundamental de Riesgos

**El sistema NO convierte automáticamente una señal en una conclusión
profesional.**

- No escribir: *"El terreno es riesgoso porque antiguamente pasaba una
  torrentera."*
- Escribir algo equivalente a: *"Se detectó un posible antecedente territorial
  compatible con un antiguo cauce/torrentera. La evidencia consultada requiere
  verificación técnica/oficial."*

Cada hallazgo debe diferenciar: **HECHO / SEÑAL / INTERPRETACIÓN /
REQUIERE VERIFICACIÓN / OPINIÓN PROFESIONAL**. Nunca presentar una inferencia
automática como certificación profesional. Detalle completo en
`docs/RESEARCH_GOVERNANCE.md` §2 y §3.

---

## 8. Estado de las decisiones de producto

| Decisión | Estado |
|---|---|
| Definición del producto (plataforma de due diligence) | DEFINIDO (2026‑09‑19) |
| Dos entradas (A scraping / B manual) | DEFINIDO |
| Separación Listing / Property / ResearchCase | DEFINIDO |
| Expediente como vista propia `/investigaciones/:id` | PLANNED |
| Pestañas del expediente | PLANNED (depende de entitlement) |
| Due Diligence PRO (A–I) | PLANNED (pendiente de fuentes legalmente utilizables) |
| Buscar Predio (on-ramps) | PLANNED |
| Planes/entitlements y precios | DECISION REQUIRED |
| Comparar investigaciones / alertas de cambio | PLANNED (futuro) |
| Autenticación / cuentas | PLANNED (ver `docs/SECURITY.md`) |