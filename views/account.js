'use strict';

const h = require('./helpers');
const { e } = h;
const { profileHeader, portfolioGrid, reviewList } = require('./public');

function profilePage({ user, services, portfolio, reviews, stats, projects }) {
  const actions = `
    ${user.role === 'freelancer' ? `<a href="/freelancers/${user.id}" class="btn btn-outline">Ver Perfil Público</a>` : ''}
    <a href="/perfil/editar" class="btn btn-outline">Editar Perfil</a>
    <a href="/conta" class="btn btn-outline">Conta e Privacidade</a>`;

  const freelancerBlock = user.role === 'freelancer' ? `
    <dl class="stat-row">
      <div><dt>Avaliação média</dt><dd>${h.stars(stats.avgRating, stats.reviewCount)}</dd></div>
      <div><dt>Pedidos concluídos</dt><dd>${stats.completedOrders}</dd></div>
      <div><dt>Serviços publicados</dt><dd>${services.length}</dd></div>
    </dl>` : `
    <dl class="stat-row">
      <div><dt>Sua reputação como cliente</dt><dd>${h.stars(stats.avgRating, stats.reviewCount)}</dd></div>
      <div><dt>Pedidos concluídos</dt><dd>${stats.completedOrders}</dd></div>
      <div><dt>Projetos publicados</dt><dd>${projects.length}</dd></div>
    </dl>`;

  const extra = user.role === 'freelancer' ? `
    <div class="page-header"><h2>Portfólio</h2><a href="/perfil/portfolio" class="btn btn-outline">Gerenciar Portfólio</a></div>
    ${portfolioGrid(portfolio)}
    <div class="page-header"><h2>Meus Serviços</h2><a href="/meus-servicos" class="btn btn-outline">Gerenciar Serviços</a></div>
    ${services.length ? `<div class="grid">${services.map(h.serviceCard).join('')}</div>` : '<p class="muted">Nenhum serviço publicado ainda.</p>'}
    <h2 class="mt">Avaliações recebidas</h2>
    ${reviewList(reviews, { canReply: true })}` : `
    <div class="page-header"><h2>Meus Projetos</h2><a href="/projetos/novo" class="btn btn-outline">Publicar Projeto</a></div>
    ${projects.length ? `<div class="grid grid-2">${projects.map(h.projectCard).join('')}</div>` : '<p class="muted">Você ainda não publicou projetos.</p>'}
    <h2 class="mt">Avaliações recebidas de freelancers</h2>
    <p class="hint">Freelancers veem sua nota ao analisar seus pedidos e projetos.</p>
    ${reviewList(reviews)}`;

  return `
  ${profileHeader(user, actions)}
  ${freelancerBlock}
  <section class="profile-bio-box"><h2>Sobre</h2>
    <p>${e(user.bio) || '<span class="muted">Você ainda não escreveu uma biografia. <a href="/perfil/editar">Adicionar agora</a></span>'}</p></section>
  <section class="profile-box">
    <p><strong>E-mail (privado):</strong> ${e(user.email)}</p>
    ${user.role === 'freelancer' ? `<p><strong>Área de atuação:</strong> ${e(user.area) || '<span class="muted">não informada</span>'}</p>
    <p><strong>LinkedIn:</strong> ${user.linkedin_url ? `<a href="${e(user.linkedin_url)}" target="_blank" rel="noopener noreferrer">Ver perfil ↗</a>` : '<span class="muted">não informado</span>'}</p>` : ''}
  </section>
  ${extra}`;
}

function editProfilePage({ user, errors }) {
  return `
  <div class="form-card form-card-wide">
    <h1>Editar Perfil</h1>
    ${h.formErrors(errors)}
    <form method="POST" action="/perfil/editar" class="stacked-form" enctype="multipart/form-data">
      <div class="profile-cover-wrap profile-cover-wrap-edit">
        <div class="profile-cover">${user.cover_url ? `<img src="${e(user.cover_url)}" alt="" class="cover-img">` : ''}</div>
        <div class="profile-avatar-overlap">${h.avatar(user.name, 'xl', user.avatar_url)}</div>
      </div>
      <div class="field-row">
        <div><label for="avatar">Foto de perfil</label>
          <input type="file" id="avatar" name="avatar" accept="image/png,image/jpeg,image/webp" aria-describedby="av-hint">
          <p id="av-hint" class="hint">JPG, PNG ou WEBP, até 3 MB.</p></div>
        <div><label for="cover">Foto de capa</label>
          <input type="file" id="cover" name="cover" accept="image/png,image/jpeg,image/webp" aria-describedby="cv-hint">
          <p id="cv-hint" class="hint">JPG, PNG ou WEBP, até 3 MB. Formato horizontal.</p></div>
      </div>
      <label for="name">Nome completo</label>
      <input type="text" id="name" name="name" value="${e(user.name)}" required maxlength="120">
      ${user.role === 'freelancer' ? `
      <label for="area">Área de atuação</label>
      <input type="text" id="area" name="area" value="${e(user.area)}" maxlength="80" placeholder="Ex.: Design Gráfico">
      <label for="linkedin">Link do LinkedIn (opcional)</label>
      <input type="url" id="linkedin" name="linkedin" value="${e(user.linkedin_url)}" maxlength="300" placeholder="https://www.linkedin.com/in/seu-perfil">` : ''}
      <label for="bio">Sobre você</label>
      <textarea id="bio" name="bio" rows="5" maxlength="2000">${e(user.bio)}</textarea>
      <p class="hint">As informações deste formulário ficam visíveis no seu perfil público. Seu e-mail não é exibido.</p>
      <button type="submit" class="btn btn-primary">Salvar Alterações</button>
    </form>
  </div>`;
}

function accountPage({ user, errors }) {
  return `
  <h1>Conta e Privacidade</h1>
  ${h.formErrors(errors)}
  <section class="form-card form-card-wide form-card-left" aria-labelledby="senha-t">
    <h2 id="senha-t">Alterar senha</h2>
    <form method="POST" action="/conta/senha" class="stacked-form">
      <label for="current">Senha atual</label>
      <input type="password" id="current" name="current" required autocomplete="current-password">
      <label for="password">Nova senha</label>
      <input type="password" id="password" name="password" required minlength="8" autocomplete="new-password" aria-describedby="pw-hint">
      <p id="pw-hint" class="hint">Mínimo de 8 caracteres, com letras e números. As outras sessões abertas serão encerradas.</p>
      <label for="password_confirm">Confirme a nova senha</label>
      <input type="password" id="password_confirm" name="password_confirm" required minlength="8" autocomplete="new-password">
      <button type="submit" class="btn btn-primary">Alterar Senha</button>
    </form>
  </section>
  <section class="form-card form-card-wide form-card-left" aria-labelledby="dados-t">
    <h2 id="dados-t">Seus dados (LGPD)</h2>
    <p>Consentimento registrado em ${h.formatDateTime(user.consent_at) || '—'} (política versão ${e(user.privacy_version || '—')}).
      <a href="/privacidade">Ler a política de privacidade</a>.</p>
    <p><a class="btn btn-outline" href="/conta/exportar">Baixar uma cópia dos meus dados (JSON)</a></p>
  </section>
  <section class="form-card form-card-wide form-card-left danger-zone" aria-labelledby="excluir-t">
    <h2 id="excluir-t">Excluir minha conta</h2>
    <p>Seus dados pessoais serão apagados e você não poderá mais entrar. Pedidos e avaliações já realizados permanecem de forma anonimizada,
      pois também dizem respeito à outra parte. Pedidos em aberto serão cancelados.</p>
    <form method="POST" action="/conta/excluir" class="stacked-form" data-confirm="Excluir sua conta definitivamente? Esta ação não pode ser desfeita.">
      <label for="confirm_password">Digite sua senha para confirmar</label>
      <input type="password" id="confirm_password" name="password" required autocomplete="current-password">
      <button type="submit" class="btn btn-danger">Excluir Conta Definitivamente</button>
    </form>
  </section>`;
}

module.exports = { profilePage, editProfilePage, accountPage };
