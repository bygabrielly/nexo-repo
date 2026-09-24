'use strict';

const h = require('./helpers');
const { e } = h;

function projectsPage({ result, filters, page, pageSize, user }) {
  const list = result.rows.length
    ? `<div class="grid grid-2">${result.rows.map(h.projectCard).join('')}</div>`
    : '<p class="empty">Nenhum projeto aberto com esses filtros.</p>';
  const params = {};
  if (filters.q) params.q = filters.q;
  if (filters.category) params.categoria = filters.category;
  if (filters.minBudgetRaw) params.orcamento_min = filters.minBudgetRaw;
  if (filters.sort && filters.sort !== 'recentes') params.ordem = filters.sort;
  const sortOpt = (v, l) => `<option value="${v}" ${filters.sort === v ? 'selected' : ''}>${l}</option>`;
  return `
  <div class="page-header">
    <h1>Projetos Recebendo Propostas</h1>
    ${!user || user.role === 'cliente' ? '<a href="/projetos/novo" class="btn btn-primary">+ Publicar Projeto</a>' : '<a href="/minhas-propostas" class="btn btn-outline">Minhas Propostas</a>'}
  </div>
  <p class="lead">Clientes descrevem o que precisam; freelancers enviam propostas com valor e prazo.</p>
  <form method="GET" action="/projetos" class="search-form" role="search" aria-label="Buscar projetos">
    <div class="search-main">
      <label for="q" class="sr-only">Palavra-chave</label>
      <input type="search" id="q" name="q" placeholder="Buscar projetos por palavra-chave" value="${e(filters.q)}">
      <label for="categoria" class="sr-only">Categoria</label>
      <select id="categoria" name="categoria"><option value="">Todas as categorias</option>${h.categoryOptions(filters.category)}</select>
      <button type="submit" class="btn btn-primary">Buscar</button>
    </div>
    <fieldset class="filters">
      <legend>Refinar resultados</legend>
      <div><label for="orcamento_min">Orçamento a partir de (R$)</label>
        <input type="number" min="0" step="1" id="orcamento_min" name="orcamento_min" value="${e(filters.minBudgetRaw)}" aria-describedby="orc-hint"></div>
      <div><label for="ordem">Ordenar por</label>
        <select id="ordem" name="ordem">${sortOpt('recentes', 'Mais recentes')}${sortOpt('maior_orcamento', 'Maior orçamento')}${sortOpt('menos_propostas', 'Menos propostas')}</select></div>
      <p id="orc-hint" class="hint">Considera o valor máximo informado pelo cliente; projetos sem orçamento não entram nesse filtro.</p>
    </fieldset>
  </form>
  <p class="result-count" aria-live="polite">${result.total} ${result.total === 1 ? 'projeto aberto' : 'projetos abertos'}
    ${Object.keys(params).length ? ' · <a href="/projetos">limpar filtros</a>' : ''}</p>
  ${list}
  ${h.pagination('/projetos', params, page, result.total, pageSize)}`;
}

function projectForm({ errors, old = {} }) {
  return `
  <div class="form-card form-card-wide">
    <h1>Publicar Projeto</h1>
    <p class="hint">Freelancers interessados enviarão propostas com valor e prazo. Você escolhe a melhor.</p>
    ${h.formErrors(errors)}
    <form method="POST" action="/projetos/novo" class="stacked-form">
      <label for="title">Título do projeto</label>
      <input type="text" id="title" name="title" value="${e(old.title)}" required maxlength="120" placeholder="Ex.: Site institucional para escritório de contabilidade">
      <label for="category">Categoria</label>
      <select id="category" name="category" required><option value="">Selecione...</option>${h.categoryOptions(old.category)}</select>
      <label for="description">Descrição</label>
      <textarea id="description" name="description" rows="6" required minlength="30" maxlength="5000" aria-describedby="d-hint">${e(old.description)}</textarea>
      <p id="d-hint" class="hint">Explique o objetivo, o que deve ser entregue e qualquer referência útil.</p>
      <div class="field-row">
        <div><label for="budget_min">Orçamento mínimo (R$)</label><input type="number" min="0" step="1" id="budget_min" name="budget_min" value="${e(old.budget_min)}"></div>
        <div><label for="budget_max">Orçamento máximo (R$)</label><input type="number" min="0" step="1" id="budget_max" name="budget_max" value="${e(old.budget_max)}"></div>
        <div><label for="deadline_days">Prazo desejado (dias)</label><input type="number" min="1" max="365" step="1" id="deadline_days" name="deadline_days" value="${e(old.deadline_days)}"></div>
      </div>
      <p class="hint">Orçamento e prazo são opcionais, mas ajudam a receber propostas mais adequadas.</p>
      <button type="submit" class="btn btn-primary">Publicar Projeto</button>
    </form>
  </div>`;
}

function proposalCard(x, { ownerView }) {
  return `
  <article class="proposal">
    <div class="proposal-head">
      <a href="/freelancers/${x.freelancer_id}" class="provider-link">${h.avatar(x.freelancer_name, 'md', x.freelancer_avatar)} <strong>${e(x.freelancer_name)}</strong></a>
      <span class="muted small">${e(x.freelancer_area || '')}</span>
      ${x.stats ? h.stars(x.stats.avgRating, x.stats.reviewCount) : ''}
      ${h.statusBadge(h.PROPOSAL_STATUS, x.status)}
    </div>
    <dl class="facts"><div><dt>Valor</dt><dd>${h.formatPrice(x.price)}</dd></div><div><dt>Prazo</dt><dd>${h.days(x.delivery_days)}</dd></div>
      <div><dt>Enviada em</dt><dd>${h.formatDate(x.created_at)}</dd></div></dl>
    <p class="pre">${e(x.message)}</p>
    ${ownerView && x.status === 'enviada' ? `
    <div class="proposal-actions">
      <form method="POST" action="/propostas/${x.id}/aceitar" class="inline-form" data-confirm="Aceitar a proposta de ${e(x.freelancer_name)}? As demais propostas serão recusadas e o pedido começará.">
        <button type="submit" class="btn btn-primary">Aceitar Proposta</button></form>
      <form method="POST" action="/propostas/${x.id}/recusar" class="inline-form"><button type="submit" class="btn btn-outline">Recusar</button></form>
      <form method="POST" action="/propostas/${x.id}/conversar" class="inline-form"><button type="submit" class="link-button">Conversar com o freelancer</button></form>
    </div>` : ''}
  </article>`;
}

function clientBox(p, stats, reviews) {
  if (!stats) return '';
  return `
    <div class="side-card" aria-labelledby="cli-t">
      <h2 id="cli-t" class="h-small">Sobre o cliente</h2>
      <p>${h.avatar(p.client_name, 'sm', p.client_avatar)} <strong>${e(p.client_name)}</strong></p>
      <dl class="facts">
        <div><dt>Avaliação</dt><dd>${h.stars(stats.avgRating, stats.reviewCount)}</dd></div>
        <div><dt>Pedidos concluídos</dt><dd>${stats.completedOrders}</dd></div>
        ${stats.memberSince ? `<div><dt>Na plataforma desde</dt><dd>${h.formatDate(stats.memberSince)}</dd></div>` : ''}
      </dl>
      ${reviews && reviews.length ? `<ul class="mini-reviews">${reviews.map((r) => `
        <li>${h.starsFixed(r.rating)} <span class="muted small">por ${e(r.freelancer_name)}</span><br>“${e(h.truncate(r.comment, 120))}”</li>`).join('')}</ul>` : ''}
    </div>`;
}

function projectDetailPage({ project: p, proposals, myProposal, user, errors, old = {}, orderId, clientStats, clientReviews }) {
  const isOwner = user && user.id === p.client_id;
  const budget = p.budget_min || p.budget_max
    ? `${p.budget_min ? h.formatPrice(p.budget_min) : ''}${p.budget_min && p.budget_max ? ' a ' : ''}${p.budget_max ? h.formatPrice(p.budget_max) : ''}`
    : 'A combinar';

  let side;
  if (isOwner) {
    side = `<p>Você publicou este projeto.</p>
      ${orderId ? `<p><a class="btn btn-primary" href="/pedidos/${orderId}">Acompanhar o pedido</a></p>` : ''}
      ${p.status === 'aberto' ? `<form method="POST" action="/projetos/${p.id}/encerrar" data-confirm="Encerrar o projeto sem contratar ninguém?">
        <button type="submit" class="btn btn-outline">Encerrar sem contratar</button></form>` : ''}`;
  } else if (!user) {
    side = `<p><a href="/login?next=${encodeURIComponent('/projetos/' + p.id)}">Entre</a> ou <a href="/cadastro?next=${encodeURIComponent('/projetos/' + p.id)}">crie uma conta de freelancer</a> para enviar uma proposta.</p>`;
  } else if (user.role !== 'freelancer') {
    side = '<p class="muted">Apenas contas de freelancer podem enviar propostas.</p>';
  } else if (myProposal && myProposal.status !== 'retirada') {
    side = `<p>Sua proposta: <strong>${h.formatPrice(myProposal.price)}</strong> em ${h.days(myProposal.delivery_days)} · ${h.statusBadge(h.PROPOSAL_STATUS, myProposal.status)}</p>
      ${myProposal.status === 'enviada' ? `<form method="POST" action="/propostas/${myProposal.id}/retirar" data-confirm="Retirar sua proposta?">
        <button type="submit" class="btn btn-outline">Retirar Proposta</button></form>` : ''}
      ${myProposal.status === 'aceita' && orderId ? `<p><a class="btn btn-primary" href="/pedidos/${orderId}">Ir para o pedido</a></p>` : ''}`;
  } else if (p.status !== 'aberto') {
    side = '<p class="muted">Este projeto não está mais recebendo propostas.</p>';
  } else {
    if (myProposal && !old.message) old = { price: myProposal.price, delivery_days: myProposal.delivery_days, message: myProposal.message };
    side = `
      ${myProposal ? '<p class="notice">Você retirou sua proposta. Se quiser, revise os dados abaixo e envie novamente.</p>' : ''}
      <form method="POST" action="/projetos/${p.id}/propostas" class="stacked-form">
        <label for="price">Seu valor (R$)</label>
        <input type="number" id="price" name="price" min="1" step="0.01" required value="${e(old.price)}">
        <label for="delivery_days">Prazo de entrega (dias)</label>
        <input type="number" id="delivery_days" name="delivery_days" min="1" max="365" step="1" required value="${e(old.delivery_days)}">
        <label for="message">Como você fará o trabalho?</label>
        <textarea id="message" name="message" rows="5" required minlength="30" maxlength="3000" aria-describedby="m-hint">${e(old.message)}</textarea>
        <p id="m-hint" class="hint">Mostre que entendeu o pedido, cite trabalhos parecidos do seu portfólio e diga o que está incluso.</p>
        <button type="submit" class="btn btn-primary">Enviar Proposta</button>
      </form>
      <form method="POST" action="/projetos/${p.id}/pergunta" class="stacked-form">
        <label for="question">Ou tire uma dúvida com o cliente antes</label>
        <input type="text" id="question" name="content" required maxlength="1000">
        <button type="submit" class="btn btn-outline">Enviar Pergunta</button>
      </form>`;
  }

  const proposalsHtml = isOwner
    ? `<section aria-labelledby="prop-t"><h2 id="prop-t">Propostas recebidas (${proposals.length})</h2>
        ${proposals.length ? proposals.map((x) => proposalCard(x, { ownerView: p.status === 'aberto' })).join('') : '<p class="muted">Nenhuma proposta ainda. Freelancers da categoria verão o seu projeto na lista de projetos abertos.</p>'}</section>`
    : `<p class="muted">${p.proposal_count} ${Number(p.proposal_count) === 1 ? 'proposta enviada' : 'propostas enviadas'} até agora.</p>`;

  return `
  <p class="breadcrumb"><a href="/projetos">Projetos</a> › ${e(p.title)}</p>
  ${h.formErrors(errors)}
  <div class="detail-layout">
    <div class="detail-main">
      <div class="top-row"><span class="badge">${e(p.category)}</span>${h.statusBadge(h.PROJECT_STATUS, p.status)}</div>
      <h1>${e(p.title)}</h1>
      <p class="muted">Publicado por ${h.avatar(p.client_name, 'sm', p.client_avatar)} ${e(p.client_name)} em ${h.formatDate(p.created_at)}</p>
      <dl class="facts facts-wide"><div><dt>Orçamento</dt><dd>${budget}</dd></div><div><dt>Prazo desejado</dt><dd>${h.days(p.deadline_days)}</dd></div></dl>
      <section class="description-box"><h2>Descrição</h2><p class="pre">${e(p.description)}</p></section>
      ${proposalsHtml}
    </div>
    <aside class="detail-side"><div class="side-card">${side}</div>${clientBox(p, clientStats, clientReviews)}</aside>
  </div>`;
}

function myProjectsPage({ projects }) {
  return `
  <div class="page-header"><h1>Meus Projetos</h1><a href="/projetos/novo" class="btn btn-primary">+ Publicar Projeto</a></div>
  ${projects.length ? `<div class="grid grid-2">${projects.map(h.projectCard).join('')}</div>` : '<p class="empty">Você ainda não publicou projetos. Publique um para receber propostas de freelancers.</p>'}`;
}

function myProposalsPage({ proposals }) {
  const rows = proposals.length ? proposals.map((x) => `
    <tr><td><a href="/projetos/${x.project_id}">${e(x.project_title)}</a></td><td>${e(x.client_name)}</td>
      <td>${h.formatPrice(x.price)}</td><td>${h.days(x.delivery_days)}</td><td>${h.statusBadge(h.PROPOSAL_STATUS, x.status)}</td></tr>`).join('')
    : '<tr><td colspan="5" class="muted">Você ainda não enviou propostas. <a href="/projetos">Ver projetos abertos</a>.</td></tr>';
  return `<h1>Minhas Propostas</h1>
    <div class="table-wrap"><table class="data-table"><caption class="sr-only">Propostas enviadas</caption>
    <thead><tr><th scope="col">Projeto</th><th scope="col">Cliente</th><th scope="col">Valor</th><th scope="col">Prazo</th><th scope="col">Situação</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

module.exports = { projectsPage, projectForm, projectDetailPage, myProjectsPage, myProposalsPage };
