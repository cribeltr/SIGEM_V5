/****************************************************************************
 * SIGEM_V5 · Backend (Google Apps Script Web App)
 * --------------------------------------------------------------------------
 * - Sirve el frontend (Index.html: React + Tailwind por CDN, UI nueva).
 * - Autenticación REAL por login de Google: al desplegar la Web App con acceso
 *   "Solo yo" (o "tu dominio"), Google obliga a iniciar sesión. La identidad del
 *   usuario (email) se entrega al cliente y se usa como AUTOR en la auditoría
 *   (reemplaza el 'Cristian' hardcodeado del original).
 * - Almacenamiento en Google Sheets:
 *     · Estado completo (JSON, opcionalmente comprimido) en hoja OCULTA _SIGEM_DATA.
 *     · Hojas LEGIBLES (cuaderno de operaciones) que envía la app.
 * - Sin CORS ni tokens en la URL: el cliente usa google.script.run (mismo origen).
 *
 * SECRETOS / CONFIG: no hay credenciales en el código. Si quisieras un token
 * extra para el modo HTTP externo, guárdalo en Script Properties (Project
 * Settings → Script Properties → clave SIGEM_TOKEN). NUNCA en la URL ni en el repo.
 *
 * INSTALACIÓN
 *   1. Crea/abre un Google Sheet → Extensiones → Apps Script.
 *   2. Pega este archivo como Code.gs y crea un HTML llamado "Index" con dist/Index.html.
 *   3. Implementar → Nueva implementación → Aplicación web:
 *        · Ejecutar como: Yo
 *        · Quién tiene acceso: Solo yo   (auth real; cámbialo a tu dominio si aplica)
 *   4. Abre la URL .../exec, autoriza permisos. Listo.
 *   Tras cada cambio de código: Gestionar implementaciones → editar → Nueva versión.
 ****************************************************************************/

var DATA_SHEET = '_SIGEM_DATA';  // hoja de sistema (oculta) con el JSON del estado
var META_SHEET = '_SIGEM_META';  // hoja de sistema (oculta) con metadatos
var CHUNK = 45000;               // tamaño de trozo por celda (límite de celda: 50.000)

// ---------------------------------------------------------------------------
// SERVIR LA APP + IDENTIDAD
// ---------------------------------------------------------------------------
function doGet(e) {
  try {
    e = e || {}; var p = e.parameter || {};
    // Modo HTTP externo (opcional): lectura del estado con token de Script Properties.
    if (p.api === 'read') {
      if (!okToken(p.token)) return _json({ ok: false, error: 'no autorizado' });
      return _json({ ok: true, dataB64: readData(), updated: readMeta('updated'), user: currentUserEmail() });
    }
    return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('SIGEM · Equipos Biomédicos')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    return HtmlService.createHtmlOutput('<pre style="font-family:sans-serif">Falta el archivo Index.html. ' +
      'Crea un HTML llamado "Index" y pega dist/Index.html. Detalle: ' + err + '</pre>');
  }
}

// Identidad del usuario autenticado (email de Google). Es la auth real.
function currentUserEmail() {
  try {
    var u = Session.getActiveUser().getEmail();
    if (u) return u;
  } catch (e) {}
  try { return Session.getEffectiveUser().getEmail() || ''; } catch (e) {}
  return '';
}

// ---------------------------------------------------------------------------
// API para google.script.run (mismo origen, sin CORS)
// ---------------------------------------------------------------------------
// Carga inicial: estado + identidad del usuario (para la auditoría).
function apiBootstrap() {
  return { ok: true, dataB64: readData(), updated: readMeta('updated'), user: currentUserEmail(), version: '5.0.0' };
}
function apiRead() { return { ok: true, dataB64: readData(), updated: readMeta('updated'), user: currentUserEmail() }; }

// Guarda en una sola llamada: estado del sistema (oculto) + hojas legibles.
// Control optimista: si el cliente envía 'baseUpdated', se rechaza si el servidor
// ya tiene una versión más nueva (otra pestaña/dispositivo escribió primero).
function apiSave(payload) {
  payload = payload || {};
  var serverUpdated = readMeta('updated');
  if (payload.baseUpdated && serverUpdated && payload.baseUpdated !== serverUpdated) {
    return { ok: false, conflict: true, serverUpdated: serverUpdated };
  }
  if (typeof payload.dataB64 === 'string') {
    writeData(payload.dataB64);
    var ts = new Date().toISOString();
    writeMeta('updated', ts);
    writeMeta('lastUser', currentUserEmail());
  }
  if (Array.isArray(payload.sheets)) writeSheets(payload.sheets);
  hideSystemSheets();
  return { ok: true, updated: readMeta('updated'), user: currentUserEmail() };
}

// ---------------------------------------------------------------------------
// doPost (modo HTTP externo opcional, con token de Script Properties)
// ---------------------------------------------------------------------------
function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!okToken(body.token)) return _json({ ok: false, error: 'no autorizado' });
    if (typeof body.dataB64 === 'string') { writeData(body.dataB64); writeMeta('updated', new Date().toISOString()); }
    if (Array.isArray(body.sheets)) writeSheets(body.sheets);
    hideSystemSheets();
    return _json({ ok: true, ts: new Date().toISOString() });
  } catch (err) { return _json({ ok: false, error: String(err) }); }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function _json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function okToken(t) {
  var secret = PropertiesService.getScriptProperties().getProperty('SIGEM_TOKEN') || '';
  return !secret || String(t || '') === secret;
}
function ss() { return SpreadsheetApp.getActiveSpreadsheet(); }
function sheetByName(name, create) {
  var sh = ss().getSheetByName(name);
  if (!sh && create) sh = ss().insertSheet(name);
  return sh;
}

function readData() {
  var sh = sheetByName(DATA_SHEET, false);
  if (!sh) return '';
  var last = sh.getLastRow();
  if (last < 1) return '';
  return sh.getRange(1, 1, last, 1).getValues().map(function (r) { return r[0]; }).join('');
}
function writeData(b64) {
  var sh = sheetByName(DATA_SHEET, true);
  sh.clear();
  var chunks = [];
  for (var i = 0; i < b64.length; i += CHUNK) chunks.push([b64.substr(i, CHUNK)]);
  if (!chunks.length) chunks = [['']];
  sh.getRange(1, 1, chunks.length, 1).setValues(chunks);
  sh.hideSheet();
}
function readMeta(k) {
  var sh = sheetByName(META_SHEET, false); if (!sh) return '';
  var v = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 2).getValues();
  for (var i = 0; i < v.length; i++) if (v[i][0] === k) return v[i][1];
  return '';
}
function writeMeta(k, val) {
  var sh = sheetByName(META_SHEET, true);
  var v = sh.getLastRow() ? sh.getRange(1, 1, sh.getLastRow(), 2).getValues() : [];
  var found = false;
  for (var i = 0; i < v.length; i++) if (v[i][0] === k) { v[i][1] = val; found = true; }
  if (!found) v.push([k, val]);
  sh.clear(); sh.getRange(1, 1, v.length, 2).setValues(v); sh.hideSheet();
}

function isSystem(name) { return String(name).charAt(0) === '_'; }

// Escribe hojas legibles: [{name, rows, hidden, headerRow}]
function writeSheets(sheets) {
  var order = [];
  (sheets || []).forEach(function (spec) {
    if (!spec || !spec.name) return;
    var sh = sheetByName(spec.name, true);
    sh.clear();
    var rows = spec.rows || [];
    var maxc = 1;
    if (rows.length) {
      rows.forEach(function (r) { if (r.length > maxc) maxc = r.length; });
      var norm = rows.map(function (r) { var a = r.slice(); while (a.length < maxc) a.push(''); return a; });
      sh.getRange(1, 1, norm.length, maxc).setValues(norm);
      var hr = (spec.headerRow != null) ? spec.headerRow : 1;
      sh.setFrozenRows(hr);
      if (hr >= 1) sh.getRange(1, 1, 1, maxc).setFontWeight('bold');
    }
    var usedR = Math.max(rows.length, 1), usedC = Math.max(maxc, 1);
    if (sh.getMaxRows() > usedR) sh.deleteRows(usedR + 1, sh.getMaxRows() - usedR);
    if (sh.getMaxColumns() > usedC) sh.deleteColumns(usedC + 1, sh.getMaxColumns() - usedC);
    if (spec.hidden || isSystem(spec.name)) sh.hideSheet();
    else { sh.showSheet(); order.push(spec.name); }
  });
  arrangeWorkbook(order);
}

function arrangeWorkbook(order) {
  var spread = ss(); order = order || [];
  pruneDefaultSheet(order);
  var pos = 1;
  order.forEach(function (name) {
    var sh = spread.getSheetByName(name);
    if (!sh) return;
    sh.showSheet(); spread.setActiveSheet(sh); spread.moveActiveSheet(pos++);
  });
  spread.getSheets().forEach(function (sh) {
    if (isSystem(sh.getName())) { try { sh.hideSheet(); } catch (e) {} }
  });
  ensureVisible();
}
function hideSystemSheets() { arrangeWorkbook(); }

function pruneDefaultSheet(order) {
  var spread = ss();
  var keep = {}; (order || []).forEach(function (n) { keep[n] = true; });
  var DEFAULTS = ['Hoja 1', 'Hoja1', 'Hoja de cálculo 1', 'Sheet1', 'Sheet', 'Sin título', 'Untitled'];
  spread.getSheets().forEach(function (sh) {
    var name = sh.getName();
    if (keep[name] || isSystem(name)) return;
    if (DEFAULTS.indexOf(name) === -1) return;
    if (sh.getLastRow() === 0 && sh.getLastColumn() === 0 && spread.getSheets().length > 1) {
      try { spread.deleteSheet(sh); } catch (e) {}
    }
  });
}
function ensureVisible() {
  var sheets = ss().getSheets();
  if (!sheets.length || sheets.some(function (sh) { return !sh.isSheetHidden(); })) return;
  var target = null;
  for (var i = 0; i < sheets.length; i++) { if (!isSystem(sheets[i].getName())) { target = sheets[i]; break; } }
  (target || sheets[0]).showSheet();
}
