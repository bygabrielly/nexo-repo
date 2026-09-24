'use strict';

// Envio de e-mail SIMULADO. O protótipo não se conecta a um servidor de e-mail
// real (integração com serviços externos está fora do escopo do trabalho).
// Cada mensagem que seria enviada é gravada como arquivo de texto na pasta
// data/outbox e exibida no console do servidor, o que permite demonstrar e
// testar fluxos como a recuperação de senha sem expor dados reais.

const fs = require('node:fs');
const path = require('node:path');
const { OUTBOX_DIR } = require('./config');

function sendMail({ to, subject, text }) {
  fs.mkdirSync(OUTBOX_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeTo = String(to).replace(/[^a-z0-9@._-]/gi, '_');
  const file = path.join(OUTBOX_DIR, `${stamp}_${safeTo}.txt`);
  fs.writeFileSync(file, `Para: ${to}\nAssunto: ${subject}\n\n${text}\n`);
  if (!process.env.NEXO_QUIET) {
    console.log(`[e-mail simulado] para ${to} — ${subject}\n${text}\n`);
  }
  return file;
}

module.exports = { sendMail };
