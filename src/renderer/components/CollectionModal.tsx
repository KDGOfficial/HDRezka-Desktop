import React, { useState, useEffect } from 'react';
import { X, Plus, Folder, Check } from 'lucide-react';
import { useMediaStore } from '../stores/useMediaStore';
import { Collection } from '../../shared/types';

export const CollectionModal: React.FC = () => {
  const { collectionModalItem, openCollectionModal } = useMediaStore();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [newColName, setNewColName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (collectionModalItem && window.api) {
      loadCollections();
    }
  }, [collectionModalItem]);

  const loadCollections = async () => {
    try {
      const list = await window.api.getCollections();
      setCollections(list);
    } catch (err) {
      console.error(err);
    }
  };

  if (!collectionModalItem) return null;

  const handleCreate = async () => {
    if (!newColName.trim() || !window.api) return;
    try {
      const created = await window.api.createCollection(newColName.trim());
      setCollections((prev) => [...prev, created]);
      setNewColName('');
      setIsCreating(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddToCollection = async (colId: string) => {
    if (!window.api || !collectionModalItem) return;
    try {
      await window.api.addToCollection({
        collectionId: colId,
        mediaId: collectionModalItem.id,
        title: collectionModalItem.title,
        poster: collectionModalItem.poster,
        type: collectionModalItem.type,
        year: collectionModalItem.year,
        rating: collectionModalItem.rating,
        addedAt: Date.now(),
      });
      setAddedIds((prev) => new Set([...prev, colId]));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm select-none p-4">
      <div className="w-full max-w-md bg-dark-surface border border-white/10 rounded-2xl p-6 shadow-2xl relative text-left">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-dark-border">
          <div>
            <h3 className="text-lg font-bold text-white">Добавить в коллекцию</h3>
            <p className="text-xs text-zinc-400 truncate max-w-xs">{collectionModalItem.title}</p>
          </div>
          <button
            onClick={() => openCollectionModal(null)}
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Existing Collections */}
        <div className="max-h-60 overflow-y-auto space-y-2 mb-4 pr-1">
          {collections.length === 0 ? (
            <div className="text-center py-6 text-zinc-500 text-sm">
              У вас пока нет коллекций. Создайте первую ниже!
            </div>
          ) : (
            collections.map((col) => {
              const isAdded = addedIds.has(col.id);
              return (
                <div
                  key={col.id}
                  onClick={() => !isAdded && handleAddToCollection(col.id)}
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                    isAdded
                      ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                      : 'bg-dark-surfaceLight/50 border-white/5 hover:border-brand-red/40 hover:bg-dark-surfaceLight text-zinc-300'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Folder className="w-4 h-4 text-zinc-400" />
                    <span className="text-sm font-medium">{col.name}</span>
                  </div>
                  {isAdded ? (
                    <span className="flex items-center text-xs text-emerald-400">
                      <Check className="w-3.5 h-3.5 mr-1" /> Добавлено
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-500 hover:text-white">Добавить</span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Create new collection section */}
        {isCreating ? (
          <div className="space-y-3 pt-2 border-t border-dark-border">
            <input
              type="text"
              value={newColName}
              onChange={(e) => setNewColName(e.target.value)}
              placeholder="Название коллекции..."
              className="w-full bg-dark-bg border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-red"
              autoFocus
            />
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setIsCreating(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-400 hover:text-white"
              >
                Отмена
              </button>
              <button
                onClick={handleCreate}
                className="px-4 py-1.5 rounded-lg text-xs font-bold bg-brand-red text-white hover:bg-brand-redHover shadow-glow"
              >
                Создать
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsCreating(true)}
            className="w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl border border-dashed border-white/15 text-zinc-400 hover:text-white hover:border-brand-red text-xs font-semibold transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Новая коллекция</span>
          </button>
        )}
      </div>
    </div>
  );
};
