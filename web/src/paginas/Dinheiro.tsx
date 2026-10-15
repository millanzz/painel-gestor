import { useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { dm, fdate, FIN_CAT, FIN_CAT_LBL, MESES_L, money, moneyCurto, today } from '@shared';
import { abrirArquivo, Abas, Badge, Cabecalho, Campo, Carregando, Dialogo, ErroCaixa, Seg, useAvisos, Vazio } from '../ui/base';
import { api, qs } from '../api';
import { useSessao } from '../sessao';
import { FormGaveta } from '../ui/formulario';
import { Icone } from '../ui/icones';

type Aba = 'geral' | 'cobrar' | 'lancamentos' | 'recorrencias' | 'notas' | 'conciliacao';

export default function Dinheiro() {
  const [params, setParams] = useSearchParams();
  const aba = (params.get('aba') as Aba) || 'geral';
  const { edita } = useSessao();
  const [form, setForm] = useState<any>(null);
  const cobrar = useQuery({ queryKey: ['lancamentos', 'cobrar'], queryFn: () => api.get<any[]>('/financeiro/cobrar') });
  const pend = (cobrar.data || []).filter((c) => !c.enviada).length;
  return (
    <>
      <Cabecalho titulo="Dinheiro" sub="Recebimentos, cobrança, despesas e notas" acoes={<>
        <button className="btn btn-sec" onClick={() => abrirArquivo(`/relatorios/exportar/lancamentos?formato=xlsx`)}><Icone n="download" />Exportar</button>
        {edita('lancamentos') && <button className="btn btn-pri" onClick={() => setForm({ tipo: 'despesa', categoria: 'outros', status: 'aberto', vencimento: today() })}><Icone n="mais" />Novo lançamento</button>}
      </>} />
      <Abas valor={aba} onChange={(a) => setParams({ aba: a })} opcoes={[['geral', 'Visão geral'], ['cobrar', 'Cobrar', pend], ['lancamentos', 'Lançamentos'], ['recorrencias', 'Despesas fixas'], ['notas', 'Notas fiscais'], ['conciliacao', 'Conciliação']]} />
      {aba === 'geral' && <Geral irPara={(a) => setParams({ aba: a })} />}
      {aba === 'cobrar' && <Cobrar />}
      {aba === 'lancamentos' && <Lancamentos abrir={setForm} />}
      {aba === 'recorrencias' && <Recorrencias />}
      {aba === 'notas' && <Notas />}
      {aba === 'conciliacao' && <Conciliacao />}
      {form && <FormLancamento registro={form} fechar={() => setForm(null)} />}
    </>
  );
}

function FormLancamento({ registro, fechar }: { registro: any; fechar: () => void }) {
  const { edita } = useSessao();
  const contratos = useQuery({ queryKey: ['contratos'], queryFn: () => api.get<any[]>('/contratos') });
  const paineis = useQuery({ queryKey: ['paineis'], queryFn: () => api.get<any[]>('/paineis') });
  return (
    <FormGaveta titulo={registro.id ? 'Editar lançamento' : 'Novo lançamento'} rota="/lancamentos" registro={registro.id ? registro : null} padrao={registro} fechar={fechar}
      invalidar={['financeiro', 'inicio', 'contrato']} podeExcluir={edita('lancamentos')} somenteLeitura={!edita('lancamentos')}
      campos={[
        { k: 'tipo', rotulo: 'Tipo', tipo: 'select', obrig: true, opcoes: [['receita', 'Receita'], ['despesa', 'Despesa']] },
        { k: 'categoria', rotulo: 'Categoria', tipo: 'select', obrig: true, opcoes: FIN_CAT.map(([a, b]) => [a, b]) },
        { k: 'descricao', rotulo: 'Descrição', obrig: true, largo: true },
        { k: 'valor', rotulo: 'Valor (R$)', tipo: 'dinheiro', obrig: true },
        { k: 'vencimento', rotulo: 'Vencimento', tipo: 'data', obrig: true },
        { k: 'status', rotulo: 'Situação', tipo: 'select', obrig: true, opcoes: [['aberto', 'Em aberto'], ['pago', 'Pago'], ['cancelado', 'Cancelado']] },
        { k: 'pagoEm', rotulo: 'Pago em', tipo: 'data', se: (v) => v.status === 'pago' },
        { k: 'contratoId', rotulo: 'Contrato', tipo: 'select', opcoes: (contratos.data || []).map((k) => [k.id, `${k.numero} · ${k.campanha}`]) },
        { k: 'painelId', rotulo: 'Face (custo direto)', tipo: 'select', se: (v) => v.tipo === 'despesa', opcoes: (paineis.data || []).map((p) => [p.id, p.codigo]) },
      ]} />
  );
}

function Geral({ irPara }: { irPara: (a: Aba) => void }) {
  const r = useQuery({ queryKey: ['financeiro', 'resumo'], queryFn: () => api.get('/financeiro/resumo') });
  const cob = useQuery({ queryKey: ['lancamentos', 'cobrar'], queryFn: () => api.get<any[]>('/financeiro/cobrar') });
  const nf = useQuery({ queryKey: ['lancamentos', 'nf'], queryFn: () => api.get<any[]>('/lancamentos?nf=pendente') });
  if (r.isLoading) return <Carregando />;
  const d = r.data;
  const max = Math.max(1, ...d.semanas.map((s: any) => Math.max(s.entradas, s.saidas)));
  const hoje = new Date();
  return (
    <div className="miolo">
      <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        {[
          ['A receber em 30 dias', moneyCurto(d.aReceber30), `${d.nReceber30} parcela(s)`, ''],
          ['Atrasado', moneyCurto(d.atrasado), `${d.nAtrasado} parcela(s)`, d.atrasado > 0 ? 'bad-t' : ''],
          [`Recebido em ${MESES_L[hoje.getMonth()].toLowerCase()}`, moneyCurto(d.recebidoMes), 'baixas do mês', ''],
          ['A pagar em 30 dias', moneyCurto(d.aPagar30), 'despesas em aberto', ''],
        ].map(([r, v, s, cls], i) => (
          <div key={r} className="kpi" style={{ borderLeft: i ? '1px solid var(--c-line)' : 0 }}>
            <span className={`t2 ${cls}`}>{r}</span><span className={`num ${cls}`}>{v}</span><span className="sm t2">{s}</span>
          </div>
        ))}
      </div>

      <div className="duas">
        <section className="principal pilha g-150" aria-labelledby="h-cob">
          <div className="linha entre"><h2 id="h-cob" className="h-sec">Cobrar hoje</h2><button className="btn btn-txt" onClick={() => irPara('cobrar')}>Ver tudo</button></div>
          <ListaCobranca itens={(cob.data || []).slice(0, 5)} />
        </section>
        <aside className="lateral pilha g-300">
          <section className="pilha g-150" aria-labelledby="h-fluxo">
            <h2 id="h-fluxo" className="h-sec">Próximas 6 semanas</h2>
            <div className="card p">
              <div role="img" aria-label="Entradas e saídas previstas por semana" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 12, alignItems: 'end', height: 120, borderBottom: '1px solid var(--c-line)' }}>
                {d.semanas.map((s: any) => (
                  <div key={s.i} title={`Semana de ${dm(s.ini)}: entra ${money(s.entradas)}, sai ${money(s.saidas)}`} style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: '100%' }}>
                    <div style={{ flex: 1, height: `${(s.entradas / max) * 100}%`, minHeight: 2, background: 'var(--c-brand)', borderRadius: '3px 3px 0 0' }} />
                    <div style={{ flex: 1, height: `${(s.saidas / max) * 100}%`, minHeight: 2, background: '#E1A75E', borderRadius: '3px 3px 0 0' }} />
                  </div>
                ))}
              </div>
              <div className="mono" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 12, fontSize: 11, color: 'var(--c-text-3)', textAlign: 'center', marginTop: 8 }}>
                {d.semanas.map((s: any) => <span key={s.i}>{dm(s.ini)}</span>)}
              </div>
              <div className="sm t2 linha g-200" style={{ marginTop: 12 }}>
                <span className="linha g-100"><i style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--c-brand)', display: 'inline-block' }} />Entradas</span>
                <span className="linha g-100"><i style={{ width: 10, height: 10, borderRadius: 2, background: '#E1A75E', display: 'inline-block' }} />Saídas</span>
              </div>
            </div>
          </section>
          <section className="card p pilha g-100" aria-labelledby="h-nf">
            <div className="linha entre"><h2 id="h-nf" className="h-card">Notas fiscais</h2><button className="btn btn-txt btn-sm" onClick={() => irPara('notas')}>Abrir</button></div>
            <span className="num" style={{ fontSize: 22, lineHeight: '28px' }}>{nf.data?.length ?? '…'}</span>
            <span className="sm t2">parcela(s) sem nota emitida</span>
          </section>
        </aside>
      </div>
    </div>
  );
}

function ListaCobranca({ itens }: { itens: any[] }) {
  const qc = useQueryClient();
  const { avisar } = useAvisos();
  const [pix, setPix] = useState<any>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  const enviarApi = async (c: any) => {
    setEnviando(c.lancamento.id);
    try {
      const r = await api.post('/financeiro/cobrancas/enviar', { lancamentoId: c.lancamento.id, etapa: c.etapa });
      avisar(r.status === 'simulada' ? 'Cobrança registrada (WhatsApp em modo simulado).' : 'Cobrança enviada pelo WhatsApp.');
      ['lancamentos', 'inicio', 'mensagens'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    } catch (x) { avisar((x as Error).message, true); } finally { setEnviando(null); }
  };
  const marcar = async (c: any) => {
    await api.post('/financeiro/cobrancas', { lancamentoId: c.lancamento.id, etapa: c.etapa });
    qc.invalidateQueries({ queryKey: ['lancamentos'] }); qc.invalidateQueries({ queryKey: ['inicio'] });
  };
  if (!itens.length) return <div className="card"><Vazio titulo="Nenhuma cobrança para hoje" texto="A régua avisa antes e depois de cada vencimento." /></div>;
  return (
    <>
      <ul className="card lista">
        {itens.map((c) => {
          const l = c.lancamento;
          const etapa = c.etapa < 0 ? `Vence em ${-c.etapa}d` : c.etapa === 0 ? 'Vence hoje' : `${c.dias}d de atraso`;
          return (
            <li key={l.id} className="li" style={{ minHeight: 64 }}>
              <Badge tom={c.etapa > 0 ? 'bad' : 'warn'}>{etapa}</Badge>
              <div className="pilha" style={{ flex: '1 1 240px', minWidth: 0 }}>
                <span style={{ fontWeight: 500 }} className="trunc">{l.clienteNome || l.descricao}</span>
                <span className="sm t2 trunc">{l.descricao} · {fdate(l.vencimento)}</span>
              </div>
              <span className="mono">{money(l.valor)}</span>
              <div className="linha g-100">
                <button className="btn btn-sec btn-sm so-icone" aria-label="PIX" title="PIX copia e cola" onClick={() => setPix(l)}><Icone n="pix" /></button>
                {c.enviada ? <Badge tom="ok"><Icone n="check" t={12} largura={2.5} />Enviada</Badge> : c.envioAutomatico && l.clienteTelefone
                  ? <button className="btn btn-pri btn-sm" disabled={enviando === l.id} onClick={() => enviarApi(c)}><Icone n="whatsapp" />{enviando === l.id ? 'Enviando…' : 'Enviar'}</button>
                  : c.whatsapp
                  ? <a className="btn btn-pri btn-sm" href={c.whatsapp} target="_blank" rel="noreferrer" onClick={() => setTimeout(() => marcar(c), 400)}><Icone n="whatsapp" />Enviar</a>
                  : <button className="btn btn-sec btn-sm" onClick={() => { navigator.clipboard?.writeText(c.mensagem); avisar('Mensagem copiada. Cliente sem telefone cadastrado.'); marcar(c); }}><Icone n="copiar" />Copiar</button>}
              </div>
            </li>
          );
        })}
      </ul>
      {pix && <Pix lancamento={pix} fechar={() => setPix(null)} />}
    </>
  );
}

export function Pix({ lancamento, fechar, url }: { lancamento: any; fechar: () => void; url?: string }) {
  const { avisar } = useAvisos();
  const q = useQuery({ queryKey: ['pix', lancamento.id], queryFn: () => api.get(url || `/lancamentos/${lancamento.id}/pix`) });
  const [svg, setSvg] = useState('');
  useEffect(() => { if (q.data?.payload) QRCode.toString(q.data.payload, { type: 'svg', margin: 1, width: 220 }).then(setSvg); }, [q.data?.payload]);
  return (
    <Dialogo titulo={`PIX · ${money(lancamento.valor)}`} fechar={fechar} rodape={q.data && <button className="btn btn-pri" onClick={() => { navigator.clipboard?.writeText(q.data.payload); avisar('Código PIX copiado.'); }}><Icone n="copiar" />Copiar código</button>}>
      <ErroCaixa erro={q.error} />
      {q.data && <>
        <div style={{ alignSelf: 'center', width: 220 }} dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="xs t2" style={{ textAlign: 'center' }}>{lancamento.descricao}</p>
        <code className="mono" style={{ fontSize: 11, wordBreak: 'break-all', background: 'var(--c-sunken)', padding: 12, borderRadius: 8 }}>{q.data.payload}</code>
      </>}
    </Dialogo>
  );
}

function Cobrar() {
  const q = useQuery({ queryKey: ['lancamentos', 'cobrar'], queryFn: () => api.get<any[]>('/financeiro/cobrar') });
  const { empresa } = useSessao();
  if (q.isLoading) return <Carregando />;
  const regua = (empresa?.config.regua || []).map((d) => (d < 0 ? `${-d} dia(s) antes` : d === 0 ? 'no dia' : `${d} dia(s) depois`)).join(', ');
  const itens = q.data || [];
  const auto = itens[0]?.automatico, prov = itens[0]?.envioAutomatico;
  return (
    <div className="miolo">
      {auto
        ? <div className="aviso-linha ok"><Icone n="check" /><div><b>Cobrança automática ligada.</b> As mensagens da régua saem sozinhas pelo WhatsApp em horário comercial{prov === 'simulado' ? ' (modo simulado: ficam só registradas)' : ''}. Você ainda pode enviar na hora por aqui.</div></div>
        : <p className="t2 xs">Régua de cobrança: {regua}. {prov ? 'O botão Enviar manda pelo WhatsApp da empresa.' : 'O botão Enviar abre o WhatsApp com a mensagem pronta.'} Cada envio fica registrado na parcela. Para enviar sozinho, ligue em Configurações → Integrações.</p>}
      <ListaCobranca itens={itens} />
      <Historico />
    </div>
  );
}

function Historico() {
  const q = useQuery({ queryKey: ['mensagens'], queryFn: () => api.get<any[]>('/integracoes/mensagens') });
  const lista = (q.data || []).filter((m) => m.canal === 'whatsapp');
  if (!lista.length) return null;
  return (
    <section className="pilha g-150">
      <h2 className="h-sec">Mensagens enviadas</h2>
      <div className="card tabela-wrap">
        <table className="tabela">
          <thead><tr><th>Quando</th><th>Para</th><th>Mensagem</th><th>Situação</th></tr></thead>
          <tbody>{lista.slice(0, 30).map((m) => (
            <tr key={m.id}>
              <td className="xs" style={{ whiteSpace: 'nowrap' }}>{new Date(m.criadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}{m.automatica && <div className="sm t3">automática</div>}</td>
              <td className="mono xs">{m.para}</td>
              <td className="xs"><span className="trunc" style={{ display: 'block', maxWidth: 420 }} title={m.texto}>{m.lancamento || m.texto.split('\n')[0]}</span></td>
              <td>{m.status === 'enviada' ? <Badge tom="ok">Enviada</Badge> : m.status === 'simulada' ? <Badge tom="info">Simulada</Badge> : <span title={m.erro}><Badge tom="bad">Erro</Badge><div className="sm bad-t trunc" style={{ maxWidth: 200 }}>{m.erro}</div></span>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}

function Lancamentos({ abrir }: { abrir: (l: any) => void }) {
  const { edita } = useSessao();
  const qc = useQueryClient();
  const { avisar } = useAvisos();
  const [tipo, setTipo] = useState<'' | 'receita' | 'despesa'>('');
  const [status, setStatus] = useState<'' | 'aberto' | 'pago'>('aberto');
  const [mes, setMes] = useState('');
  const [pix, setPix] = useState<any>(null);
  const de = mes ? `${mes}-01` : '';
  const ate = mes ? new Date(Number(mes.slice(0, 4)), Number(mes.slice(5)), 0).toISOString().slice(0, 10) : '';
  const q = useQuery({ queryKey: ['lancamentos', tipo, status, mes], queryFn: () => api.get<any[]>(`/lancamentos${qs({ tipo, status, de, ate })}`) });
  const lista = q.data || [];
  const tot = useMemo(() => lista.reduce((s, l) => s + (l.tipo === 'receita' ? l.valor : -l.valor), 0), [lista]);
  const baixar = async (l: any) => {
    try { await api.post(`/lancamentos/${l.id}/baixar`, { data: today() }); qc.invalidateQueries({ queryKey: ['lancamentos'] }); qc.invalidateQueries({ queryKey: ['financeiro'] }); qc.invalidateQueries({ queryKey: ['inicio'] }); avisar('Baixa registrada.'); }
    catch (x) { avisar((x as Error).message, true); }
  };
  return (
    <div className="miolo">
      <div className="linha wrap g-150">
        <Seg rotulo="Tipo" valor={tipo} onChange={setTipo} opcoes={[['', 'Tudo'], ['receita', 'Receitas'], ['despesa', 'Despesas']]} />
        <Seg rotulo="Situação" valor={status} onChange={setStatus} opcoes={[['aberto', 'Em aberto'], ['pago', 'Pagos'], ['', 'Todos']]} />
        <input type="month" className="entrada" style={{ width: 180, height: 32 }} value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mês" />
      </div>
      {q.isLoading ? <Carregando /> : (
        <div className="card tabela-wrap">
          {lista.length ? (
            <table className="tabela">
              <thead><tr><th>Vencimento</th><th>Descrição</th><th className="esconde-movel">Categoria</th><th className="dir">Valor</th><th>Situação</th><th /></tr></thead>
              <tbody>{lista.map((l) => {
                const vencida = l.status === 'aberto' && l.vencimento < today();
                return (
                  <tr key={l.id} className="clicavel" onClick={() => abrir(l)}>
                    <td className={vencida ? 'bad-t' : ''}>{fdate(l.vencimento)}</td>
                    <td><span className="trunc" style={{ display: 'block', maxWidth: 340 }}>{l.descricao}</span>{l.clienteNome && <div className="sm t3">{l.clienteNome}</div>}</td>
                    <td className="esconde-movel xs">{FIN_CAT_LBL[l.categoria]}</td>
                    <td className={`dir mono ${l.tipo === 'despesa' ? 'warn-t' : ''}`}>{l.tipo === 'despesa' ? '−' : ''}{money(l.valor)}</td>
                    <td>{l.status === 'pago' ? <Badge tom="ok">Pago {fdate(l.pagoEm).slice(0, 5)}</Badge> : l.status === 'cancelado' ? <Badge tom="neu">Cancelado</Badge> : vencida ? <Badge tom="bad">Vencido</Badge> : <Badge tom="info">Em aberto</Badge>}</td>
                    <td className="dir" onClick={(e) => e.stopPropagation()}>
                      {l.status === 'aberto' && edita('lancamentos') && <div className="linha g-100" style={{ justifyContent: 'flex-end' }}>
                        {l.tipo === 'receita' && <button className="btn btn-sec btn-sm so-icone" aria-label="PIX" onClick={() => setPix(l)}><Icone n="pix" /></button>}
                        <button className="btn btn-sec btn-sm" onClick={() => baixar(l)}>Dar baixa</button>
                      </div>}
                    </td>
                  </tr>
                );
              })}</tbody>
              <tfoot><tr><td colSpan={3}>Saldo da lista</td><td className="dir mono">{money(tot)}</td><td colSpan={2} /></tr></tfoot>
            </table>
          ) : <Vazio titulo="Nenhum lançamento com esses filtros" />}
        </div>
      )}
      {pix && <Pix lancamento={pix} fechar={() => setPix(null)} />}
    </div>
  );
}

function Recorrencias() {
  const { edita } = useSessao();
  const qc = useQueryClient();
  const { avisar } = useAvisos();
  const [form, setForm] = useState<any>(null);
  const q = useQuery({ queryKey: ['recorrencias'], queryFn: () => api.get<any[]>('/recorrencias') });
  const comp = today().slice(0, 7);
  const gerar = async () => {
    try { const r = await api.post('/financeiro/recorrencias/gerar', { competencia: comp }); qc.invalidateQueries({ queryKey: ['recorrencias'] }); qc.invalidateQueries({ queryKey: ['lancamentos'] }); qc.invalidateQueries({ queryKey: ['inicio'] }); avisar(r.n ? `${r.n} despesa(s) lançada(s).` : 'Tudo já estava lançado.'); }
    catch (x) { avisar((x as Error).message, true); }
  };
  const lista = q.data || [];
  const pendentes = lista.filter((r) => r.ativo && r.ultimaCompetencia !== comp).length;
  return (
    <div className="miolo">
      <div className="linha wrap entre g-150">
        <p className="t2 xs">Aluguel de terreno, energia e outras contas mensais. O aluguel entra aqui sozinho a partir do cadastro do ponto.</p>
        {edita('lancamentos') && <div className="linha g-100">
          <button className="btn btn-sec" onClick={() => setForm({ categoria: 'outros', dia: 10, ativo: true })}>Nova despesa fixa</button>
          <button className="btn btn-pri" disabled={!pendentes} onClick={gerar}>Lançar {MESES_L[new Date().getMonth()].toLowerCase()} ({pendentes})</button>
        </div>}
      </div>
      <div className="card tabela-wrap">
        {lista.length ? (
          <table className="tabela">
            <thead><tr><th>Descrição</th><th className="esconde-movel">Categoria</th><th className="dir">Dia</th><th className="dir">Valor</th><th>Este mês</th></tr></thead>
            <tbody>{lista.map((r) => (
              <tr key={r.id} className="clicavel" onClick={() => setForm(r)} style={{ opacity: r.ativo ? 1 : 0.5 }}>
                <td>{r.descricao}</td><td className="esconde-movel xs">{FIN_CAT_LBL[r.categoria]}</td><td className="dir mono">{r.dia}</td><td className="dir mono">{money(r.valor)}</td>
                <td>{!r.ativo ? <Badge tom="neu">Pausada</Badge> : r.ultimaCompetencia === comp ? <Badge tom="ok">Lançada</Badge> : <Badge tom="warn">A lançar</Badge>}</td>
              </tr>
            ))}</tbody>
          </table>
        ) : <Vazio titulo="Nenhuma despesa fixa" />}
      </div>
      {form && <FormGaveta titulo={form.id ? 'Despesa fixa' : 'Nova despesa fixa'} rota="/recorrencias" registro={form.id ? form : null} padrao={form} fechar={() => setForm(null)} podeExcluir={edita('recorrencias')}
        campos={[
          { k: 'descricao', rotulo: 'Descrição', obrig: true, largo: true },
          { k: 'categoria', rotulo: 'Categoria', tipo: 'select', obrig: true, opcoes: FIN_CAT.map(([a, b]) => [a, b]) },
          { k: 'valor', rotulo: 'Valor mensal (R$)', tipo: 'dinheiro', obrig: true },
          { k: 'dia', rotulo: 'Dia do vencimento', tipo: 'numero', obrig: true },
          { k: 'ativo', rotulo: 'Ativa', tipo: 'bool' },
        ]} />}
    </div>
  );
}

function Notas() {
  const { empresa, edita } = useSessao();
  const qc = useQueryClient();
  const { avisar } = useAvisos();
  const cfgNf = useQuery({ queryKey: ['nf-config'], queryFn: () => api.get('/financeiro/nf-config') });
  const q = useQuery({ queryKey: ['lancamentos', 'nf'], queryFn: () => api.get<any[]>('/lancamentos?nf=pendente') });
  const emitidas = useQuery({ queryKey: ['lancamentos', 'nf-emitidas'], queryFn: () => api.get<any[]>('/lancamentos?nfStatus=emitida') });
  const [registrar, setRegistrar] = useState<any>(null);
  const [cancelar, setCancelar] = useState<any>(null);
  const [just, setJust] = useState('');
  const [v, setV] = useState({ numero: '', data: today(), link: '' });
  const [erro, setErro] = useState<unknown>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const nfse = empresa?.config.nfse;
  const prov = cfgNf.data?.provedor || 'manual';
  const auto = prov !== 'manual';
  const atualizar = () => ['lancamentos', 'contrato', 'inicio'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const acao = async (id: string, fn: () => Promise<any>) => {
    setOcupado(id);
    try {
      const r = await fn();
      if (r?.status === 'emitida') avisar(`Nota ${r.lancamento?.nfNumero || r.numero || ''} emitida${r.simulada || r.lancamento?.nfSimulada ? ' (simulada)' : ''}.`);
      else if (r?.status === 'processando') avisar('Nota enviada. A prefeitura está processando; atualize em alguns instantes.');
      else if (r?.status === 'erro') avisar(`A prefeitura recusou: ${r.erro || r.lancamento?.nfErro}`, true);
      atualizar();
    } catch (x) { avisar((x as Error).message, true); } finally { setOcupado(null); }
  };
  const salvar = async () => {
    try { await api.post(`/lancamentos/${registrar.id}/nf`, v); atualizar(); avisar('Nota registrada.'); setRegistrar(null); } catch (x) { setErro(x); }
  };
  const fazerCancelamento = async () => {
    try { await api.post(`/lancamentos/${cancelar.id}/nf/cancelar`, { justificativa: just }); atualizar(); avisar('Nota cancelada.'); setCancelar(null); } catch (x) { setErro(x); }
  };
  const copiar = (l: any) => {
    const txt = `Tomador: ${l.clienteNome || ''}${l.clienteDocumento ? ` (${l.clienteDocumento})` : ''}\nServiço: ${nfse?.descricao || 'Veiculação de mídia exterior'}${nfse?.codigoServico ? ` · item ${nfse.codigoServico}` : ''}\nDescrição: ${l.descricao}\nValor: ${money(l.valor)}\nAlíquota ISS: ${nfse?.aliquota ?? 5}%`;
    navigator.clipboard?.writeText(txt); avisar('Dados da nota copiados.');
  };
  const situacao = (l: any) => l.nfStatus === 'processando' ? <Badge tom="info">Processando</Badge>
    : l.nfStatus === 'cancelada' ? <Badge tom="neu">Nota cancelada</Badge>
    : l.nfStatus === 'erro' ? <span title={l.nfErro}><Badge tom="bad">Recusada</Badge><div className="sm bad-t" style={{ maxWidth: 280 }}>{l.nfErro}</div></span>
      : <Badge tom="warn">A emitir</Badge>;
  const quando = cfgNf.data?.automatica === 'ao_pagar' ? 'assim que a parcela é paga' : cfgNf.data?.automatica === 'ao_vencer' ? `${cfgNf.data.diasAntes} dia(s) antes do vencimento` : null;
  return (
    <div className="miolo">
      {auto ? (
        <div className={`aviso-linha ${prov === 'simulado' ? 'info' : 'ok'}`}><Icone n={prov === 'simulado' ? 'info' : 'check'} />
          <div><b>{prov === 'simulado' ? 'Emissão em modo simulado.' : `Emissão pela Focus NFe (${cfgNf.data?.ambiente === 'producao' ? 'produção' : 'homologação'}).`}</b>{' '}
            {quando ? `As notas saem sozinhas ${quando}.` : 'Clique em Emitir em cada parcela.'}{prov === 'simulado' ? ' Os números são de teste e não valem como nota fiscal.' : ''}</div>
        </div>
      ) : (
        <div className="linha wrap entre g-150">
          <p className="t2 xs">Copie os dados para o emissor da prefeitura e registre o número aqui. Para emitir direto pelo sistema, ligue em Configurações → Integrações.</p>
          {nfse?.emissorUrl && <a className="btn btn-sec" href={nfse.emissorUrl} target="_blank" rel="noreferrer"><Icone n="link" />Abrir emissor</a>}
        </div>
      )}
      <section className="pilha g-150">
        <h2 className="h-sec">Pendentes</h2>
        {q.isLoading ? <Carregando /> : (
          <div className="card tabela-wrap">
            {(q.data || []).length ? (
              <table className="tabela">
                <thead><tr><th>Vencimento</th><th>Parcela</th><th className="dir">Valor</th><th>Situação</th><th /></tr></thead>
                <tbody>{q.data!.map((l) => (
                  <tr key={l.id}>
                    <td>{fdate(l.vencimento)}</td>
                    <td>{l.descricao}<div className="sm t3">{l.clienteNome}{l.status === 'pago' ? ' · paga' : ''}</div></td>
                    <td className="dir mono">{money(l.valor)}</td>
                    <td>{situacao(l)}</td>
                    <td className="dir"><div className="linha g-100" style={{ justifyContent: 'flex-end' }}>
                      {auto && edita('lancamentos') && l.nfStatus === 'processando' && <button className="btn btn-sec btn-sm" disabled={ocupado === l.id} onClick={() => acao(l.id, () => api.post(`/lancamentos/${l.id}/nf/consultar`))}>Atualizar</button>}
                      {auto && edita('lancamentos') && l.nfStatus !== 'processando' && <button className="btn btn-pri btn-sm" disabled={ocupado === l.id} onClick={() => acao(l.id, () => api.post(`/lancamentos/${l.id}/nf/emitir`))}>{ocupado === l.id ? 'Emitindo…' : l.nfStatus === 'erro' ? 'Tentar de novo' : 'Emitir'}</button>}
                      {!auto && <button className="btn btn-sec btn-sm" onClick={() => copiar(l)}><Icone n="copiar" />Copiar dados</button>}
                      {!auto && edita('lancamentos') && <button className="btn btn-pri btn-sm" onClick={() => { setV({ numero: '', data: today(), link: '' }); setErro(null); setRegistrar(l); }}>Registrar nota</button>}
                    </div></td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <Vazio titulo="Nenhuma nota pendente" />}
          </div>
        )}
      </section>
      {(emitidas.data || []).length > 0 && (
        <section className="pilha g-150">
          <h2 className="h-sec">Emitidas</h2>
          <div className="card tabela-wrap">
            <table className="tabela">
              <thead><tr><th>Nota</th><th>Parcela</th><th className="dir">Valor</th><th /></tr></thead>
              <tbody>{emitidas.data!.slice().reverse().slice(0, 30).map((l) => (
                <tr key={l.id}>
                  <td><span className="mono" style={{ fontWeight: 500 }}>{l.nfNumero}</span>{l.nfSimulada && <> <Badge tom="info">teste</Badge></>}<div className="sm t3">{fdate(l.nfData)}{l.nfCodigoVerificacao ? ` · cód. ${l.nfCodigoVerificacao}` : ''}</div></td>
                  <td>{l.descricao}<div className="sm t3">{l.clienteNome}</div></td>
                  <td className="dir mono">{money(l.valor)}</td>
                  <td className="dir"><div className="linha g-100" style={{ justifyContent: 'flex-end' }}>
                    {l.nfLink && <a className="btn btn-sec btn-sm" href={l.nfLink} target="_blank" rel="noreferrer"><Icone n="pdf" />Ver nota</a>}
                    {l.nfXml && <a className="btn btn-txt btn-sm" href={l.nfXml} target="_blank" rel="noreferrer">XML</a>}
                    {edita('lancamentos') && (auto || l.nfSimulada) && <button className="btn btn-txt btn-sm" style={{ color: 'var(--c-bad)' }} onClick={() => { setJust(''); setErro(null); setCancelar(l); }}>Cancelar</button>}
                  </div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      )}
      {registrar && (
        <Dialogo titulo="Registrar nota fiscal" fechar={() => setRegistrar(null)} rodape={<><button className="btn btn-sec" onClick={() => setRegistrar(null)}>Cancelar</button><button className="btn btn-pri" onClick={salvar} disabled={!v.numero}>Salvar</button></>}>
          <p className="xs t2">{registrar.descricao} · {money(registrar.valor)}</p>
          <ErroCaixa erro={erro} />
          <div className="form">
            <Campo rotulo="Número da nota"><input className="entrada mono" value={v.numero} onChange={(e) => setV({ ...v, numero: e.target.value })} autoFocus /></Campo>
            <Campo rotulo="Data de emissão"><input className="entrada" type="date" value={v.data} onChange={(e) => setV({ ...v, data: e.target.value })} /></Campo>
            <Campo rotulo="Link da nota (opcional)" className="largo"><input className="entrada" value={v.link} onChange={(e) => setV({ ...v, link: e.target.value })} /></Campo>
          </div>
        </Dialogo>
      )}
      {cancelar && (
        <Dialogo titulo={`Cancelar nota ${cancelar.nfNumero}`} fechar={() => setCancelar(null)} rodape={<><button className="btn btn-sec" onClick={() => setCancelar(null)}>Voltar</button><button className="btn btn-perigo" disabled={just.trim().length < 15} onClick={fazerCancelamento}>Cancelar nota</button></>}>
          <ErroCaixa erro={erro} />
          <Campo rotulo="Motivo do cancelamento" ajuda="A prefeitura exige pelo menos 15 caracteres."><textarea className="entrada" value={just} onChange={(e) => setJust(e.target.value)} autoFocus /></Campo>
          <p className="sm t2">A parcela volta para as pendentes, para você emitir a nota correta.</p>
        </Dialogo>
      )}
    </div>
  );
}

function Conciliacao() {
  const qc = useQueryClient();
  const { avisar } = useAvisos();
  const [res, setRes] = useState<any>(null);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [erro, setErro] = useState<unknown>(null);
  const ler = async (f?: File) => {
    if (!f) return;
    setErro(null);
    try { const r = await api.enviar('/financeiro/conciliacao', { arquivo: f }); setRes(r); setMarcados(new Set(r.itens.map((x: any, i: number) => (x.lancamento ? i : -1)).filter((i: number) => i >= 0))); } catch (x) { setErro(x); }
  };
  const confirmar = async () => {
    const itens = res.itens.filter((_: any, i: number) => marcados.has(i)).map((x: any) => ({ lancamentoId: x.lancamento.id, data: x.transacao.data }));
    try { const r = await api.post('/financeiro/conciliacao/confirmar', { itens }); avisar(`${r.n} baixa(s) registrada(s).`); setRes(null); qc.invalidateQueries({ queryKey: ['lancamentos'] }); qc.invalidateQueries({ queryKey: ['financeiro'] }); } catch (x) { setErro(x); }
  };
  return (
    <div className="miolo">
      <div className="card pp pilha g-150">
        <span className="h-card">Extrato do banco</span>
        <p className="xs t2">Envie o extrato em OFX ou CSV. Os créditos são casados com as parcelas em aberto pelo identificador do PIX ou pelo valor e data.</p>
        <label className="btn btn-sec" style={{ alignSelf: 'flex-start' }}><Icone n="upload" />Escolher arquivo<input type="file" accept=".ofx,.csv,.txt" hidden onChange={(e) => ler(e.target.files?.[0])} /></label>
        <ErroCaixa erro={erro} />
      </div>
      {res && (
        <section className="pilha g-150">
          <div className="linha entre"><span className="h-sec">{res.lidas} crédito(s) lido(s)</span><button className="btn btn-pri" disabled={!marcados.size} onClick={confirmar}>Dar baixa em {marcados.size}</button></div>
          <ul className="card lista">
            {res.itens.map((x: any, i: number) => (
              <li key={i} className="li">
                <input type="checkbox" disabled={!x.lancamento} checked={marcados.has(i)} onChange={() => { const s = new Set(marcados); s.has(i) ? s.delete(i) : s.add(i); setMarcados(s); }} aria-label="Conciliar" />
                <div className="pilha flex1"><span className="mono">{fdate(x.transacao.data)} · {money(x.transacao.valor)}</span><span className="sm t3 trunc">{x.transacao.desc}</span></div>
                {x.lancamento ? <div className="pilha" style={{ textAlign: 'right' }}><span className="xs">{x.lancamento.descricao}</span><span className="sm ok-t">{x.motivo}</span></div> : <span className="sm t3">sem parcela correspondente</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
