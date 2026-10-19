'use strict';

// Hash de senha usando scrypt (módulo nativo node:crypto), com salt aleatório
// por usuário, e política de senha.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

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

// Política de senha (OWASP ASVS 4.0.3, requisitos 2.1.1 a 2.1.9): ao menos 12
// caracteres e no máximo 128, sem regras de composição — frases com espaços são
// aceitas e incentivadas —, recusando senhas que estejam na lista local de senhas
// mais usadas, sequências óbvias e senhas que contenham o e-mail ou o nome.
// Retorna a lista de problemas encontrados (vazia se a senha for aceita).
const MIN_LENGTH = 12;
const MAX_LENGTH = 128;
const COMMON = new Set(
  fs.readFileSync(path.join(__dirname, 'senhas-comuns.txt'), 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')),
);
const EXAMPLE = 'minha casa tem janela azul'; // exemplo exibido na própria página
const PREDICTABLE_WORDS = ['senha', 'password', 'nexo', 'qwerty', 'asdfgh', 'abcdef', 'admin', 'teste'];

function isSequence(p) {
  // mesma letra repetida ou sequência crescente/decrescente (ex.: "aaaaaaaaaaaa", "123456789012")
  if (/^(.)\1+$/.test(p)) return true;
  const codes = [...p].map((c) => c.charCodeAt(0));
  const steps = new Set(codes.slice(1).map((c, i) => (c - codes[i] + 10) % 10 === 1 ? 1 : (codes[i] - c + 10) % 10 === 1 ? -1 : 0));
  return /^\d+$/.test(p) && steps.size === 1 && !steps.has(0);
}

function passwordProblems(password, confirmation, context = {}) {
  const problems = [];
  const p = String(password || '').replace(/ {2,}/g, ' '); // espaços seguidos contam como um (ASVS 2.1.1)
  const lower = p.toLowerCase();
  if (p.length < MIN_LENGTH) {
    problems.push(`A senha deve ter ao menos ${MIN_LENGTH} caracteres. Frases com espaços são aceitas, como "minha casa tem janela azul".`);
  } else if (p.length > MAX_LENGTH) {
    problems.push(`A senha pode ter no máximo ${MAX_LENGTH} caracteres.`);
  } else if (COMMON.has(lower) || isSequence(p) || lower === EXAMPLE
      || PREDICTABLE_WORDS.some((w) => new RegExp(`^(${w})+$`).test(lower.replace(/[^a-zà-ÿ]/g, '')))) {
    problems.push('Essa senha é muito comum ou previsível. Escolha outra, de preferência uma frase.');
  } else {
    const local = String(context.email || '').toLowerCase().split('@')[0];
    const name = String(context.name || '').toLowerCase().trim();
    if ((local.length >= 4 && lower.includes(local)) || (name.length >= 4 && lower.includes(name))) {
      problems.push('A senha não pode conter o seu e-mail ou o seu nome.');
    }
  }
  if (confirmation !== undefined && String(password || '') !== confirmation) {
    problems.push('A confirmação da senha não confere com a senha digitada.');
  }
  return problems;
}

module.exports = { hashPassword, verifyPassword, passwordProblems, MIN_LENGTH, MAX_LENGTH };
