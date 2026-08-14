const COMPANY_WORDS = new Set(['PT', 'CV', 'UD', 'TB', 'TOKO']);

const SPOKEN_CODE_WORDS: Record<string, string> = {
  zero: '0', oh: 'O', one: '1', two: '2', three: '3', four: '4', five: '5',
  six: '6', seven: '7', eight: '8', nine: '9',
  nol: '0', kosong: '0', satu: '1', dua: '2', tiga: '3', empat: '4', lima: '5',
  enam: '6', tujuh: '7', delapan: '8', sembilan: '9',
  ay: 'A', bee: 'B', be: 'B', cee: 'C', see: 'C', dee: 'D', de: 'D',
  ee: 'E', ef: 'F', gee: 'G', jee: 'G', aitch: 'H', eye: 'I', jay: 'J',
  kay: 'K', el: 'L', em: 'M', en: 'N', pee: 'P', cue: 'Q', are: 'R',
  ess: 'S', tee: 'T', you: 'U', vee: 'V', doubleyou: 'W', ex: 'X', why: 'Y', zee: 'Z', zed: 'Z',
};

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function levenshtein(left: string, right: string): number {
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1)
      );
    }
    for (let j = 0; j <= right.length; j += 1) previous[j] = current[j];
  }
  return previous[right.length];
}

export function fuzzyNameSimilarity(left: string, right: string): number {
  const clean = (value: string) => normalize(value)
    .split(' ')
    .filter((word) => word.length > 1 && !COMPANY_WORDS.has(word))
    .join('');
  const a = clean(left);
  const b = clean(right);
  if (!a || !b) return 0;
  return Math.max(0, 1 - levenshtein(a, b) / Math.max(a.length, b.length));
}

export function normalizeSpokenItemCodes(value: string): string {
  const words = value.split(/\s+/);
  const converted = words.map((word) => {
    const clean = word.toLowerCase().replace(/[^a-z0-9]/g, '');
    return SPOKEN_CODE_WORDS[clean] || word;
  });

  // Join long runs of individually spoken letters/numbers, but retain normal words.
  const result: string[] = [];
  let codeRun = '';
  const flush = () => {
    if (codeRun) result.push(codeRun);
    codeRun = '';
  };
  converted.forEach((word, index) => {
    const original = words[index].toLowerCase().replace(/[^a-z0-9]/g, '');
    if (SPOKEN_CODE_WORDS[original]) codeRun += word;
    else {
      flush();
      result.push(word);
    }
  });
  flush();
  return result.join(' ');
}
