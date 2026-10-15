import type { CalendarioBI } from './datas';
import type { Perfil } from './perfis';

/** Configurações de cada empresa (guardadas em empresas.config, jsonb). */
export interface ConfigEmpresa {
  empresa: { razao: string; cnpj: string; cidade: string; uf: string; email: string; telefone: string };
  pix: { chave: string; nome: string; cidade: string };
  calendario: CalendarioBI;
  /** Dias que uma opção (pré-reserva) segura a face. */
  opcaoDias: number;
  /** Dias antes da colagem em que a arte precisa chegar. */
  artePrazoDias: number;
  /** Multa padrão por cancelamento, em % do saldo não veiculado. */
  multaPct: number;
  /** Comissão do vendedor, em % de cada parcela recebida. */
  comissaoVendedor: number;
  /** Lança a comissão da agência como despesa quando a parcela é paga. */
  repassarAgencia: boolean;
  /** Desconto máximo sobre a tabela que cada perfil aprova sozinho. */
  limiteDesconto: Partial<Record<Perfil, number>>;
  /** Acréscimo de temporada (meses 1–12). */
  sazonal: { nome: string; mesIni: number; mesFim: number; pct: number }[];
  /** Desconto sugerido por quantidade de faces no contrato. */
  volume: { min: number; pct: number }[];
  /** Dias em relação ao vencimento em que a cobrança é enviada (negativo = antes). */
  regua: number[];
  /** Dias de atraso a partir dos quais o cliente fica bloqueado para novas reservas. */
  bloqueioDias: number;
  nfse: { codigoServico: string; aliquota: number; emissorUrl: string; descricao: string };
  plano: { id: string; status: 'trial' | 'ativo' | 'vencido'; trialAte: string; proximaCobranca: string };
}

export const CONFIG_PADRAO: ConfigEmpresa = {
  empresa: { razao: '', cnpj: '', cidade: '', uf: 'SP', email: '', telefone: '' },
  pix: { chave: '', nome: '', cidade: '' },
  calendario: {},
  opcaoDias: 5,
  artePrazoDias: 7,
  multaPct: 30,
  comissaoVendedor: 5,
  repassarAgencia: true,
  limiteDesconto: { comercial: 15, financeiro: 0, operacao: 0, admin: 100 },
  sazonal: [{ nome: 'Fim de ano', mesIni: 11, mesFim: 12, pct: 20 }],
  volume: [{ min: 4, pct: 5 }, { min: 8, pct: 10 }],
  regua: [-3, 0, 3, 10],
  bloqueioDias: 15,
  nfse: { codigoServico: '17.25', aliquota: 5, emissorUrl: '', descricao: 'Veiculação de mídia exterior' },
  plano: { id: 'pro', status: 'trial', trialAte: '', proximaCobranca: '' },
};

/** Junta o que está salvo com os valores padrão (um nível de profundidade). */
export function mesclarConfig(salvo: Partial<ConfigEmpresa> | null | undefined): ConfigEmpresa {
  const o: any = structuredClone(CONFIG_PADRAO);
  for (const [k, v] of Object.entries(salvo || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) o[k] = { ...o[k], ...v };
    else if (v !== undefined) o[k] = v;
  }
  return o;
}

export const limiteDesconto = (cfg: ConfigEmpresa, perfil: Perfil) =>
  perfil === 'admin' ? 100 : Number(cfg.limiteDesconto?.[perfil] ?? 0);
