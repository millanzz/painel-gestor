import { z } from 'zod';
import { ARTE_ST, today } from '@shared';
import { registrar } from '../auditoria';
import { editar } from '../contexto';
import { buscar, rotasCrud, type DefRecurso } from '../crud';
import { tx } from '../db';
import { invalido, naoEncontrado, zData, zTexto } from '../http';
import { guardarArquivo, upload } from './campo';

export const defArtes: DefRecurso = {
  recurso: 'artes', rota: 'artes', tabela: 'artes', nome: 'Arte',
  schema: z.object({
    contratoId: z.string().uuid(), status: z.enum(ARTE_ST.map((a) => a[0]) as [string, ...string[]]).default('aguardando'),
    prazo: zData, necessario: zTexto, grafica: zTexto, previsao: zData, recebido: zTexto, recebidoEm: zData, obs: zTexto,
  }),
  select: `SELECT t.*, k.numero AS contrato_numero, k.campanha, k.status AS contrato_status, c.nome AS cliente_nome, per.ini
             FROM artes t JOIN contratos k ON k.id = t.contrato_id JOIN clientes c ON c.id = k.cliente_id
             LEFT JOIN LATERAL (SELECT min(r.ini) AS ini FROM reservas r WHERE r.contrato_id = k.id AND r.excluido_em IS NULL
                                  AND r.status IN ('reservado','confirmado')) per ON true`,
  ordem: `t.status = 'recebido', per.ini NULLS LAST`,
  rotulo: (r) => `Arte ${r.contratoNumero || ''}`,
  contratoDe: (r) => r.contratoId,
  async antes(_c, _ctx, d, anterior) {
    if (d.status === 'recebido' && anterior?.status !== 'recebido' && !d.recebidoEm) d.recebidoEm = today();
  },
  filtro(req) {
    if (req.query.situacao === 'abertas') return ` AND t.status <> 'recebido' AND k.status IN ('proposta','aprovacao','aprovada','ativo')`;
    return '';
  },
};

export const rotasArtes = rotasCrud(defArtes, (r) => {
  /** Anexa a imagem da arte; se estava aguardando, passa para aprovação. */
  r.post('/:id/arquivo', editar('artes'), upload.single('arquivo'), async (req, res) => {
    const ctx = req.ctx!;
    if (!req.file) throw invalido('Envie a arte como imagem (JPG ou PNG).');
    const out = await tx(async (c) => {
      const a = await buscar<any>(c, defArtes, ctx.empresaId, String(req.params.id));
      if (!a) throw naoEncontrado('Arte');
      const arq = await guardarArquivo(c, ctx.empresaId, req.file!);
      await c.query(`UPDATE artes SET arquivo_id = $2, nome_arquivo = $3, status = CASE WHEN status = 'aguardando' THEN 'aprovacao' ELSE status END, atualizado_em = now() WHERE id = $1`,
        [a.id, arq.id, req.file!.originalname]);
      await registrar(c, ctx, 'anexou arte', 'artes', a, { rotulo: `Arte ${a.contratoNumero}`, contratoId: a.contratoId });
      return buscar(c, defArtes, ctx.empresaId, a.id);
    });
    res.json(out);
  });
});
