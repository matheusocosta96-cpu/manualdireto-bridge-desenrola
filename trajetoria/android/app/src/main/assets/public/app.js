// Interface do Trajetória. Sem bibliotecas: tudo é string de HTML escapada e
// listeners ligados depois de cada render.
import {
  AREAS, PERIODS, SCHEMA_VERSION, XP_LIMITS, WEEKDAYS,
  area, dayKey, activeMissions, progress, complete, logSleep, removeEvent,
  totalXP, level, addMission, editMission, archiveMission, restoreMission,
  remainingXP, compare, sleepRecords, eventsOfDay, validateBackup
} from './domain.js';
import {
  read, write, readRaw, storageKind,
  encryptBackup, decryptBackup, isEncryptedBackup, saveBackupFile
} from './storage.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = d => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
const fmtDateTime = d => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const native = () => window.Android;

let state = null;
let loadError = '';
let page = 'today';
let period = 'daily';
let compareDays = 7;
let busy = false;
let nativeStatus = null;

const modal = document.querySelector('#modal');

try {
  state = read();
} catch (err) {
  loadError = err.message || 'Não foi possível abrir os dados.';
}

function toast(message) {
  const el = document.querySelector('#toast');
  el.textContent = message;
  el.style.display = 'block';
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.style.display = 'none'; }, 4600);
}

function commit(next) {
  write(next);
  state = next;
  render();
}

function refreshNativeStatus() {
  const api = native();
  if (!api || !api.status) return;
  try {
    nativeStatus = JSON.parse(api.status());
  } catch {
    nativeStatus = null;
  }
}

// ---------------------------------------------------------------------------
// Blocos reutilizados
// ---------------------------------------------------------------------------

function tabs() {
  return `<div class="tabs" role="tablist">${Object.entries(PERIODS).map(([id, name]) =>
    `<button role="tab" aria-selected="${period === id}" data-period="${id}" class="${period === id ? 'active' : ''}">${name}</button>`).join('')}</div>`;
}

function dayHint(mission) {
  if (!mission.days || !mission.days.length) return '';
  return ` · ${mission.days.map(d => WEEKDAYS[d].slice(0, 3)).join(', ')}`;
}

function missionRow(mission) {
  const done = progress(state, mission);
  const full = done >= mission.target;
  const a = area(mission.area);
  const left = remainingXP(state, mission.area);
  const reward = mission.xp === 0
    ? 'Cuidado pessoal'
    : (left === 0 ? `+0 XP hoje · teto` : `+${Math.min(mission.xp, left)} XP`);
  const canEdit = (mission.kind || 'regular') === 'regular';
  return `<div class="mission">
    <button class="check ${full ? 'done' : ''}" data-complete="${esc(mission.id)}" ${full ? 'disabled' : ''}
      aria-label="Registrar ${esc(mission.title)}">${full ? '✓' : '+'}</button>
    <div class="mission-info">
      <strong>${esc(mission.title)}</strong>
      <small style="color:${a.color}">${a.name} · ${done}/${mission.target}${mission.sidequest ? ' · Side quest' : ''}${dayHint(mission)}</small>
      <span class="inline-actions">
        ${canEdit ? `<button class="small ghost" data-edit="${esc(mission.id)}">Ajustar</button>` : ''}
        ${canEdit ? `<button class="small ghost" data-archive="${esc(mission.id)}">Arquivar</button>` : ''}
      </span>
    </div>
    <span class="reward">${reward}</span>
  </div>`;
}

function missionList(onlySidequests) {
  const list = activeMissions(state, period).filter(m => !!m.sidequest === !!onlySidequests);
  if (!list.length) {
    return `<div class="empty">${onlySidequests
      ? 'Nenhuma side quest neste período.'
      : `Você ainda não definiu missões ${PERIODS[period].toLowerCase()}.<br>Escolha uma meta que caiba na sua rotina.`}</div>`;
  }
  return list.map(missionRow).join('');
}

function areaCards() {
  return `<div class="areas">${AREAS.map(a => {
    const xp = totalXP(state, a.id);
    return `<div class="area" style="--area:${a.color}">
      <span class="symbol">${a.icon}</span>
      <div class="name">${a.name}</div>
      <div class="meta">Nível ${level(xp).number} · ${xp} XP</div>
    </div>`;
  }).join('')}</div>`;
}

function dailyBudget() {
  const lim = { ...XP_LIMITS, ...(state.settings.limits || {}) };
  const used = eventsOfDay(state).reduce((sum, e) => sum + e.xp, 0);
  const pct = lim.totalPerDay ? Math.min(100, Math.round((used / lim.totalPerDay) * 100)) : 0;
  return `<div class="budget">
    <div class="row"><span class="caption">XP de hoje</span><span class="caption muted">${used} / ${lim.totalPerDay}</span></div>
    <div class="xp"><div style="width:${pct}%"></div></div>
    <span class="caption muted">Teto diário por área: ${lim.areaPerDay} XP. Depois do teto a ação continua registrada, só não soma XP — trabalhar mais horas não rende mais pontos.</span>
  </div>`;
}

// ---------------------------------------------------------------------------
// Telas
// ---------------------------------------------------------------------------

function today() {
  const xp = totalXP(state);
  const l = level(xp);
  const records = eventsOfDay(state).length;
  const pending = activeMissions(state, 'daily').filter(m => progress(state, m) < m.target);
  return `<div class="topline">
      <div><div class="eyebrow">Um passo de cada vez</div><h1>Hoje</h1></div>
      <span class="pill">${esc(new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }))}</span>
    </div>
    <p>Seu parâmetro é você. Faça o que for possível hoje.</p>
    <div class="hero">
      <div>
        <div class="eyebrow">${esc(state.settings.name)} · Progresso pessoal</div>
        <strong>${xp} XP de ações reais</strong>
        <p>${records} ${records === 1 ? 'registro' : 'registros'} hoje · ${pending.length} ${pending.length === 1 ? 'missão diária em aberto' : 'missões diárias em aberto'}</p>
        <div class="xp"><div style="width:${l.current}%"></div></div>
        <span class="caption muted">${l.current} / 100 XP para o próximo nível</span>
      </div>
      <div class="level-badge">NÍVEL<b>${l.number}</b></div>
    </div>
    ${areaCards()}
    ${dailyBudget()}
    <div class="section">
      <div class="row"><h2>Suas missões</h2><button class="small ghost" data-action="new">+ Nova missão</button></div>
      ${tabs()}
      ${missionList(false)}
    </div>
    <div class="notice">O nível registra ações, sem medir seu valor pessoal. Descansar e recomeçar fazem parte: não existe perda de nível por ausência. Os registros de medicação ficam no histórico, sem XP.</div>
    <div class="section row"><h2>Como foi seu sono?</h2><button class="small" data-action="sleep">Registrar sono</button></div>`;
}

function missions() {
  const archived = state.missions.filter(m => m.archivedAt);
  return `<div class="eyebrow">Planejar com intenção</div>
    <h1>Missões e side quests</h1>
    <p>Metas pequenas valem mais que planos grandes. As diárias renovam por dia, as semanais na segunda-feira e as mensais no primeiro dia do mês.</p>
    <button class="primary" data-action="new">+ Criar missão</button>
    ${tabs()}
    <h2 class="section">Missões</h2>
    ${missionList(false)}
    <h2 class="section">Side quests</h2>
    ${missionList(true)}
    <div class="section">
      <h2>Para combinar com você</h2>
      <p>Estas sugestões ainda não estão ativas. Ative quando a atividade realmente começar.</p>
      ${state.drafts.length ? state.drafts.map((d, i) => `<div class="card" style="margin-bottom:12px">
        <div class="row"><h3>${esc(d.title)}</h3><button class="small" data-draft="${i}">Definir</button></div>
        <p>${esc(d.detail || '')}</p>
        <span class="caption muted">${area(d.area).name} · ${PERIODS[d.period]} · ${d.target} registro(s)${d.days ? ' · ' + d.days.map(x => WEEKDAYS[x].slice(0, 3)).join(', ') : ''}</span>
      </div>`).join('') : '<div class="empty">Nenhuma sugestão pendente.</div>'}
    </div>
    ${archived.length ? `<div class="section">
      <h2>Arquivadas</h2>
      <p>O histórico dessas missões continua no seu progresso.</p>
      ${archived.map(m => `<div class="mission"><div class="mission-info"><strong>${esc(m.title)}</strong>
        <small>${area(m.area).name} · ${PERIODS[m.period]} · arquivada em ${esc(fmtDate(m.archivedAt))}</small></div>
        <button class="small ghost" data-restore="${esc(m.id)}">Reativar</button></div>`).join('')}
    </div>` : ''}`;
}

function deltaLabel(current, previous) {
  const diff = current - previous;
  if (diff === 0) return '<span class="delta same">igual ao período anterior</span>';
  const sign = diff > 0 ? '+' : '−';
  return `<span class="delta ${diff > 0 ? 'up' : 'down'}">${sign}${Math.abs(diff)} em relação ao período anterior</span>`;
}

function calendar() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const cells = [];
  for (let i = 0; i < (first.getDay() + 6) % 7; i++) cells.push('<div></div>');
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  for (let n = 1; n <= lastDay; n++) {
    const key = dayKey(new Date(now.getFullYear(), now.getMonth(), n));
    const count = state.events.filter(e => dayKey(new Date(e.at)) === key).length;
    cells.push(`<div class="day ${count ? 'has' : ''} ${key === dayKey() ? 'today' : ''}">${n}${count ? `<b>${count}</b>` : ''}</div>`);
  }
  return `<div class="card">
    <h2>${esc(now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))}</h2>
    <div class="calendar">${['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map(x => `<div class="weekday">${x}</div>`).join('')}${cells.join('')}</div>
    <span class="caption muted">Cada número é a quantidade de registros do dia. Um dia vazio não apaga o que já passou.</span>
  </div>`;
}

function history() {
  const c = compare(state, compareDays);
  const sleep = sleepRecords(state, 14);
  const events = [...state.events].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 80);
  return `<div class="eyebrow">Você em relação a você</div>
    <h1>Progresso</h1>
    <p>Comparação entre a janela atual e a anterior do mesmo tamanho. Sem rankings e sem outras pessoas.</p>
    <div class="tabs">${[7, 30].map(d => `<button data-compare="${d}" class="${compareDays === d ? 'active' : ''}">${d} dias</button>`).join('')}</div>
    <div class="cards">
      <div class="card"><h3>Registros</h3><div class="number">${c.current.records}</div>${deltaLabel(c.current.records, c.previous.records)}</div>
      <div class="card"><h3>XP no período</h3><div class="number">${c.current.xp}</div>${deltaLabel(c.current.xp, c.previous.xp)}</div>
      <div class="card"><h3>Dias com registro</h3><div class="number">${c.current.activeDays}/${compareDays}</div>${deltaLabel(c.current.activeDays, c.previous.activeDays)}</div>
      <div class="card"><h3>Experiência total</h3><div class="number">${totalXP(state)} XP</div><span class="caption muted">100 XP por nível · sem penalidade por ausência</span></div>
    </div>
    <div class="section">
      <h2>Por área</h2>
      <table class="table"><thead><tr><th>Área</th><th>Agora</th><th>Antes</th></tr></thead><tbody>
      ${AREAS.map(a => `<tr>
        <td><span style="color:${a.color}">${a.icon}</span> ${a.name}<small class="muted">nível ${level(totalXP(state, a.id)).number}</small></td>
        <td>${c.current.byArea[a.id].records} reg<small class="muted">${c.current.byArea[a.id].xp} XP</small></td>
        <td class="muted">${c.previous.byArea[a.id].records} reg<small>${c.previous.byArea[a.id].xp} XP</small></td>
      </tr>`).join('')}
      </tbody></table>
    </div>
    ${calendar()}
    <div class="section">
      <h2>Sono registrado</h2>
      ${sleep.length ? sleep.slice().reverse().map(e => `<div class="event">
        <div class="row"><strong>${esc(fmtDate(e.sleep.wake))}</strong><span class="reward">${e.sleep.hours.toFixed(1)} h na cama</span></div>
        <small>Deitou ${esc(fmtDateTime(e.sleep.bed))} · acordou ${esc(fmtDateTime(e.sleep.wake))}</small>
        ${e.note ? `<p>${esc(e.note)}</p>` : ''}
        <button class="small ghost" data-undo="${esc(e.id)}">Corrigir registro</button>
      </div>`).join('') : '<div class="empty">Sem registros de sono nos últimos 14 dias.<br>Registrar primeiro, definir horários depois.</div>'}
      <span class="caption muted">O intervalo é o tempo na cama informado por você; não mede o sono efetivo.</span>
    </div>
    <div class="section">
      <h2>Histórico</h2>
      ${events.length ? events.map(e => `<div class="event">
        <div class="row"><strong>${esc(e.title)}</strong><span class="reward">${e.xp ? `+${e.xp} XP` : 'Registro'}</span></div>
        <small>${esc(fmtDateTime(e.at))} · ${area(e.area).name}${e.xpPlanned !== undefined ? ` · teto diário atingido (${e.xpPlanned} XP não somados)` : ''}</small>
        ${e.note ? `<p>${esc(e.note)}</p>` : ''}
        <button class="small ghost" data-undo="${esc(e.id)}">Corrigir registro</button>
      </div>`).join('') : '<div class="empty">Seus primeiros registros aparecerão aqui.</div>'}
    </div>`;
}

function chat() {
  const studyMission = state.missions.find(m => m.id === 'study' && !m.archivedAt);
  const configured = !!state.settings.aiEndpoint;
  return `<div class="eyebrow">Aprender e construir</div>
    <h1>IA</h1>
    <p>Espaço para estudar programação, Direito e conhecimentos gerais, e para pensar as entregas da empresa.</p>
    ${configured
      ? '<span class="pill">Serviço configurado · as respostas vêm do seu serviço, não deste aplicativo</span>'
      : '<div class="notice">A IA ainda não está conectada. Você pode guardar perguntas aqui; respostas reais exigem um serviço configurado em Conexões. Este aplicativo nunca inventa uma resposta de IA.</div>'}
    <div class="chat" aria-live="polite">${state.chat.length
      ? state.chat.map(m => `<div class="message ${m.role}">${esc(m.content)}</div>`).join('')
      : '<div class="empty">O que você gostaria de aprender hoje?<br>Comece com uma dúvida pequena.</div>'}</div>
    <form id="chat-form" class="chat-form">
      <textarea name="message" aria-label="Sua mensagem" maxlength="6000" placeholder="Escreva sua pergunta…" required ${busy ? 'disabled' : ''}></textarea>
      <button class="primary" ${busy ? 'disabled' : ''}>${busy ? 'Enviando…' : configured ? 'Enviar' : 'Guardar'}</button>
    </form>
    <div class="section row">
      <span class="caption muted">A sessão só conta quando você registra o estudo.</span>
      <button class="small" data-complete="study" ${!studyMission || progress(state, studyMission) >= studyMission.target ? 'disabled' : ''}>Registrar estudo</button>
    </div>`;
}

function statusRow(label, ok, detail) {
  const mark = ok === null ? '○' : ok ? '●' : '▲';
  const cls = ok === null ? 'muted' : ok ? 'ok' : 'warn';
  return `<div class="status-row"><span class="dot ${cls}">${mark}</span><div><strong>${esc(label)}</strong><small>${esc(detail)}</small></div></div>`;
}

function deviceStatus() {
  if (storageKind() !== 'android') {
    return `<div class="card section"><h2>Estado do aparelho</h2>
      <p>Você está na prévia em navegador. Notificações em segundo plano, alarme exato, bloqueio por credencial e verificação do Health Connect existem apenas no aplicativo Android.</p></div>`;
  }
  const s = nativeStatus;
  if (!s) {
    return `<div class="card section"><h2>Estado do aparelho</h2><p>Não foi possível ler o estado do sistema.</p>
      <button class="small" data-action="refresh-status">Verificar novamente</button></div>`;
  }
  return `<div class="card section">
    <div class="row"><h2>Estado do aparelho</h2><button class="small ghost" data-action="refresh-status">Atualizar</button></div>
    <p>${esc(s.model || '')} · Android ${esc(String(s.release || ''))} · aplicativo ${esc(s.versionName || '')}</p>
    ${statusRow('Notificações', !!s.notificationsEnabled, s.notificationsEnabled ? 'Permitidas pelo sistema.' : 'Bloqueadas: autorize nas configurações do aplicativo.')}
    ${statusRow('Alarme exato', !!s.exactAlarms, s.exactAlarms ? 'O lembrete pode disparar no horário.' : 'Sem permissão de alarme exato: o lembrete pode atrasar.')}
    ${statusRow('Economia de bateria', !!s.ignoringBatteryOptimizations, s.ignoringBatteryOptimizations ? 'Sem restrição de bateria para este aplicativo.' : 'O HyperOS pode adiar o lembrete. Ajuste para “Sem restrições”.')}
    ${statusRow('Lembrete da noite', !!s.nightScheduled, s.nightScheduled ? `Próximo disparo: ${esc(s.nextAlarm || '—')}` : 'Nenhum alarme agendado.')}
    ${statusRow('Bloqueio de tela do aparelho', !!s.deviceSecure, s.deviceSecure ? 'O aplicativo pede sua credencial ao abrir.' : 'Sem bloqueio configurado: qualquer pessoa com o aparelho abre o aplicativo.')}
    ${statusRow('Health Connect', !!s.healthConnect, s.healthConnect ? 'Aplicativo presente no aparelho. A leitura de dados ainda não foi implementada.' : 'Não encontrado neste aparelho.')}
    <div class="actions"><button class="small" data-action="battery">Abrir ajuste de bateria</button><button class="small" data-action="app-settings">Abrir ajustes do aplicativo</button></div>
  </div>`;
}

function connections() {
  const lim = { ...XP_LIMITS, ...(state.settings.limits || {}) };
  return `<div class="eyebrow">Seu aplicativo, suas conexões</div>
    <h1>Conexões e ajustes</h1>
    <p>Nenhum serviço externo recebe seus dados até você configurar e enviar.</p>
    ${deviceStatus()}
    <div class="card section"><h2>Perfil</h2>
      <form id="profile" class="form"><label>Como quer aparecer?<input name="name" value="${esc(state.settings.name)}" maxlength="50" required></label><button>Salvar nome</button></form>
    </div>
    <div class="card section"><h2>Backup</h2>
      <p>O backup é a sua recuperação. Com senha, o arquivo sai cifrado (AES-GCM com chave derivada da senha) e só abre com ela — se perder a senha, o arquivo não volta.</p>
      <div class="row"><button data-action="export">Exportar backup</button><button data-action="import">Restaurar backup</button></div>
      <p class="caption">Esquema atual: v${SCHEMA_VERSION}. Backups de versões anteriores são migrados na restauração, sem apagar histórico.</p>
    </div>
    <div class="card section"><h2>Lembretes de medicação</h2>
      <p>Manhã: ao tocar em “Registrar quando acordei”. Noite: no horário abaixo. Os horários seguem a sua prescrição — este aplicativo não sugere mudanças. Dispensar a notificação não registra a tomada: a confirmação é sempre sua.</p>
      <form id="reminder-settings" class="form">
        <label>Horário do lembrete da noite<input name="nightTime" type="time" value="${esc(state.settings.nightReminderTime)}" required></label>
        <label class="checkbox-label"><input name="morning" type="checkbox" ${state.settings.morningReminder ? 'checked' : ''}>Notificar o remédio da manhã quando eu registrar que acordei</label>
        <button>Salvar horários</button>
      </form>
      <div class="row section">
        <button data-action="reminders">${state.settings.nightReminder ? 'Verificar / reagendar' : 'Ativar'} lembrete da noite</button>
        ${state.settings.nightReminder ? '<button class="small ghost" data-action="disable-reminders">Desativar</button>' : ''}
      </div>
    </div>
    <div class="card section"><h2>Limites de XP</h2>
      <p>Para o aplicativo não premiar jornadas longas. Acima do teto a ação continua registrada no histórico, sem XP.</p>
      <form id="limits" class="form"><div class="form-row">
        <label>Teto por área/dia<input name="areaPerDay" type="number" min="0" max="1000" value="${lim.areaPerDay}" required></label>
        <label>Teto total/dia<input name="totalPerDay" type="number" min="0" max="1000" value="${lim.totalPerDay}" required></label>
      </div><button>Salvar limites</button></form>
    </div>
    <div class="card section"><h2>Segurança</h2>
      <form id="security" class="form">
        <label class="checkbox-label"><input name="lockOnResume" type="checkbox" ${state.settings.lockOnResume ? 'checked' : ''}>Pedir a credencial do aparelho ao voltar para o aplicativo</label>
        <button>Salvar</button>
      </form>
      <p class="caption">No Android os dados são gravados cifrados com chave do Android Keystore e capturas de tela da janela ficam bloqueadas.</p>
    </div>
    <div class="card section"><h2>Chat com IA</h2>
      <p>O aplicativo fala com um serviço <strong>seu</strong>, por HTTPS. A chave do provedor fica no servidor, nunca aqui. O token abaixo é o que autentica você no seu serviço.</p>
      <form id="ai-settings" class="form">
        <label>Endereço HTTPS do serviço<input name="endpoint" type="url" placeholder="https://seu-servico/chat" value="${esc(state.settings.aiEndpoint)}"></label>
        <label>Token de acesso ao seu serviço<input name="token" type="password" placeholder="deixe em branco para manter" autocomplete="off"></label>
        <label class="checkbox-label"><input name="context" type="checkbox" ${state.settings.aiContext ? 'checked' : ''}>Enviar também os títulos das missões de estudo e empresa. Sono, medicação e registros de saúde nunca são enviados.</label>
        <button>Salvar configuração</button>
      </form>
      <div class="actions"><button class="small ghost" data-action="clear-chat">Apagar conversa</button></div>
      <p class="caption">${state.settings.aiEndpoint ? 'Token guardado neste aparelho: ' + (hasToken() ? 'sim' : 'não') : 'Sem serviço configurado.'} · Ver docs/AI.md para o contrato e server/ para um serviço pronto para publicar.</p>
    </div>
    ${[{ icon: '♡', title: 'Relógio Sentela', desc: 'Marca, modelo, aplicativo e API ainda não verificados. Sem isso não há como prometer integração.' },
       { icon: '▦', title: 'Calendário e ferramentas da empresa', desc: 'Nenhum conector implementado. Cada um exige autorização própria.' },
       { icon: '☁', title: 'Conta privada e sincronização', desc: 'Etapa futura. Hoje a recuperação é por backup exportado.' }]
      .map(c => `<div class="card integration"><div class="icon">${c.icon}</div><div class="info"><h3>${esc(c.title)}</h3><p>${esc(c.desc)}</p></div><span class="pill">Não implementado</span></div>`).join('')}`;
}

// ---------------------------------------------------------------------------
// Token do serviço de IA: fica fora do estado exportado em backup.
// ---------------------------------------------------------------------------

const TOKEN_KEY = 'trajetoria.ai.token';

function hasToken() {
  try {
    return !!localStorage.getItem(TOKEN_KEY);
  } catch {
    return false;
  }
}

function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

function writeToken(value) {
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    toast('Não foi possível guardar o token neste aparelho.');
  }
}

// ---------------------------------------------------------------------------
// Render e diálogos
// ---------------------------------------------------------------------------

const PAGES = { today, missions, history, chat, connections };

function recoveryScreen() {
  document.querySelector('#app').innerHTML = `<main class="content">
    <div class="eyebrow">Nada foi apagado</div>
    <h1>Não consegui abrir seus dados</h1>
    <p>${esc(loadError)}</p>
    <p>Os dados gravados continuam no aparelho. Exporte o arquivo bruto antes de qualquer restauração: ele é a cópia do que está salvo agora.</p>
    <div class="row"><button class="primary" id="raw-backup">Exportar dados brutos</button><button id="raw-import">Restaurar um backup</button></div>
  </main>`;
  document.querySelector('#raw-backup').onclick = () => {
    const raw = readRaw();
    if (!raw) { toast('Não há nada gravado para exportar.'); return; }
    saveBackupFile(raw, false);
  };
  document.querySelector('#raw-import').onclick = () => pickBackupFile();
}

function render() {
  if (!state) { recoveryScreen(); return; }
  const nav = [['today', '◉', 'Hoje'], ['missions', '☷', 'Missões'], ['history', '↗', 'Progresso'], ['chat', '◎', 'IA'], ['connections', '⚙', 'Conexões']];
  document.querySelector('#app').innerHTML = `<div class="shell">
    <aside class="sidebar">
      <div class="brand">trajetória<span>.</span></div>
      <div class="brand-sub">SEU PRÓPRIO PARÂMETRO</div>
      <nav class="nav" aria-label="Principal">${nav.map(([id, icon, label]) =>
        `<button data-page="${id}" class="${id === page ? 'active' : ''}"><span class="nav-icon">${icon}</span>${label}</button>`).join('')}</nav>
      <div class="privacy">◈ Dados neste aparelho<br>Versão pessoal · esquema v${SCHEMA_VERSION}</div>
    </aside>
    <main class="content"><div class="mobile-brand">trajetória.</div>${PAGES[page]()}</main>
  </div>`;
  bind();
}

function showDialog(html) {
  modal.innerHTML = html;
  modal.showModal();
  modal.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => modal.close(); });
}

function missionDialog(draft, editing) {
  const base = draft || {};
  showDialog(`<h2>${editing ? 'Ajustar missão' : draft ? 'Definir missão' : 'Nova missão'}</h2>
    <p>Escolha uma ação possível hoje. Você pode ajustar o plano quando quiser.</p>
    <form id="mission-form" class="form">
      <label>O que fazer?<input name="title" required maxlength="140" value="${esc(base.title || '')}"></label>
      <div class="form-row">
        <label>Área<select name="area">${AREAS.map(a => `<option value="${a.id}" ${base.area === a.id ? 'selected' : ''}>${a.name}</option>`).join('')}</select></label>
        <label>Período<select name="period">${Object.entries(PERIODS).map(([id, name]) => `<option value="${id}" ${(base.period || period) === id ? 'selected' : ''}>${name}</option>`).join('')}</select></label>
      </div>
      <div class="form-row">
        <label>Registros por período<input name="target" type="number" min="1" max="31" required value="${base.target || 1}"></label>
        <label>XP por registro<input name="xp" type="number" min="0" max="${XP_LIMITS.perRecord}" required value="${base.xp ?? 10}"></label>
      </div>
      <label class="checkbox-label"><input name="sidequest" type="checkbox" ${base.sidequest ? 'checked' : ''}>É uma side quest</label>
      <p class="caption">A meta limita o XP do período: natação com 3 registros semanais rende XP três vezes por semana, não mais.</p>
      <div class="actions"><button type="button" data-close>Cancelar</button><button class="primary">${editing ? 'Salvar ajuste' : 'Criar missão'}</button></div>
    </form>`);
  document.querySelector('#mission-form').onsubmit = e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const input = { ...Object.fromEntries(f), sidequest: f.has('sidequest'), days: base.days };
    try {
      if (editing) {
        commit(editMission(state, draft.id, input));
        toast('Missão ajustada.');
      } else {
        const next = addMission(state, input);
        commit({ ...next, drafts: draft ? next.drafts.filter(d => d !== draft) : next.drafts });
        toast('Missão adicionada.');
      }
      modal.close();
    } catch (err) {
      toast(err.message);
    }
  };
}

function completeDialog(id) {
  const m = state.missions.find(x => x.id === id && !x.archivedAt);
  if (!m) { toast('Essa missão não está ativa. Crie ou reative a missão para registrar.'); return; }
  const left = remainingXP(state, m.area);
  const explain = m.kind === 'medication'
    ? 'Confirme apenas se você realmente tomou a medicação prescrita.'
    : m.kind === 'wake' ? 'Este registro marca a hora em que você está acordando.' : 'Registre apenas uma ação que você realizou.';
  showDialog(`<h2>${esc(m.title)}</h2><p>${explain}</p>
    ${m.xp > 0 && left === 0 ? '<div class="notice">O teto de XP de hoje já foi alcançado. O registro entra no histórico sem XP — descansar agora é a melhor jogada.</div>' : ''}
    <form id="complete-form" class="form">
      <label>Observação (opcional)<textarea name="note" maxlength="2000" placeholder="${m.kind === 'regular' ? 'O que fez ou aprendeu?' : 'Alguma observação?'}"></textarea></label>
      <div class="actions"><button type="button" data-close>Cancelar</button><button class="primary">${m.kind === 'medication' ? 'Confirmar que tomei' : 'Registrar'}</button></div>
    </form>`);
  document.querySelector('#complete-form').onsubmit = e => {
    e.preventDefault();
    try {
      const next = complete(state, id, new FormData(e.target).get('note'));
      const saved = next.events[next.events.length - 1];
      commit(next);
      modal.close();
      toast(saved.xpPlanned !== undefined
        ? 'Registro salvo. O teto de XP de hoje já foi atingido, então ele não somou pontos.'
        : 'Registro salvo no seu histórico.');
      if (m.kind === 'wake' && state.settings.morningReminder && native() && native().morningReminder) native().morningReminder();
    } catch (err) {
      toast(err.message);
    }
  };
}

function sleepDialog() {
  showDialog(`<h2>Registrar sono</h2><p>Vamos conhecer seus horários reais antes de definir qualquer rotina.</p>
    <form id="sleep-form" class="form">
      <label>Quando deitou?<input type="datetime-local" name="bed" required></label>
      <label>Quando acordou?<input type="datetime-local" name="wake" required></label>
      <label>Como se sentiu?<textarea name="note" maxlength="1000"></textarea></label>
      <div class="actions"><button type="button" data-close>Cancelar</button><button class="primary">Salvar registro</button></div>
    </form>`);
  document.querySelector('#sleep-form').onsubmit = e => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      commit(logSleep(state, { bed: f.get('bed'), wake: f.get('wake'), note: f.get('note') }));
      modal.close();
      toast('Sono registrado.');
    } catch (err) {
      toast(err.message);
    }
  };
}

function confirmDialog(title, description, action, confirmLabel) {
  showDialog(`<h2>${esc(title)}</h2><p>${esc(description)}</p>
    <div class="actions"><button data-close>Cancelar</button><button id="confirm-action" class="primary">${esc(confirmLabel || 'Confirmar')}</button></div>`);
  document.querySelector('#confirm-action').onclick = () => {
    try {
      action();
      modal.close();
    } catch (err) {
      toast(err.message);
    }
  };
}

function exportDialog() {
  showDialog(`<h2>Exportar backup</h2>
    <p>Com senha o arquivo sai cifrado e não abre em nenhum outro lugar sem ela. Sem senha, sai como JSON legível — útil para recuperação independente, arriscado se o arquivo vazar.</p>
    <form id="export-form" class="form">
      <label>Senha do backup (opcional)<input name="pass" type="password" minlength="8" autocomplete="new-password" placeholder="mínimo 8 caracteres"></label>
      <label>Repita a senha<input name="pass2" type="password" autocomplete="new-password"></label>
      <div class="actions"><button type="button" data-close>Cancelar</button><button class="primary">Exportar</button></div>
    </form>`);
  document.querySelector('#export-form').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const pass = String(f.get('pass') || '');
    if (pass && pass !== String(f.get('pass2') || '')) { toast('As senhas não são iguais.'); return; }
    if (pass && pass.length < 8) { toast('Use uma senha de pelo menos 8 caracteres.'); return; }
    try {
      const plain = JSON.stringify(state, null, 2);
      const text = pass ? await encryptBackup(plain, pass) : plain;
      saveBackupFile(text, !!pass);
      modal.close();
      toast(pass ? 'Backup cifrado gerado. Guarde a senha: sem ela o arquivo não abre.' : 'Backup gerado em JSON legível. Guarde em local privado.');
    } catch (err) {
      toast(`Não foi possível exportar: ${err.message}`);
    }
  };
}

async function importText(raw) {
  let text = raw;
  if (isEncryptedBackup(text)) {
    const pass = await askPassphrase();
    if (pass === null) return;
    try {
      text = await decryptBackup(raw, pass);
    } catch (err) {
      toast(err.message);
      return;
    }
  }
  let next;
  try {
    next = validateBackup(JSON.parse(text));
  } catch (err) {
    toast(`Backup não restaurado: ${err.message}`);
    return;
  }
  confirmDialog(
    'Restaurar este backup?',
    `Ele substitui os dados deste aparelho por ${next.events.length} registros e ${next.missions.length} missões. Exporte o histórico atual primeiro, se quiser preservá-lo.`,
    () => {
      commit(next);
      const api = native();
      if (api) {
        api.disableReminders();
        if (next.settings.nightReminder) toast('Backup restaurado. Reative o lembrete em Conexões.');
      }
      toast('Backup restaurado.');
    },
    'Restaurar'
  );
}

function askPassphrase() {
  return new Promise(resolve => {
    showDialog(`<h2>Backup cifrado</h2><p>Digite a senha usada na exportação.</p>
      <form id="pass-form" class="form">
        <label>Senha<input name="pass" type="password" required autocomplete="off"></label>
        <div class="actions"><button type="button" id="pass-cancel">Cancelar</button><button class="primary">Abrir</button></div>
      </form>`);
    document.querySelector('#pass-cancel').onclick = () => { modal.close(); resolve(null); };
    document.querySelector('#pass-form').onsubmit = e => {
      e.preventDefault();
      const value = new FormData(e.target).get('pass');
      modal.close();
      resolve(String(value));
    };
  });
}

function pickBackupFile() {
  const api = native();
  if (api) { api.importBackup(); return; }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,.tjb,application/json';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 10000000) { toast('Backup muito grande.'); return; }
    await importText(await file.text());
  };
  input.click();
}

// Chamados pelo lado Android.
window.onNativeImport = importText;
window.onReminderStatus = enabled => {
  try {
    commit({ ...state, settings: { ...state.settings, nightReminder: !!enabled } });
    refreshNativeStatus();
    render();
    toast(enabled
      ? 'Lembrete da noite agendado. Confirme no estado do aparelho se o alarme exato está permitido.'
      : 'O sistema não permitiu as notificações. Autorize nos ajustes do aplicativo.');
  } catch (err) {
    toast(err.message);
  }
};
window.onNativeResume = () => { refreshNativeStatus(); if (state) render(); };
// Botão "voltar" do Android: fecha o diálogo, depois volta para Hoje, depois sai.
window.onNativeBack = () => {
  if (modal.open) { modal.close(); return 'handled'; }
  if (page !== 'today') { page = 'today'; render(); window.scrollTo(0, 0); return 'handled'; }
  return 'exit';
};

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

async function sendChat(e) {
  e.preventDefault();
  if (busy) return;
  const message = String(new FormData(e.target).get('message') || '').trim();
  if (!message) return;
  try {
    commit({ ...state, chat: [...state.chat, { role: 'user', content: message }] });
  } catch (err) {
    toast(err.message);
    return;
  }
  if (!state.settings.aiEndpoint) {
    toast('Pergunta guardada. Configure o serviço em Conexões para receber respostas reais.');
    return;
  }
  busy = true;
  render();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const context = state.settings.aiContext
      ? activeMissions(state).filter(m => ['company', 'intelligence'].includes(m.area)).map(m => ({ title: m.title, period: m.period, area: m.area }))
      : undefined;
    const headers = { 'Content-Type': 'application/json' };
    const token = readToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(state.settings.aiEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ messages: state.chat.slice(-20), ...(context ? { context } : {}) }),
      signal: controller.signal,
      credentials: 'omit',
      redirect: 'error'
    });
    if (response.status === 401 || response.status === 403) throw Error('O serviço recusou o token de acesso.');
    if (response.status === 429) throw Error('Limite de uso do seu serviço atingido.');
    if (!response.ok) throw Error(`O serviço respondeu com erro ${response.status}.`);
    const data = await response.json();
    if (typeof data.reply !== 'string' || !data.reply.trim()) throw Error('O serviço não enviou uma resposta válida.');
    commit({ ...state, chat: [...state.chat, { role: 'assistant', content: data.reply.slice(0, 30000) }] });
  } catch (err) {
    toast(err.name === 'AbortError'
      ? 'A conexão demorou demais. Sua pergunta foi preservada.'
      : `Sem resposta da IA. ${err.message}`);
  } finally {
    clearTimeout(timeout);
    busy = false;
    render();
  }
}

// ---------------------------------------------------------------------------
// Ligações de eventos
// ---------------------------------------------------------------------------

const ACTIONS = {
  new: () => missionDialog(null, false),
  sleep: () => sleepDialog(),
  export: () => exportDialog(),
  import: () => pickBackupFile(),
  reminders: () => {
    const api = native();
    if (!api) { toast('Este lembrete existe apenas no aplicativo Android.'); return; }
    api.enableReminders(state.settings.nightReminderTime);
  },
  'disable-reminders': () => {
    const api = native();
    if (api) api.disableReminders();
    commit({ ...state, settings: { ...state.settings, nightReminder: false } });
    toast('Lembrete desativado.');
  },
  'clear-chat': () => confirmDialog('Apagar conversa?', 'As mensagens serão removidas deste aparelho. Seus registros e XP não mudam.', () => commit({ ...state, chat: [] }), 'Apagar'),
  'refresh-status': () => { refreshNativeStatus(); render(); },
  battery: () => { const api = native(); if (api && api.openBatterySettings) api.openBatterySettings(); },
  'app-settings': () => { const api = native(); if (api && api.openAppSettings) api.openAppSettings(); }
};

function bind() {
  document.querySelectorAll('[data-page]').forEach(b => { b.onclick = () => { page = b.dataset.page; render(); window.scrollTo(0, 0); }; });
  document.querySelectorAll('[data-period]').forEach(b => { b.onclick = () => { period = b.dataset.period; render(); }; });
  document.querySelectorAll('[data-compare]').forEach(b => { b.onclick = () => { compareDays = Number(b.dataset.compare); render(); }; });
  document.querySelectorAll('[data-complete]').forEach(b => { b.onclick = () => completeDialog(b.dataset.complete); });
  document.querySelectorAll('[data-edit]').forEach(b => { b.onclick = () => missionDialog(state.missions.find(m => m.id === b.dataset.edit), true); });
  document.querySelectorAll('[data-draft]').forEach(b => { b.onclick = () => missionDialog(state.drafts[Number(b.dataset.draft)], false); });
  document.querySelectorAll('[data-restore]').forEach(b => { b.onclick = () => commit(restoreMission(state, b.dataset.restore)); });
  document.querySelectorAll('[data-archive]').forEach(b => {
    b.onclick = () => confirmDialog('Arquivar esta missão?', 'Ela sai das listas e o histórico já registrado continua no seu progresso. Você pode reativá-la depois.', () => commit(archiveMission(state, b.dataset.archive)), 'Arquivar');
  });
  document.querySelectorAll('[data-undo]').forEach(b => {
    b.onclick = () => confirmDialog('Corrigir registro?', 'O registro sai do histórico e o XP é recalculado.', () => commit(removeEvent(state, b.dataset.undo)), 'Corrigir');
  });
  document.querySelectorAll('[data-action]').forEach(b => {
    b.onclick = () => {
      try {
        const run = ACTIONS[b.dataset.action];
        if (run) run();
      } catch (err) {
        toast(err.message);
      }
    };
  });

  const profile = document.querySelector('#profile');
  if (profile) profile.onsubmit = e => {
    e.preventDefault();
    const name = String(new FormData(e.target).get('name') || '').trim() || 'Você';
    commit({ ...state, settings: { ...state.settings, name } });
    toast('Nome salvo.');
  };

  const reminders = document.querySelector('#reminder-settings');
  if (reminders) reminders.onsubmit = e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const time = String(f.get('nightTime') || '');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) { toast('Horário inválido.'); return; }
    const next = { ...state, settings: { ...state.settings, nightReminderTime: time, morningReminder: f.has('morning') } };
    commit(next);
    const api = native();
    if (api && next.settings.nightReminder) api.enableReminders(time);
    toast('Horários salvos conforme a sua prescrição.');
  };

  const limits = document.querySelector('#limits');
  if (limits) limits.onsubmit = e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const areaPerDay = Number(f.get('areaPerDay'));
    const totalPerDay = Number(f.get('totalPerDay'));
    if (!Number.isInteger(areaPerDay) || !Number.isInteger(totalPerDay) || areaPerDay < 0 || totalPerDay < 0) { toast('Use números inteiros.'); return; }
    commit({ ...state, settings: { ...state.settings, limits: { ...XP_LIMITS, areaPerDay, totalPerDay } } });
    toast('Limites salvos.');
  };

  const security = document.querySelector('#security');
  if (security) security.onsubmit = e => {
    e.preventDefault();
    const lockOnResume = new FormData(e.target).has('lockOnResume');
    commit({ ...state, settings: { ...state.settings, lockOnResume } });
    const api = native();
    if (api && api.setLockOnResume) api.setLockOnResume(lockOnResume);
    toast('Preferência de segurança salva.');
  };

  const ai = document.querySelector('#ai-settings');
  if (ai) ai.onsubmit = e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const endpoint = String(f.get('endpoint') || '').trim();
    if (endpoint) {
      try {
        const url = new URL(endpoint);
        if (url.protocol !== 'https:' || url.username || url.password) throw Error();
      } catch {
        toast('Use um endereço HTTPS, sem usuário ou senha na URL.');
        return;
      }
    }
    const token = String(f.get('token') || '');
    if (token) writeToken(token.trim());
    if (!endpoint) writeToken('');
    commit({ ...state, settings: { ...state.settings, aiEndpoint: endpoint, aiContext: f.has('context') } });
    toast('Configuração salva. Nenhuma chave de provedor fica neste aplicativo.');
  };

  const form = document.querySelector('#chat-form');
  if (form) form.addEventListener('submit', sendChat);
}

refreshNativeStatus();
render();
