'use strict';

// Testes de ponta a ponta em um navegador real (Chromium, controlado pelo
// Playwright): verificam o que os testes por HTTP não alcançam — o JavaScript
// do navegador (public/app.js), a política de segurança de conteúdo aplicada
// pelo próprio navegador, a navegação pelo teclado e a interface em tela de
// celular. Não fazem parte do npm test, porque exigem o Playwright instalado:
//   node scripts/e2e-navegador.js
// O servidor é iniciado pelo próprio script, com banco temporário.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright não encontrado. Instale com: npm install --no-save playwright');
  process.exit(1);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-e2e-'));
process.env.DB_PATH = path.join(dir, 'db.sqlite');
process.env.UPLOADS_DIR = path.join(dir, 'uploads');
process.env.OUTBOX_DIR = path.join(dir, 'outbox');
process.env.NEXO_QUIET = '1';
const { createApp } = require('../server');

const cenarios = [];
const cenario = (nome, fn) => cenarios.push({ nome, fn });

async function entrar(page, base, email) {
  await page.goto(`${base}/login`);
  await page.fill('#email', email);
  await page.fill('#password', 'nexo2026');
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login')), page.click('main form button[type=submit]')]);
}

cenario('E1 — Cadastro: a confirmação de senha diferente é apontada pelo navegador antes do envio', async ({ page, base }) => {
  await page.goto(`${base}/cadastro`);
  await page.fill('#name', 'Pessoa E2E');
  await page.fill('#email', `e2e${Date.now()}@example.com`);
  await page.fill('#password', 'uma frase bem comprida');
  await page.fill('#password_confirm', 'outra frase diferente');
  const msg = await page.$eval('#password_confirm', (el) => el.validationMessage);
  assert.equal(msg, 'As senhas não conferem.');
  await page.fill('#password_confirm', 'uma frase bem comprida');
  assert.equal(await page.$eval('#password_confirm', (el) => el.validationMessage), '');
});

cenario('E2 — Teclado: o primeiro Tab leva ao link "Pular para o conteúdo", que move o foco para o conteúdo principal', async ({ page, base }) => {
  await page.goto(`${base}/servicos`);
  await page.keyboard.press('Tab');
  const primeiro = await page.evaluate(() => document.activeElement.textContent.trim());
  assert.match(primeiro, /Pular para o conteúdo/);
  await page.keyboard.press('Enter');
  assert.equal(new URL(page.url()).hash, '#conteudo');
});

cenario('E3 — Fluxo da cliente: entrar, buscar, abrir o serviço e contratar; o pedido aparece como aguardando resposta', async ({ page, base }) => {
  await entrar(page, base, 'ana@example.com');
  await page.goto(`${base}/servicos`);
  await page.fill('input[name="q"]', 'branding');
  await Promise.all([page.waitForURL(/\/servicos\?/), page.press('input[name="q"]', 'Enter')]);
  await Promise.all([page.waitForURL(/\/servicos\/\d+$/), page.click('h3 a')]);
  await page.fill('textarea[name="requirements"]', 'Identidade visual para clínica, tons de azul e branco.');
  await Promise.all([page.waitForURL(/\/pedidos\/\d+$/), page.click('form[action$="/contratar"] button[type=submit]')]);
  assert.match(await page.textContent('main'), /Aguardando resposta do freelancer/);
});

cenario('E4 — Ação destrutiva: cancelar na janela de confirmação mantém o serviço; confirmar o exclui', async ({ page, base }) => {
  await entrar(page, base, 'marina@example.com');
  await page.goto(`${base}/meus-servicos`);
  const antes = await page.locator('form[action$="/excluir"]').count();
  page.once('dialog', (d) => d.dismiss());
  await page.locator('form[action$="/excluir"] button').first().click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('form[action$="/excluir"]').count(), antes, 'cancelado: nada excluído');
  page.once('dialog', (d) => d.accept());
  await Promise.all([page.waitForLoadState('load'), page.locator('form[action$="/excluir"] button').first().click()]);
  await page.waitForURL(/meus-servicos/);
  assert.equal(await page.locator('form[action$="/excluir"]').count(), antes - 1, 'confirmado: um serviço a menos');
  assert.match(await page.textContent('body'), /Desfazer/);
});

cenario('E5 — Política de conteúdo: um script embutido injetado na página é bloqueado pelo navegador', async ({ page, base }) => {
  const violacoes = [];
  page.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) violacoes.push(m.text()); });
  await page.goto(`${base}/`);
  const executou = await page.evaluate(() => {
    window.__injetado = false;
    const s = document.createElement('script');
    s.textContent = 'window.__injetado = true;';
    document.body.appendChild(s);
    return window.__injetado;
  });
  assert.equal(executou, false, 'o script embutido não foi executado');
  assert.ok(violacoes.length >= 1, 'o navegador registrou a violação da política');
});

cenario('E6 — Celular (390 px): nenhuma das páginas principais exige rolagem horizontal', async ({ browser, base }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'pt-BR' });
  const page = await ctx.newPage();
  for (const rota of ['/', '/servicos', '/servicos/1', '/freelancers/1', '/projetos', '/login', '/cadastro', '/ajuda', '/privacidade']) {
    await page.goto(base + rota);
    const largura = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(largura <= 390, `${rota}: largura ${largura}px`);
  }
  await ctx.close();
});

(async () => {
  const server = createApp();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  console.log(`# Testes de ponta a ponta em navegador real — Chromium ${browser.version()} | Node ${process.version} | ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC | versão ${require('../package.json').version} (package.json)`);
  let aprovados = 0;
  for (const c of cenarios) {
    const ctx = await browser.newContext({ locale: 'pt-BR' });
    const page = await ctx.newPage();
    try {
      await c.fn({ page, base, browser });
      aprovados += 1;
      console.log(`ok - ${c.nome}`);
    } catch (err) {
      console.log(`not ok - ${c.nome}\n  ${err.message.split('\n')[0]}`);
    }
    await ctx.close();
  }
  console.log(`# ${aprovados} de ${cenarios.length} cenários aprovados`);
  await browser.close();
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
  process.exitCode = aprovados === cenarios.length ? 0 : 1;
})();
