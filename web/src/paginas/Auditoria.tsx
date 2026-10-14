import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, qs } from '../api';
import { Abas, Cabecalho, Carregando, useAvisos, Vazio } from '../ui/base';
import { Icone } from '../ui/icones';

const TABELAS: [string, string][] = [['', 'Tudo'], ['contratos', 'Contratos'], ['reservas', 'Reservas'], ['lancamentos', 'Financeiro'], ['paineis', 'Faces'], ['estruturas', 'Pontos'], ['clientes', 'Clientes'], ['ordens_servico', 'Campo'], ['membros', 'Usuários'], ['config', 'Configurações']];

export default function Auditoria() {
  const [aba, setAba] = useState<'log' | 'lixeira'>('log');
  return (
    <>
      <Cabecalho titulo="Auditoria" sub="Quem fez o quê, e o que foi excluído" />
      <Abas valor={aba} onChange={setAba} opcoes={[['log', 'Histórico'], ['lixeira', 'Lixeira']]} />
      {aba === 'log' ? <Historico /> : <Lixeira />}
    </>
  );
}

function Historico() {
  const [tabela, setTabela] = useState('');
  const [busca, setBusca] = useState('');
  const q = useQuery({ queryKey: ['auditoria', tabela, busca], queryFn: () => api.get<any[]>(`/auditoria${qs({ tabela, q: busca })}`) });
  return (
    <div className="miolo">
      <div className="linha wrap g-150">
        <label className="busca" style={{ width: 300 }}><Icone n="busca" /><input placeholder="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
        <select className="entrada" style={{ width: 200, height: 32 }} value={tabela} onChange={(e) => setTabela(e.target.value)} aria-label="Área">{TABELAS.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select>
      </div>
      {q.isLoading ? <Carregando /> : (
        <div className="card tabela-wrap">
          {(q.data || []).length ? (
            <table className="tabela">
              <thead><tr><th>Quando</th><th>Quem</th><th>O quê</th></tr></thead>
              <tbody>{q.data!.map((a) => (
                <tr key={a.id}>
                  <td className="xs" style={{ whiteSpace: 'nowrap' }}>{new Date(a.quando).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td className="xs">{a.autorNome}<div className="sm t3">{a.perfil}</div></td>
                  <td className="xs"><b style={{ fontWeight: 500 }}>{a.acao}</b> · {a.rotulo}{a.mudancas?.length ? <div className="sm t2">{a.mudancas.join(' · ')}</div> : null}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : <Vazio titulo="Nada registrado com esse filtro" />}
        </div>
      )}
    </div>
  );
}

function Lixeira() {
  const qc = useQueryClient();
  const { avisar } = useAvisos();
  const q = useQuery({ queryKey: ['lixeira'], queryFn: () => api.get<any[]>('/auditoria/lixeira') });
  const restaurar = async (x: any) => {
    try { await api.post(`/${x.rota}/${x.id}/restaurar`); qc.invalidateQueries(); avisar(`${x.tipo} restaurado.`); } catch (e) { avisar((e as Error).message, true); }
  };
  if (q.isLoading) return <Carregando />;
  return (
    <div className="miolo">
      <div className="card tabela-wrap">
        {(q.data || []).length ? (
          <table className="tabela">
            <thead><tr><th>Item</th><th>Excluído</th><th /></tr></thead>
            <tbody>{q.data!.map((x) => (
              <tr key={x.rota + x.id}>
                <td><span className="badge b-neu">{x.tipo}</span> {x.rotulo}</td>
                <td className="xs">{new Date(x.excluidoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}<div className="sm t3">{x.excluidoPor}</div></td>
                <td className="dir"><button className="btn btn-sec btn-sm" onClick={() => restaurar(x)}><Icone n="restaurar" />Restaurar</button></td>
              </tr>
            ))}</tbody>
          </table>
        ) : <Vazio titulo="Lixeira vazia" />}
      </div>
    </div>
  );
}
