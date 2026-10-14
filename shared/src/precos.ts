import type { ConfigEmpresa } from './config';
import { parseISO, daysIncl } from './datas';

export const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

/** Acréscimo de temporada para um mês (1–12). Vale o maior percentual que se aplica. */
export function sazonalPct(cfg: Pick<ConfigEmpresa, 'sazonal'>, mes: number): number {
  let p = 0;
  for (const s of cfg.sazonal || []) {
    const a = +s.mesIni, b = +s.mesFim;
    if (!a || !b) continue;
    const dentro = a <= b ? mes >= a && mes <= b : mes >= a || mes <= b;
    if (dentro) p = Math.max(p, +s.pct || 0);
  }
  return p;
}

export interface PainelPreco { tipo: string; valorBi: number; slots?: number }

/**
 * Valor de tabela de uma face num período. O preço da bissemana é dividido por
 * 14 e aplicado dia a dia, com o acréscimo de temporada do mês de cada dia.
 * No LED, o preço é por cota (inserção) contratada.
 */
export function tabelaPeriodo(cfg: Pick<ConfigEmpresa, 'sazonal'>, p: PainelPreco, ini: string, fim: string, cotas = 1): number {
  if (!p || !ini || !fim || fim < ini) return 0;
  const porDia = (+p.valorBi || 0) / 14;
  let total = 0;
  let d = parseISO(ini);
  const end = parseISO(fim);
  while (d <= end) {
    const fimMes = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const seg = fimMes < end ? fimMes : end;
    const dias = Math.round((seg.getTime() - d.getTime()) / 864e5) + 1;
    total += dias * porDia * (1 + sazonalPct(cfg, d.getMonth() + 1) / 100);
    d = new Date(seg);
    d.setDate(d.getDate() + 1);
  }
  return round2(total * (p.tipo === 'led' ? Math.max(1, +cotas || 1) : 1));
}

/** Desconto sugerido pela quantidade de faces diferentes no contrato. */
export function volumePct(cfg: Pick<ConfigEmpresa, 'volume'>, nFaces: number): number {
  let p = 0;
  for (const v of cfg.volume || []) if (nFaces >= +v.min) p = Math.max(p, +v.pct || 0);
  return p;
}

export interface ReservaPreco { painelId: string; ini: string; fim: string; slots: number }

/** Resumo financeiro de um contrato: tabela, desconto, comissões e líquido. */
export function calcularContrato(
  cfg: ConfigEmpresa,
  valor: number,
  reservas: ReservaPreco[],
  paineis: Map<string, PainelPreco>,
  opts: { comissaoAgenciaPct?: number; temVendedor?: boolean } = {},
) {
  const tabela = round2(reservas.reduce((s, r) => {
    const p = paineis.get(r.painelId);
    return s + (p ? tabelaPeriodo(cfg, p, r.ini, r.fim, r.slots) : 0);
  }, 0));
  const nFaces = new Set(reservas.map((r) => r.painelId)).size;
  const vol = volumePct(cfg, nFaces);
  const sugerido = round2(tabela * (1 - vol / 100));
  const v = +valor || 0;
  const desconto = tabela ? Math.max(0, (1 - v / tabela) * 100) : 0;
  const comAgPct = opts.comissaoAgenciaPct || 0;
  const comAgencia = round2((v * comAgPct) / 100);
  const comVendedor = opts.temVendedor ? round2((v * (+cfg.comissaoVendedor || 0)) / 100) : 0;
  return { tabela, nFaces, volumePct: vol, sugerido, valor: v, desconto, comAgPct, comAgencia, comVendedor, liquido: round2(v - comAgencia - comVendedor) };
}

/** Parte do saldo do contrato ainda não veiculada a partir de uma data. */
export function saldoNaoVeiculado(cfg: ConfigEmpresa, valor: number, tabela: number, reservas: ReservaPreco[], paineis: Map<string, PainelPreco>, data: string) {
  let saldoTab = 0;
  for (const r of reservas) {
    if (r.fim < data) continue;
    const a = r.ini > data ? r.ini : data;
    const p = paineis.get(r.painelId);
    if (p) saldoTab += tabelaPeriodo(cfg, p, a, r.fim, r.slots);
  }
  return tabela ? round2((saldoTab * valor) / tabela) : 0;
}

/** Divide um valor em n parcelas; a última absorve os centavos. */
export function dividirParcelas(valor: number, n: number): number[] {
  n = Math.max(1, Math.min(48, Math.floor(n)));
  const base = Math.floor((valor / n) * 100) / 100;
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? round2(valor - base * (n - 1)) : base));
}

/** Dias de atraso: positivo quando já venceu. */
export const diasAtraso = (vencimento: string, hoje: string) => daysIncl(vencimento, hoje) - 1;
