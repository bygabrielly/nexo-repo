'use strict';

// Camada de acesso a dados: todas as consultas ao banco ficam aqui, sempre
// como consultas preparadas (prepared statements), com os valores enviados
// separadamente do comando SQL — o que impede injeção de SQL. As demais
// camadas não escrevem SQL.

const db = require('./db');
const config = require('./config');

// Datas no mesmo formato do CURRENT_TIMESTAMP do SQLite (UTC), o que permite
// compará-las diretamente nas consultas.
const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const daysAgo = (d) => new Date(Date.now() - d * 86400000).toISOString().replace('T', ' ').slice(0, 19);

// ---------------------------------------------------------------- usuários
const users = {
  insert: db.prepare(`INSERT INTO users (name, email, password_hash, role, consent_at, privacy_version)
                      VALUES (?, ?, ?, ?, ?, ?)`),
  byEmail: db.prepare('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL'),
  byEmailAny: db.prepare('SELECT * FROM users WHERE email = ?'),
  byId: db.prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL'),
  updateProfile: db.prepare(`UPDATE users SET name = ?, area = ?, bio = ?, avatar_url = ?, cover_url = ?, linkedin_url = ?
                             WHERE id = ?`),
  updatePassword: db.prepare('UPDATE users SET password_hash = ? WHERE id = ?'),
  countFreelancers: db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'freelancer' AND deleted_at IS NULL"),
};

function createUser({ name, email, passwordHash, role, privacyVersion }) {
  return users.insert.run(name, email, passwordHash, role, now(), privacyVersion).lastInsertRowid;
}

// Exclusão de conta (LGPD, art. 18, VI): os dados pessoais são eliminados ou
// anonimizados. Pedidos e avaliações já concluídos são mantidos de forma
// anonimizada, pois também pertencem à outra parte envolvida.
function anonymizeUser(userId) {
  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE users SET name = 'Usuário removido', email = ?, password_hash = '!', area = '', bio = '',
                avatar_url = '', cover_url = '', linkedin_url = '', deleted_at = ? WHERE id = ?`)
      .run(`removido-${userId}@removido.invalid`, now(), userId);
    db.prepare('UPDATE services SET deleted_at = COALESCE(deleted_at, ?) WHERE user_id = ?').run(now(), userId);
    db.prepare('DELETE FROM portfolio_items WHERE user_id = ?').run(userId);
    db.prepare("UPDATE projects SET status = 'encerrado' WHERE client_id = ? AND status = 'aberto'").run(userId);
    db.prepare("UPDATE proposals SET status = 'retirada' WHERE freelancer_id = ? AND status = 'enviada'").run(userId);
    db.prepare(`UPDATE orders SET status = 'cancelado', updated_at = ? WHERE (client_id = ? OR freelancer_id = ?)
                AND status IN ('solicitado','em_andamento','entregue')`).run(now(), userId, userId);
    db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(userId);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// Portabilidade/acesso aos dados (LGPD, art. 18, II e V).
function exportUserData(userId) {
  const u = db.prepare(`SELECT id, name, email, role, area, bio, avatar_url, cover_url, linkedin_url,
                        consent_at, privacy_version, created_at FROM users WHERE id = ?`).get(userId);
  return {
    gerado_em: now(),
    titular: u,
    servicos: db.prepare('SELECT id, title, description, category, price, delivery_days, keywords, created_at, deleted_at FROM services WHERE user_id = ?').all(userId),
    portfolio: db.prepare('SELECT id, image_url, title, description, created_at, deleted_at FROM portfolio_items WHERE user_id = ?').all(userId),
    projetos: db.prepare('SELECT id, title, description, category, budget_min, budget_max, deadline_days, status, created_at FROM projects WHERE client_id = ?').all(userId),
    propostas: db.prepare('SELECT id, project_id, price, delivery_days, message, status, created_at FROM proposals WHERE freelancer_id = ?').all(userId),
    pedidos: db.prepare('SELECT id, title, requirements, price, delivery_days, status, created_at, completed_at FROM orders WHERE client_id = ? OR freelancer_id = ?').all(userId, userId),
    avaliacoes_feitas: [
      ...db.prepare("SELECT order_id, 'freelancer' AS avaliado, rating, comment, created_at, published_at FROM reviews WHERE client_id = ?").all(userId),
      ...db.prepare("SELECT order_id, 'cliente' AS avaliado, rating, comment, created_at, published_at FROM client_reviews WHERE freelancer_id = ?").all(userId),
    ],
    avaliacoes_recebidas: [
      ...db.prepare('SELECT order_id, rating, comment, reply, created_at, published_at FROM reviews WHERE freelancer_id = ?').all(userId),
      ...db.prepare('SELECT order_id, rating, comment, created_at, published_at FROM client_reviews WHERE client_id = ?').all(userId),
    ],
    mensagens_enviadas: db.prepare('SELECT conversation_id, content, created_at FROM chat_messages WHERE sender_id = ?').all(userId),
  };
}

// ---------------------------------------------------------------- serviços
const RATING_JOIN = `
  LEFT JOIN (SELECT service_id, AVG(rating) AS avg_rating, COUNT(*) AS review_count
             FROM reviews WHERE published_at IS NOT NULL GROUP BY service_id) r ON r.service_id = s.id`;

const SERVICE_COLS = `s.*, u.name AS provider_name, u.avatar_url AS provider_avatar,
  COALESCE(r.avg_rating, 0) AS avg_rating, COALESCE(r.review_count, 0) AS review_count`;

const services = {
  insert: db.prepare(`INSERT INTO services (user_id, title, description, category, price, delivery_days, keywords)
                      VALUES (?, ?, ?, ?, ?, ?, ?)`),
  update: db.prepare(`UPDATE services SET title = ?, description = ?, category = ?, price = ?, delivery_days = ?, keywords = ?
                      WHERE id = ? AND user_id = ? AND deleted_at IS NULL`),
  softDelete: db.prepare('UPDATE services SET deleted_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL'),
  restore: db.prepare('UPDATE services SET deleted_at = NULL WHERE id = ? AND user_id = ?'),
  byId: db.prepare(`SELECT ${SERVICE_COLS}, u.bio AS provider_bio FROM services s JOIN users u ON u.id = s.user_id ${RATING_JOIN}
                    WHERE s.id = ? AND s.deleted_at IS NULL AND u.deleted_at IS NULL`),
  byUser: db.prepare(`SELECT ${SERVICE_COLS} FROM services s JOIN users u ON u.id = s.user_id ${RATING_JOIN}
                      WHERE s.user_id = ? AND s.deleted_at IS NULL ORDER BY s.created_at DESC, s.id DESC`),
  deletedByUser: db.prepare('SELECT * FROM services WHERE user_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC'),
  recent: db.prepare(`SELECT ${SERVICE_COLS} FROM services s JOIN users u ON u.id = s.user_id ${RATING_JOIN}
                      WHERE s.deleted_at IS NULL AND u.deleted_at IS NULL ORDER BY s.created_at DESC, s.id DESC LIMIT 8`),
  count: db.prepare('SELECT COUNT(*) AS c FROM services WHERE deleted_at IS NULL'),
  countCategories: db.prepare('SELECT COUNT(DISTINCT category) AS c FROM services WHERE deleted_at IS NULL'),
};

function createService(userId, f) {
  return services.insert.run(userId, f.title, f.description, f.category, f.price, f.deliveryDays, f.keywords).lastInsertRowid;
}

// Busca com filtros combináveis e ordenação. Os critérios são sempre
// passados como parâmetros da consulta preparada, nunca concatenados ao SQL.
function searchServices({ q, category, minPrice, maxPrice, maxDays, minRating, sort, page, pageSize }) {
  let where = 'WHERE s.deleted_at IS NULL AND u.deleted_at IS NULL';
  const params = [];
  if (q) {
    where += ' AND (s.title LIKE ? OR s.description LIKE ? OR s.keywords LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (category) { where += ' AND s.category = ?'; params.push(category); }
  if (minPrice !== null) { where += ' AND s.price >= ?'; params.push(minPrice); }
  if (maxPrice !== null) { where += ' AND s.price <= ?'; params.push(maxPrice); }
  if (maxDays !== null) { where += ' AND s.delivery_days <= ?'; params.push(maxDays); }
  if (minRating !== null) { where += ' AND COALESCE(r.avg_rating, 0) >= ?'; params.push(minRating); }

  const orderBy = {
    recentes: 's.created_at DESC, s.id DESC',
    menor_preco: 's.price IS NULL, s.price ASC, s.id DESC',
    maior_preco: 's.price IS NULL, s.price DESC, s.id DESC',
    avaliacao: 'COALESCE(r.avg_rating, 0) DESC, COALESCE(r.review_count, 0) DESC, s.id DESC',
    prazo: 's.delivery_days IS NULL, s.delivery_days ASC, s.id DESC',
  }[sort] || 's.created_at DESC, s.id DESC';

  const from = `FROM services s JOIN users u ON u.id = s.user_id ${RATING_JOIN} ${where}`;
  const total = db.prepare(`SELECT COUNT(*) AS c ${from}`).get(...params).c;
  const rows = db.prepare(`SELECT ${SERVICE_COLS} ${from} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (page - 1) * pageSize);
  return { total, rows };
}

// ---------------------------------------------------------------- portfólio
const portfolio = {
  insert: db.prepare('INSERT INTO portfolio_items (user_id, image_url, title, description) VALUES (?, ?, ?, ?)'),
  byUser: db.prepare('SELECT * FROM portfolio_items WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC, id DESC'),
  deletedByUser: db.prepare('SELECT * FROM portfolio_items WHERE user_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC'),
  softDelete: db.prepare('UPDATE portfolio_items SET deleted_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL'),
  restore: db.prepare('UPDATE portfolio_items SET deleted_at = NULL WHERE id = ? AND user_id = ?'),
};

// ---------------------------------------------------------------- reputação
// Somente avaliações publicadas entram na reputação (ver publishReviews).
function freelancerStats(freelancerId) {
  const r = db.prepare('SELECT AVG(rating) AS avg, COUNT(*) AS n FROM reviews WHERE freelancer_id = ? AND published_at IS NOT NULL').get(freelancerId);
  const done = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE freelancer_id = ? AND status = 'concluido'").get(freelancerId).c;
  return { avgRating: r.avg || 0, reviewCount: r.n, completedOrders: done };
}

// Reputação do cliente (avaliado pelos freelancers), exibida a quem recebe
// um pedido ou analisa um projeto, como nas plataformas de mercado.
function clientStats(clientId) {
  const r = db.prepare('SELECT AVG(rating) AS avg, COUNT(*) AS n FROM client_reviews WHERE client_id = ? AND published_at IS NOT NULL').get(clientId);
  const done = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE client_id = ? AND status = 'concluido'").get(clientId).c;
  const since = db.prepare('SELECT created_at FROM users WHERE id = ?').get(clientId);
  return { avgRating: r.avg || 0, reviewCount: r.n, completedOrders: done, memberSince: since ? since.created_at : null };
}

const reviews = {
  insert: db.prepare(`INSERT INTO reviews (order_id, client_id, freelancer_id, service_id, rating, comment)
                      VALUES (?, ?, ?, ?, ?, ?)`),
  byOrder: db.prepare('SELECT * FROM reviews WHERE order_id = ?'),
  byId: db.prepare('SELECT * FROM reviews WHERE id = ?'),
  reply: db.prepare(`UPDATE reviews SET reply = ?, replied_at = ?
                     WHERE id = ? AND freelancer_id = ? AND reply IS NULL AND published_at IS NOT NULL`),
  byFreelancer: db.prepare(`SELECT r.*, u.name AS client_name, u.avatar_url AS client_avatar, o.title AS order_title
                            FROM reviews r JOIN users u ON u.id = r.client_id JOIN orders o ON o.id = r.order_id
                            WHERE r.freelancer_id = ? AND r.published_at IS NOT NULL
                            ORDER BY r.published_at DESC, r.id DESC`),
  byService: db.prepare(`SELECT r.*, u.name AS client_name, u.avatar_url AS client_avatar
                         FROM reviews r JOIN users u ON u.id = r.client_id
                         WHERE r.service_id = ? AND r.published_at IS NOT NULL
                         ORDER BY r.published_at DESC, r.id DESC LIMIT 10`),
};

const clientReviews = {
  insert: db.prepare('INSERT INTO client_reviews (order_id, client_id, freelancer_id, rating, comment) VALUES (?, ?, ?, ?, ?)'),
  byOrder: db.prepare('SELECT * FROM client_reviews WHERE order_id = ?'),
  byClient: db.prepare(`SELECT r.*, u.name AS freelancer_name, u.avatar_url AS freelancer_avatar, o.title AS order_title
                        FROM client_reviews r JOIN users u ON u.id = r.freelancer_id JOIN orders o ON o.id = r.order_id
                        WHERE r.client_id = ? AND r.published_at IS NOT NULL
                        ORDER BY r.published_at DESC, r.id DESC LIMIT ?`),
};

// Publicação das avaliações de um pedido: ocorre quando as duas partes já
// avaliaram (publicação simultânea) ou, para quem avaliou, quando o prazo de
// avaliação se encerra (publishExpiredReviews).
function publishOrderReviewsIfBoth(orderId) {
  const a = reviews.byOrder.get(orderId);
  const b = clientReviews.byOrder.get(orderId);
  if (!a || !b) return false;
  const t = now();
  db.prepare('UPDATE reviews SET published_at = ? WHERE order_id = ? AND published_at IS NULL').run(t, orderId);
  db.prepare('UPDATE client_reviews SET published_at = ? WHERE order_id = ? AND published_at IS NULL').run(t, orderId);
  return true;
}

// Prazo para avaliar: REVIEW_WINDOW_DAYS dias após a conclusão do pedido.
function reviewDeadline(order) {
  if (!order.completed_at) return null;
  const t = new Date(order.completed_at.replace(' ', 'T') + 'Z').getTime() + config.REVIEW_WINDOW_DAYS * 86400000;
  return new Date(t).toISOString().replace('T', ' ').slice(0, 19);
}
function reviewWindowOpen(order) {
  const d = reviewDeadline(order);
  return order.status === 'concluido' && d !== null && d > now();
}

const topFreelancers = db.prepare(`
  SELECT u.id, u.name, u.area, u.avatar_url, AVG(r.rating) AS avg_rating, COUNT(r.id) AS review_count
  FROM users u JOIN reviews r ON r.freelancer_id = u.id
  WHERE u.deleted_at IS NULL AND u.role = 'freelancer' AND r.published_at IS NOT NULL
  GROUP BY u.id ORDER BY avg_rating DESC, review_count DESC LIMIT 4`);

// ---------------------------------------------------------------- pedidos
const ORDER_COLS = `o.*, c.name AS client_name, c.avatar_url AS client_avatar,
  f.name AS freelancer_name, f.avatar_url AS freelancer_avatar`;

const orders = {
  insert: db.prepare(`INSERT INTO orders (client_id, freelancer_id, service_id, project_id, proposal_id, title, requirements,
                      price, delivery_days, status, accepted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  byId: db.prepare(`SELECT ${ORDER_COLS} FROM orders o JOIN users c ON c.id = o.client_id JOIN users f ON f.id = o.freelancer_id
                    WHERE o.id = ?`),
  forUser: db.prepare(`SELECT ${ORDER_COLS} FROM orders o JOIN users c ON c.id = o.client_id JOIN users f ON f.id = o.freelancer_id
                       WHERE o.client_id = ? OR o.freelancer_id = ? ORDER BY o.updated_at DESC, o.id DESC`),
  events: db.prepare(`SELECT e.*, u.name AS actor_name FROM order_events e LEFT JOIN users u ON u.id = e.actor_id
                      WHERE e.order_id = ? ORDER BY e.created_at, e.id`),
  insertEvent: db.prepare('INSERT INTO order_events (order_id, actor_id, event, note) VALUES (?, ?, ?, ?)'),
  pendingFor: db.prepare(`SELECT COUNT(*) AS c FROM orders WHERE
                          (freelancer_id = ? AND status = 'solicitado') OR (client_id = ? AND status = 'entregue')`),
  countDone: db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status = 'concluido'"),
};

function createOrder(o) {
  const id = orders.insert.run(o.clientId, o.freelancerId, o.serviceId || null, o.projectId || null, o.proposalId || null,
    o.title, o.requirements, o.price, o.deliveryDays, o.status, o.status === 'em_andamento' ? now() : null).lastInsertRowid;
  return id;
}

// Transição de estado do pedido: atualiza o status (somente se o estado atual
// for o esperado, o que evita transições concorrentes ou fora de ordem) e
// registra o evento no histórico. Retorna false se a transição não se aplica.
function transitionOrder(orderId, fromStatuses, toStatus, actorId, event, note, extraSql = '', extraParams = []) {
  const placeholders = fromStatuses.map(() => '?').join(',');
  const info = db.prepare(`UPDATE orders SET status = ?, updated_at = ? ${extraSql} WHERE id = ? AND status IN (${placeholders})`)
    .run(toStatus, now(), ...extraParams, orderId, ...fromStatuses);
  if (info.changes !== 1) return false;
  orders.insertEvent.run(orderId, actorId, event, note || '');
  return true;
}

// ---------------------------------------------------------------- tarefas por tempo
// Regras que dependem da passagem do tempo. Como o protótipo não usa um
// agendador externo, elas são executadas pelo próprio servidor, no máximo uma
// vez por minuto, antes de atender uma requisição (server.js).
function autoCompleteDeliveredOrders() {
  const due = db.prepare("SELECT id, project_id FROM orders WHERE status = 'entregue' AND delivered_at <= ?")
    .all(daysAgo(config.AUTO_COMPLETE_DAYS));
  let n = 0;
  for (const o of due) {
    const ok = transitionOrder(o.id, ['entregue'], 'concluido', null, 'concluido_auto',
      `Sem resposta do cliente em ${config.AUTO_COMPLETE_DAYS} dias após a entrega.`, ', completed_at = ?', [now()]);
    if (ok) {
      n += 1;
      if (o.project_id) projects.setStatus.run('concluido', o.project_id, 'em_andamento');
    }
  }
  return n;
}

function publishExpiredReviews() {
  const limit = daysAgo(config.REVIEW_WINDOW_DAYS);
  const t = now();
  const a = db.prepare(`UPDATE reviews SET published_at = ? WHERE published_at IS NULL
                        AND order_id IN (SELECT id FROM orders WHERE completed_at <= ?)`).run(t, limit).changes;
  const b = db.prepare(`UPDATE client_reviews SET published_at = ? WHERE published_at IS NULL
                        AND order_id IN (SELECT id FROM orders WHERE completed_at <= ?)`).run(t, limit).changes;
  return a + b;
}

function runScheduledTasks() {
  return { autoCompleted: autoCompleteDeliveredOrders(), reviewsPublished: publishExpiredReviews() };
}

// ---------------------------------------------------------------- projetos e propostas
const PROJECT_COLS = `p.*, u.name AS client_name, u.avatar_url AS client_avatar,
  (SELECT COUNT(*) FROM proposals x WHERE x.project_id = p.id AND x.status IN ('enviada','aceita')) AS proposal_count`;

const projects = {
  insert: db.prepare(`INSERT INTO projects (client_id, title, description, category, budget_min, budget_max, deadline_days)
                      VALUES (?, ?, ?, ?, ?, ?, ?)`),
  byId: db.prepare(`SELECT ${PROJECT_COLS} FROM projects p JOIN users u ON u.id = p.client_id WHERE p.id = ?`),
  byClient: db.prepare(`SELECT ${PROJECT_COLS} FROM projects p JOIN users u ON u.id = p.client_id
                        WHERE p.client_id = ? ORDER BY p.created_at DESC, p.id DESC`),
  setStatus: db.prepare('UPDATE projects SET status = ? WHERE id = ? AND status = ?'),
  recentOpen: db.prepare(`SELECT ${PROJECT_COLS} FROM projects p JOIN users u ON u.id = p.client_id
                          WHERE p.status = 'aberto' AND u.deleted_at IS NULL ORDER BY p.created_at DESC, p.id DESC LIMIT 4`),
};

function searchProjects({ q, category, minBudget = null, sort = 'recentes', page, pageSize }) {
  let where = "WHERE p.status = 'aberto' AND u.deleted_at IS NULL";
  const params = [];
  if (q) { where += ' AND (p.title LIKE ? OR p.description LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  if (category) { where += ' AND p.category = ?'; params.push(category); }
  // Orçamento: considera o valor máximo que o cliente se dispõe a pagar.
  if (minBudget !== null) { where += ' AND COALESCE(p.budget_max, p.budget_min) >= ?'; params.push(minBudget); }
  const orderBy = {
    recentes: 'p.created_at DESC, p.id DESC',
    maior_orcamento: 'COALESCE(p.budget_max, p.budget_min) IS NULL, COALESCE(p.budget_max, p.budget_min) DESC, p.id DESC',
    menos_propostas: 'proposal_count ASC, p.created_at DESC, p.id DESC',
  }[sort] || 'p.created_at DESC, p.id DESC';
  const from = `FROM projects p JOIN users u ON u.id = p.client_id ${where}`;
  const total = db.prepare(`SELECT COUNT(*) AS c ${from}`).get(...params).c;
  const rows = db.prepare(`SELECT ${PROJECT_COLS} ${from} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (page - 1) * pageSize);
  return { total, rows };
}

const proposals = {
  insert: db.prepare('INSERT INTO proposals (project_id, freelancer_id, price, delivery_days, message) VALUES (?, ?, ?, ?, ?)'),
  byId: db.prepare(`SELECT x.*, p.client_id, p.status AS project_status, p.title AS project_title, p.description AS project_description
                    FROM proposals x JOIN projects p ON p.id = x.project_id WHERE x.id = ?`),
  byProject: db.prepare(`SELECT x.*, u.name AS freelancer_name, u.avatar_url AS freelancer_avatar, u.area AS freelancer_area
                         FROM proposals x JOIN users u ON u.id = x.freelancer_id
                         WHERE x.project_id = ? ORDER BY x.created_at, x.id`),
  mine: db.prepare('SELECT * FROM proposals WHERE project_id = ? AND freelancer_id = ?'),
  byFreelancer: db.prepare(`SELECT x.*, p.title AS project_title, p.status AS project_status, u.name AS client_name
                            FROM proposals x JOIN projects p ON p.id = x.project_id JOIN users u ON u.id = p.client_id
                            WHERE x.freelancer_id = ? ORDER BY x.created_at DESC, x.id DESC`),
  setStatus: db.prepare('UPDATE proposals SET status = ? WHERE id = ? AND status = ?'),
  resend: db.prepare("UPDATE proposals SET price = ?, delivery_days = ?, message = ?, status = 'enviada', created_at = ? WHERE id = ? AND status = 'retirada'"),
  rejectOthers: db.prepare("UPDATE proposals SET status = 'recusada' WHERE project_id = ? AND id != ? AND status = 'enviada'"),
};

// Aceite de proposta: operação atômica que cria o pedido, marca a proposta
// como aceita, recusa as demais e muda o projeto para "em andamento".
function acceptProposal(proposal, clientId) {
  db.exec('BEGIN');
  try {
    const ok = proposals.setStatus.run('aceita', proposal.id, 'enviada').changes === 1 &&
      projects.setStatus.run('em_andamento', proposal.project_id, 'aberto').changes === 1;
    if (!ok) { db.exec('ROLLBACK'); return null; }
    proposals.rejectOthers.run(proposal.project_id, proposal.id);
    const orderId = createOrder({
      clientId, freelancerId: proposal.freelancer_id, projectId: proposal.project_id, proposalId: proposal.id,
      title: proposal.project_title, requirements: proposal.project_description,
      price: proposal.price, deliveryDays: proposal.delivery_days, status: 'em_andamento',
    });
    orders.insertEvent.run(orderId, clientId, 'proposta_aceita', '');
    db.exec('COMMIT');
    return orderId;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// ---------------------------------------------------------------- conversas
const conversations = {
  find: db.prepare(`SELECT * FROM conversations WHERE client_id = ? AND freelancer_id = ?
                    AND IFNULL(service_id, 0) = ? AND IFNULL(project_id, 0) = ? AND IFNULL(order_id, 0) = ?`),
  insert: db.prepare('INSERT INTO conversations (client_id, freelancer_id, service_id, project_id, order_id) VALUES (?, ?, ?, ?, ?)'),
  byId: db.prepare(`SELECT cv.*, c.name AS client_name, c.avatar_url AS client_avatar, f.name AS freelancer_name,
                    f.avatar_url AS freelancer_avatar, s.title AS service_title, p.title AS project_title, o.title AS order_title
                    FROM conversations cv JOIN users c ON c.id = cv.client_id JOIN users f ON f.id = cv.freelancer_id
                    LEFT JOIN services s ON s.id = cv.service_id LEFT JOIN projects p ON p.id = cv.project_id
                    LEFT JOIN orders o ON o.id = cv.order_id WHERE cv.id = ?`),
  forUser: db.prepare(`
    SELECT cv.*, c.name AS client_name, c.avatar_url AS client_avatar, f.name AS freelancer_name, f.avatar_url AS freelancer_avatar,
      s.title AS service_title, p.title AS project_title, o.title AS order_title,
      (SELECT content FROM chat_messages m WHERE m.conversation_id = cv.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_content,
      (SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id = cv.id AND m.sender_id != ? AND m.read_at IS NULL) AS unread
    FROM conversations cv JOIN users c ON c.id = cv.client_id JOIN users f ON f.id = cv.freelancer_id
    LEFT JOIN services s ON s.id = cv.service_id LEFT JOIN projects p ON p.id = cv.project_id
    LEFT JOIN orders o ON o.id = cv.order_id
    WHERE (cv.client_id = ? OR cv.freelancer_id = ?)
      AND EXISTS (SELECT 1 FROM chat_messages m WHERE m.conversation_id = cv.id)
    ORDER BY cv.updated_at DESC, cv.id DESC`),
  touch: db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?'),
};

const messages = {
  insert: db.prepare('INSERT INTO chat_messages (conversation_id, sender_id, content) VALUES (?, ?, ?)'),
  byConversation: db.prepare(`SELECT m.*, u.name AS sender_name, u.avatar_url AS sender_avatar FROM chat_messages m
                              JOIN users u ON u.id = m.sender_id WHERE m.conversation_id = ? ORDER BY m.created_at, m.id`),
  markRead: db.prepare('UPDATE chat_messages SET read_at = ? WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL'),
  unreadFor: db.prepare(`SELECT COUNT(*) AS c FROM chat_messages m JOIN conversations cv ON cv.id = m.conversation_id
                         WHERE (cv.client_id = ? OR cv.freelancer_id = ?) AND m.sender_id != ? AND m.read_at IS NULL`),
};

function findOrCreateConversation({ clientId, freelancerId, serviceId = null, projectId = null, orderId = null }) {
  const found = conversations.find.get(clientId, freelancerId, serviceId || 0, projectId || 0, orderId || 0);
  if (found) return found.id;
  return conversations.insert.run(clientId, freelancerId, serviceId, projectId, orderId).lastInsertRowid;
}

function sendMessage(conversationId, senderId, content) {
  messages.insert.run(conversationId, senderId, content);
  conversations.touch.run(now(), conversationId);
}

// ---------------------------------------------------------------- redefinição de senha
const resets = {
  insert: db.prepare('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)'),
  byHash: db.prepare('SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL'),
  use: db.prepare('UPDATE password_resets SET used_at = ? WHERE id = ? AND used_at IS NULL'),
  invalidateUser: db.prepare('UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL'),
};

module.exports = {
  db, now, daysAgo,
  users, createUser, anonymizeUser, exportUserData,
  services, createService, searchServices,
  portfolio,
  reviews, clientReviews, freelancerStats, clientStats, topFreelancers,
  publishOrderReviewsIfBoth, reviewDeadline, reviewWindowOpen, runScheduledTasks,
  orders, createOrder, transitionOrder,
  projects, searchProjects, proposals, acceptProposal,
  conversations, messages, findOrCreateConversation, sendMessage,
  resets,
};
