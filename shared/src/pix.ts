// PIX "copia e cola" estático (BR Code), conforme o manual do Banco Central.

export function crc16(s: string): string {
  let c = 0xffff;
  for (let i = 0; i < s.length; i++) {
    c ^= s.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
  }
  return c.toString(16).toUpperCase().padStart(4, '0');
}

export const semAcento = (s: string) =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, '').toUpperCase();

/** Identificador da transação: ajuda a conciliar o extrato com a parcela. */
export const txidDe = (id: string) => ('PG' + String(id || '').replace(/[^A-Za-z0-9]/g, '')).slice(0, 25);

export function pixPayload(pix: { chave: string; nome: string; cidade: string }, valor: number, txid: string): string {
  if (!pix?.chave) return '';
  const tlv = (id: string, v: string) => id + String(v.length).padStart(2, '0') + v;
  const conta = tlv('00', 'br.gov.bcb.pix') + tlv('01', pix.chave.trim());
  const s =
    tlv('00', '01') +
    tlv('26', conta) +
    tlv('52', '0000') +
    tlv('53', '986') +
    (valor > 0 ? tlv('54', valor.toFixed(2)) : '') +
    tlv('58', 'BR') +
    tlv('59', semAcento(pix.nome || 'RECEBEDOR').slice(0, 25)) +
    tlv('60', semAcento(pix.cidade || 'SAO PAULO').slice(0, 15)) +
    tlv('62', tlv('05', txid || '***')) +
    '6304';
  return s + crc16(s);
}
