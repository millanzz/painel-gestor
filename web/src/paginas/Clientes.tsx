import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CONTRATO_ST, fdate, linkWhatsApp, money } from '@shared';
import { api } from '../api';
import { useSessao } from '../sessao';
import { Badge, Cabecalho, Carregando, Etiqueta, Gaveta, Seg, useAvisos, Vazio } from '../ui/base';
import { FormGaveta, type DefCampo } from '../ui/formulario';
import { Icone } from '../ui/icones';

export const camposCliente: DefCampo[] = [
  { k: 'nome', rotulo: 'Nome / razão social', obrig: true, largo: true },
  { k: 'tipo', rotulo: 'Tipo', tipo: 'select', obrig: true, opcoes: [['anunciante', 'Anunciante'], ['agencia', 'Agência']] },
  { k: 'documento', rotulo: 'CNPJ ou CPF' },
  { k: 'contato', rotulo: 'Pessoa de contato' },
  { k: 'telefone', rotulo: 'Telefone / WhatsApp', tipo: 'tel' },
  { k: 'email', rotulo: 'E-mail', tipo: 'email' },
  { k: 'cidade', rotulo: 'Cidade' },
  { k: 'comissao', rotulo: 'Comissão da agência (%)', tipo: 'numero', se: (v) => v.tipo === 'agencia', ajuda: 'Descontada do valor do contrato e lançada como despesa quando a parcela é paga.' },
  { k: 'obs', rotulo: 'Observações', tipo: 'area', largo: true },
];

export default function Clientes() {
  const { edita, empresa } = useSessao();
  const [params, setParams] = useSearchParams();
  const [tipo, setTipo] = useState<'todos' | 'anunciante' | 'agencia'>('todos');
  const [busca, setBusca] = useState('');
  const [form, setForm] = useState<any>(null);
  const q = useQuery({ queryKey: ['clientes'], queryFn: () => api.get<any[]>('/clientes') });
  const aberto = params.get('id');
  const lista = useMemo(() => (q.data || []).filter((c) => (tipo === 'todos' || c.tipo === tipo) &&
    (!busca || `${c.nome} ${c.documento} ${c.contato} ${c.cidade}`.toLowerCase().includes(busca.toLowerCase()))), [q.data, tipo, busca]);
  const bloqueio = empresa?.config.bloqueioDias ?? 15;

  return (
    <>
      <Cabecalho titulo="Clientes" sub="Anunciantes e agências" acoes={edita('clientes') && <button className="btn btn-pri" onClick={() => setForm({ tipo: 'anunciante' })}><Icone n="mais" />Novo cliente</button>} />
      <div className="miolo">
        <div className="linha wrap g-150">
          <label className="busca" style={{ width: 320, maxWidth: '100%' }}><Icone n="busca" /><input placeholder="Buscar por nome, documento ou contato" value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
          <Seg rotulo="Tipo" valor={tipo} onChange={setTipo} opcoes={[['todos', 'Todos'], ['anunciante', 'Anunciantes'], ['agencia', 'Agências']]} />
        </div>
        {q.isLoading ? <Carregando /> : (
          <div className="card tabela-wrap">
            {lista.length ? (
              <table className="tabela">
                <thead><tr><th>Cliente</th><th className="esconde-movel">Contato</th><th className="dir esconde-movel">Contratos</th><th>Pagamentos</th></tr></thead>
                <tbody>
                  {lista.map((c) => (
                    <tr key={c.id} className="clicavel" onClick={() => setParams({ id: c.id })}>
                      <td><span style={{ fontWeight: 500 }}>{c.nome}</span><div className="sm t3">{c.tipo === 'agencia' ? `Agência · ${c.comissao}%` : 'Anunciante'}{c.cidade ? ` · ${c.cidade}` : ''}</div></td>
                      <td className="esconde-movel xs">{c.contato || '—'}<div className="sm t3">{c.telefone}</div></td>
                      <td className="dir mono esconde-movel">{c.nContratos}</td>
                      <td>{c.atrasado > 0 ? <Badge tom={c.diasAtraso >= bloqueio ? 'bad' : 'warn'}>{money(c.atrasado)} · {c.diasAtraso}d{c.diasAtraso >= bloqueio ? ' · bloqueado' : ''}</Badge> : <Badge tom="ok">Em dia</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <Vazio titulo="Nenhum cliente" texto="Cadastre anunciantes e agências para montar propostas." />}
          </div>
        )}
      </div>
      {aberto && <DetalheCliente id={aberto} fechar={() => setParams({})} editar={(c) => { setParams({}); setForm(c); }} />}
      {form && <FormGaveta titulo={form.id ? 'Editar cliente' : 'Novo cliente'} rota="/clientes" registro={form.id ? form : null} padrao={form} campos={camposCliente} fechar={() => setForm(null)} podeExcluir={edita('clientes')} />}
    </>
  );
}

function DetalheCliente({ id, fechar, editar }: { id: string; fechar: () => void; editar: (c: any) => void }) {
  const { edita, sessao, vê } = useSessao();
  const qc = useQueryClient();
  const { avisar, confirmar } = useAvisos();
  const c = useQuery({ queryKey: ['clientes', id], queryFn: () => api.get(`/clientes/${id}`) });
  const ks = useQuery({ queryKey: ['contratos', 'cliente', id], queryFn: () => api.get<any[]>(`/contratos?cliente=${id}`), enabled: vê('contratos') });
  const [convite, setConvite] = useState<string | null>(null);
  useEffect(() => setConvite(null), [id]);
  if (!c.data) return null;
  const x = c.data;
  const convidar = async () => {
    try {
      const m = await api.post('/membros', { nome: x.contato || x.nome, email: x.email, perfil: 'cliente', clienteId: x.id });
      setConvite(m.convite);
      qc.invalidateQueries({ queryKey: ['membros'] });
    } catch (e) { avisar((e as Error).message, true); }
  };
  return (
    <Gaveta titulo={x.nome} fechar={fechar} rodape={edita('clientes') && (
      <div className="linha entre g-100">
        {sessao?.perfil === 'admin' ? <button className="btn btn-txt" style={{ color: 'var(--c-bad)' }} onClick={async () => {
          if (await confirmar({ titulo: 'Remover dados pessoais?', texto: 'Nome, documento, contato, e-mail e telefone são apagados (LGPD). Contratos e pagamentos continuam no histórico. Não dá para desfazer.', ok: 'Anonimizar', perigo: true })) {
            await api.post(`/clientes/${x.id}/anonimizar`); qc.invalidateQueries({ queryKey: ['clientes'] }); avisar('Dados pessoais removidos.'); fechar();
          }
        }}>Anonimizar</button> : <span />}
        <button className="btn btn-sec" onClick={() => editar(x)}><Icone n="editar" />Editar</button>
      </div>
    )}>
      <dl>
        <div className="prop"><dt>Tipo</dt><dd>{x.tipo === 'agencia' ? `Agência · comissão ${x.comissao}%` : 'Anunciante'}</dd></div>
        <div className="prop"><dt>Documento</dt><dd className="mono">{x.documento || '—'}</dd></div>
        <div className="prop"><dt>Contato</dt><dd>{x.contato || '—'}</dd></div>
        <div className="prop"><dt>Telefone</dt><dd>{x.telefone ? <a href={linkWhatsApp(x.telefone, `Olá, ${x.contato?.split(' ')[0] || ''}!`)} target="_blank" rel="noreferrer">{x.telefone}</a> : '—'}</dd></div>
        <div className="prop"><dt>E-mail</dt><dd className="trunc">{x.email ? <a href={`mailto:${x.email}`}>{x.email}</a> : '—'}</dd></div>
        <div className="prop"><dt>Cidade</dt><dd>{x.cidade || '—'}</dd></div>
        {x.atrasado > 0 && <div className="prop"><dt>Em atraso</dt><dd className="bad-t">{money(x.atrasado)} · há {x.diasAtraso} dias</dd></div>}
      </dl>
      {x.obs && <p className="xs t2">{x.obs}</p>}
      {vê('contratos') && (
        <div className="pilha g-100">
          <span className="h-card">Contratos</span>
          <ul className="card lista">
            {(ks.data || []).length ? ks.data!.map((k) => (
              <li key={k.id} className="li"><Link to={`/contratos/${k.id}`} className="flex1"><span className="mono">{k.numero}</span> <span style={{ color: 'var(--c-text)' }}>{k.campanha}</span><div className="sm t3">{k.ini ? `${fdate(k.ini)} a ${fdate(k.fim)}` : 'sem faces'} · {money(k.valor)}</div></Link><Etiqueta par={CONTRATO_ST[k.status]} /></li>
            )) : <li className="li t2">Nenhum contrato.</li>}
          </ul>
        </div>
      )}
      {sessao?.perfil === 'admin' && (
        <div className="pilha g-100">
          <span className="h-card">Portal do anunciante</span>
          <p className="xs t2">O cliente acompanha fotos, campanhas e pagamentos com acesso próprio.</p>
          {convite ? (
            <div className="aviso-linha info"><Icone n="chave" /><div>Código de convite: <b className="mono">{convite}</b><br />Envie para o cliente criar a conta em {location.origin}/entrar?convite={convite}</div></div>
          ) : <button className="btn btn-sec" style={{ alignSelf: 'flex-start' }} onClick={convidar}>Gerar convite de acesso</button>}
        </div>
      )}
    </Gaveta>
  );
}
