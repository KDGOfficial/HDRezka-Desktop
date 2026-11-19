import React, { useState, useEffect } from 'react';
import { Layers, Plus, Trash2, Edit2, Folder, ArrowLeft, Download, Upload } from 'lucide-react';
import { Collection, CollectionItem, MediaItem } from '../../shared/types';
import { MediaCard } from '../components/MediaCard';

export const CollectionsPage: React.FC = () => {
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
    <div className="w-full pb-16 text-left select-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-dark-border">
        <div className="flex items-center space-x-3">
          {activeCollection && (
            <button
              onClick={() => setActiveCollection(null)}
              className="p-2 rounded-xl bg-dark-surface hover:bg-dark-surfaceLight text-zinc-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center">
              <Layers className="w-6 h-6 text-brand-red mr-2" />
              {activeCollection ? activeCollection.name : 'Мои коллекции'}
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              {activeCollection
                ? `${items.length} элементов в коллекции`
                : `${collections.length} созданных подборок`}
            </p>
          </div>
        </div>

        {/* Top actions */}
        <div className="flex items-center space-x-2">
          <button
            onClick={handleExport}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-dark-surface hover:bg-dark-surfaceLight border border-white/5 text-xs font-semibold text-zinc-300 transition-colors"
            title="Экспорт коллекций"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Экспорт</span>
          </button>

          {!activeCollection && (
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-brand-red hover:bg-brand-redHover text-white text-xs font-bold shadow-glow transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Создать коллекцию</span>
            </button>
          )}
        </div>
      </div>

      {/* Create modal/bar */}
      {isCreating && (
        <div className="mb-6 p-4 rounded-2xl bg-dark-surface border border-white/10 flex items-center space-x-3">
          <input
            type="text"
            value={newColName}
            onChange={(e) => setNewColName(e.target.value)}
            placeholder="Название новой коллекции..."
            className="flex-1 bg-dark-bg border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-brand-red"
            autoFocus
          />
          <button
            onClick={handleCreateCollection}
            className="px-4 py-2 rounded-xl bg-brand-red text-white text-xs font-bold shadow-glow"
          >
            Создать
          </button>
          <button
            onClick={() => setIsCreating(false)}
            className="px-3 py-2 text-xs text-zinc-400 hover:text-white"
          >
            Отмена
          </button>
        </div>
      )}

      {/* Main Content: Single Collection View or Collections List */}
      {activeCollection ? (
        items.length === 0 ? (
          <div className="text-center py-24 text-zinc-500">
            <p className="text-base font-semibold">В этой коллекции пока ничего нет</p>
            <p className="text-xs text-zinc-600 mt-1">Добавляйте фильмы и сериалы со страницы подробностей</p>
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
        <div className="flex flex-col items-center justify-center py-24 text-zinc-500">
          <Folder className="w-16 h-16 text-zinc-700 mb-3" />
          <p className="text-base font-semibold">У вас еще нет коллекций</p>
          <p className="text-xs text-zinc-600 mt-1">
            Нажмите «Создать коллекцию», чтобы группировать любимые фильмы
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {collections.map((col) => (
            <div
              key={col.id}
              onClick={() => handleOpenCollection(col)}
              className="group p-5 rounded-2xl bg-dark-surface border border-white/5 hover:border-brand-red/40 hover:bg-dark-surfaceLight/80 transition-all cursor-pointer shadow-card flex flex-col justify-between h-36"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 rounded-xl bg-brand-red/10 text-brand-red flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <Folder className="w-5 h-5" />
                  </div>
                  <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingColId(col.id);
                        setRenameText(col.name);
                      }}
                      className="p-1 rounded text-zinc-400 hover:text-white"
                      title="Переименовать"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleDeleteCollection(e, col.id)}
                      className="p-1 rounded text-zinc-400 hover:text-brand-red"
                      title="Удалить"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {editingColId === col.id ? (
                  <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={renameText}
                      onChange={(e) => setRenameText(e.target.value)}
                      className="bg-dark-bg border border-brand-red rounded px-2 py-0.5 text-xs text-white outline-none w-full"
                      autoFocus
                    />
                    <button
                      onClick={() => handleRename(col.id)}
                      className="text-xs text-brand-red font-bold"
                    >
                      OK
                    </button>
                  </div>
                ) : (
                  <h3 className="text-base font-bold text-white group-hover:text-brand-red transition-colors truncate">
                    {col.name}
                  </h3>
                )}
              </div>

              <div className="text-xs text-zinc-500 font-medium">
                {col.itemsCount || 0} элементов
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
