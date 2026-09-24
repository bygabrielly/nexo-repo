'use strict';

// Controles de segurança transversais da aplicação:
// - token anti-CSRF (OWASP A01);
// - limitação de tentativas de login (OWASP A07);
// - identificação do tipo real de imagem pela assinatura binária (OWASP A04/A08);
// - cabeçalhos HTTP de segurança (OWASP A05);
// - validação de redirecionamentos internos (evita open redirect).

const crypto = require('node:crypto');
const config = require('./config');

// ---------- CSRF ----------
// Token sincronizado derivado da sessão: HMAC(segredo do servidor, id da
// sessão). Para visitantes ainda não autenticados (formulários de login e
// cadastro), usa-se um identificador anônimo guardado num cookie HttpOnly.
// Um site de terceiros não consegue ler nem calcular esse valor, portanto não
// consegue forjar uma requisição POST válida em nome do usuário.
const CSRF_SECRET = crypto.randomBytes(32);

function csrfToken(sessionOrAnonId) {
  return crypto.createHmac('sha256', CSRF_SECRET).update(String(sessionOrAnonId)).digest('hex');
}

function csrfValid(sessionOrAnonId, token) {
  if (!sessionOrAnonId || typeof token !== 'string' || token.length !== 64) return false;
  const expected = Buffer.from(csrfToken(sessionOrAnonId), 'hex');
  const given = Buffer.from(token, 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

// ---------- Limitação de tentativas (força bruta) ----------
class AttemptLimiter {
  constructor({ maxFailures, windowMs, lockMs }) {
    this.maxFailures = maxFailures;
    this.windowMs = windowMs;
    this.lockMs = lockMs;
    this.entries = new Map();
  }

  // Retorna os milissegundos restantes de bloqueio (0 se liberado).
  lockedFor(key, now = Date.now()) {
    const e = this.entries.get(key);
    if (!e || !e.lockedUntil) return 0;
    if (now >= e.lockedUntil) {
      this.entries.delete(key);
      return 0;
    }
    return e.lockedUntil - now;
  }

  fail(key, now = Date.now()) {
    let e = this.entries.get(key);
    if (!e || now - e.first > this.windowMs) {
      e = { count: 0, first: now, lockedUntil: 0 };
      this.entries.set(key, e);
    }
    e.count += 1;
    if (e.count >= this.maxFailures) e.lockedUntil = now + this.lockMs;
  }

  reset(key) {
    this.entries.delete(key);
  }
}

const loginLimiter = new AttemptLimiter({
  maxFailures: config.LOGIN_MAX_FAILURES,
  windowMs: config.LOGIN_WINDOW_MS,
  lockMs: config.LOGIN_LOCK_MS,
});

// ---------- Tipo real de imagem (assinatura binária / "magic bytes") ----------
// O tipo MIME informado no upload é escolhido pelo navegador (ou por quem
// monta a requisição) e não é confiável. O tipo é determinado pelos primeiros
// bytes do próprio arquivo.
function detectImageType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0x89 && buffer.slice(1, 4).toString('ascii') === 'PNG' &&
      buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a) {
    return { mime: 'image/png', ext: '.png' };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: '.jpg' };
  }
  if (buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') {
    return { mime: 'image/webp', ext: '.webp' };
  }
  return null;
}

// ---------- Cabeçalhos de segurança ----------
const CSP = [
  "default-src 'self'",
  "img-src 'self' data:",
  "style-src 'self' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "script-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

function securityHeaders(extra = {}) {
  return {
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    ...extra,
  };
}

// ---------- Redirecionamento interno seguro ----------
// Aceita apenas caminhos locais ("/algo"), nunca URLs absolutas ou "//host".
function safeNext(next) {
  if (typeof next !== 'string') return null;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;
  if (/[\r\n]/.test(next)) return null;
  return next;
}

module.exports = {
  csrfToken,
  csrfValid,
  AttemptLimiter,
  loginLimiter,
  detectImageType,
  securityHeaders,
  safeNext,
};
