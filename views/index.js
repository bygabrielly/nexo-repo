'use strict';

// Camada de apresentação: gera o HTML de cada página. Nenhuma função aqui
// acessa o banco de dados; todas recebem os dados já prontos da camada de
// aplicação (server.js e routes/).

module.exports = {
  ...require('./layout'),
  ...require('./helpers'),
  ...require('./public'),
  ...require('./auth'),
  ...require('./freelancer'),
  ...require('./account'),
  ...require('./orders'),
  ...require('./projects'),
  ...require('./messages'),
};
