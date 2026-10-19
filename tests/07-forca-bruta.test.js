'use strict';

// Arquivo separado porque o bloqueio é por conta e também por endereço de
// origem: as tentativas aqui bloqueiam o endereço local por 15 minutos.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, Browser } = require('./helpers');

let app;
before(async () => { app = await startServer(); });
after(async () => { await app.close(); });

test('T50 — Após 5 tentativas de login com senha errada, novas tentativas são bloqueadas (inclusive com a senha certa)', async () => {
  const b = new Browser(app.base);
  const status = [];
  for (let i = 1; i <= 5; i++) {
    const r = await b.post('/login', { email: 'marina@example.com', password: `tentativa${i}` }, { from: '/login' });
    status.push(r.status);
  }
  assert.deepEqual(status, [400, 400, 400, 400, 400]);
  const sexta = await b.post('/login', { email: 'marina@example.com', password: 'conta demo 2026' }, { from: '/login' });
  assert.equal(sexta.status, 429);
  assert.match(sexta.body, /Muitas tentativas de login sem sucesso/);
  assert.ok(!b.cookies.sid, 'nenhuma sessão criada durante o bloqueio');
});
