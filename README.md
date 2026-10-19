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

- Node.js 22.13 ou superior (usa o módulo `node:sqlite`, disponível sem opções adicionais a partir dessa versão)
- Versões em que a suíte foi executada: Node.js 22.22.2 (SQLite 3.51.2) e Node.js 22.22.0 (SQLite 3.50.4), em Linux, e também em Windows (`relatorio/execucao-windows.txt`); os demais registros da pasta `relatorio/` são da versão 22.22.0, em Linux

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

### Contas de demonstração (senha para todas: `conta demo 2026`)

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

**Segurança** (referências: OWASP Top 10:2021 e OWASP ASVS 4.0.3). O protótipo
implementa e testa controles relacionados a categorias selecionadas do OWASP
Top 10; isso não equivale a uma auditoria de segurança completa.
- Senhas com scrypt e salt. Política de senha: 12 a 128 caracteres, sem regras
  de composição (frases com espaços são aceitas), recusando senhas da lista local
  de senhas mais usadas (`lib/senhas-comuns.txt`), sequências óbvias e senhas que
  contenham o e-mail ou o nome.
- Token anti-CSRF em todos os formulários.
- Login protegido sem permitir o bloqueio proposital de contas: 5 falhas em
  15 minutos bloqueiam a combinação conta + origem; 20 falhas bloqueiam a origem;
  por conta, a espera entre tentativas cresce até 60 s, exceto no navegador em
  que o usuário já entrou (cookie de dispositivo conhecido).
- Limite de envios por usuário: 30 mensagens a cada 10 minutos, 10 propostas e
  10 publicações (serviços ou projetos) por hora.
- Sessões com 256 bits de aleatoriedade, novo identificador a cada login,
  expiração por inatividade (2 h) e absoluta (12 h); cookie `HttpOnly` e
  `SameSite=Lax` (e `Secure` com `COOKIE_SECURE=1` quando servido por HTTPS).
- Upload de imagens validado pela assinatura binária do arquivo (não pelo tipo
  informado pelo navegador), com limite de 3 MB e de 4000 × 4000 pixels, nome
  aleatório, estrutura do arquivo verificada e remoção de metadados (EXIF com a
  localização da foto, XMP, IPTC, textos embutidos); no máximo 24 itens de
  portfólio por freelancer; foto e capa substituídas são apagadas do disco; arquivos guardados em `data/uploads`, fora da pasta
  pública, e entregues por uma rota que só serve imagens.
- Cabeçalhos de segurança: Content-Security-Policy sem scripts embutidos,
  `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`.
- Controle de acesso por papel e por propriedade em todas as ações; escape de
  todo conteúdo exibido (XSS); consultas SQL preparadas.
- Recuperação de senha com link de uso único válido por 30 minutos.

**Privacidade (LGPD)**
- E-mail nunca exibido publicamente; contato pelas mensagens da plataforma.
- Consentimento registrado no cadastro (data e versão da política).
- Exportação dos dados do titular em JSON e exclusão da conta: e-mail, senha,
  dados do perfil e imagens enviadas são apagados; o nome é substituído nos
  pedidos, conversas e avaliações, que permanecem por fazerem parte do histórico
  da outra parte (detalhes na página Privacidade). São recursos relacionados aos
  princípios e direitos da LGPD, não uma garantia de conformidade integral.

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

São 87 testes (T01 a T87): 75 de integração, que sobem o servidor com banco
temporário e fazem requisições HTTP reais; 11 unitários (funções de segurança,
sessão, política de senha e contraste das cores); e 1 de integração com o banco
(migração de bancos da primeira versão). Cada teste prepara os próprios dados e
pode ser executado sozinho.

Verificações complementares (resultados na pasta `relatorio/`):

```bash
node --test --experimental-test-coverage --test-concurrency=1 --test-coverage-exclude='tests/**' tests/*.test.js   # cobertura
node scripts/isolamento.js       # cada teste executado sozinho; suíte em ordem inversa e em paralelo
node scripts/mutacao.js          # teste de mutação dos módulos críticos (30 mutantes)
node scripts/desempenho.js       # tempo de resposta sob carga mínima
node scripts/e2e-navegador.js    # ponta a ponta em navegador real (requer Playwright)
node scripts/manutenibilidade.js # dependências entre módulos, complexidade e duplicação
```

## Estrutura

```
nexo/
├── server.js            servidor HTTP: sessão, controle de acesso, CSRF, cabeçalhos
├── package.json         comandos npm start e npm test; exige Node.js >= 22.13
├── README.md            este arquivo
├── lib/                 acesso a dados e módulos de apoio
│   ├── db.js            esquema do banco, migrações e índices
│   ├── repo.js          consultas SQL preparadas e transações
│   ├── security.js      token anti-CSRF, proteção do login, limite de envios, cookies
│   ├── images.js        validação das imagens enviadas e remoção de metadados
│   ├── senhas-comuns.txt senhas mais usadas, recusadas no cadastro (SecLists, MIT)
│   ├── session.js       sessões (mantidas em memória)
│   ├── auth.js          hash e verificação de senhas (scrypt)
│   ├── http-helpers.js  leitura de formulários e de multipart, escape de HTML
│   ├── mailer.js        envio simulado de e-mails (data/outbox)
│   ├── config.js        configurações e prazos
│   └── seed.js          dados de demonstração
├── routes/              rotas e regras de negócio, um módulo por funcionalidade
├── views/               geração das páginas HTML
├── public/              style.css, app.js e fonts/ (Poppins)
├── tests/               14 arquivos de teste (node:test), o navegador de testes e imagens de teste
├── scripts/             isolamento, mutação, desempenho, navegador real e manutenibilidade
├── seed-assets/         imagens usadas nos dados de demonstração
├── diagramas/           diagramas do sistema e suas fontes (Mermaid e HTML)
├── relatorio/           resultados dos testes e das verificações complementares
├── screenshot.js        geração das capturas de tela (requer Playwright, não incluído)
├── screenshots/         capturas de tela geradas por screenshot.js
└── data/                banco SQLite, imagens enviadas (uploads/) e e-mails simulados, criados na execução
```

Limitações conhecidas da arquitetura: as regras
de negócio ficam nas rotas, sem uma camada de serviços; o roteamento e a leitura
de `multipart/form-data` foram escritos sem bibliotecas; as sessões e o limite
de tentativas ficam em memória (perdidos ao reiniciar e inadequados para mais de
uma instância).
