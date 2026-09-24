'use strict';

// Gera as capturas de tela do protótipo com o Playwright.
// Uso: com o servidor rodando em outro terminal (node server.js), execute
//   node screenshot.js
// As imagens são salvas em screenshots/. Requer o Playwright instalado.

const path = require('node:path');
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OUT = path.join(__dirname, 'screenshots');
const PASSWORD = 'nexo2026';

async function session(browser, email, viewport = { width: 1280, height: 800 }) {
  const ctx = await browser.newContext({ viewport, locale: 'pt-BR' });
  const page = await ctx.newPage();
  if (email) {
    await page.goto(`${BASE}/login`);
    await page.fill('#email', email);
    await page.fill('#password', PASSWORD);
    await Promise.all([page.waitForNavigation(), page.click('form.stacked-form button[type=submit]')]);
  }
  return { ctx, page };
}

async function shot(page, url, name, { full = true, before } = {}) {
  await page.goto(BASE + url);
  if (before) await before(page);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(OUT, name), fullPage: full });
  console.log('ok', name);
}

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

  const guest = await session(browser, null);
  await shot(guest.page, '/', '01-inicio.png');
  await shot(guest.page, '/servicos?ordem=avaliacao', '02-busca-servicos.png');
  await shot(guest.page, '/servicos?categoria=Programa%C3%A7%C3%A3o&preco_max=500&ordem=menor_preco', '03-busca-filtros.png');
  await shot(guest.page, '/freelancers/1', '04-perfil-publico-freelancer.png');
  await shot(guest.page, '/cadastro', '05-cadastro.png');
  await shot(guest.page, '/login', '06-login.png');
  await shot(guest.page, '/projetos', '07-projetos-abertos.png');
  await shot(guest.page, '/ajuda', '08-ajuda.png', { before: (p) => p.click('details.faq summary') });
  await guest.ctx.close();

  const carla = await session(browser, 'cliente@example.com');
  await shot(carla.page, '/servicos/1', '09-servico-detalhe-cliente.png');
  await shot(carla.page, '/projetos/1', '10-projeto-propostas-cliente.png');
  await shot(carla.page, '/pedidos?aba=todos', '11-pedidos-cliente.png');
  await shot(carla.page, '/conta', '12-conta-privacidade.png');
  await carla.ctx.close();

  const bruno = await session(browser, 'bruno@example.com');
  await shot(bruno.page, '/pedidos/6', '13-pedido-entregue-cliente.png');
  await shot(bruno.page, '/pedidos/1', '14-pedido-concluido-avaliado.png');
  await bruno.ctx.close();

  const rafael = await session(browser, 'rafael@example.com');
  await shot(rafael.page, '/projetos/2', '15-projeto-proposta-freelancer.png');
  await shot(rafael.page, '/meus-servicos', '16-meus-servicos.png');
  await rafael.ctx.close();

  const juliana = await session(browser, 'juliana@example.com');
  await shot(juliana.page, '/pedidos/7', '17-pedido-solicitado-freelancer.png');
  await shot(juliana.page, '/pedidos/10', '24-avaliacao-mutua-pendente.png');
  await juliana.ctx.close();

  const marina = await session(browser, 'marina@example.com');
  await shot(marina.page, '/mensagens', '18-mensagens.png');
  await shot(marina.page, '/mensagens/1', '19-conversa.png');
  await shot(marina.page, '/perfil/portfolio', '20-portfolio-gerenciar.png');
  await shot(marina.page, '/perfil', '21-meu-perfil-freelancer.png');
  await marina.ctx.close();

  const lucas = await session(browser, 'lucas@example.com');
  await shot(lucas.page, '/projetos/2', '25-projeto-reputacao-cliente.png');
  await lucas.ctx.close();

  const mobile = await session(browser, null, { width: 390, height: 844 });
  await shot(mobile.page, '/', '22-inicio-celular.png', { full: false });
  await shot(mobile.page, '/servicos/1', '23-servico-celular.png', { full: false });
  await mobile.ctx.close();

  await browser.close();
})().catch((err) => { console.error(err); process.exit(1); });
