# Auditoría de Arquitectura — FB Terreno Scout (Código Previo)

## 1. Contexto del Hallazgo

Antes de iniciar la Fase 1, se ejecutó una inspección y auditoría exhaustiva del código fuente existente en el directorio `src/`. El proyecto original, denominado **FB Terreno Scout**, fue concebido como una herramienta local para monitorear y recolectar publicaciones de venta de terrenos en Arequipa, Perú, principalmente desde Facebook Marketplace y Grupos de Facebook, extendiéndose luego a portales como AdondeVivir y Urbania.

---

## 2. Inventario de Componentes Previos

El código base previo constaba de **21 archivos TypeScript** en `src/`, con las siguientes responsabilidades identificadas:

| Archivo | Responsabilidad Principal | Observaciones de Auditoría |
|---|---|---|
| `src/main.ts` | Orquestador principal y bucle periódico | Ejecuta ciclos de scraping y coordina el servidor web |
| `src/server.ts` | Servidor HTTP nativo en puerto `8787` | Implementado con `node:http` puro, sin framework |
| `src/panel.html` | Interfaz de usuario (Single Page App) | HTML monolítico con CSS embebido y JavaScript Vanilla |
| `src/store.ts` | Capa de persistencia SQLite | Usa módulo experimental `node:sqlite`, tabla única `listings` |
| `src/scout.ts` | Scraping de Facebook Marketplace y Grupos | Automatización mediante Playwright, manejo de sesiones |
| `src/browser.ts` | Configuración del navegador Playwright | Contexto persistente Chromium, flags anti-detección |
| `src/portals.ts` | Scraping de AdondeVivir y Urbania | Extracción de portales inmobiliarios externos |
| `src/ocr.ts` | Procesamiento óptico de imágenes | Uso de Tesseract.js para extraer texto y precios de fotos |
| `src/extract.ts` | Extracción de datos con expresiones regulares | Detección heurística de precios, m², distritos, teléfonos |
| `src/searchers.ts` | Generador de URLs de búsqueda | Palabras clave para terrenos y lotes en Arequipa |
| `src/normalizer.ts` | Normalización de cadenas y distritos | Mapeo de variantes ortográficas de distritos de Arequipa |
| `src/location-detector.ts` | Heurísticas de georreferenciación | Clasificación por confianza (título, OCR, descripción) |

---

## 3. Fortalezas Identificadas

1. **Heurísticas locales efectivas**: El extractor (`extract.ts`) y normalizador (`normalizer.ts`) contienen un conocimiento de dominio muy valioso sobre el mercado arequipeño (variantes como "La Joya", "Cerro Colorado", "Yura", "Characato", precios en soles y dólares, formatos de metros cuadrados).
2. **Capacidad de OCR**: `ocr.ts` extrae datos directamente de afiches publicitarios (letreros de venta en fotos), lo que permite capturar precios o números telefónicos que no están en el texto de la publicación.
3. **Persistencia funcional de anuncios**: Posee una base de datos SQLite real (`data/terrenos.db`, ~9.5 MB) con miles de publicaciones recopiladas y deduplicación basada en URLs.
4. **UI responsiva y limpia**: `panel.html` cuenta con una estética oscura moderna, filtros en tiempo real y soporte para favoritos y notas.

---

## 4. Limitaciones y Deuda Técnica Detectadas

1. **Persistencia no relacional plana**:
   - Todo se guardaba en una única tabla `listings` con columnas de texto y payloads JSON no estructurados.
   - Imposible modelar un *inmueble único* que tiene *múltiples publicaciones* a lo largo del tiempo o en diferentes plataformas.
2. **Falta de soporte Geoespacial (GIS)**:
   - No había almacenamiento de geometrías espaciales ni cálculo de intersecciones con zonificación urbana (PDM) o Base Gráfica Registral (BGR).
3. **Ausencia de un modelo de Due Diligence / Investigación**:
   - El sistema se limitaba a registrar el post; no permitía verificar la partida registral SUNARP, antecedentes judiciales, gravámenes o titularidad.
4. **Acoplamiento en el Servidor HTTP**:
   - `src/server.ts` usaba `http.createServer` con enrutamiento manual basado en `if (url === ...)` sin esquemas de validación ni OpenAPI.
5. **Riesgo de colisión de infraestructura**:
   - El usuario opera en su máquina un ERP de producción (CAST ERP). Levantar Postgres o Redis en puertos predeterminados (`5432` / `6379`) interrumpiría el ERP de la empresa.

---

## 5. Decisión de Arquitectura Adoptada

En lugar de destruir o reescribir agresivamente el código de `src/`, se determinó:
- **Preservar el Scout intacto** en el puerto `8787` con su base SQLite y automatizaciones de Playwright.
- **Crear el nuevo núcleo Land Intelligence en `server/`** utilizando tecnologías de clase empresarial: Fastify en el puerto `3001`, PostgreSQL 16 + PostGIS en el puerto `5433`, Drizzle ORM y colas BullMQ en Redis puerto `6380`.
- **Integrar una pasarela visual (Property Intelligence Drawer)** en `panel.html` para permitir disparar investigaciones hacia el nuevo núcleo sin alterar la experiencia de usuario existente.
