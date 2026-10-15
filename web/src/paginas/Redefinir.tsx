import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { Sessao } from '@shared';
import { api } from '../api';
import { Campo, ErroCaixa } from '../ui/base';

/** Tela aberta pelo link do e-mail de redefinição de senha. */
export default function Redefinir() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const qc = useQueryClient();
  const nav = useNavigate();
  const [senha, setSenha] = useState('');
  const [conf, setConf] = useState('');
  const [erro, setErro] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (senha !== conf) return setErro(new Error('As duas senhas não são iguais.'));
    setEnviando(true); setErro(null);
    try {
      const s = await api.post<Sessao>('/auth/redefinir', { token, senha });
      qc.clear(); qc.setQueryData(['sessao'], s); nav('/', { replace: true });
    } catch (x) { setErro(x); } finally { setEnviando(false); }
  };
  return (
    <div className="entrada-tela">
      <form className="card entrada-card" onSubmit={enviar}>
        <div className="pilha g-100">
          <div className="linha g-100"><img src="/icone.svg" width={28} height={28} alt="" /><span className="h-card">Painel Gestor</span></div>
          <h1 className="h-big" style={{ marginTop: 16 }}>Criar nova senha</h1>
          <p className="t2">Depois de salvar, você já entra no sistema.</p>
        </div>
        {!token && <div className="aviso-linha bad">Link incompleto. Abra de novo o link do e-mail ou peça outro.</div>}
        <ErroCaixa erro={erro} />
        <Campo rotulo="Nova senha" ajuda="Pelo menos 8 caracteres."><input className="entrada" type="password" autoComplete="new-password" minLength={8} required value={senha} onChange={(e) => setSenha(e.target.value)} autoFocus /></Campo>
        <Campo rotulo="Repita a nova senha"><input className="entrada" type="password" autoComplete="new-password" minLength={8} required value={conf} onChange={(e) => setConf(e.target.value)} /></Campo>
        <button className="btn btn-pri btn-lg" disabled={enviando || !token}>{enviando ? 'Salvando…' : 'Salvar e entrar'}</button>
        <Link to="/entrar" className="btn btn-txt">Voltar para entrar</Link>
      </form>
    </div>
  );
}
