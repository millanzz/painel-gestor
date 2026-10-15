import { Router } from 'express';
import exifr from 'exifr';
import multer from 'multer';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { addDays, distanciaM, OS_LBL, OS_TIPOS, RAIO_FOTO_M, today } from '@shared';
import { registrar } from '../auditoria';
import { editar, ler, type Ctx } from '../contexto';
import { env } from '../env';
import { whatsappAtivo, enviarWhatsapp } from '../integracoes/whatsapp';
import { rotasCrud, type DefRecurso } from '../crud';
import { inserir, pool, q, q1, tx } from '../db';
import { concluirOSPelaFoto } from '../dominio';
import { guardar, ler as lerArquivo, otimizarImagem } from '../integracoes/armazenamento';
import { ErroApi, invalido, naoEncontrado, validar, zData, zId, zTexto } from '../http';

export const upload = multer({
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, f, cb) => cb(null, /^image\/(jpeg|png|webp|heic|heif)$/.test(f.mimetype)),
});

export const defOS: DefRecurso = {
  recurso: 'os', rota: 'os', tabela: 'ordens_servico', nome: 'Ordem de serviço',
  schema: z.object({
    painelId: z.string().uuid('escolha a face'), reservaId: zId, contratoId: zId,
    tipo: z.enum(OS_TIPOS.map((t) => t[0]) as [string, ...string[]]),
    abertura: zData, prazo: zData, responsavel: zTexto, membroId: zId,
    status: z.enum(['aberta', 'andamento', 'concluida']).default('aberta'),
    custo: z.preprocess((v) => (v === '' || v == null ? 0 : Number(v)), z.number().min(0)), descricao: zTexto,
  }),
  select: `SELECT t.*, p.codigo AS painel_codigo, p.tipo AS painel_tipo, e.endereco, e.bairro, e.cidade, e.lat, e.lng,
                  k.campanha, k.numero AS contrato_numero, m.nome AS membro_nome
             FROM ordens_servico t JOIN paineis p ON p.id = t.painel_id LEFT JOIN estruturas e ON e.id = p.estrutura_id
             LEFT JOIN contratos k ON k.id = t.contrato_id LEFT JOIN membros m ON m.id = t.membro_id`,
  ordem: `t.status = 'concluida', t.prazo NULLS LAST, e.cidade`,
  extras: ['concluidaEm'],
  rotulo: (r) => `${OS_LBL[r.tipo] || r.tipo} ${r.painelCodigo || ''}`,
  contratoDe: (r) => r.contratoId,
  async antes(_c, _ctx, d, anterior) {
    if (!anterior) d.abertura = d.abertura || today();
    if (d.status === 'concluida' && anterior?.status !== 'concluida') d.concluidaEm = today();
  },
  /** OS concluída com custo vira despesa de manutenção ligada à face. */
  async depois(c, ctx, o) {
    if (o.status === 'concluida' && +o.custo > 0 && !o.despesaId) {
      const f = await inserir<any>(c, 'lancamentos', {
        empresaId: ctx.empresaId, tipo: 'despesa', categoria: 'manutencao', descricao: `OS · ${OS_LBL[o.tipo] || o.tipo} ${o.painelCodigo}`,
        painelId: o.painelId, vencimento: today(), valor: o.custo, status: 'aberto',
      }, ['empresaId', 'tipo', 'categoria', 'descricao', 'painelId', 'vencimento', 'valor', 'status']);
      await c.query('UPDATE ordens_servico SET despesa_id = $2 WHERE id = $1', [o.id, f.id]);
    }
    if (o.status === 'concluida') await c.query('UPDATE ordens_servico SET concluida_em = COALESCE(concluida_em, CURRENT_DATE) WHERE id = $1', [o.id]);
  },
  filtro(req, params) {
    let s = '';
    if (req.query.situacao === 'abertas') s += ` AND t.status <> 'concluida'`;
    if (req.query.situacao === 'atrasadas') s += ` AND t.status <> 'concluida' AND t.prazo < CURRENT_DATE`;
    if (req.query.painel) { params.push(req.query.painel); s += ` AND t.painel_id = $${params.length}`; }
    return s;
  },
};

/* ---- leitura de EXIF e verificação de local ---- */
export async function lerExif(buf: Buffer) {
  try {
    const x: any = await exifr.parse(buf, { gps: true, pick: ['DateTimeOriginal', 'CreateDate', 'latitude', 'longitude', 'GPSLatitude', 'GPSLongitude'] });
    if (!x) return {};
    const dt = x.DateTimeOriginal || x.CreateDate;
    const out: { lat?: number; lng?: number; dataHora?: string } = {};
    if (typeof x.latitude === 'number' && typeof x.longitude === 'number' && (x.latitude || x.longitude)) {
      out.lat = +x.latitude.toFixed(6);
      out.lng = +x.longitude.toFixed(6);
    }
    if (dt instanceof Date && !isNaN(+dt)) out.dataHora = dt.toISOString();
    return out;
  } catch {
    return {};
  }
}

export function verificarLocal(exif: { lat?: number; lng?: number }, ponto: { lat: number | null; lng: number | null }) {
  if (ponto.lat == null || ponto.lng == null) return { verificacao: 'sem_ponto' as const, distanciaM: null };
  if (exif.lat == null || exif.lng == null) return { verificacao: 'sem_gps' as const, distanciaM: null };
  const d = distanciaM(exif.lat, exif.lng, ponto.lat, ponto.lng);
  return { verificacao: d <= RAIO_FOTO_M ? ('ok' as const) : ('longe' as const), distanciaM: d };
}

/** Comprime a imagem, grava no armazenamento (S3/R2 ou disco) e registra no banco. */
export async function guardarArquivo(c: PoolClient, empresaId: string, f: Express.Multer.File) {
  const { buf, mime } = await otimizarImagem(f.buffer, f.mimetype);
  const { chave, armazenamento } = await guardar(empresaId, buf, mime);
  const nome = (f.originalname || 'foto').replace(/\.[^.]+$/, '') + (mime === 'image/jpeg' ? '.jpg' : '');
  return inserir<any>(c, 'arquivos', { empresaId, nome, mime, tamanho: buf.length, chave, armazenamento },
    ['empresaId', 'nome', 'mime', 'tamanho', 'chave', 'armazenamento']);
}

async function salvarComprovacao(c: PoolClient, ctx: Ctx, f: Express.Multer.File, d: { painelId: string; reservaId: string | null; osId: string | null; tipo: string }) {
  const p = await q1<any>(c, `SELECT p.id, p.codigo, e.lat, e.lng FROM paineis p LEFT JOIN estruturas e ON e.id = p.estrutura_id WHERE p.id = $1 AND p.empresa_id = $2`, [d.painelId, ctx.empresaId]);
  if (!p) throw naoEncontrado('Face');
  let reservaId = d.reservaId, contratoId: string | null = null;
  if (d.osId) {
    const os = await q1<any>(c, 'SELECT * FROM ordens_servico WHERE id = $1 AND empresa_id = $2', [d.osId, ctx.empresaId]);
    if (os) { reservaId = reservaId || os.reservaId; contratoId = os.contratoId; }
  }
  if (reservaId && !contratoId) contratoId = (await q1<any>(c, 'SELECT contrato_id FROM reservas WHERE id = $1', [reservaId]))?.contratoId ?? null;
  // Sem reserva informada, liga a foto à campanha que está no ar na face hoje.
  if (!reservaId && d.tipo !== 'vistoria') {
    const r = await q1<any>(c, `SELECT id, contrato_id FROM reservas WHERE painel_id = $1 AND status = 'confirmado' AND excluido_em IS NULL AND ini <= CURRENT_DATE + 3 AND fim >= CURRENT_DATE ORDER BY ini DESC LIMIT 1`, [p.id]);
    if (r) { reservaId = r.id; contratoId = r.contratoId; }
  }
  const exif = await lerExif(f.buffer);
  const v = verificarLocal(exif, p);
  const arq = await guardarArquivo(c, ctx.empresaId, f);
  const foto = await inserir<any>(c, 'comprovacoes', {
    empresaId: ctx.empresaId, reservaId, painelId: p.id, contratoId, data: today(), membroId: ctx.membroId, tipo: d.tipo,
    arquivoId: arq.id, exif, verificacao: v.verificacao, distanciaM: v.distanciaM,
  }, ['empresaId', 'reservaId', 'painelId', 'contratoId', 'data', 'membroId', 'tipo', 'arquivoId', 'exif', 'verificacao', 'distanciaM']);
  if (d.osId) {
    await c.query(`UPDATE ordens_servico SET status = 'concluida', concluida_em = CURRENT_DATE, atualizado_em = now() WHERE id = $1 AND empresa_id = $2 AND status <> 'concluida'`, [d.osId, ctx.empresaId]);
  } else {
    await concluirOSPelaFoto(c, reservaId, d.tipo);
  }
  await registrar(c, ctx, 'enviou foto', 'comprovacoes', foto, { rotulo: `Foto ${p.codigo}`, contratoId });
  return { ...foto, painelCodigo: p.codigo };
}

export const rotasOS = rotasCrud(defOS);

export const campo = Router();

/** Roteiro do dia: o que vence até depois de amanhã, mais o que já foi feito hoje. */
campo.get('/roteiro', ler('os'), async (req, res) => {
  const ctx = req.ctx!;
  const data = String(req.query.data || today());
  const meu = req.query.meu === '1';
  const params: any[] = [ctx.empresaId, addDays(data, 2), data];
  let extra = '';
  if (meu) { params.push(ctx.membroId); extra = ` AND (t.membro_id = $${params.length} OR t.membro_id IS NULL)`; }
  const itens = await q(pool,
    `${defOS.select} WHERE t.empresa_id = $1 AND t.excluido_em IS NULL
        AND ((t.status <> 'concluida' AND (t.prazo IS NULL OR t.prazo <= $2)) OR t.concluida_em = $3) ${extra}
      ORDER BY t.status = 'concluida', t.prazo NULLS LAST, e.cidade, p.codigo`, params);
  res.json(itens);
});

campo.post('/fotos', editar('comprovacoes'), upload.single('arquivo'), async (req, res) => {
  if (!req.file) throw invalido('Envie a foto (JPG, PNG ou HEIC).');
  const d = validar(z.object({
    painelId: z.string().uuid(), reservaId: zId.optional().default(null), osId: zId.optional().default(null),
    tipo: z.enum(['colagem', 'retirada', 'vistoria']).default('colagem'),
  }), req.body);
  const out = await tx((c) => salvarComprovacao(c, req.ctx!, req.file!, d as any));
  res.status(201).json(out);
  avisarClienteFoto(req.ctx!, out).catch((e) => console.error('[aviso de foto]', e.message));
});

campo.get('/fotos', ler('comprovacoes'), async (req, res) => {
  const ctx = req.ctx!;
  const params: any[] = [ctx.empresaId];
  let extra = '';
  if (req.query.contrato) { params.push(req.query.contrato); extra += ` AND f.contrato_id = $${params.length}`; }
  if (req.query.painel) { params.push(req.query.painel); extra += ` AND f.painel_id = $${params.length}`; }
  res.json(await q(pool,
    `SELECT f.*, p.codigo AS painel_codigo, e.endereco, e.cidade, m.nome AS membro_nome
       FROM comprovacoes f JOIN paineis p ON p.id = f.painel_id LEFT JOIN estruturas e ON e.id = p.estrutura_id
       LEFT JOIN membros m ON m.id = f.membro_id
      WHERE f.empresa_id = $1 AND f.excluido_em IS NULL ${extra} ORDER BY f.criado_em DESC LIMIT 200`, params));
});

/** Fotos do ponto (cadastro da estrutura). */
campo.post('/estruturas/:id/fotos', editar('fotosPonto'), upload.single('arquivo'), async (req, res) => {
  const ctx = req.ctx!;
  if (!req.file) throw invalido('Envie uma imagem.');
  const out = await tx(async (c) => {
    const e = await q1<any>(c, 'SELECT id, codigo FROM estruturas WHERE id = $1 AND empresa_id = $2', [req.params.id, ctx.empresaId]);
    if (!e) throw naoEncontrado('Estrutura');
    const arq = await guardarArquivo(c, ctx.empresaId, req.file!);
    const f = await inserir(c, 'fotos_ponto', { empresaId: ctx.empresaId, estruturaId: e.id, arquivoId: arq.id }, ['empresaId', 'estruturaId', 'arquivoId']);
    await registrar(c, ctx, 'enviou foto', 'fotos_ponto', f as any, { rotulo: `Foto do ponto ${e.codigo}` });
    return f;
  });
  res.status(201).json(out);
});

export const arquivos = Router();

/** Entrega um arquivo da empresa. O anunciante só acessa fotos e artes das próprias campanhas. */
arquivos.get('/:id', async (req, res) => {
  const ctx = req.ctx!;
  const a = await q1<any>(pool, 'SELECT id, nome, mime, dados, chave, armazenamento FROM arquivos WHERE id = $1 AND empresa_id = $2', [req.params.id, ctx.empresaId]);
  if (!a) throw naoEncontrado('Arquivo');
  if (ctx.perfil === 'cliente') {
    const ok = await q1(pool,
      `SELECT 1 FROM comprovacoes f JOIN contratos k ON k.id = f.contrato_id
        WHERE f.arquivo_id = $1 AND f.excluido_em IS NULL AND (k.cliente_id = $2 OR k.agencia_id = $2)
       UNION SELECT 1 FROM artes ar JOIN contratos k ON k.id = ar.contrato_id
        WHERE ar.arquivo_id = $1 AND (k.cliente_id = $2 OR k.agencia_id = $2)`, [a.id, ctx.clienteId]);
    if (!ok) throw new ErroApi(403, 'Arquivo não disponível.');
  }
  res.setHeader('Content-Type', a.mime);
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(a.nome)}"`);
  res.send(await lerArquivo(a));
});

/** Primeira foto conferida de uma reserva: avisa o anunciante no WhatsApp (se a empresa ligou essa opção). */
async function avisarClienteFoto(ctx: Ctx, foto: any) {
  if (foto.verificacao !== 'ok' || !foto.reservaId || foto.tipo === 'retirada') return;
  const { ativo, cfg } = await whatsappAtivo(pool, ctx.empresaId);
  if (!ativo || !cfg.config.avisarFoto) return;
  const n = await q1<any>(pool, `SELECT count(*)::int AS n FROM comprovacoes WHERE reserva_id = $1 AND verificacao = 'ok' AND excluido_em IS NULL`, [foto.reservaId]);
  if (n.n !== 1) return;
  const d = await q1<any>(pool,
    `SELECT k.campanha, c.telefone, c.contato, e.endereco, e.cidade FROM reservas r JOIN contratos k ON k.id = r.contrato_id JOIN clientes c ON c.id = k.cliente_id
       JOIN paineis p ON p.id = r.painel_id LEFT JOIN estruturas e ON e.id = p.estrutura_id WHERE r.id = $1`, [foto.reservaId]);
  if (!d?.telefone) return;
  const nome = d.contato ? `, ${String(d.contato).split(' ')[0]}` : '';
  await enviarWhatsapp(ctx.empresaId, d.telefone,
    `Olá${nome}! A campanha "${d.campanha}" já está no ar em ${d.endereco}, ${d.cidade}. A equipe conferiu a foto no local. Veja no portal: ${env.appUrl}`, { automatica: true, cfg });
}
