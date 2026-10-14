// Portal do anunciante: só as campanhas, fotos e pagamentos do próprio cliente.
import { Router, type NextFunction, type Request, type Response } from 'express';
import { pixPayload, txidDe } from '@shared';
import { registrar } from '../auditoria';
import { pool, q, q1 } from '../db';
import { ErroApi, invalido, naoEncontrado } from '../http';

export const portal = Router();

const soCliente = (req: Request, _res: Response, next: NextFunction) =>
  next(req.ctx!.perfil === 'cliente' && req.ctx!.clienteId ? undefined : new ErroApi(403, 'Área do anunciante.'));
portal.use(soCliente);

/** Contratos visíveis ao anunciante (como cliente direto ou pela agência). */
const SQL_MEUS = `(k.cliente_id = $2 OR k.agencia_id = $2) AND k.empresa_id = $1 AND k.excluido_em IS NULL AND k.status <> 'aprovacao'`;

portal.get('/', async (req, res) => {
  const ctx = req.ctx!;
  const p = [ctx.empresaId, ctx.clienteId];
  const campanhas = await q<any>(pool,
    `SELECT k.id, k.numero, k.campanha, k.status, k.valor, k.validade_proposta, k.aceito_em, k.pi_numero, c.nome AS cliente_nome,
            per.ini, per.fim, per.n_faces
       FROM contratos k JOIN clientes c ON c.id = k.cliente_id
       LEFT JOIN LATERAL (SELECT min(r.ini) AS ini, max(r.fim) AS fim, count(DISTINCT r.painel_id)::int AS n_faces FROM reservas r
                           WHERE r.contrato_id = k.id AND r.excluido_em IS NULL AND r.status IN ('reservado','confirmado')) per ON true
      WHERE ${SQL_MEUS} AND k.status <> 'cancelado'
      ORDER BY (k.status = 'ativo') DESC, per.ini DESC NULLS LAST`, p);
  const fotos = await q<any>(pool,
    `SELECT f.id, f.arquivo_id, f.data, f.criado_em, f.verificacao, f.distancia_m, f.exif, f.contrato_id, p.codigo AS painel_codigo, e.endereco, e.bairro, e.cidade
       FROM comprovacoes f JOIN contratos k ON k.id = f.contrato_id JOIN paineis p ON p.id = f.painel_id LEFT JOIN estruturas e ON e.id = p.estrutura_id
      WHERE ${SQL_MEUS} AND f.excluido_em IS NULL AND f.tipo <> 'retirada' ORDER BY f.criado_em DESC LIMIT 60`, p);
  const pagamentos = await q<any>(pool,
    `SELECT l.id, l.descricao, l.vencimento, l.valor, l.status, l.pago_em, l.nf_numero, l.nf_link, k.numero AS contrato_numero
       FROM lancamentos l JOIN contratos k ON k.id = l.contrato_id
      WHERE ${SQL_MEUS} AND l.tipo = 'receita' AND l.status <> 'cancelado' AND l.excluido_em IS NULL ORDER BY l.vencimento`, p);
  const empresa = await q1<any>(pool, 'SELECT nome, config FROM empresas WHERE id = $1', [ctx.empresaId]);
  const contato = await q1<any>(pool,
    `SELECT m.nome FROM contratos k JOIN membros m ON m.id = k.vendedor_id WHERE ${SQL_MEUS} ORDER BY k.data DESC LIMIT 1`, p);
  res.json({
    empresa: { nome: empresa.nome, telefone: ctx.cfg.empresa.telefone, email: ctx.cfg.empresa.email },
    contato: contato?.nome || null,
    usuario: ctx.autorNome,
    clienteNome: (await q1<any>(pool, 'SELECT nome FROM clientes WHERE id = $1', [ctx.clienteId]))?.nome,
    campanhas, fotos, pagamentos, temPix: !!ctx.cfg.pix.chave,
  });
});

portal.get('/pix/:id', async (req, res) => {
  const ctx = req.ctx!;
  const f = await q1<any>(pool,
    `SELECT l.* FROM lancamentos l JOIN contratos k ON k.id = l.contrato_id WHERE l.id = $3 AND ${SQL_MEUS} AND l.status = 'aberto'`,
    [ctx.empresaId, ctx.clienteId, req.params.id]);
  if (!f) throw naoEncontrado('Pagamento');
  if (!ctx.cfg.pix.chave) throw invalido('A exibidora ainda não cadastrou a chave PIX. Fale com seu contato.');
  res.json({ payload: pixPayload(ctx.cfg.pix, f.valor, txidDe(f.id)), valor: f.valor, descricao: f.descricao });
});

/** O anunciante aceita a proposta; o comercial é avisado para aprovar e emitir o PI. */
portal.post('/propostas/:id/aceitar', async (req, res) => {
  const ctx = req.ctx!;
  const k = await q1<any>(pool, `SELECT k.* FROM contratos k WHERE k.id = $3 AND ${SQL_MEUS}`, [ctx.empresaId, ctx.clienteId, req.params.id]);
  if (!k) throw naoEncontrado('Proposta');
  if (!['proposta', 'aprovada'].includes(k.status)) throw invalido('Esta proposta não está aguardando resposta.');
  await pool.query('UPDATE contratos SET aceito_em = now(), aceito_por = $2 WHERE id = $1', [k.id, ctx.autorNome]);
  await registrar(pool, ctx, 'cliente aceitou', 'contratos', k, { rotulo: `${k.numero} · ${k.campanha}`, contratoId: k.id });
  res.json({ ok: true });
});
