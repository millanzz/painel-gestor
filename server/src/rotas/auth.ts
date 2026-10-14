import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { addDays, CONFIG_PADRAO, today, type Sessao } from '@shared';
import { autenticado, COOKIE, gravarSessao } from '../contexto';
import { pool, q, q1, tx } from '../db';
import { ErroApi, validar } from '../http';

export const auth = Router();

const zEmail = z.string().trim().toLowerCase().email('e-mail inválido');
const zSenha = z.string().min(8, 'a senha precisa de pelo menos 8 caracteres').max(200);

async function sessao(uid: string, eid: string | null): Promise<Sessao | null> {
  const u = await q1<any>(pool, 'SELECT id, nome, email FROM usuarios WHERE id = $1', [uid]);
  if (!u) return null;
  const empresas = await q<any>(pool,
    `SELECT e.id, e.nome, m.perfil, m.id AS membro_id, m.cliente_id
       FROM membros m JOIN empresas e ON e.id = m.empresa_id
      WHERE m.usuario_id = $1 AND m.ativo AND m.excluido_em IS NULL ORDER BY e.nome`, [uid]);
  const atual = empresas.find((e) => e.id === eid) || null;
  return {
    usuario: u,
    empresas: empresas.map((e) => ({ id: e.id, nome: e.nome, perfil: e.perfil, membroId: e.membroId })),
    empresaId: atual?.id ?? null,
    perfil: atual?.perfil ?? null,
    membroId: atual?.membroId ?? null,
    clienteId: atual?.clienteId ?? null,
  };
}

/** Cria uma empresa com o usuário como administrador e 14 dias de teste. */
export async function criarEmpresa(c: any, uid: string, nomeUsuario: string, email: string, nomeEmpresa: string) {
  const cfg = { ...CONFIG_PADRAO, empresa: { ...CONFIG_PADRAO.empresa, razao: nomeEmpresa, email }, plano: { id: 'pro', status: 'trial', trialAte: addDays(today(), 14), proximaCobranca: '' } };
  const e = await q1<any>(c, 'INSERT INTO empresas (nome, config) VALUES ($1, $2) RETURNING id', [nomeEmpresa, JSON.stringify(cfg)]);
  await c.query(`INSERT INTO membros (empresa_id, usuario_id, nome, email, perfil) VALUES ($1, $2, $3, $4, 'admin')`, [e.id, uid, nomeUsuario, email]);
  return e.id as string;
}

auth.post('/cadastro', async (req, res) => {
  const d = validar(z.object({ nome: z.string().trim().min(2, 'informe seu nome'), email: zEmail, senha: zSenha, empresa: z.string().trim().optional(), convite: z.string().trim().optional() }), req.body);
  const out = await tx(async (c) => {
    const ja = await q1(c, 'SELECT id FROM usuarios WHERE lower(email) = $1', [d.email]);
    if (ja) throw new ErroApi(409, 'Já existe uma conta com este e-mail. Entre com sua senha.');
    const hash = await bcrypt.hash(d.senha, 10);
    const u = await q1<any>(c, 'INSERT INTO usuarios (nome, email, senha_hash) VALUES ($1, $2, $3) RETURNING id', [d.nome, d.email, hash]);
    let eid: string | null = null;
    if (d.convite) eid = await resgatar(c, u.id, d.convite);
    else if (d.empresa) eid = await criarEmpresa(c, u.id, d.nome, d.email, d.empresa);
    return { uid: u.id as string, eid };
  });
  gravarSessao(res, out.uid, out.eid);
  res.status(201).json(await sessao(out.uid, out.eid));
});

auth.post('/entrar', async (req, res) => {
  const d = validar(z.object({ email: zEmail, senha: z.string().min(1) }), req.body);
  const u = await q1<any>(pool, 'SELECT id, senha_hash FROM usuarios WHERE lower(email) = $1', [d.email]);
  if (!u || !(await bcrypt.compare(d.senha, u.senhaHash))) throw new ErroApi(401, 'E-mail ou senha não conferem.');
  const primeira = await q1<any>(pool, `SELECT empresa_id FROM membros WHERE usuario_id = $1 AND ativo AND excluido_em IS NULL ORDER BY criado_em LIMIT 1`, [u.id]);
  const eid = primeira?.empresaId ?? null;
  gravarSessao(res, u.id, eid);
  res.json(await sessao(u.id, eid));
});

auth.post('/sair', (_req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.status(204).end();
});

auth.get('/sessao', autenticado, async (req, res) => {
  const s = await sessao(req.uid!, req.eid ?? null);
  if (!s) throw new ErroApi(401, 'Entre na sua conta para continuar.');
  res.json(s);
});

auth.post('/empresa', autenticado, async (req, res) => {
  const { empresaId } = validar(z.object({ empresaId: z.string().uuid() }), req.body);
  const m = await q1(pool, 'SELECT id FROM membros WHERE usuario_id = $1 AND empresa_id = $2 AND ativo AND excluido_em IS NULL', [req.uid, empresaId]);
  if (!m) throw new ErroApi(403, 'Você não tem acesso a esta empresa.');
  gravarSessao(res, req.uid!, empresaId);
  res.json(await sessao(req.uid!, empresaId));
});

auth.post('/nova-empresa', autenticado, async (req, res) => {
  const { nome } = validar(z.object({ nome: z.string().trim().min(2, 'informe o nome da empresa') }), req.body);
  const u = await q1<any>(pool, 'SELECT nome, email FROM usuarios WHERE id = $1', [req.uid]);
  const eid = await tx((c) => criarEmpresa(c, req.uid!, u.nome, u.email, nome));
  gravarSessao(res, req.uid!, eid);
  res.status(201).json(await sessao(req.uid!, eid));
});

/** Liga o usuário ao cadastro de membro criado pelo administrador. */
async function resgatar(c: any, uid: string, codigo: string): Promise<string> {
  const m = await q1<any>(c, `SELECT id, empresa_id FROM membros WHERE upper(convite) = upper($1) AND excluido_em IS NULL FOR UPDATE`, [codigo.trim()]);
  if (!m) throw new ErroApi(404, 'Código de convite não encontrado. Confira com quem te convidou.');
  const ja = await q1(c, 'SELECT id FROM membros WHERE empresa_id = $1 AND usuario_id = $2 AND excluido_em IS NULL', [m.empresaId, uid]);
  if (ja) throw new ErroApi(409, 'Você já faz parte desta empresa.');
  await c.query('UPDATE membros SET usuario_id = $2, convite = NULL, atualizado_em = now() WHERE id = $1', [m.id, uid]);
  return m.empresaId;
}

auth.post('/convite', autenticado, async (req, res) => {
  const { codigo } = validar(z.object({ codigo: z.string().trim().min(4) }), req.body);
  const eid = await tx((c) => resgatar(c, req.uid!, codigo));
  gravarSessao(res, req.uid!, eid);
  res.json(await sessao(req.uid!, eid));
});

auth.post('/senha', autenticado, async (req, res) => {
  const d = validar(z.object({ atual: z.string().min(1), nova: zSenha }), req.body);
  const u = await q1<any>(pool, 'SELECT senha_hash FROM usuarios WHERE id = $1', [req.uid]);
  if (!u || !(await bcrypt.compare(d.atual, u.senhaHash))) throw new ErroApi(422, 'A senha atual não confere.');
  await pool.query('UPDATE usuarios SET senha_hash = $2 WHERE id = $1', [req.uid, await bcrypt.hash(d.nova, 10)]);
  res.status(204).end();
});
