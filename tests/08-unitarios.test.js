'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword, passwordProblems } = require('../lib/auth');
const { detectImageType, AttemptLimiter, safeNext, csrfToken, csrfValid } = require('../lib/security');
const { escapeHtml } = require('../lib/http-helpers');
const { PNG_1PX } = require('./helpers');

test('T51 — hashPassword/verifyPassword: salt aleatório e verificação correta', () => {
  const a = hashPassword('senha1234');
  const b = hashPassword('senha1234');
  assert.notEqual(a, b, 'mesma senha gera hashes diferentes');
  assert.ok(verifyPassword('senha1234', a));
  assert.ok(!verifyPassword('senha1235', a));
  assert.ok(!verifyPassword('senha1234', 'formato-invalido'));
});

test('T52 — Política de senha', () => {
  assert.deepEqual(passwordProblems('abc12345', 'abc12345'), []);
  assert.equal(passwordProblems('abc12', 'abc12').length, 1);
  assert.equal(passwordProblems('abcdefgh').length, 1);
  assert.equal(passwordProblems('12345678').length, 1);
  assert.equal(passwordProblems('abc12345', 'abc12346').length, 1);
});

test('T53 — detectImageType reconhece PNG, JPEG e WEBP pela assinatura e rejeita o resto', () => {
  assert.equal(detectImageType(PNG_1PX).ext, '.png');
  assert.equal(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])).ext, '.jpg');
  assert.equal(detectImageType(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')])).ext, '.webp');
  assert.equal(detectImageType(Buffer.from('#!/bin/sh\necho oi\n')), null);
  assert.equal(detectImageType(Buffer.from('<svg onload="alert(1)"></svg>')), null);
  assert.equal(detectImageType(Buffer.from('GIF89a......')), null);
});

test('T54 — AttemptLimiter bloqueia após o limite e libera após o tempo de bloqueio', () => {
  const l = new AttemptLimiter({ maxFailures: 3, windowMs: 1000, lockMs: 5000 });
  const t = 1_000_000;
  l.fail('k', t); l.fail('k', t + 10);
  assert.equal(l.lockedFor('k', t + 20), 0);
  l.fail('k', t + 30);
  assert.ok(l.lockedFor('k', t + 40) > 0);
  assert.equal(l.lockedFor('k', t + 30 + 5001), 0);
  l.fail('x', t); l.reset('x'); l.fail('x', t); l.fail('x', t);
  assert.equal(l.lockedFor('x', t), 0, 'reset zera a contagem');
});

test('T55 — safeNext aceita só caminhos internos', () => {
  assert.equal(safeNext('/pedidos/3'), '/pedidos/3');
  for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '/a\r\nSet-Cookie: x=1', null]) {
    assert.equal(safeNext(bad), null, String(bad));
  }
});

test('T56 — escapeHtml neutraliza os caracteres especiais de HTML', () => {
  assert.equal(escapeHtml('<a href="x" onclick=\'y\'>&</a>'), '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  assert.equal(escapeHtml(null), '');
});

test('T57 — Token anti-CSRF é vinculado à sessão', () => {
  const t = csrfToken('sessao-a');
  assert.ok(csrfValid('sessao-a', t));
  assert.ok(!csrfValid('sessao-b', t));
  assert.ok(!csrfValid('sessao-a', 'x'.repeat(64)));
  assert.ok(!csrfValid('sessao-a', undefined));
});

// Controles de sessão que não são observáveis numa única
// requisição: expiração da sessão e atributo Secure do cookie.
test('T67 — Sessão expira após 2 h sem uso e 12 h após o login, mesmo se usada continuamente', () => {
  const session = require('../lib/session');
  const config = require('../lib/config');
  const t1 = session.createSession(1);
  assert.ok(session.getSession(t1), 'sessão recém-criada é válida');
  session.getSession(t1).lastSeen = Date.now() - config.SESSION_IDLE_MS - 1000;
  assert.equal(session.getSession(t1), null, 'expirada por inatividade');
  const t2 = session.createSession(1);
  const s2 = session.getSession(t2);
  s2.createdAt = Date.now() - config.SESSION_ABSOLUTE_MS - 1000;
  s2.lastSeen = Date.now();
  assert.equal(session.getSession(t2), null, 'expirada pelo tempo máximo, mesmo com uso recente');
});

test('T68 — Cookie de sessão recebe o atributo Secure quando o sistema é servido por HTTPS', () => {
  const config = require('../lib/config');
  const { buildCookie } = require('../lib/security');
  const original = config.COOKIE_SECURE;
  try {
    config.COOKIE_SECURE = false;
    assert.doesNotMatch(buildCookie('sid', 'abc'), /Secure/);
    config.COOKIE_SECURE = true;
    const c = buildCookie('sid', 'abc');
    assert.match(c, /; HttpOnly/);
    assert.match(c, /; SameSite=Lax/);
    assert.match(c, /; Secure/);
  } finally {
    config.COOKIE_SECURE = original;
  }
});
