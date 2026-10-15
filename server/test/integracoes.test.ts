// Integrações: e-mail de redefinição de senha, termos, fotos no armazenamento,
// WhatsApp (Z-API) e NFS-e (Focus NFe). Os provedores externos são servidores
// falsos locais, que registram o que receberam.
import assert from 'node:assert/strict';
import express from 'express';
import { existsSync, mkdtempSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';

/* ---- provedores falsos ---- */
const recebido: { zapi: any[]; focus: any[] } = { zapi: [], focus: [] };
const notas = new Map<string, any>();
let zapiFalha = false;
const falso = express();
falso.use(express.json());
falso.post('/instances/:inst/token/:tok/send-text', (req, res) => {
  recebido.zapi.push({ inst: req.params.inst, tok: req.params.tok, clientToken: req.headers['client-token'], ...req.body });
  if (zapiFalha) return res.status(400).json({ error: 'phone not exists' });
  res.json({ zaapId: 'z1', messageId: 'm1' });
});
falso.post('/v2/nfse', (req, res) => {
  const ref = String(req.query.ref);
  recebido.focus.push({ ref, auth: req.headers.authorization, body: req.body });
  if (!req.body?.tomador?.endereco?.cep) return res.status(422).json({ codigo: 'requisicao_invalida', mensagem: 'CEP do tomador obrigatório' });
  notas.set(ref, { ref, status: 'processando_autorizacao' });
  res.status(202).json({ ref, status: 'processando_autorizacao' });
});
falso.get('/v2/nfse/:ref', (req, res) => {
  const n = notas.get(req.params.ref);
  if (!n) return res.status(404).json({ mensagem: 'Nota não encontrada' });
  res.json({ ref: n.ref, status: 'autorizado', numero: '777', codigo_verificacao: 'ABC123', url: 'https://prefeitura.exemplo/nota/777', caminho_xml_nota_fiscal: '/arquivos/777.xml', data_emissao: '2026-10-14T10:00:00-03:00' });
});
falso.delete('/v2/nfse/:ref', (req, res) => {
  recebido.focus.push({ cancelar: req.params.ref, body: req.body });
  res.json({ status: 'cancelado' });
});
const srvFalso = falso.listen(0);
const urlFalso = `http://127.0.0.1:${(srvFalso.address() as AddressInfo).port}`;
process.env.ZAPI_URL = urlFalso;
process.env.FOCUS_URL_HOMOLOGACAO = urlFalso;
process.env.STORAGE = 'disco';
process.env.UPLOAD_DIR = mkdtempSync(path.join(tmpdir(), 'pg-uploads-'));
process.env.RESEND_API_KEY = '';

/* ---- app (importado depois de configurar o ambiente) ---- */
const { pool } = await import('../src/db');
const { criarApp } = await import('../src/index');
const { seed, SENHA_DEMO } = await import('../src/seed');
let base = '';
let server: any;

class Cliente {
  cookie = '';
  async req(metodo: string, url: string, corpo?: unknown, form?: FormData) {
    const r = await fetch(base + url, { method: metodo, headers: { ...(corpo ? { 'content-type': 'application/json' } : {}), ...(this.cookie ? { cookie: this.cookie } : {}) }, body: form ?? (corpo ? JSON.stringify(corpo) : undefined) });
    const sc = r.headers.get('set-cookie');
    if (sc) this.cookie = sc.split(';')[0];
    const tipo = r.headers.get('content-type') || '';
    return { status: r.status, dados: (tipo.includes('json') ? await r.json() : await r.arrayBuffer()) as any };
  }
  get = (u: string) => this.req('GET', u);
  post = (u: string, c?: unknown) => this.req('POST', u, c ?? {});
  put = (u: string, c: unknown) => this.req('PUT', u, c);
  patch = (u: string, c: unknown) => this.req('PATCH', u, c);
}
const entrar = async (email: string, senha = SENHA_DEMO) => { const c = new Cliente(); const r = await c.post('/api/auth/entrar', { email, senha }); assert.equal(r.status, 200, JSON.stringify(r.dados)); return c; };

let admin: Cliente;
before(async () => {
  await seed();
  server = criarApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  admin = await entrar('admin@paineisabc.exemplo');
});
after(async () => { server?.close(); srvFalso.close(); await pool.end(); });

describe('conta', () => {
  test('cadastro exige aceite dos termos', async () => {
    const r = await new Cliente().post('/api/auth/cadastro', { nome: 'Sem Aceite', email: `sa${Date.now()}@ex.com`, senha: 'senha-forte-9', empresa: 'X' });
    assert.equal(r.status, 422);
  });

  test('redefinição de senha por e-mail', async () => {
    const c = new Cliente();
    assert.equal((await c.post('/api/auth/esqueci', { email: 'bruno@paineisabc.exemplo' })).status, 204);
    assert.equal((await c.post('/api/auth/esqueci', { email: 'ninguem@exemplo.com' })).status, 204, 'não revela se o e-mail existe');
    const m = (await pool.query(`SELECT texto FROM mensagens WHERE canal = 'email' AND para = 'bruno@paineisabc.exemplo' ORDER BY criado_em DESC LIMIT 1`)).rows[0];
    const token = /token=([\w-]+)/.exec(m.texto)![1];
    const r = await c.post('/api/auth/redefinir', { token, senha: 'nova-senha-123' });
    assert.equal(r.status, 200);
    assert.equal((await c.post('/api/auth/redefinir', { token, senha: 'outra-senha-123' })).status, 410, 'token só vale uma vez');
    await entrar('bruno@paineisabc.exemplo', 'nova-senha-123');
  });

  test('convite com e-mail dispara mensagem', async () => {
    const r = await admin.post('/api/membros', { nome: 'Convidada Teste', email: 'convidada@exemplo.com', perfil: 'comercial' });
    assert.equal(r.status, 201);
    await new Promise((ok) => setTimeout(ok, 300));
    const m = (await pool.query(`SELECT texto FROM mensagens WHERE canal = 'email' AND para = 'convidada@exemplo.com'`)).rows[0];
    assert.match(m.texto, new RegExp(r.dados.convite));
  });
});

describe('fotos fora do banco', () => {
  test('foto vai para o disco e volta pela API', async () => {
    const carlos = await entrar('carlos@paineisabc.exemplo');
    const ps = (await carlos.get('/api/paineis')).dados;
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    const fd = new FormData();
    fd.append('arquivo', new Blob([png], { type: 'image/png' }), 'x.png');
    fd.append('painelId', ps[0].id);
    fd.append('tipo', 'vistoria');
    const up = await carlos.req('POST', '/api/campo/fotos', undefined, fd);
    assert.equal(up.status, 201, JSON.stringify(up.dados));
    const a = (await pool.query('SELECT chave, armazenamento, dados FROM arquivos WHERE id = $1', [up.dados.arquivoId])).rows[0];
    assert.equal(a.armazenamento, 'disco');
    assert.equal(a.dados, null);
    assert.ok(existsSync(path.join(process.env.UPLOAD_DIR!, a.chave)));
    const back = await carlos.get(`/api/arquivos/${up.dados.arquivoId}`);
    assert.equal(back.status, 200);
    assert.ok((back.dados as ArrayBuffer).byteLength > 0);
  });
});

describe('WhatsApp (Z-API)', () => {
  test('envia cobrança pela API e marca a etapa', async () => {
    assert.equal((await admin.put('/api/integracoes/whatsapp', { provedor: 'zapi', config: { automatico: false }, segredos: { instancia: 'INST1', token: 'TOK1', clientToken: 'CT1' } })).status, 204);
    const cfg = await admin.get('/api/integracoes');
    assert.match(cfg.dados.whatsapp.segredos.token, /•+TOK1$/, 'segredo mascarado');
    const fila = (await admin.get('/api/financeiro/cobrar')).dados;
    const item = fila.find((x: any) => !x.enviada);
    assert.equal(item.envioAutomatico, 'zapi');
    const r = await admin.post('/api/financeiro/cobrancas/enviar', { lancamentoId: item.lancamento.id, etapa: item.etapa });
    assert.equal(r.status, 200, JSON.stringify(r.dados));
    const env = recebido.zapi.at(-1);
    assert.equal(env.inst, 'INST1');
    assert.equal(env.clientToken, 'CT1');
    assert.match(env.phone, /^5511\d{9}$/);
    assert.match(env.message, /PIX copia e cola/);
    const depois = (await admin.get('/api/financeiro/cobrar')).dados.find((x: any) => x.lancamento.id === item.lancamento.id);
    assert.ok(depois.enviada);
  });

  test('erro do provedor aparece para o usuário e fica no histórico', async () => {
    zapiFalha = true;
    const r = await admin.post('/api/integracoes/whatsapp/teste', { telefone: '(11) 90000-0000' });
    zapiFalha = false;
    assert.equal(r.status, 422);
    assert.match(r.dados.erro, /phone not exists/);
    const h = (await admin.get('/api/integracoes/mensagens')).dados;
    assert.equal(h[0].status, 'erro');
  });

  test('régua automática envia o que está pendente', async () => {
    await admin.put('/api/integracoes/whatsapp', { provedor: 'zapi', config: { automatico: true } });
    const antes = recebido.zapi.length;
    const r = await admin.post('/api/integracoes/rodar');
    assert.ok(r.dados.cobrancas >= 1, JSON.stringify(r.dados));
    assert.ok(recebido.zapi.length > antes);
    const de2 = await admin.post('/api/integracoes/rodar');
    assert.equal(de2.dados.cobrancas, 0, 'não repete a mesma etapa');
  });
});

describe('NFS-e (Focus NFe)', () => {
  let lanc: any;
  before(async () => {
    await admin.put('/api/integracoes/nfse', { provedor: 'focus', config: { ambiente: 'homologacao', automatica: 'manual', inscricaoMunicipal: '123456', codigoMunicipio: '3548708' }, segredos: { token: 'FOCUS-TOKEN' } });
    lanc = (await admin.get('/api/lancamentos?nf=pendente')).dados.find((l: any) => l.clienteNome?.startsWith('Rota Sul'));
  });

  test('emite, consulta e cancela', async () => {
    const e = await admin.post(`/api/lancamentos/${lanc.id}/nf/emitir`);
    assert.equal(e.status, 200, JSON.stringify(e.dados));
    assert.equal(e.dados.status, 'processando');
    const env = recebido.focus.at(-1);
    assert.equal(env.auth, 'Basic ' + Buffer.from('FOCUS-TOKEN:').toString('base64'));
    assert.equal(env.body.prestador.cnpj, '11222333000144');
    assert.equal(env.body.tomador.cnpj, '12345678000190');
    assert.equal(env.body.servico.valor_servicos, lanc.valor);
    assert.equal(env.body.servico.item_lista_servico, '17.25');
    assert.equal((await admin.post(`/api/lancamentos/${lanc.id}/nf/emitir`)).status, 409, 'não emite duas vezes');
    const c = await admin.post(`/api/lancamentos/${lanc.id}/nf/consultar`);
    assert.equal(c.dados.status, 'emitida');
    assert.equal(c.dados.lancamento.nfNumero, '777');
    assert.match(c.dados.lancamento.nfXml, /^http:\/\/127\.0\.0\.1:\d+\/arquivos\/777\.xml$/);
    assert.equal((await admin.post(`/api/lancamentos/${lanc.id}/nf/cancelar`, { justificativa: 'curta' })).status, 422);
    const x = await admin.post(`/api/lancamentos/${lanc.id}/nf/cancelar`, { justificativa: 'Emitida com valor errado, será reemitida' });
    assert.equal(x.dados.status, 'cancelada');
  });

  test('cadastro incompleto lista o que falta', async () => {
    const outro = (await admin.get('/api/lancamentos?nf=pendente')).dados.find((l: any) => l.clienteNome?.startsWith('Supermercados'));
    const cli = (await admin.get('/api/clientes')).dados.find((c: any) => c.nome.startsWith('Supermercados'));
    await admin.patch(`/api/clientes/${cli.id}`, { cep: '' });
    const r = await admin.post(`/api/lancamentos/${outro.id}/nf/emitir`);
    assert.equal(r.status, 422);
    assert.match(r.dados.erro, /endereço completo do cliente/);
    await admin.patch(`/api/clientes/${cli.id}`, { cep: '09015-000' });
  });

  test('webhook confirma a nota', async () => {
    const outro = (await admin.get('/api/lancamentos?nf=pendente')).dados.find((l: any) => l.clienteNome?.startsWith('Supermercados'));
    const e = await admin.post(`/api/lancamentos/${outro.id}/nf/emitir`);
    assert.equal(e.dados.status, 'processando', JSON.stringify(e.dados));
    const ref = e.dados.lancamento.nfRef;
    const cfg = (await admin.get('/api/integracoes')).dados.nfse;
    const caminho = new URL(cfg.webhook).pathname;
    assert.equal((await new Cliente().post(caminho.replace(/[^/]+$/, 'errado'), { ref, status: 'autorizado' })).status, 404);
    const w = await new Cliente().post(caminho, { ref, status: 'autorizado', numero: '888', url: 'https://prefeitura.exemplo/888' });
    assert.equal(w.status, 200);
    const l = (await admin.get(`/api/lancamentos/${outro.id}`)).dados;
    assert.equal(l.nfStatus, 'emitida');
    assert.equal(l.nfNumero, '888');
  });

  test('modo simulado e emissão automática ao pagar', async () => {
    await admin.put('/api/integracoes/nfse', { provedor: 'simulado', config: { automatica: 'ao_pagar' } });
    const abertas = (await admin.get('/api/lancamentos?tipo=receita&status=aberto&nf=pendente')).dados;
    const alvo = abertas.find((l: any) => (l.nfStatus ?? 'a_emitir') === 'a_emitir');
    await admin.post(`/api/lancamentos/${alvo.id}/baixar`, {});
    const r = await admin.post('/api/integracoes/rodar');
    assert.ok(r.dados.notas >= 1, JSON.stringify(r.dados));
    const l = (await admin.get(`/api/lancamentos/${alvo.id}`)).dados;
    assert.equal(l.nfStatus, 'emitida');
    assert.equal(l.nfSimulada, true);
    assert.match(l.nfNumero, /^9\d{3}$/);
  });
});
