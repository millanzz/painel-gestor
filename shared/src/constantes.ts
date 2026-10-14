export type Tom = 'ok' | 'warn' | 'bad' | 'info' | 'neu';

export const TIPOS_PAINEL = [
  ['outdoor', 'Outdoor 9×3 (32 folhas)'],
  ['frontlight', 'Front-light'],
  ['backlight', 'Back-light'],
  ['empena', 'Empena'],
  ['led', 'Painel de LED'],
  ['triedro', 'Triedro'],
] as const;
export type TipoPainel = (typeof TIPOS_PAINEL)[number][0];
export const TIPO_LBL: Record<string, string> = Object.fromEntries(TIPOS_PAINEL.map(([a, b]) => [a, b.replace(/ \(.*/, '')]));

export const OS_TIPOS = [
  ['colagem', 'Colagem / troca de lona'],
  ['retirada', 'Retirada / cobertura'],
  ['conteudo', 'Subir arquivo no LED'],
  ['iluminacao', 'Iluminação'],
  ['estrutura', 'Estrutura'],
  ['limpeza', 'Limpeza / poda'],
  ['vistoria', 'Vistoria'],
] as const;
export const OS_LBL: Record<string, string> = Object.fromEntries(OS_TIPOS);

export const CONTRATO_ST: Record<string, [string, Tom]> = {
  proposta: ['Proposta', 'info'],
  aprovacao: ['Aguardando aprovação', 'warn'],
  aprovada: ['Aprovada', 'info'],
  ativo: ['Ativo', 'ok'],
  encerrado: ['Encerrado', 'neu'],
  cancelado: ['Cancelado', 'bad'],
};
export const CONTRATO_ETAPAS = ['proposta', 'aprovada', 'ativo', 'encerrado'] as const;

export const OS_ST: Record<string, [string, Tom]> = {
  aberta: ['Aberta', 'warn'],
  andamento: ['Em andamento', 'info'],
  concluida: ['Concluída', 'ok'],
};

export const RESERVA_ST: Record<string, [string, Tom]> = {
  reservado: ['Opção', 'info'],
  confirmado: ['Confirmado', 'ok'],
  fila: ['Fila', 'neu'],
  expirada: ['Expirada', 'neu'],
  cancelada: ['Cancelada', 'bad'],
};
/** Situações em que a reserva segura a face. */
export const RESERVA_OCUPA = ['reservado', 'confirmado'] as const;

export const ARTE_ST = [
  ['aguardando', 'Aguardando arte'],
  ['aprovacao', 'Arte em aprovação'],
  ['aprovada', 'Arte aprovada'],
  ['grafica', 'Na gráfica'],
  ['recebido', 'Material recebido'],
] as const;
export const ARTE_LBL: Record<string, string> = Object.fromEntries(ARTE_ST);

export const FIN_CAT = [
  ['contrato', 'Contrato'],
  ['multa', 'Multa'],
  ['aluguel', 'Aluguel de terreno'],
  ['energia', 'Energia'],
  ['licenca', 'Licença / taxa'],
  ['manutencao', 'Manutenção'],
  ['material', 'Material / gráfica'],
  ['comissao', 'Comissão'],
  ['administrativo', 'Administrativo'],
  ['outros', 'Outros'],
] as const;
export const FIN_CAT_LBL: Record<string, string> = Object.fromEntries(FIN_CAT);

export const VERIFICACAO: Record<string, [string, Tom]> = {
  ok: ['No local', 'ok'],
  longe: ['Fora do local', 'bad'],
  sem_gps: ['Sem GPS na foto', 'warn'],
  sem_ponto: ['Ponto sem coordenadas', 'warn'],
};

/** Distância máxima (m) entre a foto e o ponto para considerar "no local". */
export const RAIO_FOTO_M = 150;

export const PLANOS: Record<string, { nome: string; paineis: number; usuarios: number; preco: number }> = {
  essencial: { nome: 'Essencial', paineis: 20, usuarios: 3, preco: 199 },
  pro: { nome: 'Profissional', paineis: 60, usuarios: 10, preco: 449 },
  rede: { nome: 'Rede', paineis: 100000, usuarios: 100000, preco: 990 },
};
