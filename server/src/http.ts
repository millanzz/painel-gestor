import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

export class ErroApi extends Error {
  constructor(public status: number, message: string, public detalhe?: unknown) { super(message); }
}

export const naoEncontrado = (o = 'Registro') => new ErroApi(404, `${o} não encontrado.`);
export const proibido = (m = 'Seu perfil não tem acesso a esta ação.') => new ErroApi(403, m);
export const invalido = (m: string, detalhe?: unknown) => new ErroApi(422, m, detalhe);

/** Valida o corpo/consulta com zod e devolve os dados já convertidos. */
export function validar<S extends z.ZodTypeAny>(schema: S, dados: unknown): z.infer<S> {
  const r = schema.safeParse(dados);
  if (!r.success) {
    const campos = r.error.issues.map((i) => i.path.join('.')).filter(Boolean);
    throw invalido(campos.length ? `Confira: ${[...new Set(campos)].join(', ')}.` : 'Dados inválidos.', r.error.issues);
  }
  return r.data;
}

export function tratarErros(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ErroApi) return res.status(err.status).json({ erro: err.message, detalhe: err.detalhe });
  if (err?.code === '23505') return res.status(409).json({ erro: 'Já existe um registro com este código ou número.' });
  if (err?.code === '23503') return res.status(409).json({ erro: 'Este registro está ligado a outros e não pode ser alterado assim.' });
  if (err?.code === '23514') return res.status(422).json({ erro: 'Algum valor está fora do permitido.' });
  if (err?.type === 'entity.too.large') return res.status(413).json({ erro: 'Arquivo grande demais.' });
  console.error(err);
  res.status(500).json({ erro: 'Algo deu errado do nosso lado. Tente de novo.' });
}

/* ---- campos reutilizáveis nos esquemas ---- */
const vazioParaNull = (v: unknown) => (v === '' || v === undefined ? null : v);
export const zData = z.preprocess(vazioParaNull, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data inválida').nullable());
export const zDataObrig = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data inválida');
export const zId = z.preprocess(vazioParaNull, z.string().uuid().nullable());
export const zNum = z.preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(v)), z.number().finite().nullable());
export const zNumObrig = z.preprocess((v) => Number(v), z.number().finite());
export const zTexto = z.preprocess((v) => (v == null ? '' : String(v).trim()), z.string().max(2000));
export const zTextoObrig = z.preprocess((v) => (v == null ? '' : String(v).trim()), z.string().min(1, 'obrigatório').max(500));
export const zBool = z.preprocess((v) => v === true || v === 'true' || v === 1 || v === '1' || v === 'on', z.boolean());
