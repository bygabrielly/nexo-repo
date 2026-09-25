'use strict';

// Aviso de mensagens não lidas e migração de bancos da primeira versão.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { startServer, Browser } = require('./helpers');

let app;
before(async () => { app = await startServer(); });
after(async () => { await app.close(); });

const badgeMensagens = (html) => {
  const m = html.match(/href="\/mensagens"[^>]*>Mensagens(?: <span class="nav-badge"[^>]*>(\d+)<\/span>)?/);
  return m && m[1] ? Number(m[1]) : 0;
};

test('T69 — Mensagens não lidas: contador no menu, marcação como lida ao abrir e novo aviso a cada mensagem', async () => {
  const marina = new Browser(app.base);
  await marina.login('marina@example.com');
  assert.equal(badgeMensagens((await marina.get('/')).body), 1, 'a última mensagem de Carla ainda não foi lida');
  const caixa = await marina.get('/mensagens');
  assert.match(caixa.body, /Carla Mendes/);
  await marina.get('/mensagens/1');
  assert.equal(badgeMensagens((await marina.get('/')).body), 0, 'ao abrir a conversa, as mensagens são marcadas como lidas');
  const carla = new Browser(app.base);
  await carla.login('cliente@example.com');
  assert.equal((await carla.post('/mensagens/1', { content: 'Pode me enviar um orçamento para a versão bordada?' }, { from: '/mensagens/1' })).status, 302);
  assert.equal(badgeMensagens((await marina.get('/')).body), 1, 'nova mensagem gera novo aviso');
});

test('T71 — Migração: mensagens de um banco da primeira versão viram conversas privadas por cliente', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-migracao-'));
  const dbPath = path.join(dir, 'v1.sqlite');
  // Esquema da primeira versão: mensagens ligadas apenas ao serviço.
  const v1 = new DatabaseSync(dbPath);
  v1.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL, role TEXT NOT NULL, area TEXT DEFAULT '', bio TEXT DEFAULT '',
      avatar_url TEXT DEFAULT '', cover_url TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE services (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, title TEXT NOT NULL,
      description TEXT NOT NULL, category TEXT NOT NULL, price REAL, keywords TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, service_id INTEGER NOT NULL, sender_id INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL, content TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO users (name, email, password_hash, role) VALUES
      ('Freela', 'f@x.com', 'x', 'freelancer'), ('Cliente A', 'a@x.com', 'x', 'cliente'), ('Cliente B', 'b@x.com', 'x', 'cliente');
    INSERT INTO services (user_id, title, description, category, price) VALUES (1, 'Logo', 'Criação de logotipo', 'Design Gráfico', 500);
    INSERT INTO messages (service_id, sender_id, receiver_id, content) VALUES
      (1, 2, 1, 'Pergunta do cliente A'), (1, 1, 2, 'Resposta para A'), (1, 3, 1, 'Pergunta do cliente B');
  `);
  v1.close();

  // Abre o banco antigo com a versão atual (a migração roda na inicialização).
  const r = spawnSync(process.execPath, ['-e', "require('./lib/db')"], {
    cwd: path.join(__dirname, '..'), env: { ...process.env, DB_PATH: dbPath }, encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);

  const db = new DatabaseSync(dbPath);
  const tabelaAntiga = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'messages'").get();
  assert.equal(tabelaAntiga, undefined, 'tabela antiga removida');
  const convs = db.prepare('SELECT id, client_id, freelancer_id, service_id FROM conversations ORDER BY client_id').all();
  assert.equal(convs.length, 2, 'uma conversa por cliente');
  assert.deepEqual(convs.map((c) => [c.client_id, c.freelancer_id, c.service_id]), [[2, 1, 1], [3, 1, 1]]);
  const daA = db.prepare('SELECT content FROM chat_messages WHERE conversation_id = ? ORDER BY id').all(convs[0].id).map((m) => m.content);
  const daB = db.prepare('SELECT content FROM chat_messages WHERE conversation_id = ? ORDER BY id').all(convs[1].id).map((m) => m.content);
  assert.deepEqual(daA, ['Pergunta do cliente A', 'Resposta para A']);
  assert.deepEqual(daB, ['Pergunta do cliente B'], 'o cliente B não recebe as mensagens do cliente A');
  db.close();
});
