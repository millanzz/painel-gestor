// Datas como texto ISO (AAAA-MM-DD), sempre no fuso local, para não haver
// deslocamento de um dia entre o banco, a API e a tela.

export const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const MESES_L = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const DIAS_L = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export const pad2 = (n: number | string) => String(n).padStart(2, '0');

export function isoOf(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseISO(s: string | Date): Date {
  if (s instanceof Date) return new Date(s);
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(d: string | Date, n: number): string {
  const x = parseISO(d instanceof Date ? isoOf(d) : d);
  x.setDate(x.getDate() + n);
  return isoOf(x);
}

/** Quantidade de dias de a até b, contando os dois. */
export function daysIncl(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 864e5) + 1;
}

export const today = () => isoOf(new Date());
export const overlap = (a1: string, a2: string, b1: string, b2: string) => !(a2 < b1 || a1 > b2);
export const maxIso = (a: string, b: string) => (a > b ? a : b);
export const minIso = (a: string, b: string) => (a < b ? a : b);

export function fdate(s?: string | null): string {
  return s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
}

export function dm(d: string | Date): string {
  const x = d instanceof Date ? d : parseISO(d);
  return `${pad2(x.getDate())}/${pad2(x.getMonth() + 1)}`;
}

export const periodoTxt = (ini: string, fim: string) => `${fdate(ini)} a ${fdate(fim)}`;

/* ---------------------------------------------------------------------------
 * Calendário de bissemanas (BI). O mercado de outdoor vende em períodos de
 * 14 dias, numerados de 01 a 26 a cada ano. Por padrão a BI 01 começa na
 * primeira segunda-feira do ano; cada empresa pode ajustar esse início ano a ano.
 * ------------------------------------------------------------------------- */

export type CalendarioBI = Record<string, string>; // ano -> data de início da BI 01

export interface BI { ano: number; bi: number }

export function criarCalendario(cal: CalendarioBI = {}) {
  const bi01 = (year: number): Date => {
    const c = cal[String(year)];
    if (c && /^\d{4}-\d{2}-\d{2}$/.test(c)) return parseISO(c);
    const d = new Date(year, 0, 1);
    const off = (1 - d.getDay() + 7) % 7;
    d.setDate(1 + off);
    return d;
  };
  const biStart = (year: number, n: number) => { const d = bi01(year); d.setDate(d.getDate() + (n - 1) * 14); return d; };
  const biEnd = (year: number, n: number) => { const d = biStart(year, n); d.setDate(d.getDate() + 13); return d; };

  const biOf = (date: string | Date): BI => {
    const d = date instanceof Date ? date : parseISO(date);
    const y = d.getFullYear();
    for (const yy of [y + 1, y, y - 1]) {
      if (d >= biStart(yy, 1)) {
        for (let n = 26; n >= 1; n--) if (d >= biStart(yy, n)) return { ano: yy, bi: n };
      }
    }
    return { ano: y - 1, bi: 26 };
  };
  const biIni = (a: number, n: number) => isoOf(biStart(a, n));
  const biFim = (a: number, n: number) => isoOf(biEnd(a, n));

  /** Soma (ou subtrai) bissemanas, virando o ano quando preciso. */
  const biAdd = ({ ano, bi }: BI, delta: number): BI => {
    let a = ano, n = bi + delta;
    while (n > 26) { n -= 26; a++; }
    while (n < 1) { n += 26; a--; }
    return { ano: a, bi: n };
  };

  /** "BI 21–22/2026" quando o período coincide com bissemanas inteiras. */
  const biLabel = (ini: string, fim: string): string | null => {
    const a = biOf(ini), b = biOf(fim);
    if (biIni(a.ano, a.bi) !== ini || biFim(b.ano, b.bi) !== fim) return null;
    if (a.ano === b.ano) return a.bi === b.bi ? `BI ${pad2(a.bi)}/${a.ano}` : `BI ${pad2(a.bi)}–${pad2(b.bi)}/${a.ano}`;
    return `BI ${pad2(a.bi)}/${a.ano}–${pad2(b.bi)}/${b.ano}`;
  };

  return { biOf, biIni, biFim, biAdd, biLabel, biStart };
}

export type Calendario = ReturnType<typeof criarCalendario>;
