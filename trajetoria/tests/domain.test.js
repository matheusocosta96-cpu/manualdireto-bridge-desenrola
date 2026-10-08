import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHEMA_VERSION, XP_LIMITS, initialState, defaultSettings,
  complete, progress, totalXP, level, periodKey, dayKey,
  addMission, editMission, archiveMission, restoreMission, activeMissions,
  logSleep, removeEvent, remainingXP, compare, sleepRecords,
  migrate, validateBackup
} from '../web/domain.js';

const at = (y, m, d, h = 10) => new Date(y, m, d, h);
const clone = value => JSON.parse(JSON.stringify(value));

test('períodos: dia, semana de segunda a domingo e mês', () => {
  assert.equal(periodKey('daily', at(2026, 9, 8)), '2026-10-08');
  assert.equal(periodKey('weekly', new Date(2027, 0, 3)), '2026-12-28');
  assert.equal(periodKey('weekly', new Date(2027, 0, 4)), '2027-01-04');
  assert.equal(periodKey('monthly', new Date(2027, 0, 3)), '2027-01');
  assert.equal(dayKey(at(2026, 0, 1)), '2026-01-01');
});

test('missão diária respeita a meta e renova no dia seguinte', () => {
  let s = initialState();
  s = complete(s, 'read', 'Li cinco minutos', at(2026, 9, 8));
  assert.equal(totalXP(s), 10);
  assert.equal(s.events[0].note, 'Li cinco minutos');
  assert.throws(() => complete(s, 'read', '', at(2026, 9, 8)), /já concluída/);
  assert.equal(progress(s, s.missions.find(m => m.id === 'read'), at(2026, 9, 9)), 0);
});

test('missão semanal com meta 3 rende XP três vezes e renova na semana seguinte', () => {
  let s = addMission(initialState(), { title: 'Natação', area: 'endurance', period: 'weekly', target: 3, xp: 15, days: [5, 6, 0] });
  const m = s.missions.at(-1);
  assert.deepEqual(m.days, [0, 5, 6]);
  for (const day of [9, 10, 11]) s = complete(s, m.id, '', at(2026, 9, day));
  assert.equal(progress(s, m, at(2026, 9, 11)), 3);
  assert.equal(totalXP(s, 'endurance'), 45);
  assert.throws(() => complete(s, m.id, '', at(2026, 9, 11)), /já concluída/);
  assert.equal(progress(s, m, at(2026, 9, 12)), 0);
});

test('medicação é confirmação explícita, sem XP, e o histórico sobrevive à missão', () => {
  let s = complete(initialState(), 'med-am', '', at(2026, 9, 8));
  assert.equal(totalXP(s), 0);
  assert.equal(s.events[0].kind, 'medication');
  s = { ...s, missions: s.missions.filter(m => m.id !== 'med-am') };
  assert.equal(validateBackup(clone(s)).events.length, 1);
});

test('teto de XP por área no dia: a ação continua registrada sem somar pontos', () => {
  let s = initialState();
  const day = at(2026, 9, 8);
  // Seis registros de 15 XP na mesma área: 60 XP cabem, o resto não.
  for (let i = 0; i < 6; i++) s = addMission(s, { title: `Treino ${i}`, area: 'strength', period: 'daily', target: 1, xp: 15 });
  const ids = s.missions.filter(m => m.area === 'strength').map(m => m.id);
  for (const id of ids) s = complete(s, id, '', day);
  assert.equal(totalXP(s, 'strength'), XP_LIMITS.areaPerDay);
  assert.equal(s.events.length, 6);
  const last = s.events.at(-1);
  assert.equal(last.xp, 0);
  assert.equal(last.xpPlanned, 15);
  assert.equal(remainingXP(s, 'strength', day), 0);
  // No dia seguinte o teto volta ao normal.
  assert.equal(remainingXP(s, 'strength', at(2026, 9, 9)), XP_LIMITS.areaPerDay);
});

test('teto total do dia limita a soma de todas as áreas', () => {
  let s = initialState();
  const day = at(2026, 9, 8);
  const areas = ['wellbeing', 'intelligence', 'company', 'strength', 'endurance'];
  for (const a of areas) {
    for (let i = 0; i < 3; i++) s = addMission(s, { title: `${a}-${i}`, area: a, period: 'daily', target: 1, xp: 20 });
  }
  for (const m of s.missions.filter(x => x.title.includes('-'))) s = complete(s, m.id, '', day);
  assert.equal(totalXP(s), XP_LIMITS.totalPerDay);
  assert.equal(remainingXP(s, 'company', day), 0);
});

test('limites configuráveis são respeitados', () => {
  let s = initialState();
  s = { ...s, settings: { ...s.settings, limits: { ...XP_LIMITS, areaPerDay: 10, totalPerDay: 10 } } };
  const day = at(2026, 9, 8);
  s = complete(s, 'read', '', day);
  assert.equal(totalXP(s), 10);
  s = complete(s, 'study', '', day);
  assert.equal(totalXP(s), 10);
  assert.equal(s.events.at(-1).xp, 0);
});

test('níveis são de 100 XP e não caem por ausência', () => {
  assert.deepEqual(level(0), { number: 1, current: 0, next: 100 });
  assert.deepEqual(level(135), { number: 2, current: 35, next: 100 });
  const s = complete(initialState(), 'read', '', at(2026, 0, 1));
  assert.equal(level(totalXP(s)).number, 1);
  assert.equal(totalXP(s), 10); // meses depois o XP continua o mesmo
});

test('criação de missão valida título, área, período, meta e XP', () => {
  const s = initialState();
  assert.throws(() => addMission(s, { title: '', area: 'company', period: 'daily', target: 1, xp: 5 }), /título/);
  assert.throws(() => addMission(s, { title: 'X'.repeat(141), area: 'company', period: 'daily', target: 1, xp: 5 }), /título/);
  assert.throws(() => addMission(s, { title: 'X', area: 'inexistente', period: 'daily', target: 1, xp: 5 }), /Área/);
  assert.throws(() => addMission(s, { title: 'X', area: 'company', period: 'anual', target: 1, xp: 5 }), /Área/);
  assert.throws(() => addMission(s, { title: 'X', area: 'company', period: 'daily', target: 0, xp: 5 }), /meta/);
  assert.throws(() => addMission(s, { title: 'X', area: 'company', period: 'daily', target: 1, xp: 31 }), /XP/);
  const ok = addMission(s, { title: 'Entrega de site', area: 'company', period: 'weekly', target: 1, xp: 20, sidequest: true });
  assert.equal(ok.missions.at(-1).sidequest, true);
  assert.equal(ok.missions.at(-1).kind, 'regular');
});

test('ajuste de missão mantém id e tipo; medicação continua sem XP', () => {
  let s = initialState();
  s = editMission(s, 'read', { title: 'Ler por 10 minutos', area: 'intelligence', period: 'daily', target: 2, xp: 12 });
  const read = s.missions.find(m => m.id === 'read');
  assert.equal(read.title, 'Ler por 10 minutos');
  assert.equal(read.target, 2);
  assert.equal(read.kind, 'regular');
  s = editMission(s, 'med-pm', { title: 'Remédio da noite', area: 'wellbeing', period: 'daily', target: 1, xp: 30 });
  assert.equal(s.missions.find(m => m.id === 'med-pm').xp, 0);
  assert.throws(() => editMission(s, 'inexistente', { title: 'X', area: 'company', period: 'daily', target: 1, xp: 1 }), /não encontrada/);
});

test('arquivar preserva o histórico e bloqueia novos registros', () => {
  let s = complete(initialState(), 'read', '', at(2026, 9, 8));
  s = archiveMission(s, 'read', at(2026, 9, 9));
  assert.equal(activeMissions(s, 'daily').some(m => m.id === 'read'), false);
  assert.equal(totalXP(s), 10, 'o XP já conquistado permanece');
  assert.throws(() => complete(s, 'read', '', at(2026, 9, 10)), /arquivada/);
  s = restoreMission(s, 'read');
  assert.equal(activeMissions(s, 'daily').some(m => m.id === 'read'), true);
  assert.equal(s.missions.find(m => m.id === 'read').archivedAt, undefined);
  validateBackup(clone(s));
});

test('sono usa a hora de acordar como data do registro e recusa intervalos impossíveis', () => {
  let s = initialState();
  s = logSleep(s, { bed: new Date(2026, 9, 8, 3, 30), wake: new Date(2026, 9, 8, 11, 0), note: 'acordei cansado' });
  const e = s.events[0];
  assert.equal(e.type, 'sleep');
  assert.equal(e.periodKey, '2026-10-08');
  assert.equal(e.xp, 0);
  assert.equal(e.sleep.hours, 7.5);
  assert.throws(() => logSleep(s, { bed: new Date(2026, 9, 8, 11), wake: new Date(2026, 9, 8, 3) }), /intervalo/);
  assert.throws(() => logSleep(s, { bed: new Date(2026, 9, 1), wake: new Date(2026, 9, 8) }), /intervalo/);
  assert.equal(sleepRecords(s, 7, at(2026, 9, 8)).length, 1);
  assert.equal(sleepRecords(s, 7, at(2026, 10, 8)).length, 0);
  validateBackup(clone(s));
});

test('correção remove o registro e recalcula o XP', () => {
  let s = complete(initialState(), 'read', '', at(2026, 9, 8));
  assert.equal(totalXP(s), 10);
  s = removeEvent(s, s.events[0].id);
  assert.equal(totalXP(s), 0);
  assert.equal(s.events.length, 0);
  assert.throws(() => removeEvent(s, 'inexistente'), /não encontrado/);
});

test('comparação olha a janela atual contra a anterior do mesmo tamanho', () => {
  let s = initialState();
  const hoje = at(2026, 9, 8);
  s = complete(s, 'read', '', at(2026, 9, 8));
  s = complete(s, 'study', '', at(2026, 9, 7));
  s = complete(s, 'read', '', at(2026, 9, 1)); // janela anterior
  const c = compare(s, 7, hoje);
  assert.equal(c.current.records, 2);
  assert.equal(c.current.xp, 20);
  assert.equal(c.current.activeDays, 2);
  assert.equal(c.previous.records, 1);
  assert.equal(c.current.byArea.intelligence.records, 2);
  assert.equal(c.current.byArea.strength.records, 0);
});

test('migração v1 para v2 preserva histórico e completa configurações', () => {
  const v1 = {
    version: 1,
    missions: [{ id: 'read', title: 'Ler', area: 'intelligence', period: 'daily', target: 1, xp: 10, kind: 'regular' }],
    events: [
      { id: 'a', type: 'mission', missionId: 'read', title: 'Ler', area: 'intelligence', period: 'daily', periodKey: '2026-10-01', at: '2026-10-01T10:00:00.000Z', xp: 10, note: '', kind: 'regular' },
      { id: 'b', type: 'mission', missionId: 'sleep-log', title: 'Sono registrado', area: 'wellbeing', period: 'daily', periodKey: '2026-10-02', at: '2026-10-02T10:00:00.000Z', xp: 0, note: '', kind: 'sleep', sleep: { bed: '2026-10-02T02:00:00.000Z', wake: '2026-10-02T10:00:00.000Z' } }
    ],
    chat: [{ role: 'user', content: 'olá' }],
    settings: { name: 'Eu', nightReminder: true, aiEndpoint: '', aiContext: false },
    drafts: []
  };
  const next = validateBackup(clone(v1));
  assert.equal(next.version, SCHEMA_VERSION);
  assert.equal(next.events.length, 2, 'nenhum registro é perdido na migração');
  assert.equal(next.events[1].type, 'sleep');
  assert.equal(next.settings.name, 'Eu');
  assert.equal(next.settings.nightReminder, true);
  assert.equal(next.settings.nightReminderTime, defaultSettings().nightReminderTime);
  assert.equal(next.settings.lockOnResume, true);
  assert.deepEqual(next.settings.limits, XP_LIMITS);
  assert.equal(totalXP(next), 10);
});

test('backup de versão futura é recusado sem apagar nada', () => {
  const s = { ...initialState(), version: SCHEMA_VERSION + 1 };
  assert.throws(() => migrate(s), /versão mais nova/);
  assert.throws(() => validateBackup({}), /versão/);
  assert.throws(() => validateBackup(null), /vazio/);
});

test('estado atual passa pela validação sem alteração', () => {
  let s = initialState();
  s = complete(s, 'study', 'anotação', at(2026, 9, 8));
  s = logSleep(s, { bed: new Date(2026, 9, 8, 2), wake: new Date(2026, 9, 8, 9) });
  assert.deepEqual(validateBackup(clone(s)), s);
});

test('validação recusa backups quebrados', () => {
  const s = complete(initialState(), 'read', '', at(2026, 9, 8));
  assert.throws(() => validateBackup({ ...clone(s), missions: [...clone(s).missions, clone(s).missions[0]] }), /Missões inválidas/);
  assert.throws(() => validateBackup({ ...clone(s), events: [{ ...clone(s).events[0], xp: 999 }] }), /Histórico inválido/);
  assert.throws(() => validateBackup({ ...clone(s), events: [{ ...clone(s).events[0], area: 'nenhuma' }] }), /Histórico inválido/);
  assert.throws(() => validateBackup({ ...clone(s), events: [{ ...clone(s).events[0], periodKey: 'ontem' }] }), /Histórico inválido/);
  assert.throws(() => validateBackup({ ...clone(s), events: [{ ...clone(s).events[0], type: 'sleep' }] }), /sono inválido/);
  assert.throws(() => validateBackup({ ...clone(s), chat: [{ role: 'sistema', content: 'x' }] }), /Conversa inválida/);
  const medicated = clone(s);
  medicated.missions.find(m => m.id === 'med-am').xp = 10;
  assert.throws(() => validateBackup(medicated), /Medicação não recebe XP/);
  const http = clone(s);
  http.settings.aiEndpoint = 'http://exemplo.com/chat';
  assert.throws(() => validateBackup(http), /IA inválido/);
  const comCredencial = clone(s);
  comCredencial.settings.aiEndpoint = 'https://u:p@exemplo.com/chat';
  assert.throws(() => validateBackup(comCredencial), /IA inválido/);
  const hora = clone(s);
  hora.settings.nightReminderTime = '25:00';
  assert.throws(() => validateBackup(hora), /Configurações inválidas/);
  const limites = clone(s);
  limites.settings.limits = { areaPerDay: -1, totalPerDay: 10 };
  assert.throws(() => validateBackup(limites), /Limites de XP inválidos/);
});
