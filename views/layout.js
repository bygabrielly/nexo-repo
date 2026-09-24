'use strict';

const { e } = require('./helpers');

function navLink(href, label, key, active, badge) {
  const current = key === active;
  const count = badge ? ` <span class="nav-badge" aria-label="${badge} pendente${badge > 1 ? 's' : ''}">${badge}</span>` : '';
  return `<a href="${href}"${current ? ' class="active" aria-current="page"' : ''}>${label}${count}</a>`;
}

function layout({ title, user, flash, body, active, counts = {} }) {
  let nav;
  if (!user) {
    nav = `
      ${navLink('/servicos', 'Buscar Serviços', 'servicos', active)}
      ${navLink('/projetos', 'Projetos', 'projetos', active)}
      ${navLink('/ajuda', 'Como Funciona', 'ajuda', active)}
      ${navLink('/login', 'Entrar', 'login', active)}
      <a href="/cadastro" class="btn-nav${active === 'cadastro' ? ' active' : ''}">Criar Conta</a>`;
  } else if (user.role === 'freelancer') {
    nav = `
      ${navLink('/servicos', 'Buscar Serviços', 'servicos', active)}
      ${navLink('/projetos', 'Projetos', 'projetos', active)}
      ${navLink('/meus-servicos', 'Meus Serviços', 'meus-servicos', active)}
      ${navLink('/pedidos', 'Pedidos', 'pedidos', active, counts.orders)}
      ${navLink('/mensagens', 'Mensagens', 'mensagens', active, counts.messages)}
      ${navLink('/perfil', 'Meu Perfil', 'perfil', active)}
      <form method="POST" action="/logout" class="inline-form"><button type="submit" class="link-button">Sair</button></form>`;
  } else {
    nav = `
      ${navLink('/servicos', 'Buscar Serviços', 'servicos', active)}
      ${navLink('/meus-projetos', 'Meus Projetos', 'meus-projetos', active)}
      ${navLink('/pedidos', 'Pedidos', 'pedidos', active, counts.orders)}
      ${navLink('/mensagens', 'Mensagens', 'mensagens', active, counts.messages)}
      ${navLink('/perfil', 'Meu Perfil', 'perfil', active)}
      <form method="POST" action="/logout" class="inline-form"><button type="submit" class="link-button">Sair</button></form>`;
  }

  let flashHtml = '';
  if (flash) {
    const undo = flash.extra && flash.extra.undo
      ? `<form method="POST" action="${e(flash.extra.undo)}" class="inline-form"><button type="submit" class="link-button">Desfazer</button></form>`
      : '';
    flashHtml = `<div class="flash flash-${e(flash.type)}" role="status">${e(flash.message)} ${undo}</div>`;
  }

  const who = user
    ? `<p class="who">Conectado como <strong>${e(user.name)}</strong> · ${user.role === 'freelancer' ? 'Freelancer' : 'Cliente'}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${e(title)} · Nexo</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;family=Poppins:wght@600;700;800&amp;display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css">
<script src="/app.js" defer></script>
</head>
<body>
<a class="skip-link" href="#conteudo">Pular para o conteúdo</a>
<header class="site-header">
  <div class="container header-inner">
    <a href="/" class="logo" aria-label="Nexo — página inicial">
      <svg class="logo-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <defs><linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#9a2bbf"/><stop offset="100%" stop-color="#f472b6"/></linearGradient></defs>
        <rect width="32" height="32" rx="9" fill="url(#logoGrad)"/>
        <path d="M11 21L16 10M21 21L16 10M11 21L21 21" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>
        <circle cx="11" cy="21" r="2.6" fill="#fff"/><circle cx="21" cy="21" r="2.6" fill="#fff"/><circle cx="16" cy="10" r="2.8" fill="#fff"/>
      </svg>
      <span class="logo-text">Nexo</span>
    </a>
    <nav aria-label="Navegação principal">${nav}</nav>
  </div>
</header>
<main class="container" id="conteudo" tabindex="-1">
  ${who}
  ${flashHtml}
  ${body}
</main>
<footer class="site-footer">
  <div class="container footer-inner">
    <p>Nexo — protótipo acadêmico de plataforma de intermediação de serviços. Não é um produto comercial e não processa pagamentos.</p>
    <nav aria-label="Links institucionais"><a href="/ajuda">Ajuda e perguntas frequentes</a> · <a href="/privacidade">Privacidade e termos de uso</a></nav>
  </div>
</footer>
</body>
</html>`;
}

module.exports = { layout };
