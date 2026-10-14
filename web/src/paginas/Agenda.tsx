import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { addDays, criarCalendario, daysIncl, fdate, MESES, MESES_L, pad2, RESERVA_ST, TIPO_LBL, today } from '@shared';
import { api, qs } from '../api';
import { useSessao } from '../sessao';
import { Badge, Cabecalho, Carregando, Dialogo, ErroCaixa, Seg, useAvisos } from '../ui/base';
import { Icone } from '../ui/icones';
import NovaReserva from './NovaReserva';

type Visao = 'fita' | 'mapa';

export default function Agenda() {
  const { empresa, edita } = useSessao();
  const C = useMemo(() => criarCalendario(empresa!.config.calendario), [empresa]);
  const [params, setParams] = useSearchParams();
  const [desde, setDesde] = useState<string | null>(null);
  const [n, setN] = useState(12);
  const [visao, setVisao] = useState<Visao>('fita');
  const [cidade, setCidade] = useState('');
  const [tipo, setTipo] = useState('');
  const [soLivres, setSoLivres] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [aberta, setAberta] = useState<any>(null);
  const reservar = params.get('reservar') === '1';
  const faceInicial = params.get('face');

  const q = useQuery({ queryKey: ['agenda', desde, n], queryFn: () => api.get(`/agenda${qs({ desde, n })}`) });
  const d = q.data;

  const mover = (delta: number) => {
    const base = d ? C.biOf(d.colunas[0].ini) : C.biOf(today());
    const b = C.biAdd(base, delta);
    setDesde(C.biIni(b.ano, b.bi));
  };

  const grupos = useMemo(() => {
    if (!d) return [];
    const ultima = d.colunas[d.colunas.length - 1];
    const livreEm = (f: any) => !d.reservas.some((r: any) => r.painelId === f.id && r.status !== 'fila' && r.ini <= ultima.fim && r.fim >= d.colunas[1].ini);
    const fs = d.faces.filter((f: any) => (!cidade || f.cidade === cidade) && (!tipo || f.tipo === tipo) && (!soLivres || (f.status === 'ativo' && livreEm(f))));
    const m = new Map<string, any[]>();
    for (const f of fs) m.set(f.cidade || 'Sem cidade', [...(m.get(f.cidade || 'Sem cidade') || []), f]);
    return [...m.entries()];
  }, [d, cidade, tipo, soLivres]);

  if (q.isLoading) return <Carregando />;
  if (q.error) return <div className="miolo"><ErroCaixa erro={q.error} /></div>;

  const cols = d.colunas as any[];
  const N = cols.length;
  const cidades = [...new Set(d.faces.map((f: any) => f.cidade).filter(Boolean))] as string[];
  const tipos = [...new Set(d.faces.map((f: any) => f.tipo))] as string[];
  const primeiro = new Date(cols[0].ini + 'T00:00'), ultimo = new Date(cols[N - 1].fim + 'T00:00');

  /** Coluna da grade (1-based, depois das duas colunas fixas) onde a reserva começa e quantas ocupa. */
  const posicao = (r: any) => {
    const a = Math.max(0, cols.findIndex((c) => c.fim >= r.ini));
    let b = cols.findIndex((c) => c.fim >= r.fim);
    if (b < 0) b = N - 1;
    return `${a + 3} / span ${Math.max(1, b - a + 1)}`;
  };
  const selecionadas = d.faces.filter((f: any) => sel.has(f.id));

  return (
    <>
      <Cabecalho
        titulo="Agenda"
        sub={`${d.faces.length} faces · ${MESES_L[primeiro.getMonth()].toLowerCase()} de ${primeiro.getFullYear()} a ${MESES_L[ultimo.getMonth()].toLowerCase()} de ${ultimo.getFullYear()}`}
        acoes={<>
          <Seg rotulo="Visualização" valor={visao} onChange={setVisao} opcoes={[['fita', 'Linha do tempo'], ['mapa', 'Mapa']]} />
          {edita('reservas') && <button className="btn btn-pri" onClick={() => setParams({ reservar: '1' })}><Icone n="mais" />Nova reserva</button>}
        </>}
      />
      <div className="linha wrap g-100" style={{ padding: '12px var(--s-400)', borderBottom: '1px solid var(--c-line)' }}>
        <div className="linha" style={{ boxShadow: 'var(--sh-1)', borderRadius: 8, overflow: 'hidden' }}>
          <button aria-label="Período anterior" onClick={() => mover(-Math.max(2, n / 2))} style={{ width: 32, height: 30, border: 0, background: '#fff' }}>‹</button>
          <button onClick={() => setDesde(null)} style={{ height: 30, padding: '0 12px', border: 0, borderLeft: '1px solid var(--c-line)', borderRight: '1px solid var(--c-line)', background: '#fff', fontWeight: 500, fontSize: 13 }}>Hoje</button>
          <button aria-label="Próximo período" onClick={() => mover(Math.max(2, n / 2) + 1)} style={{ width: 32, height: 30, border: 0, background: '#fff' }}>›</button>
        </div>
        <label className="chip-filtro" style={{ borderStyle: 'solid' }}><span>{n === 6 ? '3 meses' : n === 12 ? '6 meses' : '1 ano'}</span><Icone n="baixo" t={12} />
          <select value={n} onChange={(e) => setN(Number(e.target.value))} aria-label="Janela"><option value={6}>3 meses</option><option value={12}>6 meses</option><option value={26}>1 ano</option></select></label>
        <span aria-hidden="true" style={{ width: 1, height: 20, background: 'var(--c-line)', margin: '0 4px' }} />
        <label className={`chip-filtro ${cidade ? 'ativo' : ''}`}><span>{cidade || '+ Cidade'}</span>{cidade && <Icone n="baixo" t={12} />}
          <select value={cidade} onChange={(e) => setCidade(e.target.value)} aria-label="Cidade"><option value="">Todas as cidades</option>{cidades.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
        <label className={`chip-filtro ${tipo ? 'ativo' : ''}`}><span>{tipo ? TIPO_LBL[tipo] : '+ Formato'}</span>{tipo && <Icone n="baixo" t={12} />}
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Formato"><option value="">Todos os formatos</option>{tipos.map((t) => <option key={t} value={t}>{TIPO_LBL[t]}</option>)}</select></label>
        <button className={`chip-filtro ${soLivres ? 'ativo' : ''}`} aria-pressed={soLivres} onClick={() => setSoLivres(!soLivres)}>{soLivres ? 'Só livres ✕' : '+ Só livres'}</button>
        <span className="flex1" />
        <div className="sm t2 linha wrap g-200 legenda esconde-movel">
          <span className="linha g-100"><i style={{ background: 'var(--c-brand)' }} />Confirmado</span>
          <span className="linha g-100"><i style={{ background: 'var(--c-brand-s)', boxShadow: 'inset 0 0 0 1.5px #6D86E8' }} />Opção</span>
          <span className="linha g-100"><i style={{ background: '#fff', boxShadow: 'inset 0 0 0 1px var(--c-line-2)' }} />Fila</span>
          <span className="linha g-100"><i style={{ background: 'repeating-linear-gradient(135deg,#E3E5E8 0 2px,#fff 2px 5px)' }} />Fora de venda</span>
        </div>
      </div>

      {visao === 'mapa' ? <Mapa faces={grupos.flatMap(([, fs]) => fs)} reservas={d.reservas} hoje={d.hoje} /> : (
        <div style={{ overflowX: 'auto', flex: 1 }}>
          <div className="fita" style={{ ['--n' as any]: N }}>
            <div className="fita-linha fita-cab">
              <div />
              <div className="sm t2" style={{ padding: '12px 8px', fontWeight: 500, alignSelf: 'end' }}>Face</div>
              {cols.map((c, i) => {
                const m = new Date(c.ini + 'T00:00').getMonth();
                return (
                  <div key={i} className={`fita-col ${c.hoje ? 'hoje' : ''}`}>
                    <div className="sm" style={{ color: c.hoje ? 'var(--c-brand)' : 'var(--c-text-3)', fontWeight: 500 }}>{c.hoje ? 'Hoje' : MESES[m]}</div>
                    <div className="mono" style={{ fontSize: 12, lineHeight: '16px', fontWeight: 500, color: c.hoje ? 'var(--c-brand)' : 'var(--c-text)' }}>{pad2(c.bi)}</div>
                  </div>
                );
              })}
            </div>
            {grupos.map(([nome, fs]) => (
              <div key={nome}>
                <div className="fita-grupo sm"><span>{nome}</span><span style={{ fontWeight: 400, color: 'var(--c-text-3)' }}>{fs.length} {fs.length === 1 ? 'face' : 'faces'}</span></div>
                {fs.map((f: any) => {
                  const rs = d.reservas.filter((r: any) => r.painelId === f.id);
                  const ativa = f.status === 'ativo';
                  const nFila = rs.filter((r: any) => r.status === 'fila').length;
                  return (
                    <div key={f.id} className={`fita-linha fita-face ${sel.has(f.id) ? 'sel' : ''}`}>
                      <div style={{ gridRow: 1, gridColumn: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {ativa && edita('reservas') && <input type="checkbox" className="check" style={{ width: 16, height: 16, accentColor: 'var(--c-brand)' }} checked={sel.has(f.id)} aria-label={`Selecionar ${f.codigo}`}
                          onChange={() => { const s = new Set(sel); s.has(f.id) ? s.delete(f.id) : s.add(f.id); setSel(s); }} />}
                      </div>
                      <div style={{ gridRow: 1, gridColumn: 2, padding: '0 8px', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
                        <span className="mono" style={{ fontWeight: 500, lineHeight: '18px' }}>{f.codigo}</span>
                        <span className="sm trunc" style={{ color: 'var(--c-text-3)' }}>
                          {nFila > 0 && <button onClick={() => setAberta({ ...rs.find((r: any) => r.status === 'fila'), face: f })} className="badge b-neu" style={{ border: 0, height: 16, padding: '0 4px', marginRight: 4, fontSize: 11 }}>{nFila} na fila</button>}
                          {f.tipo === 'led' ? `LED · ${f.slots} cotas` : f.endereco}{!ativa ? ' · fora de venda' : ''}</span>
                      </div>
                      {cols.map((c, i) => <div key={i} className={`fita-cel ${!ativa ? 'fora' : c.hoje ? 'hoje' : ''}`} style={{ gridColumn: i + 3 }} />)}
                      {f.tipo === 'led' && cols.map((c, i) => {
                        const doCol = rs.filter((r: any) => r.status !== 'fila' && r.ini <= c.fim && r.fim >= c.ini);
                        if (!doCol.length) return null;
                        const uso = doCol.reduce((s: number, r: any) => s + r.slots, 0);
                        const conf = doCol.every((r: any) => r.status === 'confirmado');
                        return (
                          <button key={'led' + i} className={`bloco ${conf ? 'led' : 'reservado'}`} style={{ gridColumn: i + 3, textAlign: 'center', background: uso >= f.slots ? 'var(--c-brand)' : undefined, color: uso >= f.slots ? '#fff' : undefined }}
                            title={doCol.map((r: any) => `${r.slots} cota(s) · ${r.campanha}`).join('\n')} onClick={() => setAberta({ ...doCol[0], face: f })}>
                            <span>{uso}/{f.slots}</span><span className="s">cotas</span>
                          </button>
                        );
                      })}
                      {f.tipo !== 'led' && rs.filter((r: any) => r.status !== 'fila').map((r: any) => {
                        const vencendo = r.status === 'reservado' && r.validade && daysIncl(today(), r.validade) <= 3;
                        return (
                          <button key={r.id} className={`bloco ${r.status} ${vencendo ? 'vencendo' : ''}`} style={{ gridColumn: posicao(r) }}
                            onClick={() => setAberta({ ...r, face: f })} aria-label={`${r.campanha}, ${RESERVA_ST[r.status][0]}, ${fdate(r.ini)} a ${fdate(r.fim)}`}>
                            <span>{r.campanha}</span>
                            <span className="s">{r.status === 'reservado' ? `opção até ${fdate(r.validade).slice(0, 5)}` : r.clienteNome}</span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
            <div className="fita-linha" style={{ background: 'var(--c-sunken)', borderBottom: '1px solid var(--c-line)' }}>
              <div />
              <div className="sm" style={{ padding: '12px 8px', fontWeight: 600, color: '#3D444E' }}>Ocupação</div>
              {d.ocupacao.map((v: number, i: number) => (
                <div key={i} className="mono" style={{ padding: '12px 4px', textAlign: 'center', fontSize: 12, lineHeight: '16px', borderLeft: '1px solid var(--c-line)', color: cols[i].hoje ? 'var(--c-brand)' : v === 0 ? 'var(--c-text-4)' : '#3D444E', fontWeight: cols[i].hoje ? 600 : 400 }}>{v}%</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {sel.size > 0 && (
        <div className="barra-selecao">
          <div>
            <span style={{ fontWeight: 500 }}>{sel.size === 1 ? '1 face selecionada' : `${sel.size} faces selecionadas`}</span>
            <span className="mono esconde-movel" style={{ fontSize: 12, color: '#A7ADB7' }}>{selecionadas.map((f: any) => f.codigo).join(' · ')}</span>
            <button className="btn btn-sm btn-escuro" onClick={() => setSel(new Set())}>Limpar</button>
            <button className="btn btn-pri btn-sm" onClick={() => setParams({ reservar: '1' })}>Reservar {sel.size === 1 ? '1 face' : `${sel.size} faces`}</button>
          </div>
        </div>
      )}

      {reservar && <NovaReserva faces={faceInicial ? [faceInicial] : [...sel]} fechar={() => { setParams({}); setSel(new Set()); }} />}
      {aberta && <DetalheReserva r={aberta} fechar={() => setAberta(null)} faces={d.faces} />}
    </>
  );
}

function DetalheReserva({ r, fechar, faces }: { r: any; fechar: () => void; faces: any[] }) {
  const { edita } = useSessao();
  const qc = useQueryClient();
  const { avisar, confirmar } = useAvisos();
  const [trocando, setTrocando] = useState(false);
  const [nova, setNova] = useState('');
  const [aPartir, setAPartir] = useState(r.ini > today() ? r.ini : today());
  const [erro, setErro] = useState<unknown>(null);
  const atualizar = () => ['agenda', 'inicio', 'contrato', 'contratos'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const acao = async (fn: () => Promise<any>, msg: string) => { try { setErro(null); await fn(); atualizar(); avisar(msg); fechar(); } catch (x) { setErro(x); } };
  const st = RESERVA_ST[r.status];
  return (
    <Dialogo titulo={r.campanha || 'Reserva'} fechar={fechar} rodape={<>
      {edita('reservas') && r.status === 'fila' && <button className="btn btn-sec" onClick={() => acao(() => api.post(`/reservas/${r.id}/promover`), 'Reserva passou para opção.')}>Passar para opção</button>}
      {edita('reservas') && !trocando && r.status !== 'fila' && r.fim >= today() && <button className="btn btn-sec" onClick={() => setTrocando(true)}>Trocar face</button>}
      {trocando && <button className="btn btn-pri" disabled={!nova} onClick={() => acao(() => api.post(`/reservas/${r.id}/trocar`, { painelId: nova, aPartirDe: aPartir }), 'Face trocada.')}>Confirmar troca</button>}
      {r.contratoId && <Link className="btn btn-pri" to={`/contratos/${r.contratoId}`} onClick={fechar}>Abrir contrato</Link>}
    </>}>
      <ErroCaixa erro={erro} />
      <dl>
        <div className="prop"><dt>Situação</dt><dd><Badge tom={st[1]}>{st[0]}</Badge>{r.status === 'reservado' && r.validade ? <span className="sm t2"> até {fdate(r.validade)}</span> : null}</dd></div>
        <div className="prop"><dt>Face</dt><dd><span className="mono">{r.face.codigo}</span> <span className="t2">{r.face.endereco}</span></dd></div>
        <div className="prop"><dt>Período</dt><dd>{fdate(r.ini)} a {fdate(r.fim)}</dd></div>
        <div className="prop"><dt>Cliente</dt><dd>{r.clienteNome || '—'}</dd></div>
        <div className="prop"><dt>Contrato</dt><dd className="mono">{r.contratoNumero || '—'}</dd></div>
        {r.face.tipo === 'led' && <div className="prop"><dt>Cotas</dt><dd>{r.slots}</dd></div>}
      </dl>
      {trocando && (
        <div className="form">
          <label className="campo"><span>Nova face</span>
            <select className="entrada" value={nova} onChange={(e) => setNova(e.target.value)}>
              <option value="">Escolha…</option>
              {faces.filter((f) => f.id !== r.painelId && f.status === 'ativo').map((f) => <option key={f.id} value={f.id}>{f.codigo} · {f.cidade}</option>)}
            </select>
          </label>
          <label className="campo"><span>A partir de</span><input type="date" className="entrada" value={aPartir} min={r.ini} max={r.fim} onChange={(e) => setAPartir(e.target.value)} /></label>
        </div>
      )}
      {edita('reservas') && !trocando && (
        <button className="btn btn-txt" style={{ alignSelf: 'flex-start', color: 'var(--c-bad)' }} onClick={async () => {
          if (await confirmar({ titulo: 'Excluir esta reserva?', texto: 'A face fica livre no período. Ordens de colagem pendentes saem da agenda.', ok: 'Excluir', perigo: true }))
            acao(() => api.del(`/reservas/${r.id}`), 'Reserva excluída.');
        }}>Excluir reserva</button>
      )}
    </Dialogo>
  );
}

/** Mapa simples: posição relativa das faces pelas coordenadas, cor pela situação de hoje. */
function Mapa({ faces, reservas, hoje }: { faces: any[]; reservas: any[]; hoje: string }) {
  const pts = faces.filter((f) => f.lat != null && f.lng != null);
  const [foco, setFoco] = useState<any>(null);
  if (!pts.length) return <div className="miolo"><p className="t2">Cadastre latitude e longitude nas estruturas para ver as faces no mapa.</p></div>;
  const lats = pts.map((p) => +p.lat), lngs = pts.map((p) => +p.lng);
  const [a, b, c, e] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const pad = 0.12;
  const x = (lng: number) => ((lng - c) / (e - c || 1)) * (1 - 2 * pad) + pad;
  const y = (lat: number) => 1 - (((lat - a) / (b - a || 1)) * (1 - 2 * pad) + pad);
  const situacao = (f: any) => {
    if (f.status !== 'ativo') return ['fora', '#8C929C'];
    const r = reservas.find((r) => r.painelId === f.id && r.status !== 'fila' && r.ini <= hoje && r.fim >= hoje);
    if (!r) { const prox = reservas.find((r) => r.painelId === f.id && r.status !== 'fila' && r.ini > hoje && r.ini <= addDays(hoje, 28)); return prox ? ['livre agora', '#0F7A45'] : ['livre', '#0F7A45']; }
    return r.status === 'confirmado' ? ['no ar', '#2346D6'] : ['opção', '#6D86E8'];
  };
  return (
    <div className="miolo largo">
      <div className="card" style={{ position: 'relative', height: 520, overflow: 'hidden', background: 'linear-gradient(#F8F9FA, #F1F3F6)' }}>
        <svg width="100%" height="100%" viewBox="0 0 1000 520" preserveAspectRatio="none" aria-hidden="true">
          {[...Array(9)].map((_, i) => <line key={i} x1={i * 125} y1={0} x2={i * 125} y2={520} stroke="#E8EAEE" />)}
          {[...Array(5)].map((_, i) => <line key={i} x1={0} y1={i * 130} x2={1000} y2={i * 130} stroke="#E8EAEE" />)}
        </svg>
        {pts.map((f) => {
          const [t, cor] = situacao(f);
          return (
            <button key={f.id} onClick={() => setFoco(f)} title={`${f.codigo} · ${t}`} aria-label={`${f.codigo}, ${t}`}
              style={{ position: 'absolute', left: `${x(+f.lng) * 100}%`, top: `${y(+f.lat) * 100}%`, transform: 'translate(-50%, -50%)', border: 0, background: 'none', padding: 0 }}>
              <span style={{ display: 'block', width: 14, height: 14, borderRadius: '50%', background: cor, boxShadow: '0 0 0 3px #fff, 0 2px 6px rgba(22,26,31,.25)' }} />
              <span className="mono" style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', fontSize: 11, whiteSpace: 'nowrap', background: '#fff', padding: '0 4px', borderRadius: 4, boxShadow: 'var(--sh-1)' }}>{f.codigo}</span>
            </button>
          );
        })}
        {foco && (
          <div className="card p" style={{ position: 'absolute', right: 16, bottom: 16, width: 280, boxShadow: 'var(--sh-3)' }}>
            <div className="linha entre"><span className="mono" style={{ fontWeight: 500 }}>{foco.codigo}</span><button className="icone-btn" onClick={() => setFoco(null)} aria-label="Fechar"><Icone n="fechar" /></button></div>
            <p className="t2 xs">{foco.endereco} · {foco.cidade}</p>
            <p className="xs" style={{ marginTop: 8 }}>{TIPO_LBL[foco.tipo]} · {situacao(foco)[0]}</p>
            <a className="btn btn-sec btn-sm" style={{ marginTop: 12 }} target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${foco.lat},${foco.lng}`}><Icone n="rota" />Ver no Google Maps</a>
          </div>
        )}
      </div>
      <div className="sm t2 linha g-200"><span className="linha g-100"><i style={{ width: 10, height: 10, borderRadius: '50%', background: '#2346D6', display: 'inline-block' }} />No ar</span><span className="linha g-100"><i style={{ width: 10, height: 10, borderRadius: '50%', background: '#6D86E8', display: 'inline-block' }} />Opção</span><span className="linha g-100"><i style={{ width: 10, height: 10, borderRadius: '50%', background: '#0F7A45', display: 'inline-block' }} />Livre</span></div>
    </div>
  );
}
