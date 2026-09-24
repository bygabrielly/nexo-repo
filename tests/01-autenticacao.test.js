'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startServer, Browser } = require('./helpers');

let app;
before(async () => { app = await startServer(); });
after(async () => { await app.close(); });

const novo = (extra = {}) => ({ name: 'Paula Teste', email: `paula${Date.now()}${Math.random().toString(16).slice(2, 6)}@example.com`,
  password: 'senha1234', password_confirm: 'senha1234', role: 'cliente', consent: '1', ...extra });

test('T01 — Cadastro com dados válidos cria a conta e inicia a sessão', async () => {
  const b = new Browser(app.base);
  const r = await b.post('/cadastro', novo(), { from: '/cadastro' });
  assert.equal(r.status, 302);
  assert.ok(b.cookies.sid, 'cookie de sessão emitido');
  const perfil = await b.get('/perfil');
  assert.equal(perfil.status, 200);
  assert.match(perfil.body, /Paula Teste/);
});

test('T02 — Cadastro com e-mail já utilizado é recusado', async () => {
  const b = new Browser(app.base);
  const r = await b.post('/cadastro', novo({ email: 'marina@example.com' }), { from: '/cadastro' });
  assert.equal(r.status, 400);
  assert.match(r.body, /Já existe uma conta com este e-mail/);
});

test('T03 — Política de senha e confirmação da senha são exigidas no cadastro', async () => {
  const b = new Browser(app.base);
  const curta = await b.post('/cadastro', novo({ password: 'abc12', password_confirm: 'abc12' }), { from: '/cadastro' });
  assert.equal(curta.status, 400);
  assert.match(curta.body, /ao menos 8 caracteres/);
  const semNumero = await b.post('/cadastro', novo({ password: 'somenteletras', password_confirm: 'somenteletras' }), { from: '/cadastro' });
  assert.match(semNumero.body, /letras e números/);
  const diferente = await b.post('/cadastro', novo({ password_confirm: 'outra1234' }), { from: '/cadastro' });
  assert.equal(diferente.status, 400);
  assert.match(diferente.body, /confirmação da senha não confere/);
});

test('T04 — Cadastro exige aceite da política de privacidade (LGPD) e registra o consentimento', async () => {
  const b = new Browser(app.base);
  const sem = await b.post('/cadastro', novo({ consent: '' }), { from: '/cadastro' });
  assert.equal(sem.status, 400);
  assert.match(sem.body, /aceitar a política de privacidade/);
  const com = await b.post('/cadastro', novo(), { from: '/cadastro' });
  assert.equal(com.status, 302);
  const conta = await b.get('/conta');
  assert.match(conta.body, /Consentimento registrado em \d{2}\/\d{2}\/\d{4}/);
  assert.match(conta.body, /versão 2026-09/);
});

test('T05 — Login com credenciais corretas autentica o usuário', async () => {
  const b = new Browser(app.base);
  const r = await b.login('cliente@example.com');
  assert.equal(r.location, '/');
  const home = await b.get('/');
  assert.match(home.body, /Conectado como <strong>Carla Mendes<\/strong>/);
});

test('T06 — Login com senha incorreta é recusado com mensagem genérica', async () => {
  const b = new Browser(app.base);
  const r = await b.post('/login', { email: 'juliana@example.com', password: 'errada123' }, { from: '/login' });
  assert.equal(r.status, 400);
  assert.match(r.body, /E-mail ou senha inválidos/);
  assert.ok(!b.cookies.sid);
});

test('T07 — Rota protegida redireciona ao login e, após autenticar, retorna à página pedida', async () => {
  const b = new Browser(app.base);
  const r = await b.get('/servicos/novo');
  assert.equal(r.status, 302);
  assert.equal(r.location, '/login?next=%2Fservicos%2Fnovo');
  await b.get(r.location);
  const login = await b.post('/login', { email: 'marina@example.com', password: 'nexo2026', next: '/servicos/novo' }, { csrf: true, from: r.location });
  assert.equal(login.location, '/servicos/novo');
});

test('T08 — Redirecionamento após login não aceita endereços externos (open redirect)', async () => {
  const b = new Browser(app.base);
  const r = await b.post('/login', { email: 'marina@example.com', password: 'nexo2026', next: '//site-malicioso.example/roubo' }, { from: '/login' });
  assert.equal(r.status, 302);
  assert.equal(r.location, '/');
});

test('T09 — Logout invalida a sessão no servidor', async () => {
  const b = new Browser(app.base);
  await b.login('bruno@example.com');
  const sid = b.cookies.sid;
  await b.post('/logout', {}, { from: '/' });
  const reuse = new Browser(app.base);
  reuse.cookies.sid = sid; // tenta reutilizar o identificador antigo
  const r = await reuse.get('/perfil');
  assert.equal(r.status, 302);
  assert.match(r.location, /^\/login/);
});

test('T10 — Um novo identificador de sessão é gerado a cada login (proteção contra fixação de sessão)', async () => {
  const b = new Browser(app.base);
  await b.get('/login');
  assert.ok(!b.cookies.sid, 'nenhuma sessão antes do login');
  await b.login('marina@example.com');
  const primeiro = b.cookies.sid;
  await b.post('/logout', {}, { from: '/' });
  await b.login('marina@example.com');
  assert.notEqual(b.cookies.sid, primeiro);
  assert.match(b.cookies.sid, /^[a-f0-9]{64}$/, 'token de 256 bits');
});

test('T11 — Cookie de sessão emitido com HttpOnly e SameSite=Lax', async () => {
  const res = await fetch(app.base + '/login');
  const setCookie = res.headers.getSetCookie().join(' | ');
  const b = new Browser(app.base);
  await b.get('/login');
  const html = b.lastHtml;
  const csrf = html.match(/name="_csrf" value="([a-f0-9]{64})"/)[1];
  const login = await fetch(app.base + '/login', {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: b.cookieHeader() },
    body: new URLSearchParams({ email: 'rafael@example.com', password: 'nexo2026', _csrf: csrf }).toString(),
  });
  const sid = login.headers.getSetCookie().find((c) => c.startsWith('sid='));
  assert.ok(sid, setCookie);
  assert.match(sid, /HttpOnly/);
  assert.match(sid, /SameSite=Lax/);
});

test('T12 — Recuperação de senha: link de uso único, que redefine a senha e encerra as sessões antigas', async () => {
  const antiga = new Browser(app.base);
  await antiga.login('juliana@example.com');
  const b = new Browser(app.base);
  const r = await b.post('/recuperar-senha', { email: 'juliana@example.com' }, { from: '/recuperar-senha' });
  assert.equal(r.status, 200);
  assert.match(r.body, /Se o endereço informado estiver cadastrado/);
  const inexistente = await new Browser(app.base).post('/recuperar-senha', { email: 'ninguem@example.com' }, { from: '/recuperar-senha' });
  assert.match(inexistente.body, /Se o endereço informado estiver cadastrado/, 'mesma resposta: não revela e-mails cadastrados');

  const outbox = path.join(app.dir, 'outbox');
  const mail = fs.readdirSync(outbox).filter((f) => f.includes('juliana')).map((f) => fs.readFileSync(path.join(outbox, f), 'utf8')).pop();
  const token = mail.match(/token=([a-f0-9]{64})/)[1];
  await b.get(`/redefinir-senha?token=${token}`);
  const ok = await b.post('/redefinir-senha', { token, password: 'novaSenha2026', password_confirm: 'novaSenha2026' }, { csrf: true, from: `/redefinir-senha?token=${token}` });
  assert.equal(ok.status, 302);
  const reuso = await new Browser(app.base).get(`/redefinir-senha?token=${token}`);
  assert.match(reuso.body, /Link inválido ou expirado/);
  const sessaoAntiga = await antiga.get('/perfil');
  assert.equal(sessaoAntiga.status, 302, 'sessão aberta com a senha antiga foi encerrada');
  await new Browser(app.base).login('juliana@example.com', 'novaSenha2026');
});
