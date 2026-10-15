// Emissão automática de NFS-e. Provedores: Focus NFe (agregador que fala com
// as prefeituras) e "simulado" (gera um número de teste, para demonstração).
// No modo "manual" o sistema só prepara os dados e o financeiro registra o número.
import { randomBytes } from 'node:crypto';
import { digitos, fdate, mesclarConfig, money, type ConfigEmpresa } from '@shared';
import { pool, q1, type Db } from '../db';
import { env } from '../env';
import { ErroApi } from '../http';
import { carregar, type ConfigNfse } from './config';

const baseFocus = (n: ConfigNfse) => (n.config.ambiente === 'producao' ? env.focusUrl.producao : env.focusUrl.homologacao);
const authFocus = (n: ConfigNfse) => 'Basic ' + Buffer.from(`${n.segredos.token || ''}:`).toString('base64');

async function dadosNota(db: Db, empresaId: string, lancamentoId: string) {
  const l = await q1<any>(db,
    `SELECT l.*, k.numero AS contrato_numero, k.campanha, k.pi_numero,
            c.nome AS cli_nome, c.documento AS cli_doc, c.email AS cli_email, c.telefone AS cli_tel, c.cep AS cli_cep, c.logradouro AS cli_logradouro,
            c.numero AS cli_numero, c.complemento AS cli_complemento, c.bairro AS cli_bairro, c.cidade AS cli_cidade, c.uf AS cli_uf,
            c.codigo_municipio AS cli_municipio, c.inscricao_municipal AS cli_im
       FROM lancamentos l LEFT JOIN contratos k ON k.id = l.contrato_id LEFT JOIN clientes c ON c.id = k.cliente_id
      WHERE l.id = $1 AND l.empresa_id = $2 AND l.excluido_em IS NULL`, [lancamentoId, empresaId]);
  if (!l) throw new ErroApi(404, 'Lançamento não encontrado.');
  const e = await q1<any>(db, 'SELECT config FROM empresas WHERE id = $1', [empresaId]);
  return { l, cfg: mesclarConfig(e?.config) as ConfigEmpresa };
}

/** O que falta no cadastro para emitir. Lista vazia = pode emitir. */
export function faltando(l: any, cfg: ConfigEmpresa, n: ConfigNfse, completo: boolean): string[] {
  const f: string[] = [];
  if (l.tipo !== 'receita') f.push('só receitas têm nota fiscal');
  if (digitos(cfg.empresa.cnpj).length !== 14) f.push('CNPJ da empresa (Configurações → Empresa)');
  const doc = digitos(l.cliDoc || '');
  if (doc.length !== 11 && doc.length !== 14) f.push('CNPJ ou CPF do cliente');
  if (!l.cliNome) f.push('cliente do contrato');
  if (!completo) return f;
  if (!n.config.inscricaoMunicipal) f.push('inscrição municipal da empresa (Integrações → Nota fiscal)');
  if (!/^\d{7}$/.test(n.config.codigoMunicipio || '')) f.push('código IBGE do município da empresa');
  if (!cfg.nfse.codigoServico) f.push('item da lista de serviço (Financeiro → Nota fiscal)');
  if (!l.cliLogradouro || !l.cliCep || !/^\d{7}$/.test(l.cliMunicipio || '')) f.push('endereço completo do cliente, com CEP');
  if (n.provedor === 'focus' && !n.segredos.token) f.push('token da Focus NFe');
  return f;
}

export function payloadFocus(l: any, cfg: ConfigEmpresa, n: ConfigNfse) {
  const doc = digitos(l.cliDoc);
  const agora = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 19) + '-03:00';
  const discriminacao = [
    cfg.nfse.descricao || 'Veiculação de mídia exterior',
    l.campanha ? `Campanha: ${l.campanha}` : '',
    [l.contratoNumero && `Contrato ${l.contratoNumero}`, l.piNumero && `PI ${l.piNumero}`].filter(Boolean).join(' · '),
    l.descricao,
  ].filter(Boolean).join('\n');
  return {
    data_emissao: agora,
    natureza_operacao: 1,
    optante_simples_nacional: !!n.config.optanteSimples,
    ...(n.config.regimeEspecial ? { regime_especial_tributacao: n.config.regimeEspecial } : {}),
    prestador: { cnpj: digitos(cfg.empresa.cnpj), inscricao_municipal: n.config.inscricaoMunicipal, codigo_municipio: n.config.codigoMunicipio },
    tomador: {
      ...(doc.length === 14 ? { cnpj: doc } : { cpf: doc }),
      razao_social: l.cliNome,
      ...(l.cliIm ? { inscricao_municipal: l.cliIm } : {}),
      ...(l.cliEmail ? { email: l.cliEmail } : {}),
      ...(l.cliTel ? { telefone: digitos(l.cliTel) } : {}),
      endereco: {
        logradouro: l.cliLogradouro, numero: l.cliNumero || 'S/N', ...(l.cliComplemento ? { complemento: l.cliComplemento } : {}),
        bairro: l.cliBairro, codigo_municipio: l.cliMunicipio, uf: l.cliUf, cep: digitos(l.cliCep),
      },
    },
    servico: {
      valor_servicos: Number(l.valor),
      aliquota: Number(cfg.nfse.aliquota) || 0,
      iss_retido: !!n.config.issRetido,
      item_lista_servico: cfg.nfse.codigoServico,
      ...(n.config.codigoTributarioMunicipio ? { codigo_tributario_municipio: n.config.codigoTributarioMunicipio } : {}),
      discriminacao,
    },
  };
}

/** Aplica no lançamento a resposta da Focus (consulta ou webhook). */
export async function aplicarRetorno(db: Db, ref: string, d: any, n?: ConfigNfse) {
  const st = d?.status;
  if (st === 'autorizado') {
    const base = n ? baseFocus(n) : '';
    const xml = d.caminho_xml_nota_fiscal ? (String(d.caminho_xml_nota_fiscal).startsWith('http') ? d.caminho_xml_nota_fiscal : base + d.caminho_xml_nota_fiscal) : null;
    await db.query(
      `UPDATE lancamentos SET nf_status = 'emitida', nf_numero = $2, nf_data = COALESCE($3::date, CURRENT_DATE), nf_link = $4, nf_xml = $5, nf_codigo_verificacao = $6, nf_erro = NULL, atualizado_em = now()
        WHERE nf_ref = $1`,
      [ref, d.numero ? String(d.numero) : null, d.data_emissao ? String(d.data_emissao).slice(0, 10) : null, d.url || d.url_danfse || null, xml, d.codigo_verificacao || null]);
    return 'emitida';
  }
  if (st === 'erro_autorizacao') {
    const msg = (d.erros || []).map((e: any) => e.mensagem || e.codigo).join(' · ') || d.mensagem || 'A prefeitura recusou a nota.';
    await db.query(`UPDATE lancamentos SET nf_status = 'erro', nf_erro = $2, atualizado_em = now() WHERE nf_ref = $1`, [ref, msg]);
    return 'erro';
  }
  if (st === 'cancelado') {
    await db.query(`UPDATE lancamentos SET nf_status = 'cancelada', atualizado_em = now() WHERE nf_ref = $1`, [ref]);
    return 'cancelada';
  }
  return 'processando';
}

/** Emite a nota de uma parcela. Retorna a situação depois do envio. */
export async function emitirNota(empresaId: string, lancamentoId: string) {
  const n = await carregar(pool, empresaId, 'nfse');
  if (n.provedor === 'manual') throw new ErroApi(422, 'A emissão automática está desligada. Ative em Configurações → Integrações, ou registre o número da nota manualmente.');
  const { l, cfg } = await dadosNota(pool, empresaId, lancamentoId);
  if (l.nfStatus === 'emitida') throw new ErroApi(409, `Esta parcela já tem a nota ${l.nfNumero}.`);
  if (l.nfStatus === 'processando') throw new ErroApi(409, 'A nota desta parcela já está em processamento na prefeitura.');
  if (l.status === 'cancelado') throw new ErroApi(422, 'Parcela cancelada não recebe nota.');
  const f = faltando(l, cfg, n, n.provedor === 'focus');
  if (f.length) throw new ErroApi(422, `Para emitir a nota, preencha: ${f.join('; ')}.`);
  const ref = `pg${lancamentoId.replace(/-/g, '').slice(0, 12)}${Date.now().toString(36)}`;

  if (n.provedor === 'simulado') {
    const seq = await q1<any>(pool, `SELECT COALESCE(max(nf_numero::int), 9000) + 1 AS n FROM lancamentos WHERE empresa_id = $1 AND nf_simulada AND nf_numero ~ '^\\d+$'`, [empresaId]);
    await pool.query(
      `UPDATE lancamentos SET nf_status = 'emitida', nf_ref = $2, nf_numero = $3, nf_data = CURRENT_DATE, nf_codigo_verificacao = $4, nf_simulada = true, nf_erro = NULL, nf_link = NULL, atualizado_em = now() WHERE id = $1`,
      [lancamentoId, ref, String(seq.n), randomBytes(4).toString('hex').toUpperCase()]);
    return { status: 'emitida', numero: String(seq.n), simulada: true };
  }

  const r = await fetch(`${baseFocus(n)}/v2/nfse?ref=${ref}`, {
    method: 'POST', headers: { Authorization: authFocus(n), 'Content-Type': 'application/json' }, body: JSON.stringify(payloadFocus(l, cfg, n)),
  }).catch((e) => { throw new ErroApi(502, `Não foi possível falar com a Focus NFe: ${e.message}`); });
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = d?.mensagem || (d?.erros || []).map((e: any) => e.mensagem).join(' · ') || `Focus NFe respondeu ${r.status}`;
    await pool.query(`UPDATE lancamentos SET nf_status = 'erro', nf_ref = $2, nf_erro = $3, atualizado_em = now() WHERE id = $1`, [lancamentoId, ref, msg]);
    return { status: 'erro', erro: msg };
  }
  await pool.query(`UPDATE lancamentos SET nf_status = 'processando', nf_ref = $2, nf_erro = NULL, nf_simulada = false, atualizado_em = now() WHERE id = $1`, [lancamentoId, ref]);
  const st = d?.status && d.status !== 'processando_autorizacao' ? await aplicarRetorno(pool, ref, d, n) : 'processando';
  return { status: st };
}

export async function consultarNota(empresaId: string, lancamentoId: string) {
  const n = await carregar(pool, empresaId, 'nfse');
  const l = await q1<any>(pool, 'SELECT nf_ref, nf_status, nf_simulada FROM lancamentos WHERE id = $1 AND empresa_id = $2', [lancamentoId, empresaId]);
  if (!l?.nfRef || l.nfSimulada || n.provedor !== 'focus') return { status: l?.nfStatus ?? null };
  const r = await fetch(`${baseFocus(n)}/v2/nfse/${l.nfRef}`, { headers: { Authorization: authFocus(n) } })
    .catch((e) => { throw new ErroApi(502, `Não foi possível falar com a Focus NFe: ${e.message}`); });
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroApi(502, d?.mensagem || `Focus NFe respondeu ${r.status}`);
  return { status: await aplicarRetorno(pool, l.nfRef, d, n) };
}

export async function cancelarNota(empresaId: string, lancamentoId: string, justificativa: string) {
  const n = await carregar(pool, empresaId, 'nfse');
  const l = await q1<any>(pool, 'SELECT nf_ref, nf_status, nf_simulada FROM lancamentos WHERE id = $1 AND empresa_id = $2', [lancamentoId, empresaId]);
  if (!l || l.nfStatus !== 'emitida') throw new ErroApi(422, 'Só notas emitidas podem ser canceladas.');
  if (l.nfSimulada || !l.nfRef || n.provedor !== 'focus') {
    await pool.query(`UPDATE lancamentos SET nf_status = 'cancelada', nf_erro = $2, atualizado_em = now() WHERE id = $1`, [lancamentoId, `Cancelada: ${justificativa}`]);
    return { status: 'cancelada' };
  }
  const r = await fetch(`${baseFocus(n)}/v2/nfse/${l.nfRef}`, {
    method: 'DELETE', headers: { Authorization: authFocus(n), 'Content-Type': 'application/json' }, body: JSON.stringify({ justificativa }),
  }).catch((e) => { throw new ErroApi(502, `Não foi possível falar com a Focus NFe: ${e.message}`); });
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok || d?.status === 'erro_cancelamento') throw new ErroApi(422, d?.mensagem || (d?.erros || []).map((e: any) => e.mensagem).join(' · ') || 'A prefeitura não aceitou o cancelamento.');
  await pool.query(`UPDATE lancamentos SET nf_status = 'cancelada', atualizado_em = now() WHERE id = $1`, [lancamentoId]);
  return { status: 'cancelada' };
}

/** Texto para conferência ou para colar no emissor da prefeitura (modo manual). */
export function resumoNota(l: any, cfg: ConfigEmpresa) {
  return `Tomador: ${l.clienteNome || ''}${l.clienteDocumento ? ` (${l.clienteDocumento})` : ''}\nServiço: ${cfg.nfse.descricao}${cfg.nfse.codigoServico ? ` · item ${cfg.nfse.codigoServico}` : ''}\nDescrição: ${l.descricao}\nValor: ${money(l.valor)} · vencimento ${fdate(l.vencimento)}\nAlíquota de ISS: ${cfg.nfse.aliquota}%`;
}
