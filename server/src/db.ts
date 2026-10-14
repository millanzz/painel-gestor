import pg from 'pg';
import { env } from './env';

// numeric -> number; date -> 'AAAA-MM-DD' (sem conversão de fuso).
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)) as any);
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)) as any);

export const pool = new pg.Pool({ connectionString: env.databaseUrl, max: 10 });

export type Db = pg.Pool | pg.PoolClient;

export const camel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
export const snake = (s: string) => s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase()).replace(/([a-z])(\d)/g, '$1_$2');

/** Converte as chaves de uma linha do banco para camelCase. */
export function row<T = any>(r: Record<string, any> | undefined | null): T {
  if (!r) return r as T;
  const o: any = {};
  for (const k in r) o[camel(k)] = r[k];
  return o;
}

export async function q<T = any>(db: Db, sql: string, params: any[] = []): Promise<T[]> {
  const r = await db.query(sql, params);
  return r.rows.map((x) => row<T>(x));
}

export async function q1<T = any>(db: Db, sql: string, params: any[] = []): Promise<T | null> {
  const r = await q<T>(db, sql, params);
  return r[0] ?? null;
}

/** Executa fn numa transação. */
export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/**
 * INSERT com lista de campos permitidos. Campos ausentes ficam com o padrão
 * do banco. Retorna o registro inserido.
 */
export async function inserir<T = any>(db: Db, tabela: string, dados: Record<string, any>, campos: readonly string[]): Promise<T> {
  const cols: string[] = [], vals: any[] = [];
  for (const c of campos) {
    if (dados[c] === undefined) continue;
    cols.push(snake(c));
    vals.push(normalizar(dados[c]));
  }
  const ph = vals.map((_, i) => `$${i + 1}`);
  const sql = `INSERT INTO ${tabela} (${cols.join(', ')}) VALUES (${ph.join(', ')}) RETURNING *`;
  return (await q1<T>(db, sql, vals))!;
}

/** UPDATE de um registro da empresa, só com os campos permitidos. */
export async function atualizar<T = any>(db: Db, tabela: string, empresaId: string, id: string, dados: Record<string, any>, campos: readonly string[]): Promise<T | null> {
  const sets: string[] = [], vals: any[] = [];
  for (const c of campos) {
    if (dados[c] === undefined) continue;
    vals.push(normalizar(dados[c]));
    sets.push(`${snake(c)} = $${vals.length}`);
  }
  if (!sets.length) return q1<T>(db, `SELECT * FROM ${tabela} WHERE id = $1 AND empresa_id = $2`, [id, empresaId]);
  vals.push(id, empresaId);
  const sql = `UPDATE ${tabela} SET ${sets.join(', ')}, atualizado_em = now() WHERE id = $${vals.length - 1} AND empresa_id = $${vals.length} RETURNING *`;
  return q1<T>(db, sql, vals);
}

function normalizar(v: any) {
  if (v && typeof v === 'object' && !(v instanceof Date) && !Buffer.isBuffer(v)) return JSON.stringify(v);
  return v;
}
