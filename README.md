# Nexo

Protótipo de plataforma web para intermediação de serviços entre freelancers e
clientes, no modelo de economia de plataformas.

Implementado em **Node.js puro**, sem frameworks nem bibliotecas externas
(apenas módulos nativos: `node:http`, `node:sqlite`, `node:crypto`, `node:fs`,
`node:test`). **Não é necessário rodar `npm install`.**
As páginas não carregam nada de serviços externos: a fonte dos títulos (Poppins)
é servida pelo próprio protótipo, sob a SIL Open Font License 1.1
(`public/fonts/OFL.txt`).

## Requisitos

- Node.js 22.5 ou superior (usa o módulo `node:sqlite`)
- Versão usada no desenvolvimento e nos testes: Node.js 22.22.2, com SQLite 3.51.2 embutido

## Como executar

```bash
node server.js      # ou: npm start
npm test            # executa a suíte de testes
```

Acesse http://localhost:3000. Na primeira execução o banco SQLite é criado em
`data/database.sqlite` com dados de demonstração (perfis com portfólio,
serviços, pedidos em todas as etapas, avaliações, projetos com propostas e
conversas).

Bancos criados por versões anteriores do protótipo são **migrados
automaticamente** (novas tabelas e colunas; mensagens antigas convertidas em
conversas privadas). Para recomeçar com os dados de demonstração, apague a
pasta `data/` antes de iniciar.

### Contas de demonstração (senha para todas: `nexo2026`)

| E-mail | Tipo | Situação na demonstração |
|---|---|---|
| marina@example.com | Freelancer (Design Gráfico) | avaliação 5,0; pedido em andamento; mensagem não lida |
| rafael@example.com | Freelancer (Programação) | pedido entregue aguardando aprovação; proposta enviada |
| juliana@example.com | Freelancer (Redação) | pedido aguardando aceite; projeto em andamento; avaliação mútua pendente (pedido #10) |
| lucas@example.com | Freelancer (Audiovisual) | sem avaliações ainda |
| cliente@example.com | Cliente (Carla Mendes) | projeto com 2 propostas para decidir |
| bruno@example.com | Cliente | entrega para aprovar; avaliou o pedido #10 e aguarda a publicação |
| ana@example.com | Cliente | projeto em andamento |

## Funcionalidades

**Intermediação**
- Cadastro de clientes e freelancers, com política de senha, confirmação de
  senha e aceite da política de privacidade.
- Perfil do freelancer com foto, capa, biografia, LinkedIn, portfólio,
  avaliação média, número de pedidos concluídos e avaliações recebidas.
- Serviços com preço (ou "a combinar"), prazo de entrega e palavras-chave.
- Busca por palavra-chave e categoria, com filtros de preço, prazo e nota
  mínima, ordenação e paginação.
- **Pedidos de contratação** com etapas: solicitado → em andamento → entregue →
  concluído (se o cliente pedir ajustes, o pedido volta a "em andamento"), além
  de recusado e cancelado; histórico de eventos e
  conversa própria do pedido. Se o cliente não responder a uma entrega em
  3 dias, o pedido é concluído automaticamente. Pedidos com prazo vencido e
  entregas fora do prazo são sinalizados.
- **Avaliações mútuas** de 1 a 5 estrelas com comentário: o cliente avalia o
  freelancer e o freelancer avalia o cliente, uma vez por pedido, em até 14 dias
  após a conclusão. As avaliações são publicadas "às cegas" — só quando as duas
  partes avaliam ou quando o prazo termina. O freelancer pode responder
  publicamente à avaliação recebida.
- **Reputação** do freelancer (nota média, pedidos concluídos) em cartões e
  perfis, e do cliente (nota, pedidos concluídos, tempo de plataforma) nos
  projetos e pedidos.
- **Projetos e propostas**: o cliente publica um projeto com orçamento e prazo;
  freelancers enviam propostas (que podem ser retiradas e reenviadas); a
  proposta aceita vira pedido. Projetos abertos podem ser filtrados por
  orçamento e ordenados por maior orçamento ou menos propostas.
- **Mensagens privadas** entre cliente e freelancer, com indicação de não lidas.
- Contadores de pendências no menu (pedidos que exigem ação, mensagens não lidas).

**Fora do escopo:** processamento de pagamentos (o pedido registra o valor
combinado, mas o protótipo não faz cobranças) e envio real de e-mails (ver
abaixo).

**Segurança** (referência: OWASP Top 10:2021)
- Senhas com scrypt e salt; política mínima de senha.
- Token anti-CSRF em todos os formulários.
- Limite de 5 tentativas de login em 15 minutos, por conta e por origem.
- Sessões com 256 bits de aleatoriedade, novo identificador a cada login,
  expiração por inatividade (2 h) e absoluta (12 h); cookie `HttpOnly` e
  `SameSite=Lax` (e `Secure` com `COOKIE_SECURE=1` quando servido por HTTPS).
- Upload de imagens validado pela assinatura binária do arquivo (não pelo tipo
  informado pelo navegador), com limite de 3 MB e nome aleatório.
- Cabeçalhos de segurança: Content-Security-Policy sem scripts embutidos,
  `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`.
- Controle de acesso por papel e por propriedade em todas as ações; escape de
  todo conteúdo exibido (XSS); consultas SQL preparadas.
- Recuperação de senha com link de uso único válido por 30 minutos.

**Privacidade (LGPD)**
- E-mail nunca exibido publicamente; contato pelas mensagens da plataforma.
- Consentimento registrado no cadastro (data e versão da política).
- Exportação dos dados do titular em JSON e exclusão da conta (com
  anonimização do que pertence também à outra parte).

**Usabilidade e acessibilidade (WCAG 2.2 AA)**
- Retorno à página desejada após o login; desfazer exclusões; página de ajuda.
- Link para pular ao conteúdo, foco visível, rótulos em todos os campos,
  avisos anunciados a leitores de tela, contraste mínimo de 4,5:1.

## E-mail simulado

O protótipo não se conecta a um servidor de e-mail. Mensagens como o link de
recuperação de senha são gravadas em `data/outbox/` e exibidas no console.

## Testes automatizados

```bash
npm test          # ou: node --test --test-concurrency=1 tests/*.test.js
```

São 77 testes (T01 a T77). A maioria sobe o servidor com banco temporário e
verifica, por meio de requisições HTTP reais, os requisitos funcionais, os
controles de segurança, os recursos de LGPD e a acessibilidade de 38 páginas;
os demais testam diretamente funções de segurança, a expiração das sessões, o
contraste das cores e a migração de bancos da primeira versão.

## Estrutura

```
nexo/
├── server.js            servidor HTTP: sessão, controle de acesso, CSRF, cabeçalhos
├── package.json         comandos npm start e npm test; exige Node.js >= 22.5
├── README.md            este arquivo
├── lib/                 acesso a dados e módulos de apoio
│   ├── db.js            esquema do banco, migrações e índices
│   ├── repo.js          consultas SQL preparadas e transações
│   ├── security.js      token anti-CSRF, limite de tentativas, cookies, imagens
│   ├── session.js       sessões (mantidas em memória)
│   ├── auth.js          hash e verificação de senhas (scrypt)
│   ├── http-helpers.js  leitura de formulários e de multipart, escape de HTML
│   ├── mailer.js        envio simulado de e-mails (data/outbox)
│   ├── config.js        configurações e prazos
│   └── seed.js          dados de demonstração
├── routes/              rotas e regras de negócio, um módulo por funcionalidade
├── views/               geração das páginas HTML
├── public/              style.css, app.js, fonts/ (Poppins) e uploads/ (somente imagens)
├── tests/               12 arquivos de teste (node:test) e o navegador de testes
├── seed-assets/         imagens usadas nos dados de demonstração
├── diagramas/           diagramas do sistema e suas fontes (Mermaid e HTML)
├── relatorio/           resultado da última execução dos testes
├── screenshot.js        geração das capturas de tela (requer Playwright, não incluído)
├── screenshots/         capturas de tela geradas por screenshot.js
└── data/                banco SQLite e e-mails simulados, criados na execução
```

Limitações conhecidas da arquitetura: as regras
de negócio ficam nas rotas, sem uma camada de serviços; o roteamento e a leitura
de `multipart/form-data` foram escritos sem bibliotecas; as sessões e o limite
de tentativas ficam em memória (perdidos ao reiniciar e inadequados para mais de
uma instância).
