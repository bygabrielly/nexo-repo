'use strict';

// Avaliação mútua "às cegas", prazo de avaliação, reputação do cliente e
// conclusão automática de pedidos entregues — recursos equivalentes aos das
// plataformas de mercado analisadas (Workana e Fiverr).

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, Browser } = require('./helpers');

let app;
let repo;
let ana;
let marina;

before(async () => {
  app = await startServer();
  repo = require('../lib/repo'); // mesmo processo e mesmo banco temporário do servidor
  ana = new Browser(app.base);
  await ana.login('ana@example.com');
  marina = new Browser(app.base);
  await marina.login('marina@example.com');
});
after(async () => { await app.close(); });

// Cria um pedido de Ana para Marina e o leva até "concluído".
async function concludedOrder(requirements) {
  const r = await ana.post('/servicos/2/contratar', { requirements }, { from: '/servicos/2' });
  const p = r.location;
  await marina.post(p + '/aceitar', {}, { from: p });
  await marina.post(p + '/entregar', { note: 'Artes entregues no link combinado.' }, { from: p });
  await ana.post(p + '/aprovar', {}, { from: p });
  return p;
}

test('T60 — Avaliação mútua às cegas: nenhuma nota é exibida até que as duas partes avaliem', async () => {
  const p = await concludedOrder('Dez artes para a campanha de prevenção da clínica.');
  assert.equal((await ana.post(p + '/avaliar', { rating: '4', comment: 'Artes bonitas, entregues no prazo.' }, { from: p })).status, 302);

  // Antes da avaliação da freelancer: a nota da cliente não aparece em lugar nenhum.
  assert.doesNotMatch((await new Browser(app.base).get('/freelancers/1')).body, /Artes bonitas, entregues no prazo/);
  const vistaMarina = await marina.get(p);
  assert.match(vistaMarina.body, /já avaliou você/);
  assert.doesNotMatch(vistaMarina.body, /Artes bonitas, entregues no prazo/);
  assert.doesNotMatch(vistaMarina.body, /action="\/avaliacoes\/\d+\/responder"/, 'não se responde a uma avaliação ainda não publicada');
  assert.match((await ana.get(p)).body, /Será publicada quando Marina Alves avaliar você/);

  // Papel errado e nota inválida são recusados.
  assert.equal((await ana.post(p + '/avaliar-cliente', { rating: '5', comment: 'Tentativa indevida.' }, { from: p })).status, 403);
  assert.equal((await marina.post(p + '/avaliar-cliente', { rating: '9', comment: 'Nota fora da escala.' }, { from: p })).status, 400);

  // A freelancer avalia a cliente: as duas avaliações são publicadas juntas.
  assert.equal((await marina.post(p + '/avaliar-cliente', { rating: '5', comment: 'Cliente clara e pontual nos retornos.' }, { from: p })).status, 302);
  assert.equal((await marina.post(p + '/avaliar-cliente', { rating: '1', comment: 'Tentando avaliar de novo.' }, { from: p })).status, 409);
  assert.match((await new Browser(app.base).get('/freelancers/1')).body, /Artes bonitas, entregues no prazo/);
  assert.match((await ana.get(p)).body, /Cliente clara e pontual nos retornos/);
  assert.match((await ana.get('/perfil')).body, /Cliente clara e pontual nos retornos/);
});

test('T61 — Prazo de 14 dias: avaliações pendentes são publicadas ao fim do prazo e novas avaliações são recusadas', async () => {
  const p = await concludedOrder('Arte para o aviso de horário de fim de ano.');
  const orderId = Number(p.split('/').pop());
  assert.equal((await ana.post(p + '/avaliar', { rating: '3', comment: 'Resultado correto, mas precisei insistir nos ajustes.' }, { from: p })).status, 302);
  assert.doesNotMatch((await new Browser(app.base).get('/freelancers/1')).body, /precisei insistir nos ajustes/);

  // Simula a passagem do tempo: conclusão há 15 dias.
  repo.db.prepare('UPDATE orders SET completed_at = ? WHERE id = ?').run(repo.daysAgo(15), orderId);
  const r = repo.runScheduledTasks();
  assert.ok(r.reviewsPublished >= 1);
  assert.match((await new Browser(app.base).get('/freelancers/1')).body, /precisei insistir nos ajustes/);
  const tarde = await marina.post(p + '/avaliar-cliente', { rating: '5', comment: 'Avaliação depois do prazo.' }, { from: p });
  assert.equal(tarde.status, 409);
  assert.match(tarde.body, /prazo para avaliar este pedido terminou/);
});

test('T62 — Conclusão automática: entrega sem resposta do cliente por 3 dias conclui o pedido', async () => {
  const r = await ana.post('/servicos/1/contratar', { requirements: 'Logotipo para a unidade nova da clínica.' }, { from: '/servicos/1' });
  const p = r.location;
  const orderId = Number(p.split('/').pop());
  await marina.post(p + '/aceitar', {}, { from: p });
  await marina.post(p + '/entregar', { note: 'Três versões do logotipo no link combinado.' }, { from: p });
  assert.match((await ana.get(p)).body, /será concluído automaticamente/, 'o cliente é avisado do prazo');

  // Entregue há 2 dias: ainda não conclui.
  repo.db.prepare('UPDATE orders SET delivered_at = ? WHERE id = ?').run(repo.daysAgo(2), orderId);
  repo.runScheduledTasks();
  assert.equal(repo.orders.byId.get(orderId).status, 'entregue');

  // Entregue há 4 dias: conclui automaticamente e registra no histórico.
  repo.db.prepare('UPDATE orders SET delivered_at = ? WHERE id = ?').run(repo.daysAgo(4), orderId);
  assert.ok(repo.runScheduledTasks().autoCompleted >= 1);
  const page = await ana.get(p);
  assert.match(page.body, /Concluído/);
  assert.match(page.body, /Pedido concluído automaticamente/);
  assert.match(page.body, /Sem resposta do cliente em 3 dias/);
  assert.match(page.body, /name="rating"/, 'a avaliação fica disponível após a conclusão automática');
});

test('T63 — Reputação do cliente: nota, pedidos concluídos e comentários visíveis no projeto e no pedido', async () => {
  const rafael = new Browser(app.base);
  await rafael.login('rafael@example.com');
  const projeto = await rafael.get('/projetos/1'); // projeto publicado por Carla Mendes
  assert.match(projeto.body, /Sobre o cliente/);
  assert.match(projeto.body, /Nota 5 de 5, com base em 1 avaliação/);
  assert.match(projeto.body, /aprovou as etapas sem demora/);
  const pedido = await rafael.get('/pedidos/6'); // pedido de Bruno, avaliado por Marina
  assert.match(pedido.body, /Nota 5 de 5, com base em 1 avaliação/);
});
