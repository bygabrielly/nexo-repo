'use strict';

// Perfil, ordenação da busca, busca de projetos, conversa sobre projeto e
// limites de leitura das requisições (roteamento e multipart escritos à mão).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startServer, Browser, PNG_1PX } = require('./helpers');

let app;
test.before(async () => { app = await startServer(); });
test.after(async () => { await app.close(); });

test('T74 — Edição do perfil: dados e foto aparecem no perfil público; LinkedIn inválido é recusado sem gravar imagem; a foto substituída é apagada', async () => {
  const marina = new Browser(app.base);
  await marina.login('marina@example.com');
  const uploads = path.join(app.dir, 'uploads');
  const antes = fs.readdirSync(uploads).length;
  const invalido = await marina.post('/perfil/editar', {
    name: 'Marina Alves', area: 'Design Gráfico', bio: 'Designer.', linkedin: 'linkedin.com/in/marina',
  }, { from: '/perfil/editar', files: { avatar: { buffer: PNG_1PX, type: 'image/png', name: 'foto.png' } } });
  assert.equal(invalido.status, 400);
  assert.equal(fs.readdirSync(uploads).length, antes, 'formulário recusado: a imagem enviada não fica gravada');
  assert.match(invalido.body, /O link do LinkedIn deve começar com http:\/\/ ou https:\/\//);

  const ok = await marina.post('/perfil/editar', {
    name: 'Marina Alves Rocha', area: 'Design e Ilustração',
    bio: 'Ilustradora e designer com foco em marcas para pequenos negócios.',
    linkedin: 'https://www.linkedin.com/in/marina-exemplo',
  }, { from: '/perfil/editar', files: { avatar: { buffer: PNG_1PX, type: 'image/png', name: 'foto.png' } } });
  assert.equal(ok.status, 302);
  assert.equal(ok.location, '/perfil');

  const publico = await new Browser(app.base).get('/freelancers/1');
  assert.match(publico.body, /Marina Alves Rocha/);
  assert.match(publico.body, /Design e Ilustração/);
  assert.match(publico.body, /Ilustradora e designer com foco em marcas/);
  assert.match(publico.body, /href="https:\/\/www\.linkedin\.com\/in\/marina-exemplo"/);
  const primeira = publico.body.match(/src="\/uploads\/([a-f0-9]{24}\.png)"/);
  assert.ok(primeira, 'nova foto gravada com nome aleatório');

  // ao substituir a foto, o arquivo anterior é apagado do servidor
  await marina.post('/perfil/editar', {
    name: 'Marina Alves Rocha', area: 'Design e Ilustração', bio: 'Ilustradora.', linkedin: '',
  }, { from: '/perfil/editar', files: { avatar: { buffer: PNG_1PX, type: 'image/png', name: 'outra.png' } } });
  assert.ok(!fs.existsSync(path.join(uploads, primeira[1])), 'foto anterior apagada');
  assert.equal((await fetch(`${app.base}/uploads/${primeira[1]}`)).status, 404);
});

test('T75 — Busca ordenada por prazo e por data; projetos abertos buscados por palavra-chave', async () => {
  const b = new Browser(app.base);
  const titulos = (html) => [...html.matchAll(/<h3><a href="\/servicos\/\d+">([^<]+)<\/a><\/h3>/g)].map((m) => m[1].trim());
  const porPrazo = titulos((await b.get('/servicos?ordem=prazo')).body);
  assert.equal(porPrazo[0], 'Correção de bugs e manutenção de sistemas web', 'menor prazo (3 dias) primeiro');
  assert.equal(porPrazo[porPrazo.length - 1], 'Desenvolvimento de site institucional', 'maior prazo (20 dias) por último');
  const recentes = titulos((await b.get('/servicos?ordem=recentes')).body);
  assert.equal(recentes[0], 'Revisão e adequação de textos de site', 'serviço publicado mais recentemente primeiro');
  assert.equal(recentes[recentes.length - 1], 'Desenvolvimento de site institucional', 'serviço mais antigo por último');

  const projetos = await b.get('/projetos?q=' + encodeURIComponent('landing page'));
  assert.match(projetos.body, /Landing page para lançamento de coleção/);
  assert.doesNotMatch(projetos.body, /Vídeo curto para redes sociais do escritório/);
});

test('T76 — Pergunta sobre um projeto abre conversa privada entre o freelancer e o autor do projeto', async () => {
  const lucas = new Browser(app.base);
  await lucas.login('lucas@example.com');
  const r = await lucas.post('/projetos/1/pergunta', { content: 'As fotos da coleção já estão tratadas?' }, { from: '/projetos/1' });
  assert.equal(r.status, 302);
  const conversa = r.location;
  assert.match(conversa, /^\/mensagens\/\d+$/);

  const carla = new Browser(app.base);
  await carla.login('cliente@example.com');
  const vista = await carla.get(conversa);
  assert.equal(vista.status, 200);
  assert.match(vista.body, /As fotos da coleção já estão tratadas\?/);

  const bruno = new Browser(app.base);
  await bruno.login('bruno@example.com');
  assert.equal((await bruno.get(conversa)).status, 403, 'terceiros não abrem a conversa');
});

test('T77 — Leitura das requisições: corpo acima do limite e multipart em página que não recebe arquivos são recusados', async () => {
  const marina = new Browser(app.base);
  await marina.login('marina@example.com');
  await marina.get('/servicos/novo');
  const grande = new URLSearchParams({ _csrf: marina.csrf(), title: 'x', description: 'y'.repeat(1100 * 1024) }).toString();
  const r1 = await fetch(app.base + '/servicos/novo', {
    method: 'POST', redirect: 'manual',
    headers: { cookie: marina.cookieHeader(), 'content-type': 'application/x-www-form-urlencoded' }, body: grande,
  });
  assert.equal(r1.status, 413);

  const r2 = await marina.post('/servicos/novo', { title: 'Serviço enviado como multipart', category: 'Redação', description: 'z'.repeat(40), delivery_days: '3' },
    { from: '/servicos/novo', files: { image: { buffer: PNG_1PX, type: 'image/png', name: 'x.png' } } });
  assert.equal(r2.status, 413);
  assert.match(r2.body, /grande demais ou está em um formato inválido/);
  const meus = await marina.get('/meus-servicos');
  assert.doesNotMatch(meus.body, /Serviço enviado como multipart/, 'nenhum serviço foi criado');
});
