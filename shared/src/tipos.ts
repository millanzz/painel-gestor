// Formato dos registros como trafegam na API (camelCase). No banco as colunas
// têm os mesmos nomes em snake_case.
import type { Perfil } from './perfis';

interface Base { id: string; criadoEm?: string; atualizadoEm?: string; excluidoEm?: string | null }

export interface Estrutura extends Base {
  codigo: string; endereco: string; bairro: string; cidade: string; uf: string;
  lat: number | null; lng: number | null;
  licNumero: string; licOrgao: string; licTaxa: number | null; licVencimento: string | null;
  locProprietario: string; locContato: string; locValor: number | null; locDia: number | null;
  locIndice: string; locReajuste: string | null; locVencimento: string | null; obs: string;
}

export interface Painel extends Base {
  estruturaId: string | null; codigo: string; face: string; tipo: string;
  largura: number | null; altura: number | null; iluminado: boolean; valorBi: number;
  status: 'ativo' | 'inativo'; sentido: string; slots: number;
  insercaoSeg: number | null; loopSeg: number | null; horasDia: number | null; obs: string;
  // vindos da estrutura (somente leitura)
  endereco?: string; bairro?: string; cidade?: string; uf?: string; lat?: number | null; lng?: number | null; estruturaCodigo?: string;
}

export interface Cliente extends Base {
  nome: string; tipo: 'anunciante' | 'agencia'; documento: string; contato: string;
  email: string; telefone: string; comissao: number; cidade: string; obs: string; anonimizadoEm?: string | null;
}

export interface Contrato extends Base {
  numero: string; clienteId: string; agenciaId: string | null; vendedorId: string | null;
  campanha: string; data: string; valor: number; valorTabela: number | null; status: string;
  piNumero: string | null; piData: string | null; validadeProposta: string | null;
  condicoes: string; obs: string; aprovadoEm: string | null; descontoAprovadoPor: string | null;
  canceladoEm: string | null; multa: number | null; motivoCancelamento: string | null; renovadoDe: string | null;
  // calculados
  clienteNome?: string; agenciaNome?: string; vendedorNome?: string; ini?: string | null; fim?: string | null; nFaces?: number;
}

export interface Reserva extends Base {
  painelId: string; contratoId: string | null; campanha: string; ini: string; fim: string;
  status: 'reservado' | 'confirmado' | 'fila' | 'expirada' | 'cancelada';
  validade: string | null; slots: number; painelCodigo?: string; clienteNome?: string;
}

export interface Arte extends Base {
  contratoId: string; status: string; prazo: string | null; necessario: string; grafica: string;
  previsao: string | null; recebido: string; recebidoEm: string | null; obs: string;
  arquivoId: string | null; nomeArquivo: string | null; contratoNumero?: string; campanha?: string; ini?: string | null;
}

export interface Lancamento extends Base {
  tipo: 'receita' | 'despesa'; categoria: string; descricao: string;
  contratoId: string | null; painelId: string | null; estruturaId: string | null;
  vencimento: string; valor: number; status: 'aberto' | 'pago' | 'cancelado'; pagoEm: string | null;
  nfStatus: 'a_emitir' | 'emitida' | 'cancelada' | null; nfNumero: string | null; nfData: string | null; nfLink: string | null;
  recorrenciaId: string | null; competencia: string | null; comissaoDe: string | null; comissaoTipo: string | null;
  clienteNome?: string; clienteTelefone?: string; clienteContato?: string; contratoNumero?: string;
}

export interface Recorrencia extends Base {
  descricao: string; categoria: string; valor: number; dia: number;
  estruturaId: string | null; painelId: string | null; ativo: boolean;
}

export interface OrdemServico extends Base {
  painelId: string; reservaId: string | null; contratoId: string | null; tipo: string;
  abertura: string; prazo: string | null; responsavel: string; membroId: string | null;
  status: 'aberta' | 'andamento' | 'concluida'; custo: number; descricao: string;
  concluidaEm: string | null; despesaId: string | null;
  painelCodigo?: string; endereco?: string; cidade?: string; lat?: number | null; lng?: number | null; campanha?: string;
}

export interface Comprovacao extends Base {
  reservaId: string | null; painelId: string; contratoId: string | null; data: string; membroId: string | null;
  tipo: string; arquivoId: string; exif: { lat?: number; lng?: number; dataHora?: string };
  verificacao: 'ok' | 'longe' | 'sem_gps' | 'sem_ponto'; distanciaM: number | null; painelCodigo?: string; endereco?: string;
}

export interface Membro extends Base {
  usuarioId: string | null; nome: string; email: string; perfil: Perfil; clienteId: string | null;
  convite: string | null; ativo: boolean;
}

export interface Alerta { sev: 'bad' | 'warn' | 'info'; tag: string; titulo: string; detalhe: string; acao: string; link: string }

export interface Sessao {
  usuario: { id: string; nome: string; email: string };
  empresas: { id: string; nome: string; perfil: Perfil; membroId: string }[];
  empresaId: string | null;
  perfil: Perfil | null;
  membroId: string | null;
  clienteId: string | null;
  /** O usuário ainda não aceitou a versão atual dos termos. */
  termosPendentes: boolean;
}
