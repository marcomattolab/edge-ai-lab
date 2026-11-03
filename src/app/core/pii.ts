import { OcrWord } from './ocr.service';

export interface PiiMatch {
  id: number;
  kind: string;
  value: string;
  start: number;
  end: number;
}

interface Rule {
  kind: string;
  re: RegExp;
  validate?: (s: string) => boolean;
}

const digits = (s: string) => s.replace(/\D/g, '');

function luhn(s: string): boolean {
  const d = digits(s);
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

function iban(s: string): boolean {
  const c = s.replace(/\s/g, '').toUpperCase();
  if (c.length < 15 || c.length > 34) return false;
  const rearranged = c.slice(4) + c.slice(0, 4);
  let rem = 0;
  for (const ch of rearranged) {
    const v = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const x of v) rem = (rem * 10 + Number(x)) % 97;
  }
  return rem === 1;
}

function partitaIva(s: string): boolean {
  const d = digits(s).slice(-11);
  if (d.length !== 11) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    let n = Number(d[i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return (10 - (sum % 10)) % 10 === Number(d[10]);
}

// L'ordine conta: le regole più specifiche vengono prima, le sovrapposizioni vengono scartate.
const RULES: Rule[] = [
  { kind: 'Email', re: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g },
  { kind: 'IBAN', re: /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,4})?\b/g, validate: iban },
  { kind: 'Codice fiscale', re: /\b[A-Z]{6}\d{2}[A-EHLMPR-T]\d{2}[A-Z]\d{3}[A-Z]\b/gi },
  { kind: 'Carta di pagamento', re: /\b(?:\d[ -]?){13,19}\b/g, validate: luhn },
  { kind: 'Partita IVA', re: /\b(?:IT\s?)?\d{11}\b/g, validate: partitaIva },
  { kind: 'Telefono', re: /(?:(?:\+|00)\d{1,3}[\s.-]?)?\b(?:3\d{2}[\s.-]?\d{6,7}|0\d{1,3}[\s./-]?\d{5,8})\b/g },
  { kind: 'Indirizzo IP', re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
];

export function detectPii(text: string): PiiMatch[] {
  const found: PiiMatch[] = [];
  for (const rule of RULES) {
    for (const m of text.matchAll(rule.re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (rule.validate && !rule.validate(m[0])) continue;
      if (found.some((f) => start < f.end && end > f.start)) continue;
      found.push({ id: found.length, kind: rule.kind, value: m[0], start, end });
    }
  }
  return found.sort((a, b) => a.start - b.start).map((f, i) => ({ ...f, id: i }));
}

/** Unisce le parole OCR in un testo unico e ricorda dove inizia ciascuna parola. */
export function joinWords(words: OcrWord[]): { text: string; spans: { start: number; end: number }[] } {
  let text = '';
  const spans = words.map((w) => {
    if (text) text += ' ';
    const start = text.length;
    text += w.text;
    return { start, end: text.length };
  });
  return { text, spans };
}

export function wordsForMatch(spans: { start: number; end: number }[], m: PiiMatch): number[] {
  const idx: number[] = [];
  spans.forEach((s, i) => {
    if (s.start < m.end && s.end > m.start) idx.push(i);
  });
  return idx;
}
