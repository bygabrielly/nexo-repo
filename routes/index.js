'use strict';

// Tabela de rotas da aplicação. Cada rota declara o método HTTP, o caminho,
// o tipo de acesso exigido ('user' = qualquer usuário autenticado,
// 'cliente' ou 'freelancer' = papel específico) e a função que a atende.
// O controle de acesso e a verificação anti-CSRF são aplicados de forma
// centralizada em server.js, antes de a função da rota ser chamada.

module.exports = [
  ...require('./public'),
  ...require('./auth'),
  ...require('./services'),
  ...require('./profile'),
  ...require('./account'),
  ...require('./orders'),
  ...require('./projects'),
  ...require('./messages'),
];
