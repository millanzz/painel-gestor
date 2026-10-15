import cookieParser from 'cookie-parser';
import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { naEmpresa, soAdmin } from './contexto';
import { pool } from './db';
import { rotinas } from './dominio';
import { env } from './env';
import { tratarErros } from './http';
import { iniciarMonitoramento } from './monitoramento';
import { rotasCrud } from './crud';
import { agenda } from './rotas/agenda';
import { rotasArtes } from './rotas/artes';
import { auditoria } from './rotas/auditoria';
import { auth } from './rotas/auth';
import { anonimizarCliente, defClientes, defEstruturas, defPaineis, defRecorrencias, reajustarPrecos } from './rotas/cadastros';
import { arquivos, campo, rotasOS } from './rotas/campo';
import { rotasContratos } from './rotas/contratos';
import { empresa, rotasMembros } from './rotas/empresa';
import { financeiro, rotasLancamentos } from './rotas/financeiro';
import { importacao } from './rotas/importacao';
import { inicio } from './rotas/inicio';
import { pdf } from './rotas/pdf';
import { integracoes, webhooks } from './rotas/integracoes';
import { cobrancasAutomaticas, notasAutomaticas } from './integracoes/automacoes';
import { portal } from './rotas/portal';
import { relatorios } from './rotas/relatorios';
import { rotasReservas } from './rotas/reservas';
import { tx } from './db';
import { validar } from './http';
import { z } from 'zod';

export function criarApp() {
  iniciarMonitoramento();
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  app.get('/api/saude', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  });

  app.use('/api/auth', auth);
  app.use('/api/webhooks', webhooks);

  // Tudo abaixo exige usuário logado com acesso à empresa ativa.
  const api = express.Router();
  api.use(naEmpresa);
  api.use('/inicio', inicio);
  api.use('/agenda', agenda);
  api.use('/estruturas', rotasCrud(defEstruturas));
  api.use('/paineis', rotasCrud(defPaineis, (r) => {
    r.post('/reajuste', soAdmin, async (req, res) => {
      const d = validar(z.object({ ids: z.array(z.string().uuid()).min(1), pct: z.number().min(-90).max(500), arredondar: z.number().min(0).default(10) }), req.body);
      res.json({ n: await tx((c) => reajustarPrecos(c, req.ctx!, d.ids, d.pct, d.arredondar)) });
    });
  }));
  api.use('/clientes', rotasCrud(defClientes, (r) => {
    r.post('/:id/anonimizar', soAdmin, async (req, res) => {
      await tx((c) => anonimizarCliente(c, req.ctx!, String(req.params.id)));
      res.status(204).end();
    });
  }));
  api.use('/recorrencias', rotasCrud(defRecorrencias));
  api.use('/reservas', rotasReservas);
  api.use('/contratos', rotasContratos);
  api.use('/lancamentos', rotasLancamentos);
  api.use('/financeiro', financeiro);
  api.use('/os', rotasOS);
  api.use('/campo', campo);
  api.use('/artes', rotasArtes);
  api.use('/arquivos', arquivos);
  api.use('/relatorios', relatorios);
  api.use('/portal', portal);
  api.use('/empresa', empresa);
  api.use('/membros', rotasMembros);
  api.use('/auditoria', auditoria);
  api.use('/importacao', importacao);
  api.use('/pdf', pdf);
  api.use('/integracoes', integracoes);
  app.use('/api', api);
  app.use('/api', (_req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

  // Em produção, a API também entrega o front compilado.
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const web = [path.resolve(dir, '../../web/dist'), path.resolve(dir, '../web/dist')].find((p) => existsSync(p));
  if (web) {
    app.use(express.static(web, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(web, 'index.html')));
  }

  app.use(tratarErros);
  return app;
}

const ehPrincipal = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (ehPrincipal) {
  const app = criarApp();
  app.listen(env.port, () => console.log(`Painel Gestor rodando em http://localhost:${env.port}`));
  const rodar = async () => {
    try {
      const n = await rotinas(pool);
      if (n) console.log(`[rotinas] ${n} opção(ões) vencida(s) liberada(s)`);
      const c = await cobrancasAutomaticas();
      if (c) console.log(`[rotinas] ${c} cobrança(s) enviada(s) pelo WhatsApp`);
      const nf = await notasAutomaticas();
      if (nf) console.log(`[rotinas] ${nf} nota(s) fiscal(is) emitida(s)`);
    } catch (e: any) { console.error('[rotinas]', e.message); }
  };
  rodar();
  setInterval(rodar, 60 * 60 * 1000);
}
