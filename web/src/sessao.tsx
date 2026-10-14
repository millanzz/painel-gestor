import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { mesclarConfig, podeEditar, podeVer, type Area, type ConfigEmpresa, type Recurso, type Sessao } from '@shared';
import { api, ErroApi } from './api';

interface Empresa { id: string; nome: string; config: ConfigEmpresa; plano: any; uso: any }

interface Ctx {
  sessao: Sessao | null;
  empresa: Empresa | null;
  carregando: boolean;
  recarregar: () => Promise<void>;
  vê: (a: Area) => boolean;
  edita: (r: Recurso) => boolean;
  sair: () => Promise<void>;
  trocarEmpresa: (id: string) => Promise<void>;
}

const SessaoCtx = createContext<Ctx>(null as any);

export function SessaoProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const s = useQuery<Sessao | null>({
    queryKey: ['sessao'],
    queryFn: async () => {
      try { return await api.get<Sessao>('/auth/sessao'); } catch (e) { if (e instanceof ErroApi && e.status === 401) return null; throw e; }
    },
    staleTime: 5 * 60_000,
  });
  const sessao = s.data ?? null;
  const e = useQuery<Empresa>({
    queryKey: ['empresa', sessao?.empresaId],
    queryFn: async () => { const d = await api.get<any>('/empresa'); return { ...d, config: mesclarConfig(d.config) }; },
    enabled: !!sessao?.empresaId,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    const f = () => qc.setQueryData(['sessao'], null);
    window.addEventListener('sessao-expirada', f);
    return () => window.removeEventListener('sessao-expirada', f);
  }, [qc]);

  const recarregar = async () => { await qc.invalidateQueries({ queryKey: ['sessao'] }); await qc.invalidateQueries({ queryKey: ['empresa'] }); };
  const valor: Ctx = {
    sessao,
    empresa: e.data ?? null,
    carregando: s.isLoading || (!!sessao?.empresaId && e.isLoading),
    recarregar,
    vê: (a) => podeVer(sessao?.perfil, a),
    edita: (r) => podeEditar(sessao?.perfil, r),
    sair: async () => { await api.post('/auth/sair'); qc.clear(); qc.setQueryData(['sessao'], null); },
    trocarEmpresa: async (id) => { const n = await api.post<Sessao>('/auth/empresa', { empresaId: id }); qc.clear(); qc.setQueryData(['sessao'], n); },
  };
  return <SessaoCtx.Provider value={valor}>{children}</SessaoCtx.Provider>;
}

export const useSessao = () => useContext(SessaoCtx);
