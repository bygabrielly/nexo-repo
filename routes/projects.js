'use strict';

const repo = require('../lib/repo');
const views = require('../views');
const config = require('../lib/config');
const { str, money, int, id, notFound, forbidden } = require('./util');

async function list(ctx) {
  const filters = {
    q: str(ctx.query.get('q'), 100),
    category: views.CATEGORIES.includes(ctx.query.get('categoria')) ? ctx.query.get('categoria') : '',
    minBudgetRaw: str(ctx.query.get('orcamento_min'), 12),
    sort: ['recentes', 'maior_orcamento', 'menos_propostas'].includes(ctx.query.get('ordem')) ? ctx.query.get('ordem') : 'recentes',
  };
  const minBudget = money(filters.minBudgetRaw);
  const page = Math.max(1, int(ctx.query.get('pagina')) || 1);
  const result = repo.searchProjects({
    q: filters.q, category: filters.category, sort: filters.sort,
    minBudget: minBudget === null || Number.isNaN(minBudget) ? null : minBudget,
    page, pageSize: config.PAGE_SIZE,
  });
  ctx.render(200, 'Projetos', views.projectsPage({ result, filters, page, pageSize: config.PAGE_SIZE, user: ctx.user }), 'projetos');
}

async function newForm(ctx) {
  ctx.render(200, 'Publicar Projeto', views.projectForm({ errors: [] }), 'meus-projetos');
}

async function create(ctx) {
  const b = ctx.body;
  const f = {
    title: str(b.title, 120), description: str(b.description, 5000), category: str(b.category, 40),
    budgetMin: money(b.budget_min), budgetMax: money(b.budget_max), deadline: int(b.deadline_days),
  };
  const errors = [];
  if (f.title.length < 5) errors.push('Informe um título com ao menos 5 caracteres.');
  if (!views.CATEGORIES.includes(f.category)) errors.push('Selecione uma categoria válida.');
  if (f.description.length < 30) errors.push('A descrição deve ter ao menos 30 caracteres.');
  if (Number.isNaN(f.budgetMin) || Number.isNaN(f.budgetMax) || (f.budgetMin !== null && f.budgetMin < 0) || (f.budgetMax !== null && f.budgetMax < 0)) errors.push('Informe o orçamento apenas com números positivos.');
  else if (f.budgetMin !== null && f.budgetMax !== null && f.budgetMin > f.budgetMax) errors.push('O orçamento mínimo não pode ser maior que o máximo.');
  if (Number.isNaN(f.deadline) || (f.deadline !== null && (f.deadline < 1 || f.deadline > 365))) errors.push('Informe o prazo em dias (de 1 a 365) ou deixe em branco.');
  if (errors.length) {
    const old = { title: f.title, description: f.description, category: f.category, budget_min: str(b.budget_min, 12), budget_max: str(b.budget_max, 12), deadline_days: str(b.deadline_days, 4) };
    return ctx.render(400, 'Publicar Projeto', views.projectForm({ errors, old }), 'meus-projetos');
  }
  const pid = repo.projects.insert.run(ctx.user.id, f.title, f.description, f.category, f.budgetMin, f.budgetMax, f.deadline).lastInsertRowid;
  ctx.setFlash('Projeto publicado! Você será avisado quando chegarem propostas.', 'success');
  return ctx.redirect(`/projetos/${pid}`);
}

function orderForProject(projectId) {
  const row = repo.db.prepare('SELECT id FROM orders WHERE project_id = ? ORDER BY id DESC LIMIT 1').get(projectId);
  return row ? row.id : null;
}

function renderProject(ctx, p, status = 200, errors = [], old = {}) {
  const u = ctx.user;
  const isOwner = u && u.id === p.client_id;
  const proposals = isOwner
    ? repo.proposals.byProject.all(p.id).filter((x) => x.status !== 'retirada').map((x) => ({ ...x, stats: repo.freelancerStats(x.freelancer_id) }))
    : [];
  const myProposal = u && u.role === 'freelancer' ? repo.proposals.mine.get(p.id, u.id) : null;
  const orderId = isOwner || (myProposal && myProposal.status === 'aceita') ? orderForProject(p.id) : null;
  ctx.render(status, p.title, views.projectDetailPage({
    project: p, proposals, myProposal, user: u, errors, old, orderId,
    clientStats: repo.clientStats(p.client_id), clientReviews: repo.clientReviews.byClient.all(p.client_id, 3),
  }), 'projetos');
}

async function detail(ctx) {
  const p = repo.projects.byId.get(id(ctx.params[0]));
  if (!p) return notFound(ctx);
  // Projetos que já não estão abertos continuam visíveis apenas às partes envolvidas.
  const u = ctx.user;
  if (p.status !== 'aberto' && !(u && (u.id === p.client_id || repo.proposals.mine.get(p.id, u.id)))) return notFound(ctx);
  renderProject(ctx, p);
}

async function propose(ctx) {
  const p = repo.projects.byId.get(id(ctx.params[0]));
  if (!p) return notFound(ctx);
  if (p.status !== 'aberto') return renderProject(ctx, p, 409, ['Este projeto não está mais recebendo propostas.']);
  // Uma proposta por freelancer e projeto; quem retirou a proposta pode enviar uma nova.
  const mine = repo.proposals.mine.get(p.id, ctx.user.id);
  if (mine && mine.status !== 'retirada') return renderProject(ctx, p, 409, ['Você já enviou uma proposta para este projeto.']);
  const price = money(ctx.body.price);
  const days = int(ctx.body.delivery_days);
  const message = str(ctx.body.message, 3000);
  const errors = [];
  if (!price || Number.isNaN(price) || price <= 0) errors.push('Informe o valor da proposta.');
  if (!Number.isInteger(days) || days < 1 || days > 365) errors.push('Informe o prazo em dias (de 1 a 365).');
  if (message.length < 30) errors.push('Explique sua proposta com ao menos 30 caracteres.');
  if (errors.length) return renderProject(ctx, p, 400, errors, { price: str(ctx.body.price, 12), delivery_days: str(ctx.body.delivery_days, 4), message });
  if (mine) repo.proposals.resend.run(price, days, message, repo.now(), mine.id);
  else repo.proposals.insert.run(p.id, ctx.user.id, price, days, message);
  ctx.setFlash('Proposta enviada! O cliente será avisado.', 'success');
  return ctx.redirect(`/projetos/${p.id}`);
}

async function question(ctx) {
  const p = repo.projects.byId.get(id(ctx.params[0]));
  if (!p || p.status !== 'aberto') return notFound(ctx);
  const content = str(ctx.body.content, 1000);
  if (!content) return renderProject(ctx, p, 400, ['Escreva a pergunta antes de enviar.']);
  const convId = repo.findOrCreateConversation({ clientId: p.client_id, freelancerId: ctx.user.id, projectId: p.id });
  repo.sendMessage(convId, ctx.user.id, content);
  ctx.setFlash('Pergunta enviada ao cliente.', 'success');
  return ctx.redirect(`/mensagens/${convId}`);
}

async function close(ctx) {
  const p = repo.projects.byId.get(id(ctx.params[0]));
  if (!p) return notFound(ctx);
  if (p.client_id !== ctx.user.id) return forbidden(ctx, 'Apenas o autor do projeto pode encerrá-lo.');
  if (repo.projects.setStatus.run('encerrado', p.id, 'aberto').changes === 1) {
    repo.db.prepare("UPDATE proposals SET status = 'recusada' WHERE project_id = ? AND status = 'enviada'").run(p.id);
    ctx.setFlash('Projeto encerrado.', 'info');
  }
  return ctx.redirect('/meus-projetos');
}

function loadProposalAsClient(ctx) {
  const x = repo.proposals.byId.get(id(ctx.params[0]));
  if (!x) return { err: () => notFound(ctx) };
  if (x.client_id !== ctx.user.id) return { err: () => forbidden(ctx, 'Apenas o autor do projeto pode decidir sobre as propostas.') };
  return { x };
}

async function acceptProposal(ctx) {
  const { x, err } = loadProposalAsClient(ctx);
  if (err) return err();
  if (x.status !== 'enviada' || x.project_status !== 'aberto') {
    ctx.setFlash('Esta proposta não pode mais ser aceita.', 'error');
    return ctx.redirect(`/projetos/${x.project_id}`);
  }
  const orderId = repo.acceptProposal(x, ctx.user.id);
  if (!orderId) {
    ctx.setFlash('Não foi possível aceitar a proposta: o projeto foi alterado.', 'error');
    return ctx.redirect(`/projetos/${x.project_id}`);
  }
  ctx.setFlash('Proposta aceita! O pedido foi iniciado.', 'success');
  return ctx.redirect(`/pedidos/${orderId}`);
}

async function declineProposal(ctx) {
  const { x, err } = loadProposalAsClient(ctx);
  if (err) return err();
  if (repo.proposals.setStatus.run('recusada', x.id, 'enviada').changes === 1) ctx.setFlash('Proposta recusada.', 'info');
  return ctx.redirect(`/projetos/${x.project_id}`);
}

async function talkProposal(ctx) {
  const { x, err } = loadProposalAsClient(ctx);
  if (err) return err();
  const convId = repo.findOrCreateConversation({ clientId: ctx.user.id, freelancerId: x.freelancer_id, projectId: x.project_id });
  return ctx.redirect(`/mensagens/${convId}`);
}

async function withdraw(ctx) {
  const x = repo.proposals.byId.get(id(ctx.params[0]));
  if (!x) return notFound(ctx);
  if (x.freelancer_id !== ctx.user.id) return forbidden(ctx, 'Apenas o autor da proposta pode retirá-la.');
  if (repo.proposals.setStatus.run('retirada', x.id, 'enviada').changes === 1) ctx.setFlash('Proposta retirada.', 'info');
  return ctx.redirect(`/projetos/${x.project_id}`);
}

module.exports = [
  { method: 'GET', path: '/projetos', handler: list },
  { method: 'GET', path: '/projetos/novo', auth: 'cliente', handler: newForm },
  { method: 'POST', path: '/projetos/novo', auth: 'cliente', limit: 'publicacoes', handler: create },
  { method: 'GET', path: /^\/projetos\/(\d+)$/, handler: detail },
  { method: 'POST', path: /^\/projetos\/(\d+)\/propostas$/, auth: 'freelancer', limit: 'propostas', handler: propose },
  { method: 'POST', path: /^\/projetos\/(\d+)\/pergunta$/, auth: 'freelancer', limit: 'mensagens', handler: question },
  { method: 'POST', path: /^\/projetos\/(\d+)\/encerrar$/, auth: 'cliente', handler: close },
  { method: 'POST', path: /^\/propostas\/(\d+)\/aceitar$/, auth: 'cliente', handler: acceptProposal },
  { method: 'POST', path: /^\/propostas\/(\d+)\/recusar$/, auth: 'cliente', handler: declineProposal },
  { method: 'POST', path: /^\/propostas\/(\d+)\/conversar$/, auth: 'cliente', handler: talkProposal },
  { method: 'POST', path: /^\/propostas\/(\d+)\/retirar$/, auth: 'freelancer', handler: withdraw },
  { method: 'GET', path: '/meus-projetos', auth: 'cliente', handler: (ctx) => ctx.render(200, 'Meus Projetos', views.myProjectsPage({ projects: repo.projects.byClient.all(ctx.user.id) }), 'meus-projetos') },
  { method: 'GET', path: '/minhas-propostas', auth: 'freelancer', handler: (ctx) => ctx.render(200, 'Minhas Propostas', views.myProposalsPage({ proposals: repo.proposals.byFreelancer.all(ctx.user.id) }), 'projetos') },
];
