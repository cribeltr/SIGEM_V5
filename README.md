# SIGEM_V5 · Gestión de mantenimiento de equipos biomédicos

Reconstrucción de SIGEM con **arquitectura y diseño nuevos**, conservando el
**100 % de la lógica de negocio** del núcleo original (verificada con tests de
paridad). Pensada para uso **diario** —preventivo (MP) y correctivo— con énfasis
en la **reparación de equipos no operativos / en servicio técnico**.

- **Frontend:** React + htm + Tailwind (por CDN, sin paso de build pesado), UI
  nueva y **responsive** (escritorio y móvil/tablet). Diseño propio **"centro de
  control"**: oscuro por defecto (navy/grafito + acento cian), barra de estado en
  vivo, KPIs con sparkline, command palette, drawers accesibles, barra inferior
  tipo app en móvil. Servido como un único `Index.html`.
- **Backend / BD:** **Google Apps Script + Google Sheets**. Auth real por **login
  de Google**. Identidad del usuario usada como autor en la auditoría.
- **Lógica de negocio:** `src/core/hhha-core.js`, portada **verbatim** del
  original. Toda la app pasa por la API `HHHA.*`.

```
SIGEM_V5/
├── src/
│   ├── core/hhha-core.js      Lógica de negocio (FUENTE DE VERDAD, verbatim)
│   ├── data/seed-data.raw.js  Seed original (893 equipos, verbatim)
│   └── data/seed.clean.js     Seed limpio (GENERADO por tools/clean-seed.js)
├── web/                       UI nueva (React+htm+Tailwind): index.html + js/app.js
├── apps-script/Code.gs        Backend (auth Google + storage en Sheets)
├── dist/Index.html            GENERADO — pegar en Apps Script
├── tools/                     clean-seed.js · build.js · smoke-test.js
├── tests/                     Vitest — paridad de TODAS las reglas
└── docs/                      reglas-de-negocio.md · reporte-migracion.md
```

## Arranque local (un comando)

```bash
npm install      # instala vitest (y deps de prueba)
npm test         # 30/30 tests de paridad de reglas
npm run build    # genera dist/Index.html (incluye limpieza del seed)
```

Para **previsualizar la UI** sin Apps Script ni conexión, genera un HTML
autocontenido y ábrelo con doble clic (datos demo en `localStorage`):

```bash
npm run build:preview   # genera dist/SIGEM-preview.html (offline, sin CDN)
```

También puedes servir `web/` con cualquier servidor estático
(`npx serve web`); la app detecta que no hay Apps Script y usa `localStorage`.

## Despliegue en Google (Apps Script + Sheets)

1. Crea (o abre) un **Google Sheet** → menú **Extensiones → Apps Script**.
2. Pega `apps-script/Code.gs` como **`Code.gs`**.
3. Crea un archivo **HTML** llamado **`Index`** y pega el contenido de
   **`dist/Index.html`** (genéralo con `npm run build`).
4. **Implementar → Nueva implementación → Aplicación web**:
   - **Ejecutar como:** Yo
   - **Quién tiene acceso:** **Solo yo** (auth real por login de Google; usa *tu
     dominio* si lo compartirás dentro de la organización).
5. Abre la URL `.../exec`, autoriza permisos. Listo.
6. Tras cada cambio de código: **Gestionar implementaciones → editar → Nueva versión**.

El estado se guarda **comprimido en hojas ocultas** (`_SIGEM_DATA` / `_SIGEM_META`)
y, en paralelo, en **hojas legibles** (Inventario, Pendientes, Bitácora,
Correctivos) para trabajar el archivo **sin la app**.

## Seguridad

- **Auth real:** login de Google (acceso restringido al desplegar la Web App).
- **Sin secretos en el repo ni en la URL.** Si usas el modo HTTP externo opcional,
  el token va en **Script Properties** (`SIGEM_TOKEN`), el equivalente a `.env` en
  Apps Script. Ver `.env.example` para el modelo de variables.
- Comunicación cliente↔backend por `google.script.run` (mismo origen, sin CORS).
- Validación de entrada en las operaciones del núcleo (`HHHA.*`) y en la
  importación (catálogos cerrados de `fam`/`freq`).

## Calidad y trazabilidad

- **Tests de paridad** (`npm test`, Vitest): catálogos exactos, motor de estados,
  causales C1–C8, generación de pendientes automáticos, **reversión al anular**,
  ciclos correctivos y conciliación con el maestro. **30/30 verdes.**
- **Smoke test del frontend** (`node tools/smoke-test.js`): render headless de la
  app con 893 equipos, sin errores de runtime.
- **Versionado unificado:** `5.0.0` en `package.json`, expuesto en la UI
  (Configuración) y en `apps-script/Code.gs` (`apiBootstrap`).
- **Documentación:** [`docs/reglas-de-negocio.md`](docs/reglas-de-negocio.md)
  (trazabilidad regla ↔ código) · [`docs/reporte-migracion.md`](docs/reporte-migracion.md)
  (correcciones del seed).

## Migración del seed (limpieza aplicada)

`tools/clean-seed.js` produce `seed.clean.js` (los **893** equipos) corrigiendo:
`Timestral→Trimestral` (1) · 15 ventiladores mal etiquetados como *Monitores* ·
31 equipos sin familia completados · 6 textos con mojibake re-decodificados ·
indicador de **fuera de vida útil** (`vur < 0`, 309). Detalle y casos señalados
(no modificados) en `docs/reporte-migracion.md`.
