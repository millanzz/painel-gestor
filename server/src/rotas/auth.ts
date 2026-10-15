import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { createHash, randomBytes } from 'node:crypto';
import { addDays, CONFIG_PADRAO, TERMOS_VERSAO, today, type Sessao } from '@shared';
import { autenticado, COOKIE, gravarSessao } from '../contexto';
import { pool, q, q1, tx } from '../db';
import { env } from '../env';
import { ErroApi, validar } from '../http';
import { enviarEmail, modelo } from '../integracoes/email';

export const auth = Router();

/** Limite simples por IP (protege login e recuperação de senha contra força bruta). */
const tentativas = new Map<string, { n: number; ate: number }>();
function limitar(nome: string, max: number, janelaMin = 15) {
  return (req: any, _res: any, next: any) => {
    const k = `${nome}:${req.ip}`;
    const agora = Date.now();
    const t = tentativas.get(k);
    if (!t || t.ate < agora) tentativas.set(k, { n: 1, ate: agora + janelaMin * 60_000 });
    else if (++t.n > (env.producao ? max : max * 50)) return next(new ErroApi(429, 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'));
    next();
  };
}
export const _limparTentativas = () => tentativas.clear();
const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

const zEmail = z.string().trim().toLowerCase().email('e-mail inválido');
const zSenha = z.string().min(8, 'a senha precisa de pelo menos 8 caracteres').max(200);

async function sessao(uid: string, eid: string | null): Promise<Sessao | null> {
  const u = await q1<any>(pool, 'SELECT id, nome, email, termos_versao FROM usuarios WHERE id = $1', [uid]);
  if (!u) return null;
  const empresas = await q<any>(pool,
    `SELECT e.id, e.nome, m.perfil, m.id AS membro_id, m.cliente_id
       FROM membros m JOIN empresas e ON e.id = m.empresa_id
      WHERE m.usuario_id = $1 AND m.ativo AND m.excluido_em IS NULL ORDER BY e.nome`, [uid]);
  const atual = empresas.find((e) => e.id === eid) || null;
  return {
    usuario: { id: u.id, nome: u.nome, email: u.email },
    termosPendentes: u.termosVersao !== TERMOS_VERSAO,
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
  const d = validar(z.object({ nome: z.string().trim().min(2, 'informe seu nome'), email: zEmail, senha: zSenha, empresa: z.string().trim().optional(), convite: z.string().trim().optional(),
    aceiteTermos: z.literal(true, { error: 'aceite os termos de uso e a política de privacidade' }) }), req.body);
  const out = await tx(async (c) => {
    const ja = await q1(c, 'SELECT id FROM usuarios WHERE lower(email) = $1', [d.email]);
    if (ja) throw new ErroApi(409, 'Já existe uma conta com este e-mail. Entre com sua senha.');
    const hash = await bcrypt.hash(d.senha, 10);
    const u = await q1<any>(c, 'INSERT INTO usuarios (nome, email, senha_hash, termos_versao, termos_aceitos_em) VALUES ($1, $2, $3, $4, now()) RETURNING id', [d.nome, d.email, hash, TERMOS_VERSAO]);
    let eid: string | null = null;
    if (d.convite) eid = await resgatar(c, u.id, d.convite);
    else if (d.empresa) eid = await criarEmpresa(c, u.id, d.nome, d.email, d.empresa);
    return { uid: u.id as string, eid };
  });
  gravarSessao(res, out.uid, out.eid);
  res.status(201).json(await sessao(out.uid, out.eid));
});

auth.post('/entrar', limitar('entrar', 10), async (req, res) => {
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

/** Aceite da versão atual dos termos (usuários que já tinham conta). */
auth.post('/termos', autenticado, async (req, res) => {
  await pool.query('UPDATE usuarios SET termos_versao = $2, termos_aceitos_em = now() WHERE id = $1', [req.uid, TERMOS_VERSAO]);
  res.json(await sessao(req.uid!, req.eid ?? null));
});

/** Envia o link de redefinição. Responde igual exista ou não a conta (não revela e-mails cadastrados). */
auth.post('/esqueci', limitar('esqueci', 5), async (req, res) => {
  const { email } = validar(z.object({ email: zEmail }), req.body);
  const u = await q1<any>(pool, 'SELECT id, nome FROM usuarios WHERE lower(email) = $1', [email]);
  if (u) {
    const token = randomBytes(32).toString('base64url');
    await pool.query(`UPDATE senha_tokens SET usado_em = now() WHERE usuario_id = $1 AND usado_em IS NULL`, [u.id]);
    await pool.query(`INSERT INTO senha_tokens (usuario_id, token_hash, expira_em) VALUES ($1, $2, now() + interval '1 hour')`, [u.id, hashToken(token)]);
    const url = `${env.appUrl}/redefinir?token=${token}`;
    const m = modelo('Redefinir sua senha', [`Olá, ${u.nome.split(' ')[0]}.`, 'Recebemos um pedido para criar uma nova senha no Painel Gestor. O link vale por 1 hora e só pode ser usado uma vez.', 'Se não foi você, ignore este e-mail: sua senha continua a mesma.'], { texto: 'Criar nova senha', url });
    await enviarEmail({ para: email, assunto: 'Redefinir sua senha do Painel Gestor', ...m });
  }
  res.status(204).end();
});

auth.post('/redefinir', limitar('redefinir', 10), async (req, res) => {
  const d = validar(z.object({ token: z.string().min(20), senha: zSenha }), req.body);
  const uid = await tx(async (c) => {
    const t = await q1<any>(c, `SELECT id, usuario_id FROM senha_tokens WHERE token_hash = $1 AND usado_em IS NULL AND expira_em > now() FOR UPDATE`, [hashToken(d.token)]);
    if (!t) throw new ErroApi(410, 'Este link expirou ou já foi usado. Peça um novo.');
    await c.query('UPDATE senha_tokens SET usado_em = now() WHERE id = $1', [t.id]);
    await c.query('UPDATE usuarios SET senha_hash = $2 WHERE id = $1', [t.usuarioId, await bcrypt.hash(d.senha, 10)]);
    return t.usuarioId as string;
  });
  const primeira = await q1<any>(pool, `SELECT empresa_id FROM membros WHERE usuario_id = $1 AND ativo AND excluido_em IS NULL ORDER BY criado_em LIMIT 1`, [uid]);
  gravarSessao(res, uid, primeira?.empresaId ?? null);
  res.json(await sessao(uid, primeira?.empresaId ?? null));
});
