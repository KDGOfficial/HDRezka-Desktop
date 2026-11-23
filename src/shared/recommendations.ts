import { ContentType, MediaItem, TasteSignal, UserInterestsProfile, WatchHistoryEntry } from './types';
import { DEFAULT_USER_INTERESTS } from './constants';

const HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000; // 14-day half-life so shifting tastes overtake old habits
const EXPLICIT_GENRE_BASE = 2.6;
const EXPLICIT_TYPE_BASE = 2.0;
const MAX_STORED_WEIGHT = 40;
const MIN_SIGNAL_WEIGHT = 0.08;

export type InteractionKind = 'view' | 'watch' | 'favorite';

const INTERACTION_WEIGHTS: Record<InteractionKind, { genre: number; type: number }> = {
  view: { genre: 0.9, type: 0.5 },
  favorite: { genre: 2.6, type: 1.4 },
  watch: { genre: 3.4, type: 2.0 },
};

const GENRE_ALIASES: Array<{ id: string; patterns: RegExp[] }> = [
  { id: 'action', patterns: [/\baction\b/i, /боевик/i, /бойовик/i, /экшн/i] },
  { id: 'adventures', patterns: [/\badventures?\b/i, /приключен/i, /пригод/i] },
  { id: 'animation', patterns: [/\banimation\b/i, /\bcartoons?\b/i, /мультфильм/i, /мульт/i, /анимац/i, /анімац/i] },
  { id: 'biographical', patterns: [/\bbiograph/i, /биограф/i, /біограф/i] },
  { id: 'comedy', patterns: [/\bcomed/i, /комеди/i, /комеді/i] },
  { id: 'crime', patterns: [/\bcrime\b/i, /криминал/i, /кримінал/i] },
  { id: 'detective', patterns: [/\bdetective\b/i, /\bmystery\b/i, /детектив/i] },
  { id: 'documentary', patterns: [/\bdocumentary\b/i, /документал/i] },
  { id: 'drama', patterns: [/\bdrama\b/i, /(?:^|[^а-яёієї])драм/i] },
  { id: 'family', patterns: [/\bfamily\b/i, /семейн/i, /сімейн/i] },
  { id: 'fantasy', patterns: [/\bfantasy\b/i, /фэнтез/i, /фентез/i] },
  { id: 'fiction', patterns: [/\bfiction\b/i, /\bsci-?fi\b/i, /science\s+fiction/i, /фантастик/i] },
  { id: 'historical', patterns: [/\bhistor/i, /историч/i, /історич/i] },
  { id: 'horror', patterns: [/\bhorror\b/i, /ужас/i, /жах/i] },
  { id: 'melodrama', patterns: [/\bmelodrama\b/i, /\bromance\b/i, /мелодрам/i, /романтик/i] },
  { id: 'musical', patterns: [/\bmusical\b/i, /\bmusic\b/i, /мюзикл/i, /музыкал/i, /музичн/i] },
  { id: 'sport', patterns: [/\bsport/i, /спорт/i] },
  { id: 'thriller', patterns: [/\bthriller\b/i, /триллер/i, /трилер/i] },
  { id: 'war', patterns: [/\bwar\b/i, /военн/i, /військов/i] },
  { id: 'western', patterns: [/\bwestern\b/i, /вестерн/i] },
];

export const SELECTABLE_TYPES: ContentType[] = ['films', 'series', 'cartoons', 'animation'];

export function createEmptyInterestsProfile(): UserInterestsProfile {
  return {
    onboardingCompleted: DEFAULT_USER_INTERESTS.onboardingCompleted,
    favoriteGenres: [],
    favoriteTypes: [],
    genreScores: {},
    typeScores: {},
    updatedAt: 0,
  };
}

export function normalizeInterestsProfile(raw?: Partial<UserInterestsProfile> | null): UserInterestsProfile {
  if (!raw || typeof raw !== 'object') return createEmptyInterestsProfile();
  return {
    onboardingCompleted: Boolean(raw.onboardingCompleted),
    favoriteGenres: Array.isArray(raw.favoriteGenres)
      ? Array.from(new Set(raw.favoriteGenres.filter((g): g is string => typeof g === 'string' && g.length > 0)))
      : [],
    favoriteTypes: Array.isArray(raw.favoriteTypes)
      ? Array.from(new Set(raw.favoriteTypes.filter((t): t is ContentType => SELECTABLE_TYPES.includes(t) || t === 'shows')))
      : [],
    genreScores: raw.genreScores && typeof raw.genreScores === 'object' ? { ...raw.genreScores } : {},
    typeScores: raw.typeScores && typeof raw.typeScores === 'object' ? { ...raw.typeScores } : {},
    updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0,
  };
}

/** Maps a raw genre label (RU/UK/EN) or URL path segment to a canonical GENRES id. */
export function normalizeGenreToId(raw?: string): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;

  for (const entry of GENRE_ALIASES) {
    if (trimmed === entry.id) return entry.id;
  }
  for (const entry of GENRE_ALIASES) {
    if (entry.patterns.some((re) => re.test(trimmed))) {
      return entry.id;
    }
  }
  return null;
}

/** Extracts canonical genre IDs from a MediaItem or MediaDetails (genres array, URL slug, info line). */
export function extractItemGenreIds(item: {
  genres?: string[];
  url?: string;
  info?: string;
  type?: ContentType;
}): string[] {
  const found = new Set<string>();

  if (Array.isArray(item.genres)) {
    for (const g of item.genres) {
      const id = normalizeGenreToId(g);
      if (id) found.add(id);
    }
  }

  if (item.url) {
    const slugMatch = item.url.match(/\/(?:films|series|cartoons|animation|show)\/([a-z-]+)\//i);
    if (slugMatch?.[1]) {
      const id = normalizeGenreToId(slugMatch[1]);
      if (id) found.add(id);
    }
  }

  if (item.info) {
    const parts = item.info.split(/[,/|·•]+/);
    for (const part of parts) {
      const id = normalizeGenreToId(part);
      if (id) found.add(id);
    }
  }

  if (item.type === 'cartoons' && found.size === 0) {
    found.add('animation');
  }

  return Array.from(found);
}

/** Exponential time-decay multiplier in (0, 1]. */
export function computeDecayFactor(updatedAt: number, now: number): number {
  if (!updatedAt || now <= updatedAt) return 1;
  const elapsed = now - updatedAt;
  return Math.pow(0.5, elapsed / HALF_LIFE_MS);
}

function getEffectiveSignal(signal: TasteSignal | undefined, now: number): number {
  if (!signal || !Number.isFinite(signal.weight) || signal.weight <= 0) return 0;
  return signal.weight * computeDecayFactor(signal.updatedAt, now);
}

/**
 * Updates the adaptive taste profile after a user interaction (view / watch / favorite).
 * Existing signals decay over time so changing interests naturally overtake old preferences.
 */
export function recordTasteInteraction(
  profileInput: Partial<UserInterestsProfile> | undefined,
  item: { genres?: string[]; url?: string; info?: string; type?: ContentType },
  kind: InteractionKind,
  now = Date.now()
): UserInterestsProfile {
  const profile = normalizeInterestsProfile(profileInput);
  const delta = INTERACTION_WEIGHTS[kind];
  const genreIds = extractItemGenreIds(item);

  const nextGenreScores: Record<string, TasteSignal> = {};
  for (const [id, sig] of Object.entries(profile.genreScores)) {
    const decayed = getEffectiveSignal(sig, now);
    if (decayed >= MIN_SIGNAL_WEIGHT) {
      nextGenreScores[id] = { weight: Number(decayed.toFixed(3)), updatedAt: now };
    }
  }

  for (const gid of genreIds) {
    const prev = nextGenreScores[gid]?.weight || 0;
    nextGenreScores[gid] = {
      weight: Number(Math.min(MAX_STORED_WEIGHT, prev + delta.genre).toFixed(3)),
      updatedAt: now,
    };
  }

  const nextTypeScores: Partial<Record<ContentType, TasteSignal>> = {};
  for (const [typeKey, sig] of Object.entries(profile.typeScores) as Array<[ContentType, TasteSignal]>) {
    const decayed = getEffectiveSignal(sig, now);
    if (decayed >= MIN_SIGNAL_WEIGHT) {
      nextTypeScores[typeKey] = { weight: Number(decayed.toFixed(3)), updatedAt: now };
    }
  }

  if (item.type) {
    const prev = nextTypeScores[item.type]?.weight || 0;
    nextTypeScores[item.type] = {
      weight: Number(Math.min(MAX_STORED_WEIGHT, prev + delta.type).toFixed(3)),
      updatedAt: now,
    };
  }

  return {
    ...profile,
    genreScores: nextGenreScores,
    typeScores: nextTypeScores,
    updatedAt: now,
  };
}

/** Returns ranked genre IDs combining explicit favoriteGenres and time-decayed behavioral scores. */
export function getTopGenres(
  profileInput: Partial<UserInterestsProfile> | undefined,
  limit = 5,
  now = Date.now()
): Array<{ id: string; score: number; source: 'favorite' | 'learned' | 'both' }> {
  const profile = normalizeInterestsProfile(profileInput);
  const favSet = new Set(profile.favoriteGenres);
  const allIds = new Set<string>([...profile.favoriteGenres, ...Object.keys(profile.genreScores)]);

  const ranked = Array.from(allIds)
    .map((id) => {
      const learned = getEffectiveSignal(profile.genreScores[id], now);
      const isFav = favSet.has(id);
      const score = learned + (isFav ? EXPLICIT_GENRE_BASE : 0);
      const source: 'favorite' | 'learned' | 'both' =
        isFav && learned >= 0.8 ? 'both' : learned >= 0.8 ? 'learned' : 'favorite';
      return { id, score, source };
    })
    .filter((entry) => entry.score > 0.2)
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, limit);
}

/** Returns ranked content types combining explicit favoriteTypes and adaptive behavioral scores. */
export function getTopTypes(
  profileInput: Partial<UserInterestsProfile> | undefined,
  now = Date.now()
): Array<{ type: ContentType; score: number }> {
  const profile = normalizeInterestsProfile(profileInput);
  const favSet = new Set(profile.favoriteTypes);
  const allTypes = new Set<ContentType>([
    ...profile.favoriteTypes,
    ...(Object.keys(profile.typeScores) as ContentType[]),
  ]);

  return Array.from(allTypes)
    .map((type) => {
      const learned = getEffectiveSignal(profile.typeScores[type], now);
      const isFav = favSet.has(type);
      return { type, score: learned + (isFav ? EXPLICIT_TYPE_BASE : 0) };
    })
    .filter((entry) => entry.score > 0.2)
    .sort((a, b) => b.score - a.score);
}

export interface ScoredRecommendation {
  item: MediaItem;
  score: number;
  matchedGenres: string[];
  matchedType: boolean;
}

/** Scores a candidate MediaItem against the user's evolving taste profile and watch history. */
export function scoreMediaItem(
  item: MediaItem,
  profileInput: Partial<UserInterestsProfile> | undefined,
  watchedIds: Set<string>,
  now = Date.now()
): ScoredRecommendation {
  const profile = normalizeInterestsProfile(profileInput);
  const topGenres = getTopGenres(profile, 20, now);
  const genreScoreMap = new Map(topGenres.map((g) => [g.id, g.score]));
  const topTypes = getTopTypes(profile, now);
  const typeScoreMap = new Map(topTypes.map((t) => [t.type, t.score]));

  const itemGenres = extractItemGenreIds(item);
  const matchedGenres: string[] = [];
  let genreAffinity = 0;

  for (const gid of itemGenres) {
    const weight = genreScoreMap.get(gid);
    if (weight && weight > 0) {
      genreAffinity += Math.min(10, weight);
      matchedGenres.push(gid);
    }
  }

  const typeWeight = typeScoreMap.get(item.type) || 0;
  const matchedType = typeWeight > 0;
  const typeAffinity = Math.min(6, typeWeight * 0.85);

  const ratingBoost = typeof item.rating === 'number' && item.rating > 0 ? (item.rating - 5.5) * 0.85 : 0;
  const recencyBoost = item.year && item.year >= 2024 ? 1.1 : item.year && item.year >= 2021 ? 0.5 : 0;
  const alreadyWatched = watchedIds.has(item.id) || (item.url ? watchedIds.has(item.url) : false);
  const watchedPenalty = alreadyWatched ? -12 : 0;

  return {
    item,
    score: genreAffinity * 1.6 + typeAffinity + ratingBoost + recencyBoost + watchedPenalty,
    matchedGenres,
    matchedType,
  };
}

function dedupeItems(items: MediaItem[]): MediaItem[] {
  const seen = new Set<string>();
  const out: MediaItem[] = [];
  for (const item of items) {
    if (!item) continue;
    const key = (item.id || item.url || item.title || '').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function buildWatchedIdSet(watchHistory: WatchHistoryEntry[] = []): Set<string> {
  const set = new Set<string>();
  for (const h of watchHistory) {
    if (h.mediaId) set.add(h.mediaId);
    if (h.url) set.add(h.url);
  }
  return set;
}

/** Builds a deduplicated, personalized recommendation list ordered by evolving user taste. */
export function buildPersonalizedRecommendations(
  candidates: MediaItem[],
  profileInput: Partial<UserInterestsProfile> | undefined,
  watchHistory: WatchHistoryEntry[] = [],
  limit = 16,
  now = Date.now()
): ScoredRecommendation[] {
  const unique = dedupeItems(candidates).filter((item) => Boolean(item.poster));
  const watchedIds = buildWatchedIdSet(watchHistory);
  const hasProfile =
    getTopGenres(profileInput, 1, now).length > 0 || getTopTypes(profileInput, now).length > 0;

  if (!hasProfile) {
    return unique
      .map((item) => ({
        item,
        score: (item.rating || 6.5) + (watchedIds.has(item.id) ? -8 : 0),
        matchedGenres: [],
        matchedType: false,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  return unique
    .map((item) => scoreMediaItem(item, profileInput, watchedIds, now))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export interface DynamicHeroSlide {
  item: MediaItem;
  kind: 'new' | 'recommended' | 'premiere';
  matchedGenres?: string[];
}

/**
 * Builds a dynamic hero carousel deck alternating fresh new releases and personalized recommendations.
 */
export function buildDynamicHeroSlides(params: {
  hero: MediaItem | null;
  newReleases: MediaItem[];
  expected: MediaItem[];
  personalizedRecs: ScoredRecommendation[];
  popular: MediaItem[];
  maxSlides?: number;
}): DynamicHeroSlide[] {
  const maxSlides = params.maxSlides ?? 6;
  const freshPool = dedupeItems([...params.newReleases, ...params.expected]).filter((x) => Boolean(x.poster));
  const recPool = params.personalizedRecs.filter((r) => Boolean(r.item?.poster));
  const fallbackPool = dedupeItems([
    ...(params.hero ? [params.hero] : []),
    ...params.popular,
  ]).filter((x) => Boolean(x.poster));

  const slides: DynamicHeroSlide[] = [];
  const used = new Set<string>();

  const pushUnique = (slide: DynamicHeroSlide) => {
    const key = (slide.item.id || slide.item.title || '').toLowerCase();
    if (!key || used.has(key) || slides.length >= maxSlides) return;
    used.add(key);
    slides.push(slide);
  };

  let freshIdx = 0;
  let recIdx = 0;
  // Interleave fresh new releases and personalized recommendations so the hero always feels alive
  while (slides.length < maxSlides && (freshIdx < freshPool.length || recIdx < recPool.length)) {
    if (freshIdx < freshPool.length) {
      pushUnique({ item: freshPool[freshIdx++], kind: 'new' });
    }
    if (recIdx < recPool.length && slides.length < maxSlides) {
      const rec = recPool[recIdx++];
      pushUnique({
        item: rec.item,
        kind: 'recommended',
        matchedGenres: rec.matchedGenres,
      });
    }
  }

  for (const fallback of fallbackPool) {
    if (slides.length >= maxSlides) break;
    pushUnique({ item: fallback, kind: 'premiere' });
  }

  return slides;
}

/** Picks the best unseen recommendation for "What to Watch" given category, optional genre override, and exclusions. */
export function pickWhatToWatchCandidate(params: {
  candidates: MediaItem[];
  category: ContentType;
  genreOverride?: string;
  profile?: Partial<UserInterestsProfile>;
  watchHistory?: WatchHistoryEntry[];
  excludedIds?: Set<string>;
  now?: number;
}): ScoredRecommendation | null {
  const now = params.now ?? Date.now();
  const excluded = params.excludedIds ?? new Set<string>();
  const watchedIds = buildWatchedIdSet(params.watchHistory || []);

  const categoryMatches = dedupeItems(params.candidates).filter((item) => {
    if (!item.poster) return false;
    const key = (item.id || item.url || '').trim();
    if (excluded.has(key) || (item.url && excluded.has(item.url))) return false;
    if (params.category === 'cartoons') {
      return item.type === 'cartoons' || item.type === 'animation';
    }
    return item.type === params.category;
  });

  const pool = categoryMatches.length > 0
    ? categoryMatches
    : dedupeItems(params.candidates).filter((item) => {
        const key = (item.id || item.url || '').trim();
        return Boolean(item.poster) && !excluded.has(key) && (!item.url || !excluded.has(item.url));
      });

  if (pool.length === 0) return null;

  const scored = pool.map((item) => {
    const base = scoreMediaItem(item, params.profile, watchedIds, now);
    let bonus = 0;
    const matchedGenres = [...base.matchedGenres];
    if (params.genreOverride) {
      const itemGenres = extractItemGenreIds(item);
      if (itemGenres.includes(params.genreOverride)) {
        bonus += 12;
        if (!matchedGenres.includes(params.genreOverride)) {
          matchedGenres.unshift(params.genreOverride);
        }
      }
    }
    return {
      ...base,
      score: base.score + bonus,
      matchedGenres,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0] || null;
}
