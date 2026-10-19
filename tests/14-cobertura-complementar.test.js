'use strict';

// Testes acrescentados a partir do relatório de cobertura: rotas que a suíte
// ainda não exercitava (mensagens pela página do serviço e pelo perfil, edição
// de serviço e decisões do cliente sobre o projeto e as propostas).

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, Browser } = require('./helpers');

let app;
test.before(async () => { app = await startServer(); });
test.after(async () => { await app.close(); });

test('T85 — Mensagem pela página do serviço e pelo perfil chega sempre ao freelancer autor; mensagem vazia é recusada', async () => {
  const ana = new Browser(app.base);
  await ana.login('ana@example.com');
  const vazia = await ana.post('/servicos/1/mensagem', { content: '   ' }, { from: '/servicos/1' });
  assert.equal(vazia.status, 302);
  assert.match((await ana.get(vazia.location)).body, /Escreva uma mensagem antes de enviar/);
  // campos extras enviados pelo navegador (como um destinatário) são ignorados
  const r = await ana.post('/servicos/1/mensagem', { content: 'Olá! O serviço inclui o manual de marca?', freelancer_id: '2' }, { from: '/servicos/1' });
  assert.equal(r.status, 302);
  const pelo = await ana.post('/freelancers/1/mensagem', { content: 'Também gostaria de um orçamento para cartões.' }, { from: '/freelancers/1' });
  assert.match(pelo.location, /^\/mensagens\/\d+$/);
  const marina = new Browser(app.base);
  await marina.login('marina@example.com');
  // a conversa é do par cliente–freelancer em cada contexto: uma sobre o serviço e outra direta
  const caixa = await marina.get('/mensagens');
  assert.match(caixa.body, /O serviço inclui o manual de marca\?/);
  assert.match(caixa.body, /orçamento para cartões/);
  assert.equal((await marina.get(pelo.location)).status, 200);
  const rafael = new Browser(app.base);
  await rafael.login('rafael@example.com');
  assert.equal((await rafael.get(pelo.location)).status, 403, 'outro freelancer não lê a conversa');
});

test('T86 — Freelancer edita o próprio serviço; dados inválidos são recusados e o serviço fica inalterado', async () => {
  const marina = new Browser(app.base);
  await marina.login('marina@example.com');
  const invalido = await marina.post('/servicos/1/editar', { title: '', category: 'Inexistente', description: 'curta', delivery_days: '0' }, { from: '/servicos/1/editar' });
  assert.equal(invalido.status, 400);
  assert.match(invalido.body, /role="alert"/);
  const antes = await new Browser(app.base).get('/servicos/1');
  assert.match(antes.body, /Criação de identidade visual completa/);
  const ok = await marina.post('/servicos/1/editar', {
    title: 'Identidade visual completa para pequenos negócios', category: 'Design Gráfico',
    description: 'Logotipo, paleta de cores, tipografia e manual de marca em PDF, com duas rodadas de ajustes.',
    price: '900', delivery_days: '12', keywords: 'logotipo, marca',
  }, { from: '/servicos/1/editar' });
  assert.equal(ok.status, 302);
  assert.equal(ok.location, '/servicos/1');
  assert.match((await new Browser(app.base).get('/servicos/1')).body, /Identidade visual completa para pequenos negócios/);
});

test('T87 — Cliente recusa uma proposta, conversa com outro freelancer e encerra o projeto; terceiros não conseguem', async () => {
  const carla = new Browser(app.base);
  await carla.login('cliente@example.com');
  const bruno = new Browser(app.base);
  await bruno.login('bruno@example.com');
  assert.equal((await bruno.post('/propostas/1/recusar', {}, { from: '/projetos/1' })).status, 403);
  assert.equal((await bruno.post('/projetos/1/encerrar', {}, { from: '/projetos/1' })).status, 403);
  assert.equal((await carla.post('/propostas/1/recusar', {}, { from: '/projetos/1' })).status, 302);
  const conversa = await carla.post('/propostas/2/conversar', {}, { from: '/projetos/1' });
  assert.match(conversa.location, /^\/mensagens\/\d+$/);
  assert.equal((await carla.post('/projetos/1/encerrar', {}, { from: '/projetos/1' })).status, 302);
  const meus = await carla.get('/meus-projetos');
  assert.match(meus.body, /Projeto encerrado/);
  const rafael = new Browser(app.base);
  await rafael.login('rafael@example.com');
  const propostas = await rafael.get('/minhas-propostas');
  assert.match(propostas.body, /Não selecionada/, 'a proposta recusada aparece como não selecionada para o freelancer');
});
