import React, { useState, useEffect } from 'react';
import {
  X,
  Play,
  Heart,
  Bookmark,
  Check,
  Share2,
  Star,
  Clock,
  Calendar,
  Globe,
  Film,
  User,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { MediaItem, MediaDetails, Season, Episode } from '../../types/media';
import { useNavigationStore } from '../../stores/navigationStore';
import { usePlayerStore } from '../../stores/playerStore';
import { useNotificationStore } from '../../stores/notificationStore';
import {
  getMediaDetails,
  isFavorite,
  toggleFavorite,
  saveProgress,
  getWatchHistory
} from '../../services/api';
import { MediaCard } from '../cards/MediaCard';

interface MediaDetailsModalProps {
  media: MediaItem;
  onClose: () => void;
}

export const MediaDetailsModal: React.FC<MediaDetailsModalProps> = ({ media, onClose }) => {
  const [details, setDetails] = useState<MediaDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [favorite, setFavorite] = useState(false);
  const [isWatched, setIsWatched] = useState(false);
  const [selectedSeasonNum, setSelectedSeasonNum] = useState<number>(1);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  const { startPlayback } = useNavigationStore();
  const { initPlayer } = usePlayerStore();
  const { notify } = useNotificationStore();

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);

    getMediaDetails(media.id, media.url).then((res) => {
      if (mounted) {
        setDetails(res);
        setIsLoading(false);
      }
    });

    isFavorite(media.id).then((fav) => {
      if (mounted) setFavorite(fav);
    });

    getWatchHistory().then((hist) => {
      const found = hist.find((h) => h.mediaId === media.id);
      if (mounted && found?.completed) {
        setIsWatched(true);
      }
    });

    return () => {
      mounted = false;
    };
  }, [media.id, media.url]);

  const handlePlay = (season?: number, episode?: number) => {
    if (!details) return;
    initPlayer(media, details, season ?? 1, episode ?? 1);
    startPlayback(media, season, episode);
    onClose();
  };

  const handleFavoriteToggle = async () => {
    const next = await toggleFavorite(media);
    setFavorite(next);
    notify({
      type: next ? 'success' : 'info',
      title: next ? 'Добавлено в избранное' : 'Удалено из избранного',
      message: media.title,
    });
  };

  const handleMarkWatched = async () => {
    const next = !isWatched;
    setIsWatched(next);
    await saveProgress(
      media.id,
      media.title,
      media.poster,
      media.type,
      next ? 7200 : 0,
      7200,
      1,
      1,
      'Просмотрено'
    );
    notify({
      type: 'success',
      title: next ? 'Отмечено просмотренным' : 'Снята отметка просмотра',
      message: media.title,
    });
  };

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      notify({
        type: 'info',
        title: 'Ссылка скопирована',
        message: 'Ссылка на контент скопирована в буфер обмена.',
      });
    }
  };

  const currentSeason = details?.seasons?.find((s) => s.seasonNumber === selectedSeasonNum);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/85 backdrop-blur-md overflow-y-auto no-scrollbar">
      <div className="relative w-full max-w-5xl bg-[#17181D] border border-[#292B32] rounded-3xl overflow-hidden shadow-2xl my-auto animate-fade-in flex flex-col max-h-[92vh]">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-30 p-2.5 rounded-full bg-black/60 hover:bg-black/90 text-white backdrop-blur-md border border-white/10 transition-all cursor-pointer hover:scale-105"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Scrollable Modal Content */}
        <div className="overflow-y-auto flex-1 no-scrollbar">
          {/* Backdrop Header */}
          <div className="relative w-full h-80 md:h-96">
            <img
              src={details?.backdrop || media.backdrop || media.poster}
              alt={media.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#17181D] via-[#17181D]/60 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#17181D] via-transparent to-transparent" />

            {/* Poster & Main Meta inside Header */}
            <div className="absolute bottom-6 left-6 right-6 flex items-end space-x-6">
              <div className="hidden sm:block w-40 h-60 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/10 shrink-0">
                <img
                  src={media.poster}
                  alt={media.title}
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {media.rating && (
                    <div className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-amber-500/20 border border-amber-500/30 text-amber-400 font-bold text-xs">
                      <Star className="w-3.5 h-3.5 fill-current" />
                      <span>{media.rating.toFixed(1)}</span>
                    </div>
                  )}
                  <span className="px-2 py-0.5 rounded bg-white/10 text-zinc-300 text-xs font-semibold">
                    {media.year}
                  </span>
                  {details?.duration && (
                    <span className="flex items-center space-x-1 text-xs text-zinc-300 px-2 py-0.5 rounded bg-white/10">
                      <Clock className="w-3 h-3" />
                      <span>{details.duration}</span>
                    </span>
                  )}
                  {details?.ageRating && (
                    <span className="text-xs px-2 py-0.5 rounded bg-red-600/20 text-red-400 font-bold border border-red-600/30">
                      {details.ageRating}
                    </span>
                  )}
                </div>

                <h1 className="text-2xl md:text-4xl font-black text-white tracking-tight leading-tight">
                  {media.title}
                </h1>
                {details?.originalTitle && (
                  <h3 className="text-sm md:text-base text-zinc-400 font-medium">
                    {details.originalTitle}
                  </h3>
                )}

                {/* Genres */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {media.genres.map((g) => (
                    <span
                      key={g}
                      className="text-xs px-2.5 py-0.5 rounded-full bg-[#1D1F26] border border-[#292B32] text-zinc-300"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Body Information */}
          <div className="p-6 md:p-8 space-y-6">
            {/* Action Buttons Row */}
            <div className="flex flex-wrap items-center gap-3 border-b border-[#292B32] pb-6">
              <button
                onClick={() => handlePlay()}
                className="flex items-center space-x-2 px-7 py-3 rounded-xl bg-[#E50914] hover:bg-[#F40612] text-white font-bold text-sm shadow-xl shadow-red-900/40 hover:scale-105 active:scale-95 transition-all cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current ml-0.5" />
                <span>Смотреть</span>
              </button>

              <button
                onClick={handleFavoriteToggle}
                className={`flex items-center space-x-2 px-4 py-3 rounded-xl border text-sm font-medium transition-all cursor-pointer ${
                  favorite
                    ? 'bg-[#E50914]/15 border-[#E50914] text-[#E50914]'
                    : 'bg-[#1D1F26] border-[#292B32] text-zinc-300 hover:text-white'
                }`}
              >
                <Heart className={`w-4 h-4 ${favorite ? 'fill-current' : ''}`} />
                <span>{favorite ? 'В избранном' : 'В избранное'}</span>
              </button>

              <button
                onClick={handleMarkWatched}
                className={`flex items-center space-x-2 px-4 py-3 rounded-xl border text-sm font-medium transition-all cursor-pointer ${
                  isWatched
                    ? 'bg-emerald-600/15 border-emerald-500 text-emerald-400'
                    : 'bg-[#1D1F26] border-[#292B32] text-zinc-300 hover:text-white'
                }`}
              >
                <Check className="w-4 h-4" />
                <span>{isWatched ? 'Просмотрено' : 'Отметить'}</span>
              </button>

              <button
                onClick={handleShare}
                className="p-3 rounded-xl bg-[#1D1F26] border border-[#292B32] text-zinc-300 hover:text-white transition-colors cursor-pointer"
                title="Поделиться"
              >
                <Share2 className="w-4 h-4" />
              </button>
            </div>

            {/* Description Block */}
            <div className="space-y-2">
              <h3 className="text-base font-bold text-white">Описание</h3>
              <p
                className={`text-sm text-zinc-300 leading-relaxed ${
                  descriptionExpanded ? '' : 'line-clamp-3'
                }`}
              >
                {details?.description ||
                  media.details ||
                  'Описание временно отсутствует или загружается.'}
              </p>
              <button
                onClick={() => setDescriptionExpanded(!descriptionExpanded)}
                className="text-xs font-semibold text-[#E50914] hover:underline flex items-center space-x-1 cursor-pointer pt-1"
              >
                <span>{descriptionExpanded ? 'Свернуть' : 'Читать полностью'}</span>
                {descriptionExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Extra Info Grid: Directors, Cast, Country */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#14151A] p-4 rounded-2xl border border-[#292B32]/60 text-xs">
              {details?.country && (
                <div className="flex space-x-2">
                  <span className="text-zinc-500 min-w-20">Страна:</span>
                  <span className="text-zinc-200">{details.country}</span>
                </div>
              )}
              {details?.directors && details.directors.length > 0 && (
                <div className="flex space-x-2">
                  <span className="text-zinc-500 min-w-20">Режиссёр:</span>
                  <span className="text-zinc-200">{details.directors.join(', ')}</span>
                </div>
              )}
              {details?.actors && details.actors.length > 0 && (
                <div className="flex space-x-2 md:col-span-2">
                  <span className="text-zinc-500 min-w-20">В ролях:</span>
                  <span className="text-zinc-200 leading-relaxed">{details.actors.join(', ')}</span>
                </div>
              )}
            </div>

            {/* Series Seasons & Episodes Block */}
            {details?.seasons && details.seasons.length > 0 && (
              <div className="space-y-4 pt-4 border-t border-[#292B32]">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-white">Серии и сезоны</h3>
                  <div className="flex items-center space-x-2">
                    {details.seasons.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setSelectedSeasonNum(s.seasonNumber)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                          selectedSeasonNum === s.seasonNumber
                            ? 'bg-[#E50914] text-white'
                            : 'bg-[#1D1F26] text-zinc-400 hover:text-white'
                        }`}
                      >
                        {s.title}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Episodes Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {currentSeason?.episodes.map((ep) => (
                    <div
                      key={ep.id}
                      onClick={() => handlePlay(selectedSeasonNum, ep.episodeNumber)}
                      className="group bg-[#1D1F26] hover:bg-[#252832] border border-[#292B32] hover:border-[#E50914]/50 p-3 rounded-xl cursor-pointer transition-all flex items-center space-x-3"
                    >
                      <div className="w-10 h-10 rounded-lg bg-black/50 text-white font-bold flex items-center justify-center shrink-0 group-hover:bg-[#E50914] transition-colors">
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-zinc-200 truncate group-hover:text-white">
                          {ep.title}
                        </div>
                        <div className="text-[11px] text-zinc-500 mt-0.5">
                          {ep.duration || 'Серия ' + ep.episodeNumber}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Similar Content Block */}
            {details?.similar && details.similar.length > 0 && (
              <div className="space-y-3 pt-4 border-t border-[#292B32]">
                <h3 className="text-lg font-bold text-white">Похожие фильмы и сериалы</h3>
                <div className="flex items-center space-x-3 overflow-x-auto no-scrollbar py-2">
                  {details.similar.map((sim) => (
                    <MediaCard
                      key={sim.id}
                      item={sim}
                      size="small"
                      onSelect={(item) => {
                        setIsLoading(true);
                        getMediaDetails(item.id, item.url).then((res) => {
                          setDetails(res);
                          setIsLoading(false);
                        });
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
