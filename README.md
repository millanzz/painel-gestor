# Painel Gestor

Sistema web (SaaS) para exibidoras de mídia exterior: agenda das faces de outdoor, reservas e propostas, contratos com PI, equipe de campo com foto conferida no local, cobrança com PIX, notas e um portal para o anunciante acompanhar a campanha.

**Stack:** React 19 + Vite (TypeScript) · Node 22 + Express 5 (TypeScript) · PostgreSQL 16 com SQL puro (driver `pg`, sem ORM).

---

## Rodar na sua máquina

Pré-requisitos: Node 20 ou mais novo e Docker (só para o banco).

```bash
npm install
cp .env.example server/.env
npm run db:up         # sobe o PostgreSQL em localhost:5432
npm run db:migrate    # cria as tabelas
npm run db:seed       # opcional: carrega a exibidora de exemplo
npm run dev           # API em :3000 e front em http://localhost:5173
```

Contas do exemplo (senha `painel123`):

| E-mail | Perfil |
|---|---|
| admin@paineisabc.exemplo | Administrador |
| ana@paineisabc.exemplo | Comercial |
| bruno@paineisabc.exemplo | Financeiro |
| carlos@paineisabc.exemplo | Operação (campo) |
| marketing@rotasul.exemplo | Anunciante (portal) |

Para criar uma exibidora do zero, use "Criar conta" na tela de entrada: a empresa nasce com 14 dias de teste.

### Produção

```bash
npm run build                     # front em web/dist e API em server/dist
node server/dist/migrate.js
node server/dist/index.js         # serve a API e o front na mesma porta
```

Ou com Docker: `docker compose --profile app up --build` (API + front + banco). Defina `JWT_SECRET` e `APP_URL` de verdade.

---

## Integrações

Tudo funciona **sem nenhuma chave**: cada integração tem um modo simulado, que registra o que seria enviado e mostra o resultado na tela. É o modo do banco de exemplo, bom para apresentar o protótipo. Para ir para produção, preencha as chaves abaixo.

| Integração | Onde configurar | Sem configuração |
|---|---|---|
| **E-mail** (recuperação de senha, convites) via [Resend](https://resend.com) | `RESEND_API_KEY` e `EMAIL_FROM` no `.env` (domínio verificado no Resend) | e-mail fica no histórico de mensagens e no log do servidor |
| **Fotos e artes** em Amazon S3, Cloudflare R2 ou MinIO | `STORAGE=s3` e `S3_*` no `.env` | grava em disco (`UPLOAD_DIR`); no Docker, no volume `uploads` |
| **Monitoramento de erros** com [Sentry](https://sentry.io) | `SENTRY_DSN` (API) e `VITE_SENTRY_DSN` no `web/.env` (front) | desligado |
| **WhatsApp automático** via [Z-API](https://z-api.io) | Configurações → Integrações (instância, token e Client-Token), por empresa | mensagens simuladas, ou o botão abre o WhatsApp com o texto pronto |
| **NFS-e automática** via [Focus NFe](https://focusnfe.com.br) | Configurações → Integrações (token, ambiente, inscrição municipal, código IBGE, item da lista de serviço) | notas simuladas, numeradas a partir de 9001 |
| **Mapa** com Leaflet + OpenStreetMap | `VITE_MAPA_TILES` no `web/.env` para trocar o servidor de mapas | usa os tiles públicos do OSM |

Detalhes:

- **Fotos** são reduzidas para no máximo 1600 px (JPEG) depois que o GPS é lido. Fotos antigas gravadas no banco continuam abrindo.
- **WhatsApp:** com "Enviar as cobranças da régua sozinho" ligado, a rotina horária manda as cobranças do dia dentro do horário escolhido (horário de Brasília) e o cliente recebe aviso quando a primeira foto da campanha é conferida. Todo envio fica no histórico em Dinheiro → Cobrar hoje.
- **NFS-e:** a emissão pode ser manual, no vencimento (X dias antes) ou na baixa da parcela. Cadastre no Focus NFe o webhook mostrado na tela de Integrações (`/api/webhooks/nfse/<empresa>/<segredo>`) para receber a autorização na hora; sem ele, a rotina horária consulta as notas em processamento. O cliente precisa de CPF/CNPJ e endereço com código IBGE (o CEP preenche sozinho via ViaCEP). Teste primeiro no ambiente de homologação.
- **Segredos** das integrações ficam por empresa no banco e só voltam mascarados para a tela.
- **Termos de uso e política de privacidade** (`/termos`, `/privacidade`) são um modelo pensado para a LGPD: **revise com um advogado** e troque os dados da empresa antes de publicar. Quando a versão muda (`TERMOS_VERSAO` em `shared/src/constantes.ts`), todos aceitam de novo no próximo acesso.
- Z-API, Focus NFe e S3 foram testados contra servidores falsos que imitam as APIs; faça um teste real em homologação antes de ligar para clientes.

---

## O que o sistema faz

| Área | Quem usa | Principais recursos |
|---|---|---|
| **Início** | todos os perfis internos | Ocupação da bissemana, vendido no ano, a receber, atrasado; **próximas ações** com o botão para resolver cada uma (opção vencendo, desconto para aprovar, material atrasado, licença vencendo, cobrança do dia, fila que liberou). |
| **Agenda** | comercial, admin | Grade por bissemana (tape chart) agrupada por cidade, coluna de hoje, rodapé de ocupação, filtros, mapa real (Leaflet) com as faces coloridas por situação; LED mostra cotas usadas por período; seleção de várias faces → **nova reserva** no painel lateral. |
| **Nova reserva** | comercial, admin | Duração em BIs ou datas livres, escolha da BI com marcação de temporada, disponibilidade em tempo real, fila para faces ocupadas, preço de tabela e desconto por volume; cria a proposta ou entra num contrato existente. |
| **Vendas** | comercial, admin, financeiro | Proposta → aprovação (desconto acima do limite vai para o admin) → **PI** (confirma as faces, gera ordens de colagem/retirada e o acompanhamento de material) → encerrado; cancelamento com multa sobre o saldo não veiculado; renovação; troca de face; PDFs de proposta, PI e relatório de veiculação. |
| **Material** | comercial, operação | Etapas da arte (aguardando → aprovação → gráfica → recebido), prazo antes da colagem, arquivo da arte. |
| **Campo** | operação | Roteiro do dia pensado para o celular, próxima parada com rota no mapa, foto pela câmera: o servidor lê o GPS da foto (EXIF) e confere a distância até o ponto; a foto conclui a ordem de serviço e aparece no portal do cliente. OS com custo vira despesa da face. |
| **Dinheiro** | financeiro, admin | Resumo e fluxo de 6 semanas; **cobrar hoje** pela régua (antes/no dia/depois do vencimento) com envio automático pelo WhatsApp (ou mensagem pronta) e PIX copia e cola; lançamentos; baixas geram comissão de vendedor e agência; despesas fixas mensais (aluguel do terreno entra sozinho a partir do ponto); emissão, consulta e cancelamento de NFS-e; conciliação de extrato OFX/CSV. |
| **Painéis** | todos (edição: admin) | Pontos com licença da prefeitura e locação do terreno, faces com formato, medidas, preço por BI e cotas de LED, fotos do ponto, reajuste de preços em lote. |
| **Clientes** | comercial, financeiro, admin | Anunciantes e agências (com comissão), situação de pagamentos, bloqueio por atraso, convite para o portal, anonimização (LGPD). |
| **Relatórios** | comercial, financeiro, admin | Ocupação por mês/cidade/formato, vendas por vendedor e preço praticado, rentabilidade por face; exportação Excel/CSV. |
| **Administração** | admin | Usuários e convites, configurações (empresa, regras comerciais, PIX, régua, NFS-e, calendário de bissemanas, plano), importação de planilhas com prévia, backup em JSON, auditoria com antes/depois, lixeira com restauração e integrações (WhatsApp, NFS-e). |
| **Portal do anunciante** | cliente | Campanha no ar com as fotos conferidas, propostas para aceitar, pagamentos com PIX, relatório de veiculação. Vê só o que é dele. |

---

## Como o código está organizado

```
shared/src/      regras puras usadas pela API e pelo front
  datas.ts         calendário de bissemanas (BI 01–26, ajustável por empresa)
  precos.ts        tabela por período com temporada, volume, cálculo do contrato, parcelas
  perfis.ts        perfis, áreas que cada um vê e recursos que edita
  pix.ts           BR Code (PIX copia e cola) com CRC16
server/
  db/migrations/   SQL versionado (aplicado por server/src/migrate.ts)
  src/
    db.ts          pool do pg, transação, INSERT/UPDATE com lista de campos permitidos
    contexto.ts    sessão (JWT em cookie httpOnly), empresa ativa, checagem de perfil e de plano
    crud.ts        rotas REST genéricas com validação (zod), auditoria, lixeira e ganchos
    dominio.ts     disponibilidade (trava a face com SELECT … FOR UPDATE), OS automáticas, comissões, rotinas
    rotas/         uma pasta por área (reservas, contratos, financeiro, campo, portal, pdf…)
  test/            testes de ponta a ponta contra um PostgreSQL real
web/src/
  ui/estilo.css    fundamentos visuais (tokens de espaço, tipo, cor e sombra)
  ui/              casca com menu lateral, componentes, formulário genérico
  paginas/         uma tela por arquivo
```

### Decisões que vale saber

- **Multiempresa por coluna.** Toda tabela de negócio tem `empresa_id`, e toda consulta filtra por ela a partir da sessão. Uma pessoa pode estar em várias empresas com perfis diferentes.
- **SQL puro.** Consultas escritas à mão com parâmetros (`$1`), sem concatenar entrada do usuário. As colunas que cada rota grava vêm de uma lista fixa; o zod valida e converte os tipos antes.
- **Venda sem conflito.** Antes de gravar uma reserva, a API trava a linha da face (`FOR UPDATE`) e confere as reservas que seguram o período. No LED, soma as cotas no pico de uso.
- **Opção expira sozinha.** Uma rotina horária libera opções vencidas e encerra contratos cuja última face saiu do ar.
- **Exclusão é lógica.** Tudo vai para a lixeira (`excluido_em`) e pode ser restaurado; a auditoria guarda quem fez, quando e o que mudou.
- **Assinatura vencida = modo leitura.** O admin continua podendo acessar Configurações para escolher um plano. A cobrança da assinatura em si não está implementada (ver próximos passos).
- **Fotos e artes fora do banco** (disco ou S3/R2), servidas pela API só para quem tem acesso; o anunciante só abre arquivos das próprias campanhas.
- **Integrações atrás de uma camada própria** (`server/src/integracoes/`): trocar de provedor mexe em um arquivo só.
- **Fontes servidas pelo próprio app** (IBM Plex via `@fontsource`), sem chamar o Google.

### Design

O front segue o design aprovado: IBM Plex Sans/Mono, escala de espaçamento de 8 px do Atlassian Design, escala tipográfica produtiva do IBM Carbon, cards sem borda com sombra em camadas, um único azul (`#2346D6`) para ação e "agora", textura leve no fundo. Os tokens estão no topo de `web/src/ui/estilo.css`.

---

## Testes

```bash
npm test          # recria os dados de exemplo e testa a API de ponta a ponta
npm run typecheck
```

Os testes cobrem login e isolamento entre empresas, permissões por perfil, conflito de reserva e cotas de LED, o fluxo proposta → desconto → PI → parcelas → baixa com comissão → cancelamento com multa, numeração, régua de cobrança com PIX, recorrências sem duplicar, conciliação, foto do campo concluindo a OS, portal do anunciante (inclusive acesso negado a arquivo de outro cliente), lixeira, auditoria, importação e convite, aceite dos termos, recuperação de senha, armazenamento em S3, envio pelo WhatsApp, emissão/consulta/cancelamento de NFS-e com webhook e emissão automática na baixa.

---

## Próximos passos sugeridos

- Cobrança da assinatura (Stripe, Pagar.me ou Asaas) ligada à rota `/api/empresa/plano`.
- Testar Z-API e Focus NFe com contas reais em homologação e cadastrar o webhook.
- Revisão jurídica dos termos de uso e da política de privacidade.
- Marketplace para quem quer alugar painéis (pausado nesta versão).
