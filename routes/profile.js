'use strict';

const config = require('../lib/config');
const repo = require('../lib/repo');
const views = require('../views');
const { str, id, saveUploadedImage, removeUploadedImage, notFound, forbidden } = require('./util');

async function profile(ctx) {
  const u = ctx.user;
  ctx.render(200, 'Meu Perfil', views.profilePage({
    user: u,
    services: u.role === 'freelancer' ? repo.services.byUser.all(u.id) : [],
    portfolio: u.role === 'freelancer' ? repo.portfolio.byUser.all(u.id) : [],
    reviews: u.role === 'freelancer' ? repo.reviews.byFreelancer.all(u.id) : repo.clientReviews.byClient.all(u.id, 20),
    stats: u.role === 'freelancer' ? repo.freelancerStats(u.id) : repo.clientStats(u.id),
    projects: u.role === 'cliente' ? repo.projects.byClient.all(u.id) : [],
  }), 'perfil');
}

async function editForm(ctx) {
  ctx.render(200, 'Editar Perfil', views.editProfilePage({ user: ctx.user, errors: [] }), 'perfil');
}

async function edit(ctx) {
  const u = ctx.user;
  const b = ctx.body;
  const name = str(b.name, 120);
  const area = u.role === 'freelancer' ? str(b.area, 80) : '';
  const bio = str(b.bio, 2000);
  const linkedin = u.role === 'freelancer' ? str(b.linkedin, 300) : '';
  const errors = [];
  if (!name) errors.push('Informe seu nome.');
  if (linkedin && !/^https?:\/\/[^\s]+$/i.test(linkedin)) errors.push('O link do LinkedIn deve começar com http:// ou https://.');
  let avatarUrl = u.avatar_url || '';
  let coverUrl = u.cover_url || '';
  const novos = [];
  for (const [field, label] of [['avatar', 'Foto de perfil'], ['cover', 'Foto de capa']]) {
    if (!ctx.files[field]) continue;
    try {
      const saved = saveUploadedImage(ctx.files[field]);
      novos.push(saved);
      if (field === 'avatar') avatarUrl = saved; else coverUrl = saved;
    } catch (err) {
      errors.push(`${label}: ${err.message}`);
    }
  }
  if (errors.length) {
    novos.forEach(removeUploadedImage); // nada é gravado se o formulário for recusado
    return ctx.render(400, 'Editar Perfil', views.editProfilePage({ user: { ...u, name, area, bio, linkedin_url: linkedin }, errors }), 'perfil');
  }
  repo.users.updateProfile.run(name, area, bio, avatarUrl, coverUrl, linkedin, u.id);
  // a foto e a capa substituídas são apagadas do disco
  if (u.avatar_url && u.avatar_url !== avatarUrl) removeUploadedImage(u.avatar_url);
  if (u.cover_url && u.cover_url !== coverUrl) removeUploadedImage(u.cover_url);
  ctx.setFlash('Perfil atualizado com sucesso.', 'success');
  return ctx.redirect('/perfil');
}

async function portfolioPage(ctx) {
  ctx.render(200, 'Meu Portfólio', views.portfolioManagePage({
    items: repo.portfolio.byUser.all(ctx.user.id),
    removed: repo.portfolio.deletedByUser.all(ctx.user.id),
    errors: [],
  }), 'perfil');
}

async function portfolioAdd(ctx) {
  const title = str(ctx.body.title, 120);
  const description = str(ctx.body.description, 600);
  const errors = [];
  let imageUrl = '';
  const max = config.MAX_PORTFOLIO_ITEMS;
  if (repo.portfolio.byUser.all(ctx.user.id).length >= max) {
    errors.push(`O portfólio pode ter no máximo ${max} itens. Remova um item para adicionar outro.`);
  } else if (!ctx.files.image) errors.push('Selecione uma imagem para adicionar ao portfólio.');
  else {
    try { imageUrl = saveUploadedImage(ctx.files.image); } catch (err) { errors.push(err.message); }
  }
  if (errors.length) {
    return ctx.render(400, 'Meu Portfólio', views.portfolioManagePage({
      items: repo.portfolio.byUser.all(ctx.user.id), removed: repo.portfolio.deletedByUser.all(ctx.user.id),
      errors, old: { title, description },
    }), 'perfil');
  }
  repo.portfolio.insert.run(ctx.user.id, imageUrl, title, description);
  ctx.setFlash('Item adicionado ao portfólio.', 'success');
  return ctx.redirect('/perfil/portfolio');
}

async function portfolioRemove(ctx) {
  const itemId = id(ctx.params[0]);
  if (repo.portfolio.softDelete.run(repo.now(), itemId, ctx.user.id).changes !== 1) return forbidden(ctx, 'Item não encontrado entre os seus itens de portfólio.');
  ctx.setFlash('Item removido do portfólio.', 'info', { undo: `/perfil/portfolio/${itemId}/restaurar` });
  return ctx.redirect('/perfil/portfolio');
}

async function portfolioRestore(ctx) {
  if (repo.portfolio.byUser.all(ctx.user.id).length >= config.MAX_PORTFOLIO_ITEMS) {
    ctx.setFlash(`O portfólio pode ter no máximo ${config.MAX_PORTFOLIO_ITEMS} itens. Remova um item para restaurar outro.`, 'error');
    return ctx.redirect('/perfil/portfolio');
  }
  if (repo.portfolio.restore.run(id(ctx.params[0]), ctx.user.id).changes !== 1) return forbidden(ctx);
  ctx.setFlash('Item restaurado.', 'success');
  return ctx.redirect('/perfil/portfolio');
}

async function contactFreelancer(ctx) {
  const f = repo.users.byId.get(id(ctx.params[0]));
  if (!f || f.role !== 'freelancer') return notFound(ctx);
  const content = str(ctx.body.content, 2000);
  if (!content) {
    ctx.setFlash('Escreva uma mensagem antes de enviar.', 'error');
    return ctx.redirect(`/freelancers/${f.id}#contato`);
  }
  const convId = repo.findOrCreateConversation({ clientId: ctx.user.id, freelancerId: f.id });
  repo.sendMessage(convId, ctx.user.id, content);
  ctx.setFlash('Mensagem enviada!', 'success');
  return ctx.redirect(`/mensagens/${convId}`);
}

module.exports = [
  { method: 'GET', path: '/perfil', auth: 'user', handler: profile },
  { method: 'GET', path: '/perfil/editar', auth: 'user', handler: editForm },
  { method: 'POST', path: '/perfil/editar', auth: 'user', multipart: true, handler: edit },
  { method: 'GET', path: '/perfil/portfolio', auth: 'freelancer', handler: portfolioPage },
  { method: 'POST', path: '/perfil/portfolio', auth: 'freelancer', multipart: true, handler: portfolioAdd },
  { method: 'POST', path: /^\/perfil\/portfolio\/(\d+)\/excluir$/, auth: 'freelancer', handler: portfolioRemove },
  { method: 'POST', path: /^\/perfil\/portfolio\/(\d+)\/restaurar$/, auth: 'freelancer', handler: portfolioRestore },
  { method: 'POST', path: /^\/freelancers\/(\d+)\/mensagem$/, auth: 'cliente', limit: 'mensagens', handler: contactFreelancer },
];
