'use strict';
const { freshCore } = require('./helpers');

// Equipo de prueba con MP programada en varios meses (existe en el seed).
const INV = '2-116070'; // Incubadora, prog Feb/May/Ago/Nov

describe('Motor de estados del equipo', () => {
  let H;
  beforeEach(() => { H = freshCore(); });

  it('estadoMPDesdeResultado / estadoMPFinal', () => {
    expect(H.estadoMPDesdeResultado('Si')).toBe('operativo');
    expect(H.estadoMPDesdeResultado('C2')).toBe('en servicio técnico');
    expect(H.estadoMPDesdeResultado('C3')).toBe('no operativo');
    expect(H.estadoMPDesdeResultado('FS')).toBe('no operativo');
    expect(H.estadoMPDesdeResultado('NU')).toBe('no operativo');
    expect(H.estadoMPDesdeResultado('Baja')).toBe('baja');
    expect(H.estadoMPDesdeResultado('C1')).toBe('');
    expect(H.estadoMPFinal('Si', 'no operativo')).toBe('no operativo');
    expect(H.estadoMPFinal('Si', 'operativo')).toBe('operativo');
  });

  it('MP "Si" deja el equipo operativo', () => {
    const r = H.registrarMP({ inv: INV, fecha: '2025-05-05', resultado: 'Si', ejecutor: 'Marco Ulloa', estadoSi: 'operativo', forzarSinProg: true });
    expect(r.ok).toBe(true);
    expect(H.findEquipo(INV).estado).toBe('operativo');
  });

  it('MP C2 deja el equipo en servicio técnico', () => {
    H.registrarMP({ inv: INV, fecha: '2025-05-05', resultado: 'C2', ejecutor: 'Marco Ulloa', forzarSinProg: true });
    expect(H.findEquipo(INV).estado).toBe('en_servicio_tecnico');
  });

  it('MP C3 deja el equipo no operativo', () => {
    H.registrarMP({ inv: INV, fecha: '2025-05-05', resultado: 'C3', ejecutor: 'Marco Ulloa', forzarSinProg: true });
    expect(H.findEquipo(INV).estado).toBe('no_operativo');
  });

  it('MP Baja deja el equipo en baja', () => {
    H.registrarMP({ inv: INV, fecha: '2025-05-05', resultado: 'Baja', ejecutor: 'Marco Ulloa', forzarSinProg: true });
    expect(H.findEquipo(INV).estado).toBe('baja');
  });

  it('MP C1/C4–C8 NO cambian el estado (reprogramación sin falla)', () => {
    const antes = H.findEquipo(INV).estado;
    H.registrarMP({ inv: INV, fecha: '2025-05-05', resultado: 'C1', ejecutor: 'Marco Ulloa', forzarSinProg: true });
    expect(H.findEquipo(INV).estado).toBe(antes);
  });
});

describe('Causal C1–C8 → pendiente automático + R del mes siguiente', () => {
  let H;
  beforeEach(() => { H = freshCore(); });

  it('C5 (reprogramable) genera pendiente a 30 días', () => {
    const r = H.registrarMP({ inv: INV, fecha: '2025-05-05', resultado: 'C5', ejecutor: 'Marco Ulloa', forzarSinProg: true });
    const pend = H.getState().pendientes.filter(p => p.eventoOrigen === r.evento.id && !p.anulado);
    expect(pend.length).toBe(1);
    expect(pend[0].tipo).toBe('reprogramacion');
    expect(pend[0].fechaComp).toBe(H.addDias(H.hoyLocal(), 30));
  });

  it('C2 (no reprogramable) genera pendiente sin fecha de compromiso', () => {
    const r = H.registrarMP({ inv: INV, fecha: '2025-05-05', resultado: 'C2', ejecutor: 'Marco Ulloa', forzarSinProg: true });
    const pend = H.getState().pendientes.filter(p => p.eventoOrigen === r.evento.id && !p.anulado);
    expect(pend.length).toBe(1);
    expect(pend[0].fechaComp).toBe(null);
  });

  it('marca R en la programación del mes siguiente si está vacío', () => {
    H.registrarMP({ inv: INV, fecha: '2025-05-05', resultado: 'C5', ejecutor: 'Marco Ulloa', forzarSinProg: true });
    const eq = H.findEquipo(INV);
    expect(eq.registro['May'].R).toBe('C5');
    expect(eq.registro['Jun'].P).toBe('R'); // mes siguiente
  });

  it('NU genera pendiente "localizar equipo"', () => {
    const r = H.registrarMP({ inv: INV, fecha: '2025-05-05', resultado: 'NU', ejecutor: 'Marco Ulloa', forzarSinProg: true });
    const pend = H.getState().pendientes.filter(p => p.eventoOrigen === r.evento.id && !p.anulado);
    expect(pend.length).toBe(1);
    expect(pend[0].tipo).toBe('gestion_general');
    expect(pend[0].desc).toMatch(/Localizar equipo/);
  });
});

describe('Reversión al anular un evento', () => {
  let H;
  beforeEach(() => { H = freshCore(); });

  it('anular MP con causal limpia R, recalcula estado y anula el pendiente auto', () => {
    const r = H.registrarMP({ inv: INV, fecha: '2025-05-05', resultado: 'C3', ejecutor: 'Marco Ulloa', forzarSinProg: true });
    expect(H.findEquipo(INV).estado).toBe('no_operativo');
    const res = H.anularEvento(r.evento, 'Mal ingresado');
    expect(res.ok).toBe(true);
    // estado revertido (ya no no_operativo por esa MP)
    expect(H.findEquipo(INV).estado).not.toBe('no_operativo');
    // R de mayo eliminado
    expect((H.findEquipo(INV).registro['May'] || {}).R).toBeUndefined();
    // pendiente auto anulado
    const pend = H.getState().pendientes.filter(p => p.eventoOrigen === r.evento.id && !p.anulado);
    expect(pend.length).toBe(0);
  });

  it('si hay otra MP no anulada del mismo mes, R se reemplaza en vez de borrarse', () => {
    const r1 = H.registrarMP({ inv: INV, fecha: '2025-05-05', resultado: 'C3', ejecutor: 'Marco Ulloa', forzarSinProg: true });
    H.registrarMP({ inv: INV, fecha: '2025-05-20', resultado: 'Si', ejecutor: 'Marco Ulloa', estadoSi: 'operativo', forzarSinProg: true });
    H.anularEvento(r1.evento, 'Duplicado');
    expect(H.findEquipo(INV).registro['May'].R).toBe('Si');
  });
});

describe('Ciclos correctivos', () => {
  let H;
  beforeEach(() => { H = freshCore(); });

  it('Solicitud de trabajo abre ciclo y deja el equipo no operativo', () => {
    const r = H.crearEvento({ inv: INV, tipo: 'Solicitud de trabajo', fecha: '2025-06-01', ejecutor: 'Cristina Rozas Urrutia', obs: 'Falla X' });
    expect(r.ok).toBe(true);
    expect(H.ciclosAbiertosDe(INV).length).toBe(1);
    expect(H.findEquipo(INV).estado).toBe('no_operativo');
  });

  it('Reparación operativa cierra el ciclo abierto', () => {
    H.crearEvento({ inv: INV, tipo: 'Solicitud de trabajo', fecha: '2025-06-01', ejecutor: 'Cristina Rozas Urrutia' });
    H.crearEvento({ inv: INV, tipo: 'Reparación', fecha: '2025-06-10', ejecutor: 'Marco Ulloa', estado: 'operativo' });
    expect(H.ciclosAbiertosDe(INV).length).toBe(0);
    expect(H.findEquipo(INV).estado).toBe('operativo');
  });

  it('anular la Solicitud anula el ciclo si no quedan correctivos', () => {
    const r = H.crearEvento({ inv: INV, tipo: 'Solicitud de trabajo', fecha: '2025-06-01', ejecutor: 'Cristina Rozas Urrutia' });
    H.anularEvento(r.evento, 'Mal ingresado');
    expect(H.ciclosAbiertosDe(INV).length).toBe(0);
    expect(H.ciclosDe(INV).every(c => c.estado === 'anulado')).toBe(true);
  });
});

describe('Pendientes, tareas y baja', () => {
  let H;
  beforeEach(() => { H = freshCore(); });

  it('crear pendiente manual + tarea + cierre', () => {
    const r = H.crearPendiente({ inv: INV, tipo: 'gestion_general', desc: 'Revisar accesorio', ejecutor: 'Marco Ulloa' });
    expect(r.ok).toBe(true);
    const t = H.agregarTareaPendiente(r.pendiente, 'Comprar accesorio');
    expect(t.ok).toBe(true);
    const tg = H.toggleTarea(t.tarea, true);
    expect(tg.todasCerradas).toBe(true);
    H.cerrarPendiente(r.pendiente, 'listo');
    expect(r.pendiente.estado).toBe('cerrado');
  });

  it('dar de baja crea evento Baja, marca registro y cierra pendientes', () => {
    H.crearPendiente({ inv: INV, tipo: 'gestion_general', desc: 'x', ejecutor: 'Marco Ulloa' });
    const r = H.darDeBaja(H.findEquipo(INV), 'Obsoleto');
    expect(r.ok).toBe(true);
    expect(H.findEquipo(INV).estado).toBe('baja');
    expect(H.pendientesDe(INV).every(p => p.estado === 'cerrado')).toBe(true);
  });
});
