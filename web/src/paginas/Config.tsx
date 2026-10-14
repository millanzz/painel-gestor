import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { criarCalendario, fdate, money, PLANOS, type ConfigEmpresa } from '@shared';
import { api } from '../api';
import { useSessao } from '../sessao';
import { abrirArquivo, Abas, Badge, Cabecalho, Campo, ErroCaixa, useAvisos } from '../ui/base';
import { Icone } from '../ui/icones';

type Aba = 'empresa' | 'comercial' | 'financeiro' | 'calendario' | 'plano' | 'importar' | 'conta';

export default function Config() {
  const [params, setParams] = useSearchParams();
  const aba = (params.get('aba') as Aba) || 'empresa';
  const { empresa, recarregar } = useSessao();
  const { avisar } = useAvisos();
  const [cfg, setCfg] = useState<ConfigEmpresa>(empresa!.config);
  const [erro, setErro] = useState<unknown>(null);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => setCfg(empresa!.config), [empresa]);
  const set = <K extends keyof ConfigEmpresa>(k: K, v: ConfigEmpresa[K]) => setCfg({ ...cfg, [k]: v });
  const sub = <K extends keyof ConfigEmpresa>(k: K, c: string, v: any) => setCfg({ ...cfg, [k]: { ...(cfg[k] as any), [c]: v } });

  const salvar = async (blocos: (keyof ConfigEmpresa)[]) => {
    setSalvando(true); setErro(null);
    try { await api.patch('/empresa/config', Object.fromEntries(blocos.map((b) => [b, cfg[b]]))); await recarregar(); avisar('Configurações salvas.'); }
    catch (x) { setErro(x); } finally { setSalvando(false); }
  };
  const Salvar = ({ blocos }: { blocos: (keyof ConfigEmpresa)[] }) => <button className="btn btn-pri" style={{ alignSelf: 'flex-start' }} disabled={salvando} onClick={() => salvar(blocos)}>{salvando ? 'Salvando…' : 'Salvar'}</button>;
  const inp = (v: any, on: (x: string) => void, tipo = 'text', extra: any = {}) => <input className="entrada" type={tipo} value={v ?? ''} onChange={(e) => on(e.target.value)} {...extra} />;

  return (
    <>
      <Cabecalho titulo="Configurações" sub={empresa?.nome} />
      <Abas valor={aba} onChange={(a) => setParams({ aba: a })} opcoes={[['empresa', 'Empresa'], ['comercial', 'Regras comerciais'], ['financeiro', 'Financeiro'], ['calendario', 'Calendário'], ['plano', 'Plano'], ['importar', 'Importar'], ['conta', 'Dados e conta']]} />
      <div className="miolo" style={{ maxWidth: 800 }}>
        <ErroCaixa erro={erro} />
        {aba === 'empresa' && (
          <section className="pilha g-300">
            <div className="form">
              <Campo rotulo="Razão social" className="largo">{inp(cfg.empresa.razao, (v) => sub('empresa', 'razao', v))}</Campo>
              <Campo rotulo="CNPJ">{inp(cfg.empresa.cnpj, (v) => sub('empresa', 'cnpj', v))}</Campo>
              <Campo rotulo="Telefone">{inp(cfg.empresa.telefone, (v) => sub('empresa', 'telefone', v), 'tel')}</Campo>
              <Campo rotulo="E-mail">{inp(cfg.empresa.email, (v) => sub('empresa', 'email', v), 'email')}</Campo>
              <Campo rotulo="Cidade">{inp(cfg.empresa.cidade, (v) => sub('empresa', 'cidade', v))}</Campo>
              <Campo rotulo="UF">{inp(cfg.empresa.uf, (v) => sub('empresa', 'uf', v), 'text', { maxLength: 2 })}</Campo>
            </div>
            <p className="sm t2">Aparece nas propostas, nos PIs e nas mensagens de cobrança.</p>
            <Salvar blocos={['empresa']} />
          </section>
        )}
        {aba === 'comercial' && (
          <section className="pilha g-300">
            <div className="form">
              <Campo rotulo="Dias que a opção segura a face">{inp(cfg.opcaoDias, (v) => set('opcaoDias', Number(v)), 'number')}</Campo>
              <Campo rotulo="Prazo da arte (dias antes da colagem)">{inp(cfg.artePrazoDias, (v) => set('artePrazoDias', Number(v)), 'number')}</Campo>
              <Campo rotulo="Multa por cancelamento (% do saldo)">{inp(cfg.multaPct, (v) => set('multaPct', Number(v)), 'number')}</Campo>
              <Campo rotulo="Comissão do vendedor (% da parcela recebida)">{inp(cfg.comissaoVendedor, (v) => set('comissaoVendedor', Number(v)), 'number')}</Campo>
              <label className="check largo"><input type="checkbox" checked={cfg.repassarAgencia} onChange={(e) => set('repassarAgencia', e.target.checked)} />Lançar a comissão da agência como despesa quando a parcela for paga</label>
              <div className="secao rotulo">Desconto que cada perfil aprova sozinho</div>
              <Campo rotulo="Comercial (%)">{inp(cfg.limiteDesconto.comercial, (v) => set('limiteDesconto', { ...cfg.limiteDesconto, comercial: Number(v) }), 'number')}</Campo>
              <Campo rotulo="Financeiro (%)">{inp(cfg.limiteDesconto.financeiro, (v) => set('limiteDesconto', { ...cfg.limiteDesconto, financeiro: Number(v) }), 'number')}</Campo>
            </div>
            <Lista titulo="Temporada (acréscimo na tabela)" itens={cfg.sazonal} novo={{ nome: 'Temporada', mesIni: 11, mesFim: 12, pct: 10 }} mudar={(l) => set('sazonal', l)}
              colunas={[['nome', 'Nome', 'text'], ['mesIni', 'Mês inicial', 'number'], ['mesFim', 'Mês final', 'number'], ['pct', '% a mais', 'number']]} />
            <Lista titulo="Desconto por volume (sugerido na proposta)" itens={cfg.volume} novo={{ min: 4, pct: 5 }} mudar={(l) => set('volume', l)}
              colunas={[['min', 'A partir de (faces)', 'number'], ['pct', '% de desconto', 'number']]} />
            <Salvar blocos={['opcaoDias', 'artePrazoDias', 'multaPct', 'comissaoVendedor', 'repassarAgencia', 'limiteDesconto', 'sazonal', 'volume']} />
          </section>
        )}
        {aba === 'financeiro' && (
          <section className="pilha g-300">
            <div className="form">
              <div className="secao rotulo" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>PIX</div>
              <Campo rotulo="Chave PIX" className="largo">{inp(cfg.pix.chave, (v) => sub('pix', 'chave', v))}</Campo>
              <Campo rotulo="Nome do recebedor">{inp(cfg.pix.nome, (v) => sub('pix', 'nome', v), 'text', { maxLength: 25 })}</Campo>
              <Campo rotulo="Cidade do recebedor">{inp(cfg.pix.cidade, (v) => sub('pix', 'cidade', v), 'text', { maxLength: 15 })}</Campo>
              <div className="secao rotulo">Cobrança</div>
              <Campo rotulo="Régua (dias em relação ao vencimento)" ajuda="Separe por vírgula. Negativo = antes. Ex.: -3, 0, 3, 10" className="largo">
                {inp(cfg.regua.join(', '), (v) => set('regua', v.split(',').map((x) => Number(x.trim())).filter((x) => !isNaN(x))))}
              </Campo>
              <Campo rotulo="Bloquear novas reservas após (dias de atraso)">{inp(cfg.bloqueioDias, (v) => set('bloqueioDias', Number(v)), 'number')}</Campo>
              <div className="secao rotulo">Nota fiscal de serviço</div>
              <Campo rotulo="Código do serviço">{inp(cfg.nfse.codigoServico, (v) => sub('nfse', 'codigoServico', v))}</Campo>
              <Campo rotulo="Alíquota de ISS (%)">{inp(cfg.nfse.aliquota, (v) => sub('nfse', 'aliquota', Number(v)), 'number')}</Campo>
              <Campo rotulo="Descrição padrão" className="largo">{inp(cfg.nfse.descricao, (v) => sub('nfse', 'descricao', v))}</Campo>
              <Campo rotulo="Endereço do emissor da prefeitura" className="largo">{inp(cfg.nfse.emissorUrl, (v) => sub('nfse', 'emissorUrl', v), 'url')}</Campo>
            </div>
            <Salvar blocos={['pix', 'regua', 'bloqueioDias', 'nfse']} />
          </section>
        )}
        {aba === 'calendario' && <Calendario cfg={cfg} mudar={(c) => set('calendario', c)} salvar={() => salvar(['calendario'])} />}
        {aba === 'plano' && <Plano />}
        {aba === 'importar' && <Importar />}
        {aba === 'conta' && <Conta />}
      </div>
    </>
  );
}

function Lista({ titulo, itens, colunas, novo, mudar }: { titulo: string; itens: any[]; colunas: [string, string, string][]; novo: any; mudar: (l: any[]) => void }) {
  return (
    <div className="pilha g-100">
      <span className="h-card">{titulo}</span>
      <div className="card p pilha g-100">
        {itens.map((it, i) => (
          <div key={i} className="linha g-100" style={{ alignItems: 'flex-end' }}>
            {colunas.map(([k, l, t]) => (
              <Campo key={k} rotulo={l} className="flex1"><input className="entrada" type={t} value={it[k] ?? ''} onChange={(e) => mudar(itens.map((x, j) => (j === i ? { ...x, [k]: t === 'number' ? Number(e.target.value) : e.target.value } : x)))} /></Campo>
            ))}
            <button className="icone-btn" aria-label="Remover" style={{ height: 36 }} onClick={() => mudar(itens.filter((_, j) => j !== i))}><Icone n="lixeira" /></button>
          </div>
        ))}
        <button className="btn btn-txt btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => mudar([...itens, { ...novo }])}><Icone n="mais" />Adicionar</button>
      </div>
    </div>
  );
}

function Calendario({ cfg, mudar, salvar }: { cfg: ConfigEmpresa; mudar: (c: Record<string, string>) => void; salvar: () => void }) {
  const ano = new Date().getFullYear();
  const C = useMemo(() => criarCalendario(cfg.calendario), [cfg.calendario]);
  return (
    <section className="pilha g-300">
      <p className="t2 xs">O ano tem 26 bissemanas de 14 dias. Por padrão a BI 01 começa na primeira segunda-feira do ano. Se o seu mercado usa outra data, ajuste aqui.</p>
      <div className="form">
        {[ano, ano + 1, ano + 2].map((y) => (
          <Campo key={y} rotulo={`Início da BI 01 de ${y}`} ajuda={`BI 26 termina em ${fdate(C.biFim(y, 26))}`}>
            <input className="entrada" type="date" value={cfg.calendario[String(y)] || C.biIni(y, 1)} onChange={(e) => mudar({ ...cfg.calendario, [y]: e.target.value })} />
          </Campo>
        ))}
      </div>
      <button className="btn btn-pri" style={{ alignSelf: 'flex-start' }} onClick={salvar}>Salvar calendário</button>
    </section>
  );
}

function Plano() {
  const { empresa, recarregar } = useSessao();
  const { avisar, confirmar } = useAvisos();
  const p = empresa!.plano;
  const [erro, setErro] = useState<unknown>(null);
  const escolher = async (id: string) => {
    if (!(await confirmar({ titulo: `Mudar para o plano ${PLANOS[id].nome}?`, texto: `${money(PLANOS[id].preco)} por mês.`, ok: 'Confirmar' }))) return;
    try { await api.post('/empresa/plano', { id }); await recarregar(); avisar('Plano atualizado.'); } catch (x) { setErro(x); }
  };
  return (
    <section className="pilha g-300">
      <div className="aviso-linha info"><Icone n="info" />
        <div>{p.situacao === 'trial' ? `Período de teste até ${fdate(p.trialAte)}.` : p.situacao === 'vencido' ? 'A assinatura venceu: o sistema está em modo leitura.' : `Plano ${p.nome} ativo. Próxima cobrança em ${fdate(p.proximaCobranca)}.`}
          {empresa!.uso && ` Uso: ${empresa!.uso.paineis} faces e ${empresa!.uso.usuarios} usuários internos.`}</div>
      </div>
      <ErroCaixa erro={erro} />
      <div className="grade-kpi">
        {Object.entries(PLANOS).map(([id, x]) => (
          <div key={id} className="card pp pilha g-100" style={id === p.id ? { boxShadow: '0 0 0 2px var(--c-brand), var(--sh-2)' } : undefined}>
            <div className="linha entre"><span className="h-sec">{x.nome}</span>{id === p.id && <Badge tom="info">Atual</Badge>}</div>
            <span className="num">{money(x.preco).replace(/,00$/, '')}<span className="xs t2">/mês</span></span>
            <span className="xs t2">{x.paineis >= 1000 ? 'Faces ilimitadas' : `Até ${x.paineis} faces`} · {x.usuarios >= 1000 ? 'usuários ilimitados' : `${x.usuarios} usuários`}</span>
            <span className="xs t2">Portal do anunciante ilimitado</span>
            {id !== p.id || p.situacao !== 'ativo' ? <button className="btn btn-sec" style={{ marginTop: 8 }} onClick={() => escolher(id)}>Escolher</button> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function Importar() {
  const qc = useQueryClient();
  const { avisar } = useAvisos();
  const [tipo, setTipo] = useState<'paineis' | 'clientes'>('paineis');
  const [texto, setTexto] = useState('');
  const [previa, setPrevia] = useState<any>(null);
  const [erro, setErro] = useState<unknown>(null);
  const modelo = tipo === 'paineis'
    ? 'Código;Estrutura;Endereço;Bairro;Cidade;UF;Latitude;Longitude;Tipo;Largura;Altura;Iluminado;Preço\nP-010;E-010;Av. Brasil, 100;Centro;Santo André;SP;-23.66;-46.53;outdoor;9;3;sim;1.800,00'
    : 'Nome;Tipo;CNPJ;Contato;Telefone;E-mail;Cidade;Comissão\nPadaria Central;anunciante;12.345.678/0001-00;Maria;(11) 99999-0000;maria@padaria.com;Santo André;';
  const ler = async (f?: File) => { if (f) setTexto(await f.text()); };
  const simular = async () => { setErro(null); try { setPrevia(await api.post(`/importacao/${tipo}?simular=1`, { texto })); } catch (x) { setErro(x); } };
  const importar = async () => {
    try { const r = await api.post(`/importacao/${tipo}`, { texto }); avisar(`${r.importados} registro(s) importado(s)${r.ignorados ? `, ${r.ignorados} com erro ignorado(s)` : ''}.`); setPrevia(null); setTexto(''); qc.invalidateQueries(); } catch (x) { setErro(x); }
  };
  return (
    <section className="pilha g-300">
      <div className="seg" role="group" aria-label="O que importar">
        <button aria-pressed={tipo === 'paineis'} onClick={() => { setTipo('paineis'); setPrevia(null); }}>Faces e pontos</button>
        <button aria-pressed={tipo === 'clientes'} onClick={() => { setTipo('clientes'); setPrevia(null); }}>Clientes</button>
      </div>
      <p className="xs t2">Planilha em CSV (separada por ponto e vírgula ou vírgula). A primeira linha é o cabeçalho; os nomes das colunas são reconhecidos automaticamente.</p>
      <div className="linha wrap g-100">
        <label className="btn btn-sec"><Icone n="upload" />Escolher arquivo CSV<input type="file" accept=".csv,.txt" hidden onChange={(e) => ler(e.target.files?.[0])} /></label>
        <button className="btn btn-txt" onClick={() => setTexto(modelo)}>Usar modelo de exemplo</button>
      </div>
      <textarea className="entrada mono" style={{ minHeight: 140, fontSize: 12 }} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ou cole o conteúdo da planilha aqui" />
      <ErroCaixa erro={erro} />
      <div className="linha g-100"><button className="btn btn-sec" disabled={!texto} onClick={simular}>Conferir</button>{previa && <button className="btn btn-pri" onClick={importar}>Importar {previa.linhas.filter((l: any) => !l.erro).length}</button>}</div>
      {previa && (
        <div className="card tabela-wrap">
          <table className="tabela">
            <thead><tr><th>Linha</th>{previa.colunas.slice(0, 5).map((c: string) => <th key={c}>{c}</th>)}<th>Situação</th></tr></thead>
            <tbody>{previa.linhas.map((l: any) => (
              <tr key={l.linha}><td className="mono">{l.linha}</td>{previa.colunas.slice(0, 5).map((c: string) => <td key={c} className="xs">{String(l.dados[c] ?? '')}</td>)}<td>{l.erro ? <Badge tom="bad">{l.erro}</Badge> : <Badge tom="ok">OK</Badge>}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Conta() {
  const { avisar } = useAvisos();
  const [v, setV] = useState({ atual: '', nova: '' });
  const [erro, setErro] = useState<unknown>(null);
  const trocar = async () => { setErro(null); try { await api.post('/auth/senha', v); setV({ atual: '', nova: '' }); avisar('Senha alterada.'); } catch (x) { setErro(x); } };
  return (
    <section className="pilha g-400">
      <div className="pilha g-150">
        <span className="h-sec">Cópia de segurança</span>
        <p className="xs t2">Baixe todos os dados da empresa em um arquivo JSON: faces, clientes, contratos, reservas, financeiro, campo e auditoria.</p>
        <button className="btn btn-sec" style={{ alignSelf: 'flex-start' }} onClick={() => abrirArquivo('/empresa/backup')}><Icone n="download" />Baixar backup</button>
      </div>
      <div className="pilha g-150">
        <span className="h-sec">Trocar minha senha</span>
        <ErroCaixa erro={erro} />
        <div className="form">
          <Campo rotulo="Senha atual"><input className="entrada" type="password" autoComplete="current-password" value={v.atual} onChange={(e) => setV({ ...v, atual: e.target.value })} /></Campo>
          <Campo rotulo="Nova senha" ajuda="Pelo menos 8 caracteres."><input className="entrada" type="password" autoComplete="new-password" value={v.nova} onChange={(e) => setV({ ...v, nova: e.target.value })} /></Campo>
        </div>
        <button className="btn btn-sec" style={{ alignSelf: 'flex-start' }} disabled={!v.atual || v.nova.length < 8} onClick={trocar}>Trocar senha</button>
      </div>
    </section>
  );
}
