export function formatDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function formatDate(timestamp: number): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return '';
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Только что';
  if (minutes < 60) return `${minutes} мин. назад`;
  if (hours < 24) return `${hours} ч. назад`;
  if (days === 1) return 'Вчера';
  if (days < 30) return `${days} дн. назад`;
  return formatDate(timestamp);
}

export function getRatingColor(rating?: number): string {
  if (!rating || rating <= 0) return 'text-zinc-300 bg-black/75 border border-white/15';
  if (rating >= 8.0) return 'text-[#FFB830] bg-[#160D09]/85 border border-[#FFB830]/40';
  if (rating >= 6.5) return 'text-emerald-300 bg-[#0B1712]/85 border border-emerald-400/35';
  if (rating >= 5.0) return 'text-amber-300 bg-[#1A130A]/85 border border-amber-400/35';
  return 'text-rose-300 bg-[#1B0C12]/85 border border-rose-400/35';
}

export function debounce<T extends (...args: any[]) => void>(fn: T, delay: number): (...args: Parameters<T>) => void {
  let timer: any = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function sanitizeTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim();
}

const EN_TO_RU_MAP: Record<string, string> = {
  q: 'й', w: 'ц', e: 'у', r: 'к', t: 'е', y: 'н', u: 'г', i: 'ш', o: 'щ', p: 'з', '[': 'х', ']': 'ъ',
  a: 'ф', s: 'ы', d: 'в', f: 'а', g: 'п', h: 'р', j: 'о', k: 'л', l: 'д', ';': 'ж', "'": 'э',
  z: 'я', x: 'ч', c: 'с', v: 'м', b: 'и', n: 'т', m: 'ь', ',': 'б', '.': 'ю', '`': 'ё',
};

const RU_TO_EN_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(EN_TO_RU_MAP).map(([en, ru]) => [ru, en])
);

const T9_DICTIONARY = [
  'наруто', 'атака титанов', 'ван пис', 'магическая битва', 'клинок рассекающий демонов',
  'тетрадь смерти', 'берсерк', 'блич', 'человек бензопила', 'стальной алхимик', 'токийский гуль',
  'человек-паук', 'дюна', 'интерстеллар', 'начало', 'матрица', 'властелин колец', 'гарри поттер',
  'мстители', 'бэтмен', 'джокер', 'аватар', 'терминатор', 'гладиатор', 'оппенгеймер', 'дедпул',
  'во все тяжкие', 'игра престолов', 'очень странные дела', 'аркейн', 'одни из нас', 'пацаны',
  'ведьмак', 'шерлок', 'побег из шоушенка', 'зеленая миля', 'форрест гамп', 'бойцовский клуб',
  'криминальное чтиво', 'пираты карибского моря', 'звездные войны', 'шрек', 'королевство',
  'соло левелинг', 'поднятие уровня в одиночку', 'провожающая в последний путь фрирен',
];

/** Converts accidentally typed wrong keyboard layout (EN<->RU QWERTY). */
export function fixKeyboardLayout(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  const hasCyr = /[а-яё]/i.test(trimmed);
  const hasLat = /[a-z]/i.test(trimmed);
  if (hasLat && !hasCyr) {
    return trimmed
      .split('')
      .map((ch) => {
        const lower = ch.toLowerCase();
        const mapped = EN_TO_RU_MAP[lower];
        if (!mapped) return ch;
        return ch === lower ? mapped : mapped.toUpperCase();
      })
      .join('');
  }
  if (hasCyr && !hasLat) {
    return trimmed
      .split('')
      .map((ch) => {
        const lower = ch.toLowerCase();
        const mapped = RU_TO_EN_MAP[lower];
        if (!mapped) return ch;
        return ch === lower ? mapped : mapped.toUpperCase();
      })
      .join('');
  }
  return trimmed;
}

function damerauLevenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let val = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        val = Math.min(val, dp[i - 2][j - 2] + 1);
      }
      dp[i][j] = val;
    }
  }
  return dp[m][n];
}

function looksPlausibleRussian(text: string): boolean {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  for (const w of words) {
    // Russian words never start with ь/ъ/ы or contain impossible layout-artifact sequences
    if (/^[ьъы]/.test(w)) return false;
    if (/[ьъ]{2}|[эы]{2}|[бвгджзйклмнпрстфхцчшщ]{5,}/.test(w)) return false;
    if (w.length >= 3 && !/[аеёиоуыэюя]/.test(w)) return false;
  }
  return /[аеёиоуыэюя]/.test(text);
}

const COMMON_ENGLISH_WORDS = /^(?:the|and|man|war|day|new|one|two|red|bad|big|boy|dog|cat|god|top|hot|old|end|all|star|dark|iron|dune|lost|last|love|dead|game|ring|king|lord|hero|soul|time|life|john|wick|joker|blade|alien|shrek|naruto|bleach|piece|arcane|avatar|matrix|batman|spider|venom|marvel|anime|movie|series|dragon|demon|slayer|attack|titan|death|note|ghoul|hunter|berserk|frieren|solo|mr|mrs|ms|dr|st|vs)$/i;

/** Returns a T9 layout-fix or typo/prefix suggestion when input looks mistyped. */
export function getT9Correction(
  query: string,
  extraCorpus: string[] = []
): { suggestion: string; reason: 'layout' | 'typo' | 'autocomplete' } | null {
  const raw = query.trim();
  if (raw.length < 2) return null;
  const low = raw.toLowerCase();
  const normLow = low.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');

  const corpus = Array.from(
    new Set([
      ...extraCorpus.map((s) => s.trim().toLowerCase()).filter((s) => s.length >= 2),
      ...T9_DICTIONARY,
    ])
  );

  // 1. Wrong keyboard layout detection (e.g. "yfhenj" -> "наруто", "l.yf" -> "дюна")
  const hasLat = /[a-z]/i.test(raw);
  const hasCyr = /[а-яё]/i.test(raw);
  if (hasLat && !hasCyr) {
    const converted = fixKeyboardLayout(raw);
    const convLow = converted.toLowerCase();
    const convNorm = convLow.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
    // Detect Russian-layout punctuation inside words (e.g. "l.yf" -> "дюна", ";bpym" -> "жизнь"),
    // while ignoring valid English punctuation like "Mr. Robot", "Dr. House", "Schindler's List".
    const hasLayoutPunct =
      /[[\];`][a-z]|[a-z][[\];`]/i.test(raw) ||
      /[a-z][.,][a-z]/i.test(raw) ||
      (/[a-z]'[a-z]/i.test(raw) && !/'(?:s|t|m|d|re|ve|ll)\b/i.test(raw));
    const matchesCorpus = corpus.some((w) => {
      const wn = w.replace(/[-_]+/g, ' ');
      return wn === convNorm || wn.startsWith(convNorm);
    });
    const looksGibberishEn =
      hasLayoutPunct ||
      (!/[aeiouy]/i.test(raw) && raw.length >= 3) ||
      /[bcdfghjklmnpqrstvwxz]{4,}/i.test(raw) ||
      matchesCorpus;

    const firstToken = low.split(/[\s.'-]+/)[0];
    if (
      looksGibberishEn &&
      convLow !== low &&
      !COMMON_ENGLISH_WORDS.test(firstToken) &&
      (matchesCorpus || looksPlausibleRussian(convLow))
    ) {
      const exactPrefix = corpus.find((w) => {
        const wn = w.replace(/[-_]+/g, ' ');
        return wn.startsWith(convNorm) && wn.length > convNorm.length;
      });
      return {
        suggestion: exactPrefix && convNorm.length >= 4 ? exactPrefix : converted,
        reason: 'layout',
      };
    }
  }

  // 2. Direct fuzzy typo match against corpus (Damerau-Levenshtein <= 2)
  if (normLow.length >= 4) {
    let bestWord = '';
    let bestDist = 3;
    for (const word of corpus) {
      const wn = word.replace(/[-_]+/g, ' ');
      if (wn === normLow) return null;
      if (Math.abs(wn.length - normLow.length) > 2) continue;
      const d = damerauLevenshtein(normLow, wn);
      const maxAllowed = normLow.length <= 5 ? 1 : 2;
      if (d > 0 && d <= maxAllowed && d < bestDist) {
        bestDist = d;
        bestWord = word;
      }
    }
    if (bestWord) {
      return { suggestion: bestWord, reason: 'typo' };
    }
  }

  // 3. Prefix autocomplete if user typed >= 3 chars matching a known title
  if (normLow.length >= 3) {
    const prefix = corpus.find((w) => {
      const wn = w.replace(/[-_]+/g, ' ');
      return wn.startsWith(normLow) && wn.length > normLow.length + 1;
    });
    if (prefix) {
      return { suggestion: prefix, reason: 'autocomplete' };
    }
  }

  return null;
}

export function formatCompactNumber(num?: number): string {
  if (!num || num <= 0 || Number.isNaN(num)) return '';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(num >= 100_000 ? 0 : 1).replace(/\.0$/, '')}K`;
  return String(Math.round(num));
}

export type SearchSortBy = 'relevance' | 'year' | 'rating' | 'views';
export type SortDirection = 'desc' | 'asc';

/** Sorts search results stably by year, rating, or views (missing values always last). */
export function sortMediaItems<T extends { year?: number; rating?: number; views?: number }>(
  items: T[],
  sortBy: SearchSortBy,
  direction: SortDirection = 'desc'
): T[] {
  if (sortBy === 'relevance' || items.length <= 1) return items;
  const mult = direction === 'asc' ? 1 : -1;
  return items
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => {
      const av =
        sortBy === 'year'
          ? a.item.year
          : sortBy === 'rating'
            ? a.item.rating
            : a.item.views;
      const bv =
        sortBy === 'year'
          ? b.item.year
          : sortBy === 'rating'
            ? b.item.rating
            : b.item.views;
      const aHas = typeof av === 'number' && !Number.isNaN(av) && av > 0;
      const bHas = typeof bv === 'number' && !Number.isNaN(bv) && bv > 0;
      if (aHas && !bHas) return -1;
      if (!aHas && bHas) return 1;
      if (!aHas && !bHas) return a.idx - b.idx;
      if (av === bv) return a.idx - b.idx;
      return (av! - bv!) * mult;
    })
    .map((x) => x.item);
}

/** Returns resumable playback timestamp in seconds for unfinished items, or 0 if finished/unstarted. */
export function getResumableTime(currentTime?: number, duration?: number): number {
  if (typeof currentTime !== 'number' || typeof duration !== 'number') return 0;
  if (!Number.isFinite(currentTime) || !Number.isFinite(duration)) return 0;
  if (duration <= 0 || currentTime < 5) return 0;
  const endThreshold = Math.min(30, duration * 0.08);
  if (currentTime >= duration - endThreshold) return 0;
  return currentTime;
}

/** Computes default centered window bounds adapted to display work area. */
export function getDefaultWindowBounds(workArea: {
  x?: number;
  y?: number;
  width: number;
  height: number;
}): { x: number; y: number; width: number; height: number } {
  const waX = workArea.x || 0;
  const waY = workArea.y || 0;
  const width = Math.min(
    workArea.width,
    Math.max(Math.min(1024, workArea.width), Math.min(1680, Math.round(workArea.width * 0.84)))
  );
  const height = Math.min(
    workArea.height,
    Math.max(Math.min(680, workArea.height), Math.min(1050, Math.round(workArea.height * 0.86)))
  );
  return {
    x: waX + Math.round((workArea.width - width) / 2),
    y: waY + Math.round((workArea.height - height) / 2),
    width,
    height,
  };
}

const MODIFIER_ONLY_CODES = new Set([
  'ControlLeft',
  'ControlRight',
  'ShiftLeft',
  'ShiftRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
]);

const CODE_DISPLAY_LABELS: Record<string, string> = {
  Space: 'Space',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Enter: 'Enter',
  NumpadEnter: 'NumEnter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Del',
  Home: 'Home',
  End: 'End',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Comma: ',',
  Period: '.',
  Slash: '/',
  NumpadAdd: 'Num+',
  NumpadSubtract: 'Num-',
  NumpadMultiply: 'Num*',
  NumpadDivide: 'Num/',
};

export interface ShortcutEventLike {
  code?: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
}

/** Converts a keyboard event into a layout-independent canonical shortcut string (e.g. "Ctrl+KeyK", "Space"). */
export function buildShortcutFromEvent(input: ShortcutEventLike): string | null {
  const code = (input.code || '').trim();
  if (!code || code === 'Escape' || input.metaKey || MODIFIER_ONLY_CODES.has(code)) return null;
  const parts: string[] = [];
  if (input.ctrlKey) parts.push('Ctrl');
  if (input.altKey) parts.push('Alt');
  if (input.shiftKey) parts.push('Shift');
  parts.push(code);
  return parts.join('+');
}

export function parseShortcut(binding?: string): { ctrl: boolean; alt: boolean; shift: boolean; code: string } | null {
  if (!binding || typeof binding !== 'string') return null;
  const tokens = binding
    .split('+')
    .map((s) => s.trim())
    .filter(Boolean);
  if (tokens.length === 0) return null;
  let ctrl = false;
  let alt = false;
  let shift = false;
  let code = '';
  for (const tok of tokens) {
    const low = tok.toLowerCase();
    if (low === 'ctrl' || low === 'control') ctrl = true;
    else if (low === 'alt') alt = true;
    else if (low === 'shift') shift = true;
    else code = tok;
  }
  if (!code) return null;
  return { ctrl, alt, shift, code };
}

/** Matches a keyboard event against a canonical shortcut string. */
export function matchesShortcut(input: ShortcutEventLike, binding?: string): boolean {
  const parsed = parseShortcut(binding);
  if (!parsed || !input.code) return false;
  return (
    input.code === parsed.code &&
    Boolean(input.ctrlKey) === parsed.ctrl &&
    Boolean(input.altKey) === parsed.alt &&
    Boolean(input.shiftKey) === parsed.shift &&
    !input.metaKey
  );
}

/** Formats a canonical shortcut string for human-readable display (e.g. "Ctrl+KeyK" -> "Ctrl + K"). */
export function formatShortcutLabel(binding?: string): string {
  const parsed = parseShortcut(binding);
  if (!parsed) return '—';
  const parts: string[] = [];
  if (parsed.ctrl) parts.push('Ctrl');
  if (parsed.alt) parts.push('Alt');
  if (parsed.shift) parts.push('Shift');

  let keyLabel = CODE_DISPLAY_LABELS[parsed.code];
  if (!keyLabel) {
    if (parsed.code.startsWith('Key') && parsed.code.length === 4) {
      keyLabel = parsed.code.slice(3);
    } else if (parsed.code.startsWith('Digit') && parsed.code.length === 6) {
      keyLabel = parsed.code.slice(5);
    } else if (parsed.code.startsWith('Numpad') && parsed.code.length > 6) {
      keyLabel = `Num${parsed.code.slice(6)}`;
    } else {
      keyLabel = parsed.code;
    }
  }
  parts.push(keyLabel);
  return parts.join(' + ');
}

/** Normalizes explicit Russian or MPAA age rating text into canonical "0+" / "6+" / "12+" / "16+" / "18+". */
export function normalizeAgeRating(raw?: string): string {
  if (!raw || typeof raw !== 'string') return '';
  const cleaned = raw.trim();
  if (!cleaned) return '';
  const plusMatch = cleaned.match(/\b(0|6|12|14|16|18|21)\s*\+/);
  if (plusMatch) {
    const n = parseInt(plusMatch[1], 10);
    if (n >= 18) return '18+';
    if (n >= 16) return '16+';
    if (n >= 12) return '12+';
    if (n >= 6) return '6+';
    return '0+';
  }
  const upper = cleaned.toUpperCase();
  if (/\b(?:NC-17|TV-MA|X|XXX|ADULT|R)\b/.test(upper)) return '18+';
  if (/\b(?:TV-14|M|15)\b/.test(upper)) return '16+';
  if (/\b(?:PG-13|TV-PG)\b/.test(upper)) return '12+';
  if (/\b(?:PG|TV-Y7)\b/.test(upper)) return '6+';
  if (/\b(?:G|TV-G|TV-Y)\b/.test(upper)) return '0+';
  return '';
}

/** Returns explicit age rating when available, or infers a sensible rating from type/genres/title so every item shows one. */
export function inferAgeRating(item?: {
  ageRating?: string;
  genres?: string[];
  type?: string;
  title?: string;
  info?: string;
}): string {
  if (!item) return '16+';
  const explicit = normalizeAgeRating(item.ageRating);
  if (explicit) return explicit;
  const fromInfo = normalizeAgeRating(item.info);
  if (fromInfo) return fromInfo;

  if (item.type === 'adult' || item.type === 'erotica') return '18+';

  const haystack = [
    ...(item.genres || []),
    item.title || '',
    item.info || '',
  ]
    .join(' ')
    .toLowerCase();

  if (/(?:эрот|erot|18\+|хентай|hentai|adult|для взрослых|ужас|horror|слэшер|slasher|триллер.*18)/i.test(haystack)) {
    return '18+';
  }
  if (/(?:триллер|thriller|криминал|crime|боевик|action|военн|war|детектив|detective|драм|drama|нуар|noir)/i.test(haystack)) {
    return '16+';
  }
  if (/(?:мульт|cartoon|семейн|family|детск|kids|сказк)/i.test(haystack) || item.type === 'cartoons') {
    return '6+';
  }
  if (/(?:фантастик|sci-fi|фэнтези|fantasy|приключен|adventure|комед|comedy|мелодрам|romance|аниме|anime|мюзикл|musical|спорт|sport)/i.test(haystack) || item.type === 'animation') {
    return '12+';
  }
  return '16+';
}

export function getAgeRatingBadgeClass(ageRating?: string): string {
  const norm = normalizeAgeRating(ageRating) || ageRating || '16+';
  if (norm === '18+') {
    return 'text-rose-100 bg-rose-600/90 border border-rose-300/45 shadow-[0_2px_10px_rgba(225,29,72,0.5)]';
  }
  if (norm === '16+') {
    return 'text-amber-200 bg-[#1B110B]/85 border border-amber-400/40';
  }
  if (norm === '12+') {
    return 'text-sky-200 bg-[#0B1520]/85 border border-sky-400/35';
  }
  return 'text-emerald-200 bg-[#0A1812]/85 border border-emerald-400/35';
}

export function hasLatinLetters(text?: string): boolean {
  return Boolean(text && /[A-Za-z]{2,}/.test(text));
}

/** Returns an immediate localized title if no network translation is needed, or null if async translation is required. */
export function resolveImmediateLocalizedTitle(
  title: string,
  origTitle: string | undefined,
  language: 'ru' | 'uk' | 'en'
): string | null {
  const cleanTitle = (title || '').trim();
  const cleanOrig = (origTitle || '').trim();
  if (!cleanTitle) return cleanOrig || '';
  if (language === 'ru') return cleanTitle;
  if (language === 'en') {
    if (cleanOrig && hasLatinLetters(cleanOrig) && !/[а-яёіїєґ]/i.test(cleanOrig)) {
      return cleanOrig;
    }
    if (hasLatinLetters(cleanTitle) && !/[а-яёіїєґ]/i.test(cleanTitle)) {
      return cleanTitle;
    }
    return null;
  }
  // For Ukrainian: if title already contains Ukrainian-specific letters, keep it immediately
  if (/[іїєґ]/i.test(cleanTitle)) return cleanTitle;
  return null;
}

/** Converts SRT or raw subtitle text into valid WebVTT format. */
export function srtToVtt(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  const cleaned = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (!cleaned) return '';
  if (/^WEBVTT\b/i.test(cleaned)) return cleaned;
  // Replace SRT comma milliseconds (00:01:23,456) with VTT dot milliseconds (00:01:23.456)
  const body = cleaned.replace(
    /(\d{1,2}:\d{2}:\d{2}),(\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}),(\d{3})/g,
    '$1.$2 --> $3.$4'
  );
  return `WEBVTT\n\n${body}`;
}

export function matchSubtitleLanguageCode(label?: string): 'ru' | 'uk' | 'en' | null {
  const low = (label || '').toLowerCase();
  if (/\b(?:uk|ukr|ua)\b|укра|ukrain/i.test(low)) return 'uk';
  if (/\b(?:ru|rus)\b|русс|russian/i.test(low)) return 'ru';
  if (/\b(?:en|eng)\b|англ|english/i.test(low)) return 'en';
  return null;
}
