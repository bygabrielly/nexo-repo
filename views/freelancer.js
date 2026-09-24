'use strict';

const h = require('./helpers');
const { e } = h;

function serviceForm({ action, errors, old = {}, title, submitLabel }) {
  return `
  <div class="form-card form-card-wide">
    <h1>${title}</h1>
    ${h.formErrors(errors)}
    <form method="POST" action="${action}" class="stacked-form">
      <label for="title">Título do serviço</label>
      <input type="text" id="title" name="title" value="${e(old.title)}" required maxlength="120" aria-describedby="title-hint">
      <p id="title-hint" class="hint">Seja específico: "Criação de logotipo com manual de marca" funciona melhor que "Design".</p>

      <label for="category">Categoria</label>
      <select id="category" name="category" required><option value="">Selecione...</option>${h.categoryOptions(old.category)}</select>

      <div class="field-row">
        <div><label for="price">Preço (R$)</label>
          <input type="number" step="0.01" min="0" id="price" name="price" value="${e(old.price)}" aria-describedby="price-hint">
          <p id="price-hint" class="hint">Deixe em branco para "a combinar".</p></div>
        <div><label for="delivery_days">Prazo de entrega (dias)</label>
          <input type="number" step="1" min="1" max="180" id="delivery_days" name="delivery_days" value="${e(old.delivery_days)}" required></div>
      </div>

      <label for="description">Descrição</label>
      <textarea id="description" name="description" rows="6" required minlength="30" maxlength="5000" aria-describedby="desc-hint">${e(old.description)}</textarea>
      <p id="desc-hint" class="hint">Explique o que está incluído, o que o cliente recebe e quantos ajustes você oferece.</p>

      <label for="keywords">Palavras-chave (opcional)</label>
      <input type="text" id="keywords" name="keywords" value="${e(old.keywords)}" maxlength="200" placeholder="Ex.: logotipo, identidade visual, branding" aria-describedby="kw-hint">
      <p id="kw-hint" class="hint">Separe por vírgulas. Ajudam os clientes a encontrar seu serviço na busca.</p>

      <button type="submit" class="btn btn-primary">${submitLabel}</button>
    </form>
  </div>`;
}

function myServicesPage({ services, removed }) {
  const rows = services.length
    ? services.map((s) => `
      <tr>
        <td><a href="/servicos/${s.id}">${e(s.title)}</a></td>
        <td>${e(s.category)}</td>
        <td>${h.formatPrice(s.price)}</td>
        <td>${h.days(s.delivery_days)}</td>
        <td>${h.stars(s.avg_rating, s.review_count, { showEmpty: false }) || '<span class="muted small">—</span>'}</td>
        <td class="actions">
          <a href="/servicos/${s.id}/editar">Editar</a>
          <form method="POST" action="/servicos/${s.id}/excluir" class="inline-form" data-confirm="Remover o serviço &quot;${e(s.title)}&quot;? Você poderá desfazer.">
            <button type="submit" class="link-button danger">Excluir</button>
          </form>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="6" class="muted">Você ainda não publicou nenhum serviço.</td></tr>';

  const removedHtml = removed.length ? `
    <h2 class="mt">Removidos recentemente</h2>
    <ul class="plain-list">${removed.map((s) => `
      <li>${e(s.title)} <span class="muted small">(removido em ${h.formatDate(s.deleted_at)})</span>
        <form method="POST" action="/servicos/${s.id}/restaurar" class="inline-form"><button type="submit" class="link-button">Restaurar</button></form></li>`).join('')}</ul>` : '';

  return `
  <div class="page-header">
    <h1>Meus Serviços</h1>
    <a href="/servicos/novo" class="btn btn-primary">+ Publicar Novo Serviço</a>
  </div>
  <div class="table-wrap"><table class="data-table">
    <caption class="sr-only">Serviços publicados</caption>
    <thead><tr><th scope="col">Título</th><th scope="col">Categoria</th><th scope="col">Preço</th><th scope="col">Prazo</th><th scope="col">Avaliação</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
  ${removedHtml}`;
}

function portfolioManagePage({ items, removed, errors, old = {} }) {
  const grid = items.length ? `<div class="portfolio-grid">${items.map((item) => `
    <figure class="portfolio-item">
      <img src="${e(item.image_url)}" alt="${e(item.title || 'Item do portfólio')}">
      ${item.title || item.description ? `<figcaption>${item.title ? `<strong>${e(item.title)}</strong>` : ''}${item.description ? `<p>${e(item.description)}</p>` : ''}</figcaption>` : ''}
      <form method="POST" action="/perfil/portfolio/${item.id}/excluir" class="portfolio-delete-form" data-confirm="Remover este item do portfólio? Você poderá desfazer.">
        <button type="submit" class="portfolio-delete-btn">Excluir<span class="sr-only"> ${e(item.title || 'item')}</span></button>
      </form>
    </figure>`).join('')}</div>` : '<p class="muted">Você ainda não adicionou nenhum item ao portfólio.</p>';

  const removedHtml = removed.length ? `
    <h2 class="mt">Removidos recentemente</h2>
    <ul class="plain-list">${removed.map((i) => `
      <li>${e(i.title || 'Item sem título')} <span class="muted small">(removido em ${h.formatDate(i.deleted_at)})</span>
        <form method="POST" action="/perfil/portfolio/${i.id}/restaurar" class="inline-form"><button type="submit" class="link-button">Restaurar</button></form></li>`).join('')}</ul>` : '';

  return `
  <h1>Meu Portfólio</h1>
  <p class="lead">Mostre exemplos do seu trabalho. O portfólio aparece no seu perfil público e ajuda o cliente a decidir.</p>
  <div class="form-card form-card-wide form-card-left">
    <h2>Adicionar item</h2>
    ${h.formErrors(errors)}
    <form method="POST" action="/perfil/portfolio" class="stacked-form" enctype="multipart/form-data">
      <label for="image">Imagem</label>
      <input type="file" id="image" name="image" accept="image/png,image/jpeg,image/webp" required aria-describedby="img-hint">
      <p id="img-hint" class="hint">JPG, PNG ou WEBP, até 3 MB.</p>
      <label for="title">Título</label>
      <input type="text" id="title" name="title" value="${e(old.title)}" maxlength="120" placeholder="Ex.: Identidade visual para a Padaria Bom Pão" aria-describedby="t-hint">
      <p id="t-hint" class="hint">Também é usado como descrição da imagem para leitores de tela.</p>
      <label for="description">Descrição (opcional)</label>
      <textarea id="description" name="description" rows="3" maxlength="600">${e(old.description)}</textarea>
      <button type="submit" class="btn btn-primary">Adicionar ao Portfólio</button>
    </form>
  </div>
  <h2>Itens publicados</h2>
  ${grid}
  ${removedHtml}`;
}

module.exports = { serviceForm, myServicesPage, portfolioManagePage };
