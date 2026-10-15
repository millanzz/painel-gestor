// Envio de e-mail. Com RESEND_API_KEY usa a API do Resend; sem ela, só
// registra no histórico e no log do servidor (útil em desenvolvimento).
import { env } from '../env';
import { pool } from '../db';

export interface Email { para: string; assunto: string; html: string; texto: string; empresaId?: string | null }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Modelo simples e legível em qualquer cliente de e-mail. */
export function modelo(titulo: string, paragrafos: string[], botao?: { texto: string; url: string }) {
  const corpo = paragrafos.map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:22px;color:#161A1F">${esc(p)}</p>`).join('');
  const btn = botao ? `<p style="margin:24px 0"><a href="${botao.url}" style="display:inline-block;background:#2346D6;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">${esc(botao.texto)}</a></p><p style="font-size:12px;color:#6F7782">Se o botão não abrir, copie este endereço: ${esc(botao.url)}</p>` : '';
  const html = `<!doctype html><html><body style="margin:0;background:#F3F4F6;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif"><div style="max-width:520px;margin:32px auto;background:#fff;border-radius:12px;padding:32px"><h1 style="margin:0 0 20px;font-size:20px;color:#161A1F">${esc(titulo)}</h1>${corpo}${btn}<p style="margin-top:32px;font-size:12px;color:#8C929C">Painel Gestor · gestão de mídia exterior</p></div></body></html>`;
  const texto = [titulo, '', ...paragrafos, ...(botao ? ['', `${botao.texto}: ${botao.url}`] : [])].join('\n');
  return { html, texto };
}

export async function enviarEmail(m: Email): Promise<{ ok: boolean; simulado: boolean; erro?: string }> {
  let status: 'enviada' | 'simulada' | 'erro' = 'simulada', erro: string | undefined, externo: string | undefined;
  if (env.resendKey) {
    try {
      const r = await fetch(`${env.resendUrl}/emails`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: env.emailDe, to: [m.para], subject: m.assunto, html: m.html, text: m.texto }),
      });
      const d: any = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.message || `HTTP ${r.status}`);
      status = 'enviada'; externo = d?.id;
    } catch (e: any) {
      status = 'erro'; erro = e.message;
      console.error('[email]', e.message);
    }
  } else {
    console.log(`[email simulado] para ${m.para}: ${m.assunto}\n${m.texto}`);
  }
  await pool.query(
    `INSERT INTO mensagens (empresa_id, canal, provedor, para, assunto, texto, status, erro, externo_id) VALUES ($1,'email',$2,$3,$4,$5,$6,$7,$8)`,
    [m.empresaId ?? null, env.resendKey ? 'resend' : 'simulado', m.para, m.assunto, m.texto, status, erro ?? null, externo ?? null]).catch(() => {});
  return { ok: status !== 'erro', simulado: status === 'simulada', erro };
}
