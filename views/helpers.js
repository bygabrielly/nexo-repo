'use strict';

// Componentes e formatações reutilizados por todas as páginas.
// Todo conteúdo vindo do usuário passa por escapeHtml antes de ir para o HTML.

const { escapeHtml } = require('../lib/http-helpers');

const e = escapeHtml;

const CATEGORIES = ['Programação', 'Design Gráfico', 'Marketing Digital', 'Redação', 'Audiovisual', 'Consultoria'];

function formatPrice(price) {
  if (price === null || price === undefined || price === '') return 'A combinar';
  const n = Number(price);
  if (Number.isNaN(n)) return 'A combinar';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(String(iso).replace(' ', 'T') + (String(iso).includes('Z') ? '' : 'Z'));
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });
}

function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(String(iso).replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

function days(n) {
  if (!n) return 'a combinar';
  return `${n} ${Number(n) === 1 ? 'dia' : 'dias'}`;
}

function truncate(text, max) {
  const t = String(text || '');
  return t.length > max ? t.slice(0, max).trimEnd() + '…' : t;
}

// ---------- ícones ----------
const CATEGORY_ICONS = {
  'Programação': '<path d="M9 18l-6-6 6-6M15 6l6 6-6 6" />',
  'Design Gráfico': '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  'Marketing Digital': '<path d="M3 11v2a1 1 0 001 1h2l4 4V6L6 10H4a1 1 0 00-1 1z"/><path d="M16 8a4 4 0 010 8"/><path d="M19 5a9 9 0 010 14"/>',
  'Redação': '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
  'Audiovisual': '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10.5l5-3v9l-5-3z"/>',
  'Consultoria': '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2"/>',
};

function categoryIcon(category) {
  const path = CATEGORY_ICONS[category] || '<circle cx="12" cy="12" r="9"/>';
  return `<svg class="cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${path}</svg>`;
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

// Foto de perfil com texto alternativo (WCAG 1.1.1); sem foto, as iniciais
// ficam ocultas para leitores de tela, pois o nome já aparece ao lado.
function avatar(name, size = 'md', avatarUrl) {
  if (avatarUrl) return `<img class="avatar avatar-${size}" src="${e(avatarUrl)}" alt="Foto de ${e(name)}">`;
  return `<span class="avatar avatar-${size}" aria-hidden="true">${e(initials(name))}</span>`;
}

// ---------- avaliações ----------
function stars(avg, count, { showEmpty = true } = {}) {
  const n = Number(count || 0);
  if (!n) return showEmpty ? '<span class="stars stars-empty">Sem avaliações ainda</span>' : '';
  const value = Math.round(Number(avg) * 10) / 10;
  const full = Math.min(5, Math.floor(Number(avg) + 0.25)); // 4,5 → 4 estrelas cheias; 4,8 → 5
  const visual = '★★★★★'.slice(0, full) + '☆☆☆☆☆'.slice(0, 5 - full);
  return `<span class="stars" aria-label="Nota ${value.toLocaleString('pt-BR')} de 5, com base em ${n} ${n === 1 ? 'avaliação' : 'avaliações'}">
    <span aria-hidden="true">${visual}</span> <strong>${value.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}</strong>
    <span class="muted">(${n})</span></span>`;
}

function starsFixed(rating) {
  const r = Number(rating);
  return `<span class="stars" aria-label="Nota ${r} de 5"><span aria-hidden="true">${'★★★★★'.slice(0, r)}${'☆☆☆☆☆'.slice(0, 5 - r)}</span></span>`;
}

// ---------- status ----------
const ORDER_STATUS = {
  solicitado: { label: 'Aguardando resposta do freelancer', cls: 'st-wait' },
  em_andamento: { label: 'Em andamento', cls: 'st-progress' },
  entregue: { label: 'Entregue — aguardando aprovação do cliente', cls: 'st-wait' },
  concluido: { label: 'Concluído', cls: 'st-done' },
  recusado: { label: 'Recusado', cls: 'st-off' },
  cancelado: { label: 'Cancelado', cls: 'st-off' },
};

const PROJECT_STATUS = {
  aberto: { label: 'Recebendo propostas', cls: 'st-progress' },
  em_andamento: { label: 'Em andamento', cls: 'st-wait' },
  concluido: { label: 'Concluído', cls: 'st-done' },
  encerrado: { label: 'Encerrado', cls: 'st-off' },
};

const PROPOSAL_STATUS = {
  enviada: { label: 'Enviada', cls: 'st-wait' },
  aceita: { label: 'Aceita', cls: 'st-done' },
  recusada: { label: 'Não selecionada', cls: 'st-off' },
  retirada: { label: 'Retirada', cls: 'st-off' },
};

function statusBadge(map, status) {
  const s = map[status] || { label: status, cls: '' };
  return `<span class="status ${s.cls}">${e(s.label)}</span>`;
}

// ---------- formulários ----------
function formErrors(errors) {
  if (!errors || !errors.length) return '';
  return `<div class="error-box" role="alert"><p><strong>Corrija ${errors.length === 1 ? 'o item abaixo' : 'os itens abaixo'}:</strong></p>
    <ul class="error-list">${errors.map((x) => `<li>${e(x)}</li>`).join('')}</ul></div>`;
}

function categoryOptions(selected) {
  return CATEGORIES.map((c) => `<option value="${e(c)}" ${c === selected ? 'selected' : ''}>${e(c)}</option>`).join('');
}

function pagination(basePath, params, page, total, pageSize) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return '';
  const link = (p) => {
    const qs = new URLSearchParams({ ...params, pagina: String(p) });
    return `${basePath}?${qs.toString()}`;
  };
  let html = '<nav class="pagination" aria-label="Paginação">';
  if (page > 1) html += `<a href="${e(link(page - 1))}">← Anterior</a>`;
  html += `<span>Página ${page} de ${pages}</span>`;
  if (page < pages) html += `<a href="${e(link(page + 1))}">Próxima →</a>`;
  return html + '</nav>';
}

function keywordTags(keywords) {
  const list = String(keywords || '').split(',').map((k) => k.trim()).filter(Boolean);
  if (!list.length) return '';
  return `<ul class="keyword-tags" aria-label="Palavras-chave">${list.map((k) => `<li class="keyword-tag">${e(k)}</li>`).join('')}</ul>`;
}

function serviceCard(s) {
  return `
  <article class="card-b">
    <span class="badge-icon">${categoryIcon(s.category)}</span>
    <div class="top-row">
      <span class="badge">${e(s.category)}</span>
      <span class="price">${formatPrice(s.price)}</span>
    </div>
    <h3><a href="/servicos/${s.id}">${e(s.title)}</a></h3>
    <p class="desc-text">${e(truncate(s.description, 120))}</p>
    <div class="card-meta">${stars(s.avg_rating, s.review_count)}<span class="muted small">Entrega: ${days(s.delivery_days)}</span></div>
    <div class="card-footer">
      <span class="provider">${avatar(s.provider_name, 'sm', s.provider_avatar)} <strong>${e(s.provider_name)}</strong></span>
      <span class="muted small">${formatDate(s.created_at)}</span>
    </div>
  </article>`;
}

function projectCard(p) {
  const budget = p.budget_min || p.budget_max
    ? `${p.budget_min ? formatPrice(p.budget_min) : ''}${p.budget_min && p.budget_max ? ' a ' : ''}${p.budget_max ? formatPrice(p.budget_max) : ''}`
    : 'A combinar';
  return `
  <article class="project-card">
    <div class="top-row"><span class="badge">${e(p.category)}</span>${statusBadge(PROJECT_STATUS, p.status)}</div>
    <h3><a href="/projetos/${p.id}">${e(p.title)}</a></h3>
    <p class="desc-text">${e(truncate(p.description, 160))}</p>
    <dl class="facts">
      <div><dt>Orçamento</dt><dd>${budget}</dd></div>
      <div><dt>Prazo desejado</dt><dd>${days(p.deadline_days)}</dd></div>
      <div><dt>Propostas</dt><dd>${p.proposal_count}</dd></div>
    </dl>
    <p class="muted small">Publicado por ${e(p.client_name)} em ${formatDate(p.created_at)}</p>
  </article>`;
}

module.exports = {
  e, CATEGORIES, formatPrice, formatDate, formatDateTime, days, truncate,
  categoryIcon, avatar, initials, stars, starsFixed,
  ORDER_STATUS, PROJECT_STATUS, PROPOSAL_STATUS, statusBadge,
  formErrors, categoryOptions, pagination, keywordTags, serviceCard, projectCard,
};
