import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PERFIS, PERFIS_LISTA, PLANOS } from '@shared';
import { api } from '../api';
import { useSessao } from '../sessao';
import { Badge, Cabecalho, Carregando, useAvisos, Vazio } from '../ui/base';
import { FormGaveta } from '../ui/formulario';
import { Icone } from '../ui/icones';

export default function Usuarios() {
  const { empresa } = useSessao();
  const qc = useQueryClient();
  const { avisar } = useAvisos();
  const [form, setForm] = useState<any>(null);
  const q = useQuery({ queryKey: ['membros'], queryFn: () => api.get<any[]>('/membros') });
  const clientes = useQuery({ queryKey: ['clientes'], queryFn: () => api.get<any[]>('/clientes') });
  const plano = PLANOS[empresa?.config.plano.id || 'pro'];
  const internos = (q.data || []).filter((m) => m.perfil !== 'cliente').length;
  const link = (c: string) => `${location.origin}/entrar?convite=${c}`;
  const novoCodigo = async (m: any) => {
    const r = await api.post(`/membros/${m.id}/convite`);
    qc.invalidateQueries({ queryKey: ['membros'] });
    navigator.clipboard?.writeText(link(r.convite));
    avisar('Novo convite copiado.');
  };
  return (
    <>
      <Cabecalho titulo="Usuários" sub={`${internos} de ${plano.usuarios >= 1000 ? 'ilimitados' : plano.usuarios} usuários internos no plano ${plano.nome}`}
        acoes={<button className="btn btn-pri" onClick={() => setForm({ perfil: 'comercial', ativo: true })}><Icone n="mais" />Convidar pessoa</button>} />
      <div className="miolo">
        <div className="grade-kpi" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {PERFIS_LISTA.map((p) => (
            <div key={p} className="card p pilha g-050">
              <span className="h-card">{PERFIS[p].nome}</span>
              <span className="xs t2">{PERFIS[p].desc}</span>
            </div>
          ))}
        </div>
        {q.isLoading ? <Carregando /> : (
          <div className="card tabela-wrap">
            {(q.data || []).length ? (
              <table className="tabela">
                <thead><tr><th>Pessoa</th><th>Perfil</th><th>Acesso</th><th /></tr></thead>
                <tbody>{q.data!.map((m) => (
                  <tr key={m.id} className="clicavel" onClick={() => setForm(m)} style={{ opacity: m.ativo ? 1 : 0.55 }}>
                    <td><span style={{ fontWeight: 500 }}>{m.nome}</span><div className="sm t3">{m.emailConta || m.email}</div></td>
                    <td>{PERFIS[m.perfil as keyof typeof PERFIS].nome}{m.clienteNome && <div className="sm t3">{m.clienteNome}</div>}</td>
                    <td>{!m.ativo ? <Badge tom="neu">Desativado</Badge> : m.usuarioId ? <Badge tom="ok">Ativo</Badge> : <Badge tom="warn">Convite pendente</Badge>}</td>
                    <td className="dir" onClick={(e) => e.stopPropagation()}>
                      {!m.usuarioId && m.convite && <div className="linha g-100" style={{ justifyContent: 'flex-end' }}>
                        <span className="mono esconde-movel">{m.convite}</span>
                        <button className="btn btn-sec btn-sm" onClick={() => { navigator.clipboard?.writeText(link(m.convite)); avisar('Link do convite copiado.'); }}><Icone n="copiar" />Copiar link</button>
                      </div>}
                      {!m.usuarioId && !m.convite && <button className="btn btn-sec btn-sm" onClick={() => novoCodigo(m)}>Gerar convite</button>}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <Vazio titulo="Ninguém por aqui ainda" />}
          </div>
        )}
      </div>
      {form && (
        <FormGaveta titulo={form.id ? form.nome : 'Convidar pessoa'} rota="/membros" registro={form.id ? form : null} padrao={form} fechar={() => setForm(null)} podeExcluir
          aoSalvar={(m) => { if (!form.id && m.convite) { navigator.clipboard?.writeText(link(m.convite)); avisar(`Convite ${m.convite} copiado. Envie o link para a pessoa.`); } }}
          campos={[
            { k: 'nome', rotulo: 'Nome', obrig: true, largo: true },
            { k: 'email', rotulo: 'E-mail', tipo: 'email', largo: true },
            { k: 'perfil', rotulo: 'Perfil', tipo: 'select', obrig: true, opcoes: PERFIS_LISTA.map((p) => [p, PERFIS[p].nome]) },
            { k: 'clienteId', rotulo: 'Cliente que acompanha', tipo: 'select', se: (v) => v.perfil === 'cliente', opcoes: (clientes.data || []).map((c) => [c.id, c.nome]) },
            { k: 'ativo', rotulo: 'Acesso ativo', tipo: 'bool', se: () => !!form.id },
          ]}
          extra={!form.id && <p className="sm t2">Geramos um código de convite. A pessoa cria a própria senha ao entrar pelo link.</p>} />
      )}
    </>
  );
}
