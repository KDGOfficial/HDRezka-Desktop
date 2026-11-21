import React, { useState, useEffect } from 'react';
import { Layers, Plus, Trash2, Edit2, Folder, ArrowLeft, Download } from 'lucide-react';
import { Collection, CollectionItem, MediaItem } from '../../shared/types';
import { MediaCard } from '../components/MediaCard';
import { useTranslation } from '../i18n';

export const CollectionsPage: React.FC = () => {
  const { t } = useTranslation();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeCollection, setActiveCollection] = useState<Collection | null>(null);
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [editingColId, setEditingColId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');

  useEffect(() => {
    loadCollections();
  }, []);

  const loadCollections = async () => {
    if (window.api) {
      const list = await window.api.getCollections();
      setCollections(list);
    }
  };

  const handleOpenCollection = async (col: Collection) => {
    setActiveCollection(col);
    if (window.api) {
      const colItems = await window.api.getCollectionItems(col.id);
      setItems(colItems);
    }
  };

  const handleCreateCollection = async () => {
    if (!newColName.trim() || !window.api) return;
    const col = await window.api.createCollection(newColName.trim());
    setCollections((prev) => [...prev, col]);
    setNewColName('');
    setIsCreating(false);
  };

  const handleDeleteCollection = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.api) return;
    await window.api.deleteCollection(id);
    setCollections((prev) => prev.filter((c) => c.id !== id));
    if (activeCollection?.id === id) {
      setActiveCollection(null);
    }
  };

  const handleRename = async (id: string) => {
    if (!renameText.trim() || !window.api) return;
    await window.api.renameCollection(id, renameText.trim());
    setCollections((prev) =>
      prev.map((c) => (c.id === id ? { ...c, name: renameText.trim() } : c))
    );
    setEditingColId(null);
  };

  const handleExport = async () => {
    if (window.api) {
      const json = await window.api.exportData();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hdrezka_collections_${Date.now()}.json`;
      a.click();
    }
  };

  return (
    <div className="w-full pb-16 text-left select-none animate-fadeIn">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8 pb-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          {activeCollection && (
            <button
              type="button"
              onClick={() => setActiveCollection(null)}
              aria-label="Назад к коллекциям"
              className="p-2.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-zinc-300 hover:text-white cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-black text-white flex items-center gap-3">
              <span className="w-9 h-9 rounded-2xl play-squircle flex items-center justify-center flex-shrink-0">
                <Layers className="w-4 h-4 text-white" />
              </span>
              <span>{activeCollection ? activeCollection.name : t.collections.title}</span>
            </h1>
            <p className="text-xs text-zinc-400 mt-1.5">
              {activeCollection
                ? `${items.length} ${t.collections.itemsCount}`
                : `${collections.length} ${t.collections.collectionsCount}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.09] text-xs font-bold text-zinc-200 cursor-pointer"
            title={t.collections.exportJson}
          >
            <Download className="w-3.5 h-3.5 text-brand-orange" />
            <span className="hidden sm:inline">{t.collections.exportJson}</span>
          </button>

          {!activeCollection && (
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-1.5 px-5 py-2 rounded-full btn-ember text-white text-xs font-extrabold active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{t.collections.createBtn}</span>
            </button>
          )}
        </div>
      </div>

      {/* Create form */}
      {isCreating && (
        <div className="mb-6 p-4 rounded-3xl cinema-panel border-brand-ember/40 flex items-center gap-3">
          <input
            type="text"
            value={newColName}
            onChange={(e) => setNewColName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateCollection()}
            placeholder={t.collections.newPlaceholder}
            className="flex-1 bg-[#0B070A] border border-white/[0.12] rounded-full px-4 py-2 text-xs text-white outline-none focus:border-brand-ember"
            autoFocus
          />
          <button
            type="button"
            onClick={handleCreateCollection}
            className="px-5 py-2 rounded-full btn-ember text-white text-xs font-extrabold cursor-pointer"
          >
            {t.collections.create}
          </button>
          <button
            type="button"
            onClick={() => setIsCreating(false)}
            className="px-3 py-2 text-xs font-bold text-zinc-400 hover:text-white cursor-pointer"
          >
            {t.collections.cancel}
          </button>
        </div>
      )}

      {/* Main Content */}
      {activeCollection ? (
        items.length === 0 ? (
          <div className="text-center py-28 text-zinc-500">
            <p className="font-display text-base font-black text-zinc-300">{t.collections.emptyTitle}</p>
            <p className="text-xs text-zinc-400 mt-1">{t.collections.emptyDesc}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
            {items.map((it) => {
              const asMediaItem: MediaItem = {
                id: it.mediaId,
                title: it.title,
                poster: it.poster,
                type: it.type,
                year: it.year,
                rating: it.rating,
                url: it.mediaId,
              };
              return (
                <div key={it.mediaId} className="flex justify-center">
                  <MediaCard item={asMediaItem} />
                </div>
              );
            })}
          </div>
        )
      ) : collections.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-28 text-zinc-500">
          <div className="w-16 h-16 rounded-3xl cinema-panel flex items-center justify-center mb-4">
            <Folder className="w-7 h-7 text-brand-orange" />
          </div>
          <p className="font-display text-base font-black text-zinc-200">{t.collections.emptyTitle}</p>
          <p className="text-xs text-zinc-400 mt-1.5 max-w-sm text-center leading-relaxed">
            {t.collections.emptyDesc}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {collections.map((col) => (
            <div
              key={col.id}
              onClick={() => handleOpenCollection(col)}
              className="group p-5 rounded-3xl cinema-panel hover:border-brand-ember/55 hover:shadow-elevated transition-all cursor-pointer flex flex-col justify-between h-44"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="w-11 h-11 rounded-2xl bg-brand-crimson/15 border border-brand-ember/35 text-brand-orange flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                    <Folder className="w-5 h-5" />
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingColId(col.id);
                        setRenameText(col.name);
                      }}
                      className="p-1.5 rounded-full bg-black/50 text-zinc-300 hover:text-white cursor-pointer"
                      title={t.collections.rename}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteCollection(e, col.id)}
                      className="p-1.5 rounded-full bg-black/50 text-zinc-300 hover:text-brand-crimson cursor-pointer"
                      title={t.collections.delete}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {editingColId === col.id ? (
                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={renameText}
                      onChange={(e) => setRenameText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleRename(col.id)}
                      className="bg-[#0B070A] border border-brand-ember rounded-full px-3 py-1 text-xs text-white outline-none w-full"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => handleRename(col.id)}
                      className="px-2.5 py-1 text-xs text-brand-orange font-extrabold cursor-pointer"
                    >
                      OK
                    </button>
                  </div>
                ) : (
                  <h3 className="font-display text-sm font-black text-white group-hover:text-brand-orange transition-colors truncate">
                    {col.name}
                  </h3>
                )}
              </div>

              <div className="text-xs text-zinc-400 font-semibold font-mono">
                {col.itemsCount || 0} {t.collections.itemsCount}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
