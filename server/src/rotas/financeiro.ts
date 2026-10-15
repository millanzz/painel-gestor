import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { daysIncl, fdate, FIN_CAT, linkWhatsApp, money, pixPayload, today, txidDe } from '@shared';
import { registrar } from '../auditoria';
import { editar, ler, type Ctx } from '../contexto';
import { buscar, rotasCrud, salvar, type DefRecurso } from '../crud';
import { inserir, pool, q, q1, tx } from '../db';
import { aposBaixa } from '../dominio';
import { env } from '../env';
import { enviarCobranca } from '../integracoes/automacoes';
import { cancelarNota, consultarNota, emitirNota } from '../integracoes/nfse';
import { whatsappAtivo } from '../integracoes/whatsapp';
import { carregar } from '../integracoes/config';
import { invalido, naoEncontrado, validar, zData, zDataObrig, zId, zNumObrig, zTexto, zTextoObrig } from '../http';

const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } });

export const defLancamentos: DefRecurso = {
  recurso: 'lancamentos', rota: 'lancamentos', tabela: 'lancamentos', nome: 'Lançamento',
  schema: z.object({
    tipo: z.enum(['receita', 'despesa']), categoria: z.enum(FIN_CAT.map((c) => c[0]) as [string, ...string[]]),
    descricao: zTextoObrig, contratoId: zId, painelId: zId, estruturaId: zId,
    vencimento: zDataObrig, valor: zNumObrig.pipe(z.number().min(0)),
    status: z.enum(['aberto', 'pago', 'cancelado']).default('aberto'), pagoEm: zData,
    nfStatus: z.preprocess((v) => (v === '' ? null : v), z.enum(['a_emitir', 'processando', 'emitida', 'erro', 'cancelada']).nullable().optional()),
    nfNumero: zTexto, nfData: zData, nfLink: zTexto,
  }),
  select: `SELECT t.*, k.numero AS contrato_numero, c.nome AS cliente_nome, c.telefone AS cliente_telefone, c.contato AS cliente_contato,
                  c.documento AS cliente_documento, p.codigo AS painel_codigo,
                  (SELECT json_agg(json_build_object('etapa', cb.etapa, 'enviadaEm', cb.enviada_em) ORDER BY cb.etapa) FROM cobrancas cb WHERE cb.lancamento_id = t.id) AS cobrancas
             FROM lancamentos t LEFT JOIN contratos k ON k.id = t.contrato_id LEFT JOIN clientes c ON c.id = k.cliente_id
             LEFT JOIN paineis p ON p.id = t.painel_id`,
  ordem: 't.vencimento, t.descricao',
  rotulo: (r) => r.descricao,
  contratoDe: (r) => r.contratoId,
  async antes(_c, _ctx, d, anterior) {
    const st = d.status ?? anterior?.status;
    if (st === 'pago' && !d.pagoEm && !anterior?.pagoEm) d.pagoEm = today();
    if (st !== 'pago' && d.status) d.pagoEm = null;
    const tipo = d.tipo ?? anterior?.tipo;
    if (tipo === 'despesa') d.nfStatus = null;
    else if (!anterior && d.nfStatus === undefined && d.categoria !== 'comissao') d.nfStatus = 'a_emitir';
  },
  async depois(c, ctx, f, anterior) {
    if (f.status === 'pago' && anterior?.status !== 'pago') await aposBaixa(c, ctx, f);
  },
  filtro(req, params) {
    let s = '';
    const add = (col: string, v: unknown, op = '=') => { params.push(v); s += ` AND ${col} ${op} $${params.length}`; };
    if (req.query.tipo) add('t.tipo', req.query.tipo);
    if (req.query.status) add('t.status', req.query.status);
    if (req.query.categoria) add('t.categoria', req.query.categoria);
    if (req.query.contrato) add('t.contrato_id', req.query.contrato);
    if (req.query.de) add('t.vencimento', req.query.de, '>=');
    if (req.query.ate) add('t.vencimento', req.query.ate, '<=');
    if (req.query.nfStatus) add('t.nf_status', req.query.nfStatus);
    if (req.query.nf === 'pendente') s += ` AND t.tipo = 'receita' AND t.status <> 'cancelado' AND COALESCE(t.nf_status, 'a_emitir') IN ('a_emitir', 'processando', 'erro', 'cancelada') AND t.categoria <> 'comissao'`;
    return s;
  },
};

/** Etapa da régua de cobrança em que a parcela está hoje (null = ainda não é hora). */
export function etapaCobranca(regua: number[], vencimento: string, hoje = today()) {
  const dias = daysIncl(vencimento, hoje) - 1;
  let etapa: number | null = null;
  for (const s of [...regua].map(Number).filter((x) => !isNaN(x)).sort((a, b) => a - b)) if (dias >= s) etapa = s;
  return { dias, etapa };
}

export function mensagemCobranca(ctx: Ctx, f: any, etapa: number) {
  const quando = etapa < 0 ? `vence em ${-etapa} dia(s), no dia ${fdate(f.vencimento)}` : etapa === 0 ? `vence hoje (${fdate(f.vencimento)})` : `venceu em ${fdate(f.vencimento)} e consta em aberto`;
  const pix = ctx.cfg.pix.chave ? `\n\nPIX copia e cola:\n${pixPayload(ctx.cfg.pix, f.valor, txidDe(f.id))}` : '';
  const nome = f.clienteContato ? ', ' + String(f.clienteContato).split(' ')[0] : '';
  return `Olá${nome}! Aqui é da ${ctx.cfg.empresa.razao || 'exibidora'}. A parcela "${f.descricao}" no valor de ${money(f.valor)} ${quando}.${pix}\n\nSe já pagou, por favor desconsidere. Acompanhe suas campanhas no portal: ${env.appUrl}`;
}

async function baixar(c: any, ctx: Ctx, id: string, data: string) {
  return salvar(defLancamentos, ctx, { status: 'pago', pagoEm: data }, id, c);
}

export const rotasLancamentos = rotasCrud(defLancamentos, (r) => {
  r.post('/:id/baixar', editar('lancamentos'), async (req, res) => {
    const { data } = validar(z.object({ data: zDataObrig.default(today()) }), req.body || {});
    res.json(await baixar(undefined, req.ctx!, String(req.params.id), data));
  });

  r.post('/:id/nf', editar('lancamentos'), async (req, res) => {
    const d = validar(z.object({ numero: zTextoObrig, data: zDataObrig, link: zTexto }), req.body);
    res.json(await salvar(defLancamentos, req.ctx!, { nfStatus: 'emitida', nfNumero: d.numero, nfData: d.data, nfLink: d.link }, String(req.params.id)));
  });

  /* ---- nota fiscal automática ---- */
  r.post('/:id/nf/emitir', editar('lancamentos'), async (req, res) => {
    const ctx = req.ctx!;
    const out = await emitirNota(ctx.empresaId, String(req.params.id));
    const l = await buscar<any>(pool, defLancamentos, ctx.empresaId, String(req.params.id));
    await registrar(pool, ctx, out.status === 'erro' ? 'tentou emitir nota' : 'emitiu nota', 'lancamentos', l, { rotulo: l.descricao, contratoId: l.contratoId });
    res.json({ ...out, lancamento: l });
  });
  r.post('/:id/nf/consultar', ler('lancamentos'), async (req, res) => {
    const out = await consultarNota(req.ctx!.empresaId, String(req.params.id));
    res.json({ ...out, lancamento: await buscar(pool, defLancamentos, req.ctx!.empresaId, String(req.params.id)) });
  });
  r.post('/:id/nf/cancelar', editar('lancamentos'), async (req, res) => {
    const ctx = req.ctx!;
    const { justificativa } = validar(z.object({ justificativa: z.string().trim().min(15, 'a prefeitura exige pelo menos 15 caracteres') }), req.body);
    const out = await cancelarNota(ctx.empresaId, String(req.params.id), justificativa);
    const l = await buscar<any>(pool, defLancamentos, ctx.empresaId, String(req.params.id));
    await registrar(pool, ctx, 'cancelou nota', 'lancamentos', l, { rotulo: `${l.descricao} · nota ${l.nfNumero}`, contratoId: l.contratoId });
    res.json(out);
  });

  r.get('/:id/pix', ler('lancamentos'), async (req, res) => {
    const ctx = req.ctx!;
    const f = await buscar<any>(pool, defLancamentos, ctx.empresaId, String(req.params.id));
    if (!f) throw naoEncontrado('Lançamento');
    if (!ctx.cfg.pix.chave) throw invalido('Cadastre a chave PIX em Configurações → Financeiro.');
    res.json({ payload: pixPayload(ctx.cfg.pix, f.valor, txidDe(f.id)), valor: f.valor, descricao: f.descricao });
  });
});

export const financeiro = Router();

/** Resumo para a tela Dinheiro: totais e fluxo de caixa das próximas 6 semanas. */
financeiro.get('/resumo', ler('lancamentos'), async (req, res) => {
  const e = req.ctx!.empresaId;
  const t = await q1<any>(pool,
    `SELECT
       COALESCE(sum(valor) FILTER (WHERE tipo='receita' AND status='aberto' AND vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + 30),0) AS a_receber_30,
       count(*) FILTER (WHERE tipo='receita' AND status='aberto' AND vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + 30)::int AS n_receber_30,
       COALESCE(sum(valor) FILTER (WHERE tipo='receita' AND status='aberto' AND vencimento < CURRENT_DATE),0) AS atrasado,
       count(*) FILTER (WHERE tipo='receita' AND status='aberto' AND vencimento < CURRENT_DATE)::int AS n_atrasado,
       COALESCE(sum(valor) FILTER (WHERE tipo='receita' AND status='pago' AND date_trunc('month', pago_em) = date_trunc('month', CURRENT_DATE)),0) AS recebido_mes,
       COALESCE(sum(valor) FILTER (WHERE tipo='despesa' AND status='aberto' AND vencimento <= CURRENT_DATE + 30),0) AS a_pagar_30
     FROM lancamentos WHERE empresa_id = $1 AND excluido_em IS NULL`, [e]);
  const semanas = await q<any>(pool,
    `WITH s AS (SELECT generate_series(0, 5) AS i)
     SELECT s.i, (date_trunc('week', CURRENT_DATE) + s.i * interval '7 days')::date AS ini,
            COALESCE(sum(l.valor) FILTER (WHERE l.tipo = 'receita'), 0) AS entradas,
            COALESCE(sum(l.valor) FILTER (WHERE l.tipo = 'despesa'), 0) AS saidas
       FROM s LEFT JOIN lancamentos l ON l.empresa_id = $1 AND l.excluido_em IS NULL AND l.status = 'aberto'
        AND l.vencimento >= date_trunc('week', CURRENT_DATE) + s.i * interval '7 days'
        AND l.vencimento <  date_trunc('week', CURRENT_DATE) + (s.i + 1) * interval '7 days'
      GROUP BY s.i ORDER BY s.i`, [e]);
  res.json({ ...t, semanas });
});

/** Como as notas são emitidas nesta empresa (para a tela do financeiro). */
financeiro.get('/nf-config', ler('lancamentos'), async (req, res) => {
  const n = await carregar(pool, req.ctx!.empresaId, 'nfse');
  res.json({ provedor: n.provedor, automatica: n.config.automatica, diasAntes: n.config.diasAntes, ambiente: n.config.ambiente });
});

/** Fila de cobrança do dia, conforme a régua configurada. */
financeiro.get('/cobrar', ler('lancamentos'), async (req, res) => {
  const ctx = req.ctx!;
  const abertas = await q<any>(pool, `${defLancamentos.select} WHERE t.empresa_id = $1 AND t.tipo = 'receita' AND t.status = 'aberto' AND t.categoria <> 'comissao' AND t.excluido_em IS NULL ORDER BY t.vencimento`, [ctx.empresaId]);
  const { ativo, cfg } = await whatsappAtivo(pool, ctx.empresaId);
  const out = [];
  for (const f of abertas) {
    const { dias, etapa } = etapaCobranca(ctx.cfg.regua, f.vencimento);
    if (etapa == null) continue;
    const enviada = (f.cobrancas || []).some((cb: any) => cb.etapa === etapa);
    const msg = mensagemCobranca(ctx, f, etapa);
    out.push({ lancamento: f, dias, etapa, enviada, mensagem: msg, whatsapp: f.clienteTelefone ? linkWhatsApp(f.clienteTelefone, msg) : null, envioAutomatico: ativo ? cfg.provedor : null, automatico: ativo && cfg.config.automatico });
  }
  res.json(out);
});

/** Envia a cobrança pelo WhatsApp automático (Z-API ou simulado). */
financeiro.post('/cobrancas/enviar', editar('lancamentos'), async (req, res) => {
  const ctx = req.ctx!;
  const d = validar(z.object({ lancamentoId: z.string().uuid(), etapa: z.number().int() }), req.body);
  const f = await buscar<any>(pool, defLancamentos, ctx.empresaId, d.lancamentoId);
  if (!f) throw naoEncontrado('Lançamento');
  if (!f.clienteTelefone) throw invalido('O cliente não tem telefone cadastrado.');
  const r = await enviarCobranca(ctx, f, d.etapa, false);
  if (!r.ok) throw invalido(r.erro || 'Não foi possível enviar.');
  await registrar(pool, ctx, 'enviou cobrança', 'lancamentos', f, { rotulo: `${f.descricao} · WhatsApp${r.status === 'simulada' ? ' (simulado)' : ''}`, contratoId: f.contratoId });
  res.json(r);
});

financeiro.post('/cobrancas', editar('lancamentos'), async (req, res) => {
  const ctx = req.ctx!;
  const d = validar(z.object({ lancamentoId: z.string().uuid(), etapa: z.number().int(), canal: z.string().default('whatsapp') }), req.body);
  await tx(async (c) => {
    const f = await buscar<any>(c, defLancamentos, ctx.empresaId, d.lancamentoId);
    if (!f) throw naoEncontrado('Lançamento');
    await c.query(`INSERT INTO cobrancas (empresa_id, lancamento_id, etapa, canal, membro_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (lancamento_id, etapa) DO NOTHING`, [ctx.empresaId, f.id, d.etapa, d.canal, ctx.membroId]);
    await registrar(c, ctx, 'enviou cobrança', 'lancamentos', f, { rotulo: f.descricao, contratoId: f.contratoId });
  });
  res.status(204).end();
});

/** Lança as despesas recorrentes de um mês (ex.: 2026-10). Não duplica. */
financeiro.post('/recorrencias/gerar', editar('lancamentos'), async (req, res) => {
  const ctx = req.ctx!;
  const { competencia } = validar(z.object({ competencia: z.string().regex(/^\d{4}-\d{2}$/).default(today().slice(0, 7)) }), req.body || {});
  const n = await tx(async (c) => {
    const rs = await q<any>(c, `SELECT * FROM recorrencias r WHERE r.empresa_id = $1 AND r.ativo AND r.excluido_em IS NULL
                                  AND NOT EXISTS (SELECT 1 FROM lancamentos l WHERE l.recorrencia_id = r.id AND l.competencia = $2 AND l.excluido_em IS NULL)`, [ctx.empresaId, competencia]);
    const [y, m] = competencia.split('-').map(Number);
    const ultimo = new Date(y, m, 0).getDate();
    for (const r of rs) {
      await inserir(c, 'lancamentos', {
        empresaId: ctx.empresaId, tipo: 'despesa', categoria: r.categoria, descricao: `${r.descricao} · ${String(m).padStart(2, '0')}/${y}`,
        estruturaId: r.estruturaId, painelId: r.painelId, vencimento: `${competencia}-${String(Math.min(r.dia, ultimo)).padStart(2, '0')}`,
        valor: r.valor, status: 'aberto', recorrenciaId: r.id, competencia,
      }, ['empresaId', 'tipo', 'categoria', 'descricao', 'estruturaId', 'painelId', 'vencimento', 'valor', 'status', 'recorrenciaId', 'competencia']);
    }
    if (rs.length) await registrar(c, ctx, 'lançou recorrências', 'lancamentos', null, { rotulo: `${rs.length} despesa(s) de ${competencia}` });
    return rs.length;
  });
  res.json({ n });
});

/* ---- conciliação bancária (extrato OFX ou CSV) ---- */
export function lerExtrato(txt: string) {
  const out: { data: string; valor: number; desc: string }[] = [];
  if (/<OFX>|<STMTTRN>/i.test(txt)) {
    const re = /<STMTTRN>([\s\S]*?)(<\/STMTTRN>|(?=<STMTTRN>)|<\/BANKTRANLIST>)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(txt))) {
      const b = m[1];
      const g = (t: string) => { const r = new RegExp('<' + t + '>([^<\\r\\n]*)', 'i').exec(b); return r ? r[1].trim() : ''; };
      const v = parseFloat(g('TRNAMT').replace(',', '.'));
      const d = g('DTPOSTED');
      if (!isNaN(v) && d) out.push({ data: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, valor: v, desc: g('MEMO') || g('NAME') });
    }
    return out;
  }
  const linhas = txt.split(/\r?\n/).filter((l) => l.trim());
  if (!linhas.length) return out;
  const sep = (linhas[0].match(/;/g) || []).length >= (linhas[0].match(/,/g) || []).length ? ';' : ',';
  for (const l of linhas) {
    const c = l.split(sep).map((s) => s.replace(/^"|"$/g, '').trim());
    const di = c.findIndex((s) => /^\d{2}\/\d{2}\/\d{4}$|^\d{4}-\d{2}-\d{2}$/.test(s));
    if (di < 0) continue;
    let vi = -1;
    for (let i = c.length - 1; i >= 0; i--) if (i !== di && /^-?R?\$?\s?-?[\d.]+,\d{2}$|^-?\d+(\.\d{1,2})?$/.test(c[i])) { vi = i; break; }
    if (vi < 0) continue;
    let vs = c[vi].replace(/R\$|\s/g, '');
    vs = /,\d{2}$/.test(vs) ? vs.replace(/\./g, '').replace(',', '.') : vs;
    const ds = c[di];
    out.push({ data: ds.includes('/') ? ds.split('/').reverse().join('-') : ds, valor: parseFloat(vs), desc: c.filter((_, i) => i !== di && i !== vi).join(' ') });
  }
  return out;
}

financeiro.post('/conciliacao', editar('lancamentos'), upload.single('arquivo'), async (req, res) => {
  const ctx = req.ctx!;
  const txt = req.file ? req.file.buffer.toString('latin1') : String(req.body?.texto || '');
  const tx_ = lerExtrato(txt).filter((t) => t.valor > 0);
  const abertas = await q<any>(pool, `${defLancamentos.select} WHERE t.empresa_id = $1 AND t.tipo = 'receita' AND t.status = 'aberto' AND t.excluido_em IS NULL`, [ctx.empresaId]);
  const usadas = new Set<string>();
  const itens = tx_.map((t) => {
    let f = abertas.find((x) => !usadas.has(x.id) && t.desc && t.desc.toUpperCase().includes(txidDe(x.id)));
    let motivo = 'identificador do PIX';
    if (!f) {
      f = abertas.filter((x) => !usadas.has(x.id) && Math.abs(x.valor - t.valor) < 0.01)
        .sort((a, b) => Math.abs(daysIncl(a.vencimento, t.data)) - Math.abs(daysIncl(b.vencimento, t.data)))[0];
      motivo = f ? `mesmo valor, ${Math.abs(daysIncl(f.vencimento, t.data) - 1)} dia(s) do vencimento` : '';
    }
    if (f) usadas.add(f.id);
    return { transacao: t, lancamento: f || null, motivo };
  });
  res.json({ lidas: tx_.length, itens });
});

financeiro.post('/conciliacao/confirmar', editar('lancamentos'), async (req, res) => {
  const { itens } = validar(z.object({ itens: z.array(z.object({ lancamentoId: z.string().uuid(), data: zDataObrig })).min(1) }), req.body);
  await tx(async (c) => { for (const i of itens) await baixar(c, req.ctx!, i.lancamentoId, i.data); });
  res.json({ n: itens.length });
});
