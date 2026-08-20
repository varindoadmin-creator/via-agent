export interface BcaPdfCredit {
  date: string;
  amount: number;
  description: string;
  nameInStatement: string;
}

const MONTHS: Record<string, number> = {
  JANUARI: 1, FEBRUARI: 2, MARET: 3, APRIL: 4, MEI: 5, JUNI: 6,
  JULI: 7, AGUSTUS: 8, SEPTEMBER: 9, OKTOBER: 10, NOVEMBER: 11, DESEMBER: 12,
};

function money(value: string): number {
  const parsed = Number(value.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function isNoise(line: string): boolean {
  return !line || /^(?:TANGGAL|SALDO AWAL|BERSAMBUNG|REKENING GIRO|PERIODE|MATA UANG|HALAMAN|NO\. REKENING|CATATAN|--)\b/i.test(line) || /^\d+\s*\/\s*\d+$/.test(line);
}

export function parseBcaStatementPdfText(text: string): BcaPdfCredit[] {
  const normalized = text.replace(/\r/g, '').replace(/\u00a0/g, ' ');
  const periodMatch = normalized.match(/PERIODE\s*:\s*([A-Z]+)\s+(\d{4})/i);
  if (!periodMatch) throw new Error('Unable to identify the BCA statement period.');
  const month = MONTHS[periodMatch[1].toUpperCase()];
  const year = Number(periodMatch[2]);
  if (!month || !year) throw new Error('Unsupported BCA statement period.');

  const lines = normalized.split('\n').map(line => line.trim());
  const starts: number[] = [];
  lines.forEach((line, index) => { if (/^\d{2}\/\d{2}\s+/.test(line)) starts.push(index); });
  const credits: BcaPdfCredit[] = [];

  for (let position = 0; position < starts.length; position++) {
    const block = lines.slice(starts[position], starts[position + 1] ?? lines.length).filter(line => !isNoise(line));
    if (!block.length) continue;
    const first = block[0];
    const dateMatch = first.match(/^(\d{2})\/(\d{2})\s+(.+)$/);
    if (!dateMatch || Number(dateMatch[2]) !== month) continue;
    const body = [dateMatch[3], ...block.slice(1)];
    const joined = body.join(' ');
    if (/\bDB\b/i.test(dateMatch[3]) || body.some(line => /\bDB(?:\s|$)/i.test(line) && /[\d,]+\.\d{2}/.test(line))) continue;

    const mutationLine = [...body].reverse().find(line => /[\d,]+\.\d{2}/.test(line));
    const amountMatch = mutationLine?.match(/([\d,]+\.\d{2})/);
    const amount = amountMatch ? money(amountMatch[1]) : 0;
    if (amount <= 0) continue;

    const candidates = body.filter(line =>
      !/[\d,]+\.\d{2}/.test(line) &&
      !/^\d+(?:\.\d+)?$/.test(line) &&
      !/^\d{4}\/FT/i.test(line) &&
      !/^TANGGAL\s*:/i.test(line) &&
      !/^[-•]+$/.test(line) &&
      line.length >= 3
    );
    const nameInStatement = candidates.at(-1) || dateMatch[3];
    credits.push({
      date: `${dateMatch[1]}/${dateMatch[2]}/${year}`,
      amount,
      description: joined.replace(/\s+/g, ' ').trim(),
      nameInStatement,
    });
  }

  if (!credits.length) throw new Error('No incoming transactions were found in this BCA PDF statement.');
  return credits;
}
