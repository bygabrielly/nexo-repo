'use strict';

const repo = require('../lib/repo');
const views = require('../views');
const { str, id, notFound, forbidden } = require('./util');

function loadConversation(ctx) {
  const c = repo.conversations.byId.get(id(ctx.params[0]));
  if (!c) return { err: () => notFound(ctx) };
  // Conversas são privadas: só o cliente e o freelancer participantes têm acesso.
  if (c.client_id !== ctx.user.id && c.freelancer_id !== ctx.user.id) {
    return { err: () => forbidden(ctx, 'Esta conversa é privada.') };
  }
  return { c };
}

async function inbox(ctx) {
  ctx.render(200, 'Mensagens', views.inboxPage({
    conversations: repo.conversations.forUser.all(ctx.user.id, ctx.user.id, ctx.user.id),
    user: ctx.user,
  }), 'mensagens');
}

async function thread(ctx) {
  const { c, err } = loadConversation(ctx);
  if (err) return err();
  if (c.order_id) return ctx.redirect(`/pedidos/${c.order_id}#conv-t`);
  repo.messages.markRead.run(repo.now(), c.id, ctx.user.id);
  ctx.render(200, 'Conversa', views.conversationPage({ conversation: c, messages: repo.messages.byConversation.all(c.id), user: ctx.user }), 'mensagens');
}

async function send(ctx) {
  const { c, err } = loadConversation(ctx);
  if (err) return err();
  const content = str(ctx.body.content, 2000);
  if (content) repo.sendMessage(c.id, ctx.user.id, content);
  return ctx.redirect(`/mensagens/${c.id}`);
}

module.exports = [
  { method: 'GET', path: '/mensagens', auth: 'user', handler: inbox },
  { method: 'GET', path: /^\/mensagens\/(\d+)$/, auth: 'user', handler: thread },
  { method: 'POST', path: /^\/mensagens\/(\d+)$/, auth: 'user', limit: 'mensagens', handler: send },
];
