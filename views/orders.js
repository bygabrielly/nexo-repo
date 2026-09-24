'use strict';

const h = require('./helpers');
const { e } = h;
const { messageList } = require('./public');
const config = require('../lib/config');

const EVENT_LABEL = {
  solicitado: 'Pedido de contratação enviado',
  proposta_aceita: 'Proposta aceita pelo cliente — pedido iniciado',
  aceito: 'Pedido aceito pelo freelancer',
  recusado: 'Pedido recusado pelo freelancer',
  entregue: 'Trabalho entregue',
  revisao: 'Cliente pediu ajustes',
  concluido: 'Entrega aprovada — pedido concluído',
  concluido_auto: 'Pedido concluído automaticamente',
  cancelado: 'Pedido cancelado',
  avaliado: 'Cliente avaliou o freelancer',
  avaliado_cliente: 'Freelancer avaliou o cliente',
};

// Prazo de entrega: conta a partir do aceite do pedido.
function dueTime(o) {
  if (!o.accepted_at || !o.delivery_days) return null;
  return new Date(o.accepted_at.replace(' ', 'T') + 'Z').getTime() + o.delivery_days * 86400000;
}
function lateInfo(o) {
  const due = dueTime(o);
  if (!due) return '';
  if (o.status === 'em_andamento' && Date.now() > due) return '<span class="late-tag">Prazo vencido</span>';
  if (o.delivered_at && new Date(o.delivered_at.replace(' ', 'T') + 'Z').getTime() > due) return '<span class="late-tag">Entregue com atraso</span>';
  return '';
}

function addDays(sqlDate, n) {
  return new Date(new Date(sqlDate.replace(' ', 'T') + 'Z').getTime() + n * 86400000).toISOString();
}

const TABS = [
  ['ativos', 'Em aberto', ['solicitado', 'em_andamento', 'entregue']],
  ['concluidos', 'Concluídos', ['concluido']],
  ['encerrados', 'Cancelados e recusados', ['recusado', 'cancelado']],
  ['todos', 'Todos', null],
];

function needsAction(o, user) {
  return (user.id === o.freelancer_id && o.status === 'solicitado') || (user.id === o.client_id && o.status === 'entregue');
}

function ordersListPage({ orders, user, tab }) {
  const current = TABS.find((t) => t[0] === tab) || TABS[0];
  const list = current[2] ? orders.filter((o) => current[2].includes(o.status)) : orders;
  const tabs = `<nav class="tabs" aria-label="Filtrar pedidos">${TABS.map(([key, label, sts]) => {
    const n = sts ? orders.filter((o) => sts.includes(o.status)).length : orders.length;
    return `<a href="/pedidos?aba=${key}"${key === current[0] ? ' aria-current="page" class="active"' : ''}>${label} (${n})</a>`;
  }).join('')}</nav>`;

  const rows = list.length ? list.map((o) => {
    const other = user.id === o.client_id ? `Freelancer: ${e(o.freelancer_name)}` : `Cliente: ${e(o.client_name)}`;
    return `
      <a class="order-row" href="/pedidos/${o.id}">
        <div><strong>#${o.id} · ${e(o.title)}</strong><br><span class="muted small">${other} · ${o.project_id ? 'Projeto' : 'Serviço'} · atualizado em ${h.formatDate(o.updated_at)}</span></div>
        <div class="order-row-side">${h.statusBadge(h.ORDER_STATUS, o.status)}<span class="price">${h.formatPrice(o.price)}</span>
          ${needsAction(o, user) ? '<span class="action-needed">Requer sua ação</span>' : ''}${o.status === 'em_andamento' ? lateInfo(o) : ''}</div>
      </a>`;
  }).join('') : '<p class="empty">Nenhum pedido nesta lista.</p>';

  return `<h1>Pedidos</h1>
    <p class="lead">${user.role === 'cliente' ? 'Acompanhe os serviços que você contratou e os projetos em execução.' : 'Acompanhe os pedidos recebidos e os projetos em que sua proposta foi aceita.'}</p>
    ${tabs}<div class="order-list">${rows}</div>`;
}

function timeline(events) {
  return `<ol class="timeline">${events.map((ev) => `
    <li><span class="tl-date">${h.formatDateTime(ev.created_at)}</span>
      <strong>${e(EVENT_LABEL[ev.event] || ev.event)}</strong>${ev.actor_name ? ` <span class="muted small">por ${e(ev.actor_name)}</span>` : ''}
      ${ev.note ? `<p class="tl-note">${e(ev.note)}</p>` : ''}</li>`).join('')}</ol>`;
}

function actionsFor(o, user, errors) {
  const isClient = user.id === o.client_id;
  const isFreelancer = user.id === o.freelancer_id;
  const parts = [];
  if (isFreelancer && o.status === 'solicitado') {
    parts.push(`
      <form method="POST" action="/pedidos/${o.id}/aceitar" class="stacked-form">
        ${o.price === null ? `<label for="price">Valor combinado (R$)</label>
        <input type="number" id="price" name="price" min="1" step="0.01" required aria-describedby="p-hint">
        <p id="p-hint" class="hint">O serviço está "a combinar": informe o valor antes de aceitar.</p>` : ''}
        <button type="submit" class="btn btn-primary">Aceitar Pedido</button>
      </form>
      <form method="POST" action="/pedidos/${o.id}/recusar" class="stacked-form">
        <label for="note-r">Motivo da recusa (opcional)</label>
        <input type="text" id="note-r" name="note" maxlength="300">
        <button type="submit" class="btn btn-outline">Recusar Pedido</button>
      </form>`);
  }
  if (isFreelancer && o.status === 'em_andamento') {
    parts.push(`
      <form method="POST" action="/pedidos/${o.id}/entregar" class="stacked-form">
        <label for="note-e">Mensagem de entrega</label>
        <textarea id="note-e" name="note" rows="3" required minlength="10" maxlength="2000" aria-describedby="e-hint"
          placeholder="Descreva o que foi entregue e onde o cliente encontra os arquivos."></textarea>
        <p id="e-hint" class="hint">O cliente poderá aprovar a entrega ou pedir ajustes.</p>
        <button type="submit" class="btn btn-primary">Marcar como Entregue</button>
      </form>`);
  }
  if (isClient && o.status === 'entregue') {
    const auto = o.delivered_at ? h.formatDate(addDays(o.delivered_at, config.AUTO_COMPLETE_DAYS)) : null;
    parts.push(`
      ${auto ? `<p class="hint">Se você não aprovar nem pedir ajustes até <strong>${auto}</strong>, o pedido será concluído automaticamente.</p>` : ''}
      <form method="POST" action="/pedidos/${o.id}/aprovar" class="stacked-form" data-confirm="Aprovar a entrega e concluir o pedido?">
        <button type="submit" class="btn btn-primary">Aprovar Entrega e Concluir</button>
      </form>
      <form method="POST" action="/pedidos/${o.id}/revisao" class="stacked-form">
        <label for="note-v">O que precisa ser ajustado?</label>
        <textarea id="note-v" name="note" rows="3" required minlength="10" maxlength="2000"></textarea>
        <button type="submit" class="btn btn-outline">Pedir Ajustes</button>
      </form>`);
  }
  if ((isClient || isFreelancer) && ['solicitado', 'em_andamento'].includes(o.status)) {
    parts.push(`
      <details class="cancel-box"><summary>Cancelar pedido</summary>
        <form method="POST" action="/pedidos/${o.id}/cancelar" class="stacked-form" data-confirm="Cancelar este pedido? Esta ação não pode ser desfeita.">
          <label for="note-c">Motivo do cancelamento</label>
          <input type="text" id="note-c" name="note" required minlength="5" maxlength="300">
          <button type="submit" class="btn btn-danger">Confirmar Cancelamento</button>
        </form>
      </details>`);
  }
  if (isFreelancer && o.status === 'entregue' && o.delivered_at) {
    parts.push(`<p>Aguardando o cliente aprovar a entrega ou pedir ajustes. Sem resposta, o pedido será concluído automaticamente em
      <strong>${h.formatDate(addDays(o.delivered_at, config.AUTO_COMPLETE_DAYS))}</strong>.</p>`);
  }
  if (!parts.length) return '';
  return `<section class="side-card" aria-labelledby="acoes-t"><h2 id="acoes-t" class="h-small">Próximo passo</h2>${parts.join('')}</section>`;
}

function ratingForm(action, otherName, hint) {
  return `
    <form method="POST" action="${action}" class="stacked-form">
      <fieldset class="rating-input"><legend>Sua nota para ${e(otherName)}</legend>
        ${[5, 4, 3, 2, 1].map((n) => `<label><input type="radio" name="rating" value="${n}" required> <span aria-hidden="true">${'★'.repeat(n)}</span><span class="sr-only">${n} de 5</span></label>`).join('')}
      </fieldset>
      <label for="comment">Comentário</label>
      <textarea id="comment" name="comment" rows="3" required minlength="10" maxlength="1000" placeholder="${e(hint)}"></textarea>
      <button type="submit" class="btn btn-primary">Enviar Avaliação</button>
    </form>`;
}

function reviewBody(r) {
  return `<p>${h.starsFixed(r.rating)} <span class="muted small">${h.formatDate(r.published_at || r.created_at)}</span></p>
    <p>${e(r.comment)}</p>`;
}

// Avaliação mútua e "às cegas": cada parte avalia a outra; o conteúdo só é
// exibido quando as duas avaliaram ou quando o prazo termina.
function reviewSection({ o, review, clientReview, reviewOpen, reviewDeadline, user }) {
  if (o.status !== 'concluido') return '';
  const isClient = user.id === o.client_id;
  const mine = isClient ? review : clientReview;
  const theirs = isClient ? clientReview : review;
  const other = isClient ? o.freelancer_name : o.client_name;
  const deadline = reviewDeadline ? h.formatDate(reviewDeadline.replace(' ', 'T') + 'Z') : '';

  let minePart;
  if (!mine) {
    minePart = reviewOpen
      ? ratingForm(`/pedidos/${o.id}/${isClient ? 'avaliar' : 'avaliar-cliente'}`, other,
        isClient ? 'Como foi a comunicação? A entrega correspondeu ao combinado? Você contrataria de novo?'
          : 'O pedido foi claro? O cliente respondeu com agilidade? Você trabalharia com ele de novo?')
      : `<p class="muted">O prazo para avaliar ${e(other)} terminou em ${deadline}.</p>`;
  } else if (!mine.published_at) {
    minePart = `<h3 class="h-small">Sua avaliação de ${e(other)}</h3>${reviewBody(mine)}
      <p class="notice">Registrada. Será publicada quando ${e(other)} avaliar você ou em ${deadline}, o que ocorrer primeiro.</p>`;
  } else {
    minePart = `<h3 class="h-small">Sua avaliação de ${e(other)}</h3>${reviewBody(mine)}
      ${isClient && mine.reply ? `<div class="review-reply"><strong>Resposta do freelancer:</strong> ${e(mine.reply)}</div>` : ''}`;
  }

  let theirsPart;
  if (!theirs) {
    theirsPart = `<p class="muted">${e(other)} ${reviewOpen ? 'ainda não avaliou você.' : 'não avaliou você dentro do prazo.'}</p>`;
  } else if (!theirs.published_at) {
    theirsPart = `<p class="notice">${e(other)} já avaliou você. A avaliação será exibida quando você avaliar também ou em ${deadline}.</p>`;
  } else {
    const canReply = !isClient && theirs === review && !review.reply;
    theirsPart = `<h3 class="h-small">Avaliação de ${e(other)} sobre você</h3>${reviewBody(theirs)}
      ${!isClient && review.reply ? `<div class="review-reply"><strong>Sua resposta:</strong> ${e(review.reply)}</div>` : ''}
      ${canReply ? `
      <form method="POST" action="/avaliacoes/${review.id}/responder" class="stacked-form">
        <label for="reply">Responder publicamente</label>
        <textarea id="reply" name="reply" rows="2" required minlength="5" maxlength="1000"></textarea>
        <button type="submit" class="btn btn-outline">Publicar Resposta</button>
      </form>` : ''}`;
  }

  return `
  <section class="description-box" id="avaliacao" aria-labelledby="av-t">
    <h2 id="av-t">Avaliações</h2>
    <p class="hint">${reviewOpen
    ? `As avaliações são mútuas e publicadas ao mesmo tempo: cada parte só vê o que a outra escreveu depois de avaliar também ou quando o prazo terminar (${deadline}).`
    : `O prazo para as avaliações deste pedido terminou em ${deadline}.`}
      ${isClient ? 'A nota que você dá aparece no perfil público do freelancer.' : 'A nota que você dá ajuda outros freelancers a conhecer este cliente.'}</p>
    <div class="review-pair"><div>${minePart}</div><div>${theirsPart}</div></div>
  </section>`;
}

function orderDetailPage({ order: o, events, review, clientReview, reviewDeadline, reviewOpen, clientStats, messages, user, errors }) {
  const origin = o.project_id
    ? `<a href="/projetos/${o.project_id}">projeto publicado pelo cliente</a>`
    : o.service_id ? `<a href="/servicos/${o.service_id}">serviço do freelancer</a>` : '—';
  const due = o.accepted_at && o.delivery_days
    ? h.formatDate(new Date(new Date(o.accepted_at.replace(' ', 'T') + 'Z').getTime() + o.delivery_days * 86400000).toISOString())
    : null;

  return `
  <p class="breadcrumb"><a href="/pedidos">Pedidos</a> › Pedido #${o.id}</p>
  <div class="page-header"><h1>${e(o.title)}</h1>${h.statusBadge(h.ORDER_STATUS, o.status)}</div>
  ${h.formErrors(errors)}
  <div class="detail-layout">
    <div class="detail-main">
      <dl class="facts facts-wide">
        <div><dt>Cliente</dt><dd>${h.avatar(o.client_name, 'sm', o.client_avatar)} ${e(o.client_name)}
          ${user.id === o.freelancer_id && clientStats ? `<br>${h.stars(clientStats.avgRating, clientStats.reviewCount)}` : ''}</dd></div>
        <div><dt>Freelancer</dt><dd><a href="/freelancers/${o.freelancer_id}">${h.avatar(o.freelancer_name, 'sm', o.freelancer_avatar)} ${e(o.freelancer_name)}</a></dd></div>
        <div><dt>Valor combinado</dt><dd>${h.formatPrice(o.price)}</dd></div>
        <div><dt>Prazo</dt><dd>${h.days(o.delivery_days)}${due ? ` (até ${due})` : ''} ${lateInfo(o)}</dd></div>
        <div><dt>Origem</dt><dd>${origin}</dd></div>
        <div><dt>Ajustes pedidos</dt><dd>${o.revisions}</dd></div>
      </dl>
      <section class="description-box"><h2>O que foi pedido</h2><p class="pre">${e(o.requirements)}</p></section>
      ${reviewSection({ o, review, clientReview, reviewOpen, reviewDeadline, user })}
      <section class="description-box" aria-labelledby="hist-t"><h2 id="hist-t">Histórico</h2>${timeline(events)}</section>
      <section class="description-box" aria-labelledby="conv-t">
        <h2 id="conv-t">Conversa do pedido</h2>
        ${messageList(messages, user.id)}
        ${['recusado', 'cancelado'].includes(o.status) ? '' : `
        <form method="POST" action="/pedidos/${o.id}/mensagem" class="stacked-form">
          <label for="content">Mensagem</label>
          <textarea id="content" name="content" rows="3" required maxlength="2000"></textarea>
          <button type="submit" class="btn btn-outline">Enviar</button>
        </form>`}
      </section>
    </div>
    <aside class="detail-side">
      ${actionsFor(o, user, errors)}
      <div class="side-card small"><p><strong>Pagamento:</strong> o Nexo registra o valor combinado, mas não processa pagamentos (protótipo acadêmico).</p></div>
    </aside>
  </div>`;
}

module.exports = { ordersListPage, orderDetailPage, needsAction };
