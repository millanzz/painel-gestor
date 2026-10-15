import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { TERMOS_VERSAO } from '@shared';

// Modelo inicial de termos e política de privacidade, escrito para a LGPD.
// Antes de vender, revise com um advogado e preencha os dados da sua empresa.
const RAZAO = 'Painel Gestor';
const CONTATO = 'privacidade@painelgestor.com.br';

function Pagina({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-surface)' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px 80px' }} className="pilha g-300 legal">
        <Link to="/entrar" className="linha g-100"><img src="/icone.svg" width={24} height={24} alt="" /><span className="h-card" style={{ color: 'var(--c-text)' }}>Painel Gestor</span></Link>
        <div className="pilha g-100">
          <h1 className="h-big">{titulo}</h1>
          <span className="t2 sm">Versão {TERMOS_VERSAO}</span>
        </div>
        {children}
        <div className="linha g-200 xs" style={{ paddingTop: 24, borderTop: '1px solid var(--c-line)' }}>
          <Link to="/termos">Termos de uso</Link><Link to="/privacidade">Política de privacidade</Link><Link to="/entrar">Entrar</Link>
        </div>
      </div>
    </div>
  );
}

const S = ({ t, children }: { t: string; children: ReactNode }) => (
  <section className="pilha g-100"><h2 className="h-sec">{t}</h2><div className="pilha g-100 t2" style={{ fontSize: 15, lineHeight: '24px' }}>{children}</div></section>
);

export function Termos() {
  return (
    <Pagina titulo="Termos de uso">
      <S t="1. O serviço">
        <p>O {RAZAO} é um sistema on-line para exibidoras de mídia exterior organizarem faces de painéis, reservas, contratos, equipe de campo, cobrança e notas fiscais, com um portal para os anunciantes acompanharem suas campanhas.</p>
      </S>
      <S t="2. Conta e acesso">
        <p>Cada pessoa usa a própria conta, com e-mail e senha pessoais. A empresa contratante (exibidora) é responsável por quem convida, pelo perfil de acesso que atribui a cada pessoa e por remover quem não deve mais acessar.</p>
        <p>Não compartilhe sua senha. Se suspeitar de uso indevido, troque a senha e avise o administrador da sua empresa.</p>
      </S>
      <S t="3. Dados da empresa">
        <p>Os dados cadastrados (faces, clientes, contratos, financeiro, fotos) pertencem à exibidora. Ela pode exportá-los a qualquer momento em Configurações → Dados e conta, e pedir a exclusão definitiva ao encerrar a assinatura.</p>
        <p>Nos termos da LGPD, a exibidora é a controladora dos dados pessoais dos seus clientes e equipe; o {RAZAO} atua como operador, tratando esses dados apenas para prestar o serviço.</p>
      </S>
      <S t="4. Uso permitido">
        <p>É proibido usar o sistema para enviar mensagens não solicitadas, cadastrar dados de terceiros sem base legal, tentar acessar dados de outras empresas ou prejudicar o funcionamento do serviço.</p>
      </S>
      <S t="5. Integrações">
        <p>WhatsApp, nota fiscal, e-mail e pagamentos dependem de provedores contratados pela exibidora (por exemplo Z-API e Focus NFe). O uso desses serviços segue também os termos de cada provedor. A responsabilidade fiscal pelas notas emitidas é da exibidora.</p>
      </S>
      <S t="6. Assinatura">
        <p>O período de teste dura 14 dias. Depois, o acesso continua conforme o plano contratado. Sem pagamento, o sistema fica em modo leitura até a regularização, sem perda de dados.</p>
      </S>
      <S t="7. Disponibilidade e responsabilidade">
        <p>Trabalhamos para manter o serviço disponível e com cópias de segurança, mas podem ocorrer interrupções para manutenção ou por falhas de terceiros. Não respondemos por decisões comerciais tomadas com base nos dados cadastrados pela própria empresa.</p>
      </S>
      <S t="8. Alterações e contato">
        <p>Quando estes termos mudarem, avisaremos no sistema e pediremos um novo aceite. Dúvidas: {CONTATO}.</p>
      </S>
    </Pagina>
  );
}

export function Privacidade() {
  return (
    <Pagina titulo="Política de privacidade">
      <S t="Quais dados tratamos">
        <p><b>Usuários do sistema:</b> nome, e-mail, senha (guardada só como hash), empresa e perfil de acesso, registros de atividade (auditoria).</p>
        <p><b>Clientes das exibidoras:</b> razão social, CNPJ ou CPF, contato, telefone, e-mail e endereço fiscal, cadastrados pela exibidora para propostas, contratos, cobrança e notas fiscais.</p>
        <p><b>Fotos de campo:</b> imagens dos painéis com data e localização (GPS) da foto, usadas para comprovar a veiculação no local certo.</p>
      </S>
      <S t="Para que usamos">
        <p>Para prestar o serviço contratado: agenda, contratos, comprovação de veiculação, cobrança, emissão de nota fiscal e suporte. Base legal: execução de contrato e cumprimento de obrigação legal (fiscal). Não vendemos dados e não os usamos para publicidade.</p>
      </S>
      <S t="Com quem compartilhamos">
        <p>Somente com provedores necessários ao serviço e escolhidos pela exibidora: hospedagem e banco de dados, armazenamento de arquivos, envio de e-mail, WhatsApp (ex.: Z-API), emissor de nota fiscal (ex.: Focus NFe) e monitoramento de erros. Cada um recebe só o necessário para sua função.</p>
      </S>
      <S t="Por quanto tempo">
        <p>Enquanto a conta da exibidora estiver ativa. Dados fiscais e financeiros podem ser mantidos pelo prazo exigido em lei. Fotos e cadastros de clientes podem ser apagados ou anonimizados a pedido.</p>
      </S>
      <S t="Segurança">
        <p>Conexão criptografada (HTTPS), senhas com hash, separação dos dados por empresa, controle de acesso por perfil, registro de auditoria e cópias de segurança.</p>
      </S>
      <S t="Seus direitos (LGPD, art. 18)">
        <p>Você pode pedir confirmação de tratamento, acesso, correção, anonimização, portabilidade e exclusão dos seus dados. Se você é cliente de uma exibidora, fale primeiro com ela (controladora). Para usuários do sistema: {CONTATO}.</p>
      </S>
    </Pagina>
  );
}
