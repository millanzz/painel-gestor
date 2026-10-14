import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDays, CONTRATO_ST, fdate, money, today } from '@shared';
import { api } from '../api';
import { useSessao } from '../sessao';
import { Abas, Cabecalho, Carregando, Etiqueta, Vazio } from '../ui/base';
import { FormGaveta } from '../ui/formulario';
import { Icone } from '../ui/icones';

type Filtro = 'abertas' | 'ativos' | 'encerrados' | 'todos';
const GRUPOS: Record<Filtro, string[]> = {
  abertas: ['proposta', 'aprovacao', 'aprovada'], ativos: ['ativo'], encerrados: ['encerrado', 'cancelado'], todos: [],
};

export default function Contratos() {
  const { edita } = useSessao();
  const nav = useNavigate();
  const [filtro, setFiltro] = useState<Filtro>('abertas');
  const [busca, setBusca] = useState('');
  const [novo, setNovo] = useState(false);
  const q = useQuery({ queryKey: ['contratos'], queryFn: () => api.get<any[]>('/contratos') });
  const clientes = useQuery({ queryKey: ['clientes'], queryFn: () => api.get<any[]>('/clientes'), enabled: novo });
  const todos = q.data || [];
  const lista = useMemo(() => todos.filter((k) =>
    (!GRUPOS[filtro].length || GRUPOS[filtro].includes(k.status)) &&
    (!busca || `${k.numero} ${k.campanha} ${k.clienteNome} ${k.piNumero || ''}`.toLowerCase().includes(busca.toLowerCase()))), [todos, filtro, busca]);
  const conta = (f: Filtro) => todos.filter((k) => GRUPOS[f].includes(k.status)).length;

  return (
    <>
      <Cabecalho titulo="Vendas" sub="Propostas, contratos e PIs" acoes={edita('contratos') && <button className="btn btn-pri" onClick={() => setNovo(true)}><Icone n="mais" />Nova proposta</button>} />
      <Abas valor={filtro} onChange={setFiltro} opcoes={[['abertas', 'Em negociação', conta('abertas')], ['ativos', 'Ativos', conta('ativos')], ['encerrados', 'Encerrados'], ['todos', 'Todos']]} />
      <div className="miolo">
        <label className="busca" style={{ maxWidth: 360 }}><Icone n="busca" /><input placeholder="Buscar por número, campanha ou cliente" value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
        {q.isLoading ? <Carregando /> : (
          <div className="card tabela-wrap">
            {lista.length ? (
              <table className="tabela">
                <thead><tr><th>Contrato</th><th>Cliente</th><th className="esconde-movel">Período</th><th className="dir esconde-movel">Faces</th><th className="dir">Valor</th><th>Situação</th></tr></thead>
                <tbody>
                  {lista.map((k) => {
                    const vencida = k.status === 'proposta' && k.validadeProposta && k.validadeProposta < today();
                    return (
                      <tr key={k.id} className="clicavel" onClick={() => nav(`/contratos/${k.id}`)}>
                        <td><span className="mono" style={{ fontWeight: 500 }}>{k.numero}</span><div className="sm t3 trunc" style={{ maxWidth: 260 }}>{k.campanha}</div></td>
                        <td>{k.clienteNome}{k.agenciaNome && <div className="sm t3">via {k.agenciaNome}</div>}</td>
                        <td className="esconde-movel">{k.ini ? `${fdate(k.ini)} a ${fdate(k.fim)}` : <span className="t3">sem faces</span>}</td>
                        <td className="dir mono esconde-movel">{k.nFaces || 0}</td>
                        <td className="dir mono">{money(k.valor)}</td>
                        <td>{vencida ? <span className="badge b-warn">Proposta vencida</span> : <Etiqueta par={CONTRATO_ST[k.status]} />}{k.aceitoEm && ['proposta', 'aprovada'].includes(k.status) ? <div className="sm ok-t">cliente aceitou</div> : null}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : <Vazio titulo="Nenhum contrato aqui" texto={filtro === 'abertas' ? 'Reserve faces na agenda para começar uma proposta.' : undefined} />}
          </div>
        )}
      </div>
      {novo && (
        <FormGaveta titulo="Nova proposta" rota="/contratos" fechar={() => setNovo(false)} aoSalvar={(k) => nav(`/contratos/${k.id}`)}
          padrao={{ validadeProposta: addDays(today(), 10) }}
          campos={[
            { k: 'clienteId', rotulo: 'Anunciante', tipo: 'select', obrig: true, largo: true, opcoes: (clientes.data || []).filter((c) => c.tipo === 'anunciante').map((c) => [c.id, c.nome]) },
            { k: 'campanha', rotulo: 'Campanha', obrig: true, largo: true },
            { k: 'agenciaId', rotulo: 'Agência', tipo: 'select', opcoes: (clientes.data || []).filter((c) => c.tipo === 'agencia').map((c) => [c.id, `${c.nome} (${c.comissao}%)`]) },
            { k: 'validadeProposta', rotulo: 'Proposta válida até', tipo: 'data' },
            { k: 'condicoes', rotulo: 'Condições de pagamento', tipo: 'area', largo: true },
          ]}
          extra={<p className="sm t2">Depois de criar, adicione as faces. O valor sugerido vem da tabela com o desconto por volume.</p>}
        />
      )}
    </>
  );
}
