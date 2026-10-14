import { Router, type Request } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import type { Recurso } from '@shared';
import { registrar } from './auditoria';
import { editar, ler, soAdmin, type Ctx } from './contexto';
import { atualizar, inserir, pool, q, q1, row, tx } from './db';
import { naoEncontrado, validar } from './http';

export interface DefRecurso<T = any> {
  recurso: Recurso;
  rota: string;
  tabela: string;
  nome: string; // para mensagens: "Face", "Cliente"
  schema: z.ZodObject<any>;
  /** Campos que os ganchos podem gravar, mas que não vêm do formulário. */
  extras?: string[];
  /** SELECT base (deve expor a tabela principal como "t"). */
  select?: string;
  ordem?: string;
  rotulo: (r: T) => string;
  contratoDe?: (r: T) => string | null | undefined;
  /** Validações e ajustes antes de gravar (dentro da transação). */
  antes?: (c: PoolClient, ctx: Ctx, dados: any, anterior: T | null) => Promise<void>;
  /** Efeitos colaterais depois de gravar (dentro da transação). */
  depois?: (c: PoolClient, ctx: Ctx, reg: T, anterior: T | null) => Promise<void>;
  /** Efeitos ao excluir (dentro da transação). */
  aoExcluir?: (c: PoolClient, ctx: Ctx, reg: T) => Promise<void>;
  /** Filtro extra na listagem a partir da query string. */
  filtro?: (req: Request, params: any[]) => string;
}

export function baseSelect(d: DefRecurso) {
  return d.select || `SELECT t.* FROM ${d.tabela} t`;
}

export async function buscar<T = any>(db: PoolClient | typeof pool, d: DefRecurso, empresaId: string, id: string, incluirExcluidos = false): Promise<T | null> {
  return q1<T>(db, `${baseSelect(d)} WHERE t.empresa_id = $1 AND t.id = $2 ${incluirExcluidos ? '' : 'AND t.excluido_em IS NULL'}`, [empresaId, id]);
}

/** Cria/atualiza com validação, auditoria e ganchos, numa transação. */
export async function salvar<T = any>(d: DefRecurso<T>, ctx: Ctx, corpo: any, id?: string, c?: PoolClient): Promise<T> {
  const run = async (cx: PoolClient) => {
    const anterior = id ? await buscar<T>(cx, d, ctx.empresaId, id) : null;
    if (id && !anterior) throw naoEncontrado(d.nome);
    const schema = id ? d.schema.partial() : d.schema;
    const dados: any = validar(schema, corpo);
    await d.antes?.(cx, ctx, dados, anterior);
    const campos = [...Object.keys(d.schema.shape), ...(d.extras || [])];
    let reg: any;
    if (id) reg = row(await atualizar(cx, d.tabela, ctx.empresaId, id, dados, campos));
    else reg = row(await inserir(cx, d.tabela, { ...dados, empresaId: ctx.empresaId }, [...campos, 'empresaId']));
    reg = await buscar<T>(cx, d, ctx.empresaId, reg.id);
    await registrar(cx, ctx, id ? 'alterou' : 'criou', d.tabela, reg, { antes: anterior, depois: reg, rotulo: d.rotulo(reg), contratoId: d.contratoDe?.(reg) ?? null });
    await d.depois?.(cx, ctx, reg, anterior);
    return (await buscar<T>(cx, d, ctx.empresaId, reg.id)) as T;
  };
  return c ? run(c) : tx(run);
}

export async function excluir(d: DefRecurso, ctx: Ctx, id: string, c: PoolClient) {
  const reg = await buscar(c, d, ctx.empresaId, id);
  if (!reg) throw naoEncontrado(d.nome);
  await c.query(`UPDATE ${d.tabela} SET excluido_em = now(), excluido_por = $3 WHERE id = $1 AND empresa_id = $2`, [id, ctx.empresaId, ctx.autorNome]);
  await d.aoExcluir?.(c, ctx, reg);
  await registrar(c, ctx, 'excluiu', d.tabela, reg, { rotulo: d.rotulo(reg), contratoId: d.contratoDe?.(reg) ?? null });
}

/** Rotas REST padrão de um recurso. */
export function rotasCrud(d: DefRecurso, extras?: (r: Router) => void) {
  const r = Router();
  extras?.(r);

  r.get('/', ler(d.recurso), async (req, res) => {
    const params: any[] = [req.ctx!.empresaId];
    const extra = d.filtro?.(req, params) || '';
    const rows = await q(pool, `${baseSelect(d)} WHERE t.empresa_id = $1 AND t.excluido_em IS NULL ${extra} ORDER BY ${d.ordem || 't.criado_em DESC'}`, params);
    res.json(rows);
  });

  r.get('/:id', ler(d.recurso), async (req, res) => {
    const reg = await buscar(pool, d, req.ctx!.empresaId, String(req.params.id));
    if (!reg) throw naoEncontrado(d.nome);
    res.json(reg);
  });

  r.post('/', editar(d.recurso), async (req, res) => {
    res.status(201).json(await salvar(d, req.ctx!, req.body));
  });

  r.patch('/:id', editar(d.recurso), async (req, res) => {
    res.json(await salvar(d, req.ctx!, req.body, String(req.params.id)));
  });

  r.delete('/:id', editar(d.recurso), async (req, res) => {
    await tx((c) => excluir(d, req.ctx!, String(req.params.id), c));
    res.status(204).end();
  });

  r.post('/:id/restaurar', soAdmin, async (req, res) => {
    const ctx = req.ctx!;
    await tx(async (c) => {
      const reg = await buscar(c, d, ctx.empresaId, String(req.params.id), true);
      if (!reg) throw naoEncontrado(d.nome);
      await c.query(`UPDATE ${d.tabela} SET excluido_em = NULL, excluido_por = NULL WHERE id = $1 AND empresa_id = $2`, [reg.id, ctx.empresaId]);
      await registrar(c, ctx, 'restaurou', d.tabela, reg, { rotulo: d.rotulo(reg), contratoId: d.contratoDe?.(reg) ?? null });
    });
    res.status(204).end();
  });

  return r;
}
