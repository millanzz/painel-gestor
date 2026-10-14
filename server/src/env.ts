export const env = {
  databaseUrl: process.env.DATABASE_URL || 'postgres://painel:painel@localhost:5432/painel_gestor',
  jwtSecret: process.env.JWT_SECRET || 'dev-segredo-troque',
  port: Number(process.env.PORT || 3000),
  appUrl: process.env.APP_URL || 'http://localhost:5173',
  producao: process.env.NODE_ENV === 'production',
};

if (env.producao && env.jwtSecret === 'dev-segredo-troque') {
  console.warn('[aviso] JWT_SECRET não definido: defina um segredo forte em produção.');
}
