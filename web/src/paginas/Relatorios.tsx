import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { money, moneyCurto, pct } from '@shared';
import { api } from '../api';
import { useSessao } from '../sessao';
import { abrirArquivo, Abas, Badge, Cabecalho, Carregando, Kpi, Vazio } from '../ui/base';
import { Icone } from '../ui/icones';

type Aba = 'ocupacao' | 'vendas' | 'rentabilidade';

export default function Relatorios() {
  const { vê } = useSessao();
  const [aba, setAba] = useState<Aba>('ocupacao');
  const [ano, setAno] = useState(new Date().getFullYear());
  const opcoes: [Aba, string][] = [['ocupacao', 'Ocupação'], ['vendas', 'Vendas e preço'], ...(vê('dinheiro') ? [['rentabilidade', 'Rentabilidade por face'] as [Aba, string]] : [])];
  return (
    <>
      <Cabecalho titulo="Relatórios" sub="Exporte qualquer um em Excel ou CSV" acoes={<>
        {aba !== 'ocupacao' && <select className="entrada" style={{ width: 110, height: 36 }} value={ano} onChange={(e) => setAno(Number(e.target.value))} aria-label="Ano">
          {[0, 1, 2, 3].map((i) => <option key={i} value={new Date().getFullYear() - i}>{new Date().getFullYear() - i}</option>)}</select>}
        <button className="btn btn-sec" onClick={() => abrirArquivo(`/relatorios/exportar/${aba}?ano=${ano}&formato=csv`)}>CSV</button>
        <button className="btn btn-sec" onClick={() => abrirArquivo(`/relatorios/exportar/${aba}?ano=${ano}&formato=xlsx`)}><Icone n="download" />Excel</button>
      </>} />
      <Abas valor={aba} onChange={setAba} opcoes={opcoes} />
      {aba === 'ocupacao' && <Ocupacao />}
      {aba === 'vendas' && <Vendas ano={ano} />}
      {aba === 'rentabilidade' && <Rentabilidade ano={ano} />}
    </>
  );
}

function Barras({ itens }: { itens: { grupo: string; faces: number; atual: number; proximos: number }[] }) {
  return (
    <div className="pilha g-150">
      {itens.map((x) => (
        <div key={x.grupo} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) 2fr 96px', gap: 12, alignItems: 'center' }} className="xs">
          <span className="trunc">{x.grupo} <span className="t3">({x.faces})</span></span>
          <div className="barra" style={{ height: 8 }} title={`Mês atual ${x.atual}% · próximos 6 meses ${x.proximos}%`}><i style={{ width: `${x.atual}%` }} /></div>
          <span className="mono dir">{x.atual}% · <span className="t3">{x.proximos}%</span></span>
        </div>
      ))}
    </div>
  );
}

function Ocupacao() {
  const q = useQuery({ queryKey: ['rel', 'ocupacao'], queryFn: () => api.get('/relatorios/ocupacao') });
  if (q.isLoading) return <Carregando />;
  const d = q.data;
  return (
    <div className="miolo">
      <section className="card pp pilha g-150">
        <div className="pilha g-025"><h2 className="h-sec">Ocupação por mês</h2><span className="sm t2">12 meses anteriores, mês atual e o que já está vendido para os próximos 6</span></div>
        <div role="img" aria-label="Ocupação mensal" className="colunas" style={{ gridTemplateColumns: `repeat(${d.porMes.length}, minmax(0, 1fr))`, height: 160 }}>
          {d.porMes.map((m: any) => <div key={m.rotulo} title={`${m.rotulo}: ${m.pct}%`} style={{ height: `${Math.max(1, m.pct)}%`, background: m.atual ? 'var(--c-brand)' : m.futuro ? 'var(--c-brand-l)' : '#9AA9E8' }} />)}
        </div>
        <div className="mono" style={{ display: 'grid', gridTemplateColumns: `repeat(${d.porMes.length}, minmax(0, 1fr))`, gap: 8, fontSize: 10, color: 'var(--c-text-3)', textAlign: 'center' }}>
          {d.porMes.map((m: any) => <span key={m.rotulo}>{m.rotulo.split('/')[0]}</span>)}
        </div>
      </section>
      <div className="duas">
        <section className="card pp pilha g-200 principal" style={{ flexBasis: 360 }}>
          <div className="pilha g-025"><h2 className="h-sec">Por cidade</h2><span className="sm t2">mês atual · próximos 6 meses</span></div>
          <Barras itens={d.porCidade} />
        </section>
        <section className="card pp pilha g-200 lateral" style={{ flexBasis: 360 }}>
          <div className="pilha g-025"><h2 className="h-sec">Por formato</h2><span className="sm t2">mês atual · próximos 6 meses</span></div>
          <Barras itens={d.porFormato} />
        </section>
      </div>
    </div>
  );
}

function Vendas({ ano }: { ano: number }) {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['rel', 'vendas', ano], queryFn: () => api.get(`/relatorios/vendas?ano=${ano}`) });
  if (q.isLoading) return <Carregando />;
  const d = q.data;
  return (
    <div className="miolo">
      <div className="grade-kpi">
        <Kpi rotulo={`Vendido em ${ano}`} valor={moneyCurto(d.total)} rodape={`${d.n} contrato(s)`} />
        <Kpi rotulo="Preço praticado" valor={d.tabela ? `${Math.round((d.total / d.tabela) * 100)}%` : '—'} rodape={`da tabela · desconto médio ${d.tabela ? pct((1 - d.total / d.tabela) * 100) : '0%'}`} />
        <Kpi rotulo="Ticket médio" valor={moneyCurto(d.n ? d.total / d.n : 0)} rodape="por contrato" />
      </div>
      <section className="pilha g-150">
        <h2 className="h-sec">Por vendedor</h2>
        <div className="card tabela-wrap">
          {d.porVendedor.length ? (
            <table className="tabela">
              <thead><tr><th>Vendedor</th><th className="dir">Contratos</th><th className="dir">Tabela</th><th className="dir">Vendido</th><th className="dir">Desconto médio</th><th className="dir">Comissão</th></tr></thead>
              <tbody>{d.porVendedor.map((v: any) => (
                <tr key={v.vendedor}><td>{v.vendedor}</td><td className="dir mono">{v.contratos}</td><td className="dir mono">{money(v.tabela)}</td><td className="dir mono">{money(v.valor)}</td><td className="dir mono">{pct(v.desconto)}</td><td className="dir mono">{money(v.comissao)}</td></tr>
              ))}</tbody>
            </table>
          ) : <Vazio titulo="Nenhum contrato fechado neste ano" />}
        </div>
      </section>
      <section className="pilha g-150">
        <div className="pilha g-025"><h2 className="h-sec">Preço praticado por contrato</h2><span className="sm t2">maiores descontos primeiro</span></div>
        <div className="card tabela-wrap">
          <table className="tabela">
            <thead><tr><th>Contrato</th><th>Cliente</th><th className="dir">Tabela</th><th className="dir">Vendido</th><th className="dir">Desconto</th><th>Limite</th></tr></thead>
            <tbody>{d.contratos.map((k: any) => (
              <tr key={k.id} className="clicavel" onClick={() => nav(`/contratos/${k.id}`)}>
                <td className="mono">{k.numero}</td><td>{k.cliente}</td><td className="dir mono">{money(k.tabela)}</td><td className="dir mono">{money(k.valor)}</td><td className="dir mono">{pct(k.desconto)}</td>
                <td>{k.dentroLimite ? <Badge tom="ok">Dentro</Badge> : k.aprovadoPor ? <Badge tom="info">Aprovado por {k.aprovadoPor}</Badge> : <Badge tom="warn">Acima</Badge>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Rentabilidade({ ano }: { ano: number }) {
  const q = useQuery({ queryKey: ['rel', 'rent', ano], queryFn: () => api.get(`/relatorios/rentabilidade?ano=${ano}`) });
  if (q.isLoading) return <Carregando />;
  const d = q.data;
  const prej = d.linhas.filter((x: any) => x.margem < 0).length;
  return (
    <div className="miolo">
      <p className="t2 xs">Receita de cada contrato distribuída por face e por dia no ar, menos os custos diretos da face (aluguel do terreno, energia, manutenção).</p>
      <div className="grade-kpi">
        <Kpi rotulo="Receita alocada" valor={moneyCurto(d.receita)} rodape={String(ano)} />
        <Kpi rotulo="Custos diretos" valor={moneyCurto(d.custo)} rodape={`+ ${moneyCurto(d.semFace)} sem face vinculada`} />
        <Kpi rotulo="Margem das faces" valor={moneyCurto(d.receita - d.custo)} rodape={d.receita ? pct(((d.receita - d.custo) / d.receita) * 100) : '—'} />
        <Kpi rotulo="Faces com prejuízo" valor={String(prej)} perigo={prej > 0} />
      </div>
      <div className="card tabela-wrap">
        <table className="tabela">
          <thead><tr><th>Face</th><th className="esconde-movel">Formato</th><th className="dir">Ocupação</th><th className="dir">Receita</th><th className="dir">Custos</th><th className="dir">Margem</th><th className="dir esconde-movel">Receita/m²</th></tr></thead>
          <tbody>{d.linhas.map((x: any) => (
            <tr key={x.id}>
              <td><span className="mono">{x.codigo}</span><div className="sm t3">{x.endereco} · {x.cidade}</div></td>
              <td className="esconde-movel xs">{x.formato}</td><td className="dir mono">{x.ocupacao}%</td><td className="dir mono">{money(x.receita)}</td><td className="dir mono">{money(x.custo)}</td>
              <td className={`dir mono ${x.margem < 0 ? 'bad-t' : ''}`}>{money(x.margem)}</td><td className="dir mono esconde-movel">{money(x.porM2)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
