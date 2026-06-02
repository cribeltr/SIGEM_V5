#!/usr/bin/env node
/****************************************************************************
 * SIGEM_V5 · Smoke test del frontend (render headless con jsdom).
 * Monta la app React (sin CDN: usa React/htm de node_modules) con el seed y el
 * núcleo reales, y verifica que arranca y navega por las vistas sin lanzar.
 *
 * Requiere (no-save):  npm install --no-save jsdom react react-dom htm
 * Uso:  node tools/smoke-test.js
 ****************************************************************************/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let JSDOM, React, ReactDOM, htm;
try {
  ({ JSDOM } = require('jsdom'));
  React = require('react');
  ReactDOM = require('react-dom/client');
  htm = require('htm');
} catch (e) {
  console.error('Faltan deps. Ejecuta:  npm install --no-save jsdom react react-dom htm');
  process.exit(2);
}

const ROOT = path.resolve(__dirname, '..');
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
const w = dom.window;
// React/ReactDOM corren en el realm de Node y leen `window` global: lo exponemos.
global.window = w; global.document = w.document;
try { global.navigator = w.navigator; } catch (e) { /* navigator es read-only en Node nuevo: ok */ }

// Globales que la app espera (equivalente a los <script> del HTML).
const ctx = {
  window: w, document: w.document, navigator: w.navigator,
  HTMLElement: w.HTMLElement, Node: w.Node, Event: w.Event, CustomEvent: w.CustomEvent,
  React, ReactDOM, htm,
  console, setTimeout, clearTimeout, setInterval, clearInterval, URL: w.URL, Blob: w.Blob,
  XLSX: undefined, google: undefined, module: { exports: {} }
};
ctx.global = ctx; ctx.globalThis = ctx; ctx.self = ctx;
vm.createContext(ctx);

const errs = [];
w.addEventListener('error', e => errs.push(e.message));

function run(code, name) { try { vm.runInContext(code, ctx, { filename: name }); } catch (e) { errs.push(name + ': ' + e.message); } }

run(fs.readFileSync(path.join(ROOT, 'src/data/seed.clean.js'), 'utf8'), 'seed');
run(fs.readFileSync(path.join(ROOT, 'src/core/hhha-core.js'), 'utf8'), 'core');
// El core asigna window.SEED/HHHA; en VM, global===window via ctx, pero el seed
// hace window.SEED = ... y el core global.HHHA = ...; aseguramos visibilidad.
ctx.SEED = ctx.SEED || w.SEED; ctx.HHHA = ctx.HHHA || w.HHHA || ctx.HHHA;
run(fs.readFileSync(path.join(ROOT, 'web/js/app.js'), 'utf8'), 'app');

setTimeout(() => {
  const checks = [];
  const ok = (label, cond) => checks.push({ label, cond: !!cond });
  const HHHA = ctx.HHHA || w.HHHA;
  ok('HHHA disponible', HHHA && typeof HHHA.getState === 'function');
  const S = HHHA && HHHA.getState();
  ok('estado con 893 equipos', S && S.equipos.length === 893);
  const root = w.document.getElementById('root');
  ok('app montada (#root con contenido)', root && root.children.length > 0);
  ok('render incluye navegación SIGEM', /SIGEM/.test(root.innerHTML));
  ok('render incluye KPIs de la cola', /Cola de trabajo|No operativos|vida útil/i.test(root.innerHTML));
  ok('sin errores de runtime', errs.length === 0);

  const fail = checks.filter(c => !c.cond);
  checks.forEach(c => console.log((c.cond ? 'OK   ' : 'FAIL ') + c.label));
  if (errs.length) { console.log('\nErrores:'); errs.slice(0, 8).forEach(m => console.log('  · ' + m)); }
  console.log(fail.length ? `\n*** SMOKE TEST: ${fail.length} fallo(s) ***` : '\n*** SMOKE TEST OK ***');
  process.exit(fail.length ? 1 : 0);
}, 600);
