import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { daysIncl, fdate, money, TIPO_LBL, TIPOS_PAINEL, today } from '@shared';
import { api, urlArquivo } from '../api';
import { useSessao } from '../sessao';
import { Abas, Badge, Cabecalho, Campo, Carregando, Dialogo, ErroCaixa, useAvisos, Vazio } from '../ui/base';
import { FormGaveta, type DefCampo } from '../ui/formulario';
import { Icone } from '../ui/icones';
import { EscolherPonto } from '../ui/Mapa';

const camposEstrutura: DefCampo[] = [
  { k: 'codigo', rotulo: 'Código do ponto', obrig: true, ajuda: 'Ex.: E-009' },
  { k: 'cidade', rotulo: 'Cidade', obrig: true },
  { k: 'endereco', rotulo: 'Endereço', obrig: true, largo: true },
  { k: 'bairro', rotulo: 'Bairro' },
  { k: 'uf', rotulo: 'UF' },
  { k: 'lat', rotulo: 'Latitude', tipo: 'numero', ajuda: 'Usada para conferir as fotos no local.' },
  { k: 'lng', rotulo: 'Longitude', tipo: 'numero' },
  { k: 's1', rotulo: 'Licença da prefeitura', tipo: 'secao' },
  { k: 'licNumero', rotulo: 'Número' },
  { k: 'licOrgao', rotulo: 'Órgão' },
  { k: 'licTaxa', rotulo: 'Taxa anual (R$)', tipo: 'dinheiro' },
  { k: 'licVencimento', rotulo: 'Vencimento', tipo: 'data' },
  { k: 's2', rotulo: 'Locação do terreno', tipo: 'secao' },
  { k: 'locProprietario', rotulo: 'Proprietário' },
  { k: 'locContato', rotulo: 'Contato', tipo: 'tel' },
  { k: 'locValor', rotulo: 'Aluguel mensal (R$)', tipo: 'dinheiro', ajuda: 'Vira despesa recorrente automaticamente.' },
  { k: 'locDia', rotulo: 'Dia do pagamento', tipo: 'numero' },
  { k: 'locIndice', rotulo: 'Índice de reajuste', tipo: 'select', opcoes: [['IGP-M', 'IGP-M'], ['IPCA', 'IPCA'], ['INPC', 'INPC'], ['Fixo', 'Fixo']] },
  { k: 'locReajuste', rotulo: 'Próximo reajuste', tipo: 'data' },
  { k: 'locVencimento', rotulo: 'Fim do contrato de locação', tipo: 'data' },
  { k: 'obs', rotulo: 'Observações', tipo: 'area', largo: true },
];

export default function Paineis() {
  const { edita, sessao } = useSessao();
  const admin = sessao?.perfil === 'admin';
  const [params, setParams] = useSearchParams();
  const [aba, setAba] = useState<'faces' | 'pontos'>(params.get('estrutura') ? 'pontos' : 'faces');
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [reajuste, setReajuste] = useState(false);
  const faces = useQuery({ queryKey: ['paineis'], queryFn: () => api.get<any[]>('/paineis') });
  const estruturas = useQuery({ queryKey: ['estruturas'], queryFn: () => api.get<any[]>('/estruturas') });
  const [formFace, setFormFace] = useState<any>(null);
  const [formEst, setFormEst] = useState<any>(null);

  const faceParam = params.get('face');
  const estParam = params.get('estrutura');
  const faceAberta = formFace || (faceParam && faces.data?.find((f) => f.id === faceParam));
  const estAberta = formEst || (estParam && estruturas.data?.find((e) => e.id === estParam));
  const fecharTudo = () => { setFormFace(null); setFormEst(null); setParams({}); };

  const filtra = (s: string) => !busca || s.toLowerCase().includes(busca.toLowerCase());
  const lf = useMemo(() => (faces.data || []).filter((f) => filtra(`${f.codigo} ${f.endereco} ${f.cidade} ${TIPO_LBL[f.tipo]}`)), [faces.data, busca]);
  const le = useMemo(() => (estruturas.data || []).filter((e) => filtra(`${e.codigo} ${e.endereco} ${e.cidade}`)), [estruturas.data, busca]);

  const camposFace: DefCampo[] = [
    { k: 'codigo', rotulo: 'Código da face', obrig: true, ajuda: 'Ex.: P-010-A' },
    { k: 'estruturaId', rotulo: 'Ponto (estrutura)', tipo: 'select', obrig: true, opcoes: (estruturas.data || []).map((e) => [e.id, `${e.codigo} · ${e.endereco}`]) },
    { k: 'tipo', rotulo: 'Formato', tipo: 'select', obrig: true, opcoes: TIPOS_PAINEL.map(([a, b]) => [a, b]) },
    { k: 'face', rotulo: 'Lado', ajuda: 'Única, A, B…' },
    { k: 'sentido', rotulo: 'Sentido / visibilidade', largo: true },
    { k: 'largura', rotulo: 'Largura (m)', tipo: 'numero' },
    { k: 'altura', rotulo: 'Altura (m)', tipo: 'numero' },
    { k: 'valorBi', rotulo: 'Preço por bissemana (R$)', tipo: 'dinheiro', obrig: true, desabilitado: !admin },
    { k: 'status', rotulo: 'Situação', tipo: 'select', obrig: true, opcoes: [['ativo', 'À venda'], ['inativo', 'Fora de venda']] },
    { k: 'iluminado', rotulo: 'Iluminado', tipo: 'bool' },
    { k: 'slots', rotulo: 'Cotas no loop', tipo: 'numero', se: (v) => v.tipo === 'led' },
    { k: 'insercaoSeg', rotulo: 'Duração da inserção (s)', tipo: 'numero', se: (v) => v.tipo === 'led' },
    { k: 'loopSeg', rotulo: 'Duração do loop (s)', tipo: 'numero', se: (v) => v.tipo === 'led' },
    { k: 'horasDia', rotulo: 'Horas ligado por dia', tipo: 'numero', se: (v) => v.tipo === 'led' },
    { k: 'obs', rotulo: 'Observações', tipo: 'area', largo: true },
  ];

  const licenca = (e: any) => {
    if (!e.licVencimento) return <Badge tom="neu">Sem licença</Badge>;
    const d = daysIncl(today(), e.licVencimento) - 1;
    if (d < 0) return <Badge tom="bad">Licença vencida</Badge>;
    if (d <= 60) return <Badge tom="warn">Licença vence em {d}d</Badge>;
    return <Badge tom="ok">Licença até {fdate(e.licVencimento)}</Badge>;
  };

  return (
    <>
      <Cabecalho titulo="Painéis" sub={`${faces.data?.length ?? '…'} faces em ${estruturas.data?.length ?? '…'} pontos`} acoes={<>
        {admin && sel.size > 0 && <button className="btn btn-sec" onClick={() => setReajuste(true)}>Reajustar {sel.size} preço(s)</button>}
        {admin && aba === 'pontos' && <button className="btn btn-pri" onClick={() => setFormEst({ uf: 'SP' })}><Icone n="mais" />Novo ponto</button>}
        {admin && aba === 'faces' && <button className="btn btn-pri" onClick={() => setFormFace({ tipo: 'outdoor', status: 'ativo', face: 'Única', slots: 1 })}><Icone n="mais" />Nova face</button>}
      </>} />
      <Abas valor={aba} onChange={setAba} opcoes={[['faces', 'Faces'], ['pontos', 'Pontos e licenças']]} />
      <div className="miolo">
        <label className="busca" style={{ maxWidth: 360 }}><Icone n="busca" /><input placeholder="Buscar por código, endereço ou cidade" value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
        {faces.isLoading || estruturas.isLoading ? <Carregando /> : aba === 'faces' ? (
          <div className="card tabela-wrap">
            {lf.length ? (
              <table className="tabela">
                <thead><tr>{admin && <th style={{ width: 40 }}><input type="checkbox" aria-label="Selecionar todas" checked={sel.size === lf.length} onChange={(e) => setSel(e.target.checked ? new Set(lf.map((f) => f.id)) : new Set())} /></th>}<th>Face</th><th>Local</th><th className="esconde-movel">Formato</th><th className="dir">Preço/BI</th><th>Situação</th></tr></thead>
                <tbody>
                  {lf.map((f) => (
                    <tr key={f.id} className="clicavel" onClick={() => setFormFace(f)}>
                      {admin && <td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Selecionar ${f.codigo}`} checked={sel.has(f.id)} onChange={() => { const s = new Set(sel); s.has(f.id) ? s.delete(f.id) : s.add(f.id); setSel(s); }} /></td>}
                      <td><span className="mono" style={{ fontWeight: 500 }}>{f.codigo}</span><div className="sm t3">{f.estruturaCodigo}</div></td>
                      <td className="xs">{f.endereco}<div className="sm t3">{f.cidade}{f.sentido ? ` · ${f.sentido}` : ''}</div></td>
                      <td className="esconde-movel xs">{TIPO_LBL[f.tipo]}{f.tipo === 'led' ? ` · ${f.slots} cotas` : ''}{f.largura ? <div className="sm t3">{f.largura}×{f.altura} m{f.iluminado ? ' · iluminado' : ''}</div> : null}</td>
                      <td className="dir mono">{money(f.valorBi)}</td>
                      <td>{f.status === 'ativo' ? <Badge tom="ok">À venda</Badge> : <Badge tom="neu">Fora de venda</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <Vazio titulo="Nenhuma face" texto="Cadastre primeiro o ponto (estrutura) e depois as faces dele. Ou importe uma planilha em Configurações." />}
          </div>
        ) : (
          <div className="card tabela-wrap">
            {le.length ? (
              <table className="tabela">
                <thead><tr><th>Ponto</th><th>Endereço</th><th className="dir esconde-movel">Faces</th><th>Licença</th>{admin && <th className="esconde-movel">Locação</th>}</tr></thead>
                <tbody>
                  {le.map((e) => (
                    <tr key={e.id} className="clicavel" onClick={() => setFormEst(e)}>
                      <td className="mono" style={{ fontWeight: 500 }}>{e.codigo}</td>
                      <td className="xs">{e.endereco}<div className="sm t3">{[e.bairro, e.cidade].filter(Boolean).join(' · ')}</div></td>
                      <td className="dir mono esconde-movel">{e.nFaces}</td>
                      <td>{licenca(e)}</td>
                      {admin && <td className="esconde-movel xs">{e.locValor ? <>{money(e.locValor)}/mês<div className="sm t3">{e.locProprietario}</div></> : <span className="t3">Próprio</span>}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <Vazio titulo="Nenhum ponto cadastrado" />}
          </div>
        )}
      </div>
      {faceAberta && <FormGaveta titulo={faceAberta.id ? `Face ${faceAberta.codigo}` : 'Nova face'} rota="/paineis" registro={faceAberta.id ? faceAberta : null} padrao={faceAberta}
        campos={camposFace} fechar={fecharTudo} invalidar={['estruturas', 'agenda']} podeExcluir={admin} somenteLeitura={!edita('paineis')} />}
      {estAberta && <FormGaveta titulo={estAberta.id ? `Ponto ${estAberta.codigo}` : 'Novo ponto'} rota="/estruturas" registro={estAberta.id ? estAberta : null} padrao={estAberta}
        campos={admin ? camposEstrutura : camposEstrutura.filter((c) => !c.k.startsWith('loc') && c.k !== 's2')} fechar={fecharTudo} invalidar={['paineis', 'recorrencias']} podeExcluir={admin} somenteLeitura={!edita('estruturas')}
        extra={(v, mudar) => <>
          <EscolherPonto lat={v.lat} lng={v.lng} endereco={[v.endereco, v.bairro, v.cidade, v.uf].filter(Boolean).join(', ')} mudar={(la, lo) => { mudar('lat', la); mudar('lng', lo); }} />
          {estAberta.id && <FotosPonto e={estAberta} />}
        </>} />}
      {reajuste && <Reajuste ids={[...sel]} fechar={() => setReajuste(false)} aoFim={() => setSel(new Set())} />}
    </>
  );
}

function FotosPonto({ e }: { e: any }) {
  const { edita } = useSessao();
  const qc = useQueryClient();
  const { avisar } = useAvisos();
  const [enviando, setEnviando] = useState(false);
  const enviar = async (f?: File) => {
    if (!f) return;
    setEnviando(true);
    try { await api.enviar(`/campo/estruturas/${e.id}/fotos`, { arquivo: f }); qc.invalidateQueries({ queryKey: ['estruturas'] }); avisar('Foto do ponto adicionada.'); }
    catch (x) { avisar((x as Error).message, true); } finally { setEnviando(false); }
  };
  return (
    <div className="pilha g-100">
      <span className="h-card">Fotos do ponto</span>
      <div className="fotos" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
        {(e.fotos || []).map((f: any) => <a key={f.id} className="foto" href={urlArquivo(f.arquivoId)} target="_blank" rel="noreferrer"><img src={urlArquivo(f.arquivoId)} alt={`Ponto ${e.codigo}`} loading="lazy" /></a>)}
      </div>
      {edita('fotosPonto') && <label className="btn btn-sec btn-sm" style={{ alignSelf: 'flex-start' }}><Icone n="upload" />{enviando ? 'Enviando…' : 'Adicionar foto'}<input type="file" accept="image/*" hidden onChange={(x) => enviar(x.target.files?.[0])} /></label>}
    </div>
  );
}

function Reajuste({ ids, fechar, aoFim }: { ids: string[]; fechar: () => void; aoFim: () => void }) {
  const qc = useQueryClient();
  const { avisar } = useAvisos();
  const [pct, setPct] = useState(10);
  const [arr, setArr] = useState(10);
  const [erro, setErro] = useState<unknown>(null);
  const ir = async () => {
    try { const r = await api.post('/paineis/reajuste', { ids, pct, arredondar: arr }); qc.invalidateQueries({ queryKey: ['paineis'] }); avisar(`${r.n} preço(s) reajustado(s).`); aoFim(); fechar(); } catch (x) { setErro(x); }
  };
  return (
    <Dialogo titulo={`Reajustar ${ids.length} preço(s)`} fechar={fechar} rodape={<><button className="btn btn-sec" onClick={fechar}>Cancelar</button><button className="btn btn-pri" onClick={ir}>Aplicar</button></>}>
      <ErroCaixa erro={erro} />
      <div className="form">
        <Campo rotulo="Percentual (%)" ajuda="Negativo para reduzir."><input className="entrada" type="number" value={pct} onChange={(e) => setPct(Number(e.target.value))} /></Campo>
        <Campo rotulo="Arredondar para (R$)"><select className="entrada" value={arr} onChange={(e) => setArr(Number(e.target.value))}><option value={1}>R$ 1</option><option value={10}>R$ 10</option><option value={50}>R$ 50</option><option value={100}>R$ 100</option></select></Campo>
      </div>
      <p className="sm t2">Contratos já fechados não mudam. O novo preço vale para as próximas propostas.</p>
    </Dialogo>
  );
}
