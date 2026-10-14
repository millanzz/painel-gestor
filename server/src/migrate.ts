// Aplica as migrações SQL de server/db/migrations em ordem, uma única vez cada.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db';

const dir = path.dirname(fileURLToPath(import.meta.url));
const pasta = [path.resolve(dir, '../db/migrations'), path.resolve(dir, '../../server/db/migrations')].find((p) => existsSync(p))!;

export async function migrar(log = true) {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (nome text PRIMARY KEY, aplicada_em timestamptz NOT NULL DEFAULT now())');
  const feitas = new Set((await pool.query('SELECT nome FROM schema_migrations')).rows.map((r) => r.nome));
  for (const arq of readdirSync(pasta).filter((f) => f.endsWith('.sql')).sort()) {
    if (feitas.has(arq)) continue;
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(readFileSync(path.join(pasta, arq), 'utf8'));
      await c.query('INSERT INTO schema_migrations (nome) VALUES ($1)', [arq]);
      await c.query('COMMIT');
      if (log) console.log(`migração aplicada: ${arq}`);
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  migrar().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
}
