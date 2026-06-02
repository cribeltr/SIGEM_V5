#!/usr/bin/env node
/****************************************************************************
 * SIGEM_V5 · Limpieza del seed (migración de datos)
 * --------------------------------------------------------------------------
 * Lee el seed crudo (src/data/seed-data.raw.js, extraído VERBATIM del original)
 * y aplica las correcciones de auditoría acordadas, SIN tocar la lógica de
 * negocio. Genera:
 *   · src/data/seed.clean.js      → seed limpio (893 equipos) que usa la app
 *   · docs/reporte-migracion.md   → reporte de todo lo que se corrigió
 *
 * Las correcciones se basan en CATÁLOGOS CERRADOS derivados de los datos reales
 * y son idempotentes (volver a correrlo no cambia nada).
 *
 * Uso:  node tools/clean-seed.js
 ****************************************************************************/
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RAW = require(path.join(ROOT, 'src/data/seed-data.raw.js'));

// ---------------------------------------------------------------------------
// CATÁLOGOS CERRADOS (derivados de los valores reales presentes en el seed)
// ---------------------------------------------------------------------------
const FAMILIAS = ['Monitores', 'Ventiladores', 'Desfibriladores', 'Máquina de Diálisis', 'M Anestesia', 'Incubadoras'];
const FRECUENCIAS = ['Mensual (diaria)', 'Trimestral', 'Semestral'];

// Mapeo equipo → familia para COMPLETAR los que vienen sin fam. Solo cubre los
// nombres de equipo que aparecen sin familia en el seed (verificado).
const EQUIPO_A_FAMILIA = {
  'Ventilador Mecánico': 'Ventiladores',
  'Monitor Multiparámetros': 'Monitores',
  'Máquina Diálisis': 'Máquina de Diálisis',
  'Máquina de Diálisis': 'Máquina de Diálisis'
};

// ---------------------------------------------------------------------------
// HELPERS DE CORRECCIÓN
// ---------------------------------------------------------------------------
// Mojibake: doble codificación UTF-8 leída como Mac-Roman (patrón "√≥"=ó, etc.).
const MOJIBAKE_MAP = [
  ['√°', 'á'], ['√©', 'é'], ['√≠', 'í'], ['√≥', 'ó'], ['√∫', 'ú'],
  ['√±', 'ñ'], ['√º', 'ü'], ['√Å', 'Á'], ['√â', 'É'], ['√ç', 'Í'],
  ['√ì', 'Ó'], ['√ö', 'Ú'], ['√ë', 'Ñ']
];
function fixMojibake(s) {
  if (typeof s !== 'string' || s.indexOf('√') < 0) return { value: s, changed: false };
  let out = s;
  MOJIBAKE_MAP.forEach(([bad, good]) => { out = out.split(bad).join(good); });
  return { value: out, changed: out !== s };
}

// ---------------------------------------------------------------------------
// MIGRACIÓN
// ---------------------------------------------------------------------------
const report = {
  total: RAW.equipos.length,
  freqTypo: [],            // Timestral → Trimestral
  ventiladoresMonitores: [], // Ventilador Mecánico mal etiquetado como Monitores
  famCompletada: [],       // equipos sin fam, completados desde el catálogo equipo→familia
  mojibake: [],            // textos re-decodificados
  freqVacia: [],           // equipos sin frecuencia (se señalan, no se inventa)
  famFueraCatalogo: [],    // familias que no caen en el catálogo cerrado (se señalan)
  vurNegativo: 0,          // fuera de vida útil (indicador accionable)
  monitorDialisis: []      // FUERA DE SCOPE: Monitor Multiparámetros con fam Máquina de Diálisis (solo se reporta)
};

const equiposLimpios = RAW.equipos.map(orig => {
  const e = JSON.parse(JSON.stringify(orig));
  // Normaliza espacios sobrantes en 'equipo' (p. ej. "Ventilador Mecánico ").
  if (typeof e.equipo === 'string') e.equipo = e.equipo.trim();

  // 1) Typo de frecuencia.
  if (e.freq === 'Timestral') { e.freq = 'Trimestral'; report.freqTypo.push(e.inv); }

  // 2) Ventilador Mecánico mal etiquetado como Monitores.
  if (/ventilador mec/i.test(e.equipo || '') && e.fam === 'Monitores') {
    e.fam = 'Ventiladores';
    report.ventiladoresMonitores.push(e.inv);
  }

  // 3) Completar familia faltante desde el catálogo equipo→familia.
  if (e.fam == null || String(e.fam).trim() === '') {
    const fam = EQUIPO_A_FAMILIA[(e.equipo || '').trim()];
    if (fam) { e.fam = fam; report.famCompletada.push({ inv: e.inv, equipo: e.equipo, fam }); }
  }

  // 4) Mojibake en cualquier campo de texto del equipo.
  Object.keys(e).forEach(k => {
    const fixed = fixMojibake(e[k]);
    if (fixed.changed) {
      report.mojibake.push({ inv: e.inv, campo: k, antes: e[k], despues: fixed.value });
      e[k] = fixed.value;
    }
  });

  // 5) Señalización (sin alterar): freq vacía y fam fuera de catálogo.
  if (e.freq == null || String(e.freq).trim() === '') report.freqVacia.push(e.inv);
  if (e.fam && !FAMILIAS.includes(e.fam)) report.famFueraCatalogo.push({ inv: e.inv, fam: e.fam });

  // 6) Indicador fuera de vida útil.
  if (typeof e.vur === 'number' && e.vur < 0) report.vurNegativo++;

  // FUERA DE SCOPE (solo reporte): Monitor Multiparámetros etiquetado Máquina de Diálisis.
  if (/monitor multipar/i.test(e.equipo || '') && e.fam === 'Máquina de Diálisis') {
    report.monitorDialisis.push(e.inv);
  }
  return e;
});

const seedLimpio = {
  equipos: equiposLimpios,
  eventos: RAW.eventos,
  pendientes: RAW.pendientes,
  tareas: RAW.tareas,
  meses: RAW.meses
};

// ---------------------------------------------------------------------------
// ESCRITURA DE ARTEFACTOS
// ---------------------------------------------------------------------------
const banner = `// =============================================================
// SIGEM_V5 · SEED LIMPIO (generado por tools/clean-seed.js)
// NO EDITAR A MANO. Correcciones de auditoría aplicadas sobre el
// seed original (893 equipos). Ver docs/reporte-migracion.md.
// =============================================================
`;
const out = banner +
  'const SEED = ' + JSON.stringify(seedLimpio) + ';\n\n' +
  'if (typeof module !== "undefined" && module.exports) { module.exports = SEED; }\n' +
  'if (typeof window !== "undefined") { window.SEED = SEED; }\n';
fs.writeFileSync(path.join(ROOT, 'src/data/seed.clean.js'), out);

// Reporte markdown
const md = [];
md.push('# Reporte de migración del seed — SIGEM_V5\n');
md.push(`> Generado por \`tools/clean-seed.js\` a partir del seed original (\`src/data/seed-data.raw.js\`, extraído verbatim del monolito \`app_28.html\`).\n`);
md.push(`**Total de equipos:** ${report.total} (se conservan los ${report.total}, ninguno se elimina ni se duplica).\n`);

md.push('## Correcciones aplicadas\n');
md.push('| # | Corrección | Equipos afectados |');
md.push('|---|---|---|');
md.push(`| 1 | Typo de frecuencia \`Timestral\` → \`Trimestral\` | ${report.freqTypo.length} |`);
md.push(`| 2 | \`Ventilador Mecánico\` reetiquetado de \`Monitores\` → \`Ventiladores\` | ${report.ventiladoresMonitores.length} |`);
md.push(`| 3 | Familia completada en equipos sin \`fam\` | ${report.famCompletada.length} |`);
md.push(`| 4 | Mojibake re-decodificado (doble UTF-8) | ${report.mojibake.length} textos |`);
md.push(`| 5 | Indicador fuera de vida útil (\`vur < 0\`) | ${report.vurNegativo} |`);
md.push('');

md.push('### 1 · Typo de frecuencia');
md.push(report.freqTypo.length ? '`' + report.freqTypo.join('`, `') + '`\n' : '_Ninguno._\n');

md.push('### 2 · Ventiladores mal etiquetados como Monitores');
md.push('Inventarios reclasificados a `Ventiladores`:\n');
md.push('`' + report.ventiladoresMonitores.join('`, `') + '`\n');

md.push('### 3 · Familia completada (equipos sin `fam`)');
md.push('| Inventario | Equipo | Familia asignada |');
md.push('|---|---|---|');
report.famCompletada.forEach(r => md.push(`| ${r.inv} | ${r.equipo} | ${r.fam} |`));
md.push('');

md.push('### 4 · Mojibake re-decodificado');
md.push('| Inventario | Campo | Antes | Después |');
md.push('|---|---|---|---|');
report.mojibake.forEach(r => md.push(`| ${r.inv} | ${r.campo} | \`${r.antes}\` | \`${r.despues}\` |`));
md.push('');

md.push('## Catálogos cerrados (validación al importar)');
md.push('Toda importación (Excel/JSON) valida `fam` y `freq` contra estos catálogos:\n');
md.push('- **Familias:** ' + FAMILIAS.map(f => '`' + f + '`').join(' · '));
md.push('- **Frecuencias:** ' + FRECUENCIAS.map(f => '`' + f + '`').join(' · '));
md.push('');

md.push('## Señalado (no modificado)');
md.push(`- **${report.freqVacia.length} equipos sin frecuencia.** No se inventa un valor; se marcan para revisión. Inventarios: ${report.freqVacia.length ? '`' + report.freqVacia.join('`, `') + '`' : '—'}`);
md.push(`- **${report.monitorDialisis.length} equipos \`Monitor Multiparámetros\` etiquetados \`Máquina de Diálisis\`** (fuera del alcance de limpieza acordado). Se preservan verbatim; quedan aquí para decisión posterior.`);
if (report.famFueraCatalogo.length) {
  md.push(`- **${report.famFueraCatalogo.length} equipos con familia fuera del catálogo** tras la limpieza: ` + report.famFueraCatalogo.map(r => `${r.inv}=\`${r.fam}\``).join(', '));
}
md.push('');

fs.writeFileSync(path.join(ROOT, 'docs/reporte-migracion.md'), md.join('\n'));

// ---------------------------------------------------------------------------
// RESUMEN EN CONSOLA
// ---------------------------------------------------------------------------
console.log('SIGEM_V5 · limpieza del seed');
console.log('  equipos:                 ', report.total);
console.log('  freq Timestral→Trimestral', report.freqTypo.length);
console.log('  ventiladores reetiquetados', report.ventiladoresMonitores.length);
console.log('  familias completadas      ', report.famCompletada.length);
console.log('  mojibake corregidos       ', report.mojibake.length);
console.log('  vur<0 (fuera vida útil)   ', report.vurNegativo);
console.log('  [señalado] freq vacía     ', report.freqVacia.length);
console.log('  [señalado] monitor/diálisis', report.monitorDialisis.length);
console.log('  → src/data/seed.clean.js');
console.log('  → docs/reporte-migracion.md');
