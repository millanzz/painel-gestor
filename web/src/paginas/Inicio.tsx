import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DIAS_L, MESES_L, dm, moneyCurto, pad2, TIPO_LBL, type Alerta } from '@shared';
import { api } from '../api';
import { useSessao } from '../sessao';
import { Badge, Cabecalho, Carregando, ErroCaixa, Kpi, Vazio } from '../ui/base';
import { Icone } from '../ui/icones';

const saudacao = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };

export default function Inicio() {
  const { vê } = useSessao();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['inicio'], queryFn: () => api.get('/inicio') });
  const [mostrarTodas, setMostrarTodas] = useState(false);
  if (q.isLoading) return <Carregando />;
  if (q.error) return <div className="miolo"><ErroCaixa erro={q.error} /></div>;
  const d = q.data;
  const hoje = new Date();
  const bi = d.biAtual;
  const acoes: Alerta[] = mostrarTodas ? d.acoes : d.acoes.slice(0, 6);

  return (
    <>
      <Cabecalho
        titulo={`${saudacao()}, ${d.saudacao.nome}`}
        sub={<>{DIAS_L[hoje.getDay()]}, {hoje.getDate()} de {MESES_L[hoje.getMonth()].toLowerCase()} · <span className="mono">BI {pad2(bi.bi)}</span> vai de {dm(bi.ini)} a {dm(bi.fim)}</>}
        acoes={vê('agenda') && <>
          <Link className="btn btn-sec" to="/agenda">Abrir agenda</Link>
          <Link className="btn btn-pri" to="/agenda?reservar=1"><Icone n="mais" />Nova reserva</Link>
        </>}
      />
      <div className="miolo">
        <section aria-label="Resumo" className="grade-kpi">
          <Kpi rotulo="Vendido nesta bissemana" valor={`${d.ocupacaoAtual.pct}%`} pctBarra={d.ocupacaoAtual.pct} rodape={`${d.ocupacaoAtual.vendidas} de ${d.ocupacaoAtual.total} faces`} />
          {d.kpi && <>
            <Kpi rotulo={`Vendido em ${hoje.getFullYear()}`} valor={moneyCurto(d.kpi.vendidoAno)} rodape={`${d.kpi.nContratosAno} contrato(s) fechado(s)`} />
            <Kpi rotulo="A receber em 30 dias" valor={moneyCurto(d.kpi.aReceber30)} rodape={`${d.kpi.nReceber30} parcela(s)`} />
            {d.kpi.atrasado > 0
              ? <Kpi perigo rotulo="Atrasado" valor={moneyCurto(d.kpi.atrasado)} rodape={d.kpi.piorCliente ? `${d.kpi.piorCliente.nome}, há ${d.kpi.piorCliente.dias} dias` : ''} />
              : <Kpi rotulo="Atrasado" valor="R$ 0" rodape="Nenhuma parcela vencida" />}
          </>}
        </section>

        <div className="duas">
          <section aria-labelledby="h-acoes" className="principal pilha g-150">
            <div className="linha entre g-150">
              <h2 id="h-acoes" className="h-sec">Próximas ações</h2>
              <span className="sm t3">{d.acoes.length ? `${d.acoes.length} pendente(s)` : ''}</span>
            </div>
            <ul className="card lista">
              {acoes.length ? acoes.map((a, i) => (
                <li key={i} className="li">
                  <span style={{ flex: 'none', minWidth: 92, display: 'flex', justifyContent: 'center' }}><Badge tom={a.sev}>{a.tag}</Badge></span>
                  <div className="pilha g-025" style={{ flex: '1 1 280px', minWidth: 0 }}>
                    <span style={{ fontWeight: 500 }}>{a.titulo}</span>
                    {a.detalhe && <span className="t2 xs">{a.detalhe}</span>}
                  </div>
                  <button className="btn btn-sec btn-sm" onClick={() => nav(a.link)}>{a.acao}</button>
                </li>
              )) : <Vazio titulo="Tudo em dia" texto="Nada precisa de você agora. Novas pendências aparecem aqui." />}
            </ul>
            {d.acoes.length > 6 && <button className="btn btn-txt" style={{ alignSelf: 'flex-start' }} onClick={() => setMostrarTodas(!mostrarTodas)}>{mostrarTodas ? 'Mostrar menos' : `Ver todas (${d.acoes.length})`}</button>}
          </section>

          <aside className="lateral pilha g-300">
            <section aria-labelledby="h-occ" className="pilha g-150">
              <div className="linha entre">
                <h2 id="h-occ" className="h-sec">Próximas bissemanas</h2>
                {vê('agenda') && <Link to="/agenda" style={{ fontWeight: 500 }}>Agenda</Link>}
              </div>
              <div className="card p">
                <div role="img" aria-label={'Ocupação: ' + d.bissemanas.map((b: any) => `BI ${pad2(b.bi)} ${b.pct}%`).join(', ')}
                  className="colunas" style={{ gridTemplateColumns: 'repeat(8, minmax(0, 1fr))', height: 88 }}>
                  {d.bissemanas.map((b: any, i: number) => <div key={i} title={`BI ${pad2(b.bi)}: ${b.pct}%`} style={{ height: `${Math.max(2, b.pct)}%`, background: i === 0 ? 'var(--c-brand)' : 'var(--c-brand-l)' }} />)}
                </div>
                <div className="mono" style={{ display: 'grid', gridTemplateColumns: 'repeat(8, minmax(0, 1fr))', gap: 8, fontSize: 11, lineHeight: '16px', color: 'var(--c-text-3)', textAlign: 'center', marginTop: 8 }}>
                  {d.bissemanas.map((b: any, i: number) => <span key={i} style={i === 0 ? { color: 'var(--c-brand)', fontWeight: 500 } : undefined}>{pad2(b.bi)}</span>)}
                </div>
                <p className="t2 xs" style={{ marginTop: 12 }}>{dica(d.bissemanas)}</p>
              </div>
            </section>
            {d.livres.length > 0 && (
              <section aria-labelledby="h-livres" className="pilha g-150">
                <h2 id="h-livres" className="h-sec">Livres agora</h2>
                <ul className="card lista">
                  {d.livres.map((f: any) => (
                    <li key={f.id} className="li clicavel" style={{ minHeight: 48, flexWrap: 'nowrap' }} onClick={() => nav(`/agenda?reservar=1&face=${f.id}`)}>
                      <span className="flex1 trunc"><span className="mono" style={{ fontWeight: 500 }}>{f.codigo}</span> <span className="t2">{f.tipo === 'led' ? `LED · ${f.livres} de ${f.slots} cotas` : `${TIPO_LBL[f.tipo]} · ${f.cidade || ''}`}</span></span>
                      <span className="mono">{moneyCurto(f.valorBi)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}

function dica(bis: { pct: number; ini: string }[]) {
  const baixa = bis.slice(1).find((b) => b.pct < 50);
  if (!baixa) return 'As próximas bissemanas estão bem vendidas.';
  const m = new Date(baixa.ini + 'T00:00').getMonth();
  return `${MESES_L[m]} está com ${100 - baixa.pct}% das faces livres a partir de ${dm(baixa.ini)}.`;
}
