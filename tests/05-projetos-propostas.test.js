'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, Browser } = require('./helpers');

let app;
let cliente;
let projeto;

before(async () => {
  app = await startServer();
  cliente = new Browser(app.base);
  await cliente.login('bruno@example.com');
});
after(async () => { await app.close(); });

const proposta = (extra = {}) => ({ price: '750', delivery_days: '8', message: 'Faço o site em 8 dias, com layout responsivo e formulário de contato integrado.', ...extra });

test('T40 — Cliente publica projeto com orçamento e prazo', async () => {
  const r = await cliente.post('/projetos/novo', {
    title: 'Site para escritório de contabilidade', category: 'Programação',
    description: 'Site com páginas de serviços, equipe e contato, com botão para WhatsApp.', budget_min: '500', budget_max: '1000', deadline_days: '15',
  }, { from: '/projetos/novo' });
  assert.equal(r.status, 302);
  projeto = r.location;
  const page = await new Browser(app.base).get(projeto);
  assert.match(page.body, /Recebendo propostas/);
  assert.match(page.body, /R\$\s?500,00 a R\$\s?1\.000,00/);
  const lista = await new Browser(app.base).get('/projetos');
  assert.match(lista.body, /Site para escritório de contabilidade/);
});

test('T41 — Validação do projeto (orçamento mínimo maior que o máximo)', async () => {
  const r = await cliente.post('/projetos/novo', { title: 'Projeto inválido', category: 'Redação', description: 'x'.repeat(40), budget_min: '900', budget_max: '100' }, { from: '/projetos/novo' });
  assert.equal(r.status, 400);
  assert.match(r.body, /orçamento mínimo não pode ser maior/);
});

test('T42 — Freelancers enviam propostas; proposta duplicada é recusada', async () => {
  const rafael = new Browser(app.base);
  await rafael.login('rafael@example.com');
  assert.equal((await rafael.post(projeto + '/propostas', proposta(), { from: projeto })).status, 302);
  const dup = await rafael.post(projeto + '/propostas', proposta({ price: '700' }), { from: projeto });
  assert.equal(dup.status, 409);
  assert.match(dup.body, /já enviou uma proposta/);
  const marina = new Browser(app.base);
  await marina.login('marina@example.com');
  assert.equal((await marina.post(projeto + '/propostas', proposta({ price: '980', message: 'Layout exclusivo alinhado à identidade visual que criei para o escritório.' }), { from: projeto })).status, 302);
  const dono = await cliente.get(projeto);
  assert.match(dono.body, /Propostas recebidas \(2\)/);
  const outroCliente = new Browser(app.base);
  await outroCliente.login('ana@example.com');
  const vistaAlheia = await outroCliente.get(projeto);
  assert.doesNotMatch(vistaAlheia.body, /Faço o site em 8 dias/, 'propostas visíveis só para o autor do projeto');
});

test('T43 — Somente o autor do projeto pode aceitar uma proposta', async () => {
  const page = await cliente.get(projeto);
  const ids = [...page.body.matchAll(/action="\/propostas\/(\d+)\/aceitar"/g)].map((m) => m[1]);
  const ana = new Browser(app.base);
  await ana.login('ana@example.com');
  assert.equal((await ana.post(`/propostas/${ids[0]}/aceitar`, {}, { from: '/' })).status, 403);
  const rafael = new Browser(app.base);
  await rafael.login('rafael@example.com');
  assert.equal((await rafael.post(`/propostas/${ids[0]}/aceitar`, {}, { from: '/' })).status, 403);
});

test('T44 — Aceitar proposta cria o pedido, recusa as demais e fecha o projeto para novas propostas', async () => {
  const page = await cliente.get(projeto);
  const primeira = page.body.match(/action="\/propostas\/(\d+)\/aceitar"/)[1];
  const r = await cliente.post(`/propostas/${primeira}/aceitar`, {}, { from: projeto });
  assert.equal(r.status, 302);
  assert.match(r.location, /^\/pedidos\/\d+$/);
  const pedido = await cliente.get(r.location);
  assert.match(pedido.body, /Em andamento/);
  assert.match(pedido.body, /R\$\s?750,00/);
  assert.match(pedido.body, /Proposta aceita pelo cliente/);
  const proj = await cliente.get(projeto);
  assert.match(proj.body, /Não selecionada/);
  const juliana = new Browser(app.base);
  await juliana.login('juliana@example.com');
  const tarde = await juliana.post(projeto + '/propostas', proposta(), { from: '/projetos' });
  assert.notEqual(tarde.status, 302, 'projeto em andamento não recebe propostas');
});

test('T45 — Freelancer retira proposta enviada', async () => {
  const r = await cliente.post('/projetos/novo', { title: 'Revisão de contrato padrão', category: 'Consultoria', description: 'Revisar a redação de um contrato de prestação de serviços contábeis.' }, { from: '/projetos/novo' });
  const juliana = new Browser(app.base);
  await juliana.login('juliana@example.com');
  await juliana.post(r.location + '/propostas', proposta({ message: 'Reviso o contrato com foco em clareza e consistência dos termos.' }), { from: r.location });
  const page = await juliana.get(r.location);
  const id = page.body.match(/action="\/propostas\/(\d+)\/retirar"/)[1];
  assert.equal((await juliana.post(`/propostas/${id}/retirar`, {}, { from: r.location })).status, 302);
  assert.match((await juliana.get('/minhas-propostas')).body, /Retirada/);
});

// Problema encontrado na reavaliação heurística (controle e liberdade do
// usuário): depois de retirar uma proposta, o freelancer não conseguia
// enviar outra para o mesmo projeto.
test('T64 — Freelancer que retirou a proposta pode enviar uma nova, com os dados anteriores pré-preenchidos', async () => {
  const r = await cliente.post('/projetos/novo', { title: 'Planilha de controle financeiro', category: 'Consultoria', description: 'Montar uma planilha simples de fluxo de caixa para o escritório, com gráficos mensais.' }, { from: '/projetos/novo' });
  const rafael = new Browser(app.base);
  await rafael.login('rafael@example.com');
  await rafael.post(r.location + '/propostas', proposta({ price: '400' }), { from: r.location });
  const id = (await rafael.get(r.location)).body.match(/action="\/propostas\/(\d+)\/retirar"/)[1];
  await rafael.post(`/propostas/${id}/retirar`, {}, { from: r.location });
  const depois = await rafael.get(r.location);
  assert.match(depois.body, /Você retirou sua proposta/);
  assert.match(depois.body, /name="price"[^>]*value="400"/, 'valor anterior pré-preenchido');
  assert.equal((await rafael.post(r.location + '/propostas', proposta({ price: '380' }), { from: r.location })).status, 302);
  const vistaCliente = await cliente.get(r.location);
  assert.match(vistaCliente.body, /R\$\s?380,00/);
  assert.match(vistaCliente.body, /Propostas recebidas \(1\)/);
  // Proposta ativa não pode ser duplicada.
  assert.equal((await rafael.post(r.location + '/propostas', proposta(), { from: r.location })).status, 409);
});

test('T66 — Projetos abertos filtrados por orçamento e ordenados por maior orçamento ou menos propostas', async () => {
  const v = new Browser(app.base);
  const todos = await v.get('/projetos');
  assert.match(todos.body, /Landing page para lançamento de coleção/);
  const filtrado = await v.get('/projetos?orcamento_min=1000');
  assert.match(filtrado.body, /Landing page para lançamento de coleção/, 'orçamento de até R$ 1.200,00');
  assert.doesNotMatch(filtrado.body, /Vídeo curto para redes sociais do escritório/, 'orçamento de até R$ 700,00');
  assert.match(filtrado.body, /name="orcamento_min"[^>]*value="1000"/, 'filtro permanece preenchido');
  const maior = await v.get('/projetos?ordem=maior_orcamento');
  assert.ok(maior.body.indexOf('Landing page para lançamento') < maior.body.indexOf('Textos para as páginas de tratamentos'), 'R$ 1.200 antes de R$ 800');
  const menos = await v.get('/projetos?ordem=menos_propostas');
  assert.ok(menos.body.indexOf('Landing page para lançamento') > menos.body.indexOf('Textos para as páginas de tratamentos'), 'projeto com 2 propostas por último');
});
