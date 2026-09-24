'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('../lib/config');
const { detectImageType } = require('../lib/security');

function str(v, max = 5000) {
  return String(v === undefined || v === null ? '' : v).trim().slice(0, max);
}

// Número decimal opcional: '' -> null; inválido -> NaN.
function money(v) {
  const s = str(v, 20).replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

function int(v) {
  const s = str(v, 10);
  if (!s) return null;
  const n = Number(s);
  return Number.isInteger(n) ? n : NaN;
}

function id(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Salva uma imagem enviada. O tipo é identificado pela assinatura binária do
// arquivo (e não pelo tipo MIME declarado no envio, que é controlado por quem
// envia); o nome do arquivo é aleatório.
function saveUploadedImage(file) {
  if (file.buffer.length > config.MAX_IMAGE_BYTES) throw new Error('Imagem muito grande. O tamanho máximo é 3 MB.');
  const type = detectImageType(file.buffer);
  if (!type) throw new Error('O arquivo enviado não é uma imagem JPG, PNG ou WEBP válida.');
  fs.mkdirSync(config.UPLOADS_DIR, { recursive: true });
  const filename = `${crypto.randomBytes(12).toString('hex')}${type.ext}`;
  fs.writeFileSync(path.join(config.UPLOADS_DIR, filename), file.buffer);
  return `/uploads/${filename}`;
}

function notFound(ctx) {
  const views = require('../views');
  return ctx.render(404, 'Não encontrado', views.notFoundPage());
}

function forbidden(ctx, message = 'Você não tem permissão para acessar este conteúdo.') {
  const views = require('../views');
  return ctx.render(403, 'Acesso negado', views.errorPage('Acesso negado', message));
}

module.exports = { str, money, int, id, saveUploadedImage, notFound, forbidden };
