// Configuração das integrações por empresa. Os segredos (tokens) ficam numa
// coluna separada e só saem daqui mascarados.
import { randomBytes } from 'node:crypto';
import { q1, type Db } from '../db';

export type TipoIntegracao = 'whatsapp' | 'nfse';

export interface ConfigWhatsapp {
  provedor: 'desligado' | 'simulado' | 'zapi';
  config: { automatico: boolean; horaIni: number; horaFim: number; avisarFoto: boolean };
  segredos: { instancia?: string; token?: string; clientToken?: string };
}

export interface ConfigNfse {
  provedor: 'manual' | 'simulado' | 'focus';
  config: {
    ambiente: 'homologacao' | 'producao';
    automatica: 'manual' | 'ao_vencer' | 'ao_pagar';
    diasAntes: number;
    inscricaoMunicipal: string;
    codigoMunicipio: string;
    codigoTributarioMunicipio: string;
    optanteSimples: boolean;
    regimeEspecial: number | null;
    issRetido: boolean;
  };
  segredos: { token?: string; webhook?: string };
}

const PADRAO = {
  whatsapp: { provedor: 'desligado', config: { automatico: false, horaIni: 9, horaFim: 18, avisarFoto: true }, segredos: {} } as ConfigWhatsapp,
  nfse: {
    provedor: 'manual',
    config: { ambiente: 'homologacao', automatica: 'manual', diasAntes: 5, inscricaoMunicipal: '', codigoMunicipio: '', codigoTributarioMunicipio: '', optanteSimples: true, regimeEspecial: null, issRetido: false },
    segredos: {},
  } as ConfigNfse,
};

export async function carregar(db: Db, empresaId: string, tipo: 'whatsapp'): Promise<ConfigWhatsapp>;
export async function carregar(db: Db, empresaId: string, tipo: 'nfse'): Promise<ConfigNfse>;
export async function carregar(db: Db, empresaId: string, tipo: TipoIntegracao): Promise<any> {
  const r = await q1<any>(db, 'SELECT provedor, config, segredos FROM integracoes WHERE empresa_id = $1 AND tipo = $2', [empresaId, tipo]);
  const p: any = PADRAO[tipo];
  return { provedor: r?.provedor ?? p.provedor, config: { ...p.config, ...(r?.config || {}) }, segredos: { ...(r?.segredos || {}) } };
}

/** Grava; segredos vazios não apagam os já salvos. */
export async function salvar(db: Db, empresaId: string, tipo: TipoIntegracao, dados: { provedor: string; config: any; segredos?: Record<string, string> }) {
  const atual: any = await carregar(db, empresaId, tipo as any);
  const segredos = { ...atual.segredos };
  for (const [k, v] of Object.entries(dados.segredos || {})) if (v && !String(v).includes('•')) segredos[k] = String(v).trim();
  if (tipo === 'nfse' && !segredos.webhook) segredos.webhook = randomBytes(18).toString('base64url');
  await db.query(
    `INSERT INTO integracoes (empresa_id, tipo, provedor, config, segredos) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (empresa_id, tipo) DO UPDATE SET provedor = EXCLUDED.provedor, config = EXCLUDED.config, segredos = EXCLUDED.segredos, atualizado_em = now()`,
    [empresaId, tipo, dados.provedor, JSON.stringify({ ...atual.config, ...dados.config }), JSON.stringify(segredos)]);
}

export const mascarar = (s: Record<string, string | undefined>) =>
  Object.fromEntries(Object.entries(s).filter(([k]) => k !== 'webhook').map(([k, v]) => [k, v ? `${'•'.repeat(6)}${String(v).slice(-4)}` : '']));
