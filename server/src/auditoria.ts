import type { Ctx } from './contexto';
import { snake, type Db } from './db';

const IGNORAR = new Set(['id', 'empresaId', 'criadoEm', 'atualizadoEm', 'excluidoEm', 'excluidoPor', 'dados']);
const ROTULOS: Record<string, string> = {
  status: 'situação', valor: 'valor', ini: 'início', fim: 'fim', painelId: 'face', perfil: 'perfil',
  vencimento: 'vencimento', valorBi: 'preço/BI', pagoEm: 'pago em', validade: 'validade', campanha: 'campanha',
  prazo: 'prazo', nfStatus: 'nota fiscal', nfNumero: 'nº da nota', codigo: 'código', nome: 'nome',
};

const fmt = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/** Lista as mudanças legíveis entre a versão anterior e a nova. */
export function diferencas(antes: Record<string, any> | null, depois: Record<string, any> | null): string[] {
  if (!antes || !depois) return [];
  const out: string[] = [];
  for (const k of Object.keys({ ...antes, ...depois })) {
    if (IGNORAR.has(k) || !(k in depois)) continue;
    const a = antes[k], b = depois[k];
    if (JSON.stringify(a ?? null) === JSON.stringify(b ?? null)) continue;
    out.push(`${ROTULOS[k] || snake(k).replace(/_/g, ' ')}: ${fmt(a)} → ${fmt(b)}`);
  }
  return out.slice(0, 8);
}

export async function registrar(
  db: Db, ctx: Ctx, acao: string, tabela: string,
  reg: { id?: string } | null, opts: { antes?: any; depois?: any; rotulo?: string; contratoId?: string | null } = {},
) {
  const mudancas = acao === 'alterou' ? diferencas(opts.antes, opts.depois) : [];
  if (acao === 'alterou' && !mudancas.length) return;
  await db.query(
    `INSERT INTO auditoria (empresa_id, autor_id, autor_nome, perfil, acao, tabela, registro_id, rotulo, mudancas, contrato_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [ctx.empresaId, ctx.membroId, ctx.autorNome, ctx.perfil, acao, tabela, reg?.id ?? null, opts.rotulo ?? '', JSON.stringify(mudancas), opts.contratoId ?? null],
  );
}
