# Modelo de Dominio — Land Intelligence

## 1. Conceptos Fundamentales

El modelo de dominio de **Land Intelligence** separa estrictamente el **anuncio publicitario** del **inmueble físico**, y organiza el proceso de investigación como un **proceso estructurado de due diligence**.

```text
       ┌─────────────────────┐
       │   PropertyListing   │ (Anuncio en FB Marketplace / Grupo / Portal)
       └──────────┬──────────┘
                  │ N
                  │ 1
       ┌──────────▼──────────┐
       │      Property       │ (Inmueble unificado en la realidad física)
       └──────────┬──────────┘
                  │ 1
       ┌──────────┴──────────┐
       │                     │ 1
       ▼                     ▼
┌──────────────┐      ┌──────────────┐
│  Geometries  │      │ ResearchCase │ (Expediente de investigación)
│  (PostGIS)   │      └──────┬───────┘
└──────────────┘             │ 1:8
                             ▼
                      ┌──────────────┐
                      │ ResearchTask │ (8 tareas especializadas)
                      └──────┬───────┘
                             │ 1:N
                             ▼
                      ┌──────────────┐
                      │ResearchResult│ (Evidencia con proveniencia)
                      └──────────────┘
```

---

## 2. Entidades Principales

### A. `Property` (Inmueble Raíz)
- **Identidad**: UUID interno (`id`) y código legible de negocio (`public_id`, ej. `PRP-10042`).
- **Atributos de Dominio**:
  - `propertyType`: Terreno, lote, casa, agrícola, comercial, etc.
  - `status`: Activo, inactivo, vendido, reservado.
  - Precios normalizados: `price`, `currency`, `priceUsd`, `pricePen`, `pricePerM2Usd`, `pricePerM2Pen`.
  - Dimensiones: `areaM2`, `frontMeters`, `depthMeters`.
  - Ubicación administrativa: Departamento, provincia, distrito, urbanización.
  - Metadatos de proveniencia: `primarySource`, `confidence`, `verificationStatus`.

### B. `PropertyListing` (Anuncio / Publicación)
- Representa la aparición comercial del inmueble en una plataforma específica.
- Permite que una misma propiedad física tenga múltiples publicaciones a lo largo del tiempo o en diferentes portales con precios divergentes.
- `contentHash`: Hash SHA-256 de título, descripción y precio para deduplicación rápida.
- `rawData`: JSON íntegro original devuelto por el scraper o conector.

### C. `ResearchCase` (Expediente de Investigación)
- Representa el esfuerzo coordinado de validación técnica, legal y comercial sobre una propiedad.
- Ciclo de vida: `pending` ➔ `running` ➔ `completed` / `failed` / `cancelled`.
- Contiene el resumen de hallazgos, nivel de riesgo general y notas del analista.

### D. `ResearchTask` (Tarea Especializada de Investigación)
Cada expediente genera automáticamente **8 tareas de investigación**:
1. **`identity`**: Normalización, deduplicación y hash de contenido.
2. **`geolocation`**: Obtención de coordenadas geográficas precisas y distrito real.
3. **`registry`**: Búsqueda y análisis de partida registral SUNARP.
4. **`bgr`**: Análisis de Base Gráfica Registral (superposición de polígonos).
5. **`urbanism`**: Zonificación IMPLA y parámetros urbanísticos del PDM Arequipa.
6. **`judicial`**: Antecedentes judiciales en el CEJ y remates en REM@JU.
7. **`market`**: Comparables inmobiliarios y valuación estadística por m².
8. **`risk`**: Evaluación de riesgos y disparo de alertas operativas.

### E. `ResearchResult` (Evidencia Obtenida)
- Resultado atómico emitido por un conector o tarea.
- **Invariante**: Los resultados conflictivos **nunca se sobrescriben**. Si la fuente A dice un titular y la fuente B dice otro, ambos resultados se registran con su respectivo `confidence` y `verification: conflicting`.

---

## 3. Matriz de Estados y Transiciones

### Ciclo de Vida de `ResearchTask`:
```text
[ pending ] ──► [ running ] ──► [ completed ]
                    │
                    ├──► [ requires_manual_action ] ──► [ completed ]
                    │
                    ├──► [ unavailable ] (fuente externa no accesible)
                    │
                    └──► [ failed ] (reintentos agotados)
```

### Ciclo de Vida de `PropertyAlert`:
```text
[ active ] ──► [ resolved ] (condición corregida)
     │
     └──► [ dismissed ] (descartada manualmente por analista con justificación)
```
