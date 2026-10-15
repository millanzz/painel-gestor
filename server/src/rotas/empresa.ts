import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { addDays, mesclarConfig, PERFIS, PERFIS_LISTA, PLANOS, today, type Perfil } from '@shared';
import { env } from '../env';
import { enviarEmail, modelo } from '../integracoes/email';
import { registrar } from '../auditoria';
import { editar, situacaoPlano, soAdmin } from '../contexto';
import { rotasCrud, type DefRecurso } from '../crud';
import { pool, q, q1, tx } from '../db';
import { invalido, validar, zBool, zId, zTexto, zTextoObrig } from '../http';

export const empresa = Router();

async function uso(empresaId: string) {
  return q1<any>(pool,
    `SELECT (SELECT count(*) FROM paineis WHERE empresa_id = $1 AND excluido_em IS NULL)::int AS paineis,
            (SELECT count(*) FROM membros WHERE empresa_id = $1 AND perfil <> 'cliente' AND excluido_em IS NULL)::int AS usuarios`, [empresaId]);
}

empresa.get('/', async (req, res) => {
  const ctx = req.ctx!;
  const e = await q1<any>(pool, 'SELECT id, nome FROM empresas WHERE id = $1', [ctx.empresaId]);
  const cfg = ctx.perfil === 'cliente' ? { empresa: ctx.cfg.empresa } : ctx.cfg;
  res.json({ ...e, config: cfg, plano: { ...ctx.cfg.plano, ...(PLANOS[ctx.cfg.plano.id] || PLANOS.pro), situacao: situacaoPlano(ctx.cfg) }, uso: ctx.perfil === 'admin' ? await uso(ctx.empresaId) : null });
});

/** Atualiza parte das configurações (um ou mais blocos). */
empresa.patch('/config', soAdmin, editar('config'), async (req, res) => {
  const ctx = req.ctx!;
  const patch = validar(z.record(z.string(), z.any()), req.body);
  delete patch.plano; // plano só muda pela rota própria
  const novo = mesclarConfig({ ...ctx.cfg, ...patch });
  await tx(async (c) => {
    await c.query('UPDATE empresas SET config = $2 WHERE id = $1', [ctx.empresaId, JSON.stringify(novo)]);
    if (patch.empresa?.razao) await c.query('UPDATE empresas SET nome = $2 WHERE id = $1', [ctx.empresaId, patch.empresa.razao]);
    await registrar(c, ctx, 'alterou', 'config', null, { rotulo: `Configurações · ${Object.keys(patch).join(', ')}` });
  });
  res.json(novo);
});

/** Troca de plano. A cobrança da assinatura fica a cargo do provedor de pagamento escolhido. */
empresa.post('/plano', soAdmin, async (req, res) => {
  const ctx = req.ctx!;
  const { id } = validar(z.object({ id: z.enum(Object.keys(PLANOS) as [string, ...string[]]) }), req.body);
  const u = await uso(ctx.empresaId);
  const p = PLANOS[id];
  if (u.paineis > p.paineis || u.usuarios > p.usuarios) throw invalido(`O plano ${p.nome} comporta ${p.paineis} faces e ${p.usuarios} usuários. Hoje vocês usam ${u.paineis} e ${u.usuarios}.`);
  const plano = { id, status: 'ativo', trialAte: ctx.cfg.plano.trialAte, proximaCobranca: addDays(today(), 30) };
  await pool.query(`UPDATE empresas SET config = jsonb_set(config, '{plano}', $2::jsonb) WHERE id = $1`, [ctx.empresaId, JSON.stringify(plano)]);
  await registrar(pool, ctx, 'mudou plano', 'config', null, { rotulo: `Plano ${p.nome}` });
  res.json(plano);
});

/** Cópia de segurança em JSON com todos os dados da empresa. */
empresa.get('/backup', soAdmin, async (req, res) => {
  const e = req.ctx!.empresaId;
  const tabelas = ['estruturas', 'paineis', 'clientes', 'contratos', 'reservas', 'artes', 'lancamentos', 'cobrancas', 'recorrencias', 'ordens_servico', 'comprovacoes', 'fotos_ponto', 'membros', 'auditoria'];
  const out: Record<string, any> = { geradoEm: new Date().toISOString(), empresa: await q1(pool, 'SELECT id, nome, config FROM empresas WHERE id = $1', [e]) };
  for (const t of tabelas) out[t] = await q(pool, `SELECT * FROM ${t} WHERE empresa_id = $1`, [e]);
  res.setHeader('Content-Disposition', `attachment; filename="backup-painel-gestor-${today()}.json"`);
  res.json(out);
});

/* ---- usuários e convites ---- */
export const novoConvite = (nome: string) =>
  `${(nome || 'USR').normalize('NFD').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase().padEnd(3, 'X')}-${randomBytes(3).toString('hex').toUpperCase().slice(0, 4)}`;

export const defMembros: DefRecurso = {
  recurso: 'membros', rota: 'membros', tabela: 'membros', nome: 'Usuário',
  schema: z.object({
    nome: zTextoObrig, email: zTexto, perfil: z.enum(PERFIS_LISTA as [string, ...string[]]), clienteId: zId, ativo: zBool.default(true),
  }),
  select: `SELECT t.*, u.email AS email_conta, c.nome AS cliente_nome FROM membros t LEFT JOIN usuarios u ON u.id = t.usuario_id LEFT JOIN clientes c ON c.id = t.cliente_id`,
  ordem: `t.perfil = 'cliente', t.nome`,
  extras: ['convite'],
  rotulo: (r) => r.nome,
  async antes(c, ctx, d, anterior) {
    const perfil = d.perfil ?? anterior?.perfil;
    if (perfil === 'cliente' && !(d.clienteId ?? anterior?.clienteId)) throw invalido('Escolha o cliente que este anunciante vai acompanhar.');
    if (perfil !== 'cliente' && d.perfil) d.clienteId = null;
    if (d.email) d.email = String(d.email).toLowerCase();
    if (perfil !== 'cliente' && (!anterior || anterior.perfil === 'cliente')) {
      const u = await uso(ctx.empresaId);
      const p = PLANOS[ctx.cfg.plano.id] || PLANOS.pro;
      if (u.usuarios + 1 > p.usuarios) throw invalido(`Seu plano ${p.nome} permite ${p.usuarios} usuários internos.`);
    }
    if (anterior && anterior.perfil === 'admin' && (perfil !== 'admin' || d.ativo === false)) {
      const n = await q1<any>(c, `SELECT count(*)::int AS n FROM membros WHERE empresa_id = $1 AND perfil = 'admin' AND ativo AND excluido_em IS NULL AND id <> $2`, [ctx.empresaId, anterior.id]);
      if (!n.n) throw invalido('A empresa precisa de pelo menos um administrador.');
    }
    if (!anterior) (d as any).convite = novoConvite(d.nome);
  },
  /** Convite novo com e-mail: manda o link de acesso (sem segurar a resposta). */
  async depois(_c, ctx, m, anterior) {
    if (anterior || !m.email || !m.convite) return;
    const url = `${env.appUrl}/entrar?convite=${m.convite}`;
    const quem = m.perfil === 'cliente' ? 'acompanhar suas campanhas, fotos e pagamentos' : `usar o sistema como ${PERFIS[m.perfil as Perfil].nome.toLowerCase()}`;
    const e = modelo(`Convite de ${ctx.cfg.empresa.razao || 'exibidora'}`, [`Olá, ${String(m.nome).split(' ')[0]}.`, `${ctx.autorNome} convidou você para ${quem} no Painel Gestor.`, `Seu código de convite é ${m.convite}.`], { texto: 'Criar meu acesso', url });
    setImmediate(() => { enviarEmail({ para: m.email, assunto: `Convite para o Painel Gestor · ${ctx.cfg.empresa.razao}`, empresaId: ctx.empresaId, ...e }); });
  },
  async aoExcluir(c, ctx, m) {
    if (m.perfil === 'admin') {
      const n = await q1<any>(c, `SELECT count(*)::int AS n FROM membros WHERE empresa_id = $1 AND perfil = 'admin' AND ativo AND excluido_em IS NULL`, [ctx.empresaId]);
      if (!n.n) throw invalido('A empresa precisa de pelo menos um administrador.');
    }
  },
};

export const rotasMembros = rotasCrud(defMembros, (r) => {
  r.post('/:id/convite', soAdmin, async (req, res) => {
    const ctx = req.ctx!;
    const m = await q1<any>(pool, 'SELECT * FROM membros WHERE id = $1 AND empresa_id = $2', [req.params.id, ctx.empresaId]);
    if (!m) throw invalido('Usuário não encontrado.');
    if (m.usuarioId) throw invalido('Este usuário já ativou o acesso.');
    const convite = novoConvite(m.nome);
    await pool.query('UPDATE membros SET convite = $2 WHERE id = $1', [m.id, convite]);
    res.json({ convite });
  });
});

/** Lista enxuta de membros (para escolher vendedor/responsável). Disponível a todo perfil interno. */
empresa.get('/equipe', async (req, res) => {
  const ctx = req.ctx!;
  if (ctx.perfil === 'cliente') return res.json([]);
  res.json(await q(pool, `SELECT id, nome, perfil FROM membros WHERE empresa_id = $1 AND perfil <> 'cliente' AND ativo AND excluido_em IS NULL ORDER BY nome`, [ctx.empresaId]));
});
