'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, Browser } = require('./helpers');

let app;
before(async () => { app = await startServer(); });
after(async () => { await app.close(); });

const servico = (extra = {}) => ({ title: 'Tradução de documentos inglês-português', category: 'Redação',
  description: 'Tradução técnica de documentos com revisão final e glossário do cliente.', price: '120', delivery_days: '2',
  keywords: 'tradução, inglês, versão juramentada não', ...extra });

test('T24 — Freelancer publica serviço e é redirecionado para a página dele (Post/Redirect/Get)', async () => {
  const b = new Browser(app.base);
  await b.login('juliana@example.com');
  const r = await b.post('/servicos/novo', servico(), { from: '/servicos/novo' });
  assert.equal(r.status, 302);
  assert.match(r.location, /^\/servicos\/\d+$/);
  const page = await b.get(r.location);
  assert.match(page.body, /Tradução de documentos inglês-português/);
  assert.match(page.body, /Serviço publicado com sucesso/);
  assert.match(page.body, /2 dias/);
});

test('T25 — Validação do formulário de serviço (título, categoria, descrição, prazo)', async () => {
  const b = new Browser(app.base);
  await b.login('juliana@example.com');
  const r = await b.post('/servicos/novo', servico({ title: 'Oi', category: 'Inexistente', description: 'curta', delivery_days: '0' }), { from: '/servicos/novo' });
  assert.equal(r.status, 400);
  for (const msg of [/ao menos 5 caracteres/, /categoria válida/, /ao menos 30 caracteres/, /prazo de entrega em dias/]) assert.match(r.body, msg);
  assert.match(r.body, /value="Oi"/, 'o que foi digitado é preservado');
});

test('T26 — Freelancer não consegue editar nem excluir serviço de outro freelancer', async () => {
  const b = new Browser(app.base);
  await b.login('rafael@example.com');
  const edit = await b.post('/servicos/1/editar', servico({ title: 'Título alterado indevidamente' }), { from: '/meus-servicos' });
  assert.equal(edit.status, 403);
  const del = await b.post('/servicos/1/excluir', {}, { from: '/meus-servicos' });
  assert.equal(del.status, 403);
  const page = await new Browser(app.base).get('/servicos/1');
  assert.match(page.body, /Criação de identidade visual completa/);
});

test('T27 — Exclusão de serviço pode ser desfeita', async () => {
  const b = new Browser(app.base);
  await b.login('marina@example.com');
  const del = await b.post('/servicos/2/excluir', {}, { from: '/meus-servicos' });
  assert.equal(del.status, 302);
  const lista = await b.get('/meus-servicos');
  assert.match(lista.body, /Serviço removido\./);
  assert.match(lista.body, /action="\/servicos\/2\/restaurar"/, 'botão Desfazer / Restaurar');
  assert.equal((await new Browser(app.base).get('/servicos/2')).status, 404, 'removido deixa de ser público');
  const undo = await b.post('/servicos/2/restaurar', {}, { from: '/meus-servicos' });
  assert.equal(undo.status, 302);
  assert.equal((await new Browser(app.base).get('/servicos/2')).status, 200);
});

test('T28 — Busca encontra o serviço por termo presente apenas nas palavras-chave', async () => {
  const r2 = await new Browser(app.base).get('/servicos?q=branding');
  assert.match(r2.body, /Criação de identidade visual completa/, '"branding" está só nas palavras-chave');
  assert.match(r2.body, /1 serviço encontrado/);
});

test('T29 — Filtros combinados de categoria, preço, prazo e avaliação', async () => {
  const b = new Browser(app.base);
  const prog = await b.get('/servicos?categoria=' + encodeURIComponent('Programação'));
  assert.match(prog.body, /Desenvolvimento de site institucional/);
  assert.doesNotMatch(prog.body, /Redação de artigos para blog/);
  const barato = await b.get('/servicos?preco_max=200');
  assert.match(barato.body, /Correção de bugs/);
  assert.doesNotMatch(barato.body, /Desenvolvimento de site institucional/);
  const rapido = await b.get('/servicos?prazo=3');
  assert.match(rapido.body, /Correção de bugs/);
  assert.doesNotMatch(rapido.body, /identidade visual completa/);
  const nota = await b.get('/servicos?nota=4.5');
  assert.match(nota.body, /identidade visual completa/);
  assert.doesNotMatch(nota.body, /Vídeo institucional/, 'serviço sem avaliações não atinge a nota mínima');
  const invalido = await b.get('/servicos?preco_min=500&preco_max=100');
  assert.match(invalido.body, /preço mínimo não pode ser maior/);
});

test('T30 — Ordenação por menor preço e por avaliação', async () => {
  const b = new Browser(app.base);
  const menor = await b.get('/servicos?ordem=menor_preco');
  const titulos = [...menor.body.matchAll(/<h3><a href="\/servicos\/\d+">([^<]+)<\/a><\/h3>/g)].map((m) => m[1]);
  assert.equal(titulos[0], 'Redação de artigos para blog (SEO)', 'R$ 90 é o menor preço');
  const aval = await b.get('/servicos?ordem=avaliacao');
  const t2 = [...aval.body.matchAll(/<h3><a href="\/servicos\/\d+">([^<]+)<\/a><\/h3>/g)].map((m) => m[1]);
  assert.ok(['Criação de identidade visual completa', 'Redação de artigos para blog (SEO)', 'Correção de bugs e manutenção de sistemas web'].includes(t2[0]));
});

test('T70 — Paginação da busca: 12 serviços por página, com link para a página seguinte', async () => {
  const repo = require('../lib/repo');
  for (let i = 1; i <= 13; i += 1) {
    repo.createService(2, { title: `Serviço de teste de paginação ${i}`, description: 'Descrição usada apenas no teste de paginação.',
      category: 'Programação', price: 100 + i, deliveryDays: 5, keywords: 'paginacao' });
  }
  const v = new Browser(app.base);
  const p1 = await v.get('/servicos?q=paginacao');
  assert.match(p1.body, /13 serviços encontrados/);
  assert.equal((p1.body.match(/Serviço de teste de paginação \d+/g) || []).length, 12);
  assert.match(p1.body, /pagina=2/);
  const p2 = await v.get('/servicos?q=paginacao&pagina=2');
  assert.equal((p2.body.match(/Serviço de teste de paginação \d+/g) || []).length, 1);
});
