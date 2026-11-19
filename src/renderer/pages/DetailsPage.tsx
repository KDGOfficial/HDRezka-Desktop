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
} from 'lucide-react';
import { MediaDetails, Season, MediaItem } from '../../shared/types';
import { useMediaStore } from '../stores/useMediaStore';
import { usePlayerStore } from '../stores/usePlayerStore';
import { MediaSlider } from '../components/MediaSlider';
import { getRatingColor } from '../../shared/utils';

export const DetailsPage: React.FC = () => {
  const { selectedMediaId, favorites, toggleFavorite, openCollectionModal } = useMediaStore();
  const { openPlayer } = usePlayerStore();

  const [details, setDetails] = useState<MediaDetails | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedTranslatorId, setSelectedTranslatorId] = useState<number>(0);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number>(1);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isWatched, setIsWatched] = useState<boolean>(false);

  useEffect(() => {
    if (selectedMediaId) {
      loadMediaDetails(selectedMediaId);
    }
  }, [selectedMediaId]);

  const loadMediaDetails = async (idOrUrl: string) => {
    if (!window.api) return;
    setLoading(true);
    try {
      const data = await window.api.getDetails(idOrUrl);
      setDetails(data);
      if (data.translators && data.translators.length > 0) {
        setSelectedTranslatorId(data.translators[0].id);
      }
      if (data.seasons && data.seasons.length > 0) {
        setSeasons(data.seasons);
        setSelectedSeasonId(data.seasons[0].id);
      }
    } catch (err) {
      console.error('Failed to load details:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTranslatorChange = async (trId: number) => {
    setSelectedTranslatorId(trId);
    if (details?.type === 'series' && window.api) {
      setLoadingEpisodes(true);
      try {
        const newSeasons = await window.api.getSeriesEpisodes(details.id, trId);
        setSeasons(newSeasons);
        if (newSeasons.length > 0) {
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
    openPlayer({
      details,
      translatorId: selectedTranslatorId || details.translators[0]?.id || 56,
      seasonId: details.type === 'series' ? seasonId || selectedSeasonId : undefined,
      episodeId: details.type === 'series' ? episodeId || 1 : undefined,
    });
  };

  const handleShare = () => {
    if (details) {
      navigator.clipboard.writeText(`https://hdrezka.ag/${details.id}`);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleMarkWatched = () => {
    if (details && window.api) {
      window.api.saveWatchHistory({
        id: `${details.id}_0_0`,
        mediaId: details.id,
        title: details.title,
        origTitle: details.origTitle,
        poster: details.poster,
        type: details.type,
        currentTime: 100,
        duration: 100,
        percent: 100,
        lastWatchedAt: Date.now(),
      });
      setIsWatched(true);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[500px]">
        <div className="w-12 h-12 border-4 border-brand-red border-t-transparent rounded-full animate-spin mb-4" />
        <span className="text-zinc-400 text-sm">Загрузка информации о фильме...</span>
      </div>
    );
  }

  if (!details) {
    return (
      <div className="text-center py-24 text-zinc-500">
        <p className="text-lg font-bold">Информация не найдена</p>
      </div>
    );
  }

  const isFav = favorites.some((f) => f.mediaId === details.id);
  const currentSeason = seasons.find((s) => s.id === selectedSeasonId) || seasons[0];

  const asMediaItem: MediaItem = {
    id: details.id,
    title: details.title,
    origTitle: details.origTitle,
    poster: details.poster,
    type: details.type,
    year: details.year,
    rating: details.ratingRezka,
    url: details.id,
  };

  return (
    <div className="w-full pb-16 select-none text-left">
      {/* Backdrop & Header banner */}
      <div className="relative w-full h-[360px] md:h-[420px] rounded-3xl overflow-hidden mb-8 border border-white/10 shadow-2xl">
        <img
          src={details.backdrop || details.poster}
          alt={details.title}
          className="absolute inset-0 w-full h-full object-cover object-center filter blur-md brightness-40 scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-dark-bg via-dark-bg/60 to-transparent" />

        {/* Content in Backdrop */}
        <div className="relative h-full flex items-end p-8 md:p-12 z-10 space-x-8">
          {/* Poster */}
          <div className="hidden sm:block w-48 md:w-56 h-72 md:h-80 flex-shrink-0 rounded-2xl overflow-hidden shadow-card border border-white/10 -mb-16 z-20 bg-dark-surface">
            <img src={details.poster} alt={details.title} className="w-full h-full object-cover" />
          </div>

          {/* Title & Info */}
          <div className="flex-1 space-y-3 pb-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-md bg-brand-red text-white text-xs font-bold uppercase shadow-glow">
                {details.type === 'series' ? 'Сериал' : 'Фильм'}
              </span>
              {details.ratingRezka && (
                <span className={`px-2.5 py-0.5 rounded-md text-xs font-bold flex items-center ${getRatingColor(details.ratingRezka)}`}>
                  <Star className="w-3.5 h-3.5 fill-current mr-1" />
                  {details.ratingRezka.toFixed(1)} Rezka
                </span>
              )}
              {details.ratingImdb && (
                <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-amber-950/50 text-amber-300 border border-amber-500/20">
                  {details.ratingImdb.toFixed(1)} IMDb
                </span>
              )}
              {details.ratingKp && (
                <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-orange-950/50 text-orange-300 border border-orange-500/20">
                  {details.ratingKp.toFixed(1)} Кинопоиск
                </span>
              )}
            </div>

            <h1 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight leading-tight">
              {details.title}
            </h1>
            {details.origTitle && (
              <h2 className="text-sm md:text-base font-medium text-zinc-400">
                {details.origTitle}
              </h2>
            )}

            {/* Quick meta row */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-300 pt-1">
              {details.year > 0 && (
                <span className="flex items-center space-x-1">
                  <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                  <span>{details.year}</span>
                </span>
              )}
              {details.country && (
                <span className="flex items-center space-x-1">
                  <Globe className="w-3.5 h-3.5 text-zinc-500" />
                  <span>{details.country}</span>
                </span>
              )}
              {details.duration && (
                <span className="flex items-center space-x-1">
                  <Clock className="w-3.5 h-3.5 text-zinc-500" />
                  <span>{details.duration}</span>
                </span>
              )}
              {details.genres.length > 0 && (
                <span className="text-zinc-400">
                  {details.genres.join(', ')}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons bar */}
      <div className="flex flex-wrap items-center gap-3 mb-8 sm:pl-64">
        <button
          onClick={() => handleWatch()}
          className="flex items-center space-x-2 px-6 py-3 rounded-xl bg-brand-red hover:bg-brand-redHover text-white font-bold text-sm shadow-glow transition-all active:scale-95"
        >
          <Play className="w-4 h-4 fill-white" />
          <span>Смотреть онлайн</span>
        </button>

        <button
          onClick={() => toggleFavorite(asMediaItem)}
          className={`flex items-center space-x-2 px-4 py-3 rounded-xl border transition-all text-sm font-semibold ${
            isFav
              ? 'bg-brand-redMuted border-brand-red/50 text-brand-red'
              : 'bg-dark-surface border-white/10 hover:border-white/20 text-zinc-300'
          }`}
        >
          <Heart className={`w-4 h-4 ${isFav ? 'fill-brand-red' : ''}`} />
          <span>{isFav ? 'В избранном' : 'В избранное'}</span>
        </button>

        <button
          onClick={() => openCollectionModal(asMediaItem)}
          className="flex items-center space-x-2 px-4 py-3 rounded-xl bg-dark-surface border border-white/10 hover:border-white/20 text-zinc-300 text-sm font-semibold transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>В коллекцию</span>
        </button>

        <button
          onClick={handleMarkWatched}
          className={`flex items-center space-x-2 px-4 py-3 rounded-xl border text-sm font-semibold transition-all ${
            isWatched
              ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400'
              : 'bg-dark-surface border-white/10 hover:border-white/20 text-zinc-300'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>{isWatched ? 'Просмотрено' : 'Отметить'}</span>
        </button>

        <button
          onClick={handleShare}
          className="p-3 rounded-xl bg-dark-surface border border-white/10 hover:border-white/20 text-zinc-300 transition-all"
          title="Скопировать ссылку"
        >
          <Share2 className="w-4 h-4" />
        </button>
        {isCopied && <span className="text-xs text-emerald-400 font-medium">Ссылка скопирована!</span>}
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
        {/* Left Column: Description & Seasons / Translators */}
        <div className="lg:col-span-2 space-y-8">
          {/* Translators Section */}
          {details.translators.length > 0 && (
            <div className="bg-dark-surface border border-white/5 rounded-2xl p-5 shadow-card">
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-3">
                Озвучка и перевод
              </h3>
              <div className="flex flex-wrap gap-2">
                {details.translators.map((tr) => (
                  <button
                    key={tr.id}
                    onClick={() => handleTranslatorChange(tr.id)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center space-x-1.5 ${
                      selectedTranslatorId === tr.id
                        ? 'bg-brand-red text-white shadow-glow'
                        : 'bg-dark-surfaceLight text-zinc-300 hover:bg-dark-surfaceHover'
                    }`}
                  >
                    <span>{tr.name}</span>
                    {tr.premium && <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1 rounded">PRO</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Series: Seasons and Episodes selector */}
          {details.type === 'series' && seasons.length > 0 && (
            <div className="bg-dark-surface border border-white/5 rounded-2xl p-5 shadow-card space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">
                  Сезоны и серии
                </h3>
                {loadingEpisodes && (
                  <span className="text-xs text-zinc-500 animate-pulse">Обновление серий...</span>
                )}
              </div>

              {/* Seasons tabs */}
              <div className="flex items-center space-x-2 overflow-x-auto pb-1">
                {seasons.map((season) => (
                  <button
                    key={season.id}
                    onClick={() => setSelectedSeasonId(season.id)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                      selectedSeasonId === season.id
                        ? 'bg-brand-red text-white shadow-glow'
                        : 'bg-dark-surfaceLight text-zinc-400 hover:text-white'
                    }`}
                  >
                    {season.title}
                  </button>
                ))}
              </div>

              {/* Episodes grid */}
              {currentSeason && (
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 pt-2">
                  {currentSeason.episodes.map((ep) => (
                    <button
                      key={ep.episodeId}
                      onClick={() => handleWatch(currentSeason.id, ep.episodeId)}
                      className="group p-3 rounded-xl bg-dark-surfaceLight hover:bg-brand-red hover:shadow-glow text-left transition-all border border-white/5"
                    >
                      <div className="text-xs font-bold text-white group-hover:text-white">
                        {ep.episodeId} серия
                      </div>
                      <div className="text-[10px] text-zinc-400 group-hover:text-white/80 truncate">
                        {ep.title}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Description */}
          <div className="bg-dark-surface border border-white/5 rounded-2xl p-6 shadow-card space-y-3">
            <h3 className="text-base font-bold text-white">Описание</h3>
            <p className="text-sm text-zinc-300 leading-relaxed font-normal">
              {details.description || 'Описание временно отсутствует.'}
            </p>
          </div>
        </div>

        {/* Right Column: Cast & Directors Info */}
        <div className="space-y-6">
          <div className="bg-dark-surface border border-white/5 rounded-2xl p-6 shadow-card space-y-4">
            <h3 className="text-base font-bold text-white pb-2 border-b border-white/5">
              О фильме
            </h3>

            {details.directors.length > 0 && (
              <div className="space-y-1">
                <span className="text-xs text-zinc-500 font-semibold uppercase">Режиссёр</span>
                <p className="text-sm font-medium text-zinc-300">{details.directors.join(', ')}</p>
              </div>
            )}

            {details.actors.length > 0 && (
              <div className="space-y-1">
                <span className="text-xs text-zinc-500 font-semibold uppercase">В главных ролях</span>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {details.actors.map((actor, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-lg bg-dark-surfaceLight text-xs text-zinc-300 font-medium"
                    >
                      {actor}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {details.ageRating && (
              <div className="space-y-1">
                <span className="text-xs text-zinc-500 font-semibold uppercase">Возраст</span>
                <p className="text-sm font-medium text-zinc-300">{details.ageRating}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Similar Movies */}
      {details.similar.length > 0 && (
        <MediaSlider title="Похожие фильмы и сериалы" items={details.similar} />
      )}
    </div>
  );
};
