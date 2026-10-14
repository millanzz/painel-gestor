import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  addDays, ARTE_ST, CONTRATO_ST, dividirParcelas, fdate, FIN_CAT_LBL, money, pct, RESERVA_ST, TIPO_LBL, today, VERIFICACAO,
} from '@shared';
import { api, urlArquivo } from '../api';
import { useSessao } from '../sessao';
import { abrirArquivo, Badge, Campo, Carregando, Dialogo, ErroCaixa, Etiqueta, MaisAcoes, useAvisos } from '../ui/base';
import { FormGaveta } from '../ui/formulario';
import { Icone } from '../ui/icones';
import NovaReserva from './NovaReserva';

const quando = (iso: string) => {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(Date.now() - 864e5);
  const h = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === hoje.toDateString()) return `hoje, ${h}`;
  if (d.toDateString() === ontem.toDateString()) return `ontem, ${h}`;
  return `${d.toLocaleDateString('pt-BR')}, ${h}`;
};

export default function Contrato() {
  const { id } = useParams();
  const { sessao, edita, vê } = useSessao();
  const qc = useQueryClient();
  const nav = useNavigate();
  const { avisar, confirmar } = useAvisos();
  const q = useQuery({ queryKey: ['contrato', id], queryFn: () => api.get(`/contratos/${id}/completo`) });
  const equipe = useQuery({ queryKey: ['equipe'], queryFn: () => api.get<any[]>('/empresa/equipe') });
  const clientes = useQuery({ queryKey: ['clientes'], queryFn: () => api.get<any[]>('/clientes') });
  const [addFaces, setAddFaces] = useState(false);
  const [editar, setEditar] = useState(false);
  const [parcelas, setParcelas] = useState(false);
  const [cancelar, setCancelar] = useState(false);
  const [valor, setValor] = useState<string>('');
  const [erro, setErro] = useState<unknown>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => { if (q.data) setValor(String(q.data.contrato.valor)); }, [q.data?.contrato.valor]);
  if (q.isLoading) return <Carregando />;
  if (q.error) return <div className="miolo"><ErroCaixa erro={q.error} /></div>;
  const { contrato: k, reservas, calculo: c, lancamentos, arte, fotos, atividade, limite } = q.data;
  const admin = sessao?.perfil === 'admin';
  const podeEditar = edita('contratos') && !['encerrado', 'cancelado'].includes(k.status);
  const atualizar = () => ['contrato', 'contratos', 'agenda', 'inicio', 'lancamentos', 'os'].forEach((x) => qc.invalidateQueries({ queryKey: [x] }));

  const acao = async (fn: () => Promise<any>, msg?: string | ((r: any) => string)) => {
    setOcupado(true); setErro(null);
    try { const r = await fn(); atualizar(); if (msg) avisar(typeof msg === 'function' ? msg(r) : msg); return r; } catch (x) { setErro(x); } finally { setOcupado(false); }
  };

  const salvarValor = () => {
    const v = Number(valor);
    if (!isNaN(v) && v !== k.valor) acao(() => api.patch(`/contratos/${k.id}`, { valor: v }), 'Valor atualizado.');
  };

  /* ---- próximo passo ---- */
  let passo: { titulo: string; texto: string; botao?: string; fazer?: () => void } | null = null;
  const faltaParcelas = !lancamentos.some((l: any) => l.categoria === 'contrato');
  if (k.status === 'proposta') {
    passo = !reservas.length
      ? { titulo: 'adicionar faces', texto: 'Escolha as faces e o período. Elas ficam em opção enquanto o cliente decide.', botao: 'Adicionar faces', fazer: () => setAddFaces(true) }
      : { titulo: 'aprovar a proposta', texto: c.desconto > limite + 0.01 ? `O desconto de ${pct(c.desconto)} passa do seu limite de ${pct(limite)}. Ao aprovar, vai para o administrador.` : `Desconto de ${pct(c.desconto)}, dentro do seu limite. ${k.aceitoEm ? 'O cliente já aceitou pelo portal.' : 'Envie a proposta e aprove quando o cliente aceitar.'}`, botao: 'Aprovar proposta', fazer: () => acao(() => api.post(`/contratos/${k.id}/aprovar`), (r) => r.mensagem) };
  } else if (k.status === 'aprovacao') {
    passo = admin
      ? { titulo: 'aprovar o desconto', texto: `${pct(c.desconto)} sobre a tabela de ${money(c.tabela)}. O comercial pode aprovar até ${pct(15)}.`, botao: 'Aprovar desconto', fazer: () => acao(() => api.post(`/contratos/${k.id}/desconto`, { aprovar: true }), 'Desconto aprovado.') }
      : { titulo: 'aguardando o administrador', texto: `O desconto de ${pct(c.desconto)} precisa da aprovação do administrador.` };
  } else if (k.status === 'aprovada') {
    passo = { titulo: 'emitir o PI', texto: 'O PI confirma as faces, cria as ordens de colagem para o campo e o acompanhamento do material.', botao: 'Emitir PI', fazer: () => acao(() => api.post(`/contratos/${k.id}/emitir-pi`), (r) => `${r.piNumero} emitido. Faces confirmadas.`).then((r) => r && abrirArquivo(`/pdf/contratos/${k.id}/pi`)) };
  } else if (k.status === 'ativo' && faltaParcelas && edita('lancamentos')) {
    passo = { titulo: 'lançar as parcelas', texto: 'O financeiro passa a cobrar pela régua e o cliente vê os pagamentos no portal.', botao: 'Gerar parcelas', fazer: () => setParcelas(true) };
  } else if (k.status === 'ativo' && arte && arte.status !== 'recebido') {
    passo = { titulo: 'garantir o material', texto: `${arte.necessario}. Prazo ${fdate(arte.prazo)}.`, botao: 'Ver material', fazer: () => nav('/artes') };
  } else if (k.status === 'encerrado' && edita('contratos')) {
    passo = { titulo: 'renovar', texto: 'Cria uma proposta com as mesmas faces logo depois do fim, com o mesmo desconto.', botao: 'Criar renovação', fazer: () => acao(() => api.post(`/contratos/${k.id}/renovar`), (r) => `Renovação ${r.numero} criada${r.fila ? `, ${r.fila} face(s) na fila` : ''}.`).then((r) => r && nav(`/contratos/${r.id}`)) };
  }

  const etapas: [string, string][] = [['proposta', 'Proposta'], ['aprovada', 'Aprovada'], ['ativo', 'PI emitido'], ['encerrado', 'Encerrado']];
  const ordem = { proposta: 0, aprovacao: 0, aprovada: 1, ativo: 2, encerrado: 3, cancelado: -1 } as Record<string, number>;
  const atual = ordem[k.status];
  const arteIdx = arte ? ARTE_ST.findIndex(([s]) => s === arte.status) : -1;
  const docPrincipal = k.piNumero ? 'pi' : 'proposta';

  return (
    <>
      <div className="cab compacto">
        <nav className="trilha" aria-label="Trilha"><Link to="/contratos">Vendas</Link><span aria-hidden="true">/</span><span className="mono" style={{ color: 'var(--c-text)' }}>{k.numero}</span></nav>
        <div className="linha g-100">
          <button className="btn btn-sec btn-sm" onClick={() => abrirArquivo(`/pdf/contratos/${k.id}/${docPrincipal}`)}><Icone n="pdf" />{k.piNumero ? 'PI em PDF' : 'Proposta em PDF'}</button>
          <MaisAcoes>{(f) => <>
            {podeEditar && <button onClick={() => { f(); setEditar(true); }}><Icone n="editar" />Editar dados</button>}
            {k.piNumero && <button onClick={() => { f(); abrirArquivo(`/pdf/contratos/${k.id}/proposta`); }}><Icone n="pdf" />Proposta em PDF</button>}
            {fotos.length > 0 && <button onClick={() => { f(); abrirArquivo(`/pdf/contratos/${k.id}/veiculacao`); }}><Icone n="camera" />Relatório de veiculação</button>}
            {edita('contratos') && ['ativo', 'encerrado'].includes(k.status) && <button onClick={() => { f(); acao(() => api.post(`/contratos/${k.id}/renovar`), (r) => `Renovação ${r.numero} criada.`).then((r) => r && nav(`/contratos/${r.id}`)); }}><Icone n="restaurar" />Renovar</button>}
            {admin && k.status === 'aprovacao' && <button onClick={() => { f(); acao(() => api.post(`/contratos/${k.id}/desconto`, { aprovar: false }), 'Desconto recusado. Voltou para proposta.'); }}>Recusar desconto</button>}
            {edita('contratos') && !['cancelado', 'encerrado'].includes(k.status) && <><hr /><button className="perigo" onClick={() => { f(); setCancelar(true); }}>Cancelar contrato</button></>}
            {admin && <button className="perigo" onClick={async () => { f(); if (await confirmar({ titulo: `Excluir ${k.numero}?`, texto: 'O contrato vai para a lixeira. As reservas continuam até serem excluídas.', ok: 'Excluir', perigo: true })) acao(() => api.del(`/contratos/${k.id}`), 'Contrato excluído.').then(() => nav('/contratos')); }}>Excluir</button>}
          </>}</MaisAcoes>
        </div>
      </div>

      <div className="linha wrap" style={{ alignItems: 'stretch', flex: 1 }}>
        <div className="pilha g-400" style={{ flex: '999 1 520px', minWidth: 0, padding: 'var(--s-400)' }}>
          <div className="pilha g-150">
            <div className="pilha g-050">
              <h1 className="h-big">{k.campanha}</h1>
              <span className="t2">{k.nFaces || 0} face(s){k.ini ? ` · ${fdate(k.ini)} a ${fdate(k.fim)}` : ''}</span>
            </div>
            {k.status === 'cancelado' ? <div className="etapas"><span className="etapa cancelada"><span className="bola">✕</span>Cancelado em {fdate(k.canceladoEm)}</span></div> : (
              <ol className="etapas" aria-label="Etapas do contrato">
                {etapas.map(([s, t], i) => (
                  <li key={s} className={`etapa ${i < atual || (i === atual && s === 'encerrado') ? 'feita' : i === atual ? 'atual' : ''}`} aria-current={i === atual ? 'step' : undefined}>
                    <span className="bola">{i < atual || (i === atual && s === 'encerrado') ? '✓' : i + 1}</span>{s === 'proposta' && k.status === 'aprovacao' ? 'Aprovação do desconto' : t}
                  </li>
                ))}
              </ol>
            )}
          </div>

          <ErroCaixa erro={erro} />
          {passo && (
            <section className="chamada" aria-labelledby="h-prox">
              <div className="pilha g-050" style={{ flex: '1 1 320px', minWidth: 0 }}>
                <h2 id="h-prox" className="h-card" style={{ color: 'var(--c-brand-h)' }}>Próximo passo: {passo.titulo}</h2>
                <p className="xs" style={{ color: '#3D444E' }}>{passo.texto}</p>
              </div>
              {passo.botao && (passo.botao === 'Ver material' ? vê('artes') : passo.botao === 'Gerar parcelas' ? edita('lancamentos') : edita('contratos')) && <button className="btn btn-pri" disabled={ocupado} onClick={passo.fazer}>{passo.botao}</button>}
            </section>
          )}

          <section aria-labelledby="h-faces" className="pilha g-150">
            <div className="linha entre">
              <h2 id="h-faces" className="h-sec">Faces</h2>
              {podeEditar && edita('reservas') && <button className="btn btn-sec btn-sm" onClick={() => setAddFaces(true)}><Icone n="mais" />Adicionar faces</button>}
            </div>
            <div className="card tabela-wrap">
              {reservas.length ? (
                <table className="tabela" style={{ minWidth: 560 }}>
                  <thead><tr><th>Face</th><th>Local</th><th>Período</th><th>Situação</th><th className="dir">Tabela</th>{podeEditar && <th />}</tr></thead>
                  <tbody>
                    {reservas.map((r: any) => (
                      <tr key={r.id}>
                        <td><span className="mono" style={{ fontWeight: 500 }}>{r.painelCodigo}</span><div className="sm t3">{TIPO_LBL[r.painelTipo]}{r.painelTipo === 'led' ? ` · ${r.slots} cota(s)` : ''}</div></td>
                        <td className="xs">{r.endereco || '—'}</td>
                        <td className="xs">{fdate(r.ini)} a {fdate(r.fim)}</td>
                        <td><Etiqueta par={RESERVA_ST[r.status]} />{r.status === 'reservado' && r.validade && <div className="sm t3">até {fdate(r.validade)}</div>}</td>
                        <td className="dir mono">{r.status === 'fila' ? '—' : money(r.tabela)}</td>
                        {podeEditar && <td className="dir">{['reservado', 'fila'].includes(r.status) && edita('reservas') && (
                          <button className="icone-btn" aria-label={`Tirar ${r.painelCodigo}`} onClick={async () => { if (await confirmar({ titulo: `Tirar ${r.painelCodigo} do contrato?`, ok: 'Tirar', perigo: true })) acao(() => api.del(`/reservas/${r.id}`), 'Face retirada.'); }}><Icone n="lixeira" /></button>
                        )}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <div className="vazio">Nenhuma face ainda.</div>}
            </div>
          </section>

          {fotos.length > 0 && (
            <section aria-labelledby="h-fotos" className="pilha g-150">
              <div className="linha entre"><h2 id="h-fotos" className="h-sec">Fotos da veiculação</h2><button className="btn btn-txt" onClick={() => abrirArquivo(`/pdf/contratos/${k.id}/veiculacao`)}>Relatório em PDF</button></div>
              <div className="fotos">
                {fotos.map((f: any) => (
                  <figure key={f.id} className="pilha g-100">
                    <a className="foto" href={urlArquivo(f.arquivoId)} target="_blank" rel="noreferrer"><img src={urlArquivo(f.arquivoId)} alt={`Foto de ${f.painelCodigo}`} loading="lazy" /></a>
                    <figcaption className="pilha"><span style={{ fontWeight: 500 }} className="mono">{f.painelCodigo}</span><span className="sm t2">{fdate(f.data)}</span>
                      <span className={`sm ${f.verificacao === 'ok' ? 'ok-t' : 'warn-t'}`}>{VERIFICACAO[f.verificacao]?.[0]}{f.distanciaM != null ? ` · ${f.distanciaM} m do ponto` : ''}</span></figcaption>
                  </figure>
                ))}
              </div>
            </section>
          )}

          <section aria-labelledby="h-hist" className="pilha g-150">
            <h2 id="h-hist" className="h-sec">Atividade</h2>
            {atividade.length ? (
              <ol className="atividade">
                {atividade.map((a: any, i: number) => (
                  <li key={i}><span className="marca" aria-hidden="true" />
                    <div><span style={{ fontWeight: 500 }}>{a.autorNome}</span> {a.acao} {a.tabela === 'contratos' ? '' : `· ${a.rotulo}`}
                      {a.mudancas?.length ? <span className="t2"> ({a.mudancas.join('; ')})</span> : null}
                      <span className="t3"> · {quando(a.quando)}</span></div>
                  </li>
                ))}
              </ol>
            ) : <p className="t2 xs">Sem atividade registrada.</p>}
          </section>
        </div>

        <aside aria-label="Detalhes" className="pilha g-300" style={{ flex: '1 1 300px', minWidth: 0, borderLeft: '1px solid var(--c-line)', padding: 'var(--s-300)', background: '#FCFCFD' }}>
          <dl className="pilha">
            <div className="prop"><dt>Situação</dt><dd><Etiqueta par={CONTRATO_ST[k.status]} /></dd></div>
            <div className="prop"><dt>Cliente</dt><dd>{k.clienteNome}</dd></div>
            <div className="prop"><dt>Agência</dt><dd className={k.agenciaNome ? '' : 't3'}>{k.agenciaNome || 'Sem agência'}</dd></div>
            <div className="prop"><dt>Vendedor</dt><dd>{k.vendedorNome || '—'}</dd></div>
            {k.piNumero && <div className="prop"><dt>PI</dt><dd className="mono">{k.piNumero} · {fdate(k.piData)}</dd></div>}
            {k.status === 'proposta' && <div className="prop"><dt>Validade</dt><dd className={k.validadeProposta < today() ? 'warn-t' : ''}>{fdate(k.validadeProposta)}</dd></div>}
            {k.aceitoEm && <div className="prop"><dt>Aceite</dt><dd className="ok-t">{k.aceitoPor} pelo portal</dd></div>}
          </dl>

          <div className="pilha g-050" style={{ borderTop: '1px solid var(--c-line)', paddingTop: 'var(--s-300)' }}>
            <span className="sm t2">Valor do contrato</span>
            {podeEditar && ['proposta', 'aprovacao', 'aprovada'].includes(k.status) ? (
              <input aria-label="Valor do contrato" className="entrada mono" style={{ fontSize: 22, height: 44 }} type="number" step="0.01" value={valor}
                onChange={(e) => setValor(e.target.value)} onBlur={salvarValor} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
            ) : <span className="mono" style={{ fontSize: 28, lineHeight: '36px', fontWeight: 500 }}>{money(k.valor)}</span>}
            <dl style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px 12px' }} className="xs">
              <dt className="t2">Tabela{c.volumePct ? '' : ''}</dt><dd className="mono">{money(c.tabela)}</dd>
              <dt className="t2">Desconto</dt><dd className="mono">{pct(c.desconto)}</dd>
              {c.volumePct > 0 && <><dt className="t2">Sugerido com volume ({pct(c.volumePct)})</dt><dd className="mono">{money(c.sugerido)}</dd></>}
              {c.comAgencia > 0 && <><dt className="t2">Comissão da agência</dt><dd className="mono">−{money(c.comAgencia)}</dd></>}
              {c.comVendedor > 0 && <><dt className="t2">Comissão do vendedor</dt><dd className="mono">−{money(c.comVendedor)}</dd></>}
              {(c.comAgencia > 0 || c.comVendedor > 0) && <><dt style={{ fontWeight: 500 }}>Líquido</dt><dd className="mono" style={{ fontWeight: 500 }}>{money(c.liquido)}</dd></>}
            </dl>
            {['proposta', 'aprovada', 'aprovacao'].includes(k.status) && (
              <span className={`sm ${c.desconto > limite + 0.01 ? 'warn-t' : 'ok-t'}`} style={{ marginTop: 8 }}>
                {k.descontoAprovadoPor ? `Desconto aprovado por ${k.descontoAprovadoPor}.` : c.desconto > limite + 0.01 ? `Acima do seu limite de ${pct(limite)}: precisa de aprovação.` : `Dentro do limite de ${pct(limite)}. Não precisa de aprovação.`}
              </span>
            )}
          </div>

          {arte && (
            <div className="pilha g-100" style={{ borderTop: '1px solid var(--c-line)', paddingTop: 'var(--s-300)' }}>
              <div className="linha entre" style={{ alignItems: 'baseline' }}><span className="h-card">Material</span>{arte.prazo && <span className="sm t2">até {fdate(arte.prazo)}</span>}</div>
              <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: `repeat(${ARTE_ST.length}, minmax(0, 1fr))`, gap: 4 }}>
                {ARTE_ST.map((_, i) => <span key={i} style={{ height: 4, borderRadius: 2, background: i <= arteIdx ? (arte.status === 'recebido' ? 'var(--c-ok)' : 'var(--c-brand)') : 'var(--c-line)' }} />)}
              </div>
              <span className="t2 xs">{ARTE_ST[arteIdx]?.[1]}. {arte.necessario}</span>
              {vê('artes') && <Link to="/artes" className="xs">Abrir material</Link>}
            </div>
          )}

          {vê('dinheiro') && (
            <div className="pilha g-150" style={{ borderTop: '1px solid var(--c-line)', paddingTop: 'var(--s-300)' }}>
              <div className="pilha g-050"><span className="h-card">Parcelas</span>
                {!lancamentos.length && <span className="t2 xs">Ainda não lançadas.</span>}
              </div>
              {lancamentos.length > 0 && (
                <ul className="pilha g-100 xs">
                  {lancamentos.map((l: any) => (
                    <li key={l.id} className="linha entre g-100">
                      <span className="pilha" style={{ minWidth: 0 }}>{l.categoria === 'contrato' ? `Parcela ${l.descricao.match(/(\d+\/\d+)/)?.[1] || ''}` : FIN_CAT_LBL[l.categoria]}<span className="sm t3">{fdate(l.vencimento)}</span></span>
                      <span className="linha g-100"><span className="mono">{money(l.valor)}</span>
                        <Badge tom={l.status === 'pago' ? 'ok' : l.status === 'cancelado' ? 'neu' : l.vencimento < today() ? 'bad' : 'info'}>{l.status === 'pago' ? 'Pago' : l.status === 'cancelado' ? 'Cancelada' : l.vencimento < today() ? 'Vencida' : 'Aberta'}</Badge></span>
                    </li>
                  ))}
                </ul>
              )}
              {edita('lancamentos') && ['aprovada', 'ativo'].includes(k.status) && (
                <button className="btn btn-sec" style={{ width: '100%' }} onClick={() => setParcelas(true)}>
                  {faltaParcelas ? `Gerar parcelas de ${money(k.valor)}` : 'Lançar mais parcelas'}
                </button>
              )}
            </div>
          )}
        </aside>
      </div>

      {addFaces && <NovaReserva faces={[]} contratoId={k.id} inicio={k.ini || undefined} fechar={() => { setAddFaces(false); atualizar(); }} />}
      {editar && (
        <FormGaveta titulo="Editar contrato" rota="/contratos" registro={k} fechar={() => setEditar(false)} invalidar={['contrato']}
          campos={[
            { k: 'campanha', rotulo: 'Campanha', obrig: true, largo: true },
            { k: 'clienteId', rotulo: 'Anunciante', tipo: 'select', obrig: true, opcoes: (clientes.data || []).filter((c) => c.tipo === 'anunciante').map((c) => [c.id, c.nome]) },
            { k: 'agenciaId', rotulo: 'Agência', tipo: 'select', opcoes: (clientes.data || []).filter((c) => c.tipo === 'agencia').map((c) => [c.id, c.nome]) },
            { k: 'vendedorId', rotulo: 'Vendedor', tipo: 'select', opcoes: (equipe.data || []).filter((m) => ['admin', 'comercial'].includes(m.perfil)).map((m) => [m.id, m.nome]) },
            { k: 'validadeProposta', rotulo: 'Proposta válida até', tipo: 'data' },
            { k: 'condicoes', rotulo: 'Condições', tipo: 'area', largo: true },
            { k: 'obs', rotulo: 'Observações internas', tipo: 'area', largo: true },
          ]} />
      )}
      {parcelas && <GerarParcelas k={k} jaLancado={lancamentos.filter((l: any) => l.tipo === 'receita' && l.categoria === 'contrato' && l.status !== 'cancelado').reduce((s: number, l: any) => s + l.valor, 0)} fechar={() => setParcelas(false)} aoGerar={atualizar} />}
      {cancelar && <Cancelar k={k} fechar={() => setCancelar(false)} aoCancelar={atualizar} />}
    </>
  );
}

function GerarParcelas({ k, jaLancado, fechar, aoGerar }: { k: any; jaLancado: number; fechar: () => void; aoGerar: () => void }) {
  const { avisar } = useAvisos();
  const resto = Math.max(0, Math.round((k.valor - jaLancado) * 100) / 100);
  const [v, setV] = useState({ valor: resto, n: 3, primeiro: addDays(today(), 15), intervalo: 'mensal' });
  const [erro, setErro] = useState<unknown>(null);
  const partes = v.valor > 0 && v.n > 0 ? dividirParcelas(v.valor, v.n) : [];
  const gerar = async () => {
    try { await api.post(`/contratos/${k.id}/parcelas`, v); avisar(`${v.n} parcela(s) lançada(s).`); aoGerar(); fechar(); } catch (x) { setErro(x); }
  };
  return (
    <Dialogo titulo={`Parcelas · ${k.numero}`} fechar={fechar} rodape={<><button className="btn btn-sec" onClick={fechar}>Cancelar</button><button className="btn btn-pri" onClick={gerar} disabled={!partes.length}>Gerar {v.n} parcela(s)</button></>}>
      <p className="xs t2">Contrato {money(k.valor)} · já lançado {money(jaLancado)} · <b>restante {money(resto)}</b></p>
      <ErroCaixa erro={erro} />
      <div className="form">
        <Campo rotulo="Valor a parcelar"><input className="entrada" type="number" step="0.01" value={v.valor} onChange={(e) => setV({ ...v, valor: Number(e.target.value) })} /></Campo>
        <Campo rotulo="Nº de parcelas"><input className="entrada" type="number" min={1} max={48} value={v.n} onChange={(e) => setV({ ...v, n: Math.max(1, Number(e.target.value) || 1) })} /></Campo>
        <Campo rotulo="1º vencimento"><input className="entrada" type="date" value={v.primeiro} onChange={(e) => setV({ ...v, primeiro: e.target.value })} /></Campo>
        <Campo rotulo="Intervalo"><select className="entrada" value={v.intervalo} onChange={(e) => setV({ ...v, intervalo: e.target.value })}><option value="mensal">Mensal</option><option value="bissemana">A cada bissemana (14 dias)</option></select></Campo>
      </div>
      {partes.length > 0 && <p className="sm t2">{partes.length} × {money(partes[0])}{partes[partes.length - 1] !== partes[0] ? ` (última ${money(partes[partes.length - 1])})` : ''}</p>}
    </Dialogo>
  );
}

function Cancelar({ k, fechar, aoCancelar }: { k: any; fechar: () => void; aoCancelar: () => void }) {
  const { empresa } = useSessao();
  const { avisar } = useAvisos();
  const [data, setData] = useState(today());
  const [multa, setMulta] = useState(k.status === 'ativo' ? empresa!.config.multaPct : 0);
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<unknown>(null);
  const sim = useQuery({ queryKey: ['cancelamento', k.id, data, multa], queryFn: () => api.get(`/contratos/${k.id}/cancelamento?data=${data}&multa=${multa}`) });
  const ir = async () => {
    try { await api.post(`/contratos/${k.id}/cancelar`, { data, multaPct: Number(multa), motivo }); avisar('Contrato cancelado.'); aoCancelar(); fechar(); } catch (x) { setErro(x); }
  };
  return (
    <Dialogo titulo={`Cancelar ${k.numero}`} fechar={fechar} rodape={<><button className="btn btn-sec" onClick={fechar}>Voltar</button><button className="btn btn-perigo" onClick={ir}>Cancelar contrato</button></>}>
      <ErroCaixa erro={erro} />
      <div className="form">
        <Campo rotulo="Data do cancelamento"><input className="entrada" type="date" value={data} onChange={(e) => setData(e.target.value)} /></Campo>
        <Campo rotulo="Multa (% do saldo)"><input className="entrada" type="number" min={0} max={100} value={multa} onChange={(e) => setMulta(Number(e.target.value))} /></Campo>
        <Campo rotulo="Motivo" className="largo"><input className="entrada" value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Campo>
      </div>
      {sim.data && (
        <dl className="xs" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px 12px' }}>
          <dt className="t2">Saldo não veiculado a partir de {fdate(data)}</dt><dd className="mono">{money(sim.data.saldo)}</dd>
          <dt className="t2">Multa ({multa}%)</dt><dd className="mono">{money(sim.data.multa)}</dd>
          <dt className="t2">Parcelas em aberto que serão canceladas</dt><dd className="mono">{sim.data.abertas.length} · {money(sim.data.totalAbertas)}</dd>
        </dl>
      )}
      <p className="sm t2">Reservas futuras são liberadas, campanhas no ar terminam na véspera da data e as colagens pendentes saem do roteiro.</p>
    </Dialogo>
  );
}
