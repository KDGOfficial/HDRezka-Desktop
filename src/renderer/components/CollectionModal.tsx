import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Folder, Check } from 'lucide-react';
import { useMediaStore } from '../stores/useMediaStore';
import { useTranslation } from '../i18n';
import { Collection } from '../../shared/types';

export const CollectionModal: React.FC = () => {
  const { collectionModalItem, openCollectionModal } = useMediaStore();
  const { t } = useTranslation();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [newColName, setNewColName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const dialogRef = useRef<HTMLDialogElement>(null);
  const backdropPressRef = useRef(false);

  useEffect(() => {
    if (collectionModalItem && window.api) {
      setAddedIds(new Set());
      loadCollections();
    }
  }, [collectionModalItem]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (collectionModalItem) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
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
    <dialog
      ref={dialogRef}
      aria-labelledby="collection-modal-title"
      onMouseDown={(e) => {
        backdropPressRef.current = e.target === dialogRef.current;
      }}
      onClick={(e) => {
        if (backdropPressRef.current && e.target === dialogRef.current) {
          dialogRef.current?.close();
        }
        backdropPressRef.current = false;
      }}
      onClose={() => {
        if (dialogRef.current) dialogRef.current.returnValue = '';
        openCollectionModal(null);
      }}
      className="select-none"
    >
      <div className="w-full max-w-md mx-auto cinema-panel rounded-3xl p-6 shadow-elevated relative text-left overflow-hidden animate-fadeIn">
        {/* Ambient ember glow */}
        <div
          className="absolute -top-24 -right-24 w-48 h-48 rounded-full opacity-25 blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle, #FF124F 0%, #FF7A00 60%, transparent 75%)' }}
        />

        {/* Header */}
        <div className="flex items-center justify-between mb-4 pb-3.5 border-b border-white/[0.08] relative z-10">
          <div className="min-w-0 pr-3">
            <h2 id="collection-modal-title" className="font-display text-base font-black text-white">
              {t.collections.modalTitle}
            </h2>
            <p className="text-xs text-zinc-400 truncate mt-0.5">{collectionModalItem.title}</p>
          </div>
          <button
            type="button"
            onClick={() => openCollectionModal(null)}
            aria-label={t.collections.cancel}
            className="p-2 rounded-full bg-white/[0.05] hover:bg-white/[0.12] text-zinc-400 hover:text-white cursor-pointer flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Collections List */}
        <div className="max-h-60 overflow-y-auto space-y-2 mb-4 pr-1 relative z-10">
          {collections.length === 0 ? (
            <div className="text-center py-6 text-zinc-500 text-xs">{t.collections.emptyDesc}</div>
          ) : (
            collections.map((col) => {
              const isAdded = addedIds.has(col.id);
              return (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => !isAdded && handleAddToCollection(col.id)}
                  className={`w-full flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer text-left ${
                    isAdded
                      ? 'bg-emerald-950/35 border-emerald-500/35 text-emerald-300'
                      : 'bg-white/[0.04] border-white/[0.07] hover:border-brand-ember/50 hover:bg-white/[0.08] text-zinc-200'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Folder className={`w-4 h-4 flex-shrink-0 ${isAdded ? 'text-emerald-400' : 'text-brand-orange'}`} />
                    <span className="text-xs font-bold truncate">{col.name}</span>
                  </div>
                  {isAdded ? (
                    <span className="flex items-center text-xs text-emerald-400 font-bold flex-shrink-0 ml-2">
                      <Check className="w-3.5 h-3.5 mr-1" /> {t.collections.alreadyInCollection}
                    </span>
                  ) : (
                    <span className="text-xs text-brand-orange font-bold flex-shrink-0 ml-2">
                      + {t.home.addToCollection}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Create New Collection */}
        <div className="relative z-10">
          {isCreating ? (
            <div className="space-y-3 pt-3 border-t border-white/[0.08]">
              <input
                type="text"
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder={t.collections.newPlaceholder}
                className="w-full bg-[#0B070A] border border-white/[0.12] rounded-full px-4 py-2.5 text-xs text-white placeholder-zinc-500 outline-none focus:border-brand-ember"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 rounded-full text-xs font-bold text-zinc-400 hover:text-white hover:bg-white/[0.06] cursor-pointer"
                >
                  {t.collections.cancel}
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  className="px-5 py-2 rounded-full text-xs font-extrabold btn-ember text-white cursor-pointer"
                >
                  {t.collections.create}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-full border border-dashed border-white/[0.18] text-zinc-300 hover:text-white hover:border-brand-ember text-xs font-bold hover:bg-white/[0.04] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-brand-orange" />
              <span>{t.collections.createBtn}</span>
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
};
