// Perfis de acesso. Cada perfil vê um conjunto de áreas e edita um conjunto
// de recursos. A API confere estas mesmas regras em toda requisição.

export type Perfil = 'admin' | 'comercial' | 'financeiro' | 'operacao' | 'cliente';

export type Area =
  | 'inicio' | 'agenda' | 'contratos' | 'clientes' | 'paineis' | 'campo' | 'artes'
  | 'dinheiro' | 'relatorios' | 'usuarios' | 'config' | 'auditoria'
  | 'portal';

export type Recurso =
  | 'estruturas' | 'paineis' | 'fotosPonto' | 'clientes' | 'contratos' | 'reservas'
  | 'artes' | 'lancamentos' | 'recorrencias' | 'os' | 'comprovacoes' | 'membros' | 'config';

export const PERFIS: Record<Perfil, { nome: string; desc: string; areas: Area[]; edita: Recurso[] | '*'; le: Recurso[] | '*' }> = {
  admin: {
    nome: 'Administrador',
    desc: 'Acesso total: preços, painéis, usuários e configurações',
    areas: ['inicio', 'agenda', 'contratos', 'clientes', 'paineis', 'campo', 'artes', 'dinheiro', 'relatorios', 'usuarios', 'config', 'auditoria'],
    edita: '*',
    le: '*',
  },
  comercial: {
    nome: 'Comercial',
    desc: 'Reservas, propostas, contratos, clientes e artes',
    areas: ['inicio', 'agenda', 'contratos', 'clientes', 'paineis', 'artes', 'relatorios'],
    edita: ['reservas', 'clientes', 'contratos', 'artes'],
    le: ['estruturas', 'paineis', 'fotosPonto', 'clientes', 'contratos', 'reservas', 'artes', 'comprovacoes', 'membros'],
  },
  financeiro: {
    nome: 'Financeiro',
    desc: 'Parcelas, cobrança, notas, recorrências e despesas',
    areas: ['inicio', 'agenda', 'contratos', 'clientes', 'dinheiro', 'relatorios'],
    edita: ['lancamentos', 'recorrencias'],
    le: ['estruturas', 'paineis', 'clientes', 'contratos', 'reservas', 'lancamentos', 'recorrencias', 'membros', 'os'],
  },
  operacao: {
    nome: 'Operação',
    desc: 'Roteiro de colagem, fotos, material e manutenção',
    areas: ['inicio', 'campo', 'artes', 'agenda', 'paineis'],
    edita: ['os', 'comprovacoes', 'artes', 'fotosPonto'],
    le: ['estruturas', 'paineis', 'fotosPonto', 'reservas', 'contratos', 'artes', 'os', 'comprovacoes', 'membros'],
  },
  cliente: {
    nome: 'Anunciante',
    desc: 'Portal: acompanha só as próprias campanhas',
    areas: ['portal'],
    edita: [],
    le: [],
  },
};

export const PERFIS_LISTA = Object.keys(PERFIS) as Perfil[];

export const podeEditar = (p: Perfil | null | undefined, r: Recurso) =>
  !!p && (PERFIS[p].edita === '*' || (PERFIS[p].edita as Recurso[]).includes(r));

export const podeLer = (p: Perfil | null | undefined, r: Recurso) =>
  !!p && (PERFIS[p].le === '*' || (PERFIS[p].le as Recurso[]).includes(r) || podeEditar(p, r));

export const podeVer = (p: Perfil | null | undefined, a: Area) => !!p && PERFIS[p].areas.includes(a);
