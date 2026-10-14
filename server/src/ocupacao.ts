import { overlap } from '@shared';
import { q, type Db } from './db';
import { SQL_OCUPA, usoMax } from './dominio';

export interface FaceOcup { id: string; tipo: string; slots: number; status: string; cidade?: string }
export interface ResOcup { painelId: string; ini: string; fim: string; slots: number }

/** Fração das faces ativas vendidas num período (LED conta pela fração de cotas). */
export function ocupacaoPeriodo(faces: FaceOcup[], reservas: ResOcup[], ini: string, fim: string, filtro?: (f: FaceOcup) => boolean) {
  const ativas = faces.filter((f) => f.status !== 'inativo' && (!filtro || filtro(f)));
  if (!ativas.length) return 0;
  let tot = 0;
  for (const f of ativas) {
    const rs = reservas.filter((r) => r.painelId === f.id && overlap(r.ini, r.fim, ini, fim));
    if (!rs.length) continue;
    tot += f.tipo === 'led' ? Math.min(1, usoMax(rs, ini, fim) / Math.max(1, f.slots)) : 1;
  }
  return tot / ativas.length;
}

/** Faces e reservas que ocupam, para calcular ocupação numa janela de datas. */
export async function dadosOcupacao(db: Db, empresaId: string, de: string, ate: string) {
  const faces = await q<FaceOcup>(db,
    `SELECT p.id, p.tipo, p.slots, p.status, e.cidade FROM paineis p LEFT JOIN estruturas e ON e.id = p.estrutura_id
      WHERE p.empresa_id = $1 AND p.excluido_em IS NULL`, [empresaId]);
  const reservas = await q<ResOcup>(db,
    `SELECT r.painel_id, r.ini, r.fim, r.slots FROM reservas r
      WHERE r.empresa_id = $1 AND r.excluido_em IS NULL AND ${SQL_OCUPA} AND r.fim >= $2 AND r.ini <= $3`, [empresaId, de, ate]);
  return { faces, reservas };
}
