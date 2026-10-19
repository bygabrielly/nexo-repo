'use strict';

const repo = require('../lib/repo');
const views = require('../views');
const { str, money, int, id, notFound, forbidden } = require('./util');

// Carrega o pedido e verifica se o usuário é uma das duas partes.
function loadOrder(ctx) {
  const o = repo.orders.byId.get(id(ctx.params[0]));
  if (!o) return { err: () => notFound(ctx) };
  if (o.client_id !== ctx.user.id && o.freelancer_id !== ctx.user.id) {
    return { err: () => forbidden(ctx, 'Apenas o cliente e o freelancer envolvidos podem acessar este pedido.') };
  }
  return { o };
}

function renderOrder(ctx, o, status = 200, errors = []) {
  const convId = repo.findOrCreateConversation({ clientId: o.client_id, freelancerId: o.freelancer_id, orderId: o.id });
  repo.messages.markRead.run(repo.now(), convId, ctx.user.id);
  ctx.render(status, `Pedido #${o.id}`, views.orderDetailPage({
    order: o,
    events: repo.orders.events.all(o.id),
    review: repo.reviews.byOrder.get(o.id),
    clientReview: repo.clientReviews.byOrder.get(o.id),
    reviewDeadline: repo.reviewDeadline(o),
    reviewOpen: repo.reviewWindowOpen(o),
    clientStats: repo.clientStats(o.client_id),
    messages: repo.messages.byConversation.all(convId),
    user: ctx.user,
    errors,
  }), 'pedidos');
}

async function list(ctx) {
  ctx.render(200, 'Pedidos', views.ordersListPage({
    orders: repo.orders.forUser.all(ctx.user.id, ctx.user.id),
    user: ctx.user,
    tab: ctx.query.get('aba') || 'ativos',
  }), 'pedidos');
}

async function detail(ctx) {
  const { o, err } = loadOrder(ctx);
  if (err) return err();
  renderOrder(ctx, o);
}

// Fábrica de ações de mudança de estado: verifica o papel (cliente ou
// freelancer do pedido), valida a observação e aplica a transição somente se
// o pedido estiver no estado esperado.
function action({ role, from, to, event, noteMin = 0, noteLabel, flash, extra }) {
  return async (ctx) => {
    const { o, err } = loadOrder(ctx);
    if (err) return err();
    const isRole = role === 'any' || (role === 'cliente' ? ctx.user.id === o.client_id : ctx.user.id === o.freelancer_id);
    if (!isRole) return forbidden(ctx, 'Esta ação não cabe a você neste pedido.');
    if (!from.includes(o.status)) return renderOrder(ctx, o, 409, ['Esta ação não está disponível na situação atual do pedido.']);
    const note = str(ctx.body.note, 2000);
    if (note.length < noteMin) return renderOrder(ctx, o, 400, [`${noteLabel} deve ter ao menos ${noteMin} caracteres.`]);
    let extraSql = '';
    let extraParams = [];
    if (extra) {
      const r = extra(ctx, o);
      if (r.error) return renderOrder(ctx, o, 400, [r.error]);
      ({ extraSql, extraParams } = r);
    }
    const ok = repo.transitionOrder(o.id, from, to, ctx.user.id, event, note, extraSql, extraParams);
    if (!ok) return renderOrder(ctx, o, 409, ['O pedido foi alterado por outra ação. Confira a situação atual.']);
    if (to === 'concluido' && o.project_id) repo.projects.setStatus.run('concluido', o.project_id, 'em_andamento');
    if ((to === 'cancelado' || to === 'recusado') && o.project_id) repo.projects.setStatus.run('encerrado', o.project_id, 'em_andamento');
    ctx.setFlash(flash, 'success');
    return ctx.redirect(`/pedidos/${o.id}`);
  };
}

const accept = action({
  role: 'freelancer', from: ['solicitado'], to: 'em_andamento', event: 'aceito',
  flash: 'Pedido aceito. Bom trabalho!',
  extra: (ctx, o) => {
    const now = repo.now();
    if (o.price !== null) return { extraSql: ', accepted_at = ?', extraParams: [now] };
    const price = money(ctx.body.price);
    if (!price || Number.isNaN(price) || price <= 0) return { error: 'Informe o valor combinado para aceitar o pedido.' };
    return { extraSql: ', accepted_at = ?, price = ?', extraParams: [now, price] };
  },
});
const decline = action({ role: 'freelancer', from: ['solicitado'], to: 'recusado', event: 'recusado', flash: 'Pedido recusado.' });
const deliver = action({
  role: 'freelancer', from: ['em_andamento'], to: 'entregue', event: 'entregue', noteMin: 10, noteLabel: 'A mensagem de entrega',
  flash: 'Entrega registrada. O cliente será avisado para aprovar.',
  extra: () => ({ extraSql: ', delivered_at = ?', extraParams: [repo.now()] }),
});
const approve = action({
  role: 'cliente', from: ['entregue'], to: 'concluido', event: 'concluido', flash: 'Pedido concluído! Que tal avaliar o freelancer?',
  extra: () => ({ extraSql: ', completed_at = ?', extraParams: [repo.now()] }),
});
const revision = action({
  role: 'cliente', from: ['entregue'], to: 'em_andamento', event: 'revisao', noteMin: 10, noteLabel: 'A descrição dos ajustes',
  flash: 'Pedido de ajustes enviado ao freelancer.',
  extra: () => ({ extraSql: ', revisions = revisions + 1', extraParams: [] }),
});
const cancel = action({ role: 'any', from: ['solicitado', 'em_andamento'], to: 'cancelado', event: 'cancelado', noteMin: 5, noteLabel: 'O motivo do cancelamento', flash: 'Pedido cancelado.' });

// Avaliação mútua: o cliente avalia o freelancer e o freelancer avalia o
// cliente, uma vez por pedido, somente após a conclusão e dentro do prazo.
// As notas só são publicadas quando as duas partes avaliam ou quando o prazo
// termina — assim, nenhuma das partes avalia já sabendo o que a outra disse.
function reviewHandler({ role, table, event, other }) {
  return async (ctx) => {
    const { o, err } = loadOrder(ctx);
    if (err) return err();
    const mine = role === 'cliente' ? ctx.user.id === o.client_id : ctx.user.id === o.freelancer_id;
    if (!mine) return forbidden(ctx, role === 'cliente' ? 'Apenas o cliente que contratou pode avaliar o freelancer.' : 'Apenas o freelancer do pedido pode avaliar o cliente.');
    if (o.status !== 'concluido') return renderOrder(ctx, o, 409, ['A avaliação fica disponível depois que o pedido é concluído.']);
    if (repo[table].byOrder.get(o.id)) return renderOrder(ctx, o, 409, ['Você já avaliou este pedido.']);
    if (!repo.reviewWindowOpen(o)) return renderOrder(ctx, o, 409, ['O prazo para avaliar este pedido terminou.']);
    const rating = int(ctx.body.rating);
    const comment = str(ctx.body.comment, 1000);
    const errors = [];
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) errors.push('Escolha uma nota de 1 a 5 estrelas.');
    if (comment.length < 10) errors.push('Escreva um comentário com ao menos 10 caracteres.');
    if (errors.length) return renderOrder(ctx, o, 400, errors);
    if (table === 'reviews') repo.reviews.insert.run(o.id, o.client_id, o.freelancer_id, o.service_id, rating, comment);
    else repo.clientReviews.insert.run(o.id, o.client_id, o.freelancer_id, rating, comment);
    repo.orders.insertEvent.run(o.id, ctx.user.id, event, '');
    const published = repo.publishOrderReviewsIfBoth(o.id);
    ctx.setFlash(published
      ? 'Obrigado pela avaliação! As duas avaliações deste pedido foram publicadas.'
      : `Obrigado pela avaliação! Ela será publicada quando ${other(o)} avaliar você ou quando o prazo de avaliação terminar.`, 'success');
    return ctx.redirect(`/pedidos/${o.id}#avaliacao`);
  };
}

const review = reviewHandler({ role: 'cliente', table: 'reviews', event: 'avaliado', other: (o) => o.freelancer_name });
const reviewClient = reviewHandler({ role: 'freelancer', table: 'clientReviews', event: 'avaliado_cliente', other: (o) => o.client_name });

async function reply(ctx) {
  const r = repo.reviews.byId.get(id(ctx.params[0]));
  if (!r) return notFound(ctx);
  if (r.freelancer_id !== ctx.user.id) return forbidden(ctx, 'Apenas o freelancer avaliado pode responder.');
  if (!r.published_at) {
    ctx.setFlash('A resposta fica disponível depois que a avaliação é publicada.', 'error');
    return ctx.redirect(`/pedidos/${r.order_id}#avaliacao`);
  }
  const text = str(ctx.body.reply, 1000);
  if (text.length < 5) {
    ctx.setFlash('A resposta deve ter ao menos 5 caracteres.', 'error');
    return ctx.redirect(`/pedidos/${r.order_id}#avaliacao`);
  }
  if (repo.reviews.reply.run(text, repo.now(), r.id, ctx.user.id).changes !== 1) {
    ctx.setFlash('Esta avaliação já foi respondida.', 'error');
  } else {
    ctx.setFlash('Resposta publicada.', 'success');
  }
  return ctx.redirect(`/pedidos/${r.order_id}#avaliacao`);
}

async function message(ctx) {
  const { o, err } = loadOrder(ctx);
  if (err) return err();
  const content = str(ctx.body.content, 2000);
  if (!content) return renderOrder(ctx, o, 400, ['Escreva uma mensagem antes de enviar.']);
  const convId = repo.findOrCreateConversation({ clientId: o.client_id, freelancerId: o.freelancer_id, orderId: o.id });
  repo.sendMessage(convId, ctx.user.id, content);
  return ctx.redirect(`/pedidos/${o.id}#conv-t`);
}

const R = (name) => new RegExp(`^\\/pedidos\\/(\\d+)\\/${name}$`);

module.exports = [
  { method: 'GET', path: '/pedidos', auth: 'user', handler: list },
  { method: 'GET', path: /^\/pedidos\/(\d+)$/, auth: 'user', handler: detail },
  { method: 'POST', path: R('aceitar'), auth: 'freelancer', handler: accept },
  { method: 'POST', path: R('recusar'), auth: 'freelancer', handler: decline },
  { method: 'POST', path: R('entregar'), auth: 'freelancer', handler: deliver },
  { method: 'POST', path: R('aprovar'), auth: 'cliente', handler: approve },
  { method: 'POST', path: R('revisao'), auth: 'cliente', handler: revision },
  { method: 'POST', path: R('cancelar'), auth: 'user', handler: cancel },
  { method: 'POST', path: R('avaliar'), auth: 'cliente', handler: review },
  { method: 'POST', path: R('avaliar-cliente'), auth: 'freelancer', handler: reviewClient },
  { method: 'POST', path: R('mensagem'), auth: 'user', limit: 'mensagens', handler: message },
  { method: 'POST', path: /^\/avaliacoes\/(\d+)\/responder$/, auth: 'freelancer', handler: reply },
];
