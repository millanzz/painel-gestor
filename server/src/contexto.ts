import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { mesclarConfig, podeEditar, podeLer, PERFIS, today, type ConfigEmpresa, type Perfil, type Recurso } from '@shared';
import { pool, q1 } from './db';
import { env } from './env';
import { ErroApi, proibido } from './http';

export const COOKIE = 'pg_sessao';

export interface Ctx {
  usuarioId: string;
  usuarioNome: string;
  email: string;
  empresaId: string;
  membroId: string;
  perfil: Perfil;
  clienteId: string | null;
  autorNome: string;
  cfg: ConfigEmpresa;
}

declare global {
  namespace Express {
    interface Request { uid?: string; eid?: string | null; ctx?: Ctx }
  }
}

export function assinar(uid: string, eid: string | null) {
  return jwt.sign({ uid, eid }, env.jwtSecret, { expiresIn: '30d' });
}

export function gravarSessao(res: Response, uid: string, eid: string | null) {
  res.cookie(COOKIE, assinar(uid, eid), { httpOnly: true, sameSite: 'lax', secure: env.producao, maxAge: 30 * 864e5, path: '/' });
}

/** Exige usuário logado (não exige empresa). */
export function autenticado(req: Request, _res: Response, next: NextFunction) {
  const tok = req.cookies?.[COOKIE];
  if (!tok) return next(new ErroApi(401, 'Entre na sua conta para continuar.'));
  try {
    const p = jwt.verify(tok, env.jwtSecret) as { uid: string; eid: string | null };
    req.uid = p.uid;
    req.eid = p.eid;
    next();
  } catch {
    next(new ErroApi(401, 'Sua sessão expirou. Entre de novo.'));
  }
}

/** Exige usuário logado e com acesso à empresa ativa; preenche req.ctx. */
export async function naEmpresa(req: Request, res: Response, next: NextFunction) {
  autenticado(req, res, async (err?: any) => {
    if (err) return next(err);
    try {
      if (!req.eid) throw new ErroApi(409, 'Escolha uma empresa para continuar.');
      const m = await q1<any>(pool,
        `SELECT m.id, m.perfil, m.cliente_id, m.nome, u.nome AS usuario_nome, u.email, e.config
           FROM membros m JOIN usuarios u ON u.id = m.usuario_id JOIN empresas e ON e.id = m.empresa_id
          WHERE m.usuario_id = $1 AND m.empresa_id = $2 AND m.ativo AND m.excluido_em IS NULL`,
        [req.uid, req.eid]);
      if (!m) throw new ErroApi(403, 'Você não tem mais acesso a esta empresa.');
      req.ctx = {
        usuarioId: req.uid!, usuarioNome: m.usuarioNome, email: m.email, empresaId: req.eid,
        membroId: m.id, perfil: m.perfil, clienteId: m.clienteId, autorNome: m.nome || m.usuarioNome,
        cfg: mesclarConfig(m.config),
      };
      next();
    } catch (e) { next(e); }
  });
}

export function situacaoPlano(cfg: ConfigEmpresa) {
  let status = cfg.plano.status || 'trial';
  if (status === 'trial' && cfg.plano.trialAte && cfg.plano.trialAte < today()) status = 'vencido';
  return status;
}

/** Assinatura vencida deixa o sistema em modo leitura (exceto Configurações para o admin). */
export function somenteLeitura(ctx: Ctx, recurso?: Recurso) {
  return situacaoPlano(ctx.cfg) === 'vencido' && !(recurso === 'config' && ctx.perfil === 'admin');
}

export const ler = (r: Recurso) => (req: Request, _res: Response, next: NextFunction) =>
  next(podeLer(req.ctx!.perfil, r) ? undefined : proibido());

export const editar = (r: Recurso) => (req: Request, _res: Response, next: NextFunction) => {
  const c = req.ctx!;
  if (!podeEditar(c.perfil, r)) return next(proibido(`O perfil ${PERFIS[c.perfil].nome} não edita este cadastro.`));
  if (somenteLeitura(c, r)) return next(new ErroApi(402, 'A assinatura venceu: o sistema está em modo leitura. Escolha um plano em Configurações.'));
  next();
};

export const soAdmin = (req: Request, _res: Response, next: NextFunction) =>
  next(req.ctx!.perfil === 'admin' ? undefined : proibido('Só o administrador pode fazer isso.'));

export const interno = (req: Request, _res: Response, next: NextFunction) =>
  next(req.ctx!.perfil !== 'cliente' ? undefined : proibido());
