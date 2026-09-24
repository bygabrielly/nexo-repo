'use strict';

const repo = require('../lib/repo');
const views = require('../views');
const { str, money, int, id, notFound, forbidden } = require('./util');

function validateService(b) {
  const f = {
    title: str(b.title, 120),
    description: str(b.description, 5000),
    category: str(b.category, 40),
    price: money(b.price),
    deliveryDays: int(b.delivery_days),
    keywords: str(b.keywords, 200).split(',').map((k) => k.trim()).filter(Boolean).slice(0, 12).join(', '),
  };
  const errors = [];
  if (f.title.length < 5) errors.push('Informe um título com ao menos 5 caracteres.');
  if (!views.CATEGORIES.includes(f.category)) errors.push('Selecione uma categoria válida.');
  if (f.description.length < 30) errors.push('A descrição deve ter ao menos 30 caracteres, explicando o que está incluído.');
  if (Number.isNaN(f.price) || (f.price !== null && (f.price < 0 || f.price > 1000000))) errors.push('Informe um preço válido ou deixe em branco para "a combinar".');
  if (!Number.isInteger(f.deliveryDays) || f.deliveryDays < 1 || f.deliveryDays > 180) errors.push('Informe o prazo de entrega em dias (de 1 a 180).');
  // valores para reexibir o formulário
  const old = { title: f.title, description: f.description, category: f.category, price: str(b.price, 20), delivery_days: str(b.delivery_days, 5), keywords: str(b.keywords, 200) };
  return { f, errors, old };
}

async function myServices(ctx) {
  ctx.render(200, 'Meus Serviços', views.myServicesPage({
    services: repo.services.byUser.all(ctx.user.id),
    removed: repo.services.deletedByUser.all(ctx.user.id),
  }), 'meus-servicos');
}

async function newForm(ctx) {
  ctx.render(200, 'Publicar Serviço', views.serviceForm({ action: '/servicos/novo', errors: [], old: {}, title: 'Publicar Serviço', submitLabel: 'Publicar Serviço' }), 'meus-servicos');
}

async function create(ctx) {
  const { f, errors, old } = validateService(ctx.body);
  if (errors.length) {
    return ctx.render(400, 'Publicar Serviço', views.serviceForm({ action: '/servicos/novo', errors, old, title: 'Publicar Serviço', submitLabel: 'Publicar Serviço' }), 'meus-servicos');
  }
  const newId = repo.createService(ctx.user.id, f);
  ctx.setFlash('Serviço publicado com sucesso!', 'success');
  return ctx.redirect(`/servicos/${newId}`); // Post/Redirect/Get
}

function ownService(ctx) {
  const s = repo.services.byId.get(id(ctx.params[0]));
  if (!s) return { err: () => notFound(ctx) };
  if (s.user_id !== ctx.user.id) return { err: () => forbidden(ctx, 'Apenas o autor do serviço pode alterá-lo.') };
  return { s };
}

async function editForm(ctx) {
  const { s, err } = ownService(ctx);
  if (err) return err();
  ctx.render(200, 'Editar Serviço', views.serviceForm({ action: `/servicos/${s.id}/editar`, errors: [], old: s, title: 'Editar Serviço', submitLabel: 'Salvar Alterações' }), 'meus-servicos');
}

async function update(ctx) {
  const { s, err } = ownService(ctx);
  if (err) return err();
  const { f, errors, old } = validateService(ctx.body);
  if (errors.length) {
    return ctx.render(400, 'Editar Serviço', views.serviceForm({ action: `/servicos/${s.id}/editar`, errors, old, title: 'Editar Serviço', submitLabel: 'Salvar Alterações' }), 'meus-servicos');
  }
  repo.services.update.run(f.title, f.description, f.category, f.price, f.deliveryDays, f.keywords, s.id, ctx.user.id);
  ctx.setFlash('Serviço atualizado com sucesso.', 'success');
  return ctx.redirect(`/servicos/${s.id}`);
}

async function remove(ctx) {
  const serviceId = id(ctx.params[0]);
  const info = repo.services.softDelete.run(repo.now(), serviceId, ctx.user.id);
  if (info.changes !== 1) return forbidden(ctx, 'Serviço não encontrado entre os seus serviços.');
  ctx.setFlash('Serviço removido.', 'info', { undo: `/servicos/${serviceId}/restaurar` });
  return ctx.redirect('/meus-servicos');
}

async function restore(ctx) {
  const serviceId = id(ctx.params[0]);
  if (repo.services.restore.run(serviceId, ctx.user.id).changes !== 1) return forbidden(ctx);
  ctx.setFlash('Serviço restaurado.', 'success');
  return ctx.redirect('/meus-servicos');
}

async function hire(ctx) {
  const s = repo.services.byId.get(id(ctx.params[0]));
  if (!s) return notFound(ctx);
  const requirements = str(ctx.body.requirements, 3000);
  if (requirements.length < 20) {
    ctx.setFlash('Descreva o que você precisa com ao menos 20 caracteres para enviar o pedido.', 'error');
    return ctx.redirect(`/servicos/${s.id}`);
  }
  const orderId = repo.createOrder({
    clientId: ctx.user.id, freelancerId: s.user_id, serviceId: s.id,
    title: s.title, requirements, price: s.price, deliveryDays: s.delivery_days, status: 'solicitado',
  });
  repo.orders.insertEvent.run(orderId, ctx.user.id, 'solicitado', '');
  ctx.setFlash('Pedido enviado! O freelancer vai analisar e responder. Acompanhe por aqui.', 'success');
  return ctx.redirect(`/pedidos/${orderId}`);
}

async function message(ctx) {
  const s = repo.services.byId.get(id(ctx.params[0]));
  if (!s) return notFound(ctx);
  const content = str(ctx.body.content, 2000);
  if (!content) {
    ctx.setFlash('Escreva uma mensagem antes de enviar.', 'error');
    return ctx.redirect(`/servicos/${s.id}`);
  }
  // O destinatário é sempre o autor do serviço, obtido do banco de dados — e
  // não de um campo enviado pelo navegador.
  const convId = repo.findOrCreateConversation({ clientId: ctx.user.id, freelancerId: s.user_id, serviceId: s.id });
  repo.sendMessage(convId, ctx.user.id, content);
  ctx.setFlash('Mensagem enviada!', 'success');
  return ctx.redirect(`/servicos/${s.id}#duvidas`);
}

module.exports = [
  { method: 'GET', path: '/meus-servicos', auth: 'freelancer', handler: myServices },
  { method: 'GET', path: '/servicos/novo', auth: 'freelancer', handler: newForm },
  { method: 'POST', path: '/servicos/novo', auth: 'freelancer', handler: create },
  { method: 'GET', path: /^\/servicos\/(\d+)\/editar$/, auth: 'freelancer', handler: editForm },
  { method: 'POST', path: /^\/servicos\/(\d+)\/editar$/, auth: 'freelancer', handler: update },
  { method: 'POST', path: /^\/servicos\/(\d+)\/excluir$/, auth: 'freelancer', handler: remove },
  { method: 'POST', path: /^\/servicos\/(\d+)\/restaurar$/, auth: 'freelancer', handler: restore },
  { method: 'POST', path: /^\/servicos\/(\d+)\/contratar$/, auth: 'cliente', handler: hire },
  { method: 'POST', path: /^\/servicos\/(\d+)\/mensagem$/, auth: 'cliente', handler: message },
];
