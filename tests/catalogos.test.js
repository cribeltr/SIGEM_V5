'use strict';
const { freshCore } = require('./helpers');

describe('Catálogos y constantes (paridad exacta con el código)', () => {
  const H = freshCore();

  it('CAUSALES C1–C8 con texto y flag reprog30 exactos', () => {
    expect(H.CAUSALES.C1).toEqual({ desc: 'Imposibilidad de desocupar el equipo del paciente', reprog30: true });
    expect(H.CAUSALES.C2).toEqual({ desc: 'Equipo en servicio técnico', reprog30: false });
    expect(H.CAUSALES.C3).toEqual({ desc: 'Equipo no operativo, espera de repuestos/accesorios', reprog30: false });
    expect(H.CAUSALES.C4).toEqual({ desc: 'Equipo en préstamo a otro hospital', reprog30: false });
    expect(H.CAUSALES.C5.reprog30).toBe(true);
    expect(H.CAUSALES.C6.reprog30).toBe(true);
    expect(H.CAUSALES.C7.reprog30).toBe(true);
    expect(H.CAUSALES.C8.reprog30).toBe(true);
  });

  it('reprogramables = C1,C5,C6,C7,C8 ; no reprogramables = C2,C3,C4', () => {
    const reprog = Object.keys(H.CAUSALES).filter(k => H.CAUSALES[k].reprog30);
    expect(reprog.sort()).toEqual(['C1', 'C5', 'C6', 'C7', 'C8']);
  });

  it('MP_CAUSAL_ESTADO exacto', () => {
    expect(H.MP_CAUSAL_ESTADO).toEqual({ C2: 'en_servicio_tecnico', C3: 'no_operativo', FS: 'no_operativo', NU: 'no_operativo', Baja: 'baja' });
  });

  it('RESULTADOS_MP contiene el catálogo completo', () => {
    ['Si', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'FS', 'NU', 'Baja', 'No'].forEach(r => expect(H.RESULTADOS_MP.has(r)).toBe(true));
  });

  it('ESTADOS_PRIMARIOS y TIPOS_EVENTO', () => {
    expect(H.ESTADOS_PRIMARIOS).toEqual(['desconocido', 'operativo', 'no_operativo', 'en_servicio_tecnico', 'baja']);
    expect(H.TIPOS_EVENTO.map(t => t.label)).toEqual([
      'Solicitud de trabajo', 'Visita técnica', 'Orden de Compra',
      'Envío a servicio técnico', 'Recepción', 'Reparación', 'Mantención preventiva'
    ]);
  });

  it('EJECUTORES = 11 e incluye Personal externo', () => {
    expect(H.EJECUTORES.length).toBe(11);
    expect(H.EJECUTORES).toContain('Personal externo');
  });
});

describe('Seed limpio cargado', () => {
  it('893 equipos, sin Timestral, sin mojibake, sin ventilador+Monitores, sin sin-fam', () => {
    const H = freshCore();
    const eq = H.getState().equipos;
    expect(eq.length).toBe(893);
    expect(eq.filter(e => e.freq === 'Timestral').length).toBe(0);
    expect(eq.filter(e => JSON.stringify(e).includes('√')).length).toBe(0);
    expect(eq.filter(e => /ventilador mec/i.test(e.equipo || '') && e.fam === 'Monitores').length).toBe(0);
    expect(eq.filter(e => !e.fam || !String(e.fam).trim()).length).toBe(0);
  });

  it('indicador fuera de vida útil: 309 equipos con vur<0', () => {
    const H = freshCore();
    expect(H.getState().equipos.filter(e => typeof e.vur === 'number' && e.vur < 0).length).toBe(309);
  });
});
