import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Heart,
  Plus,
  Share2,
  CheckCircle2,
  Star,
  Clock,
  Globe,
  Film,
  User,
  AlertCircle,
  MessageSquare,
  Award,
} from 'lucide-react';
import { MediaDetails, Season } from '../../shared/types';
import { useMediaStore } from '../stores/useMediaStore';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { MediaSlider } from '../components/MediaSlider';
import { SeriesNavigationPanel } from '../components/SeriesNavigationPanel';
import { useTranslation } from '../i18n';
import { useLocalizedTitle } from '../hooks/useLocalizedTitle';
import { formatDuration, getResumableTime, inferAgeRating, getAgeRatingBadgeClass } from '../../shared/utils';
import appLogo from '../assets/logo.png';

export const DetailsPage: React.FC = () => {
  const {
    selectedMediaId,
    selectedMediaDetails,
    favorites,
    watchHistory,
    loadWatchHistory,
    toggleFavorite,
    openCollectionModal,
    openBrowser,
  } = useMediaStore();
  const { openPlayer } = usePlayerStore();
  const { isFindingMirrors, isCheckingMirrors } = useSettingsStore();
  const isSearchingMirrors = isFindingMirrors || isCheckingMirrors;
  const { t } = useTranslation();

  const [details, setDetails] = useState<MediaDetails | null>(selectedMediaDetails);
  const [loading, setLoading] = useState<boolean>(!selectedMediaDetails);
  const [isFetchingDetails, setIsFetchingDetails] = useState<boolean>(false);
  const [selectedTranslatorId, setSelectedTranslatorId] = useState<number>(selectedMediaDetails?.currentTranslatorId ?? 56);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number>(1);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [reviewFilter, setReviewFilter] = useState<'all' | 'kinopoisk' | 'critic' | 'user'>('all');
  const [posterSrc, setPosterSrc] = useState<string>(selectedMediaDetails?.poster || '');
  const [posterFailed, setPosterFailed] = useState<boolean>(false);
  const [backdropSrc, setBackdropSrc] = useState<string>(selectedMediaDetails?.backdrop || selectedMediaDetails?.poster || '');
  const [backdropFailed, setBackdropFailed] = useState<boolean>(false);
  const triedPostersRef = useRef<Set<string>>(new Set());
  const syncedResumeSeasonRef = useRef<string | null>(null);
  const displayTitle = useLocalizedTitle(details?.title, details?.origTitle);
  const resolvedAgeRating = details ? inferAgeRating(details) : '';

  useEffect(() => {
    const nextPoster = details?.poster || selectedMediaDetails?.poster || '';
    const nextBackdrop = details?.backdrop || nextPoster;
    triedPostersRef.current = new Set(nextPoster ? [nextPoster] : []);
    setPosterSrc(nextPoster);
    setPosterFailed(!nextPoster);
    setBackdropSrc(nextBackdrop);
    setBackdropFailed(!nextBackdrop);
  }, [details?.id, details?.poster, details?.backdrop, selectedMediaDetails?.poster]);

  const matchesMediaHistory = (h: { mediaId: string; url?: string }, d: MediaDetails) =>
    h.mediaId === d.id ||
    (Boolean(d.url) && (h.url === d.url || h.mediaId === d.url)) ||
    (Boolean(h.url) && h.url === d.id);

  const lastWatch = details ? watchHistory.find((h) => matchesMediaHistory(h, details)) : undefined;
  const resumableTime = getResumableTime(lastWatch?.currentTime, lastWatch?.duration);

  useEffect(() => {
    if (!details || seasons.length === 0 || !lastWatch?.season) return;
    if (syncedResumeSeasonRef.current === details.id) return;
    if (seasons.some((s) => s.id === lastWatch.season)) {
      setSelectedSeasonId(lastWatch.season);
      syncedResumeSeasonRef.current = details.id;
    }
  }, [details?.id, seasons, lastWatch?.season]);

  useEffect(() => {
    if (selectedMediaId) {
      loadWatchHistory();
      if (selectedMediaDetails) {
        setDetails(selectedMediaDetails);
        setSeasons(selectedMediaDetails.seasons || []);
        if (selectedMediaDetails.translators && selectedMediaDetails.translators.length > 0) {
          setSelectedTranslatorId(selectedMediaDetails.currentTranslatorId ?? selectedMediaDetails.translators[0].id);
        }
      }
      loadMediaDetails(selectedMediaId);
    }
  }, [selectedMediaId]);

  const loadMediaDetails = async (idOrUrl: string) => {
    if (!window.api) return;
    let settled = false;
    const spinnerTimer = setTimeout(() => {
      if (!settled) setIsFetchingDetails(true);
    }, 140);
    if (!details && !selectedMediaDetails) {
      setLoading(true);
    }
    try {
      const data = await window.api.getDetails(idOrUrl, selectedMediaDetails || undefined);
      settled = true;
      clearTimeout(spinnerTimer);
      const mergedData =
        data && !data.poster && selectedMediaDetails?.poster
          ? { ...data, poster: selectedMediaDetails.poster, backdrop: data.backdrop || selectedMediaDetails.poster }
          : data;
      setDetails(mergedData);
      if (data && !data.antiBot) {
        useSettingsStore.getState().recordTasteSignal(data, 'view');
      }
      if (data.translators && data.translators.length > 0) {
        setSelectedTranslatorId(data.currentTranslatorId ?? data.translators[0].id);
      }
      if (data.seasons && data.seasons.length > 0) {
        setSeasons(data.seasons);
        const latestHistory = useMediaStore
          .getState()
          .watchHistory.find((h) => matchesMediaHistory(h, data));
        const resumeSeason = latestHistory?.season;
        if (resumeSeason && data.seasons.some((s: Season) => s.id === resumeSeason)) {
          setSelectedSeasonId(resumeSeason);
        } else {
          setSelectedSeasonId(data.seasons[0].id);
        }
      } else {
        setSeasons([]);
      }
    } catch (err) {
      console.error('Failed to load details:', err);
    } finally {
      settled = true;
      clearTimeout(spinnerTimer);
      setLoading(false);
      setIsFetchingDetails(false);
    }
  };

  const handleTranslatorChange = async (trId: number) => {
    setSelectedTranslatorId(trId);
    if ((details?.type === 'series' || details?.type === 'animation' || details?.type === 'cartoons') && window.api) {
      setLoadingEpisodes(true);
      try {
        const newSeasons = await window.api.getSeriesEpisodes(details.id, trId);
        if (newSeasons && newSeasons.length > 0) {
          setSeasons(newSeasons);
          setSelectedSeasonId((prev) => (newSeasons.some((s: Season) => s.id === prev) ? prev : newSeasons[0].id));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingEpisodes(false);
      }
    }
  };

  const handleWatch = (seasonId?: number, episodeId?: number) => {
    if (!details) return;
    const isSeriesLike =
      details.type === 'series' ||
      details.type === 'animation' ||
      details.type === 'cartoons' ||
      (seasons && seasons.length > 0);
    const effectiveTranslatorId =
      typeof selectedTranslatorId === 'number'
        ? selectedTranslatorId
        : details.translators?.[0]?.id ?? details.currentTranslatorId ?? 0;

    const isExplicitEpisode = seasonId !== undefined || episodeId !== undefined;
    const fallbackSeason = seasons.find((s) => s.id === selectedSeasonId) || seasons[0];
    const targetSeason = isSeriesLike
      ? seasonId || (!isExplicitEpisode && resumableTime > 0 && lastWatch?.season ? lastWatch.season : fallbackSeason?.id ?? selectedSeasonId)
      : undefined;
    const targetSeasonObj = seasons.find((s) => s.id === targetSeason) || fallbackSeason;
    const targetEpisode = isSeriesLike
      ? episodeId || (!isExplicitEpisode && resumableTime > 0 && lastWatch?.episode ? lastWatch.episode : targetSeasonObj?.episodes?.[0]?.episodeId ?? 1)
      : undefined;
    const matchingHistoryStart =
      !isExplicitEpisode &&
      resumableTime > 0 &&
      (!isSeriesLike || (lastWatch?.season === targetSeason && lastWatch?.episode === targetEpisode))
        ? resumableTime
        : undefined;

    openPlayer({
      details,
      translatorId: effectiveTranslatorId,
      seasonId: targetSeason,
      episodeId: targetEpisode,
      startTime: matchingHistoryStart,
    });
  };

  const handleCopyLink = () => {
    if (!details) return;
    const url = details.id.startsWith('http') ? details.id : `https://hdrezka-home.tv/${details.id}.html`;
    navigator.clipboard.writeText(url);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleVerifyMirror = async () => {
    try {
      await useSettingsStore.getState().verifyMirror(details?.url || details?.id);
    } catch (err) {
      console.warn('[Details] verifyMirror error:', err);
    } finally {
      if (selectedMediaId) {
        loadMediaDetails(selectedMediaId);
      }
    }
  };

  if (loading && !details) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[540px]" role="status" aria-live="polite">
        <div className="relative w-20 h-20 mb-5 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-[3px] border-brand-crimson/20 border-t-brand-orange border-r-brand-crimson animate-spin" />
          <img src={appLogo} alt="" className="w-12 h-12 rounded-full object-cover shadow-glow" />
        </div>
        <span className="text-zinc-300 text-xs font-bold tracking-wider uppercase">
          {isSearchingMirrors ? t.settings.findingOnlineMirrors : t.home.loadingCatalog}
        </span>
      </div>
    );
  }

  if (!details) return null;

  const isFav = favorites.some((f) => f.mediaId === details.id);
  const isSeriesLike =
    details.type === 'series' || details.type === 'animation' || details.type === 'cartoons' || seasons.length > 0;

  return (
    <div className="w-full pb-20 text-left select-none animate-fadeIn">
      {/* Full-Bleed Theater Backdrop Stage */}
      <section className="cinema-player-surface relative -mx-7 lg:-mx-9 -mt-6 mb-6 overflow-hidden border-b border-white/[0.06]">
        {backdropSrc && !backdropFailed && (
          <img
            src={backdropSrc}
            alt=""
            aria-hidden="true"
            onError={() => {
              if (posterSrc && posterSrc !== backdropSrc && !posterFailed) {
                setBackdropSrc(posterSrc);
              } else {
                setBackdropFailed(true);
              }
            }}
            className="absolute inset-0 w-full h-full object-cover filter brightness-[0.38] blur-xl scale-110 saturate-125 pointer-events-none"
          />
        )}
        <div
          className="absolute -top-20 right-12 w-[420px] h-[420px] rounded-full opacity-30 blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(255,122,0,0.5) 0%, rgba(255,18,79,0.4) 55%, transparent 75%)' }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B070A] via-[#0B070A]/78 to-[#070507]/35 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0B070A] via-[#0B070A]/65 to-transparent pointer-events-none" />

        <div className="relative z-10 px-7 lg:px-10 py-6 lg:py-7 flex flex-col md:flex-row gap-6 lg:gap-8 items-start md:items-stretch">
          {/* Poster Card with Ember Rim */}
          <button
            type="button"
            onClick={() => handleWatch()}
            aria-label={`${t.details.watch} ${details.title}`}
            className="w-48 md:w-56 flex-shrink-0 group relative cursor-pointer rounded-[20px] p-[2px] bg-gradient-to-br from-white/25 via-brand-ember/55 to-brand-crimson/55 shadow-[0_24px_60px_rgba(0,0,0,0.9)] self-start"
          >
            <div className="relative rounded-[18px] overflow-hidden bg-dark-surface aspect-[2/3]">
              {!posterFailed && posterSrc ? (
                <img
                  src={posterSrc}
                  alt={displayTitle || details.title}
                  onError={() => {
                    const candidates = [details?.backdrop, selectedMediaDetails?.poster].filter(
                      (c): c is string => typeof c === 'string' && c.length > 0 && !triedPostersRef.current.has(c)
                    );
                    if (candidates.length > 0) {
                      triedPostersRef.current.add(candidates[0]);
                      setPosterSrc(candidates[0]);
                    } else {
                      setPosterFailed(true);
                    }
                  }}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 block"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-5 text-center bg-gradient-to-br from-[#1C1218] via-[#120B10] to-[#090608]">
                  <div className="logo-ring rounded-full mb-3 opacity-85">
                    <img src={appLogo} alt="" className="w-12 h-12 rounded-full object-cover block" />
                  </div>
                  <span className="font-display text-xs font-extrabold text-zinc-200 line-clamp-3 leading-snug">
                    {displayTitle || details.title}
                  </span>
                </div>
              )}
              <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <div className="w-16 h-16 rounded-[18px] play-squircle flex items-center justify-center">
                  <Play className="w-7 h-7 fill-white text-white ml-0.5" aria-hidden="true" />
                </div>
              </div>
            </div>
          </button>

          {/* Editorial Title, Structured Info & Bottom-Aligned Actions (aligned with poster height) */}
          <div className="flex-1 min-w-0 flex flex-col justify-between gap-4">
            <div className="space-y-3">
              {/* Title + Subtitle (tight spacing) */}
              <div>
                <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight leading-tight drop-shadow">
                  {displayTitle || details.title}
                </h1>
                {(details.origTitle && details.origTitle !== displayTitle) ? (
                  <p className="text-sm text-zinc-400 font-medium mt-0.5">
                    {details.origTitle}
                  </p>
                ) : (details.title && details.title !== displayTitle) ? (
                  <p className="text-sm text-zinc-400 font-medium mt-0.5">
                    {details.title}
                  </p>
                ) : null}
              </div>

              {/* Visually Distinct Metadata Groups: Score Tiles | Clean Typographic Facts | Age Stamp */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {/* Group 1: Rating Score Tiles */}
                {(details.ratingRezka || details.ratingImdb || details.ratingKp) && (
                  <div className="flex items-center gap-1.5">
                    {details.ratingRezka && (
                      <div className="inline-flex items-baseline gap-1.5 px-2.5 py-1 rounded-xl btn-ember tabular-nums">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-white/85">HDRezka</span>
                        <span className="text-sm font-display font-black text-white leading-none">{details.ratingRezka.toFixed(1)}</span>
                      </div>
                    )}
                    {details.ratingImdb && (
                      <div className="inline-flex items-baseline gap-1 px-2.5 py-1 rounded-xl bg-[#FFB830]/12 border border-[#FFB830]/35 tabular-nums">
                        <Star className="w-3 h-3 fill-brand-gold text-brand-gold self-center" aria-hidden="true" />
                        <span className="text-[10px] font-bold uppercase text-brand-gold/85">IMDb</span>
                        <span className="text-sm font-display font-black text-brand-gold leading-none">{details.ratingImdb.toFixed(1)}</span>
                      </div>
                    )}
                    {details.ratingKp && (
                      <div className="inline-flex items-baseline gap-1 px-2.5 py-1 rounded-xl bg-brand-orange/12 border border-brand-orange/35 tabular-nums">
                        <span className="text-[10px] font-bold uppercase text-brand-orange/85">{t.details.kpRating}</span>
                        <span className="text-sm font-display font-black text-brand-orange leading-none">{details.ratingKp.toFixed(1)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Group 2: Editorial Facts Strip (plain typography + dots, no pill fatigue) */}
                {(details.year || details.country || details.duration || resolvedAgeRating) && (
                  <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-xs text-zinc-300 font-medium">
                    {details.year && <span className="font-bold text-white tabular-nums">{details.year}</span>}
                    {details.year && details.country && <span className="text-zinc-600">•</span>}
                    {details.country && <span>{details.country}</span>}
                    {(details.year || details.country) && details.duration && <span className="text-zinc-600">•</span>}
                    {details.duration && (
                      <span className="inline-flex items-center gap-1 text-zinc-300">
                        <Clock className="w-3 h-3 text-brand-orange/90" aria-hidden="true" />
                        <span>{details.duration}</span>
                      </span>
                    )}
                    {resolvedAgeRating && (
                      <span
                        className={`ml-1 px-1.5 py-0.5 rounded-md text-[10px] font-display font-black tabular-nums ${getAgeRatingBadgeClass(
                          resolvedAgeRating
                        )}`}
                        title={`${t.details.ageRating}: ${resolvedAgeRating}`}
                      >
                        {resolvedAgeRating}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Group 3: Subtle Genre Tags */}
              {details.genres && details.genres.length > 0 && (
                <div className="flex items-center flex-wrap gap-1.5">
                  {details.genres.map((g, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-0.5 rounded-lg bg-white/[0.04] border border-white/[0.09] text-[11px] font-semibold text-zinc-300"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}

              {/* Concise Synopsis Preview & Director (fills space cleanly between metadata and actions) */}
              {details.description && (
                <p className="text-xs sm:text-[13px] text-zinc-300/90 leading-relaxed line-clamp-3 max-w-3xl">
                  {details.description}
                </p>
              )}
              {details.directors && details.directors.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <User className="w-3.5 h-3.5 text-brand-orange/80 flex-shrink-0" aria-hidden="true" />
                  <span className="text-zinc-500 font-semibold">{t.details.director}:</span>
                  <span className="text-zinc-200 font-medium truncate">{details.directors.join(', ')}</span>
                </div>
              )}
            </div>

            {/* Bottom Block: Action Buttons aligned flush with bottom of poster */}
            <div className="space-y-3 pt-2">
            <div className="flex items-center flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => handleWatch()}
                className="flex items-center gap-2.5 px-7 py-3.5 rounded-full btn-ember text-white font-display font-black text-xs uppercase tracking-wider active:scale-95 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-white" aria-hidden="true" />
                <span>
                  {resumableTime > 0
                    ? isSeriesLike && lastWatch?.season && lastWatch?.episode
                      ? `${t.history.resume} · ${t.details.seasonShort}${lastWatch.season} ${t.details.episodeShort}${lastWatch.episode} (${formatDuration(resumableTime)})`
                      : `${t.history.resume} (${formatDuration(resumableTime)})`
                    : t.details.watch}
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  toggleFavorite({
                    id: details.id,
                    title: details.title,
                    origTitle: details.origTitle,
                    poster: details.poster,
                    type: details.type,
                    year: details.year,
                    rating: details.ratingRezka || details.ratingImdb,
                    url: details.id,
                  })
                }
                aria-pressed={isFav}
                className={`flex items-center gap-2 px-5 py-3.5 rounded-full border active:scale-95 text-xs font-bold cursor-pointer ${
                  isFav
                    ? 'bg-brand-crimson/20 border-brand-crimson/60 text-brand-crimson shadow-glow-sm'
                    : 'bg-white/[0.07] hover:bg-white/[0.13] border-white/[0.12] text-zinc-200'
                }`}
              >
                <Heart className={`w-4 h-4 ${isFav ? 'fill-brand-crimson' : ''}`} />
                <span>{isFav ? t.details.inFavorites : t.details.addToFavorites}</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  openCollectionModal({
                    id: details.id,
                    title: details.title,
                    poster: details.poster,
                    type: details.type,
                    year: details.year,
                    rating: details.ratingRezka || details.ratingImdb,
                    url: details.id,
                  })
                }
                aria-label={t.details.addToCollection}
                className="p-3.5 rounded-full bg-white/[0.07] hover:bg-white/[0.13] border border-white/[0.12] text-zinc-200 active:scale-95 cursor-pointer"
                title={t.details.addToCollection}
              >
                <Plus className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleCopyLink}
                aria-label={isCopied ? t.details.linkCopied : t.details.copyLink}
                className="p-3.5 rounded-full bg-white/[0.07] hover:bg-white/[0.13] border border-white/[0.12] text-zinc-200 active:scale-95 cursor-pointer"
                title={isCopied ? t.details.linkCopied : t.details.copyLink}
              >
                {isCopied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={() => openBrowser(`${details.title}${details.year ? ` ${details.year}` : ''}`)}
                className="flex items-center gap-2 px-5 py-3.5 rounded-full bg-white/[0.07] hover:bg-white/[0.13] border border-white/[0.12] text-zinc-200 hover:text-white text-xs font-bold active:scale-95 cursor-pointer"
                title={t.details.findAlternativeGoogle}
              >
                <Globe className="w-4 h-4 text-brand-orange" aria-hidden="true" />
                <span>{t.details.findOnline}</span>
              </button>
            </div>

            {/* Circular loading indicator while mirrors or full details are still resolving */}
            {(isSearchingMirrors || isFetchingDetails) && (
              <div
                role="status"
                aria-live="polite"
                className="mb-5 inline-flex items-center gap-2.5 px-4 py-2 rounded-full cinema-glass border border-brand-ember/40 text-xs font-bold text-zinc-200"
              >
                <span
                  className="w-4 h-4 rounded-full border-[2.5px] border-brand-crimson/25 border-t-brand-orange border-r-brand-crimson animate-spin flex-shrink-0"
                  aria-hidden="true"
                />
                <span>{isSearchingMirrors ? t.settings.findingOnlineMirrors : t.home.loadingCatalog}</span>
              </div>
            )}

            {/* Anti-bot notice */}
            {details.antiBot && (
              <div className="p-3.5 rounded-2xl bg-amber-950/35 border border-amber-500/35 flex items-center justify-between gap-3 text-xs text-amber-200 max-w-xl">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-400" />
                  <span>{t.details.antiBotWarning}</span>
                </div>
                <button
                  type="button"
                  onClick={handleVerifyMirror}
                  className="px-3.5 py-1.5 rounded-full bg-amber-400 hover:bg-amber-300 text-black font-extrabold text-xs flex-shrink-0 cursor-pointer"
                >
                  {t.details.passVerification}
                </button>
              </div>
            )}
            </div>
          </div>
        </div>
      </section>

      {/* Unified Voiceover, Seasons & Episodes Navigation */}
      <SeriesNavigationPanel
        translators={details.translators}
        selectedTranslatorId={selectedTranslatorId}
        onTranslatorChange={handleTranslatorChange}
        seasons={seasons}
        selectedSeasonId={selectedSeasonId}
        onSeasonChange={setSelectedSeasonId}
        loadingEpisodes={loadingEpisodes}
        onSelectEpisode={(sId, epId) => handleWatch(sId, epId)}
        lastWatchedSeason={lastWatch?.season}
        lastWatchedEpisode={lastWatch?.episode}
        isSeriesLike={isSeriesLike}
      />

      {/* Description & Cast */}
      <div className="mb-10 grid grid-cols-1 md:grid-cols-3 gap-6">
        <section className="md:col-span-2 p-6 rounded-3xl cinema-panel">
          <h2 className="font-display text-sm font-black text-white uppercase tracking-wider mb-3.5 flex items-center gap-2.5">
            <span
              className="w-1.5 h-4 rounded-full"
              style={{ background: 'linear-gradient(180deg, #FF124F 0%, #FF7A00 100%)' }}
            />
            <span>{t.details.aboutTitle}</span>
          </h2>
          <p className="text-xs md:text-sm text-zinc-300 leading-relaxed whitespace-pre-line">
            {details.description || t.details.noDescription}
          </p>
        </section>

        <section className="p-6 rounded-3xl cinema-panel space-y-5">
          {details.directors && details.directors.length > 0 && (
            <div>
              <h3 className="text-[11px] font-extrabold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-brand-orange" aria-hidden="true" />
                <span>{t.details.director}</span>
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {details.directors.map((d, i) => (
                  <span key={i} className="text-xs text-zinc-200 font-semibold">
                    {d}
                    {i < details.directors.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </div>
            </div>
          )}

          {details.actors && details.actors.length > 0 && (
            <div className="pt-3 border-t border-white/[0.06]">
              <h3 className="text-[11px] font-extrabold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Film className="w-3.5 h-3.5 text-brand-orange" aria-hidden="true" />
                <span>{t.details.cast}</span>
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {details.actors.slice(0, 10).map((a, i) => (
                  <span key={i} className="text-xs text-zinc-300">
                    {a}
                    {i < Math.min(details.actors.length, 10) - 1 ? ', ' : ''}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Critic Reviews & User Comments */}
      {details.reviews && details.reviews.length > 0 && (
        <section className="mb-10 p-6 rounded-3xl cinema-panel">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-white/[0.06]">
            <h2 className="font-display text-sm font-black text-white uppercase tracking-wider flex items-center gap-2.5">
              <span
                className="w-1.5 h-4 rounded-full"
                style={{ background: 'linear-gradient(180deg, #FF124F 0%, #FF7A00 100%)' }}
              />
              <MessageSquare className="w-4 h-4 text-brand-orange" aria-hidden="true" />
              <span>{t.details.reviewsTitle}</span>
            </h2>

            <div className="flex items-center flex-wrap gap-1.5 bg-black/40 p-1 rounded-full border border-white/[0.08]">
              {([
                { id: 'all', label: `${t.details.reviewsAll} (${details.reviews.length})` },
                ...(details.reviews.some((r) => r.source === 'Кинопоиск')
                  ? [{ id: 'kinopoisk' as const, label: `${t.details.kpRating} (${details.reviews.filter((r) => r.source === 'Кинопоиск').length})` }]
                  : []),
                { id: 'critic', label: `${t.details.reviewsCritics} (${details.reviews.filter((r) => r.type === 'critic').length})` },
                { id: 'user', label: `${t.details.reviewsUsers} (${details.reviews.filter((r) => r.type === 'user').length})` },
              ] as const).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={reviewFilter === tab.id}
                  onClick={() => setReviewFilter(tab.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold cursor-pointer ${
                    reviewFilter === tab.id
                      ? 'btn-ember text-white'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
            {details.reviews
              .filter((r) =>
                reviewFilter === 'all'
                  ? true
                  : reviewFilter === 'kinopoisk'
                    ? r.source === 'Кинопоиск'
                    : r.type === reviewFilter
              )
              .map((rev) => {
                const isCritic = rev.type === 'critic';
                const accent =
                  rev.sentiment === 'positive'
                    ? 'border-l-emerald-400'
                    : rev.sentiment === 'negative'
                    ? 'border-l-rose-500'
                    : isCritic
                    ? 'border-l-brand-gold'
                    : 'border-l-white/25';
                return (
                  <article
                    key={rev.id}
                    className={`p-4 rounded-2xl bg-[#0D080B]/90 border border-white/[0.06] border-l-4 ${accent} space-y-2`}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                            isCritic
                              ? 'bg-brand-gold/15 text-brand-gold border border-brand-gold/35'
                              : 'bg-white/[0.08] text-zinc-200'
                          }`}
                        >
                          {isCritic && <Award className="w-3 h-3" aria-hidden="true" />}
                          {isCritic ? t.details.criticBadge : t.details.viewerBadge}
                        </span>
                        <span className="text-xs font-bold text-white">{rev.author}</span>
                        {rev.source && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-zinc-400">
                            {rev.source}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                        {rev.rating && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-bold">
                            {rev.rating}
                          </span>
                        )}
                        {rev.date && <span>{rev.date}</span>}
                      </div>
                    </div>
                    <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-line">{rev.text}</p>
                  </article>
                );
              })}
          </div>
        </section>
      )}

      {/* Similar Titles */}
      {details.similar && details.similar.length > 0 && (
        <MediaSlider title={t.details.similar} items={details.similar} />
      )}
    </div>
  );
};
