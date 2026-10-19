'use strict';

const h = require('./helpers');
const { e } = h;

function nextField(next) {
  return next ? `<input type="hidden" name="next" value="${e(next)}">` : '';
}

function registerPage({ errors, old = {}, next }) {
  return `
  <div class="form-card">
    <h1>Criar Conta</h1>
    ${h.formErrors(errors)}
    <form method="POST" action="/cadastro" class="stacked-form">
      ${nextField(next)}
      <fieldset class="role-fieldset">
        <legend>Como você quer usar o Nexo?</legend>
        <label class="radio-card"><input type="radio" name="role" value="cliente" ${old.role === 'cliente' ? 'checked' : ''} required>
          <span><strong>Sou cliente</strong><br><span class="muted small">Quero contratar serviços ou publicar projetos</span></span></label>
        <label class="radio-card"><input type="radio" name="role" value="freelancer" ${old.role === 'freelancer' ? 'checked' : ''}>
          <span><strong>Sou freelancer</strong><br><span class="muted small">Quero oferecer serviços e enviar propostas</span></span></label>
      </fieldset>

      <label for="name">Nome completo</label>
      <input type="text" id="name" name="name" value="${e(old.name)}" required maxlength="120" autocomplete="name">

      <label for="email">E-mail</label>
      <input type="email" id="email" name="email" value="${e(old.email)}" required maxlength="200" autocomplete="email" aria-describedby="email-hint">
      <p id="email-hint" class="hint">Usado para entrar e recuperar a senha. Nunca é exibido publicamente.</p>

      <label for="password">Senha</label>
      <input type="password" id="password" name="password" required minlength="12" maxlength="128" autocomplete="new-password" aria-describedby="pw-hint">
      <p id="pw-hint" class="hint">Mínimo de 12 caracteres. Uma frase fácil de lembrar, com espaços, é uma boa senha.</p>

      <label for="password_confirm">Confirme a senha</label>
      <input type="password" id="password_confirm" name="password_confirm" required minlength="12" maxlength="128" autocomplete="new-password">

      <div class="consent">
        <input type="checkbox" id="consent" name="consent" value="1" ${old.consent ? 'checked' : ''} required>
        <label for="consent">Li e aceito a <a href="/privacidade" target="_blank" rel="noopener">política de privacidade e os termos de uso</a>.
          Entendo que nome, foto, biografia, portfólio, serviços, projetos e avaliações ficam visíveis a outros usuários, e que meu e-mail não é exibido.</label>
      </div>

      <button type="submit" class="btn btn-primary">Criar Conta</button>
    </form>
    <p class="muted">Já tem conta? <a href="/login${next ? '?next=' + encodeURIComponent(next) : ''}">Entrar</a></p>
  </div>`;
}

function loginPage({ errors, old = {}, next }) {
  return `
  <div class="form-card">
    <h1>Entrar</h1>
    ${next ? '<p class="hint">Entre na sua conta para continuar. Depois do login, você volta para a página que estava tentando acessar.</p>' : ''}
    ${h.formErrors(errors)}
    <form method="POST" action="/login" class="stacked-form">
      ${nextField(next)}
      <label for="email">E-mail</label>
      <input type="email" id="email" name="email" value="${e(old.email)}" required autocomplete="username">
      <label for="password">Senha</label>
      <input type="password" id="password" name="password" required autocomplete="current-password">
      <button type="submit" class="btn btn-primary">Entrar</button>
    </form>
    <p><a href="/recuperar-senha">Esqueci minha senha</a></p>
    <p class="muted">Ainda não tem conta? <a href="/cadastro${next ? '?next=' + encodeURIComponent(next) : ''}">Criar conta</a></p>
  </div>`;
}

function forgotPage({ sent, errors }) {
  if (sent) {
    return `<div class="form-card"><h1>Verifique seu e-mail</h1>
      <p>Se o endereço informado estiver cadastrado, enviamos um link para criar uma nova senha. O link vale por 30 minutos e só pode ser usado uma vez.</p>
      <p class="hint">Protótipo acadêmico: o envio de e-mail é simulado — a mensagem é gravada na pasta <code>data/outbox</code> e exibida no console do servidor.</p>
      <p><a href="/login">Voltar para o login</a></p></div>`;
  }
  return `<div class="form-card"><h1>Recuperar senha</h1>
    ${h.formErrors(errors)}
    <form method="POST" action="/recuperar-senha" class="stacked-form">
      <label for="email">E-mail cadastrado</label>
      <input type="email" id="email" name="email" required autocomplete="email">
      <button type="submit" class="btn btn-primary">Enviar link de recuperação</button>
    </form></div>`;
}

function resetPage({ token, errors, invalid }) {
  if (invalid) {
    return `<div class="form-card"><h1>Link inválido ou expirado</h1>
      <p>Este link de recuperação já foi usado ou expirou. <a href="/recuperar-senha">Solicite um novo link</a>.</p></div>`;
  }
  return `<div class="form-card"><h1>Criar nova senha</h1>
    ${h.formErrors(errors)}
    <form method="POST" action="/redefinir-senha" class="stacked-form">
      <input type="hidden" name="token" value="${e(token)}">
      <label for="password">Nova senha</label>
      <input type="password" id="password" name="password" required minlength="12" maxlength="128" autocomplete="new-password" aria-describedby="pw-hint">
      <p id="pw-hint" class="hint">Mínimo de 12 caracteres. Uma frase fácil de lembrar, com espaços, é uma boa senha.</p>
      <label for="password_confirm">Confirme a nova senha</label>
      <input type="password" id="password_confirm" name="password_confirm" required minlength="12" maxlength="128" autocomplete="new-password">
      <button type="submit" class="btn btn-primary">Salvar nova senha</button>
    </form></div>`;
}

module.exports = { registerPage, loginPage, forgotPage, resetPage };
