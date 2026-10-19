'use strict';

/**
 * Nexo — protótipo de plataforma web para intermediação de serviços entre
 * freelancers e clientes.
 *
 * Implementado em Node.js puro, apenas com módulos nativos (node:http,
 * node:sqlite, node:crypto, node:fs, node:test): basta ter o Node.js 22.13+
 * instalado, sem `npm install`.
 *
 * Este arquivo é a camada de aplicação: recebe cada requisição HTTP, aplica
 * os controles transversais (sessão, controle de acesso, CSRF, cabeçalhos de
 * segurança) e a encaminha para a rota correspondente em routes/.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');

const config = require('./lib/config');
const repo = require('./lib/repo');
const session = require('./lib/session');
const security = require('./lib/security');
const { parseCookies, parseFormBody, parseMultipartFormData } = require('./lib/http-helpers');
const views = require('./views');
const routes = require('./routes');
const { seedIfEmpty } = require('./lib/seed');

const IMAGE_TYPES = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const STATIC_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
};

const cookie = security.buildCookie;

function serveStatic(res, pathname) {
  const base = pathname.startsWith('/uploads/') ? config.UPLOADS_DIR : config.PUBLIC_DIR;
  const rel = pathname.startsWith('/uploads/') ? pathname.slice('/uploads/'.length) : pathname.slice(1);
  const filePath = path.join(base, rel);
  const ext = path.extname(filePath).toLowerCase();
  // Na pasta de uploads só são entregues imagens: nenhum outro tipo de arquivo
  // (como .js ou .html) pode ser servido a partir dela, mesmo que exista lá.
  const allowed = pathname.startsWith('/uploads/') ? IMAGE_TYPES.has(ext) : !!STATIC_TYPES[ext];
  if (!filePath.startsWith(base + path.sep) || !allowed) {
    res.writeHead(404, security.securityHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }));
    return res.end('Não encontrado');
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, security.securityHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }));
      return res.end('Não encontrado');
    }
    res.writeHead(200, security.securityHeaders({
      'Content-Type': STATIC_TYPES[path.extname(filePath).toLowerCase()],
      'Cache-Control': pathname.startsWith('/uploads/') ? 'public, max-age=86400' : 'no-cache',
    }));
    res.end(content);
  });
}

function matchRoute(method, pathname) {
  for (const r of routes) {
    if (r.method !== method) continue;
    if (typeof r.path === 'string') {
      if (r.path === pathname) return { route: r, params: [] };
    } else {
      const m = pathname.match(r.path);
      if (m) return { route: r, params: m.slice(1) };
    }
  }
  return null;
}

// Tarefas que dependem da passagem do tempo (conclusão automática de pedidos
// entregues e publicação de avaliações com prazo encerrado), executadas no
// máximo uma vez por intervalo, antes de atender uma requisição.
let lastScheduledRun = 0;
function maybeRunScheduledTasks() {
  const t = Date.now();
  if (t - lastScheduledRun < config.SCHEDULED_TASKS_INTERVAL_MS) return;
  lastScheduledRun = t;
  repo.runScheduledTasks();
}

// Versões anteriores guardavam as imagens em public/uploads; na inicialização,
// elas são copiadas para a pasta atual (fora de public/), sem sobrescrever nada.
function migrateLegacyUploads() {
  const from = config.LEGACY_UPLOADS_DIR;
  if (process.env.UPLOADS_DIR || !fs.existsSync(from)) return;
  fs.mkdirSync(config.UPLOADS_DIR, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    const dest = path.join(config.UPLOADS_DIR, name);
    if (!fs.existsSync(dest)) fs.copyFileSync(path.join(from, name), dest);
  }
}

function createApp() {
  migrateLegacyUploads();
  seedIfEmpty();

  return http.createServer(async (req, res) => {
    const pending = []; // cabeçalhos Set-Cookie acumulados durante a requisição
    let ctx;
    try {
      const url = new URL(req.url, 'http://localhost');
      const pathname = url.pathname;
      const method = req.method === 'HEAD' ? 'GET' : req.method;

      if (method === 'GET' && (pathname === '/style.css' || pathname === '/app.js' || pathname.startsWith('/fonts/') || pathname.startsWith('/uploads/'))) {
        return serveStatic(res, pathname);
      }

      maybeRunScheduledTasks();

      // ---- sessão e usuário ----
      const cookies = parseCookies(req);
      let sid = cookies.sid;
      const sess = session.getSession(sid);
      let user = null;
      if (sess) {
        user = repo.users.byId.get(sess.userId) || null;
        if (!user) { session.destroySession(sid); sid = null; }
      } else if (sid) {
        pending.push(cookie('sid', '', { maxAge: 0 })); // sessão expirada: remove o cookie
        sid = null;
      }
      let aid = cookies.aid;
      if (!sid && !/^[a-f0-9]{32}$/.test(aid || '')) {
        aid = crypto.randomBytes(16).toString('hex');
        pending.push(cookie('aid', aid));
      }

      ctx = {
        req, res, url, pathname, method, user, cookies,
        get sid() { return sid; },
        query: url.searchParams,
        body: {}, files: {},
        csrf: security.csrfToken(sid || aid),
        flash: sid ? session.popFlash(sid) : null,
      };

      ctx.setCookie = (name, value, opts) => pending.push(cookie(name, value, opts));
      ctx.setFlash = (message, type = 'success', extra = null) => { if (sid) session.setFlash(sid, message, type, extra); };
      ctx.login = (userId) => {
        sid = session.createSession(userId, sid);
        ctx.user = repo.users.byId.get(userId);
        pending.push(cookie('sid', sid));
      };
      ctx.logout = () => {
        if (sid) session.destroySession(sid);
        sid = null;
        pending.push(cookie('sid', '', { maxAge: 0 }));
      };
      const withCookies = (headers) => (pending.length ? { ...headers, 'Set-Cookie': pending } : headers);
      ctx.redirect = (location) => {
        res.writeHead(302, security.securityHeaders(withCookies({ Location: location })));
        res.end();
      };
      ctx.send = (status, headers, content) => {
        res.writeHead(status, security.securityHeaders(withCookies(headers)));
        res.end(content);
      };
      ctx.render = (status, title, body, active) => {
        const u = ctx.user;
        const counts = u ? {
          orders: repo.orders.pendingFor.get(u.id, u.id).c,
          messages: repo.messages.unreadFor.get(u.id, u.id, u.id).c,
        } : {};
        let html = views.layout({ title, user: u, flash: ctx.flash, body, active, counts });
        // Todo formulário POST recebe automaticamente o token anti-CSRF.
        html = html.replace(/(<form\b[^>]*method="POST"[^>]*>)/gi, `$1<input type="hidden" name="_csrf" value="${ctx.csrf}">`);
        const headers = { 'Content-Type': 'text/html; charset=utf-8' };
        if (u) headers['Cache-Control'] = 'no-store';
        ctx.send(status, headers, html);
      };

      // ---- roteamento ----
      const found = matchRoute(method, pathname);
      if (!found) return ctx.render(404, 'Não encontrado', views.notFoundPage());
      const { route, params } = found;
      ctx.params = params;

      // ---- controle de acesso ----
      if (route.auth && !user) {
        if (method === 'GET') return ctx.redirect(`/login?next=${encodeURIComponent(pathname + url.search)}`);
        return ctx.redirect('/login');
      }
      if ((route.auth === 'freelancer' || route.auth === 'cliente') && user.role !== route.auth) {
        const who = route.auth === 'freelancer' ? 'freelancers' : 'clientes';
        return ctx.render(403, 'Acesso restrito', views.errorPage('Acesso restrito', `Esta funcionalidade é exclusiva para ${who}.`));
      }
      if (route.guestOnly && user) return ctx.redirect('/');

      // ---- corpo da requisição e CSRF ----
      if (method === 'POST') {
        const type = req.headers['content-type'] || '';
        try {
          if (type.startsWith('multipart/form-data')) {
            if (!route.multipart) throw new Error('Formato de envio não aceito nesta página.');
            const parsed = await parseMultipartFormData(req, config.MAX_MULTIPART_BYTES);
            ctx.body = parsed.fields;
            ctx.files = parsed.files;
          } else {
            ctx.body = await parseFormBody(req, config.MAX_FORM_BYTES);
          }
        } catch (err) {
          res.setHeader('Connection', 'close'); // o restante do corpo, se houver, é descartado
          return ctx.render(413, 'Envio inválido', views.errorPage('Envio inválido', 'O conteúdo enviado é grande demais ou está em um formato inválido.'));
        }
        if (!security.csrfValid(sid || aid, ctx.body._csrf)) {
          return ctx.render(403, 'Requisição recusada', views.errorPage('Requisição recusada',
            'Não foi possível confirmar que este envio partiu do próprio Nexo (proteção contra CSRF). Recarregue a página e tente novamente.'));
        }
      }

      // ---- limite de frequência por usuário (mensagens, propostas, publicações) ----
      if (method === 'POST' && route.limit && user) {
        const wait = security.actionLimiters[route.limit].take(user.id);
        if (wait > 0) {
          const min = Math.ceil(wait / 60000);
          return ctx.render(429, 'Muitos envios', views.errorPage('Muitos envios em pouco tempo',
            `Por segurança, há um limite de envios por período. Tente novamente em ${min} ${min === 1 ? 'minuto' : 'minutos'}.`));
        }
      }

      return await route.handler(ctx);
    } catch (err) {
      console.error(err);
      if (res.headersSent) return res.end();
      res.writeHead(500, security.securityHeaders({ 'Content-Type': 'text/html; charset=utf-8' }));
      res.end(views.layout({ title: 'Erro', user: null, flash: null,
        body: views.errorPage('Algo deu errado', 'Ocorreu um erro inesperado. Tente novamente em instantes.') }));
    }
  });
}

function start(port = config.PORT) {
  const server = createApp();
  server.listen(port, () => {
    console.log(`Nexo rodando em http://localhost:${server.address().port}`);
    console.log('Contas de demonstração (senha: conta demo 2026): marina@example.com, rafael@example.com, juliana@example.com (freelancers); cliente@example.com, bruno@example.com (clientes)');
  });
  return server;
}

module.exports = { createApp, start };

if (require.main === module) start();
