import { Router } from 'express';
import { today } from '@shared';
import { ler } from '../contexto';
import { pool, q } from '../db';
import { cal } from '../dominio';
import { dadosOcupacao, ocupacaoPeriodo } from '../ocupacao';

export const agenda = Router();

/**
 * Dados do "tape chart": colunas por bissemana, faces agrupadas por cidade e
 * os blocos de reserva. ?desde=AAAA-MM-DD (padrão: uma BI antes da atual) e ?n=12.
 */
agenda.get('/', ler('reservas'), async (req, res) => {
  const ctx = req.ctx!;
  const C = cal(ctx.cfg);
  const n = Math.min(26, Math.max(4, Number(req.query.n) || 12));
  const base = req.query.desde ? C.biOf(String(req.query.desde)) : C.biAdd(C.biOf(today()), -1);
  const atual = C.biOf(today());
  const colunas = Array.from({ length: n }, (_, i) => {
    const b = C.biAdd(base, i);
    return { ano: b.ano, bi: b.bi, ini: C.biIni(b.ano, b.bi), fim: C.biFim(b.ano, b.bi), hoje: b.ano === atual.ano && b.bi === atual.bi };
  });
  const de = colunas[0].ini, ate = colunas[n - 1].fim;
  const faces = await q<any>(pool,
    `SELECT p.id, p.codigo, p.tipo, p.slots, p.status, p.valor_bi, p.sentido, e.endereco, e.bairro, e.cidade, e.lat, e.lng
       FROM paineis p LEFT JOIN estruturas e ON e.id = p.estrutura_id
      WHERE p.empresa_id = $1 AND p.excluido_em IS NULL ORDER BY e.cidade NULLS LAST, p.codigo`, [ctx.empresaId]);
  const reservas = await q<any>(pool,
    `SELECT r.id, r.painel_id, r.contrato_id, r.campanha, r.ini, r.fim, r.status, r.validade, r.slots, c.nome AS cliente_nome, k.numero AS contrato_numero
       FROM reservas r LEFT JOIN contratos k ON k.id = r.contrato_id LEFT JOIN clientes c ON c.id = k.cliente_id
      WHERE r.empresa_id = $1 AND r.excluido_em IS NULL AND r.status IN ('reservado','confirmado','fila')
        AND r.fim >= $2 AND r.ini <= $3 ORDER BY r.ini`, [ctx.empresaId, de, ate]);
  const occ = await dadosOcupacao(pool, ctx.empresaId, de, ate);
  const ocupacao = colunas.map((c) => Math.round(ocupacaoPeriodo(occ.faces, occ.reservas, c.ini, c.fim) * 100));
  res.json({ colunas, faces, reservas, ocupacao, hoje: today() });
});
