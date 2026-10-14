import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDays, criarCalendario, dm, fdate, money, pad2, periodoTxt, TIPO_LBL, today, volumePct } from '@shared';
import { api } from '../api';
import { useSessao } from '../sessao';
import { Campo, ErroCaixa, Gaveta, useAvisos } from '../ui/base';
import { Icone } from '../ui/icones';

interface Props { faces: string[]; fechar: () => void; contratoId?: string; inicio?: string }

/** Painel lateral de nova reserva: faces, período, disponibilidade e para quem. */
export default function NovaReserva({ faces: iniciais, fechar, contratoId, inicio }: Props) {
  const { empresa } = useSessao();
  const cfg = empresa!.config;
  const C = useMemo(() => criarCalendario(cfg.calendario), [cfg.calendario]);
  const qc = useQueryClient();
  const nav = useNavigate();
  const { avisar } = useAvisos();

  const paineis = useQuery({ queryKey: ['paineis'], queryFn: () => api.get<any[]>('/paineis') });
  const clientes = useQuery({ queryKey: ['clientes'], queryFn: () => api.get<any[]>('/clientes') });
  const contratos = useQuery({ queryKey: ['contratos', 'abertos'], queryFn: () => api.get<any[]>('/contratos?status=proposta,aprovada,ativo') });

  const [sel, setSel] = useState<string[]>(iniciais);
  const [dur, setDur] = useState<number>(2);
  const atual = C.biOf(inicio || today());
  const opcoesBI = useMemo(() => Array.from({ length: 10 }, (_, i) => C.biAdd(atual, i + (inicio ? 0 : 1))), [C, atual.ano, atual.bi, inicio]);
  const [ini, setIni] = useState(() => C.biIni(opcoesBI[0].ano, opcoesBI[0].bi));
  const [livreIni, setLivreIni] = useState(addDays(today(), 7));
  const [livreFim, setLivreFim] = useState(addDays(today(), 20));
  const [cotas, setCotas] = useState(1);
  const [destino, setDestino] = useState<'novo' | 'existente'>(contratoId ? 'existente' : 'novo');
  const [kId, setKId] = useState(contratoId || '');
  const [cliId, setCliId] = useState('');
  const [agId, setAgId] = useState('');
  const [campanha, setCampanha] = useState('');
  const [fila, setFila] = useState(true);
  const [erro, setErro] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);

  const periodo = useMemo(() => {
    if (dur === 0) return { ini: livreIni, fim: livreFim };
    const b = C.biOf(ini);
    const f = C.biAdd(b, dur - 1);
    return { ini, fim: C.biFim(f.ano, f.bi) };
  }, [dur, ini, livreIni, livreFim, C]);

  const disp = useQuery({
    queryKey: ['disponibilidade', sel, periodo.ini, periodo.fim, cotas],
    queryFn: () => api.post('/reservas/disponibilidade', { painelIds: sel, ini: periodo.ini, fim: periodo.fim, slots: cotas }),
    enabled: sel.length > 0 && periodo.fim >= periodo.ini,
  });
  const lista: any[] = disp.data?.faces || [];
  const livres = lista.filter((f) => f.livre);
  const total = livres.reduce((s, f) => s + f.tabela, 0);
  const vol = volumePct(cfg, livres.length);
  const temLed = lista.some((f) => f.tipo === 'led');

  useEffect(() => { if (destino === 'existente' && kId) { const k = contratos.data?.find((x) => x.id === kId); if (k) setCampanha(k.campanha); } }, [kId, destino, contratos.data]);

  const disponiveis = (paineis.data || []).filter((p) => p.status === 'ativo' && !sel.includes(p.id));
  const agencias = (clientes.data || []).filter((c) => c.tipo === 'agencia');
  const anunciantes = (clientes.data || []).filter((c) => c.tipo === 'anunciante');

  const enviar = async () => {
    setErro(null); setEnviando(true);
    try {
      const r = await api.post('/reservas/lote', {
        faces: sel.map((id) => ({ painelId: id, slots: cotas })), ini: periodo.ini, fim: periodo.fim, filaSeOcupada: fila,
        ...(destino === 'existente' ? { contratoId: kId } : { novo: { clienteId: cliId, agenciaId: agId || null, campanha } }),
      });
      ['agenda', 'inicio', 'contratos', 'reservas', 'contrato'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      avisar(`${r.criadas.length} face(s) em opção${r.fila.length ? ` · ${r.fila.length} na fila` : ''}${r.ignoradas.length ? ` · ${r.ignoradas.length} ocupada(s) ficaram de fora` : ''}.`);
      fechar();
      if (!contratoId) nav(`/contratos/${r.contratoId}`);
    } catch (x) { setErro(x); } finally { setEnviando(false); }
  };

  const pronto = sel.length > 0 && (destino === 'existente' ? !!kId : !!cliId && campanha.trim().length > 0) && (livres.length > 0 || fila);
  const etapa = !sel.length ? 1 : (destino === 'novo' ? cliId && campanha : kId) ? 3 : 2;

  return (
    <Gaveta titulo="Nova reserva" fechar={fechar}
      topo={(
        <ol aria-label="Etapas" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {['Faces', 'Período', 'Cliente e valor'].map((t, i) => (
            <li key={t} aria-current={etapa === i + 1 ? 'step' : undefined} className={`sm pilha g-100 ${etapa === i + 1 ? '' : 't2'}`} style={{ fontWeight: etapa === i + 1 ? 600 : 400 }}>
              <span style={{ height: 3, borderRadius: 2, background: etapa > i ? 'var(--c-brand)' : 'var(--c-line)' }} />{i + 1} · {t}
            </li>
          ))}
        </ol>
      )}
      rodape={<>
        <div className="linha entre g-150" style={{ alignItems: 'flex-end' }}>
          <div className="pilha g-025">
            <span className="sm t2">{periodoTxt(periodo.ini, periodo.fim)}{disp.data?.periodo ? ` · ${disp.data.periodo}` : ''}</span>
            <span className="sm t2">{livres.length} face(s) livre(s) · valor de tabela</span>
          </div>
          <span className="mono" style={{ fontSize: 20, lineHeight: '28px', fontWeight: 500 }}>{money(total)}</span>
        </div>
        <div className="sm" style={{ color: 'var(--c-brand-h)', background: 'var(--c-brand-s)', borderRadius: 6, padding: '8px 12px' }}>
          {vol ? `Desconto por volume de ${vol}% sugerido na proposta.` : cfg.volume?.length ? `Com ${Math.min(...cfg.volume.map((v) => v.min))} faces ou mais, o cliente ganha desconto por volume.` : `A opção segura as faces por ${cfg.opcaoDias} dias.`}
        </div>
        <ErroCaixa erro={erro} />
        <div className="linha g-100" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-sec" onClick={fechar}>Voltar</button>
          <button className="btn btn-pri" disabled={!pronto || enviando} onClick={enviar}>{enviando ? 'Reservando…' : 'Reservar como opção'}</button>
        </div>
      </>}>

      <fieldset className="pilha g-100" style={{ border: 0, margin: 0, padding: 0 }}>
        <legend className="h-card" style={{ padding: 0, marginBottom: 8 }}>Faces</legend>
        <div className="linha wrap g-100">
          {sel.map((id) => { const p = paineis.data?.find((x) => x.id === id); return (
            <span key={id} className="badge b-info" style={{ height: 28, paddingRight: 4 }}>
              <span className="mono" style={{ fontSize: 12 }}>{p?.codigo || '…'}</span>
              <button aria-label={`Tirar ${p?.codigo}`} onClick={() => setSel(sel.filter((x) => x !== id))} style={{ border: 0, background: 'none', color: 'inherit', display: 'grid', padding: 2 }}><Icone n="fechar" t={12} /></button>
            </span>
          ); })}
          <select className="entrada" style={{ width: 'auto', height: 28, fontSize: 13 }} value="" onChange={(e) => e.target.value && setSel([...sel, e.target.value])} aria-label="Adicionar face">
            <option value="">+ Adicionar face</option>
            {disponiveis.map((p) => <option key={p.id} value={p.id}>{p.codigo} · {TIPO_LBL[p.tipo]} · {p.cidade}</option>)}
          </select>
        </div>
      </fieldset>

      <fieldset className="pilha g-100" style={{ border: 0, margin: 0, padding: 0 }}>
        <legend className="h-card" style={{ padding: 0, marginBottom: 8 }}>Duração</legend>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
          {[[1, '1 BI', '14 dias'], [2, '2 BIs', 'mais pedido'], [4, '4 BIs', '56 dias'], [0, 'Outro', 'datas livres']].map(([n, t, s]) => (
            <button key={n} type="button" className="opcao" aria-pressed={dur === n} onClick={() => setDur(n as number)}>
              <span className="xs" style={{ fontWeight: 500 }}>{t}</span><span className="sm" style={{ opacity: .75 }}>{s}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {dur > 0 ? (
        <fieldset className="pilha g-100" style={{ border: 0, margin: 0, padding: 0 }}>
          <legend className="h-card" style={{ padding: 0, marginBottom: 8 }}>Começa em</legend>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 8 }}>
            {opcoesBI.map((b) => {
              const bIni = C.biIni(b.ano, b.bi);
              const noIntervalo = bIni >= periodo.ini && bIni <= periodo.fim;
              const alta = sazonal(cfg, bIni);
              return (
                <button key={bIni} type="button" className="opcao forte" aria-pressed={bIni === ini} onClick={() => setIni(bIni)}
                  style={{ alignItems: 'center', textAlign: 'center', padding: '0 4px', ...(noIntervalo && bIni !== ini ? { background: 'var(--c-brand-s)', boxShadow: '0 0 0 1px var(--c-brand)' } : {}) }}>
                  <span className="mono" style={{ fontSize: 12, lineHeight: '16px', fontWeight: 500 }}>BI {pad2(b.bi)}</span>
                  <span className="sm" style={{ opacity: .8 }}>{dm(bIni)}</span>
                  {alta ? <span style={{ fontSize: 11, lineHeight: '14px', fontWeight: 600, color: bIni === ini ? '#fff' : 'var(--c-warn)' }}>Alta</span> : null}
                </button>
              );
            })}
          </div>
          {cfg.sazonal?.length ? <p className="sm t2">Alta = {cfg.sazonal.map((s) => `${s.nome} (+${s.pct}%)`).join(', ')}.</p> : null}
        </fieldset>
      ) : (
        <div className="form">
          <Campo rotulo="Início"><input type="date" className="entrada" value={livreIni} onChange={(e) => setLivreIni(e.target.value)} /></Campo>
          <Campo rotulo="Fim"><input type="date" className="entrada" value={livreFim} min={livreIni} onChange={(e) => setLivreFim(e.target.value)} /></Campo>
        </div>
      )}

      {temLed && (
        <Campo rotulo="Cotas no LED" ajuda="Quantas inserções no loop do painel de LED.">
          <input type="number" min={1} max={12} className="entrada" value={cotas} onChange={(e) => setCotas(Math.max(1, Number(e.target.value) || 1))} style={{ width: 120 }} />
        </Campo>
      )}

      <div className="pilha g-100">
        <span className="h-card">Disponibilidade</span>
        <ul className="card lista">
          {disp.isLoading && sel.length > 0 && <li className="li t2">Conferindo…</li>}
          {!sel.length && <li className="li t2">Escolha pelo menos uma face.</li>}
          {lista.map((f) => (
            <li key={f.painelId} className="li" style={{ alignItems: 'flex-start' }}>
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 6, flex: 'none', background: f.livre ? 'var(--c-ok)' : '#D98B26' }} />
              <div className="flex1 pilha g-025">
                <div className="linha entre g-150"><span><span className="mono" style={{ fontWeight: 500 }}>{f.codigo}</span> <span className="t2">{TIPO_LBL[f.tipo]}</span></span><span className="mono">{f.livre ? money(f.tabela) : 'fila'}</span></div>
                <span className={`xs ${f.livre ? 'ok-t' : 'warn-t'}`}>
                  {f.inativo ? 'Fora de venda' : f.livre ? (f.cotas ? `${f.cotas.total - f.cotas.usadas} de ${f.cotas.total} cotas livres` : 'Livre no período') :
                    `${f.ocupadaPor.status === 'confirmado' ? 'Confirmada' : 'Em opção'} para ${f.ocupadaPor.campanha} até ${fdate(f.ocupadaPor.fim)}`}
                  {f.fila ? ` · ${f.fila} na fila` : ''}
                </span>
              </div>
            </li>
          ))}
        </ul>
        {lista.some((f) => !f.livre) && (
          <label className="check xs"><input type="checkbox" checked={fila} onChange={(e) => setFila(e.target.checked)} />Colocar as ocupadas na fila e avisar quando liberar</label>
        )}
      </div>

      <div className="pilha g-150">
        <span className="h-card">Para quem</span>
        {!contratoId && <div className="seg" role="group" aria-label="Destino">
          <button aria-pressed={destino === 'novo'} onClick={() => setDestino('novo')}>Nova proposta</button>
          <button aria-pressed={destino === 'existente'} onClick={() => setDestino('existente')}>Contrato existente</button>
        </div>}
        {destino === 'existente' ? (
          <Campo rotulo="Contrato">
            <select className="entrada" value={kId} onChange={(e) => setKId(e.target.value)} disabled={!!contratoId}>
              <option value="">Escolha…</option>
              {(contratos.data || []).map((k) => <option key={k.id} value={k.id}>{k.numero} · {k.campanha} · {k.clienteNome}</option>)}
            </select>
          </Campo>
        ) : (
          <div className="form">
            <Campo rotulo="Anunciante" className="largo">
              <select className="entrada" value={cliId} onChange={(e) => setCliId(e.target.value)}>
                <option value="">Escolha…</option>
                {anunciantes.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.diasAtraso >= cfg.bloqueioDias ? ' · bloqueado por atraso' : ''}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Campanha"><input className="entrada" value={campanha} onChange={(e) => setCampanha(e.target.value)} placeholder="Ex.: Black Friday" /></Campo>
            <Campo rotulo="Agência">
              <select className="entrada" value={agId} onChange={(e) => setAgId(e.target.value)}>
                <option value="">Direto, sem agência</option>
                {agencias.map((c) => <option key={c.id} value={c.id}>{c.nome} ({c.comissao}%)</option>)}
              </select>
            </Campo>
          </div>
        )}
      </div>
    </Gaveta>
  );
}

function sazonal(cfg: any, iso: string) {
  const m = Number(iso.slice(5, 7));
  return (cfg.sazonal || []).some((s: any) => (s.mesIni <= s.mesFim ? m >= s.mesIni && m <= s.mesFim : m >= s.mesIni || m <= s.mesFim));
}
