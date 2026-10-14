// Importação de planilhas (CSV) de clientes e de faces, com prévia antes de gravar.
import { Router } from 'express';
import multer from 'multer';
import { TIPOS_PAINEL } from '@shared';
import { soAdmin } from '../contexto';
import { salvar } from '../crud';
import { q1, tx } from '../db';
import { ErroApi } from '../http';
import { defClientes, defEstruturas, defPaineis } from './cadastros';

export const importacao = Router();
importacao.use(soAdmin);
const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } });

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function lerCsv(txt: string): string[][] {
  const linhas: string[][] = [];
  const sep = (txt.split(/\r?\n/)[0].match(/;/g) || []).length >= (txt.split(/\r?\n/)[0].match(/,/g) || []).length ? ';' : ',';
  let campo = '', linha: string[] = [], aspas = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (aspas) {
      if (ch === '"' && txt[i + 1] === '"') { campo += '"'; i++; } else if (ch === '"') aspas = false; else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === sep) { linha.push(campo.trim()); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && txt[i + 1] === '\n') i++;
      linha.push(campo.trim()); campo = '';
      if (linha.some((x) => x)) linhas.push(linha);
      linha = [];
    } else campo += ch;
  }
  linha.push(campo.trim());
  if (linha.some((x) => x)) linhas.push(linha);
  return linhas;
}

const MAPAS: Record<string, Record<string, string[]>> = {
  clientes: {
    nome: ['nome', 'razaosocial', 'cliente', 'empresa'], tipo: ['tipo'], documento: ['cnpj', 'cpf', 'documento', 'cnpjcpf'],
    contato: ['contato', 'responsavel'], email: ['email'], telefone: ['telefone', 'celular', 'whatsapp', 'fone'],
    comissao: ['comissao', 'comissaopct'], cidade: ['cidade', 'municipio'],
  },
  paineis: {
    codigo: ['codigo', 'face', 'cod'], estrutura: ['estrutura', 'ponto', 'codigoestrutura'], endereco: ['endereco', 'logradouro', 'local'],
    bairro: ['bairro'], cidade: ['cidade', 'municipio'], uf: ['uf', 'estado'], lat: ['lat', 'latitude'], lng: ['lng', 'lon', 'longitude'],
    tipo: ['tipo', 'formato'], largura: ['largura'], altura: ['altura'], iluminado: ['iluminado', 'iluminacao'],
    valorBi: ['valorbi', 'preco', 'valor', 'precobi', 'valorbissemana'], sentido: ['sentido'], slots: ['cotas', 'slots'],
  },
};

const tipoDe = (s: string) => {
  const n = norm(s);
  return TIPOS_PAINEL.find(([k, l]) => n === k || norm(l).startsWith(n) || n.includes(k))?.[0] || 'outdoor';
};
const numBR = (s: string) => (s ? Number(String(s).replace(/R\$|\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')) : null);

importacao.post('/:tipo', upload.single('arquivo'), async (req, res) => {
  const ctx = req.ctx!;
  const tipo = String(req.params.tipo);
  const mapa = MAPAS[tipo];
  if (!mapa) throw new ErroApi(404, 'Tipo de importação desconhecido.');
  const txt = req.file ? req.file.buffer.toString('utf8').replace(/^﻿/, '') : String(req.body?.texto || '');
  const L = lerCsv(txt);
  if (L.length < 2) throw new ErroApi(422, 'A planilha precisa de um cabeçalho e pelo menos uma linha.');
  const cab = L[0].map(norm);
  const col: Record<string, number> = {};
  for (const [campo, nomes] of Object.entries(mapa)) { const i = cab.findIndex((h) => nomes.includes(h)); if (i >= 0) col[campo] = i; }
  const simular = req.query.simular === '1';
  const linhas = L.slice(1).map((l, i) => {
    const o: Record<string, any> = {};
    for (const [campo, idx] of Object.entries(col)) o[campo] = l[idx] ?? '';
    return { linha: i + 2, dados: o, erro: '' as string };
  });
  for (const x of linhas) {
    const o = x.dados;
    if (tipo === 'clientes') {
      if (!o.nome) x.erro = 'sem nome';
      o.tipo = norm(o.tipo || '').startsWith('ag') ? 'agencia' : 'anunciante';
      o.comissao = numBR(o.comissao) || 0;
    } else {
      if (!o.codigo) x.erro = 'sem código';
      else if (!o.endereco && !o.estrutura) x.erro = 'sem endereço';
      o.tipo = tipoDe(o.tipo || 'outdoor');
      o.valorBi = numBR(o.valorBi) || 0;
      o.largura = numBR(o.largura); o.altura = numBR(o.altura); o.lat = numBR(o.lat); o.lng = numBR(o.lng);
      o.iluminado = /^(s|sim|1|true|x)$/i.test(String(o.iluminado || '').trim());
      o.slots = o.tipo === 'led' ? Number(o.slots) || 6 : 1;
    }
  }
  if (simular) return res.json({ colunas: Object.keys(col), linhas });
  const ok = linhas.filter((x) => !x.erro);
  const n = await tx(async (c) => {
    let n = 0;
    for (const x of ok) {
      const o = x.dados;
      if (tipo === 'clientes') { await salvar(defClientes, ctx, o, undefined, c); n++; continue; }
      const codEst = o.estrutura || `E-${o.codigo}`;
      let est = await q1<any>(c, 'SELECT id FROM estruturas WHERE empresa_id = $1 AND lower(codigo) = lower($2) AND excluido_em IS NULL', [ctx.empresaId, codEst]);
      if (!est) est = await salvar(defEstruturas, ctx, { codigo: codEst, endereco: o.endereco || codEst, bairro: o.bairro, cidade: o.cidade || '—', uf: o.uf, lat: o.lat, lng: o.lng }, undefined, c);
      await salvar(defPaineis, ctx, { ...o, estruturaId: est.id, status: 'ativo' }, undefined, c);
      n++;
    }
    return n;
  });
  res.json({ importados: n, ignorados: linhas.length - ok.length });
});
