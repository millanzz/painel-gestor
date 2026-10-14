import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ARTE_LBL, ARTE_ST, daysIncl, fdate, today } from '@shared';
import { api, urlArquivo } from '../api';
import { useSessao } from '../sessao';
import { Badge, Cabecalho, Carregando, Seg, useAvisos, Vazio } from '../ui/base';
import { FormGaveta } from '../ui/formulario';
import { Icone } from '../ui/icones';

export default function Artes() {
  const { edita } = useSessao();
  const [sit, setSit] = useState<'abertas' | 'todas'>('abertas');
  const [aberta, setAberta] = useState<any>(null);
  const q = useQuery({ queryKey: ['artes', sit], queryFn: () => api.get<any[]>(`/artes${sit === 'abertas' ? '?situacao=abertas' : ''}`) });
  const situacao = (a: any) => {
    if (a.status === 'recebido') return <Badge tom="ok">Material recebido</Badge>;
    if (a.ini && a.ini <= today()) return <Badge tom="bad">Colagem já começou</Badge>;
    if (a.prazo && a.prazo < today()) return <Badge tom="bad">Prazo vencido</Badge>;
    if (a.ini && daysIncl(today(), a.ini) <= 4) return <Badge tom="warn">Colagem em {daysIncl(today(), a.ini) - 1}d</Badge>;
    return <Badge tom="info">{ARTE_LBL[a.status]}</Badge>;
  };
  return (
    <>
      <Cabecalho titulo="Material" sub="Arte, gráfica e entrega do material de cada campanha" />
      <div className="miolo">
        <Seg rotulo="Situação" valor={sit} onChange={setSit} opcoes={[['abertas', 'Pendentes'], ['todas', 'Todas']]} />
        {q.isLoading ? <Carregando /> : (
          <div className="card tabela-wrap">
            {(q.data || []).length ? (
              <table className="tabela">
                <thead><tr><th>Campanha</th><th className="esconde-movel">Material</th><th>Entregar até</th><th className="esconde-movel">Colagem</th><th>Situação</th></tr></thead>
                <tbody>{q.data!.map((a) => (
                  <tr key={a.id} className="clicavel" onClick={() => setAberta(a)}>
                    <td><span style={{ fontWeight: 500 }}>{a.campanha}</span><div className="sm t3"><span className="mono" style={{ fontSize: 12 }}>{a.contratoNumero}</span> · {a.clienteNome}</div></td>
                    <td className="esconde-movel xs">{a.necessario}{a.grafica && <div className="sm t3">{a.grafica}{a.previsao ? ` · previsão ${fdate(a.previsao)}` : ''}</div>}</td>
                    <td>{fdate(a.prazo)}</td>
                    <td className="esconde-movel">{fdate(a.ini)}</td>
                    <td>{situacao(a)}</td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <Vazio titulo="Nenhum material pendente" texto="O acompanhamento é criado quando uma proposta é aprovada." />}
          </div>
        )}
      </div>
      {aberta && (
        <FormGaveta titulo={`Material · ${aberta.campanha}`} rota="/artes" registro={aberta} fechar={() => setAberta(null)} somenteLeitura={!edita('artes')} invalidar={['inicio', 'contrato']}
          campos={[
            { k: 'status', rotulo: 'Etapa', tipo: 'select', obrig: true, opcoes: ARTE_ST.map(([a, b]) => [a, b]), largo: true },
            { k: 'necessario', rotulo: 'Material necessário', largo: true },
            { k: 'prazo', rotulo: 'Entregar até', tipo: 'data' },
            { k: 'grafica', rotulo: 'Gráfica' },
            { k: 'previsao', rotulo: 'Previsão da gráfica', tipo: 'data' },
            { k: 'recebidoEm', rotulo: 'Recebido em', tipo: 'data' },
            { k: 'recebido', rotulo: 'O que chegou', largo: true, ajuda: 'Ex.: 70 folhas, 1 lona, vídeo de 10 s' },
            { k: 'obs', rotulo: 'Observações', tipo: 'area', largo: true },
          ]}
          extra={<ArquivoArte a={aberta} />} />
      )}
    </>
  );
}

function ArquivoArte({ a }: { a: any }) {
  const { edita } = useSessao();
  const qc = useQueryClient();
  const { avisar } = useAvisos();
  const [id, setId] = useState<string | null>(a.arquivoId);
  const enviar = async (f?: File) => {
    if (!f) return;
    try { const r = await api.enviar(`/artes/${a.id}/arquivo`, { arquivo: f }); setId(r.arquivoId); qc.invalidateQueries({ queryKey: ['artes'] }); avisar('Arte anexada.'); }
    catch (x) { avisar((x as Error).message, true); }
  };
  return (
    <div className="pilha g-100">
      <div className="linha entre"><span className="h-card">Arte</span><Link to={`/contratos/${a.contratoId}`} className="xs">Abrir contrato</Link></div>
      {id ? <a className="foto" href={urlArquivo(id)} target="_blank" rel="noreferrer" style={{ aspectRatio: '3 / 1' }}><img src={urlArquivo(id)} alt="Arte da campanha" /></a> : <p className="xs t2">Nenhuma arte anexada.</p>}
      {edita('artes') && <label className="btn btn-sec btn-sm" style={{ alignSelf: 'flex-start' }}><Icone n="upload" />{id ? 'Trocar arte' : 'Anexar arte (JPG ou PNG)'}<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => enviar(e.target.files?.[0])} /></label>}
    </div>
  );
}
