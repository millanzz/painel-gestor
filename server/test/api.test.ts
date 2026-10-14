// Testes de ponta a ponta da API contra um PostgreSQL real (DATABASE_URL).
// Recriam os dados de exemplo antes de rodar.
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import { addDays, today } from '@shared';
import { pool } from '../src/db';
import { criarApp } from '../src/index';
import { SENHA_DEMO, seed } from '../src/seed';

let base = '';
let server: any;

class Cliente {
  cookie = '';
  async req(metodo: string, url: string, corpo?: unknown, form?: FormData) {
    const r = await fetch(base + url, {
      method: metodo,
      headers: { ...(corpo ? { 'content-type': 'application/json' } : {}), ...(this.cookie ? { cookie: this.cookie } : {}) },
      body: form ?? (corpo ? JSON.stringify(corpo) : undefined),
    });
    const sc = r.headers.get('set-cookie');
    if (sc) this.cookie = sc.split(';')[0];
    const tipo = r.headers.get('content-type') || '';
    const dados = tipo.includes('json') ? await r.json() : await r.arrayBuffer();
    return { status: r.status, dados: dados as any, tipo };
  }
  get = (u: string) => this.req('GET', u);
  post = (u: string, c?: unknown) => this.req('POST', u, c ?? {});
  patch = (u: string, c: unknown) => this.req('PATCH', u, c);
  del = (u: string) => this.req('DELETE', u);
}

async function entrar(email: string) {
  const c = new Cliente();
  const r = await c.post('/api/auth/entrar', { email, senha: SENHA_DEMO });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  return c;
}

let admin: Cliente, ana: Cliente, bruno: Cliente, carlos: Cliente, marina: Cliente;

before(async () => {
  await seed();
  server = criarApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  [admin, ana, bruno, carlos, marina] = await Promise.all([
    entrar('admin@paineisabc.exemplo'), entrar('ana@paineisabc.exemplo'), entrar('bruno@paineisabc.exemplo'),
    entrar('carlos@paineisabc.exemplo'), entrar('marketing@rotasul.exemplo'),
  ]);
});

after(async () => { server?.close(); await pool.end(); });

describe('acesso', () => {
  test('sem sessão recebe 401', async () => {
    const r = await new Cliente().get('/api/inicio');
    assert.equal(r.status, 401);
  });
  test('senha errada', async () => {
    const r = await new Cliente().post('/api/auth/entrar', { email: 'ana@paineisabc.exemplo', senha: 'errada123' });
    assert.equal(r.status, 401);
  });
  test('cadastro cria empresa com o usuário como admin', async () => {
    const c = new Cliente();
    const email = `teste${Date.now()}@exemplo.com`;
    const r = await c.post('/api/auth/cadastro', { nome: 'Teste', email, senha: 'senha-forte-1', empresa: 'Outdoor Teste' });
    assert.equal(r.status, 201);
    assert.equal(r.dados.perfil, 'admin');
    const ps = await c.get('/api/paineis');
    assert.deepEqual(ps.dados, [], 'empresa nova não enxerga dados de outra');
  });
  test('perfis: operação não edita contratos, comercial não vê financeiro', async () => {
    assert.equal((await carlos.post('/api/contratos', { clienteId: '00000000-0000-0000-0000-000000000000', campanha: 'x' })).status, 403);
    assert.equal((await ana.get('/api/lancamentos')).status, 403);
    assert.equal((await marina.get('/api/contratos')).status, 403);
    assert.equal((await ana.get('/api/auditoria')).status, 403);
  });
});

describe('início e agenda', () => {
  test('início traz ocupação, próximas ações e livres', async () => {
    const r = await ana.get('/api/inicio');
    assert.equal(r.status, 200);
    assert.ok(r.dados.bissemanas.length === 8);
    assert.ok(r.dados.acoes.some((a: any) => a.tag === 'Aprovar'));
    assert.ok(r.dados.ocupacaoAtual.total >= 8);
  });
  test('agenda devolve colunas por bissemana com a de hoje marcada', async () => {
    const r = await ana.get('/api/agenda');
    assert.equal(r.dados.colunas.length, 12);
    assert.equal(r.dados.colunas.filter((c: any) => c.hoje).length, 1);
    assert.ok(r.dados.reservas.length > 5);
  });
});

describe('reservas e contratos', () => {
  let paineis: any[], clientes: any[];
  before(async () => {
    paineis = (await ana.get('/api/paineis')).dados;
    clientes = (await ana.get('/api/clientes')).dados;
  });
  const face = (c: string) => paineis.find((p) => p.codigo === c);

  test('não deixa vender período ocupado', async () => {
    const ag = await ana.get('/api/agenda');
    const r1 = ag.dados.reservas.find((r: any) => r.status === 'confirmado' && r.painelId === face('P-001').id && r.fim >= today());
    const r = await ana.post('/api/reservas', { painelId: face('P-001').id, ini: r1.ini, fim: r1.fim, status: 'reservado' });
    assert.equal(r.status, 422);
    assert.match(r.dados.erro, /já está confirmada/);
    const fila = await ana.post('/api/reservas', { painelId: face('P-001').id, ini: r1.ini, fim: r1.fim, status: 'fila' });
    assert.equal(fila.status, 201);
  });

  test('LED respeita o número de cotas', async () => {
    const led = face('P-008');
    const ini = addDays(today(), 400), fim = addDays(today(), 413);
    assert.equal((await ana.post('/api/reservas', { painelId: led.id, ini, fim, status: 'reservado', slots: 5 })).status, 201);
    assert.equal((await ana.post('/api/reservas', { painelId: led.id, ini, fim, status: 'reservado', slots: 2 })).status, 422);
    assert.equal((await ana.post('/api/reservas', { painelId: led.id, ini, fim, status: 'reservado', slots: 1 })).status, 201);
  });

  test('fluxo completo: proposta → aprovação de desconto → PI → parcelas → baixa com comissão', async () => {
    const ini = addDays(today(), 500), fim = addDays(today(), 527);
    const lote = await ana.post('/api/reservas/lote', {
      faces: [{ painelId: face('P-003').id, slots: 1 }, { painelId: face('P-004').id, slots: 1 }],
      ini, fim, novo: { clienteId: clientes.find((c) => c.nome.startsWith('Faculdade')).id, campanha: 'Teste automatizado' },
    });
    assert.equal(lote.status, 201, JSON.stringify(lote.dados));
    assert.equal(lote.dados.criadas.length, 2);
    const id = lote.dados.contratoId;

    let comp = await ana.get(`/api/contratos/${id}/completo`);
    assert.equal(comp.dados.contrato.status, 'proposta');
    assert.ok(comp.dados.calculo.tabela > 0);

    // 30% de desconto: acima do limite do comercial (15%)
    await ana.patch(`/api/contratos/${id}`, { valor: Math.round(comp.dados.calculo.tabela * 0.7) });
    const ap = await ana.post(`/api/contratos/${id}/aprovar`);
    assert.equal(ap.dados.status, 'aprovacao');
    assert.equal((await ana.post(`/api/contratos/${id}/desconto`, { aprovar: true })).status, 403);
    assert.equal((await admin.post(`/api/contratos/${id}/desconto`, { aprovar: true })).status, 200);

    const pi = await ana.post(`/api/contratos/${id}/emitir-pi`);
    assert.equal(pi.status, 200, JSON.stringify(pi.dados));
    assert.match(pi.dados.piNumero, /^PI-\d{4}-\d{3}$/);
    comp = await admin.get(`/api/contratos/${id}/completo`);
    assert.equal(comp.dados.contrato.status, 'ativo');
    assert.ok(comp.dados.reservas.every((r: any) => r.status === 'confirmado'));
    assert.ok(comp.dados.arte, 'acompanhamento de arte criado');
    const os = await carlos.get('/api/os?situacao=abertas');
    assert.ok(os.dados.filter((o: any) => o.contratoId === id).length >= 4, 'colagem e retirada para cada face');

    const parc = await bruno.post(`/api/contratos/${id}/parcelas`, { valor: comp.dados.contrato.valor, n: 3, primeiro: addDays(today(), 10), intervalo: 'mensal' });
    assert.equal(parc.dados.n, 3);
    const lanc = (await bruno.get(`/api/lancamentos?contrato=${id}`)).dados;
    assert.equal(lanc.length, 3);
    assert.equal(+lanc.reduce((s: number, l: any) => s + l.valor, 0).toFixed(2), comp.dados.contrato.valor);
    const baixa = await bruno.post(`/api/lancamentos/${lanc[0].id}/baixar`, { data: today() });
    assert.equal(baixa.dados.status, 'pago');
    const com = (await bruno.get(`/api/lancamentos?contrato=${id}&categoria=comissao`)).dados;
    assert.equal(com.length, 1, 'comissão do vendedor lançada');

    const pdf = await ana.get(`/api/pdf/contratos/${id}/pi`);
    assert.equal(pdf.tipo, 'application/pdf');
    assert.ok((pdf.dados as ArrayBuffer).byteLength > 1000);

    const sim = await admin.get(`/api/contratos/${id}/cancelamento?data=${addDays(today(), 510)}`);
    assert.ok(sim.dados.multa > 0);
    const canc = await admin.post(`/api/contratos/${id}/cancelar`, { data: addDays(today(), 510), multaPct: 30, motivo: 'teste' });
    assert.equal(canc.status, 200);
    const depois = await admin.get(`/api/contratos/${id}/completo`);
    assert.equal(depois.dados.contrato.status, 'cancelado');
    assert.ok(depois.dados.lancamentos.some((l: any) => l.categoria === 'multa'));
  });

  test('numeração usa o maior número, não a contagem', async () => {
    const r = await ana.post('/api/contratos', { clienteId: clientes[0].id, campanha: 'Numeração' });
    assert.equal(r.status, 201);
    const y = new Date().getFullYear();
    assert.ok(Number(r.dados.numero.split('-')[2]) >= 18, r.dados.numero);
    assert.match(r.dados.numero, new RegExp(`^CT-${y}-\\d{3}$`));
  });
});

describe('financeiro', () => {
  test('cobrança do dia segue a régua e gera link de WhatsApp com PIX', async () => {
    const r = await bruno.get('/api/financeiro/cobrar');
    assert.ok(r.dados.length >= 1);
    const item = r.dados[0];
    assert.match(item.whatsapp, /^https:\/\/wa\.me\/55/);
    assert.match(item.mensagem, /PIX copia e cola/);
    await bruno.post('/api/financeiro/cobrancas', { lancamentoId: item.lancamento.id, etapa: item.etapa });
    const de2 = await bruno.get('/api/financeiro/cobrar');
    assert.ok(de2.dados.find((x: any) => x.lancamento.id === item.lancamento.id).enviada);
  });
  test('recorrências do mês não duplicam', async () => {
    const a = await bruno.post('/api/financeiro/recorrencias/gerar', {});
    const b = await bruno.post('/api/financeiro/recorrencias/gerar', {});
    assert.ok(a.dados.n >= 1);
    assert.equal(b.dados.n, 0);
  });
  test('conciliação reconhece valor igual', async () => {
    const abertas = (await bruno.get('/api/lancamentos?tipo=receita&status=aberto')).dados;
    const f = abertas[0];
    const texto = `Data;Descrição;Valor\n${today().split('-').reverse().join('/')};PIX RECEBIDO;${String(f.valor.toFixed(2)).replace('.', ',')}`;
    const r = await bruno.post('/api/financeiro/conciliacao', { texto });
    assert.equal(r.dados.itens[0].lancamento.id, f.id);
  });
  test('resumo e exportação', async () => {
    const r = await bruno.get('/api/financeiro/resumo');
    assert.equal(r.dados.semanas.length, 6);
    const x = await bruno.get('/api/relatorios/exportar/lancamentos?formato=xlsx');
    assert.match(x.tipo, /spreadsheetml/);
  });
});

describe('campo', () => {
  test('roteiro do dia e foto sem GPS', async () => {
    const r = await carlos.get('/api/campo/roteiro');
    assert.ok(r.dados.length >= 1);
    const os = r.dados.find((o: any) => o.status !== 'concluida' && o.reservaId);
    // PNG de 1x1 pixel, sem EXIF
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    const fd = new FormData();
    fd.append('arquivo', new Blob([png], { type: 'image/png' }), 'foto.png');
    fd.append('painelId', os.painelId);
    fd.append('osId', os.id);
    const up = await carlos.req('POST', '/api/campo/fotos', undefined, fd);
    assert.equal(up.status, 201, JSON.stringify(up.dados));
    assert.equal(up.dados.verificacao, 'sem_gps');
    const os2 = await carlos.get(`/api/os/${os.id}`);
    assert.equal(os2.dados.status, 'concluida');
  });
});

describe('portal do anunciante', () => {
  test('vê só as próprias campanhas e pagamentos', async () => {
    const r = await marina.get('/api/portal');
    assert.equal(r.status, 200);
    assert.ok(r.dados.campanhas.length >= 2);
    assert.ok(r.dados.campanhas.every((k: any) => k.clienteNome === 'Rota Sul Veículos'));
    assert.ok(r.dados.fotos.length >= 1);
    const foto = await marina.get(`/api/arquivos/${r.dados.fotos[0].arquivoId}`);
    assert.equal(foto.status, 200);
    const aberta = r.dados.pagamentos.find((p: any) => p.status === 'aberto');
    const pix = await marina.get(`/api/portal/pix/${aberta.id}`);
    assert.match(pix.dados.payload, /^000201/);
  });
  test('não acessa arquivo de outro cliente', async () => {
    const outros = (await admin.get('/api/campo/fotos')).dados;
    const meu = (await marina.get('/api/portal')).dados.fotos.map((f: any) => f.arquivoId);
    const alheio = outros.find((f: any) => !meu.includes(f.arquivoId));
    assert.equal((await marina.get(`/api/arquivos/${alheio.arquivoId}`)).status, 403);
  });
});

describe('administração', () => {
  test('lixeira e restauração', async () => {
    const c = await admin.post('/api/clientes', { nome: 'Cliente Temporário' });
    assert.equal((await admin.del(`/api/clientes/${c.dados.id}`)).status, 204);
    const lx = await admin.get('/api/auditoria/lixeira');
    assert.ok(lx.dados.some((x: any) => x.id === c.dados.id));
    assert.equal((await admin.post(`/api/clientes/${c.dados.id}/restaurar`)).status, 204);
    assert.equal((await admin.get(`/api/clientes/${c.dados.id}`)).status, 200);
  });
  test('auditoria registra mudanças com antes e depois', async () => {
    const ps = (await admin.get('/api/paineis')).dados;
    await admin.patch(`/api/paineis/${ps[0].id}`, { valorBi: ps[0].valorBi + 100 });
    const a = await admin.get('/api/auditoria?tabela=paineis');
    assert.match(a.dados[0].mudancas[0], /preço\/BI/);
  });
  test('importação com prévia', async () => {
    const texto = 'Código;Endereço;Cidade;Tipo;Preço\nP-900;Rua Nova, 10;Mauá;outdoor;1.500,00\n;Sem código;Mauá;outdoor;100';
    const r = await admin.post('/api/importacao/paineis?simular=1', { texto });
    assert.equal(r.dados.linhas.length, 2);
    assert.equal(r.dados.linhas[0].dados.valorBi, 1500);
    assert.ok(r.dados.linhas[1].erro);
    const ok = await admin.post('/api/importacao/paineis', { texto });
    assert.equal(ok.dados.importados, 1);
  });
  test('convite liga um novo usuário à empresa', async () => {
    const m = await admin.post('/api/membros', { nome: 'Nova Pessoa', email: 'nova@exemplo.com', perfil: 'operacao' });
    assert.ok(m.dados.convite);
    const c = new Cliente();
    const r = await c.post('/api/auth/cadastro', { nome: 'Nova Pessoa', email: `nova${Date.now()}@exemplo.com`, senha: 'senha-forte-2', convite: m.dados.convite });
    assert.equal(r.status, 201, JSON.stringify(r.dados));
    assert.equal(r.dados.perfil, 'operacao');
  });
});
