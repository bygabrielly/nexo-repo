'use strict';

function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    try {
      cookies[key] = decodeURIComponent(val);
    } catch {
      cookies[key] = val; // valor malformado: usado como veio, sem derrubar a requisição
    }
  });
  return cookies;
}

function readBody(req, maxBytes = 1e6) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > maxBytes) {
        reject(new Error('Corpo da requisição muito grande'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function parseFormBody(req, maxBytes) {
  const raw = await readBody(req, maxBytes);
  const params = new URLSearchParams(raw);
  const result = {};
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return result;
}

// Lê o corpo bruto da requisição como Buffer (em vez de string), necessário
// para não corromper dados binários (ex.: bytes de uma imagem enviada via
// multipart/form-data). O limite é maior que o de readBody() para acomodar
// upload de foto de perfil e de capa.
function readBodyBuffer(req, maxBytes = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('Arquivo muito grande.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Parser de multipart/form-data escrito à mão, sem dependências externas
// (ex.: busboy/multer), consistente com a decisão de projeto de usar apenas
// módulos nativos do Node.js. Retorna os campos de texto separados dos
// arquivos enviados (cada arquivo com nome original, tipo MIME e bytes).
async function parseMultipartFormData(req, maxBytes) {
  const buffer = await readBodyBuffer(req, maxBytes);
  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) {
    throw new Error('Requisição multipart inválida.');
  }
  const boundary = Buffer.from(`--${(boundaryMatch[1] || boundaryMatch[2]).trim()}`);

  const fields = {};
  const files = {};

  let cursor = buffer.indexOf(boundary);
  while (cursor !== -1) {
    let partStart = cursor + boundary.length;
    // "--" logo após o boundary marca o fim do corpo multipart.
    if (buffer[partStart] === 0x2d && buffer[partStart + 1] === 0x2d) break;
    if (buffer[partStart] === 0x0d && buffer[partStart + 1] === 0x0a) partStart += 2;

    const nextBoundary = buffer.indexOf(boundary, partStart);
    if (nextBoundary === -1) break;
    let partEnd = nextBoundary;
    if (buffer[partEnd - 2] === 0x0d && buffer[partEnd - 1] === 0x0a) partEnd -= 2;

    const part = buffer.slice(partStart, partEnd);
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd !== -1) {
      const headerText = part.slice(0, headerEnd).toString('utf8');
      const content = part.slice(headerEnd + 4);
      const nameMatch = headerText.match(/name="([^"]*)"/i);
      const filenameMatch = headerText.match(/filename="([^"]*)"/i);
      const typeMatch = headerText.match(/Content-Type:\s*([^\r\n]+)/i);
      const fieldName = nameMatch ? nameMatch[1] : null;

      if (fieldName) {
        if (filenameMatch) {
          if (filenameMatch[1]) {
            files[fieldName] = {
              filename: filenameMatch[1],
              mimetype: typeMatch ? typeMatch[1].trim() : 'application/octet-stream',
              buffer: content,
            };
          }
          // filename="" — campo de arquivo deixado vazio pelo usuário: ignora.
        } else {
          fields[fieldName] = content.toString('utf8');
        }
      }
    }
    cursor = nextBoundary;
  }

  return { fields, files };
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = { parseCookies, readBody, parseFormBody, parseMultipartFormData, escapeHtml };
