const e = process.env;

export const env = {
  databaseUrl: e.DATABASE_URL || 'postgres://painel:painel@localhost:5432/painel_gestor',
  jwtSecret: e.JWT_SECRET || 'dev-segredo-troque',
  port: Number(e.PORT || 3000),
  appUrl: (e.APP_URL || 'http://localhost:5173').replace(/\/$/, ''),
  producao: e.NODE_ENV === 'production',

  /* e-mail: com RESEND_API_KEY envia de verdade; sem, registra no histórico e no log */
  resendKey: e.RESEND_API_KEY || '',
  emailDe: e.EMAIL_FROM || 'Painel Gestor <nao-responda@painelgestor.com.br>',

  /* arquivos: "s3" (Amazon S3, Cloudflare R2, Supabase, MinIO…), "disco" (pasta local) ou "banco" (no PostgreSQL) */
  armazenamento: (e.STORAGE || (e.S3_BUCKET ? 's3' : 'disco')) as 's3' | 'disco' | 'banco',
  pastaUploads: e.UPLOAD_DIR || './uploads',
  s3: {
    bucket: e.S3_BUCKET || '',
    endpoint: e.S3_ENDPOINT || undefined,
    regiao: e.S3_REGION || 'auto',
    chave: e.S3_ACCESS_KEY_ID || '',
    segredo: e.S3_SECRET_ACCESS_KEY || '',
  },

  sentryDsn: e.SENTRY_DSN || '',

  /* "1" cria a exibidora de exemplo na primeira vez que o servidor sobe (para demonstração) */
  criarExemplo: e.CRIAR_EXEMPLO === '1',

  /* endereços dos provedores (trocáveis para testes) */
  focusUrl: { homologacao: e.FOCUS_URL_HOMOLOGACAO || 'https://homologacao.focusnfe.com.br', producao: e.FOCUS_URL_PRODUCAO || 'https://api.focusnfe.com.br' },
  zapiUrl: e.ZAPI_URL || 'https://api.z-api.io',
  resendUrl: e.RESEND_URL || 'https://api.resend.com',
};

if (env.producao && env.jwtSecret === 'dev-segredo-troque') {
  console.warn('[aviso] JWT_SECRET não definido: defina um segredo forte em produção.');
}
