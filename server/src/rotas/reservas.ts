import { z } from 'zod';
import { addDays, fdate, tabelaPeriodo, today } from '@shared';
import { editar, interno } from '../contexto';
import { excluir, rotasCrud, salvar, buscar, type DefRecurso } from '../crud';
import { inserir, pool, q, q1, tx } from '../db';
import { cal, clienteBloqueado, conflitos, proxNumero, resumoContrato, sincronizarOS, verificarReserva } from '../dominio';
import { invalido, naoEncontrado, validar, zDataObrig, zId, zTexto } from '../http';

const ST = ['reservado', 'confirmado', 'fila', 'expirada', 'cancelada'] as const;

export const defReservas: DefRecurso = {
  recurso: 'reservas', rota: 'reservas', tabela: 'reservas', nome: 'Reserva',
  schema: z.object({
    painelId: z.string().uuid(), contratoId: zId, campanha: zTexto,
    ini: zDataObrig, fim: zDataObrig, status: z.enum(ST).default('reservado'),
    validade: z.preprocess((v) => (v === '' ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()),
    slots: z.preprocess((v) => (v === '' || v == null ? 1 : Number(v)), z.number().int().min(1)),
  }),
  select: `SELECT t.*, p.codigo AS painel_codigo, p.tipo AS painel_tipo, k.numero AS contrato_numero, k.status AS contrato_status,
                  c.nome AS cliente_nome, e.endereco, e.cidade
             FROM reservas t JOIN paineis p ON p.id = t.painel_id LEFT JOIN estruturas e ON e.id = p.estrutura_id
             LEFT JOIN contratos k ON k.id = t.contrato_id LEFT JOIN clientes c ON c.id = k.cliente_id`,
  ordem: 't.ini, p.codigo',
  rotulo: (r) => `${r.painelCodigo || 'Face'} · ${fdate(r.ini)} a ${fdate(r.fim)}`,
  contratoDe: (r) => r.contratoId,
  async antes(c, ctx, d, anterior) {
    const r = { ...anterior, ...d };
    if (r.status === 'reservado' && !r.validade) d.validade = addDays(today(), +ctx.cfg.opcaoDias || 5);
    if (r.status !== 'reservado') d.validade = null;
    if (r.contratoId && !r.campanha) {
      const k = await q1<any>(c, 'SELECT campanha FROM contratos WHERE id = $1 AND empresa_id = $2', [r.contratoId, ctx.empresaId]);
      d.campanha = k?.campanha || '';
    }
    await verificarReserva(c, ctx, { ...r, ...d, id: anterior?.id }, !anterior);
  },
  async depois(c, ctx, r) { await sincronizarOS(c, ctx, r); },
  async aoExcluir(c, ctx, r) { await sincronizarOS(c, ctx, { ...r, excluidoEm: today() }); },
  filtro(req, params) {
    let s = '';
    if (req.query.de) { params.push(req.query.de); s += ` AND t.fim >= $${params.length}`; }
    if (req.query.ate) { params.push(req.query.ate); s += ` AND t.ini <= $${params.length}`; }
    if (req.query.painel) { params.push(req.query.painel); s += ` AND t.painel_id = $${params.length}`; }
    if (req.query.contrato) { params.push(req.query.contrato); s += ` AND t.contrato_id = $${params.length}`; }
    if (req.query.ativas) s += ` AND t.status NOT IN ('cancelada','expirada')`;
    return s;
  },
};

export const rotasReservas = rotasCrud(defReservas, (r) => {
  /** Para o painel de nova reserva: situação de cada face no período e preço de tabela. */
  r.post('/disponibilidade', interno, async (req, res) => {
    const d = validar(z.object({ painelIds: z.array(z.string().uuid()).min(1).max(200), ini: zDataObrig, fim: zDataObrig, slots: z.number().int().min(1).default(1) }), req.body);
    const ctx = req.ctx!;
    const ps = await q<any>(pool, 'SELECT id, codigo, tipo, valor_bi, slots, status FROM paineis WHERE empresa_id = $1 AND id = ANY($2) AND excluido_em IS NULL', [ctx.empresaId, d.painelIds]);
    const out = [];
    for (const p of ps) {
      const cf = await conflitos(pool, ctx.empresaId, { painelId: p.id, ini: d.ini, fim: d.fim, slots: d.slots }, false);
      const ocup = cf.lista[0];
      const fila = await q1<any>(pool, `SELECT count(*)::int AS n FROM reservas WHERE painel_id = $1 AND status = 'fila' AND excluido_em IS NULL AND ini <= $3 AND fim >= $2`, [p.id, d.ini, d.fim]);
      out.push({
        painelId: p.id, codigo: p.codigo, tipo: p.tipo, inativo: p.status === 'inativo',
        livre: !ocup && p.status !== 'inativo',
        ocupadaPor: ocup ? { campanha: ocup.campanha, status: ocup.status, ini: ocup.ini, fim: ocup.fim, validade: ocup.validade } : null,
        cotas: p.tipo === 'led' ? { total: p.slots, usadas: cf.usado } : null,
        fila: fila?.n || 0,
        tabela: tabelaPeriodo(ctx.cfg, { tipo: p.tipo, valorBi: p.valorBi }, d.ini, d.fim, d.slots),
      });
    }
    res.json({ periodo: cal(ctx.cfg).biLabel(d.ini, d.fim), faces: out });
  });

  /**
   * Reserva várias faces de uma vez, num contrato existente ou numa proposta
   * nova. Faces ocupadas entram na fila quando "filaSeOcupada" é verdadeiro.
   */
  r.post('/lote', editar('reservas'), async (req, res) => {
    const ctx = req.ctx!;
    const d = validar(z.object({
      faces: z.array(z.object({ painelId: z.string().uuid(), slots: z.number().int().min(1).default(1) })).min(1),
      ini: zDataObrig, fim: zDataObrig,
      contratoId: zId.optional(),
      novo: z.object({ clienteId: z.string().uuid(), agenciaId: zId.optional(), campanha: z.string().trim().min(1, 'informe a campanha') }).optional(),
      filaSeOcupada: z.boolean().default(true),
    }), req.body);
    if (d.fim < d.ini) throw invalido('A data final precisa ser igual ou posterior à inicial.');
    const out = await tx(async (c) => {
      let contratoId = d.contratoId || null;
      let campanha = '';
      if (!contratoId) {
        if (!d.novo) throw invalido('Escolha o contrato ou o cliente da nova proposta.');
        if (ctx.perfil !== 'admin' && (await clienteBloqueado(c, ctx, d.novo.clienteId))) throw invalido('Cliente bloqueado por atraso nos pagamentos. Peça a um administrador.');
        const numero = await proxNumero(c, ctx.empresaId, 'CT', 'numero');
        const k = await inserir<any>(c, 'contratos', {
          empresaId: ctx.empresaId, numero, clienteId: d.novo.clienteId, agenciaId: d.novo.agenciaId || null,
          vendedorId: ctx.perfil === 'comercial' || ctx.perfil === 'admin' ? ctx.membroId : null,
          campanha: d.novo.campanha, data: today(), valor: 0, status: 'proposta', validadeProposta: addDays(today(), 10),
        }, ['empresaId', 'numero', 'clienteId', 'agenciaId', 'vendedorId', 'campanha', 'data', 'valor', 'status', 'validadeProposta']);
        contratoId = k.id;
        campanha = d.novo.campanha;
      } else {
        const k = await q1<any>(c, 'SELECT campanha, status FROM contratos WHERE id = $1 AND empresa_id = $2', [contratoId, ctx.empresaId]);
        if (!k) throw naoEncontrado('Contrato');
        if (['encerrado', 'cancelado'].includes(k.status)) throw invalido('Este contrato já foi encerrado ou cancelado.');
        campanha = k.campanha;
      }
      const criadas: string[] = [], fila: string[] = [], ignoradas: string[] = [];
      for (const f of d.faces) {
        const base = { painelId: f.painelId, contratoId, campanha, ini: d.ini, fim: d.fim, slots: f.slots };
        const cf = await conflitos(c, ctx.empresaId, base);
        const status = cf.lista.length || cf.painel.status === 'inativo' ? (d.filaSeOcupada ? 'fila' : null) : 'reservado';
        if (!status) { ignoradas.push(cf.painel.codigo); continue; }
        await salvar(defReservas, ctx, { ...base, status }, undefined, c);
        (status === 'fila' ? fila : criadas).push(cf.painel.codigo);
      }
      // Atualiza o valor sugerido da proposta nova com o preço de tabela menos o desconto por volume.
      if (!d.contratoId) {
        const k = await q1<any>(c, 'SELECT * FROM contratos WHERE id = $1', [contratoId]);
        const rsm = await resumoContrato(c, ctx, k);
        await c.query('UPDATE contratos SET valor = $2, valor_tabela = $3 WHERE id = $1', [contratoId, rsm.sugerido, rsm.tabela]);
      }
      return { contratoId, criadas, fila, ignoradas };
    });
    res.status(201).json(out);
  });

  /** Troca a face de uma reserva, inteira ou a partir de uma data. */
  r.post('/:id/trocar', editar('reservas'), async (req, res) => {
    const ctx = req.ctx!;
    const d = validar(z.object({ painelId: z.string().uuid(), aPartirDe: zDataObrig.optional() }), req.body);
    const out = await tx(async (c) => {
      const r0 = await buscar<any>(c, defReservas, ctx.empresaId, String(req.params.id));
      if (!r0) throw naoEncontrado('Reserva');
      const de = d.aPartirDe && d.aPartirDe > r0.ini ? d.aPartirDe : r0.ini;
      if (de > r0.fim) throw invalido('A data da troca precisa estar dentro do período da reserva.');
      if (de <= r0.ini) {
        await c.query(`UPDATE ordens_servico SET excluido_em = now(), excluido_por = 'troca de face' WHERE reserva_id = $1 AND status <> 'concluida' AND excluido_em IS NULL`, [r0.id]);
        return salvar(defReservas, ctx, { painelId: d.painelId }, r0.id, c);
      }
      await salvar(defReservas, ctx, { fim: addDays(de, -1) }, r0.id, c);
      return salvar(defReservas, ctx, { painelId: d.painelId, contratoId: r0.contratoId, campanha: r0.campanha, ini: de, fim: r0.fim, status: r0.status, slots: r0.slots, validade: r0.validade }, undefined, c);
    });
    res.json(out);
  });

  /** Promove uma reserva da fila para opção, se a face liberou. */
  r.post('/:id/promover', editar('reservas'), async (req, res) => {
    const ctx = req.ctx!;
    const out = await salvar(defReservas, ctx, { status: 'reservado', validade: addDays(today(), +ctx.cfg.opcaoDias || 5) }, String(req.params.id));
    res.json(out);
  });

  /** Exclusão em lote (seleção na agenda). */
  r.post('/excluir', editar('reservas'), async (req, res) => {
    const { ids } = validar(z.object({ ids: z.array(z.string().uuid()).min(1) }), req.body);
    await tx(async (c) => { for (const id of ids) await excluir(defReservas, req.ctx!, id, c); });
    res.status(204).end();
  });
});
