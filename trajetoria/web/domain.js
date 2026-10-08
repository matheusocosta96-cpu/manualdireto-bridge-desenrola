// Regras do Trajetória. Nenhuma dependência externa: este arquivo roda igual
// no navegador, no WebView do Android e no node --test.

export const SCHEMA_VERSION = 2;

export const AREAS = [
  { id: 'wellbeing',    name: 'Bem-estar',    icon: '☀', color: '#e9b57a' },
  { id: 'intelligence', name: 'Inteligência', icon: '◎', color: '#a69bea' },
  { id: 'company',      name: 'Empresa',      icon: '▥', color: '#7fb8df' },
  { id: 'strength',     name: 'Força',        icon: '◇', color: '#dc9baa' },
  { id: 'endurance',    name: 'Resistência',  icon: '↗', color: '#8bc5aa' }
];

export const PERIODS = { daily: 'Diárias', weekly: 'Semanais', monthly: 'Mensais' };

export const KINDS = ['regular', 'wake', 'medication'];

// Limites de XP. O teto por registro impede missões infladas; os tetos diários
// evitam que uma jornada longa vire pontuação maior. Passar do teto não bloqueia
// o registro: a ação continua no histórico, apenas sem XP adicional.
export const XP_LIMITS = { perRecord: 30, areaPerDay: 60, totalPerDay: 150 };

export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const XP_PER_LEVEL = 100;
const NOTE_LIMIT = 2000;

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Semana de segunda a domingo; mês pelo calendário local.
export function periodKey(period, date = new Date()) {
  if (period === 'daily') return dayKey(date);
  if (period === 'monthly') return dayKey(date).slice(0, 7);
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return dayKey(monday);
}

export function initialState() {
  return {
    version: SCHEMA_VERSION,
    missions: [
      { id: 'wake',   title: 'Registrar quando acordei', area: 'wellbeing',    period: 'daily', target: 1, xp: 5,  kind: 'wake' },
      { id: 'med-am', title: 'Remédio da manhã',         area: 'wellbeing',    period: 'daily', target: 1, xp: 0,  kind: 'medication' },
      { id: 'med-pm', title: 'Remédio da noite',         area: 'wellbeing',    period: 'daily', target: 1, xp: 0,  kind: 'medication' },
      { id: 'read',   title: 'Ler por 5 minutos',        area: 'intelligence', period: 'daily', target: 1, xp: 10, kind: 'regular' },
      { id: 'study',  title: 'Estudar por 5 minutos',    area: 'intelligence', period: 'daily', target: 1, xp: 10, kind: 'regular' }
    ],
    events: [],
    chat: [],
    settings: defaultSettings(),
    drafts: defaultDrafts()
  };
}

export function defaultSettings() {
  return {
    name: 'Você',
    nightReminder: false,
    nightReminderTime: '20:00',
    morningReminder: true,
    lockOnResume: true,
    aiEndpoint: '',
    aiContext: false,
    limits: { ...XP_LIMITS }
  };
}

function defaultDrafts() {
  return [
    { title: 'Natação pela manhã', detail: 'Sexta, sábado e domingo. Ative quando as aulas realmente começarem.', area: 'endurance', period: 'weekly', target: 3, xp: 15, days: [5, 6, 0] },
    { title: 'Planejar as duas frentes da empresa', detail: 'Escolher uma entrega de sites e uma do SaaS.', area: 'company', period: 'weekly', target: 1, xp: 15 },
    { title: 'Calistenia em casa', detail: 'Definir primeiro uma sessão inicial possível.', area: 'strength', period: 'weekly', target: 1, xp: 10 },
    { title: 'Corrida', detail: 'Escolher frequência e uma sessão inicial possível.', area: 'endurance', period: 'weekly', target: 1, xp: 10 }
  ];
}

export function area(id) {
  return AREAS.find(a => a.id === id);
}

export function activeMissions(state, period) {
  return state.missions.filter(m => !m.archivedAt && (!period || m.period === period));
}

export function progress(state, mission, date = new Date()) {
  const key = periodKey(mission.period, date);
  return state.events.filter(e => e.missionId === mission.id && e.periodKey === key).length;
}

export function eventsOfDay(state, date = new Date()) {
  const key = dayKey(date);
  return state.events.filter(e => dayKey(new Date(e.at)) === key);
}

function limits(state) {
  const configured = (state.settings && state.settings.limits) || {};
  return { ...XP_LIMITS, ...configured };
}

// Quanto XP a próxima ação desta área ainda rende hoje.
export function remainingXP(state, areaId, date = new Date()) {
  const lim = limits(state);
  const day = eventsOfDay(state, date);
  const used = day.reduce((sum, e) => sum + e.xp, 0);
  const usedInArea = day.filter(e => e.area === areaId).reduce((sum, e) => sum + e.xp, 0);
  return Math.max(0, Math.min(lim.areaPerDay - usedInArea, lim.totalPerDay - used));
}

export function complete(state, id, note = '', date = new Date()) {
  const mission = state.missions.find(m => m.id === id);
  if (!mission) throw Error('Missão não encontrada.');
  if (mission.archivedAt) throw Error('Esta missão está arquivada.');
  if (progress(state, mission, date) >= mission.target) throw Error('Meta deste período já concluída.');
  const planned = mission.xp;
  const granted = Math.min(planned, remainingXP(state, mission.area, date));
  const event = {
    id: uuid(),
    type: 'mission',
    missionId: mission.id,
    title: mission.title,
    area: mission.area,
    period: mission.period,
    periodKey: periodKey(mission.period, date),
    at: date.toISOString(),
    xp: granted,
    note: String(note).slice(0, NOTE_LIMIT),
    kind: mission.kind || 'regular'
  };
  if (granted !== planned) event.xpPlanned = planned;
  return { ...state, events: [...state.events, event] };
}

// Sono entra como registro próprio: a data do evento é a hora de acordar.
export function logSleep(state, { bed, wake, note = '' }) {
  const bedAt = new Date(bed);
  const wakeAt = new Date(wake);
  const hours = (wakeAt - bedAt) / 3600000;
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    throw Error('Confira os horários: o intervalo deve ser maior que zero e de até 24 horas.');
  }
  const event = {
    id: uuid(),
    type: 'sleep',
    missionId: 'sleep-log',
    title: 'Sono registrado',
    area: 'wellbeing',
    period: 'daily',
    periodKey: periodKey('daily', wakeAt),
    at: wakeAt.toISOString(),
    xp: 0,
    note: String(note).slice(0, NOTE_LIMIT),
    kind: 'sleep',
    sleep: { bed: bedAt.toISOString(), wake: wakeAt.toISOString(), hours: Number(hours.toFixed(2)) }
  };
  return { ...state, events: [...state.events, event] };
}

export function removeEvent(state, id) {
  if (!state.events.some(e => e.id === id)) throw Error('Registro não encontrado.');
  return { ...state, events: state.events.filter(e => e.id !== id) };
}

export function totalXP(state, areaId) {
  return state.events.filter(e => !areaId || e.area === areaId).reduce((sum, e) => sum + e.xp, 0);
}

export function level(xp) {
  return { number: Math.floor(xp / XP_PER_LEVEL) + 1, current: xp % XP_PER_LEVEL, next: XP_PER_LEVEL };
}

function checkMissionInput(input) {
  const title = String(input.title || '').trim();
  if (!title || title.length > 140) throw Error('Escreva um título de até 140 caracteres.');
  if (!AREAS.some(a => a.id === input.area) || !PERIODS[input.period]) throw Error('Área ou período inválido.');
  const target = Number(input.target);
  if (!Number.isInteger(target) || target < 1 || target > 31) throw Error('A meta deve ser de 1 a 31 registros por período.');
  const xp = Number(input.xp ?? 10);
  if (!Number.isInteger(xp) || xp < 0 || xp > XP_LIMITS.perRecord) throw Error(`Use de 0 a ${XP_LIMITS.perRecord} XP por registro.`);
  const days = Array.isArray(input.days)
    ? input.days.map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6)
    : null;
  const fields = { title, area: input.area, period: input.period, target, xp, sidequest: !!input.sidequest };
  if (days && days.length) fields.days = [...new Set(days)].sort();
  return fields;
}

export function addMission(state, input) {
  const fields = checkMissionInput(input);
  const kind = KINDS.includes(input.kind) ? input.kind : 'regular';
  const mission = { id: uuid(), ...fields, kind, xp: kind === 'medication' ? 0 : fields.xp };
  return { ...state, missions: [...state.missions, mission] };
}

export function editMission(state, id, input) {
  const current = state.missions.find(m => m.id === id);
  if (!current) throw Error('Missão não encontrada.');
  const fields = checkMissionInput(input);
  const next = { ...current, ...fields, xp: current.kind === 'medication' ? 0 : fields.xp };
  if (!fields.days) delete next.days;
  return { ...state, missions: state.missions.map(m => (m.id === id ? next : m)) };
}

// Arquivar preserva todo o histórico já registrado; a missão sai das listas.
export function archiveMission(state, id, date = new Date()) {
  if (!state.missions.some(m => m.id === id)) throw Error('Missão não encontrada.');
  return {
    ...state,
    missions: state.missions.map(m => (m.id === id ? { ...m, archivedAt: date.toISOString() } : m))
  };
}

export function restoreMission(state, id) {
  return {
    ...state,
    missions: state.missions.map(m => {
      if (m.id !== id) return m;
      const copy = { ...m };
      delete copy.archivedAt;
      return copy;
    })
  };
}

function windowBounds(days, date) {
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  end.setDate(end.getDate() + 1);
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  const before = new Date(start);
  before.setDate(before.getDate() - days);
  return { before, start, end };
}

function summarize(state, from, to) {
  const inside = state.events.filter(e => {
    const at = new Date(e.at);
    return at >= from && at < to;
  });
  const byArea = {};
  for (const a of AREAS) byArea[a.id] = { records: 0, xp: 0 };
  for (const e of inside) {
    if (!byArea[e.area]) byArea[e.area] = { records: 0, xp: 0 };
    byArea[e.area].records += 1;
    byArea[e.area].xp += e.xp;
  }
  const activeDays = new Set(inside.map(e => dayKey(new Date(e.at)))).size;
  return { records: inside.length, xp: inside.reduce((s, e) => s + e.xp, 0), activeDays, byArea };
}

// Comparação com você mesmo: a janela atual contra a janela anterior do mesmo tamanho.
export function compare(state, days = 7, date = new Date()) {
  const { before, start, end } = windowBounds(days, date);
  return { days, current: summarize(state, start, end), previous: summarize(state, before, start) };
}

export function sleepRecords(state, days = 14, date = new Date()) {
  const { start, end } = windowBounds(days, date);
  return state.events
    .filter(e => e.type === 'sleep' && e.sleep)
    .filter(e => {
      const at = new Date(e.at);
      return at >= start && at < end;
    })
    .sort((a, b) => new Date(a.at) - new Date(b.at));
}

// ---------------------------------------------------------------------------
// Migração e validação. Nada é apagado numa atualização de esquema.
// ---------------------------------------------------------------------------

export function migrate(value) {
  if (!value || typeof value !== 'object') throw Error('Backup vazio ou ilegível.');
  if (typeof value.version !== 'number' || value.version < 1) throw Error('Backup sem versão reconhecida.');
  if (value.version > SCHEMA_VERSION) {
    throw Error('Este backup vem de uma versão mais nova do aplicativo. Atualize o aplicativo antes de restaurar.');
  }
  let next = value;
  if (next.version === 1) {
    next = {
      ...next,
      version: 2,
      settings: { ...defaultSettings(), ...(next.settings || {}), limits: { ...XP_LIMITS, ...((next.settings || {}).limits || {}) } },
      events: (next.events || []).map(e => (e.kind === 'sleep' ? { ...e, type: 'sleep' } : e)),
      drafts: Array.isArray(next.drafts) ? next.drafts : defaultDrafts()
    };
  }
  return next;
}

function validArea(id) {
  return AREAS.some(a => a.id === id);
}

export function validateBackup(value) {
  const state = migrate(value);
  if (!Array.isArray(state.missions) || !Array.isArray(state.events) || !Array.isArray(state.chat) || !Array.isArray(state.drafts) || !state.settings) {
    throw Error('Backup incompatível.');
  }
  const seenMissions = new Set();
  for (const m of state.missions) {
    if (typeof m.id !== 'string' || !m.id || seenMissions.has(m.id)) throw Error('Missões inválidas.');
    seenMissions.add(m.id);
    checkMissionInput(m);
    if (m.kind !== undefined && !KINDS.includes(m.kind)) throw Error('Tipo de missão inválido.');
    if (m.kind === 'medication' && m.xp !== 0) throw Error('Medicação não recebe XP.');
    if (m.archivedAt !== undefined && !Number.isFinite(Date.parse(m.archivedAt))) throw Error('Data de arquivamento inválida.');
  }
  const seenEvents = new Set();
  for (const e of state.events) {
    const okType = e.type === 'mission' || e.type === 'sleep';
    const okXP = Number.isInteger(e.xp) && e.xp >= 0 && e.xp <= XP_LIMITS.perRecord;
    const okPlanned = e.xpPlanned === undefined || (Number.isInteger(e.xpPlanned) && e.xpPlanned >= 0 && e.xpPlanned <= XP_LIMITS.perRecord);
    if (typeof e.id !== 'string' || !e.id || seenEvents.has(e.id) || !okType ||
        typeof e.missionId !== 'string' || typeof e.title !== 'string' ||
        !validArea(e.area) || !PERIODS[e.period] ||
        typeof e.periodKey !== 'string' || !/^\d{4}-\d{2}(-\d{2})?$/.test(e.periodKey) ||
        !Number.isFinite(Date.parse(e.at)) || !okXP || !okPlanned || typeof e.note !== 'string') {
      throw Error('Histórico inválido.');
    }
    if (e.type === 'sleep') {
      const s = e.sleep;
      if (!s || !Number.isFinite(Date.parse(s.bed)) || !Number.isFinite(Date.parse(s.wake))) throw Error('Registro de sono inválido.');
    }
    seenEvents.add(e.id);
  }
  if (state.chat.some(m => !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string')) {
    throw Error('Conversa inválida.');
  }
  const s = state.settings;
  if (typeof s.name !== 'string' || typeof s.aiEndpoint !== 'string' ||
      typeof s.aiContext !== 'boolean' || typeof s.nightReminder !== 'boolean' ||
      typeof s.morningReminder !== 'boolean' || typeof s.lockOnResume !== 'boolean' ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.nightReminderTime || '')) {
    throw Error('Configurações inválidas.');
  }
  const lim = s.limits || {};
  for (const field of ['areaPerDay', 'totalPerDay']) {
    if (!Number.isInteger(lim[field]) || lim[field] < 0 || lim[field] > 1000) throw Error('Limites de XP inválidos.');
  }
  if (s.aiEndpoint) {
    let url;
    try {
      url = new URL(s.aiEndpoint);
    } catch {
      throw Error('Endereço do serviço de IA inválido.');
    }
    if (url.protocol !== 'https:' || url.username || url.password) throw Error('Endereço do serviço de IA inválido.');
  }
  for (const draft of state.drafts) checkMissionInput(draft);
  return state;
}
