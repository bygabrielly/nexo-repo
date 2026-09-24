'use strict';

// Hash de senha usando scrypt (módulo nativo node:crypto), com salt aleatório
// por usuário, e política mínima de senha.

const crypto = require('node:crypto');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(derived, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Política de senha: ao menos 8 caracteres, com pelo menos uma letra e um
// número. Retorna a lista de problemas encontrados (vazia se a senha for aceita).
function passwordProblems(password, confirmation) {
  const problems = [];
  const p = String(password || '');
  if (p.length < 8) problems.push('A senha deve ter ao menos 8 caracteres.');
  if (!/[A-Za-zÀ-ÿ]/.test(p) || !/\d/.test(p)) problems.push('A senha deve conter letras e números.');
  if (confirmation !== undefined && p !== confirmation) problems.push('A confirmação da senha não confere com a senha digitada.');
  return problems;
}

module.exports = { hashPassword, verifyPassword, passwordProblems };
