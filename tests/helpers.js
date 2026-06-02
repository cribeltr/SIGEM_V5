'use strict';
const path = require('path');

const CORE = path.resolve(__dirname, '../src/core/hhha-core.js');
const SEED = path.resolve(__dirname, '../src/data/seed.clean.js');

// Devuelve una instancia FRESCA del núcleo (el núcleo guarda estado a nivel de
// módulo, así que limpiamos la caché de require para aislar cada test) con un
// almacenamiento en memoria propio y el seed limpio cargado y bootstrapeado.
function freshCore() {
  delete require.cache[require.resolve(CORE)];
  delete require.cache[require.resolve(SEED)];
  const HHHA = require(CORE);
  const seed = require(SEED);
  const mem = (() => {
    const m = {};
    return {
      getItem: k => (k in m ? m[k] : null),
      setItem: (k, v) => { m[k] = String(v); },
      removeItem: k => { delete m[k]; }
    };
  })();
  HHHA.configure({
    env: { storage: mem, compressor: null, xlsx: null },
    ui: { notify() {}, confirm() { return true; }, alert() {}, prompt() { return null; }, onChange() {} },
    identity: { user: 'tester@sigem' }
  });
  HHHA.setSeed(seed);
  HHHA.bootstrapDatos();
  return HHHA;
}

module.exports = { freshCore };
