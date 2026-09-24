'use strict';

// Script mínimo da interface. Fica em arquivo próprio (e não em atributos
// onsubmit="..." no HTML) para que a política de segurança de conteúdo (CSP)
// possa bloquear qualquer script embutido na página, reduzindo o impacto de
// uma eventual injeção de código.

// Confirmação antes de ações destrutivas (heurística "prevenção de erros").
document.addEventListener('submit', (event) => {
  const form = event.target;
  const message = form.getAttribute('data-confirm');
  if (message && !window.confirm(message)) event.preventDefault();
});

// Confirmação de senha: avisa imediatamente, antes do envio, se não confere.
document.addEventListener('input', (event) => {
  if (event.target.name !== 'password_confirm') return;
  const form = event.target.form;
  const pw = form && form.querySelector('input[name="password"]');
  if (!pw) return;
  event.target.setCustomValidity(event.target.value && event.target.value !== pw.value ? 'As senhas não conferem.' : '');
});
