// Dados de exemplo: uma exibidora do ABC paulista com faces, clientes,
// contratos, reservas, financeiro e equipe. Datas relativas a hoje.
// Uso: npm run db:seed   (apaga e recria a empresa "Painéis ABC Mídia (exemplo)")
import bcrypt from 'bcryptjs';
import path from 'node:path';
import { addDays, CONFIG_PADRAO, criarCalendario, TERMOS_VERSAO, today } from '@shared';
import { inserir, pool, q1, tx } from './db';
import { sincronizarOS } from './dominio';
import { migrar } from './migrate';

export const SENHA_DEMO = 'painel123';

function fotoSvg(texto: string, cor: string, fundo = '#8EC5E8') {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${fundo}"/><stop offset="1" stop-color="#DCEEF8"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/><rect y="245" width="400" height="55" fill="#7A8B6B"/><rect x="118" y="170" width="10" height="80" fill="#444"/><rect x="272" y="170" width="10" height="80" fill="#444"/><rect x="40" y="60" width="320" height="118" fill="#222"/><rect x="46" y="66" width="308" height="106" fill="${cor}"/><text x="200" y="126" font-family="Arial,sans-serif" font-weight="700" font-size="22" fill="#fff" text-anchor="middle">${texto}</text><text x="392" y="292" font-family="Arial,sans-serif" font-size="11" fill="#fff" text-anchor="end">imagem ilustrativa</text></svg>`);
}

export async function seed() {
  await migrar(false);
  const t = today();
  const C = criarCalendario({});
  const atual = C.biOf(t);
  const BI = (d: number) => C.biAdd(atual, d);
  const per = (a: number, b: number) => ({ ini: C.biIni(BI(a).ano, BI(a).bi), fim: C.biFim(BI(b).ano, BI(b).bi) });
  const y = new Date().getFullYear();
  const hash = await bcrypt.hash(SENHA_DEMO, 10);

  return tx(async (c) => {
    const velha = await q1<any>(c, `SELECT id FROM empresas WHERE nome = 'Painéis ABC Mídia (exemplo)'`);
    if (velha) await c.query('DELETE FROM empresas WHERE id = $1', [velha.id]);
    await c.query(`DELETE FROM usuarios WHERE email LIKE '%@paineisabc.exemplo' OR email IN ('marketing@rotasul.exemplo','midia@faro.exemplo')`);

    const cfg = {
      ...CONFIG_PADRAO,
      empresa: { razao: 'Painéis ABC Mídia (exemplo)', cnpj: '11.222.333/0001-44', cidade: 'São Bernardo do Campo', uf: 'SP', email: 'contato@paineisabc.exemplo', telefone: '(11) 4000-1000' },
      pix: { chave: 'financeiro@paineisabc.exemplo', nome: 'PAINEIS ABC MIDIA', cidade: 'SAO BERNARDO' },
      sazonal: [{ nome: 'Black Friday e Natal', mesIni: 11, mesFim: 12, pct: 20 }],
      plano: { id: 'pro', status: 'trial', trialAte: addDays(t, 20), proximaCobranca: '' },
    };
    const emp = await q1<any>(c, 'INSERT INTO empresas (nome, config) VALUES ($1, $2) RETURNING id', ['Painéis ABC Mídia (exemplo)', JSON.stringify(cfg)]);
    const E = emp.id as string;
    const ins = (tabela: string, d: Record<string, any>) => inserir<any>(c, tabela, { empresaId: E, ...d }, ['empresaId', ...Object.keys(d)]);

    /* estruturas e faces */
    const est: Record<string, any> = {};
    const ests: [string, string, string, string, number, number, Record<string, any>][] = [
      ['E-001', 'Av. Kennedy, 1200', 'Jardim do Mar', 'São Bernardo do Campo', -23.6955, -46.556, { licNumero: 'LIC-0412/2025', licOrgao: 'Prefeitura de São Bernardo', licTaxa: 480, licVencimento: addDays(t, 170), locProprietario: 'João Martins', locContato: '(11) 98888-1200', locValor: 650, locDia: 10, locIndice: 'IGP-M', locReajuste: addDays(t, 110), locVencimento: addDays(t, 470) }],
      ['E-002', 'Rod. Anchieta, km 21', 'Demarchi', 'São Bernardo do Campo', -23.721, -46.565, { licNumero: 'LIC-0388/2024', licOrgao: 'Prefeitura de São Bernardo', licTaxa: 720, licVencimento: addDays(t, 40), locProprietario: 'Transportadora Serra Azul', locContato: '(11) 4351-2000', locValor: 900, locDia: 1, locIndice: 'IPCA', locReajuste: addDays(t, 20), locVencimento: addDays(t, 260) }],
      ['E-003', 'Av. Pereira Barreto, 400', 'Paraíso', 'Santo André', -23.66, -46.53, { licNumero: 'SA-2211', licOrgao: 'Prefeitura de Santo André', licTaxa: 530, licVencimento: addDays(t, 300) }],
      ['E-004', 'Av. Goiás, 1500', 'Santa Paula', 'São Caetano do Sul', -23.62, -46.565, { licNumero: 'SCS-077', licOrgao: 'Prefeitura de São Caetano', licTaxa: 610, licVencimento: addDays(t, -10) }],
      ['E-005', 'Av. Senador Vergueiro, 3000', 'Rudge Ramos', 'São Bernardo do Campo', -23.664, -46.575, { licNumero: 'LIC-0501/2025', licOrgao: 'Prefeitura de São Bernardo', licTaxa: 690, licVencimento: addDays(t, 220) }],
      ['E-006', 'Av. Industrial, 700', 'Jardim', 'Santo André', -23.648, -46.534, { licNumero: 'SA-1980', licOrgao: 'Prefeitura de Santo André', licTaxa: 1200, licVencimento: addDays(t, 400), locProprietario: 'Condomínio Ed. Industrial', locValor: 1800, locDia: 5, locIndice: 'IGP-M', locReajuste: addDays(t, 200), locVencimento: addDays(t, 900) }],
      ['E-007', 'Estrada do Montanhão, 1100', 'Montanhão', 'São Bernardo do Campo', -23.7, -46.52, {}],
      ['E-008', 'Av. Lions, 250', 'Centro', 'Diadema', -23.686, -46.623, { licNumero: 'DIA-3030', licOrgao: 'Prefeitura de Diadema', licTaxa: 950, licVencimento: addDays(t, 330) }],
    ];
    for (const [codigo, endereco, bairro, cidade, lat, lng, extra] of ests) est[codigo] = await ins('estruturas', { codigo, endereco, bairro, cidade, uf: 'SP', lat, lng, ...extra });

    const pn: Record<string, any> = {};
    const faces: [string, string, string, string, number, number, boolean, number, string, string, Record<string, any>?][] = [
      ['P-001', 'E-001', 'Única', 'outdoor', 9, 3, true, 1800, 'ativo', 'Sentido centro'],
      ['P-002-A', 'E-002', 'A', 'outdoor', 9, 3, true, 2400, 'ativo', 'Sentido litoral'],
      ['P-002-B', 'E-002', 'B', 'outdoor', 9, 3, true, 2200, 'ativo', 'Sentido São Paulo'],
      ['P-003', 'E-003', 'Única', 'frontlight', 9, 3, true, 2900, 'ativo', 'Sentido bairro'],
      ['P-004', 'E-004', 'Única', 'outdoor', 9, 3, false, 1600, 'ativo', 'Sentido centro'],
      ['P-005', 'E-005', 'Única', 'backlight', 9, 3, true, 3400, 'ativo', 'Sentido São Paulo'],
      ['P-006', 'E-006', 'Única', 'empena', 10, 20, false, 6500, 'ativo', 'Fachada lateral'],
      ['P-007', 'E-007', 'Única', 'outdoor', 9, 3, false, 1200, 'inativo', 'Sentido bairro'],
      ['P-008', 'E-008', 'Única', 'led', 6, 3, true, 900, 'ativo', 'Dupla face', { slots: 6, insercaoSeg: 10, loopSeg: 60, horasDia: 18 }],
    ];
    for (const [codigo, e, face, tipo, largura, altura, iluminado, valorBi, status, sentido, extra] of faces)
      pn[codigo] = await ins('paineis', { estruturaId: est[e].id, codigo, face, tipo, largura, altura, iluminado, valorBi, status, sentido, slots: 1, ...(extra || {}) });

    /* clientes */
    const cli: Record<string, any> = {};
    for (const [k, d] of Object.entries({
      rota: { nome: 'Rota Sul Veículos', tipo: 'anunciante', documento: '12.345.678/0001-90', contato: 'Marina Duarte', email: 'marketing@rotasul.exemplo', telefone: '(11) 94321-0000', cidade: 'São Bernardo do Campo', cep: '09725-000', logradouro: 'Av. Kennedy', numero: '900', bairro: 'Jardim do Mar', uf: 'SP', codigoMunicipio: '3548708' },
      faro: { nome: 'Faro Comunicação', tipo: 'agencia', documento: '23.456.789/0001-01', contato: 'Diego Lima', email: 'midia@faro.exemplo', telefone: '(11) 94432-1100', comissao: 20, cidade: 'Santo André' },
      bom: { nome: 'Supermercados Bom Preço ABC', tipo: 'anunciante', documento: '34.567.890/0001-12', contato: 'Paula Reis', email: 'compras@bompreco.exemplo', telefone: '(11) 94555-2200', cidade: 'Santo André', cep: '09015-000', logradouro: 'Rua das Figueiras', numero: '1200', bairro: 'Jardim', uf: 'SP', codigoMunicipio: '3547809' },
      hor: { nome: 'Faculdade Horizonte', tipo: 'anunciante', documento: '45.678.901/0001-23', contato: 'Renato Alves', email: 'comunicacao@horizonte.exemplo', telefone: '(11) 94777-3300', cidade: 'São Caetano do Sul', cep: '09541-000', logradouro: 'Av. Goiás', numero: '2000', bairro: 'Santa Paula', uf: 'SP', codigoMunicipio: '3548807' },
    })) cli[k] = await ins('clientes', d);

    /* equipe (todas as contas com a senha de demonstração) */
    const mem: Record<string, any> = {};
    const equipe: [string, string, string, string, string?][] = [
      ['admin', 'Gustavo Admin', 'admin@paineisabc.exemplo', 'admin'],
      ['ana', 'Ana Ribeiro', 'ana@paineisabc.exemplo', 'comercial'],
      ['bruno', 'Bruno Teixeira', 'bruno@paineisabc.exemplo', 'financeiro'],
      ['carlos', 'Carlos Souza', 'carlos@paineisabc.exemplo', 'operacao'],
      ['marina', 'Marina Duarte', 'marketing@rotasul.exemplo', 'cliente', 'rota'],
    ];
    for (const [k, nome, email, perfil, ck] of equipe) {
      const u = await q1<any>(c, 'INSERT INTO usuarios (nome, email, senha_hash, termos_versao, termos_aceitos_em) VALUES ($1,$2,$3,$4,now()) RETURNING id', [nome, email, hash, TERMOS_VERSAO]);
      mem[k] = await ins('membros', { usuarioId: u.id, nome, email, perfil, clienteId: ck ? cli[ck].id : null });
    }
    await ins('membros', { nome: 'Diego Lima', email: 'midia@faro.exemplo', perfil: 'cliente', clienteId: cli.faro.id, convite: 'DIE-5R8N' });

    /* contratos */
    const k: Record<string, any> = {};
    const K = (id: string, d: Record<string, any>) => ins('contratos', { vendedorId: mem.ana.id, ...d }).then((r) => (k[id] = r));
    await K('feirao', { numero: `CT-${y}-014`, clienteId: cli.rota.id, campanha: 'Feirão de Seminovos', data: addDays(t, -32), valor: 24300, status: 'ativo', piNumero: `PI-${y}-008`, piData: addDays(t, -25), validadeProposta: addDays(t, -22), condicoes: 'Pagamento em 3 parcelas mensais.', obs: 'Desconto negociado sobre a tabela', aprovadoEm: addDays(t, -26) });
    await K('aniv', { numero: `CT-${y}-015`, clienteId: cli.bom.id, agenciaId: cli.faro.id, campanha: 'Aniversário Bom Preço', data: addDays(t, -20), valor: 26000, status: 'ativo', piNumero: `PI-${y}-009`, piData: addDays(t, -15), validadeProposta: addDays(t, -10), condicoes: 'Via Faro Comunicação. Comissão de agência de 20%.', aprovadoEm: addDays(t, -16) });
    await K('vest', { numero: `CT-${y}-016`, clienteId: cli.hor.id, campanha: `Vestibular ${y + 1}`, data: addDays(t, -5), valor: 24900, status: 'proposta', validadeProposta: addDays(t, 5), condicoes: 'Proposta com desconto por volume.', obs: 'Aguardando retorno do cliente' });
    await K('suv', { numero: `CT-${y}-009`, clienteId: cli.rota.id, campanha: 'Lançamento SUV', data: addDays(t, -112), valor: 15900, status: 'encerrado', piNumero: `PI-${y}-004`, piData: addDays(t, -105) });
    await K('black', { numero: `CT-${y}-017`, clienteId: cli.rota.id, campanha: 'Black Friday Rota Sul', data: addDays(t, -2), valor: 3960, status: 'aprovacao', validadeProposta: addDays(t, 8), obs: 'Cliente pediu 25% de desconto' });

    /* reservas */
    const rs: Record<string, any> = {};
    const R = async (id: string, painel: string, kk: string, a: number, b: number, status: string, extra: Record<string, any> = {}) => {
      rs[id] = await ins('reservas', { painelId: pn[painel].id, contratoId: k[kk].id, campanha: k[kk].campanha, ...per(a, b), status, slots: 1, ...extra });
      if (status === 'confirmado') await sincronizarOS(c, { empresaId: E } as any, rs[id]);
    };
    await R('r1', 'P-001', 'feirao', -1, 1, 'confirmado');
    await R('r2', 'P-002-A', 'feirao', -1, 1, 'confirmado');
    await R('r3', 'P-005', 'feirao', -1, 1, 'confirmado');
    await R('r11', 'P-008', 'feirao', -1, 1, 'confirmado');
    await R('r4', 'P-003', 'aniv', 0, 3, 'confirmado');
    await R('r5', 'P-004', 'aniv', 0, 3, 'confirmado');
    await R('r6', 'P-008', 'aniv', 0, 3, 'confirmado', { slots: 2 });
    await R('r7', 'P-001', 'vest', 3, 5, 'reservado', { validade: addDays(t, 1) });
    await R('r8', 'P-006', 'vest', 3, 5, 'reservado', { validade: addDays(t, 4) });
    await R('r12', 'P-006', 'black', 3, 4, 'fila');
    await R('r13', 'P-002-B', 'black', 2, 3, 'reservado', { validade: addDays(t, 4) });
    await R('r9', 'P-002-A', 'suv', -7, -5, 'confirmado');
    await R('r10', 'P-003', 'suv', -7, -5, 'confirmado');
    // Trabalhos de campo já feitos na campanha que está no ar.
    await c.query(`UPDATE ordens_servico SET status = 'concluida', concluida_em = prazo WHERE empresa_id = $1 AND (prazo < CURRENT_DATE - 30 OR (reserva_id = ANY($2) AND tipo IN ('colagem','conteudo')))`, [E, [rs.r1.id, rs.r2.id, rs.r11.id, rs.r6.id]]);
    await c.query(`UPDATE ordens_servico SET status = 'concluida', concluida_em = prazo WHERE empresa_id = $1 AND reserva_id = ANY($2)`, [E, [rs.r9.id, rs.r10.id]]);

    /* financeiro */
    const F = (d: Record<string, any>) => ins('lancamentos', { status: 'aberto', ...d });
    const comp = t.slice(0, 7);
    await F({ tipo: 'receita', categoria: 'contrato', descricao: `CT-${y}-009 · parcela 1/2`, contratoId: k.suv.id, vencimento: addDays(t, -93), valor: 7950, status: 'pago', pagoEm: addDays(t, -93), nfStatus: 'emitida', nfNumero: '1021', nfData: addDays(t, -98) });
    await F({ tipo: 'receita', categoria: 'contrato', descricao: `CT-${y}-009 · parcela 2/2`, contratoId: k.suv.id, vencimento: addDays(t, -63), valor: 7950, status: 'pago', pagoEm: addDays(t, -61), nfStatus: 'emitida', nfNumero: '1035', nfData: addDays(t, -68) });
    const p1 = await F({ tipo: 'receita', categoria: 'contrato', descricao: `CT-${y}-014 · parcela 1/3`, contratoId: k.feirao.id, vencimento: addDays(t, -20), valor: 8100, status: 'pago', pagoEm: addDays(t, -20), nfStatus: 'emitida', nfNumero: '1102', nfData: addDays(t, -24) });
    await F({ tipo: 'receita', categoria: 'contrato', descricao: `CT-${y}-014 · parcela 2/3`, contratoId: k.feirao.id, vencimento: addDays(t, 2), valor: 8100, nfStatus: 'a_emitir' });
    await F({ tipo: 'receita', categoria: 'contrato', descricao: `CT-${y}-014 · parcela 3/3`, contratoId: k.feirao.id, vencimento: addDays(t, 32), valor: 8100, nfStatus: 'a_emitir' });
    await F({ tipo: 'receita', categoria: 'contrato', descricao: `CT-${y}-015 · parcela 1/2`, contratoId: k.aniv.id, vencimento: addDays(t, -6), valor: 13000, nfStatus: 'a_emitir' });
    await F({ tipo: 'receita', categoria: 'contrato', descricao: `CT-${y}-015 · parcela 2/2`, contratoId: k.aniv.id, vencimento: addDays(t, 25), valor: 13000, nfStatus: 'a_emitir' });
    await F({ tipo: 'despesa', categoria: 'comissao', descricao: `Comissão Ana Ribeiro · CT-${y}-014 · parcela 1/3`, contratoId: k.feirao.id, vencimento: addDays(t, 15), valor: 405, comissaoDe: p1.id, comissaoTipo: 'vendedor' });
    await F({ tipo: 'despesa', categoria: 'manutencao', descricao: 'OS · troca de lona P-001', painelId: pn['P-001'].id, vencimento: addDays(t, -26), valor: 450, status: 'pago', pagoEm: addDays(t, -26) });
    await F({ tipo: 'despesa', categoria: 'licenca', descricao: 'Taxa de licença SCS-077 · E-004', estruturaId: est['E-004'].id, vencimento: addDays(t, -40), valor: 610, status: 'pago', pagoEm: addDays(t, -40) });

    const rec: Record<string, any> = {};
    rec.energia = await ins('recorrencias', { descricao: 'Energia · iluminação dos painéis', categoria: 'energia', valor: 1350, dia: 19 });
    rec.e2 = await ins('recorrencias', { descricao: 'Aluguel do terreno · E-002 · Transportadora Serra Azul', categoria: 'aluguel', valor: 900, dia: 1, estruturaId: est['E-002'].id });
    await ins('recorrencias', { descricao: 'Aluguel do terreno · E-001 · João Martins', categoria: 'aluguel', valor: 650, dia: 10, estruturaId: est['E-001'].id });
    await ins('recorrencias', { descricao: 'Aluguel do terreno · E-006 · Condomínio Ed. Industrial', categoria: 'aluguel', valor: 1800, dia: 5, estruturaId: est['E-006'].id });
    await ins('recorrencias', { descricao: 'Contabilidade', categoria: 'administrativo', valor: 600, dia: 5 });
    await F({ tipo: 'despesa', categoria: 'aluguel', descricao: `Aluguel do terreno · E-002 · ${comp.slice(5)}/${y}`, estruturaId: est['E-002'].id, vencimento: `${comp}-01`, valor: 900, status: 'pago', pagoEm: `${comp}-01`, recorrenciaId: rec.e2.id, competencia: comp });
    await F({ tipo: 'despesa', categoria: 'energia', descricao: `Energia · iluminação dos painéis · ${comp.slice(5)}/${y}`, vencimento: `${comp}-19`, valor: 1350, recorrenciaId: rec.energia.id, competencia: comp });

    /* manutenção avulsa */
    await ins('ordens_servico', { painelId: pn['P-007'].id, tipo: 'estrutura', abertura: addDays(t, -12), prazo: addDays(t, -2), responsavel: 'Equipe Montagem', custo: 3800, descricao: 'Coluna com corrosão na base; face fora de venda até o reparo.' });
    await ins('ordens_servico', { painelId: pn['P-005'].id, tipo: 'iluminacao', abertura: addDays(t, -4), prazo: addDays(t, 2), responsavel: 'Eletro ABC', status: 'andamento', custo: 620, descricao: 'Duas lâmpadas queimadas no lado direito.', membroId: mem.carlos.id });

    /* artes e fotos */
    const arq = async (nome: string, buf: Buffer) => ins('arquivos', { nome, mime: 'image/svg+xml', tamanho: buf.length, dados: buf });
    const a1 = await arq('feirao-seminovos-9x3.svg', fotoSvg('FEIRÃO DE SEMINOVOS', '#C8102E'));
    await ins('artes', { contratoId: k.feirao.id, status: 'recebido', prazo: addDays(per(-1, -1).ini, -7), necessario: '64 folhas + 1 lona + 1 arquivo digital', grafica: 'Gráfica Impacto', previsao: addDays(per(-1, -1).ini, -3), recebido: '70 folhas, 1 lona, vídeo 10s', recebidoEm: addDays(per(-1, -1).ini, -4), arquivoId: a1.id, nomeArquivo: 'feirao-seminovos-9x3.svg' });
    const a2 = await arq('bompreco-aniversario.svg', fotoSvg('ANIVERSÁRIO BOM PREÇO', '#E87722'));
    await ins('artes', { contratoId: k.aniv.id, status: 'grafica', prazo: addDays(per(0, 0).ini, -7), necessario: '32 folhas + 1 lona + 1 arquivo digital', grafica: 'Gráfica Impacto', previsao: addDays(t, 1), obs: 'Arte aprovada pela agência.', arquivoId: a2.id, nomeArquivo: 'bompreco-aniversario.svg' });
    await ins('artes', { contratoId: k.suv.id, status: 'recebido', necessario: '32 folhas + 1 lona', recebido: 'Completo', recebidoEm: addDays(t, -110) });

    const foto = async (r: any, painel: string, lat: number | null, lng: number | null, verificacao: string, dist: number | null, cor: string, txt: string, fundo?: string) => {
      const a = await arq(`foto-${painel}.svg`, fotoSvg(txt, cor, fundo));
      await ins('comprovacoes', { reservaId: r.id, painelId: pn[painel].id, contratoId: r.contratoId, data: r.ini, membroId: mem.carlos.id, tipo: 'colagem', arquivoId: a.id, exif: lat ? { lat, lng, dataHora: `${r.ini}T09:42:00` } : {}, verificacao, distanciaM: dist });
    };
    await foto(rs.r1, 'P-001', -23.69561, -46.55588, 'ok', 21, '#C8102E', 'FEIRÃO DE SEMINOVOS');
    await foto(rs.r2, 'P-002-A', -23.72118, -46.56532, 'ok', 38, '#C8102E', 'FEIRÃO DE SEMINOVOS', '#9CC3DA');
    await foto(rs.r11, 'P-008', -23.68612, -46.62311, 'ok', 14, '#C8102E', 'FEIRÃO · LED', '#2B3A55');
    await foto(rs.r6, 'P-008', -23.68612, -46.62311, 'ok', 14, '#E87722', 'BOM PREÇO · LED', '#2B3A55');
    const fp = await arq('ponto-e001.svg', fotoSvg('E-001 · AV. KENNEDY', '#3A6EA5'));
    await ins('fotos_ponto', { estruturaId: est['E-001'].id, arquivoId: fp.id, data: addDays(t, -200) });

    /* integrações em modo simulado, para demonstrar sem contratar nada */
    await c.query(`INSERT INTO integracoes (empresa_id, tipo, provedor, config) VALUES ($1, 'whatsapp', 'simulado', $2), ($1, 'nfse', 'simulado', $3)`,
      [E, JSON.stringify({ automatico: false, horaIni: 9, horaFim: 18, avisarFoto: true }),
        JSON.stringify({ ambiente: 'homologacao', automatica: 'manual', diasAntes: 5, inscricaoMunicipal: '123456', codigoMunicipio: '3548708', codigoTributarioMunicipio: '', optanteSimples: true, regimeEspecial: null, issRetido: false })]);
    await c.query(`INSERT INTO auditoria (empresa_id, autor_nome, perfil, acao, tabela, rotulo) VALUES ($1, 'Sistema', 'admin', 'criou', 'empresas', 'Dados de exemplo carregados')`, [E]);
    return E;
  });
}

// Compara pelo nome do arquivo: no build (esbuild) os módulos vão juntos para o mesmo arquivo.
if (/^seed\.(ts|js)$/.test(path.basename(process.argv[1] || ''))) {
  seed()
    .then(() => {
      console.log('Dados de exemplo criados. Entre com qualquer conta abaixo e a senha "' + SENHA_DEMO + '":');
      console.log('  admin@paineisabc.exemplo   (Administrador)');
      console.log('  ana@paineisabc.exemplo     (Comercial)');
      console.log('  bruno@paineisabc.exemplo   (Financeiro)');
      console.log('  carlos@paineisabc.exemplo  (Operação / campo)');
      console.log('  marketing@rotasul.exemplo  (Anunciante · portal)');
      return pool.end();
    })
    .catch((e) => { console.error(e); process.exit(1); });
}
