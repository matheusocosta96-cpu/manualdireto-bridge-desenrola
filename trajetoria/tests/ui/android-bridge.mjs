// Exercita os caminhos que só existem dentro do WebView do Android,
// com uma ponte "Android" falsa que imita a implementação Java.
// Permite apontar o playwright-core instalado em qualquer outro lugar:
//   PLAYWRIGHT_CORE=/caminho/node_modules/playwright-core/index.js node ...
const playwright = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const chromium = playwright.chromium || playwright.default.chromium;

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const problems = [], steps = [];
const ok = (l, e = '') => steps.push(`OK   ${l}${e ? ' — ' + e : ''}`);
const bad = (l, e = '') => { problems.push(l); steps.push(`FALHA ${l}${e ? ' — ' + e : ''}`); };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, locale: 'pt-BR' });

const bridgeScript = initial => `
window.__vault = ${JSON.stringify(initial)};
window.__calls = [];
window.Android = {
  readState: () => window.__vault,
  writeState: raw => { window.__vault = raw; window.__calls.push(['writeState', raw.length]); return true; },
  status: () => JSON.stringify({
    model: 'Xiaomi 2412DRN0CG', release: '15', sdk: 35, versionName: '0.2.0',
    notificationsEnabled: true, exactAlarms: false, ignoringBatteryOptimizations: false,
    nightScheduled: false, nextAlarm: '', nightTime: '20:00', deviceSecure: true, healthConnect: false
  }),
  enableReminders: t => { window.__calls.push(['enableReminders', t]); setTimeout(() => window.onReminderStatus(true), 10); },
  disableReminders: () => window.__calls.push(['disableReminders']),
  morningReminder: () => window.__calls.push(['morningReminder']),
  setLockOnResume: v => window.__calls.push(['setLockOnResume', v]),
  exportBackup: (raw, name) => { window.__export = { raw, name }; window.__calls.push(['exportBackup', name]); },
  importBackup: () => { window.__calls.push(['importBackup']); setTimeout(() => window.onNativeImport(window.__export.raw), 10); },
  openBatterySettings: () => window.__calls.push(['openBatterySettings']),
  openAppSettings: () => window.__calls.push(['openAppSettings'])
};`;

// --- 1. Aparelho novo: nada gravado ainda -----------------------------------
let page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(bridgeScript(null));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('.hero');
ok('abre com estado inicial quando o cofre está vazio');

await page.locator('.mission', { hasText: 'Ler por 5 minutos' }).locator('.check').click();
await page.locator('dialog button.primary').click();
await page.waitForTimeout(200);
const wrote = await page.evaluate(() => window.__calls.filter(c => c[0] === 'writeState').length);
if (wrote > 0) ok('gravação passa pela ponte Java', `${wrote} chamadas`); else bad('writeState não foi chamado');

// Registrar despertar deve disparar o lembrete da manhã
await page.locator('.mission', { hasText: 'Registrar quando acordei' }).locator('.check').click();
await page.locator('dialog button.primary').click();
await page.waitForTimeout(200);
if (await page.evaluate(() => window.__calls.some(c => c[0] === 'morningReminder'))) ok('registrar o despertar aciona o lembrete da manhã');
else bad('morningReminder não foi chamado');

// --- 2. Tela de Conexões com estado real do aparelho ------------------------
await page.locator('[data-page=connections]').click();
await page.waitForSelector('h1:has-text("Conexões")');
const statusText = await page.locator('.card', { hasText: 'Estado do aparelho' }).innerText();
for (const esperado of ['Xiaomi', 'Android 15', 'Alarme exato', 'Economia de bateria', 'Health Connect']) {
  if (statusText.includes(esperado)) ok(`estado do aparelho mostra "${esperado}"`);
  else bad(`estado do aparelho sem "${esperado}"`, statusText.slice(0, 200));
}
if (statusText.includes('pode atrasar')) ok('avisa que sem alarme exato o lembrete atrasa');
else bad('não avisa sobre alarme exato');

await page.locator('[data-action=reminders]').click();
await page.waitForTimeout(300);
const chamou = await page.evaluate(() => window.__calls.find(c => c[0] === 'enableReminders'));
if (chamou && chamou[1] === '20:00') ok('ativa o lembrete enviando o horário da prescrição', chamou[1]);
else bad('enableReminders sem horário', JSON.stringify(chamou));
if ((await page.locator('#toast').innerText()).includes('agendado')) ok('confirma o agendamento na tela');
else bad('sem confirmação de agendamento', await page.locator('#toast').innerText());

await page.locator('[data-action=battery]').click();
await page.waitForTimeout(100);
if (await page.evaluate(() => window.__calls.some(c => c[0] === 'openBatterySettings'))) ok('botão abre o ajuste de bateria do sistema');
else bad('openBatterySettings não chamado');

// --- 3. Backup pela ponte (arquivo sai pelo seletor do Android) -------------
await page.locator('[data-action=export]').click();
await page.waitForSelector('dialog[open]');
await page.locator('input[name=pass]').fill('senha-do-android');
await page.locator('input[name=pass2]').fill('senha-do-android');
await page.locator('dialog button.primary').click();
await page.waitForTimeout(500);
const exported = await page.evaluate(() => window.__export);
if (exported && exported.name.endsWith('.tjb') && exported.raw.includes('AES-GCM')) ok('exportação cifrada vai para o seletor do Android', exported.name);
else bad('exportação pela ponte', JSON.stringify(exported && exported.name));

await page.evaluate(() => { window.__vault = null; });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.hero');
// O recarregamento zera o contexto da página: devolvemos o arquivo exportado.
await page.evaluate(raw => { window.__export = { raw }; }, exported.raw);
await page.locator('[data-page=connections]').click();
await page.locator('[data-action=import]').click();
await page.waitForSelector('dialog input[name=pass]');
await page.locator('dialog input[name=pass]').fill('senha-do-android');
await page.locator('dialog button.primary').click();
await page.waitForSelector('#confirm-action');
await page.locator('#confirm-action').click();
await page.waitForTimeout(400);
await page.locator('[data-page=today]').click();
await page.waitForTimeout(200);
const xp = Number((await page.locator('.hero strong').innerText()).replace(/\D/g, ''));
if (xp === 15) ok('restauração pela ponte recupera leitura + despertar', `${xp} XP`);
else bad('XP após restaurar pela ponte', String(xp));

// --- 4. Botão voltar do Android --------------------------------------------
await page.locator('[data-page=missions]').click();
await page.waitForTimeout(150);
let back = await page.evaluate(() => window.onNativeBack());
if (back === 'handled' && await page.locator('h1:has-text("Hoje")').count()) ok('voltar leva de Missões para Hoje');
else bad('voltar não voltou para Hoje', String(back));
back = await page.evaluate(() => window.onNativeBack());
if (back === 'exit') ok('voltar em Hoje devolve "exit" para o Android fechar'); else bad('voltar em Hoje', String(back));
await page.locator('[data-action=sleep]').click();
await page.waitForSelector('dialog[open]');
back = await page.evaluate(() => window.onNativeBack());
if (back === 'handled' && !(await page.locator('dialog[open]').count())) ok('voltar fecha o diálogo aberto');
else bad('voltar não fechou o diálogo', String(back));
await page.close();

// --- 5. Cofre ilegível: nada é apagado --------------------------------------
page = await context.newPage();
page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(bridgeScript('{"vaultError":"Não foi possível decifrar os dados deste aparelho.","cipher":"AAAA:BBBB"}'));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('h1');
const titulo = await page.locator('h1').innerText();
if (titulo.includes('Não consegui abrir')) ok('cofre ilegível cai na tela de recuperação', titulo);
else bad('sem tela de recuperação', titulo);
await page.locator('#raw-backup').click();
await page.waitForTimeout(200);
const dump = await page.evaluate(() => window.__export);
if (dump && dump.raw.includes('cipher')) ok('a tela de recuperação exporta o bloco cifrado original');
else bad('exportação bruta não preservou o bloco cifrado');

if (errors.length) bad('erros de JavaScript', errors.slice(0, 3).join(' | ')); else ok('nenhum erro de JavaScript');

await browser.close();
console.log(steps.join('\n'));
console.log('\n' + (problems.length ? `${problems.length} PROBLEMA(S)` : 'TODOS OS PASSOS OK'));
process.exit(problems.length ? 1 : 0);
