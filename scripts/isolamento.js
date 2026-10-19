'use strict';

// Verificação de isolamento entre os testes: cada teste é executado sozinho, em
// um processo novo (node --test --test-name-pattern="^Txx " arquivo), e a suíte
// completa é executada também com os arquivos em ordem inversa e em paralelo.
// Um teste que só passa quando outros rodam antes dele depende de dados criados
// por eles — e esconderia defeitos se fosse executado isoladamente.
//
// Uso: node scripts/isolamento.js

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const TESTS = path.join(ROOT, 'tests');
const files = fs.readdirSync(TESTS).filter((f) => f.endsWith('.test.js')).sort();

function run(args) {
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, NEXO_QUIET: '1' } });
  const out = (r.stdout || '') + (r.stderr || '');
  const num = (k) => Number((out.match(new RegExp(`^# ${k} (\\d+)`, 'm')) || [])[1] || 0);
  return { pass: num('pass'), fail: num('fail') };
}

console.log('# Verificação de isolamento: cada teste executado sozinho, em um processo novo');
console.log('# (node --test --test-name-pattern="^Txx " arquivo), além da suíte completa em ordem normal,');
console.log('# com os arquivos em ordem inversa e com os arquivos em paralelo.');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
console.log(`# Data: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC | Node ${process.version} | ${os.type()} ${os.release()} | versão ${pkg.version} (package.json)`);

let ok = 0;
let total = 0;
for (const f of files) {
  const src = fs.readFileSync(path.join(TESTS, f), 'utf8');
  for (const m of src.matchAll(/^test\('(T\d+) —/gm)) {
    const r = run(['--test', `--test-name-pattern=^${m[1]} `, path.join('tests', f)]);
    total += 1;
    if (r.pass === 1 && r.fail === 0) ok += 1;
    console.log(`${m[1]} ${f} pass=${r.pass} fail=${r.fail}`);
  }
}
const paths = files.map((f) => path.join('tests', f));
const normal = run(['--test', '--test-concurrency=1', ...paths]);
const inversa = run(['--test', '--test-concurrency=1', ...paths.slice().reverse()]);
const paralelo = run(['--test', `--test-concurrency=${Math.max(2, os.cpus().length)}`, ...paths]);
console.log(`# Suíte completa, ordem normal:  pass=${normal.pass} fail=${normal.fail}`);
console.log(`# Suíte completa, ordem inversa: pass=${inversa.pass} fail=${inversa.fail}`);
console.log(`# Suíte completa, em paralelo:   pass=${paralelo.pass} fail=${paralelo.fail}`);
console.log(`# Resultado: ${ok} de ${total} testes aprovados quando executados sozinhos`);
process.exitCode = ok === total && !normal.fail && !inversa.fail && !paralelo.fail ? 0 : 1;
