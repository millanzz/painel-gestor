// Cadastros simples: estruturas, faces, clientes e recorrências.
import { z } from 'zod';
import { PLANOS, TIPOS_PAINEL } from '@shared';
import { registrar } from '../auditoria';
import { inserir, q, q1 } from '../db';
import { invalido, zBool, zData, zId, zNum, zNumObrig, zTexto, zTextoObrig } from '../http';
import type { DefRecurso } from '../crud';

export const defEstruturas: DefRecurso = {
  recurso: 'estruturas', rota: 'estruturas', tabela: 'estruturas', nome: 'Estrutura',
  schema: z.object({
    codigo: zTextoObrig, endereco: zTextoObrig, bairro: zTexto, cidade: zTextoObrig, uf: zTexto,
    lat: zNum, lng: zNum,
    licNumero: zTexto, licOrgao: zTexto, licTaxa: zNum, licVencimento: zData,
    locProprietario: zTexto, locContato: zTexto, locValor: zNum, locDia: zNum, locIndice: zTexto, locReajuste: zData, locVencimento: zData,
    obs: zTexto,
  }),
  select: `SELECT t.*, (SELECT count(*) FROM paineis p WHERE p.estrutura_id = t.id AND p.excluido_em IS NULL)::int AS n_faces,
                  (SELECT json_agg(json_build_object('id', f.id, 'arquivoId', f.arquivo_id, 'data', f.data) ORDER BY f.data DESC)
                     FROM fotos_ponto f WHERE f.estrutura_id = t.id AND f.excluido_em IS NULL) AS fotos
             FROM estruturas t`,
  ordem: 't.cidade, t.codigo',
  rotulo: (r) => r.codigo,
  /** Mantém a recorrência de aluguel do terreno em dia com o cadastro da estrutura. */
  async depois(c, ctx, e) {
    const rc = await q1<any>(c, `SELECT * FROM recorrencias WHERE estrutura_id = $1 AND categoria = 'aluguel' AND excluido_em IS NULL`, [e.id]);
    if (+e.locValor > 0) {
      const desc = `Aluguel do terreno · ${e.codigo}${e.locProprietario ? ' · ' + e.locProprietario : ''}`;
      if (!rc) {
        await inserir(c, 'recorrencias', { empresaId: ctx.empresaId, descricao: desc, categoria: 'aluguel', valor: e.locValor, dia: e.locDia || 10, estruturaId: e.id, ativo: true },
          ['empresaId', 'descricao', 'categoria', 'valor', 'dia', 'estruturaId', 'ativo']);
      } else {
        await c.query('UPDATE recorrencias SET descricao = $2, valor = $3, dia = $4, ativo = true, atualizado_em = now() WHERE id = $1', [rc.id, desc, e.locValor, e.locDia || 10]);
      }
    } else if (rc?.ativo) {
      await c.query('UPDATE recorrencias SET ativo = false, atualizado_em = now() WHERE id = $1', [rc.id]);
    }
  },
};

export const defPaineis: DefRecurso = {
  recurso: 'paineis', rota: 'paineis', tabela: 'paineis', nome: 'Face',
  schema: z.object({
    estruturaId: zId, codigo: zTextoObrig, face: zTexto,
    tipo: z.enum(TIPOS_PAINEL.map((t) => t[0]) as [string, ...string[]]),
    largura: zNum, altura: zNum, iluminado: zBool, valorBi: zNumObrig.pipe(z.number().min(0)),
    status: z.enum(['ativo', 'inativo']).default('ativo'), sentido: zTexto,
    slots: z.preprocess((v) => (v === '' || v == null ? 1 : Number(v)), z.number().int().min(1).max(60)),
    insercaoSeg: zNum, loopSeg: zNum, horasDia: zNum, obs: zTexto,
  }),
  select: `SELECT t.*, e.codigo AS estrutura_codigo, e.endereco, e.bairro, e.cidade, e.uf, e.lat, e.lng
             FROM paineis t LEFT JOIN estruturas e ON e.id = t.estrutura_id`,
  ordem: 'e.cidade, t.codigo',
  rotulo: (r) => r.codigo,
  async antes(c, ctx, d, anterior) {
    if (!anterior) {
      const n = await q1<any>(c, 'SELECT count(*)::int AS n FROM paineis WHERE empresa_id = $1 AND excluido_em IS NULL', [ctx.empresaId]);
      const plano = PLANOS[ctx.cfg.plano.id] || PLANOS.pro;
      if (n.n >= plano.paineis) throw invalido(`Seu plano ${plano.nome} permite ${plano.paineis} faces. Mude de plano em Configurações.`);
    }
    if (d.tipo && d.tipo !== 'led') d.slots = 1;
  },
  filtro(req, params) {
    let s = '';
    if (req.query.estrutura) { params.push(req.query.estrutura); s += ` AND t.estrutura_id = $${params.length}`; }
    return s;
  },
};

export const defClientes: DefRecurso = {
  recurso: 'clientes', rota: 'clientes', tabela: 'clientes', nome: 'Cliente',
  schema: z.object({
    nome: zTextoObrig, tipo: z.enum(['anunciante', 'agencia']).default('anunciante'), documento: zTexto, contato: zTexto,
    email: zTexto, telefone: zTexto, comissao: z.preprocess((v) => (v === '' || v == null ? 0 : Number(v)), z.number().min(0).max(100)),
    cidade: zTexto, obs: zTexto,
    cep: zTexto, logradouro: zTexto, numero: zTexto, complemento: zTexto, bairro: zTexto, uf: zTexto, codigoMunicipio: zTexto, inscricaoMunicipal: zTexto,
  }),
  select: `SELECT t.*,
             (SELECT count(*) FROM contratos k WHERE (k.cliente_id = t.id OR k.agencia_id = t.id) AND k.excluido_em IS NULL)::int AS n_contratos,
             (SELECT COALESCE(sum(l.valor),0) FROM lancamentos l JOIN contratos k ON k.id = l.contrato_id
               WHERE (k.cliente_id = t.id OR k.agencia_id = t.id) AND l.tipo = 'receita' AND l.status = 'aberto'
                 AND l.vencimento < CURRENT_DATE AND l.excluido_em IS NULL) AS atrasado,
             (SELECT COALESCE(max(CURRENT_DATE - l.vencimento),0) FROM lancamentos l JOIN contratos k ON k.id = l.contrato_id
               WHERE (k.cliente_id = t.id OR k.agencia_id = t.id) AND l.tipo = 'receita' AND l.status = 'aberto'
                 AND l.vencimento < CURRENT_DATE AND l.excluido_em IS NULL)::int AS dias_atraso
           FROM clientes t`,
  ordem: 't.nome',
  rotulo: (r) => r.nome,
};

export const defRecorrencias: DefRecurso = {
  recurso: 'recorrencias', rota: 'recorrencias', tabela: 'recorrencias', nome: 'Recorrência',
  schema: z.object({
    descricao: zTextoObrig, categoria: zTextoObrig, valor: zNumObrig.pipe(z.number().min(0)),
    dia: z.preprocess(Number, z.number().int().min(1).max(31)), estruturaId: zId, painelId: zId, ativo: zBool.default(true),
  }),
  select: `SELECT t.*, (SELECT max(l.competencia) FROM lancamentos l WHERE l.recorrencia_id = t.id AND l.excluido_em IS NULL) AS ultima_competencia FROM recorrencias t`,
  ordem: 't.ativo DESC, t.dia',
  rotulo: (r) => r.descricao,
};

/** Remove dados pessoais de um cliente (LGPD), mantendo o histórico financeiro. */
export async function anonimizarCliente(c: any, ctx: any, id: string) {
  const cli = await q1<any>(c, 'SELECT * FROM clientes WHERE id = $1 AND empresa_id = $2', [id, ctx.empresaId]);
  if (!cli) throw invalido('Cliente não encontrado.');
  await c.query(
    `UPDATE clientes SET nome = $3, documento = '', contato = '', email = '', telefone = '', obs = '', anonimizado_em = CURRENT_DATE, atualizado_em = now()
      WHERE id = $1 AND empresa_id = $2`, [id, ctx.empresaId, `Cliente removido ${id.slice(0, 4).toUpperCase()}`]);
  await c.query(`UPDATE membros SET excluido_em = now(), excluido_por = $2, ativo = false WHERE cliente_id = $1`, [id, ctx.autorNome]);
  await registrar(c, ctx, 'anonimizou', 'clientes', cli, { rotulo: cli.nome });
}

/** Reajuste de preço em massa (percentual e arredondamento). */
export async function reajustarPrecos(c: any, ctx: any, ids: string[], pct: number, arred: number) {
  const ps = await q<any>(c, 'SELECT id, codigo, valor_bi FROM paineis WHERE empresa_id = $1 AND id = ANY($2) AND excluido_em IS NULL', [ctx.empresaId, ids]);
  for (const p of ps) {
    const novo = Math.round((p.valorBi * (1 + pct / 100)) / (arred || 1)) * (arred || 1);
    await c.query('UPDATE paineis SET valor_bi = $2, atualizado_em = now() WHERE id = $1', [p.id, novo]);
    await registrar(c, ctx, 'alterou', 'paineis', p, { antes: { valorBi: p.valorBi }, depois: { valorBi: novo }, rotulo: p.codigo });
  }
  return ps.length;
}
