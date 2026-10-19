'use strict';

// Tratamento das imagens enviadas pelos usuários, depois de identificado o tipo
// real pela assinatura binária (detectImageType, em lib/security.js):
// - a estrutura do arquivo é percorrida e validada (blocos com tamanhos coerentes,
//   início e fim esperados); um arquivo malformado é recusado;
// - os metadados que podem conter dados pessoais são removidos — EXIF (que pode
//   trazer a localização GPS, o modelo da câmera e a data da foto), XMP, IPTC,
//   comentários e textos embutidos;
// - as dimensões são lidas do cabeçalho e limitadas (config.MAX_IMAGE_SIDE), o que
//   evita imagens gigantes que consomem memória ao serem exibidas.
// A imagem não é decodificada nem regravada pixel a pixel: isso exigiria uma
// biblioteca de imagens, e o protótipo usa apenas módulos nativos do Node.js.

const zlib = require('node:zlib');
const config = require('./config');

class ImageError extends Error {}
const invalid = () => new ImageError('O arquivo enviado não é uma imagem JPG, PNG ou WEBP válida.');

// ---------------------------------------------------------------- PNG
// Mantém apenas os blocos necessários para exibir a imagem; remove tEXt, zTXt,
// iTXt (textos livres), eXIf (EXIF) e tIME (data de modificação).
const PNG_KEEP = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'pHYs', 'bKGD']);

function sanitizePng(buf) {
  const out = [buf.subarray(0, 8)];
  let pos = 8;
  let width = 0;
  let height = 0;
  let sawEnd = false;
  let first = true;
  while (pos + 12 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const end = pos + 12 + len;
    if (end > buf.length) throw invalid();
    const crc = buf.readUInt32BE(pos + 8 + len);
    if (zlib.crc32(buf.subarray(pos + 4, pos + 8 + len)) !== crc) throw invalid();
    if (first) {
      if (type !== 'IHDR' || len !== 13) throw invalid();
      width = buf.readUInt32BE(pos + 8);
      height = buf.readUInt32BE(pos + 12);
      first = false;
    }
    if (PNG_KEEP.has(type)) out.push(buf.subarray(pos, end));
    pos = end;
    if (type === 'IEND') { sawEnd = true; break; }
  }
  if (first || !sawEnd) throw invalid();
  return { buffer: Buffer.concat(out), width, height };
}

// ---------------------------------------------------------------- JPEG
// Mantém APP0 (JFIF), APP2 apenas com perfil de cor ICC e APP14 (Adobe, cores);
// remove APP1 (EXIF e XMP), APP13 (IPTC), demais APPn e comentários (COM).
function sanitizeJpeg(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw invalid();
  const out = [buf.subarray(0, 2)];
  let pos = 2;
  let width = 0;
  let height = 0;
  while (pos + 4 <= buf.length) {
    if (buf[pos] !== 0xff) throw invalid();
    const marker = buf[pos + 1];
    if (marker === 0xff) { pos += 1; continue; } // bytes de preenchimento
    if (marker === 0xd9) { out.push(buf.subarray(pos, pos + 2)); pos += 2; break; } // EOI
    const len = buf.readUInt16BE(pos + 2);
    const end = pos + 2 + len;
    if (len < 2 || end > buf.length) throw invalid();
    const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isSof) {
      if (len < 7) throw invalid();
      height = buf.readUInt16BE(pos + 5);
      width = buf.readUInt16BE(pos + 7);
    }
    const isApp = marker >= 0xe0 && marker <= 0xef;
    const keepApp = marker === 0xe0 || marker === 0xee
      || (marker === 0xe2 && buf.toString('latin1', pos + 4, pos + 15) === 'ICC_PROFILE');
    if (marker === 0xda) { // SOS: o restante é o conteúdo comprimido da imagem
      out.push(buf.subarray(pos));
      pos = buf.length;
      break;
    }
    if ((!isApp || keepApp) && marker !== 0xfe) out.push(buf.subarray(pos, end));
    pos = end;
  }
  if (!width || !height) throw invalid();
  return { buffer: Buffer.concat(out), width, height };
}

// ---------------------------------------------------------------- WEBP
// Remove os blocos EXIF e XMP e desliga os indicadores correspondentes no
// cabeçalho estendido (VP8X); o tamanho total do arquivo é recalculado.
function sanitizeWebp(buf) {
  if (buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WEBP') throw invalid();
  const riffEnd = Math.min(8 + buf.readUInt32LE(4), buf.length);
  const chunks = [];
  let pos = 12;
  let width = 0;
  let height = 0;
  while (pos + 8 <= riffEnd) {
    const type = buf.toString('latin1', pos, pos + 4);
    const len = buf.readUInt32LE(pos + 4);
    const end = pos + 8 + len + (len % 2);
    if (pos + 8 + len > riffEnd) throw invalid();
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'VP8X' && len >= 10) {
      width = data.readUIntLE(4, 3) + 1;
      height = data.readUIntLE(7, 3) + 1;
    } else if (type === 'VP8 ' && len >= 10 && !width) {
      width = data.readUInt16LE(6) & 0x3fff;
      height = data.readUInt16LE(8) & 0x3fff;
    } else if (type === 'VP8L' && len >= 5 && !width) {
      const bits = data.readUInt32LE(1);
      width = (bits & 0x3fff) + 1;
      height = ((bits >> 14) & 0x3fff) + 1;
    }
    if (type !== 'EXIF' && type !== 'XMP ') chunks.push(Buffer.from(buf.subarray(pos, end)));
    pos = end;
  }
  if (!chunks.length || !width || !height) throw invalid();
  for (const c of chunks) {
    if (c.toString('latin1', 0, 4) === 'VP8X') c[8] &= ~(0x08 | 0x04); // indicadores de EXIF e XMP
  }
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(4 + body.length, 4);
  header.write('WEBP', 8, 'latin1');
  return { buffer: Buffer.concat([header, body]), width, height };
}

// Recebe o conteúdo e o tipo detectado ('.png', '.jpg' ou '.webp') e devolve
// { buffer, width, height } sem metadados; lança ImageError se o arquivo for
// malformado ou maior que as dimensões permitidas.
function sanitizeImage(buffer, ext) {
  let r;
  try {
    r = ext === '.png' ? sanitizePng(buffer) : ext === '.jpg' ? sanitizeJpeg(buffer) : sanitizeWebp(buffer);
  } catch (err) {
    if (err instanceof ImageError) throw err;
    throw invalid(); // leitura fora dos limites do arquivo
  }
  const max = config.MAX_IMAGE_SIDE;
  if (r.width > max || r.height > max) {
    throw new ImageError(`A imagem é grande demais: o máximo é ${max} × ${max} pixels.`);
  }
  return r;
}

module.exports = { sanitizeImage, ImageError };
