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

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[n];
}

const COMMON_ENGLISH_WORDS = /^(?:the|and|man|war|day|new|one|two|red|bad|big|boy|dog|cat|god|top|hot|old|end|all|star|dark|iron|dune|lost|last|love|dead|game|ring|king|lord|hero|soul|time|life|john|wick|joker|blade|alien|shrek|naruto|bleach|one|piece|arcane|avatar|matrix|batman|spider|venom|marvel|anime|movie|series|dragon|demon|slayer|attack|titan|death|note|ghoul|hunter|berserk|frieren|solo)$/i;

/** Returns a T9 layout-fix or typo/prefix suggestion when input looks mistyped. */
export function getT9Correction(
  query: string,
  extraCorpus: string[] = []
): { suggestion: string; reason: 'layout' | 'typo' | 'autocomplete' } | null {
  const raw = query.trim();
  if (raw.length < 2) return null;
  const low = raw.toLowerCase();

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
    const looksGibberishEn =
      /[.,;'[\]`]/.test(raw) ||
      (!/[aeiouy]/i.test(raw) && raw.length >= 3) ||
      /[bcdfghjklmnpqrstvwxz]{4,}/i.test(raw) ||
      corpus.some((w) => w === convLow || w.startsWith(convLow));

    const firstToken = low.split(/\s+/)[0];
    if (looksGibberishEn && convLow !== low && !COMMON_ENGLISH_WORDS.test(firstToken)) {
      const exactPrefix = corpus.find((w) => w.startsWith(convLow) && w.length > convLow.length);
      return {
        suggestion: exactPrefix && convLow.length >= 4 ? exactPrefix : converted,
        reason: 'layout',
      };
    }
  }

  // 2. Direct fuzzy typo match against corpus (Levenshtein <= 2)
  if (low.length >= 4) {
    let bestWord = '';
    let bestDist = 3;
    for (const word of corpus) {
      if (word === low) return null;
      if (Math.abs(word.length - low.length) > 2) continue;
      const d = levenshtein(low, word);
      const maxAllowed = low.length <= 5 ? 1 : 2;
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
  if (low.length >= 3) {
    const prefix = corpus.find((w) => w.startsWith(low) && w.length > low.length + 1);
    if (prefix) {
      return { suggestion: prefix, reason: 'autocomplete' };
    }
  }

  return null;
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
