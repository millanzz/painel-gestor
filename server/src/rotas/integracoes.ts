import { Router } from 'express';
import { z } from 'zod';
import { registrar } from '../auditoria';
import { soAdmin } from '../contexto';
import { pool, q, q1 } from '../db';
import { env } from '../env';
import { ErroApi, validar } from '../http';
import { carregar, mascarar, salvar } from '../integracoes/config';
import { aplicarRetorno, faltando } from '../integracoes/nfse';
import { enviarWhatsapp } from '../integracoes/whatsapp';
import { cobrancasAutomaticas, notasAutomaticas } from '../integracoes/automacoes';

export const integracoes = Router();

integracoes.get('/', soAdmin, async (req, res) => {
  const e = req.ctx!.empresaId;
  const w = await carregar(pool, e, 'whatsapp');
  const n = await carregar(pool, e, 'nfse');
  // Garante o segredo do webhook para mostrar o endereço completo.
  if (!n.segredos.webhook) { await salvar(pool, e, 'nfse', { provedor: n.provedor, config: n.config }); Object.assign(n, await carregar(pool, e, 'nfse')); }
  res.json({
    whatsapp: { provedor: w.provedor, config: w.config, segredos: mascarar(w.segredos) },
    nfse: {
      provedor: n.provedor, config: n.config, segredos: mascarar(n.segredos),
      webhook: `${env.appUrl}/api/webhooks/nfse/${e}/${n.segredos.webhook}`,
      pendencias: faltando({ tipo: 'receita', cliDoc: '00000000000', cliNome: 'x', cliLogradouro: 'x', cliCep: 'x', cliMunicipio: '0000000' }, req.ctx!.cfg, n, true),
    },
  });
});

const zWhats = z.object({
  provedor: z.enum(['desligado', 'simulado', 'zapi']),
  config: z.object({ automatico: z.boolean(), horaIni: z.number().int().min(0).max(23), horaFim: z.number().int().min(1).max(24), avisarFoto: z.boolean() }).partial(),
  segredos: z.object({ instancia: z.string(), token: z.string(), clientToken: z.string() }).partial().optional(),
});
const zNfse = z.object({
  provedor: z.enum(['manual', 'simulado', 'focus']),
  config: z.object({
    ambiente: z.enum(['homologacao', 'producao']), automatica: z.enum(['manual', 'ao_vencer', 'ao_pagar']), diasAntes: z.number().int().min(0).max(30),
    inscricaoMunicipal: z.string().trim(), codigoMunicipio: z.string().trim().regex(/^(\d{7})?$/, 'código IBGE com 7 dígitos'),
    codigoTributarioMunicipio: z.string().trim(), optanteSimples: z.boolean(), regimeEspecial: z.number().int().min(1).max(6).nullable(), issRetido: z.boolean(),
  }).partial(),
  segredos: z.object({ token: z.string() }).partial().optional(),
});

integracoes.put('/:tipo', soAdmin, async (req, res) => {
  const ctx = req.ctx!;
  const tipo = String(req.params.tipo);
  if (tipo !== 'whatsapp' && tipo !== 'nfse') throw new ErroApi(404, 'Integração desconhecida.');
  const d = validar(tipo === 'whatsapp' ? zWhats : zNfse, req.body);
  await salvar(pool, ctx.empresaId, tipo, d as any);
  await registrar(pool, ctx, 'alterou', 'integracoes', null, { rotulo: `${tipo === 'nfse' ? 'Nota fiscal' : 'WhatsApp'} · ${d.provedor}` });
  res.status(204).end();
});

integracoes.post('/whatsapp/teste', soAdmin, async (req, res) => {
  const { telefone } = validar(z.object({ telefone: z.string().min(8) }), req.body);
  const r = await enviarWhatsapp(req.ctx!.empresaId, telefone, `Teste do Painel Gestor: o WhatsApp automático de ${req.ctx!.cfg.empresa.razao || 'sua empresa'} está funcionando.`);
  if (!r.ok) throw new ErroApi(422, r.erro || 'Falha no envio.');
  res.json(r);
});

/** Roda agora as automações desta empresa (cobrança pela régua e notas), sem esperar a próxima hora. */
integracoes.post('/rodar', soAdmin, async (req, res) => {
  const e = req.ctx!.empresaId;
  res.json({ cobrancas: await cobrancasAutomaticas(true, e), notas: await notasAutomaticas(e) });
});

/** Histórico das mensagens enviadas (WhatsApp e e-mail). */
integracoes.get('/mensagens', async (req, res) => {
  const ctx = req.ctx!;
  if (!['admin', 'financeiro'].includes(ctx.perfil)) throw new ErroApi(403, 'Sem acesso.');
  res.json(await q(pool,
    `SELECT m.id, m.canal, m.provedor, m.para, m.assunto, m.texto, m.status, m.erro, m.automatica, m.criado_em, l.descricao AS lancamento
       FROM mensagens m LEFT JOIN lancamentos l ON l.id = m.lancamento_id WHERE m.empresa_id = $1 ORDER BY m.criado_em DESC LIMIT 100`, [ctx.empresaId]));
});

/**
 * Webhook da Focus NFe (gatilho de NFS-e). Público, protegido pelo segredo
 * no endereço. Cadastre o endereço mostrado em Configurações → Integrações.
 */
export const webhooks = Router();
webhooks.post('/nfse/:empresaId/:segredo', async (req, res) => {
  const n = await carregar(pool, String(req.params.empresaId), 'nfse').catch(() => null);
  if (!n || !n.segredos.webhook || n.segredos.webhook !== req.params.segredo) return res.status(404).end();
  const ref = String(req.body?.ref || '');
  const dono = ref ? await q1(pool, 'SELECT 1 FROM lancamentos WHERE nf_ref = $1 AND empresa_id = $2', [ref, req.params.empresaId]) : null;
  if (dono) await aplicarRetorno(pool, ref, req.body, n);
  res.status(200).json({ ok: true });
});
