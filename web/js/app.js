/* ============================================================================
 * SIGEM_V5 · Capa de presentación (React + htm, sin build)
 * ----------------------------------------------------------------------------
 * UI nueva, responsive, sobre el núcleo HHHA (lógica de negocio idéntica).
 * Persistencia: localStorage como caché + sincronización a Google Sheets vía
 * Apps Script (google.script.run) cuando la app se sirve desde la Web App.
 * NO contiene lógica de negocio: todo pasa por HHHA.*.
 * ==========================================================================*/
(function () {
  'use strict';
  const html = htm.bind(React.createElement);
  const { useState, useEffect, useMemo, useRef, useReducer, useCallback } = React;
  const h = React.createElement;

  // ---- Entorno Apps Script ------------------------------------------------
  const GAS = (typeof google !== 'undefined' && google.script && google.script.run) ? google.script.run : null;
  function gasRun(fn, arg) {
    return new Promise((resolve, reject) => {
      if (!GAS) return reject(new Error('no-gas'));
      GAS.withSuccessHandler(resolve).withFailureHandler(reject)[fn](arg);
    });
  }

  // ---- Estado global ligero (el state vive en HHHA) -----------------------
  let forceRoot = () => {};
  let lastServerUpdated = '';
  let toastFn = () => {};

  // ---- Catálogos de presentación -----------------------------------------
  const ESTADO_META = {
    operativo:           { label: 'Operativo',         dot: '#0f9d6b', chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
    no_operativo:        { label: 'No operativo',      dot: '#e0334b', chip: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' },
    en_servicio_tecnico: { label: 'En servicio técn.', dot: '#d98613', chip: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
    baja:                { label: 'Baja',              dot: '#6b7280', chip: 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
    desconocido:         { label: 'Desconocido',       dot: '#8a93a0', chip: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' }
  };
  const PEND_META = {
    no_iniciado: { label: 'No iniciado', chip: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
    en_proceso:  { label: 'En proceso',  chip: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
    cerrado:     { label: 'Resuelto',    chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' }
  };
  // Etapas del pipeline correctivo (kanban), en orden del ciclo.
  const ETAPAS = [
    { k: 'solicitado',  label: 'Solicitado',        tipos: ['Solicitud de trabajo'] },
    { k: 'visita',      label: 'Visita / Diagnóstico', tipos: ['Visita técnica'] },
    { k: 'cotizacion',  label: 'Cotización / OC',    tipos: ['Orden de Compra'] },
    { k: 'envio',       label: 'En servicio técnico', tipos: ['Envío a servicio técnico'] },
    { k: 'recepcion',   label: 'Recepción',          tipos: ['Recepción'] }
  ];
  const ETAPA_DOCS = {
    solicitado: ['Solicitud SIGEM con tarea cerrada', 'Informe visita diagnóstica'],
    visita: ['Informe visita diagnóstica', 'Cotización'],
    cotizacion: ['Cotización', 'Informe técnico trato directo', 'Orden de compra'],
    envio: ['Hoja de envío', 'Guía de despacho de repuestos'],
    recepcion: ['Guía de despacho de retorno', 'Informe técnico ST externo', 'Informe visita correctiva']
  };

  // ---- Helpers ------------------------------------------------------------
  const cx = (...a) => a.filter(Boolean).join(' ');
  const fmt = (d) => HHHA.fmtFecha(d);
  const hoy = () => HHHA.hoyLocal();
  function diasDetenido(c) { return HHHA.diasEntreFechas(c.fechaApertura, hoy()); }
  function estadoMeta(e) { return ESTADO_META[e] || ESTADO_META.desconocido; }
  function uniq(arr) { return Array.from(new Set(arr)); }
  function persistAndSync() { HHHA.save(); scheduleSync(); }

  // ---- Sincronización a Google Sheets (debounce) --------------------------
  let syncTimer = null, syncing = false;
  function scheduleSync() {
    if (!GAS) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(doSync, 1200);
  }
  async function doSync() {
    if (!GAS || syncing) return;
    syncing = true;
    try {
      const state = HHHA.getState();
      const payload = { dataB64: JSON.stringify(state), sheets: buildReadableSheets(state), baseUpdated: lastServerUpdated };
      const res = await gasRun('apiSave', payload);
      if (res && res.conflict) {
        toastFn('Otra sesión guardó cambios más nuevos. Recarga para no perder datos.', 'warn');
      } else if (res && res.updated) {
        lastServerUpdated = res.updated;
      }
    } catch (e) { /* offline: queda en localStorage */ }
    syncing = false;
  }

  // Cuaderno de operaciones (hojas legibles) para usar sin la app.
  function buildReadableSheets(state) {
    const year = new Date().getFullYear();
    const inv = [['N° Inv.', 'Equipo', 'Familia', 'Servicio', 'Estado', 'Días en estado', 'Encargado', 'VUR', 'Frecuencia']];
    state.equipos.forEach(e => inv.push([e.inv, e.equipo || '', e.fam || '', e.servicio || '', estadoMeta(e.estado).label, HHHA.diasEnEstado(e), HHHA.encargadoDe(e) || '', e.vur, e.freq || '']));
    const pend = [['ID', 'N° Inv.', 'Equipo', 'Tipo', 'Descripción', 'Responsable', 'Estado', 'Compromiso']];
    state.pendientes.filter(p => !p.anulado).forEach(p => pend.push([p.id, p.inv, p.equipo || '', (HHHA.TIPO_PENDIENTE[p.tipo] || p.tipo), p.desc || '', p.ejecutor || '', (HHHA.ESTADO_PEND_LABEL[p.estado] || p.estado), fmt(p.fechaComp)]));
    const bit = [Object.keys(HHHA.mapearEventoFila(state.eventos[0] || { id: '' }))];
    state.eventos.filter(e => !e.anulado && !HHHA.eventoEsAuto(e)).forEach(e => bit.push(Object.values(HHHA.mapearEventoFila(e))));
    const corr = [['N° Inv.', 'Equipo', 'Servicio', 'Apertura', 'Estado ciclo', 'Días', 'Encargado', 'Folio']];
    state.ciclos.forEach(c => { const eq = HHHA.findEquipo(c.inv) || {}; corr.push([c.inv, eq.equipo || '', eq.servicio || '', fmt(c.fechaApertura), c.estado, diasDetenido(c), c.ingenieroAsignado || '', c.folio || '']); });
    return [
      { name: 'Inventario', rows: inv },
      { name: 'Pendientes', rows: pend },
      { name: 'Bitácora', rows: bit },
      { name: 'Correctivos', rows: corr }
    ];
  }

  // ==========================================================================
  // UI KIT
  // ==========================================================================
  function Chip({ cls, children }) { return html`<span class=${cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', cls)}>${children}</span>`; }
  function EstadoChip({ estado }) { const m = estadoMeta(estado); return html`<${Chip} cls=${m.chip}><span class="inline-block h-1.5 w-1.5 rounded-full" style=${{ background: m.dot }}></span>${m.label}</${Chip}>`; }

  function Btn({ onClick, children, variant = 'default', size = 'md', className, ...rest }) {
    const v = {
      default: 'bg-brand text-white shadow-soft hover:bg-brand-2 active:scale-[.98] dark:bg-brand-3 dark:text-brand-ink dark:hover:bg-brand-dk',
      ghost: 'bg-transparent hover:bg-brand/10 text-slate-600 dark:text-slate-300 dark:hover:bg-white/5',
      outline: 'border border-slate-200 bg-white hover:border-brand/40 hover:bg-brand/5 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800',
      danger: 'bg-noop text-white hover:brightness-110'
    }[variant];
    const s = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-sm';
    return html`<button onClick=${onClick} class=${cx('inline-flex items-center justify-center gap-1.5 rounded-full font-semibold transition focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:opacity-50', v, s, className)} ...${rest}>${children}</button>`;
  }

  function Card({ children, className }) { return html`<div class=${cx('rounded-xl border border-slate-200 bg-white p-4 shadow-soft dark:border-ink-line dark:bg-ink-800', className)}>${children}</div>`; }

  const KPI_TONE = {
    red:   { num: 'text-noop',  ring: 'bg-noop/10 text-noop',   bar: 'bg-noop' },
    amber: { num: 'text-st',    ring: 'bg-st/10 text-st',       bar: 'bg-st' },
    green: { num: 'text-op',    ring: 'bg-op/10 text-op',       bar: 'bg-op' },
    blue:  { num: 'text-brand', ring: 'bg-brand/10 text-brand', bar: 'bg-brand' },
    slate: { num: 'text-slate-700 dark:text-slate-100', ring: 'bg-slate-100 text-slate-500 dark:bg-slate-800', bar: 'bg-slate-400' }
  };
  function KPI({ label, value, sub, tone, icon, spark, onClick }) {
    const t = KPI_TONE[tone] || KPI_TONE.slate;
    return html`<button onClick=${onClick} class=${cx('group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-3.5 text-left shadow-soft transition dark:border-ink-line dark:bg-ink-800', onClick && 'cursor-pointer hover:border-brand/50 hover:shadow-glow')}>
      <div class="flex items-start justify-between">
        <div class="text-[10px] font-semibold uppercase tracking-widest text-slate-400">${label}</div>
        ${icon && html`<span class=${cx('flex h-7 w-7 items-center justify-center rounded-lg text-sm', t.ring)}>${icon}</span>`}
      </div>
      <div class=${cx('mt-1.5 text-[28px] font-bold leading-none tracking-tight mono', t.num)}>${value}</div>
      ${sub && html`<div class="mt-1 text-[11px] text-slate-400">${sub}</div>`}
      ${spark && spark.length > 0 && html`<div class="mt-2 flex h-7 items-end gap-px" aria-hidden="true">
        ${spark.map((v, i) => html`<div key=${i} class=${cx('flex-1 rounded-sm', t.bar)} style=${{ height: Math.max(8, v) + '%', opacity: (0.3 + 0.7 * (i + 1) / spark.length).toFixed(2) }}></div>`)}
      </div>`}
      <span class=${cx('absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 transition group-hover:scale-x-100', t.bar)}></span>
    </button>`;
  }

  // Drawer lateral accesible (foco + ESC + ARIA)
  function Drawer({ open, onClose, title, children, width = 'max-w-xl' }) {
    const ref = useRef(null);
    useEffect(() => {
      if (!open) return;
      const onKey = (e) => { if (e.key === 'Escape') onClose(); };
      document.addEventListener('keydown', onKey);
      setTimeout(() => ref.current && ref.current.focus(), 50);
      return () => document.removeEventListener('keydown', onKey);
    }, [open]);
    if (!open) return null;
    return html`<div class="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label=${title}>
      <div data-overlay class="absolute inset-0 bg-black/40" onClick=${onClose}></div>
      <div data-drawer ref=${ref} tabindex="-1" class=${cx('absolute right-0 top-0 flex h-full w-full flex-col bg-white shadow-2xl outline-none dark:bg-slate-900', width)}>
        <div class="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <h2 class="text-base font-semibold">${title}</h2>
          <button onClick=${onClose} aria-label="Cerrar" class="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">✕</button>
        </div>
        <div class="scrollbar-thin flex-1 overflow-y-auto p-5">${children}</div>
      </div>
    </div>`;
  }

  function Field({ label, children, hint }) {
    return html`<label class="block">
      <div class="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">${label}</div>
      ${children}
      ${hint && html`<div class="mt-1 text-xs text-slate-400">${hint}</div>`}
    </label>`;
  }
  const inputCls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30 dark:border-slate-700 dark:bg-slate-800';
  function TextInput(p) { const { class: cls, className, ...rest } = p; return html`<input ...${rest} class=${cx(inputCls, cls, className)} />`; }
  function Select({ value, onChange, options, placeholder }) {
    return html`<select value=${value} onChange=${onChange} class=${inputCls}>
      ${placeholder && html`<option value="">${placeholder}</option>`}
      ${options.map(o => { const val = typeof o === 'string' ? o : o.value; const lab = typeof o === 'string' ? o : o.label; return html`<option key=${val} value=${val}>${lab}</option>`; })}
    </select>`;
  }

  function Empty({ icon = '∅', title, sub }) {
    return html`<div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 py-12 text-center dark:border-slate-700">
      <div class="text-3xl text-slate-300">${icon}</div>
      <div class="mt-2 font-medium text-slate-500">${title}</div>
      ${sub && html`<div class="mt-1 text-sm text-slate-400">${sub}</div>`}
    </div>`;
  }

  // ==========================================================================
  // DRAWERS de operación (MP, evento, pendiente, ficha)
  // ==========================================================================
  function RegistrarMPDrawer({ inv, onClose, onDone }) {
    const eq = HHHA.findEquipo(inv);
    const [f, setF] = useState({ fecha: hoy(), resultado: HHHA.getPref('ultimoResultadoMP', 'Si'), ejecutor: HHHA.getPref('ultimoEjecutor', ''), estadoSi: 'operativo', obs: '' });
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
    function guardar(forzar) {
      const r = HHHA.registrarMP({ inv, fecha: f.fecha, resultado: f.resultado, ejecutor: f.ejecutor, estadoSi: f.estadoSi, obs: f.obs, forzarSinProg: forzar });
      if (!r.ok && r.requiereConfirmacion) { if (confirm(r.aviso)) return guardar(true); return; }
      if (!r.ok) return toastFn(r.error, 'warn');
      scheduleSync(); toastFn('MP registrada', 'ok'); onDone && onDone(); onClose();
    }
    return html`<${Drawer} open=true onClose=${onClose} title=${'Registrar MP · ' + inv}>
      <div class="mb-3 text-sm text-slate-500">${eq && eq.equipo} — ${eq && eq.servicio}</div>
      <div class="space-y-3">
        <${Field} label="Fecha"><${TextInput} type="date" value=${f.fecha} onChange=${set('fecha')} /></${Field}>
        <${Field} label="Resultado"><${Select} value=${f.resultado} onChange=${set('resultado')} options=${['Si', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'FS', 'NU', 'Baja', 'No']} /></${Field}>
        ${f.resultado === 'Si' && html`<${Field} label="Estado tras MP"><${Select} value=${f.estadoSi} onChange=${set('estadoSi')} options=${['operativo', 'no operativo']} /></${Field}>`}
        ${/^C[1-8]$/.test(f.resultado) && html`<div class="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">${HHHA.CAUSALES[f.resultado].desc}. ${HHHA.CAUSALES[f.resultado].reprog30 ? 'Genera pendiente de reprogramación a 30 días.' : 'Genera pendiente (espera reintegro).'}</div>`}
        <${Field} label="Ejecutor"><${Select} value=${f.ejecutor} onChange=${set('ejecutor')} options=${HHHA.EJECUTORES} placeholder="Selecciona…" /></${Field}>
        <${Field} label="Observación"><textarea value=${f.obs} onChange=${set('obs')} rows="3" class=${inputCls}></textarea></${Field}>
        <div class="flex justify-end gap-2 pt-2"><${Btn} variant="outline" onClick=${onClose}>Cancelar</${Btn}><${Btn} onClick=${() => guardar(false)}>Registrar</${Btn}></div>
      </div>
    </${Drawer}>`;
  }

  const EVENTO_TIPOS = HHHA.TIPOS_EVENTO.map(t => t.label);
  function NuevoEventoDrawer({ inv, tipoInicial, onClose, onDone }) {
    const eq = HHHA.findEquipo(inv);
    const [f, setF] = useState({ tipo: tipoInicial || 'Solicitud de trabajo', fecha: hoy(), ejecutor: '', obs: '', estado: 'operativo', folio: '', nOC: '', nCotiz: '', nEnvio: '', empresa: '', tecnico: '', tipoVisita: 'correctiva' });
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
    const docs = HHHA.docsEsperadosEvento({ tipo: f.tipo });
    const cierra = (f.tipo === 'Reparación' || f.tipo === 'Recepción' || (f.tipo === 'Visita técnica' && f.tipoVisita === 'correctiva'));
    function guardar() {
      const d = { inv, tipo: f.tipo, fecha: f.fecha, ejecutor: f.ejecutor, obs: f.obs, folio: f.folio, nOC: f.nOC, nCotiz: f.nCotiz, nEnvio: f.nEnvio, empresa: f.empresa, tecnico: f.tecnico };
      if (f.tipo === 'Visita técnica') d.tipoVisita = f.tipoVisita;
      if (cierra) d.estado = f.estado;
      const r = HHHA.crearEvento(d);
      if (!r.ok) return toastFn(r.error, 'warn');
      scheduleSync(); toastFn('Evento registrado', 'ok'); onDone && onDone(); onClose();
    }
    return html`<${Drawer} open=true onClose=${onClose} title=${'Nuevo evento · ' + inv}>
      <div class="mb-3 text-sm text-slate-500">${eq && eq.equipo} — ${eq && eq.servicio}</div>
      <div class="space-y-3">
        <${Field} label="Tipo de evento"><${Select} value=${f.tipo} onChange=${set('tipo')} options=${EVENTO_TIPOS} /></${Field}>
        <${Field} label="Fecha"><${TextInput} type="date" value=${f.fecha} onChange=${set('fecha')} /></${Field}>
        ${f.tipo === 'Visita técnica' && html`<${Field} label="Tipo de visita"><${Select} value=${f.tipoVisita} onChange=${set('tipoVisita')} options=${['diagnostica', 'correctiva']} /></${Field}>`}
        ${cierra && html`<${Field} label="Estado del equipo tras el evento" hint="'operativo' cierra el ciclo correctivo."><${Select} value=${f.estado} onChange=${set('estado')} options=${['operativo', 'no operativo', 'en servicio técnico']} /></${Field}>`}
        <${Field} label="Ejecutor"><${Select} value=${f.ejecutor} onChange=${set('ejecutor')} options=${HHHA.EJECUTORES} placeholder="Selecciona…" /></${Field}>
        <div class="grid grid-cols-2 gap-3">
          <${Field} label="N° Folio / Informe"><${TextInput} value=${f.folio} onChange=${set('folio')} /></${Field}>
          ${f.tipo === 'Orden de Compra' && html`<${Field} label="N° OC"><${TextInput} value=${f.nOC} onChange=${set('nOC')} /></${Field}>`}
          ${(f.tipo === 'Orden de Compra' || f.tipo === 'Visita técnica') && html`<${Field} label="N° Cotización"><${TextInput} value=${f.nCotiz} onChange=${set('nCotiz')} /></${Field}>`}
          ${f.tipo === 'Envío a servicio técnico' && html`<${Field} label="N° Envío"><${TextInput} value=${f.nEnvio} onChange=${set('nEnvio')} /></${Field}>`}
        </div>
        <div class="grid grid-cols-2 gap-3">
          <${Field} label="Empresa"><${TextInput} value=${f.empresa} onChange=${set('empresa')} /></${Field}>
          <${Field} label="Técnico"><${TextInput} value=${f.tecnico} onChange=${set('tecnico')} /></${Field}>
        </div>
        <${Field} label="Observación"><textarea value=${f.obs} onChange=${set('obs')} rows="2" class=${inputCls}></textarea></${Field}>
        ${docs.length > 0 && html`<div class="rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800/60">
          <div class="mb-1 font-medium text-slate-500">Documentos esperados</div>
          <ul class="list-disc pl-4 text-slate-500">${docs.map(d => html`<li key=${d}>${d}</li>`)}</ul>
        </div>`}
        <div class="flex justify-end gap-2 pt-2"><${Btn} variant="outline" onClick=${onClose}>Cancelar</${Btn}><${Btn} onClick=${guardar}>Registrar evento</${Btn}></div>
      </div>
    </${Drawer}>`;
  }

  function NuevoPendienteDrawer({ inv, onClose, onDone }) {
    const [f, setF] = useState({ inv: inv || '', tipo: 'gestion_general', desc: '', ejecutor: '', fechaComp: '' });
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
    function guardar() {
      const r = HHHA.crearPendiente({ inv: f.inv, tipo: f.tipo, desc: f.desc, ejecutor: f.ejecutor, fechaComp: f.fechaComp });
      if (!r.ok) return toastFn(r.error, 'warn');
      scheduleSync(); toastFn('Pendiente creado', 'ok'); onDone && onDone(); onClose();
    }
    return html`<${Drawer} open=true onClose=${onClose} title="Nuevo pendiente">
      <div class="space-y-3">
        <${Field} label="N° Inventario"><${TextInput} value=${f.inv} onChange=${set('inv')} placeholder="2-XXXXXX" /></${Field}>
        <${Field} label="Tipo"><${Select} value=${f.tipo} onChange=${set('tipo')} options=${Object.entries(HHHA.TIPO_PENDIENTE).map(([value, label]) => ({ value, label }))} /></${Field}>
        <${Field} label="Descripción"><textarea value=${f.desc} onChange=${set('desc')} rows="3" class=${inputCls}></textarea></${Field}>
        <${Field} label="Responsable"><${Select} value=${f.ejecutor} onChange=${set('ejecutor')} options=${HHHA.EJECUTORES} placeholder="Sin asignar" /></${Field}>
        <${Field} label="Fecha compromiso"><${TextInput} type="date" value=${f.fechaComp} onChange=${set('fechaComp')} /></${Field}>
        <div class="flex justify-end gap-2 pt-2"><${Btn} variant="outline" onClick=${onClose}>Cancelar</${Btn}><${Btn} onClick=${guardar}>Crear</${Btn}></div>
      </div>
    </${Drawer}>`;
  }

  function PendienteDrawer({ pend, onClose, onDone }) {
    const [, bump] = useReducer(x => x + 1, 0);
    const [seg, setSeg] = useState('');
    const [tarea, setTarea] = useState('');
    const tareas = HHHA.getState().tareas.filter(t => t.pendId === pend.id);
    function save(cambios) { HHHA.actualizarPendiente(pend, { tipo: pend.tipo, estado: pend.estado, ejecutor: pend.ejecutor, desc: pend.desc, fechaComp: pend.fechaComp, proxRecord: pend.proxRecord, ...cambios }); scheduleSync(); bump(); onDone && onDone(); }
    return html`<${Drawer} open=true onClose=${onClose} title=${'Pendiente #' + pend.id}>
      <div class="space-y-4">
        <div class="text-sm"><span class="text-slate-400">Equipo</span> · ${pend.inv} ${pend.equipo}</div>
        <div class="grid grid-cols-2 gap-3">
          <${Field} label="Estado"><${Select} value=${pend.estado} onChange=${e => save({ estado: e.target.value })} options=${Object.entries(HHHA.ESTADO_PEND_LABEL).map(([value, label]) => ({ value, label }))} /></${Field}>
          <${Field} label="Responsable"><${Select} value=${pend.ejecutor || ''} onChange=${e => save({ ejecutor: e.target.value })} options=${HHHA.EJECUTORES} placeholder="Sin asignar" /></${Field}>
        </div>
        <${Field} label="Descripción"><textarea defaultValue=${pend.desc} onBlur=${e => save({ desc: e.target.value })} rows="2" class=${inputCls}></textarea></${Field}>
        <${Field} label="Fecha compromiso"><${TextInput} type="date" value=${pend.fechaComp || ''} onChange=${e => save({ fechaComp: e.target.value })} /></${Field}>

        <div>
          <div class="mb-1.5 text-xs font-medium text-slate-500">Tareas atómicas</div>
          <div class="space-y-1.5">
            ${tareas.map(t => html`<label key=${t.id} class="flex items-center gap-2 text-sm">
              <input type="checkbox" checked=${t.estado === 'cerrado'} onChange=${e => { const r = HHHA.toggleTarea(t, e.target.checked); scheduleSync(); if (r.todasCerradas) toastFn('Todas las tareas cerradas', 'ok'); bump(); }} />
              <span class=${t.estado === 'cerrado' ? 'line-through text-slate-400' : ''}>${t.desc}</span>
            </label>`)}
            ${tareas.length === 0 && html`<div class="text-xs text-slate-400">Sin tareas.</div>`}
          </div>
          <div class="mt-2 flex gap-2">
            <${TextInput} value=${tarea} onChange=${e => setTarea(e.target.value)} placeholder="Nueva tarea…" />
            <${Btn} size="sm" onClick=${() => { if (!tarea.trim()) return; HHHA.agregarTareaPendiente(pend, tarea); scheduleSync(); setTarea(''); bump(); }}>Añadir</${Btn}>
          </div>
        </div>

        <div>
          <div class="mb-1.5 text-xs font-medium text-slate-500">Seguimientos</div>
          <div class="space-y-1.5 text-sm">
            ${(pend.seguimientos || []).map((s, i) => html`<div key=${i} class="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60"><span class="text-xs text-slate-400">${fmt(s.fecha)} · ${s.autor}</span><div>${s.texto}</div></div>`)}
          </div>
          <div class="mt-2 flex gap-2">
            <${TextInput} value=${seg} onChange=${e => setSeg(e.target.value)} placeholder="Agregar seguimiento…" />
            <${Btn} size="sm" onClick=${() => { if (!seg.trim()) return; HHHA.agregarSeguimiento(pend, seg); scheduleSync(); setSeg(''); bump(); }}>Añadir</${Btn}>
          </div>
        </div>

        <div class="flex justify-between gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
          <${Btn} variant="ghost" onClick=${() => { if (confirm('¿Anular pendiente?')) { HHHA.anularPendiente(pend); scheduleSync(); onDone && onDone(); onClose(); } }}>Anular</${Btn}>
          ${pend.estado !== 'cerrado' && html`<${Btn} onClick=${() => { HHHA.cerrarPendiente(pend, ''); scheduleSync(); onDone && onDone(); onClose(); }}>Resolver</${Btn}>`}
        </div>
      </div>
    </${Drawer}>`;
  }

  // ---- Ficha de equipo (7 pestañas) --------------------------------------
  function FichaEquipo({ inv, onClose, openDrawer }) {
    const [tab, setTab] = useState('resumen');
    const [, bump] = useReducer(x => x + 1, 0);
    const eq = HHHA.findEquipo(inv);
    if (!eq) return null;
    const tabs = [['resumen', 'Resumen'], ['matriz', 'Matriz MP'], ['bitacora', 'Bitácora'], ['ciclos', 'Ciclos'], ['pendientes', 'Pendientes'], ['conflictos', 'Conflictos'], ['auditoria', 'Auditoría']];
    const refresh = () => bump();
    return html`<${Drawer} open=true onClose=${onClose} title=${eq.inv} width="max-w-3xl">
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <${EstadoChip} estado=${eq.estado} />
        <div class="text-lg font-semibold">${eq.equipo}</div>
        <div class="text-sm text-slate-400">${eq.fam} · ${eq.servicio}</div>
        ${eq.vur < 0 && html`<${Chip} cls="bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">Fuera de vida útil</${Chip}>`}
      </div>
      <div class="mb-4 flex flex-wrap gap-2">
        <${Btn} size="sm" onClick=${() => openDrawer({ type: 'mp', inv, onDone: refresh })}>MP rápida</${Btn}>
        <${Btn} size="sm" variant="outline" onClick=${() => openDrawer({ type: 'evento', inv, onDone: refresh })}>Nuevo evento</${Btn}>
        <${Btn} size="sm" variant="outline" onClick=${() => openDrawer({ type: 'pendiente', inv, onDone: refresh })}>Pendiente</${Btn}>
        ${eq.estado !== 'baja' && html`<${Btn} size="sm" variant="ghost" onClick=${() => { const m = prompt('Motivo de baja:'); if (m) { HHHA.darDeBaja(eq, m); scheduleSync(); refresh(); } }}>Dar de baja</${Btn}>`}
      </div>
      <div class="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
        ${tabs.map(([k, l]) => html`<button key=${k} onClick=${() => setTab(k)} class=${cx('whitespace-nowrap px-3 py-2 text-sm font-medium border-b-2 -mb-px', tab === k ? 'border-brand text-brand' : 'border-transparent text-slate-500 hover:text-slate-700')}>${l}</button>`)}
      </div>
      ${tab === 'resumen' && h(FichaResumen, { eq, refresh })}
      ${tab === 'matriz' && h(FichaMatriz, { eq, openDrawer, refresh })}
      ${tab === 'bitacora' && h(FichaBitacora, { eq, refresh })}
      ${tab === 'ciclos' && h(FichaCiclos, { eq })}
      ${tab === 'pendientes' && h(FichaPendientes, { eq, openDrawer })}
      ${tab === 'conflictos' && h(FichaConflictos, { eq })}
      ${tab === 'auditoria' && h(FichaAuditoria, { eq })}
    </${Drawer}>`;
  }

  function FichaResumen({ eq, refresh }) {
    const [nota, setNota] = useState('');
    const campos = [['Marca', eq.marca], ['Modelo', eq.modelo], ['Serie', eq.serie], ['Año', eq.ano], ['VUR', eq.vur], ['Ubicación', eq.ubic], ['Unidad', eq.unidad], ['Procedencia', eq.proc], ['Clasificación', eq.clasif], ['Frecuencia', eq.freq], ['Encargado', HHHA.encargadoDe(eq) || '—'], ['Días en estado', HHHA.diasEnEstado(eq)]];
    return html`<div class="space-y-4">
      <div class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        ${campos.map(([k, v]) => html`<div key=${k}><div class="text-xs text-slate-400">${k}</div><div class="mono">${v == null || v === '' ? '—' : v}</div></div>`)}
      </div>
      <div>
        <div class="mb-1.5 text-xs font-medium text-slate-500">Notas</div>
        ${HHHA.notasDe(eq).map((n, i) => html`<div key=${i} class="mb-1 rounded-lg bg-slate-50 p-2 text-sm dark:bg-slate-800/60"><span class="text-xs text-slate-400">${fmt(n.fecha)} · ${n.autor}</span><div>${n.texto}</div></div>`)}
        <div class="mt-2 flex gap-2">
          <${TextInput} value=${nota} onChange=${e => setNota(e.target.value)} placeholder="Agregar nota…" />
          <${Btn} size="sm" onClick=${() => { if (HHHA.agregarNotaEquipo(eq, nota)) { persistAndSync(); setNota(''); refresh(); } }}>Añadir</${Btn}>
        </div>
      </div>
    </div>`;
  }

  function FichaMatriz({ eq, openDrawer, refresh }) {
    const year = new Date().getFullYear();
    return html`<div class="overflow-x-auto">
      <table class="w-full text-center text-xs">
        <thead><tr class="text-slate-400">${HHHA.MESES.map(m => html`<th key=${m} class="px-1 py-1 font-medium">${m}</th>`)}</tr></thead>
        <tbody><tr>
          ${HHHA.MESES.map((m, idx) => {
            const prog = (eq.prog || {})[m];
            const r = (eq.registro || {})[m] || {};
            const clase = HHHA.claseMPMes(eq, year, idx);
            const bg = { oficial: 'bg-emerald-100 dark:bg-emerald-950', borrador: 'bg-emerald-50 dark:bg-emerald-950/40', reprog: 'bg-amber-100 dark:bg-amber-950', otro: 'bg-red-100 dark:bg-red-950', noreg: 'bg-slate-100 dark:bg-slate-800', '': '' }[clase || ''] || '';
            return html`<td key=${m} class=${cx('cursor-pointer border border-slate-200 p-1.5 dark:border-slate-800', bg)} title=${'Click para registrar MP en ' + m} onClick=${() => openDrawer({ type: 'mp', inv: eq.inv, onDone: refresh })}>
              <div class="font-semibold">${prog || '·'}</div>
              <div class="text-[10px] text-slate-500">${r.R || ''}</div>
            </td>`;
          })}
        </tr></tbody>
      </table>
      <div class="mt-2 text-[11px] text-slate-400">Fila superior: programado (P) · inferior: realizado (R). Verde=ejecutada, ámbar=reprogramada, rojo=FS/NU/Baja. Click en una celda para registrar MP.</div>
    </div>`;
  }

  function FichaBitacora({ eq, refresh }) {
    const evs = HHHA.eventosDeTodos(eq.inv).slice().reverse();
    if (!evs.length) return h(Empty, { title: 'Sin eventos' });
    return html`<div class="space-y-2">${evs.map(ev => html`<div key=${ev.id} class=${cx('rounded-lg border p-3 text-sm dark:border-slate-800', ev.anulado ? 'border-slate-200 opacity-50' : 'border-slate-200')}>
      <div class="flex items-center justify-between">
        <div class="font-medium">${HHHA.etiquetaTipoEvento(ev)} ${ev.resultado ? html`<span class="text-slate-400">· ${ev.resultado}</span>` : ''}</div>
        <div class="text-xs text-slate-400">${fmt(ev.fecha)}</div>
      </div>
      <div class="mt-0.5 text-xs text-slate-500">${ev.ejecutor || '—'} ${ev.folio ? '· Folio ' + ev.folio : ''} ${ev.oficial === 'Sí' ? '· Oficial' : '· Borrador'}</div>
      ${ev.obs && html`<div class="mt-1 text-xs text-slate-500">${ev.obs}</div>`}
      ${!ev.anulado && html`<div class="mt-2 flex gap-2">
        ${ev.oficial !== 'Sí' && html`<${Btn} size="sm" variant="ghost" onClick=${() => { HHHA.oficializarEvento(ev); scheduleSync(); refresh(); }}>Oficializar</${Btn}>`}
        <${Btn} size="sm" variant="ghost" onClick=${() => { const m = prompt('Motivo de anulación:'); if (m) { const r = HHHA.anularEvento(ev, m); scheduleSync(); toastFn('Anulado. Revertido: ' + (r.revertidos.join(', ') || 'sin efectos'), 'ok'); refresh(); } }}>Anular</${Btn}>
      </div>`}
      ${ev.anulado && html`<div class="mt-1 text-xs text-red-400">Anulado: ${ev.motivoAnulacion || ''}</div>`}
    </div>`)}</div>`;
  }

  function FichaCiclos({ eq }) {
    const ciclos = HHHA.ciclosDe(eq.inv);
    if (!ciclos.length) return h(Empty, { title: 'Sin ciclos correctivos' });
    return html`<div class="space-y-2">${ciclos.map(c => html`<div key=${c.id} class="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
      <div class="flex items-center justify-between"><div class="font-medium">${c.folio || 'Sin folio'}</div><${Chip} cls=${c.estado === 'abierto' ? 'bg-amber-100 text-amber-700' : c.estado === 'anulado' ? 'bg-slate-200 text-slate-500' : 'bg-emerald-100 text-emerald-700'}>${c.estado}</${Chip}></div>
      <div class="mt-0.5 text-xs text-slate-500">Apertura ${fmt(c.fechaApertura)} ${c.fechaCierre ? '· Cierre ' + fmt(c.fechaCierre) : '· ' + diasDetenido(c) + ' días'} · ${c.ingenieroAsignado || 'sin asignar'}</div>
      ${c.descripcionInicial && html`<div class="mt-1 text-xs text-slate-500">${c.descripcionInicial}</div>`}
    </div>`)}</div>`;
  }
  function FichaPendientes({ eq, openDrawer }) {
    const pends = HHHA.pendientesDe(eq.inv);
    if (!pends.length) return h(Empty, { title: 'Sin pendientes' });
    return html`<div class="space-y-2">${pends.map(p => html`<button key=${p.id} onClick=${() => openDrawer({ type: 'pendiente', pend: p })} class="block w-full rounded-lg border border-slate-200 p-3 text-left text-sm hover:border-brand/50 dark:border-slate-800">
      <div class="flex items-center justify-between"><span class="font-medium">${HHHA.TIPO_PENDIENTE[p.tipo] || p.tipo}</span><${Chip} cls=${PEND_META[p.estado].chip}>${PEND_META[p.estado].label}</${Chip}></div>
      <div class="mt-0.5 text-xs text-slate-500">${p.desc}</div>
    </button>`)}</div>`;
  }
  function FichaConflictos({ eq }) {
    const cs = HHHA.conflictosDe(eq.inv);
    if (!cs.length) return h(Empty, { title: 'Sin conflictos de conciliación' });
    return html`<div class="space-y-2">${cs.map(c => html`<div key=${c.id} class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
      <div class="font-medium">${HHHA.nombreCampoConflicto(c)}</div>
      <div class="text-xs text-slate-500">Programa: ${c.valorPrograma || '—'} · Maestro: ${c.valorMaestro || '—'}</div>
    </div>`)}</div>`;
  }
  function FichaAuditoria({ eq }) {
    const aud = HHHA.getState().audit.filter(a => (a.entidad === 'equipo' && a.idEnt === eq.inv) || (a.entidad === 'evento' && HHHA.getState().eventos.find(e => e.id === a.idEnt && e.inv === eq.inv))).slice().reverse();
    if (!aud.length) return h(Empty, { title: 'Sin registros de auditoría' });
    return html`<div class="space-y-1 text-xs">${aud.map(a => html`<div key=${a.id} class="flex justify-between rounded bg-slate-50 px-2 py-1.5 dark:bg-slate-800/60">
      <span>${a.entidad} · ${a.campo}: <span class="text-slate-400">${a.valorAnterior ?? '—'}</span> → ${a.valorNuevo ?? '—'}</span>
      <span class="text-slate-400">${fmt((a.ts || '').slice(0, 10))} · ${a.usuario}</span>
    </div>`)}</div>`;
  }

  // ==========================================================================
  // VISTAS
  // ==========================================================================
  // ---- Cola de trabajo ----------------------------------------------------
  function ColaTrabajo({ go, openFicha, openDrawer }) {
    const S = HHHA.getState();
    const now = new Date(), year = now.getFullYear(), mes = now.getMonth();
    const caidos = S.equipos.filter(e => e.estado === 'no_operativo' || e.estado === 'en_servicio_tecnico');
    const masTreinta = caidos.filter(e => HHHA.diasEnEstado(e) > 30);
    const fueraVU = S.equipos.filter(e => typeof e.vur === 'number' && e.vur < 0 && e.estado !== 'baja');
    const pendVenc = S.pendientes.filter(p => !p.anulado && p.estado !== 'cerrado' && p.fechaComp && HHHA.diasEntreFechas(p.fechaComp, hoy()) > 0);
    const reprogs = S.pendientes.filter(p => !p.anulado && p.estado !== 'cerrado' && p.tipo === 'reprogramacion');
    const conflictos = (S.conflictos || []).filter(c => c.estado === 'pendiente');
    const progMes = S.equipos.filter(e => e.estado !== 'baja' && HHHA.mpProgramadaEnMes(e, HHHA.NUM_MES[mes]));
    const ejecMes = progMes.filter(e => HHHA.mpDelMesEjecutada(e, year, mes));
    const pctMes = progMes.length ? Math.round(ejecMes.length / progMes.length * 100) : 100;
    // Tendencia mensual de cumplimiento MP (para el sparkline del tile).
    const trendMP = HHHA.MESES.map((m, idx) => {
      let prog = 0, ej = 0;
      S.equipos.forEach(e => { if (e.estado !== 'baja' && HHHA.mpProgramadaEnMes(e, m)) { prog++; if (HHHA.mpDelMesEjecutada(e, year, idx)) ej++; } });
      return prog ? Math.round(ej / prog * 100) : 0;
    });

    return html`<div class="space-y-6">
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <${KPI} label="No operativos / ST" value=${caidos.length} tone="red" icon="⚠" onClick=${() => go('correctivos')} sub="Pipeline correctivo" />
        <${KPI} label="Detenidos >30 días" value=${masTreinta.length} tone="red" icon="⏱" onClick=${() => go('correctivos')} />
        <${KPI} label="Fuera de vida útil" value=${fueraVU.length} tone="amber" icon="⧗" onClick=${() => go('equipos', { vur: true })} sub="vur < 0" />
        <${KPI} label="Pendientes vencidos" value=${pendVenc.length} tone="amber" icon="☑" onClick=${() => go('pendientes', { vencidos: true })} />
        <${KPI} label="Reprogramaciones" value=${reprogs.length} tone="blue" icon="↻" onClick=${() => go('pendientes', { tipo: 'reprogramacion' })} />
        <${KPI} label=${'MP ' + HHHA.MES_ESPANOL[HHHA.NUM_MES[mes]]} value=${pctMes + '%'} tone=${pctMes >= 80 ? 'green' : 'amber'} icon="◷" spark=${trendMP} onClick=${() => go('mpmes')} sub=${ejecMes.length + '/' + progMes.length} />
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <${Card}>
          <div class="mb-2 flex items-center justify-between"><h3 class="font-semibold">Equipos caídos prioritarios</h3><${Btn} size="sm" variant="ghost" onClick=${() => go('correctivos')}>Ver pipeline →</${Btn}></div>
          ${caidos.length === 0 ? h(Empty, { title: 'Todo operativo 🎉' }) : html`<div class="space-y-1.5">
            ${caidos.slice().sort((a, b) => HHHA.diasEnEstado(b) - HHHA.diasEnEstado(a)).slice(0, 6).map(e => html`<button key=${e.inv} onClick=${() => openFicha(e.inv)} class="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:border-brand/50 dark:border-slate-800">
              <span class="truncate"><span class="mono text-slate-400">${e.inv}</span> ${e.equipo}</span>
              <span class="flex items-center gap-2"><${EstadoChip} estado=${e.estado} /><span class=${cx('mono text-xs', HHHA.diasEnEstado(e) > 30 ? 'text-red-500' : 'text-slate-400')}>${HHHA.diasEnEstado(e)}d</span></span>
            </button>`)}
          </div>`}
        </${Card}>
        <${Card}>
          <div class="mb-2 flex items-center justify-between"><h3 class="font-semibold">Pendientes accionables</h3><${Btn} size="sm" variant="ghost" onClick=${() => go('pendientes')}>Ver todos →</${Btn}></div>
          ${pendVenc.length === 0 ? h(Empty, { title: 'Sin vencidos' }) : html`<div class="space-y-1.5">
            ${pendVenc.slice(0, 6).map(p => html`<button key=${p.id} onClick=${() => openDrawer({ type: 'pendiente', pend: p })} class="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:border-brand/50 dark:border-slate-800">
              <span class="truncate">${p.equipo} · ${p.desc}</span>
              <span class="mono text-xs text-red-500">+${HHHA.diasEntreFechas(p.fechaComp, hoy())}d</span>
            </button>`)}
          </div>`}
        </${Card}>
      </div>
      ${conflictos.length > 0 && html`<${Card} className="border-amber-300 bg-amber-50 dark:bg-amber-950/30">
        <div class="flex items-center justify-between"><span class="text-sm">⚠️ ${conflictos.length} conflictos de conciliación sin resolver</span><${Btn} size="sm" onClick=${() => go('conciliacion')}>Resolver</${Btn}></div>
      </${Card}>`}
    </div>`;
  }

  // ---- Kanban correctivos (PROTAGONISTA) ----------------------------------
  function etapaDeCiclo(c) {
    const evs = HHHA.getState().eventos.filter(e => !e.anulado && (c.folio ? e.folio === c.folio : e.inv === c.inv));
    let etapa = 'solicitado';
    evs.forEach(e => { ETAPAS.forEach(et => { if (et.tipos.includes(e.tipo)) etapa = et.k; }); });
    return etapa;
  }
  function Correctivos({ openFicha, openDrawer }) {
    const ciclos = HHHA.getState().ciclos.filter(c => c.estado === 'abierto');
    const cerrados = HHHA.getState().ciclos.filter(c => c.estado === 'cerrado').slice(-8).reverse();
    const porEtapa = {}; ETAPAS.forEach(e => porEtapa[e.k] = []);
    ciclos.forEach(c => { (porEtapa[etapaDeCiclo(c)] = porEtapa[etapaDeCiclo(c)] || []).push(c); });
    return html`<div class="space-y-4">
      <div class="flex items-center justify-between">
        <div><h2 class="text-lg font-semibold">Pipeline de correctivos</h2><p class="text-sm text-slate-400">${ciclos.length} equipos en reparación · sigue el ciclo de izquierda a derecha</p></div>
        <${Btn} size="sm" onClick=${() => openDrawer({ type: 'evento', tipoInicial: 'Solicitud de trabajo' })}>+ Abrir caso</${Btn}>
      </div>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        ${ETAPAS.map(et => html`<div key=${et.k} class="rounded-xl bg-slate-100/70 p-2 dark:bg-slate-900/60">
          <div class="mb-2 flex items-center justify-between px-1"><span class="text-sm font-semibold">${et.label}</span><span class="mono rounded-full bg-white px-2 text-xs text-slate-500 dark:bg-slate-800">${porEtapa[et.k].length}</span></div>
          <div class="space-y-2">
            ${porEtapa[et.k].length === 0 ? html`<div class="rounded-lg border border-dashed border-slate-300 py-4 text-center text-xs text-slate-400 dark:border-slate-700">—</div>` :
              porEtapa[et.k].map(c => { const eq = HHHA.findEquipo(c.inv) || {}; const dd = diasDetenido(c); return html`<div key=${c.id} class="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div class="flex items-start justify-between gap-2">
                  <button onClick=${() => openFicha(c.inv)} class="text-left"><div class="text-sm font-medium leading-tight">${eq.equipo || c.inv}</div><div class="mono text-xs text-slate-400">${c.inv}</div></button>
                  <span class=${cx('mono rounded px-1.5 py-0.5 text-[11px] font-semibold', dd > 30 ? 'bg-red-100 text-red-600 dark:bg-red-950' : 'bg-slate-100 text-slate-500 dark:bg-slate-800')}>${dd}d</span>
                </div>
                <div class="mt-1 truncate text-xs text-slate-500">${eq.servicio || ''}</div>
                <div class="mt-1 text-xs text-slate-400">${c.ingenieroAsignado || 'Sin asignar'}</div>
                <div class="mt-2 flex items-center gap-1">
                  <${Btn} size="sm" variant="outline" className="flex-1" onClick=${() => openDrawer({ type: 'evento', inv: c.inv })}>Avanzar</${Btn}>
                </div>
                <details class="mt-1.5"><summary class="cursor-pointer text-[11px] text-slate-400">Docs etapa</summary><ul class="mt-1 list-disc pl-4 text-[11px] text-slate-400">${(ETAPA_DOCS[et.k] || []).map(d => html`<li key=${d}>${d}</li>`)}</ul></details>
              </div>`; })}
          </div>
        </div>`)}
      </div>
      ${cerrados.length > 0 && html`<${Card}>
        <h3 class="mb-2 text-sm font-semibold text-slate-500">Cerrados recientemente</h3>
        <div class="flex flex-wrap gap-2">${cerrados.map(c => { const eq = HHHA.findEquipo(c.inv) || {}; return html`<button key=${c.id} onClick=${() => openFicha(c.inv)} class="rounded-lg border border-slate-200 px-2.5 py-1 text-xs hover:border-brand/50 dark:border-slate-800"><span class="mono text-slate-400">${c.inv}</span> ${eq.equipo || ''} ✓</button>`; })}</div>
      </${Card}>`}
    </div>`;
  }

  // ---- Equipos ------------------------------------------------------------
  function Equipos({ filtro0, openFicha }) {
    const S = HHHA.getState();
    const [q, setQ] = useState('');
    const [fEstado, setFEstado] = useState('');
    const [fFam, setFFam] = useState('');
    const [fServ, setFServ] = useState('');
    const [soloVU, setSoloVU] = useState(!!(filtro0 && filtro0.vur));
    const fams = useMemo(() => uniq(S.equipos.map(e => e.fam).filter(Boolean)).sort(), []);
    const servs = useMemo(() => uniq(S.equipos.map(e => e.servicio).filter(Boolean)).sort(), []);
    const list = S.equipos.filter(e => {
      if (fEstado && e.estado !== fEstado) return false;
      if (fFam && e.fam !== fFam) return false;
      if (fServ && e.servicio !== fServ) return false;
      if (soloVU && !(typeof e.vur === 'number' && e.vur < 0)) return false;
      if (q) { const s = (e.inv + ' ' + e.equipo + ' ' + e.marca + ' ' + e.modelo + ' ' + e.serie).toLowerCase(); if (!s.includes(q.toLowerCase())) return false; }
      return true;
    });
    function exportar() {
      const aoa = [['Inv', 'Equipo', 'Familia', 'Servicio', 'Estado', 'VUR', 'Encargado']];
      list.forEach(e => aoa.push([e.inv, e.equipo, e.fam, e.servicio, estadoMeta(e.estado).label, e.vur, HHHA.encargadoDe(e) || '']));
      descargarXLSX(aoa, 'equipos.xlsx', 'Equipos');
    }
    return html`<div class="space-y-3">
      <div class="flex flex-wrap items-center gap-2">
        <${TextInput} value=${q} onChange=${e => setQ(e.target.value)} placeholder="Buscar inv, equipo, marca…" class="max-w-xs" />
        <${Select} value=${fEstado} onChange=${e => setFEstado(e.target.value)} options=${HHHA.ESTADOS_PRIMARIOS.map(s => ({ value: s, label: estadoMeta(s).label }))} placeholder="Estado" />
        <${Select} value=${fFam} onChange=${e => setFFam(e.target.value)} options=${fams} placeholder="Familia" />
        <${Select} value=${fServ} onChange=${e => setFServ(e.target.value)} options=${servs} placeholder="Servicio" />
        <label class="flex items-center gap-1.5 text-sm text-slate-500"><input type="checkbox" checked=${soloVU} onChange=${e => setSoloVU(e.target.checked)} /> Fuera de vida útil</label>
        <div class="ml-auto flex items-center gap-2"><span class="mono text-sm text-slate-400">${list.length}</span><${Btn} size="sm" variant="outline" onClick=${exportar}>Exportar</${Btn}></div>
      </div>
      <!-- Tabla en escritorio -->
      <div class="hidden overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 md:block">
        <table class="w-full text-sm">
          <thead class="sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-400 dark:bg-slate-900"><tr>
            <th class="px-3 py-2">Inv</th><th class="px-3 py-2">Equipo</th><th class="px-3 py-2">Familia</th><th class="px-3 py-2">Servicio</th><th class="px-3 py-2">Estado</th><th class="px-3 py-2">Pend.</th></tr></thead>
          <tbody>${list.slice(0, 400).map(e => html`<tr key=${e.inv} onClick=${() => openFicha(e.inv)} class="cursor-pointer border-t border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
            <td class="px-3 py-1.5 mono text-slate-400">${e.inv}</td>
            <td class="px-3 py-1.5">${e.equipo}${e.vur < 0 ? html` <span class="text-[10px] text-red-500">VU</span>` : ''}</td>
            <td class="px-3 py-1.5 text-slate-500">${e.fam}</td>
            <td class="px-3 py-1.5 text-slate-500">${e.servicio}</td>
            <td class="px-3 py-1.5"><${EstadoChip} estado=${e.estado} /></td>
            <td class="px-3 py-1.5 mono text-slate-400">${HHHA.pendientesDe(e.inv).filter(p => p.estado !== 'cerrado').length || ''}</td>
          </tr>`)}</tbody>
        </table>
        ${list.length > 400 && html`<div class="px-3 py-2 text-center text-xs text-slate-400">Mostrando 400 de ${list.length}. Refina la búsqueda.</div>`}
      </div>
      <!-- Tarjetas en móvil -->
      <div class="space-y-2 md:hidden">${list.slice(0, 100).map(e => html`<button key=${e.inv} onClick=${() => openFicha(e.inv)} class="block w-full rounded-xl border border-slate-200 p-3 text-left dark:border-slate-800">
        <div class="flex items-center justify-between"><span class="mono text-xs text-slate-400">${e.inv}</span><${EstadoChip} estado=${e.estado} /></div>
        <div class="mt-0.5 font-medium">${e.equipo}</div><div class="text-xs text-slate-500">${e.fam} · ${e.servicio}</div>
      </button>`)}</div>
    </div>`;
  }

  // ---- Pendientes ---------------------------------------------------------
  function Pendientes({ filtro0, openDrawer }) {
    const S = HHHA.getState();
    const [fResp, setFResp] = useState('');
    const [soloVenc, setSoloVenc] = useState(!!(filtro0 && filtro0.vencidos));
    const [fTipo, setFTipo] = useState((filtro0 && filtro0.tipo) || '');
    let list = S.pendientes.filter(p => !p.anulado);
    if (fResp) list = list.filter(p => (p.ejecutor || '(Sin asignar)') === fResp);
    if (fTipo) list = list.filter(p => p.tipo === fTipo);
    if (soloVenc) list = list.filter(p => p.estado !== 'cerrado' && p.fechaComp && HHHA.diasEntreFechas(p.fechaComp, hoy()) > 0);
    list = list.slice().sort((a, b) => (a.fechaComp || '9999').localeCompare(b.fechaComp || '9999'));
    const carga = {};
    S.pendientes.filter(p => !p.anulado && p.estado !== 'cerrado').forEach(p => { const k = p.ejecutor || '(Sin asignar)'; carga[k] = (carga[k] || 0) + 1; });
    return html`<div class="space-y-3">
      <div class="flex flex-wrap items-center gap-2">
        <${Select} value=${fResp} onChange=${e => setFResp(e.target.value)} options=${[...HHHA.EJECUTORES, '(Sin asignar)']} placeholder="Responsable" />
        <${Select} value=${fTipo} onChange=${e => setFTipo(e.target.value)} options=${Object.entries(HHHA.TIPO_PENDIENTE).map(([value, label]) => ({ value, label }))} placeholder="Tipo" />
        <label class="flex items-center gap-1.5 text-sm text-slate-500"><input type="checkbox" checked=${soloVenc} onChange=${e => setSoloVenc(e.target.checked)} /> Solo vencidos</label>
        <div class="ml-auto"><${Btn} size="sm" onClick=${() => openDrawer({ type: 'pendiente-nuevo' })}>+ Pendiente</${Btn}></div>
      </div>
      <div class="flex flex-wrap gap-1.5">${Object.entries(carga).sort((a, b) => b[1] - a[1]).map(([k, v]) => html`<button key=${k} onClick=${() => setFResp(k)} class="rounded-full border border-slate-200 px-2.5 py-0.5 text-xs hover:border-brand/50 dark:border-slate-800"><span class="text-slate-500">${k}</span> <span class="mono font-semibold">${v}</span></button>`)}</div>
      <div class="space-y-2">${list.map(p => { const venc = p.estado !== 'cerrado' && p.fechaComp && HHHA.diasEntreFechas(p.fechaComp, hoy()) > 0; return html`<button key=${p.id} onClick=${() => openDrawer({ type: 'pendiente', pend: p })} class="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:border-brand/50 dark:border-slate-800">
        <span class="min-w-0 flex-1"><span class="font-medium">${p.equipo || p.inv}</span> <span class="text-slate-400">· ${HHHA.TIPO_PENDIENTE[p.tipo] || p.tipo}</span><div class="truncate text-xs text-slate-500">${p.desc}</div></span>
        <span class="flex shrink-0 items-center gap-2">
          ${p.ejecutor && html`<span class="hidden text-xs text-slate-400 sm:inline">${p.ejecutor.split(' ')[0]}</span>`}
          ${venc && html`<span class="mono text-xs text-red-500">+${HHHA.diasEntreFechas(p.fechaComp, hoy())}d</span>`}
          <${Chip} cls=${PEND_META[p.estado].chip}>${PEND_META[p.estado].label}</${Chip}>
        </span>
      </button>`; })}</div>
      ${list.length === 0 && h(Empty, { title: 'Sin pendientes con esos filtros' })}
    </div>`;
  }

  // ---- Eventos (bitácora + correctivos) -----------------------------------
  function Eventos({ openFicha }) {
    const S = HHHA.getState();
    const [modo, setModo] = useState('bitacora');
    const [desde, setDesde] = useState(''); const [hasta, setHasta] = useState('');
    let evs = S.eventos.filter(e => !HHHA.eventoEsAuto(e));
    if (desde) evs = evs.filter(e => (e.fecha || '') >= desde);
    if (hasta) evs = evs.filter(e => (e.fecha || '') <= hasta);
    evs = evs.slice().sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    return html`<div class="space-y-3">
      <div class="flex flex-wrap items-center gap-2">
        <div class="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-800">
          ${[['bitacora', 'Bitácora'], ['correctivos', 'Correctivos']].map(([k, l]) => html`<button key=${k} onClick=${() => setModo(k)} class=${cx('rounded-md px-3 py-1 text-sm', modo === k ? 'bg-brand text-white dark:bg-brand-dk' : 'text-slate-500')}>${l}</button>`)}
        </div>
        ${modo === 'bitacora' && html`<${TextInput} type="date" value=${desde} onChange=${e => setDesde(e.target.value)} class="w-auto" />`}
        ${modo === 'bitacora' && html`<${TextInput} type="date" value=${hasta} onChange=${e => setHasta(e.target.value)} class="w-auto" />`}
      </div>
      ${modo === 'bitacora' ? html`<div class="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table class="w-full text-sm"><thead class="bg-slate-50 text-left text-xs uppercase text-slate-400 dark:bg-slate-900"><tr><th class="px-3 py-2">Fecha</th><th class="px-3 py-2">Inv</th><th class="px-3 py-2">Tipo</th><th class="px-3 py-2">Resultado</th><th class="px-3 py-2">Ejecutor</th><th class="px-3 py-2">Oficial</th></tr></thead>
        <tbody>${evs.slice(0, 300).map(e => html`<tr key=${e.id} onClick=${() => openFicha(e.inv)} class=${cx('cursor-pointer border-t border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50', e.anulado && 'opacity-40')}>
          <td class="px-3 py-1.5 mono text-slate-400">${fmt(e.fecha)}</td><td class="px-3 py-1.5 mono text-slate-400">${e.inv}</td>
          <td class="px-3 py-1.5">${HHHA.etiquetaTipoEvento(e)}</td><td class="px-3 py-1.5">${e.resultado || ''}</td>
          <td class="px-3 py-1.5 text-slate-500">${e.ejecutor || ''}</td><td class="px-3 py-1.5">${e.oficial === 'Sí' ? '✓' : '·'}</td>
        </tr>`)}</tbody></table>
      </div>` : h(Correctivos, { openFicha, openDrawer: () => {} })}
    </div>`;
  }

  // ---- Cumplimiento -------------------------------------------------------
  function Cumplimiento() {
    const S = HHHA.getState();
    const year = new Date().getFullYear();
    const [modo, setModo] = useState('servicio');
    const servicios = uniq(S.equipos.map(e => e.servicio).filter(Boolean)).sort();
    function statsServicio(serv) {
      const eqs = S.equipos.filter(e => e.servicio === serv && e.estado !== 'baja');
      const op = eqs.filter(e => e.estado === 'operativo').length;
      let prog = 0, ejec = 0;
      eqs.forEach(e => HHHA.MESES.forEach((m, idx) => { if (HHHA.mpProgramadaEnMes(e, m)) { prog++; if (HHHA.mpDelMesEjecutada(e, year, idx)) ejec++; } }));
      return { total: eqs.length, op, prog, ejec, pct: prog ? Math.round(ejec / prog * 100) : 100 };
    }
    const trend = HHHA.MESES.map((m, idx) => {
      let prog = 0, ejec = 0;
      S.equipos.forEach(e => { if (e.estado !== 'baja' && HHHA.mpProgramadaEnMes(e, m)) { prog++; if (HHHA.mpDelMesEjecutada(e, year, idx)) ejec++; } });
      return { m, pct: prog ? Math.round(ejec / prog * 100) : 0, prog };
    });
    return html`<div class="space-y-4">
      <div class="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-800">
        ${[['servicio', 'Por servicio'], ['mes', 'Por mes']].map(([k, l]) => html`<button key=${k} onClick=${() => setModo(k)} class=${cx('rounded-md px-3 py-1 text-sm', modo === k ? 'bg-brand text-white dark:bg-brand-dk' : 'text-slate-500')}>${l}</button>`)}
      </div>
      ${modo === 'mes' ? html`<${Card}>
        <h3 class="mb-3 font-semibold">Tendencia de cumplimiento MP ${year}</h3>
        <div class="flex items-end gap-2" style=${{ height: '160px' }}>
          ${trend.map(t => html`<div key=${t.m} class="flex flex-1 flex-col items-center justify-end gap-1">
            <div class="w-full rounded-t bg-brand/80" style=${{ height: Math.max(2, t.pct) + '%' }} title=${t.pct + '%'}></div>
            <div class="text-[10px] text-slate-400">${t.m}</div>
          </div>`)}
        </div>
      </${Card}>` : html`<div class="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table class="w-full text-sm"><thead class="bg-slate-50 text-left text-xs uppercase text-slate-400 dark:bg-slate-900"><tr><th class="px-3 py-2">Servicio</th><th class="px-3 py-2">Equipos</th><th class="px-3 py-2">% Operativo</th><th class="px-3 py-2">MP ej/prog</th><th class="px-3 py-2">% Cumpl.</th></tr></thead>
        <tbody>${servicios.map(s => { const st = statsServicio(s); return html`<tr key=${s} class="border-t border-slate-100 dark:border-slate-800">
          <td class="px-3 py-1.5">${s}</td><td class="px-3 py-1.5 mono">${st.total}</td>
          <td class="px-3 py-1.5 mono">${st.total ? Math.round(st.op / st.total * 100) : 0}%</td>
          <td class="px-3 py-1.5 mono text-slate-400">${st.ejec}/${st.prog}</td>
          <td class="px-3 py-1.5"><div class="flex items-center gap-2"><div class="h-1.5 w-20 rounded-full bg-slate-200 dark:bg-slate-700"><div class="h-1.5 rounded-full bg-emerald-500" style=${{ width: st.pct + '%' }}></div></div><span class="mono text-xs">${st.pct}%</span></div></td>
        </tr>`; })}</tbody></table>
      </div>`}
    </div>`;
  }

  // ---- MP del mes ---------------------------------------------------------
  function MPMes({ openDrawer, openFicha }) {
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [mes, setMes] = useState(now.getMonth());
    const data = HHHA.construirAsignacionMP(year, mes);
    const asign = (HHHA.getState().asignacionesMP || {})[`${year}-${String(mes + 1).padStart(2, '0')}`] || {};
    return html`<div class="space-y-3">
      <div class="flex flex-wrap items-center gap-2">
        <${Select} value=${String(mes)} onChange=${e => setMes(+e.target.value)} options=${HHHA.MESES.map((m, i) => ({ value: String(i), label: HHHA.MES_ESPANOL[m] }))} />
        <${TextInput} type="number" value=${year} onChange=${e => setYear(+e.target.value)} class="w-24" />
        <span class="text-sm text-slate-400">${data.equipos.length} equipos programados · ${data.conAsignacion} con responsable</span>
      </div>
      <div class="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table class="w-full text-sm"><thead class="bg-slate-50 text-left text-xs uppercase text-slate-400 dark:bg-slate-900"><tr><th class="px-3 py-2">Inv</th><th class="px-3 py-2">Equipo</th><th class="px-3 py-2">Servicio</th><th class="px-3 py-2">Estado MP</th><th class="px-3 py-2">Responsable</th><th></th></tr></thead>
        <tbody>${data.equipos.map(e => { const est = HHHA.mpEstadoMes(e, year, mes); return html`<tr key=${e.inv} class="border-t border-slate-100 dark:border-slate-800">
          <td class="px-3 py-1.5 mono text-slate-400">${e.inv}</td><td class="px-3 py-1.5">${e.equipo}</td><td class="px-3 py-1.5 text-slate-500">${e.servicio}</td>
          <td class="px-3 py-1.5"><${Chip} cls=${est === 'ejecutada' ? PEND_META.cerrado.chip : est === 'reprogramada' ? 'bg-amber-100 text-amber-700' : est === 'otro' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}>${est}</${Chip}></td>
          <td class="px-3 py-1.5 text-xs text-slate-500">${asign[e.inv] || '—'}</td>
          <td class="px-3 py-1.5">${est === 'pendiente' && html`<${Btn} size="sm" variant="ghost" onClick=${() => openDrawer({ type: 'mp', inv: e.inv })}>MP</${Btn}>`}</td>
        </tr>`; })}</tbody></table>
      </div>
    </div>`;
  }

  // ---- Conciliación -------------------------------------------------------
  function Conciliacion() {
    const [, bump] = useReducer(x => x + 1, 0);
    const [busy, setBusy] = useState(false);
    const conflictos = (HHHA.getState().conflictos || []).filter(c => c.estado === 'pendiente' || c.estado === 'pospuesto');
    async function onFile(e) {
      const file = e.target.files[0]; if (!file) return;
      setBusy(true);
      try {
        const parsed = await HHHA.parsearMaestro(file);
        const imp = { id: HHHA.getState().counters.importacion++, fecha: hoy(), archivo: file.name };
        HHHA.getState().importaciones.push(imp);
        const res = HHHA.compararMaestro(parsed, imp.id);
        persistAndSync();
        toastFn(`Conciliación: ${res.conflictos} conflictos, ${res.autoCompletados} auto-completados, ${res.eventosSinteticos} eventos creados`, 'ok');
      } catch (err) { toastFn('Error: ' + err.message, 'warn'); }
      setBusy(false); bump();
    }
    function resolver(c, accion) { HHHA.resolverConflicto(c, accion); scheduleSync(); bump(); }
    return html`<div class="space-y-4">
      <${Card}>
        <h3 class="mb-2 font-semibold">Importar maestro Excel</h3>
        <p class="mb-3 text-sm text-slate-400">Sube el archivo con hojas <span class="mono">PMP_AAAA</span> y <span class="mono">Registro_MP-AAAA</span>. Auto-completa celdas vacías y registra diferencias como conflictos.</p>
        <input type="file" accept=".xlsx,.xls" onChange=${onFile} disabled=${busy} class="text-sm" />
        ${busy && html`<span class="ml-2 text-sm text-slate-400">Procesando…</span>`}
      </${Card}>
      <div>
        <h3 class="mb-2 font-semibold">Conflictos pendientes <span class="mono text-sm text-slate-400">${conflictos.length}</span></h3>
        ${conflictos.length === 0 ? h(Empty, { title: 'Sin conflictos' }) : html`<div class="space-y-2">${conflictos.slice(0, 100).map(c => html`<div key=${c.id} class="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="text-sm"><span class="mono text-slate-400">${c.inv}</span> · ${HHHA.nombreCampoConflicto(c)}<div class="text-xs text-slate-500">Programa: <b>${c.valorPrograma || '—'}</b> · Maestro: <b>${c.valorMaestro || '—'}</b></div></div>
            <div class="flex gap-1.5">
              <${Btn} size="sm" variant="outline" onClick=${() => resolver(c, 'aceptar_maestro')}>Aceptar maestro</${Btn}>
              <${Btn} size="sm" variant="ghost" onClick=${() => resolver(c, 'mantener_programa')}>Mantener</${Btn}>
              <${Btn} size="sm" variant="ghost" onClick=${() => resolver(c, 'posponer')}>Posponer</${Btn}>
            </div>
          </div>
        </div>`)}</div>`}
      </div>
    </div>`;
  }

  // ---- Configuración ------------------------------------------------------
  function Configuracion({ user }) {
    const S = HHHA.getState();
    function backup() { descargarTexto(HHHA.exportarBackupJSON(), 'sigem-backup.json'); }
    function restore(e) { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { try { const r = HHHA.importarBackup(JSON.parse(rd.result)); if (r.ok) { scheduleSync(); toastFn('Backup importado: ' + r.eventos + ' eventos', 'ok'); forceRoot(); } else toastFn(r.error, 'warn'); } catch (err) { toastFn('JSON inválido', 'warn'); } }; rd.readAsText(f); }
    return html`<div class="max-w-2xl space-y-4">
      <${Card}>
        <h3 class="mb-2 font-semibold">Identidad y sesión</h3>
        <div class="text-sm text-slate-500">Usuario autenticado: <span class="mono font-medium text-slate-700 dark:text-slate-200">${user || '(local)'}</span></div>
        <div class="mt-1 text-xs text-slate-400">La identidad proviene del login de Google y se usa como autor en la auditoría.</div>
      </${Card}>
      <${Card}>
        <h3 class="mb-2 font-semibold">Almacenamiento</h3>
        <div class="text-sm text-slate-500">${GAS ? 'Sincronizando con Google Sheets ✓' : 'Modo local (localStorage) — sin conexión a Apps Script'}</div>
        <div class="mt-1 text-xs text-slate-400">Equipos: ${S.equipos.length} · Eventos: ${S.eventos.length} · Pendientes: ${S.pendientes.filter(p => !p.anulado).length} · Versión ${HHHA.APP_VERSION}/${'5.0.0'}</div>
      </${Card}>
      <${Card}>
        <h3 class="mb-2 font-semibold">Respaldo</h3>
        <div class="flex flex-wrap gap-2">
          <${Btn} size="sm" variant="outline" onClick=${backup}>Descargar backup JSON</${Btn}>
          <label class="inline-flex cursor-pointer items-center rounded-lg border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">Importar backup<input type="file" accept=".json" onChange=${restore} class="hidden" /></label>
        </div>
      </${Card}>
    </div>`;
  }

  // ---- utilidades de descarga --------------------------------------------
  function descargarTexto(txt, nombre) { const b = new Blob([txt], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = nombre; a.click(); }
  function descargarXLSX(aoa, nombre, hoja) { if (!window.XLSX) return toastFn('XLSX no disponible', 'warn'); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), hoja || 'Hoja'); XLSX.writeFile(wb, nombre); }

  // ==========================================================================
  // COMMAND PALETTE
  // ==========================================================================
  function CommandPalette({ open, onClose, go, openFicha }) {
    const [q, setQ] = useState('');
    const ref = useRef(null);
    useEffect(() => { if (open) setTimeout(() => ref.current && ref.current.focus(), 30); setQ(''); }, [open]);
    if (!open) return null;
    const acciones = [
      { label: 'Cola de trabajo', run: () => go('cola') },
      { label: 'Pipeline de correctivos', run: () => go('correctivos') },
      { label: 'Equipos', run: () => go('equipos') },
      { label: 'Pendientes', run: () => go('pendientes') },
      { label: 'Conciliación', run: () => go('conciliacion') }
    ].filter(a => a.label.toLowerCase().includes(q.toLowerCase()));
    const eqs = q.length >= 2 ? HHHA.getState().equipos.filter(e => (e.inv + ' ' + e.equipo).toLowerCase().includes(q.toLowerCase())).slice(0, 6) : [];
    return html`<div class="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[15vh]" role="dialog" aria-modal="true">
      <div class="absolute inset-0 bg-black/40" onClick=${onClose}></div>
      <div class="relative w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <input ref=${ref} value=${q} onChange=${e => setQ(e.target.value)} placeholder="Buscar equipos o ir a…" class="w-full border-b border-slate-200 bg-transparent px-4 py-3 text-sm outline-none dark:border-slate-800" />
        <div class="max-h-80 overflow-y-auto p-2">
          ${eqs.map(e => html`<button key=${e.inv} onClick=${() => { onClose(); openFicha(e.inv); }} class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"><span><span class="mono text-slate-400">${e.inv}</span> ${e.equipo}</span><${EstadoChip} estado=${e.estado} /></button>`)}
          ${acciones.map(a => html`<button key=${a.label} onClick=${() => { onClose(); a.run(); }} class="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800">→ ${a.label}</button>`)}
        </div>
      </div>
    </div>`;
  }

  // ==========================================================================
  // TOASTS
  // ==========================================================================
  // Reloj en vivo (estilo consola de operaciones).
  function LiveClock() {
    const [t, setT] = useState(new Date());
    useEffect(() => { const id = setInterval(() => setT(new Date()), 1000); return () => clearInterval(id); }, []);
    const p = (n) => String(n).padStart(2, '0');
    return html`<span class="mono tabular-nums">${p(t.getHours())}:${p(t.getMinutes())}:${p(t.getSeconds())}</span>`;
  }

  // Franja superior de estado: reloj + contadores globales en vivo.
  function StatusStrip() {
    const S = HHHA.getState();
    const total = S.equipos.filter(e => e.estado !== 'baja').length;
    const op = S.equipos.filter(e => e.estado === 'operativo').length;
    const noop = S.equipos.filter(e => e.estado === 'no_operativo').length;
    const st = S.equipos.filter(e => e.estado === 'en_servicio_tecnico').length;
    const opPct = total ? Math.round(op / total * 100) : 0;
    const item = (dot, label, val) => html`<span class="flex items-center gap-1.5"><span class=${cx('h-1.5 w-1.5 rounded-full', dot)}></span><span class="text-slate-400">${label}</span><span class="mono font-semibold">${val}</span></span>`;
    return html`<div class="flex items-center gap-4 overflow-x-auto border-b border-slate-200 bg-slate-100/60 px-4 py-1 text-[11px] dark:border-ink-line dark:bg-ink-900/60 lg:px-6">
      <span class="flex items-center gap-1.5 font-semibold text-brand"><span class="h-1.5 w-1.5 animate-pulse rounded-full bg-brand shadow-glow"></span>EN VIVO</span>
      ${item('bg-op', 'Operativos', opPct + '%')}
      ${item('bg-noop', 'No oper.', noop)}
      ${item('bg-st', 'Serv. téc.', st)}
      ${item('bg-slate-400', 'Parque', total)}
      <span class="ml-auto flex items-center gap-1.5 text-slate-400"><${LiveClock} /></span>
    </div>`;
  }

  function Toasts({ items }) {
    return html`<div class="fixed bottom-4 right-4 z-50 space-y-2">${items.map(t => html`<div key=${t.id} class=${cx('rounded-lg px-4 py-2.5 text-sm text-white shadow-lg', t.type === 'warn' ? 'bg-amber-600' : t.type === 'err' ? 'bg-red-600' : 'bg-slate-800 dark:bg-slate-700')}>${t.msg}</div>`)}</div>`;
  }

  // ==========================================================================
  // APP ROOT
  // ==========================================================================
  const NAV = [
    ['cola', 'Cola de trabajo', '◎'],
    ['correctivos', 'Correctivos', '⚙'],
    ['equipos', 'Equipos', '▦'],
    ['pendientes', 'Pendientes', '☑'],
    ['eventos', 'Eventos', '↻'],
    ['cumplimiento', 'Cumplimiento', '▤'],
    ['mpmes', 'MP del mes', '◷'],
    ['conciliacion', 'Conciliación', '⇄'],
    ['configuracion', 'Configuración', '⚙']
  ];

  function App({ user }) {
    const [, tick] = useReducer(x => x + 1, 0);
    const [view, setView] = useState('cola');
    const [filtro, setFiltro] = useState(null);
    const [drawer, setDrawer] = useState(null);     // {type,...}
    const [ficha, setFicha] = useState(null);       // inv
    const [palette, setPalette] = useState(false);
    const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
    const [toasts, setToasts] = useState([]);
    const [sidebar, setSidebar] = useState(false);

    forceRoot = tick;
    toastFn = useCallback((msg, type) => { const id = Date.now() + Math.random(); setToasts(t => [...t, { id, msg, type: type === 'ok' ? 'ok' : type }]); setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3800); }, []);

    useEffect(() => {
      const onKey = (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(p => !p); }
        else if (e.key === '/' && !/input|textarea|select/i.test((e.target.tagName || ''))) { e.preventDefault(); setPalette(true); }
      };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }, []);

    function go(v, f) { setView(v); setFiltro(f || null); setSidebar(false); }
    function toggleDark() { const d = !dark; setDark(d); document.documentElement.classList.toggle('dark', d); try { localStorage.setItem('sigem_theme', d ? 'dark' : 'light'); } catch (e) {} }
    const openFicha = (inv) => setFicha(inv);
    const openDrawer = (d) => setDrawer(d);

    const viewNode = (() => {
      switch (view) {
        case 'cola': return h(ColaTrabajo, { go, openFicha, openDrawer });
        case 'correctivos': return h(Correctivos, { openFicha, openDrawer });
        case 'equipos': return h(Equipos, { filtro0: filtro, openFicha });
        case 'pendientes': return h(Pendientes, { filtro0: filtro, openDrawer });
        case 'eventos': return h(Eventos, { openFicha });
        case 'cumplimiento': return h(Cumplimiento, {});
        case 'mpmes': return h(MPMes, { openDrawer, openFicha });
        case 'conciliacion': return h(Conciliacion, {});
        case 'configuracion': return h(Configuracion, { user });
        default: return null;
      }
    })();
    const titulo = (NAV.find(n => n[0] === view) || [])[1] || '';

    const NAV_MOBILE = ['cola', 'correctivos', 'equipos', 'pendientes'];
    return html`<div class="flex h-full bg-slate-100 text-slate-800 dark:bg-ink-900 dark:text-slate-200">
      <!-- Rail lateral tipo consola (escritorio) / drawer (móvil) -->
      <aside class=${cx('fixed inset-y-0 left-0 z-30 flex w-60 transform flex-col border-r border-slate-200 bg-white transition-transform dark:border-ink-line dark:bg-ink-800 lg:static lg:translate-x-0', sidebar ? 'translate-x-0' : '-translate-x-full')}>
        <div class="flex items-center gap-2.5 border-b border-slate-200 px-4 py-3.5 dark:border-ink-line">
          <div class="brand-gradient flex h-9 w-9 items-center justify-center rounded-lg text-base font-black text-ink-900 shadow-glow">S</div>
          <div><div class="text-sm font-extrabold leading-none tracking-tight">SIGEM</div><div class="mt-0.5 text-[10px] uppercase tracking-widest text-brand">control · biomédica</div></div>
        </div>
        <nav class="flex-1 space-y-0.5 overflow-y-auto p-2">${NAV.map(([k, l, ic]) => html`<button key=${k} onClick=${() => go(k)} class=${cx('group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition', view === k ? 'bg-brand/10 text-brand dark:bg-brand/15' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-200')}>
          ${view === k && html`<span class="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-brand shadow-glow"></span>`}
          <span class=${cx('flex h-6 w-6 items-center justify-center rounded-md text-sm', view === k ? 'text-brand' : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300')}>${ic}</span>${l}
        </button>`)}</nav>
        <div class="border-t border-slate-200 px-4 py-2.5 text-[11px] text-slate-400 dark:border-ink-line">
          <div class="flex items-center gap-2"><span class=${cx('h-2 w-2 rounded-full', GAS ? 'bg-op shadow-glow' : 'bg-st')}></span>${GAS ? 'Sincronizado · Sheets' : 'Local (demo)'}</div>
          <div class="mt-0.5 truncate font-mono">${user || 'sesión local'} · v5.0.0</div>
        </div>
      </aside>
      ${sidebar && html`<div class="fixed inset-0 z-20 bg-ink-900/60 backdrop-blur-sm lg:hidden" onClick=${() => setSidebar(false)}></div>`}

      <!-- Main -->
      <div class="flex min-w-0 flex-1 flex-col">
        ${h(StatusStrip, {})}
        <header class="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white/85 px-4 py-2.5 backdrop-blur-md dark:border-ink-line dark:bg-ink-800/85 lg:px-6">
          <button class="rounded-lg border border-slate-200 p-1.5 dark:border-ink-line lg:hidden" onClick=${() => setSidebar(true)} aria-label="Menú">☰</button>
          <div>
            <h1 class="flex items-center gap-2 text-base font-extrabold tracking-tight"><span class="hidden h-1.5 w-1.5 rounded-full bg-brand shadow-glow sm:inline-block"></span>${titulo}</h1>
          </div>
          <div class="ml-auto flex items-center gap-2">
            <button onClick=${() => setPalette(true)} class="hidden items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-400 transition hover:border-brand/50 hover:text-brand dark:border-ink-line sm:flex">⌕ Buscar… <kbd class="rounded bg-slate-100 px-1.5 py-0.5 font-mono dark:bg-ink-600">⌘K</kbd></button>
            <button onClick=${() => setPalette(true)} class="rounded-lg border border-slate-200 p-1.5 dark:border-ink-line sm:hidden" aria-label="Buscar">⌕</button>
            <button onClick=${toggleDark} class="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition hover:text-brand dark:border-ink-line" aria-label="Tema">${dark ? '☀' : '☾'}</button>
          </div>
        </header>
        <main class="scrollbar-thin flex-1 overflow-y-auto p-4 pb-24 lg:p-6 lg:pb-6">${viewNode}</main>
      </div>

      <!-- Barra inferior tipo app (móvil/tablet, para terreno) -->
      <nav class="fixed inset-x-0 bottom-0 z-20 flex border-t border-slate-200 bg-white/95 px-2 py-1.5 backdrop-blur dark:border-ink-line dark:bg-ink-800/95 lg:hidden">
        ${NAV_MOBILE.map(k => { const item = NAV.find(n => n[0] === k); return html`<button key=${k} onClick=${() => go(k)} class=${cx('flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-semibold transition', view === k ? 'text-brand' : 'text-slate-400')}>
          <span class="text-lg">${item[2]}</span>${item[1].split(' ')[0]}
        </button>`; })}
        <button onClick=${() => setSidebar(true)} class="flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-semibold text-slate-400"><span class="text-lg">⋯</span>Más</button>
      </nav>

      <!-- Drawers / overlays -->
      ${ficha && h(FichaEquipo, { inv: ficha, onClose: () => { setFicha(null); tick(); }, openDrawer })}
      ${drawer && drawer.type === 'mp' && h(RegistrarMPDrawer, { inv: drawer.inv, onClose: () => setDrawer(null), onDone: () => { drawer.onDone && drawer.onDone(); tick(); } })}
      ${drawer && drawer.type === 'evento' && h(NuevoEventoDrawer, { inv: drawer.inv, tipoInicial: drawer.tipoInicial, onClose: () => setDrawer(null), onDone: () => { drawer.onDone && drawer.onDone(); tick(); } })}
      ${drawer && drawer.type === 'pendiente-nuevo' && h(NuevoPendienteDrawer, { onClose: () => setDrawer(null), onDone: tick })}
      ${drawer && drawer.type === 'pendiente' && h(PendienteDrawer, { pend: drawer.pend, onClose: () => setDrawer(null), onDone: tick })}
      ${h(CommandPalette, { open: palette, onClose: () => setPalette(false), go, openFicha })}
      ${h(Toasts, { items: toasts })}
    </div>`;
  }

  // ==========================================================================
  // BOOTSTRAP
  // ==========================================================================
  async function boot() {
    // Tema persistido
    // Tema "centro de control": oscuro por defecto; solo se aclara si el usuario lo eligió.
    try { document.documentElement.classList.toggle('dark', localStorage.getItem('sigem_theme') !== 'light'); } catch (e) {}
    HHHA.configure({
      ui: { notify: (m, t) => toastFn(m, t === 'success' ? 'ok' : 'warn'), confirm: (m) => window.confirm(m), prompt: (m) => window.prompt(m), alert: (m) => toastFn(m, 'warn'), onChange: () => { forceRoot(); } },
      env: { xlsx: (typeof XLSX !== 'undefined') ? XLSX : null }
    });
    let user = '';
    if (GAS) {
      try {
        const res = await gasRun('apiBootstrap');
        if (res && res.user) { user = res.user; HHHA.setIdentity(user); }
        if (res && res.dataB64) { try { localStorage.setItem(HHHA.STORAGE_KEY, res.dataB64); } catch (e) {} }
        if (res && res.updated) lastServerUpdated = res.updated;
      } catch (e) { /* sin conexión: usa caché local */ }
    }
    HHHA.setSeed(window.SEED);
    HHHA.bootstrapDatos();
    ReactDOM.createRoot(document.getElementById('root')).render(h(App, { user }));
  }
  boot();
})();
