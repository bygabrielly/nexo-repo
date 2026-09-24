'use strict';

// Sessões em memória (Map token -> dados da sessão). Suficiente para um
// protótipo em processo único; em produção seria substituído por um
// armazenamento persistente (ex.: Redis).
//
// Medidas de segurança:
// - o token tem 256 bits de aleatoriedade criptográfica (crypto.randomBytes);
// - nenhum token é emitido antes da autenticação, e um token novo é gerado a
//   cada login (o anterior é destruído), o que impede a fixação de sessão;
// - a sessão expira após um período sem uso e após um tempo máximo absoluto;
// - todas as sessões de um usuário podem ser encerradas de uma vez (troca de
//   senha, redefinição de senha, exclusão da conta).

const crypto = require('node:crypto');
const { SESSION_IDLE_MS, SESSION_ABSOLUTE_MS } = require('./config');

const sessions = new Map();

function createSession(userId, previousToken) {
  if (previousToken) sessions.delete(previousToken);
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  sessions.set(token, { userId, createdAt: now, lastSeen: now, flash: null });
  return token;
}

function getSession(token) {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  const now = Date.now();
  if (now - s.lastSeen > SESSION_IDLE_MS || now - s.createdAt > SESSION_ABSOLUTE_MS) {
    sessions.delete(token);
    return null;
  }
  s.lastSeen = now;
  return s;
}

function destroySession(token) {
  sessions.delete(token);
}

function destroyUserSessions(userId, exceptToken) {
  for (const [token, s] of sessions) {
    if (s.userId === userId && token !== exceptToken) sessions.delete(token);
  }
}

function setFlash(token, message, type = 'info', extra = null) {
  const s = sessions.get(token);
  if (s) s.flash = { message, type, extra };
}

function popFlash(token) {
  const s = sessions.get(token);
  if (!s || !s.flash) return null;
  const f = s.flash;
  s.flash = null;
  return f;
}

module.exports = { createSession, getSession, destroySession, destroyUserSessions, setFlash, popFlash };
