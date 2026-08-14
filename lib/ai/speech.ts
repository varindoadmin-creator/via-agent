export interface BrowserVoice {
  name: string;
  lang: string;
  default?: boolean;
}

const FEMALE_NAME_HINTS = [
  'damayanti', 'female', 'samantha', 'karen', 'susan', 'zira', 'victoria',
  'moira', 'fiona', 'tessa', 'veena', 'google bahasa indonesia',
];

export function choosePreferredVoice<T extends BrowserVoice>(voices: T[]): T | null {
  if (!voices.length) return null;

  const score = (voice: T): number => {
    const name = voice.name.toLowerCase();
    const lang = voice.lang.toLowerCase();
    let value = 0;
    if (lang === 'id-id') value += 100;
    else if (lang.startsWith('id')) value += 80;
    else if (lang.startsWith('en')) value += 20;
    if (FEMALE_NAME_HINTS.some((hint) => name.includes(hint))) value += 40;
    if (voice.default) value += 2;
    return value;
  };

  return [...voices].sort((a, b) => score(b) - score(a))[0] || null;
}

export function textForSpeech(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/[*_~>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
