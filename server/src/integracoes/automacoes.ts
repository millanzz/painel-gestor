// Rotinas automáticas por empresa: cobrança pela régua no WhatsApp e emissão
// de NFS-e. Rodam junto com as rotinas de hora em hora.
import { addDays, mesclarConfig, today } from '@shared';
import type { Ctx } from '../contexto';
import { pool, q, q1 } from '../db';
import { etapaCobranca, mensagemCobranca } from '../rotas/financeiro';
import { carregar } from './config';
import { consultarNota, emitirNota } from './nfse';
import { enviarWhatsapp } from './whatsapp';

/** Hora atual em São Paulo (0–23). */
const horaBrasil = () => Number(new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }).format(new Date()));

/** Contexto mínimo para as funções que montam mensagens. */
async function ctxSistema(empresaId: string): Promise<Ctx> {
  const e = await q1<any>(pool, 'SELECT config FROM empresas WHERE id = $1', [empresaId]);
  return { usuarioId: '', usuarioNome: 'Automático', email: '', empresaId, membroId: null as any, perfil: 'admin', clienteId: null, autorNome: 'Automático', cfg: mesclarConfig(e?.config) };
}

/** Envia uma cobrança da régua e marca a etapa como enviada. */
export async function enviarCobranca(ctx: Ctx, lancamento: any, etapa: number, automatica: boolean) {
  const texto = mensagemCobranca(ctx, lancamento, etapa);
  const r = await enviarWhatsapp(ctx.empresaId, lancamento.clienteTelefone || '', texto, { lancamentoId: lancamento.id, automatica });
  if (r.ok) {
    await pool.query(
      `INSERT INTO cobrancas (empresa_id, lancamento_id, etapa, canal, membro_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (lancamento_id, etapa) DO NOTHING`,
      [ctx.empresaId, lancamento.id, etapa, automatica ? 'whatsapp-auto' : 'whatsapp-api', ctx.membroId || null]);
  }
  return r;
}

export async function cobrancasAutomaticas(forcar = false, soEmpresa?: string) {
  let enviadas = 0;
  const hora = horaBrasil();
  const empresas = (await q<any>(pool, `SELECT empresa_id FROM integracoes WHERE tipo = 'whatsapp' AND provedor <> 'desligado' AND (config->>'automatico')::boolean`))
    .filter((x) => !soEmpresa || x.empresaId === soEmpresa);
  for (const { empresaId } of empresas) {
    const cfgW = await carregar(pool, empresaId, 'whatsapp');
    if (!forcar && (hora < cfgW.config.horaIni || hora >= cfgW.config.horaFim)) continue;
    const ctx = await ctxSistema(empresaId);
    const abertas = await q<any>(pool,
      `SELECT l.*, c.nome AS cliente_nome, c.telefone AS cliente_telefone, c.contato AS cliente_contato,
              (SELECT array_agg(etapa) FROM cobrancas cb WHERE cb.lancamento_id = l.id) AS enviadas
         FROM lancamentos l LEFT JOIN contratos k ON k.id = l.contrato_id LEFT JOIN clientes c ON c.id = k.cliente_id
        WHERE l.empresa_id = $1 AND l.tipo = 'receita' AND l.status = 'aberto' AND l.categoria <> 'comissao' AND l.excluido_em IS NULL`, [empresaId]);
    for (const f of abertas) {
      const { etapa } = etapaCobranca(ctx.cfg.regua, f.vencimento);
      if (etapa == null || (f.enviadas || []).includes(etapa) || !f.clienteTelefone) continue;
      // Não reenvia se já houve falha hoje para esta parcela (evita insistir num número errado).
      const falhou = await q1(pool, `SELECT 1 FROM mensagens WHERE lancamento_id = $1 AND status = 'erro' AND criado_em::date = CURRENT_DATE`, [f.id]);
      if (falhou) continue;
      const r = await enviarCobranca(ctx, f, etapa, true);
      if (r.ok) enviadas++;
    }
  }
  return enviadas;
}

export async function notasAutomaticas(soEmpresa?: string) {
  let emitidas = 0;
  const empresas = (await q<any>(pool, `SELECT empresa_id FROM integracoes WHERE tipo = 'nfse' AND provedor IN ('simulado','focus')`))
    .filter((x) => !soEmpresa || x.empresaId === soEmpresa);
  for (const { empresaId } of empresas) {
    const n = await carregar(pool, empresaId, 'nfse');
    // Atualiza notas que ainda estão em processamento na prefeitura.
    for (const p of await q<any>(pool, `SELECT id FROM lancamentos WHERE empresa_id = $1 AND nf_status = 'processando' AND atualizado_em < now() - interval '1 minute'`, [empresaId]))
      await consultarNota(empresaId, p.id).catch(() => {});
    if (n.config.automatica === 'manual') continue;
    const cond = n.config.automatica === 'ao_pagar' ? `l.status = 'pago'` : `l.status <> 'cancelado' AND l.vencimento <= $2`;
    const params: any[] = [empresaId];
    if (n.config.automatica !== 'ao_pagar') params.push(addDays(today(), Number(n.config.diasAntes) || 0));
    const pend = await q<any>(pool,
      `SELECT l.id FROM lancamentos l WHERE l.empresa_id = $1 AND l.tipo = 'receita' AND l.categoria <> 'comissao' AND l.excluido_em IS NULL
          AND COALESCE(l.nf_status, 'a_emitir') = 'a_emitir' AND ${cond} ORDER BY l.vencimento LIMIT 50`, params);
    for (const p of pend) {
      try { const r = await emitirNota(empresaId, p.id); if (r.status !== 'erro') emitidas++; } catch { /* cadastro incompleto: fica para emissão manual */ }
    }
  }
  return emitidas;
}
