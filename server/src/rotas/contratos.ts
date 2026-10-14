import { z } from 'zod';
import {
  addDays, daysIncl, dividirParcelas, isoOf, limiteDesconto, pct, round2, saldoNaoVeiculado, tabelaPeriodo, today,
} from '@shared';
import { registrar } from '../auditoria';
import { editar, ler, soAdmin, type Ctx } from '../contexto';
import { buscar, rotasCrud, salvar, type DefRecurso } from '../crud';
import { inserir, pool, q, q1, tx } from '../db';
import {
  clienteBloqueado, conflitos, garantirArte, mapaPrecos, proxNumero, reservasDoContrato, resumoContrato, sincronizarOS,
} from '../dominio';
import type { PoolClient } from 'pg';
import { invalido, naoEncontrado, validar, zData, zDataObrig, zId, zNum, zTexto, zTextoObrig } from '../http';
import { defReservas } from './reservas';

export const defContratos: DefRecurso = {
  recurso: 'contratos', rota: 'contratos', tabela: 'contratos', nome: 'Contrato',
  schema: z.object({
    numero: zTexto, clienteId: z.string().uuid('escolha o cliente'), agenciaId: zId, vendedorId: zId,
    campanha: zTextoObrig, data: zData, valor: zNum, validadeProposta: zData, condicoes: zTexto, obs: zTexto,
  }),
  select: `SELECT t.*, c.nome AS cliente_nome, a.nome AS agencia_nome, m.nome AS vendedor_nome,
                  per.ini, per.fim, per.n_faces,
                  (SELECT COALESCE(sum(l.valor),0) FROM lancamentos l WHERE l.contrato_id = t.id AND l.tipo = 'receita' AND l.status = 'pago' AND l.excluido_em IS NULL) AS recebido
             FROM contratos t
             JOIN clientes c ON c.id = t.cliente_id
             LEFT JOIN clientes a ON a.id = t.agencia_id
             LEFT JOIN membros m ON m.id = t.vendedor_id
             LEFT JOIN LATERAL (SELECT min(r.ini) AS ini, max(r.fim) AS fim, count(DISTINCT r.painel_id)::int AS n_faces
                                  FROM reservas r WHERE r.contrato_id = t.id AND r.excluido_em IS NULL
                                   AND r.status IN ('reservado','confirmado')) per ON true`,
  ordem: 't.data DESC, t.numero DESC',
  rotulo: (r) => `${r.numero} · ${r.campanha}`,
  contratoDe: (r) => r.id,
  async antes(c, ctx, d, anterior) {
    if (!anterior) {
      d.numero = d.numero || (await proxNumero(c, ctx.empresaId, 'CT', 'numero'));
      d.data = d.data || today();
      d.valor = d.valor ?? 0;
      d.validadeProposta = d.validadeProposta || addDays(today(), 10);
      if (ctx.perfil !== 'admin' && (await clienteBloqueado(c, ctx, d.clienteId))) throw invalido('Cliente bloqueado por atraso nos pagamentos. Peça a um administrador.');
      if (!d.vendedorId && (ctx.perfil === 'comercial' || ctx.perfil === 'admin')) d.vendedorId = ctx.membroId;
      return;
    }
    if (d.numero === '') delete d.numero;
    // Depois de aprovado, quem não é admin não pode baixar o valor além do próprio limite.
    if (d.valor != null && ctx.perfil !== 'admin' && ['aprovada', 'ativo'].includes(anterior.status) && d.valor < anterior.valor) {
      const rs = await resumoContrato(c, ctx, { ...anterior, valor: d.valor });
      const lim = limiteDesconto(ctx.cfg, ctx.perfil);
      if (rs.desconto > lim + 0.01) throw invalido(`Desconto de ${pct(rs.desconto)} acima do seu limite de ${pct(lim)}.`);
    }
  },
  filtro(req, params) {
    let s = '';
    if (req.query.status) { params.push(String(req.query.status).split(',')); s += ` AND t.status = ANY($${params.length})`; }
    if (req.query.cliente) { params.push(req.query.cliente); s += ` AND (t.cliente_id = $${params.length} OR t.agencia_id = $${params.length})`; }
    return s;
  },
};

async function carregar(c: PoolClient | typeof pool, ctx: Ctx, id: string) {
  const k = await buscar<any>(c, defContratos, ctx.empresaId, id);
  if (!k) throw naoEncontrado('Contrato');
  return k;
}

async function mudarStatus(c: PoolClient, ctx: Ctx, k: any, campos: Record<string, any>, acao = 'alterou') {
  const sets = Object.keys(campos).map((key, i) => `${key.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase())} = $${i + 3}`);
  await c.query(`UPDATE contratos SET ${sets.join(', ')}, atualizado_em = now() WHERE id = $1 AND empresa_id = $2`, [k.id, ctx.empresaId, ...Object.values(campos)]);
  const depois = { ...k, ...campos };
  await registrar(c, ctx, acao, 'contratos', k, { antes: k, depois, rotulo: `${k.numero} · ${k.campanha}`, contratoId: k.id });
}

/** Simulação do cancelamento: saldo não veiculado, multa e parcelas que caem. */
async function simularCancelamento(c: PoolClient | typeof pool, ctx: Ctx, k: any, data: string, multaPct: number) {
  const rsm = await resumoContrato(c, ctx, k);
  const precos = await mapaPrecos(c, ctx.empresaId);
  const saldo = saldoNaoVeiculado(ctx.cfg, rsm.valor, rsm.tabela, rsm.reservas, precos, data);
  const multa = round2((saldo * multaPct) / 100);
  const abertas = await q<any>(c, `SELECT id, descricao, valor, vencimento FROM lancamentos WHERE contrato_id = $1 AND tipo = 'receita' AND status = 'aberto' AND vencimento >= $2 AND excluido_em IS NULL`, [k.id, data]);
  return { data, multaPct, saldo, multa, abertas, totalAbertas: round2(abertas.reduce((s, f) => s + f.valor, 0)) };
}

export const rotasContratos = rotasCrud(defContratos, (r) => {
  /** Tudo o que a tela do contrato precisa numa chamada. */
  r.get('/:id/completo', ler('contratos'), async (req, res) => {
    const ctx = req.ctx!;
    const k = await carregar(pool, ctx, String(req.params.id));
    const rsm = await resumoContrato(pool, ctx, k);
    const reservas = await q<any>(pool, `${defReservas.select} WHERE t.contrato_id = $1 AND t.empresa_id = $2 AND t.excluido_em IS NULL ORDER BY t.status = 'fila', t.ini, p.codigo`, [k.id, ctx.empresaId]);
    const precos = await mapaPrecos(pool, ctx.empresaId);
    for (const x of reservas) { const p = precos.get(x.painelId); x.tabela = p ? tabelaPeriodo(ctx.cfg, p, x.ini, x.fim, x.slots) : 0; }
    const lancamentos = ctx.perfil === 'operacao' ? [] : await q(pool, `SELECT * FROM lancamentos WHERE contrato_id = $1 AND excluido_em IS NULL ORDER BY vencimento`, [k.id]);
    const arte = await q1(pool, 'SELECT * FROM artes WHERE contrato_id = $1 AND excluido_em IS NULL', [k.id]);
    const fotos = await q(pool, `SELECT f.*, p.codigo AS painel_codigo FROM comprovacoes f JOIN paineis p ON p.id = f.painel_id WHERE f.contrato_id = $1 AND f.excluido_em IS NULL ORDER BY f.data DESC`, [k.id]);
    const atividade = await q(pool, `SELECT quando, autor_nome, acao, tabela, rotulo, mudancas FROM auditoria WHERE empresa_id = $1 AND contrato_id = $2 ORDER BY quando DESC LIMIT 30`, [ctx.empresaId, k.id]);
    const { reservas: _r, ...calculo } = rsm;
    res.json({ contrato: k, reservas, calculo, lancamentos, arte, fotos, atividade, limite: limiteDesconto(ctx.cfg, ctx.perfil) });
  });

  /** Aprova a proposta. Desconto acima do limite do perfil vai para o administrador. */
  r.post('/:id/aprovar', editar('contratos'), async (req, res) => {
    const ctx = req.ctx!;
    const out = await tx(async (c) => {
      const k = await carregar(c, ctx, String(req.params.id));
      if (!['proposta'].includes(k.status)) throw invalido('Só propostas podem ser aprovadas.');
      const rsm = await resumoContrato(c, ctx, k);
      if (!rsm.reservas.length) throw invalido('Adicione faces antes de aprovar.');
      const lim = limiteDesconto(ctx.cfg, ctx.perfil);
      if (rsm.desconto > lim + 0.01) {
        await mudarStatus(c, ctx, k, { status: 'aprovacao', valorTabela: rsm.tabela }, 'pediu aprovação do desconto');
        return { status: 'aprovacao', mensagem: `Desconto de ${pct(rsm.desconto)} acima do seu limite (${pct(lim)}). Enviado para o administrador aprovar.` };
      }
      await mudarStatus(c, ctx, k, { status: 'aprovada', valorTabela: rsm.tabela, aprovadoEm: today() }, 'aprovou a proposta');
      await garantirArte(c, ctx, k.id);
      return { status: 'aprovada', mensagem: 'Proposta aprovada. Emita o PI para confirmar as faces.' };
    });
    res.json(out);
  });

  r.post('/:id/desconto', soAdmin, async (req, res) => {
    const ctx = req.ctx!;
    const { aprovar } = validar(z.object({ aprovar: z.boolean() }), req.body);
    await tx(async (c) => {
      const k = await carregar(c, ctx, String(req.params.id));
      if (k.status !== 'aprovacao') throw invalido('Este contrato não está aguardando aprovação.');
      if (aprovar) {
        await mudarStatus(c, ctx, k, { status: 'aprovada', aprovadoEm: today(), descontoAprovadoPor: ctx.autorNome }, 'aprovou desconto');
        await garantirArte(c, ctx, k.id);
      } else {
        await mudarStatus(c, ctx, k, { status: 'proposta' }, 'recusou desconto');
      }
    });
    res.json({ ok: true });
  });

  /** Emite o PI: confirma as opções, numera o PI e gera as ordens de colagem. */
  r.post('/:id/emitir-pi', editar('contratos'), async (req, res) => {
    const ctx = req.ctx!;
    const out = await tx(async (c) => {
      const k = await carregar(c, ctx, String(req.params.id));
      if (k.status !== 'aprovada') throw invalido('Aprove a proposta antes de emitir o PI.');
      const rs = await reservasDoContrato(c, ctx.empresaId, k.id);
      const ocupadas: string[] = [];
      for (const r of rs.filter((x: any) => x.status === 'reservado')) {
        const cf = await conflitos(c, ctx.empresaId, { ...r, status: 'confirmado' });
        if (cf.lista.length) ocupadas.push(r.painelCodigo);
      }
      if (ocupadas.length) throw invalido(`Não foi possível confirmar: ${ocupadas.join(', ')} ficou ocupada. Troque a face ou mova para a fila.`);
      const piNumero = await proxNumero(c, ctx.empresaId, 'PI', 'pi_numero');
      for (const r of rs.filter((x: any) => x.status === 'reservado')) {
        await c.query(`UPDATE reservas SET status = 'confirmado', validade = NULL, atualizado_em = now() WHERE id = $1`, [r.id]);
        await sincronizarOS(c, ctx, { ...r, status: 'confirmado' });
      }
      await mudarStatus(c, ctx, k, { status: 'ativo', piNumero, piData: today() }, 'emitiu PI');
      await garantirArte(c, ctx, k.id);
      return { piNumero };
    });
    res.json(out);
  });

  r.get('/:id/cancelamento', ler('contratos'), async (req, res) => {
    const ctx = req.ctx!;
    const k = await carregar(pool, ctx, String(req.params.id));
    const data = String(req.query.data || today());
    const multa = req.query.multa != null ? Number(req.query.multa) : (k.status === 'ativo' ? ctx.cfg.multaPct : 0);
    res.json(await simularCancelamento(pool, ctx, k, data, multa));
  });

  r.post('/:id/cancelar', editar('contratos'), async (req, res) => {
    const ctx = req.ctx!;
    const d = validar(z.object({ data: zDataObrig, multaPct: z.number().min(0).max(100), motivo: zTexto }), req.body);
    await tx(async (c) => {
      const k = await carregar(c, ctx, String(req.params.id));
      if (['cancelado', 'encerrado'].includes(k.status)) throw invalido('Este contrato já foi encerrado.');
      const sim = await simularCancelamento(c, ctx, k, d.data, d.multaPct);
      const todas = await reservasDoContrato(c, ctx.empresaId, k.id, true);
      for (const r of todas) {
        if (r.ini >= d.data || r.status !== 'confirmado') {
          await c.query(`UPDATE reservas SET status = 'cancelada', atualizado_em = now() WHERE id = $1`, [r.id]);
          await sincronizarOS(c, ctx, { ...r, status: 'cancelada' });
        } else if (r.fim >= d.data) {
          const fim = addDays(d.data, -1);
          await c.query('UPDATE reservas SET fim = $2, atualizado_em = now() WHERE id = $1', [r.id, fim]);
          await sincronizarOS(c, ctx, { ...r, fim });
        }
      }
      for (const f of sim.abertas) await c.query(`UPDATE lancamentos SET status = 'cancelado', atualizado_em = now() WHERE id = $1`, [f.id]);
      if (sim.multa > 0) {
        await inserir(c, 'lancamentos', {
          empresaId: ctx.empresaId, tipo: 'receita', categoria: 'multa', descricao: `${k.numero} · multa por cancelamento`,
          contratoId: k.id, vencimento: addDays(d.data, 10), valor: sim.multa, status: 'aberto', nfStatus: 'a_emitir',
        }, ['empresaId', 'tipo', 'categoria', 'descricao', 'contratoId', 'vencimento', 'valor', 'status', 'nfStatus']);
      }
      await mudarStatus(c, ctx, k, { status: 'cancelado', canceladoEm: d.data, multa: sim.multa, motivoCancelamento: d.motivo }, 'cancelou');
    });
    res.json({ ok: true });
  });

  /** Cria uma proposta de renovação logo após o fim do contrato, com as mesmas faces. */
  r.post('/:id/renovar', editar('contratos'), async (req, res) => {
    const ctx = req.ctx!;
    const out = await tx(async (c) => {
      const k = await carregar(c, ctx, String(req.params.id));
      const rsm = await resumoContrato(c, ctx, k);
      if (!rsm.reservas.length || !k.ini) throw invalido('Contrato sem faces para renovar.');
      const dur = daysIncl(k.ini, k.fim);
      const ini = addDays(k.fim, 1);
      const numero = await proxNumero(c, ctx.empresaId, 'CT', 'numero');
      const campanha = `${k.campanha} (renovação)`;
      const nk = await inserir<any>(c, 'contratos', {
        empresaId: ctx.empresaId, numero, data: today(), clienteId: k.clienteId, agenciaId: k.agenciaId, vendedorId: k.vendedorId,
        campanha, valor: 0, status: 'proposta', validadeProposta: addDays(today(), 10), condicoes: k.condicoes, renovadoDe: k.id,
      }, ['empresaId', 'numero', 'data', 'clienteId', 'agenciaId', 'vendedorId', 'campanha', 'valor', 'status', 'validadeProposta', 'condicoes', 'renovadoDe']);
      let fila = 0;
      for (const r of rsm.reservas) {
        const off = daysIncl(k.ini, r.ini) - 1;
        const len = daysIncl(r.ini, r.fim);
        const nr = { painelId: r.painelId, contratoId: nk.id, campanha, ini: addDays(ini, off), fim: addDays(ini, off + len - 1), slots: r.slots };
        const cf = await conflitos(c, ctx.empresaId, nr);
        const status = cf.lista.length ? 'fila' : 'reservado';
        if (status === 'fila') fila++;
        await salvar(defReservas, ctx, { ...nr, status }, undefined, c);
      }
      const novo = await resumoContrato(c, ctx, { ...nk, valor: 0 });
      await c.query('UPDATE contratos SET valor = $2, valor_tabela = $3 WHERE id = $1', [nk.id, round2(novo.tabela * (1 - rsm.desconto / 100)), novo.tabela]);
      await registrar(c, ctx, 'criou', 'contratos', nk, { rotulo: `${numero} · renovação de ${k.numero}`, contratoId: nk.id });
      return { id: nk.id, numero, fila, periodo: { ini, fim: addDays(ini, dur - 1) } };
    });
    res.status(201).json(out);
  });

  /** Gera as parcelas do contrato (mensal ou por bissemana). */
  r.post('/:id/parcelas', editar('lancamentos'), async (req, res) => {
    const ctx = req.ctx!;
    const d = validar(z.object({ valor: z.number().positive(), n: z.number().int().min(1).max(48), primeiro: zDataObrig, intervalo: z.enum(['mensal', 'bissemana']) }), req.body);
    const out = await tx(async (c) => {
      const k = await carregar(c, ctx, String(req.params.id));
      const ja = await q1<any>(c, `SELECT count(*)::int AS n FROM lancamentos WHERE contrato_id = $1 AND tipo = 'receita' AND categoria = 'contrato' AND excluido_em IS NULL`, [k.id]);
      const valores = dividirParcelas(d.valor, d.n);
      const [y, m, dia] = d.primeiro.split('-').map(Number);
      for (let i = 0; i < valores.length; i++) {
        const dt = d.intervalo === 'mensal' ? new Date(y, m - 1 + i, dia) : new Date(y, m - 1, dia + 14 * i);
        await inserir(c, 'lancamentos', {
          empresaId: ctx.empresaId, tipo: 'receita', categoria: 'contrato', descricao: `${k.numero} · parcela ${ja.n + i + 1}/${ja.n + valores.length}`,
          contratoId: k.id, vencimento: isoOf(dt), valor: valores[i], status: 'aberto', nfStatus: 'a_emitir',
        }, ['empresaId', 'tipo', 'categoria', 'descricao', 'contratoId', 'vencimento', 'valor', 'status', 'nfStatus']);
      }
      await registrar(c, ctx, 'gerou parcelas', 'contratos', k, { rotulo: `${valores.length} parcela(s) · ${k.numero}`, contratoId: k.id });
      return { n: valores.length };
    });
    res.status(201).json(out);
  });
});
