import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Tom } from '@shared';
import { Icone } from './icones';

/* ---- etiquetas ---- */
export function Badge({ tom = 'neu', children, ponto }: { tom?: Tom; children: ReactNode; ponto?: boolean }) {
  return <span className={`badge b-${tom}`}>{ponto && <span className="ponto" />}{children}</span>;
}
export const Etiqueta = ({ par }: { par?: [string, Tom] }) => (par ? <Badge tom={par[1]}>{par[0]}</Badge> : null);

/* ---- página: cabeçalho + conteúdo ---- */
export function Cabecalho({ titulo, sub, acoes, trilha }: { titulo?: ReactNode; sub?: ReactNode; acoes?: ReactNode; trilha?: ReactNode }) {
  return (
    <header className={`cab ${trilha && !titulo ? 'compacto' : ''}`}>
      {trilha ? <nav className="trilha" aria-label="Trilha">{trilha}</nav> : (
        <div className="pilha g-050">
          <h1 className="h-page">{titulo}</h1>
          {sub && <span className="t2">{sub}</span>}
        </div>
      )}
      {acoes && <div className="linha wrap g-100">{acoes}</div>}
    </header>
  );
}

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return <div className="carregando" role="status">{texto}</div>;
}

export function Vazio({ titulo, texto, acao }: { titulo: string; texto?: ReactNode; acao?: ReactNode }) {
  return (
    <div className="vazio">
      <span className="h-card" style={{ color: 'var(--c-text)' }}>{titulo}</span>
      {texto && <span className="xs">{texto}</span>}
      {acao}
    </div>
  );
}

export function ErroCaixa({ erro }: { erro: unknown }) {
  if (!erro) return null;
  return <div className="aviso-linha bad" role="alert"><Icone n="alerta" />{(erro as Error).message}</div>;
}

/* ---- controles ---- */
export function Seg<T extends string>({ valor, opcoes, onChange, rotulo }: { valor: T; opcoes: [T, ReactNode][]; onChange: (v: T) => void; rotulo: string }) {
  return (
    <div className="seg" role="group" aria-label={rotulo}>
      {opcoes.map(([v, l]) => <button key={v} type="button" aria-pressed={valor === v} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}

export function Abas<T extends string>({ valor, opcoes, onChange }: { valor: T; opcoes: [T, ReactNode, number?][]; onChange: (v: T) => void }) {
  return (
    <div className="abas" role="tablist">
      {opcoes.map(([v, l, n]) => (
        <button key={v} type="button" role="tab" aria-selected={valor === v} onClick={() => onChange(v)}>
          {l}{n ? <span className="contador">{n}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Campo({ rotulo, ajuda, children, className }: { rotulo: string; ajuda?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`campo ${className || ''}`}>
      <span>{rotulo}</span>
      {children}
      {ajuda && <span className="ajuda">{ajuda}</span>}
    </label>
  );
}

/** Menu de "mais ações" que fecha ao clicar fora. */
export function MaisAcoes({ children, rotulo = 'Mais ações' }: { children: (fechar: () => void) => ReactNode; rotulo?: string }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const f = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false); };
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false);
    document.addEventListener('mousedown', f);
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', f); document.removeEventListener('keydown', k); };
  }, [aberto]);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="btn btn-sec btn-sm so-icone" aria-label={rotulo} aria-expanded={aberto} onClick={() => setAberto(!aberto)}>
        <Icone n="pontos" largura={3} />
      </button>
      {aberto && <div className="menu" role="menu">{children(() => setAberto(false))}</div>}
    </div>
  );
}

/* ---- sobreposições ---- */
function useEsc(fechar: () => void) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && fechar();
    document.addEventListener('keydown', k);
    const o = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = o; };
  }, [fechar]);
}

export function Gaveta({ titulo, fechar, children, rodape, topo, larga }: { titulo: string; fechar: () => void; children: ReactNode; rodape?: ReactNode; topo?: ReactNode; larga?: boolean }) {
  useEsc(fechar);
  return (
    <>
      <div className="veu" onClick={fechar} />
      <section role="dialog" aria-modal="true" aria-label={titulo} className={`gaveta ${larga ? 'larga' : ''}`}>
        <header>
          <div className="linha entre g-150">
            <h2 className="h-sec">{titulo}</h2>
            <button type="button" className="icone-btn" aria-label="Fechar" onClick={fechar}><Icone n="fechar" /></button>
          </div>
          {topo}
        </header>
        <div className="corpo">{children}</div>
        {rodape && <footer>{rodape}</footer>}
      </section>
    </>
  );
}

export function Dialogo({ titulo, fechar, children, rodape }: { titulo: string; fechar: () => void; children: ReactNode; rodape?: ReactNode }) {
  useEsc(fechar);
  return (
    <>
      <div className="veu" onClick={fechar} />
      <section role="dialog" aria-modal="true" aria-label={titulo} className="dialogo">
        <header><h2 className="h-sec">{titulo}</h2></header>
        <div className="corpo">{children}</div>
        {rodape && <footer>{rodape}</footer>}
      </section>
    </>
  );
}

/* ---- avisos (toasts) e confirmação ---- */
interface Aviso { id: number; texto: string; erro?: boolean }
const AvisoCtx = createContext<{ avisar: (t: string, erro?: boolean) => void; confirmar: (o: Confirmacao) => Promise<boolean> }>(null as any);
interface Confirmacao { titulo: string; texto?: ReactNode; ok?: string; perigo?: boolean }

export function AvisosProvider({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<Aviso[]>([]);
  const [conf, setConf] = useState<(Confirmacao & { resolver: (v: boolean) => void }) | null>(null);
  const avisar = useCallback((texto: string, erro?: boolean) => {
    const id = Date.now() + Math.random();
    setLista((l) => [...l, { id, texto, erro }]);
    setTimeout(() => setLista((l) => l.filter((a) => a.id !== id)), erro ? 6000 : 3500);
  }, []);
  const confirmar = useCallback((o: Confirmacao) => new Promise<boolean>((resolver) => setConf({ ...o, resolver })), []);
  const responder = (v: boolean) => { conf?.resolver(v); setConf(null); };
  return (
    <AvisoCtx.Provider value={{ avisar, confirmar }}>
      {children}
      <div className="avisos" aria-live="polite">
        {lista.map((a) => <div key={a.id} className={`aviso ${a.erro ? 'erro' : ''}`}>{a.texto}</div>)}
      </div>
      {conf && (
        <Dialogo titulo={conf.titulo} fechar={() => responder(false)} rodape={<>
          <button className="btn btn-sec" onClick={() => responder(false)}>Voltar</button>
          <button className={`btn ${conf.perigo ? 'btn-perigo' : 'btn-pri'}`} onClick={() => responder(true)} autoFocus>{conf.ok || 'Confirmar'}</button>
        </>}>
          {conf.texto && <div className="t2">{conf.texto}</div>}
        </Dialogo>
      )}
    </AvisoCtx.Provider>
  );
}
export const useAvisos = () => useContext(AvisoCtx);

/* ---- indicadores ---- */
export function Kpi({ rotulo, valor, rodape, pctBarra, perigo }: { rotulo: string; valor: ReactNode; rodape?: ReactNode; pctBarra?: number; perigo?: boolean }) {
  return (
    <div className={`card kpi ${perigo ? 'perigo' : ''}`}>
      <span className={perigo ? 'bad-t' : 't2'}>{rotulo}</span>
      <span className={`num ${perigo ? 'bad-t' : ''}`}>{valor}</span>
      {pctBarra != null && <div className="barra" style={{ marginTop: 8 }} aria-hidden="true"><i style={{ width: `${Math.min(100, pctBarra)}%` }} /></div>}
      {rodape && <span className={`sm ${perigo ? 'bad-t' : 't2'}`} style={{ marginTop: 'auto', paddingTop: 4 }}>{rodape}</span>}
    </div>
  );
}

/** Abre um PDF ou planilha da API numa nova aba (o navegador cuida de baixar). */
export function abrirArquivo(url: string) {
  window.open('/api' + url, '_blank', 'noopener');
}
