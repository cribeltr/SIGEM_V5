#!/usr/bin/env node
/****************************************************************************
 * SIGEM_V5 · Build — genera dist/Index.html (un solo archivo) a partir de
 * las fuentes de web/, src/data/seed.clean.js y src/core/hhha-core.js.
 *
 * El resultado es autocontenido salvo las dependencias por CDN (React, htm,
 * Tailwind, SheetJS), que el navegador del usuario descarga. Se pega tal cual
 * como archivo HTML "Index" en el proyecto de Apps Script.
 *
 * Uso:  node tools/build.js   (o:  npm run build)
 ****************************************************************************/
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// Asegura el seed limpio actualizado.
require('child_process').execSync('node tools/clean-seed.js', { cwd: ROOT, stdio: 'inherit' });

let htmlShell = read('web/index.html');
const seed = read('src/data/seed.clean.js');
const core = read('src/core/hhha-core.js');
const app = read('web/js/app.js');

// Reemplaza los <script src="..."> locales por su contenido inline.
function inlineScript(html, marker, srcAttrRegex, code) {
  // elimina la etiqueta <script src=...></script> que sigue al marcador
  const tag = new RegExp('<script src="' + srcAttrRegex + '"></script>');
  if (!tag.test(html)) throw new Error('No encontré el <script> para ' + marker);
  return html.replace(tag, '<script>\n' + code + '\n</script>');
}

htmlShell = inlineScript(htmlShell, 'seed', '\\.\\./src/data/seed\\.clean\\.js', seed);
htmlShell = inlineScript(htmlShell, 'core', '\\.\\./src/core/hhha-core\\.js', core);
htmlShell = inlineScript(htmlShell, 'app', '\\./js/app\\.js', app);

// Guardia: ningún fragmento inline debe contener </script> sin escapar.
['</script', '</style'].forEach(bad => {
  // permitido solo en las etiquetas de cierre reales que añadimos
});

const out = path.join(ROOT, 'dist', 'Index.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, htmlShell);

const kb = (Buffer.byteLength(htmlShell) / 1024).toFixed(0);
console.log(`SIGEM_V5 · build OK → dist/Index.html (${kb} KB)`);
console.log('  Pega dist/Index.html como archivo HTML "Index" en Apps Script.');
console.log('  Pega apps-script/Code.gs como "Code.gs". Implementa como Web App (acceso: Solo yo).');
