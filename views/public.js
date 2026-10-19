'use strict';

const h = require('./helpers');
const { e } = h;

function homePage({ services, projects, top, stats, user }) {
  const list = services.length
    ? `<div class="carousel">${services.map(h.serviceCard).join('')}</div>`
    : '<p class="muted">Ainda não há serviços publicados.</p>';
  const topHtml = top.length
    ? `<div class="top-grid">${top.map((f) => `
        <a class="top-card" href="/freelancers/${f.id}">
          ${h.avatar(f.name, 'lg', f.avatar_url)}
          <span><strong>${e(f.name)}</strong><br><span class="muted small">${e(f.area || 'Freelancer')}</span><br>${h.stars(f.avg_rating, f.review_count)}</span>
        </a>`).join('')}</div>`
    : '';
  const projHtml = projects.length ? `<div class="grid grid-2">${projects.map(h.projectCard).join('')}</div>` : '<p class="muted">Nenhum projeto aberto no momento.</p>';

  return `
  <section class="hero">
    <div class="hero-blob" aria-hidden="true"></div>
    <div class="hero-content">
      <span class="eyebrow">Economia de plataformas · protótipo acadêmico</span>
      <h1>O ponto de encontro entre freelancers e clientes</h1>
      <p>Contrate um serviço pronto ou publique o seu projeto e receba propostas. Acompanhe cada pedido
      da solicitação à entrega e escolha profissionais com base nas avaliações de quem já contratou.</p>
      <div class="hero-actions">
        <a href="/servicos" class="btn btn-light">Buscar Serviços</a>
        ${!user || user.role === 'cliente' ? '<a href="/projetos/novo" class="btn btn-outline-light">Publicar um Projeto</a>' : '<a href="/projetos" class="btn btn-outline-light">Ver Projetos Abertos</a>'}
      </div>
      <div class="hero-stats">
        <div class="stat"><strong>${stats.freelancers}</strong><span>freelancers</span></div>
        <div class="stat"><strong>${stats.services}</strong><span>serviços publicados</span></div>
        <div class="stat"><strong>${stats.orders}</strong><span>pedidos concluídos</span></div>
        <div class="stat"><strong>${stats.categories}</strong><span>categorias</span></div>
      </div>
    </div>
  </section>

  <section class="how" aria-labelledby="como-funciona">
    <h2 id="como-funciona">Como funciona</h2>
    <div class="how-grid">
      <div class="how-col">
        <h3>Contratar um serviço pronto</h3>
        <ol class="steps">
          <li>Busque por categoria, palavra-chave, preço, prazo ou avaliação.</li>
          <li>Envie o pedido descrevendo o que você precisa.</li>
          <li>O freelancer aceita, trabalha e entrega pelo próprio Nexo.</li>
          <li>Aprove a entrega (ou peça ajustes) e avalie o profissional.</li>
        </ol>
      </div>
      <div class="how-col">
        <h3>Publicar um projeto e receber propostas</h3>
        <ol class="steps">
          <li>Descreva o projeto, o orçamento e o prazo desejado.</li>
          <li>Freelancers enviam propostas com valor e prazo.</li>
          <li>Compare perfis, portfólios e avaliações e aceite uma proposta.</li>
          <li>O projeto vira um pedido, acompanhado até a conclusão.</li>
        </ol>
      </div>
    </div>
  </section>

  <section>
    <div class="section-title"><h2>Serviços Recentes</h2><a href="/servicos">Ver todos →</a></div>
    ${list}
  </section>
  ${topHtml ? `<section><div class="section-title"><h2>Freelancers Mais Bem Avaliados</h2></div>${topHtml}</section>` : ''}
  <section>
    <div class="section-title"><h2>Projetos Recebendo Propostas</h2><a href="/projetos">Ver todos →</a></div>
    ${projHtml}
  </section>`;
}

function servicesPage({ result, filters, page, pageSize }) {
  const f = filters;
  const list = result.rows.length
    ? `<div class="grid">${result.rows.map(h.serviceCard).join('')}</div>`
    : '<p class="empty">Nenhum serviço encontrado com esses filtros. Tente remover algum filtro ou buscar por outra palavra.</p>';
  const sortOpt = (v, label) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${label}</option>`;
  const params = {};
  for (const [k, v] of Object.entries({ q: f.q, categoria: f.category, preco_min: f.minPriceRaw, preco_max: f.maxPriceRaw, prazo: f.maxDaysRaw, nota: f.minRatingRaw, ordem: f.sort })) {
    if (v) params[k] = v;
  }
  return `
  <h1>Buscar Serviços</h1>
  <form method="GET" action="/servicos" class="search-form" role="search" aria-label="Buscar serviços">
    <div class="search-main">
      <label for="q" class="sr-only">Palavra-chave</label>
      <input type="search" id="q" name="q" placeholder="O que você precisa? Ex.: logotipo, site, artigo SEO" value="${e(f.q)}">
      <label for="categoria" class="sr-only">Categoria</label>
      <select id="categoria" name="categoria"><option value="">Todas as categorias</option>${h.categoryOptions(f.category)}</select>
      <button type="submit" class="btn btn-primary">Buscar</button>
    </div>
    <fieldset class="filters">
      <legend>Refinar resultados</legend>
      <div><label for="preco_min">Preço mínimo (R$)</label><input type="number" min="0" step="1" id="preco_min" name="preco_min" value="${e(f.minPriceRaw)}"></div>
      <div><label for="preco_max">Preço máximo (R$)</label><input type="number" min="0" step="1" id="preco_max" name="preco_max" value="${e(f.maxPriceRaw)}"></div>
      <div><label for="prazo">Entrega em até</label>
        <select id="prazo" name="prazo"><option value="">Qualquer prazo</option>
          ${[1, 3, 7, 15, 30].map((d) => `<option value="${d}" ${String(d) === f.maxDaysRaw ? 'selected' : ''}>${d} ${d === 1 ? 'dia' : 'dias'}</option>`).join('')}
        </select></div>
      <div><label for="nota">Avaliação mínima</label>
        <select id="nota" name="nota"><option value="">Qualquer avaliação</option>
          ${[3, 4, 4.5].map((n) => `<option value="${n}" ${String(n) === f.minRatingRaw ? 'selected' : ''}>${String(n).replace('.', ',')} estrelas ou mais</option>`).join('')}
        </select></div>
      <div><label for="ordem">Ordenar por</label>
        <select id="ordem" name="ordem">
          ${sortOpt('recentes', 'Mais recentes')}${sortOpt('avaliacao', 'Mais bem avaliados')}${sortOpt('menor_preco', 'Menor preço')}${sortOpt('maior_preco', 'Maior preço')}${sortOpt('prazo', 'Menor prazo de entrega')}
        </select></div>
    </fieldset>
    ${f.errors.length ? h.formErrors(f.errors) : ''}
  </form>
  <p class="result-count" aria-live="polite">${result.total} ${result.total === 1 ? 'serviço encontrado' : 'serviços encontrados'}
    ${Object.keys(params).length ? ' · <a href="/servicos">limpar filtros</a>' : ''}</p>
  ${list}
  ${h.pagination('/servicos', params, page, result.total, pageSize)}`;
}

function reviewList(list, { canReply = false } = {}) {
  if (!list.length) return '<p class="muted">Ainda não há avaliações.</p>';
  return `<ul class="review-list">${list.map((r) => `
    <li class="review">
      <div class="review-head">${h.avatar(r.client_name || r.freelancer_name, 'sm', r.client_avatar || r.freelancer_avatar)} <strong>${e(r.client_name || r.freelancer_name)}</strong>
        ${h.starsFixed(r.rating)} <span class="muted small">${h.formatDate(r.published_at || r.created_at)}</span></div>
      ${r.order_title ? `<p class="muted small">Pedido: ${e(r.order_title)}</p>` : ''}
      <p>${e(r.comment)}</p>
      ${r.reply ? `<div class="review-reply"><strong>Resposta do freelancer:</strong> ${e(r.reply)}</div>` : ''}
      ${canReply && !r.reply ? `<a class="small" href="/pedidos/${r.order_id}#avaliacao">Responder publicamente</a>` : ''}
    </li>`).join('')}</ul>`;
}

function messageList(msgs, meId) {
  if (!msgs.length) return '<p class="muted">Nenhuma mensagem ainda.</p>';
  return `<ul class="message-list">${msgs.map((m) => `
    <li class="${m.sender_id === meId ? 'mine' : 'theirs'}">
      <div class="msg-head">${h.avatar(m.sender_name, 'sm', m.sender_avatar)} <strong>${e(m.sender_name)}</strong>
      <span class="muted small">${h.formatDateTime(m.created_at)}</span></div>
      <p>${e(m.content)}</p>
    </li>`).join('')}</ul>`;
}

function serviceDetailPage({ service, user, isOwner, conversation, messages, reviews, ownerConversations, stats }) {
  let action;
  if (!user) {
    action = `<p>Para contratar ou conversar com o freelancer, <a href="/login?next=${encodeURIComponent('/servicos/' + service.id)}">entre na sua conta</a>
      ou <a href="/cadastro?next=${encodeURIComponent('/servicos/' + service.id)}">crie uma conta gratuita</a>.</p>`;
  } else if (isOwner) {
    action = `<p class="muted">Esta é a sua publicação. <a href="/servicos/${service.id}/editar">Editar serviço</a></p>
      <h3>Conversas com clientes sobre este serviço</h3>
      ${ownerConversations.length ? `<ul class="plain-list">${ownerConversations.map((c) => `<li><a href="/mensagens/${c.id}">${e(c.client_name)}</a>${c.unread ? ` <span class="nav-badge">${c.unread}</span>` : ''}</li>`).join('')}</ul>` : '<p class="muted">Nenhum cliente entrou em contato ainda.</p>'}`;
  } else if (user.role !== 'cliente') {
    action = '<p class="muted">A contratação de serviços está disponível para contas de cliente.</p>';
  } else {
    action = `
      <form method="POST" action="/servicos/${service.id}/contratar" class="stacked-form">
        <label for="requirements">Descreva o que você precisa</label>
        <textarea id="requirements" name="requirements" rows="4" required minlength="20" aria-describedby="req-hint"
          placeholder="Ex.: preciso de um logotipo para uma padaria, nas cores marrom e bege, com versão horizontal e vertical."></textarea>
        <p id="req-hint" class="hint">O freelancer lê essas informações antes de aceitar o pedido. Valor: ${h.formatPrice(service.price)} · Prazo: ${h.days(service.delivery_days)} após o aceite.</p>
        <button type="submit" class="btn btn-primary">Enviar Pedido de Contratação</button>
      </form>`;
  }

  let chat = '';
  if (user && !isOwner && user.role === 'cliente') {
    chat = `
    <section class="description-box" aria-labelledby="duvidas">
      <h2 id="duvidas">Tirar dúvidas com ${e(service.provider_name)}</h2>
      <p class="hint">Esta conversa é privada: só você e o freelancer têm acesso a ela.</p>
      ${messageList(messages, user.id)}
      <form method="POST" action="/servicos/${service.id}/mensagem" class="stacked-form">
        <label for="content">Sua mensagem</label>
        <textarea name="content" id="content" rows="3" required maxlength="2000"></textarea>
        <button type="submit" class="btn btn-outline">Enviar Mensagem</button>
      </form>
      ${conversation ? `<p class="small"><a href="/mensagens/${conversation.id}">Abrir conversa completa</a></p>` : ''}
    </section>`;
  }

  return `
  <div class="detail-layout">
    <div class="detail-main">
      <span class="badge">${e(service.category)}</span>
      <h1>${e(service.title)}</h1>
      <p class="provider-line">Por <a href="/freelancers/${service.user_id}" class="provider-link">${h.avatar(service.provider_name, 'sm', service.provider_avatar)} <strong>${e(service.provider_name)}</strong></a>
        · ${h.stars(service.avg_rating, service.review_count)}</p>
      <section class="description-box"><h2>Descrição</h2>
        <p class="pre">${e(service.description)}</p>${h.keywordTags(service.keywords)}</section>
      <section class="description-box"><h2>Avaliações deste serviço</h2>${reviewList(reviews)}</section>
      ${chat}
    </div>
    <aside class="detail-side" aria-label="Contratação">
      <div class="side-card">
        <p class="price-big">${h.formatPrice(service.price)}</p>
        <p><strong>Prazo de entrega:</strong> ${h.days(service.delivery_days)}</p>
        ${action}
      </div>
      <div class="side-card">
        <h2 class="h-small">Sobre o profissional</h2>
        <p>${h.avatar(service.provider_name, 'md', service.provider_avatar)} <strong>${e(service.provider_name)}</strong></p>
        <p class="small">${stats.completedOrders} ${stats.completedOrders === 1 ? 'pedido concluído' : 'pedidos concluídos'} · ${h.stars(stats.avgRating, stats.reviewCount)}</p>
        ${service.provider_bio ? `<p class="small">${e(h.truncate(service.provider_bio, 220))}</p>` : ''}
        <a href="/freelancers/${service.user_id}" class="portfolio-link">Ver perfil, portfólio e avaliações →</a>
      </div>
    </aside>
  </div>`;
}

function profileHeader(person, actions = '') {
  return `
  <div class="profile-cover-wrap">
    <div class="profile-cover">${person.cover_url ? `<img src="${e(person.cover_url)}" alt="" class="cover-img">` : ''}</div>
    <div class="profile-avatar-overlap">${h.avatar(person.name, 'xl', person.avatar_url)}</div>
  </div>
  <div class="profile-header-row">
    <div class="profile-info">
      <h1>${e(person.name)}</h1>
      <p class="muted">${person.role === 'freelancer' ? `Freelancer${person.area ? ' · ' + e(person.area) : ''}` : 'Cliente'} · no Nexo desde ${h.formatDate(person.created_at)}</p>
    </div>
    <div class="profile-header-actions">${actions}</div>
  </div>`;
}

function portfolioGrid(items) {
  if (!items.length) return '<p class="muted">Este profissional ainda não adicionou itens ao portfólio.</p>';
  return `<div class="portfolio-grid">${items.map((item) => `
    <figure class="portfolio-item">
      <img src="${e(item.image_url)}" alt="${e(item.title || 'Item do portfólio')}">
      ${item.title || item.description ? `<figcaption>${item.title ? `<strong>${e(item.title)}</strong>` : ''}${item.description ? `<p>${e(item.description)}</p>` : ''}</figcaption>` : ''}
    </figure>`).join('')}</div>`;
}

function freelancerPublicProfilePage({ freelancer, services, portfolio, reviews, stats, user, isOwnProfile }) {
  let actions = '';
  if (isOwnProfile) actions = '<a href="/perfil/editar" class="btn btn-outline">Editar Perfil</a>';
  else if (!user) actions = `<a class="btn btn-primary" href="/login?next=${encodeURIComponent('/freelancers/' + freelancer.id)}">Entrar para enviar mensagem</a>`;
  else if (user.role === 'cliente') actions = `<a class="btn btn-primary" href="#contato">Enviar Mensagem</a>`;

  const contact = user && user.role === 'cliente' && !isOwnProfile ? `
    <section class="description-box" id="contato" aria-labelledby="contato-t">
      <h2 id="contato-t">Enviar mensagem para ${e(freelancer.name)}</h2>
      <p class="hint">O contato é feito pelo próprio Nexo: o e-mail do profissional não é exibido publicamente.</p>
      <form method="POST" action="/freelancers/${freelancer.id}/mensagem" class="stacked-form">
        <label for="content">Sua mensagem</label>
        <textarea id="content" name="content" rows="3" required maxlength="2000"></textarea>
        <button type="submit" class="btn btn-primary">Enviar</button>
      </form>
    </section>` : '';

  return `
  ${profileHeader(freelancer, actions)}
  <dl class="stat-row">
    <div><dt>Avaliação média</dt><dd>${h.stars(stats.avgRating, stats.reviewCount)}</dd></div>
    <div><dt>Pedidos concluídos</dt><dd>${stats.completedOrders}</dd></div>
    <div><dt>Serviços publicados</dt><dd>${services.length}</dd></div>
    <div><dt>LinkedIn</dt><dd>${freelancer.linkedin_url ? `<a href="${e(freelancer.linkedin_url)}" target="_blank" rel="noopener noreferrer">Ver perfil ↗</a>` : '<span class="muted">não informado</span>'}</dd></div>
  </dl>
  <section class="profile-bio-box"><h2>Sobre</h2>
    <p>${e(freelancer.bio) || '<span class="muted">Este profissional ainda não escreveu uma biografia.</span>'}</p></section>
  ${contact}
  <h2>Portfólio</h2>
  ${portfolioGrid(portfolio)}
  <h2>Serviços</h2>
  ${services.length ? `<div class="grid">${services.map(h.serviceCard).join('')}</div>` : '<p class="muted">Nenhum serviço publicado ainda.</p>'}
  <h2 class="mt">Avaliações de clientes</h2>
  ${reviewList(reviews)}`;
}

function helpPage() {
  const qa = (q, a) => `<details class="faq"><summary>${q}</summary><div>${a}</div></details>`;
  return `
  <h1>Ajuda e Perguntas Frequentes</h1>
  <p class="lead">O Nexo aproxima clientes e freelancers de duas formas: contratando um serviço já publicado ou publicando um projeto para receber propostas.</p>
  <h2>Para clientes</h2>
  ${qa('Como contrato um serviço?', '<p>Abra o serviço, descreva o que você precisa no campo "Descreva o que você precisa" e clique em "Enviar Pedido de Contratação". O freelancer recebe o pedido e pode aceitá-lo ou recusá-lo. Você acompanha tudo em <strong>Pedidos</strong>.</p>')}
  ${qa('Como publico um projeto?', '<p>Em <strong>Meus Projetos</strong>, clique em "Publicar Projeto" e informe título, categoria, descrição, orçamento e prazo. Freelancers enviam propostas; você compara os perfis e aceita a que preferir. A proposta aceita vira um pedido.</p>')}
  ${qa('O que acontece quando o freelancer entrega?', '<p>O pedido fica como "Entregue". Você pode aprovar a entrega (o pedido é concluído) ou pedir ajustes, explicando o que precisa mudar — o pedido volta para "Em andamento". Se você não responder em 3 dias, o pedido é concluído automaticamente; a data-limite aparece na página do pedido.</p>')}
  ${qa('Quando posso avaliar o freelancer?', '<p>Depois que o pedido é concluído, por até 14 dias. A avaliação (de 1 a 5 estrelas, com comentário) só pode ser feita por quem contratou, uma vez por pedido, o que evita avaliações falsas. O freelancer também avalia você, e as duas avaliações são publicadas ao mesmo tempo: quando ambos avaliarem ou quando o prazo terminar. Assim, ninguém avalia já sabendo o que o outro escreveu.</p>')}
  ${qa('O Nexo processa pagamentos?', '<p>Não. Este protótipo acadêmico registra o valor combinado em cada pedido, mas não realiza cobranças nem transferências. O pagamento é combinado diretamente entre as partes.</p>')}
  <h2>Para freelancers</h2>
  ${qa('Como publico um serviço?', '<p>Em <strong>Meus Serviços</strong>, clique em "Publicar Novo Serviço". Informe título, categoria, descrição, preço, prazo de entrega e palavras-chave — elas ajudam o cliente a encontrar seu serviço mesmo quando o termo buscado não aparece no título.</p>')}
  ${qa('Como envio uma proposta para um projeto?', '<p>Em <strong>Projetos</strong>, abra um projeto que esteja recebendo propostas e preencha valor, prazo e uma mensagem explicando como você fará o trabalho. É possível retirar a proposta enquanto o cliente não decidir.</p>')}
  ${qa('Posso avaliar o cliente?', '<p>Sim. Depois da conclusão, a página do pedido mostra o formulário para avaliar o cliente, por até 14 dias. A nota do cliente aparece para outros freelancers nos projetos e pedidos dele, ajudando você a escolher com quem trabalhar.</p>')}
  ${qa('Como respondo a uma avaliação?', '<p>Depois que a avaliação é publicada, use o campo "Responder publicamente" na página do pedido. A resposta aparece junto da avaliação no seu perfil.</p>')}
  ${qa('Excluí um serviço por engano. E agora?', '<p>Logo após a exclusão aparece o botão "Desfazer". Depois disso, o serviço continua disponível em "Removidos recentemente", na página Meus Serviços, de onde pode ser restaurado.</p>')}
  <h2>Conta e segurança</h2>
  ${qa('Esqueci minha senha.', '<p>Na tela de login, clique em "Esqueci minha senha" e informe seu e-mail. Você receberá um link de uso único, válido por 30 minutos. (Neste protótipo, o envio de e-mail é simulado.)</p>')}
  ${qa('Por que minha conta foi bloqueada temporariamente?', '<p>Após 5 tentativas de login com senha incorreta em 15 minutos, novas tentativas ficam bloqueadas por 15 minutos. Isso protege sua conta contra tentativas automatizadas de adivinhar a senha.</p>')}
  ${qa('Quais dados meus ficam públicos?', '<p>Veja a <a href="/privacidade">política de privacidade</a>. Em resumo: nome, foto, capa, área de atuação, biografia, LinkedIn, portfólio, serviços e avaliações recebidas (para freelancers); nome, foto, projetos, avaliações recebidas de freelancers e número de pedidos concluídos (para clientes). Seu e-mail nunca é exibido publicamente.</p>')}
  ${qa('Como baixo ou apago meus dados?', '<p>Em <strong>Meu Perfil → Conta e privacidade</strong> você pode baixar uma cópia de todos os seus dados ou excluir sua conta.</p>')}`;
}

function privacyPage() {
  return `
  <article class="prose">
  <h1>Privacidade e Termos de Uso</h1>
  <p class="muted">Versão 2026-10 · Protótipo acadêmico — não é um serviço comercial.</p>
  <h2>1. Quais dados coletamos e para quê</h2>
  <ul>
    <li><strong>Cadastro:</strong> nome, e-mail, senha (armazenada apenas como hash scrypt) e tipo de conta — para identificar você e permitir o acesso.</li>
    <li><strong>Perfil (opcional):</strong> foto, capa, área de atuação, biografia e link do LinkedIn — para apresentar você a outros usuários.</li>
    <li><strong>Uso da plataforma:</strong> serviços, projetos, propostas, pedidos, mensagens e avaliações — para viabilizar a intermediação.</li>
  </ul>
  <h2>2. O que fica público</h2>
  <p>Nome, foto, capa, área de atuação, biografia, LinkedIn, portfólio, serviços publicados e avaliações recebidas (no caso de freelancers); projetos publicados, avaliações recebidas de freelancers e número de pedidos concluídos (no caso de clientes). As avaliações só se tornam públicas quando as duas partes avaliam ou quando termina o prazo de 14 dias após a conclusão do pedido. <strong>O e-mail nunca é exibido publicamente</strong>: o contato é feito pelas mensagens do Nexo. Mensagens são visíveis apenas para as duas pessoas da conversa.</p>
  <h2>3. Seus direitos (LGPD, art. 18)</h2>
  <p>Você pode, a qualquer momento, em <strong>Meu Perfil → Conta e privacidade</strong>: consultar e baixar uma cópia de todos os seus dados (arquivo JSON) e excluir sua conta. Na exclusão:</p>
  <ul>
    <li><strong>São apagados:</strong> e-mail, senha, área de atuação, biografia e LinkedIn; as imagens enviadas (foto, capa e portfólio), que são removidas do servidor; os itens de portfólio; os links de recuperação de senha; e todas as sessões abertas.</li>
    <li><strong>Perdem a identificação:</strong> o nome, substituído por "Usuário removido" em pedidos, conversas e avaliações; e os serviços publicados, que deixam de ser exibidos e perdem a descrição e as palavras-chave (o título permanece, porque aparece nos pedidos da outra parte).</li>
    <li><strong>São mantidos, sem o seu nome:</strong> pedidos concluídos e cancelados, avaliações feitas e recebidas, mensagens já trocadas, projetos encerrados e propostas retiradas, porque fazem parte do histórico da outra pessoa e podem ser necessários para esclarecer uma divergência (LGPD, art. 7º, VI e IX); e a data e a versão da política aceita no cadastro, como registro do consentimento (art. 8º, § 2º). Esses registros continuam ligados a um identificador interno e podem conter o que você escreveu nas mensagens; por isso, não são dados anonimizados no sentido da LGPD (art. 5º, XI). Projetos e propostas em aberto são encerrados, e pedidos não concluídos são cancelados, com o motivo registrado no histórico.</li>
  </ul>
  <p>Por ser um protótipo acadêmico, o Nexo não define um prazo de retenção para esses registros; em um serviço real, esse prazo seria fixado pelo responsável pela plataforma, de acordo com a finalidade e com eventuais obrigações legais.</p>
  <h2>4. Cookies</h2>
  <p>O Nexo usa apenas cookies necessários ao funcionamento e à segurança: <strong>sid</strong> (sessão, enquanto você está conectado), <strong>aid</strong> (proteção dos formulários antes do login) e <strong>dev</strong> (dispositivo conhecido, por 180 dias: indica que você já entrou por este navegador e evita esperas de segurança quando há tentativas de login de outras pessoas na sua conta). Não há cookies de publicidade nem de terceiros.</p>
  <h2>5. Segurança</h2>
  <p>Senhas com hash e salt, sessões que expiram, proteção contra tentativas repetidas de login e contra envio de formulários por sites de terceiros (CSRF), limite de envios por período, verificação do conteúdo real das imagens enviadas, com remoção de metadados como a localização da foto, e escape de todo conteúdo exibido.</p>
  <h2>6. Termos de uso</h2>
  <p>Não publique conteúdo ilícito, ofensivo ou de terceiros sem autorização. O Nexo não processa pagamentos; valores registrados nos pedidos servem apenas como referência do que foi combinado entre as partes.</p>
  </article>`;
}

function notFoundPage() {
  return '<div class="form-card"><h1>Página não encontrada</h1><p>O endereço acessado não existe ou o conteúdo foi removido.</p><p><a href="/">Voltar para a página inicial</a></p></div>';
}

function errorPage(title, message) {
  return `<div class="form-card"><h1>${e(title)}</h1><p>${e(message)}</p><p><a href="/">Voltar para a página inicial</a></p></div>`;
}

module.exports = {
  homePage, servicesPage, serviceDetailPage, freelancerPublicProfilePage, helpPage, privacyPage,
  notFoundPage, errorPage, reviewList, messageList, profileHeader, portfolioGrid,
};
