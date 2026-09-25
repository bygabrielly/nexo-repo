'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startServer, Browser, PNG_1PX } = require('./helpers');

let app;
before(async () => { app = await startServer(); });
after(async () => { await app.close(); });

test('T13 — Envio de formulário sem token anti-CSRF é recusado', async () => {
  const b = new Browser(app.base);
  await b.login('marina@example.com');
  const r = await b.post('/servicos/novo', { title: 'Serviço forjado', category: 'Redação', description: 'x'.repeat(40), delivery_days: '3' }, { csrf: false });
  assert.equal(r.status, 403);
  assert.match(r.body, /proteção contra CSRF/);
});

test('T14 — Token anti-CSRF de outra sessão não é aceito', async () => {
  const atacante = new Browser(app.base);
  await atacante.login('rafael@example.com');
  await atacante.get('/perfil');
  const tokenDoAtacante = atacante.csrf();
  const vitima = new Browser(app.base);
  await vitima.login('marina@example.com');
  const r = await vitima.post('/servicos/novo', { title: 'Serviço forjado', category: 'Redação', description: 'x'.repeat(40), delivery_days: '3', _csrf: tokenDoAtacante }, { csrf: false });
  assert.equal(r.status, 403);
});

test('T15 — Upload de script disfarçado de imagem (.png com Content-Type image/png) é rejeitado', async () => {
  const b = new Browser(app.base);
  await b.login('marina@example.com');
  const script = Buffer.from('#!/bin/sh\necho "conteudo de um script, nao de uma imagem"\n');
  const antes = fs.existsSync(path.join(app.dir, 'uploads')) ? fs.readdirSync(path.join(app.dir, 'uploads')).length : 0;
  const r = await b.post('/perfil/portfolio', { title: 'falso' }, { from: '/perfil/portfolio', files: { image: { buffer: script, type: 'image/png', name: 'foto.png' } } });
  assert.equal(r.status, 400);
  assert.match(r.body, /não é uma imagem JPG, PNG ou WEBP válida/);
  const depois = fs.readdirSync(path.join(app.dir, 'uploads')).length;
  assert.equal(depois, antes, 'nenhum arquivo foi gravado');
});

test('T16 — Upload de imagem PNG real é aceito, com nome aleatório e extensão definida pelo conteúdo', async () => {
  const b = new Browser(app.base);
  await b.login('marina@example.com');
  const r = await b.post('/perfil/portfolio', { title: 'Imagem real' }, { from: '/perfil/portfolio', files: { image: { buffer: PNG_1PX, type: 'application/octet-stream', name: 'qualquer.bin' } } });
  assert.equal(r.status, 302);
  const page = await b.get('/perfil/portfolio');
  const m = page.body.match(/src="(\/uploads\/[a-f0-9]{24}\.png)" alt="Imagem real"/);
  assert.ok(m, 'imagem salva com nome aleatório e extensão .png');
  const img = await fetch(app.base + m[1]);
  assert.equal(img.headers.get('content-type'), 'image/png');
  assert.equal(img.headers.get('x-content-type-options'), 'nosniff');
});

test('T17 — Conteúdo com código HTML/JavaScript é exibido como texto (proteção contra XSS armazenado)', async () => {
  const b = new Browser(app.base);
  await b.login('marina@example.com');
  const r = await b.post('/servicos/novo', {
    title: '<script>alert(1)</script> Serviço', category: 'Redação',
    description: '<img src=x onerror=alert(2)> descrição com mais de trinta caracteres', delivery_days: '5',
  }, { from: '/servicos/novo' });
  assert.equal(r.status, 302);
  const page = await b.get(r.location);
  assert.ok(!page.body.includes('<script>alert(1)</script>'));
  assert.ok(!page.body.includes('<img src=x onerror'));
  assert.match(page.body, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('T18 — Respostas trazem cabeçalhos de segurança (CSP sem scripts embutidos, nosniff, antienquadramento)', async () => {
  const r = await fetch(app.base + '/');
  const csp = r.headers.get('content-security-policy');
  assert.match(csp, /script-src 'self'/);
  assert.doesNotMatch(csp, /unsafe-inline/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal(r.headers.get('referrer-policy'), 'same-origin');
  const html = await r.text();
  assert.doesNotMatch(html, /\son(submit|click|load)=/i, 'nenhum manipulador de evento embutido');
  assert.doesNotMatch(html, /<script>(?!<\/script>)/, 'nenhum script embutido');
});

test('T19 — E-mail do freelancer não é exibido no perfil público', async () => {
  const visitante = await new Browser(app.base).get('/freelancers/1');
  assert.equal(visitante.status, 200);
  assert.doesNotMatch(visitante.body, /marina@example\.com/);
  const cliente = new Browser(app.base);
  await cliente.login('cliente@example.com');
  const logado = await cliente.get('/freelancers/1');
  assert.doesNotMatch(logado.body, /marina@example\.com/);
  assert.match(logado.body, /Enviar mensagem para Marina Alves/);
});

test('T20 — Mensagens são privadas: um cliente não vê a conversa de outro cliente com o mesmo freelancer', async () => {
  const carla = new Browser(app.base);
  await carla.login('cliente@example.com');
  const propria = await carla.get('/servicos/1');
  assert.match(propria.body, /versão do logo para bordado/, 'a cliente vê a própria conversa');
  const bruno = new Browser(app.base);
  await bruno.login('bruno@example.com');
  const alheia = await bruno.get('/servicos/1');
  assert.doesNotMatch(alheia.body, /versão do logo para bordado/);
  const direta = await bruno.get('/mensagens/1');
  assert.equal(direta.status, 403);
});

test('T21 — Pedido só pode ser acessado pelo cliente e pelo freelancer envolvidos', async () => {
  const juliana = new Browser(app.base);
  await juliana.login('juliana@example.com');
  const r = await juliana.get('/pedidos/1'); // pedido entre Bruno e Marina
  assert.equal(r.status, 403);
  const marina = new Browser(app.base);
  await marina.login('marina@example.com');
  assert.equal((await marina.get('/pedidos/1')).status, 200);
});

test('T22 — Arquivos fora das pastas públicas não podem ser obtidos (path traversal)', async () => {
  for (const p of ['/uploads/../../server.js', '/uploads/%2e%2e/%2e%2e/lib/config.js', '/uploads/..%2F..%2Fdata%2Fdatabase.sqlite']) {
    const r = await fetch(app.base + p);
    assert.notEqual(r.status, 200, p);
    const t = await r.text();
    assert.doesNotMatch(t, /require\(/, p);
  }
});

test('T23 — Controle de acesso por papel: cliente não publica serviço; freelancer não publica projeto', async () => {
  const cliente = new Browser(app.base);
  await cliente.login('cliente@example.com');
  assert.equal((await cliente.get('/servicos/novo')).status, 403);
  const freela = new Browser(app.base);
  await freela.login('rafael@example.com');
  assert.equal((await freela.get('/projetos/novo')).status, 403);
});

test('T73 — A pasta de uploads só entrega imagens: outro tipo de arquivo colocado nela não é servido', async () => {
  const pasta = path.join(app.dir, 'uploads');
  fs.mkdirSync(pasta, { recursive: true });
  fs.writeFileSync(path.join(pasta, 'malicioso.js'), 'alert(1)');
  fs.writeFileSync(path.join(pasta, 'pagina.html'), '<script>alert(1)</script>');
  assert.equal((await fetch(app.base + '/uploads/malicioso.js')).status, 404);
  assert.equal((await fetch(app.base + '/uploads/pagina.html')).status, 404);
});
