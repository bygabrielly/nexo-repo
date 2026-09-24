'use strict';

const crypto = require('node:crypto');
const repo = require('../lib/repo');
const views = require('../views');
const config = require('../lib/config');
const session = require('../lib/session');
const { hashPassword, verifyPassword, passwordProblems } = require('../lib/auth');
const { loginLimiter, safeNext } = require('../lib/security');
const { sendMail } = require('../lib/mailer');
const { str } = require('./util');

function clientIp(ctx) {
  return ctx.req.socket.remoteAddress || 'desconhecido';
}

async function registerForm(ctx) {
  ctx.render(200, 'Criar Conta', views.registerPage({ errors: [], old: {}, next: safeNext(ctx.query.get('next')) }), 'cadastro');
}

async function register(ctx) {
  const b = ctx.body;
  const old = { name: str(b.name, 120), email: str(b.email, 200).toLowerCase(), role: b.role, consent: b.consent === '1' };
  const next = safeNext(b.next);
  const errors = [];
  if (!old.name) errors.push('Informe seu nome.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(old.email)) errors.push('Informe um e-mail válido.');
  if (!['cliente', 'freelancer'].includes(old.role)) errors.push('Escolha se você é cliente ou freelancer.');
  errors.push(...passwordProblems(b.password, b.password_confirm));
  if (!old.consent) errors.push('É preciso aceitar a política de privacidade e os termos de uso para criar a conta.');
  if (!errors.length && repo.users.byEmailAny.get(old.email)) errors.push('Já existe uma conta com este e-mail.');
  if (errors.length) return ctx.render(400, 'Criar Conta', views.registerPage({ errors, old, next }), 'cadastro');

  const userId = repo.createUser({ name: old.name, email: old.email, passwordHash: hashPassword(b.password), role: old.role, privacyVersion: config.PRIVACY_VERSION });
  ctx.login(userId);
  ctx.setFlash(old.role === 'freelancer'
    ? 'Conta criada! Complete seu perfil e publique seu primeiro serviço.'
    : 'Conta criada! Busque um serviço ou publique um projeto para receber propostas.', 'success');
  return ctx.redirect(next || (old.role === 'freelancer' ? '/perfil/editar' : '/'));
}

async function loginForm(ctx) {
  ctx.render(200, 'Entrar', views.loginPage({ errors: [], old: {}, next: safeNext(ctx.query.get('next')) }), 'login');
}

async function login(ctx) {
  const email = str(ctx.body.email, 200).toLowerCase();
  const password = String(ctx.body.password || '');
  const next = safeNext(ctx.body.next);
  const keys = [`email:${email}`, `ip:${clientIp(ctx)}`];

  const locked = Math.max(...keys.map((k) => loginLimiter.lockedFor(k)));
  if (locked > 0) {
    const min = Math.ceil(locked / 60000);
    return ctx.render(429, 'Entrar', views.loginPage({
      errors: [`Muitas tentativas de login sem sucesso. Por segurança, aguarde ${min} ${min === 1 ? 'minuto' : 'minutos'} e tente novamente, ou use "Esqueci minha senha".`],
      old: { email }, next,
    }), 'login');
  }

  const found = repo.users.byEmail.get(email);
  // A verificação é feita mesmo quando o e-mail não existe, para que o tempo
  // de resposta não revele quais e-mails estão cadastrados.
  const ok = verifyPassword(password, found ? found.password_hash : 'x:' + '0'.repeat(128)) && !!found;
  if (!ok) {
    keys.forEach((k) => loginLimiter.fail(k));
    return ctx.render(400, 'Entrar', views.loginPage({ errors: ['E-mail ou senha inválidos.'], old: { email }, next }), 'login');
  }
  keys.forEach((k) => loginLimiter.reset(k));
  ctx.login(found.id); // novo identificador de sessão a cada login
  ctx.setFlash(`Bem-vindo(a) de volta, ${found.name}!`, 'success');
  return ctx.redirect(next || '/');
}

async function logout(ctx) {
  ctx.logout();
  return ctx.redirect('/');
}

async function forgotForm(ctx) {
  ctx.render(200, 'Recuperar senha', views.forgotPage({ sent: false, errors: [] }), 'login');
}

async function forgot(ctx) {
  const email = str(ctx.body.email, 200).toLowerCase();
  const key = `reset:${clientIp(ctx)}`;
  if (loginLimiter.lockedFor(key) > 0) {
    return ctx.render(429, 'Recuperar senha', views.forgotPage({ sent: false, errors: ['Muitas solicitações. Aguarde alguns minutos e tente novamente.'] }), 'login');
  }
  loginLimiter.fail(key); // limita pedidos de recuperação por endereço de origem
  const user = repo.users.byEmail.get(email);
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    repo.resets.invalidateUser.run(repo.now(), user.id);
    repo.resets.insert.run(user.id, hash, Date.now() + config.RESET_TOKEN_TTL_MS);
    const host = ctx.req.headers.host || `localhost:${config.PORT}`;
    sendMail({
      to: user.email,
      subject: 'Nexo — redefinição de senha',
      text: `Olá, ${user.name}.\n\nRecebemos um pedido para redefinir sua senha. Use o link abaixo (válido por 30 minutos, uso único):\n\nhttp://${host}/redefinir-senha?token=${token}\n\nSe não foi você, ignore esta mensagem; sua senha continua a mesma.`,
    });
  }
  // A resposta é a mesma exista ou não a conta, para não revelar e-mails cadastrados.
  ctx.render(200, 'Recuperar senha', views.forgotPage({ sent: true }), 'login');
}

function findReset(token) {
  if (!/^[a-f0-9]{64}$/.test(token || '')) return null;
  const row = repo.resets.byHash.get(crypto.createHash('sha256').update(token).digest('hex'));
  if (!row || row.expires_at < Date.now()) return null;
  return row;
}

async function resetForm(ctx) {
  const token = ctx.query.get('token') || '';
  ctx.render(200, 'Nova senha', views.resetPage({ token, errors: [], invalid: !findReset(token) }), 'login');
}

async function reset(ctx) {
  const token = String(ctx.body.token || '');
  const row = findReset(token);
  if (!row) return ctx.render(400, 'Nova senha', views.resetPage({ invalid: true }), 'login');
  const errors = passwordProblems(ctx.body.password, ctx.body.password_confirm);
  if (errors.length) return ctx.render(400, 'Nova senha', views.resetPage({ token, errors }), 'login');
  if (repo.resets.use.run(repo.now(), row.id).changes !== 1) return ctx.render(400, 'Nova senha', views.resetPage({ invalid: true }), 'login');
  repo.users.updatePassword.run(hashPassword(ctx.body.password), row.user_id);
  session.destroyUserSessions(row.user_id); // encerra sessões abertas com a senha antiga
  ctx.login(row.user_id);
  ctx.setFlash('Senha redefinida com sucesso. Você já está conectado(a).', 'success');
  return ctx.redirect('/');
}

module.exports = [
  { method: 'GET', path: '/cadastro', guestOnly: true, handler: registerForm },
  { method: 'POST', path: '/cadastro', guestOnly: true, handler: register },
  { method: 'GET', path: '/login', guestOnly: true, handler: loginForm },
  { method: 'POST', path: '/login', guestOnly: true, handler: login },
  { method: 'POST', path: '/logout', handler: logout },
  { method: 'GET', path: '/recuperar-senha', guestOnly: true, handler: forgotForm },
  { method: 'POST', path: '/recuperar-senha', guestOnly: true, handler: forgot },
  { method: 'GET', path: '/redefinir-senha', handler: resetForm },
  { method: 'POST', path: '/redefinir-senha', handler: reset },
];
