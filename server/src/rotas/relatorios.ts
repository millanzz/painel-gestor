import ExcelJS from 'exceljs';
import { Router, type Response } from 'express';
import { daysIncl, isoOf, limiteDesconto, MESES, maxIso, minIso, overlap, podeVer, round2, tabelaPeriodo, TIPO_LBL } from '@shared';
import { interno, type Ctx } from '../contexto';
import { pool, q } from '../db';
import { mapaPrecos } from '../dominio';
import { ErroApi } from '../http';
import { dadosOcupacao, ocupacaoPeriodo } from '../ocupacao';

export const relatorios = Router();
relatorios.use(interno, (req, _res, next) => next(podeVer(req.ctx!.perfil, 'relatorios') ? undefined : new ErroApi(403, 'Seu perfil não acessa relatórios.')));

export interface Tabela { titulo: string; colunas: { k: string; l: string; dinheiro?: boolean }[]; linhas: Record<string, any>[] }

async function ocupacao(ctx: Ctx) {
  const t = new Date();
  const meses = Array.from({ length: 18 }, (_, i) => {
    const d = new Date(t.getFullYear(), t.getMonth() - 11 + i, 1);
    return { ini: isoOf(d), fim: isoOf(new Date(d.getFullYear(), d.getMonth() + 1, 0)), rotulo: `${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`, atual: i === 11, futuro: i > 11 };
  });
  const { faces, reservas } = await dadosOcupacao(pool, ctx.empresaId, meses[0].ini, meses[17].fim);
  const porMes = meses.map((m) => ({ ...m, pct: Math.round(ocupacaoPeriodo(faces, reservas, m.ini, m.fim) * 100) }));
  const agrupar = (chave: (f: any) => string) => {
    const g = new Map<string, any[]>();
    for (const f of faces) { const k = chave(f) || '—'; g.set(k, [...(g.get(k) || []), f]); }
    const a = meses[11], fut = meses.slice(12);
    return [...g.entries()].map(([k, L]) => {
      const ids = new Set(L.map((x) => x.id));
      const media = fut.reduce((s, m) => s + ocupacaoPeriodo(faces, reservas, m.ini, m.fim, (x) => ids.has(x.id)), 0) / fut.length;
      return { grupo: k, faces: L.length, atual: Math.round(ocupacaoPeriodo(faces, reservas, a.ini, a.fim, (x) => ids.has(x.id)) * 100), proximos: Math.round(media * 100) };
    }).sort((x, y) => y.atual - x.atual);
  };
  return { porMes, porCidade: agrupar((f) => f.cidade || ''), porFormato: agrupar((f) => TIPO_LBL[f.tipo] || f.tipo) };
}

async function vendas(ctx: Ctx, ano: number) {
  const ks = await q<any>(pool,
    `SELECT k.*, c.nome AS cliente_nome, m.nome AS vendedor_nome FROM contratos k JOIN clientes c ON c.id = k.cliente_id LEFT JOIN membros m ON m.id = k.vendedor_id
      WHERE k.empresa_id = $1 AND k.status IN ('aprovada','ativo','encerrado') AND date_part('year', k.data) = $2 AND k.excluido_em IS NULL`, [ctx.empresaId, ano]);
  const precos = await mapaPrecos(pool, ctx.empresaId);
  const rs = await q<any>(pool, `SELECT contrato_id, painel_id, ini, fim, slots FROM reservas WHERE empresa_id = $1 AND status IN ('reservado','confirmado') AND excluido_em IS NULL`, [ctx.empresaId]);
  const lim = limiteDesconto(ctx.cfg, 'comercial');
  const contratos = ks.map((k) => {
    const tab = round2(rs.filter((r) => r.contratoId === k.id).reduce((s, r) => s + tabelaPeriodo(ctx.cfg, precos.get(r.painelId)!, r.ini, r.fim, r.slots), 0)) || k.valorTabela || 0;
    const desc = tab ? Math.max(0, (1 - k.valor / tab) * 100) : 0;
    return { id: k.id, numero: k.numero, cliente: k.clienteNome, vendedor: k.vendedorNome || 'Sem vendedor', tabela: tab, valor: k.valor, desconto: round2(desc), dentroLimite: desc <= lim + 0.01, aprovadoPor: k.descontoAprovadoPor };
  });
  const porVendedor = new Map<string, any>();
  for (const k of contratos) {
    const o = porVendedor.get(k.vendedor) || { vendedor: k.vendedor, contratos: 0, tabela: 0, valor: 0, comissao: 0 };
    o.contratos++; o.tabela += k.tabela; o.valor += k.valor; o.comissao += round2((k.valor * ctx.cfg.comissaoVendedor) / 100);
    porVendedor.set(k.vendedor, o);
  }
  const vend = [...porVendedor.values()].map((o) => ({ ...o, desconto: o.tabela ? round2((1 - o.valor / o.tabela) * 100) : 0 })).sort((a, b) => b.valor - a.valor);
  const total = contratos.reduce((s, k) => s + k.valor, 0), tabela = contratos.reduce((s, k) => s + k.tabela, 0);
  return { ano, total, tabela, n: contratos.length, porVendedor: vend, contratos: contratos.sort((a, b) => b.desconto - a.desconto) };
}

/** Receita de cada contrato distribuída por face e por dia no ar, menos custos diretos. */
async function rentabilidade(ctx: Ctx, ano: number) {
  const ini = `${ano}-01-01`, fim = `${ano}-12-31`;
  const precos = await mapaPrecos(pool, ctx.empresaId);
  const ks = await q<any>(pool, `SELECT id, valor FROM contratos WHERE empresa_id = $1 AND status IN ('aprovada','ativo','encerrado') AND excluido_em IS NULL`, [ctx.empresaId]);
  const rs = await q<any>(pool, `SELECT contrato_id, painel_id, ini, fim, slots FROM reservas WHERE empresa_id = $1 AND status IN ('reservado','confirmado') AND excluido_em IS NULL`, [ctx.empresaId]);
  const receita: Record<string, number> = {};
  for (const k of ks) {
    const L = rs.filter((r) => r.contratoId === k.id);
    const tab = L.reduce((s, r) => s + tabelaPeriodo(ctx.cfg, precos.get(r.painelId)!, r.ini, r.fim, r.slots), 0);
    if (!tab) continue;
    for (const r of L) {
      if (!overlap(r.ini, r.fim, ini, fim)) continue;
      const parte = (k.valor * tabelaPeriodo(ctx.cfg, precos.get(r.painelId)!, r.ini, r.fim, r.slots)) / tab;
      receita[r.painelId] = (receita[r.painelId] || 0) + (parte * daysIncl(maxIso(r.ini, ini), minIso(r.fim, fim))) / daysIncl(r.ini, r.fim);
    }
  }
  const faces = await q<any>(pool, `SELECT p.id, p.codigo, p.tipo, p.largura, p.altura, p.estrutura_id, e.endereco, e.cidade FROM paineis p LEFT JOIN estruturas e ON e.id = p.estrutura_id WHERE p.empresa_id = $1 AND p.excluido_em IS NULL`, [ctx.empresaId]);
  const desp = await q<any>(pool, `SELECT valor, painel_id, estrutura_id FROM lancamentos WHERE empresa_id = $1 AND tipo = 'despesa' AND status <> 'cancelado' AND date_part('year', vencimento) = $2 AND excluido_em IS NULL`, [ctx.empresaId, ano]);
  const custo: Record<string, number> = {};
  let semFace = 0;
  for (const f of desp) {
    if (f.painelId) custo[f.painelId] = (custo[f.painelId] || 0) + f.valor;
    else if (f.estruturaId) {
      const fs = faces.filter((p) => p.estruturaId === f.estruturaId);
      if (fs.length) fs.forEach((p) => (custo[p.id] = (custo[p.id] || 0) + f.valor / fs.length));
      else semFace += f.valor;
    } else semFace += f.valor;
  }
  const occ = await dadosOcupacao(pool, ctx.empresaId, ini, fim);
  const linhas = faces.map((p) => {
    const r = round2(receita[p.id] || 0), c = round2(custo[p.id] || 0), m2 = (+p.largura || 0) * (+p.altura || 0);
    return { id: p.id, codigo: p.codigo, endereco: p.endereco, cidade: p.cidade, formato: TIPO_LBL[p.tipo], ocupacao: Math.round(ocupacaoPeriodo(occ.faces, occ.reservas, ini, fim, (x) => x.id === p.id) * 100), receita: r, custo: c, margem: round2(r - c), porM2: m2 ? round2(r / m2) : 0 };
  }).sort((a, b) => b.margem - a.margem);
  return { ano, linhas, semFace: round2(semFace), receita: round2(linhas.reduce((s, x) => s + x.receita, 0)), custo: round2(linhas.reduce((s, x) => s + x.custo, 0)) };
}

relatorios.get('/ocupacao', async (req, res) => res.json(await ocupacao(req.ctx!)));
relatorios.get('/vendas', async (req, res) => res.json(await vendas(req.ctx!, Number(req.query.ano) || new Date().getFullYear())));
relatorios.get('/rentabilidade', async (req, res) => {
  const ctx = req.ctx!;
  if (!podeVer(ctx.perfil, 'dinheiro')) throw new ErroApi(403, 'Rentabilidade é visível para administração e financeiro.');
  res.json(await rentabilidade(ctx, Number(req.query.ano) || new Date().getFullYear()));
});

/* ---- exportação (Excel ou CSV) ---- */
async function tabelaDe(ctx: Ctx, nome: string, ano: number): Promise<Tabela> {
  if (nome === 'ocupacao') {
    const o = await ocupacao(ctx);
    return { titulo: 'Ocupação mensal', colunas: [{ k: 'rotulo', l: 'Mês' }, { k: 'pct', l: 'Ocupação %' }, { k: 'tipo', l: 'Tipo' }], linhas: o.porMes.map((m) => ({ ...m, tipo: m.futuro ? 'Já vendido (futuro)' : m.atual ? 'Mês atual' : 'Realizado' })) };
  }
  if (nome === 'vendas') {
    const v = await vendas(ctx, ano);
    return { titulo: `Vendas ${ano}`, colunas: [{ k: 'numero', l: 'Contrato' }, { k: 'cliente', l: 'Cliente' }, { k: 'vendedor', l: 'Vendedor' }, { k: 'tabela', l: 'Tabela', dinheiro: true }, { k: 'valor', l: 'Vendido', dinheiro: true }, { k: 'desconto', l: 'Desconto %' }], linhas: v.contratos };
  }
  if (nome === 'rentabilidade') {
    if (!podeVer(ctx.perfil, 'dinheiro')) throw new ErroApi(403, 'Sem acesso.');
    const r = await rentabilidade(ctx, ano);
    return { titulo: `Rentabilidade por face ${ano}`, colunas: [{ k: 'codigo', l: 'Face' }, { k: 'endereco', l: 'Endereço' }, { k: 'cidade', l: 'Cidade' }, { k: 'formato', l: 'Formato' }, { k: 'ocupacao', l: 'Ocupação %' }, { k: 'receita', l: 'Receita', dinheiro: true }, { k: 'custo', l: 'Custos diretos', dinheiro: true }, { k: 'margem', l: 'Margem', dinheiro: true }, { k: 'porM2', l: 'Receita por m²', dinheiro: true }], linhas: r.linhas };
  }
  if (nome === 'lancamentos' && podeVer(ctx.perfil, 'dinheiro')) {
    const L = await q<any>(pool, `SELECT l.*, k.numero AS contrato FROM lancamentos l LEFT JOIN contratos k ON k.id = l.contrato_id WHERE l.empresa_id = $1 AND l.excluido_em IS NULL AND date_part('year', l.vencimento) = $2 ORDER BY l.vencimento`, [ctx.empresaId, ano]);
    return { titulo: `Lançamentos ${ano}`, colunas: [{ k: 'vencimento', l: 'Vencimento' }, { k: 'tipo', l: 'Tipo' }, { k: 'categoria', l: 'Categoria' }, { k: 'descricao', l: 'Descrição' }, { k: 'contrato', l: 'Contrato' }, { k: 'valor', l: 'Valor', dinheiro: true }, { k: 'status', l: 'Situação' }, { k: 'pagoEm', l: 'Pago em' }, { k: 'nfNumero', l: 'Nota' }], linhas: L };
  }
  throw new ErroApi(404, 'Relatório não encontrado.');
}

export async function enviarTabela(res: Response, t: Tabela, formato: string) {
  const nome = t.titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase();
  if (formato === 'csv') {
    const cel = (v: unknown) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const linhas = [t.colunas.map((c) => c.l).join(';'), ...t.linhas.map((r) => t.colunas.map((c) => cel(c.dinheiro ? String(r[c.k] ?? 0).replace('.', ',') : r[c.k])).join(';'))];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nome}.csv"`);
    return res.send('﻿' + linhas.join('\r\n'));
  }
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(t.titulo.slice(0, 30));
  ws.columns = t.colunas.map((c) => ({ header: c.l, key: c.k, width: Math.min(48, Math.max(12, c.l.length + 2)), style: c.dinheiro ? { numFmt: '"R$" #,##0.00' } : {} }));
  ws.getRow(1).font = { bold: true };
  t.linhas.forEach((r) => ws.addRow(Object.fromEntries(t.colunas.map((c) => [c.k, r[c.k] ?? '']))));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nome}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}

relatorios.get('/exportar/:nome', async (req, res) => {
  const t = await tabelaDe(req.ctx!, String(req.params.nome), Number(req.query.ano) || new Date().getFullYear());
  await enviarTabela(res, t, String(req.query.formato || 'xlsx'));
});
