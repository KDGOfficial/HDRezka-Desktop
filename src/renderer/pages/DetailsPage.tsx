import React, { useState, useEffect } from 'react';
import {
  Play,
  Heart,
  Plus,
  Share2,
  CheckCircle2,
  Star,
  Clock,
  Calendar,
  Globe,
  Film,
  User,
  Tv,
  AlertCircle,
} from 'lucide-react';
import { MediaDetails, Season, MediaItem } from '../../shared/types';
import { useMediaStore } from '../stores/useMediaStore';
import { usePlayerStore } from '../stores/usePlayerStore';
import { MediaSlider } from '../components/MediaSlider';
import { getRatingColor } from '../../shared/utils';
import { useTranslation } from '../i18n';

export const DetailsPage: React.FC = () => {
  const { selectedMediaId, selectedMediaDetails, favorites, toggleFavorite, openCollectionModal } = useMediaStore();
  const { openPlayer } = usePlayerStore();
  const { t } = useTranslation();

  const [details, setDetails] = useState<MediaDetails | null>(selectedMediaDetails);
  const [loading, setLoading] = useState<boolean>(!selectedMediaDetails);
  const [selectedTranslatorId, setSelectedTranslatorId] = useState<number>(selectedMediaDetails?.currentTranslatorId || 56);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number>(1);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);

  useEffect(() => {
    if (selectedMediaId) {
      if (selectedMediaDetails) {
        setDetails(selectedMediaDetails);
        setSeasons(selectedMediaDetails.seasons || []);
        if (selectedMediaDetails.translators && selectedMediaDetails.translators.length > 0) {
          setSelectedTranslatorId(selectedMediaDetails.currentTranslatorId || selectedMediaDetails.translators[0].id);
        }
      }
      loadMediaDetails(selectedMediaId);
    }
  }, [selectedMediaId]);

  const loadMediaDetails = async (idOrUrl: string) => {
    if (!window.api) return;
    if (!details && !selectedMediaDetails) {
      setLoading(true);
    }
    try {
      const data = await window.api.getDetails(idOrUrl, selectedMediaDetails || undefined);
      setDetails(data);
      if (data.translators && data.translators.length > 0) {
        setSelectedTranslatorId(data.currentTranslatorId || data.translators[0].id);
      }
      if (data.seasons && data.seasons.length > 0) {
        setSeasons(data.seasons);
        setSelectedSeasonId(data.seasons[0].id);
      } else {
        setSeasons([]);
      }
    } catch (err) {
      console.error('Failed to load details:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTranslatorChange = async (trId: number) => {
    setSelectedTranslatorId(trId);
    if ((details?.type === 'series' || details?.type === 'animation' || details?.type === 'cartoons') && window.api) {
      setLoadingEpisodes(true);
      try {
        const newSeasons = await window.api.getSeriesEpisodes(details.id, trId);
        setSeasons(newSeasons || []);
        if (newSeasons && newSeasons.length > 0) {
          setSelectedSeasonId(newSeasons[0].id);
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
    const isSeriesLike = details.type === 'series' || details.type === 'animation' || (seasons && seasons.length > 0);
    const effectiveTranslatorId = (typeof selectedTranslatorId === 'number')
      ? selectedTranslatorId
      : (details.translators?.[0]?.id ?? details.currentTranslatorId ?? 0);
    openPlayer({
      details,
      translatorId: effectiveTranslatorId,
      seasonId: isSeriesLike ? seasonId || selectedSeasonId : undefined,
      episodeId: isSeriesLike ? episodeId || 1 : undefined,
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
    if (window.api) {
      await window.api.verifyMirror(details?.url || details?.id);
      if (selectedMediaId) {
        loadMediaDetails(selectedMediaId);
      }
    }
  };

  if (loading && !details) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[500px]">
        <div className="w-12 h-12 border-4 border-brand-red/20 border-t-brand-red rounded-full animate-spin mb-4" />
        <span className="text-zinc-400 text-xs font-semibold">{t.home.loadingCatalog}</span>
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
      {/* Backdrop Header */}
      <div className="relative w-full rounded-3xl overflow-hidden mb-8 border border-white/10 shadow-elevated bg-[#0e0f16]">
        {/* Backdrop Image */}
        {(details.backdrop || details.poster) && (
          <img
            src={details.backdrop || details.poster}
            alt={details.title}
            className="absolute inset-0 w-full h-full object-cover filter brightness-[0.35] blur-sm scale-105"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#08080c] via-[#08080c]/80 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#08080c] via-transparent to-transparent w-2/3" />

        {/* Content Container */}
        <div className="relative z-10 p-6 md:p-10 flex flex-col md:flex-row gap-8 items-start">
          {/* Left: Poster */}
          <div className="w-52 md:w-64 flex-shrink-0 rounded-2xl overflow-hidden border border-white/10 shadow-glow group relative">
            <img
              src={details.poster}
              alt={details.title}
              className="w-full h-auto object-cover group-hover:scale-105 transition-transform duration-500"
            />
          </div>

          {/* Right: Info */}
          <div className="flex-1 min-w-0">
            {/* Title */}
            <h1 className="text-2xl md:text-4xl font-black text-white tracking-tight mb-1.5 drop-shadow">
              {details.title}
            </h1>
            {details.origTitle && (
              <p className="text-sm md:text-base text-zinc-400 font-medium italic mb-4">
                {details.origTitle}
              </p>
            )}

            {/* Badges Cluster */}
            <div className="flex items-center flex-wrap gap-2 mb-5">
              {details.ratingRezka && (
                <span className="flex items-center px-2.5 py-1 rounded-xl bg-brand-red/20 border border-brand-red/40 text-brand-red text-xs font-black shadow-glow-sm">
                  <span className="mr-1">HDRezka</span>
                  <span>{details.ratingRezka.toFixed(1)}</span>
                </span>
              )}
              {details.ratingImdb && (
                <span className="flex items-center px-2.5 py-1 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-400 text-xs font-black">
                  <Star className="w-3.5 h-3.5 fill-amber-400 mr-1" />
                  <span>IMDb {details.ratingImdb.toFixed(1)}</span>
                </span>
              )}
              {details.ratingKp && (
                <span className="flex items-center px-2.5 py-1 rounded-xl bg-orange-950/40 border border-orange-500/30 text-orange-400 text-xs font-black">
                  <span>{t.details.kpRating} {details.ratingKp.toFixed(1)}</span>
                </span>
              )}
              {details.year && (
                <span className="px-2.5 py-1 rounded-xl bg-white/5 border border-white/10 text-zinc-300 text-xs font-bold">
                  {details.year}
                </span>
              )}
              {details.country && (
                <span className="px-2.5 py-1 rounded-xl bg-white/5 border border-white/10 text-zinc-300 text-xs font-medium">
                  {details.country}
                </span>
              )}
              {details.duration && (
                <span className="px-2.5 py-1 rounded-xl bg-white/5 border border-white/10 text-zinc-300 text-xs font-medium flex items-center">
                  <Clock className="w-3 h-3 mr-1 text-zinc-400" />
                  <span>{details.duration}</span>
                </span>
              )}
              {details.ageRating && (
                <span className="px-2 py-0.5 rounded-lg bg-zinc-800 text-zinc-400 text-[11px] font-bold">
                  {details.ageRating}
                </span>
              )}
            </div>

            {/* Genres Chips */}
            {details.genres && details.genres.length > 0 && (
              <div className="flex items-center flex-wrap gap-1.5 mb-6">
                {details.genres.map((g, idx) => (
                  <span
                    key={idx}
                    className="px-2.5 py-0.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-[11px] font-semibold text-zinc-400"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center space-x-3 mb-6 flex-wrap gap-y-2">
              <button
                onClick={() => handleWatch()}
                className="flex items-center space-x-2.5 px-6 py-3 rounded-2xl bg-gradient-to-r from-brand-red via-brand-red to-orange-600 hover:from-brand-redHover hover:to-orange-500 text-white font-black text-xs shadow-glow transition-all active:scale-95"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>{t.details.watch}</span>
              </button>

              <button
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
                className={`flex items-center space-x-2 px-4 py-3 rounded-2xl border transition-all active:scale-95 text-xs font-bold ${
                  isFav
                    ? 'bg-brand-red/15 border-brand-red/50 text-brand-red'
                    : 'bg-white/5 hover:bg-white/10 border-white/10 text-zinc-300'
                }`}
              >
                <Heart className={`w-4 h-4 ${isFav ? 'fill-brand-red' : ''}`} />
                <span>{isFav ? t.details.inFavorites : t.details.addToFavorites}</span>
              </button>

              <button
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
                className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 transition-all active:scale-95"
                title={t.details.addToCollection}
              >
                <Plus className="w-4 h-4" />
              </button>

              <button
                onClick={handleCopyLink}
                className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 transition-all active:scale-95"
                title={isCopied ? t.details.linkCopied : t.details.copyLink}
              >
                {isCopied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
              </button>
            </div>

            {/* Anti-bot notice if mirror was challenged */}
            {details.antiBot && (
              <div className="p-3.5 rounded-2xl bg-amber-950/30 border border-amber-500/30 flex items-center justify-between text-xs text-amber-300 mb-4 max-w-xl">
                <div className="flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-400" />
                  <span>{t.details.antiBotWarning}</span>
                </div>
                <button
                  onClick={handleVerifyMirror}
                  className="px-3 py-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-bold border border-amber-500/40 text-xs transition-colors flex-shrink-0 ml-3"
                >
                  {t.details.passVerification}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Voice Acting / Translators Selector */}
      {details.translators && details.translators.length > 0 && (
        <div className="mb-8 p-6 rounded-3xl bg-[#12131a] border border-white/5 shadow-card">
          <h2 className="text-sm font-black text-white uppercase tracking-wider mb-3.5 flex items-center space-x-2">
            <span className="w-1.5 h-3.5 rounded-full bg-brand-red" />
            <span>{t.details.audioTranslation}</span>
          </h2>
          <div className="flex items-center flex-wrap gap-2">
            {details.translators.map((tr) => {
              const isActive = selectedTranslatorId === tr.id;
              return (
                <button
                  key={tr.id}
                  onClick={() => handleTranslatorChange(tr.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-brand-red to-orange-600 text-white shadow-glow'
                      : 'bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white border border-white/5'
                  }`}
                >
                  {tr.name}
                  {tr.camrip && <span className="ml-1 text-[10px] text-amber-400 font-normal">(CamRip)</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Seasons & Episodes Grid (for Series / Animation) */}
      {isSeriesLike && seasons.length > 0 && (
        <div className="mb-8 p-6 rounded-3xl bg-[#12131a] border border-white/5 shadow-card">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/5">
            <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center space-x-2">
              <span className="w-1.5 h-3.5 rounded-full bg-brand-red" />
              <span>{t.details.seasonsAndEpisodes}</span>
            </h2>

            {/* Season tabs */}
            <div className="flex items-center space-x-1.5 overflow-x-auto">
              {seasons.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSeasonId(s.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    selectedSeasonId === s.id
                      ? 'bg-brand-red text-white shadow-glow-sm'
                      : 'bg-white/5 text-zinc-400 hover:text-white'
                  }`}
                >
                  {s.title || `${t.details.season} ${s.id}`}
                </button>
              ))}
            </div>
          </div>

          {/* Episodes */}
          {loadingEpisodes ? (
            <div className="py-8 text-center text-xs text-zinc-500 animate-pulse">
              {t.details.loadingEpisodes}
            </div>
          ) : currentSeason && currentSeason.episodes?.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5">
              {currentSeason.episodes.map((ep) => (
                <button
                  key={ep.id}
                  onClick={() => handleWatch(selectedSeasonId, ep.episodeId)}
                  className="flex flex-col items-center justify-center p-3 rounded-2xl bg-white/5 hover:bg-brand-red hover:text-white border border-white/5 hover:border-brand-red text-zinc-300 text-xs font-bold transition-all group active:scale-95 shadow-sm"
                >
                  <span className="text-[10px] text-zinc-500 group-hover:text-white/80 uppercase font-mono">
                    {t.details.episode} {ep.episodeId}
                  </span>
                  <span className="truncate w-full text-center mt-1 text-white">
                    {ep.title || `${t.details.episode} ${ep.episodeId}`}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-zinc-500">
              {t.details.noEpisodes}
            </div>
          )}
        </div>
      )}

      {/* Description & Details Info */}
      <div className="mb-10 grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Description */}
        <div className="md:col-span-2 p-6 rounded-3xl bg-[#12131a] border border-white/5 shadow-card">
          <h2 className="text-sm font-black text-white uppercase tracking-wider mb-3 flex items-center space-x-2">
            <span className="w-1.5 h-3.5 rounded-full bg-brand-red" />
            <span>{t.details.description}</span>
          </h2>
          <p className="text-xs md:text-sm text-zinc-300 leading-relaxed font-normal whitespace-pre-line">
            {details.description || 'Описание временно недоступно.'}
          </p>
        </div>

        {/* Cast & Crew */}
        <div className="p-6 rounded-3xl bg-[#12131a] border border-white/5 shadow-card space-y-4">
          {details.directors && details.directors.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
                <User className="w-3.5 h-3.5" />
                <span>{t.details.director}</span>
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {details.directors.map((d, i) => (
                  <span key={i} className="text-xs text-zinc-300 font-semibold">
                    {d}{i < details.directors.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </div>
            </div>
          )}

          {details.actors && details.actors.length > 0 && (
            <div className="pt-2 border-t border-white/5">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
                <Film className="w-3.5 h-3.5" />
                <span>{t.details.cast}</span>
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {details.actors.slice(0, 10).map((a, i) => (
                  <span key={i} className="text-xs text-zinc-300">
                    {a}{i < Math.min(details.actors.length, 10) - 1 ? ', ' : ''}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Similar Titles Slider */}
      {details.similar && details.similar.length > 0 && (
        <MediaSlider title={t.details.similar} items={details.similar} />
      )}
    </div>
  );
};
