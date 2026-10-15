// Cliente HTTP da API. A sessão vai num cookie httpOnly; aqui só tratamos erros.

export class ErroApi extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function req<T>(metodo: string, url: string, corpo?: unknown): Promise<T> {
  const ehForm = corpo instanceof FormData;
  const r = await fetch('/api' + url, {
    method: metodo,
    credentials: 'same-origin',
    headers: corpo && !ehForm ? { 'content-type': 'application/json' } : undefined,
    body: ehForm ? (corpo as FormData) : corpo !== undefined ? JSON.stringify(corpo) : undefined,
  });
  if (r.status === 204) return undefined as T;
  const tipo = r.headers.get('content-type') || '';
  const dados = tipo.includes('json') ? await r.json() : await r.text();
  if (!r.ok) {
    const msg = typeof dados === 'object' && dados?.erro ? dados.erro : 'Não foi possível concluir. Tente de novo.';
    if (r.status === 401 && !url.startsWith('/auth/')) window.dispatchEvent(new Event('sessao-expirada'));
    throw new ErroApi(r.status, msg);
  }
  return dados as T;
}

export const api = {
  get: <T = any>(url: string) => req<T>('GET', url),
  post: <T = any>(url: string, corpo: unknown = {}) => req<T>('POST', url, corpo),
  patch: <T = any>(url: string, corpo: unknown) => req<T>('PATCH', url, corpo),
  put: <T = any>(url: string, corpo: unknown) => req<T>('PUT', url, corpo),
  del: <T = any>(url: string) => req<T>('DELETE', url),
  enviar: <T = any>(url: string, campos: Record<string, string | Blob | null | undefined>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) if (v != null) fd.append(k, v);
    return req<T>('POST', url, fd);
  },
};

/** Monta uma query string ignorando valores vazios. */
export function qs(p: Record<string, unknown>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '') s.set(k, String(v));
  const t = s.toString();
  return t ? `?${t}` : '';
}

export const urlArquivo = (id: string) => `/api/arquivos/${id}`;
