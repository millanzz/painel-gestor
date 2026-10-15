import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useSessao } from '../sessao';
import { Dialogo, ErroCaixa } from './base';

/** Pede o aceite quando os termos mudaram de versão (ou para contas antigas). */
export function AceiteTermos() {
  const { sair } = useSessao();
  const qc = useQueryClient();
  const [erro, setErro] = useState<unknown>(null);
  const aceitar = async () => {
    try { qc.setQueryData(['sessao'], await api.post('/auth/termos')); } catch (x) { setErro(x); }
  };
  return (
    <Dialogo titulo="Termos atualizados" fechar={() => {}} rodape={<>
      <button className="btn btn-sec" onClick={sair}>Sair</button>
      <button className="btn btn-pri" onClick={aceitar}>Li e aceito</button>
    </>}>
      <ErroCaixa erro={erro} />
      <p className="t2">Para continuar, leia e aceite os <Link to="/termos" target="_blank">termos de uso</Link> e a <Link to="/privacidade" target="_blank">política de privacidade</Link>. Eles explicam como tratamos os dados da sua empresa e dos seus clientes, conforme a LGPD.</p>
    </Dialogo>
  );
}
