const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const money = (v: number | string | null | undefined) => BRL.format(Number(v) || 0);

/** R$ 66,2 mil · R$ 8.100 (sem centavos quando redondo). */
export function moneyCurto(v: number): string {
  v = Number(v) || 0;
  if (Math.abs(v) >= 10000) return 'R$ ' + (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil';
  return money(v).replace(/,00$/, '');
}

export const num = (v: number, d = 0) => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: d });
export const pct = (v: number) => num(v, 1).replace(/,0$/, '') + '%';
export const digitos = (s: string) => String(s || '').replace(/\D/g, '');

export function linkWhatsApp(tel: string, msg: string): string {
  let d = digitos(tel);
  if (d.length && d.length <= 11) d = '55' + d;
  return `https://wa.me/${d}?text=${encodeURIComponent(msg)}`;
}

export function distanciaM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371e3, r = (x: number) => (x * Math.PI) / 180;
  const dl = r(lat2 - lat1), dn = r(lng2 - lng1);
  const h = Math.sin(dl / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dn / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export const iniciais = (nome: string) =>
  String(nome || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
