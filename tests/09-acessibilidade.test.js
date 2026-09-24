'use strict';

// Verificações automáticas de acessibilidade (WCAG 2.2) sobre o HTML real de
// todas as páginas principais, para visitante, cliente e freelancer.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, Browser } = require('./helpers');

let app;
before(async () => { app = await startServer(); });
after(async () => { await app.close(); });

const PAGES = {
  visitante: ['/', '/servicos', '/servicos/1', '/freelancers/1', '/projetos', '/projetos/1', '/cadastro', '/login', '/recuperar-senha', '/ajuda', '/privacidade'],
  'cliente@example.com': ['/', '/servicos/1', '/pedidos', '/pedidos/2', '/pedidos/7', '/meus-projetos', '/projetos/novo', '/projetos/1', '/mensagens', '/mensagens/1', '/perfil', '/perfil/editar', '/conta'],
  'marina@example.com': ['/meus-servicos', '/servicos/novo', '/servicos/1/editar', '/perfil/portfolio', '/pedidos/1', '/pedidos/5', '/perfil', '/freelancers/1', '/minhas-propostas', '/projetos/1'],
  'juliana@example.com': ['/pedidos/10', '/pedidos/7'],
  'bruno@example.com': ['/pedidos/10', '/pedidos/6'],
};

function checkPage(html, url) {
  const problems = [];
  if (!/<html lang="pt-BR">/.test(html)) problems.push('idioma da página não declarado');
  const h1 = (html.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) problems.push(`esperado 1 título <h1>, encontrados ${h1}`);
  if (!/class="skip-link" href="#conteudo"/.test(html)) problems.push('sem link para pular ao conteúdo');
  for (const img of html.match(/<img\b[^>]*>/g) || []) {
    if (!/\balt="/.test(img)) problems.push(`imagem sem texto alternativo: ${img.slice(0, 80)}`);
  }
  const ids = new Set([...html.matchAll(/<label[^>]*\bfor="([^"]+)"/g)].map((m) => m[1]));
  for (const field of html.match(/<(input|select|textarea)\b[^>]*>/g) || []) {
    if (/type="(hidden|submit|button)"/.test(field)) continue;
    const id = (field.match(/\bid="([^"]+)"/) || [])[1];
    const wrapped = /type="(radio|checkbox)"/.test(field); // rótulo envolvendo o campo
    if (!(id && ids.has(id)) && !/aria-label=/.test(field) && !wrapped) problems.push(`campo sem rótulo: ${field.slice(0, 80)}`);
  }
  for (const btn of html.match(/<button\b[^>]*>([\s\S]*?)<\/button>/g) || []) {
    if (!btn.replace(/<[^>]+>/g, '').trim()) problems.push(`botão sem texto: ${btn.slice(0, 80)}`);
  }
  if (problems.length) return `${url}: ${problems.join('; ')}`;
  return null;
}

test('T58 — Acessibilidade estrutural (WCAG 1.1.1, 1.3.1, 2.4.1, 3.1.1, 4.1.2) em 38 páginas, para os três perfis de acesso', async () => {
  const failures = [];
  let checked = 0;
  for (const [who, urls] of Object.entries(PAGES)) {
    const b = new Browser(app.base);
    if (who !== 'visitante') await b.login(who);
    for (const url of urls) {
      const r = await b.get(url);
      assert.equal(r.status, 200, `${who} ${url}`);
      const f = checkPage(r.body, url);
      if (f) failures.push(`[${who}] ${f}`);
      checked += 1;
    }
  }
  assert.equal(checked, 38);
  assert.deepEqual(failures, []);
});

// ---------- Contraste (WCAG 1.4.3) calculado a partir das cores reais do CSS ----------
const fs = require('node:fs');
const path = require('node:path');

function luminance(hex) {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

// Pares texto/fundo efetivamente usados na interface.
const CONTRAST_PAIRS = [
  ['Texto principal sobre o fundo da página', '--text', '--bg'],
  ['Texto principal sobre cartões', '--text', '--card-bg'],
  ['Texto secundário sobre cartões', '--muted', '--card-bg'],
  ['Texto secundário sobre o fundo da página', '--muted', '--bg'],
  ['Texto branco sobre botão primário', '#ffffff', '--primary'],
  ['Links (primary-dark) sobre cartões', '--primary-dark', '--card-bg'],
  ['Rótulo de categoria e avisos (primary-dark sobre primary-light)', '--primary-dark', '--primary-light'],
  ['Mensagens de erro e aviso de prazo vencido sobre fundo de erro', '--danger', '#fbeceb'],
  ['Texto branco sobre botão de exclusão', '#ffffff', '--danger'],
  ['Contador de pendências (branco sobre vermelho)', '#ffffff', '--danger'],
  ['Status "aguardando" (#8a4b00 sobre #fff4e5)', '#8a4b00', '#fff4e5'],
  ['Status "em andamento" (#1c4f94 sobre #e8f1fd)', '#1c4f94', '#e8f1fd'],
  ['Status "concluído" (#1e6b3d sobre #e9f7ef)', '#1e6b3d', '#e9f7ef'],
  ['Status "encerrado" (#5b5566 sobre #f1f0f3)', '#5b5566', '#f1f0f3'],
  ['Aviso de sucesso (#1e7a45 sobre #e9f7ef)', '#1e7a45', '#e9f7ef'],
];

test('T59 — Contraste mínimo de 4,5:1 (WCAG 1.4.3, nível AA) em todos os pares de cor de texto da interface', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');
  const vars = Object.fromEntries([...css.matchAll(/(--[a-z-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
  const color = (c) => (c.startsWith('--') ? vars[c] : c);
  const results = CONTRAST_PAIRS.map(([label, fg, bg]) => ({ label, fg: color(fg), bg: color(bg), ratio: ratio(color(fg), color(bg)) }));
  const outDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'contraste.json'), JSON.stringify(results, null, 2));
  const below = results.filter((r) => r.ratio < 4.5).map((r) => `${r.label}: ${r.ratio.toFixed(2)}:1`);
  assert.deepEqual(below, []);
});
