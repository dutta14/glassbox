const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'all', 'am', 'an', 'and', 'any', 'are', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', 'cannot', 'could', 'did', 'do', 'does', 'doing', 'down', 'during',
  'each', 'few', 'for', 'from', 'further', 'had', 'has', 'have', 'having', 'he', 'her', 'here',
  'hers', 'herself', 'him', 'himself', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its',
  'itself', 'just', 'me', 'more', 'most', 'my', 'myself', 'no', 'nor', 'not', 'now',
  'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out',
  'over', 'own', 'same', 'she', 'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their',
  'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through',
  'to', 'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what', 'when', 'where',
  'which', 'while', 'who', 'whom', 'why', 'will', 'with', 'would', 'you', 'your', 'yours',
  'yourself', 'yourselves',
]);

/**
 * Light suffix stripping. Not a full Porter stemmer: it only collapses the
 * endings that actually cause misses in short personal notes, and it refuses
 * to touch short words where stripping produces noise ("was" -> "wa").
 */
export const stem = (word: string): string => dropSilentE(baseStem(word));

const baseStem = (word: string): string => {
  if (word.length <= 4) return word;
  for (const suffix of ['ational', 'iveness', 'fulness', 'ousness', 'ization', 'ations']) {
    if (word.endsWith(suffix)) return word.slice(0, -suffix.length);
  }
  if (word.endsWith('ies') && word.length > 5) return `${word.slice(0, -3)}y`;
  // "indexes" and "boxes" must land on the same stem as "indexing" and "box",
  // so -es is stripped whole after a sibilant instead of dropping only the -s.
  if (/(?:s|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('sses')) return word.slice(0, -2);
  if (word.endsWith('ing') && word.length > 5) return undouble(word.slice(0, -3));
  if (word.endsWith('ed') && word.length > 4) return undouble(word.slice(0, -2));
  if (word.endsWith('ly') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) return word.slice(0, -1);
  return word;
};

/**
 * Collapses the consonant doubled before a suffix, so "running" reaches "run"
 * rather than "runn". Keeps ll/ss/ff, where the double is part of the word
 * itself ("falling" -> "fall", not "fal").
 */
const undouble = (word: string): string => {
  const [a, b] = [word.at(-1), word.at(-2)];
  if (a && a === b && !'lsf'.includes(a)) return word.slice(0, -1);
  return word;
};

const VOWELS = 'aeiou';

/**
 * Collapses the silent -e so a base word lands on the same stem as its -ing/-ed forms.
 * Without this "tune" stays "tune" while "tuning" becomes "tun", and a note about
 * tuning never answers a question about how to tune. Same for write/writing,
 * store/storing, scale/scaling.
 *
 * The -e is kept when another vowel precedes it ("free" must not become "fre", which
 * would no longer match "frees") and when dropping it would leave fewer than three
 * characters.
 */
const dropSilentE = (word: string): string => {
  if (!word.endsWith('e')) return word;
  const prev = word.at(-2);
  if (!prev || VOWELS.includes(prev)) return word;
  return word.length > 3 ? word.slice(0, -1) : word;
};

export const isStopword = (word: string): boolean => STOPWORDS.has(word);

/** Splits raw text into normalised, stemmed, stopword-free terms. */
export const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);

/** Terms kept for display, before stemming, so the UI can highlight real words. */
export const displayTerms = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
