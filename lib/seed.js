'use strict';

// Dados de demonstração, criados apenas quando o banco está vazio. Cobrem
// todas as funcionalidades (perfis com portfólio, serviços, pedidos em cada
// etapa, avaliações com resposta, projetos com propostas e conversas), para
// que a avaliação do protótipo possa ser feita sem cadastro manual prévio.
// Todos os nomes, empresas e textos são fictícios.

const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');
const db = require('./db');
const { hashPassword } = require('./auth');

const DEMO_PASSWORD = 'nexo2026';
const ASSETS = path.join(config.ROOT, 'seed-assets');

function ago(days, hours = 0) {
  return new Date(Date.now() - days * 86400000 - hours * 3600000).toISOString().replace('T', ' ').slice(0, 19);
}

function asset(name) {
  const src = path.join(ASSETS, name);
  if (!fs.existsSync(src)) return '';
  fs.mkdirSync(config.UPLOADS_DIR, { recursive: true });
  fs.copyFileSync(src, path.join(config.UPLOADS_DIR, `demo-${name}`));
  return `/uploads/demo-${name}`;
}

function seedIfEmpty() {
  if (db.prepare('SELECT COUNT(*) AS c FROM users').get().c > 0) return;
  const hash = hashPassword(DEMO_PASSWORD);
  db.exec('BEGIN');
  try {
    const insUser = db.prepare(`INSERT INTO users (name, email, password_hash, role, area, bio, avatar_url, cover_url, linkedin_url,
      consent_at, privacy_version, created_at) VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?)`);
    const u = {};
    const people = [
      ['marina', 'Marina Alves', 'marina@example.com', 'freelancer', 'Design Gráfico',
        'Designer gráfica formada em Design, com 6 anos de experiência em identidade visual para pequenos negócios. Trabalho com Illustrator e Figma e entrego manual de marca em todos os projetos.',
        'capa-marina.png', 'https://www.linkedin.com/in/exemplo-marina', 120],
      ['rafael', 'Rafael Souza', 'rafael@example.com', 'freelancer', 'Programação',
        'Desenvolvedor web full-stack (JavaScript, Node.js e PHP). Crio sites institucionais, painéis administrativos e faço manutenção de sistemas existentes.',
        'capa-rafael.png', 'https://www.linkedin.com/in/exemplo-rafael', 110],
      ['juliana', 'Juliana Prado', 'juliana@example.com', 'freelancer', 'Redação',
        'Redatora e revisora com foco em conteúdo para blogs, sites e redes sociais. Especialista em SEO e em textos de linguagem simples.',
        'capa-juliana.png', '', 100],
      ['lucas', 'Lucas Ferreira', 'lucas@example.com', 'freelancer', 'Audiovisual',
        'Editor de vídeo e motion designer. Vídeos institucionais, reels e animações curtas.', null, '', 40],
      ['cliente', 'Carla Mendes', 'cliente@example.com', 'cliente', '', 'Dona de uma loja de roupas on-line.', null, '', 90],
      ['bruno', 'Bruno Costa', 'bruno@example.com', 'cliente', '', 'Sócio de um escritório de contabilidade.', null, '', 95],
      ['ana', 'Ana Ribeiro', 'ana@example.com', 'cliente', '', 'Gestora de marketing de uma clínica odontológica.', null, '', 85],
    ];
    for (const [key, name, email, role, area, bio, cover, linkedin, days] of people) {
      u[key] = insUser.run(name, email, hash, role, area, bio, cover ? asset(cover) : '', linkedin, ago(days), '2026-09', ago(days)).lastInsertRowid;
    }

    const insPort = db.prepare('INSERT INTO portfolio_items (user_id, image_url, title, description, created_at) VALUES (?, ?, ?, ?, ?)');
    const portfolio = [
      ['marina', 'port-marina-1.png', 'Marca — Studio Fit', 'Logotipo e paleta para academia boutique.', 60],
      ['marina', 'port-marina-2.png', 'Marca — Café Aroma', 'Identidade visual completa com manual de marca.', 45],
      ['marina', 'port-marina-3.png', 'Marca — Verde Vivo', 'Logotipo para floricultura de bairro.', 20],
      ['rafael', 'port-rafael-1.png', 'Site — Contábil Silva', 'Site institucional responsivo com formulário de contato.', 70],
      ['rafael', 'port-rafael-2.png', 'Painel de vendas', 'Painel administrativo com relatórios de vendas.', 40],
      ['rafael', 'port-rafael-3.png', 'Site — Clínica Sorriso', 'Site com agendamento on-line.', 15],
      ['juliana', 'port-juliana-1.png', 'Artigo — Instagram para vendas', 'Artigo de 1.200 palavras otimizado para SEO.', 50],
      ['juliana', 'port-juliana-2.png', 'Guia — Planos de saúde', 'Guia em linguagem simples para operadora regional.', 30],
      ['juliana', 'port-juliana-3.png', 'Artigo — O que é SEO', 'Texto introdutório para blog de agência.', 12],
    ];
    for (const [key, file, title, desc, days] of portfolio) insPort.run(u[key], asset(file), title, desc, ago(days));

    const insSvc = db.prepare(`INSERT INTO services (user_id, title, description, category, price, delivery_days, keywords, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    const s = {};
    const svcs = [
      ['logo', 'marina', 'Criação de identidade visual completa', 'Logotipo em 3 propostas iniciais, paleta de cores, tipografia e manual de marca em PDF. Inclui 2 rodadas de ajustes e arquivos em PNG, SVG e PDF.', 'Design Gráfico', 800, 10, 'logotipo, identidade visual, branding, marca, manual de marca', 58],
      ['posts', 'marina', 'Pacote de 10 artes para redes sociais', 'Dez artes para Instagram e Facebook seguindo a identidade da sua marca, com textos fornecidos por você. Inclui 1 rodada de ajustes.', 'Design Gráfico', 350, 5, 'instagram, posts, redes sociais, artes, feed', 25],
      ['site', 'rafael', 'Desenvolvimento de site institucional', 'Site responsivo com até 5 páginas (início, sobre, serviços, contato e blog), formulário de contato e painel simples para editar textos. Hospedagem por conta do cliente.', 'Programação', 1500, 20, 'site, website, landing page, institucional, wordpress', 65],
      ['bugs', 'rafael', 'Correção de bugs e manutenção de sistemas web', 'Diagnóstico e correção de erros em sistemas web existentes (JavaScript, Node.js e PHP). Valor por pacote de até 5 horas de trabalho.', 'Programação', 150, 3, 'bug, manutenção, suporte técnico, correção, php, javascript', 30],
      ['seo', 'juliana', 'Redação de artigos para blog (SEO)', 'Artigo de até 1.200 palavras, com pesquisa de palavras-chave, título otimizado, meta descrição e revisão ortográfica.', 'Redação', 90, 4, 'SEO, blog, artigo, conteúdo, texto', 48],
      ['revisao', 'juliana', 'Revisão e adequação de textos de site', 'Revisão ortográfica e de estilo dos textos do seu site, com sugestões para linguagem mais clara e objetiva. Valor por até 10 páginas.', 'Redação', null, 7, 'revisão, textos, site, linguagem simples', 18],
      ['video', 'lucas', 'Vídeo institucional de até 60 segundos', 'Roteiro, edição, trilha livre de direitos e legendas. Você envia as imagens ou eu uso banco de imagens licenciado.', 'Audiovisual', 900, 12, 'vídeo, institucional, edição, reels, motion', 22],
    ];
    for (const [key, owner, title, desc, cat, price, dd, kw, days] of svcs) s[key] = insSvc.run(u[owner], title, desc, cat, price, dd, kw, ago(days)).lastInsertRowid;

    const insOrder = db.prepare(`INSERT INTO orders (client_id, freelancer_id, service_id, project_id, proposal_id, title, requirements, price,
      delivery_days, status, revisions, created_at, accepted_at, delivered_at, completed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insEv = db.prepare('INSERT INTO order_events (order_id, actor_id, event, note, created_at) VALUES (?, ?, ?, ?, ?)');
    const insRev = db.prepare(`INSERT INTO reviews (order_id, client_id, freelancer_id, service_id, rating, comment, reply, replied_at, created_at, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insCliRev = db.prepare(`INSERT INTO client_reviews (order_id, client_id, freelancer_id, rating, comment, created_at, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);

    // review: [nota, comentário, resposta, dias atrás, publicada?]
    // clientReview: [nota, comentário, dias atrás] — avaliação do cliente feita pelo freelancer
    function order({ client, free, svc, title, req, price, dd, status, revisions = 0, t0, events, review, clientReview }) {
      const times = { created: ago(t0) };
      const acc = events.find((e) => e[1] === 'aceito');
      const del = [...events].reverse().find((e) => e[1] === 'entregue');
      const done = events.find((e) => e[1] === 'concluido');
      const last = events[events.length - 1];
      const oid = insOrder.run(u[client], u[free], s[svc] || null, null, null, title, req, price, dd, status, revisions, times.created,
        acc ? ago(acc[3]) : null, del ? ago(del[3]) : null, done ? ago(done[3]) : null, ago(last[3])).lastInsertRowid;
      for (const [who, ev, note, d] of events) insEv.run(oid, who ? u[who] : null, ev, note, ago(d));
      const published = review && review[4] !== false;
      if (review) {
        insRev.run(oid, u[client], u[free], s[svc] || null, review[0], review[1], review[2] || null, review[2] ? ago(review[3] - 1) : null,
          ago(review[3]), published ? ago(review[3]) : null);
        insEv.run(oid, u[client], 'avaliado', '', ago(review[3]));
      }
      if (clientReview) {
        insCliRev.run(oid, u[client], u[free], clientReview[0], clientReview[1], ago(clientReview[2]), published ? ago(review[3]) : null);
        insEv.run(oid, u[free], 'avaliado_cliente', '', ago(clientReview[2]));
      }
      return oid;
    }

    order({ client: 'bruno', free: 'marina', svc: 'logo', title: 'Criação de identidade visual completa', price: 800, dd: 10, status: 'concluido', revisions: 1, t0: 40,
      req: 'Identidade visual para o escritório Costa Contabilidade: transmitir confiança, cores sóbrias (azul e cinza).',
      events: [['bruno', 'solicitado', '', 40], ['marina', 'aceito', '', 39], ['marina', 'entregue', 'Enviei as três propostas e o manual de marca pelo link combinado.', 31],
        ['bruno', 'revisao', 'Gostamos da proposta 2, mas queremos o azul um pouco mais escuro.', 30], ['marina', 'entregue', 'Ajuste feito, arquivos finais atualizados.', 28], ['bruno', 'concluido', '', 27]],
      review: [5, 'Excelente profissional: entendeu o que queríamos, entregou antes do prazo e fez o ajuste sem complicação. Recomendo.', 'Obrigada, Bruno! Foi ótimo trabalhar com vocês.', 26],
      clientReview: [5, 'Briefing claro, respostas rápidas e feedback objetivo na revisão. Cliente excelente.', 27] });
    order({ client: 'cliente', free: 'rafael', svc: 'site', title: 'Desenvolvimento de site institucional', price: 1500, dd: 20, status: 'concluido', t0: 55,
      req: 'Site para a minha loja de roupas, com página de catálogo e link para o WhatsApp.',
      events: [['cliente', 'solicitado', '', 55], ['rafael', 'aceito', '', 54], ['rafael', 'entregue', 'Site publicado no ambiente de testes; enviei o link por mensagem.', 36], ['cliente', 'concluido', '', 34]],
      review: [4, 'Site ficou bonito e rápido. A entrega atrasou dois dias, mas o Rafael avisou com antecedência.', null, 33],
      clientReview: [5, 'Enviou fotos e textos organizados e aprovou as etapas sem demora. Recomendo.', 34] });
    order({ client: 'ana', free: 'juliana', svc: 'seo', title: 'Redação de artigos para blog (SEO)', price: 90, dd: 4, status: 'concluido', t0: 25,
      req: 'Artigo sobre clareamento dental: mitos e verdades, para o blog da clínica.',
      events: [['ana', 'solicitado', '', 25], ['juliana', 'aceito', '', 25], ['juliana', 'entregue', 'Artigo entregue com sugestão de título e meta descrição.', 22], ['ana', 'concluido', '', 21]],
      review: [5, 'Texto claro, sem erros e com ótima pesquisa. Já contratei de novo.', 'Muito obrigada, Ana!', 20],
      clientReview: [4, 'Pedido bem explicado; a aprovação levou alguns dias a mais que o combinado.', 21] });
    order({ client: 'bruno', free: 'rafael', svc: 'bugs', title: 'Correção de bugs e manutenção de sistemas web', price: 150, dd: 3, status: 'concluido', t0: 18,
      req: 'O formulário de contato do site não está enviando e-mails.',
      events: [['bruno', 'solicitado', '', 18], ['rafael', 'aceito', '', 18], ['rafael', 'entregue', 'Corrigida a configuração do envio; testei com três mensagens.', 16], ['bruno', 'concluido', '', 16]],
      review: [5, 'Resolveu rápido e explicou o que tinha acontecido.', null, 15] });
    order({ client: 'cliente', free: 'marina', svc: 'posts', title: 'Pacote de 10 artes para redes sociais', price: 350, dd: 5, status: 'em_andamento', t0: 3,
      req: 'Artes para a coleção de primavera da loja, com fotos que vou enviar por mensagem.',
      events: [['cliente', 'solicitado', '', 3], ['marina', 'aceito', '', 2]] });
    order({ client: 'bruno', free: 'rafael', svc: 'bugs', title: 'Correção de bugs e manutenção de sistemas web', price: 150, dd: 3, status: 'entregue', t0: 4,
      req: 'A página de serviços do site está desalinhada no celular.',
      events: [['bruno', 'solicitado', '', 4], ['rafael', 'aceito', '', 4], ['rafael', 'entregue', 'Ajustei o CSS da página; confira no celular, por favor.', 0, 5]] });
    order({ client: 'cliente', free: 'juliana', svc: 'seo', title: 'Redação de artigos para blog (SEO)', price: 90, dd: 4, status: 'solicitado', t0: 0.5,
      req: 'Artigo "Como montar looks para o trabalho com poucas peças" para o blog da loja.',
      events: [['cliente', 'solicitado', '', 0.5]] });
    order({ client: 'ana', free: 'lucas', svc: 'video', title: 'Vídeo institucional de até 60 segundos', price: 900, dd: 12, status: 'cancelado', t0: 12,
      req: 'Vídeo para apresentar a clínica na recepção.',
      events: [['ana', 'solicitado', '', 12], ['ana', 'cancelado', 'Decidimos adiar o projeto para o próximo semestre.', 11]] });

    // Projetos e propostas
    const insProj = db.prepare(`INSERT INTO projects (client_id, title, description, category, budget_min, budget_max, deadline_days, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insProp = db.prepare(`INSERT INTO proposals (project_id, freelancer_id, price, delivery_days, message, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    const p1 = insProj.run(u.cliente, 'Landing page para lançamento de coleção', 'Preciso de uma landing page para o lançamento da coleção de verão da loja, com galeria de fotos, contagem regressiva e formulário para lista de espera. Tenho as fotos e os textos.', 'Programação', 600, 1200, 15, 'aberto', ago(2)).lastInsertRowid;
    insProp.run(p1, u.rafael, 950, 10, 'Olá, Carla! Já desenvolvi o site da sua loja, então conheço a identidade e o catálogo. Faço a landing page responsiva, com galeria, contagem regressiva e formulário integrado a uma planilha, em 10 dias.', 'enviada', ago(1, 5));
    insProp.run(p1, u.marina, 1100, 12, 'Posso criar o layout da landing page alinhado às artes da coleção que estou produzindo e entregar pronto para publicação, em parceria com um desenvolvedor da minha rede.', 'enviada', ago(1));
    insProj.run(u.bruno, 'Vídeo curto para redes sociais do escritório', 'Vídeo de 30 segundos explicando os serviços de contabilidade para MEI, para Instagram e LinkedIn.', 'Audiovisual', 300, 700, 20, 'aberto', ago(1));
    insProj.run(u.ana, 'Textos para as páginas de tratamentos da clínica', 'Reescrever os textos de 6 páginas de tratamentos odontológicos em linguagem simples, mantendo as informações técnicas corretas.', 'Redação', 400, 800, 10, 'aberto', ago(4));
    const p4 = insProj.run(u.ana, 'Revisão dos textos do site da clínica', 'Revisar ortografia e clareza dos textos das páginas institucionais (cerca de 8 páginas).', 'Redação', 200, 400, 7, 'em_andamento', ago(9)).lastInsertRowid;
    const prop4 = insProp.run(p4, u.juliana, 320, 6, 'Faço a revisão completa das 8 páginas, com comentários explicando cada ajuste e uma versão final pronta para publicar.', 'aceita', ago(8)).lastInsertRowid;
    const o4 = insOrder.run(u.ana, u.juliana, null, p4, prop4, 'Revisão dos textos do site da clínica', 'Revisar ortografia e clareza dos textos das páginas institucionais (cerca de 8 páginas).',
      320, 6, 'em_andamento', 0, ago(7), ago(7), null, null, ago(7)).lastInsertRowid;
    insEv.run(o4, u.ana, 'proposta_aceita', '', ago(7));

    // Pedido concluído recentemente, com avaliação mútua pendente: o cliente
    // já avaliou, mas a nota só será publicada quando a freelancer avaliar.
    order({ client: 'bruno', free: 'juliana', svc: 'revisao', title: 'Revisão e adequação de textos de site', price: 280, dd: 7, status: 'concluido', t0: 9,
      req: 'Revisar os textos das 6 páginas do site do escritório, com linguagem mais simples.',
      events: [['bruno', 'solicitado', '', 9], ['juliana', 'aceito', 'Valor combinado: R$ 280,00.', 9], ['juliana', 'entregue', 'Textos revisados enviados, com comentários explicando as mudanças.', 3], ['bruno', 'concluido', '', 2]],
      review: [5, 'Revisão cuidadosa e explicações muito úteis para a equipe.', null, 1.5, false] });

    // Conversas
    const insConv = db.prepare('INSERT INTO conversations (client_id, freelancer_id, service_id, project_id, order_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const insMsg = db.prepare('INSERT INTO chat_messages (conversation_id, sender_id, content, read_at, created_at) VALUES (?, ?, ?, ?, ?)');
    const c1 = insConv.run(u.cliente, u.marina, s.logo, null, null, ago(1), ago(0, 2)).lastInsertRowid;
    insMsg.run(c1, u.cliente, 'Oi, Marina! O pacote de identidade visual inclui versão do logo para bordado?', ago(1), ago(1));
    insMsg.run(c1, u.marina, 'Oi, Carla! Incluo sim uma versão simplificada, pensada para bordado e carimbo.', ago(0, 20), ago(0, 22));
    insMsg.run(c1, u.cliente, 'Perfeito. Assim que terminarmos as artes da coleção, contrato a identidade também.', null, ago(0, 2));
    const c2 = insConv.run(u.bruno, u.lucas, null, null, null, ago(0, 5), ago(0, 5)).lastInsertRowid;
    insMsg.run(c2, u.bruno, 'Olá, Lucas! Publiquei um projeto de vídeo curto para o escritório; se tiver interesse, envie uma proposta.', null, ago(0, 5));

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { seedIfEmpty, DEMO_PASSWORD };
