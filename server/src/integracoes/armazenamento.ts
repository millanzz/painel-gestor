// Onde ficam fotos e artes. "s3" funciona com Amazon S3, Cloudflare R2, Supabase
// Storage e MinIO (defina S3_ENDPOINT). "disco" grava numa pasta local.
// "banco" guarda no próprio PostgreSQL: útil em hospedagem grátis, onde o disco
// é apagado a cada reinício. Arquivos gravados em qualquer modo continuam sendo lidos.
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { env } from '../env';

let s3: S3Client | null = null;
const cliente = () => (s3 ??= new S3Client({
  region: env.s3.regiao, endpoint: env.s3.endpoint, forcePathStyle: !!env.s3.endpoint,
  credentials: { accessKeyId: env.s3.chave, secretAccessKey: env.s3.segredo },
}));

/**
 * Reduz fotos grandes de celular (até 1600 px, JPEG 82%) e corrige a rotação.
 * Deve ser chamado DEPOIS de ler o EXIF, porque a compressão remove os metadados.
 */
export async function otimizarImagem(buf: Buffer, mime: string): Promise<{ buf: Buffer; mime: string }> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(mime)) return { buf, mime };
  try {
    const img = sharp(buf, { failOn: 'none' }).rotate();
    const meta = await img.metadata();
    if (mime === 'image/png' && (meta.width || 0) <= 1600 && buf.length < 600_000) return { buf, mime };
    const out = await img.resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    return out.length < buf.length ? { buf: out, mime: 'image/jpeg' } : { buf, mime };
  } catch {
    return { buf, mime }; // formato que o sharp não lê (ex.: alguns HEIC): guarda o original
  }
}

export async function guardar(empresaId: string, buf: Buffer, mime: string): Promise<{ chave: string | null; armazenamento: 's3' | 'disco' | 'banco'; dados: Buffer | null }> {
  if (env.armazenamento === 'banco') return { chave: null, armazenamento: 'banco', dados: buf };
  const ext = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1] || 'bin';
  const chave = `${empresaId}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${ext}`;
  if (env.armazenamento === 's3') {
    await cliente().send(new PutObjectCommand({ Bucket: env.s3.bucket, Key: chave, Body: buf, ContentType: mime }));
    return { chave, armazenamento: 's3', dados: null };
  }
  const destino = path.resolve(env.pastaUploads, chave);
  await mkdir(path.dirname(destino), { recursive: true });
  await writeFile(destino, buf);
  return { chave, armazenamento: 'disco', dados: null };
}

export async function ler(a: { armazenamento: string; chave: string | null; dados: Buffer | null }): Promise<Buffer> {
  if (a.armazenamento === 'banco' || !a.chave) return a.dados as Buffer;
  if (a.armazenamento === 's3') {
    const r = await cliente().send(new GetObjectCommand({ Bucket: env.s3.bucket, Key: a.chave }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }
  const base = path.resolve(env.pastaUploads);
  const alvo = path.resolve(base, a.chave);
  if (!alvo.startsWith(base + path.sep)) throw new Error('caminho inválido');
  return readFile(alvo);
}
