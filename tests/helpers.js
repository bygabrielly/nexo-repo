'use strict';

// Utilitários da suíte de testes: sobem uma instância real do servidor com
// banco de dados, uploads e caixa de e-mail em pastas temporárias, e oferecem
// um "navegador" mínimo (cookies + token anti-CSRF) para fazer requisições
// HTTP reais contra ela.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function startServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-test-'));
  process.env.DB_PATH = path.join(dir, 'test.sqlite');
  process.env.UPLOADS_DIR = path.join(dir, 'uploads');
  process.env.OUTBOX_DIR = path.join(dir, 'outbox');
  process.env.NEXO_QUIET = '1';
  const { createApp } = require('../server');
  const server = createApp();
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      resolve({ server, base, dir, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

class Browser {
  constructor(base) {
    this.base = base;
    this.cookies = {};
    this.lastHtml = '';
  }

  cookieHeader() {
    return Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  }

  store(res) {
    const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of set) {
      const [pair, ...attrs] = c.split(';');
      const i = pair.indexOf('=');
      const name = pair.slice(0, i).trim();
      const value = pair.slice(i + 1).trim();
      if (attrs.some((a) => /max-age=0/i.test(a)) || value === '') delete this.cookies[name];
      else this.cookies[name] = value;
    }
  }

  async get(p) {
    const res = await fetch(this.base + p, { headers: { cookie: this.cookieHeader() }, redirect: 'manual' });
    this.store(res);
    const body = await res.text();
    if ((res.headers.get('content-type') || '').includes('text/html')) this.lastHtml = body;
    return { status: res.status, headers: res.headers, body, location: res.headers.get('location') };
  }

  csrf() {
    const m = this.lastHtml.match(/name="_csrf" value="([a-f0-9]{64})"/);
    return m ? m[1] : '';
  }

  // Envia um formulário. Por padrão obtém antes uma página (GET) para ler o
  // token anti-CSRF, exatamente como faria um navegador.
  async post(p, fields = {}, { from = '/', csrf = true, files = null } = {}) {
    if (csrf) await this.get(from);
    const data = { ...fields };
    if (csrf && data._csrf === undefined) data._csrf = this.csrf();
    let body;
    const headers = { cookie: this.cookieHeader() };
    if (files) {
      body = new FormData();
      for (const [k, v] of Object.entries(data)) body.append(k, v);
      for (const [k, f] of Object.entries(files)) body.append(k, new Blob([f.buffer], { type: f.type }), f.name);
    } else {
      body = new URLSearchParams(data).toString();
      headers['content-type'] = 'application/x-www-form-urlencoded';
    }
    const res = await fetch(this.base + p, { method: 'POST', headers, body, redirect: 'manual' });
    this.store(res);
    const text = await res.text();
    if ((res.headers.get('content-type') || '').includes('text/html')) this.lastHtml = text;
    return { status: res.status, headers: res.headers, body: text, location: res.headers.get('location') };
  }

  async login(email, password = 'conta demo 2026') {
    const r = await this.post('/login', { email, password }, { from: '/login' });
    if (r.status !== 302) throw new Error(`login falhou para ${email}: ${r.status}`);
    return r;
  }
}

// PNG válido mínimo (1x1 pixel), gerado por uma biblioteca de imagens e decodificável.
const PNG_1PX = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6398a5bdff3f00056b0284fffa1c7f0000000049454e44ae426082',
  'hex'
);

module.exports = { startServer, Browser, PNG_1PX };
