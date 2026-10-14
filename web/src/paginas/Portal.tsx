import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { fdate, iniciais, money, today } from '@shared';
import { api, urlArquivo } from '../api';
import { useSessao } from '../sessao';
import { abrirArquivo, Badge, Carregando, ErroCaixa, useAvisos, Vazio } from '../ui/base';
import { Icone } from '../ui/icones';
import { Pix } from './Dinheiro';

type Aba = 'campanhas' | 'pagamentos';

export default function Portal() {
  const { sair, sessao } = useSessao();
  const qc = useQueryClient();
  const { avisar, confirmar } = useAvisos();
  const [aba, setAba] = useState<Aba>('campanhas');
  const [pix, setPix] = useState<any>(null);
  const q = useQuery({ queryKey: ['portal'], queryFn: () => api.get('/portal') });
  if (q.isLoading) return <Carregando />;
  if (q.error) return <div className="entrada-tela"><ErroCaixa erro={q.error} /></div>;
  const d = q.data;
  const noAr = d.campanhas.find((k: any) => k.status === 'ativo' && k.ini <= today() && k.fim >= today()) || d.campanhas.find((k: any) => k.status === 'ativo');
  const fotos = noAr ? d.fotos.filter((f: any) => f.contratoId === noAr.id) : d.fotos;
  const proximo = d.pagamentos.find((p: any) => p.status === 'aberto');
  const parcela = (p: any) => { const iguais = d.pagamentos.filter((x: any) => x.contratoNumero === p.contratoNumero); return `${iguais.indexOf(p) + 1} de ${iguais.length}`; };
  const situacao = (k: any) => {
    if (['proposta', 'aprovada'].includes(k.status) && !k.aceitoEm) return <Badge tom="warn">Aguardando você</Badge>;
    if (['proposta', 'aprovada'].includes(k.status)) return <Badge tom="info">Aceita · em preparação</Badge>;
    if (k.status === 'ativo') return k.ini > today() ? <Badge tom="info">Começa {fdate(k.ini).slice(0, 5)}</Badge> : <Badge tom="ok">No ar</Badge>;
    return <Badge tom="neu">Encerrada</Badge>;
  };
  const aceitar = async (k: any) => {
    if (!(await confirmar({ titulo: `Aceitar a proposta ${k.numero}?`, texto: `${k.campanha} · ${money(k.valor)}. A exibidora confirma as faces e envia o pedido de inserção.`, ok: 'Aceitar proposta' }))) return;
    try { await api.post(`/portal/propostas/${k.id}/aceitar`); qc.invalidateQueries({ queryKey: ['portal'] }); avisar('Proposta aceita. A equipe comercial foi avisada.'); } catch (x) { avisar((x as Error).message, true); }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-surface)' }}>
      <header style={{ borderBottom: '1px solid var(--c-line)' }}>
        <div className="linha wrap" style={{ maxWidth: 1120, margin: '0 auto', padding: '0 var(--s-300)', minHeight: 64, gap: '12px 32px' }}>
          <div className="linha g-150"><span className="logo-mini" style={{ width: 32, height: 32, borderRadius: 8, fontSize: 12 }}>{iniciais(d.empresa.nome)}</span><span style={{ fontWeight: 600 }}>{d.empresa.nome}</span></div>
          <nav aria-label="Portal" className="linha g-300" style={{ alignSelf: 'stretch' }}>
            {(['campanhas', 'pagamentos'] as Aba[]).map((a) => (
              <button key={a} onClick={() => setAba(a)} aria-current={aba === a ? 'page' : undefined}
                style={{ border: 0, background: 'none', fontWeight: 500, color: aba === a ? 'var(--c-text)' : 'var(--c-text-2)', boxShadow: aba === a ? 'inset 0 -2px 0 var(--c-brand)' : 'none', height: '100%' }}>
                {a === 'campanhas' ? 'Campanhas' : 'Pagamentos'}
              </button>
            ))}
          </nav>
          <span className="t2 linha g-100" style={{ marginLeft: 'auto' }}><span className="esconde-movel">{d.usuario} · {d.clienteNome}</span>
            <button className="icone-btn" aria-label="Sair" title="Sair" onClick={sair}><Icone n="sair" /></button></span>
        </div>
      </header>

      <main className="pilha" style={{ maxWidth: 1120, margin: '0 auto', padding: 'var(--s-500) var(--s-300) 64px', gap: 'var(--s-500)' }}>
        {aba === 'campanhas' && <>
          {noAr ? (
            <section aria-labelledby="h-hero" className="linha wrap entre" style={{ gap: '20px 40px', alignItems: 'flex-end' }}>
              <div className="pilha g-100" style={{ flex: '1 1 460px', minWidth: 0 }}>
                <span style={{ alignSelf: 'flex-start' }}><Badge tom="ok" ponto>{noAr.ini > today() ? `Começa em ${fdate(noAr.ini)}` : `No ar até ${fdate(noAr.fim).slice(0, 5)}`}</Badge></span>
                <h1 id="h-hero" style={{ fontSize: 32, lineHeight: '40px', fontWeight: 600, letterSpacing: '-.2px', textWrap: 'balance' as any }}>{noAr.campanha} está em {noAr.nFaces} {noAr.nFaces === 1 ? 'ponto' : 'pontos'}</h1>
                <p className="t2" style={{ fontSize: 16, lineHeight: '24px', maxWidth: '60ch' }}>Cada foto foi tirada pela equipe no dia da colagem, no local do painel.</p>
              </div>
              <button className="btn btn-sec" onClick={() => abrirArquivo(`/pdf/contratos/${noAr.id}/veiculacao`)}><Icone n="download" />Baixar relatório em PDF</button>
            </section>
          ) : <h1 style={{ fontSize: 32, lineHeight: '40px', fontWeight: 600 }}>Olá, {sessao?.usuario.nome.split(' ')[0]}</h1>}

          {fotos.length > 0 ? (
            <section aria-label="Fotos dos painéis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(232px, 1fr))', gap: 'var(--s-300)' }}>
              {fotos.map((f: any) => (
                <figure key={f.id} className="pilha g-150">
                  <a className="foto" href={urlArquivo(f.arquivoId)} target="_blank" rel="noreferrer"><img src={urlArquivo(f.arquivoId)} alt={`Painel em ${f.endereco}`} loading="lazy" /></a>
                  <figcaption className="pilha g-025">
                    <span style={{ fontWeight: 600 }}>{f.endereco}</span>
                    <span className="sm t2">{[f.bairro, f.cidade].filter(Boolean).join(' · ')} · {fdate(f.data).slice(0, 5)}{f.exif?.dataHora ? `, ${new Date(f.exif.dataHora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
                    {f.verificacao === 'ok' && <span className="sm ok-t linha g-050" style={{ marginTop: 4 }}><Icone n="check" t={14} largura={2.4} />No local · {f.distanciaM} m do ponto</span>}
                  </figcaption>
                </figure>
              ))}
            </section>
          ) : noAr && <p className="t2">As fotos aparecem aqui assim que a equipe terminar a colagem.</p>}

          <div className="duas">
            <section aria-labelledby="h-camp" className="principal pilha g-150">
              <h2 id="h-camp" className="h-sec">Suas campanhas</h2>
              <ul className="card lista">
                {d.campanhas.length ? d.campanhas.map((k: any) => (
                  <li key={k.id} className="li entre" style={{ minHeight: 64 }}>
                    <div className="pilha"><span style={{ fontWeight: 600 }}>{k.campanha}</span><span className="sm t2">{k.nFaces || 0} {k.nFaces === 1 ? 'painel' : 'painéis'}{k.ini ? ` · ${fdate(k.ini).slice(0, 5)} a ${fdate(k.fim)}` : ''}</span></div>
                    <div className="linha g-150">
                      {situacao(k)}
                      {['proposta', 'aprovada'].includes(k.status) && <button className="btn btn-sec btn-sm" onClick={() => abrirArquivo(`/pdf/contratos/${k.id}/proposta`)}>Ver proposta</button>}
                      {['proposta', 'aprovada'].includes(k.status) && !k.aceitoEm && <button className="btn btn-pri btn-sm" onClick={() => aceitar(k)}>Aceitar</button>}
                    </div>
                  </li>
                )) : <Vazio titulo="Nenhuma campanha ainda" />}
              </ul>
            </section>
            {proximo && (
              <aside aria-labelledby="h-pag" className="lateral card pp pilha g-050">
                <h2 id="h-pag" className="t2" style={{ fontSize: 14, fontWeight: 400 }}>Próximo pagamento</h2>
                <span className="num">{money(proximo.valor).replace(/,00$/, '')}</span>
                <span className={`sm ${proximo.vencimento < today() ? 'bad-t' : 't2'}`}>Parcela {parcela(proximo)} · {proximo.vencimento < today() ? 'venceu' : 'vence'} {fdate(proximo.vencimento)}</span>
                {d.temPix && <button className="btn btn-pri" style={{ width: '100%', marginTop: 16 }} onClick={() => setPix(proximo)}>Pagar com PIX</button>}
              </aside>
            )}
          </div>
        </>}

        {aba === 'pagamentos' && (
          <section className="pilha g-150">
            <h1 className="h-big">Pagamentos</h1>
            <div className="card tabela-wrap">
              {d.pagamentos.length ? (
                <table className="tabela">
                  <thead><tr><th>Vencimento</th><th>Parcela</th><th className="dir">Valor</th><th>Situação</th><th /></tr></thead>
                  <tbody>{d.pagamentos.map((p: any) => (
                    <tr key={p.id}>
                      <td>{fdate(p.vencimento)}</td><td>{p.descricao}</td><td className="dir mono">{money(p.valor)}</td>
                      <td>{p.status === 'pago' ? <Badge tom="ok">Pago em {fdate(p.pagoEm)}</Badge> : p.vencimento < today() ? <Badge tom="bad">Vencido</Badge> : <Badge tom="info">A vencer</Badge>}</td>
                      <td className="dir">{p.status === 'aberto' && d.temPix ? <button className="btn btn-sec btn-sm" onClick={() => setPix(p)}><Icone n="pix" />PIX</button> : p.nfLink ? <a className="btn btn-txt btn-sm" href={p.nfLink} target="_blank" rel="noreferrer">Nota {p.nfNumero}</a> : p.nfNumero ? <span className="sm t2">Nota {p.nfNumero}</span> : null}</td>
                    </tr>
                  ))}</tbody>
                </table>
              ) : <Vazio titulo="Nenhum pagamento" />}
            </div>
          </section>
        )}

        <p className="t2" style={{ paddingTop: 'var(--s-300)', borderTop: '1px solid var(--c-line)' }}>
          Dúvidas? Fale com {d.contato || d.empresa.nome}{d.empresa.telefone ? <> · <span className="mono">{d.empresa.telefone}</span></> : null}
        </p>
      </main>
      {pix && <Pix lancamento={pix} url={`/portal/pix/${pix.id}`} fechar={() => setPix(null)} />}
    </div>
  );
}
