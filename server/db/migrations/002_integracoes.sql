-- Conta (redefinição de senha, termos), arquivos fora do banco,
-- endereço fiscal do cliente, WhatsApp e NFS-e automáticos.

-- Termos de uso e política de privacidade
ALTER TABLE usuarios ADD COLUMN termos_versao text;
ALTER TABLE usuarios ADD COLUMN termos_aceitos_em timestamptz;

-- Redefinição de senha: guardamos só o hash do token
CREATE TABLE senha_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  expira_em   timestamptz NOT NULL,
  usado_em    timestamptz,
  criado_em   timestamptz NOT NULL DEFAULT now()
);

-- Arquivos: o conteúdo passa a ficar no armazenamento (S3/R2 ou disco);
-- "dados" continua só para arquivos antigos.
ALTER TABLE arquivos ALTER COLUMN dados DROP NOT NULL;
ALTER TABLE arquivos ADD COLUMN chave text;
ALTER TABLE arquivos ADD COLUMN armazenamento text NOT NULL DEFAULT 'banco';

-- Endereço fiscal do cliente (tomador da nota)
ALTER TABLE clientes ADD COLUMN cep text NOT NULL DEFAULT '';
ALTER TABLE clientes ADD COLUMN logradouro text NOT NULL DEFAULT '';
ALTER TABLE clientes ADD COLUMN numero text NOT NULL DEFAULT '';
ALTER TABLE clientes ADD COLUMN complemento text NOT NULL DEFAULT '';
ALTER TABLE clientes ADD COLUMN bairro text NOT NULL DEFAULT '';
ALTER TABLE clientes ADD COLUMN uf text NOT NULL DEFAULT '';
ALTER TABLE clientes ADD COLUMN codigo_municipio text NOT NULL DEFAULT '';
ALTER TABLE clientes ADD COLUMN inscricao_municipal text NOT NULL DEFAULT '';

-- Credenciais das integrações por empresa (nunca devolvidas inteiras para a tela)
CREATE TABLE integracoes (
  empresa_id  uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  tipo        text NOT NULL CHECK (tipo IN ('whatsapp','nfse')),
  provedor    text NOT NULL DEFAULT 'desligado',
  config      jsonb NOT NULL DEFAULT '{}'::jsonb,
  segredos    jsonb NOT NULL DEFAULT '{}'::jsonb,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, tipo)
);

-- Histórico de mensagens enviadas (WhatsApp e e-mail)
CREATE TABLE mensagens (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid REFERENCES empresas(id) ON DELETE CASCADE,
  canal          text NOT NULL CHECK (canal IN ('whatsapp','email')),
  provedor       text NOT NULL,
  para           text NOT NULL,
  assunto        text,
  texto          text NOT NULL,
  status         text NOT NULL CHECK (status IN ('enviada','simulada','erro')),
  erro           text,
  externo_id     text,
  lancamento_id  uuid REFERENCES lancamentos(id),
  automatica     boolean NOT NULL DEFAULT false,
  criado_em      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mensagens_empresa_idx ON mensagens (empresa_id, criado_em DESC);

-- Nota fiscal: novos estados (processando, erro) e retorno do emissor
ALTER TABLE lancamentos DROP CONSTRAINT lancamentos_nf_status_check;
ALTER TABLE lancamentos ADD CONSTRAINT lancamentos_nf_status_check
  CHECK (nf_status IN ('a_emitir','processando','emitida','erro','cancelada'));
ALTER TABLE lancamentos ADD COLUMN nf_ref text;
ALTER TABLE lancamentos ADD COLUMN nf_erro text;
ALTER TABLE lancamentos ADD COLUMN nf_xml text;
ALTER TABLE lancamentos ADD COLUMN nf_codigo_verificacao text;
ALTER TABLE lancamentos ADD COLUMN nf_simulada boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX lancamentos_nf_ref_uq ON lancamentos (nf_ref) WHERE nf_ref IS NOT NULL;
