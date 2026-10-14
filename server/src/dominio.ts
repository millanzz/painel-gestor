// Regras de negócio compartilhadas pelas rotas: disponibilidade das faces,
// preços dos contratos, automações de campo e de comissão.
import type { PoolClient } from 'pg';
import {
  addDays, calcularContrato, criarCalendario, fdate, isoOf, round2, today, type ConfigEmpresa, type PainelPreco,
} from '@shared';
import { registrar } from './auditoria';
import type { Ctx } from './contexto';
import { inserir, q, q1, type Db } from './db';
import { invalido } from './http';

export const cal = (cfg: ConfigEmpresa) => criarCalendario(cfg.calendario);

/** Condição SQL: a reserva segura a face (confirmada ou opção dentro da validade). */
export const SQL_OCUPA = `(r.status = 'confirmado' OR (r.status = 'reservado' AND (r.validade IS NULL OR r.validade >= CURRENT_DATE)))`;

interface ReservaBase { id?: string | null; painelId: string; ini: string; fim: string; slots?: number; status?: string; contratoId?: string | null; campanha?: string }

/** Maior número de cotas usadas ao mesmo tempo dentro do período. */
export function usoMax(lista: { ini: string; fim: string; slots: number }[], ini: string, fim: string) {
  const pontos = new Set([ini]);
  for (const o of lista) if (o.ini >= ini && o.ini <= fim) pontos.add(o.ini);
  let m = 0;
  for (const d of pontos) {
    const s = lista.filter((o) => o.ini <= d && o.fim >= d).reduce((a, o) => a + (+o.slots || 1), 0);
    if (s > m) m = s;
  }
  return m;
}

/**
 * Reservas que impedem esta reserva de segurar a face. Trava a linha da face
 * (FOR UPDATE) para que duas pessoas não vendam o mesmo período ao mesmo tempo.
 */
export async function conflitos(c: Db, empresaId: string, r: ReservaBase, travar = true) {
  const p = await q1<any>(c, `SELECT id, codigo, tipo, slots, status FROM paineis WHERE id = $1 AND empresa_id = $2 ${travar ? 'FOR UPDATE' : ''}`, [r.painelId, empresaId]);
  if (!p) throw invalido('Face não encontrada.');
  const outras = await q<any>(c,
    `SELECT r.id, r.ini, r.fim, r.slots, r.status, r.campanha FROM reservas r
      WHERE r.empresa_id = $1 AND r.painel_id = $2 AND r.excluido_em IS NULL AND ${SQL_OCUPA}
        AND r.ini <= $4 AND r.fim >= $3 AND ($5::uuid IS NULL OR r.id <> $5)`,
    [empresaId, r.painelId, r.ini, r.fim, r.id || null]);
  if (p.tipo === 'led') {
    const usado = usoMax(outras, r.ini, r.fim);
    return { painel: p, lista: usado + (+(r.slots || 1)) > p.slots ? outras : [], usado };
  }
  return { painel: p, lista: outras, usado: outras.length ? 1 : 0 };
}

export async function atrasoCliente(c: Db, empresaId: string, clienteId: string) {
  const r = await q1<any>(c,
    `SELECT COALESCE(MAX(CURRENT_DATE - l.vencimento), 0) AS dias, COALESCE(SUM(l.valor), 0) AS valor
       FROM lancamentos l JOIN contratos k ON k.id = l.contrato_id
      WHERE l.empresa_id = $1 AND l.tipo = 'receita' AND l.status = 'aberto' AND l.excluido_em IS NULL
        AND l.vencimento < CURRENT_DATE AND (k.cliente_id = $2 OR k.agencia_id = $2)`,
    [empresaId, clienteId]);
  return { dias: Number(r?.dias || 0), valor: Number(r?.valor || 0) };
}

export async function clienteBloqueado(c: Db, ctx: Ctx, clienteId: string | null | undefined) {
  if (!clienteId) return false;
  return (await atrasoCliente(c, ctx.empresaId, clienteId)).dias >= (+ctx.cfg.bloqueioDias || 15);
}

/** Valida uma reserva antes de gravar. Lança erro com mensagem para a tela. */
export async function verificarReserva(c: PoolClient, ctx: Ctx, r: ReservaBase, nova: boolean) {
  if (r.fim < r.ini) throw invalido('A data final precisa ser igual ou posterior à inicial.');
  const segura = r.status === 'reservado' || r.status === 'confirmado';
  const { painel, lista } = await conflitos(c, ctx.empresaId, r);
  if (painel.status === 'inativo' && segura) throw invalido(`${painel.codigo} está fora de venda. Reative a face antes de reservar.`);
  if (painel.tipo === 'led' && (+(r.slots || 1)) > painel.slots) throw invalido(`Este LED tem ${painel.slots} cotas.`);
  if (segura && lista.length) {
    const o = lista[0];
    throw invalido(`${painel.codigo} já está ${o.status === 'confirmado' ? 'confirmada' : 'em opção'} para "${o.campanha || 'outra campanha'}" de ${fdate(o.ini)} a ${fdate(o.fim)}. Coloque na fila para ser avisado quando liberar.`);
  }
  if (segura && nova && ctx.perfil !== 'admin' && r.contratoId) {
    const k = await q1<any>(c, 'SELECT cliente_id FROM contratos WHERE id = $1 AND empresa_id = $2', [r.contratoId, ctx.empresaId]);
    if (k && (await clienteBloqueado(c, ctx, k.clienteId))) throw invalido('Cliente bloqueado por atraso nos pagamentos. Peça a um administrador.');
  }
  return painel;
}

/** Cria/ajusta as ordens de colagem e retirada quando uma reserva é confirmada (e as remove se deixar de valer). */
export async function sincronizarOS(c: PoolClient, ctx: Ctx, r: { id: string; painelId: string; contratoId: string | null; campanha: string; ini: string; fim: string; status: string; excluidoEm?: string | null }) {
  const p = await q1<any>(c, 'SELECT codigo, tipo FROM paineis WHERE id = $1', [r.painelId]);
  if (!p) return;
  const existentes = await q<any>(c, `SELECT * FROM ordens_servico WHERE reserva_id = $1 AND excluido_em IS NULL`, [r.id]);
  if (r.status === 'confirmado' && !r.excluidoEm) {
    const tipoIni = p.tipo === 'led' ? 'conteudo' : 'colagem';
    const ini = existentes.find((o) => o.tipo === tipoIni);
    if (!ini) {
      await inserir(c, 'ordens_servico', {
        empresaId: ctx.empresaId, painelId: r.painelId, reservaId: r.id, contratoId: r.contratoId, tipo: tipoIni,
        prazo: r.ini, responsavel: p.tipo === 'led' ? 'Equipe Mídia digital' : 'Equipe Colagem', automatica: true,
        descricao: `${tipoIni === 'conteudo' ? 'Subir arquivo de' : 'Colar'} "${r.campanha}" em ${p.codigo}.`,
      }, ['empresaId', 'painelId', 'reservaId', 'contratoId', 'tipo', 'prazo', 'responsavel', 'automatica', 'descricao']);
    } else if (ini.status !== 'concluida' && ini.prazo !== r.ini) {
      await c.query('UPDATE ordens_servico SET prazo = $2, atualizado_em = now() WHERE id = $1', [ini.id, r.ini]);
    }
    if (p.tipo !== 'led') {
      const prazo = addDays(r.fim, 1);
      const ret = existentes.find((o) => o.tipo === 'retirada');
      if (!ret) {
        await inserir(c, 'ordens_servico', {
          empresaId: ctx.empresaId, painelId: r.painelId, reservaId: r.id, contratoId: r.contratoId, tipo: 'retirada',
          prazo, responsavel: 'Equipe Colagem', automatica: true,
          descricao: `Retirar ou cobrir "${r.campanha}" em ${p.codigo}, se não houver campanha seguinte.`,
        }, ['empresaId', 'painelId', 'reservaId', 'contratoId', 'tipo', 'prazo', 'responsavel', 'automatica', 'descricao']);
      } else if (ret.status !== 'concluida' && ret.prazo !== prazo) {
        await c.query('UPDATE ordens_servico SET prazo = $2, atualizado_em = now() WHERE id = $1', [ret.id, prazo]);
      }
    }
  } else {
    await c.query(
      `UPDATE ordens_servico SET excluido_em = now(), excluido_por = 'automático'
        WHERE reserva_id = $1 AND status <> 'concluida' AND tipo IN ('colagem','retirada','conteudo') AND excluido_em IS NULL`,
      [r.id]);
  }
}

/** Próximo número sequencial do ano (CT-2026-018, PI-2026-010). Usa o maior existente, não a contagem. */
export async function proxNumero(c: Db, empresaId: string, prefixo: 'CT' | 'PI', coluna: 'numero' | 'pi_numero') {
  const y = new Date().getFullYear();
  const r = await q1<any>(c,
    `SELECT COALESCE(MAX(substring(${coluna} FROM '^${prefixo}-${y}-(\\d+)$')::int), 0) AS n FROM contratos WHERE empresa_id = $1`,
    [empresaId]);
  return `${prefixo}-${y}-${String(Number(r?.n || 0) + 1).padStart(3, '0')}`;
}

export async function reservasDoContrato(c: Db, empresaId: string, contratoId: string, incluirFila = false) {
  return q<any>(c,
    `SELECT r.*, p.codigo AS painel_codigo, p.tipo AS painel_tipo FROM reservas r JOIN paineis p ON p.id = r.painel_id
      WHERE r.empresa_id = $1 AND r.contrato_id = $2 AND r.excluido_em IS NULL
        AND r.status NOT IN ('cancelada','expirada') ${incluirFila ? '' : "AND r.status <> 'fila'"}
      ORDER BY r.ini, p.codigo`,
    [empresaId, contratoId]);
}

export async function mapaPrecos(c: Db, empresaId: string): Promise<Map<string, PainelPreco>> {
  const ps = await q<any>(c, 'SELECT id, tipo, valor_bi, slots FROM paineis WHERE empresa_id = $1', [empresaId]);
  return new Map(ps.map((p) => [p.id, { tipo: p.tipo, valorBi: p.valorBi, slots: p.slots }]));
}

/** Resumo de preço de um contrato a partir das reservas atuais. */
export async function resumoContrato(c: Db, ctx: Ctx, k: { id: string; valor: number; agenciaId?: string | null; vendedorId?: string | null }) {
  const rs = await reservasDoContrato(c, ctx.empresaId, k.id);
  const precos = await mapaPrecos(c, ctx.empresaId);
  const ag = k.agenciaId ? await q1<any>(c, 'SELECT comissao FROM clientes WHERE id = $1', [k.agenciaId]) : null;
  return { reservas: rs, ...calcularContrato(ctx.cfg, k.valor, rs, precos, { comissaoAgenciaPct: ag ? +ag.comissao : 0, temVendedor: !!k.vendedorId }) };
}

/** Material que a gráfica precisa entregar para as faces do contrato. */
export function materialNecessario(rs: { painelTipo: string }[]) {
  let folhas = 0, lonas = 0, digitais = 0;
  for (const r of rs) {
    if (r.painelTipo === 'outdoor') folhas += 32;
    else if (r.painelTipo === 'led') digitais += 1;
    else lonas += 1;
  }
  const a: string[] = [];
  if (folhas) a.push(`${folhas} folhas`);
  if (lonas) a.push(`${lonas} lona(s)`);
  if (digitais) a.push(`${digitais} arquivo(s) digital`);
  return a.join(' + ') || '—';
}

/** Garante o acompanhamento de arte/material do contrato. */
export async function garantirArte(c: PoolClient, ctx: Ctx, contratoId: string) {
  const ja = await q1(c, 'SELECT id FROM artes WHERE contrato_id = $1 AND excluido_em IS NULL', [contratoId]);
  if (ja) return;
  const rs = await reservasDoContrato(c, ctx.empresaId, contratoId);
  const ini = rs.reduce((m: string, r: any) => (r.ini < m ? r.ini : m), '9999-12-31');
  await inserir(c, 'artes', {
    empresaId: ctx.empresaId, contratoId, status: 'aguardando',
    prazo: rs.length ? addDays(ini, -(+ctx.cfg.artePrazoDias || 7)) : null,
    necessario: materialNecessario(rs),
  }, ['empresaId', 'contratoId', 'status', 'prazo', 'necessario']);
}

/** Ao receber uma parcela, lança a comissão do vendedor e a da agência. */
export async function aposBaixa(c: PoolClient, ctx: Ctx, f: { id: string; tipo: string; contratoId: string | null; valor: number; descricao: string }) {
  if (f.tipo !== 'receita' || !f.contratoId) return;
  const k = await q1<any>(c, 'SELECT * FROM contratos WHERE id = $1 AND empresa_id = $2', [f.contratoId, ctx.empresaId]);
  if (!k) return;
  const ja = await q<any>(c, 'SELECT comissao_tipo FROM lancamentos WHERE comissao_de = $1 AND excluido_em IS NULL', [f.id]);
  const d = new Date();
  const vencimento = isoOf(new Date(d.getFullYear(), d.getMonth() + 1, 10)); // dia 10 do mês seguinte
  const campos = ['empresaId', 'tipo', 'categoria', 'descricao', 'contratoId', 'vencimento', 'valor', 'status', 'comissaoDe', 'comissaoTipo'];
  if (k.vendedorId && +ctx.cfg.comissaoVendedor > 0 && !ja.some((x) => x.comissaoTipo === 'vendedor')) {
    const m = await q1<any>(c, 'SELECT nome FROM membros WHERE id = $1', [k.vendedorId]);
    await inserir(c, 'lancamentos', {
      empresaId: ctx.empresaId, tipo: 'despesa', categoria: 'comissao', descricao: `Comissão ${m?.nome || 'vendedor'} · ${f.descricao}`,
      contratoId: k.id, vencimento, valor: round2((+f.valor * ctx.cfg.comissaoVendedor) / 100), status: 'aberto', comissaoDe: f.id, comissaoTipo: 'vendedor',
    }, campos);
  }
  if (ctx.cfg.repassarAgencia && k.agenciaId && !ja.some((x) => x.comissaoTipo === 'agencia')) {
    const ag = await q1<any>(c, 'SELECT nome, comissao FROM clientes WHERE id = $1', [k.agenciaId]);
    if (ag && +ag.comissao > 0) {
      await inserir(c, 'lancamentos', {
        empresaId: ctx.empresaId, tipo: 'despesa', categoria: 'comissao', descricao: `Comissão agência ${ag.nome} · ${f.descricao}`,
        contratoId: k.id, vencimento, valor: round2((+f.valor * ag.comissao) / 100), status: 'aberto', comissaoDe: f.id, comissaoTipo: 'agencia',
      }, campos);
    }
  }
}

/** Conclui a OS de colagem/retirada quando a equipe envia a foto da reserva. */
export async function concluirOSPelaFoto(c: PoolClient, reservaId: string | null, tipo: string) {
  if (!reservaId) return;
  const tipos = tipo === 'retirada' ? ['retirada'] : ['colagem', 'conteudo'];
  await c.query(
    `UPDATE ordens_servico SET status = 'concluida', concluida_em = CURRENT_DATE, atualizado_em = now()
      WHERE reserva_id = $1 AND tipo = ANY($2) AND status <> 'concluida' AND excluido_em IS NULL`,
    [reservaId, tipos]);
}

/**
 * Rotinas diárias: libera opções vencidas e encerra contratos cuja última
 * face já saiu do ar. Roda na subida do servidor e a cada hora.
 */
export async function rotinas(c: Db) {
  const exp = await q<any>(c,
    `UPDATE reservas r SET status = 'expirada', expirada_em = CURRENT_DATE, atualizado_em = now()
      WHERE r.status = 'reservado' AND r.validade < CURRENT_DATE AND r.excluido_em IS NULL
      RETURNING r.id, r.empresa_id, r.contrato_id, r.campanha`);
  for (const r of exp) {
    await c.query(
      `INSERT INTO auditoria (empresa_id, autor_nome, perfil, acao, tabela, registro_id, rotulo, contrato_id)
       VALUES ($1, 'Sistema', 'admin', 'expirou', 'reservas', $2, $3, $4)`,
      [r.empresaId, r.id, `Opção vencida · ${r.campanha}`, r.contratoId]);
  }
  await c.query(
    `UPDATE contratos k SET status = 'encerrado', atualizado_em = now()
      WHERE k.status = 'ativo' AND k.excluido_em IS NULL
        AND EXISTS (SELECT 1 FROM reservas r WHERE r.contrato_id = k.id AND r.excluido_em IS NULL AND r.status = 'confirmado')
        AND NOT EXISTS (SELECT 1 FROM reservas r WHERE r.contrato_id = k.id AND r.excluido_em IS NULL AND r.status = 'confirmado' AND r.fim >= CURRENT_DATE)`);
  return exp.length;
}

export { registrar, today };
