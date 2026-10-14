import { Router } from 'express';
import { soAdmin } from '../contexto';
import { pool, q } from '../db';

export const auditoria = Router();
auditoria.use(soAdmin);

auditoria.get('/', async (req, res) => {
  const ctx = req.ctx!;
  const params: any[] = [ctx.empresaId];
  let extra = '';
  if (req.query.tabela) { params.push(req.query.tabela); extra += ` AND tabela = $${params.length}`; }
  if (req.query.q) { params.push(`%${req.query.q}%`); extra += ` AND (rotulo ILIKE $${params.length} OR autor_nome ILIKE $${params.length} OR mudancas::text ILIKE $${params.length})`; }
  if (req.query.antes) { params.push(req.query.antes); extra += ` AND id < $${params.length}`; }
  res.json(await q(pool, `SELECT * FROM auditoria WHERE empresa_id = $1 ${extra} ORDER BY id DESC LIMIT 100`, params));
});

/** Itens excluídos de todas as áreas, para restaurar. */
auditoria.get('/lixeira', async (req, res) => {
  const e = req.ctx!.empresaId;
  res.json(await q(pool,
    `SELECT 'estruturas' AS rota, id, codigo || ' · ' || endereco AS rotulo, 'Estrutura' AS tipo, excluido_em, excluido_por FROM estruturas WHERE empresa_id = $1 AND excluido_em IS NOT NULL
     UNION ALL SELECT 'paineis', id, codigo, 'Face', excluido_em, excluido_por FROM paineis WHERE empresa_id = $1 AND excluido_em IS NOT NULL
     UNION ALL SELECT 'clientes', id, nome, 'Cliente', excluido_em, excluido_por FROM clientes WHERE empresa_id = $1 AND excluido_em IS NOT NULL
     UNION ALL SELECT 'contratos', id, numero || ' · ' || campanha, 'Contrato', excluido_em, excluido_por FROM contratos WHERE empresa_id = $1 AND excluido_em IS NOT NULL
     UNION ALL SELECT 'reservas', r.id, p.codigo || ' · ' || r.campanha || ' · ' || to_char(r.ini,'DD/MM') || ' a ' || to_char(r.fim,'DD/MM'), 'Reserva', r.excluido_em, r.excluido_por FROM reservas r JOIN paineis p ON p.id = r.painel_id WHERE r.empresa_id = $1 AND r.excluido_em IS NOT NULL AND r.excluido_por <> 'automático'
     UNION ALL SELECT 'lancamentos', id, descricao, 'Lançamento', excluido_em, excluido_por FROM lancamentos WHERE empresa_id = $1 AND excluido_em IS NOT NULL
     UNION ALL SELECT 'recorrencias', id, descricao, 'Recorrência', excluido_em, excluido_por FROM recorrencias WHERE empresa_id = $1 AND excluido_em IS NOT NULL
     UNION ALL SELECT 'os', id, tipo || ' · ' || descricao, 'Ordem de serviço', excluido_em, excluido_por FROM ordens_servico WHERE empresa_id = $1 AND excluido_em IS NOT NULL AND excluido_por NOT IN ('automático','troca de face')
     UNION ALL SELECT 'membros', id, nome, 'Usuário', excluido_em, excluido_por FROM membros WHERE empresa_id = $1 AND excluido_em IS NOT NULL
     ORDER BY excluido_em DESC LIMIT 200`, [e]));
});
