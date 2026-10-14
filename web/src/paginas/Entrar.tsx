import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Sessao } from '@shared';
import { api } from '../api';
import { useSessao } from '../sessao';
import { Campo, ErroCaixa, Seg } from '../ui/base';

type Modo = 'entrar' | 'cadastro' | 'convite';

export default function Entrar() {
  const { sessao } = useSessao();
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const nav = useNavigate();
  const logado = !!sessao;
  const [modo, setModo] = useState<Modo>(params.get('convite') ? 'convite' : 'entrar');
  const [v, setV] = useState({ nome: '', email: '', senha: '', empresa: '', convite: params.get('convite') || '' });
  const [erro, setErro] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });

  const concluir = (s: Sessao) => { qc.clear(); qc.setQueryData(['sessao'], s); nav('/', { replace: true }); };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true); setErro(null);
    try {
      if (logado) {
        if (modo === 'convite') concluir(await api.post('/auth/convite', { codigo: v.convite }));
        else concluir(await api.post('/auth/nova-empresa', { nome: v.empresa }));
      } else if (modo === 'entrar') {
        const s = await api.post<Sessao>('/auth/entrar', { email: v.email, senha: v.senha });
        if (!s.empresaId) { qc.setQueryData(['sessao'], s); setModo('cadastro'); } else concluir(s);
      } else {
        concluir(await api.post('/auth/cadastro', { nome: v.nome, email: v.email, senha: v.senha, ...(modo === 'convite' ? { convite: v.convite } : { empresa: v.empresa }) }));
      }
    } catch (x) { setErro(x); } finally { setEnviando(false); }
  };

  const titulo = logado ? (modo === 'convite' ? 'Entrar com um convite' : 'Criar uma empresa') : modo === 'entrar' ? 'Entrar' : modo === 'cadastro' ? 'Criar conta' : 'Aceitar convite';
  return (
    <div className="entrada-tela">
      <form className="card entrada-card" onSubmit={enviar}>
        <div className="pilha g-100">
          <div className="linha g-100">
            <img src="/icone.svg" width={28} height={28} alt="" />
            <span className="h-card">Painel Gestor</span>
          </div>
          <h1 className="h-big" style={{ marginTop: 16 }}>{titulo}</h1>
          <p className="t2">
            {modo === 'entrar' && !logado && 'Agenda de faces, contratos, campo e cobrança da sua exibidora.'}
            {modo === 'cadastro' && !logado && 'Sua empresa começa com 14 dias de teste do plano Profissional.'}
            {modo === 'convite' && 'Use o código que o administrador da exibidora te enviou.'}
            {logado && modo !== 'convite' && 'Você será o administrador da nova empresa.'}
          </p>
        </div>
        {logado && <Seg rotulo="Como continuar" valor={modo === 'convite' ? 'convite' : 'cadastro'} onChange={(m) => setModo(m as Modo)} opcoes={[['cadastro', 'Nova empresa'], ['convite', 'Tenho um convite']]} />}
        {!logado && <Seg rotulo="Acesso" valor={modo} onChange={setModo} opcoes={[['entrar', 'Entrar'], ['cadastro', 'Criar conta'], ['convite', 'Convite']]} />}
        <ErroCaixa erro={erro} />
        <div className="pilha g-200">
          {!logado && modo !== 'entrar' && <Campo rotulo="Seu nome"><input className="entrada" value={v.nome} onChange={set('nome')} autoComplete="name" required /></Campo>}
          {!logado && <Campo rotulo="E-mail"><input className="entrada" type="email" value={v.email} onChange={set('email')} autoComplete="email" required /></Campo>}
          {!logado && (
            <Campo rotulo="Senha" ajuda={modo !== 'entrar' ? 'Pelo menos 8 caracteres.' : undefined}>
              <input className="entrada" type="password" value={v.senha} onChange={set('senha')} autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} minLength={modo === 'entrar' ? 1 : 8} required />
            </Campo>
          )}
          {modo === 'cadastro' && <Campo rotulo="Nome da exibidora"><input className="entrada" value={v.empresa} onChange={set('empresa')} required /></Campo>}
          {modo === 'convite' && <Campo rotulo="Código do convite"><input className="entrada mono" value={v.convite} onChange={set('convite')} placeholder="ANA-7K2P" required style={{ textTransform: 'uppercase' }} /></Campo>}
        </div>
        <button className="btn btn-pri btn-lg" disabled={enviando}>{enviando ? 'Aguarde…' : modo === 'entrar' && !logado ? 'Entrar' : 'Continuar'}</button>
        {logado && sessao?.empresaId && <button type="button" className="btn btn-txt" onClick={() => nav('/')}>Voltar para {sessao.empresas.find((e) => e.id === sessao.empresaId)?.nome}</button>}
      </form>
    </div>
  );
}
