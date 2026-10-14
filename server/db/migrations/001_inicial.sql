-- Painel Gestor · esquema inicial
-- Todas as tabelas de negócio têm empresa_id: cada exibidora só enxerga os
-- próprios dados. Exclusão é lógica (excluido_em) para permitir a lixeira.

CREATE TABLE usuarios (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        text NOT NULL,
  email       text NOT NULL,
  senha_hash  text NOT NULL,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX usuarios_email_uq ON usuarios (lower(email));

CREATE TABLE empresas (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       text NOT NULL,
  config     jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE clientes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome           text NOT NULL,
  tipo           text NOT NULL DEFAULT 'anunciante' CHECK (tipo IN ('anunciante','agencia')),
  documento      text NOT NULL DEFAULT '',
  contato        text NOT NULL DEFAULT '',
  email          text NOT NULL DEFAULT '',
  telefone       text NOT NULL DEFAULT '',
  comissao       numeric(5,2) NOT NULL DEFAULT 0,
  cidade         text NOT NULL DEFAULT '',
  obs            text NOT NULL DEFAULT '',
  anonimizado_em date,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  excluido_em    timestamptz,
  excluido_por   text
);
CREATE INDEX clientes_empresa_idx ON clientes (empresa_id);

CREATE TABLE membros (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id     uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  nome           text NOT NULL,
  email          text NOT NULL DEFAULT '',
  perfil         text NOT NULL CHECK (perfil IN ('admin','comercial','financeiro','operacao','cliente')),
  cliente_id     uuid REFERENCES clientes(id),
  convite        text UNIQUE,
  ativo          boolean NOT NULL DEFAULT true,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  excluido_em    timestamptz,
  excluido_por   text,
  CHECK (perfil <> 'cliente' OR cliente_id IS NOT NULL)
);
CREATE UNIQUE INDEX membros_usuario_uq ON membros (empresa_id, usuario_id) WHERE usuario_id IS NOT NULL AND excluido_em IS NULL;

CREATE TABLE estruturas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  codigo           text NOT NULL,
  endereco         text NOT NULL DEFAULT '',
  bairro           text NOT NULL DEFAULT '',
  cidade           text NOT NULL DEFAULT '',
  uf               text NOT NULL DEFAULT '',
  lat              numeric(9,6),
  lng              numeric(9,6),
  lic_numero       text NOT NULL DEFAULT '',
  lic_orgao        text NOT NULL DEFAULT '',
  lic_taxa         numeric(12,2),
  lic_vencimento   date,
  loc_proprietario text NOT NULL DEFAULT '',
  loc_contato      text NOT NULL DEFAULT '',
  loc_valor        numeric(12,2),
  loc_dia          smallint CHECK (loc_dia BETWEEN 1 AND 31),
  loc_indice       text NOT NULL DEFAULT '',
  loc_reajuste     date,
  loc_vencimento   date,
  obs              text NOT NULL DEFAULT '',
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  excluido_em      timestamptz,
  excluido_por     text
);
CREATE UNIQUE INDEX estruturas_codigo_uq ON estruturas (empresa_id, lower(codigo)) WHERE excluido_em IS NULL;

CREATE TABLE paineis (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  estrutura_id  uuid REFERENCES estruturas(id),
  codigo        text NOT NULL,
  face          text NOT NULL DEFAULT 'Única',
  tipo          text NOT NULL CHECK (tipo IN ('outdoor','frontlight','backlight','empena','led','triedro')),
  largura       numeric(6,2),
  altura        numeric(6,2),
  iluminado     boolean NOT NULL DEFAULT false,
  valor_bi      numeric(12,2) NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','inativo')),
  sentido       text NOT NULL DEFAULT '',
  slots         smallint NOT NULL DEFAULT 1 CHECK (slots >= 1),
  insercao_seg  smallint,
  loop_seg      smallint,
  horas_dia     smallint,
  obs           text NOT NULL DEFAULT '',
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  excluido_em   timestamptz,
  excluido_por  text
);
CREATE UNIQUE INDEX paineis_codigo_uq ON paineis (empresa_id, lower(codigo)) WHERE excluido_em IS NULL;

CREATE TABLE contratos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  numero                text NOT NULL,
  cliente_id            uuid NOT NULL REFERENCES clientes(id),
  agencia_id            uuid REFERENCES clientes(id),
  vendedor_id           uuid REFERENCES membros(id),
  campanha              text NOT NULL DEFAULT '',
  data                  date NOT NULL DEFAULT CURRENT_DATE,
  valor                 numeric(12,2) NOT NULL DEFAULT 0,
  valor_tabela          numeric(12,2),
  status                text NOT NULL DEFAULT 'proposta'
                        CHECK (status IN ('proposta','aprovacao','aprovada','ativo','encerrado','cancelado')),
  pi_numero             text,
  pi_data               date,
  validade_proposta     date,
  condicoes             text NOT NULL DEFAULT '',
  obs                   text NOT NULL DEFAULT '',
  aprovado_em           date,
  desconto_aprovado_por text,
  cancelado_em          date,
  multa                 numeric(12,2),
  motivo_cancelamento   text,
  renovado_de           uuid REFERENCES contratos(id),
  aceito_em             timestamptz,
  aceito_por            text,
  criado_em             timestamptz NOT NULL DEFAULT now(),
  atualizado_em         timestamptz NOT NULL DEFAULT now(),
  excluido_em           timestamptz,
  excluido_por          text
);
CREATE UNIQUE INDEX contratos_numero_uq ON contratos (empresa_id, numero);
CREATE INDEX contratos_cliente_idx ON contratos (empresa_id, cliente_id);

CREATE TABLE reservas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  painel_id     uuid NOT NULL REFERENCES paineis(id),
  contrato_id   uuid REFERENCES contratos(id),
  campanha      text NOT NULL DEFAULT '',
  ini           date NOT NULL,
  fim           date NOT NULL,
  status        text NOT NULL CHECK (status IN ('reservado','confirmado','fila','expirada','cancelada')),
  validade      date,
  slots         smallint NOT NULL DEFAULT 1 CHECK (slots >= 1),
  expirada_em   date,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  excluido_em   timestamptz,
  excluido_por  text,
  CHECK (fim >= ini)
);
CREATE INDEX reservas_painel_periodo_idx ON reservas (painel_id, ini, fim) WHERE excluido_em IS NULL;
CREATE INDEX reservas_contrato_idx ON reservas (contrato_id);

CREATE TABLE arquivos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome        text NOT NULL,
  mime        text NOT NULL,
  tamanho     integer NOT NULL,
  dados       bytea NOT NULL,
  criado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE artes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  contrato_id   uuid NOT NULL REFERENCES contratos(id),
  status        text NOT NULL DEFAULT 'aguardando'
                CHECK (status IN ('aguardando','aprovacao','aprovada','grafica','recebido')),
  prazo         date,
  necessario    text NOT NULL DEFAULT '',
  grafica       text NOT NULL DEFAULT '',
  previsao      date,
  recebido      text NOT NULL DEFAULT '',
  recebido_em   date,
  obs           text NOT NULL DEFAULT '',
  arquivo_id    uuid REFERENCES arquivos(id),
  nome_arquivo  text,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  excluido_em   timestamptz,
  excluido_por  text
);
CREATE UNIQUE INDEX artes_contrato_uq ON artes (contrato_id) WHERE excluido_em IS NULL;

CREATE TABLE recorrencias (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  descricao     text NOT NULL,
  categoria     text NOT NULL,
  valor         numeric(12,2) NOT NULL,
  dia           smallint NOT NULL CHECK (dia BETWEEN 1 AND 31),
  estrutura_id  uuid REFERENCES estruturas(id),
  painel_id     uuid REFERENCES paineis(id),
  ativo         boolean NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  excluido_em   timestamptz,
  excluido_por  text
);

CREATE TABLE lancamentos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  tipo           text NOT NULL CHECK (tipo IN ('receita','despesa')),
  categoria      text NOT NULL,
  descricao      text NOT NULL,
  contrato_id    uuid REFERENCES contratos(id),
  painel_id      uuid REFERENCES paineis(id),
  estrutura_id   uuid REFERENCES estruturas(id),
  vencimento     date NOT NULL,
  valor          numeric(12,2) NOT NULL CHECK (valor >= 0),
  status         text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','pago','cancelado')),
  pago_em        date,
  nf_status      text CHECK (nf_status IN ('a_emitir','emitida','cancelada')),
  nf_numero      text,
  nf_data        date,
  nf_link        text,
  recorrencia_id uuid REFERENCES recorrencias(id),
  competencia    text,
  comissao_de    uuid REFERENCES lancamentos(id),
  comissao_tipo  text CHECK (comissao_tipo IN ('vendedor','agencia')),
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  excluido_em    timestamptz,
  excluido_por   text
);
CREATE INDEX lancamentos_venc_idx ON lancamentos (empresa_id, vencimento);
CREATE INDEX lancamentos_contrato_idx ON lancamentos (contrato_id);
CREATE UNIQUE INDEX lancamentos_recorrencia_uq ON lancamentos (recorrencia_id, competencia)
  WHERE recorrencia_id IS NOT NULL AND excluido_em IS NULL;

CREATE TABLE cobrancas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  lancamento_id  uuid NOT NULL REFERENCES lancamentos(id),
  etapa          smallint NOT NULL,
  canal          text NOT NULL DEFAULT 'whatsapp',
  enviada_em     timestamptz NOT NULL DEFAULT now(),
  membro_id      uuid REFERENCES membros(id),
  UNIQUE (lancamento_id, etapa)
);

CREATE TABLE ordens_servico (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  painel_id     uuid NOT NULL REFERENCES paineis(id),
  reserva_id    uuid REFERENCES reservas(id),
  contrato_id   uuid REFERENCES contratos(id),
  tipo          text NOT NULL CHECK (tipo IN ('colagem','retirada','conteudo','iluminacao','estrutura','limpeza','vistoria')),
  abertura      date NOT NULL DEFAULT CURRENT_DATE,
  prazo         date,
  responsavel   text NOT NULL DEFAULT '',
  membro_id     uuid REFERENCES membros(id),
  status        text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','andamento','concluida')),
  custo         numeric(12,2) NOT NULL DEFAULT 0,
  descricao     text NOT NULL DEFAULT '',
  concluida_em  date,
  despesa_id    uuid REFERENCES lancamentos(id),
  automatica    boolean NOT NULL DEFAULT false,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  excluido_em   timestamptz,
  excluido_por  text
);
CREATE INDEX os_prazo_idx ON ordens_servico (empresa_id, status, prazo);

CREATE TABLE comprovacoes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  reserva_id    uuid REFERENCES reservas(id),
  painel_id     uuid NOT NULL REFERENCES paineis(id),
  contrato_id   uuid REFERENCES contratos(id),
  data          date NOT NULL DEFAULT CURRENT_DATE,
  membro_id     uuid REFERENCES membros(id),
  tipo          text NOT NULL DEFAULT 'colagem',
  arquivo_id    uuid NOT NULL REFERENCES arquivos(id),
  exif          jsonb NOT NULL DEFAULT '{}'::jsonb,
  verificacao   text NOT NULL CHECK (verificacao IN ('ok','longe','sem_gps','sem_ponto')),
  distancia_m   integer,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  excluido_em   timestamptz,
  excluido_por  text
);
CREATE INDEX comprovacoes_contrato_idx ON comprovacoes (contrato_id);

CREATE TABLE fotos_ponto (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  estrutura_id  uuid NOT NULL REFERENCES estruturas(id),
  data          date NOT NULL DEFAULT CURRENT_DATE,
  arquivo_id    uuid NOT NULL REFERENCES arquivos(id),
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  excluido_em   timestamptz,
  excluido_por  text
);

CREATE TABLE auditoria (
  id           bigserial PRIMARY KEY,
  empresa_id   uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  quando       timestamptz NOT NULL DEFAULT now(),
  autor_id     uuid,
  autor_nome   text NOT NULL,
  perfil       text NOT NULL,
  acao         text NOT NULL,
  tabela       text NOT NULL,
  registro_id  uuid,
  rotulo       text NOT NULL DEFAULT '',
  mudancas     jsonb NOT NULL DEFAULT '[]'::jsonb,
  contrato_id  uuid
);
CREATE INDEX auditoria_empresa_idx ON auditoria (empresa_id, quando DESC);
CREATE INDEX auditoria_contrato_idx ON auditoria (contrato_id);
