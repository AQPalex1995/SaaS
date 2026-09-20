# Arquitectura de UX / Navegación

> **Estado**: PROPUESTA conceptual (2026‑09‑19) — `PLANNED`. Nada está
> implementado todavía como UI de producto; el frontend actual es el panel del
> Scout Legacy (`src/panel.html`, puerto 8787) con el Property Intelligence
> Drawer.

---

## 1. Navegación propuesta

- **Dashboard** — la vista actual de publicaciones sigue siendo importante,
  pero deja de ser la única puerta de entrada.
- **Buscar predio**
- **Mis investigaciones**
- **Predios guardados / favoritos**
- **Mercado**
- **Cuenta**
- **Administración** (según rol)

---

## 2. El Drawer vs. el Expediente

El drawer del dashboard sirve para:
- iniciar investigación;
- mostrar progreso;
- mostrar resumen;
- mostrar estado de tareas.

El **resultado completo** debe tener una vista/página propia del expediente.
Ruta conceptual:

```
/investigaciones/:id
```

---

## 3. Estructura del Expediente

Secciones conceptuales:

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
> disponibilidad dependerá del plan/entitlement (server-side).

---

## 4. Flujo Buscar Predio

Módulo independiente de las publicaciones. On-ramps (PLANNED): partida SUNARP,
dirección, distrito, coordenadas, ubicación en mapa, enlace Google Maps,
propietario, referencia textual, datos parciales, archivo/documento, predio
previamente guardado.

Debe poder crear un `ResearchCase` aunque no exista `Listing`
(ver `docs/PRODUCT.md` §3 y `docs/RESEARCH_GOVERNANCE.md` §1).

---

## 5. Principios UX

- El expediente es **solo lectura** con evidencia trazable; los datos editables
  se gestionan por acciones manuales registradas (nunca mutaciones silenciosas).
- Progreso del Research Engine en vivo (badges de tareas) — ya existe en el
  Drawer y se reutilizará en la vista del expediente.
- La UI decide qué mostrar según **entitlement server-side**; nunca según el plan
  enviado por el cliente (ver `docs/SECURITY.md` §6).