'use strict';

// Banco de dados: usa o módulo nativo node:sqlite (disponível a partir do
// Node 22.5), mantendo o protótipo sem dependências de terceiros e sem
// necessidade de um servidor de banco de dados separado.
//
// Este módulo cria o esquema e aplica migrações leves, de modo que um banco
// criado por uma versão anterior do protótipo seja atualizado automaticamente
// na primeira execução da nova versão, sem perda de dados.

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const { DB_PATH } = require('./config');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('freelancer','cliente')),
    area TEXT DEFAULT '',
    bio TEXT DEFAULT '',
    avatar_url TEXT DEFAULT '',
    cover_url TEXT DEFAULT '',
    linkedin_url TEXT DEFAULT '',
    consent_at TEXT,
    privacy_version TEXT,
    deleted_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    price REAL,
    delivery_days INTEGER,
    keywords TEXT DEFAULT '',
    deleted_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS portfolio_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    image_url TEXT NOT NULL,
    title TEXT DEFAULT '',
    description TEXT DEFAULT '',
    deleted_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    budget_min REAL,
    budget_max REAL,
    deadline_days INTEGER,
    status TEXT NOT NULL DEFAULT 'aberto'
      CHECK(status IN ('aberto','em_andamento','concluido','encerrado')),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(client_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS proposals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    freelancer_id INTEGER NOT NULL,
    price REAL NOT NULL,
    delivery_days INTEGER NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'enviada'
      CHECK(status IN ('enviada','aceita','recusada','retirada')),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, freelancer_id),
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(freelancer_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    freelancer_id INTEGER NOT NULL,
    service_id INTEGER,
    project_id INTEGER,
    proposal_id INTEGER,
    title TEXT NOT NULL,
    requirements TEXT NOT NULL,
    price REAL,
    delivery_days INTEGER,
    status TEXT NOT NULL
      CHECK(status IN ('solicitado','em_andamento','entregue','concluido','recusado','cancelado')),
    revisions INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    accepted_at TEXT,
    delivered_at TEXT,
    completed_at TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(client_id) REFERENCES users(id),
    FOREIGN KEY(freelancer_id) REFERENCES users(id),
    FOREIGN KEY(service_id) REFERENCES services(id),
    FOREIGN KEY(project_id) REFERENCES projects(id),
    FOREIGN KEY(proposal_id) REFERENCES proposals(id)
  );

  CREATE TABLE IF NOT EXISTS order_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    actor_id INTEGER,
    event TEXT NOT NULL,
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL UNIQUE,
    client_id INTEGER NOT NULL,
    freelancer_id INTEGER NOT NULL,
    service_id INTEGER,
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    comment TEXT NOT NULL,
    reply TEXT,
    replied_at TEXT,
    published_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(order_id) REFERENCES orders(id),
    FOREIGN KEY(client_id) REFERENCES users(id),
    FOREIGN KEY(freelancer_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS client_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL UNIQUE,
    client_id INTEGER NOT NULL,
    freelancer_id INTEGER NOT NULL,
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    comment TEXT NOT NULL,
    published_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(order_id) REFERENCES orders(id),
    FOREIGN KEY(client_id) REFERENCES users(id),
    FOREIGN KEY(freelancer_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    freelancer_id INTEGER NOT NULL,
    service_id INTEGER,
    project_id INTEGER,
    order_id INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(client_id) REFERENCES users(id),
    FOREIGN KEY(freelancer_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    sender_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    read_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY(sender_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    used_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// ---------- Migrações leves (bancos de versões anteriores) ----------

function hasColumn(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
}

function addColumn(table, column, definition) {
  if (!hasColumn(table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

addColumn('users', 'avatar_url', "TEXT DEFAULT ''");
addColumn('users', 'cover_url', "TEXT DEFAULT ''");
addColumn('users', 'linkedin_url', "TEXT DEFAULT ''");
addColumn('users', 'consent_at', 'TEXT');
addColumn('users', 'privacy_version', 'TEXT');
addColumn('users', 'deleted_at', 'TEXT');
addColumn('services', 'keywords', "TEXT DEFAULT ''");
addColumn('services', 'delivery_days', 'INTEGER');
addColumn('services', 'deleted_at', 'TEXT');
addColumn('portfolio_items', 'deleted_at', 'TEXT');

// Avaliações passaram a ter publicação controlada (avaliação mútua). As
// avaliações gravadas por versões anteriores já eram públicas: ao criar a
// coluna, elas são marcadas como publicadas na data em que foram feitas.
if (!hasColumn('reviews', 'published_at')) {
  db.exec('ALTER TABLE reviews ADD COLUMN published_at TEXT');
  db.exec('UPDATE reviews SET published_at = created_at');
}

// Versões anteriores guardavam as mensagens numa tabela "messages" ligada só
// ao serviço, o que fazia um cliente enxergar as mensagens de outros clientes
// sobre o mesmo serviço. A nova estrutura organiza as mensagens em conversas
// privadas entre um cliente e um freelancer; as mensagens antigas são
// migradas uma única vez, agrupadas por serviço e por cliente.
const oldMessages = db.prepare(
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'messages'"
).get();
if (oldMessages) {
  db.exec('BEGIN');
  try {
    const rows = db.prepare(`
      SELECT m.*, s.user_id AS owner_id FROM messages m JOIN services s ON s.id = m.service_id
      ORDER BY m.created_at, m.id
    `).all();
    const findConv = db.prepare(
      'SELECT id FROM conversations WHERE client_id = ? AND freelancer_id = ? AND service_id = ? AND project_id IS NULL AND order_id IS NULL'
    );
    const insertConv = db.prepare(
      'INSERT INTO conversations (client_id, freelancer_id, service_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    );
    const insertMsg = db.prepare(
      'INSERT INTO chat_messages (conversation_id, sender_id, content, read_at, created_at) VALUES (?, ?, ?, ?, ?)'
    );
    for (const m of rows) {
      const clientId = m.sender_id === m.owner_id ? m.receiver_id : m.sender_id;
      let conv = findConv.get(clientId, m.owner_id, m.service_id);
      const convId = conv ? conv.id : insertConv.run(clientId, m.owner_id, m.service_id, m.created_at, m.created_at).lastInsertRowid;
      insertMsg.run(convId, m.sender_id, m.content, m.created_at, m.created_at);
    }
    db.exec('DROP TABLE messages');
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_services_user ON services(user_id);
  CREATE INDEX IF NOT EXISTS idx_services_category ON services(category);
  CREATE INDEX IF NOT EXISTS idx_orders_client ON orders(client_id);
  CREATE INDEX IF NOT EXISTS idx_orders_freelancer ON orders(freelancer_id);
  CREATE INDEX IF NOT EXISTS idx_reviews_freelancer ON reviews(freelancer_id);
  CREATE INDEX IF NOT EXISTS idx_reviews_service ON reviews(service_id);
  CREATE INDEX IF NOT EXISTS idx_client_reviews_client ON client_reviews(client_id);
  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_proposals_project ON proposals(project_id);
  CREATE INDEX IF NOT EXISTS idx_conv_client ON conversations(client_id);
  CREATE INDEX IF NOT EXISTS idx_conv_freelancer ON conversations(freelancer_id);
  CREATE INDEX IF NOT EXISTS idx_msgs_conv ON chat_messages(conversation_id);
`);

module.exports = db;
