'use strict';

// Métricas de manutenibilidade do código-fonte do protótipo, calculadas apenas
// com módulos nativos (sem ferramentas externas):
//  1. dependências entre módulos: quem importa quem (require), dependências
//     circulares e violações da organização em camadas;
//  2. tamanho: linhas de código por módulo (sem linhas em branco e comentários);
//  3. complexidade ciclomática de cada função, aproximada pela contagem de pontos
//     de decisão (if, for, while, case, catch, &&, ||, ?? e o operador ternário),
//     mais um — o mesmo critério de McCabe usado por ferramentas como o ESLint;
//  4. duplicação: blocos de 6 ou mais linhas significativas idênticas (após
//     remover espaços) que aparecem em mais de um lugar.
// Os testes, os scripts auxiliares e os diagramas não entram na medição.
//
// Uso: node scripts/manutenibilidade.js

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const LIMITE_CC = 10;   // limite usual de complexidade por função (McCabe)
const JANELA = 6;       // linhas mínimas de um bloco duplicado

const arquivos = ['server.js', 'public/app.js',
  ...['lib', 'routes', 'views'].flatMap((d) => fs.readdirSync(path.join(ROOT, d))
    .filter((f) => f.endsWith('.js')).sort().map((f) => `${d}/${f}`))];

// ------------------------------------------------------------- análise léxica
const PUNCT3 = new Set(['===', '!==', '...', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=']);
const PUNCT2 = new Set(['=>', '&&', '||', '??', '?.', '==', '!=', '<=', '>=', '++', '--', '+=', '-=', '*=', '/=', '%=', '**', '<<', '>>', '&=', '|=', '^=']);
const REGEX_BEFORE = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '&&', '||', '??', '=>', 'return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'throw', '+', '-', '*', '%', '<', '>', '==', '===', '!=', '!==']);

function tokenize(src) {
  const toks = [];
  let i = 0;
  let line = 1;
  const tpl = []; // profundidade de chaves em que cada expressão ${...} começou
  let depth = 0;
  const push = (v, kind) => toks.push({ v, kind, line });
  function template() { // a partir do caractere após ` ou após } que fecha ${
    while (i < src.length) {
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '\n') line += 1;
      if (c === '`') { i += 1; push('`tpl`', 'str'); return; }
      if (c === '$' && src[i + 1] === '{') { i += 2; tpl.push(depth); depth += 1; return; }
      i += 1;
    }
  }
  while (i < src.length) {
    const c = src[i];
    if (c === '\n') { line += 1; i += 1; continue; }
    if (/\s/.test(c)) { i += 1; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i += 1; continue; }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      line += (src.slice(i, end).match(/\n/g) || []).length;
      i = end + 2; continue;
    }
    if (c === '"' || c === "'") {
      i += 1;
      while (i < src.length && src[i] !== c) { if (src[i] === '\\') i += 1; i += 1; }
      i += 1; push('"str"', 'str'); continue;
    }
    if (c === '`') { i += 1; template(); continue; }
    if (c === '}' && tpl.length && tpl[tpl.length - 1] === depth - 1) {
      depth -= 1; tpl.pop(); i += 1; template(); continue;
    }
    if (c === '/') {
      const prev = toks[toks.length - 1];
      if (!prev || REGEX_BEFORE.has(prev.v)) { // literal de expressão regular
        i += 1;
        let cls = false;
        while (i < src.length) {
          if (src[i] === '\\') { i += 2; continue; }
          if (src[i] === '[') cls = true;
          else if (src[i] === ']') cls = false;
          else if (src[i] === '/' && !cls) break;
          i += 1;
        }
        i += 1;
        while (/[a-z]/i.test(src[i] || '')) i += 1;
        push('/re/', 'str'); continue;
      }
    }
    const id = /^[A-Za-z_$][\w$]*/.exec(src.slice(i, i + 80));
    if (id) { push(id[0], 'id'); i += id[0].length; continue; }
    const num = /^\d[\d_.xXa-fA-FeEn]*/.exec(src.slice(i, i + 40));
    if (num) { push(num[0], 'num'); i += num[0].length; continue; }
    const t3 = src.slice(i, i + 3);
    const t2 = src.slice(i, i + 2);
    const p = PUNCT3.has(t3) ? t3 : PUNCT2.has(t2) ? t2 : c;
    if (p === '{') depth += 1;
    if (p === '}') depth -= 1;
    push(p, 'p');
    i += p.length;
  }
  return toks;
}

// ------------------------------------------------------------- complexidade
const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'new', 'with', 'await', 'async']);
const DECISAO = new Set(['if', 'for', 'while', 'case', 'catch', '&&', '||', '??', '?']);

function funcoes(toks) {
  const match = new Array(toks.length).fill(-1);
  const st = [];
  toks.forEach((t, i) => {
    if (t.v === '(' || t.v === '{' || t.v === '[') st.push(i);
    else if (t.v === ')' || t.v === '}' || t.v === ']') { const j = st.pop(); if (j !== undefined) { match[j] = i; match[i] = j; } }
  });
  const corpo = new Map(); // índice da chave de abertura -> nome da função
  const nomeAntes = (k) => { // nome a partir do que vem antes dos parâmetros
    let j = k - 1;
    if (toks[j] && toks[j].v === 'async') j -= 1;
    if (toks[j] && (toks[j].v === '=' || toks[j].v === ':') && toks[j - 1] && toks[j - 1].kind === 'id') return toks[j - 1].v;
    return '(anônima)';
  };
  toks.forEach((t, i) => {
    if (t.v === 'function') {
      let j = i + 1;
      if (toks[j] && toks[j].v === '*') j += 1;
      const nome = toks[j] && toks[j].kind === 'id' ? toks[j].v : nomeAntes(i);
      while (toks[j] && toks[j].v !== '(') j += 1;
      const k = match[j];
      if (k > 0 && toks[k + 1] && toks[k + 1].v === '{') corpo.set(k + 1, nome);
    } else if (t.v === '=>' && toks[i + 1] && toks[i + 1].v === '{') {
      const ini = toks[i - 1].v === ')' ? match[i - 1] : i - 1;
      corpo.set(i + 1, nomeAntes(ini));
    } else if (t.kind === 'id' && !KEYWORDS.has(t.v) && toks[i + 1] && toks[i + 1].v === '('
      && !(toks[i - 1] && (toks[i - 1].v === 'function' || toks[i - 1].v === '.' || toks[i - 1].v === '?.'))) {
      const k = match[i + 1];
      if (k > 0 && toks[k + 1] && toks[k + 1].v === '{') corpo.set(k + 1, t.v); // método
    }
  });
  const res = [];
  const pilha = [];
  toks.forEach((t, i) => {
    if (corpo.has(i)) pilha.push({ nome: corpo.get(i), linha: t.line, fim: match[i], cc: 1 });
    if (DECISAO.has(t.v) && pilha.length) pilha[pilha.length - 1].cc += 1;
    while (pilha.length && pilha[pilha.length - 1].fim === i) res.push(pilha.pop());
  });
  return res;
}

// ------------------------------------------------------------- medição
const linhasSignificativas = (src) => src.split('\n').map((l, n) => ({ n: n + 1, s: l.trim().replace(/\s+/g, ' ') }))
  .filter((l) => l.s && !l.s.startsWith('//') && !l.s.startsWith('*') && !l.s.startsWith('/*'));

const modulos = {};
for (const f of arquivos) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const deps = [...src.matchAll(/require\('(\.{1,2}\/[^']+)'\)/g)].map((m) => {
    let alvo = path.normalize(path.join(path.dirname(f), m[1])).replace(/\\/g, '/');
    if (fs.existsSync(path.join(ROOT, alvo)) && fs.statSync(path.join(ROOT, alvo)).isDirectory()) alvo += '/index';
    return alvo.endsWith('.js') ? alvo : `${alvo}.js`;
  });
  modulos[f] = { deps: [...new Set(deps)], linhas: linhasSignificativas(src), fns: funcoes(tokenize(src)) };
}

// dependências circulares (componentes fortemente conexos de Tarjan)
let indice = 0;
const idx = {}; const low = {}; const naPilha = new Set(); const pilha = []; const ciclos = [];
function tarjan(v) {
  idx[v] = low[v] = indice++; pilha.push(v); naPilha.add(v);
  for (const w of (modulos[v] ? modulos[v].deps : [])) {
    if (!(w in modulos)) continue;
    if (!(w in idx)) { tarjan(w); low[v] = Math.min(low[v], low[w]); } else if (naPilha.has(w)) low[v] = Math.min(low[v], idx[w]);
  }
  if (low[v] === idx[v]) {
    const comp = [];
    let w;
    do { w = pilha.pop(); naPilha.delete(w); comp.push(w); } while (w !== v);
    if (comp.length > 1) ciclos.push(comp);
  }
}
Object.keys(modulos).forEach((m) => { if (!(m in idx)) tarjan(m); });

// regras de camadas: apresentação não acessa dados; apoio não depende de rotas nem de páginas
const camada = (f) => f.split('/')[0].replace('.js', '');
const violacoes = [];
for (const [f, m] of Object.entries(modulos)) {
  for (const d of m.deps) {
    if (camada(f) === 'views' && /^lib\/(repo|db)\.js$/.test(d)) violacoes.push(`${f} -> ${d}`);
    if (camada(f) === 'lib' && /^(routes|views)\//.test(d)) violacoes.push(`${f} -> ${d}`);
  }
}

// duplicação
const vistos = new Map();
for (const [f, m] of Object.entries(modulos)) {
  const ls = m.linhas.filter((l) => l.s.replace(/[{}()[\];,]/g, '').length >= 4);
  m.sig = ls;
  for (let k = 0; k + JANELA <= ls.length; k++) {
    const chave = ls.slice(k, k + JANELA).map((l) => l.s).join('\n');
    if (!vistos.has(chave)) vistos.set(chave, []);
    vistos.get(chave).push({ f, k });
  }
}
const dup = new Set();
const blocos = [];
for (const [, locais] of vistos) {
  if (locais.length < 2) continue;
  blocos.push(locais);
  for (const { f, k } of locais) for (let j = 0; j < JANELA; j++) dup.add(`${f}:${modulos[f].sig[k + j].n}`);
}
const totalSig = Object.values(modulos).reduce((s, m) => s + m.sig.length, 0);

// ------------------------------------------------------------- relatório
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const todas = Object.entries(modulos).flatMap(([f, m]) => m.fns.map((fn) => ({ ...fn, f })));
const ccs = todas.map((x) => x.cc).sort((a, b) => a - b);
const pct = (p) => ccs[Math.min(ccs.length - 1, Math.ceil(p * ccs.length) - 1)];
const faixa = (a, b) => ccs.filter((c) => c >= a && c <= b).length;
const fanIn = {};
Object.values(modulos).forEach((m) => m.deps.forEach((d) => { fanIn[d] = (fanIn[d] || 0) + 1; }));

console.log('# Métricas de manutenibilidade (node scripts/manutenibilidade.js)');
console.log(`# Data: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC | Node ${process.version} | ${os.type()} ${os.release()} | versão ${pkg.version} (package.json)`);
console.log(`# Arquivos medidos: server.js, public/app.js, lib/, routes/ e views/ (${arquivos.length} módulos)`);
console.log('');
console.log('módulo                     linhas  funções  importa  importado por  maior complexidade');
for (const [f, m] of Object.entries(modulos)) {
  const maior = m.fns.reduce((a, x) => Math.max(a, x.cc), 0);
  console.log(`${f.padEnd(26)} ${String(m.linhas.length).padStart(6)} ${String(m.fns.length).padStart(8)} ${String(m.deps.length).padStart(8)} ${String(fanIn[f] || 0).padStart(14)} ${String(maior).padStart(19)}`);
}
console.log('');
console.log(`Linhas de código (sem linhas em branco e comentários): ${Object.values(modulos).reduce((s, m) => s + m.linhas.length, 0)}`);
console.log(`Dependências circulares entre módulos: ${ciclos.length ? ciclos.map((c) => c.join(' <-> ')).join('; ') : 'nenhuma'}`);
console.log(`Violações da organização em camadas: ${violacoes.length ? violacoes.join('; ') : 'nenhuma'}`);
console.log(`Funções: ${ccs.length} | complexidade ciclomática: mediana ${pct(0.5)}, percentil 90 ${pct(0.9)}, máxima ${ccs[ccs.length - 1]}`);
console.log(`Distribuição: 1-5: ${faixa(1, 5)} | 6-10: ${faixa(6, 10)} | 11-20: ${faixa(11, 20)} | acima de 20: ${faixa(21, 1e9)}`);
const acima = todas.filter((x) => x.cc > LIMITE_CC).sort((a, b) => b.cc - a.cc);
console.log(`Funções acima do limite de ${LIMITE_CC} (${acima.length}, ${(100 * acima.length / ccs.length).toFixed(1)}% do total):`);
for (const x of acima) console.log(`  ${String(x.cc).padStart(3)}  ${x.f}:${x.linha}  ${x.nome}`);
console.log(`Duplicação: ${dup.size} de ${totalSig} linhas significativas (${(100 * dup.size / totalSig).toFixed(1)}%) em ${blocos.length} blocos repetidos de ${JANELA} linhas`);
