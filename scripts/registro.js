'use strict';

// Executa a suíte de testes e grava um registro com a identificação do ambiente
// e da versão testada: data, sistema operacional, Node.js, versão do
// package.json, commit e marcação (tag) do repositório e situação dos arquivos.
//
// Uso: npm run registro                 grava relatorio/execucao-<sistema>.txt
//      npm run registro -- clone-limpo  grava relatorio/execucao-clone-limpo.txt
// Usa o git do PATH ou, no Windows, o que acompanha o GitHub Desktop. Sem
// nenhum dos dois, o commit e as marcações são lidos diretamente da pasta .git.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const GIT = path.join(ROOT, '.git');
const pkg = require('../package.json');
const nome = process.argv[2] || (process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux');
if (!/^[a-z0-9-]+$/.test(nome)) { console.error('Nome inválido para o registro.'); process.exit(2); }
const destino = path.join(ROOT, 'relatorio', `execucao-${nome}.txt`);

// Executáveis do git a experimentar: o do PATH e, no Windows, o que acompanha o
// GitHub Desktop (%LOCALAPPDATA%\GitHubDesktop\app-<versão>\resources\app\git).
function localizarGit() {
  const candidatos = ['git'];
  const desktop = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'GitHubDesktop') : null;
  if (process.platform === 'win32' && desktop && fs.existsSync(desktop)) {
    const versoes = fs.readdirSync(desktop).filter((d) => /^app-\d/.test(d))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const v of versoes) {
      const base = path.join(desktop, v, 'resources', 'app', 'git');
      candidatos.push(path.join(base, 'cmd', 'git.exe'), path.join(base, 'mingw64', 'bin', 'git.exe'));
    }
  }
  return candidatos.find((exe) => spawnSync(exe, ['--version'], { timeout: 15000 }).status === 0) || null;
}
const GIT_EXE = localizarGit();

function git(args) {
  if (!GIT_EXE) return null;
  const r = spawnSync(GIT_EXE, args, { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
  return r.status === 0 ? r.stdout.trimEnd() : null;
}

// Lê um objeto do repositório, solto ou empacotado, no formato "<tipo> <tamanho>\0<conteúdo>".
// Retorna null se ele não for encontrado ou não puder ser lido.
function lerObjeto(sha) {
  try {
    const solto = path.join(GIT, 'objects', sha.slice(0, 2), sha.slice(2));
    if (fs.existsSync(solto)) return zlib.inflateSync(fs.readFileSync(solto)).toString('latin1');
    return lerObjetoEmpacotado(sha);
  } catch {
    return null;
  }
}

// Procura o objeto nos pacotes (.git/objects/pack, índice na versão 2). Objetos
// guardados como diferença (delta) de outro não são reconstruídos.
const TIPOS = [null, 'commit', 'tree', 'blob', 'tag'];
function lerObjetoEmpacotado(sha) {
  const dir = path.join(GIT, 'objects', 'pack');
  if (!fs.existsSync(dir)) return null;
  const alvo = Buffer.from(sha, 'hex');
  for (const arqIdx of fs.readdirSync(dir).filter((f) => f.endsWith('.idx'))) {
    const idx = fs.readFileSync(path.join(dir, arqIdx));
    if (idx.readUInt32BE(0) !== 0xff744f63 || idx.readUInt32BE(4) !== 2) continue;
    const leque = (i) => (i < 0 ? 0 : idx.readUInt32BE(8 + i * 4));
    const total = leque(255);
    const nomes = 8 + 256 * 4;
    const fim = leque(alvo[0]);
    let i = leque(alvo[0] - 1);
    while (i < fim && !alvo.equals(idx.subarray(nomes + i * 20, nomes + i * 20 + 20))) i++;
    if (i === fim) continue;
    const deslocamentos = nomes + total * 24; // depois dos nomes (20 bytes) e dos CRC (4 bytes)
    let pos = idx.readUInt32BE(deslocamentos + i * 4);
    if (pos >= 0x80000000) pos = Number(idx.readBigUInt64BE(deslocamentos + total * 4 + (pos - 0x80000000) * 8));
    const trecho = Buffer.alloc(64 * 1024);
    const fd = fs.openSync(path.join(dir, arqIdx.replace(/\.idx$/, '.pack')), 'r');
    let lidos;
    try { lidos = fs.readSync(fd, trecho, 0, trecho.length, pos); } finally { fs.closeSync(fd); }
    let p = 0;
    let byte = trecho[p++];
    const tipo = TIPOS[(byte >> 4) & 7];
    while (byte & 0x80) byte = trecho[p++];
    if (!tipo) return null;
    const conteudo = zlib.inflateSync(trecho.subarray(p, lidos));
    return `${tipo} ${conteudo.length}\0${conteudo.toString('latin1')}`;
  }
  return null;
}

// Lê o commit atual e as marcações que apontam para ele sem usar o git.
function lerPastaGit() {
  if (!fs.existsSync(path.join(GIT, 'HEAD'))) return null;
  const refs = new Map();
  const empacotadas = path.join(GIT, 'packed-refs');
  if (fs.existsSync(empacotadas)) {
    let anterior = null;
    for (const linha of fs.readFileSync(empacotadas, 'utf8').split(/\r?\n/)) {
      if (linha.startsWith('^') && anterior) refs.set(anterior, { ...refs.get(anterior), alvo: linha.slice(1) });
      else if (/^[0-9a-f]{40} /.test(linha)) { anterior = linha.slice(41); refs.set(anterior, { sha: linha.slice(0, 40) }); }
    }
  }
  const varrer = (dir, prefixo) => {
    if (!fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const ref = `${prefixo}/${item.name}`;
      if (item.isDirectory()) varrer(path.join(dir, item.name), ref);
      else if (!item.name.endsWith('.lock')) refs.set(ref, { sha: fs.readFileSync(path.join(dir, item.name), 'utf8').trim() });
    }
  };
  varrer(path.join(GIT, 'refs'), 'refs');
  const head = fs.readFileSync(path.join(GIT, 'HEAD'), 'utf8').trim();
  const commit = head.startsWith('ref: ') ? (refs.get(head.slice(5)) || {}).sha : head;
  if (!commit) return null;
  const tags = [];
  for (const [ref, v] of refs) {
    if (!ref.startsWith('refs/tags/')) continue;
    let alvo = v.alvo || v.sha;
    // Marcação anotada: o objeto "tag" aponta para o commit (ou para outra marcação).
    for (let n = 0; alvo !== commit && n < 5; n++) {
      const obj = lerObjeto(alvo);
      if (!obj || !obj.startsWith('tag ')) break;
      alvo = (obj.match(/object ([0-9a-f]{40})/) || [])[1];
    }
    if (alvo === commit) tags.push(ref.slice('refs/tags/'.length));
  }
  return { commit, tags };
}

function identificacao() {
  const sha = git(['rev-parse', 'HEAD']);
  if (sha) {
    const tags = (git(['tag', '--points-at', 'HEAD']) || '').split(/\s+/).filter(Boolean);
    const status = git(['status', '--porcelain', '--untracked-files=all', '--', '.', ':(exclude)relatorio/execucao-*.txt']);
    const situacao = status === null ? 'não verificada'
      : status ? `arquivos alterados ou novos desde o commit:\n#   ${status.split('\n').join('\n#   ')}`
        : 'nenhum arquivo alterado desde o commit';
    return { commit: sha, tags, situacao, fonte: GIT_EXE === 'git' ? 'git' : 'git do GitHub Desktop' };
  }
  let lido = null;
  try { lido = lerPastaGit(); } catch { /* pasta .git ilegível: tratada abaixo */ }
  const motivo = GIT_EXE ? 'o git não leu o repositório' : 'git não encontrado';
  if (lido) return { ...lido, situacao: `não verificada (${motivo}; commit lido da pasta .git)`, fonte: '.git' };
  const commit = fs.existsSync(GIT) ? 'não identificado (pasta .git não pôde ser lida)' : 'não identificado (pasta sem .git)';
  return { commit, tags: [], situacao: 'não verificada', fonte: '-' };
}

const id = identificacao();
const agora = new Date();
const cpus = os.cpus();
const arquivos = fs.readdirSync(path.join(ROOT, 'tests')).filter((f) => f.endsWith('.test.js')).sort().map((f) => path.join('tests', f));
const inicio = Date.now();
const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=spec', ...arquivos], {
  cwd: ROOT, encoding: 'utf8', timeout: 600000, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
});
const segundos = ((Date.now() - inicio) / 1000).toFixed(1).replace('.', ',');
const saida = (r.stdout || '') + (r.stderr || '');
const num = (rotulo) => Number((saida.match(new RegExp(`^\\S* ?${rotulo} (\\d+)`, 'm')) || [])[1] || 0);
const total = num('tests');
const aprovados = num('pass');
const interrupcao = r.error
  ? (r.error.code === 'ETIMEDOUT' ? 'tempo limite de 10 minutos excedido' : r.error.message)
  : r.signal ? `processo encerrado pelo sinal ${r.signal}` : null;

const cabecalho = [
  `# Registro de execução da suíte de testes (npm run registro${process.argv[2] ? ' -- ' + nome : ''})`,
  `# Data: ${agora.toISOString().slice(0, 16).replace('T', ' ')} UTC (horário local da máquina: ${agora.toLocaleString('pt-BR')}, fuso ${Intl.DateTimeFormat().resolvedOptions().timeZone})`,
  `# Sistema: ${os.type()} ${os.release()} (${os.version()}) ${os.arch()} | ${cpus.length} núcleos (${(cpus[0] && cpus[0].model || '').trim()}) | ${(os.totalmem() / 2 ** 30).toFixed(1)} GB`,
  `# Node ${process.version}${process.versions.sqlite ? ` | SQLite ${process.versions.sqlite}` : ''}`,
  `# Versão ${pkg.version} (package.json) | commit ${id.commit} | marcação ${id.tags.length ? id.tags.join(', ') : 'nenhuma no commit'} | fonte: ${id.fonte}`,
  `# Situação dos arquivos: ${id.situacao}`,
  `# Pacotes instalados (node_modules): ${fs.existsSync(path.join(ROOT, 'node_modules')) ? 'pasta presente' : 'nenhum'}`,
  '',
];
const rodape = ['', ...(interrupcao ? [`# Execução interrompida: ${interrupcao}`] : []), `# Resultado: ${aprovados} de ${total} testes aprovados em ${segundos} s`];
fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, cabecalho.join('\n') + saida.trimEnd() + '\n' + rodape.join('\n') + '\n');
console.log(cabecalho.join('\n') + rodape.slice(1).join('\n'));
console.log(`\nRegistro gravado em ${path.relative(ROOT, destino)}`);
process.exit(r.status === 0 && total > 0 && aprovados === total ? 0 : 1);
