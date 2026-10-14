// Documentos em PDF: proposta comercial, PI (pedido de inserção) e relatório
// de veiculação com as fotos conferidas.
import { Router, type Response } from 'express';
import PDFDocument from 'pdfkit';
import { fdate, money, pct, tabelaPeriodo, TIPO_LBL, VERIFICACAO } from '@shared';
import type { Ctx } from '../contexto';
import { pool, q, q1 } from '../db';
import { mapaPrecos, resumoContrato } from '../dominio';
import { ErroApi, naoEncontrado } from '../http';

export const pdf = Router();

const COR = { texto: '#161A1F', t2: '#525A66', linha: '#E3E5E8', marca: '#2346D6' };

async function carregarContrato(ctx: Ctx, id: string) {
  const k = await q1<any>(pool,
    `SELECT k.*, c.nome AS cliente_nome, c.documento AS cliente_doc, c.contato AS cliente_contato, c.email AS cliente_email,
            a.nome AS agencia_nome, a.comissao AS agencia_comissao, m.nome AS vendedor_nome
       FROM contratos k JOIN clientes c ON c.id = k.cliente_id LEFT JOIN clientes a ON a.id = k.agencia_id LEFT JOIN membros m ON m.id = k.vendedor_id
      WHERE k.id = $1 AND k.empresa_id = $2 AND k.excluido_em IS NULL`, [id, ctx.empresaId]);
  if (!k) throw naoEncontrado('Contrato');
  if (ctx.perfil === 'cliente' && k.clienteId !== ctx.clienteId && k.agenciaId !== ctx.clienteId) throw new ErroApi(403, 'Documento não disponível.');
  if (ctx.perfil === 'operacao') throw new ErroApi(403, 'Seu perfil não acessa documentos comerciais.');
  return k;
}

function iniciar(res: Response, nome: string) {
  const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true, info: { Title: nome, Producer: 'Painel Gestor' } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${nome}.pdf"`);
  doc.pipe(res);
  return doc;
}

function cabecalho(doc: PDFKit.PDFDocument, ctx: Ctx, titulo: string, sub: string) {
  const e = ctx.cfg.empresa;
  doc.fillColor(COR.texto).font('Helvetica-Bold').fontSize(16).text(titulo, 48, 48);
  doc.font('Helvetica').fontSize(10).fillColor(COR.t2).text(sub, 48, 70);
  doc.fontSize(8.5).text([e.razao, e.cnpj && `CNPJ ${e.cnpj}`, [e.cidade, e.uf].filter(Boolean).join('/'), e.telefone, e.email].filter(Boolean).join(' · '), 48, 88, { width: 499 });
  const y = Math.max(108, doc.y + 6);
  doc.moveTo(48, y).lineTo(547, y).strokeColor(COR.linha).lineWidth(1).stroke();
  doc.y = y + 16;
}

function kv(doc: PDFKit.PDFDocument, pares: [string, string][], colunas = 2) {
  const w = 499 / colunas;
  const y0 = doc.y;
  let maxY = y0;
  pares.forEach(([k, v], i) => {
    const x = 48 + (i % colunas) * w;
    const y = y0 + Math.floor(i / colunas) * 32;
    doc.font('Helvetica').fontSize(8).fillColor(COR.t2).text(k.toUpperCase(), x, y, { width: w - 12, characterSpacing: 0.3 });
    doc.font('Helvetica').fontSize(10).fillColor(COR.texto).text(v || '—', x, y + 11, { width: w - 12 });
    maxY = Math.max(maxY, y + 28);
  });
  doc.y = maxY + 8;
}

function tabela(doc: PDFKit.PDFDocument, cab: { t: string; w: number; dir?: boolean }[], linhas: string[][]) {
  const linhaY = (y: number) => doc.moveTo(48, y).lineTo(547, y).strokeColor(COR.linha).lineWidth(0.6).stroke();
  let y = doc.y;
  const desenharCab = () => {
    let x = 48;
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COR.t2);
    for (const c of cab) { doc.text(c.t.toUpperCase(), x + 4, y + 6, { width: c.w - 8, align: c.dir ? 'right' : 'left' }); x += c.w; }
    y += 22; linhaY(y);
  };
  desenharCab();
  doc.font('Helvetica').fontSize(9).fillColor(COR.texto);
  for (const l of linhas) {
    const h = Math.max(...l.map((v, i) => doc.heightOfString(v || '', { width: cab[i].w - 8 }))) + 12;
    if (y + h > 790) { doc.addPage(); y = 48; desenharCab(); doc.font('Helvetica').fontSize(9).fillColor(COR.texto); }
    let x = 48;
    l.forEach((v, i) => { doc.text(v || '', x + 4, y + 6, { width: cab[i].w - 8, align: cab[i].dir ? 'right' : 'left' }); x += cab[i].w; });
    y += h; linhaY(y);
  }
  doc.y = y + 12;
}

function rodape(doc: PDFKit.PDFDocument, texto: string) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const m = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // escrever no rodapé sem criar página nova
    doc.font('Helvetica').fontSize(8).fillColor(COR.t2).text(`${texto}  ·  página ${i + 1} de ${range.count}`, 48, 810, { width: 499, align: 'center', lineBreak: false });
    doc.page.margins.bottom = m;
  }
}

async function linhasFaces(ctx: Ctx, k: any) {
  const rs = await q<any>(pool,
    `SELECT r.*, p.codigo, p.tipo, p.largura, p.altura, p.iluminado, p.sentido, e.endereco, e.bairro, e.cidade
       FROM reservas r JOIN paineis p ON p.id = r.painel_id LEFT JOIN estruturas e ON e.id = p.estrutura_id
      WHERE r.contrato_id = $1 AND r.excluido_em IS NULL AND r.status IN ('reservado','confirmado') ORDER BY r.ini, p.codigo`, [k.id]);
  const precos = await mapaPrecos(pool, ctx.empresaId);
  return rs.map((r) => ({ ...r, tabela: tabelaPeriodo(ctx.cfg, precos.get(r.painelId)!, r.ini, r.fim, r.slots) }));
}

pdf.get('/contratos/:id/:doc', async (req, res) => {
  const ctx = req.ctx!;
  const tipo = String(req.params.doc);
  if (!['proposta', 'pi', 'veiculacao'].includes(tipo)) throw naoEncontrado('Documento');
  const k = await carregarContrato(ctx, String(req.params.id));
  const faces = await linhasFaces(ctx, k);
  const rsm = await resumoContrato(pool, ctx, k);

  if (tipo === 'veiculacao') return veiculacao(res, ctx, k);
  if (tipo === 'pi' && !k.piNumero) throw new ErroApi(422, 'Este contrato ainda não tem PI emitido.');

  const titulo = tipo === 'pi' ? `Pedido de inserção ${k.piNumero}` : `Proposta comercial ${k.numero}`;
  const doc = iniciar(res, titulo.replace(/\s+/g, '-').toLowerCase());
  cabecalho(doc, ctx, titulo, `${k.campanha}  ·  emitido em ${fdate(tipo === 'pi' ? k.piData : k.data)}`);
  kv(doc, [
    ['Anunciante', `${k.clienteNome}${k.clienteDoc ? ' · ' + k.clienteDoc : ''}`],
    ['Agência', k.agenciaNome ? `${k.agenciaNome} (comissão ${pct(k.agenciaComissao)})` : 'Direto'],
    ['Contato', [k.clienteContato, k.clienteEmail].filter(Boolean).join(' · ')],
    ['Atendimento', k.vendedorNome || '—'],
    ['Contrato', k.numero],
    [tipo === 'pi' ? 'PI' : 'Validade da proposta', tipo === 'pi' ? k.piNumero : fdate(k.validadeProposta)],
  ]);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COR.texto).text('Faces e períodos', 48, doc.y + 4);
  doc.moveDown(0.5);
  tabela(doc,
    [{ t: 'Face', w: 62 }, { t: 'Local', w: 170 }, { t: 'Formato', w: 82 }, { t: 'Período', w: 115 }, { t: 'Tabela', w: 70, dir: true }],
    faces.map((f) => [f.codigo, `${f.endereco || ''}${f.bairro ? ', ' + f.bairro : ''}\n${f.cidade || ''}${f.sentido ? ' · ' + f.sentido : ''}`,
      `${TIPO_LBL[f.tipo] || f.tipo}${f.tipo === 'led' ? ` · ${f.slots} cota(s)` : ''}${f.iluminado ? ' · iluminado' : ''}`,
      `${fdate(f.ini)} a ${fdate(f.fim)}`, money(f.tabela)]));
  kv(doc, [
    ['Valor de tabela', money(rsm.tabela)],
    ['Desconto', rsm.desconto > 0.01 ? pct(rsm.desconto) : 'Sem desconto'],
    ['Valor do contrato', money(k.valor)],
    ['Faces', String(rsm.nFaces)],
  ], 4);
  if (k.condicoes) {
    doc.font('Helvetica-Bold').fontSize(11).fillColor(COR.texto).text('Condições', 48, doc.y + 4);
    doc.font('Helvetica').fontSize(10).fillColor(COR.texto).text(k.condicoes, 48, doc.y + 4, { width: 499 });
    doc.moveDown();
  }
  doc.font('Helvetica').fontSize(9).fillColor(COR.t2).text(
    tipo === 'pi'
      ? `Material: a arte e o material impresso devem ser entregues até ${ctx.cfg.artePrazoDias} dias antes do início de cada período. Cancelamento após a emissão do PI está sujeito a multa de ${ctx.cfg.multaPct}% sobre o saldo não veiculado.`
      : `As faces ficam reservadas em opção por ${ctx.cfg.opcaoDias} dias. Valores sujeitos à disponibilidade na data de aprovação.`,
    48, doc.y + 8, { width: 499 });
  if (tipo === 'pi') {
    const y = Math.max(doc.y + 48, 700);
    doc.moveTo(48, y).lineTo(260, y).moveTo(335, y).lineTo(547, y).strokeColor(COR.t2).lineWidth(0.6).stroke();
    doc.fontSize(9).fillColor(COR.t2).text(ctx.cfg.empresa.razao || 'Exibidora', 48, y + 6, { width: 212 }).text(k.agenciaNome || k.clienteNome, 335, y + 6, { width: 212 });
  }
  rodape(doc, `${k.numero} · ${k.campanha}`);
  doc.end();
});

/** Relatório de veiculação: fotos conferidas no local, uma por face. */
async function veiculacao(res: Response, ctx: Ctx, k: any) {
  const fotos = await q<any>(pool,
    `SELECT f.*, p.codigo, e.endereco, e.bairro, e.cidade, a.dados, a.mime FROM comprovacoes f JOIN paineis p ON p.id = f.painel_id
       LEFT JOIN estruturas e ON e.id = p.estrutura_id JOIN arquivos a ON a.id = f.arquivo_id
      WHERE f.contrato_id = $1 AND f.excluido_em IS NULL AND f.tipo <> 'retirada' ORDER BY p.codigo, f.criado_em`, [k.id]);
  const doc = iniciar(res, `veiculacao-${k.numero}`);
  cabecalho(doc, ctx, `Relatório de veiculação`, `${k.campanha}  ·  ${k.clienteNome}  ·  ${k.numero}`);
  if (!fotos.length) doc.font('Helvetica').fontSize(11).fillColor(COR.t2).text('Ainda não há fotos enviadas pela equipe para este contrato.', 48, doc.y);
  let col = 0, y = doc.y;
  for (const f of fotos) {
    if (y + 270 > 790) { doc.addPage(); y = 48; col = 0; }
    const x = 48 + col * 256;
    try {
      if (/jpe?g|png/.test(f.mime)) doc.image(f.dados, x, y, { fit: [243, 182], align: 'center', valign: 'center' });
      else doc.rect(x, y, 243, 182).fillColor('#F3F4F6').fill();
    } catch { doc.rect(x, y, 243, 182).fillColor('#F3F4F6').fill(); }
    const v = VERIFICACAO[f.verificacao];
    doc.font('Helvetica-Bold').fontSize(10).fillColor(COR.texto).text(`${f.codigo} · ${f.endereco || ''}`, x, y + 188, { width: 243 });
    doc.font('Helvetica').fontSize(9).fillColor(COR.t2).text(`${f.cidade || ''} · ${fdate(f.data)}`, x, y + 202, { width: 243 });
    doc.fillColor(v?.[1] === 'ok' ? '#0F7A45' : '#8F4F08').text(`${v?.[0] || ''}${f.distanciaM != null ? ` · ${f.distanciaM} m do ponto` : ''}`, x, y + 215, { width: 243 });
    if (col === 1) { y += 248; col = 0; } else col = 1;
  }
  rodape(doc, `${k.numero} · ${k.campanha}`);
  doc.end();
}
