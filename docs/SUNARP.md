# SUNARP — Registro y Titularidad (Fase 5)

> **Estado**: Fase 5 / T5.1 (Conoce Aquí) — ✅ DONE (2026‑09‑18).
> Reporte de discovery y postura del conector `sunarp`.

## 1. Qué es SUNARP

La **Superintendencia Nacional de los Registros Públicos (SUNARP)** administra
los registros jurídicos del Perú: Propiedad Inmueble, Vehicular, Personas
Naturales y Personas Jurídicas (~33 millones de partidas vigentes). La Zona
Registral que cubre Arequipa es la **Nº XII — Sede Arequipa**, prioritaria para
este ecosistema.

Portal institucional: `https://www.gob.pe/sunarp`.

## 2. Superficies de consulta registral (estado 2026)

Ninguna superficie web de SUNARP es consultable **sin identidad personal**.
Todas las gratuitas exigen además **CAPTCHA**; la de valor legal es de pago.

| Servicio | URL | Acceso | Alcance | Costo |
|---|---|---|---|---|
| **Conoce Aquí** | `https://conoce-aqui.sunarp.gob.pe/conoce-aqui/inicio` | DNI + fecha de emisión + **CAPTCHA** | Contenido de la partida (4 registros); asientos con tramado "no constituye publicidad registral"; no imprimible | Gratis |
| **Consulta de Propiedad** | `https://www2.sunarp.gob.pe/consulta-propiedad` | DNI/carnet de extranjería + fecha de emisión + **CAPTCHA** (+ validación de correo OTP) | Búsqueda de partidas a nombre del titular (busca por nombres, con homonimia) | Gratis |
| **SPRL (Publicidad Registral en Línea)** | `https://sprl.sunarp.gob.pe` | Usuario y clave (suscripción gratuita; consulta pagada) | Visualización/imprevisto de partida, copias literales, certificados (valor legal) | S/ 6.90/página; copia literal ~ S/ 14 (2 hojas) + S/ 7 extra |
| **Visor BGR** | visor de la Base Gráfica Registral | DNI + fecha de emisión + **CAPTCHA** | Mapas de predios incorporados a la BGR; búsqueda por ubicación/partida/coordenadas | Gratis (3 accesos/día, 45 min) |
| **Consulta Verificadores** | `https://www.sunarp.gob.pe/ConsultaVerificadores/` | Apellido paterno + primer nombre + **CAPTCHA** obligatorio | Verificación de registradores públicos | Gratis |

Detalle de **Conoce Aquí** (objetivo de T5.1):

- Login con **DNI + fecha de emisión** validados y **clic en el CAPTCHA**.
- Límites operativos: **3 a 5 consultas/visualizaciones por día por DNI**;
  cada visualización de la partida queda disponible **30 minutos**.
- Asientos con **tramado de agua** indicando "servicio gratuito, no constituye
  publicidad registral"; **no se puede imprimir**.
- Excepción legal: información de acceso restringido (p. ej. **testamentos**)
  solo visible para el titular.

## 3. Veredicto de automatización

> **No existe superficie pública SUNARP sin identidad + CAPTCHA** (a diferencia
> del home público de REM@JU, Fase 4). Por tanto:

1. **No se automatiza ninguna consulta SUNARP**:
   - implica datos personales (DNI + fecha de emisión) → prohibido almacenar
     según la **Ley 29733 / D.S. 003‑2013‑JUS** (minimización de datos);
   - además violaría la política dura del proyecto: **no bypass de CAPTCHA**;
   - hay límites diarios por identidad (3–5 consultas/día).
2. **Postura honesta del conector `sunarp`** (`SunarpConnector`):
   - `getStatus()` → `requires_auth` + `requiresManualAction: true` con
     instrucciones para el operador;
   - `search()` → resultado vacío (nunca datos simulados);
   - `getDetails()` → `found:false` + `requiresManualAction: true`.
3. **Impacto en el Research Engine**: la tarea `registry` (Tarea 3) y `bgr`
   transicionan a `requires_manual_action` creando una `manual_actions`
   (kind `login`) con la descripción, en lugar de `unavailable`. El operador
   consulta Conoce Aquí/SPRL de forma manual (usuario humano, identidad propia)
   y el resultado (partida, titular, cargas) se persiste vía el intake de
   `registry_properties` existente (T4.5) o el flujo general (T5.10).

## 4. Recomendaciones por servicio (plan Fase 5)

- **T5.2 Consulta de Propiedad** → igual que Conoce Aquí: `requires_auth`
  (manual). Sirve para localizar la partida por nombre del propietario cuando
  no se conoce el número.
- **T5.3 SPRL** → `requires_auth` + pago (kind `payment`). Solo operador con
  cuenta suscrita; útiles solo para copias legales/certificados.
- **T5.4 Registry normalization** → la normalización de partidas (formato
  `P-XXXXXXXX` de la Zona XII) se hace sobre datos que captura el operador.
- **T5.6/5.7 cargas y asientos** → se rellenan desde el detalle manual.
- **BGR (Fase 6, visor)** → DNI + CAPTCHA: misma postura `requires_auth` en
  `sunarp_bgr`.
- **SPRL histórico** (T5.8) → via copias literales manuales.

## 5. Reglas críticas vigentes

- **No** automatizar autenticación ni CAPTCHA de SUNARP.
- **No** almacenar DNI/fecha de emisión de individuos.
- **No** inventar datos: resultados vacíos o `requires_manual_action`, nunca
  datos simulados.
- El conector `sunarp` **no realiza peticiones de red** (postura estática,
  honesta y verificada contra la documentación oficial de gob.pe).

## 6. URLs de referencia (2026)

- Conoce Aquí: https://conoce-aqui.sunarp.gob.pe/conoce-aqui/inicio
- Consulta de Propiedad: https://www2.sunarp.gob.pe/consulta-propiedad
- SPRL: https://sprl.sunarp.gob.pe
- gob.pe — consultar gratis partidas: https://www.gob.pe/50685
- gob.pe — consultar datos de propiedad: https://www.gob.pe/26531
- gob.pe — ver partidas en SPRL: https://www.gob.pe/381
- gob.pe — Visor BGR: https://www.gob.pe/63173
- ALÓ SUNARP: 0800‑27164 · consultas@sunarp.gob.pe