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
  Mic2,
  Tv,
} from 'lucide-react';
import { MediaDetails, Season } from '../../shared/types';
import { useMediaStore } from '../stores/useMediaStore';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { MediaSlider } from '../components/MediaSlider';
import { HorizontalSlider } from '../components/HorizontalSlider';
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
  const [backdropFailed, setBackdropFailed] = useState<boolean>(false);
  const syncedResumeSeasonRef = useRef<string | null>(null);
  const displayTitle = useLocalizedTitle(details?.title, details?.origTitle);
  const resolvedAgeRating = details ? inferAgeRating(details) : '';

  useEffect(() => {
    const nextPoster = details?.poster || selectedMediaDetails?.poster || '';
    setPosterSrc(nextPoster);
    setPosterFailed(!nextPoster);
    setBackdropFailed(false);
  }, [details?.id, details?.poster, selectedMediaDetails?.poster]);

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
  const currentSeason = seasons.find((s) => s.id === selectedSeasonId) || seasons[0];

  return (
    <div className="w-full pb-20 text-left select-none animate-fadeIn">
      {/* Full-Bleed Theater Backdrop Stage */}
      <section className="cinema-player-surface relative -mx-7 lg:-mx-9 -mt-6 mb-9 overflow-hidden border-b border-white/[0.06]">
        {(details.backdrop || posterSrc) && !backdropFailed && (
          <img
            src={details.backdrop || posterSrc}
            alt=""
            aria-hidden="true"
            onError={() => setBackdropFailed(true)}
            className="absolute inset-0 w-full h-full object-cover filter brightness-[0.38] blur-xl scale-110 saturate-125 pointer-events-none"
          />
        )}
        <div
          className="absolute -top-20 right-12 w-[420px] h-[420px] rounded-full opacity-30 blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(255,122,0,0.5) 0%, rgba(255,18,79,0.4) 55%, transparent 75%)' }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B070A] via-[#0B070A]/78 to-[#070507]/35 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0B070A] via-[#0B070A]/65 to-transparent pointer-events-none" />

        <div className="relative z-10 px-7 lg:px-12 py-10 flex flex-col md:flex-row gap-8 lg:gap-10 items-start">
          {/* Poster Card with Ember Rim */}
          <button
            type="button"
            onClick={() => handleWatch()}
            aria-label={`${t.details.watch} ${details.title}`}
            className="w-52 md:w-64 flex-shrink-0 group relative cursor-pointer rounded-[22px] p-[2px] bg-gradient-to-br from-white/25 via-brand-ember/55 to-brand-crimson/55 shadow-[0_24px_60px_rgba(0,0,0,0.9)]"
          >
            <div className="relative rounded-[20px] overflow-hidden bg-dark-surface aspect-[2/3]">
              {!posterFailed && posterSrc ? (
                <img
                  src={posterSrc}
                  alt={displayTitle || details.title}
                  onError={() => {
                    const fallback = selectedMediaDetails?.poster;
                    if (fallback && fallback !== posterSrc) {
                      setPosterSrc(fallback);
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

          {/* Editorial Title & Actions */}
          <div className="flex-1 min-w-0 pt-1">
            <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight leading-tight mb-1.5 drop-shadow">
              {displayTitle || details.title}
            </h1>
            {(details.origTitle && details.origTitle !== displayTitle) ? (
              <p className="text-sm md:text-base text-zinc-400 font-medium mb-5">
                {details.origTitle}
              </p>
            ) : (details.title && details.title !== displayTitle) ? (
              <p className="text-sm md:text-base text-zinc-400 font-medium mb-5">
                {details.title}
              </p>
            ) : null}

            {/* Ratings & Metadata Pill Cluster */}
            <div className="flex items-center flex-wrap gap-2 mb-5">
              {details.ratingRezka && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full btn-ember text-xs font-display font-black tabular-nums">
                  <span>HDRezka</span>
                  <span>{details.ratingRezka.toFixed(1)}</span>
                </span>
              )}
              {details.ratingImdb && (
                <span className="logo-pill inline-flex items-center gap-1 px-3 py-1 rounded-full text-brand-gold text-xs font-extrabold tabular-nums">
                  <Star className="w-3.5 h-3.5 fill-brand-gold" aria-hidden="true" />
                  <span>IMDb {details.ratingImdb.toFixed(1)}</span>
                </span>
              )}
              {details.ratingKp && (
                <span className="logo-pill inline-flex items-center px-3 py-1 rounded-full text-brand-orange text-xs font-extrabold tabular-nums">
                  <span>{t.details.kpRating} {details.ratingKp.toFixed(1)}</span>
                </span>
              )}
              {details.year && (
                <span className="logo-pill px-3 py-1 rounded-full text-zinc-200 text-xs font-bold tabular-nums">
                  {details.year}
                </span>
              )}
              {details.country && (
                <span className="logo-pill px-3 py-1 rounded-full text-zinc-300 text-xs font-semibold">
                  {details.country}
                </span>
              )}
              {details.duration && (
                <span className="logo-pill px-3 py-1 rounded-full text-zinc-300 text-xs font-semibold inline-flex items-center gap-1">
                  <Clock className="w-3 h-3 text-brand-orange" aria-hidden="true" />
                  <span>{details.duration}</span>
                </span>
              )}
              {resolvedAgeRating && (
                <span
                  className={`px-2.5 py-1 rounded-full text-[11px] font-display font-black tabular-nums ${getAgeRatingBadgeClass(
                    resolvedAgeRating
                  )}`}
                  title={`${t.details.ageRating}: ${resolvedAgeRating}`}
                >
                  {resolvedAgeRating}
                </span>
              )}
            </div>

            {/* Genres */}
            {details.genres && details.genres.length > 0 && (
              <div className="flex items-center flex-wrap gap-1.5 mb-7">
                {details.genres.map((g, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.08] text-[11px] font-semibold text-zinc-300"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center flex-wrap gap-3 mb-5">
              <button
                type="button"
                onClick={() => handleWatch()}
                className="flex items-center gap-2.5 px-7 py-3.5 rounded-full btn-ember text-white font-display font-black text-xs uppercase tracking-wider active:scale-95 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-white" aria-hidden="true" />
                <span>
                  {resumableTime > 0
                    ? isSeriesLike && lastWatch?.season && lastWatch?.episode
                      ? `${t.history.resume} · С${lastWatch.season} Э${lastWatch.episode} (${formatDuration(resumableTime)})`
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
                title="Найти альтернативу в Google"
              >
                <Globe className="w-4 h-4 text-brand-orange" aria-hidden="true" />
                <span>Найти в сети</span>
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
      </section>

      {/* Voice Acting / Translators Selector */}
      {details.translators && details.translators.length > 0 && (
        <section className="mb-8 p-6 rounded-3xl cinema-panel">
          <h2 className="font-display text-sm font-black text-white uppercase tracking-wider mb-4 flex items-center gap-2.5">
            <span
              className="w-1.5 h-4 rounded-full"
              style={{ background: 'linear-gradient(180deg, #FF124F 0%, #FF7A00 100%)' }}
            />
            <Mic2 className="w-4 h-4 text-brand-orange" aria-hidden="true" />
            <span>{t.details.audioTranslation}</span>
            {details.translators.length > 1 && (
              <span className="px-2 py-0.5 rounded-full bg-white/[0.08] text-[11px] font-mono font-bold text-zinc-300 tabular-nums">
                {details.translators.length}
              </span>
            )}
          </h2>
          <HorizontalSlider
            ariaLabel={t.details.audioTranslation}
            itemCount={details.translators.length}
            trackClassName="flex items-center gap-2"
          >
            {details.translators.map((tr) => {
              const isActive = selectedTranslatorId === tr.id;
              return (
                <button
                  key={tr.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => handleTranslatorChange(tr.id)}
                  className={`flex-shrink-0 whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold cursor-pointer ${
                    isActive
                      ? 'btn-ember text-white'
                      : 'bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 hover:text-white border border-white/[0.08]'
                  }`}
                >
                  {tr.name}
                  {tr.camrip && <span className="ml-1.5 text-[10px] text-amber-300 font-semibold">(CamRip)</span>}
                </button>
              );
            })}
          </HorizontalSlider>
        </section>
      )}

      {/* Seasons & Episodes Grid / Slider */}
      {isSeriesLike && seasons.length > 0 && (
        <section className="mb-8 p-6 rounded-3xl cinema-panel">
          <div className="mb-5 pb-4 border-b border-white/[0.06] space-y-3.5">
            <h2 className="font-display text-sm font-black text-white uppercase tracking-wider flex items-center gap-2.5">
              <span
                className="w-1.5 h-4 rounded-full"
                style={{ background: 'linear-gradient(180deg, #FF124F 0%, #FF7A00 100%)' }}
              />
              <Tv className="w-4 h-4 text-brand-orange" aria-hidden="true" />
              <span>{t.details.seasonsAndEpisodes}</span>
              {currentSeason?.episodes?.length ? (
                <span className="px-2 py-0.5 rounded-full bg-white/[0.08] text-[11px] font-mono font-bold text-zinc-300 tabular-nums">
                  {currentSeason.episodes.length}
                </span>
              ) : null}
            </h2>

            <HorizontalSlider
              ariaLabel={t.details.season}
              compact
              itemCount={seasons.length}
              className="w-full"
              trackClassName="flex items-center gap-1.5"
            >
              {seasons.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={selectedSeasonId === s.id}
                  onClick={() => setSelectedSeasonId(s.id)}
                  className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap cursor-pointer ${
                    selectedSeasonId === s.id
                      ? 'btn-ember text-white'
                      : 'bg-white/[0.05] text-zinc-400 hover:text-white hover:bg-white/[0.1]'
                  }`}
                >
                  {s.title || `${t.details.season} ${s.id}`}
                </button>
              ))}
            </HorizontalSlider>
          </div>

          {loadingEpisodes ? (
            <div className="py-10 text-center text-xs text-zinc-400 animate-pulse font-semibold">
              {t.details.loadingEpisodes}
            </div>
          ) : currentSeason && currentSeason.episodes?.length > 0 ? (
            currentSeason.episodes.length > 16 ? (
              <HorizontalSlider
                ariaLabel={t.details.seasonsAndEpisodes}
                itemCount={currentSeason.episodes.length}
                trackClassName="grid grid-rows-2 grid-flow-col auto-cols-[124px] gap-2.5"
              >
                {currentSeason.episodes.map((ep) => (
                  <button
                    key={ep.id}
                    type="button"
                    onClick={() => handleWatch(currentSeason.id, ep.episodeId)}
                    className="flex flex-col items-center justify-center p-3.5 rounded-2xl bg-white/[0.04] hover:bg-gradient-to-br hover:from-brand-crimson hover:to-brand-orange border border-white/[0.07] hover:border-white/25 text-zinc-200 hover:text-white text-xs font-bold group active:scale-95 cursor-pointer"
                  >
                    <span className="text-[10px] text-zinc-400 group-hover:text-white/85 uppercase font-mono">
                      {t.details.episode} {ep.episodeId}
                    </span>
                    <span className="truncate w-full text-center mt-1 text-white group-hover:text-white">
                      {ep.title || `${t.details.episode} ${ep.episodeId}`}
                    </span>
                  </button>
                ))}
              </HorizontalSlider>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5">
                {currentSeason.episodes.map((ep) => (
                  <button
                    key={ep.id}
                    type="button"
                    onClick={() => handleWatch(currentSeason.id, ep.episodeId)}
                    className="flex flex-col items-center justify-center p-3.5 rounded-2xl bg-white/[0.04] hover:bg-gradient-to-br hover:from-brand-crimson hover:to-brand-orange border border-white/[0.07] hover:border-white/25 text-zinc-200 hover:text-white text-xs font-bold group active:scale-95 cursor-pointer"
                  >
                    <span className="text-[10px] text-zinc-400 group-hover:text-white/85 uppercase font-mono">
                      {t.details.episode} {ep.episodeId}
                    </span>
                    <span className="truncate w-full text-center mt-1 text-white group-hover:text-white">
                      {ep.title || `${t.details.episode} ${ep.episodeId}`}
                    </span>
                  </button>
                ))}
              </div>
            )
          ) : (
            <div className="py-8 text-center text-xs text-zinc-500">{t.details.noEpisodes}</div>
          )}
        </section>
      )}

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
            {details.description || 'Описание временно недоступно.'}
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
              <span>Комментарии и рецензии критиков</span>
            </h2>

            <div className="flex items-center flex-wrap gap-1.5 bg-black/40 p-1 rounded-full border border-white/[0.08]">
              {([
                { id: 'all', label: `Все (${details.reviews.length})` },
                ...(details.reviews.some((r) => r.source === 'Кинопоиск')
                  ? [{ id: 'kinopoisk' as const, label: `Кинопоиск (${details.reviews.filter((r) => r.source === 'Кинопоиск').length})` }]
                  : []),
                { id: 'critic', label: `Критики (${details.reviews.filter((r) => r.type === 'critic').length})` },
                { id: 'user', label: `Зрители (${details.reviews.filter((r) => r.type === 'user').length})` },
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
                          {isCritic ? 'Критик' : 'Зритель'}
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
