'use strict';

// Medição de tempo de resposta sob uma carga mínima: sobe uma instância do
// servidor com banco temporário (dados de demonstração) e envia, para cada
// página, um número fixo de requisições com algumas em paralelo, registrando
// a mediana, o percentil 95, o maior tempo e as requisições por segundo.
// Não é um teste de carga: serve apenas para mostrar a viabilidade do protótipo
// em uso individual ou de poucos usuários simultâneos.
//
// Uso: node scripts/desempenho.js [requisições por página] [em paralelo]

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const TOTAL = Number(process.argv[2] || 500);
const PARALELO = Number(process.argv[3] || 10);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-desempenho-'));
process.env.DB_PATH = path.join(dir, 'db.sqlite');
process.env.UPLOADS_DIR = path.join(dir, 'uploads');
process.env.OUTBOX_DIR = path.join(dir, 'outbox');
process.env.NEXO_QUIET = '1';
const { createApp } = require('../server');

const pct = (arr, p) => arr[Math.min(arr.length - 1, Math.ceil((p / 100) * arr.length) - 1)];

async function medir(base, rota, headers = {}) {
  const tempos = [];
  let erros = 0;
  let enviados = 0;
  const inicio = performance.now();
  async function trabalhador() {
    while (enviados < TOTAL) {
      enviados += 1;
      const t0 = performance.now();
      const r = await fetch(base + rota, { headers, redirect: 'manual' });
      await r.arrayBuffer();
      tempos.push(performance.now() - t0);
      if (r.status !== 200) erros += 1;
    }
  }
  await Promise.all(Array.from({ length: PARALELO }, trabalhador));
  const duracao = (performance.now() - inicio) / 1000;
  tempos.sort((a, b) => a - b);
  return { rota, n: tempos.length, erros, mediana: pct(tempos, 50), p95: pct(tempos, 95), max: tempos[tempos.length - 1], rps: tempos.length / duracao };
}

(async () => {
  const server = createApp();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  // sessão de uma cliente para medir uma página autenticada
  const login = await fetch(base + '/login');
  const aid = login.headers.getSetCookie().find((c) => c.startsWith('aid=')).split(';')[0];
  const csrf = (await login.text()).match(/name="_csrf" value="([a-f0-9]+)"/)[1];
  const r = await fetch(base + '/login', {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: aid },
    body: new URLSearchParams({ _csrf: csrf, email: 'cliente@example.com', password: 'nexo2026' }).toString(),
  });
  const sid = r.headers.getSetCookie().find((c) => c.startsWith('sid=')).split(';')[0];

  for (let i = 0; i < 50; i++) await (await fetch(base + '/')).arrayBuffer(); // aquecimento

  const rotas = [
    ['/', {}],
    ['/servicos?q=site&ordem=menor_preco', {}],
    ['/servicos?categoria=Programa%C3%A7%C3%A3o&preco_max=2000&nota=4', {}],
    ['/servicos/1', {}],
    ['/freelancers/1', {}],
    ['/pedidos', { cookie: sid }],
  ];
  const linhas = [];
  for (const [rota, h] of rotas) linhas.push(await medir(base, rota, h));
  server.close();

  const cab = `Tempo de resposta sob carga mínima: ${TOTAL} requisições por página, ${PARALELO} em paralelo`;
  console.log(`# ${cab}`);
  console.log(`# Data: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC | Node ${process.version} | ${os.type()} ${os.release()} | ${os.cpus().length} núcleos (${os.cpus()[0].model.trim()}) | ${(os.totalmem() / 2 ** 30).toFixed(1)} GB | versão ${require('../package.json').version} (package.json)`);
  console.log('# Servidor e cliente na mesma máquina; banco com os dados de demonstração.');
  console.log('página                                                         | mediana (ms) | p95 (ms) | máx. (ms) | req/s | erros');
  for (const l of linhas) {
    console.log(`${l.rota.padEnd(62)} | ${l.mediana.toFixed(1).padStart(12)} | ${l.p95.toFixed(1).padStart(8)} | ${l.max.toFixed(1).padStart(9)} | ${l.rps.toFixed(0).padStart(5)} | ${l.erros}`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
})();
