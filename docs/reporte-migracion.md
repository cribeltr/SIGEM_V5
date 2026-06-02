# Reporte de migración del seed — SIGEM_V5

> Generado por `tools/clean-seed.js` a partir del seed original (`src/data/seed-data.raw.js`, extraído verbatim del monolito `app_28.html`).

**Total de equipos:** 893 (se conservan los 893, ninguno se elimina ni se duplica).

## Correcciones aplicadas

| # | Corrección | Equipos afectados |
|---|---|---|
| 1 | Typo de frecuencia `Timestral` → `Trimestral` | 1 |
| 2 | `Ventilador Mecánico` reetiquetado de `Monitores` → `Ventiladores` | 15 |
| 3 | Familia completada en equipos sin `fam` | 31 |
| 4 | Mojibake re-decodificado (doble UTF-8) | 6 textos |
| 5 | Indicador fuera de vida útil (`vur < 0`) | 309 |

### 1 · Typo de frecuencia
`2-125347`

### 2 · Ventiladores mal etiquetados como Monitores
Inventarios reclasificados a `Ventiladores`:

`2-133374`, `200717-005592`, `200717-005511`, `200717-001961`, `2-125250`, `2-116493`, `2-116494`, `2-116495`, `2-116496`, `2-116497`, `2-116498`, `2-116499`, `2-116500`, `2-116501`, `2-119582`

### 3 · Familia completada (equipos sin `fam`)
| Inventario | Equipo | Familia asignada |
|---|---|---|
| 2-134627 | Ventilador Mecánico | Ventiladores |
| 2-134628 | Ventilador Mecánico | Ventiladores |
| 2-134629 | Ventilador Mecánico | Ventiladores |
| 2-134630 | Ventilador Mecánico | Ventiladores |
| 2-133677 | Monitor Multiparámetros | Monitores |
| 2-133678 | Monitor Multiparámetros | Monitores |
| 2-133679 | Monitor Multiparámetros | Monitores |
| 2-006455 | Máquina Diálisis | Máquina de Diálisis |
| 2-006460 | Máquina Diálisis | Máquina de Diálisis |
| 2-113999 | Máquina Diálisis | Máquina de Diálisis |
| 2-133198 | Máquina Diálisis | Máquina de Diálisis |
| 2-133199 | Máquina Diálisis | Máquina de Diálisis |
| 2-133200 | Máquina Diálisis | Máquina de Diálisis |
| 2-006456 | Máquina Diálisis | Máquina de Diálisis |
| 2-016016 | Máquina Diálisis | Máquina de Diálisis |
| 2-013586 | Máquina Diálisis | Máquina de Diálisis |
| 2-111213 | Máquina Diálisis | Máquina de Diálisis |
| 2-027619 | Máquina Diálisis | Máquina de Diálisis |
| 2-128041 | Máquina Diálisis | Máquina de Diálisis |
| 2-128043 | Máquina Diálisis | Máquina de Diálisis |
| 2-128044 | Máquina Diálisis | Máquina de Diálisis |
| 2-128045 | Máquina Diálisis | Máquina de Diálisis |
| 2-128046 | Máquina Diálisis | Máquina de Diálisis |
| 2-128047 | Máquina Diálisis | Máquina de Diálisis |
| 2-128048 | Máquina Diálisis | Máquina de Diálisis |
| 2-128050 | Máquina Diálisis | Máquina de Diálisis |
| 2-128060 | Máquina Diálisis | Máquina de Diálisis |
| 2-128062 | Máquina Diálisis | Máquina de Diálisis |
| 2-130653 | Máquina Diálisis | Máquina de Diálisis |
| 2-130654 | Máquina Diálisis | Máquina de Diálisis |
| 2-130655 | Máquina Diálisis | Máquina de Diálisis |

### 4 · Mojibake re-decodificado
| Inventario | Campo | Antes | Después |
|---|---|---|---|
| 2-023255 | unidad | `Pediatría Oncol√≥gica` | `Pediatría Oncológica` |
| 2-112510 | ubic | `Neurocirug√≠a` | `Neurocirugía` |
| 2-112512 | ubic | `SUI Observaci√≥n` | `SUI Observación` |
| 2-120994 | ubic | `Cirug√≠a box 1` | `Cirugía box 1` |
| 2-121557 | ubic | `SUI Observaci√≥n` | `SUI Observación` |
| 2-121562 | ubic | `SUI Observaci√≥n` | `SUI Observación` |

## Catálogos cerrados (validación al importar)
Toda importación (Excel/JSON) valida `fam` y `freq` contra estos catálogos:

- **Familias:** `Monitores` · `Ventiladores` · `Desfibriladores` · `Máquina de Diálisis` · `M Anestesia` · `Incubadoras`
- **Frecuencias:** `Mensual (diaria)` · `Trimestral` · `Semestral`

## Señalado (no modificado)
- **13 equipos sin frecuencia.** No se inventa un valor; se marcan para revisión. Inventarios: `2-134460`, `2-134461`, `2-125488`, `2-112327`, `2-110568`, `2-016151`, `2-135921`, `2-135399`, `2-021539`, `2-112548`, `2-016338`, `2-116713`, `2-121535`
- **29 equipos `Monitor Multiparámetros` etiquetados `Máquina de Diálisis`** (fuera del alcance de limpieza acordado). Se preservan verbatim; quedan aquí para decisión posterior.
