// Permite apontar o playwright-core instalado em qualquer outro lugar:
//   PLAYWRIGHT_CORE=/caminho/node_modules/playwright-core/index.js node ...
const playwright = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const chromium = playwright.chromium || playwright.default.chromium;
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const OUT = process.env.OUT || '/tmp/shots';
mkdirSync(OUT, { recursive: true });

const problems = [];
const steps = [];
function ok(label, extra = '') { steps.push(`OK   ${label}${extra ? ' — ' + extra : ''}`); }
function bad(label, extra = '') { problems.push(`FALHA ${label}${extra ? ' — ' + extra : ''}`); steps.push(`FALHA ${label}${extra ? ' — ' + extra : ''}`); }

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox']
});
// POCO X7: 1220x2712 físicos, ~2.75x -> viewport CSS próximo de 412x986.
const context = await browser.newContext({
  viewport: { width: 412, height: 915 },
  deviceScaleFactor: 2.75,
  isMobile: true,
  hasTouch: true,
  locale: 'pt-BR',
  timezoneId: 'America/Sao_Paulo'
});
const page = await context.newPage();
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));

const shot = async name => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
const toastText = () => page.locator('#toast').innerText();
const xpNow = async () => Number((await page.locator('.hero strong').innerText()).replace(/\D/g, ''));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('.hero');
await shot('01-hoje');
ok('tela Hoje carregou', `XP inicial ${await xpNow()}`);

// Barra de navegação não deve cobrir o conteúdo no celular.
const overlap = await page.evaluate(() => {
  const bar = document.querySelector('.sidebar').getBoundingClientRect();
  const content = document.querySelector('.content');
  const style = getComputedStyle(content);
  return { barTop: bar.top, barHeight: bar.height, paddingBottom: style.paddingBottom, innerHeight: window.innerHeight, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth };
});
if (overlap.scrollWidth > overlap.clientWidth + 1) bad('há rolagem horizontal', JSON.stringify(overlap));
else ok('sem rolagem horizontal', `largura ${overlap.clientWidth}px`);
if (parseInt(overlap.paddingBottom) < overlap.barHeight) bad('barra inferior pode cobrir o conteúdo', JSON.stringify(overlap));
else ok('espaço reservado para a barra inferior', `${overlap.paddingBottom} >= ${Math.round(overlap.barHeight)}px`);

// 1. Registrar leitura
await page.locator('.mission', { hasText: 'Ler por 5 minutos' }).locator('.check').click();
await page.waitForSelector('dialog[open]');
await shot('02-dialogo-registro');
await page.locator('dialog textarea[name=note]').fill('Cinco minutos de leitura.');
await page.locator('dialog button.primary').click();
await page.waitForSelector('dialog[open]', { state: 'detached' }).catch(() => {});
await page.waitForTimeout(250);
const xpAfterRead = await xpNow();
if (xpAfterRead === 10) ok('registro de leitura somou 10 XP'); else bad('XP após leitura', `esperado 10, obtido ${xpAfterRead}`);
if ((await toastText()).includes('histórico')) ok('aviso de registro salvo aparece'); else bad('aviso de registro', await toastText());

// 2. Medicação não soma XP
await page.locator('.mission', { hasText: 'Remédio da manhã' }).locator('.check').click();
await page.waitForSelector('dialog[open]');
const medButton = await page.locator('dialog button.primary').innerText();
if (medButton.includes('Confirmar que tomei')) ok('medicação pede confirmação explícita'); else bad('texto do botão de medicação', medButton);
await page.locator('dialog button.primary').click();
await page.waitForTimeout(250);
if ((await xpNow()) === 10) ok('medicação não soma XP'); else bad('medicação somou XP', String(await xpNow()));

// 3. Sono
await page.locator('[data-action=sleep]').click();
await page.waitForSelector('dialog[open]');
await page.locator('input[name=bed]').fill('2026-10-08T03:30');
await page.locator('input[name=wake]').fill('2026-10-08T11:00');
await page.locator('textarea[name=note]').fill('Acordei cansado.');
await shot('03-dialogo-sono');
await page.locator('dialog button.primary').click();
await page.waitForTimeout(250);
if ((await toastText()).includes('Sono registrado')) ok('sono registrado'); else bad('registro de sono', await toastText());

// 4. Criar missão em Missões
await page.locator('[data-page=missions]').click();
await page.waitForSelector('h1:has-text("Missões")');
await page.locator('button.primary[data-action=new]').click();
await page.waitForSelector('dialog[open]');
await page.locator('input[name=title]').fill('Publicar uma página de venda');
await page.locator('select[name=area]').selectOption('company');
await page.locator('select[name=period]').selectOption('weekly');
await page.locator('input[name=target]').fill('2');
await page.locator('input[name=xp]').fill('20');
await page.locator('input[name=sidequest]').check();
await shot('04-dialogo-missao');
await page.locator('dialog button.primary').click();
await page.waitForTimeout(250);
await page.locator('[data-period=weekly]').click();
await page.waitForTimeout(150);
if (await page.locator('.mission', { hasText: 'Publicar uma página de venda' }).count()) ok('missão semanal criada e listada como side quest');
else bad('missão criada não aparece na lista semanal');
await shot('05-missoes');

// 5. Ativar a sugestão de natação
await page.locator('[data-draft]').first().click();
await page.waitForSelector('dialog[open]');
const draftTitle = await page.locator('input[name=title]').inputValue();
await page.locator('dialog button.primary').click();
await page.waitForTimeout(250);
if (await page.locator('.mission', { hasText: draftTitle }).count()) ok('sugestão ativada vira missão', draftTitle);
else bad('sugestão não virou missão', draftTitle);

// 6. Arquivar a missão criada e conferir que o histórico fica
await page.locator('[data-period=daily]').click();
await page.waitForTimeout(150);
await page.locator('.mission', { hasText: 'Ler por 5 minutos' }).locator('[data-archive]').click();
await page.waitForSelector('dialog[open]');
await page.locator('#confirm-action').click();
await page.waitForTimeout(250);
const archivedVisible = await page.locator('.mission', { hasText: 'arquivada em' }).count();
if (archivedVisible) ok('missão arquivada aparece na seção de arquivadas'); else bad('seção de arquivadas vazia');
await page.locator('[data-page=today]').click();
await page.waitForTimeout(200);
if ((await xpNow()) === 10) ok('XP do histórico permanece após arquivar'); else bad('XP mudou ao arquivar', String(await xpNow()));

// 7. Progresso
await page.locator('[data-page=history]').click();
await page.waitForSelector('h1:has-text("Progresso")');
await shot('06-progresso');
const registros = await page.locator('.card', { hasText: 'Registros' }).locator('.number').innerText();
if (registros.trim() === '3') ok('comparação conta os 3 registros do período'); else bad('contagem de registros', registros);
await page.locator('[data-compare="30"]').click();
await page.waitForTimeout(150);
if (await page.locator('.card', { hasText: 'Dias com registro' }).locator('.number').innerText() === '1/30') ok('janela de 30 dias calculada');
else bad('janela de 30 dias', await page.locator('.card', { hasText: 'Dias com registro' }).locator('.number').innerText());
if (await page.locator('.event', { hasText: 'h na cama' }).count()) ok('registro de sono listado no progresso'); else bad('sono não listado');
await shot('07-progresso-30');

// 8. IA
await page.locator('[data-page=chat]').click();
await page.waitForSelector('h1:has-text("IA")');
await page.locator('textarea[name=message]').fill('Como estudar Direito 15 minutos por dia?');
await page.locator('#chat-form button').click();
await page.waitForTimeout(300);
if (await page.locator('.message.user').count()) ok('pergunta guardada sem serviço configurado'); else bad('pergunta não guardada');
if ((await toastText()).includes('Configure o serviço')) ok('aviso de IA não conectada'); else bad('aviso de IA', await toastText());
await shot('08-ia');

// 9. Conexões: nome, limites, horário
await page.locator('[data-page=connections]').click();
await page.waitForSelector('h1:has-text("Conexões")');
await page.locator('#profile input[name=name]').fill('Matheus');
await page.locator('#profile button').click();
await page.waitForTimeout(200);
await page.locator('#limits input[name=areaPerDay]').fill('40');
await page.locator('#limits input[name=totalPerDay]').fill('100');
await page.locator('#limits button').click();
await page.waitForTimeout(200);
await page.locator('#reminder-settings input[name=nightTime]').fill('20:30');
await page.locator('#reminder-settings button').click();
await page.waitForTimeout(200);
await page.locator('#ai-settings input[name=endpoint]').fill('http://inseguro.example/chat');
await page.locator('#ai-settings button').click();
await page.waitForTimeout(200);
if ((await toastText()).includes('HTTPS')) ok('endpoint http é recusado'); else bad('validação de endpoint', await toastText());
await page.locator('#ai-settings input[name=endpoint]').fill('https://seu-servico.example/chat');
await page.locator('#ai-settings input[name=token]').fill('token-de-teste');
await page.locator('#ai-settings button').click();
await page.waitForTimeout(200);
await shot('09-conexoes');

// 10. Exportar backup cifrado e restaurar
const exportPromise = page.waitForEvent('download');
await page.locator('[data-action=export]').click();
await page.waitForSelector('dialog[open]');
await page.locator('input[name=pass]').fill('senha-de-teste-1');
await page.locator('input[name=pass2]').fill('senha-de-teste-1');
await page.locator('dialog button.primary').click();
const download = await exportPromise;
const file = `${OUT}/${download.suggestedFilename()}`;
await download.saveAs(file);
ok('backup exportado', download.suggestedFilename());
const sealed = (await import('node:fs')).readFileSync(file, 'utf8');
if (sealed.includes('"cipher": "AES-GCM"') && !sealed.includes('Matheus')) ok('arquivo exportado está cifrado');
else bad('arquivo exportado não parece cifrado');

// Apaga tudo e restaura a partir do arquivo
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.hero');
if ((await xpNow()) === 0) ok('estado zerado antes da restauração'); else bad('estado não zerou');
await page.locator('[data-page=connections]').click();
await page.waitForSelector('h1:has-text("Conexões")');
const chooser = page.waitForEvent('filechooser');
await page.locator('[data-action=import]').click();
(await chooser).setFiles(file);
await page.waitForSelector('dialog[open] input[name=pass]');
await page.locator('dialog input[name=pass]').fill('senha-de-teste-1');
await page.locator('dialog button.primary').click();
await page.waitForSelector('#confirm-action');
await shot('10-restaurar');
await page.locator('#confirm-action').click();
await page.waitForTimeout(400);
await page.locator('[data-page=today]').click();
await page.waitForTimeout(250);
const restoredXP = await xpNow();
if (restoredXP === 10) ok('backup cifrado restaurado com o histórico'); else bad('XP após restaurar', String(restoredXP));
const nome = await page.locator('.hero .eyebrow').innerText();
if (nome.toLowerCase().includes('matheus')) ok('configurações restauradas', nome); else bad('nome não restaurado', nome);

// 11. Persistência após reinício
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.hero');
if ((await xpNow()) === 10) ok('dados persistem após recarregar'); else bad('dados não persistiram');
await shot('11-hoje-final');

if (consoleErrors.length) bad('erros no console', consoleErrors.slice(0, 5).join(' | '));
else ok('nenhum erro no console do navegador');

await browser.close();
console.log(steps.join('\n'));
console.log('\n' + (problems.length ? `${problems.length} PROBLEMA(S)` : 'TODOS OS PASSOS OK'));
process.exit(problems.length ? 1 : 0);
