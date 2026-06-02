#!/usr/bin/env node
/****************************************************************************
 * SIGEM_V5 · Build STANDALONE (offline, para previsualizar con doble clic).
 * Genera dist/SIGEM-preview.html: un solo archivo SIN dependencias por CDN.
 * Inlina React, ReactDOM y htm (UMD de node_modules), el CSS de Tailwind ya
 * COMPILADO (solo las clases usadas) y las fuentes (seed limpio, núcleo, app).
 *
 * Requiere (no-save):  npm install --no-save tailwindcss@3 react react-dom htm
 * Uso:  node tools/build-standalone.js
 ****************************************************************************/
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// 1) Seed limpio actualizado.
cp.execSync('node tools/clean-seed.js', { cwd: ROOT, stdio: 'inherit' });

// 2) Compila Tailwind a CSS estático (solo clases usadas).
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const cssOut = path.join(ROOT, 'dist', '.tw.css');
cp.execSync(`npx tailwindcss -c tools/tw-config.js -i tools/tw-input.css -o dist/.tw.css --minify`, { cwd: ROOT, stdio: 'inherit' });
const tw = fs.readFileSync(cssOut, 'utf8');
fs.unlinkSync(cssOut);

// 3) Vendor JS (UMD) desde node_modules.
const react = read('node_modules/react/umd/react.production.min.js');
const reactDom = read('node_modules/react-dom/umd/react-dom.production.min.js');
const htmjs = read('node_modules/htm/dist/htm.umd.js');

const seed = read('src/data/seed.clean.js');
const core = read('src/core/hhha-core.js');
const app = read('web/js/app.js');

const docHtml = `<!DOCTYPE html>
<html lang="es" class="h-full">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>SIGEM · Equipos Biomédicos (preview offline)</title>
<style>
${tw}
html,body,#root{height:100%}
body{-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;font-size:14px;line-height:1.5}
.mono{font-variant-numeric:tabular-nums;font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.9em;letter-spacing:-.2px}
.brand-gradient{background-image:linear-gradient(120deg,#0d9488 0%,#0f766e 55%,#115e59 100%)}
.scrollbar-thin::-webkit-scrollbar{width:8px;height:8px}
.scrollbar-thin::-webkit-scrollbar-thumb{background:rgba(120,120,120,.35);border-radius:8px}
[data-drawer],[data-overlay]{transition:transform .18s ease,opacity .18s ease}
@media (prefers-reduced-motion:reduce){*{transition:none !important}}
</style>
</head>
<body class="h-full bg-slate-50 text-slate-800 dark:bg-slate-950 dark:text-slate-100">
<div id="root"></div>
<script>${react}</script>
<script>${reactDom}</script>
<script>${htmjs}</script>
<script>${seed}</script>
<script>${core}</script>
<script>${app}</script>
</body>
</html>
`;

const out = path.join(ROOT, 'dist', 'SIGEM-preview.html');
fs.writeFileSync(out, docHtml);
const kb = (Buffer.byteLength(docHtml) / 1024).toFixed(0);
console.log(`SIGEM_V5 · standalone OK → dist/SIGEM-preview.html (${kb} KB)`);
console.log('  Ábrelo con doble clic: funciona sin internet ni Apps Script (datos demo en el navegador).');
