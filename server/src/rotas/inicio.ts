import { Router } from 'express';
import { addDays, daysIncl, fdate, money, PERFIS, PLANOS, podeVer, today, type Alerta } from '@shared';
import { interno, situacaoPlano, type Ctx } from '../contexto';
import { pool, q, q1 } from '../db';
import { cal } from '../dominio';
import { dadosOcupacao, ocupacaoPeriodo } from '../ocupacao';
import { etapaCobranca } from './financeiro';

export const inicio = Router();

const quando = (d: number) => (d === 0 ? 'hoje' : d === 1 ? 'amanhã' : `em ${d} dias`);

/** Próximas ações: o que precisa de alguém, já com o caminho para resolver. */
export async function alertas(ctx: Ctx): Promise<Alerta[]> {
  const A: Alerta[] = [];
  const e = ctx.empresaId, p = ctx.perfil, t = today();
  const vê = (a: Parameters<typeof podeVer>[1]) => podeVer(p, a);
  const add = (sev: Alerta['sev'], tag: string, titulo: string, detalhe: string, acao: string, link: string) => A.push({ sev, tag, titulo, detalhe, acao, link });

  if (vê('contratos')) {
    for (const k of await q<any>(pool, `SELECT k.id, k.numero, k.campanha, c.nome AS cliente FROM contratos k JOIN clientes c ON c.id = k.cliente_id WHERE k.empresa_id = $1 AND k.status = 'aprovacao' AND k.excluido_em IS NULL`, [e]))
      add(p === 'admin' ? 'bad' : 'info', 'Aprovar', `Desconto · ${k.campanha}`, `${k.numero} · ${k.cliente}. Acima do limite do comercial.`, p === 'admin' ? 'Revisar' : 'Ver', `/contratos/${k.id}`);
    for (const r of await q<any>(pool,
      `SELECT r.validade, r.campanha, r.contrato_id, p.codigo, c.nome AS cliente FROM reservas r JOIN paineis p ON p.id = r.painel_id
         LEFT JOIN contratos k ON k.id = r.contrato_id LEFT JOIN clientes c ON c.id = k.cliente_id
        WHERE r.empresa_id = $1 AND r.status = 'reservado' AND r.excluido_em IS NULL AND r.validade BETWEEN CURRENT_DATE AND CURRENT_DATE + 2 ORDER BY r.validade`, [e])) {
      const d = daysIncl(t, r.validade) - 1;
      add('warn', d === 0 ? 'Vence hoje' : d === 1 ? 'Vence amanhã' : `Vence em ${d}d`, `Opção de ${r.codigo} · ${r.campanha}`, `${r.cliente || 'Cliente'} ainda não confirmou.`, 'Confirmar', r.contratoId ? `/contratos/${r.contratoId}` : '/agenda');
    }
    for (const r of await q<any>(pool,
      `SELECT DISTINCT ON (r.painel_id) r.painel_id, r.contrato_id, r.campanha, r.ini, p.codigo, c.nome AS cliente
         FROM reservas r JOIN paineis p ON p.id = r.painel_id LEFT JOIN contratos k ON k.id = r.contrato_id LEFT JOIN clientes c ON c.id = k.cliente_id
        WHERE r.empresa_id = $1 AND r.status = 'fila' AND r.excluido_em IS NULL AND r.fim >= CURRENT_DATE
          AND NOT EXISTS (SELECT 1 FROM reservas o WHERE o.painel_id = r.painel_id AND o.excluido_em IS NULL AND o.id <> r.id
                            AND (o.status = 'confirmado' OR (o.status = 'reservado' AND (o.validade IS NULL OR o.validade >= CURRENT_DATE)))
                            AND o.ini <= r.fim AND o.fim >= r.ini)
        ORDER BY r.painel_id, r.criado_em`, [e]))
      add('info', 'Fila', `${r.codigo} ficou livre`, `${r.cliente || 'Cliente'} é o próximo da fila para ${fdate(r.ini)}.`, 'Oferecer', r.contratoId ? `/contratos/${r.contratoId}` : '/agenda');
    for (const k of await q<any>(pool, `SELECT k.id, k.numero, c.nome AS cliente FROM contratos k JOIN clientes c ON c.id = k.cliente_id WHERE k.empresa_id = $1 AND k.status = 'proposta' AND k.validade_proposta < CURRENT_DATE AND k.excluido_em IS NULL`, [e]))
      add('info', 'Proposta', `Proposta vencida · ${k.numero}`, k.cliente, 'Renovar prazo', `/contratos/${k.id}`);
  }

  if (vê('artes')) {
    for (const a of await q<any>(pool,
      `SELECT a.id, a.status, a.prazo, k.id AS contrato_id, k.campanha, k.numero, per.ini
         FROM artes a JOIN contratos k ON k.id = a.contrato_id
         LEFT JOIN LATERAL (SELECT min(r.ini) AS ini FROM reservas r WHERE r.contrato_id = k.id AND r.status = 'confirmado' AND r.excluido_em IS NULL) per ON true
        WHERE a.empresa_id = $1 AND a.excluido_em IS NULL AND a.status <> 'recebido' AND k.status IN ('aprovada','ativo')`, [e])) {
      if (a.ini && a.ini <= addDays(t, 3)) add(a.ini <= t ? 'bad' : 'warn', a.ini <= t ? 'Atrasado' : 'Material', `Material não chegou · ${a.campanha}`, a.ini <= t ? 'A colagem já começou.' : `Colagem ${quando(daysIncl(t, a.ini) - 1)}.`, 'Ver material', '/artes');
      else if (['aguardando', 'aprovacao'].includes(a.status) && a.prazo && a.prazo < t) add('bad', 'Atrasado', `Arte atrasada · ${a.campanha}`, `O prazo era ${fdate(a.prazo)}.`, 'Cobrar arte', '/artes');
    }
  }

  if (vê('campo')) {
    const late = await q1<any>(pool, `SELECT count(*)::int AS n, string_agg(DISTINCT p.codigo, ', ') AS faces FROM ordens_servico o JOIN paineis p ON p.id = o.painel_id WHERE o.empresa_id = $1 AND o.status <> 'concluida' AND o.prazo < CURRENT_DATE AND o.excluido_em IS NULL`, [e]);
    if (late?.n) add('bad', 'Atrasado', `${late.n} serviço(s) de campo atrasado(s)`, late.faces || '', 'Abrir roteiro', '/campo');
  }

  if (vê('dinheiro')) {
    const venc = await q1<any>(pool, `SELECT count(*)::int AS n, COALESCE(sum(valor),0) AS v FROM lancamentos WHERE empresa_id = $1 AND tipo = 'receita' AND status = 'aberto' AND vencimento < CURRENT_DATE AND excluido_em IS NULL`, [e]);
    if (venc?.n) add('bad', 'Cobrar', `${venc.n} parcela(s) vencida(s)`, money(venc.v), 'Cobrar', '/dinheiro?aba=cobrar');
    const abertas = await q<any>(pool, `SELECT l.id, l.vencimento, (SELECT array_agg(etapa) FROM cobrancas cb WHERE cb.lancamento_id = l.id) AS enviadas FROM lancamentos l WHERE l.empresa_id = $1 AND l.tipo = 'receita' AND l.status = 'aberto' AND l.categoria <> 'comissao' AND l.excluido_em IS NULL`, [e]);
    const cob = abertas.filter((f) => { const { etapa } = etapaCobranca(ctx.cfg.regua, f.vencimento); return etapa != null && !(f.enviadas || []).includes(etapa); }).length;
    if (cob) add('warn', 'Cobrar', `${cob} cobrança(s) para enviar hoje`, 'Pela régua de cobrança.', 'Enviar', '/dinheiro?aba=cobrar');
    const mes = t.slice(0, 7);
    const rec = await q1<any>(pool, `SELECT count(*)::int AS n FROM recorrencias r WHERE r.empresa_id = $1 AND r.ativo AND r.excluido_em IS NULL AND NOT EXISTS (SELECT 1 FROM lancamentos l WHERE l.recorrencia_id = r.id AND l.competencia = $2 AND l.excluido_em IS NULL)`, [e, mes]);
    if (rec?.n) add('warn', 'Lançar', `${rec.n} despesa(s) fixa(s) do mês não lançada(s)`, 'Aluguel, energia e outras recorrências.', 'Lançar', '/dinheiro?aba=recorrencias');
    const nf = await q1<any>(pool, `SELECT count(*)::int AS n FROM lancamentos WHERE empresa_id = $1 AND tipo = 'receita' AND categoria <> 'comissao' AND status <> 'cancelado' AND COALESCE(nf_status,'a_emitir') = 'a_emitir' AND vencimento <= CURRENT_DATE + 5 AND excluido_em IS NULL`, [e]);
    if (nf?.n) add('info', 'Nota', `${nf.n} nota(s) fiscal(is) a emitir`, 'Vencendo nos próximos 5 dias ou vencidas.', 'Emitir', '/dinheiro?aba=notas');
  }

  if (vê('paineis')) {
    for (const s of await q<any>(pool, `SELECT id, codigo, endereco, lic_vencimento, loc_vencimento, loc_reajuste, loc_indice, loc_proprietario FROM estruturas WHERE empresa_id = $1 AND excluido_em IS NULL`, [e])) {
      if (s.licVencimento) {
        const d = daysIncl(t, s.licVencimento) - 1;
        if (d < 0) add('bad', 'Licença', `Licença vencida · ${s.codigo}`, `${s.endereco} · venceu em ${fdate(s.licVencimento)}`, 'Ver ponto', `/paineis?estrutura=${s.id}`);
        else if (d <= 60) add('warn', 'Licença', `Licença vence ${quando(d)} · ${s.codigo}`, s.endereco, 'Ver ponto', `/paineis?estrutura=${s.id}`);
      }
      if (p === 'admin' && s.locVencimento) {
        const d = daysIncl(t, s.locVencimento) - 1;
        if (d <= 90) add(d < 0 ? 'bad' : 'warn', 'Locação', `Locação do terreno ${d < 0 ? 'vencida' : 'vence ' + quando(d)} · ${s.codigo}`, s.locProprietario || '', 'Ver ponto', `/paineis?estrutura=${s.id}`);
      }
      if (p === 'admin' && s.locReajuste) {
        const d = daysIncl(t, s.locReajuste) - 1;
        if (d <= 30 && d >= -30) add('info', 'Reajuste', `Reajuste do aluguel ${d < 0 ? 'atrasado' : quando(d)} · ${s.codigo}`, s.locIndice || '', 'Ver ponto', `/paineis?estrutura=${s.id}`);
      }
    }
  }

  if (p === 'admin') {
    const st = situacaoPlano(ctx.cfg);
    if (st === 'trial' && ctx.cfg.plano.trialAte) {
      const d = daysIncl(t, ctx.cfg.plano.trialAte) - 1;
      if (d <= 7) add('warn', 'Plano', `Período de teste termina ${quando(d)}`, `Plano ${(PLANOS[ctx.cfg.plano.id] || PLANOS.pro).nome}`, 'Escolher plano', '/config?aba=plano');
    }
    if (st === 'vencido') add('bad', 'Plano', 'Assinatura vencida: sistema em modo leitura', '', 'Escolher plano', '/config?aba=plano');
  }

  const ord = { bad: 0, warn: 1, info: 2 };
  return A.sort((a, b) => ord[a.sev] - ord[b.sev]);
}

inicio.get('/', interno, async (req, res) => {
  const ctx = req.ctx!;
  const C = cal(ctx.cfg);
  const atual = C.biOf(today());
  const bis = Array.from({ length: 8 }, (_, i) => C.biAdd(atual, i)).map((b) => ({ ...b, ini: C.biIni(b.ano, b.bi), fim: C.biFim(b.ano, b.bi) }));
  const { faces, reservas } = await dadosOcupacao(pool, ctx.empresaId, bis[0].ini, bis[7].fim);
  const ativas = faces.filter((f) => f.status !== 'inativo');
  const bissemanas = bis.map((b) => ({ ...b, pct: Math.round(ocupacaoPeriodo(faces, reservas, b.ini, b.fim) * 100) }));
  const vendidas = ativas.filter((f) => reservas.some((r) => r.painelId === f.id && r.ini <= bis[0].fim && r.fim >= bis[0].ini)).length;

  const podeDinheiro = podeVer(ctx.perfil, 'dinheiro') || podeVer(ctx.perfil, 'contratos');
  const kpi = podeDinheiro ? await q1<any>(pool,
    `SELECT
       (SELECT COALESCE(sum(valor),0) FROM contratos WHERE empresa_id = $1 AND status IN ('aprovada','ativo','encerrado') AND date_part('year', data) = date_part('year', CURRENT_DATE) AND excluido_em IS NULL) AS vendido_ano,
       (SELECT count(*)::int FROM contratos WHERE empresa_id = $1 AND status IN ('aprovada','ativo','encerrado') AND date_part('year', data) = date_part('year', CURRENT_DATE) AND excluido_em IS NULL) AS n_contratos_ano,
       (SELECT COALESCE(sum(valor),0) FROM lancamentos WHERE empresa_id = $1 AND tipo='receita' AND status='aberto' AND vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + 30 AND excluido_em IS NULL) AS a_receber_30,
       (SELECT count(*)::int FROM lancamentos WHERE empresa_id = $1 AND tipo='receita' AND status='aberto' AND vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + 30 AND excluido_em IS NULL) AS n_receber_30,
       (SELECT COALESCE(sum(valor),0) FROM lancamentos WHERE empresa_id = $1 AND tipo='receita' AND status='aberto' AND vencimento < CURRENT_DATE AND excluido_em IS NULL) AS atrasado`, [ctx.empresaId]) : null;
  const pior = podeDinheiro ? await q1<any>(pool,
    `SELECT c.nome, max(CURRENT_DATE - l.vencimento)::int AS dias FROM lancamentos l JOIN contratos k ON k.id = l.contrato_id JOIN clientes c ON c.id = k.cliente_id
      WHERE l.empresa_id = $1 AND l.tipo='receita' AND l.status='aberto' AND l.vencimento < CURRENT_DATE AND l.excluido_em IS NULL
      GROUP BY c.nome ORDER BY sum(l.valor) DESC LIMIT 1`, [ctx.empresaId]) : null;

  const livres = await q<any>(pool,
    `SELECT p.id, p.codigo, p.tipo, p.valor_bi, p.slots, e.endereco, e.cidade, p.sentido FROM paineis p LEFT JOIN estruturas e ON e.id = p.estrutura_id
      WHERE p.empresa_id = $1 AND p.status = 'ativo' AND p.excluido_em IS NULL ORDER BY p.valor_bi DESC`, [ctx.empresaId]);
  const livresAgora = livres.map((f) => {
    const rs = reservas.filter((r) => r.painelId === f.id && r.ini <= bis[0].fim && r.fim >= bis[0].ini);
    const usadas = f.tipo === 'led' ? rs.reduce((s, r) => s + r.slots, 0) : rs.length;
    return { ...f, livres: f.tipo === 'led' ? Math.max(0, f.slots - usadas) : rs.length ? 0 : 1 };
  }).filter((f) => f.livres > 0).slice(0, 5);

  res.json({
    saudacao: { nome: ctx.autorNome.split(' ')[0], perfil: PERFIS[ctx.perfil].nome },
    biAtual: bissemanas[0],
    ocupacaoAtual: { pct: bissemanas[0].pct, vendidas, total: ativas.length },
    kpi: kpi ? { ...kpi, piorCliente: pior } : null,
    bissemanas,
    livres: livresAgora,
    acoes: await alertas(ctx),
  });
});
