'use strict';

const repo = require('../lib/repo');
const views = require('../views');
const session = require('../lib/session');
const { verifyPassword, hashPassword, passwordProblems } = require('../lib/auth');

async function accountPage(ctx) {
  ctx.render(200, 'Conta e Privacidade', views.accountPage({ user: ctx.user, errors: [] }), 'perfil');
}

async function changePassword(ctx) {
  const b = ctx.body;
  const errors = [];
  if (!verifyPassword(String(b.current || ''), ctx.user.password_hash)) errors.push('A senha atual está incorreta.');
  errors.push(...passwordProblems(b.password, b.password_confirm));
  if (errors.length) return ctx.render(400, 'Conta e Privacidade', views.accountPage({ user: ctx.user, errors }), 'perfil');
  repo.users.updatePassword.run(hashPassword(b.password), ctx.user.id);
  session.destroyUserSessions(ctx.user.id, ctx.sid); // encerra as outras sessões abertas
  ctx.setFlash('Senha alterada. As outras sessões abertas foram encerradas.', 'success');
  return ctx.redirect('/conta');
}

async function exportData(ctx) {
  const data = repo.exportUserData(ctx.user.id);
  ctx.send(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="nexo-meus-dados-${ctx.user.id}.json"`,
    'Cache-Control': 'no-store',
  }, JSON.stringify(data, null, 2));
}

async function deleteAccount(ctx) {
  if (!verifyPassword(String(ctx.body.password || ''), ctx.user.password_hash)) {
    return ctx.render(400, 'Conta e Privacidade', views.accountPage({ user: ctx.user, errors: ['Senha incorreta: a conta não foi excluída.'] }), 'perfil');
  }
  const userId = ctx.user.id;
  repo.anonymizeUser(userId);
  session.destroyUserSessions(userId);
  ctx.logout();
  ctx.user = null;
  return ctx.render(200, 'Conta excluída', views.errorPage('Conta excluída', 'Sua conta e seus dados pessoais foram excluídos. Obrigado por usar o Nexo.'));
}

module.exports = [
  { method: 'GET', path: '/conta', auth: 'user', handler: accountPage },
  { method: 'POST', path: '/conta/senha', auth: 'user', handler: changePassword },
  { method: 'GET', path: '/conta/exportar', auth: 'user', handler: exportData },
  { method: 'POST', path: '/conta/excluir', auth: 'user', handler: deleteAccount },
];
