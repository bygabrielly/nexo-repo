'use strict';

const repo = require('../lib/repo');
const views = require('../views');
const config = require('../lib/config');
const { str, money, int, id, notFound } = require('./util');

async function home(ctx) {
  const stats = {
    freelancers: repo.users.countFreelancers.get().c,
    services: repo.services.count.get().c,
    categories: repo.services.countCategories.get().c,
    orders: repo.orders.countDone.get().c,
  };
  ctx.render(200, 'Início', views.homePage({
    services: repo.services.recent.all(),
    projects: repo.projects.recentOpen.all(),
    top: repo.topFreelancers.all(),
    stats, user: ctx.user,
  }), 'home');
}

async function search(ctx) {
  const q = ctx.query;
  const errors = [];
  const filters = {
    q: str(q.get('q'), 100),
    category: views.CATEGORIES.includes(q.get('categoria')) ? q.get('categoria') : '',
    minPriceRaw: str(q.get('preco_min'), 12), maxPriceRaw: str(q.get('preco_max'), 12),
    maxDaysRaw: str(q.get('prazo'), 4), minRatingRaw: str(q.get('nota'), 4),
    sort: str(q.get('ordem'), 20) || 'recentes',
    errors,
  };
  const minPrice = money(filters.minPriceRaw);
  const maxPrice = money(filters.maxPriceRaw);
  const maxDays = int(filters.maxDaysRaw);
  const minRating = money(filters.minRatingRaw);
  if (Number.isNaN(minPrice) || Number.isNaN(maxPrice)) errors.push('Informe os preços apenas com números.');
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) errors.push('O preço mínimo não pode ser maior que o preço máximo.');
  const page = Math.max(1, int(q.get('pagina')) || 1);
  const result = repo.searchServices({
    q: filters.q, category: filters.category,
    minPrice: Number.isNaN(minPrice) ? null : minPrice,
    maxPrice: Number.isNaN(maxPrice) ? null : maxPrice,
    maxDays: Number.isNaN(maxDays) ? null : maxDays,
    minRating: Number.isNaN(minRating) ? null : minRating,
    sort: filters.sort, page, pageSize: config.PAGE_SIZE,
  });
  ctx.render(200, 'Buscar Serviços', views.servicesPage({ result, filters, page, pageSize: config.PAGE_SIZE }), 'servicos');
}

async function serviceDetail(ctx) {
  const service = repo.services.byId.get(id(ctx.params[0]));
  if (!service) return notFound(ctx);
  const u = ctx.user;
  const isOwner = !!u && u.id === service.user_id;
  let conversation = null;
  let messages = [];
  let ownerConversations = [];
  if (u && !isOwner && u.role === 'cliente') {
    conversation = repo.conversations.find.get(u.id, service.user_id, service.id, 0, 0) || null;
    if (conversation) {
      messages = repo.messages.byConversation.all(conversation.id);
      repo.messages.markRead.run(repo.now(), conversation.id, u.id);
    }
  }
  if (isOwner) {
    ownerConversations = repo.conversations.forUser.all(u.id, u.id, u.id).filter((c) => c.service_id === service.id && !c.order_id);
  }
  ctx.render(200, service.title, views.serviceDetailPage({
    service, user: u, isOwner, conversation, messages, ownerConversations,
    reviews: repo.reviews.byService.all(service.id),
    stats: repo.freelancerStats(service.user_id),
  }), 'servicos');
}

async function freelancerProfile(ctx) {
  const freelancer = repo.users.byId.get(id(ctx.params[0]));
  if (!freelancer || freelancer.role !== 'freelancer') return notFound(ctx);
  ctx.render(200, freelancer.name, views.freelancerPublicProfilePage({
    freelancer,
    services: repo.services.byUser.all(freelancer.id),
    portfolio: repo.portfolio.byUser.all(freelancer.id),
    reviews: repo.reviews.byFreelancer.all(freelancer.id),
    stats: repo.freelancerStats(freelancer.id),
    user: ctx.user,
    isOwnProfile: !!ctx.user && ctx.user.id === freelancer.id,
  }));
}

module.exports = [
  { method: 'GET', path: '/', handler: home },
  { method: 'GET', path: '/servicos', handler: search },
  { method: 'GET', path: /^\/servicos\/(\d+)$/, handler: serviceDetail },
  { method: 'GET', path: /^\/freelancers\/(\d+)$/, handler: freelancerProfile },
  { method: 'GET', path: '/ajuda', handler: (ctx) => ctx.render(200, 'Ajuda', views.helpPage(), 'ajuda') },
  { method: 'GET', path: '/privacidade', handler: (ctx) => ctx.render(200, 'Privacidade e Termos de Uso', views.privacyPage()) },
];
