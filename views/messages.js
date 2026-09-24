'use strict';

const h = require('./helpers');
const { e } = h;
const { messageList } = require('./public');

function contextLabel(c) {
  if (c.order_id) return { text: `Pedido: ${c.order_title}`, href: `/pedidos/${c.order_id}` };
  if (c.project_id) return { text: `Projeto: ${c.project_title}`, href: `/projetos/${c.project_id}` };
  if (c.service_id) return { text: `Serviço: ${c.service_title}`, href: `/servicos/${c.service_id}` };
  return { text: 'Contato pelo perfil', href: null };
}

function inboxPage({ conversations, user }) {
  const items = conversations.length ? conversations.map((c) => {
    const other = user.id === c.client_id ? { name: c.freelancer_name, avatar: c.freelancer_avatar } : { name: c.client_name, avatar: c.client_avatar };
    const ctx = contextLabel(c);
    return `
      <a class="thread${c.unread ? ' unread' : ''}" href="/mensagens/${c.id}">
        ${h.avatar(other.name, 'md', other.avatar)}
        <div class="thread-body">
          <div><strong>${e(other.name)}</strong> <span class="muted small">· ${e(ctx.text)}</span></div>
          <p class="muted small">${e(h.truncate(c.last_content, 90))}</p>
        </div>
        <div class="thread-side"><span class="muted small">${h.formatDate(c.updated_at)}</span>
          ${c.unread ? `<span class="nav-badge" aria-label="${c.unread} não lida${c.unread > 1 ? 's' : ''}">${c.unread}</span>` : ''}</div>
      </a>`;
  }).join('') : '<p class="empty">Você ainda não tem conversas.</p>';
  return `<h1>Mensagens</h1><p class="lead">Conversas privadas: cada conversa é visível apenas para você e a outra pessoa.</p>
    <div class="thread-list">${items}</div>`;
}

function conversationPage({ conversation: c, messages, user }) {
  const other = user.id === c.client_id ? c.freelancer_name : c.client_name;
  const ctx = contextLabel(c);
  return `
  <p class="breadcrumb"><a href="/mensagens">Mensagens</a> › ${e(other)}</p>
  <h1>Conversa com ${e(other)}</h1>
  <p class="muted">${ctx.href ? `<a href="${ctx.href}">${e(ctx.text)}</a>` : e(ctx.text)}</p>
  <section class="description-box">
    ${messageList(messages, user.id)}
    <form method="POST" action="/mensagens/${c.id}" class="stacked-form">
      <label for="content">Sua mensagem</label>
      <textarea id="content" name="content" rows="3" required maxlength="2000"></textarea>
      <button type="submit" class="btn btn-primary">Enviar</button>
    </form>
  </section>`;
}

module.exports = { inboxPage, conversationPage };
