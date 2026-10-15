// Envio de WhatsApp. Provedores: Z-API (API não oficial, a mais usada no
// Brasil por exibidoras pequenas) e "simulado" (registra sem enviar).
// Para trocar de provedor, implemente outro "enviar" com a mesma assinatura.
import { digitos } from '@shared';
import { pool, type Db } from '../db';
import { env } from '../env';
import { carregar, type ConfigWhatsapp } from './config';

export interface ResultadoEnvio { ok: boolean; status: 'enviada' | 'simulada' | 'erro'; erro?: string; externoId?: string }

/** Telefone no formato internacional sem símbolos: 5511999990000. */
export function normalizarTelefone(tel: string): string | null {
  let d = digitos(tel);
  if (d.startsWith('0')) d = d.replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return d.length >= 12 && d.length <= 13 ? d : null;
}

async function enviarZapi(cfg: ConfigWhatsapp, telefone: string, texto: string): Promise<ResultadoEnvio> {
  const { instancia, token, clientToken } = cfg.segredos;
  if (!instancia || !token) return { ok: false, status: 'erro', erro: 'Z-API sem instância ou token configurados.' };
  try {
    const r = await fetch(`${env.zapiUrl}/instances/${encodeURIComponent(instancia)}/token/${encodeURIComponent(token)}/send-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(clientToken ? { 'Client-Token': clientToken } : {}) },
      body: JSON.stringify({ phone: telefone, message: texto }),
    });
    const d: any = await r.json().catch(() => ({}));
    if (!r.ok || d?.error) return { ok: false, status: 'erro', erro: d?.error || d?.message || `Z-API respondeu ${r.status}` };
    return { ok: true, status: 'enviada', externoId: d?.messageId || d?.zaapId || d?.id };
  } catch (e: any) {
    return { ok: false, status: 'erro', erro: `Não foi possível falar com a Z-API: ${e.message}` };
  }
}

export async function whatsappAtivo(db: Db, empresaId: string) {
  const cfg = await carregar(db, empresaId, 'whatsapp');
  return { cfg, ativo: cfg.provedor !== 'desligado' };
}

/** Envia e registra no histórico de mensagens. */
export async function enviarWhatsapp(empresaId: string, tel: string, texto: string, opts: { lancamentoId?: string | null; automatica?: boolean; cfg?: ConfigWhatsapp } = {}): Promise<ResultadoEnvio> {
  const cfg = opts.cfg ?? (await carregar(pool, empresaId, 'whatsapp'));
  const telefone = normalizarTelefone(tel);
  let r: ResultadoEnvio;
  if (!telefone) r = { ok: false, status: 'erro', erro: 'Telefone inválido no cadastro do cliente.' };
  else if (cfg.provedor === 'zapi') r = await enviarZapi(cfg, telefone, texto);
  else if (cfg.provedor === 'simulado') r = { ok: true, status: 'simulada' };
  else r = { ok: false, status: 'erro', erro: 'WhatsApp automático desligado. Ative em Configurações → Integrações.' };
  await pool.query(
    `INSERT INTO mensagens (empresa_id, canal, provedor, para, texto, status, erro, externo_id, lancamento_id, automatica)
     VALUES ($1,'whatsapp',$2,$3,$4,$5,$6,$7,$8,$9)`,
    [empresaId, cfg.provedor, telefone || tel || '—', texto, r.status, r.erro ?? null, r.externoId ?? null, opts.lancamentoId ?? null, !!opts.automatica]);
  return r;
}
