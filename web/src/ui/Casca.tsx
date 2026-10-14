import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { iniciais, PERFIS, type Area } from '@shared';
import { api } from '../api';
import { useSessao } from '../sessao';
import { Dialogo } from './base';
import { Icone, type NomeIcone } from './icones';

const PRINCIPAL: [Area, string, string, NomeIcone][] = [
  ['inicio', 'Início', '/', 'inicio'],
  ['agenda', 'Agenda', '/agenda', 'agenda'],
  ['contratos', 'Vendas', '/contratos', 'vendas'],
  ['artes', 'Material', '/artes', 'material'],
  ['campo', 'Campo', '/campo', 'campo'],
  ['dinheiro', 'Dinheiro', '/dinheiro', 'dinheiro'],
];
const CADASTROS: [Area, string, string, NomeIcone][] = [
  ['paineis', 'Painéis', '/paineis', 'paineis'],
  ['clientes', 'Clientes', '/clientes', 'clientes'],
  ['relatorios', 'Relatórios', '/relatorios', 'relatorios'],
];
const ADMIN: [Area, string, string, NomeIcone][] = [
  ['usuarios', 'Usuários', '/usuarios', 'usuarios'],
  ['config', 'Configurações', '/config', 'config'],
  ['auditoria', 'Auditoria', '/auditoria', 'auditoria'],
];

export function Casca({ children }: { children: ReactNode }) {
  const { sessao, empresa, vê, sair, trocarEmpresa } = useSessao();
  const [menuAberto, setMenuAberto] = useState(false);
  const [busca, setBusca] = useState(false);
  const [trocar, setTrocar] = useState(false);
  const loc = useLocation();
  const inicio = useQuery({ queryKey: ['inicio'], queryFn: () => api.get('/inicio'), enabled: vê('inicio'), staleTime: 60_000 });
  const nAcoes = inicio.data?.acoes?.length || 0;

  useEffect(() => setMenuAberto(false), [loc.pathname]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setBusca(true); } };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, []);

  if (!sessao) return null;
  const nome = empresa?.nome || sessao.empresas.find((e) => e.id === sessao.empresaId)?.nome || '';
  const item = ([a, t, href, ic]: [Area, string, string, NomeIcone], badge?: number) => vê(a) && (
    <NavLink key={href} to={href} end={href === '/'} className={({ isActive }) => `nav ${isActive ? 'ativo' : ''}`}>
      <Icone n={ic} /><span className="flex1">{t}</span>
      {badge ? <span className={`contador ${a === 'inicio' ? 'forte' : ''}`}>{badge}</span> : null}
    </NavLink>
  );
  const admin = ADMIN.some(([a]) => vê(a));

  return (
    <div className="app">
      <div className="topo-movel">
        <button className="icone-btn" aria-label="Abrir menu" onClick={() => setMenuAberto(true)}><Icone n="menu" t={20} /></button>
        <span className="logo-mini">{iniciais(nome)}</span>
        <span className="h-card trunc flex1">{nome}</span>
        <button className="icone-btn" aria-label="Buscar" onClick={() => setBusca(true)}><Icone n="busca" t={18} /></button>
      </div>
      {menuAberto && <div className="veu so-movel" onClick={() => setMenuAberto(false)} />}
      <aside className={`lado ${menuAberto ? 'aberto' : ''}`} aria-label="Menu">
        <div className="pilha g-100">
          <button className="empresa-btn" aria-label="Trocar de empresa" onClick={() => setTrocar(true)}>
            <span className="logo-mini">{iniciais(nome)}</span>
            <span className="h-card trunc flex1">{nome}</span>
            <Icone n="trocar" cor="#6F7782" />
          </button>
          <button className="busca" onClick={() => setBusca(true)} style={{ border: 0, textAlign: 'left' }}>
            <Icone n="busca" /><span className="flex1 xs">Buscar</span><kbd>Ctrl K</kbd>
          </button>
        </div>
        <nav aria-label="Principal" className="nav-grupo">
          {PRINCIPAL.map((i) => item(i, i[0] === 'inicio' ? nAcoes : undefined))}
        </nav>
        {CADASTROS.some(([a]) => vê(a)) && (
          <div className="nav-grupo"><span className="nav-titulo">Cadastros</span>{CADASTROS.map((i) => item(i))}</div>
        )}
        {admin && <div className="nav-grupo"><span className="nav-titulo">Administração</span>{ADMIN.map((i) => item(i))}</div>}
        <div className="eu">
          <span className="avatar">{iniciais(sessao.usuario.nome)}</span>
          <span className="flex1 pilha">
            <span className="xs trunc" style={{ fontWeight: 500 }}>{sessao.usuario.nome}</span>
            <span className="sm t3">{sessao.perfil ? PERFIS[sessao.perfil].nome : ''}</span>
          </span>
          <button className="icone-btn" aria-label="Sair" title="Sair" onClick={sair}><Icone n="sair" /></button>
        </div>
      </aside>
      <main className="quadro-wrap"><div className="quadro">{children}</div></main>
      {busca && <Busca fechar={() => setBusca(false)} />}
      {trocar && (
        <Dialogo titulo="Suas empresas" fechar={() => setTrocar(false)} rodape={<Link to="/entrar?nova=1" className="btn btn-sec" onClick={() => setTrocar(false)}>Criar outra empresa</Link>}>
          <div className="card lista">
            {sessao.empresas.map((e) => (
              <button key={e.id} className="li clicavel" style={{ width: '100%', border: 0, background: 'none', textAlign: 'left' }}
                onClick={async () => { await trocarEmpresa(e.id); setTrocar(false); }}>
                <span className="logo-mini">{iniciais(e.nome)}</span>
                <span className="flex1">{e.nome}<span className="sm t3" style={{ display: 'block' }}>{PERFIS[e.perfil].nome}</span></span>
                {e.id === sessao.empresaId && <Icone n="check" cor="var(--c-brand)" />}
              </button>
            ))}
          </div>
        </Dialogo>
      )}
    </div>
  );
}

/** Busca rápida por faces, clientes e contratos (Ctrl K). */
function Busca({ fechar }: { fechar: () => void }) {
  const { vê } = useSessao();
  const nav = useNavigate();
  const [t, setT] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const faces = useQuery({ queryKey: ['paineis'], queryFn: () => api.get<any[]>('/paineis'), enabled: vê('paineis') || vê('agenda') });
  const clientes = useQuery({ queryKey: ['clientes'], queryFn: () => api.get<any[]>('/clientes'), enabled: vê('clientes') });
  const contratos = useQuery({ queryKey: ['contratos'], queryFn: () => api.get<any[]>('/contratos'), enabled: vê('contratos') });
  const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const res = useMemo(() => {
    const q = norm(t.trim());
    if (q.length < 2) return [];
    const r: { tipo: string; t: string; s: string; ir: string }[] = [];
    for (const f of faces.data || []) if (norm(`${f.codigo} ${f.endereco} ${f.cidade}`).includes(q)) r.push({ tipo: 'Face', t: f.codigo, s: `${f.endereco || ''} · ${f.cidade || ''}`, ir: `/paineis?face=${f.id}` });
    for (const c of clientes.data || []) if (norm(`${c.nome} ${c.documento} ${c.contato}`).includes(q)) r.push({ tipo: 'Cliente', t: c.nome, s: c.contato || '', ir: `/clientes?id=${c.id}` });
    for (const k of contratos.data || []) if (norm(`${k.numero} ${k.campanha} ${k.clienteNome} ${k.piNumero || ''}`).includes(q)) r.push({ tipo: 'Contrato', t: `${k.numero} · ${k.campanha}`, s: k.clienteNome, ir: `/contratos/${k.id}` });
    return r.slice(0, 12);
  }, [t, faces.data, clientes.data, contratos.data]);
  return (
    <Dialogo titulo="Buscar" fechar={fechar}>
      <label className="busca" style={{ height: 40 }}>
        <Icone n="busca" />
        <input ref={ref} value={t} onChange={(e) => setT(e.target.value)} placeholder="Face, cliente, contrato ou campanha"
          onKeyDown={(e) => { if (e.key === 'Enter' && res[0]) { nav(res[0].ir); fechar(); } }} />
      </label>
      {t.trim().length >= 2 && (
        <div className="card lista">
          {res.length ? res.map((r, i) => (
            <button key={i} className="li clicavel" style={{ width: '100%', border: 0, background: 'none', textAlign: 'left' }} onClick={() => { nav(r.ir); fechar(); }}>
              <span className="badge b-neu">{r.tipo}</span>
              <span className="flex1 pilha"><span className="trunc" style={{ fontWeight: 500 }}>{r.t}</span><span className="sm t3 trunc">{r.s}</span></span>
            </button>
          )) : <div className="vazio">Nada encontrado.</div>}
        </div>
      )}
    </Dialogo>
  );
}
