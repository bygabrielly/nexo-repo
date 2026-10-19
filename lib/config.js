'use strict';

// Configuração central do protótipo. Os valores podem ser sobrescritos por
// variáveis de ambiente — o que permite, por exemplo, que a suíte de testes
// automatizados use um banco de dados e uma pasta de uploads temporários,
// sem interferir nos dados de demonstração.

const path = require('node:path');

const ROOT = path.join(__dirname, '..');

module.exports = {
  ROOT,
  PORT: Number(process.env.PORT || 3000),
  DB_PATH: process.env.DB_PATH || path.join(ROOT, 'data', 'database.sqlite'),
  // Imagens enviadas: guardadas fora da pasta pública (public/) e entregues apenas
  // pela rota /uploads/, que só serve imagens (ver serveStatic em server.js).
  UPLOADS_DIR: process.env.UPLOADS_DIR || path.join(ROOT, 'data', 'uploads'),
  LEGACY_UPLOADS_DIR: path.join(ROOT, 'public', 'uploads'),
  OUTBOX_DIR: process.env.OUTBOX_DIR || path.join(ROOT, 'data', 'outbox'),
  PUBLIC_DIR: path.join(ROOT, 'public'),

  // Cookie de sessão com o atributo Secure: deve ser ativado (COOKIE_SECURE=1)
  // sempre que o sistema for servido por HTTPS. Em execução local (HTTP), o
  // atributo impediria o navegador de enviar o cookie.
  COOKIE_SECURE: process.env.COOKIE_SECURE === '1',

  // Sessões: expiram após 2 h sem uso ou 12 h após o login, o que ocorrer antes.
  SESSION_IDLE_MS: 2 * 60 * 60 * 1000,
  SESSION_ABSOLUTE_MS: 12 * 60 * 60 * 1000,

  // Proteção contra força bruta (ver LoginThrottle em lib/security.js): 5 falhas em
  // 15 min bloqueiam a combinação conta + origem por 15 min; 20 falhas bloqueiam a
  // origem; por conta, a partir da 5ª falha, a espera entre tentativas cresce até 60 s.
  LOGIN_MAX_FAILURES: 5,
  LOGIN_IP_MAX_FAILURES: 20,
  LOGIN_MAX_DELAY_MS: 60 * 1000,
  LOGIN_WINDOW_MS: 15 * 60 * 1000,
  LOGIN_LOCK_MS: 15 * 60 * 1000,

  // Recuperação de senha: link válido por 30 minutos, uso único.
  RESET_TOKEN_TTL_MS: 30 * 60 * 1000,

  MAX_IMAGE_BYTES: 3 * 1024 * 1024,
  MAX_FORM_BYTES: 1024 * 1024,
  MAX_MULTIPART_BYTES: 8 * 1024 * 1024,

  // Versão da política de privacidade aceita no cadastro (LGPD, art. 8º).
  PRIVACY_VERSION: '2026-10',

  // Limite de frequência por usuário (janela deslizante).
  RATE_LIMITS: {
    mensagens: { max: 30, windowMs: 10 * 60 * 1000 },   // 30 mensagens a cada 10 min
    propostas: { max: 10, windowMs: 60 * 60 * 1000 },   // 10 propostas por hora
    publicacoes: { max: 10, windowMs: 60 * 60 * 1000 }, // 10 serviços ou projetos novos por hora
  },

  // Imagens enviadas: dimensões máximas (evita imagens gigantes que consomem memória
  // ao serem exibidas) e cookie de dispositivo conhecido (180 dias).
  MAX_IMAGE_SIDE: 4000,
  MAX_PORTFOLIO_ITEMS: 24, // itens ativos por freelancer
  DEVICE_COOKIE_MAX_AGE: 180 * 24 * 60 * 60,

  PAGE_SIZE: 12,

  // Avaliações mútuas: cada parte tem 14 dias após a conclusão para avaliar a
  // outra. As avaliações só se tornam públicas quando as duas partes avaliam
  // ou quando o prazo termina, o que evita avaliações "de retaliação".
  REVIEW_WINDOW_DAYS: 14,

  // Conclusão automática: se o cliente não aprovar nem pedir ajustes em até
  // 3 dias após a entrega, o pedido é concluído automaticamente.
  AUTO_COMPLETE_DAYS: 3,

  // Intervalo mínimo entre execuções das tarefas por tempo (conclusão
  // automática e publicação de avaliações com prazo encerrado).
  SCHEDULED_TASKS_INTERVAL_MS: 60 * 1000,
};
