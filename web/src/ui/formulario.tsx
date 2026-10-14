import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { api } from '../api';
import { Campo, ErroCaixa, Gaveta, useAvisos } from './base';

export interface DefCampo {
  k: string;
  rotulo: string;
  tipo?: 'texto' | 'numero' | 'dinheiro' | 'data' | 'select' | 'area' | 'bool' | 'email' | 'tel' | 'secao';
  opcoes?: [string, string][];
  largo?: boolean;
  obrig?: boolean;
  ajuda?: ReactNode;
  passo?: string;
  se?: (v: Record<string, any>) => boolean;
  desabilitado?: boolean;
}

export function CampoForm({ c, valor, mudar }: { c: DefCampo; valor: any; mudar: (v: any) => void }) {
  const comum = { className: 'entrada', disabled: c.desabilitado, required: c.obrig, 'aria-required': c.obrig };
  let ctrl: ReactNode;
  switch (c.tipo) {
    case 'area': ctrl = <textarea {...comum} value={valor ?? ''} onChange={(e) => mudar(e.target.value)} />; break;
    case 'select': ctrl = (
      <select {...comum} value={valor ?? ''} onChange={(e) => mudar(e.target.value)}>
        {!c.obrig && <option value="">—</option>}
        {c.obrig && valor == null && <option value="">Escolha…</option>}
        {(c.opcoes || []).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    ); break;
    case 'bool': return (
      <label className="check" style={{ gridColumn: c.largo ? '1 / -1' : undefined, alignSelf: 'end', minHeight: 36 }}>
        <input type="checkbox" checked={!!valor} onChange={(e) => mudar(e.target.checked)} disabled={c.desabilitado} />{c.rotulo}
      </label>
    );
    case 'numero': case 'dinheiro':
      ctrl = <input {...comum} type="number" inputMode="decimal" step={c.passo || (c.tipo === 'dinheiro' ? '0.01' : 'any')} value={valor ?? ''} onChange={(e) => mudar(e.target.value === '' ? '' : Number(e.target.value))} />; break;
    case 'data': ctrl = <input {...comum} type="date" value={valor ?? ''} onChange={(e) => mudar(e.target.value)} />; break;
    case 'email': ctrl = <input {...comum} type="email" autoComplete="email" value={valor ?? ''} onChange={(e) => mudar(e.target.value)} />; break;
    case 'tel': ctrl = <input {...comum} type="tel" inputMode="tel" value={valor ?? ''} onChange={(e) => mudar(e.target.value)} />; break;
    default: ctrl = <input {...comum} type="text" value={valor ?? ''} onChange={(e) => mudar(e.target.value)} />;
  }
  return <Campo rotulo={c.rotulo + (c.obrig ? '' : '')} ajuda={c.ajuda} className={c.largo ? 'largo' : ''}>{ctrl}</Campo>;
}

export function GradeCampos({ campos, valores, mudar }: { campos: DefCampo[]; valores: Record<string, any>; mudar: (k: string, v: any) => void }) {
  return (
    <div className="form">
      {campos.filter((c) => !c.se || c.se(valores)).map((c) =>
        c.tipo === 'secao'
          ? <div key={c.k} className="secao rotulo">{c.rotulo}</div>
          : <CampoForm key={c.k} c={c} valor={valores[c.k]} mudar={(v) => mudar(c.k, v)} />,
      )}
    </div>
  );
}

/**
 * Painel lateral de cadastro genérico: cria (POST) ou edita (PATCH) um
 * registro e atualiza as listas indicadas.
 */
export function FormGaveta({
  titulo, rota, registro, campos, fechar, invalidar = [], padrao = {}, extra, aoSalvar, podeExcluir, somenteLeitura,
}: {
  titulo: string; rota: string; registro?: Record<string, any> | null; campos: DefCampo[]; fechar: () => void;
  invalidar?: string[]; padrao?: Record<string, any>; extra?: ReactNode; aoSalvar?: (r: any) => void; podeExcluir?: boolean; somenteLeitura?: boolean;
}) {
  const qc = useQueryClient();
  const { avisar, confirmar } = useAvisos();
  const [v, setV] = useState<Record<string, any>>(() => ({ ...padrao, ...(registro || {}) }));
  const [erro, setErro] = useState<unknown>(null);
  const [salvando, setSalvando] = useState(false);
  const mudar = (k: string, val: any) => setV((o) => ({ ...o, [k]: val }));

  const atualizar = () => [rota.split('/')[1], ...invalidar].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true); setErro(null);
    try {
      const corpo: Record<string, any> = {};
      for (const c of campos) if (c.tipo !== 'secao' && (!c.se || c.se(v))) corpo[c.k] = v[c.k];
      const r = registro?.id ? await api.patch(`${rota}/${registro.id}`, corpo) : await api.post(rota, corpo);
      atualizar();
      avisar(`${titulo.replace(/^(Novo|Nova|Editar) /, '')} salvo.`);
      aoSalvar?.(r);
      fechar();
    } catch (x) { setErro(x); } finally { setSalvando(false); }
  };

  const excluir = async () => {
    if (!registro?.id) return;
    if (!(await confirmar({ titulo: 'Mover para a lixeira?', texto: 'O administrador pode restaurar depois, em Auditoria → Lixeira.', ok: 'Excluir', perigo: true }))) return;
    try { await api.del(`${rota}/${registro.id}`); atualizar(); avisar('Movido para a lixeira.'); fechar(); } catch (x) { setErro(x); }
  };

  return (
    <Gaveta titulo={titulo} fechar={fechar} rodape={!somenteLeitura && (
      <div className="linha entre g-100">
        {podeExcluir && registro?.id ? <button type="button" className="btn btn-perigo" onClick={excluir}>Excluir</button> : <span />}
        <div className="linha g-100">
          <button type="button" className="btn btn-sec" onClick={fechar}>Cancelar</button>
          <button type="submit" form="form-gaveta" className="btn btn-pri" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    )}>
      <form id="form-gaveta" onSubmit={salvar} className="pilha g-300">
        <ErroCaixa erro={erro} />
        <fieldset disabled={somenteLeitura} style={{ border: 0, padding: 0, margin: 0 }}>
          <GradeCampos campos={campos} valores={v} mudar={mudar} />
        </fieldset>
        {extra}
      </form>
    </Gaveta>
  );
}
