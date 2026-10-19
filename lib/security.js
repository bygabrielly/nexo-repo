'use strict';

// Controles de segurança transversais da aplicação:
// - token anti-CSRF (OWASP A01);
// - limitação de tentativas de login e de frequência de ações (OWASP A07);
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

// ---------- Proteção do login contra força bruta sem bloquear a conta ----------
// Um bloqueio só por e-mail permitiria a um terceiro bloquear de propósito a
// conta de outra pessoa (negação de serviço). Por isso o limite é combinado,
// como sugere o OWASP ASVS 4.0.3 (requisito 2.2.1):
// - por par conta + origem: 5 falhas em 15 min bloqueiam aquela origem para aquela conta;
// - por origem: 20 falhas em 15 min (em quaisquer contas) bloqueiam a origem;
// - por conta (quaisquer origens): a partir da 5ª falha, cada nova tentativa exige
//   uma espera crescente (1 s, 2 s, 4 s... até 60 s), que não se aplica a um
//   navegador em que o usuário já entrou antes ("dispositivo conhecido").
class LoginThrottle {
  constructor({ pairMax, ipMax, windowMs, lockMs, freeFailures, maxDelayMs }) {
    this.pair = new AttemptLimiter({ maxFailures: pairMax, windowMs, lockMs });
    this.ip = new AttemptLimiter({ maxFailures: ipMax, windowMs, lockMs });
    this.windowMs = windowMs;
    this.freeFailures = freeFailures;
    this.maxDelayMs = maxDelayMs;
    this.accounts = new Map(); // email -> { failures, first, nextAllowed }
  }

  // Retorna { waitMs, reason }: waitMs = 0 quando a tentativa pode prosseguir.
  check({ email, ip, knownDevice = false, now = Date.now() }) {
    const pairWait = this.pair.lockedFor(`${email}|${ip}`, now);
    if (pairWait > 0) return { waitMs: pairWait, reason: 'conta-origem' };
    const ipWait = this.ip.lockedFor(ip, now);
    if (ipWait > 0) return { waitMs: ipWait, reason: 'origem' };
    const a = this.accounts.get(email);
    if (!knownDevice && a && now < a.nextAllowed) return { waitMs: a.nextAllowed - now, reason: 'conta' };
    return { waitMs: 0, reason: null };
  }

  fail({ email, ip, now = Date.now() }) {
    this.pair.fail(`${email}|${ip}`, now);
    this.ip.fail(ip, now);
    let a = this.accounts.get(email);
    if (!a || now - a.first > this.windowMs) {
      a = { failures: 0, first: now, nextAllowed: 0 };
      this.accounts.set(email, a);
    }
    a.failures += 1;
    if (a.failures >= this.freeFailures) {
      const delay = Math.min(1000 * 2 ** (a.failures - this.freeFailures), this.maxDelayMs);
      a.nextAllowed = now + delay;
    }
  }

  success({ email, ip }) {
    this.pair.reset(`${email}|${ip}`);
    this.accounts.delete(email);
  }
}

const loginThrottle = new LoginThrottle({
  pairMax: config.LOGIN_MAX_FAILURES,
  ipMax: config.LOGIN_IP_MAX_FAILURES,
  windowMs: config.LOGIN_WINDOW_MS,
  lockMs: config.LOGIN_LOCK_MS,
  freeFailures: config.LOGIN_MAX_FAILURES,
  maxDelayMs: config.LOGIN_MAX_DELAY_MS,
});

// Pedidos de recuperação de senha por origem.
const resetLimiter = new AttemptLimiter({
  maxFailures: config.LOGIN_MAX_FAILURES,
  windowMs: config.LOGIN_WINDOW_MS,
  lockMs: config.LOGIN_LOCK_MS,
});

// "Dispositivo conhecido": depois de um login bem-sucedido, o navegador recebe
// um cookie assinado com o id do usuário. Ele não dá acesso a nada; só dispensa
// a espera crescente por conta quando o próprio usuário tenta entrar.
const DEVICE_SECRET = crypto.randomBytes(32);
function deviceToken(userId) {
  const mac = crypto.createHmac('sha256', DEVICE_SECRET).update(`dev:${userId}`).digest('hex');
  return `${userId}.${mac}`;
}
function deviceUserId(token) {
  const m = /^(\d+)\.([a-f0-9]{64})$/.exec(String(token || ''));
  if (!m) return null;
  const expected = Buffer.from(deviceToken(Number(m[1])).split('.')[1], 'hex');
  const given = Buffer.from(m[2], 'hex');
  return crypto.timingSafeEqual(expected, given) ? Number(m[1]) : null;
}

// ---------- Limite de frequência de ações (mensagens, propostas, publicações) ----------
// Janela deslizante por usuário: impede o envio automatizado em massa.
class RateLimiter {
  constructor({ max, windowMs }) {
    this.max = max;
    this.windowMs = windowMs;
    this.hits = new Map();
  }

  // Registra a ação e retorna 0 se permitida, ou os ms até a próxima permissão.
  take(key, now = Date.now()) {
    const list = (this.hits.get(key) || []).filter((t) => now - t < this.windowMs);
    if (list.length >= this.max) {
      this.hits.set(key, list);
      return this.windowMs - (now - list[0]);
    }
    list.push(now);
    this.hits.set(key, list);
    return 0;
  }
}

const actionLimiters = {
  mensagens: new RateLimiter(config.RATE_LIMITS.mensagens),
  propostas: new RateLimiter(config.RATE_LIMITS.propostas),
  publicacoes: new RateLimiter(config.RATE_LIMITS.publicacoes),
};

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
  "style-src 'self'",
  "font-src 'self'",
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

// ---------- Cookies ----------
// Cookies de sessão: HttpOnly (inacessíveis a scripts), SameSite=Lax (não
// enviados em envios de formulário vindos de outros sites) e Secure quando o
// sistema é servido por HTTPS (COOKIE_SECURE=1).
function buildCookie(name, value, { maxAge } = {}) {
  let c = `${name}=${value}; HttpOnly; Path=/; SameSite=Lax`;
  if (config.COOKIE_SECURE) c += '; Secure';
  if (maxAge !== undefined) c += `; Max-Age=${maxAge}`;
  return c;
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
  LoginThrottle,
  loginThrottle,
  resetLimiter,
  deviceToken,
  deviceUserId,
  RateLimiter,
  actionLimiters,
  detectImageType,
  securityHeaders,
  safeNext,
  buildCookie,
};
