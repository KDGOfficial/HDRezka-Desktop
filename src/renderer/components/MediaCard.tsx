import React from 'react';
import { Star, Heart, Play, Plus, X, Eye } from 'lucide-react';
import { MediaItem } from '../../shared/types';
import { getRatingColor, formatCompactNumber } from '../../shared/utils';
import { useMediaStore } from '../stores/useMediaStore';
import { useTranslation } from '../i18n';

interface MediaCardProps {
  item: MediaItem;
  size?: 'small' | 'medium' | 'large';
  showProgress?: boolean;
  onRemove?: (item: MediaItem) => void;
}

export const MediaCard: React.FC<MediaCardProps> = ({ item, size = 'medium', showProgress = false, onRemove }) => {
  const { openDetails, favorites, toggleFavorite, openCollectionModal } = useMediaStore();
  const { t } = useTranslation();
  const isFav = favorites.some((f) => f.mediaId === item.id);

  const sizeClasses = {
    small: 'w-36 md:w-40',
    medium: 'w-full min-w-[152px] max-w-[198px]',
    large: 'w-52 md:w-60',
  }[size];

  const handleCardClick = () => {
    openDetails(item.url || item.id, item);
  };

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavorite(item);
  };

  const handleCollectionClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    openCollectionModal(item);
  };

  const handleRemoveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove?.(item);
  };

  return (
    <article
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick();
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={item.title}
      className={`group relative flex flex-col cursor-pointer cinema-card select-none rounded-2xl ${sizeClasses}`}
    >
      {/* 2:3 Cinema Poster Frame (always dark cinema glass over artwork in both themes) */}
      <div
        className="cinema-player-surface relative w-full aspect-[2/3] rounded-2xl overflow-hidden bg-dark-surface border border-white/[0.08] shadow-card group-hover:border-brand-ember/60 group-hover:shadow-[0_18px_40px_-8px_rgba(0,0,0,0.88),0_0_26px_-6px_rgba(255,42,66,0.45)] transition-all duration-300"
      >
        {item.poster ? (
          <img
            src={item.poster}
            alt={item.title}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                'https://via.placeholder.com/300x450/140E12/ffffff?text=HDREZKA';
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-500 bg-dark-surface font-bold text-xs">
            {t.home.noPoster}
          </div>
        )}

        {/* Subtle Top Inner Specular Sheen */}
        <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/55 to-transparent pointer-events-none" />

        {/* Always-Visible Rating Badge (disappears smoothly into hover HUD) */}
        {item.rating && (
          <div className="group-hover:opacity-0 transition-opacity duration-200 absolute top-2.5 left-2.5">
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold tabular-nums flex items-center backdrop-blur-md shadow-md ${getRatingColor(
                item.rating
              )}`}
            >
              <Star className="w-2.5 h-2.5 fill-current mr-1" aria-hidden="true" />
              {item.rating.toFixed(1)}
            </span>
          </div>
        )}

        {/* Always-Visible Quick Remove Button (for Continue Watching) */}
        {onRemove && (
          <button
            type="button"
            onClick={handleRemoveClick}
            aria-label={t.history.deleteEntry}
            title={t.history.deleteEntry}
            className="absolute top-2.5 right-2.5 z-20 p-1.5 rounded-full bg-black/75 hover:bg-brand-crimson text-white border border-white/20 backdrop-blur-md opacity-85 group-hover:opacity-100 cursor-pointer active:scale-90 transition-all"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Cinematic Hover Overlay */}
        <div className="cinema-player-surface !bg-transparent absolute inset-0 bg-gradient-to-t from-[#070507]/95 via-[#0B070A]/35 to-[#070507]/40 opacity-0 group-hover:opacity-100 transition-opacity duration-250 flex flex-col justify-between p-3">
          {/* Top Actions Row */}
          <div className={`flex justify-between items-start gap-1 ${onRemove ? 'pr-8' : ''}`}>
            {item.rating ? (
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold tabular-nums flex items-center backdrop-blur-md shadow-md ${getRatingColor(
                  item.rating
                )}`}
              >
                <Star className="w-2.5 h-2.5 fill-current mr-1" aria-hidden="true" />
                {item.rating.toFixed(1)}
              </span>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleCollectionClick}
                aria-label={t.home.addToCollection}
                className="p-1.5 rounded-full bg-black/65 hover:bg-white/20 border border-white/15 text-white backdrop-blur-md cursor-pointer active:scale-90"
                title={t.home.addToCollection}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleFavoriteClick}
                aria-label={isFav ? t.home.inFavorites : t.home.addToFavorites}
                aria-pressed={isFav}
                className={`p-1.5 rounded-full bg-black/65 hover:bg-white/20 border backdrop-blur-md cursor-pointer active:scale-90 ${
                  isFav ? 'text-brand-crimson border-brand-crimson/60' : 'text-white border-white/15'
                }`}
                title={isFav ? t.home.inFavorites : t.home.addToFavorites}
              >
                <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-brand-crimson' : ''}`} />
              </button>
            </div>
          </div>

          {/* Center Glossy 3D Play Squircle (from logo.png) */}
          <div className="self-center w-12 h-12 rounded-[15px] play-squircle text-white flex items-center justify-center transform scale-75 group-hover:scale-100 transition-transform duration-300">
            <Play className="w-5 h-5 fill-white ml-0.5" aria-hidden="true" />
          </div>

          {/* Bottom Metadata Reveal */}
          <div className="text-left">
            {item.info && (
              <div className="text-[11px] font-semibold text-zinc-200 line-clamp-1 mb-0.5 drop-shadow">
                {item.info}
              </div>
            )}
            {item.genres && item.genres.length > 0 && (
              <div className="text-[10px] font-medium text-zinc-400 line-clamp-1">
                {item.genres.slice(0, 2).join(' · ')}
              </div>
            )}
          </div>
        </div>

        {/* Watch Progress Ember Bar */}
        {showProgress && item.watchProgress !== undefined && (
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/75">
            <div
              className="h-full bg-gradient-to-r from-brand-crimson via-brand-ember to-brand-orange shadow-glow-sm"
              style={{ width: `${Math.min(100, Math.max(0, item.watchProgress))}%` }}
            />
          </div>
        )}
      </div>

      {/* Title & Metadata below Poster */}
      <div className="mt-2.5 px-0.5 text-left">
        <h3 className="text-[13px] font-bold text-white truncate group-hover:text-brand-orange transition-colors leading-snug">
          {item.title}
        </h3>
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 mt-0.5 font-medium">
          {item.year && <span className="tabular-nums">{item.year}</span>}
          {item.year && item.country && <span className="text-zinc-600">·</span>}
          {item.country && <span className="truncate">{item.country}</span>}
          {item.views && item.views > 0 && (
            <>
              {(item.year || item.country) && <span className="text-zinc-600">·</span>}
              <span className="inline-flex items-center gap-0.5 tabular-nums flex-shrink-0" title={`${item.views.toLocaleString()} просмотров`}>
                <Eye className="w-3 h-3 opacity-75" aria-hidden="true" />
                {formatCompactNumber(item.views)}
              </span>
            </>
          )}
        </div>
      </div>
    </article>
  );
};
