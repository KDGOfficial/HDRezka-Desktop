import { ContentType, FavoriteItem, MediaItem, TasteSignal, UserInterestsProfile, WatchHistoryEntry } from './types';
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
  { id: 'action', patterns: [/\baction\b/i, /боевик/i, /бойовик/i, /экш[еэ]?н/i] },
  { id: 'adventures', patterns: [/\badventures?\b/i, /приключен/i, /пригод/i] },
  { id: 'animation', patterns: [/\banimation\b/i, /\bcartoons?\b/i, /мультфильм/i, /мульт/i, /анимац/i, /анімац/i] },
  { id: 'biographical', patterns: [/\bbiograph/i, /биограф/i, /біограф/i] },
  { id: 'comedy', patterns: [/\bcomed/i, /комеди/i, /комеді/i] },
  { id: 'crime', patterns: [/\bcrime\b/i, /криминал/i, /кримінал/i] },
  { id: 'detective', patterns: [/\bdetective\b/i, /\bmystery\b/i, /детектив/i] },
  { id: 'documentary', patterns: [/\bdocumentar/i, /\bdocumental\b/i, /документал/i] },
  { id: 'drama', patterns: [/\bdrama\b/i, /(?:^|[^а-яёієї])драм/i] },
  { id: 'erotica', patterns: [/\berotic/i, /\becchi\b/i, /\badult\b/i, /(?:^|\s)18\+(?:$|\s)/i, /эротик/i, /еротик/i, /этти/i, /етті/i] },
  { id: 'family', patterns: [/\bfamily\b/i, /семейн/i, /сімейн/i] },
  { id: 'fantasy', patterns: [/\bfantasy\b/i, /фэнтез/i, /фентез/i] },
  { id: 'fiction', patterns: [/\bfiction\b/i, /\bsci-?fi\b/i, /science\s+fiction/i, /фантастик/i] },
  { id: 'historical', patterns: [/\bhistor/i, /историч/i, /історич/i] },
  { id: 'horror', patterns: [/\bhorror\b/i, /ужас/i, /жах/i] },
  { id: 'melodrama', patterns: [/\bmelodrama\b/i, /\bromance\b/i, /мелодрам/i, /романтик/i] },
  { id: 'musical', patterns: [/\bmusical\b/i, /\bmusic\b/i, /мюзикл/i, /музык/i, /музик/i, /музичн/i] },
  { id: 'sport', patterns: [/\bsport/i, /спорт/i] },
  { id: 'thriller', patterns: [/\bthriller\b/i, /триллер/i, /трилер/i] },
  { id: 'war', patterns: [/\bwar\b/i, /\bmilitary\b/i, /военн/i, /військов/i] },
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
      ? Array.from(
          new Set(
            raw.favoriteGenres
              .filter((g): g is string => typeof g === 'string' && g.length > 0)
              .map((g) => normalizeGenreToId(g) || g)
          )
        )
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
  const byKey = new Map<string, MediaItem>();
  for (const item of items) {
    if (!item) continue;
    const key = (item.id || item.url || item.title || '').trim().toLowerCase();
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item.genres ? { ...item, genres: [...item.genres] } : item);
      continue;
    }
    // Merge genres & missing metadata across batches (e.g. item appearing in both horror & comedy catalogs)
    const mergedGenres = new Set<string>([...(existing.genres || []), ...(item.genres || [])]);
    byKey.set(key, {
      ...existing,
      genres: mergedGenres.size > 0 ? Array.from(mergedGenres) : existing.genres,
      rating: existing.rating || item.rating,
      year: existing.year || item.year,
      info: existing.info || item.info,
      country: existing.country || item.country,
    });
  }
  return Array.from(byKey.values());
}

/** Merges multiple catalog candidate batches while preserving & combining genre tags on duplicates. */
export function mergeCandidateBatches(batches: MediaItem[][]): MediaItem[] {
  const flat: MediaItem[] = [];
  for (const batch of batches) {
    if (!Array.isArray(batch)) continue;
    for (const item of batch) {
      if (item?.poster) flat.push(item);
    }
  }
  return dedupeItems(flat);
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

export type MoodId = 'auto' | 'adrenaline' | 'relax' | 'mindbend' | 'dark' | 'fresh';

export const MOOD_PRESETS: Record<MoodId, { genres: string[]; preferFresh?: boolean; minRatingBias?: number }> = {
  auto: { genres: [] },
  adrenaline: { genres: ['action', 'adventures', 'thriller', 'crime', 'war'] },
  relax: { genres: ['comedy', 'family', 'melodrama', 'adventures', 'animation'] },
  mindbend: { genres: ['fiction', 'detective', 'thriller', 'drama', 'fantasy'], minRatingBias: 7.2 },
  dark: { genres: ['horror', 'thriller', 'crime', 'detective'] },
  fresh: { genres: [], preferFresh: true },
};

export interface EnrichedTitleSignal {
  id: string;
  title: string;
  genres?: string[];
  year?: number;
  rating?: number;
  type?: ContentType;
  similar?: MediaItem[];
}

export interface TasteAnchor {
  id: string;
  title: string;
  poster: string;
  type: ContentType;
  url?: string;
  percent?: number;
  source: 'history' | 'favorite';
}

export interface AnalyzedGenre {
  id: string;
  score: number;
  sharePercent: number;
  source: 'history' | 'favorite' | 'profile' | 'both';
}

export interface AnalyzedType {
  type: ContentType;
  score: number;
  sharePercent: number;
}

export interface SimilarCandidate {
  item: MediaItem;
  similarToTitle: string;
  weight: number;
}

export interface UserTasteAnalysis {
  topGenres: AnalyzedGenre[];
  topTypes: AnalyzedType[];
  dominantType: ContentType;
  recentAnchors: TasteAnchor[];
  similarCandidates: SimilarCandidate[];
  watchedCount: number;
  favoritesCount: number;
  hasHistorySignal: boolean;
}

export type InteractiveFeedbackAction = 'more_like_this' | 'not_for_me' | 'already_seen';

export interface InteractiveSessionState {
  genreDeltas: Record<string, number>;
  typeDeltas: Partial<Record<ContentType, number>>;
  dismissedIds: string[];
}

export interface InteractiveRecommendation {
  item: MediaItem;
  score: number;
  matchPercent: number;
  matchedGenres: string[];
  matchedSelectedGenres: string[];
  matchedType: boolean;
  matchedMood?: MoodId;
  similarToTitle?: string;
  highRated: boolean;
}

export function createEmptyInteractiveSession(persistedDismissed: string[] = []): InteractiveSessionState {
  return {
    genreDeltas: {},
    typeDeltas: {},
    dismissedIds: Array.from(new Set(persistedDismissed.filter(Boolean))),
  };
}

/**
 * Analyzes what the user actually watches (watch history with completion & recency weighting,
 * favorites, explicit profile, and optional enriched details/similar lists) to build a live taste profile.
 */
export function analyzeUserTaste(params: {
  watchHistory?: WatchHistoryEntry[];
  favorites?: FavoriteItem[];
  profile?: Partial<UserInterestsProfile>;
  enrichedDetailsMap?: Record<string, EnrichedTitleSignal>;
  now?: number;
}): UserTasteAnalysis {
  const now = params.now ?? Date.now();
  const watchHistory = params.watchHistory || [];
  const favorites = params.favorites || [];
  const profile = normalizeInterestsProfile(params.profile);
  const enrichedMap = params.enrichedDetailsMap || {};

  const genreWeights = new Map<string, { history: number; favorite: number; profile: number }>();
  const typeWeights = new Map<ContentType, number>();

  const addGenre = (id: string, bucket: 'history' | 'favorite' | 'profile', amount: number) => {
    if (!id || amount <= 0) return;
    const prev = genreWeights.get(id) || { history: 0, favorite: 0, profile: 0 };
    prev[bucket] += amount;
    genreWeights.set(id, prev);
  };

  const addType = (type: ContentType | undefined, amount: number) => {
    if (!type || !SELECTABLE_TYPES.includes(type) || amount <= 0) return;
    typeWeights.set(type, (typeWeights.get(type) || 0) + amount);
  };

  // 1. Existing adaptive profile & explicit favorites
  for (const g of getTopGenres(profile, 20, now)) {
    addGenre(g.id, 'profile', g.score * 0.9);
  }
  for (const t of getTopTypes(profile, now)) {
    addType(t.type, t.score * 0.85);
  }

  // 2. Watch history weighted by recency decay + watch completion percentage
  const sortedHistory = [...watchHistory].sort((a, b) => (b.lastWatchedAt || 0) - (a.lastWatchedAt || 0));
  const anchorSeen = new Set<string>();
  const recentAnchors: TasteAnchor[] = [];
  const watchedIds = buildWatchedIdSet(watchHistory);

  for (const h of sortedHistory.slice(0, 40)) {
    const decay = computeDecayFactor(h.lastWatchedAt || now, now);
    const pct = typeof h.percent === 'number' && Number.isFinite(h.percent) ? h.percent : 50;
    // Titles watched past 60% are strong signals; barely started (<12%) weigh lightly
    const engagement = pct >= 60 ? 1.35 : pct >= 20 ? 0.95 : 0.35;
    const weight = 2.8 * decay * engagement;

    addType(h.type, weight * 0.75);

    const enriched = enrichedMap[h.mediaId] || (h.url ? enrichedMap[h.url] : undefined);
    const genres = extractItemGenreIds({
      genres: enriched?.genres,
      url: h.url,
      type: h.type,
    });
    for (const gid of genres) {
      addGenre(gid, 'history', weight);
    }

    const key = (h.mediaId || h.url || '').trim();
    if (key && !anchorSeen.has(key) && recentAnchors.length < 4 && pct >= 10) {
      anchorSeen.add(key);
      recentAnchors.push({
        id: h.mediaId,
        title: h.title,
        poster: h.poster,
        type: h.type,
        url: h.url,
        percent: Math.round(pct),
        source: 'history',
      });
    }
  }

  // 3. Favorites as strong explicit taste signals
  const sortedFavorites = [...favorites].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  for (const f of sortedFavorites.slice(0, 30)) {
    const decay = Math.max(0.45, computeDecayFactor(f.addedAt || now, now));
    const weight = 2.4 * decay;
    addType(f.type, weight * 0.65);

    const enriched = enrichedMap[f.mediaId];
    const genres = extractItemGenreIds({
      genres: enriched?.genres,
      url: f.mediaId.startsWith('http') ? f.mediaId : undefined,
      type: f.type,
    });
    for (const gid of genres) {
      addGenre(gid, 'favorite', weight);
    }

    if (f.mediaId && !anchorSeen.has(f.mediaId) && recentAnchors.length < 4) {
      anchorSeen.add(f.mediaId);
      recentAnchors.push({
        id: f.mediaId,
        title: f.title,
        poster: f.poster,
        type: f.type,
        source: 'favorite',
      });
    }
  }

  // 4. Collect "similar to what you watched" candidates from enriched title details
  const similarMap = new Map<string, SimilarCandidate>();
  for (let i = 0; i < recentAnchors.length; i++) {
    const anchor = recentAnchors[i];
    const enriched = enrichedMap[anchor.id] || (anchor.url ? enrichedMap[anchor.url] : undefined);
    if (!enriched?.similar?.length) continue;
    const anchorWeight = Math.max(1, 3.2 - i * 0.55);
    for (const sim of enriched.similar) {
      if (!sim?.poster) continue;
      const simKey = (sim.id || sim.url || '').trim().toLowerCase();
      if (!simKey || watchedIds.has(sim.id) || (sim.url && watchedIds.has(sim.url))) continue;
      const existing = similarMap.get(simKey);
      if (!existing || anchorWeight > existing.weight) {
        similarMap.set(simKey, {
          item: sim,
          similarToTitle: anchor.title,
          weight: anchorWeight,
        });
      }
    }
  }

  const rawGenres = Array.from(genreWeights.entries())
    .map(([id, b]) => {
      const score = Number((b.history + b.favorite + b.profile).toFixed(2));
      const hasHistory = b.history >= 0.4;
      const hasFav = b.favorite >= 0.4;
      const source: AnalyzedGenre['source'] =
        hasHistory && (hasFav || b.profile >= 0.6)
          ? 'both'
          : hasHistory
            ? 'history'
            : hasFav
              ? 'favorite'
              : 'profile';
      return { id, score, source };
    })
    .filter((g) => g.score > 0.2)
    .sort((a, b) => b.score - a.score);

  const maxGenreScore = rawGenres[0]?.score || 1;
  const topGenres: AnalyzedGenre[] = rawGenres.slice(0, 8).map((g) => ({
    ...g,
    sharePercent: Math.max(18, Math.min(100, Math.round((g.score / maxGenreScore) * 100))),
  }));

  const totalTypeScore = Array.from(typeWeights.values()).reduce((sum, v) => sum + v, 0) || 1;
  const topTypes: AnalyzedType[] = Array.from(typeWeights.entries())
    .map(([type, score]) => ({
      type,
      score: Number(score.toFixed(2)),
      sharePercent: Math.round((score / totalTypeScore) * 100),
    }))
    .filter((t) => t.score > 0.2)
    .sort((a, b) => b.score - a.score);

  const dominantType: ContentType = topTypes[0]?.type || 'films';

  return {
    topGenres,
    topTypes,
    dominantType,
    recentAnchors,
    similarCandidates: Array.from(similarMap.values()),
    watchedCount: watchHistory.length,
    favoritesCount: favorites.length,
    hasHistorySignal: watchHistory.length > 0 || favorites.length > 0 || topGenres.length > 0,
  };
}

/** Updates interactive session deltas when the user reacts to a recommendation. */
export function applyInteractiveFeedback(
  session: InteractiveSessionState,
  item: MediaItem,
  action: InteractiveFeedbackAction
): InteractiveSessionState {
  const nextGenreDeltas = { ...session.genreDeltas };
  const nextTypeDeltas = { ...session.typeDeltas };
  const itemGenres = extractItemGenreIds(item);

  const genreStep = action === 'more_like_this' ? 2.6 : action === 'not_for_me' ? -3.4 : 0.7;
  const typeStep = action === 'more_like_this' ? 0.9 : action === 'not_for_me' ? -0.6 : 0.25;

  for (const gid of itemGenres) {
    const prev = nextGenreDeltas[gid] || 0;
    nextGenreDeltas[gid] = Number(Math.max(-14, Math.min(14, prev + genreStep)).toFixed(2));
  }

  if (item.type && SELECTABLE_TYPES.includes(item.type)) {
    const prevType = nextTypeDeltas[item.type] || 0;
    nextTypeDeltas[item.type] = Number(Math.max(-6, Math.min(6, prevType + typeStep)).toFixed(2));
  }

  const nextDismissed = new Set(session.dismissedIds);
  if (item.id) nextDismissed.add(item.id);
  if (item.url) nextDismissed.add(item.url);

  return {
    genreDeltas: nextGenreDeltas,
    typeDeltas: nextTypeDeltas,
    dismissedIds: Array.from(nextDismissed),
  };
}

/**
 * Ranks interactive recommendations from catalog candidates + similar-to-watched titles,
 * combining analyzed watch taste, active mood, category, explicit genre(s), and live session reactions.
 * When explicit genre(s) are selected, candidates are strictly filtered to those genres so unrelated titles never leak in.
 */
export function rankInteractiveRecommendations(params: {
  candidates: MediaItem[];
  analysis: UserTasteAnalysis;
  category: ContentType | 'auto';
  genreOverride?: string;
  selectedGenres?: string[];
  strictGenres?: boolean;
  mood?: MoodId;
  watchHistory?: WatchHistoryEntry[];
  session?: InteractiveSessionState;
  excludedIds?: Set<string>;
  limit?: number;
  currentYear?: number;
}): InteractiveRecommendation[] {
  const mood: MoodId = params.mood || 'auto';
  const moodSpec = MOOD_PRESETS[mood];
  const currentYear = params.currentYear ?? new Date().getFullYear();
  const watchedIds = buildWatchedIdSet(params.watchHistory || []);
  const session = params.session || createEmptyInteractiveSession();
  const excluded = new Set<string>([
    ...Array.from(params.excludedIds || []),
    ...session.dismissedIds,
  ]);

  const rawSelectedGenres = [
    ...(Array.isArray(params.selectedGenres) ? params.selectedGenres : []),
    ...(params.genreOverride ? [params.genreOverride] : []),
  ];
  const activeGenres = Array.from(
    new Set(
      rawSelectedGenres
        .map((g) => normalizeGenreToId(g) || (typeof g === 'string' ? g.trim().toLowerCase() : ''))
        .filter(Boolean)
    )
  );
  const activeGenreSet = new Set(activeGenres);
  const strictGenres = params.strictGenres ?? activeGenres.length > 0;

  // Index "similar to watched" boosts by normalized key
  const similarLookup = new Map<string, SimilarCandidate>();
  for (const sc of params.analysis.similarCandidates) {
    const kId = (sc.item.id || '').trim().toLowerCase();
    const kUrl = (sc.item.url || '').trim().toLowerCase();
    if (kId) similarLookup.set(kId, sc);
    if (kUrl) similarLookup.set(kUrl, sc);
  }

  const combined = dedupeItems([
    ...params.analysis.similarCandidates.map((s) => s.item),
    ...params.candidates,
  ]);

  const filterUnseen = (items: MediaItem[]) =>
    items.filter((item) => {
      if (!item?.poster) return false;
      const id = (item.id || '').trim();
      const url = (item.url || '').trim();
      if ((id && (excluded.has(id) || watchedIds.has(id))) || (url && (excluded.has(url) || watchedIds.has(url)))) {
        return false;
      }
      return true;
    });

  const unseen = filterUnseen(combined);
  const categoryFiltered =
    params.category === 'auto'
      ? unseen
      : unseen.filter((item) =>
          params.category === 'cartoons'
            ? item.type === 'cartoons' || item.type === 'animation'
            : item.type === params.category
        );

  let pool =
    params.category === 'auto'
      ? unseen
      : categoryFiltered.length > 0 || strictGenres
        ? categoryFiltered
        : unseen;

  // Strict genre lock: when user picks specific genre(s), never leak unrelated random movies
  if (activeGenres.length > 0 && strictGenres) {
    pool = pool.filter((item) => {
      const itemGenres = extractItemGenreIds(item);
      return itemGenres.some((gid) => activeGenreSet.has(gid));
    });
  } else if (activeGenres.length === 0 && mood !== 'auto' && moodSpec.genres.length > 0) {
    // When a genre-based mood is active (no explicit genre override), strictly keep on-mood items if any exist
    const moodSet = new Set(moodSpec.genres);
    const moodMatches = pool.filter((item) => extractItemGenreIds(item).some((gid) => moodSet.has(gid)));
    if (moodMatches.length > 0) {
      pool = moodMatches;
    }
  }

  if (pool.length === 0) return [];

  const analyzedGenreMap = new Map(params.analysis.topGenres.map((g) => [g.id, g.score]));
  const analyzedTypeMap = new Map(params.analysis.topTypes.map((t) => [t.type, t.score]));

  const scored: InteractiveRecommendation[] = pool.map((item) => {
    const itemGenres = extractItemGenreIds(item);
    const matchedGenres: string[] = [];
    const matchedSelectedGenres = activeGenres.filter((gid) => itemGenres.includes(gid));
    let genreScore = 0;

    for (const gid of itemGenres) {
      const baseW = analyzedGenreMap.get(gid) || 0;
      const rawDeltaW = session.genreDeltas[gid] || 0;
      // Don't let an earlier "not_for_me" fight against a genre the user explicitly picked right now
      const deltaW = activeGenreSet.has(gid) && rawDeltaW < 0 ? 0 : rawDeltaW;
      const effective = baseW + deltaW;
      if (effective > 0.25) {
        genreScore += Math.min(11, effective);
        matchedGenres.push(gid);
      } else if (deltaW < 0) {
        genreScore += deltaW * 1.4;
      }
    }

    const baseTypeW = analyzedTypeMap.get(item.type) || 0;
    const typeDelta = session.typeDeltas[item.type] || 0;
    const matchedType = baseTypeW + typeDelta > 0.4;
    const typeScore = Math.max(-4, Math.min(6, (baseTypeW + typeDelta) * 0.75));

    // Similar-to-watched match bonus (only survives here if it also passed the active genre filter)
    const simHit =
      similarLookup.get((item.id || '').trim().toLowerCase()) ||
      similarLookup.get((item.url || '').trim().toLowerCase());
    const similarBonus = simHit ? 5.5 + simHit.weight : 0;

    // Explicit genre(s) bonus — multi-genre intersection titles jump straight to #1
    let genreOverrideBonus = 0;
    if (activeGenres.length > 0) {
      if (matchedSelectedGenres.length > 0) {
        const allMatchedBonus =
          activeGenres.length > 1 && matchedSelectedGenres.length === activeGenres.length ? 14 : 0;
        genreOverrideBonus = matchedSelectedGenres.length * 14 + allMatchedBonus;
        for (let i = matchedSelectedGenres.length - 1; i >= 0; i--) {
          const gid = matchedSelectedGenres[i];
          if (!matchedGenres.includes(gid)) {
            matchedGenres.unshift(gid);
          }
        }
      } else {
        genreOverrideBonus = -12;
      }
    }

    // Mood preset bonus
    let moodBonus = 0;
    let matchedMood: MoodId | undefined;
    if (mood !== 'auto') {
      if (moodSpec.genres.length > 0) {
        const moodOverlap = itemGenres.filter((g) => moodSpec.genres.includes(g));
        if (moodOverlap.length > 0) {
          moodBonus += 6 + moodOverlap.length * 2.5;
          matchedMood = mood;
        } else {
          moodBonus -= 2.5;
        }
      }
      if (moodSpec.preferFresh) {
        if (item.year && item.year >= currentYear - 1) {
          moodBonus += 9;
          matchedMood = 'fresh';
        } else if (item.year && item.year >= currentYear - 2) {
          moodBonus += 4;
          matchedMood = 'fresh';
        } else {
          moodBonus -= 3;
        }
      }
      if (moodSpec.minRatingBias && typeof item.rating === 'number' && item.rating >= moodSpec.minRatingBias) {
        moodBonus += 2.2;
      }
    }

    const rating = typeof item.rating === 'number' && item.rating > 0 ? item.rating : 0;
    const highRated = rating >= 7.5;
    const ratingBoost = rating > 0 ? (rating - 5.8) * 1.1 : 0;
    const recencyBoost = item.year && item.year >= currentYear - 1 ? 1.4 : item.year && item.year >= currentYear - 3 ? 0.6 : 0;

    const totalScore = genreScore * 1.45 + typeScore + similarBonus + genreOverrideBonus + moodBonus + ratingBoost + recencyBoost;

    // Calibrate a believable 62–99% Match percentage from concrete alignment signals
    const selectedGenrePct =
      matchedSelectedGenres.length > 0
        ? activeGenres.length > 1 && matchedSelectedGenres.length === activeGenres.length
          ? 14
          : 9
        : 0;
    const rawPct =
      64 +
      Math.min(14, matchedGenres.length * 6.5) +
      (simHit ? 11 : 0) +
      (matchedMood ? 7 : 0) +
      (matchedType ? 4 : 0) +
      (rating > 0 ? Math.max(-4, Math.min(7, (rating - 6.2) * 2.8)) : 1) +
      selectedGenrePct;
    const matchPercent = Math.max(62, Math.min(99, Math.round(rawPct)));

    return {
      item,
      score: Number(totalScore.toFixed(2)),
      matchPercent,
      matchedGenres,
      matchedSelectedGenres,
      matchedType,
      matchedMood,
      similarToTitle: simHit?.similarToTitle,
      highRated,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return typeof params.limit === 'number' ? scored.slice(0, params.limit) : scored;
}
