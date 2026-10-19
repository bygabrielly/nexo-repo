'use strict';

// Teste de mutação manual dos módulos críticos de segurança e de controle de
// acesso. Cada mutante introduz, de propósito, um defeito plausível (troca de
// operador, condição removida, limite alterado); a suíte de testes é executada
// e o mutante é "morto" se algum teste falhar. Um mutante que sobrevive indica
// um comportamento que os testes não verificam.
//
// Uso: node scripts/mutacao.js            (todos os mutantes)
//      node scripts/mutacao.js M03 M10    (apenas os indicados)
// O arquivo original é sempre restaurado, mesmo em caso de erro.

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');

// [id, arquivo, trecho original, trecho mutante, descrição do defeito]
const MUTANTES = [
  ['M01', 'lib/security.js', "token.length !== 64) return false;", "token.length !== 64) return true;", 'CSRF: token de tamanho errado passa a ser aceito'],
  ['M02', 'lib/security.js', 'return given.length === expected.length && crypto.timingSafeEqual(given, expected);', 'return given.length === expected.length;', 'CSRF: qualquer token de 64 caracteres é aceito'],
  ['M03', 'server.js', 'if (!security.csrfValid(sid || aid, ctx.body._csrf)) {', 'if (false && !security.csrfValid(sid || aid, ctx.body._csrf)) {', 'CSRF: verificação desligada no servidor'],
  ['M04', 'lib/security.js', 'if (e.count >= this.maxFailures) e.lockedUntil', 'if (e.count > this.maxFailures) e.lockedUntil', 'Força bruta: bloqueio só a partir da 7ª falha'],
  ['M05', 'lib/security.js', 'if (now >= e.lockedUntil) {', 'if (now < e.lockedUntil) {', 'Força bruta: bloqueio liberado enquanto deveria valer'],
  ['M06', 'lib/security.js', "if (!knownDevice && a && now < a.nextAllowed)", "if (a && now < a.nextAllowed)", 'Login: dispositivo conhecido deixa de dispensar a espera por conta'],
  ['M07', 'lib/security.js', 'const delay = Math.min(1000 * 2 ** (a.failures - this.freeFailures), this.maxDelayMs);', 'const delay = 1000 * 2 ** (a.failures - this.freeFailures);', 'Login: espera por conta sem teto (permitiria travar a conta)'],
  ['M08', 'lib/security.js', 'if (list.length >= this.max) {', 'if (list.length > this.max) {', 'Limite de envios: um envio a mais é aceito'],
  ['M09', 'lib/security.js', "buffer[0] === 0x89 && buffer.slice(1, 4).toString('ascii') === 'PNG' &&", "buffer.slice(1, 4).toString('ascii') === 'PNG' &&", 'Upload: assinatura PNG verificada pela metade'],
  ['M10', 'lib/security.js', "if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\\\')) return null;", "if (!next.startsWith('/')) return null;", 'Open redirect: "//site-externo" passa a ser aceito'],
  ['M11', 'server.js', 'if (!filePath.startsWith(base + path.sep) || !allowed) {', 'if (!allowed) {', 'Path traversal: caminho fora da pasta pública aceito'],
  ['M12', 'server.js', "if ((route.auth === 'freelancer' || route.auth === 'cliente') && user.role !== route.auth) {", "if (route.auth === 'freelancer' && user.role !== route.auth) {", 'Controle de acesso: rotas exclusivas de clientes abertas a freelancers'],
  ['M13', 'server.js', 'if (route.auth && !user) {', 'if (false && route.auth && !user) {', 'Autenticação: rotas protegidas acessíveis sem login'],
  ['M14', 'routes/orders.js', 'if (o.client_id !== ctx.user.id && o.freelancer_id !== ctx.user.id) {', 'if (o.client_id !== ctx.user.id && o.freelancer_id === ctx.user.id) {', 'Propriedade: pedido aberto a terceiros'],
  ['M15', 'routes/messages.js', 'if (c.client_id !== ctx.user.id && c.freelancer_id !== ctx.user.id) {', 'if (c.client_id !== ctx.user.id && c.freelancer_id === ctx.user.id) {', 'Propriedade: conversa aberta a terceiros'],
  ['M16', 'lib/repo.js', "softDelete: db.prepare('UPDATE services SET deleted_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL'),", "softDelete: db.prepare('UPDATE services SET deleted_at = ? WHERE id = ? AND (user_id = ? OR 1) AND deleted_at IS NULL'),", 'Propriedade: freelancer exclui serviço alheio'],
  ['M17', 'lib/repo.js', 'WHERE id = ? AND status IN (${placeholders})', 'WHERE id = ? AND (status IN (${placeholders}) OR 1)', 'Pedido: transição aceita em qualquer situação'],
  ['M18', 'lib/auth.js', 'if (a.length !== b.length) return false;\n  return crypto.timingSafeEqual(a, b);', 'if (a.length !== b.length) return false;\n  return true;', 'Senha: qualquer senha é aceita no login'],
  ['M19', 'lib/auth.js', 'if (p.length < MIN_LENGTH) {', 'if (p.length < 8) {', 'Política de senha: mínimo volta a 8 caracteres'],
  ['M20', 'lib/auth.js', '} else if (COMMON.has(lower) || isSequence(p)', '} else if (isSequence(p)', 'Política de senha: lista de senhas comuns ignorada'],
  ['M21', 'lib/http-helpers.js', ".replace(/</g, '&lt;')", ".replace(/</g, '<')", 'XSS: o caractere < deixa de ser escapado'],
  ['M22', 'lib/session.js', 'if (now - s.lastSeen > SESSION_IDLE_MS || now - s.createdAt > SESSION_ABSOLUTE_MS) {', 'if (now - s.lastSeen > SESSION_IDLE_MS) {', 'Sessão: expiração absoluta de 12 h removida'],
  ['M23', 'lib/session.js', 'if (previousToken) sessions.delete(previousToken);', '', 'Sessão: identificador anterior não é descartado no login'],
  ['M24', 'lib/images.js', 'if (zlib.crc32(buf.subarray(pos + 4, pos + 8 + len)) !== crc) throw invalid();', '', 'Upload: checksum do PNG não é verificado'],
  ['M25', 'lib/images.js', "if (PNG_KEEP.has(type)) out.push(buf.subarray(pos, end));", "out.push(buf.subarray(pos, end));", 'Upload: textos do PNG não são removidos'],
  ['M26', 'lib/images.js', "if ((!isApp || keepApp) && marker !== 0xfe) out.push(buf.subarray(pos, end));", "out.push(buf.subarray(pos, end));", 'Upload: EXIF do JPEG não é removido'],
  ['M27', 'lib/images.js', 'if (r.width > max || r.height > max) {', 'if (r.width > max && r.height > max) {', 'Upload: limite de dimensões só quando os dois lados excedem'],
  ['M28', 'routes/account.js', "fs.rmSync(path.join(config.UPLOADS_DIR, path.basename(url)), { force: true });", '', 'LGPD: imagens não são apagadas na exclusão da conta'],
  ['M29', 'lib/repo.js', "if (!a || !b) return false;", "if (!a && !b) return false;", 'Avaliação mútua: publicada com apenas uma das avaliações'],
  ['M30', 'lib/security.js', "'Content-Security-Policy': CSP,", "'Content-Security-Policy': CSP.replace(\"script-src 'self'\", \"script-src 'self' 'unsafe-inline'\"),", 'Cabeçalhos: política de conteúdo passa a permitir scripts embutidos'],
];

function runSuite() {
  const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...fs.readdirSync(path.join(ROOT, 'tests'))
    .filter((f) => f.endsWith('.test.js')).sort().map((f) => path.join('tests', f))], { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
  const out = r.stdout + r.stderr;
  const failed = [...out.matchAll(/^not ok \d+ - (T\d+)/gm)].map((m) => m[1]);
  const pass = Number((out.match(/^# pass (\d+)/m) || [])[1] || 0);
  return { failed, pass };
}

const only = process.argv.slice(2);
const results = [];
for (const [id, file, from, to, desc] of MUTANTES) {
  if (only.length && !only.includes(id)) continue;
  const full = path.join(ROOT, file);
  const original = fs.readFileSync(full, 'utf8');
  if (original.split(from).length !== 2) {
    results.push({ id, file, desc, status: 'ERRO: trecho não encontrado exatamente uma vez' });
    continue;
  }
  try {
    fs.writeFileSync(full, original.replace(from, to));
    const { failed } = runSuite();
    results.push({ id, file, desc, status: failed.length ? 'morto' : 'sobreviveu', by: failed.slice(0, 6) });
  } finally {
    fs.writeFileSync(full, original);
  }
  const last = results[results.length - 1];
  console.log(`${id} ${last.status.padEnd(10)} ${file.padEnd(20)} ${desc}${last.by && last.by.length ? ` (${last.by.join(', ')}${last.by.length === 6 ? ', ...' : ''})` : ''}`);
}
const mortos = results.filter((r) => r.status === 'morto').length;
const validos = results.filter((r) => !r.status.startsWith('ERRO')).length;
console.log(`\nMutantes mortos: ${mortos} de ${validos} (escore de mutação: ${(100 * mortos / validos).toFixed(1)}%)`);
