// Driver S3 (R2/MinIO) contra um servidor S3 falso local, e compressão de imagens.
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { after, test } from 'node:test';
import sharp from 'sharp';

const objetos = new Map<string, { corpo: Buffer; tipo: string }>();
const s3 = express();
s3.put(/.*/, express.raw({ type: '*/*', limit: '20mb' }), (req, res) => {
  objetos.set(decodeURIComponent(req.path), { corpo: req.body as Buffer, tipo: String(req.headers['content-type']) });
  res.setHeader('ETag', '"1"').status(200).end();
});
s3.get(/.*/, (req, res) => {
  const o = objetos.get(decodeURIComponent(req.path));
  if (!o) return res.status(404).send('<Error><Code>NoSuchKey</Code></Error>');
  res.setHeader('Content-Type', o.tipo).send(o.corpo);
});
const srv = s3.listen(0);
process.env.STORAGE = 's3';
process.env.S3_BUCKET = 'fotos';
process.env.S3_ENDPOINT = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
process.env.S3_ACCESS_KEY_ID = 'teste';
process.env.S3_SECRET_ACCESS_KEY = 'teste';
const { guardar, ler, otimizarImagem } = await import('../src/integracoes/armazenamento');
after(() => srv.close());

test('grava e lê pelo S3 com o caminho da empresa', async () => {
  const buf = Buffer.from('conteudo-de-teste');
  const r = await guardar('empresa-1', buf, 'image/jpeg');
  assert.equal(r.armazenamento, 's3');
  assert.match(r.chave, /^empresa-1\/\d{4}-\d{2}\/[\w-]+\.jpg$/);
  assert.ok(objetos.has(`/fotos/${r.chave}`), 'objeto enviado ao bucket');
  const volta = await ler({ armazenamento: 's3', chave: r.chave, dados: null });
  assert.equal(volta.toString(), 'conteudo-de-teste');
});

test('foto grande de celular é reduzida', async () => {
  const grande = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: { r: 200, g: 120, b: 40 } } }).jpeg({ quality: 95 }).toBuffer();
  const { buf, mime } = await otimizarImagem(grande, 'image/jpeg');
  const meta = await sharp(buf).metadata();
  assert.equal(mime, 'image/jpeg');
  assert.ok((meta.width || 0) <= 1600 && (meta.height || 0) <= 1600);
  assert.ok(buf.length < grande.length);
});
