import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { DIAS_L, fdate, OS_LBL, OS_ST, OS_TIPOS, today, VERIFICACAO } from '@shared';
import { api, urlArquivo } from '../api';
import { useSessao } from '../sessao';
import { Abas, Badge, Cabecalho, Carregando, Dialogo, Etiqueta, useAvisos, Vazio } from '../ui/base';
import { FormGaveta } from '../ui/formulario';
import { Icone } from '../ui/icones';

type Aba = 'hoje' | 'os' | 'fotos';

const rota = (o: any) => o.lat != null ? `https://www.google.com/maps/dir/?api=1&destination=${o.lat},${o.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${o.endereco}, ${o.cidade}`)}`;

export default function Campo() {
  const { sessao, edita } = useSessao();
  const [aba, setAba] = useState<Aba>('hoje');
  const [formOS, setFormOS] = useState<any>(null);
  const paineis = useQuery({ queryKey: ['paineis'], queryFn: () => api.get<any[]>('/paineis'), enabled: !!formOS });
  const equipe = useQuery({ queryKey: ['equipe'], queryFn: () => api.get<any[]>('/empresa/equipe'), enabled: !!formOS });
  const hoje = new Date();
  return (
    <>
      <Cabecalho titulo="Campo" sub={`${DIAS_L[hoje.getDay()]}, ${fdate(today()).slice(0, 5)} · ${sessao?.usuario.nome.split(' ')[0]}`}
        acoes={edita('os') && <button className="btn btn-sec" onClick={() => setFormOS({ tipo: 'vistoria', status: 'aberta', prazo: today() })}><Icone n="mais" />Nova ordem</button>} />
      <Abas valor={aba} onChange={setAba} opcoes={[['hoje', 'Roteiro de hoje'], ['os', 'Todas as ordens'], ['fotos', 'Fotos enviadas']]} />
      {aba === 'hoje' && <Roteiro abrir={setFormOS} />}
      {aba === 'os' && <TodasOS abrir={setFormOS} />}
      {aba === 'fotos' && <Fotos />}
      {formOS && (
        <FormGaveta titulo={formOS.id ? `${OS_LBL[formOS.tipo]} · ${formOS.painelCodigo}` : 'Nova ordem de serviço'} rota="/os" registro={formOS.id ? formOS : null} padrao={formOS}
          fechar={() => setFormOS(null)} invalidar={['roteiro', 'inicio', 'lancamentos']} podeExcluir={edita('os')} somenteLeitura={!edita('os')}
          campos={[
            { k: 'painelId', rotulo: 'Face', tipo: 'select', obrig: true, opcoes: (paineis.data || []).map((p) => [p.id, `${p.codigo} · ${p.endereco}`]), desabilitado: !!formOS.reservaId },
            { k: 'tipo', rotulo: 'Serviço', tipo: 'select', obrig: true, opcoes: OS_TIPOS.map(([a, b]) => [a, b]) },
            { k: 'prazo', rotulo: 'Prazo', tipo: 'data' },
            { k: 'status', rotulo: 'Situação', tipo: 'select', obrig: true, opcoes: Object.entries(OS_ST).map(([a, [b]]) => [a, b]) },
            { k: 'membroId', rotulo: 'Quem faz', tipo: 'select', opcoes: (equipe.data || []).map((m) => [m.id, m.nome]) },
            { k: 'responsavel', rotulo: 'Equipe ou fornecedor' },
            { k: 'custo', rotulo: 'Custo (R$)', tipo: 'dinheiro', ajuda: 'Ao concluir, vira despesa de manutenção da face.' },
            { k: 'descricao', rotulo: 'Descrição', tipo: 'area', largo: true },
          ]} />
      )}
    </>
  );
}

function Roteiro({ abrir }: { abrir: (o: any) => void }) {
  const { edita } = useSessao();
  const qc = useQueryClient();
  const { avisar } = useAvisos();
  const q = useQuery({ queryKey: ['roteiro'], queryFn: () => api.get<any[]>('/campo/roteiro') });
  const [foto, setFoto] = useState<{ os: any; resultado?: any; enviando?: boolean } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  if (q.isLoading) return <Carregando />;
  const itens = q.data || [];
  const feitas = itens.filter((o) => o.status === 'concluida').length;
  const proxima = itens.find((o) => o.status !== 'concluida');

  const alternar = async (o: any) => {
    try {
      await api.patch(`/os/${o.id}`, { status: o.status === 'concluida' ? 'aberta' : 'concluida' });
      qc.invalidateQueries({ queryKey: ['roteiro'] }); qc.invalidateQueries({ queryKey: ['inicio'] });
    } catch (x) { avisar((x as Error).message, true); }
  };
  const tirarFoto = (o: any) => { setFoto({ os: o }); setTimeout(() => input.current?.click(), 0); };
  const enviarFoto = async (arq?: File) => {
    if (!arq || !foto) return;
    setFoto({ ...foto, enviando: true });
    try {
      const r = await api.enviar('/campo/fotos', { arquivo: arq, painelId: foto.os.painelId, osId: foto.os.id, tipo: foto.os.tipo === 'retirada' ? 'retirada' : foto.os.tipo === 'vistoria' ? 'vistoria' : 'colagem' });
      setFoto({ os: foto.os, resultado: { ...r, url: URL.createObjectURL(arq) } });
      qc.invalidateQueries({ queryKey: ['roteiro'] }); qc.invalidateQueries({ queryKey: ['fotos'] });
    } catch (x) { avisar((x as Error).message, true); setFoto(null); }
    if (input.current) input.current.value = '';
  };
  const tag = (o: any) => {
    if (o.status === 'concluida') return null;
    if (o.prazo && o.prazo < today()) return <Badge tom="bad">Atrasada</Badge>;
    if (o.prazo && o.prazo > today()) return <Badge tom="warn">Até {fdate(o.prazo).slice(0, 5)}</Badge>;
    return null;
  };

  return (
    <div className="miolo" style={{ maxWidth: 720 }}>
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => enviarFoto(e.target.files?.[0])} />
      <div className="pilha g-100">
        <span className="h-big">{feitas} de {itens.length} feitas</span>
        <div className="barra" aria-hidden="true"><i style={{ width: `${itens.length ? (feitas / itens.length) * 100 : 0}%` }} /></div>
      </div>
      {proxima && (
        <section className="card p pilha g-150" aria-labelledby="h-next">
          <div className="pilha g-025">
            <h2 id="h-next" className="sm brand-t" style={{ fontWeight: 600 }}>Próxima parada</h2>
            <span style={{ fontSize: 18, lineHeight: '24px', fontWeight: 600 }}>{proxima.endereco}</span>
            <span className="t2">{proxima.cidade} · <span className="mono">{proxima.painelCodigo}</span></span>
          </div>
          <div style={{ padding: 12, borderRadius: 8, background: 'var(--c-sunken)' }}>
            <b style={{ fontWeight: 600 }}>{OS_LBL[proxima.tipo]}</b>{proxima.campanha ? ` · ${proxima.campanha}` : ''}
            {proxima.descricao && <div className="sm t2">{proxima.descricao}</div>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            <a className="btn btn-sec btn-lg" href={rota(proxima)} target="_blank" rel="noreferrer"><Icone n="rota" t={18} />Rota</a>
            {edita('comprovacoes') && <button className="btn btn-pri btn-lg" onClick={() => tirarFoto(proxima)}><Icone n="camera" t={18} />Tirar foto</button>}
          </div>
        </section>
      )}
      <section className="pilha g-100" aria-labelledby="h-rot">
        <h2 id="h-rot" className="h-sec">Roteiro</h2>
        <ul className="card lista">
          {itens.length ? itens.map((o) => {
            const feita = o.status === 'concluida';
            return (
              <li key={o.id} className="li" style={{ minHeight: 64, flexWrap: 'nowrap' }}>
                <button onClick={() => edita('os') && alternar(o)} aria-pressed={feita} aria-label={`Marcar ${OS_LBL[o.tipo]} ${o.painelCodigo} como feita`}
                  style={{ width: 44, height: 44, margin: -8, flex: 'none', border: 0, background: 'none', display: 'grid', placeItems: 'center' }}>
                  <span style={{ width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', color: '#fff', background: feita ? 'var(--c-brand)' : '#fff', boxShadow: feita ? 'none' : 'inset 0 0 0 1.5px #CDD1D6' }}>
                    {feita && <Icone n="check" t={14} largura={3} />}
                  </span>
                </button>
                <button className="flex1 pilha" onClick={() => abrir(o)} style={{ border: 0, background: 'none', textAlign: 'left', padding: 0, opacity: feita ? 0.5 : 1 }}>
                  <span style={{ fontWeight: 500, textDecoration: feita ? 'line-through' : 'none' }}>{OS_LBL[o.tipo]} · {o.endereco}</span>
                  <span className="sm t2"><span className="mono" style={{ fontSize: 12 }}>{o.painelCodigo}</span> · {o.campanha || o.descricao}</span>
                </button>
                {tag(o)}
                {!feita && edita('comprovacoes') && <button className="icone-btn" aria-label="Tirar foto" onClick={() => tirarFoto(o)}><Icone n="camera" /></button>}
              </li>
            );
          }) : <Vazio titulo="Nada para hoje" texto="Colagens e retiradas aparecem aqui quando um PI é emitido." />}
        </ul>
      </section>
      {foto && (foto.enviando || foto.resultado) && (
        <Dialogo titulo={foto.enviando ? 'Enviando foto…' : 'Foto conferida'} fechar={() => setFoto(null)} rodape={!foto.enviando && <>
          <button className="btn btn-sec" onClick={() => tirarFoto(foto.os)}>Refazer</button>
          <button className="btn btn-pri" onClick={() => setFoto(null)}>Concluir</button>
        </>}>
          {foto.enviando ? <p className="t2">Conferindo o local da foto…</p> : <>
            <img src={foto.resultado.url} alt="Foto enviada" style={{ borderRadius: 12, maxHeight: 360, objectFit: 'cover' }} />
            <Resultado f={foto.resultado} />
          </>}
        </Dialogo>
      )}
    </div>
  );
}

function Resultado({ f }: { f: any }) {
  const v = VERIFICACAO[f.verificacao];
  const tom = v[1] === 'ok' ? 'ok' : v[1] === 'bad' ? 'bad' : 'warn';
  const texto = f.verificacao === 'ok' ? `A ${f.distanciaM} m do painel. O cliente verá esta foto no portal.`
    : f.verificacao === 'longe' ? `A foto foi tirada a ${f.distanciaM >= 1000 ? (f.distanciaM / 1000).toFixed(1) + ' km' : f.distanciaM + ' m'} do ponto. Confira se é o painel certo.`
      : f.verificacao === 'sem_gps' ? 'A foto não tem localização. Ative a localização da câmera para as próximas.' : 'O ponto não tem coordenadas cadastradas.';
  return (
    <div className={`aviso-linha ${tom}`}>
      <Icone n={tom === 'ok' ? 'check' : 'alerta'} />
      <div><b>{v[0]}</b><div>{texto}</div></div>
    </div>
  );
}

function TodasOS({ abrir }: { abrir: (o: any) => void }) {
  const [sit, setSit] = useState<'abertas' | 'atrasadas' | ''>('abertas');
  const q = useQuery({ queryKey: ['os', sit], queryFn: () => api.get<any[]>(`/os${sit ? `?situacao=${sit}` : ''}`) });
  return (
    <div className="miolo">
      <div className="seg" role="group" aria-label="Situação">
        {([['abertas', 'Abertas'], ['atrasadas', 'Atrasadas'], ['', 'Todas']] as const).map(([v, l]) => <button key={v} aria-pressed={sit === v} onClick={() => setSit(v)}>{l}</button>)}
      </div>
      {q.isLoading ? <Carregando /> : (
        <div className="card tabela-wrap">
          {(q.data || []).length ? (
            <table className="tabela">
              <thead><tr><th>Serviço</th><th>Face</th><th className="esconde-movel">Responsável</th><th>Prazo</th><th>Situação</th></tr></thead>
              <tbody>{q.data!.map((o) => (
                <tr key={o.id} className="clicavel" onClick={() => abrir(o)}>
                  <td>{OS_LBL[o.tipo]}<div className="sm t3 trunc" style={{ maxWidth: 280 }}>{o.campanha || o.descricao}</div></td>
                  <td><span className="mono">{o.painelCodigo}</span><div className="sm t3">{o.cidade}</div></td>
                  <td className="esconde-movel xs">{o.membroNome || o.responsavel || '—'}</td>
                  <td className={o.status !== 'concluida' && o.prazo < today() ? 'bad-t' : ''}>{fdate(o.prazo)}</td>
                  <td><Etiqueta par={OS_ST[o.status]} /></td>
                </tr>
              ))}</tbody>
            </table>
          ) : <Vazio titulo="Nenhuma ordem aqui" />}
        </div>
      )}
    </div>
  );
}

function Fotos() {
  const q = useQuery({ queryKey: ['fotos'], queryFn: () => api.get<any[]>('/campo/fotos') });
  if (q.isLoading) return <Carregando />;
  return (
    <div className="miolo largo">
      {(q.data || []).length ? (
        <div className="fotos">
          {q.data!.map((f) => (
            <figure key={f.id} className="pilha g-100">
              <a className="foto" href={urlArquivo(f.arquivoId)} target="_blank" rel="noreferrer"><img src={urlArquivo(f.arquivoId)} alt={`Foto ${f.painelCodigo}`} loading="lazy" /></a>
              <figcaption className="pilha"><span style={{ fontWeight: 500 }}>{f.endereco}</span><span className="sm t2"><span className="mono">{f.painelCodigo}</span> · {fdate(f.data)} · {f.membroNome || ''}</span>
                <span className={`sm ${f.verificacao === 'ok' ? 'ok-t' : 'warn-t'}`}>{VERIFICACAO[f.verificacao][0]}{f.distanciaM != null ? ` · ${f.distanciaM} m` : ''}</span></figcaption>
            </figure>
          ))}
        </div>
      ) : <Vazio titulo="Nenhuma foto ainda" />}
    </div>
  );
}
