'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, Browser } = require('./helpers');

let app;
let cliente;
let freela;
let pedido;

before(async () => {
  app = await startServer();
  cliente = new Browser(app.base);
  await cliente.login('ana@example.com');
  freela = new Browser(app.base);
  await freela.login('marina@example.com');
});
after(async () => { await app.close(); });

test('T31 — Cliente contrata um serviço: o pedido é criado como "solicitado" e o freelancer é notificado', async () => {
  const r = await cliente.post('/servicos/1/contratar', { requirements: 'Logotipo para clínica odontológica, tons de azul-claro e branco.' }, { from: '/servicos/1' });
  assert.equal(r.status, 302);
  pedido = r.location;
  assert.match(pedido, /^\/pedidos\/\d+$/);
  const p = await cliente.get(pedido);
  assert.match(p.body, /Aguardando resposta do freelancer/);
  const home = await freela.get('/pedidos');
  assert.match(home.body, /Requer sua ação/);
  assert.match(home.body, /class="nav-badge"/, 'contador de pendências no menu');
});

test('T32 — Ações fora de ordem ou do papel errado são bloqueadas', async () => {
  const clienteAceita = await cliente.post(pedido + '/aceitar', {}, { from: pedido });
  assert.equal(clienteAceita.status, 403, 'aceitar é ação do freelancer');
  const freelaAprova = await freela.post(pedido + '/aprovar', {}, { from: pedido });
  assert.equal(freelaAprova.status, 403, 'aprovar é ação do cliente');
  const aprovarAntes = await cliente.post(pedido + '/aprovar', {}, { from: pedido });
  assert.equal(aprovarAntes.status, 409, 'não se aprova um pedido que ainda não foi entregue');
});

test('T33 — Fluxo completo: aceitar, entregar, pedir ajuste, entregar de novo e aprovar', async () => {
  assert.equal((await freela.post(pedido + '/aceitar', {}, { from: pedido })).status, 302);
  assert.match((await freela.get(pedido)).body, /Em andamento/);

  const entregaCurta = await freela.post(pedido + '/entregar', { note: 'ok' }, { from: pedido });
  assert.equal(entregaCurta.status, 400);
  assert.equal((await freela.post(pedido + '/entregar', { note: 'Três propostas de logotipo no link combinado.' }, { from: pedido })).status, 302);
  assert.equal((await cliente.post(pedido + '/revisao', { note: 'Prefiro a proposta 2 com azul mais escuro.' }, { from: pedido })).status, 302);
  const aposRevisao = await cliente.get(pedido);
  assert.match(aposRevisao.body, /Em andamento/);
  assert.match(aposRevisao.body, /Cliente pediu ajustes/);
  assert.equal((await freela.post(pedido + '/entregar', { note: 'Ajuste feito, arquivos finais enviados.' }, { from: pedido })).status, 302);
  assert.equal((await cliente.post(pedido + '/aprovar', {}, { from: pedido })).status, 302);
  const final = await cliente.get(pedido);
  assert.match(final.body, /Concluído/);
  for (const ev of ['Pedido de contratação enviado', 'Pedido aceito pelo freelancer', 'Trabalho entregue', 'Entrega aprovada']) assert.match(final.body, new RegExp(ev));
});

test('T34 — Transição inválida é recusada (aprovar um pedido já concluído)', async () => {
  const r = await cliente.post(pedido + '/aprovar', {}, { from: pedido });
  assert.equal(r.status, 409);
  assert.match(r.body, /não está disponível na situação atual/);
});

test('T35 — Avaliação do freelancer: só pelo cliente, só após a conclusão, uma vez; o freelancer responde publicamente', async () => {
  const naoCliente = await freela.post(pedido + '/avaliar', { rating: '5', comment: 'Autoavaliação indevida.' }, { from: pedido });
  assert.equal(naoCliente.status, 403);
  const semNota = await cliente.post(pedido + '/avaliar', { comment: 'Muito bom trabalho, recomendo.' }, { from: pedido });
  assert.equal(semNota.status, 400);
  assert.equal((await cliente.post(pedido + '/avaliar', { rating: '5', comment: 'Ótima comunicação e entrega no prazo.' }, { from: pedido })).status, 302);
  const repetida = await cliente.post(pedido + '/avaliar', { rating: '1', comment: 'Tentando avaliar de novo.' }, { from: pedido });
  assert.equal(repetida.status, 409);
  // A freelancer avalia a cliente; com as duas avaliações feitas, ambas são publicadas.
  assert.equal((await freela.post(pedido + '/avaliar-cliente', { rating: '5', comment: 'Cliente objetiva e muito educada.' }, { from: pedido })).status, 302);
  const pag = await freela.get(pedido);
  const reviewId = pag.body.match(/action="\/avaliacoes\/(\d+)\/responder"/)[1];
  assert.equal((await freela.post(`/avaliacoes/${reviewId}/responder`, { reply: 'Obrigada pela confiança!' }, { from: pedido })).status, 302);
  const perfil = await new Browser(app.base).get('/freelancers/1');
  assert.match(perfil.body, /Ótima comunicação e entrega no prazo/);
  assert.match(perfil.body, /Obrigada pela confiança!/);
});

test('T36 — Reputação: média de avaliações e pedidos concluídos aparecem no perfil e nos cartões', async () => {
  const perfil = await new Browser(app.base).get('/freelancers/1');
  assert.match(perfil.body, /Nota 5 de 5, com base em 2 avaliações/);
  assert.match(perfil.body, /<dt>Pedidos concluídos<\/dt><dd>2<\/dd>/);
  const busca = await new Browser(app.base).get('/servicos?q=identidade');
  assert.match(busca.body, /com base em 2 avaliações/);
});

test('T37 — Serviço "a combinar": o freelancer precisa informar o valor para aceitar', async () => {
  const bruno = new Browser(app.base);
  await bruno.login('bruno@example.com');
  const r = await bruno.post('/servicos/6/contratar', { requirements: 'Revisão dos textos das 6 páginas do site do escritório.' }, { from: '/servicos/6' });
  const p = r.location;
  const juliana = new Browser(app.base);
  await juliana.login('juliana@example.com');
  const semValor = await juliana.post(p + '/aceitar', {}, { from: p });
  assert.equal(semValor.status, 400);
  assert.match(semValor.body, /Informe o valor combinado/);
  assert.equal((await juliana.post(p + '/aceitar', { price: '280' }, { from: p })).status, 302);
  assert.match((await juliana.get(p)).body, /R\$\s?280,00/);
});

test('T38 — Cancelamento exige motivo e fica registrado no histórico', async () => {
  const r = await cliente.post('/servicos/4/contratar', { requirements: 'Corrigir o envio de e-mails do formulário do site.' }, { from: '/servicos/4' });
  const p = r.location;
  const semMotivo = await cliente.post(p + '/cancelar', { note: '' }, { from: p });
  assert.equal(semMotivo.status, 400);
  assert.equal((await cliente.post(p + '/cancelar', { note: 'Resolvido internamente.' }, { from: p })).status, 302);
  const page = await cliente.get(p);
  assert.match(page.body, /Cancelado/);
  assert.match(page.body, /Resolvido internamente\./);
});

test('T39 — Conversa do pedido é compartilhada apenas entre as duas partes', async () => {
  assert.equal((await cliente.post(pedido + '/mensagem', { content: 'Recebi os arquivos, obrigada!' }, { from: pedido })).status, 302);
  assert.match((await freela.get(pedido)).body, /Recebi os arquivos, obrigada!/);
  const terceiro = new Browser(app.base);
  await terceiro.login('rafael@example.com');
  assert.equal((await terceiro.get(pedido)).status, 403);
});

// Problema encontrado na reavaliação heurística (visibilidade do status do
// sistema): o pedido não sinalizava quando o prazo de entrega era ultrapassado.
test('T65 — Pedido com prazo vencido é sinalizado, e a entrega fora do prazo fica registrada', async () => {
  const repo = require('../lib/repo');
  const r = await cliente.post('/servicos/2/contratar', { requirements: 'Artes para a semana de saúde bucal da clínica.' }, { from: '/servicos/2' });
  const p = r.location;
  const orderId = Number(p.split('/').pop());
  await freela.post(p + '/aceitar', {}, { from: p });
  assert.doesNotMatch((await cliente.get(p)).body, /Prazo vencido/);
  repo.db.prepare('UPDATE orders SET accepted_at = ? WHERE id = ?').run(repo.daysAgo(10), orderId); // prazo do serviço: 5 dias
  assert.match((await cliente.get(p)).body, /Prazo vencido/);
  assert.match((await freela.get('/pedidos')).body, /Prazo vencido/);
  await freela.post(p + '/entregar', { note: 'Artes entregues, com desculpas pelo atraso.' }, { from: p });
  assert.match((await cliente.get(p)).body, /Entregue com atraso/);
});
