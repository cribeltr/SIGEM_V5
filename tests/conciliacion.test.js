'use strict';
const { freshCore } = require('./helpers');

// compararMaestro recibe el resultado YA parseado de parsearMaestro:
//   { sheetPMP, sheetReg, pmp:{inv:{inv,prog{Mes}}}, reg:{inv:{inv,reg{Mes:{P,R}}}} }
// Así probamos la lógica de conciliación sin depender de SheetJS.
function parsed(year, pmp, reg) {
  return { sheetPMP: `PMP_${year}`, sheetReg: `Registro_MP-${year}`, pmp: pmp || {}, reg: reg || {} };
}

describe('Conciliación con el maestro Excel', () => {
  let H;
  beforeEach(() => { H = freshCore(); });

  it('auto-completa celdas vacías de programación desde el maestro', () => {
    // Equipo con un mes SIN programación en el programa; el maestro trae 'X'.
    const eq = H.getState().equipos.find(e => !(e.prog || {})['Ene']);
    const p = parsed(2025, { [eq.inv]: { inv: eq.inv, prog: { Ene: 'X' } } }, {});
    const res = H.compararMaestro(p, 1);
    expect(res.autoCompletados).toBeGreaterThanOrEqual(1);
    expect(H.findEquipo(eq.inv).prog['Ene']).toBe('X');
  });

  it('crea evento MP sintético al auto-completar una R del catálogo', () => {
    const eq = H.getState().equipos.find(e => Object.keys(e.registro || {}).length === 0 && (e.prog || {})['Feb']);
    const year = 2025;
    const p = parsed(year, {}, { [eq.inv]: { inv: eq.inv, reg: { Feb: { P: 'X', R: 'Si' } } } });
    const res = H.compararMaestro(p, 2);
    expect(res.eventosSinteticos).toBeGreaterThanOrEqual(1);
    const ev = H.getState().eventos.find(e => e.inv === eq.inv && e.tipo === 'Mantención preventiva' && (e.origen || '').startsWith('conciliacion'));
    expect(ev).toBeTruthy();
    expect(ev.resultado).toBe('Si');
  });

  it('registra conflicto mp_diferencia cuando programa y maestro difieren', () => {
    const eq = H.getState().equipos.find(e => (e.prog || {})['Feb'] === 'X');
    const p = parsed(2025, { [eq.inv]: { inv: eq.inv, prog: { Feb: 'PM' } } }, {});
    const res = H.compararMaestro(p, 3);
    expect(res.conflictos).toBeGreaterThanOrEqual(1);
    const c = H.getState().conflictos.find(x => x.inv === eq.inv && x.campo === 'P' && x.mes === 'Feb' && x.estado === 'pendiente');
    expect(c).toBeTruthy();
    expect(c.valorPrograma).toBe('X');
    expect(c.valorMaestro).toBe('PM');
  });

  it('resolver conflicto aceptando el maestro aplica el valor', () => {
    const eq = H.getState().equipos.find(e => (e.prog || {})['Feb'] === 'X');
    const p = parsed(2025, { [eq.inv]: { inv: eq.inv, prog: { Feb: 'PM' } } }, {});
    H.compararMaestro(p, 4);
    const c = H.getState().conflictos.find(x => x.inv === eq.inv && x.campo === 'P' && x.mes === 'Feb' && x.estado === 'pendiente');
    H.resolverConflicto(c, 'aceptar_maestro');
    expect(H.findEquipo(eq.inv).prog['Feb']).toBe('PM');
    expect(c.estado).toBe('resuelto_maestro');
  });

  it('equipo nuevo en el maestro genera conflicto equipo_nuevo', () => {
    const p = parsed(2025, { 'X-NUEVO-1': { inv: 'X-NUEVO-1', prog: { Mar: 'X' } } }, {});
    H.compararMaestro(p, 5);
    const c = H.getState().conflictos.find(x => x.tipo === 'equipo_nuevo' && x.inv === 'X-NUEVO-1');
    expect(c).toBeTruthy();
    H.resolverConflicto(c, 'aceptar_maestro');
    expect(H.findEquipo('X-NUEVO-1')).toBeTruthy();
  });
});
