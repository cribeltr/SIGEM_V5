# Reglas de negocio — SIGEM_V5

> **Fuente de verdad:** `src/core/hhha-core.js` (portado verbatim del monolito original `app_28.html`, v0.62, banco de pruebas 20/20).
> Este documento traza **cada regla con su origen exacto en el código** para verificar paridad. Las referencias `hhha-core.js:N` y `función()` apuntan al archivo de este repo.
>
> Único cambio respecto al original: la **autoría/identidad** dejó de estar hardcodeada a `'Cristian'` y ahora es configurable (`setIdentity` / `currentUser()`, `hhha-core.js:60-62`). No altera ninguna regla.

---

## 1 · Catálogos (valores exactos del código)

| Catálogo | Origen | Valores |
|---|---|---|
| **Estados primarios del equipo** | `ESTADOS_PRIMARIOS` (`:111`) | `desconocido · operativo · no_operativo · en_servicio_tecnico · baja` |
| **Tipos de evento** | `TIPOS_EVENTO` (`:90`) | Solicitud de trabajo · Visita técnica · Orden de Compra · Envío a servicio técnico · Recepción · Reparación · Mantención preventiva |
| **Ejecutores** | `EJECUTORES` (`:84`) | 11 personas (10 nominales + `Personal externo`) |
| **Causales MP** | `CAUSALES` (`:100`) | C1–C8 (ver §3) |
| **Mapeo causal→estado** | `MP_CAUSAL_ESTADO` (`:130`) | `C2→en_servicio_tecnico · C3/FS/NU→no_operativo · Baja→baja` |
| **Resultados MP válidos** | `RESULTADOS_MP` (`:133`) | `Si C1 C2 C3 C4 C5 C6 C7 C8 FS NU Baja No` |
| **Docs correctivos** | `DOCS_CORRECTIVO` (`:117`) | 10 documentos por etapa |
| **Docs preventivos** | `DOCS_PREVENTIVO` (`:118`) | 4 documentos |
| **Tipos de pendiente** | `TIPO_PENDIENTE` (`:108`*) | documento_faltante · firma_faltante · reprogramacion · recomendacion_tecnica · gestion_general |
| **Estados de pendiente** | `ESTADO_PEND_LABEL` (`:111`*) | `no_iniciado · en_proceso · cerrado`(=Resuelto) |
| **Subestados no-op / ST** | `SUBESTADOS_NOOP` / `SUBESTADOS_ST` | pipeline de correctivos |
| **Motivos de anulación** | `MOTIVOS_ANULACION` | 7 motivos |
| **Meses** | `MESES` | `Ene…Dic` (12) |

(*) Las líneas de `TIPO_PENDIENTE`/`ESTADO_PEND_LABEL` están en el bloque de constantes del núcleo.

---

## 2 · Entidades del modelo

`equipos · eventos · ciclos · pendientes · tareas · conflictos · audit · asignacionesMP · importaciones · prefs · counters`. Estructura del `state` en `init()` (`:304`).

**Equipo:** `inv, fam, equipo, servicio, unidad, ubic, proc, marca, modelo, serie, ano, vur, clasif, freq, prog{Mes:cod}, registro{Mes:{P,R}}, estado, subestado, estadoDesde, encargado, notas[]`.

**Evento:** `id, inv, equipo, servicio, fam, tipo, fecha, fechaReg, resultado, estado, ejecutor, oficial, anulado, obs, creadoPor, ts` + campos extra según tipo (`CAMPOS_EXTRA_EVENTO`, `:1219`): `folio, nEnvio, nOC, nCotiz, empresa, tecnico, tipoVisita, folioGuia, ejecutor2, via, folioInformeTD, repuestos`.

---

## 3 · Causales MP C1–C8 y flag `reprog30`

Origen: `CAUSALES` (`hhha-core.js:100-109`). **Texto y flag exactos:**

| Causal | Descripción | `reprog30` | Estado resultante |
|---|---|:---:|---|
| **C1** | Imposibilidad de desocupar el equipo del paciente | `true` | — (sin falla) |
| **C2** | Equipo en servicio técnico | `false` | `en_servicio_tecnico` |
| **C3** | Equipo no operativo, espera de repuestos/accesorios | `false` | `no_operativo` |
| **C4** | Equipo en préstamo a otro hospital | `false` | — (sin falla) |
| **C5** | No disponibilidad de HH funcionario SEC (carga laboral) | `true` | — (sin falla) |
| **C6** | No disponibilidad de HH servicio técnico externo | `true` | — (sin falla) |
| **C7** | Ausencia funcionario SEC > 15 días | `true` | — (sin falla) |
| **C8** | Contingencia hospitalaria | `true` | — (sin falla) |

> **Ojo (verificado contra código):** las **no reprogramables** (`reprog30:false`) son **C2, C3, C4**. Las reprogramables (30 días) son **C1, C5, C6, C7, C8**. El estado solo lo cambian C2 y C3 (vía `MP_CAUSAL_ESTADO`); C1 y C4–C8 son reprogramación **sin** declarar falla.

---

## 4 · Motor de estados del equipo

**Regla:** el estado se deriva del **último evento que lo declara**. Función `recalcEstadoEquipo(equipo)` (`:491`).

Orden de resolución:
1. **Prioridad máxima:** cualquier MP con `resultado === 'Baja'` ⇒ `estado='baja'`, `estadoDesde=fecha` (`:496-501` aprox).
2. Recorre eventos no anulados de más nuevo a más viejo:
   - **MP con resultado** (`:506`): si `Si` ⇒ `operativo` salvo que `ev.estado==='no operativo'` (override manual) ⇒ `no_operativo`. Si hay `MP_CAUSAL_ESTADO[resultado]` (C2/C3/FS/NU/Baja) ⇒ ese estado. Si no (C1/C4–C8) ⇒ `continue` (no declara estado).
   - **Evento con `estado`** (`:511`): mapea `operativo / en servicio técnico / baja / (resto)→no_operativo`.
3. **Sin eventos que declaren estado:** infiere de la matriz (`estadoDesdeMatriz`, `:484`) usando el último mes con `R` que tenga mapeo en `MP_CAUSAL_ESTADO`; si tampoco ⇒ `operativo`, `estadoDesde=null`.

Auxiliares: `estadoMPDesdeResultado` (`:462`), `estadoMPFinal` (`:471`), `diasEnEstado` (`:530`), `etiquetaTipoEvento` (`:478`, muestra "Reprogramación mantención preventiva" para MP con causal C1–C8 sin cambiar `ev.tipo`).

---

## 5 · MP con causal C1–C8 → pendiente automático + R del mes siguiente

Función `aplicarEfectosEvento(ev)` (`:637`), bloque MP (`:662` aprox):

- Marca `eq.registro[mes].R = resultado` para el mes de la MP.
- Si `resultado` ∈ `C1–C8`:
  - Crea **pendiente automático** de `reprogramacion` (`crearPendienteAuto`, `:613`) con `eventoOrigen = ev.id`, `origen='auto_mp_causal'`.
  - **`fechaComp` = hoy + 30 días si `CAUSALES[r].reprog30`**, de lo contrario `null` (espera reintegro). Texto del pendiente incluye la descripción de la causal.
  - **Marca `R` (reprogramado) en la programación del MES SIGUIENTE** (`registro[mesSig].P = 'R'`), solo si está vacío y `mesIdx < 11`.
- Si `resultado === 'NU'` ⇒ pendiente `gestion_general` "Localizar equipo (resultado MP = NU)".
- Si `resultado === 'Baja'` ⇒ `eq.estado='baja'`, `estadoDesde=fecha`, audit.

---

## 6 · Ciclos correctivos

- **Abrir:** `aplicarEfectosEvento` con `tipo === 'Solicitud de trabajo'` ⇒ `abrirCiclo(folio, inv, fecha, ejecutor, obs)` (`:585`). Si ya hay ciclo abierto, pide confirmación. `estado='abierto'`.
- **Cerrar:** un evento `Reparación` / `Recepción` / `Visita técnica` con `tipoVisita==='correctiva'` **y `estado === 'operativo'`** cierra el ciclo abierto (por folio si lo trae; si no, el del equipo) (`:644` aprox).
- **Reconstrucción** desde eventos (para backups sin ciclos): `reconstruirCiclos()` (`:1635`), idempotente, solo actúa si no hay ciclos.
- Cierre manual con justificación obligatoria: `cerrarCicloManual` (`:1465`).

---

## 7 · Anular un evento revierte sus efectos (motor de reversión)

Función `anularEvento(ev, motivo)` (`:1293`). Marca `ev.anulado=true` y:

1. **MP con resultado:** limpia el `R` del mes; si hay **otra MP no anulada** del mismo mes, lo **reemplaza** por el resultado de esa (la más reciente) en vez de borrarlo (`:1300-1320` aprox).
2. **Recalcula el estado** del equipo (`recalcEstadoEquipo`).
3. **Solicitud que abrió ciclo:** si no quedan otros eventos correctivos vivos del ciclo ⇒ `ciclo.estado='anulado'`.
4. **Cierre que cerró ciclo:** si no hay otro cierre operativo ⇒ **reabre** el ciclo (`estado='abierto'`, `fechaCierre=null`).
5. **MP con causal C1–C8:** anula los **pendientes automáticos** asociados (`eventoOrigen===ev.id`, no cerrados).

Limpieza idempotente de efectos huérfanos al arrancar: `limpiarEfectosAnulados()` (`:203`).

---

## 8 · Conciliación con el maestro Excel

- **Parseo:** `parsearMaestro` → hojas `PMP_AAAA` y `Registro_MP-AAAA` (`parsearHojaPMP` `:734`, `parsearHojaRegistro` `:764`).
- **Comparación:** `compararMaestro(parsed, importacionId)` (`:817`):
  - **Equipo nuevo** (en maestro, no en programa) ⇒ conflicto `equipo_nuevo`.
  - **Equipo faltante** (en programa, no en maestro, no dado de baja) ⇒ conflicto `equipo_faltante`.
  - **Auto-completar:** celda vacía en programa + valor en maestro ⇒ se escribe sin conflicto. Si es `R` con valor del catálogo `RESULTADOS_MP` y no hay evento MP ese mes ⇒ crea **evento MP sintético** (`origen='conciliacion_auto'`, fecha día 15, `oficial='Sí'`).
  - **Coincidencia en `R`:** si ya hay evento MP en borrador, lo **oficializa** (`oficializarMPMesPorMaestro`, `:800`) sin duplicar.
  - **Diferencia real** ⇒ conflicto `mp_diferencia` (`registrarOActualizarConflicto`, `:963`).
- **Resolución:** `resolverConflicto(c, accion, valorManual, opts)` (`:984`), `accion ∈ {aceptar_maestro, mantener_programa, manual, posponer}`, individual y en lote (skipSave). Aceptar un `R` válido reemplaza (anula) MPs divergentes y crea/oficializa el evento del valor del maestro.

---

## 9 · Pendientes, tareas y seguimientos

- Estados: `no_iniciado · en_proceso · cerrado` (`normalizarEstadoPend`, `:187`; `cambiarEstadoPend`, `:695`).
- Crear manual `crearPendiente` (`:1376`); auto `crearPendienteAuto` (`:613`).
- **Tareas atómicas:** `agregarTareaPendiente` (`:1420`), `toggleTarea` (`:1430`) — devuelve `todasCerradas` para sugerir cierre.
- **Seguimientos:** `agregarSeguimiento` (`:1441`). Cierre `cerrarPendiente` (`:1450`).
- Anular `anularPendiente` (`:1413`).

---

## 10 · Operaciones MP y eventos

- `registrarMP(d)` (`:1136`) y `registrarMPMasiva(d)` (`:1172`). Guardia de programación `avisoMPSinProgramacion` (`:1121`): si el mes no tiene MP programada, devuelve `{requiereConfirmacion, aviso}`; el llamador reintenta con `forzarSinProg`.
- `crearEvento(d)` (`:1224`): copia `CAMPOS_EXTRA_EVENTO`; Solicitud ⇒ `estado='no operativo'`; MP ⇒ `estadoMPFinal`. Aplica efectos.
- `oficializarEvento` (`:1267`), `editarEvento` (`:1276`, no toca estado/resultado), `docsEsperadosEvento` (`:1261`).
- **Baja:** `darDeBaja(eq, motivo)` (`:1475`) crea evento MP `resultado='Baja'`, marca `registro[mesActual]={R:'Baja'}`, limpia meses posteriores, cierra pendientes del equipo.

---

## 11 · Asignación de MP, exportes e import

- `construirAsignacionMP(year, monthIdx)` (`:1552`): equipos programados del mes (excluye baja y los con `FS/Baja/NU` en meses previos) + responsable.
- `procesarPlantillaMP(rows, year, monthIdx)` (`:1578`): carga responsables validando inv existente y responsable ∈ `EJECUTORES`.
- Backup `exportarBackupJSON` (`:1511`) / `importarBackup` (`:1516`): migra, reconstruye ciclos, normaliza tipos/estados.

---

## 12 · Persistencia y arranque

- `bootstrapDatos()` (`:1710`): carga o inicializa; corre `limpiarEfectosAnulados`, `reconstruirCiclos`, `normalizarTiposEvento`, `normalizarEstadoEventos`; recalcula estados.
- En SIGEM_V5 la persistencia primaria es **Google Sheets vía Apps Script** (estado JSON comprimido + hojas legibles); `localStorage` queda como caché local. `STORAGE_KEY='hhha_v1_data'`, `APP_VERSION` en el núcleo.

---

## 13 · Mejoras de auditoría aplicadas (no cambian reglas)

| Mejora | Dónde |
|---|---|
| Identidad configurable (no más `'Cristian'` hardcodeado) | `setIdentity`/`currentUser` (`:60-62`) + Google login en `Code.gs` |
| Limpieza del seed (Timestral, ventiladores, sin-fam, mojibake) | `tools/clean-seed.js` → `docs/reporte-migracion.md` |
| Indicador fuera de vida útil (`vur < 0`, 309/893) | cola de trabajo (UI) |
| Validación de `fam`/`freq` contra catálogos cerrados al importar | `tools/clean-seed.js` + capa de import UI |
| Log de auditoría persistido (en el Sheet) | `audit()` (`:369`) + sync a Google Sheets |

---

_Paridad verificable: la suite de tests (`tests/`) ejercita estados, C1–C8, generación de pendientes, reversión al anular, ciclos y conciliación contra este mismo `hhha-core.js`._
