'use strict';

// Proteções adicionais: login protegido sem
// permitir o bloqueio proposital de contas, limite de frequência de envios,
// remoção de metadados e limite de dimensões das imagens e exclusão das imagens
// do usuário que exclui a conta.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { startServer, Browser } = require('./helpers');

let app;
test.before(async () => { app = await startServer(); });
test.after(async () => { await app.close(); });

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name));
const uploads = () => path.join(app.dir, 'uploads');

// Monta um PNG com o cabeçalho (IHDR) informado e checksums corretos.
function pngWithSize(width, height) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8 bits, RGB
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.alloc(1 + width * 3))), chunk('IEND', Buffer.alloc(0))]);
}

test('T78 — Login: 5 falhas bloqueiam só a combinação conta + origem; o dono da conta, de outra origem, não fica bloqueado', () => {
  const { LoginThrottle } = require('../lib/security'); // carregado depois de startServer definir as pastas temporárias
  const t = new LoginThrottle({ pairMax: 5, ipMax: 20, windowMs: 15 * 60000, lockMs: 15 * 60000, freeFailures: 5, maxDelayMs: 60000 });
  const now = 1_000_000;
  for (let i = 0; i < 5; i++) t.fail({ email: 'vitima@example.com', ip: 'atacante', now });
  assert.equal(t.check({ email: 'vitima@example.com', ip: 'atacante', now }).reason, 'conta-origem');
  // De outra origem, sem cookie de dispositivo, há apenas uma espera curta e crescente
  const outra = t.check({ email: 'vitima@example.com', ip: 'casa-da-vitima', now });
  assert.equal(outra.reason, 'conta');
  assert.ok(outra.waitMs <= 1000, `espera de ${outra.waitMs} ms`);
  // Com o cookie de dispositivo conhecido, a espera por conta não se aplica
  assert.equal(t.check({ email: 'vitima@example.com', ip: 'casa-da-vitima', knownDevice: true, now }).waitMs, 0);
  // A espera por conta cresce, mas nunca passa de 60 s, mesmo com muitas origens atacando
  for (let i = 0; i < 30; i++) t.fail({ email: 'vitima@example.com', ip: `origem-${i}`, now });
  assert.ok(t.check({ email: 'vitima@example.com', ip: 'casa-da-vitima', now }).waitMs <= 60000);
  // Uma origem que erra em muitas contas diferentes é bloqueada por inteiro
  for (let i = 0; i < 20; i++) t.fail({ email: `conta${i}@example.com`, ip: 'robo', now });
  assert.equal(t.check({ email: 'qualquer@example.com', ip: 'robo', now }).reason, 'origem');
});

test('T79 — Login pela rede: bloqueio da conta atacada não afeta outra conta na mesma origem; cookie de dispositivo emitido', async () => {
  const atacante = new Browser(app.base);
  for (let i = 0; i < 5; i++) {
    assert.equal((await atacante.post('/login', { email: 'rafael@example.com', password: `chute${i}` }, { from: '/login' })).status, 400);
  }
  assert.equal((await atacante.post('/login', { email: 'rafael@example.com', password: 'nexo2026' }, { from: '/login' })).status, 429);
  const outra = new Browser(app.base);
  const r = await outra.login('juliana@example.com');
  assert.equal(r.status, 302, 'outra conta, mesma origem: login normal');
  assert.match(outra.cookies.dev || '', /^\d+\.[a-f0-9]{64}$/, 'cookie de dispositivo conhecido emitido');
});

test('T80 — Limite de mensagens: a 31ª mensagem em 10 minutos é recusada com HTTP 429, sem afetar outro usuário', async () => {
  const carla = new Browser(app.base);
  await carla.login('cliente@example.com');
  for (let i = 1; i <= 30; i++) {
    const r = await carla.post('/mensagens/1', { content: `Mensagem número ${i}` }, { from: '/mensagens/1' });
    assert.equal(r.status, 302, `mensagem ${i}`);
  }
  const excedente = await carla.post('/mensagens/1', { content: 'Mensagem 31' }, { from: '/mensagens/1' });
  assert.equal(excedente.status, 429);
  assert.match(excedente.body, /limite de envios por período/);
  const conversa = await carla.get('/mensagens/1');
  assert.doesNotMatch(conversa.body, /Mensagem 31/, 'a mensagem excedente não foi gravada');
  const marina = new Browser(app.base);
  await marina.login('marina@example.com');
  assert.equal((await marina.post('/mensagens/1', { content: 'Resposta da Marina' }, { from: '/mensagens/1' })).status, 302);
});

test('T81 — Limite de propostas: o 11º envio em uma hora é recusado com HTTP 429', async () => {
  const freela = new Browser(app.base);
  await freela.login('marina@example.com');
  const proposta = { price: '800', delivery_days: '7', message: 'Proposta de teste com uma descrição de tamanho suficiente.' };
  for (let i = 1; i <= 10; i++) {
    const r = await freela.post('/projetos/1/propostas', proposta, { from: '/projetos/1' });
    assert.notEqual(r.status, 429, `envio ${i}`);
  }
  assert.equal((await freela.post('/projetos/1/propostas', proposta, { from: '/projetos/1' })).status, 429);
});

test('T82 — Imagens enviadas perdem os metadados (EXIF com GPS, textos do PNG, EXIF do WEBP) e continuam válidas', async () => {
  const b = new Browser(app.base);
  await b.login('marina@example.com');
  const casos = [
    ['foto-com-gps.jpg', 'image/jpeg', '.jpg', ['Exif', 'CameraTeste']],
    ['imagem-com-texto.png', 'image/png', '.png', ['tEXt', 'Pessoa Teste', 'Rua Exemplo']],
    ['foto-com-exif.webp', 'image/webp', '.webp', ['EXIF', 'CameraTeste']],
  ];
  for (const [arquivo, tipo, ext, marcas] of casos) {
    const original = fixture(arquivo);
    for (const m of marcas.slice(1)) assert.ok(original.includes(m), `o arquivo de teste contém ${m}`);
    const r = await b.post('/perfil/portfolio', { title: `Teste ${arquivo}` }, { from: '/perfil/portfolio', files: { image: { buffer: original, type: tipo, name: arquivo } } });
    assert.equal(r.status, 302, arquivo);
    const page = await b.get('/perfil/portfolio');
    const m = page.body.match(new RegExp(`src="/uploads/([a-f0-9]{24}\\${ext})" alt="Teste ${arquivo.replace('.', '\\.')}"`));
    assert.ok(m, `imagem ${arquivo} gravada`);
    const salvo = fs.readFileSync(path.join(uploads(), m[1]));
    for (const marca of marcas) assert.ok(!salvo.includes(marca), `${arquivo}: "${marca}" removido`);
    assert.ok(salvo.length < original.length, `${arquivo}: arquivo menor sem os metadados`);
    const servida = await fetch(`${app.base}/uploads/${m[1]}`);
    assert.equal(servida.status, 200);
    assert.equal(servida.headers.get('content-type'), tipo);
  }
});

test('T83 — Imagens acima de 4000 px, corrompidas ou além do limite de 24 itens do portfólio são recusadas', async () => {
  const b = new Browser(app.base);
  await b.login('marina@example.com');
  const antes = fs.readdirSync(uploads()).length;
  const grande = await b.post('/perfil/portfolio', { title: 'Gigante' }, { from: '/perfil/portfolio', files: { image: { buffer: pngWithSize(5000, 2), type: 'image/png', name: 'gigante.png' } } });
  assert.equal(grande.status, 400);
  assert.match(grande.body, /grande demais: o máximo é 4000 × 4000 pixels/);
  const valida = pngWithSize(20, 20);
  const corrompida = Buffer.from(valida.subarray(0, valida.length - 20)); // cortada antes do fim
  const r = await b.post('/perfil/portfolio', { title: 'Cortada' }, { from: '/perfil/portfolio', files: { image: { buffer: corrompida, type: 'image/png', name: 'cortada.png' } } });
  assert.equal(r.status, 400);
  assert.match(r.body, /não é uma imagem JPG, PNG ou WEBP válida/);
  const crcErrado = Buffer.from(valida); crcErrado[crcErrado.length - 20] ^= 0xff; // um byte alterado dentro do IDAT
  const r2 = await b.post('/perfil/portfolio', { title: 'Adulterada' }, { from: '/perfil/portfolio', files: { image: { buffer: crcErrado, type: 'image/png', name: 'adulterada.png' } } });
  assert.equal(r2.status, 400, 'checksum do bloco não confere');
  assert.equal(fs.readdirSync(uploads()).length, antes, 'nenhum arquivo gravado');

  // Limite de quantidade: com 24 itens ativos, um novo envio é recusado e nada é gravado
  const lucas = new Browser(app.base);
  await lucas.login('lucas@example.com');
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.join(app.dir, 'test.sqlite'));
  const lucasId = db.prepare("SELECT id FROM users WHERE email = 'lucas@example.com'").get().id;
  const ativos = () => db.prepare('SELECT COUNT(*) AS n FROM portfolio_items WHERE user_id = ? AND deleted_at IS NULL').get(lucasId).n;
  const ins = db.prepare("INSERT INTO portfolio_items (user_id, image_url, title, description, created_at) VALUES (?, '/uploads/x.png', 'Item', '', datetime('now'))");
  while (ativos() < 24) ins.run(lucasId);
  const extra = db.prepare("INSERT INTO portfolio_items (user_id, image_url, title, description, created_at, deleted_at) VALUES (?, '/uploads/y.png', 'Removido', '', datetime('now'), datetime('now'))").run(lucasId).lastInsertRowid;
  const antes2 = fs.readdirSync(uploads()).length;
  const cheio = await lucas.post('/perfil/portfolio', { title: 'Vigésimo quinto' }, { from: '/perfil/portfolio', files: { image: { buffer: pngWithSize(20, 20), type: 'image/png', name: 'mais.png' } } });
  assert.equal(cheio.status, 400);
  assert.match(cheio.body, /no máximo 24 itens/);
  assert.equal(fs.readdirSync(uploads()).length, antes2, 'imagem excedente não gravada');
  await lucas.post(`/perfil/portfolio/${extra}/restaurar`, {}, { from: '/perfil/portfolio' });
  assert.equal(ativos(), 24, 'restaurar também respeita o limite');
  db.close();
});

test('T84 — Exclusão da conta remove do servidor as imagens enviadas e oculta os serviços sem a descrição', async () => {
  const b = new Browser(app.base);
  await b.login('juliana@example.com');
  await b.post('/perfil/editar', { name: 'Juliana Prado', area: 'Redação', bio: 'Redatora.', linkedin: '' },
    { from: '/perfil/editar', files: { avatar: { buffer: fixture('imagem-com-texto.png'), type: 'image/png', name: 'eu.png' } } });
  const perfil = await new Browser(app.base).get('/freelancers/3');
  const imagens = [...new Set([...perfil.body.matchAll(/src="\/uploads\/([^"]+)"/g)].map((m) => m[1]))];
  assert.ok(imagens.length >= 3, `foto, capa e portfólio presentes (${imagens.length})`);
  for (const f of imagens) assert.ok(fs.existsSync(path.join(uploads(), f)), `${f} existe antes da exclusão`);
  const r = await b.post('/conta/excluir', { password: 'nexo2026' }, { from: '/conta' });
  assert.equal(r.status, 200);
  for (const f of imagens) {
    assert.ok(!fs.existsSync(path.join(uploads(), f)), `${f} apagado do disco`);
    assert.equal((await fetch(`${app.base}/uploads/${f}`)).status, 404);
  }
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.join(app.dir, 'test.sqlite'), { readOnly: true });
  const servicos = db.prepare('SELECT deleted_at, description, keywords FROM services WHERE user_id = 3').all();
  db.close();
  assert.ok(servicos.length > 0);
  for (const s of servicos) {
    assert.ok(s.deleted_at, 'serviço oculto');
    assert.equal(s.description, '');
    assert.equal(s.keywords, '');
  }
});
