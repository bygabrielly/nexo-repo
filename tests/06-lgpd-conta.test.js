'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, Browser } = require('./helpers');

let app;
before(async () => { app = await startServer(); });
after(async () => { await app.close(); });

test('T46 — Exportação dos dados do titular em JSON (LGPD, art. 18), sem dados de terceiros', async () => {
  const b = new Browser(app.base);
  await b.login('cliente@example.com');
  const r = await b.get('/conta/exportar');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /application\/json/);
  assert.match(r.headers.get('content-disposition'), /attachment/);
  const data = JSON.parse(r.body);
  assert.equal(data.titular.email, 'cliente@example.com');
  assert.ok(!('password_hash' in data.titular), 'hash de senha não é exportado');
  assert.ok(data.pedidos.length >= 1);
  assert.ok(data.mensagens_enviadas.every((m) => typeof m.content === 'string'));
  assert.doesNotMatch(r.body, /marina@example\.com/, 'e-mail de outra pessoa não aparece');
});

test('T47 — Alterar a senha exige a senha atual e encerra as outras sessões', async () => {
  const outra = new Browser(app.base);
  await outra.login('rafael@example.com');
  const b = new Browser(app.base);
  await b.login('rafael@example.com');
  const errada = await b.post('/conta/senha', { current: 'errada123', password: 'troquei minha senha hoje', password_confirm: 'troquei minha senha hoje' }, { from: '/conta' });
  assert.equal(errada.status, 400);
  assert.match(errada.body, /senha atual está incorreta/);
  assert.equal((await b.post('/conta/senha', { current: 'nexo2026', password: 'troquei minha senha hoje', password_confirm: 'troquei minha senha hoje' }, { from: '/conta' })).status, 302);
  assert.equal((await b.get('/perfil')).status, 200, 'a sessão atual continua');
  assert.equal((await outra.get('/perfil')).status, 302, 'a outra sessão foi encerrada');
});

test('T48 — Exclusão da conta anonimiza os dados, preserva o histórico da outra parte e impede novo login', async () => {
  const b = new Browser(app.base);
  await b.login('bruno@example.com');
  const semSenha = await b.post('/conta/excluir', { password: 'errada' }, { from: '/conta' });
  assert.equal(semSenha.status, 400);
  const r = await b.post('/conta/excluir', { password: 'nexo2026' }, { from: '/conta' });
  assert.equal(r.status, 200);
  assert.match(r.body, /Conta excluída/);
  const login = await new Browser(app.base).post('/login', { email: 'bruno@example.com', password: 'nexo2026' }, { from: '/login' });
  assert.equal(login.status, 400);
  const marina = new Browser(app.base);
  await marina.login('marina@example.com');
  const pedido = await marina.get('/pedidos/1'); // pedido concluído entre Bruno e Marina
  assert.equal(pedido.status, 200);
  assert.match(pedido.body, /Usuário removido/);
  assert.doesNotMatch(pedido.body, /Bruno Costa/);
  const perfil = await new Browser(app.base).get('/freelancers/1');
  assert.match(perfil.body, /Excelente profissional/, 'a avaliação continua visível, anonimizada');
});

test('T49 — Páginas de política de privacidade e de ajuda estão acessíveis a visitantes', async () => {
  const p = await new Browser(app.base).get('/privacidade');
  assert.equal(p.status, 200);
  assert.match(p.body, /O e-mail nunca é exibido publicamente/);
  const h = await new Browser(app.base).get('/ajuda');
  assert.equal(h.status, 200);
  assert.match(h.body, /Como contrato um serviço\?/);
});
